// Programação/Gestor: mapa com O.S., colaboradores, motoristas e hospedagem.
// Usa o snapshot exposto por programacao-equipe.js (window.__peqbGetEquipeSnapshot).
// Leaflet continua sendo carregado só quando o gestor abre o mapa.
import { supabase } from './supabaseClient.js';

const LEAFLET_CSS_ID = 'leaflet-css-mapa-gestor';
const LEAFLET_JS_ID = 'leaflet-js-mapa-gestor';
const LEAFLET_CSS_HREF = './assets/vendor/leaflet/leaflet.css';
const LEAFLET_JS_SRC = './assets/vendor/leaflet/leaflet.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function hasGeo(lat, lng) { return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)); }
function cpfNorm(value) { return String(value || '').replace(/\D/g, ''); }

// Mesmo critério de programacao-equipe.js (isCargoBloqueado) — duplicado aqui
// porque colaborador_cruzamento (fonte das posições confirmadas no mapa) não
// tem coluna cargo; o cargo do confirmado vem de programacao_colaboradores.
function isCargoBloqueado(value) {
  const cargo = normalizeText(value);
  return cargo.includes('SUPERVISOR')
    || cargo.includes('AUDITOR')
    || cargo.includes('COORDENADOR')
    || cargo.includes('COORDENADORA')
    || cargo.includes('ADMINISTRATIVO')
    || cargo === 'COORDENACAO'
    || cargo.startsWith('COORDENACAO ');
}

async function carregarCargosConfirmados(colaboradorIds, programacaoIds) {
  if (!colaboradorIds.length || !programacaoIds.length) return new Map();
  try {
    const { data, error } = await supabase
      .from('programacao_colaboradores')
      .select('colaborador_id,cargo')
      .in('programacao_id', programacaoIds)
      .in('colaborador_id', colaboradorIds);
    if (error) throw error;
    return new Map((data || []).map((r) => [String(r.colaborador_id), r.cargo]));
  } catch (error) {
    console.warn('[mapa-gestor] cargos confirmados indisponíveis', error);
    return new Map();
  }
}

function tipoLetter(label) {
  const n = normalizeText(label);
  if (n.includes('INTERMITENTE')) return 'I';
  if (n.includes('DIARISTA')) return 'D';
  return 'E';
}

function loadCss(href, id) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src, id) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function ensureLeaflet() {
  if (window.L) return true;
  try {
    loadCss(LEAFLET_CSS_HREF, LEAFLET_CSS_ID);
    await loadScript(LEAFLET_JS_SRC, LEAFLET_JS_ID);
    return !!window.L;
  } catch {
    return false;
  }
}

// --- Ícones SVG inline ---
function starSvg(color) {
  return `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
    <polygon points="13,1.5 16.4,9.4 25,10.2 18.5,15.9 20.5,24.4 13,19.8 5.5,24.4 7.5,15.9 1,10.2 9.6,9.4" fill="${color}" stroke="#fff" stroke-width="1.2"/>
  </svg>`;
}
function personSvg(color, letter) {
  return `<svg width="28" height="34" viewBox="0 0 28 34" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="8" r="6.4" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <path d="M3 33c0-8 5-12.5 11-12.5S25 25 25 33" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="21" cy="22" r="6" fill="#020617" stroke="#fff" stroke-width="1"/>
    <text x="21" y="25.7" text-anchor="middle" font-size="9" font-weight="900" fill="#fff" font-family="Arial,sans-serif">${letter}</text>
  </svg>`;
}
function carSvg(color) {
  return `<svg width="30" height="24" viewBox="0 0 30 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 13l2.4-6.2C8.9 5.7 10 5 11.2 5h7.6c1.2 0 2.3.7 2.8 1.8L24 13" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M4.5 12.5h21c1.4 0 2.5 1.1 2.5 2.5v4H2v-4c0-1.4 1.1-2.5 2.5-2.5Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="8" cy="19" r="2.6" fill="#020617" stroke="#fff" stroke-width="1"/>
    <circle cx="22" cy="19" r="2.6" fill="#020617" stroke="#fff" stroke-width="1"/>
  </svg>`;
}

function iconOsPendente() { return window.L.divIcon({ className: '', html: starSvg('#eab308'), iconSize: [26, 26], iconAnchor: [13, 13] }); }
function iconOsAtendida() { return window.L.divIcon({ className: '', html: starSvg('#22c55e'), iconSize: [26, 26], iconAnchor: [13, 13] }); }
function iconColabLivre(tipoLabel) { return window.L.divIcon({ className: '', html: personSvg('#eab308', tipoLetter(tipoLabel)), iconSize: [28, 34], iconAnchor: [14, 32] }); }
function iconColabVinculado(tipoLabel) { return window.L.divIcon({ className: '', html: personSvg('#22c55e', tipoLetter(tipoLabel)), iconSize: [28, 34], iconAnchor: [14, 32] }); }
function iconMotoristaLivre() { return window.L.divIcon({ className: '', html: carSvg('#eab308'), iconSize: [30, 24], iconAnchor: [15, 20] }); }
function iconMotoristaVinculado() { return window.L.divIcon({ className: '', html: carSvg('#22c55e'), iconSize: [30, 24], iconAnchor: [15, 20] }); }

function injectStyles() {
  if (document.getElementById('progMapaGestorStyles')) return;
  const style = document.createElement('style');
  style.id = 'progMapaGestorStyles';
  style.textContent = `
    #peqbMapBand{margin-bottom:12px}
    .pmg-wrap{border:1px solid rgba(148,163,184,.14);border-radius:18px;background:rgba(2,6,23,.36);overflow:hidden}
    .pmg-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.14);flex-wrap:wrap}
    .pmg-head strong{color:#f8fafc;font-size:12.5px}
    .pmg-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:10.5px;color:#9fb7aa}
    .pmg-legend i{display:inline-block;width:9px;height:9px;border-radius:999px;margin-right:4px;vertical-align:middle}
    .pmg-map{height:min(520px,calc(100vh - 340px));min-height:320px;position:relative}
    #peqbMapEl2{position:absolute;inset:0}
    .pmg-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;text-align:center;padding:20px;font-size:12.5px}
    .leaflet-tooltip.peqb-tt{background:rgba(2,6,23,.92)!important;border:1px solid rgba(34,197,94,.35)!important;color:#f8fafc!important;border-radius:8px!important;font-size:11px!important;padding:4px 8px!important;font-weight:700!important;box-shadow:none!important}
    .leaflet-control-attribution{background:rgba(2,6,23,.65)!important;color:#6b7280!important;font-size:10px!important}
  `;
  document.head.appendChild(style);
}

let mapState = null;
function criarMapState() { return { map: null, mountEl: null, layerOs: null, layerColab: null, ready: false }; }

async function garantirMapa(mountEl) {
  if (mapState?.ready && mapState.mountEl === mountEl && document.body.contains(mountEl)) return mapState.map;
  if (mapState?.map) { try { mapState.map.remove(); } catch {} }
  const ok = await ensureLeaflet();
  if (!ok || !window.L) return null;
  const L = window.L;
  mapState = criarMapState();
  mapState.mountEl = mountEl;
  mapState.map = L.map(mountEl, { zoomControl: true, scrollWheelZoom: true, center: [-14.235, -51.925], zoom: 4 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OSM &copy; CARTO',
    subdomains: 'abcd',
  }).addTo(mapState.map);
  mapState.layerOs = L.layerGroup().addTo(mapState.map);
  mapState.layerColab = L.layerGroup().addTo(mapState.map);
  mapState.ready = true;
  return mapState.map;
}

function latLngFrom(row) {
  if (!row) return null;
  const lat = row.latitude ?? row.lat ?? row.endereco_latitude ?? row.localizacao_latitude ?? row.geo_latitude;
  const lng = row.longitude ?? row.lng ?? row.lon ?? row.endereco_longitude ?? row.localizacao_longitude ?? row.geo_longitude;
  if (!hasGeo(lat, lng)) return null;
  return { latitude: Number(lat), longitude: Number(lng) };
}

function programaIdsFromSnapshot(snapshot) {
  const ids = new Set();
  if (snapshot?.programacaoId) ids.add(snapshot.programacaoId);
  (snapshot?.osComCandidatosAtual || []).forEach((item) => {
    (item.equipeRows || []).forEach((r) => { if (r.programacao_id) ids.add(r.programacao_id); });
    const pid = snapshot?.programacaoIdParaOs?.(item.os);
    if (pid) ids.add(pid);
  });
  return [...ids].filter(Boolean);
}

async function carregarEstadiasHospedagem(snapshot) {
  const programacaoIds = programaIdsFromSnapshot(snapshot);
  if (!programacaoIds.length) return new Map();
  try {
    const { data: estadias, error } = await supabase
      .from('programacao_estadia')
      .select('*')
      .in('programacao_id', programacaoIds);
    if (error) throw error;

    const hotelIds = [...new Set((estadias || []).map((e) => e.hotel_id).filter(Boolean))];
    const alojIds = [...new Set((estadias || []).map((e) => e.alojamento_id).filter(Boolean))];
    const [hoteisRes, alojRes] = await Promise.all([
      hotelIds.length ? supabase.from('hospedagem_hoteis').select('*').in('id', hotelIds) : Promise.resolve({ data: [] }),
      alojIds.length ? supabase.from('hospedagem_alojamentos').select('*').in('id', alojIds) : Promise.resolve({ data: [] }),
    ]);
    if (hoteisRes.error) console.warn('[mapa-gestor] hotéis indisponíveis', hoteisRes.error);
    if (alojRes.error) console.warn('[mapa-gestor] alojamentos indisponíveis', alojRes.error);

    const hoteis = new Map((hoteisRes.data || []).map((h) => [String(h.id), h]));
    const alojamentos = new Map((alojRes.data || []).map((a) => [String(a.id), a]));
    const mapa = new Map();

    (estadias || []).forEach((est) => {
      const tipo = normalizeText(est.tipo_estadia);
      let local = null;
      let origem = '';
      if (tipo === 'HOTEL' && est.hotel_id) {
        local = hoteis.get(String(est.hotel_id));
        origem = local?.nome || local?.nome_hotel || est.nome_hotel || 'Hotel';
      } else if (tipo === 'ALOJAMENTO' && est.alojamento_id) {
        local = alojamentos.get(String(est.alojamento_id));
        origem = local?.nome || est.alojamento_nome || 'Alojamento';
      }
      const geo = latLngFrom(local);
      if (!geo) return;
      const value = { ...geo, _origemHospedagem: origem, _tipoHospedagem: tipo };
      const id = String(est.colaborador_id || '');
      mapa.set(`${est.programacao_id}|${id}`, value);
      if (!mapa.has(id)) mapa.set(id, value);
    });
    return mapa;
  } catch (error) {
    console.warn('[mapa-gestor] estadias/hospedagem indisponíveis', error);
    return new Map();
  }
}

async function carregarBaseColaboradores(colaboradorIds) {
  const cpfs = [...new Set(colaboradorIds.filter((id) => /^\d+$/.test(String(id))))];
  if (!cpfs.length) return new Map();
  try {
    const { data, error } = await supabase
      .from('colaborador_cruzamento')
      .select('*')
      .in('cpf', cpfs);
    if (error) throw error;
    const mapa = new Map();
    (data || []).forEach((r) => {
      const id = cpfNorm(r.cpf);
      const geo = latLngFrom(r);
      if (!id || !geo) return;
      mapa.set(id, { ...r, latitude: geo.latitude, longitude: geo.longitude });
    });
    return mapa;
  } catch (error) {
    console.warn('[mapa-gestor] posições de colaboradores indisponíveis', error);
    return new Map();
  }
}

async function carregarPosicoesConfirmados(colaboradorIds, snapshot) {
  const [base, hospedagem] = await Promise.all([
    carregarBaseColaboradores(colaboradorIds),
    carregarEstadiasHospedagem(snapshot),
  ]);
  hospedagem.forEach((pos, key) => {
    const id = String(key).includes('|') ? String(key).split('|').pop() : String(key);
    const basePos = base.get(id) || {};
    base.set(key, { ...basePos, ...pos });
  });
  return base;
}

function tipoConfirmado(row, item, basePos) {
  const id = String(row?.colaborador_id || '');
  const cand = (item?.candidatos || []).find((c) => String(c.colaboradorId) === id)
    || (item?.colaboradoresRegional || []).find((c) => String(c.colaboradorId) === id);
  return cand?.tipoLabel || basePos?.tipo_contrato || row?.tipo_contrato || 'Efetivo';
}

async function renderizarMapa(band, { silent = false } = {}) {
  const snapshot = window.__peqbGetEquipeSnapshot?.();
  const msgEl = band.querySelector('#pmgMsg');
  if (!snapshot || !snapshot.osComCandidatosAtual) {
    if (msgEl) msgEl.textContent = 'Carregue a lista de O.S. primeiro.';
    return;
  }
  const mountEl = band.querySelector('#peqbMapEl2');
  const emptyEl = band.querySelector('#pmgEmpty');
  if (!silent && msgEl) msgEl.textContent = 'Carregando mapa...';
  const map = await garantirMapa(mountEl);
  if (!map) {
    if (msgEl) msgEl.textContent = 'Não foi possível carregar o mapa (Leaflet indisponível).';
    return;
  }
  if (msgEl) msgEl.textContent = '';
  mapState.layerOs.clearLayers();
  mapState.layerColab.clearLayers();

  const { osComCandidatosAtual } = snapshot;
  const idsConfirmados = new Set();
  osComCandidatosAtual.forEach((item) => (item.equipeRows || []).forEach((r) => idsConfirmados.add(String(r.colaborador_id))));
  const programacaoIds = programaIdsFromSnapshot(snapshot);
  const [posicoes, cargosConfirmados] = await Promise.all([
    carregarPosicoesConfirmados([...idsConfirmados], snapshot),
    carregarCargosConfirmados([...idsConfirmados], programacaoIds),
  ]);

  const L = window.L;
  const bounds = [];

  osComCandidatosAtual.forEach((item) => {
    // Confirmado com cargo bloqueado (auditor/supervisor/coordenador) nunca
    // aparece no mapa — mesmo já tendo sido vinculado antes do filtro na
    // origem dos candidatos existir (pedido do usuário, 2026-07-17).
    const equipeRows = (item.equipeRows || []).filter((r) => !isCargoBloqueado(cargosConfirmados.get(String(r.colaborador_id))));
    const temEquipe = equipeRows.length > 0;

    if (item.ponto && hasGeo(item.ponto.lat, item.ponto.lng)) {
      const marker = L.marker([item.ponto.lat, item.ponto.lng], { icon: temEquipe ? iconOsAtendida() : iconOsPendente() });
      marker.bindTooltip(`OS ${esc(item.os.numero_os || '-')} · ${esc(item.os.cliente || '-')}${temEquipe ? ` · ${equipeRows.length} colaborador(es)` : ' · sem equipe'}`, { className: 'peqb-tt' });
      mapState.layerOs.addLayer(marker);
      bounds.push([item.ponto.lat, item.ponto.lng]);
    }

    equipeRows.forEach((r) => {
      const id = String(r.colaborador_id || '');
      const key = `${r.programacao_id || snapshot.programacaoIdParaOs?.(item.os) || ''}|${id}`;
      const pos = posicoes.get(key) || posicoes.get(id);
      if (!pos || !hasGeo(pos.latitude, pos.longitude)) return;
      const tipo = tipoConfirmado(r, item, pos);
      const isMot = !!(pos.veiculo_id || pos.veiculo_placa || pos.placa_veiculo);
      const icon = isMot ? iconMotoristaVinculado() : iconColabVinculado(tipo);
      const origem = pos._origemHospedagem ? ` · ${pos._origemHospedagem}` : '';
      const marker = L.marker([Number(pos.latitude), Number(pos.longitude)], { icon });
      marker.bindTooltip(`${esc(r.nome_colaborador || 'Colaborador')} · OS ${esc(item.os.numero_os || '-')}${isMot ? ' · motorista' : ` · ${esc(tipo)}`}${origem}`, { className: 'peqb-tt' });
      mapState.layerColab.addLayer(marker);
      bounds.push([Number(pos.latitude), Number(pos.longitude)]);
    });

    const idsJaConfirmados = new Set(equipeRows.map((r) => String(r.colaborador_id)));
    (item.candidatos || []).forEach((cand) => {
      const id = String(cand.colaboradorId || '');
      if (!id || idsJaConfirmados.has(id) || !hasGeo(cand.lat, cand.lng) || isCargoBloqueado(cand.cargo)) return;
      const isMot = !!(cand.veiculoId || cand.veiculoPlaca);
      const marker = L.marker([Number(cand.lat), Number(cand.lng)], { icon: isMot ? iconMotoristaLivre() : iconColabLivre(cand.tipoLabel) });
      marker.bindTooltip(`${esc(cand.nome || 'Colaborador')} · candidato OS ${esc(item.os.numero_os || '-')}${isMot ? ' · motorista' : ` · ${esc(cand.tipoLabel || 'Efetivo')}`}`, { className: 'peqb-tt' });
      mapState.layerColab.addLayer(marker);
      bounds.push([Number(cand.lat), Number(cand.lng)]);
    });
  });

  if (emptyEl) emptyEl.style.display = bounds.length ? 'none' : 'flex';
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
}

function bandHtml() {
  return `<div class="pmg-wrap">
    <div class="pmg-head">
      <strong>Mapa do gestor</strong>
      <div class="pmg-legend">
        <span><i style="background:#eab308"></i>OS/colaborador livre</span>
        <span><i style="background:#22c55e"></i>Associado</span>
        <span><i style="background:#eab308;border-radius:3px"></i>Motorista livre</span>
        <span><i style="background:#22c55e;border-radius:3px"></i>Motorista associado</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="pmgMsg" style="font-size:11px;color:#9fb7aa"></span>
        <button type="button" class="peqb-btn" id="pmgAtualizar">🔄 Atualizar</button>
      </div>
    </div>
    <div class="pmg-map">
      <div id="peqbMapEl2"></div>
      <div id="pmgEmpty" class="pmg-empty" style="display:none">Nenhuma O.S./colaborador com coordenadas para mostrar ainda.</div>
    </div>
  </div>`;
}

function wireBand(band) {
  if (band.dataset.pmgWired === '1') return;
  band.dataset.pmgWired = '1';
  band.innerHTML = bandHtml();
  band.querySelector('#pmgAtualizar')?.addEventListener('click', () => renderizarMapa(band));
  renderizarMapa(band);
}

function wireToggleButton() {
  document.body.addEventListener('click', (event) => {
    const btn = event.target.closest('#peqbVerMapa');
    if (!btn) return;
    const band = document.getElementById('peqbMapBand');
    if (!band) return;
    band.hidden = !band.hidden;
    if (!band.hidden) wireBand(band);
  });
}

function boot() {
  injectStyles();
  wireToggleButton();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
