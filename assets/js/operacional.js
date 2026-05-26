import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const styleId      = 'operacional-direcionamento-styles';
  const leafletCssId = 'leaflet-css-operacional';
  const leafletJsId  = 'leaflet-js-operacional';
  const clusterCssId = 'leaflet-cluster-css';
  const clusterDfCssId = 'leaflet-cluster-default-css';
  const clusterJsId  = 'leaflet-cluster-js';
  const INDICACOES_KEY = 'operacional_indicacoes_v1';

  const BRAZIL_LAT_MIN = -33.77;
  const BRAZIL_LAT_MAX = 5.28;
  const BRAZIL_LNG_MIN = -73.99;
  const BRAZIL_LNG_MAX = -28.84;

  const COLAB_COLORS = ['#facc15', '#fb923c', '#f87171', '#a78bfa', '#38bdf8'];

  const state = {
    pontos: [],
    colaboradores: [],
    hoteis: [],
    passagens: [],
    auditorias: [],
    selectedPontoId: '',
    ranking: [],
    map: null,
    clusterGroup: null,
    colabLayer: null,
    selectedLayer: null,
    loaded: false,
    indicacoes: {},
    foraDoMapa: { colaboradores: [], pontos: [] },
  };

  /* ─── utilidades ─── */

  function safeText(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function n(value, fallback = 0) {
    const p = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(p) ? p : fallback;
  }

  function money(value) {
    return n(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim().toUpperCase();
  }

  function toRad(v) { return (Number(v) * Math.PI) / 180; }

  function distanciaKm(aLat, aLon, bLat, bLon) {
    const [la1, lo1, la2, lo2] = [aLat, aLon, bLat, bLon].map(Number);
    if (![la1, lo1, la2, lo2].every(Number.isFinite)) return null;
    const R = 6371;
    const dLat = toRad(la2 - la1), dLon = toRad(lo2 - lo1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
  }

  function isInsideBrazil(lat, lng) {
    const la = Number(lat), lo = Number(lng);
    return Number.isFinite(la) && Number.isFinite(lo)
      && la >= BRAZIL_LAT_MIN && la <= BRAZIL_LAT_MAX
      && lo >= BRAZIL_LNG_MIN && lo <= BRAZIL_LNG_MAX;
  }

  function shortName(nome) {
    const parts = String(nome || '').trim().split(/\s+/);
    return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] || '';
  }

  /* ─── indicações ─── */

  function loadIndicacoesFromStorage() {
    try { return JSON.parse(localStorage.getItem(INDICACOES_KEY) || '{}'); } catch { return {}; }
  }

  function saveIndicacoes() {
    try { localStorage.setItem(INDICACOES_KEY, JSON.stringify(state.indicacoes)); } catch {}
  }

  function indicarColab(pontoId, colabId) {
    const pId = String(pontoId), cId = String(colabId);
    if (!state.indicacoes[pId]) state.indicacoes[pId] = [];
    if (!state.indicacoes[pId].includes(cId)) state.indicacoes[pId].push(cId);
    saveIndicacoes();
  }

  function removerIndicacao(pontoId, colabId) {
    const pId = String(pontoId);
    if (!state.indicacoes[pId]) return;
    state.indicacoes[pId] = state.indicacoes[pId].filter(id => id !== String(colabId));
    if (!state.indicacoes[pId].length) delete state.indicacoes[pId];
    saveIndicacoes();
  }

  function isIndicadoNoPonto(pontoId, colabId) {
    return (state.indicacoes[String(pontoId)] || []).includes(String(colabId));
  }

  function countOsElsewhere(currentPontoId) {
    const count = {};
    Object.entries(state.indicacoes).forEach(([pId, ids]) => {
      if (String(pId) !== String(currentPontoId)) {
        ids.forEach(id => { count[id] = (count[id] || 0) + 1; });
      }
    });
    return count;
  }

  function totalOsCount() {
    const count = {};
    Object.values(state.indicacoes).forEach(ids => {
      ids.forEach(id => { count[id] = (count[id] || 0) + 1; });
    });
    return count;
  }

  // Exclui do ranking apenas quem já atingiu 2 OS em outros pontos
  function getAssignedElsewhere(currentPontoId) {
    const count = countOsElsewhere(currentPontoId);
    const out = new Set();
    Object.entries(count).forEach(([id, c]) => { if (c >= 2) out.add(id); });
    return out;
  }

  /* ─── estilos e scripts ─── */

  function ensureStyles() {
    if (document.getElementById(styleId)) return;
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      .op-shell{display:flex;flex-direction:column;gap:16px;color:#e2e2f0;padding-bottom:36px}

      /* compact header */
      .op-header{border:1px solid rgba(51,65,85,.6);border-radius:20px;background:rgba(15,23,42,.9);padding:14px 16px}
      .op-header-top{display:flex;align-items:center;gap:12px;margin-bottom:12px}
      .op-header-top h2{margin:0;font-size:16px;font-weight:900;color:#f8fafc;white-space:nowrap}
      .op-filters{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
      .op-filters .op-field{flex:1;min-width:90px}
      .op-field{display:flex;flex-direction:column;gap:5px}
      .op-field label{font-size:11px;color:#6b7280;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
      .op-field input,.op-field select{width:100%;box-sizing:border-box;border:1px solid rgba(51,65,85,.9);border-radius:12px;background:#0d0d18;color:#e2e2f0;padding:9px 10px;outline:none;color-scheme:dark;min-height:38px;font-size:13px}
      .op-field select option{background:#0d0d18;color:#e2e2f0}
      .op-field input:focus,.op-field select:focus{border-color:#22c55e;box-shadow:0 0 0 2px rgba(34,197,94,.14)}
      .op-btn{border:1px solid rgba(34,197,94,.38);border-radius:12px;background:linear-gradient(135deg,#166534,#15803d);color:#ecfdf5;font-weight:900;padding:9px 14px;cursor:pointer;min-height:38px;white-space:nowrap;font-size:13px}
      .op-btn.secondary{background:rgba(15,23,42,.72);border-color:rgba(148,163,184,.25);color:#e2e2f0}
      .op-btn:hover{filter:brightness(1.08)}.op-btn:disabled{opacity:.55;cursor:not-allowed}

      /* mapa layout */
      .op-map-layout{display:grid;grid-template-columns:1fr 290px;border:1px solid rgba(51,65,85,.7);border-radius:24px;overflow:hidden;min-height:640px}
      .op-map-wrap{position:relative;background:#0d1117}
      #opMap{height:640px;background:#0d1117;position:relative}
      .op-map-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:#cbd5e1;background:radial-gradient(circle at center,rgba(34,197,94,.12),transparent 40%),#0d1117;z-index:1}
      .op-map-empty strong{display:block;color:#f8fafc;font-size:17px;margin-bottom:6px}

      /* pontos panel lateral */
      .op-pontos-panel{display:flex;flex-direction:column;border-left:1px solid rgba(51,65,85,.7);background:rgba(2,6,23,.85)}
      .op-pontos-panel-head{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;border-bottom:1px solid rgba(51,65,85,.6);background:rgba(15,23,42,.95);flex-shrink:0}
      .op-pontos-panel-head strong{font-size:13px;font-weight:900;color:#f8fafc}
      .op-pontos-panel-head span{font-size:11px;color:#6b7280}
      #opPontosListMap{overflow-y:auto;flex:1;padding:8px}
      #opPontosListMap .op-point{border:1px solid rgba(51,65,85,.55);background:rgba(15,23,42,.6);border-radius:14px;padding:10px 11px;cursor:pointer;transition:.15s ease;margin-bottom:6px}
      #opPontosListMap .op-point:hover{border-color:rgba(34,197,94,.4);background:rgba(22,101,52,.12)}
      #opPontosListMap .op-point.active{border-color:#22c55e;background:rgba(22,101,52,.2)}
      #opPontosListMap .op-point strong{font-size:12px;color:#f8fafc;display:block}
      #opPontosListMap .op-point span{font-size:11px;color:#6b7280;display:block;margin-top:2px;line-height:1.3}
      .op-pontos-empty{padding:20px 12px;text-align:center;color:#6b7280;font-size:12px;line-height:1.5}

      /* cards e layouts secundários */
      .op-card{border:1px solid rgba(51,65,85,.7);border-radius:24px;background:linear-gradient(180deg,rgba(15,23,42,.94),rgba(2,6,23,.78));overflow:hidden}
      .op-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 16px 0}
      .op-card-head h3{margin:0;color:#f8fafc;font-size:16px;font-weight:900}
      .op-card-head p{margin:4px 0 0;color:#6b7280;font-size:12px;line-height:1.4}
      .op-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);gap:16px;align-items:stretch}
      .op-list{display:flex;flex-direction:column;gap:8px;padding:14px;max-height:520px;overflow:auto}
      .op-rank{border:1px solid rgba(51,65,85,.72);background:rgba(15,23,42,.74);border-radius:16px;padding:11px;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;cursor:default;transition:.15s}
      .op-rank:hover{border-color:rgba(34,197,94,.4)}
      .op-rank.indicado{border-color:rgba(34,197,94,.5);background:rgba(22,101,52,.12)}
      .op-rank-pos{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(22,101,52,.75);color:#dcfce7;font-weight:900;font-size:13px}
      .op-rank strong{display:block;color:#f8fafc;font-size:13px}
      .op-rank span{display:block;margin-top:3px;color:#6b7280;font-size:11px;line-height:1.3}
      .op-score{text-align:right}.op-score strong{font-size:18px;color:#bbf7d0;display:block}.op-score span{font-size:10px;text-transform:uppercase;font-weight:900;color:#6b7280}

      /* summary */
      .op-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .op-metric{border:1px solid rgba(51,65,85,.7);border-radius:18px;background:rgba(15,23,42,.72);padding:13px}
      .op-metric span{font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:900;letter-spacing:.05em}
      .op-metric strong{display:block;margin-top:6px;font-size:22px;color:#f8fafc}

      /* table */
      .op-table-wrap{overflow:auto;padding:0 16px 16px}
      .op-table{width:100%;border-collapse:separate;border-spacing:0 8px;min-width:1120px}
      .op-table th{text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;padding:0 10px 2px}
      .op-table td{background:rgba(15,23,42,.78);border-top:1px solid rgba(51,65,85,.7);border-bottom:1px solid rgba(51,65,85,.7);padding:11px 10px;color:#e2e2f0;font-size:12px}
      .op-table td:first-child{border-left:1px solid rgba(51,65,85,.7);border-radius:12px 0 0 12px;font-weight:900;color:#f8fafc}
      .op-table td:last-child{border-right:1px solid rgba(51,65,85,.7);border-radius:0 12px 12px 0}

      /* pills, alerts */
      .op-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.7);white-space:nowrap}
      .op-pill.ok{color:#bbf7d0;background:rgba(22,101,52,.22)}.op-pill.warn{color:#fde68a;background:rgba(120,53,15,.22)}.op-pill.bad{color:#fecaca;background:rgba(127,29,29,.22)}.op-pill.muted{color:#cbd5e1;background:rgba(51,65,85,.32)}
      .op-alert{border:1px solid rgba(251,191,36,.3);border-radius:16px;background:rgba(120,53,15,.14);color:#fde68a;padding:12px 14px;line-height:1.45;font-size:13px}
      .op-alert strong{color:#fef3c7}
      .op-alert.danger{border-color:rgba(239,68,68,.3);background:rgba(127,29,29,.14);color:#fecaca}
      .op-alert.danger strong{color:#fee2e2}
      .op-loading{opacity:.72;pointer-events:none}

      /* mapa – marcadores custom */
      .op-cluster-icon{border-radius:50%;background:rgba(22,101,52,.28);border:2px solid rgba(34,197,94,.55);display:flex;align-items:center;justify-content:center;color:#bbf7d0;font-weight:900;font-size:12px;box-shadow:0 0 12px rgba(34,197,94,.2)}
      .op-colab-marker{display:flex;align-items:center;gap:4px;pointer-events:none}
      .op-colab-dot{width:11px;height:11px;border-radius:50%;flex-shrink:0;box-shadow:0 0 6px currentColor}
      .op-colab-label{background:rgba(2,6,23,.88);border:1px solid;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;color:#f8fafc;white-space:nowrap}
      .op-ponto-sel{display:flex;flex-direction:column;align-items:center;pointer-events:none;position:relative}
      .op-ponto-sel-ring{position:absolute;top:-9px;left:-9px;width:34px;height:34px;border-radius:50%;border:2px solid rgba(34,197,94,.5);animation:op-pulse 1.8s ease-out infinite}
      .op-ponto-sel-dot{width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid #f0fdf4;box-shadow:0 0 14px rgba(34,197,94,.8);flex-shrink:0}
      .op-ponto-sel-label{margin-top:7px;background:rgba(2,6,23,.92);border:1px solid rgba(34,197,94,.55);border-radius:8px;padding:4px 9px;font-size:11px;font-weight:700;color:#f8fafc;white-space:nowrap;text-align:center;line-height:1.35}
      @keyframes op-pulse{0%{transform:scale(.8);opacity:.9}100%{transform:scale(2.4);opacity:0}}

      /* leaflet tooltip override */
      .leaflet-tooltip.op-tt{background:rgba(2,6,23,.9)!important;border:1px solid rgba(34,197,94,.35)!important;color:#f8fafc!important;border-radius:8px!important;font-size:11px!important;padding:3px 7px!important;font-weight:600!important;box-shadow:none!important;pointer-events:none}
      .leaflet-tooltip.op-tt::before{border-top-color:rgba(2,6,23,.9)!important}
      .leaflet-control-attribution{background:rgba(2,6,23,.65)!important;color:#6b7280!important;font-size:10px!important}
      .leaflet-control-attribution a{color:#22c55e!important}

      .op-direcionar-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(51,65,85,.35)}
      .op-direcionar-row:last-child{border-bottom:none}
      .op-kicker{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;border:1px solid rgba(74,222,128,.22);background:rgba(22,101,52,.18);font-size:11px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#bbf7d0}

      @media(max-width:1100px){.op-map-layout{grid-template-columns:1fr}.op-pontos-panel{border-left:none;border-top:1px solid rgba(51,65,85,.7);max-height:320px}.op-layout{grid-template-columns:1fr}.op-summary{grid-template-columns:repeat(2,1fr)}.op-filters{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:640px){.op-summary{grid-template-columns:1fr}#opMap{height:420px}.op-filters{flex-direction:column}}
    `;
    document.head.appendChild(s);
  }

  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve();
      const s = document.createElement('script');
      s.id = id; s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadCss(href, id) {
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

  async function ensureLeaflet() {
    if (window.L) return true;
    try {
      loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', leafletCssId);
      await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', leafletJsId);
      return Boolean(window.L);
    } catch (err) {
      console.warn('[Operacional] Leaflet indisponível.', err);
      return false;
    }
  }

  async function ensureCluster() {
    if (window.L?.MarkerClusterGroup) return true;
    try {
      loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css', clusterCssId);
      loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css', clusterDfCssId);
      await loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', clusterJsId);
      return Boolean(window.L?.MarkerClusterGroup);
    } catch (err) {
      console.warn('[Operacional] MarkerCluster indisponível.', err);
      return false;
    }
  }

  /* ─── dados ─── */

  async function selectFrom(table, columns, orderColumn, limit = 2000) {
    try {
      let q = supabase.from(table).select(columns).limit(limit);
      if (orderColumn) q = q.order(orderColumn, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[Operacional] Falha ao carregar ${table}:`, err?.message || err);
      return [];
    }
  }

  async function selectAll(table, orderColumn, limit = 3000) {
    try {
      let q = supabase.from(table).select('*').limit(limit);
      if (orderColumn) q = q.order(orderColumn, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[Operacional] Falha ao carregar ${table}:`, err?.message || err);
      return [];
    }
  }

  function firstValue(row, fields) {
    for (const f of fields) {
      const v = row?.[f];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
  }

  function parseLatLngFromMaps(value) {
    const text = String(value || '');
    if (!text) return { latitude: null, longitude: null };
    const at = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (at) return { latitude: Number(at[1]), longitude: Number(at[2]) };
    const q = text.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (q) return { latitude: Number(q[1]), longitude: Number(q[2]) };
    const g = text.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
    if (g) return { latitude: Number(g[1]), longitude: Number(g[2]) };
    return { latitude: null, longitude: null };
  }

  function normalizeHotelRow(row, fonte = 'Hospedagem') {
    const maps = parseLatLngFromMaps(firstValue(row, ['link_maps', 'maps', 'google_maps', 'url_maps']));
    const latitude  = firstValue(row, ['latitude', 'lat']) ?? maps.latitude;
    const longitude = firstValue(row, ['longitude', 'lng', 'lon']) ?? maps.longitude;
    const status = String(firstValue(row, ['status', 'situacao']) || '').trim().toUpperCase();
    const ativo  = row?.ativo !== false && !['INATIVO', 'INATIVA', 'CANCELADO', 'CANCELADA', 'BLOQUEADO', 'BLOQUEADA'].includes(status);
    return {
      id: row?.id,
      nome: firstValue(row, ['nome', 'hotel', 'nome_hotel', 'razao_social']) || 'Hotel sem nome',
      cidade: firstValue(row, ['cidade', 'cidade_hotel']) || '',
      uf: String(firstValue(row, ['uf', 'estado', 'uf_hotel']) || '').trim().toUpperCase(),
      latitude, longitude,
      diaria_individual: firstValue(row, ['valor_diaria_individual', 'diaria_individual', 'valor_individual', 'individual', 'valor_diaria_padrao', 'diaria_padrao']),
      diaria_duplo:      firstValue(row, ['valor_diaria_duplo', 'diaria_duplo', 'valor_duplo', 'duplo']),
      diaria_triplo:     firstValue(row, ['valor_diaria_triplo', 'diaria_triplo', 'valor_triplo', 'triplo']),
      diaria_quadruplo:  firstValue(row, ['valor_diaria_quadruplo', 'diaria_quadruplo', 'valor_quadruplo', 'quadruplo']),
      prioridade: firstValue(row, ['prioridade']) || 'NORMAL',
      status: status || 'ATIVO',
      ativo, fonte, raw: row,
    };
  }

  function dedupeHoteis(hoteis) {
    const seen = new Set();
    return hoteis.filter(h => {
      const key = normalize(`${h.nome}|${h.cidade}|${h.uf}|${h.fonte}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function loadData() {
    const [pontos, colaboradores, hoteisH, hoteisOp, passagens, auditorias] = await Promise.all([
      selectFrom('operacional_pontos_embarque', 'id,tipo_local,nome_local,uf,cidade,latitude,longitude,supervisao,coordenacao,ativo', 'nome_local', 3000),
      selectFrom('operacional_colaborador_base', 'id,colaborador_id,nome,cpf,tipo_mao_obra,empresa,coordenacao,supervisao,cidade_base,uf_base,latitude,longitude,valor_diaria,valor_alimentacao,ativo', 'nome', 3000),
      selectAll('hospedagem_hoteis', 'cidade', 3000),
      selectAll('operacional_hoteis', 'nome', 2000),
      selectFrom('operacional_passagens_cache', 'origem_cidade,origem_uf,destino_cidade,destino_uf,valor_estimado,data_cotacao,validade_ate', 'data_cotacao', 5000),
      selectFrom('operacional_auditoria_colaborador', 'colaborador_id,nome_colaborador,nome_chave,score_impacto,severidade,data_evento,resultado,motivo_recusa,local_embarque,cidade_embarque,uf_destino,produto,desconto_kg,ativo', 'data_evento', 5000),
    ]);

    const foraColab  = colaboradores.filter(c => c.ativo !== false && Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude)) && !isInsideBrazil(c.latitude, c.longitude));
    const foraPontos = pontos.filter(p => p.ativo !== false && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) && !isInsideBrazil(p.latitude, p.longitude));
    state.foraDoMapa = { colaboradores: foraColab, pontos: foraPontos };

    state.pontos = pontos.filter(p => p.ativo !== false && isInsideBrazil(p.latitude, p.longitude));
    state.colaboradores = colaboradores.filter(c => c.ativo !== false).map(c =>
      isInsideBrazil(c.latitude, c.longitude) ? c : { ...c, latitude: null, longitude: null }
    );
    state.hoteis = dedupeHoteis([
      ...hoteisH.map(h => normalizeHotelRow(h, 'Hospedagem')),
      ...hoteisOp.map(h => normalizeHotelRow(h, 'Operacional')),
    ]).filter(h => h.ativo && h.nome && h.cidade && h.uf);
    state.passagens = passagens;
    state.auditorias = auditorias.filter(a => a.ativo !== false);
    state.loaded = true;
  }

  /* ─── getters e form ─── */

  function selectedPonto() {
    return state.pontos.find(p => String(p.id) === String(state.selectedPontoId)) || null;
  }

  function getForm(container) {
    return {
      pontoId: container.querySelector('#opPonto')?.value || state.selectedPontoId,
      volume:  n(container.querySelector('#opVolume')?.value, 0),
      dias:    Math.max(1, n(container.querySelector('#opDias')?.value, 1)),
      qtd:     Math.max(1, n(container.querySelector('#opQtd')?.value, 1)),
      tipo:    container.querySelector('#opTipo')?.value || 'todos',
      busca:   normalize(container.querySelector('#opBusca')?.value || ''),
    };
  }

  /* ─── cálculos ─── */

  function hotelDiariaPorEquipe(hotel, qtd = 1) {
    qtd = Math.max(1, n(qtd, 1));
    const ind = n(hotel?.diaria_individual, 0), dup = n(hotel?.diaria_duplo, 0);
    const tri = n(hotel?.diaria_triplo, 0),  qua = n(hotel?.diaria_quadruplo, 0);
    const fb = ind || dup || tri || qua || 0;
    if (qtd <= 1) return { diaria: ind || fb, tipo_quarto: 'individual', quartos: 1 };
    if (qtd === 2) return { diaria: dup || ind || fb, tipo_quarto: 'duplo', quartos: 1 };
    if (qtd === 3) return { diaria: tri || dup || ind || fb, tipo_quarto: 'triplo', quartos: 1 };
    const quartos = Math.ceil(qtd / 4);
    return { diaria: (qua || tri || dup || ind || fb) * quartos, tipo_quarto: 'quádruplo', quartos };
  }

  function hotelMaisProximo(ponto, qtdEquipe = 1) {
    if (!ponto) return null;
    const enrich = h => {
      const distancia = distanciaKm(h.latitude, h.longitude, ponto.latitude, ponto.longitude);
      const di = hotelDiariaPorEquipe(h, qtdEquipe);
      return { ...h, distancia, diaria: di.diaria, tipo_quarto: di.tipo_quarto, quartos: di.quartos };
    };
    const daCidade = state.hoteis
      .filter(h => normalize(h.cidade) === normalize(ponto.cidade) && normalize(h.uf) === normalize(ponto.uf))
      .map(enrich)
      .sort((a, b) => (normalize(a.prioridade).includes('ALTA') ? 0 : 1) - (normalize(b.prioridade).includes('ALTA') ? 0 : 1) || n(a.diaria, 9e6) - n(b.diaria, 9e6) || n(a.distancia, 9e6) - n(b.distancia, 9e6));
    if (daCidade[0]) return daCidade[0];
    return state.hoteis.map(enrich).filter(h => Number.isFinite(Number(h.distancia))).sort((a, b) => n(a.distancia, 9e6) - n(b.distancia, 9e6) || n(a.diaria, 9e6) - n(b.diaria, 9e6))[0] || null;
  }

  function passagemPara(colab, ponto) {
    const match = state.passagens
      .filter(p => normalize(p.origem_cidade) === normalize(colab.cidade_base)
        && normalize(p.origem_uf) === normalize(colab.uf_base)
        && normalize(p.destino_cidade) === normalize(ponto.cidade)
        && normalize(p.destino_uf) === normalize(ponto.uf))
      .sort((a, b) => String(b.data_cotacao || '').localeCompare(String(a.data_cotacao || '')))[0];
    if (match) return n(match.valor_estimado, 0);
    const d = distanciaKm(colab.latitude, colab.longitude, ponto.latitude, ponto.longitude);
    if (d == null) return 0;
    if (d <= 55) return 0;
    return Math.round((45 + d * 0.42) * 100) / 100;
  }

  function auditoriaResumo(colab) {
    const nomeChave = normalize(`${colab.nome_chave || colab.nome || ''}`);
    const items = state.auditorias.filter(a => {
      const sameId  = colab.colaborador_id && a.colaborador_id && String(a.colaborador_id) === String(colab.colaborador_id);
      const sameKey = a.nome_chave && nomeChave && normalize(a.nome_chave) === nomeChave;
      const sameName = normalize(a.nome_colaborador) === normalize(colab.nome);
      return sameId || sameKey || sameName;
    });
    const impacto   = items.reduce((s, a) => s + n(a.score_impacto, 0), 0);
    const descontos = items.filter(a => normalize(a.resultado || '').includes('DESCONTO') || n(a.desconto_kg, 0) > 0).length;
    const altas     = items.filter(a => normalize(a.severidade || '').includes('ALTA')).length;
    const ultima    = items.slice().sort((a, b) => String(b.data_evento || '').localeCompare(String(a.data_evento || '')))[0] || null;
    return {
      score: Math.max(0, Math.min(100, 100 - impacto)),
      total: items.length, descontos, altas,
      ultima_data: ultima?.data_evento || null,
      ultima_resultado: ultima?.resultado || null,
      ultima_motivo: ultima?.motivo_recusa || null,
      impacto,
    };
  }

  function scoreClass(score) {
    return score >= 80 ? 'ok' : score >= 62 ? 'warn' : 'bad';
  }

  function calcRanking(container) {
    const form = getForm(container);
    state.selectedPontoId = form.pontoId;
    const ponto = selectedPonto();
    if (!ponto) { state.ranking = []; return []; }

    const hotel = hotelMaisProximo(ponto, form.qtd);
    const assignedElsewhere = getAssignedElsewhere(form.pontoId);
    const osElsewhereCount  = countOsElsewhere(form.pontoId);

    const rows = state.colaboradores.filter(c => {
      if (!c.nome) return false;
      if (assignedElsewhere.has(String(c.id))) return false;
      if (form.tipo !== 'todos' && normalize(c.tipo_mao_obra) !== normalize(form.tipo)) return false;
      if (form.busca) {
        const blob = normalize(`${c.nome} ${c.cidade_base} ${c.uf_base} ${c.supervisao} ${c.coordenacao}`);
        if (!blob.includes(form.busca)) return false;
      }
      return true;
    }).map(c => {
      const distancia = distanciaKm(c.latitude, c.longitude, ponto.latitude, ponto.longitude);
      const semCoordenada = distancia == null;
      const passagem  = passagemPara(c, ponto);
      const tipo      = normalize(c.tipo_mao_obra).includes('DIAR') ? 'Diarista' : 'Efetivo';
      const alimentacao = n(c.valor_alimentacao, 30) * form.dias;
      const maoObra   = tipo === 'Diarista' ? n(c.valor_diaria, 0) * form.dias : 0;
      const precisaHotel = distancia == null ? true : distancia > 80;
      const valorHotel   = precisaHotel ? n(hotel?.diaria, 0) * form.dias : 0;
      const custoTotal   = passagem + valorHotel + maoObra + alimentacao;
      const audit     = auditoriaResumo(c);
      const distanciaScore = distancia == null ? 35 : Math.max(0, 100 - (distancia / 8));
      const custoScore     = Math.max(0, 100 - (custoTotal / 12));
      const volumePeso     = form.volume >= 600 ? 0.32 : 0.24;
      const auditoriaPeso  = form.volume >= 600 ? 0.36 : 0.28;
      const osElsewhere = osElsewhereCount[String(c.id)] || 0;
      const score = Math.round(
        (audit.score * auditoriaPeso) + (distanciaScore * 0.22) + (custoScore * 0.30)
        + ((tipo === 'Efetivo' ? 88 : 72) * volumePeso * 0.35)
      );
      return {
        ...c,
        tipo_calculado: tipo, ponto, distancia, semCoordenada,
        indicado: isIndicadoNoPonto(form.pontoId, c.id),
        hotel_nome: hotel ? `${hotel.nome} · ${hotel.cidade}/${hotel.uf}` : 'Sem hotel cadastrado',
        hotel_distancia: hotel?.distancia ?? null, hotel_fonte: hotel?.fonte || null,
        hotel_tipo_quarto: hotel?.tipo_quarto || null, hotel_quartos: hotel?.quartos || 0,
        valor_hotel: valorHotel, valor_passagem: passagem, valor_mao_obra: maoObra,
        valor_alimentacao: alimentacao, custo_total: custoTotal,
        score_auditoria: audit.score, auditoria_total: audit.total,
        auditoria_descontos: audit.descontos, auditoria_altas: audit.altas,
        auditoria_ultima_data: audit.ultima_data, auditoria_ultima_resultado: audit.ultima_resultado,
        auditoria_ultima_motivo: audit.ultima_motivo,
        osElsewhere,
        score_final: Math.max(0, Math.min(100, score - osElsewhere * 6)),
        status: semCoordenada ? 'Falta coordenada' : (score >= 80 ? 'Recomendado' : score >= 62 ? 'Analisar' : 'Alto custo'),
      };
    }).sort((a, b) => b.score_final - a.score_final || a.custo_total - b.custo_total);

    state.ranking = rows;
    return rows;
  }

  /* ─── render helpers ─── */

  function renderOptions() {
    const opts = state.pontos.map(p => `
      <option value="${safeText(p.id)}" ${String(p.id) === String(state.selectedPontoId) ? 'selected' : ''}>
        ${safeText(p.nome_local)} · ${safeText(p.cidade)}/${safeText(p.uf)}
      </option>`).join('');
    return `<option value="">— Selecione um ponto —</option>${opts}`;
  }

  function renderMetrics(rows) {
    const ponto = selectedPonto();
    const best  = rows[0];
    const totalIndicados = Object.values(state.indicacoes).reduce((s, arr) => s + arr.length, 0);
    const saturados = Object.values(totalOsCount()).filter(c => c >= 2).length;
    return `
      <section class="op-summary">
        <div class="op-metric"><span>Ponto</span><strong>${ponto ? safeText(`${ponto.cidade}/${ponto.uf}`) : '—'}</strong></div>
        <div class="op-metric"><span>No ranking</span><strong>${rows.length}</strong></div>
        <div class="op-metric"><span>Melhor indicação</span><strong style="font-size:15px">${best ? safeText(shortName(best.nome)) : '—'}</strong></div>
        <div class="op-metric"><span>Direcionados</span><strong>${totalIndicados}${saturados ? `<small style="font-size:12px;color:#fde68a;display:block">${saturados} no limite</small>` : ''}</strong></div>
      </section>`;
  }

  function renderRanking(rows) {
    if (!rows.length) return '<div class="op-alert"><strong>Nenhum colaborador encontrado.</strong><br>Cadastre a base operacional para gerar o ranking.</div>';
    const pontoId = state.selectedPontoId;
    return rows.slice(0, 10).map((row, i) => {
      const ind = isIndicadoNoPonto(pontoId, row.id);
      return `
        <div class="op-rank${ind ? ' indicado' : ''}">
          <div class="op-rank-pos">${i + 1}</div>
          <div>
            <strong>${safeText(row.nome)}</strong>
            <span>${safeText(row.tipo_calculado)} · ${row.distancia == null ? 'sem km' : row.distancia + ' km'} · ${money(row.custo_total)} · Aud: ${Math.round(row.score_auditoria)}%${row.osElsewhere > 0 ? ` · <span class="op-pill warn" style="font-size:10px;padding:2px 6px">Em ${row.osElsewhere} OS</span>` : ''}</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
            <div class="op-score"><strong>${row.score_final}</strong><span>score</span></div>
            <button class="op-btn${ind ? '' : ' secondary'}" style="padding:4px 10px;min-height:unset;font-size:11px"
                    data-toggle-indicacao="${safeText(row.id)}" data-indicado="${ind}">
              ${ind ? '✓ Indicado' : 'Indicar'}
            </button>
          </div>
        </div>`;
    }).join('');
  }

  function renderTable(rows) {
    if (!rows.length) return '';
    const pontoId = state.selectedPontoId;
    return `
      <article class="op-card">
        <div class="op-card-head"><div><h3>Relação de custo-benefício</h3><p>Ranking completo para o ponto selecionado.</p></div></div>
        <div class="op-table-wrap">
          <table class="op-table">
            <thead><tr>
              <th>#</th><th>Colaborador</th><th>OS</th><th>Tipo</th><th>Base</th><th>Distância</th><th>Hotel sugerido</th><th>Fonte</th><th>Passagem</th><th>Hotel</th><th>Mão de obra</th><th>Alimentação</th><th>Total</th><th>Auditoria</th><th>Score</th><th>Status</th><th>Direcionamento</th>
            </tr></thead>
            <tbody>
              ${rows.map((row, i) => {
                const cls = row.semCoordenada ? 'muted' : scoreClass(row.score_final);
                const ind = isIndicadoNoPonto(pontoId, row.id);
                return `<tr>
                  <td>${i + 1}</td><td>${safeText(row.nome)}</td><td>${row.osElsewhere > 0 ? `<span class="op-pill warn">${row.osElsewhere}/2</span>` : '<span class="op-pill ok">livre</span>'}</td><td>${safeText(row.tipo_calculado)}</td>
                  <td>${safeText(`${row.cidade_base || '-'}${row.uf_base ? '/' + row.uf_base : ''}`)}</td>
                  <td>${row.distancia == null ? '-' : row.distancia + ' km'}</td>
                  <td>${safeText(row.hotel_nome)}${row.hotel_tipo_quarto ? `<br><small>${safeText(row.hotel_tipo_quarto)}</small>` : ''}</td>
                  <td>${row.hotel_fonte ? `<span class="op-pill ok">${safeText(row.hotel_fonte)}</span>` : `<span class="op-pill muted">—</span>`}</td>
                  <td>${money(row.valor_passagem)}</td><td>${money(row.valor_hotel)}</td>
                  <td>${money(row.valor_mao_obra)}</td><td>${money(row.valor_alimentacao)}</td><td>${money(row.custo_total)}</td>
                  <td>${Math.round(row.score_auditoria)}%</td>
                  <td><span class="op-pill ${cls}">${row.score_final}</span></td>
                  <td><span class="op-pill ${cls}">${safeText(row.status)}</span></td>
                  <td>
                    <button class="op-btn${ind ? '' : ' secondary'}" style="padding:4px 10px;min-height:unset;font-size:11px"
                            data-toggle-indicacao="${safeText(row.id)}" data-indicado="${ind}">
                      ${ind ? '✓ Indicado' : 'Indicar'}
                    </button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </article>`;
  }

  function renderDirecionamentoPanel() {
    const entries = Object.entries(state.indicacoes)
      .map(([pId, ids]) => ({ ponto: state.pontos.find(p => String(p.id) === String(pId)), colabIds: ids }))
      .filter(({ ponto, colabIds }) => ponto && colabIds.length);
    if (!entries.length) return '';

    const items = entries.map(({ ponto, colabIds }) => {
      const colabs = colabIds.map(cId => state.colaboradores.find(c => String(c.id) === String(cId))).filter(Boolean);
      if (!colabs.length) return '';
      const allCounts = totalOsCount();
      const colabRows = colabs.map(c => {
        const totOs = allCounts[String(c.id)] || 0;
        return `
              <div class="op-direcionar-row">
                <span style="color:#f8fafc;font-size:13px">${safeText(c.nome)}${totOs > 1 ? ` <span class="op-pill warn" style="font-size:10px;padding:2px 5px">${totOs}/2 OS</span>` : ''}</span>
                <button class="op-btn secondary" style="padding:3px 10px;min-height:unset;font-size:11px"
                        data-remover-indicacao="${safeText(ponto.id)}" data-remover-colab="${safeText(c.id)}">
                  Remover
                </button>
              </div>`;
      }).join('');
      return `
        <div class="op-rank" style="flex-direction:column;gap:8px;cursor:default">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div>
              <strong>${safeText(ponto.nome_local)}</strong>
              <span>${safeText(ponto.cidade)}/${safeText(ponto.uf)} · ${safeText(ponto.supervisao || '')}</span>
            </div>
            <span class="op-pill ok">${colabs.length} indicado${colabs.length > 1 ? 's' : ''}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${colabRows}
          </div>
        </div>`;
    }).filter(Boolean);
    if (!items.length) return '';

    return `
      <article class="op-card">
        <div class="op-card-head">
          <div><h3>Mapa de direcionamento</h3><p>Colaboradores indicados por ponto. Indicados em outro ponto são ocultados dos demais rankings.</p></div>
          <button class="op-btn secondary" id="opLimparIndicacoes" type="button" style="white-space:nowrap;flex-shrink:0">Limpar tudo</button>
        </div>
        <div class="op-list" style="max-height:none">${items.join('')}</div>
      </article>`;
  }

  function renderOutOfBrazilWarning() {
    const { colaboradores: fC, pontos: fP } = state.foraDoMapa;
    const total = fC.length + fP.length;
    if (!total) return '';
    const partes = [
      fC.length ? `${fC.length} colaborador(es) (ex.: ${fC.slice(0, 2).map(c => safeText(c.nome)).join(', ')}${fC.length > 2 ? '...' : ''})` : '',
      fP.length ? `${fP.length} ponto(s) de embarque` : '',
    ].filter(Boolean).join(' e ');
    return `
      <div class="op-alert danger">
        <strong>Coordenadas fora do Brasil</strong> — ${partes}. Foram desconsiderados no mapa e no ranking.
        <button class="op-btn" id="opLimparCoords" type="button" style="margin-top:10px;font-size:12px;padding:7px 12px">
          Limpar coordenadas inválidas no banco
        </button>
      </div>`;
  }

  function renderPontosListForMap(pontos) {
    if (!pontos.length) return '<div class="op-pontos-empty">Nenhum ponto no enquadramento.<br>Explore o mapa com zoom out.</div>';
    return pontos.map(p => {
      const qtdInd   = (state.indicacoes[String(p.id)] || []).length;
      const isActive = String(p.id) === String(state.selectedPontoId);
      return `
        <div class="op-point${isActive ? ' active' : ''}" data-ponto-id="${safeText(p.id)}">
          <strong>${safeText(p.nome_local)}${qtdInd ? ` <span class="op-pill ok" style="font-size:10px;padding:2px 6px">${qtdInd} dir.</span>` : ''}</strong>
          <span>${safeText(p.tipo_local || 'Ponto')} · ${safeText(p.cidade)}/${safeText(p.uf)}</span>
        </div>`;
    }).join('');
  }

  /* ─── mapa ─── */

  async function limparCoordenadasForaDoBrasil(container) {
    const { colaboradores: fC, pontos: fP } = state.foraDoMapa;
    if (!fC.length && !fP.length) return;
    const btn = container.querySelector('#opLimparCoords');
    if (btn) { btn.disabled = true; btn.textContent = 'Limpando...'; }
    try {
      const ops = [];
      if (fC.length) ops.push(supabase.from('operacional_colaborador_base').update({ latitude: null, longitude: null }).in('id', fC.map(c => c.id)));
      if (fP.length) ops.push(supabase.from('operacional_pontos_embarque').update({ latitude: null, longitude: null }).in('id', fP.map(p => p.id)));
      const results = await Promise.all(ops);
      const err = results.find(r => r.error);
      if (err) throw err.error;
      state.foraDoMapa = { colaboradores: [], pontos: [] };
      container.classList.add('op-loading');
      await loadData();
      container.classList.remove('op-loading');
      renderShell(container);
    } catch (err) {
      console.error('[Operacional] Erro ao limpar coordenadas:', err);
      if (btn) { btn.disabled = false; btn.textContent = 'Limpar coordenadas inválidas no banco'; }
    }
  }

  function updatePontosListFromBounds(map, container) {
    const bounds  = map.getBounds();
    const visible = state.pontos.filter(p => bounds.contains([Number(p.latitude), Number(p.longitude)]));
    const listEl  = container.querySelector('#opPontosListMap');
    const countEl = container.querySelector('#opPontosCount');
    if (countEl) countEl.textContent = `${visible.length} de ${state.pontos.length}`;
    if (!listEl) return;
    listEl.innerHTML = renderPontosListForMap(visible);
    listEl.querySelectorAll('[data-ponto-id]').forEach(el => {
      el.addEventListener('click', () => {
        const ponto = state.pontos.find(p => String(p.id) === el.getAttribute('data-ponto-id'));
        if (ponto) onPontoClick(ponto, container, map, true);
      });
    });
  }

  function showColabsOnMap(ponto, rows, map) {
    state.colabLayer?.clearLayers();
    state.selectedLayer?.clearLayers();
    const L = window.L;
    const pontoLL = [Number(ponto.latitude), Number(ponto.longitude)];

    // Pulsing marker para o ponto selecionado
    const pontoIcon = L.divIcon({
      html: `<div class="op-ponto-sel">
        <div class="op-ponto-sel-ring"></div>
        <div class="op-ponto-sel-dot"></div>
        <div class="op-ponto-sel-label">${safeText(ponto.nome_local)}<br><small style="opacity:.75">${safeText(ponto.cidade)}/${safeText(ponto.uf)}</small></div>
      </div>`,
      className: '',
      iconAnchor: [8, 8],
    });
    L.marker(pontoLL, { icon: pontoIcon, zIndexOffset: 1000 }).addTo(state.selectedLayer);

    // Top 5 colaboradores com coordenadas
    const top5 = rows.filter(r => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))).slice(0, 5);
    const bounds = [pontoLL];

    top5.forEach((row, i) => {
      const latlng = [Number(row.latitude), Number(row.longitude)];
      const color  = COLAB_COLORS[i];
      bounds.push(latlng);


      // Marcador com nome
      const icon = L.divIcon({
        html: `<div class="op-colab-marker">
          <div class="op-colab-dot" style="background:${color};box-shadow:0 0 8px ${color}"></div>
          <div class="op-colab-label" style="border-color:${color}60">${i + 1}. ${safeText(shortName(row.nome))}</div>
        </div>`,
        className: '',
        iconAnchor: [0, 8],
      });
      L.marker(latlng, { icon })
        .bindPopup(`<strong>${safeText(row.nome)}</strong><br>${safeText(row.tipo_calculado)} · ${row.distancia ?? '-'} km<br>Score: ${row.score_final} · ${money(row.custo_total)}<br>Aud: ${Math.round(row.score_auditoria)}%`)
        .addTo(state.colabLayer);
    });

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.25), { maxZoom: 10, animate: true });
    } else {
      map.flyTo(pontoLL, 10, { animate: true, duration: 0.8 });
    }
  }

  function onPontoClick(ponto, container, map, flyTo = true) {
    state.selectedPontoId = String(ponto.id);

    // Atualiza select
    const sel = container.querySelector('#opPonto');
    if (sel) sel.value = state.selectedPontoId;

    // Calcula ranking e mostra colaboradores no mapa
    const rows = calcRanking(container);
    if (flyTo) showColabsOnMap(ponto, rows, map);

    // Exibe seção de ranking
    const section = container.querySelector('#opRankingSection');
    if (section) section.style.display = '';

    // Atualiza painéis
    const metricsEl = container.querySelector('#opMetrics');
    if (metricsEl) metricsEl.innerHTML = renderMetrics(rows);
    const rankingEl = container.querySelector('#opRanking');
    if (rankingEl) rankingEl.innerHTML = renderRanking(rows);
    const tableEl = container.querySelector('#opTable');
    if (tableEl) tableEl.innerHTML = renderTable(rows);
    const dirEl = container.querySelector('#opDirecionamentoPlaceholder');
    if (dirEl) dirEl.innerHTML = renderDirecionamentoPanel();

    // Destaca ponto na lista lateral
    container.querySelectorAll('#opPontosListMap [data-ponto-id]').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-ponto-id') === String(ponto.id));
    });

    bindIndicacaoClicks(container);
  }

  async function initMap(container) {
    const mapEl = container.querySelector('#opMap');
    if (!mapEl) return;

    const leafletOk = await ensureLeaflet();
    if (!leafletOk) {
      mapEl.innerHTML = '<div class="op-map-empty"><div><strong>Mapa indisponível</strong><br><span>Não foi possível carregar a biblioteca de mapas.</span></div></div>';
      return;
    }
    await ensureCluster();

    if (state.map) { state.map.remove(); state.map = null; }
    mapEl.innerHTML = '';

    const L   = window.L;
    const map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: true, center: [-14.235, -51.925], zoom: 4 });

    // Dark tile - CartoDB Dark Matter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
    }).addTo(map);

    // Layers auxiliares
    state.colabLayer    = L.layerGroup().addTo(map);
    state.selectedLayer = L.layerGroup().addTo(map);

    // MarkerCluster para os pontos de embarque
    const useCluster = Boolean(L.MarkerClusterGroup);
    if (useCluster) {
      state.clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 55,
        disableClusteringAtZoom: 11,
        spiderfyOnMaxZoom: false,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: c => {
          const count = c.getChildCount();
          const size  = count < 10 ? 36 : count < 50 ? 44 : 52;
          return L.divIcon({
            html: `<div class="op-cluster-icon" style="width:${size}px;height:${size}px">${count}</div>`,
            className: '',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
        },
      });
    }

    state.pontos.forEach(ponto => {
      const lat = Number(ponto.latitude), lng = Number(ponto.longitude);
      const marker = L.circleMarker([lat, lng], {
        radius: 7, color: '#22c55e', fillColor: '#16a34a', fillOpacity: 0.8, weight: 2,
      });
      marker.bindTooltip(safeText(ponto.nome_local), { direction: 'top', className: 'op-tt' });
      marker.on('click', () => onPontoClick(ponto, container, map, true));
      if (useCluster) state.clusterGroup.addLayer(marker);
      else marker.addTo(map);
    });

    if (useCluster) state.clusterGroup.addTo(map);

    // Atualiza lista lateral ao mover/zoom
    map.on('moveend zoomend', () => updatePontosListFromBounds(map, container));
    updatePontosListFromBounds(map, container);

    state.map = map;
    setTimeout(() => map.invalidateSize(), 80);
  }

  /* ─── shell e eventos ─── */

  function renderShell(container) {
    container.innerHTML = `
      <div class="op-shell">
        <div class="op-header">
          <div class="op-header-top">
            <span class="op-kicker">Operacional</span>
            <h2>Mapa de direcionamento</h2>
          </div>
          <div class="op-filters">
            <div class="op-field" style="flex:2;min-width:200px">
              <label>Ponto de embarque</label>
              <select id="opPonto">${renderOptions()}</select>
            </div>
            <div class="op-field"><label>Volume (t)</label><input id="opVolume" type="number" placeholder="0" value="${safeText(container.dataset.volume || '')}"></div>
            <div class="op-field"><label>Dias</label><input id="opDias" type="number" min="1" value="${safeText(container.dataset.dias || '1')}"></div>
            <div class="op-field"><label>Equipe</label><input id="opQtd" type="number" min="1" value="${safeText(container.dataset.qtd || '1')}"></div>
            <div class="op-field"><label>Tipo</label>
              <select id="opTipo"><option value="todos">Todos</option><option value="efetivo">Efetivo</option><option value="diarista">Diarista</option></select>
            </div>
            <div class="op-field" style="flex:1.5"><label>Buscar</label><input id="opBusca" placeholder="Nome, cidade..."></div>
            <div class="op-field" style="flex:0">
              <label style="opacity:0">.</label>
              <div style="display:flex;gap:7px">
                <button class="op-btn" id="opGerar" type="button">Ranking</button>
                <button class="op-btn secondary" id="opReload" type="button" title="Atualizar dados">↺</button>
              </div>
            </div>
          </div>
        </div>

        <div id="opForaBrasilPlaceholder">${renderOutOfBrazilWarning()}</div>

        <div class="op-map-layout">
          <div class="op-map-wrap">
            <div id="opMap">
              <div class="op-map-empty"><div><strong>Carregando mapa...</strong></div></div>
            </div>
          </div>
          <div class="op-pontos-panel">
            <div class="op-pontos-panel-head">
              <strong>Pontos de embarque</strong>
              <span id="opPontosCount">${state.pontos.length} pontos</span>
            </div>
            <div id="opPontosListMap"></div>
          </div>
        </div>

        <div id="opRankingSection" style="display:none;display:flex;flex-direction:column;gap:16px">
          <div id="opMetrics"></div>
          <section class="op-layout">
            <article class="op-card">
              <div class="op-card-head"><div><h3>Ranking recomendado</h3><p>Colaboradores ordenados por score. Indicados em outro ponto não aparecem aqui.</p></div></div>
              <div class="op-list" id="opRanking"><div class="op-alert">Clique em um ponto de embarque no mapa ou na lista para gerar o ranking.</div></div>
            </article>
            <article class="op-card">
              <div class="op-card-head"><div><h3>Como usar</h3></div></div>
              <div class="op-list">
                <div class="op-alert">
                  <strong>Fluxo:</strong><br>
                  1. Clique num ponto no mapa ou na lista lateral.<br>
                  2. Os 5 melhores colaboradores aparecem no mapa com nome.<br>
                  3. Clique <strong>Indicar</strong> para direcionar o colaborador.<br>
                  4. Cada colaborador pode ser indicado para até <strong>2 OS</strong>.<br>
                  5. Quem já está em 1 OS aparece com badge <em>Em 1 OS</em> e score reduzido.<br>
                  6. Ao atingir 2 OS, sai de todos os rankings.
                </div>
              </div>
            </article>
          </section>
        </div>

        <div id="opDirecionamentoPlaceholder">${renderDirecionamentoPanel()}</div>
        <div id="opTable"></div>
      </div>
    `;

    // Corrige o display do opRankingSection (estava com dois display)
    const rankingSection = container.querySelector('#opRankingSection');
    if (rankingSection) rankingSection.style.display = 'none';

    bindEvents(container);
    initMap(container);
  }

  function refreshComputed(container) {
    container.dataset.volume = container.querySelector('#opVolume')?.value || '';
    container.dataset.dias   = container.querySelector('#opDias')?.value || '1';
    container.dataset.qtd    = container.querySelector('#opQtd')?.value || '1';
    const ponto = selectedPonto();
    if (ponto && state.map) {
      onPontoClick(ponto, container, state.map, false);
      showColabsOnMap(ponto, state.ranking, state.map);
    }
  }

  function bindIndicacaoClicks(container) {
    container.querySelectorAll('[data-toggle-indicacao]').forEach(btn => {
      btn.addEventListener('click', () => {
        const colabId = btn.dataset.toggleIndicacao;
        const pontoId = state.selectedPontoId;
        if (btn.dataset.indicado === 'true') removerIndicacao(pontoId, colabId);
        else indicarColab(pontoId, colabId);
        const ponto = selectedPonto();
        if (ponto && state.map) onPontoClick(ponto, container, state.map, false);
      });
    });
    container.querySelectorAll('[data-remover-indicacao]').forEach(btn => {
      btn.addEventListener('click', () => {
        removerIndicacao(btn.dataset.removerIndicacao, btn.dataset.removerColab);
        const ponto = selectedPonto();
        if (ponto && state.map) onPontoClick(ponto, container, state.map, false);
        else {
          const dirEl = container.querySelector('#opDirecionamentoPlaceholder');
          if (dirEl) dirEl.innerHTML = renderDirecionamentoPanel();
          bindIndicacaoClicks(container);
        }
      });
    });
    container.querySelector('#opLimparIndicacoes')?.addEventListener('click', () => {
      state.indicacoes = {};
      saveIndicacoes();
      const ponto = selectedPonto();
      if (ponto && state.map) onPontoClick(ponto, container, state.map, false);
      else {
        const dirEl = container.querySelector('#opDirecionamentoPlaceholder');
        if (dirEl) dirEl.innerHTML = '';
      }
    });
    container.querySelector('#opLimparCoords')?.addEventListener('click', () => limparCoordenadasForaDoBrasil(container));
  }

  function bindEvents(container) {
    container.querySelector('#opPonto')?.addEventListener('change', ev => {
      const ponto = state.pontos.find(p => String(p.id) === ev.target.value);
      if (ponto && state.map) onPontoClick(ponto, container, state.map, true);
    });
    container.querySelector('#opGerar')?.addEventListener('click', () => refreshComputed(container));
    container.querySelector('#opBusca')?.addEventListener('input', () => refreshComputed(container));
    container.querySelector('#opTipo')?.addEventListener('change', () => refreshComputed(container));
    container.querySelector('#opReload')?.addEventListener('click', async () => {
      container.classList.add('op-loading');
      await loadData();
      container.classList.remove('op-loading');
      renderShell(container);
    });
    bindIndicacaoClicks(container);
  }

  async function openHome(container) {
    ensureStyles();
    state.indicacoes = loadIndicacoesFromStorage();
    container.innerHTML = `
      <div class="op-shell">
        <div class="op-header">
          <div class="op-header-top"><span class="op-kicker">Operacional</span><h2>Mapa de direcionamento</h2></div>
          <p style="margin:6px 0 0;color:#6b7280;font-size:13px">Buscando pontos, colaboradores, hotéis, passagens e auditoria...</p>
        </div>
      </div>`;
    await loadData();
    renderShell(container);
  }

  window.OPERACIONAL = { openHome };
})();
