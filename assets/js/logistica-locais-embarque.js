// Aba "Locais de embarque" da página O.S da Logística: mapa com todos os
// locais de operacional_pontos_embarque que têm coordenadas + lista dos que
// estão sem coordenadas (pra completar o cadastro). Montada sob demanda por
// logistica-os-entry.js.
import { supabase } from './supabaseClient.js';

const LEAFLET_CSS_HREF = './assets/vendor/leaflet/leaflet.css';
const LEAFLET_JS_SRC = './assets/vendor/leaflet/leaflet.js';
const PAGE = 1000; // limite padrão do PostgREST por requisição

let root = null;
let map = null;
let layer = null;
let locais = [];
let carregado = false;
let carregando = false;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const style = document.createElement('style');
style.id = 'los-locais-style';
style.textContent = `
  #logisticaOsLocais { padding:14px 16px; }
  #logisticaOsLocais .lc-head { display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px; }
  #logisticaOsLocais .lc-head h3 { margin:0 0 2px;font-size:16px; }
  #logisticaOsLocais .lc-kpis { display:flex;gap:8px;flex-wrap:wrap; }
  #logisticaOsLocais .lc-kpi { padding:5px 10px;border:1px solid rgba(22,215,144,.24);border-radius:9px;background:rgba(22,215,144,.08);color:#91aa9d;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.04em; }
  #logisticaOsLocais .lc-kpi strong { display:block;color:#74eeb8;font-size:16px;line-height:1.1; }
  #logisticaOsLocais .lc-kpi.warn { border-color:rgba(250,204,21,.3);background:rgba(250,204,21,.08); }
  #logisticaOsLocais .lc-kpi.warn strong { color:#fde68a; }
  #logisticaOsLocais .lc-grid { display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:12px;align-items:start; }
  #logisticaOsLocais .lc-map { height:calc(100vh - 260px);min-height:420px;border-radius:14px;border:1px solid rgba(52,211,153,.16);overflow:hidden;background:#07110d; }
  #logisticaOsLocais .lc-side { display:flex;flex-direction:column;height:calc(100vh - 260px);min-height:420px;border:1px solid rgba(52,211,153,.16);border-radius:14px;background:rgba(2,6,23,.25);overflow:hidden; }
  #logisticaOsLocais .lc-side-head { padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.12); }
  #logisticaOsLocais .lc-side-head b { color:#fde68a;font-size:12px; }
  #logisticaOsLocais .lc-side-head input { width:100%;margin-top:8px; }
  #logisticaOsLocais .lc-list { overflow:auto;flex:1; }
  #logisticaOsLocais .lc-item { padding:8px 12px;border-bottom:1px solid rgba(148,163,184,.1); }
  #logisticaOsLocais .lc-item strong { display:block;color:#f1fbf6;font-size:12px;line-height:1.25; }
  #logisticaOsLocais .lc-item span { color:#748a7f;font-size:10px; }
  #logisticaOsLocais .lc-empty { padding:18px 12px;color:#6b7280;font-size:12px; }
  #logisticaOsLocais .leaflet-tooltip.lc-tt { background:rgba(2,6,23,.92);border:1px solid rgba(34,197,94,.35);color:#f8fafc;border-radius:8px;font-size:11px;font-weight:700; }
  @media(max-width:1000px){ #logisticaOsLocais .lc-grid{grid-template-columns:1fr} #logisticaOsLocais .lc-side{height:360px} }
`;
document.head.appendChild(style);

async function ensureLeaflet() {
  if (window.L) return true;
  try {
    if (!document.getElementById('losLeafletCss')) {
      const link = document.createElement('link');
      link.id = 'losLeafletCss'; link.rel = 'stylesheet'; link.href = LEAFLET_CSS_HREF;
      document.head.appendChild(link);
    }
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LEAFLET_JS_SRC; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return !!window.L;
  } catch { return false; }
}

function temCoord(p) {
  return p.latitude != null && p.longitude != null
    && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
    && !(Number(p.latitude) === 0 && Number(p.longitude) === 0);
}

async function buscarLocais() {
  const todos = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('operacional_pontos_embarque')
      .select('id,nome_local,tipo_local,cidade,uf,latitude,longitude')
      .eq('ativo', true)
      .order('uf').order('cidade').order('nome_local')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return todos;
}

function renderShell() {
  root.innerHTML = `
    <div class="lc-head">
      <div><h3>Locais de embarque</h3><p class="muted">Todos os locais cadastrados em Operacional com coordenadas no mapa; à direita, os que ainda estão sem coordenadas.</p></div>
      <div class="lc-kpis">
        <div class="lc-kpi">No mapa<strong id="lcKpiMapa">-</strong></div>
        <div class="lc-kpi warn">Sem coordenadas<strong id="lcKpiSem">-</strong></div>
        <div class="lc-kpi">Total<strong id="lcKpiTotal">-</strong></div>
      </div>
    </div>
    <div class="lc-grid">
      <div class="lc-map" id="lcMap"></div>
      <aside class="lc-side">
        <div class="lc-side-head"><b>Sem coordenadas</b><input class="log-input" id="lcBusca" type="search" placeholder="Buscar local ou cidade" /></div>
        <div class="lc-list" id="lcSemLista"><div class="lc-empty">Carregando...</div></div>
      </aside>
    </div>`;
  root.querySelector('#lcBusca').addEventListener('input', renderSemCoord);
}

function renderMapa() {
  const L = window.L;
  const comCoord = locais.filter(temCoord);
  if (!map) {
    map = L.map(root.querySelector('#lcMap'), { preferCanvas: true, center: [-14.235, -51.925], zoom: 4 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  layer.clearLayers();
  const bounds = [];
  comCoord.forEach((p) => {
    const ll = [Number(p.latitude), Number(p.longitude)];
    L.circleMarker(ll, { radius: 5, weight: 1, color: '#fff', fillColor: '#22e58a', fillOpacity: 0.9 })
      .bindTooltip(`${esc(p.nome_local)}<br><span style="font-weight:400">${esc(p.cidade)} - ${esc(p.uf)}${p.tipo_local ? ' · ' + esc(p.tipo_local) : ''}</span>`, { className: 'lc-tt' })
      .addTo(layer);
    bounds.push(ll);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 9 });
  requestAnimationFrame(() => map.invalidateSize());
}

function renderSemCoord() {
  const q = norm(root.querySelector('#lcBusca')?.value);
  const sem = locais.filter((p) => !temCoord(p))
    .filter((p) => !q || norm(`${p.nome_local} ${p.cidade} ${p.uf}`).includes(q));
  const box = root.querySelector('#lcSemLista');
  box.innerHTML = sem.length
    ? sem.map((p) => `<div class="lc-item"><strong>${esc(p.nome_local)}</strong><span>${esc(p.cidade)} - ${esc(p.uf)}${p.tipo_local ? ' · ' + esc(p.tipo_local) : ''}</span></div>`).join('')
    : `<div class="lc-empty">${q ? 'Nenhum resultado.' : 'Todos os locais têm coordenadas.'}</div>`;
}

export async function mountLocaisEmbarque(el) {
  root = el;
  if (carregando) return;
  if (carregado) { requestAnimationFrame(() => map?.invalidateSize()); return; }
  carregando = true;
  renderShell();
  try {
    const [ok, dados] = await Promise.all([ensureLeaflet(), buscarLocais()]);
    locais = dados;
    const sem = locais.filter((p) => !temCoord(p)).length;
    root.querySelector('#lcKpiTotal').textContent = locais.length.toLocaleString('pt-BR');
    root.querySelector('#lcKpiSem').textContent = sem.toLocaleString('pt-BR');
    root.querySelector('#lcKpiMapa').textContent = (locais.length - sem).toLocaleString('pt-BR');
    renderSemCoord();
    if (ok) renderMapa();
    else root.querySelector('#lcMap').innerHTML = '<div class="lc-empty">Não foi possível carregar o mapa.</div>';
    carregado = true;
  } catch (error) {
    console.error('[locais-embarque]', error);
    root.querySelector('#lcSemLista').innerHTML = `<div class="lc-empty">Erro ao carregar: ${esc(error?.message || error)}</div>`;
  } finally {
    carregando = false;
  }
}
