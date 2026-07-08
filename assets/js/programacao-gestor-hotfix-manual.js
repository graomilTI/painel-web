import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';
import { TODAS_SUPERVISOES } from './programacao-gestor-filtro-fix.js';

const S = { poolKey: '', pool: [], map: null, mapEl: null, osLayer: null, colabLayer: null, markers: [] };
const CSS_ID = 'pgcHotfixManualFinalCss';
const LEAFLET_CSS_ID = 'leaflet-css-pgc-manual';
const LEAFLET_JS_ID = 'leaflet-js-pgc-manual';
const LEAFLET_CSS_HREF = './assets/vendor/leaflet/leaflet.css';
const LEAFLET_JS_SRC = './assets/vendor/leaflet/leaflet.js';

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const cpf = (v) => String(v || '').replace(/\D/g, '');
const onlyPlate = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const todayIso = () => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const hasGeo = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

function tipoLetter(label) { const n = norm(label); if (n.includes('INTERMITENTE')) return 'I'; if (n.includes('DIARISTA')) return 'D'; return 'E'; }
function isMotorista(row) { return !!(row?.veiculoId || row?.veiculo_id || row?.veiculoPlaca || row?.veiculo_placa || row?.placa_veiculo); }
function tipoLabel(row) { return row?.tipoLabel || row?.tipo_contrato || row?.tipo || 'Efetivo'; }
function latLngFrom(row) {
  const lat = row?.latitude ?? row?.lat ?? row?.colab_lat ?? row?.endereco_latitude ?? row?.localizacao_latitude;
  const lng = row?.longitude ?? row?.lng ?? row?.lon ?? row?.colab_lng ?? row?.endereco_longitude ?? row?.localizacao_longitude;
  return hasGeo(lat, lng) ? { latitude: Number(lat), longitude: Number(lng) } : null;
}
function cidadeFromEmbarque(embarque) { return (/^[A-Z]{2}\s*[–-]\s*([^(]+)/i.exec(String(embarque || '').trim()) || [,''])[1].trim(); }

function injectCss() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = `
    #pgcPane1 .prog-section-title{margin-bottom:6px!important}#pgcPane1 .peqb-block-head{display:none!important}
    #pgcPane1 .peqb-os-list{gap:0!important;max-height:none!important;overflow:hidden!important;padding-right:0!important;border:1px solid rgba(52,211,153,.16);border-radius:10px;background:rgba(2,6,23,.12)}
    #pgcPane1 .peqs-row{display:block!important;border-radius:0!important;padding:0!important;background:transparent!important;border:0!important;border-top:1px solid rgba(148,163,184,.10)!important;box-shadow:none!important;min-height:0!important}
    #pgcPane1 .peqs-row:first-child{border-top:0!important}
    #pgcPane1 .peqs-row .peqb-os2-left{display:grid!important;grid-template-columns:minmax(220px,1.45fr) minmax(360px,2.3fr) 72px 62px 220px!important;gap:0!important;align-items:center!important;padding:0!important;border:0!important;background:transparent!important;min-height:34px!important}
    #pgcPane1 .peqs-row .peqb-os2-kpis{display:contents!important}
    #pgcPane1 .peqs-row .peqb-os2-kpi{min-width:0!important;margin:0!important;padding:6px 9px!important;border-radius:0!important;border:0!important;border-right:1px solid rgba(148,163,184,.10)!important;background:transparent!important;box-shadow:none!important;height:34px!important;box-sizing:border-box;display:flex!important;align-items:center!important}
    #pgcPane1 .peqs-row .peqb-os2-kpi span{display:none!important}
    #pgcPane1 .peqs-row .peqb-os2-kpi strong{display:block!important;width:100%!important;font-size:12px!important;line-height:1.05!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;color:#f8fafc!important;margin:0!important}
    #pgcPane1 .peqs-row .peqb-os2-kpi strong *{display:inline!important;white-space:nowrap!important}#pgcPane1 .peqs-row .peqb-os2-kpi strong br{display:none!important}
    #pgcPane1 .peqs-row .peqb-os2-tagsrow{margin:0!important;height:34px!important;display:flex!important;align-items:center!important;justify-content:center!important;background:transparent!important;padding:2px 6px!important;box-sizing:border-box}
    #pgcPane1 .peqs-row .peqb-status-strip{margin:0!important;gap:7px!important;flex-wrap:nowrap!important}#pgcPane1 .peqs-row .peqb-st{height:28px!important;min-width:32px!important;width:32px!important;border-radius:999px!important;font-size:11px!important;padding:0!important}
    #pgcPane2 #peqbAutoPreencher,#pgcPane2 #peqbSugerirCaronas,#pgcPane2 #peqbCaronasMsg,#pgcPane2 .peqb-legend,#pgcPane2 [data-confirmar],#pgcPane2 .peqb-cand,#pgcPane2 .peqb-cand-more,#pgcPane2 .peqb-cand-list,#pgcPane2 [data-outros],#pgcPane2 .peqb-row-btn.hotel,#pgcPane2 .peqb-cand-flag.hotel{display:none!important}
    #pgcPane2 .peqb-toolbar::after{content:'Vinculação manual: arraste no mapa ou na lista lateral.';font-size:11px;color:#9fb7aa;align-self:center}#pgcPane2 #peqbMapBand{display:block!important;margin:0 0 12px!important}
    .pmg-map{height:min(560px,calc(100vh - 300px))!important;min-height:360px!important}.pmg-drag-icon{cursor:grab!important}.leaflet-dragging .pmg-drag-icon{cursor:grabbing!important}.pmg-help{font-size:10.5px;color:#9fb7aa}
    #pgcPane3 .prog-section-title{margin-bottom:6px!important}.pgc-desp-head,#pgcPane3 .peqd-card{display:grid!important;grid-template-columns:minmax(160px,1fr) minmax(330px,1.75fr) minmax(170px,.8fr) minmax(340px,1.5fr) minmax(220px,.9fr);gap:0}.pgc-desp-head{border:1px solid rgba(148,163,184,.22);border-radius:10px 10px 0 0;overflow:hidden;background:rgba(255,255,255,.94);color:#020617;font-size:12px;font-weight:950;text-transform:uppercase}.pgc-desp-head span{padding:9px 8px;text-align:center;border-right:1px solid rgba(15,23,42,.16)}#pgcPane3 .peqd-list{gap:0!important;overflow:hidden;border:1px solid rgba(52,211,153,.16);border-top:0;border-radius:0 0 10px 10px}#pgcPane3 .peqd-card{align-items:center;padding:0!important;border-radius:0!important;border:0!important;border-top:1px solid rgba(148,163,184,.10)!important;background:rgba(2,6,23,.18)!important}#pgcPane3 .peqd-head,#pgcPane3 .peqd-sec{margin:0!important;padding:6px 8px!important;border-top:0!important;border-right:1px solid rgba(148,163,184,.10);min-height:38px;box-sizing:border-box}#pgcPane3 .peqd-sec-label{display:none!important}#pgcPane3 .peqd-head{align-items:center!important;margin-bottom:0!important;overflow:hidden}#pgcPane3 .peqd-av{width:26px!important;height:26px!important}#pgcPane3 .peqd-nome{font-size:12px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#pgcPane3 .peqd-os-ref{font-size:10px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#pgcPane3 .peqd-row,#pgcPane3 .peqd-chips,#pgcPane3 .peqd-extra-item{gap:5px!important;flex-wrap:nowrap!important}#pgcPane3 .peqd-inp{min-height:29px!important;font-size:11px!important;padding:4px 6px!important}#pgcPane3 .peqd-obs,#pgcPane3 .peqd-extra-obs{display:none!important}.pgc-hotel-cidade{flex:1 1 130px!important;min-width:110px!important}
    @media(max-width:1200px){.pgc-desp-head{display:none!important}#pgcPane3 .peqd-card{grid-template-columns:1fr!important;border-radius:12px!important;border:1px solid rgba(52,211,153,.18)!important;margin-bottom:8px}}@media(max-width:980px){#pgcPane1 .peqs-row .peqb-os2-left{grid-template-columns:1fr 1fr!important}}@media(max-width:720px){#pgcPane1 .peqs-row .peqb-os2-left{display:block!important}}
  `;
  document.head.appendChild(style);
}

function getCtx() {
  const supervisao = document.getElementById('progSup')?.value || '';
  const isTodas = supervisao === TODAS_SUPERVISOES;
  const map = isTodas ? (window.__progGetProgramacaoIdMap?.() || new Map()) : new Map();
  return { supervisao, supervisoes: isTodas ? [...map.keys()] : [supervisao].filter(Boolean), programacaoId: window.__progGetProgramacaoId?.() || null, programacaoIdMap: map };
}
function compactStep1() {
  const pane = document.getElementById('pgcPane1');
  if (!pane) return;
  pane.querySelectorAll('.peqb-os2-kpi strong').forEach((strong) => { strong.textContent = String(strong.textContent || '').replace(/\s+/g, ' ').trim(); });
}
function fixDespesas() {
  const pane = document.getElementById('pgcPane3');
  const list = pane?.querySelector('#peqdRoster');
  if (!pane || !list) return;
  if (!pane.querySelector('.pgc-desp-head')) list.insertAdjacentHTML('beforebegin', '<div class="pgc-desp-head"><span>Colaborador</span><span>Estadia</span><span>Alimentação</span><span>Deslocamento</span><span>Extras</span></div>');
  pane.querySelectorAll('.peqd-card').forEach((card) => {
    if (norm(card.querySelector('[data-fld="tipo_estadia"]')?.value || '') !== 'HOTEL') return;
    const destino = card.querySelector('[data-estadia-destino]'); if (!destino) return;
    const cidade = cidadeFromEmbarque(card.dataset.embarque) || card.querySelector('[data-fld="cidade"]')?.value || '';
    destino.innerHTML = `<input class="peqd-inp peqd-inp-sm pgc-hotel-cidade" data-tab="estadia" data-fld="cidade" value="${esc(cidade)}" placeholder="Cidade do embarque" />`;
  });
  if (pane.dataset.pgcHotelCidade === '1') return;
  pane.dataset.pgcHotelCidade = '1';
  pane.addEventListener('change', (event) => {
    if (!event.target.closest('[data-fld="tipo_estadia"]')) return;
    setTimeout(() => { fixDespesas(); const card = event.target.closest('.peqd-card'); const inp = card?.querySelector('[data-estadia-destino] [data-fld="cidade"]'); if (inp) inp.dispatchEvent(new Event('input', { bubbles: true })); }, 0);
  });
}
async function loadPool() {
  const ctx = getCtx();
  const key = ctx.supervisoes.slice().sort().join('|');
  if (key && S.poolKey === key && S.pool.length) return S.pool;
  const pool = new Map();
  try {
    let q = supabase.from('colaborador_cruzamento').select('*');
    q = ctx.supervisoes.length > 1 ? q.in('supervisao', ctx.supervisoes) : q.eq('supervisao', ctx.supervisoes[0]);
    const { data, error } = await q.limit(12000);
    if (error) throw error;
    (data || []).forEach((r) => {
      const id = cpf(r.cpf) || String(r.id || r.nome || '');
      const nome = r.nome || r.colaborador_nome || r.funcionario || '';
      if (!id || !nome) return;
      const st = norm(`${r.situacao || ''} ${r.status || ''}`);
      if (st.includes('DESLIG') || st.includes('INATIVO')) return;
      pool.set(id, { colaboradorId: id, nome, tipoLabel: r.tipo_contrato || 'Efetivo', supervisao: r.supervisao, coordenacao: r.coordenacao, cargo: r.cargo, lat: r.latitude, lng: r.longitude, veiculoId: r.veiculo_id || null, veiculoPlaca: r.veiculo_placa || r.placa_veiculo || '', linked: false });
    });
  } catch (e) { console.warn('[pgc-hotfix] pool', e); }
  const snap = window.__peqbGetEquipeSnapshot?.();
  (snap?.osComCandidatosAtual || []).forEach((it) => (it.equipeRows || []).forEach((r) => {
    const id = String(r.colaborador_id || '');
    if (!id) return;
    const old = pool.get(id) || {};
    pool.set(id, { ...old, colaboradorId: id, nome: r.nome_colaborador || old.nome || id, supervisao: old.supervisao || it.os?.supervisao, linked: true });
  }));
  S.poolKey = key;
  S.pool = [...pool.values()].sort((a,b) => Number(isMotorista(b))-Number(isMotorista(a)) || Number(b.linked)-Number(a.linked) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return S.pool;
}
window.__pgcGetEquipePool = () => S.pool || [];
function poolCard(c) {
  const mot = isMotorista(c);
  const meta = [mot ? 'Motorista' : tipoLabel(c), c.supervisao, c.veiculoPlaca ? `Placa ${c.veiculoPlaca}` : ''].filter(Boolean).join(' · ');
  return `<div class="pgc-colab-card ${c.linked ? 'is-linked' : ''}" draggable="true" data-pgc-colab='${esc(JSON.stringify(c))}'><span class="pgc-colab-ico ${mot ? 'car' : 'person'}">${mot ? '🚗' : esc(tipoLetter(c.tipoLabel))}</span><span style="min-width:0"><span class="pgc-colab-name">${esc(c.nome)}</span><span class="pgc-colab-meta">${esc(meta)}</span></span><span class="pgc-colab-badge">${c.linked ? 'vinc.' : 'livre'}</span></div>`;
}
async function renderPoolManual() {
  const box = document.getElementById('pgcColabPool'); if (!box) return;
  const pool = await loadPool();
  const input = box.querySelector('#pgcPoolSearch'); const q = norm(input?.value || '');
  const rows = q ? pool.filter((c) => norm(`${c.nome} ${c.tipoLabel} ${c.supervisao} ${c.veiculoPlaca}`).includes(q)) : pool;
  const count = box.querySelector('.pgc-pool-count'); if (count) count.textContent = `${rows.length}/${pool.length}`;
  const list = box.querySelector('.pgc-colab-list'); if (list) list.innerHTML = rows.length ? rows.map(poolCard).join('') : '<div class="pgc-colab-empty">Nenhum colaborador da supervisão.</div>';
  if (box.dataset.pgcHotfixPool !== '1') {
    box.dataset.pgcHotfixPool = '1';
    box.addEventListener('input', (e) => { if (e.target.matches('#pgcPoolSearch')) renderPoolManual(); });
  }
}

function loadCss(href, id) { if (document.getElementById(id)) return; const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
function loadScript(src, id) { if (document.getElementById(id)) return Promise.resolve(); return new Promise((resolve, reject) => { const s = document.createElement('script'); s.id = id; s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); }); }
async function ensureLeaflet() { if (window.L) return true; try { loadCss(LEAFLET_CSS_HREF, LEAFLET_CSS_ID); await loadScript(LEAFLET_JS_SRC, LEAFLET_JS_ID); return !!window.L; } catch { return false; } }
function starSvg(color) { return `<svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,1.8 17.8,10.4 27,11.2 20,17.2 22.2,26.2 14,21.3 5.8,26.2 8,17.2 1,11.2 10.2,10.4" fill="${color}" stroke="#fff" stroke-width="1.25"/></svg>`; }
function personSvg(color, letter) { return `<svg width="28" height="34" viewBox="0 0 28 34"><circle cx="14" cy="8" r="6.4" fill="${color}" stroke="#fff" stroke-width="1.5"/><path d="M3 33c0-8 5-12.5 11-12.5S25 25 25 33" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="21" cy="22" r="6" fill="#020617" stroke="#fff"/><text x="21" y="25.7" text-anchor="middle" font-size="9" font-weight="900" fill="#fff">${letter}</text></svg>`; }
function carSvg(color) { return `<svg width="32" height="25" viewBox="0 0 32 25"><path d="M6.5 13.2 9 6.8C9.5 5.7 10.7 5 12 5h8c1.3 0 2.5.7 3 1.8l2.5 6.4" fill="${color}" stroke="#fff" stroke-width="1.5"/><path d="M4.5 12.8h23c1.4 0 2.5 1.1 2.5 2.5v4.2H2v-4.2c0-1.4 1.1-2.5 2.5-2.5Z" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="8.5" cy="19.5" r="2.6" fill="#020617" stroke="#fff"/><circle cx="23.5" cy="19.5" r="2.6" fill="#020617" stroke="#fff"/></svg>`; }
function iconOs(linked) { return window.L.divIcon({ className: 'pmg-drag-icon', html: starSvg(linked ? '#22c55e' : '#eab308'), iconSize: [28, 28], iconAnchor: [14, 14] }); }
function iconColab(row, linked) { return window.L.divIcon({ className: 'pmg-drag-icon', html: personSvg(linked ? '#22c55e' : '#eab308', tipoLetter(tipoLabel(row))), iconSize: [28, 34], iconAnchor: [14, 32] }); }
function iconCar(linked) { return window.L.divIcon({ className: 'pmg-drag-icon', html: carSvg(linked ? '#22c55e' : '#eab308'), iconSize: [32, 25], iconAnchor: [16, 21] }); }
function markerTarget(marker) {
  const map = S.map; if (!map) return null;
  const p = map.latLngToContainerPoint(marker.getLatLng()); let best = null, dist = 99999;
  for (const other of S.markers) { if (other === marker) continue; const d = p.distanceTo(map.latLngToContainerPoint(other.getLatLng())); if (d < dist) { dist = d; best = other; } }
  return dist <= 42 ? best : null;
}
function addDrag(marker, meta) {
  marker.__pmgMeta = meta; marker.__origLatLng = marker.getLatLng();
  marker.on('dragend', async () => { const alvo = markerTarget(marker); marker.setLatLng(marker.__origLatLng); if (!alvo?.__pmgMeta) return; await associarMapa(marker.__pmgMeta, alvo.__pmgMeta); });
  S.markers.push(marker);
}
async function associarMapa(a, b) {
  const osMeta = [a,b].find((x) => x.tipo === 'os');
  const pessoa = [a,b].find((x) => x.tipo === 'colaborador' || x.tipo === 'motorista');
  if (osMeta && pessoa?.colab) return vincularColaboradorNaOs(osMeta.osId, pessoa.colab);
  const mot = [a,b].find((x) => x.tipo === 'motorista');
  const col = [a,b].find((x) => x.tipo === 'colaborador' && x.osId);
  if (mot?.colab && col?.colaboradorId && col?.osId) return vincularMotoristaAoColaborador(col.osId, col.colaboradorId, mot.colab);
  alert('Solte o marcador sobre uma O.S. ou sobre um colaborador já vinculado à O.S.');
}
window.__pgcAssociarMapa = associarMapa;
async function garantirMapa(el) {
  if (S.map && S.mapEl === el) return S.map;
  if (S.map) { try { S.map.remove(); } catch {} }
  if (!await ensureLeaflet()) return null;
  S.mapEl = el; S.map = window.L.map(el, { zoomControl: true, scrollWheelZoom: true, center: [-14.235, -51.925], zoom: 4 });
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd' }).addTo(S.map);
  S.osLayer = window.L.layerGroup().addTo(S.map); S.colabLayer = window.L.layerGroup().addTo(S.map);
  return S.map;
}
async function renderManualMap() {
  const band = document.getElementById('peqbMapBand'); if (!band || band.hidden) return;
  band.innerHTML = `<div class="pmg-wrap"><div class="pmg-head"><strong>Mapa do gestor</strong><div class="pmg-legend"><span><i style="background:#eab308"></i>Livre</span><span><i style="background:#22c55e"></i>Associado</span><span class="pmg-help">Arraste um marcador sobre outro para vincular</span></div><div style="display:flex;gap:8px;align-items:center"><span id="pmgMsg" style="font-size:11px;color:#9fb7aa"></span><button type="button" class="peqb-btn" id="pmgAtualizarManual">🔄 Atualizar</button></div></div><div class="pmg-map"><div id="peqbMapEl2"></div><div id="pmgEmpty" class="pmg-empty" style="display:none">Nenhuma coordenada para mostrar nesta supervisão.</div></div></div>`;
  band.querySelector('#pmgAtualizarManual')?.addEventListener('click', renderManualMap);
  const msg = band.querySelector('#pmgMsg'); if (msg) msg.textContent = 'Carregando mapa...';
  const map = await garantirMapa(band.querySelector('#peqbMapEl2')); if (!map) return;
  setTimeout(() => { try { map.invalidateSize(); } catch {} }, 80);
  S.osLayer.clearLayers(); S.colabLayer.clearLayers(); S.markers = [];
  const snap = window.__peqbGetEquipeSnapshot?.(); if (!snap?.osComCandidatosAtual) { if (msg) msg.textContent = 'Carregue a programação.'; return; }
  const ctx = getCtx(); const supSet = new Set(ctx.supervisoes);
  const items = (snap.osComCandidatosAtual || []).filter((it) => !supSet.size || supSet.has(it.os?.supervisao));
  const equipe = new Map(); items.forEach((it) => (it.equipeRows || []).forEach((r) => equipe.set(String(r.colaborador_id), { row: r, item: it })));
  const pool = await loadPool();
  const bounds = []; const L = window.L;
  items.forEach((it) => {
    const linked = (it.equipeRows || []).length > 0;
    if (!it.ponto || !hasGeo(it.ponto.lat, it.ponto.lng)) return;
    const m = L.marker([it.ponto.lat, it.ponto.lng], { icon: iconOs(linked), draggable: true, autoPan: true }).bindTooltip(`OS ${esc(it.os.numero_os || '-')} · ${esc(it.os.cliente || '-')}${linked ? ' · associada' : ' · livre'}`, { className: 'peqb-tt' });
    addDrag(m, { tipo: 'os', osId: it.os.id, numeroOs: it.os.numero_os, supervisao: it.os.supervisao }); S.osLayer.addLayer(m); bounds.push([it.ponto.lat, it.ponto.lng]);
  });
  pool.filter((c) => !supSet.size || supSet.has(c.supervisao)).forEach((c) => {
    const pos = latLngFrom(c); if (!pos) return;
    const vinc = equipe.get(String(c.colaboradorId)); const linked = !!vinc; const mot = isMotorista(c);
    const m = L.marker([pos.latitude, pos.longitude], { icon: mot ? iconCar(linked) : iconColab(c, linked), draggable: true, autoPan: true }).bindTooltip(`${esc(c.nome)}${linked ? ` · OS ${esc(vinc.item.os.numero_os || '-')}` : ''} · ${mot ? 'Motorista' : esc(tipoLabel(c))}`, { className: 'peqb-tt' });
    addDrag(m, { tipo: mot ? 'motorista' : 'colaborador', colaboradorId: c.colaboradorId, osId: linked ? vinc.item.os.id : null, supervisao: c.supervisao, colab: c }); S.colabLayer.addLayer(m); bounds.push([pos.latitude, pos.longitude]);
  });
  const empty = band.querySelector('#pmgEmpty'); if (empty) empty.style.display = bounds.length ? 'none' : 'flex';
  if (bounds.length) map.fitBounds(bounds, { padding: [34,34], maxZoom: 12 });
  if (msg) msg.textContent = '';
}
window.__pmgRenderMapaGestor = renderManualMap;
function ensureMapOpen() {
  const pane = document.getElementById('pgcPane2'); const band = pane?.querySelector('#peqbMapBand'); if (!band) return;
  band.hidden = false; renderManualMap();
}
function findItemByOs(osId) {
  const snap = window.__peqbGetEquipeSnapshot?.();
  const item = (snap?.osComCandidatosAtual || []).find((it) => String(it.os?.id) === String(osId));
  return { snap, item };
}
function materializarCand(item, colab) {
  const id = String(colab.colaboradorId || '');
  const cand = (item?.candidatos || []).find((c) => String(c.colaboradorId) === id) || (item?.colaboradoresRegional || []).find((c) => String(c.colaboradorId) === id);
  return { ...(cand || {}), ...colab, colaboradorId: id, nome: colab.nome || cand?.nome || id, tipoLabel: colab.tipoLabel || cand?.tipoLabel || 'Efetivo', score: cand?.score || colab.score || 0, scoreContrato: cand?.scoreContrato || colab.scoreContrato || 0, scoreDistancia: cand?.scoreDistancia || colab.scoreDistancia || 0, scoreAuditoria: cand?.scoreAuditoria || colab.scoreAuditoria || 0, km: cand?.km ?? colab.km ?? null };
}
function pedirJustificativa(os, atuais, novo) {
  return new Promise((resolve) => {
    const nomes = (atuais || []).map((c) => c.nome_colaborador || c.nome).filter(Boolean).join(', ');
    const ov = document.createElement('div'); ov.className = 'peqb-modal-ov';
    ov.innerHTML = `<div class="peqb-modal"><h3>Justificar mais de 1 colaborador</h3><p>O.S. <b style="color:#bbf7d0">${esc(os?.numero_os || '-')}</b> já possui <b>${esc(nomes || '-')}</b>. Informe o motivo para adicionar <b style="color:#bbf7d0">${esc(novo?.nome || '-')}</b>.</p><textarea id="pgcJustifHot" rows="3" placeholder="Ex.: volume, distância ou demanda exige mais pessoas no ponto" style="width:100%;resize:vertical;background:#0d0d18;color:#e2e2f0;border:1px solid rgba(52,211,153,.28);border-radius:10px;padding:9px 10px;font-size:13px"></textarea><div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-cancel>Cancelar</button><button type="button" class="peqb-row-btn" data-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Confirmar</button></div></div>`;
    document.body.appendChild(ov); const input = ov.querySelector('#pgcJustifHot'); const close = (v) => { ov.remove(); resolve(v); }; input.focus(); ov.addEventListener('click', (e) => { if (e.target === ov) close(null); }); ov.querySelector('[data-cancel]').addEventListener('click', () => close(null)); ov.querySelector('[data-ok]').addEventListener('click', () => { const motivo = input.value.trim(); if (!motivo) { input.focus(); return; } close(motivo); });
  });
}
function escolherDisponibilidadeMotorista(nome) {
  return new Promise((resolve) => {
    const ov = document.createElement('div'); ov.className = 'peqb-modal-ov';
    ov.innerHTML = `<div class="peqb-modal"><h3>Motorista na programação</h3><p><b style="color:#bbf7d0">${esc(nome || 'Motorista')}</b> será lançado como:</p><div class="peqb-modal-actions" style="justify-content:stretch"><button type="button" class="peqb-row-btn" data-valor="OK" style="flex:1">Atendimento</button><button type="button" class="peqb-row-btn" data-valor="LOGISTICA" style="flex:1;border-color:rgba(134,239,172,.4);color:#bbf7d0">Logística</button></div><button type="button" class="peqb-row-btn danger" data-cancel>Cancelar</button></div>`;
    document.body.appendChild(ov); const close = (v) => { ov.remove(); resolve(v); }; ov.addEventListener('click', (e) => { if (e.target === ov) close(null); }); ov.querySelector('[data-cancel]').addEventListener('click', () => close(null)); ov.querySelectorAll('[data-valor]').forEach((btn) => btn.addEventListener('click', () => close(btn.dataset.valor)));
  });
}
async function upsertVinculo({ programacaoId, os, cand, disponibilidade }) {
  const equipe = { programacao_id: programacaoId, os_id: os.id, colaborador_id: cand.colaboradorId, nome_colaborador: cand.nome, score: cand.score || 0, score_contrato: cand.scoreContrato || 0, score_distancia: cand.scoreDistancia || 0, score_auditoria: cand.scoreAuditoria || 0, km_estimado: cand.km ?? null, confirmado: true };
  const { error } = await supabase.from('programacao_equipe').upsert(equipe, { onConflict: 'programacao_id,os_id,colaborador_id' }); if (error) throw error;
  await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id).eq('colaborador_key', cand.colaboradorId);
  await supabase.from('operacional_os_colaboradores').insert({ os_id: os.id, colaborador_key: cand.colaboradorId, colaborador_nome: cand.nome, colaborador_cpf: /^\d+$/.test(String(cand.colaboradorId)) ? String(cand.colaboradorId) : null, distancia_km: cand.km ?? null, origem_sugestao: isMotorista(cand) ? 'PROGRAMACAO_MAPA_MOTORISTA' : 'PROGRAMACAO_MAPA_COLABORADOR' });
  await supabase.from('programacao_colaboradores').upsert({ programacao_id: programacaoId, colaborador_id: cand.colaboradorId, nome_colaborador: cand.nome, cargo: cand.cargo || null, coordenacao: cand.coordenacao || null, supervisao: cand.supervisao || null, disponibilidade }, { onConflict: 'programacao_id,colaborador_id' });
}
async function vincularColaboradorNaOs(osId, colab) {
  const { snap, item } = findItemByOs(osId); if (!snap || !item) return;
  const cand = materializarCand(item, colab);
  if ((item.equipeRows || []).some((r) => String(r.colaborador_id) === String(cand.colaboradorId))) { alert(`${cand.nome} já está vinculado nesta O.S.`); return; }
  const atuais = item.equipeRows || []; let motivo = null;
  if (atuais.length) { motivo = await pedirJustificativa(item.os, atuais, cand); if (!motivo) return; }
  const disponibilidade = isMotorista(cand) ? await escolherDisponibilidadeMotorista(cand.nome) : 'OK'; if (!disponibilidade) return;
  const programacaoId = snap.programacaoIdParaOs?.(item.os) || item.equipeRows?.[0]?.programacao_id; if (!programacaoId) { alert('Programação da O.S. não encontrada. Recarregue a tela.'); return; }
  await upsertVinculo({ programacaoId, os: item.os, cand, disponibilidade });
  if (motivo) logActivity('action', 'justificativa_multiplos_colaboradores_os', 'programacao', { os_id: item.os.id, numero_os: item.os.numero_os, colaboradores: [...atuais.map((c) => c.colaborador_id), cand.colaboradorId], nomes: [...atuais.map((c) => c.nome_colaborador), cand.nome], motivo });
  S.poolKey = ''; window.__pgcProgramacaoReload?.(); setTimeout(fixAll, 900);
}
async function vincularMotoristaAoColaborador(osId, alvoId, motorista) {
  const { snap, item } = findItemByOs(osId); if (!snap || !item) return;
  if (!alvoId) return vincularColaboradorNaOs(osId, motorista);
  const programacaoId = snap.programacaoIdParaOs?.(item.os) || item.equipeRows?.[0]?.programacao_id; if (!programacaoId) { alert('Programação da O.S. não encontrada. Recarregue a tela.'); return; }
  const disponibilidade = await escolherDisponibilidadeMotorista(motorista.nome); if (!disponibilidade) return;
  const cand = materializarCand(item, motorista);
  await upsertVinculo({ programacaoId, os: item.os, cand, disponibilidade });
  const placa = onlyPlate(cand.veiculoPlaca || '');
  if (placa) await supabase.from('programacao_deslocamento').upsert({ programacao_id: programacaoId, data_referencia: snap.dataReferencia || todayIso(), colaborador_id: alvoId, tipo_deslocamento: 'CARONA FROTA', placa_veiculo: placa, observacao: `Motorista vinculado na programação: ${cand.nome}` }, { onConflict: 'programacao_id,colaborador_id' });
  logActivity('action', 'motorista_vinculado_colaborador_os', 'programacao', { os_id: item.os.id, numero_os: item.os.numero_os, motorista_id: cand.colaboradorId, motorista_nome: cand.nome, colaborador_id: alvoId, placa, disponibilidade });
  S.poolKey = ''; window.__pgcProgramacaoReload?.(); setTimeout(fixAll, 900);
}
async function fixAll() { compactStep1(); fixDespesas(); await renderPoolManual(); ensureMapOpen(); }
function triggerReloads() { S.poolKey = ''; S.pool = []; [800, 1600, 2800, 4500].forEach((delay) => setTimeout(() => { window.__pgcProgramacaoReload?.(); setTimeout(fixAll, 700); }, delay)); }
function boot() {
  injectCss();
  document.addEventListener('click', (e) => {
    if (e.target.closest('#progLoadContext')) triggerReloads();
    if (e.target.closest('#progSteps .stepbtn')) setTimeout(fixAll, 300);
    if (e.target.closest('#peqbVerMapa')) setTimeout(() => { const band = document.getElementById('peqbMapBand'); if (band) { band.hidden = false; renderManualMap(); } }, 100);
  }, true);
  new MutationObserver(() => { clearTimeout(window.__pgcHotfixTimer); window.__pgcHotfixTimer = setTimeout(fixAll, 300); }).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(fixAll, 800);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();