import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

// Mapa Operacional (Operacional > Mapa) — reduzido de propósito (2026-07-30) a só o que foi
// pedido: (1) só O.S. marcadas Atender carregam no mapa; (2) rotas otimizadas respeitando qual
// colaborador atende qual O.S. (operacional_mapa_rotas, calculadas por operacional-mapa-rotas ao
// Gestor salvar a Programação); (3) escopo por regional (gestor só vê a própria supervisão,
// admin/master vê tudo). As abas Irregularidades/Sugerido x Registrado/Alertas e as camadas soltas
// de Veículos/Colaboradores/Hotéis/Alojamentos (sem ligação com rota) foram removidas a pedido da
// usuária — ver `git log -- assets/js/operacional.js` se precisar recuperar alguma dessas partes.
(function () {
  'use strict';

  const STYLE_ID = 'mapa-operacional-style';
  const FONTS_ID = 'mapa-operacional-fonts';
  const LEAFLET_CSS = 'leaflet-css-mapaop';
  const LEAFLET_JS = 'leaflet-js-mapaop';
  const TILE_LAYERS = {
    escuro: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      options: { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OSM' },
    },
    real: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19, attribution: 'Tiles &copy; Esri' },
    },
    padrao: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, subdomains: 'abc', attribution: '&copy; OpenStreetMap contributors' },
    },
  };

  const st = {
    os: [], pontos: [],
    estado: '', ponto: '', mapaBase: 'escuro',
    mostrarOs: true,
    // Rotas calculadas (operacional_mapa_rotas, geradas ao Gestor salvar a Programação) —
    // frota = linha sólida, reembolso_km = tracejada.
    mostrarRotas: true, rotasMapa: [],
    // Escopo por regional: gestor vê só a própria supervisão; sem regional cadastrada (admin/master)
    // vê tudo — mesmo padrão de getMinhasRegionais() em logistica.js/hospedagem.js.
    minhasRegionais: [], minhasRegionaisCarregadas: false,
    map: null, mapEl: null, tileLayer: null, layer: null,
  };

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  // Data de hoje em Brasília (não UTC do servidor/navegador) — o Mapa é sempre "hoje".
  const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    s = s.replace(/[^0-9.-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const lat = r => num(r?.latitude ?? r?.lat);
  const lng = r => num(r?.longitude ?? r?.lng ?? r?.lon);
  const fmtKm = v => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : '—';

  const BR_LAT_MIN = -34.2, BR_LAT_MAX = 6.0, BR_LNG_MIN = -74.5, BR_LNG_MAX = -28.0;
  function inBrazil(a, b) {
    const la = Number(a), lo = Number(b);
    return Number.isFinite(la) && Number.isFinite(lo) && la >= BR_LAT_MIN && la <= BR_LAT_MAX && lo >= BR_LNG_MIN && lo <= BR_LNG_MAX;
  }
  function geo(r) { return inBrazil(lat(r), lng(r)); }

  // Escopo por regional (mesmo padrão de getMinhasRegionais em logistica.js/hospedagem.js):
  // gestor com supervisão/coordenação cadastrada só vê a própria regional; sem regional
  // (admin/master) vê tudo — fallback pra "mostrar tudo" quando a lista fica vazia.
  function getUserField(ctx, ...paths) {
    for (const path of paths) {
      const parts = path.split('.');
      let cur = ctx;
      for (const part of parts) cur = cur?.[part];
      if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
    }
    return null;
  }
  function getMinhasRegionais(ctx) {
    const raw = getUserField(ctx, 'supervisao', 'user.supervisao', 'coordenacao', 'user.coordenacao') || '';
    return [...new Set(String(raw).split(/[,;|\n]+/).map((s) => norm(s)).filter(Boolean))];
  }
  function passaRegional(supervisao) {
    if (!st.minhasRegionais.length) return true;
    const s = norm(supervisao);
    return st.minhasRegionais.some((m) => s.includes(m) || m.includes(s));
  }

  function splitEmbarque(t) {
    const m = String(t || '').match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
    return m ? { uf: m[1], cidade: m[2].trim(), local: (m[3] || '').trim() } : { uf: '', cidade: '', local: '' };
  }

  async function sel(table, columns = '*', fn = null, limit = 5000) {
    try {
      let q = supabase.from(table).select(columns).limit(limit);
      if (fn) q = fn(q);
      const { data, error } = await q;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn(`[mapa-operacional] ${table}:`, e?.message || e);
      return [];
    }
  }

  // --- Carregamento ------------------------------------------------------

  function pontoDeOs(o) {
    const embarque = splitEmbarque(o.embarque || '');
    const temCoord = geo({ latitude: o.ponto1_latitude, longitude: o.ponto1_longitude });
    const aproximado = temCoord && !!o.ponto1_nome && !String(o.ponto1_nome).includes('·');
    return {
      lat: temCoord ? Number(o.ponto1_latitude) : null,
      lng: temCoord ? Number(o.ponto1_longitude) : null,
      nome_local: o.ponto1_nome || embarque.local || o.cliente || 'Ponto',
      cidade: embarque.cidade,
      uf: norm(embarque.uf),
      temCoord,
      aproximado,
    };
  }

  // Só O.S. marcadas Atender pelo Gestor pra hoje — pedido explícito da usuária (2026-07-30):
  // "somente as OS marcadas como Atender carregam no mapa".
  async function loadOsEPontos() {
    const hoje = hojeISO();
    const osRaw = await sel('operacional_os', '*', q => q.eq('status_gestor', 'ATENDER').eq('data_os', hoje));
    const osEscopo = osRaw.filter(o => passaRegional(o.supervisao));
    const pontosPorChave = new Map();
    const os = osEscopo.map(o => {
      const p = pontoDeOs(o);
      const chave = p.temCoord
        ? `${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`
        : `sem-coord:${p.uf}|${norm(p.cidade)}|${norm(p.nome_local)}`;
      if (!pontosPorChave.has(chave)) pontosPorChave.set(chave, { __key: chave, ...p });
      return { ...o, __pontoKey: chave };
    });
    return { os, pontos: [...pontosPorChave.values()] };
  }

  // Rotas calculadas (operacional_mapa_rotas), publicadas pela Edge Function
  // operacional-mapa-rotas quando o Gestor salva a Programação — sempre hoje,
  // já filtradas por regional no mesmo passaRegional() usado nas O.S.
  async function loadRotasMapa() {
    const hoje = hojeISO();
    const rotasRaw = await sel('operacional_mapa_rotas', '*', q => q.eq('data_referencia', hoje));
    const rotas = rotasRaw.filter(r => passaRegional(r.supervisao));
    if (!rotas.length) return [];
    const ids = rotas.map(r => r.id);
    const paradasRaw = await sel('operacional_mapa_rotas_paradas', '*', q => q.in('rota_id', ids).order('ordem', { ascending: true }));
    const paradasPorRota = new Map();
    paradasRaw.forEach(p => {
      const arr = paradasPorRota.get(String(p.rota_id)) || [];
      arr.push(p);
      paradasPorRota.set(String(p.rota_id), arr);
    });
    return rotas.map(r => ({ ...r, paradas: paradasPorRota.get(String(r.id)) || [] }));
  }

  async function load(root) {
    const [{ os, pontos }, rotasMapa] = await Promise.all([loadOsEPontos(), loadRotasMapa()]);
    st.os = os;
    st.pontos = pontos;
    st.rotasMapa = rotasMapa;
    if (root) render(root, true);
  }

  // --- Renderização --------------------------------------------------------

  function estadosDisponiveis() { return [...new Set(st.pontos.map(p => p.uf).filter(Boolean))].sort(); }
  function passaFiltroPonto(p) { if (!p) return false; if (st.estado && p.uf !== st.estado) return false; if (st.ponto && p.__key !== st.ponto) return false; return true; }
  function osPorPonto(ponto) { return st.os.filter(o => o.__pontoKey === ponto.__key); }

  function fonts() {
    if (document.getElementById(FONTS_ID)) return;
    const l = document.createElement('link');
    l.id = FONTS_ID;
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(l);
  }

  // "Console de despacho" — tema escuro técnico com Chakra Petch (títulos/rótulos, cara de HUD
  // angular) + IBM Plex Mono (números/leituras, reforça "dado operacional ao vivo"). Pedido da
  // usuária (2026-07-30): o visual anterior (herdado do resto do painel) estava "bruto" demais
  // pra uma tela cujo produto final É o mapa — aqui ele vira o protagonista.
  function css() {
    if (document.getElementById(STYLE_ID)) return;
    fonts();
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .mo{
        --mo-green:#3fe08a; --mo-green-dim:#1c7a4d; --mo-amber:#f5a524;
        --mo-bg:#050b09; --mo-panel:#0a1512; --mo-line:rgba(63,224,138,.16); --mo-line-2:rgba(63,224,138,.3);
        --mo-text:#eafff2; --mo-muted:#7fa596;
        font-family:'Chakra Petch',ui-sans-serif,system-ui,sans-serif;color:var(--mo-text);
        display:flex;flex-direction:column;gap:14px;
      }
      .mo-mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
      .mo-card{
        position:relative;isolation:isolate;overflow:hidden;border-radius:20px;
        border:1px solid var(--mo-line);background:var(--mo-panel);
        box-shadow:0 24px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.03);
      }
      .mo-card::before{
        content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
        background:
          radial-gradient(680px 380px at 108% -12%, rgba(63,224,138,.16), transparent 60%),
          radial-gradient(520px 320px at -8% 118%, rgba(245,165,36,.08), transparent 60%);
      }
      .mo-card::after{
        content:'';position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.5;
        background-image:repeating-linear-gradient(115deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px);
      }
      .mo-head{position:relative;z-index:2;padding:20px 22px 14px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
      .mo-eyebrow{display:flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--mo-green)}
      .mo-live-dot{width:7px;height:7px;border-radius:50%;background:var(--mo-green);box-shadow:0 0 0 0 rgba(63,224,138,.6);animation:moPulseDot 1.8s ease-out infinite}
      @keyframes moPulseDot{0%{box-shadow:0 0 0 0 rgba(63,224,138,.55)}70%{box-shadow:0 0 0 8px rgba(63,224,138,0)}100%{box-shadow:0 0 0 0 rgba(63,224,138,0)}}
      .mo h2{margin:6px 0 0;font-size:26px;font-weight:700;letter-spacing:.01em;line-height:1.05}
      .mo p{color:var(--mo-muted);margin:6px 0 0;font-size:12.5px;max-width:52ch;line-height:1.5}
      .mo-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .mo-seg{display:inline-flex;border:1px solid var(--mo-line);border-radius:11px;padding:3px;gap:2px;background:rgba(0,0,0,.25)}
      .mo-seg button{border:0;background:transparent;color:var(--mo-muted);font:inherit;font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:7px 11px;border-radius:8px;cursor:pointer;transition:background .15s,color .15s}
      .mo-seg button:hover{color:var(--mo-text)}
      .mo-seg button.active{background:var(--mo-green-dim);color:#eafff2;box-shadow:inset 0 0 0 1px var(--mo-line-2)}
      .mo-btn{border:1px solid var(--mo-line-2);border-radius:11px;background:linear-gradient(180deg,rgba(63,224,138,.18),rgba(63,224,138,.06));color:#eafff2;font:inherit;font-weight:600;font-size:12.5px;letter-spacing:.02em;padding:9px 14px;cursor:pointer;transition:filter .15s,transform .05s}
      .mo-btn:hover{filter:brightness(1.18)}.mo-btn:active{transform:translateY(1px)}
      .mo-select-wrap{position:relative}
      .mo-select{appearance:none;height:38px;border:1px solid var(--mo-line);border-radius:11px;background:#081310;color:var(--mo-text);padding:0 30px 0 12px;width:100%;font:inherit;font-size:12.5px;cursor:pointer}
      .mo-select:focus{outline:none;border-color:var(--mo-green);box-shadow:0 0 0 3px rgba(63,224,138,.14)}
      .mo-select-wrap::after{content:'';position:absolute;right:11px;top:50%;width:7px;height:7px;border-right:1.5px solid var(--mo-muted);border-bottom:1.5px solid var(--mo-muted);transform:translateY(-70%) rotate(45deg);pointer-events:none}
      .mo-map-tools{position:relative;z-index:2;padding:2px 22px 14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
      .mo-filter{display:grid;grid-template-columns:180px 1fr;gap:8px;flex:1;min-width:280px}
      .mo-body{position:relative;z-index:2;display:flex;flex-direction:column;gap:14px;padding:0 22px 22px}
      .mo-map-wrap{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--mo-line);box-shadow:0 0 0 1px rgba(0,0,0,.4),0 20px 50px rgba(0,0,0,.5)}
      .mo-map{height:calc(100vh - 300px);min-height:500px;max-height:760px;background:#060a09;z-index:1}
      .mo-map-glow{position:absolute;inset:0;z-index:400;pointer-events:none;box-shadow:inset 0 0 90px rgba(0,0,0,.55),inset 0 0 0 1px rgba(63,224,138,.06)}
      .mo-kpis{display:flex;gap:10px;flex-wrap:wrap}
      .mo-kpi{position:relative;flex:1 1 160px;min-width:150px;border:1px solid var(--mo-line);border-radius:14px;padding:12px 14px 12px 16px;background:linear-gradient(160deg,rgba(63,224,138,.07),rgba(0,0,0,.2));overflow:hidden}
      .mo-kpi::before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--mo-green);box-shadow:0 0 10px rgba(63,224,138,.7)}
      .mo-kpi span{display:block;font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--mo-muted);font-weight:600;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap}
      .mo-kpi strong{display:block;font-family:'IBM Plex Mono',monospace;color:#fff;font-size:26px;font-weight:600;margin-top:5px;line-height:1;letter-spacing:.01em}
      .mo-legend{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .mo-marker-toggle{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--mo-line);background:rgba(255,255,255,.02);color:var(--mo-text);border-radius:999px;padding:7px 13px 7px 9px;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,opacity .15s}
      .mo-marker-toggle .mo-dot{width:9px;height:9px;border-radius:50%;box-shadow:0 0 8px currentColor}
      .mo-marker-toggle.off{opacity:.45;border-color:rgba(255,255,255,.08)}
      .mo-marker-toggle.off .mo-dot{box-shadow:none}
      .mo-marker-toggle[data-toggle-marker="os"] .mo-dot{background:var(--mo-green);color:var(--mo-green)}
      .mo-marker-toggle[data-toggle-marker="rotas"] .mo-dot{background:var(--mo-amber);color:var(--mo-amber)}
      .mo-marker-toggle:hover{border-color:var(--mo-line-2)}
      .mo-marker-badge{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(245,165,36,.35);background:rgba(245,165,36,.08);color:#ffd98a;border-radius:999px;padding:7px 13px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
      .mk-wrap{width:20px;height:20px;display:flex;align-items:center;justify-content:center}
      .mk-ring{position:absolute;width:20px;height:20px;border-radius:50%;border:1.5px solid var(--mo-green,#3fe08a);opacity:0;animation:moRadar 2.6s ease-out infinite}
      .mk-core{position:relative;width:10px;height:10px;border-radius:50%;background:#3fe08a;border:1.5px solid #eafff2;box-shadow:0 0 10px rgba(63,224,138,.9),0 0 2px rgba(0,0,0,.4)}
      @keyframes moRadar{0%{transform:scale(.3);opacity:.65}100%{transform:scale(2.3);opacity:0}}
      .mo-load{padding:40px 20px;text-align:center;color:var(--mo-muted);font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.04em}
      .mo-load::before{content:'';display:block;width:26px;height:26px;margin:0 auto 12px;border-radius:50%;border:2px solid rgba(63,224,138,.18);border-top-color:var(--mo-green);animation:moSpin .8s linear infinite}
      @keyframes moSpin{to{transform:rotate(360deg)}}
      .mo-map .leaflet-pane,.mo-map .leaflet-top,.mo-map .leaflet-bottom{z-index:1!important}
      .mo-map .leaflet-control{z-index:10!important}
      .mo-map .leaflet-control-zoom a{background:#0a1512!important;color:#eafff2!important;border-color:var(--mo-line)!important}
      .mo-map .leaflet-control-zoom a:hover{background:#12241d!important}
      .mo-route-frota{filter:drop-shadow(0 0 5px rgba(63,224,138,.65))}
      .mo-route-reembolso{filter:drop-shadow(0 0 4px rgba(245,165,36,.55))}
      .leaflet-tooltip.mo-tip{
        background:#0a1512;color:#eafff2;border:1px solid var(--mo-line-2);border-radius:10px;
        font-family:'IBM Plex Mono',monospace;font-size:11.5px;line-height:1.55;padding:8px 11px;
        box-shadow:0 12px 28px rgba(0,0,0,.5);
      }
      .leaflet-tooltip.mo-tip strong{font-family:'Chakra Petch',sans-serif;font-size:12.5px;color:#fff}
      .leaflet-tooltip.mo-tip em{color:var(--mo-amber);font-style:normal}
      .leaflet-tooltip.mo-tip.mo-tip-before::before{border-top-color:var(--mo-line-2)!important}
      @media(max-width:1100px){
        .mo-head{flex-direction:column}.mo-map-tools{flex-direction:column;align-items:stretch}
        .mo-filter{grid-template-columns:1fr;min-width:0}.mo-legend{justify-content:flex-start}
        .mo-map{height:560px;min-height:420px}
      }
    `;
    document.head.appendChild(s);
  }

  async function leaflet() {
    if (window.L) return true;
    try { addCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', LEAFLET_CSS); await scriptTag('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_JS); return !!window.L; }
    catch (err) { console.warn('[mapa-operacional] leaflet:', err?.message || err); return false; }
  }
  function addCss(h, id) { if (document.getElementById(id)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; l.id = id; document.head.appendChild(l); }
  function scriptTag(src, id) { return new Promise((res, rej) => { if (document.getElementById(id)) return res(); const s = document.createElement('script'); s.src = src; s.id = id; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  function icon() {
    return window.L.divIcon({
      className: '',
      html: '<div class="mk-wrap"><span class="mk-ring"></span><span class="mk-ring" style="animation-delay:.9s"></span><span class="mk-core"></span></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }

  function kpiBox(label, valor, key) {
    return `<div class="mo-kpi"><span>${esc(label)}</span><strong class="mo-kpi-val" data-kpi="${esc(key)}" data-target="${valor}">0</strong></div>`;
  }

  // Contagem animada (0 -> valor) só na 1ª pintura de cada KPI — reforça a sensação de "painel
  // ao vivo" sem re-animar toda vez que o gestor só troca um filtro (checa se o valor já bateu).
  function animateKpis(root) {
    root.querySelectorAll('[data-kpi]').forEach(el => {
      const target = Number(el.dataset.target) || 0;
      const atual = Number(el.textContent.replace(/\D/g, '')) || 0;
      if (atual === target) return;
      const inicio = performance.now();
      const dur = 550;
      const passo = (t) => {
        const p = Math.min(1, (t - inicio) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
  }

  function html() {
    const estados = estadosDisponiveis(), pontosFiltrados = st.pontos.filter(p => !st.estado || p.uf === st.estado);
    const BASES = [['escuro', 'Escuro'], ['real', 'Satélite'], ['padrao', 'Padrão']];
    const frotaCount = st.rotasMapa.filter(r => r.tipo === 'frota').length;
    const reembolsoCount = st.rotasMapa.filter(r => r.tipo === 'reembolso_km').length;
    return `
      <div class="mo"><section class="mo-card">
        <div class="mo-head">
          <div>
            <div class="mo-eyebrow"><span class="mo-live-dot"></span>Operacional · tempo real</div>
            <h2>Mapa de despacho</h2>
            <p>O.S. marcadas Atender pra hoje e as rotas otimizadas de quem vai atendê-las.</p>
          </div>
          <div class="mo-actions">
            <div class="mo-seg" data-map-base>${BASES.map(([v, l]) => `<button type="button" data-base="${v}" class="${st.mapaBase === v ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
            <button class="mo-btn" data-reload>↻ Atualizar</button>
          </div>
        </div>
        <div class="mo-map-tools">
          <div class="mo-filter">
            <div class="mo-select-wrap"><select class="mo-select" data-estado><option value="">Todos os estados</option>${estados.map(uf => `<option value="${esc(uf)}" ${st.estado === uf ? 'selected' : ''}>${esc(uf)}</option>`).join('')}</select></div>
            <div class="mo-select-wrap"><select class="mo-select" data-ponto><option value="">Todos os pontos com O.S. Atender</option>${pontosFiltrados.map(p => `<option value="${esc(p.__key)}" ${st.ponto === p.__key ? 'selected' : ''}>${esc(p.cidade || p.nome_local)}/${esc(p.uf)} · ${esc(p.nome_local || 'Ponto')}</option>`).join('')}</select></div>
          </div>
          <div class="mo-legend">
            <span class="mo-marker-badge">Hoje · Atender</span>
            <button class="mo-marker-toggle ${st.mostrarOs ? '' : 'off'}" data-toggle-marker="os"><span class="mo-dot"></span>O.S.</button>
            <button class="mo-marker-toggle ${st.mostrarRotas ? '' : 'off'}" data-toggle-marker="rotas" title="Frota = linha sólida · Reembolso km = tracejada"><span class="mo-dot"></span>Rotas</button>
          </div>
        </div>
        <div class="mo-body">
          <div class="mo-map-wrap"><div id="moMap" class="mo-map"><div class="mo-load">Carregando mapa</div></div><div class="mo-map-glow" aria-hidden="true"></div></div>
          <div class="mo-kpis">${kpiBox('O.S. Atender hoje', st.os.length, 'os')}${kpiBox('Rotas de frota', frotaCount, 'frota')}${kpiBox('Rotas reembolso km', reembolsoCount, 'reembolso')}</div>
        </div>
      </section></div>`;
  }

  function bind(root) {
    root.querySelector('[data-estado]')?.addEventListener('change', e => { st.estado = e.target.value; st.ponto = ''; render(root, true); });
    root.querySelector('[data-ponto]')?.addEventListener('change', e => { st.ponto = e.target.value; render(root, true); });
    root.querySelectorAll('[data-map-base] [data-base]').forEach(btn => {
      btn.onclick = () => {
        st.mapaBase = TILE_LAYERS[btn.dataset.base] ? btn.dataset.base : 'escuro';
        root.querySelectorAll('[data-map-base] [data-base]').forEach(b => b.classList.toggle('active', b === btn));
        applyBaseLayer();
      };
    });
    root.querySelectorAll('[data-toggle-marker]').forEach(el => {
      el.onclick = () => {
        const alvo = el.dataset.toggleMarker;
        if (alvo === 'os') st.mostrarOs = !st.mostrarOs;
        if (alvo === 'rotas') st.mostrarRotas = !st.mostrarRotas;
        render(root);
      };
    });
    root.querySelector('[data-reload]')?.addEventListener('click', () => openHome(root));
  }

  async function map(root) {
    const el = root.querySelector('#moMap');
    if (!el) return;
    const ok = await leaflet();
    if (!ok) { el.innerHTML = '<div class="mo-load">Não foi possível carregar o mapa.</div>'; return; }
    if (st.map) { try { st.map.remove(); } catch {} }
    const L = window.L;
    st.map = L.map(el, { center: [-14.235, -51.925], zoom: 4 });
    st.mapEl = el;
    st.tileLayer = null;
    applyBaseLayer();
    st.layer = L.layerGroup().addTo(st.map);
    await draw(root, true);
    setTimeout(() => st.map?.invalidateSize(), 80);
  }
  function applyBaseLayer() {
    if (!st.map || !window.L) return;
    const cfg = TILE_LAYERS[st.mapaBase] || TILE_LAYERS.escuro;
    if (st.tileLayer) { try { st.map.removeLayer(st.tileLayer); } catch {} }
    st.tileLayer = window.L.tileLayer(cfg.url, cfg.options).addTo(st.map);
  }

  function rotaTooltip(r) {
    const quem = r.tipo === 'frota' ? `${esc(r.placa || 'Veículo')}${r.motorista_nome ? ` · ${esc(r.motorista_nome)}` : ''}` : `${esc(r.colaborador_nome || 'Colaborador')} · Reemb. km`;
    const origemLabel = r.origem_tipo === 'hotel' ? 'hotel' : r.origem_tipo === 'alojamento' ? 'alojamento' : 'casa';
    return `<strong>${quem}</strong><br>Origem: ${esc(origemLabel)}<br>${fmtKm(r.km_total_estimado)} · ${Number(r.duracao_estimada_min || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} min`;
  }

  function drawRotas(L, bounds) {
    st.rotasMapa.forEach(r => {
      if (!Number.isFinite(Number(r.origem_latitude)) || !Number.isFinite(Number(r.origem_longitude))) return;
      const pontosRota = [[Number(r.origem_latitude), Number(r.origem_longitude)]];
      (r.paradas || []).forEach(p => {
        if (Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) pontosRota.push([Number(p.latitude), Number(p.longitude)]);
      });
      if (pontosRota.length < 2) return;
      const frota = r.tipo === 'frota';
      L.polyline(pontosRota, {
        color: frota ? '#3fe08a' : '#f5a524',
        weight: frota ? 3.5 : 2.5,
        opacity: 0.9,
        dashArray: frota ? null : '7,6',
        className: frota ? 'mo-route-frota' : 'mo-route-reembolso',
      }).bindTooltip(rotaTooltip(r), { className: 'mo-tip' }).addTo(st.layer);
      pontosRota.forEach(p => bounds.push(p));
    });
  }

  async function draw(root, ajustarZoom = false) {
    if (!st.map || !window.L || !st.layer) return;
    const L = window.L, b = [];
    st.layer.clearLayers();
    const pontosVisiveis = st.pontos.filter(p => passaFiltroPonto(p) && p.temCoord);

    if (st.mostrarOs) {
      pontosVisiveis.forEach(p => {
        const qtd = osPorPonto(p).length;
        if (!qtd) return;
        const aviso = p.aproximado ? ' · <em>posição aproximada (nível de cidade)</em>' : '';
        L.marker([p.lat, p.lng], { icon: icon() }).bindTooltip(`<strong>${esc(p.nome_local)}</strong><br>${esc(p.cidade)}/${esc(p.uf)} · ${qtd} O.S. Atender${aviso}`, { className: 'mo-tip' }).addTo(st.layer);
        b.push([p.lat, p.lng]);
      });
    }
    if (st.mostrarRotas) drawRotas(L, b);

    if (b.length && ajustarZoom) st.map.fitBounds(b, { padding: [34, 34], maxZoom: st.estado || st.ponto ? 9 : 10 });
  }

  function render(root, ajustarZoom = false) {
    const mapEl = st.map && st.mapEl ? st.mapEl : null;
    root.innerHTML = html();
    bind(root);
    animateKpis(root);
    if (mapEl) {
      root.querySelector('#moMap').replaceWith(mapEl);
      draw(root, ajustarZoom);
      setTimeout(() => st.map?.invalidateSize(), 80);
    } else {
      map(root);
    }
  }
  function renderErro(root, err) { root.innerHTML = `<div class="mo"><section class="mo-card"><div class="mo-load">Não foi possível carregar o mapa operacional.<br><small>${esc(err?.message || err || 'Erro desconhecido')}</small></div></section></div>`; }

  async function openHome(root, opts) {
    css();
    // Escopo por regional: gestor com supervisão/coordenação cadastrada só vê a própria; sem
    // regional (admin/master) vê tudo. adm-operacional.js repassa o userContext do requireAuth()
    // via opts; getCurrentUser() é o fallback (sessão/user_metadata) se aquele não tiver o campo.
    if (!st.minhasRegionaisCarregadas) {
      st.minhasRegionaisCarregadas = true;
      let ctx = opts?.userContext || null;
      if (!getUserField(ctx, 'supervisao', 'user.supervisao', 'coordenacao', 'user.coordenacao')) {
        const authUser = await getCurrentUser().catch(() => null);
        ctx = { ...ctx, user: { ...(ctx?.user || {}), ...(authUser?.user_metadata || {}) } };
      }
      st.minhasRegionais = getMinhasRegionais(ctx);
    }
    const jaMontado = !!st.map;
    try {
      if (!jaMontado) {
        root.innerHTML = html();
        bind(root);
        await map(root);
      }
      await load(root);
      render(root, true);
      console.info('[mapa-operacional] carregado', { os: st.os.length, pontos: st.pontos.length, rotas: st.rotasMapa.length });
    } catch (err) {
      console.error('[mapa-operacional] erro ao carregar:', err);
      renderErro(root, err);
    }
  }

  window.OPERACIONAL = { openHome };
})();
