// Etapa B da Programação: "quem vai atender as OS disponíveis".
// Sugere candidatos por OS (Contrato 50% / Distância 30% / Auditoria 20%),
// o gestor confirma, e o mapa mostra o roteiro (casa do colaborador -> ponto
// de embarque) com KM real via OSRM (edge function programacao-rota-equipe).
import { supabase } from './supabaseClient.js';

const PESOS = { contrato: 0.5, distancia: 0.3, auditoria: 0.2 };
const CONTRATO_SCORE = { EFETIVO: 1, INTERMITENTE: 0.6, DIARISTA: 0.3 };
const AUDITORIA_DIAS = 180;
const TOP_CANDIDATOS = 8;
const LEAFLET_CSS_ID = 'leaflet-css-prog-equipe';
const LEAFLET_JS_ID = 'leaflet-js-prog-equipe';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function colaboradorKey(colab) {
  return normalizeCpf(colab.cpf) || String(colab.id || colab.nome || '').trim();
}

function isColaboradorAtivo(colab) {
  if (!colab) return false;
  if (colab.ativo === false) return false;
  const situacao = normalizeText(colab.situacao);
  const desligamento = String(colab.desligamento || '').trim();
  if (desligamento) return false;
  return !['NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA'].some((s) => situacao.includes(s));
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function round1(n) { return Math.round(n * 10) / 10; }

function contratoScore(tipo) {
  const norm = normalizeText(tipo);
  if (norm.includes('EFETIVO')) return CONTRATO_SCORE.EFETIVO;
  if (norm.includes('INTERMITENTE')) return CONTRATO_SCORE.INTERMITENTE;
  if (norm.includes('DIARISTA')) return CONTRATO_SCORE.DIARISTA;
  return 0.5;
}

function contratoLabel(tipo) {
  const norm = normalizeText(tipo);
  if (norm.includes('EFETIVO')) return 'Efetivo';
  if (norm.includes('INTERMITENTE')) return 'Intermitente';
  if (norm.includes('DIARISTA')) return 'Diarista';
  return 'Não informado';
}

// Normaliza um valor (km ou peso de auditoria) por ranking dentro do grupo de
// candidatos da mesma OS: melhor (menor valor) = 1, pior (maior valor) = 0.
// Quem não tem o dado (null) fica sempre no fim, com score 0.
function rankScores(values) {
  const indices = values.map((v, i) => i).filter((i) => values[i] != null);
  indices.sort((a, b) => values[a] - values[b]);
  const scores = values.map(() => 0);
  const n = indices.length;
  indices.forEach((idx, pos) => {
    scores[idx] = n > 1 ? 1 - pos / (n - 1) : 1;
  });
  return scores;
}

async function ensureLeaflet() {
  if (window.L) return true;
  try {
    if (!document.getElementById(LEAFLET_CSS_ID)) {
      const link = document.createElement('link');
      link.id = LEAFLET_CSS_ID;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById(LEAFLET_JS_ID)) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = LEAFLET_JS_ID;
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    return Boolean(window.L);
  } catch (error) {
    console.warn('[programacao-equipe] Leaflet indisponível.', error);
    return false;
  }
}

function injectStyles() {
  if (document.getElementById('progEquipeStyles')) return;
  const style = document.createElement('style');
  style.id = 'progEquipeStyles';
  style.textContent = `
    .peq-shell{display:grid;grid-template-columns:minmax(420px,1.2fr) minmax(340px,.8fr);gap:14px;align-items:start}
    .peq-os-list{display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 300px);overflow:auto;padding-right:4px}
    .peq-os-card{border:1px solid rgba(52,211,153,.18);border-radius:16px;background:rgba(2,6,23,.32);padding:12px}
    .peq-os-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;color:#f8fafc;font-weight:950;font-size:13px}
    .peq-os-head small{color:#bbf7d0;font-size:11px;white-space:nowrap}
    .peq-os-meta{color:#94a3b8;font-size:11.5px;margin-top:3px;line-height:1.35}
    .peq-confirmado{margin-top:8px;border:1px solid rgba(34,197,94,.35);background:rgba(22,101,52,.18);border-radius:12px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
    .peq-confirmado b{color:#dcfce7;font-size:12.5px}
    .peq-confirmado small{display:block;color:#a7f3d0;font-size:11px;margin-top:2px}
    .peq-candidatos{margin-top:8px;border-top:1px solid rgba(148,163,184,.12);padding-top:8px}
    .peq-cand-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:6px 4px;border-radius:8px}
    .peq-cand-row:hover{background:rgba(34,197,94,.07)}
    .peq-cand-nome{color:#f1f5f9;font-size:12.5px;font-weight:800}
    .peq-cand-info{color:#94a3b8;font-size:11px;margin-top:1px}
    .peq-btn{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.16);color:#dcfce7;border-radius:999px;padding:6px 11px;font-size:11.5px;font-weight:950;cursor:pointer;white-space:nowrap}
    .peq-btn:hover{background:rgba(22,163,74,.3)}
    .peq-btn.danger{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.14);color:#fecaca}
    .peq-btn:disabled{opacity:.6;cursor:not-allowed}
    .peq-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:22px;text-align:center;color:#94a3b8;line-height:1.4}
    .peq-map-panel{position:sticky;top:92px;border:1px solid rgba(52,211,153,.18);border-radius:16px;background:rgba(2,6,23,.32);overflow:hidden}
    .peq-map-head{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.12);display:flex;justify-content:space-between;align-items:center;gap:8px}
    .peq-map-head h4{margin:0;color:#f8fafc;font-size:14px}
    .peq-map{height:480px;position:relative}
    #peqMapEl{position:absolute;inset:0}
    .peq-map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;text-align:center;padding:18px;z-index:2}
    .peq-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:10px 14px}
    .peq-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:12px;padding:10px}
    .peq-kpi span{display:block;color:#93c5fd;font-size:9.5px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
    .peq-kpi strong{display:block;margin-top:4px;color:#fff;font-size:18px}
    @media(max-width:1100px){.peq-shell{grid-template-columns:1fr}.peq-map-panel{position:relative;top:auto}}
  `;
  document.head.appendChild(style);
}

let _map = null;
let _mapInitializing = false;
let _layerPontos = null;
let _layerColabs = null;
let _layerRotas = null;
let _resizeBound = false;

async function ensureMap(root) {
  const mapEl = root.querySelector('#peqMapEl');
  if (!mapEl || _map) return;
  if (_mapInitializing) return;
  _mapInitializing = true;
  try {
    const ok = await ensureLeaflet();
    if (!mapEl.isConnected) return;
    if (!ok) {
      mapEl.innerHTML = '<div class="peq-map-loading">Mapa indisponível (falha ao carregar Leaflet).</div>';
      return;
    }
    const L = window.L;
    _map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: true, center: [-14.235, -51.925], zoom: 4 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OSM &copy; CARTO',
      subdomains: 'abcd',
    }).addTo(_map);
    _layerPontos = L.layerGroup().addTo(_map);
    _layerColabs = L.layerGroup().addTo(_map);
    _layerRotas = L.layerGroup().addTo(_map);
    if (!_resizeBound) {
      window.addEventListener('resize', () => { if (_map) _map.invalidateSize(); });
      _resizeBound = true;
    }
    setTimeout(() => { if (_map) _map.invalidateSize(); }, 80);
  } finally {
    _mapInitializing = false;
  }
}

function updateMap(osComCandidatos) {
  if (!_map || !window.L) return;
  const L = window.L;
  _layerPontos.clearLayers();
  _layerColabs.clearLayers();
  _layerRotas.clearLayers();

  const bounds = [];
  osComCandidatos.forEach(({ os, ponto, confirmados }) => {
    if (ponto && hasGeo(ponto.lat, ponto.lng)) {
      const marker = L.circleMarker([ponto.lat, ponto.lng], { radius: 8, color: '#a78bfa', fillColor: '#a78bfa', fillOpacity: .85, weight: 2 });
      marker.bindTooltip(`${esc(ponto.nome || os.embarque || 'Ponto de embarque')}`, { className: 'rot-tt' });
      _layerPontos.addLayer(marker);
      bounds.push([ponto.lat, ponto.lng]);
    }
    confirmados.forEach((conf) => {
      if (conf.origem && hasGeo(conf.origem.lat, conf.origem.lng)) {
        const marker = L.circleMarker([conf.origem.lat, conf.origem.lng], { radius: 6, color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: .85, weight: 2 });
        marker.bindTooltip(`${esc(conf.nome_colaborador)} · ${conf.km != null ? `${conf.km} km` : 'sem rota'}`, { className: 'rot-tt' });
        _layerColabs.addLayer(marker);
        bounds.push([conf.origem.lat, conf.origem.lng]);
      }
      if (conf.geometria?.type === 'LineString' && Array.isArray(conf.geometria.coordinates)) {
        const latlngs = conf.geometria.coordinates.map(([lng, lat]) => [lat, lng]);
        L.polyline(latlngs, { color: '#22c55e', weight: 3, opacity: .8, dashArray: conf.distancia_real ? null : '6 6' }).addTo(_layerRotas);
      }
    });
  });

  if (bounds.length) _map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
}

const cache = { pontos: new Map(), snapshot: new Map(), colabBase: new Map(), contrato: new Map(), auditoria: null };
const CACHE_TTL_MS = 1000 * 60 * 5;

function cacheGet(map, key) {
  const item = map.get(key);
  if (!item || Date.now() - item.ts > CACHE_TTL_MS) return null;
  return item.data;
}

function cacheSet(map, key, data) {
  map.set(key, { ts: Date.now(), data });
  return data;
}

async function loadOsAtender(supervisao) {
  const { data, error } = await supabase
    .from('operacional_os')
    .select('id,numero_os,cliente,embarque,ponto_embarque_id,ponto1_latitude,ponto1_longitude,supervisao')
    .eq('supervisao', supervisao)
    .eq('status_gestor', 'ATENDER')
    .order('numero_os', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

async function loadPontos(ids) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('operacional_pontos_embarque')
    .select('id,nome_local,latitude,longitude')
    .in('id', ids);
  if (error) throw error;
  return new Map((data || []).map((p) => [p.id, p]));
}

async function loadSnapshotColaboradores(supervisao) {
  const cached = cacheGet(cache.snapshot, supervisao);
  if (cached) return cached;
  const latest = await supabase.from('colaborador_snapshot').select('data_referencia').order('data_referencia', { ascending: false }).limit(1);
  const ref = latest.data?.[0]?.data_referencia;
  if (!ref) return cacheSet(cache.snapshot, supervisao, []);
  const { data, error } = await supabase.from('colaborador_snapshot').select('*').eq('data_referencia', ref).eq('supervisao', supervisao).limit(3500);
  if (error) throw error;
  const seen = new Set();
  const rows = (data || []).filter(isColaboradorAtivo).filter((colab) => {
    const key = normalizeCpf(colab.cpf) || normalizeText(colab.nome);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return cacheSet(cache.snapshot, supervisao, rows);
}

async function loadContratos(cpfs) {
  const pendentes = cpfs.filter((c) => !cache.contrato.has(c));
  if (pendentes.length) {
    const { data, error } = await supabase.from('colaboradores').select('cpf,tipo').in('cpf', pendentes);
    if (!error) (data || []).forEach((row) => cache.contrato.set(normalizeCpf(row.cpf), row.tipo));
  }
  const map = new Map();
  cpfs.forEach((c) => map.set(c, cache.contrato.get(c) || null));
  return map;
}

async function loadColabBase(cpfs) {
  const pendentes = cpfs.filter((c) => !cache.colabBase.has(c));
  if (pendentes.length) {
    const { data, error } = await supabase.from('operacional_colaborador_base').select('cpf,latitude,longitude').in('cpf', pendentes).eq('ativo', true);
    if (!error) (data || []).forEach((row) => {
      const cpf = normalizeCpf(row.cpf);
      if (cpf && !cache.colabBase.has(cpf)) cache.colabBase.set(cpf, hasGeo(row.latitude, row.longitude) ? { lat: Number(row.latitude), lng: Number(row.longitude) } : null);
    });
  }
  const map = new Map();
  cpfs.forEach((c) => map.set(c, cache.colabBase.get(c) || null));
  return map;
}

async function loadAuditorias() {
  if (cache.auditoria && Date.now() - cache.auditoria.ts < CACHE_TTL_MS) return cache.auditoria.data;
  const cutoff = new Date(Date.now() - AUDITORIA_DIAS * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('operacional_auditoria_colaborador')
    .select('nome_chave,score_impacto,data_evento')
    .gte('data_evento', cutoff)
    .limit(5000);
  const map = new Map();
  if (!error) {
    (data || []).forEach((row) => {
      const key = String(row.nome_chave || '').trim().toUpperCase();
      if (!key) return;
      const atual = map.get(key) || 0;
      map.set(key, atual + 1 + Math.abs(Number(row.score_impacto) || 0));
    });
  }
  cache.auditoria = { ts: Date.now(), data: map };
  return map;
}

async function loadEquipeExistente(programacaoId) {
  const { data, error } = await supabase.from('programacao_equipe').select('*').eq('programacao_id', programacaoId);
  if (error) throw error;
  return data || [];
}

async function montarContexto(supervisao) {
  const colaboradores = await loadSnapshotColaboradores(supervisao);
  const cpfs = [...new Set(colaboradores.map((c) => normalizeCpf(c.cpf)).filter(Boolean))];
  const [contratos, bases, auditorias] = await Promise.all([loadContratos(cpfs), loadColabBase(cpfs), loadAuditorias()]);
  return { colaboradores, contratos, bases, auditorias };
}

function pontoDaOs(os, pontosPorId) {
  if (hasGeo(os.ponto1_latitude, os.ponto1_longitude)) {
    return { lat: Number(os.ponto1_latitude), lng: Number(os.ponto1_longitude), nome: os.embarque };
  }
  const ponto = os.ponto_embarque_id ? pontosPorId.get(os.ponto_embarque_id) : null;
  if (ponto && hasGeo(ponto.latitude, ponto.longitude)) {
    return { lat: Number(ponto.latitude), lng: Number(ponto.longitude), nome: ponto.nome_local || os.embarque };
  }
  return null;
}

function montarCandidatos(ponto, contexto, jaConfirmadosOutraOs) {
  const candidatosBrutos = contexto.colaboradores.filter((colab) => !jaConfirmadosOutraOs.has(colaboradorKey(colab)));

  const kms = candidatosBrutos.map((colab) => {
    const home = contexto.bases.get(normalizeCpf(colab.cpf));
    return ponto && home ? haversineKm(home.lat, home.lng, ponto.lat, ponto.lng) : null;
  });
  const auditPesos = candidatosBrutos.map((colab) => {
    const peso = contexto.auditorias.get(normalizeText(colab.nome));
    return peso != null ? peso : null;
  });

  const distScores = rankScores(kms);
  const auditScoresNormalizados = rankScores(auditPesos.map((p) => (p == null ? 0 : p)));

  const candidatos = candidatosBrutos.map((colab, i) => {
    const tipo = contexto.contratos.get(normalizeCpf(colab.cpf));
    const scoreContrato = contratoScore(tipo);
    const scoreDistancia = distScores[i];
    const scoreAuditoria = auditScoresNormalizados[i];
    const final = PESOS.contrato * scoreContrato + PESOS.distancia * scoreDistancia + PESOS.auditoria * scoreAuditoria;
    return {
      colaborador: colab,
      colaboradorId: colaboradorKey(colab),
      tipoLabel: contratoLabel(tipo),
      km: kms[i] != null ? round1(kms[i]) : null,
      auditPeso: auditPesos[i],
      scoreContrato,
      scoreDistancia,
      scoreAuditoria,
      score: final,
    };
  });

  candidatos.sort((a, b) => b.score - a.score);
  return candidatos.slice(0, TOP_CANDIDATOS);
}

function candidatoInfo(cand) {
  const km = cand.km != null ? `${cand.km} km` : 'sem coordenadas';
  const aud = cand.auditPeso != null ? `${cand.auditPeso.toFixed(1)} pts auditoria` : 'sem auditoria recente';
  return `${cand.tipoLabel} · ${km} · ${aud} · score ${(cand.score * 100).toFixed(0)}`;
}

function osCardHtml(item) {
  const { os, confirmadoRow, candidatos } = item;
  const confirmadoHtml = confirmadoRow
    ? `<div class="peq-confirmado">
        <div><b>${esc(confirmadoRow.nome_colaborador)}</b><small>Confirmado · ${confirmadoRow.km_estimado != null ? `${confirmadoRow.km_estimado} km` : 'sem rota'}</small></div>
        <button type="button" class="peq-btn danger" data-remover="${esc(confirmadoRow.id)}">Remover</button>
      </div>`
    : '';
  const candidatosHtml = candidatos.length
    ? `<div class="peq-candidatos">${candidatos.map((c) => `
        <div class="peq-cand-row">
          <div><div class="peq-cand-nome">${esc(c.colaborador.nome)}</div><div class="peq-cand-info">${esc(candidatoInfo(c))}</div></div>
          <button type="button" class="peq-btn" data-confirmar="${esc(c.colaboradorId)}">Confirmar</button>
        </div>`).join('')}</div>`
    : '<div class="peq-cand-info" style="margin-top:8px">Nenhum candidato disponível (todos já confirmados em outras OS).</div>';

  return `
    <article class="peq-os-card" data-os-id="${esc(os.id)}">
      <div class="peq-os-head"><span>${esc(os.cliente || '-')}</span><small>OS ${esc(os.numero_os || '-')}</small></div>
      <div class="peq-os-meta">Embarque: ${esc(os.embarque || '-')}</div>
      ${confirmadoHtml}
      ${confirmadoRow ? '' : candidatosHtml}
    </article>
  `;
}

async function atualizarMapaENativos(root, osComCandidatos, confirmadosPorOs) {
  await ensureMap(root);
  const pares = [];
  osComCandidatos.forEach(({ os }) => {
    const confirmado = confirmadosPorOs.get(os.id);
    if (confirmado) {
      const home = confirmado.__home;
      if (home) pares.push({ os_id: os.id, colaborador_id: confirmado.colaborador_id, origem_lat: home.lat, origem_lng: home.lng });
    }
  });

  let rotasPorPar = new Map();
  let porOs = {};
  if (pares.length) {
    try {
      const { data, error } = await supabase.functions.invoke('programacao-rota-equipe', { body: { pares } });
      if (error) throw error;
      (data?.rotas || []).forEach((r) => rotasPorPar.set(`${r.os_id}:${r.colaborador_id}`, r));
      porOs = data?.porOs || {};
    } catch (error) {
      console.warn('[programacao-equipe] falha ao calcular rota.', error);
    }
  }

  const kpiKmEl = root.querySelector('#peqKpiKm');
  const kpiOsEl = root.querySelector('#peqKpiOs');
  const kmTotal = Object.values(porOs).reduce((s, o) => s + (o.km_total || 0), 0);
  if (kpiKmEl) kpiKmEl.textContent = `${round1(kmTotal)} km`;
  if (kpiOsEl) kpiOsEl.textContent = String(confirmadosPorOs.size);

  const osParaMapa = osComCandidatos.map(({ os, ponto }) => {
    const confirmado = confirmadosPorOs.get(os.id);
    const confirmados = [];
    if (confirmado) {
      const rota = rotasPorPar.get(`${os.id}:${confirmado.colaborador_id}`);
      confirmados.push({
        nome_colaborador: confirmado.nome_colaborador,
        origem: confirmado.__home,
        km: rota?.km ?? confirmado.km_estimado,
        geometria: rota?.geometria || null,
        distancia_real: rota?.distancia_real || false,
      });
    }
    return { os, ponto, confirmados };
  });
  updateMap(osParaMapa);
}

export async function renderProgramacaoEquipe(content, options = {}) {
  injectStyles();
  const supervisao = String(options.supervisao || '').trim();
  const programacaoId = options.programacaoId || null;

  content.innerHTML = `
    <div class="prog-section-title">
      <h4>Organizar Equipe</h4>
      <span class="badge">Etapa B</span>
    </div>
    <div class="peq-shell">
      <div class="peq-os-list" id="peqOsList"><div class="peq-empty">Carregando OS em ATENDER...</div></div>
      <aside class="peq-map-panel">
        <div class="peq-map-head"><h4>Roteiro logístico</h4></div>
        <div class="peq-kpis">
          <div class="peq-kpi"><span>Km total estimado</span><strong id="peqKpiKm">0 km</strong></div>
          <div class="peq-kpi"><span>OS com equipe</span><strong id="peqKpiOs">0</strong></div>
        </div>
        <div class="peq-map"><div id="peqMapEl"></div></div>
      </aside>
    </div>
  `;

  const listEl = content.querySelector('#peqOsList');

  if (!supervisao || !programacaoId) {
    listEl.innerHTML = '<div class="peq-empty">Carregue o contexto (supervisão e data) para organizar a equipe.</div>';
    return;
  }

  async function carregarERenderizar() {
    listEl.innerHTML = '<div class="peq-empty">Carregando OS em ATENDER...</div>';
    try {
      const [osRows, equipeRows] = await Promise.all([loadOsAtender(supervisao), loadEquipeExistente(programacaoId)]);
      if (!osRows.length) {
        listEl.innerHTML = '<div class="peq-empty">Nenhuma OS marcada como ATENDER para esta supervisão. Confirme as OS na etapa A.</div>';
        await ensureMap(content);
        updateMap([]);
        return;
      }

      const pontosPorId = await loadPontos([...new Set(osRows.map((os) => os.ponto_embarque_id).filter(Boolean))]);
      const contexto = await montarContexto(supervisao);

      const confirmadosPorOs = new Map();
      equipeRows.filter((r) => r.confirmado).forEach((r) => {
        const home = contexto.bases.get(normalizeCpf(r.colaborador_id)) || null;
        confirmadosPorOs.set(r.os_id, { ...r, __home: home });
      });
      const colaboradoresConfirmadosEmOutraOs = new Set(equipeRows.filter((r) => r.confirmado).map((r) => r.colaborador_id));

      const osComCandidatos = osRows.map((os) => {
        const ponto = pontoDaOs(os, pontosPorId);
        const confirmadoRow = confirmadosPorOs.get(os.id) || null;
        const candidatos = confirmadoRow ? [] : montarCandidatos(ponto, contexto, colaboradoresConfirmadosEmOutraOs);
        return { os, ponto, confirmadoRow, candidatos };
      });

      listEl.innerHTML = osComCandidatos.map(osCardHtml).join('');

      listEl.querySelectorAll('[data-confirmar]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const card = btn.closest('.peq-os-card');
          const osId = card?.dataset.osId;
          const item = osComCandidatos.find((x) => String(x.os.id) === String(osId));
          const cand = item?.candidatos.find((c) => c.colaboradorId === btn.dataset.confirmar);
          if (!item || !cand) return;
          btn.disabled = true;
          btn.textContent = 'Salvando...';
          try {
            await confirmarCandidato(programacaoId, item.os, cand);
            await carregarERenderizar();
          } catch (error) {
            console.error('[programacao-equipe] confirmar:', error);
            btn.disabled = false;
            btn.textContent = 'Confirmar';
            alert(error.message || 'Não foi possível confirmar o colaborador.');
          }
        });
      });

      listEl.querySelectorAll('[data-remover]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Removendo...';
          try {
            await removerConfirmacao(programacaoId, btn.dataset.remover);
            await carregarERenderizar();
          } catch (error) {
            console.error('[programacao-equipe] remover:', error);
            btn.disabled = false;
            btn.textContent = 'Remover';
            alert(error.message || 'Não foi possível remover a confirmação.');
          }
        });
      });

      await atualizarMapaENativos(content, osComCandidatos, confirmadosPorOs);
    } catch (error) {
      console.error('[programacao-equipe] render:', error);
      listEl.innerHTML = `<div class="peq-empty">${esc(error.message || 'Erro ao montar a equipe.')}</div>`;
    }
  }

  await carregarERenderizar();
}

async function confirmarCandidato(programacaoId, os, cand) {
  const colab = cand.colaborador;
  const payload = {
    programacao_id: programacaoId,
    os_id: os.id,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: colab.nome,
    score: cand.score,
    score_contrato: cand.scoreContrato,
    score_distancia: cand.scoreDistancia,
    score_auditoria: cand.scoreAuditoria,
    km_estimado: cand.km,
    confirmado: true,
  };
  const { error } = await supabase.from('programacao_equipe').upsert(payload, { onConflict: 'programacao_id,os_id,colaborador_id' });
  if (error) throw error;

  // operacional_os_colaboradores é o vínculo OS<->colaborador usado por outras
  // telas (Frotas Roteirização, relatórios) — replica aqui o mesmo padrão
  // "substitui a atribuição da OS" que a distribuição manual já fazia.
  const { error: delErr } = await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id);
  if (delErr) console.warn('[programacao-equipe] falha ao limpar vínculo anterior da OS.', delErr);
  const { error: vinculoErr } = await supabase.from('operacional_os_colaboradores').insert({
    os_id: os.id,
    colaborador_key: cand.colaboradorId,
    colaborador_nome: colab.nome,
    colaborador_cpf: normalizeCpf(colab.cpf) || null,
    distancia_km: cand.km,
    origem_sugestao: 'PROGRAMACAO_ETAPA_B',
  });
  if (vinculoErr) console.warn('[programacao-equipe] falha ao gravar vínculo OS<->colaborador.', vinculoErr);

  const espelho = {
    programacao_id: programacaoId,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: colab.nome,
    cargo: colab.cargo || null,
    coordenacao: colab.coordenacao || null,
    supervisao: colab.supervisao || null,
    disponibilidade: 'OK',
  };
  const { error: espelhoErr } = await supabase.from('programacao_colaboradores').upsert(espelho, { onConflict: 'programacao_id,colaborador_id' });
  if (espelhoErr) console.warn('[programacao-equipe] falha ao espelhar disponibilidade.', espelhoErr);
}

async function removerConfirmacao(programacaoId, equipeRowId) {
  const { data: rows, error: selErr } = await supabase.from('programacao_equipe').select('colaborador_id,os_id').eq('id', equipeRowId).limit(1);
  if (selErr) throw selErr;
  const colaboradorId = rows?.[0]?.colaborador_id;
  const osId = rows?.[0]?.os_id;

  const { error } = await supabase.from('programacao_equipe').delete().eq('id', equipeRowId);
  if (error) throw error;

  if (osId) {
    const { error: vinculoErr } = await supabase.from('operacional_os_colaboradores').delete().eq('os_id', osId);
    if (vinculoErr) console.warn('[programacao-equipe] falha ao remover vínculo OS<->colaborador.', vinculoErr);
  }

  if (colaboradorId) {
    const { error: updErr } = await supabase
      .from('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE' })
      .eq('programacao_id', programacaoId)
      .eq('colaborador_id', colaboradorId);
    if (updErr) console.warn('[programacao-equipe] falha ao reverter disponibilidade.', updErr);
  }
}
