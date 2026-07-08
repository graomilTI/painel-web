// Passo 3 (Programação/Gestor): mapa com as O.S. em ATENDER e a equipe
// confirmada, sobre o mesmo snapshot que já alimenta os cards de
// programacao-equipe.js (exposto via window.__peqbGetEquipeSnapshot).
//
// Regra inegociável (histórico de travamento — commits 4e3f216/7f4df65): o
// Leaflet só é carregado no clique explícito em "Ver mapa do gestor", nunca
// no render inicial da lista de O.S.; a biblioteca é self-hosted
// (assets/vendor/leaflet/), sem CDN externo.
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

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
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

// --- Ícones (SVG inline via L.divIcon — sem novos assets binários) ---
function starSvg(color) {
  return `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
    <polygon points="13,1.5 16.4,9.4 25,10.2 18.5,15.9 20.5,24.4 13,19.8 5.5,24.4 7.5,15.9 1,10.2 9.6,9.4"
      fill="${color}" stroke="#fff" stroke-width="1.2"/>
  </svg>`;
}
function personSvg(color) {
  return `<svg width="24" height="30" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="7" r="6" fill="${color}" stroke="#fff" stroke-width="1.4"/>
    <path d="M2 29c0-7 4.5-11 10-11s10 4 10 11" fill="${color}" stroke="#fff" stroke-width="1.4"/>
  </svg>`;
}
function wheelSvg(color) {
  return `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
    <circle cx="13" cy="13" r="11.5" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="13" cy="13" r="7" fill="none" stroke="#052e16" stroke-width="2"/>
    <circle cx="13" cy="13" r="2" fill="#052e16"/>
    <line x1="13" y1="6.5" x2="13" y2="9.7" stroke="#052e16" stroke-width="2"/>
    <line x1="8.2" y1="16.2" x2="11.1" y2="14.4" stroke="#052e16" stroke-width="2"/>
    <line x1="17.8" y1="16.2" x2="14.9" y2="14.4" stroke="#052e16" stroke-width="2"/>
  </svg>`;
}

function iconOsPendente() { return window.L.divIcon({ className: '', html: starSvg('#eab308'), iconSize: [26, 26], iconAnchor: [13, 13] }); }
function iconOsAtendida() { return window.L.divIcon({ className: '', html: starSvg('#22c55e'), iconSize: [26, 26], iconAnchor: [13, 13] }); }
function iconColabLivre() { return window.L.divIcon({ className: '', html: personSvg('#f97316'), iconSize: [24, 30], iconAnchor: [12, 28] }); }
function iconColabVinculado() { return window.L.divIcon({ className: '', html: personSvg('#22c55e'), iconSize: [24, 30], iconAnchor: [12, 28] }); }
function iconMotoristaFrota() { return window.L.divIcon({ className: '', html: wheelSvg('#2563eb'), iconSize: [26, 26], iconAnchor: [13, 13] }); }

function injectStyles() {
  if (document.getElementById('progMapaGestorStyles')) return;
  const style = document.createElement('style');
  style.id = 'progMapaGestorStyles';
  style.textContent = `
    #peqbMapBand{margin-bottom:12px}
    .pmg-wrap{border:1px solid rgba(148,163,184,.14);border-radius:18px;background:rgba(2,6,23,.36);overflow:hidden}
    .pmg-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.14)}
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
  // O card de Programar O.S. é re-renderizado inteiro a cada "Carregar" —
  // isso troca #peqbMapEl2 por um nó novo, deixando o mapa Leaflet antigo
  // (se existir) preso a um elemento desanexado do DOM. Detecta e recria.
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

// Fase 1 (mapa base): posição do colaborador confirmado vem só de
// colaborador_cruzamento (endereço base) — a cadeia de hospedagem/alojamento
// entra depois (ver resolverPosicaoColaborador em programacao-mapa-hospedagem.js).
async function carregarPosicoesConfirmados(colaboradorIds) {
  const cpfs = [...new Set(colaboradorIds.filter((id) => /^\d+$/.test(String(id))))];
  if (!cpfs.length) return new Map();
  try {
    const { data, error } = await supabase
      .from('colaborador_cruzamento')
      .select('cpf,latitude,longitude,veiculo_id')
      .in('cpf', cpfs);
    if (error) throw error;
    const mapa = new Map();
    (data || []).forEach((r) => mapa.set(String(r.cpf), r));
    return mapa;
  } catch (error) {
    console.warn('[mapa-gestor] posições de colaboradores indisponíveis', error);
    return new Map();
  }
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
  const posicoes = await carregarPosicoesConfirmados([...idsConfirmados]);

  const L = window.L;
  const bounds = [];

  osComCandidatosAtual.forEach((item) => {
    const equipeRows = item.equipeRows || [];
    const temEquipe = equipeRows.length > 0;

    if (item.ponto && hasGeo(item.ponto.lat, item.ponto.lng)) {
      const marker = L.marker([item.ponto.lat, item.ponto.lng], { icon: temEquipe ? iconOsAtendida() : iconOsPendente() });
      marker.bindTooltip(`OS ${esc(item.os.numero_os || '-')} · ${esc(item.os.cliente || '-')}${temEquipe ? ` · ${equipeRows.length} colaborador(es)` : ' · sem equipe'}`, { className: 'peqb-tt' });
      mapState.layerOs.addLayer(marker);
      bounds.push([item.ponto.lat, item.ponto.lng]);
    }

    // Confirmados: pessoa verde, ou volante azul se tiver frota vinculada.
    equipeRows.forEach((r) => {
      const pos = posicoes.get(String(r.colaborador_id));
      if (!pos || !hasGeo(pos.latitude, pos.longitude)) return;
      const isMotorista = !!pos.veiculo_id;
      const marker = L.marker([Number(pos.latitude), Number(pos.longitude)], { icon: isMotorista ? iconMotoristaFrota() : iconColabVinculado() });
      marker.bindTooltip(`${esc(r.nome_colaborador || 'Colaborador')} · OS ${esc(item.os.numero_os || '-')}${isMotorista ? ' · frota' : ''}`, { className: 'peqb-tt' });
      mapState.layerColab.addLayer(marker);
      bounds.push([Number(pos.latitude), Number(pos.longitude)]);
    });

    // Candidatos ainda não confirmados nesta O.S. (já vêm com lat/lng da RPC
    // de candidatos — sem consulta extra): pessoa laranja.
    const idsJaConfirmados = new Set(equipeRows.map((r) => String(r.colaborador_id)));
    (item.candidatos || []).forEach((cand) => {
      const id = String(cand.colaboradorId || '');
      if (!id || idsJaConfirmados.has(id) || !hasGeo(cand.lat, cand.lng)) return;
      const marker = L.marker([Number(cand.lat), Number(cand.lng)], { icon: iconColabLivre() });
      marker.bindTooltip(`${esc(cand.nome || 'Colaborador')} · candidato OS ${esc(item.os.numero_os || '-')}`, { className: 'peqb-tt' });
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
        <span><i style="background:#eab308"></i>OS pendente</span>
        <span><i style="background:#22c55e"></i>OS/colaborador atendido</span>
        <span><i style="background:#f97316"></i>Colaborador livre</span>
        <span><i style="background:#2563eb"></i>Motorista c/ frota</span>
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
