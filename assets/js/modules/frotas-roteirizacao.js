(function () {
  const MODULE_NAME = 'FROTAS_ROTEIRIZACAO';

  const ROTEIRIZAR_FUNCTION = window.FROTAS_CONFIG?.ROTEIRIZAR_FUNCTION || 'frotas-roteirizar';
  const BFLEET_POSICOES_FUNCTION = window.FROTAS_CONFIG?.BFLEET_POSICOES_FUNCTION || 'bfleet-posicoes';
  const REFRESH_MS = 45000;
  const SEM_SINAL_HORAS = 3;

  const LEAFLET_CSS_ID = 'leaflet-css-frotas-rot';
  const LEAFLET_JS_ID = 'leaflet-js-frotas-rot';
  const BRASIL_CENTER = [-14.235, -51.925];
  const BRASIL_ZOOM = 4;

  const styles = `
    <style>
      .rot-shell{color:#e2e2f0}.rot-head{margin-bottom:16px}.rot-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.rot-title{margin:8px 0 6px;font-size:clamp(24px,2.5vw,34px);letter-spacing:-.04em;color:#f8fafc}.rot-sub{max-width:1050px;color:#94a3b8;line-height:1.55;margin:0}.rot-sub code{color:#bbf7d0}.rot-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.12),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.rot-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.42)}.rot-tools-left,.rot-tools-right{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.rot-btn{border:0;border-radius:14px;min-height:42px;padding:0 16px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13px;white-space:nowrap}.rot-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.rot-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.rot-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.rot-btn:disabled{opacity:.55;cursor:not-allowed}.rot-select{height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.rot-grid{display:grid;grid-template-columns:minmax(620px,1.45fr) minmax(360px,.82fr);gap:14px;padding:14px}.rot-map-wrap{display:flex;flex-direction:column;gap:10px}.rot-map{height:calc(100vh - 235px);min-height:560px;border:1px solid rgba(148,163,184,.14);border-radius:22px;background:linear-gradient(135deg,rgba(15,23,42,.78),rgba(2,6,23,.96));position:relative;overflow:hidden}#rot-map-el{position:absolute;inset:0}.rot-vehicle-icon{width:22px;height:22px;border-radius:8px;background:#22c55e;border:2px solid #dcfce7;box-shadow:0 0 0 7px rgba(34,197,94,.14);display:flex;align-items:center;justify-content:center;font-size:10px;color:#052e16;font-weight:1000}.rot-vehicle-icon.off{background:#ef4444;color:#fff;border-color:#fecaca}.rot-map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;text-align:center;padding:20px;z-index:2}.leaflet-tooltip.rot-tt{background:rgba(2,6,23,.92)!important;border:1px solid rgba(34,197,94,.35)!important;color:#f8fafc!important;border-radius:8px!important;font-size:11px!important;padding:4px 8px!important;font-weight:700!important;box-shadow:none!important}.leaflet-tooltip.rot-tt::before{border-top-color:rgba(2,6,23,.92)!important}.leaflet-control-attribution{background:rgba(2,6,23,.65)!important;color:#6b7280!important;font-size:10px!important}.leaflet-control-attribution a{color:#22c55e!important}.rot-map-hint{position:absolute;left:14px;bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:1000;pointer-events:none}.rot-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.82);border-radius:999px;padding:7px 10px;color:#cbd5e1;font-size:11px;font-weight:850}.rot-dot{width:9px;height:9px;border-radius:50%;display:inline-block}.rot-dot.veic{background:#22c55e}.rot-dot.ponto{background:#a78bfa}.rot-dot.urg{background:#f59e0b}.rot-dot.rota{background:#16a34a}.rot-side{display:flex;flex-direction:column;gap:14px;min-width:0}.rot-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rot-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px;min-height:78px}.rot-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.rot-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.rot-panel{border:1px solid rgba(148,163,184,.14);border-radius:20px;background:rgba(2,6,23,.36);overflow:hidden}.rot-panel h3{margin:0;padding:14px 16px;color:#fff;font-size:15px;border-bottom:1px solid rgba(148,163,184,.12);display:flex;justify-content:space-between;gap:8px}.rot-list{max-height:300px;overflow:auto}.rot-row{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.10);display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;cursor:pointer}.rot-row:hover,.rot-row.active{background:rgba(34,197,94,.10)}.rot-row strong{display:block;color:#f8fafc;font-size:13px}.rot-row small{display:block;color:#94a3b8;margin-top:4px;line-height:1.35}.rot-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.rot-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.rot-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.rot-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.rot-alert{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.10);display:grid;grid-template-columns:14px 1fr;gap:10px;align-items:start}.rot-alert-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 5px rgba(245,158,11,.12);margin-top:5px}.rot-alert strong{display:block;color:#fff;font-size:13px;margin-bottom:3px}.rot-alert small{display:block;color:#cbd5e1;line-height:1.35}.rot-empty{padding:26px;text-align:center;color:#94a3b8}.rot-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.rot-mini{border:1px solid rgba(148,163,184,.12);background:rgba(15,23,42,.42);border-radius:16px;padding:12px}.rot-mini span{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;font-weight:950;letter-spacing:.08em}.rot-mini strong{display:block;margin-top:6px;color:#fff;font-size:18px}.rot-form{display:grid;gap:10px;padding:14px}.rot-field{display:flex;flex-direction:column;gap:6px}.rot-field label{font-size:10px;color:#94a3b8;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.rot-input{height:40px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.rot-form-actions{display:flex;gap:8px;justify-content:flex-end}.rot-row-rm{border:0;border-radius:10px;padding:6px 10px;font-weight:900;cursor:pointer;font-size:11px;background:rgba(239,68,68,.14);color:#fecaca}.rot-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.rot-toast.show{opacity:1;transform:translateY(0)}@media(max-width:1180px){.rot-grid{grid-template-columns:1fr}.rot-map{height:auto;min-height:520px}}@media(max-width:680px){.rot-toolbar{align-items:stretch}.rot-tools-left,.rot-tools-right{width:100%;display:grid;grid-template-columns:1fr}.rot-kpis,.rot-summary{grid-template-columns:1fr}.rot-map{min-height:420px}}
    </style>`;

  const state = {
    veiculos: [],
    rotas: [],
    naoAlocados: [],
    semCoordenadas: [],
    totais: {},
    alertas: [],
    embarquesExtras: [],
    filtro: 'todos',
    rotaSelecionadaId: null,
    mostrarTodasRotas: false,
    mostrarFormEmbarque: false,
    loading: false,
    busy: false,
    publicadoEm: null,
  };

  let _opts = {};
  let _timer = null;
  let _veiculosBase = [];
  let _map = null;
  let _mapInitializing = false;
  let _fitDone = false;
  let _resizeBound = false;
  let _layerRotas = null;
  let _layerPontos = null;
  let _layerVeiculos = null;

  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function br(n, d = 0) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: d }); }
  function toast(msg, error = false) { let el = document.querySelector('.rot-toast'); if (!el) { el = document.createElement('div'); el.className = 'rot-toast'; document.body.appendChild(el); } el.textContent = msg; el.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
  function fmtTempo(min) { const h = Math.floor((min || 0) / 60); const m = Math.round((min || 0) % 60); if (!h) return `${m} min`; return `${h}h${String(m).padStart(2, '0')}`; }
  function normalizePlate(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); }
  function statusLabel(status) { return { em_movimento: 'Em movimento', parado: 'Parado', sem_sinal: 'Sem sinal' }[status] || status; }
  function todaySP() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }

  function resolveSupabase(opts = {}) {
    const candidates = [
      opts?.supabase,
      window.supabase,
      window.supabaseClient,
      window.SUPABASE_CLIENT,
      window.__SUPABASE_CLIENT__,
      window.APP_SUPABASE,
      window.App?.supabase,
      window.ADM?.supabase,
      window.PAINEL?.supabase,
      window.auth?.supabase,
      window.AUTH?.supabase
    ];
    return candidates.find((client) => client && typeof client.from === 'function') || null;
  }

  async function callEdgeFunction(opts, name, body) {
    const supabase = resolveSupabase(opts);
    if (!supabase?.functions?.invoke) {
      throw new Error('Supabase Functions não encontrado nesta página.');
    }
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      const msg = error.context?.error || error.context?.message || error.message || `Falha na function ${name}`;
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  function mergeVeiculos(veiculosBase, posicoes) {
    const posByVeiculo = new Map();
    const posByPlaca = new Map();
    (posicoes || []).forEach(p => {
      if (p.veiculo_id) posByVeiculo.set(p.veiculo_id, p);
      const placa = normalizePlate(p.placa);
      if (placa) posByPlaca.set(placa, p);
    });

    const agora = Date.now();
    state.veiculos = (veiculosBase || []).map(v => {
      const pos = posByVeiculo.get(v.id) || posByPlaca.get(normalizePlate(v.placa)) || null;
      const lat = pos ? Number(pos.latitude) : NaN;
      const lng = pos ? Number(pos.longitude) : NaN;
      const temPosicao = Number.isFinite(lat) && Number.isFinite(lng);
      const reportadoEm = pos?.reportado_em ? new Date(pos.reportado_em) : null;
      const horasDesdeReporte = reportadoEm ? (agora - reportadoEm.getTime()) / 36e5 : Infinity;

      let status = 'sem_sinal';
      if (temPosicao && horasDesdeReporte <= SEM_SINAL_HORAS) {
        status = Number(pos.velocidade_kmh || 0) > 3 ? 'em_movimento' : 'parado';
      }

      return {
        id: v.id,
        placa: v.placa || '—',
        motorista: pos?.motorista || v.motorista_atual || '—',
        coordenacao: v.coordenacao || '',
        supervisao: v.supervisao || '',
        lat: temPosicao ? lat : null,
        lng: temPosicao ? lng : null,
        velocidade: Number(pos?.velocidade_kmh || 0),
        direcao: Number(pos?.direcao || 0),
        ignicao: Boolean(pos?.ignicao),
        endereco: pos?.endereco || '',
        reportadoEm,
        status,
      };
    });
  }

  async function loadDados() {
    const supabase = resolveSupabase(_opts);
    if (!supabase) throw new Error('Supabase indisponível nesta página.');

    const [{ data: veiculos, error: vErr }, { data: posicoes, error: pErr }] = await Promise.all([
      supabase.from('frotas_veiculos').select('id,placa,motorista_atual,coordenacao,supervisao,status').eq('status', 'ATIVO').limit(5000),
      supabase.from('frotas_posicoes').select('placa,veiculo_id,latitude,longitude,velocidade_kmh,direcao,ignicao,endereco,motorista,sinal,reportado_em').limit(5000),
    ]);
    if (vErr) throw vErr;
    if (pErr) throw pErr;

    _veiculosBase = veiculos || [];
    mergeVeiculos(_veiculosBase, posicoes || []);
    await loadRotasPublicadas(supabase);
  }

  async function loadRotasPublicadas(supabase) {
    state.rotas = [];
    state.naoAlocados = [];
    state.semCoordenadas = [];
    state.totais = {};
    state.publicadoEm = null;
    state.rotaSelecionadaId = null;

    const dataStr = todaySP();
    const { data: rotas, error: rErr } = await supabase
      .from('frotas_rotas')
      .select('id,placa,veiculo_id,motorista,origem_latitude,origem_longitude,km_total_estimado,duracao_estimada_min,geometria,publicado_em')
      .eq('data', dataStr)
      .eq('status', 'publicada');
    if (rErr) throw rErr;
    if (!rotas || !rotas.length) return;

    const ids = rotas.map(r => r.id);
    const { data: paradas, error: ppErr } = await supabase
      .from('frotas_rotas_paradas')
      .select('id,rota_id,os_id,ordem,ponto_nome,embarque_texto,latitude,longitude,distancia_km_trecho,duracao_min_trecho')
      .in('rota_id', ids)
      .order('ordem', { ascending: true });
    if (ppErr) throw ppErr;

    const paradasPorRota = new Map();
    (paradas || []).forEach(p => {
      if (!paradasPorRota.has(p.rota_id)) paradasPorRota.set(p.rota_id, []);
      paradasPorRota.get(p.rota_id).push({
        ordem: p.ordem,
        os_id: p.os_id,
        ponto_nome: p.ponto_nome,
        embarque_texto: p.embarque_texto,
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        distancia_km_trecho: Number(p.distancia_km_trecho || 0),
        duracao_min_trecho: Number(p.duracao_min_trecho || 0),
      });
    });

    state.rotas = rotas.map(r => ({
      __id: r.id,
      placa: r.placa,
      veiculo_id: r.veiculo_id,
      motorista: r.motorista,
      origem: { lat: Number(r.origem_latitude), lng: Number(r.origem_longitude) },
      paradas: paradasPorRota.get(r.id) || [],
      km_total_estimado: Number(r.km_total_estimado || 0),
      duracao_estimada_min: Number(r.duracao_estimada_min || 0),
      geometria: r.geometria || null,
      distancia_real: !!r.geometria,
    }));

    state.rotaSelecionadaId = state.rotas[0]?.__id || null;
    const ultimaPublicacao = rotas.map(r => r.publicado_em).filter(Boolean).sort().pop();
    state.publicadoEm = ultimaPublicacao || null;
  }

  async function refreshPosicoes(doRender = true) {
    try {
      const supabase = resolveSupabase(_opts);
      if (!supabase) return;
      const { data: posicoes, error } = await supabase
        .from('frotas_posicoes')
        .select('placa,veiculo_id,latitude,longitude,velocidade_kmh,direcao,ignicao,endereco,motorista,sinal,reportado_em')
        .limit(5000);
      if (error) throw error;
      mergeVeiculos(_veiculosBase, posicoes || []);
      if (doRender) updateMapLayers();
    } catch (e) {
      console.warn('[roteirizacao] refresh de posições falhou:', e?.message || e);
    }
  }

  // ---- mapa (Leaflet + tiles CartoDB Dark Matter, base OpenStreetMap) ----

  function loadCss(href, id) {
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) { resolve(); return; }
      const s = document.createElement('script');
      s.id = id; s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureLeaflet() {
    if (window.L) return true;
    try {
      loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', LEAFLET_CSS_ID);
      await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_JS_ID);
      return Boolean(window.L);
    } catch (err) {
      console.warn('[roteirizacao] Leaflet indisponível.', err);
      return false;
    }
  }

  async function initMap(root) {
    if (_map || _mapInitializing) return;
    const mapEl = root.querySelector('#rot-map-el');
    if (!mapEl) return;

    _mapInitializing = true;
    try {
      const ok = await ensureLeaflet();
      if (!mapEl.isConnected) return;
      if (!ok) {
        mapEl.innerHTML = '<div class="rot-map-loading">Mapa indisponível (falha ao carregar Leaflet).</div>';
        return;
      }

      const L = window.L;
      _map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: true, center: BRASIL_CENTER, zoom: BRASIL_ZOOM });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
      }).addTo(_map);

      _layerRotas = L.layerGroup().addTo(_map);
      _layerPontos = L.layerGroup().addTo(_map);
      _layerVeiculos = L.layerGroup().addTo(_map);

      if (!_resizeBound) {
        window.addEventListener('resize', () => { if (_map) _map.invalidateSize(); });
        _resizeBound = true;
      }

      updateMapLayers();
      setTimeout(() => { if (_map) _map.invalidateSize(); }, 80);
    } finally {
      _mapInitializing = false;
    }
  }

  function updateMapLayers() {
    if (!_map || !window.L) return;
    const L = window.L;
    _layerVeiculos.clearLayers();
    _layerPontos.clearLayers();
    _layerRotas.clearLayers();

    const boundsPts = [];
    const filtro = state.filtro;

    state.veiculos
      .filter(v => v.lat != null && v.lng != null)
      .filter(v => filtro === 'todos' || v.status === filtro)
      .forEach(v => {
        const off = v.status === 'sem_sinal';
        const icone = v.status === 'sem_sinal' ? '!' : (v.status === 'em_movimento' ? '▶' : '■');
        const icon = L.divIcon({
          className: '',
          html: `<div class="rot-vehicle-icon ${off ? 'off' : ''}">${icone}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const marker = L.marker([v.lat, v.lng], { icon });
        marker.bindTooltip(`${esc(v.placa)} · ${esc(v.motorista)} · ${statusLabel(v.status)} · ${br(v.velocidade)} km/h`, { className: 'rot-tt' });
        _layerVeiculos.addLayer(marker);
        boundsPts.push([v.lat, v.lng]);
      });

    const visiveis = rotasVisiveis();
    const pointIds = new Set();
    if (state.mostrarTodasRotas) {
      const sel = state.rotas.find(r => r.__id === state.rotaSelecionadaId);
      sel?.paradas.forEach(p => pointIds.add(`${sel.__id}:${p.ordem}`));
    } else {
      visiveis.forEach(r => r.paradas.forEach(p => pointIds.add(`${r.__id}:${p.ordem}`)));
    }

    visiveis.forEach(r => {
      r.paradas.forEach(p => {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
        const urgent = p.os_id == null;
        const selected = pointIds.has(`${r.__id}:${p.ordem}`);
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: selected ? 7 : 5,
          color: '#fff',
          weight: 2,
          fillColor: urgent ? '#f59e0b' : '#a78bfa',
          fillOpacity: 0.9,
        });
        const titulo = `${p.ponto_nome || 'Parada'}${p.embarque_texto ? ' · ' + p.embarque_texto : ''}`;
        marker.bindTooltip(esc(titulo), { className: 'rot-tt' });
        _layerPontos.addLayer(marker);
        boundsPts.push([p.lat, p.lng]);
      });

      const origemOk = r.origem && Number.isFinite(r.origem.lat) && Number.isFinite(r.origem.lng);
      const coords = [
        ...(origemOk ? [[r.origem.lat, r.origem.lng]] : []),
        ...r.paradas.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map(p => [p.lat, p.lng]),
      ];

      if (r.geometria?.type === 'LineString' && Array.isArray(r.geometria.coordinates)) {
        const latlngs = r.geometria.coordinates.map(([lng, lat]) => [lat, lng]);
        L.polyline(latlngs, { color: '#22c55e', weight: 4, opacity: 0.85 }).addTo(_layerRotas);
      } else if (coords.length >= 2) {
        L.polyline(coords, { color: '#22c55e', weight: 4, opacity: 0.85, dashArray: '6 6' }).addTo(_layerRotas);
      }

      if (origemOk) boundsPts.push([r.origem.lat, r.origem.lng]);
    });

    state.embarquesExtras.forEach(e => {
      const lat = Number(e.latitude), lng = Number(e.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = L.circleMarker([lat, lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.9 });
      marker.bindTooltip(`${esc(e.nome)}${e.uf ? ' · ' + esc(e.uf) : ''} (extra)`, { className: 'rot-tt' });
      _layerPontos.addLayer(marker);
      boundsPts.push([lat, lng]);
    });

    if (!_fitDone && boundsPts.length) {
      _map.fitBounds(boundsPts, { padding: [30, 30], maxZoom: 10 });
      _fitDone = true;
    }
  }

  function aplicarResultadoRoteirizacao(resp, publicado) {
    state.rotas = (resp.rotas || []).map((r, i) => ({ ...r, __id: publicado ? `pub-${i}` : `preview-${i}` }));
    state.naoAlocados = resp.naoAlocados || [];
    state.semCoordenadas = resp.semCoordenadas || [];
    state.totais = resp.totais || {};
    state.rotaSelecionadaId = state.rotas[0]?.__id || null;
    state.mostrarTodasRotas = false;
    _fitDone = false;
    buildAlerts();
    if (publicado) state.publicadoEm = new Date().toISOString();
  }

  async function roteirizar() {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const resp = await callEdgeFunction(_opts, ROTEIRIZAR_FUNCTION, {
        maxParadas: 6,
        embarquesExtras: state.embarquesExtras,
        publicar: false,
      });
      aplicarResultadoRoteirizacao(resp, false);
      toast(`${resp.rotas?.length || 0} rotas geradas · ${resp.totais?.alocados ?? 0} embarques alocados.`);
    } catch (e) {
      toast(e?.message || 'Falha ao roteirizar.', true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function publicar() {
    if (state.busy) return;
    if (!state.rotas.length) { toast('Gere as rotas com "Roteirizar agora" antes de publicar.', true); return; }
    if (!confirm('Publicar estas rotas substitui as rotas já publicadas hoje. Continuar?')) return;
    state.busy = true;
    render();
    try {
      const resp = await callEdgeFunction(_opts, ROTEIRIZAR_FUNCTION, {
        maxParadas: 6,
        embarquesExtras: state.embarquesExtras,
        publicar: true,
      });
      aplicarResultadoRoteirizacao(resp, true);
      toast(`Rotas publicadas: ${resp.rotas?.length || 0}.`);
    } catch (e) {
      toast(e?.message || 'Falha ao publicar rotas.', true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function atualizarPosicoes() {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const resp = await callEdgeFunction(_opts, BFLEET_POSICOES_FUNCTION, {});
      await refreshPosicoes(false);
      buildAlerts();
      toast(`Posições atualizadas: ${resp.atualizados ?? 0}/${resp.total ?? 0}.`);
    } catch (e) {
      toast(e?.message || 'Falha ao atualizar posições.', true);
    } finally {
      state.busy = false;
      render();
    }
  }

  function toggleFormEmbarque() {
    state.mostrarFormEmbarque = !state.mostrarFormEmbarque;
    render();
  }

  function salvarEmbarqueExtra(form) {
    const nome = form.querySelector('[data-embarque-nome]')?.value.trim();
    const uf = form.querySelector('[data-embarque-uf]')?.value.trim().toUpperCase();
    const coordsRaw = form.querySelector('[data-embarque-coords]')?.value.trim();
    if (!nome || !coordsRaw) { toast('Preencha o nome e as coordenadas.', true); return; }

    const partes = coordsRaw.split(',').map(s => Number(s.trim()));
    if (partes.length !== 2 || partes.some(n => !Number.isFinite(n))) {
      toast('Coordenadas inválidas. Use o formato "lat, lng".', true);
      return;
    }

    state.embarquesExtras.push({ nome, uf: uf || '', latitude: partes[0], longitude: partes[1] });
    state.mostrarFormEmbarque = false;
    render();
    toast('Embarque adicionado. Clique em "Roteirizar agora" para incluir na próxima rota.');
  }

  function removerEmbarqueExtra(idx) {
    state.embarquesExtras.splice(idx, 1);
    render();
  }

  function toggleRotas() {
    state.mostrarTodasRotas = !state.mostrarTodasRotas;
    render();
  }

  function buildAlerts() {
    state.alertas = [];
    state.veiculos.filter(v => v.status === 'sem_sinal').slice(0, 6).forEach(v => {
      state.alertas.push({ tipo: 'Sem sinal', texto: `${v.placa} · ${v.motorista !== '—' ? v.motorista : 'sem motorista vinculado'} sem posição recente do rastreador`, nivel: 'err' });
    });
    state.naoAlocados.slice(0, 6).forEach(n => {
      state.alertas.push({ tipo: 'Embarque não alocado', texto: `${n.embarque || 'Embarque'} — ${n.motivo || 'sem motivo informado'}`, nivel: 'warn' });
    });
    state.semCoordenadas.slice(0, 6).forEach(s => {
      state.alertas.push({ tipo: 'Sem coordenadas', texto: `${s.embarque || 'Embarque'}${s.cliente ? ' · ' + s.cliente : ''}`, nivel: 'warn' });
    });
  }

  function kpis() {
    const comPosicao = state.veiculos.filter(v => v.lat != null && v.lng != null).length;
    const semSinal = state.veiculos.filter(v => v.status === 'sem_sinal').length;
    const kmTotal = state.totais.km_total != null
      ? Number(state.totais.km_total)
      : state.rotas.reduce((s, r) => s + Number(r.km_total_estimado || 0), 0);
    const tempoTotal = state.rotas.reduce((s, r) => s + Number(r.duracao_estimada_min || 0), 0);
    const embarques = state.totais.embarques != null
      ? Number(state.totais.embarques)
      : state.rotas.reduce((s, r) => s + r.paradas.length, 0);
    return {
      veiculosComPosicao: comPosicao,
      veiculosTotal: state.veiculos.length,
      embarques,
      pendentes: state.naoAlocados.length + state.semCoordenadas.length,
      rotas: state.rotas.length,
      kmTotal,
      semSinal,
      tempoTotal,
    };
  }

  function rotasVisiveis() {
    if (!state.rotas.length) return [];
    if (state.mostrarTodasRotas) return state.rotas.slice(0, 8);
    const sel = state.rotas.find(r => r.__id === state.rotaSelecionadaId);
    return sel ? [sel] : state.rotas.slice(0, 1);
  }

  function summaryHtml(k) {
    const mediaKm = state.rotas.length ? k.kmTotal / state.rotas.length : 0;
    return `<div class="rot-summary"><div class="rot-mini"><span>Tempo total estimado</span><strong>${fmtTempo(k.tempoTotal)}</strong></div><div class="rot-mini"><span>Média por rota</span><strong>${br(mediaKm, 1)} km</strong></div><div class="rot-mini"><span>Modo do mapa</span><strong>${state.mostrarTodasRotas ? 'Geral' : 'Focado'}</strong></div></div>`;
  }

  function routesPanel() {
    if (!state.rotas.length) {
      return `<div class="rot-panel"><h3>Rotas do dia</h3><div class="rot-empty">Clique em “Roteirizar agora” para gerar a sugestão automática com base nos embarques de hoje.</div></div>`;
    }
    return `<div class="rot-panel"><h3><span>Rotas do dia</span><span class="rot-badge">${state.rotas.length}</span></h3><div class="rot-list">${state.rotas.slice(0, 8).map(r => {
      const badge = r.distancia_real ? '<span class="rot-badge ok">Real (OSRM)</span>' : '<span class="rot-badge warn">Estimativa</span>';
      return `<div class="rot-row ${r.__id === state.rotaSelecionadaId ? 'active' : ''}" data-rota="${esc(r.__id)}"><div><strong>${esc(r.placa)} · ${esc(r.motorista || 'sem motorista')}</strong><small>${r.paradas.length} paradas · ${br(r.km_total_estimado, 1)} km · ${fmtTempo(r.duracao_estimada_min)}</small></div>${badge}</div>`;
    }).join('')}</div></div>`;
  }

  function alertsPanel() {
    if (!state.alertas.length) return `<div class="rot-panel"><h3>Alertas operacionais</h3><div class="rot-empty">Nenhum alerta no momento.</div></div>`;
    return `<div class="rot-panel"><h3>Alertas operacionais</h3><div class="rot-list">${state.alertas.slice(0, 12).map(a => `<div class="rot-alert"><span class="rot-alert-dot"></span><div><strong>${esc(a.tipo)}</strong><small>${esc(a.texto)}</small></div></div>`).join('')}</div></div>`;
  }

  function embarqueFormHtml() {
    if (!state.mostrarFormEmbarque) return '';
    return `<div class="rot-panel" data-embarque-form><h3>Novo embarque urgente</h3><div class="rot-form"><div class="rot-field"><label>Nome</label><input class="rot-input" type="text" data-embarque-nome placeholder="Ex.: Embarque urgente Cliente X"></div><div class="rot-field"><label>UF</label><input class="rot-input" type="text" maxlength="2" data-embarque-uf placeholder="PR"></div><div class="rot-field"><label>Coordenadas (lat, lng)</label><input class="rot-input" type="text" data-embarque-coords placeholder="-24.9555, -53.4552"></div><div class="rot-form-actions"><button class="rot-btn ghost" data-act="cancelar-embarque" type="button">Cancelar</button><button class="rot-btn primary" data-act="salvar-embarque" type="button">Adicionar</button></div></div></div>`;
  }

  function embarquesExtrasPanel() {
    if (!state.embarquesExtras.length) return '';
    return `<div class="rot-panel"><h3><span>Embarques extras</span><span class="rot-badge">${state.embarquesExtras.length}</span></h3><div class="rot-list">${state.embarquesExtras.map((e, i) => `<div class="rot-row"><div><strong>${esc(e.nome)}</strong><small>${esc(e.uf || '—')} · ${br(e.latitude, 4)}, ${br(e.longitude, 4)}</small></div><button class="rot-row-rm" data-act="remover-embarque" data-idx="${i}" type="button">Remover</button></div>`).join('')}</div></div>`;
  }

  function shellHtml() {
    return `${styles}<section class="rot-shell"><div class="rot-head"><div class="rot-kicker">Frotas · Roteirização</div><h2 class="rot-title">Roteirização com dados reais da BFleet</h2><p class="rot-sub" data-sub></p></div><div class="rot-card"><div class="rot-toolbar"><div class="rot-tools-left" data-tools-left></div><div class="rot-tools-right" data-tools-right></div></div><div data-body></div></div></section>`;
  }

  function gridHtml() {
    return `<div class="rot-grid"><div class="rot-map-wrap"><div class="rot-map"><div id="rot-map-el"></div><div class="rot-map-hint" data-map-hint></div></div><div data-summary></div></div><aside class="rot-side" data-side></aside></div>`;
  }

  function updateHead(root) {
    const sub = root.querySelector('[data-sub]');
    if (!sub) return;
    sub.innerHTML = `Veículos e posições vêm de <code>frotas_veiculos</code>/<code>frotas_posicoes</code> (sincronizados da BFleet). “Roteirizar agora” chama a função real (OSRM) para sugerir rotas a partir das OS ativas; “Publicar rotas” grava as rotas do dia para os motoristas.${state.publicadoEm ? ` Última publicação: ${new Date(state.publicadoEm).toLocaleString('pt-BR')}.` : ''}`;
  }

  function updateToolbar(root) {
    const rotearLabel = state.busy ? 'Roteirizando…' : 'Roteirizar agora';
    const atualizarLabel = state.busy ? 'Atualizando…' : 'Atualizar posições';
    const publicarDisabled = (!state.rotas.length || state.busy) ? 'disabled' : '';
    const toggleDisabled = state.rotas.length ? '' : 'disabled';
    const busyAttr = state.busy ? 'disabled' : '';

    root.querySelector('[data-tools-left]').innerHTML = `<button class="rot-btn primary" data-act="roteirizar" ${busyAttr}>${rotearLabel}</button><button class="rot-btn soft" data-act="novo">${state.mostrarFormEmbarque ? 'Cancelar embarque' : '+ Novo embarque'}</button><button class="rot-btn ghost" data-act="toggle-rotas" ${toggleDisabled}>${state.mostrarTodasRotas ? 'Ver rota selecionada' : 'Mostrar várias rotas'}</button><button class="rot-btn ghost" data-act="publicar" ${publicarDisabled}>Publicar rotas</button><button class="rot-btn ghost" data-act="atualizar" ${busyAttr}>${atualizarLabel}</button>`;

    const right = root.querySelector('[data-tools-right]');
    right.innerHTML = `<select class="rot-select" data-act="filtro"><option value="todos">Todos os veículos</option><option value="em_movimento">Em movimento</option><option value="parado">Parados</option><option value="sem_sinal">Sem sinal</option></select>`;
    const filtro = right.querySelector('[data-act="filtro"]');
    if (filtro) filtro.value = state.filtro;
  }

  function updateSummary(root) {
    const k = kpis();
    const summary = root.querySelector('[data-summary]');
    if (summary) summary.innerHTML = summaryHtml(k);
    const hint = root.querySelector('[data-map-hint]');
    if (hint) hint.innerHTML = `<span class="rot-chip"><span class="rot-dot veic"></span>Veículo</span><span class="rot-chip"><span class="rot-dot ponto"></span>Parada</span><span class="rot-chip"><span class="rot-dot urg"></span>Urgente</span><span class="rot-chip"><span class="rot-dot rota"></span>${state.mostrarTodasRotas ? `Até ${Math.min(8, state.rotas.length)} rotas visíveis` : 'Rota selecionada'}</span>`;
  }

  function updateSide(root) {
    const k = kpis();
    root.querySelector('[data-side]').innerHTML = `${embarqueFormHtml()}${embarquesExtrasPanel()}<div class="rot-kpis"><div class="rot-kpi"><span>Veículos c/ posição</span><strong>${br(k.veiculosComPosicao)}/${br(k.veiculosTotal)}</strong></div><div class="rot-kpi"><span>Embarques</span><strong>${br(k.embarques)}</strong></div><div class="rot-kpi"><span>Pendentes</span><strong>${br(k.pendentes)}</strong></div><div class="rot-kpi"><span>Rotas</span><strong>${br(k.rotas)}</strong></div><div class="rot-kpi"><span>Km planejado</span><strong>${br(k.kmTotal, 1)}</strong></div><div class="rot-kpi"><span>Sem sinal</span><strong>${br(k.semSinal)}</strong></div></div>${routesPanel()}${alertsPanel()}`;
  }

  function render() {
    const root = _opts.root;
    if (!root) return;

    if (!root.querySelector('.rot-shell')) {
      root.innerHTML = shellHtml();
      bind(root);
    }

    updateHead(root);
    updateToolbar(root);

    const body = root.querySelector('[data-body]');
    if (state.loading) {
      body.innerHTML = `<div class="rot-empty">Carregando dados da frota…</div>`;
      return;
    }

    if (!body.querySelector('.rot-grid')) {
      body.innerHTML = gridHtml();
      initMap(root);
    }

    updateSummary(root);
    updateSide(root);
    updateMapLayers();
  }

  function bind(root) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act], [data-rota]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'roteirizar') roteirizar();
      else if (act === 'publicar') publicar();
      else if (act === 'atualizar') atualizarPosicoes();
      else if (act === 'novo' || act === 'cancelar-embarque') toggleFormEmbarque();
      else if (act === 'salvar-embarque') {
        const form = root.querySelector('[data-embarque-form]');
        if (form) salvarEmbarqueExtra(form);
      } else if (act === 'remover-embarque') {
        removerEmbarqueExtra(Number(el.dataset.idx));
      } else if (act === 'toggle-rotas') {
        toggleRotas();
      } else if (el.dataset.rota) {
        state.rotaSelecionadaId = el.dataset.rota;
        state.mostrarTodasRotas = false;
        render();
      }
    });

    root.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-act="filtro"]');
      if (sel) {
        state.filtro = sel.value;
        updateMapLayers();
      }
    });
  }

  async function openHome(root, opts = {}) {
    _opts = { ...opts, root };
    if (_map) { try { _map.remove(); } catch { /* container já removido */ } _map = null; }
    _layerRotas = null;
    _layerPontos = null;
    _layerVeiculos = null;
    _fitDone = false;

    state.loading = true;
    render();
    try {
      await loadDados();
      buildAlerts();
    } catch (e) {
      console.error('[roteirizacao] loadDados falhou:', e);
      toast(e?.message || 'Falha ao carregar dados da roteirização.', true);
    }
    state.loading = false;
    render();
    clearInterval(_timer);
    _timer = setInterval(refreshPosicoes, REFRESH_MS);
  }

  window[MODULE_NAME] = { openHome, roteirizar };
})();
