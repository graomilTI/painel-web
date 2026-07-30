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

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .mo{color:#e2e8f0;display:flex;flex-direction:column;gap:12px}
      .mo-card{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.9));overflow:visible;position:relative;isolation:isolate}
      .mo-head{padding:14px 16px 10px;display:flex;justify-content:space-between;gap:12px;position:relative;z-index:30}
      .mo h2{margin:0;color:#fff;font-size:24px;line-height:1}.mo p{color:#94a3b8;margin:5px 0 0;font-size:12px}
      .mo-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .mo-btn{border:1px solid rgba(34,197,94,.35);border-radius:12px;background:#166534;color:#ecfdf5;font-weight:900;padding:8px 12px;cursor:pointer}
      .mo-select{height:38px;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:#0d0d18;color:#e2e8f0;padding:0 12px;width:100%}
      .mo-map-select{width:180px}
      .mo-map-tools{position:relative;z-index:2500;padding:0 16px 10px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
      .mo-filter{display:grid;grid-template-columns:180px 1fr;gap:8px}
      .mo-body{display:flex;flex-direction:column;gap:12px;padding:0 16px 16px}
      .mo-map{height:calc(100vh - 300px);min-height:500px;max-height:760px;border:1px solid rgba(148,163,184,.14);border-radius:18px;background:#0d1117;z-index:1}
      .mo-kpis{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
      .mo-kpi{flex:1 0 126px;min-width:0;border:1px solid rgba(34,197,94,.18);border-radius:12px;padding:8px;background:rgba(2,6,23,.35)}
      .mo-kpi span{display:block;font-size:8.5px;color:#94a3b8;font-weight:900;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .mo-kpi strong{display:block;color:#fff;font-size:16px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .mo-legend{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;color:#94a3b8;font-size:12px}
      .mo-legend i{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid #fff;vertical-align:-2px;margin-right:5px}
      .mo-legend .verde{background:#22c55e}
      .mo-marker-toggle{border:1px solid rgba(34,197,94,.28);background:rgba(6,78,59,.45);color:#ecfdf5;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;cursor:pointer}
      .mo-marker-toggle.off{background:rgba(15,23,42,.72);border-color:rgba(148,163,184,.22);color:#94a3b8}
      .mo-marker-badge{border:1px solid rgba(250,204,21,.35);background:rgba(120,53,15,.25);color:#fde68a;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900}
      .mk{position:relative;width:13px;height:13px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.25)}
      .mk.os-ok{background:#22c55e}
      .mo-load{padding:28px;text-align:center;color:#94a3b8}
      .mo-map .leaflet-pane,.mo-map .leaflet-top,.mo-map .leaflet-bottom{z-index:1!important}.mo-map .leaflet-control{z-index:10!important}
      @media(max-width:1100px){.mo-head{flex-direction:column}.mo-map-tools{flex-direction:column;align-items:stretch}.mo-legend{justify-content:flex-start}.mo-map{height:560px;min-height:420px}.mo-filter{grid-template-columns:1fr}.mo-kpis{flex-wrap:nowrap}.mo-map-select{width:100%}}
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

  function icon(t) {
    return window.L.divIcon({ className: '', html: `<div class="mk ${t}"></div>`, iconSize: [13, 13], iconAnchor: [6.5, 6.5] });
  }

  function kpiBox(label, valor) {
    return `<div class="mo-kpi"><span>${esc(label)}</span><strong>${valor}</strong></div>`;
  }

  function html() {
    const estados = estadosDisponiveis(), pontosFiltrados = st.pontos.filter(p => !st.estado || p.uf === st.estado);
    return `
      <div class="mo"><section class="mo-card">
        <div class="mo-head"><div><h2>Mapa operacional</h2><p>O.S. marcadas Atender pra hoje e rotas otimizadas dos colaboradores que as atendem.</p></div>
          <div class="mo-actions"><select class="mo-select mo-map-select" data-map-base><option value="escuro" ${st.mapaBase === 'escuro' ? 'selected' : ''}>Mapa escuro</option><option value="real" ${st.mapaBase === 'real' ? 'selected' : ''}>Visualização real</option><option value="padrao" ${st.mapaBase === 'padrao' ? 'selected' : ''}>Mapa padrão</option></select><button class="mo-btn" data-reload>Atualizar</button></div>
        </div>
        <div class="mo-map-tools"><div class="mo-filter"><select class="mo-select" data-estado><option value="">Todos os estados</option>${estados.map(uf => `<option value="${esc(uf)}" ${st.estado === uf ? 'selected' : ''}>${esc(uf)}</option>`).join('')}</select><select class="mo-select" data-ponto><option value="">Todos os pontos com O.S. Atender</option>${pontosFiltrados.map(p => `<option value="${esc(p.__key)}" ${st.ponto === p.__key ? 'selected' : ''}>${esc(p.cidade || p.nome_local)}/${esc(p.uf)} · ${esc(p.nome_local || 'Ponto')}</option>`).join('')}</select></div>
          <div class="mo-legend"><span class="mo-marker-badge" title="O mapa sempre mostra só as O.S. marcadas Atender pra hoje">📍 Hoje · Atender</span><button class="mo-marker-toggle ${st.mostrarOs ? '' : 'off'}" data-toggle-marker="os"><i class="verde"></i>O.S. ${st.mostrarOs ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarRotas ? '' : 'off'}" data-toggle-marker="rotas" title="Frota = linha sólida · Reembolso km = tracejada"><i class="verde"></i>Rotas ${st.mostrarRotas ? 'On' : 'Off'}</button></div>
        </div>
        <div class="mo-body">
          <div id="moMap" class="mo-map"><div class="mo-load">Carregando mapa...</div></div>
          <div class="mo-kpis">${kpiBox('O.S. Atender hoje', st.os.length)}${kpiBox('Rotas', st.rotasMapa.length)}</div>
        </div>
      </section></div>`;
  }

  function bind(root) {
    root.querySelector('[data-estado]')?.addEventListener('change', e => { st.estado = e.target.value; st.ponto = ''; render(root, true); });
    root.querySelector('[data-ponto]')?.addEventListener('change', e => { st.ponto = e.target.value; render(root, true); });
    root.querySelector('[data-map-base]')?.addEventListener('change', e => { st.mapaBase = TILE_LAYERS[e.target.value] ? e.target.value : 'escuro'; applyBaseLayer(); });
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
        color: frota ? '#22c55e' : '#f59e0b',
        weight: frota ? 3 : 2.5,
        opacity: 0.85,
        dashArray: frota ? null : '7,6',
      }).bindTooltip(rotaTooltip(r)).addTo(st.layer);
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
        const aviso = p.aproximado ? ' · <em>posição aproximada (nível de cidade — fazenda/armazém específico não localizado)</em>' : '';
        L.marker([p.lat, p.lng], { icon: icon('os-ok') }).bindTooltip(`O.S. Atender · ${esc(p.nome_local)} · ${esc(p.cidade)}/${esc(p.uf)} · ${qtd} O.S.${aviso}`).addTo(st.layer);
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
