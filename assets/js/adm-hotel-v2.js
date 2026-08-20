import { supabase } from './supabaseClient.js';

// adm-hotel-v2.js substitui adm-hotel-redesign.js + adm-hotel-fluxo-v2.js
// (+ bootstrap/history) + adm-hotel-filtro-todos.js: consolida a carga de
// dados (antes duplicada em 3+ módulos independentes), troca polling por
// Supabase Realtime, e traz Cotar/Anexar nativos (antes delegados ao
// fluxo-v2 via clique sintético). Ver plano em
// C:\Users\graom\.claude\plans\spicy-bubbling-russell.md.
const V2_VERSION = '20260819-consolidado-realtime1';
const HOSP_COTACAO_FLOW_ID = '8660973';
const onlyDigits = (value) => String(value || '').replace(/\D+/g, '');
const roomsLabel = (row) => row.composicao_quartos || row.tipo_quarto || row.quartos || row.observacao_quartos || 'A definir';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const norm = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toUpperCase();
const iso = (value) => String(value || '').slice(0, 10);
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brDate = (value) => {
  const [y, m, d] = iso(value).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
};
const diffDays = (start, end) => {
  if (!start || !end) return 1;
  const a = new Date(`${iso(start)}T12:00:00`), b = new Date(`${iso(end)}T12:00:00`);
  return Math.max(1, Math.round((b - a) / 86400000) || 1);
};
const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const addDays = (date, amount) => {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); return d.toISOString().slice(0, 10);
};

const state = {
  tab: 'dashboard', hotelFilter: 'uso', loading: false, ready: false,
  rows: [], hotels: [], people: [], assignments: [], links: [], extras: [], finance: [], documents: [],
  advances: [], advanceMoves: [], checkoutLots: [], checkoutPeople: [],
  peopleByRequest: new Map(), peopleById: new Map(), rowsByRequest: new Map(),
  manualGroups: new Map(), activeModal: null, user: null, userName: '',
  pendingReserveIds: [], pendingReserveMeta: null, nativePayment: null,
  search: { solicitacoes: '', andamento: '', finalizado: '', hoteis: '' },
};

function icon(name) {
  const paths = {
    dashboard: '<path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z"/>',
    request: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
    hotel: '<path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M17 9h3v12M8 7h2M13 7h.01M8 11h2M13 11h.01M2 21h20"/>',
    group: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M14 14h2a5 5 0 0 1 5 5v1"/>',
    quote: '<path d="M4 5h16v10H8l-4 4V5Z"/><path d="M8 9h.01M12 9h.01M16 9h.01"/>',
    reserve: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    extend: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    reject: '<path d="M18 6 6 18M6 6l12 12"/>',
    checkout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/>',
    extra: '<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9"/>',
    pay: '<circle cx="12" cy="12" r="9"/><path d="M16 8h-5a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4H8M12 6v12"/>',
    edit: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/>',
    pending: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    attach: '<path d="m21 11-8.4 8.4a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.4-8.4"/>',
    refresh: '<path d="M20 11a8 8 0 1 0 1 4"/><path d="M20 4v7h-7"/>',
    flow: '<path d="M3 5h18M3 12h18M3 19h18"/><circle cx="8" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="19" r="2"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.request}</svg>`;
}

async function optional(table, select = '*') {
  try {
    const { data, error } = await supabase.from(table).select(select);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

function currentMode() {
  return String(location.hash || '').toLowerCase().includes('aloj') ? 'alojamentos' : 'hoteis';
}

function mount() {
  const content = $('#pageContent');
  if (!content || $('#hospRedesignRoot')) return false;
  const root = document.createElement('section');
  root.id = 'hospRedesignRoot';
  root.innerHTML = `
    <nav class="hosp-rd-tabs" aria-label="Navegação de Hotéis">
      <button class="hosp-rd-tab active" data-hosp-rd-tab="dashboard" type="button">${icon('dashboard')} Dashboard</button>
      <button class="hosp-rd-tab" data-hosp-rd-tab="solicitacoes" type="button">${icon('request')} Solicitações <span class="hosp-rd-count" id="hospRdCountRequests">0</span></button>
      <button class="hosp-rd-tab" data-hosp-rd-tab="andamento" type="button">${icon('hotel')} Em Andamento <span class="hosp-rd-count" id="hospRdCountActive">0</span></button>
      <button class="hosp-rd-tab" data-hosp-rd-tab="finalizado" type="button">${icon('checkout')} Finalizado <span class="hosp-rd-count" id="hospRdCountFinal">0</span></button>
      <button class="hosp-rd-tab" data-hosp-rd-tab="hoteis" type="button">${icon('hotel')} Hotéis</button>
      <button class="hosp-rd-icon-btn hosp-rd-refresh" data-hosp-rd-action="refresh" type="button" title="Atualizar">${icon('refresh')}</button>
    </nav>
    <div id="hospRdDashboard" class="hosp-rd-panel active"></div>
    <div id="hospRdSolicitacoes" class="hosp-rd-panel"></div>
    <div id="hospRdAndamento" class="hosp-rd-panel"></div>
    <div id="hospRdFinalizado" class="hosp-rd-panel"></div>
    <div id="hospRdHoteis" class="hosp-rd-panel"></div>
    <div id="hospRdModal" class="hosp-rd-modal" aria-hidden="true"><div class="hosp-rd-modal-card" id="hospRdModalCard"><div class="hosp-rd-modal-head"><div><h3 id="hospRdModalTitle"></h3><p id="hospRdModalSub"></p></div><button class="hosp-rd-icon-btn" data-hosp-rd-modal="close" type="button">${icon('reject')}</button></div><div class="hosp-rd-modal-body" id="hospRdModalBody"></div></div></div>
    <div id="hospRdToast" class="hosp-rd-toast"></div>`;
  content.prepend(root);
  content.classList.add('hosp-rd-active');
  return true;
}

function rebuildIndexes() {
  state.peopleByRequest.clear(); state.peopleById.clear(); state.rowsByRequest.clear();
  state.people.forEach((p) => {
    const rid = String(p.solicitacao_id || '');
    if (!state.peopleByRequest.has(rid)) state.peopleByRequest.set(rid, []);
    state.peopleByRequest.get(rid).push(p);
    if (p.id) state.peopleById.set(String(p.id), p);
  });
  state.rows.forEach((row) => state.rowsByRequest.set(String(row.solicitacao_id), row));
}

async function loadData() {
  if (state.loading || currentMode() !== 'hoteis') return;
  state.loading = true;
  const root = $('#hospRedesignRoot');
  if (root && !state.ready) root.querySelectorAll('.hosp-rd-panel').forEach((p) => p.innerHTML = '<div class="hosp-rd-loading">Carregando hospedagem...</div>');
  try {
    const [rowsRes, hotelsRes, peopleRes, assignmentsRes, linksRes] = await Promise.all([
      supabase.from('hospedagem_painel_geral').select('*').order('data_solicitacao', { ascending: false }),
      supabase.from('hospedagem_hoteis').select('*').order('cidade', { ascending: true }).order('nome', { ascending: true }),
      supabase.from('hospedagem_solicitacao_colaboradores').select('*'),
      supabase.from('hospedagem_reserva_colaboradores').select('*'),
      supabase.from('hospedagem_reserva_solicitacoes').select('*'),
    ]);
    if (rowsRes.error) throw rowsRes.error;
    state.rows = rowsRes.data || [];
    state.hotels = hotelsRes.error ? [] : (hotelsRes.data || []);
    state.people = peopleRes.error ? [] : (peopleRes.data || []);
    state.assignments = assignmentsRes.error ? [] : (assignmentsRes.data || []);
    state.links = linksRes.error ? [] : (linksRes.data || []);
    const [extras, finance, documents, advances, advanceMoves, checkoutLots, checkoutPeople] = await Promise.all([
      optional('hospedagem_custos_extras'), optional('hospedagem_financeiro'), optional('hospedagem_documentos'), optional('hospedagem_adiantamentos'), optional('hospedagem_adiantamento_movimentos'), optional('hospedagem_checkout_lotes'), optional('hospedagem_checkout_lote_colaboradores'),
    ]);
    state.extras = extras; state.finance = finance; state.documents = documents; state.advances = advances; state.advanceMoves = advanceMoves; state.checkoutLots = checkoutLots; state.checkoutPeople = checkoutPeople;
    rebuildIndexes();
    state.ready = true;
    // adm-hotel.js (modais legados de Reservar/Estender/Checkout/Pagar) lê
    // esse bridge em vez de refazer sua própria busca de hospedagem_painel_geral.
    window.__hospedagemV2State = state;
    renderAll();
  } catch (error) {
    console.error('[hosp-redesign] loadData', error);
    toast(`Não foi possível carregar Hotéis: ${error.message || error}`, true);
  } finally { state.loading = false; }
}

function personKey(person) { return norm(person?.colaborador_id || person?.cpf || person?.nome_colaborador || person?.nome); }
function peopleForRequest(requestId) { return state.peopleByRequest.get(String(requestId || '')) || []; }
function activeAssignment(assignment) { return !assignment.checkout_em && !['CHECKOUT', 'CANCELADO'].includes(String(assignment.status || '').toUpperCase()); }
function assignmentsForReservation(reservaId, activeOnly = false) {
  return state.assignments.filter((a) => String(a.reserva_id) === String(reservaId) && (!activeOnly || activeAssignment(a)));
}
function reservationPeople(reservaId, activeOnly = false) {
  return assignmentsForReservation(reservaId, activeOnly).map((a) => ({ assignment: a, person: state.peopleById.get(String(a.solicitacao_colaborador_id)) })).filter((x) => x.person);
}
function requestRow(id) { return state.rowsByRequest.get(String(id || '')); }
function linkedRequestIds(reservaId) {
  const ids = state.links.filter((x) => String(x.reserva_id) === String(reservaId)).map((x) => String(x.solicitacao_id));
  const own = state.rows.filter((r) => String(r.reserva_id) === String(reservaId)).map((r) => String(r.solicitacao_id));
  return [...new Set([...ids, ...own])];
}
function reservationRow(reservaId) { return state.rows.find((r) => String(r.reserva_id) === String(reservaId)) || null; }
function reservationStatusRow(reservaId) { return reservationRow(reservaId) || {}; }

function pendingRequestRows() {
  const assignedPeople = new Set(state.assignments.map((a) => String(a.solicitacao_colaborador_id || '')).filter(Boolean));
  return state.rows.filter((row) => {
    const status = String(row.status_solicitacao || '').toUpperCase();
    if (status === 'CANCELADA') return false;
    if (!row.reserva_id && !['RESERVADA', 'CONCLUIDA'].includes(status)) return true;
    const people = peopleForRequest(row.solicitacao_id);
    return people.some((p) => p.id && !assignedPeople.has(String(p.id)));
  });
}
function pendingPeople(row) {
  const assigned = new Set(state.assignments.map((a) => String(a.solicitacao_colaborador_id || '')).filter(Boolean));
  const people = peopleForRequest(row.solicitacao_id).filter((p) => !p.id || !assigned.has(String(p.id)));
  return people.length ? people : peopleForRequest(row.solicitacao_id);
}
function extensionCandidateForPerson(row, person) {
  const checkin = iso(row.data_checkin || row.data_checkin_prevista);
  if (!checkin || !person) return null;
  const key = personKey(person);
  const candidates = uniqueReservations().filter((candidate) => {
    if (!candidate.reserva_id || String(candidate.reserva_id) === String(row.reserva_id || '')) return false;
    if (['CHECKOUT_REALIZADO', 'CANCELADA'].includes(String(candidate.status_hospedagem || '').toUpperCase())) return false;
    if (norm(candidate.cidade) !== norm(row.cidade)) return false;
    const a = norm(candidate.uf), b = norm(row.uf); if (a && b && a !== b) return false;
    const occupants = new Set(reservationPeople(candidate.reserva_id, true).map((x) => personKey(x.person)));
    if (!occupants.has(key)) return false;
    const checkout = iso(candidate.data_checkout || candidate.data_checkout_prevista); if (!checkout) return false;
    const delta = Math.round((new Date(`${checkin}T12:00:00`) - new Date(`${checkout}T12:00:00`)) / 86400000);
    return delta === 0 || delta === 1;
  });
  return candidates.sort((a, b) => String(b.data_checkout || '').localeCompare(String(a.data_checkout || '')))[0] || null;
}
function extensionCandidateForUnit(unit) {
  for (const item of unit.items) {
    for (const p of item.people) {
      const candidate = extensionCandidateForPerson(item.row, p);
      if (candidate) return candidate;
    }
  }
  return null;
}
function requestKind(unit) {
  const status = String(unit.row.status_solicitacao || '').toUpperCase();
  if (status.includes('CHECKOUT')) return 'Checkout';
  return extensionCandidateForUnit(unit) ? 'Extensão' : 'Checkin';
}

function groupIdsForRequest(id) {
  for (const ids of state.manualGroups.values()) if (ids.has(String(id))) return ids;
  return new Set([String(id)]);
}
function requestUnits() {
  const pending = pendingRequestRows();
  const byId = new Map(pending.map((row) => [String(row.solicitacao_id), row]));
  const used = new Set(), units = [];
  for (const row of pending) {
    const id = String(row.solicitacao_id); if (used.has(id)) continue;
    const groupIds = [...groupIdsForRequest(id)].filter((gid) => byId.has(gid));
    const rows = (groupIds.length ? groupIds : [id]).map((gid) => byId.get(gid)).filter(Boolean);
    rows.forEach((r) => used.add(String(r.solicitacao_id)));
    const items = rows.map((r) => ({ row: r, people: pendingPeople(r) }));
    units.push({ row: rows[0], rows, ids: rows.map((r) => String(r.solicitacao_id)), items, people: items.flatMap((i) => i.people) });
  }
  return units;
}

function uniqueReservations() {
  const map = new Map();
  state.rows.forEach((row) => { if (row.reserva_id && !map.has(String(row.reserva_id))) map.set(String(row.reserva_id), row); });
  return [...map.values()];
}
function activeReservations() {
  return uniqueReservations().filter((row) => {
    if (String(row.status_hospedagem || '').toUpperCase() === 'CANCELADA') return false;
    const active = reservationPeople(row.reserva_id, true);
    return active.length > 0 || !['CHECKOUT_REALIZADO'].includes(String(row.status_hospedagem || '').toUpperCase());
  });
}
function reservationDateForPerson(person, field) {
  const row = requestRow(person?.solicitacao_id); if (!row) return '';
  return field === 'in' ? iso(row.data_checkin || row.data_checkin_prevista) : iso(row.data_checkout || row.data_checkout_prevista);
}
function reservationRange(reservaId, activeOnly = false) {
  const people = reservationPeople(reservaId, activeOnly);
  const ins = people.map((x) => reservationDateForPerson(x.person, 'in')).filter(Boolean).sort();
  const outs = people.map((x) => reservationDateForPerson(x.person, 'out')).filter(Boolean).sort();
  const row = reservationRow(reservaId) || {};
  return { checkin: ins[0] || iso(row.data_checkin || row.data_checkin_prevista), checkout: outs.at(-1) || iso(row.data_checkout || row.data_checkout_prevista) };
}
function extrasForReservation(reservaId) { return state.extras.filter((e) => String(e.reserva_id) === String(reservaId)); }
function extraSignedTotal(extra) { const v = Number(extra.valor_total ?? Number(extra.quantidade || 1) * Number(extra.valor_unitario || 0)); return String(extra.tipo || '').toUpperCase() === 'DESCONTO' ? -v : v; }
function extrasTotal(reservaId) { return extrasForReservation(reservaId).reduce((sum, e) => sum + extraSignedTotal(e), 0); }
function financeForReservation(reservaId) { return state.finance.find((f) => String(f.reserva_id) === String(reservaId)) || null; }
function reservationTotal(row) {
  if (!row) return 0;
  const base = Number(row.valor_total_final || row.valor_total_previsto || (Number(row.valor_diaria || 0) * Number(row.quantidade_diarias || 1) * Number(row.quantidade_quartos || 1)) || 0);
  const hasFinal = Number(row.valor_total_final || 0) > 0;
  return Math.max(0, hasFinal ? base : base + extrasTotal(row.reserva_id));
}
function hotelById(id) { return state.hotels.find((h) => String(h.id) === String(id)) || null; }
function availableCredit(hotelId) { return state.advances.filter((a) => String(a.hotel_id) === String(hotelId) && String(a.status).toUpperCase() === 'DISPONIVEL').reduce((s, a) => s + Number(a.saldo || 0), 0); }
function hotelDebt(hotelId) {
  const reservationIds = new Set(uniqueReservations().filter((r) => String(r.hotel_id) === String(hotelId)).map((r) => String(r.reserva_id)));
  return state.finance.filter((f) => reservationIds.has(String(f.reserva_id))).reduce((sum, f) => {
    const total = Number(f.valor_total || f.valor_original || 0), paid = Number(f.valor_pago || 0);
    return sum + Math.max(0, Number(f.saldo ?? (total - paid)) || 0);
  }, 0);
}

function renderAll() {
  if (!state.ready || !$('#hospRedesignRoot')) return;
  renderDashboard(); renderSolicitacoes(); renderAndamento(); renderFinalizado(); renderHoteis(); updateCounts(); setTab(state.tab, false);
}
function updateCounts() {
  $('#hospRdCountRequests').textContent = String(requestUnits().length);
  $('#hospRdCountActive').textContent = String(activeReservations().length);
  $('#hospRdCountFinal').textContent = String(finalizedUnits().length);
}
function setTab(tab, focus = true) {
  state.tab = tab;
  $$('.hosp-rd-tab[data-hosp-rd-tab]').forEach((b) => b.classList.toggle('active', b.dataset.hospRdTab === tab));
  const ids = { dashboard: 'hospRdDashboard', solicitacoes: 'hospRdSolicitacoes', andamento: 'hospRdAndamento', finalizado: 'hospRdFinalizado', hoteis: 'hospRdHoteis' };
  Object.entries(ids).forEach(([name, id]) => $('#' + id)?.classList.toggle('active', name === tab));
  if (focus) $('#' + ids[tab])?.scrollIntoView({ block: 'nearest' });
}

const STATE_POS = {
  AC:[1,4],RO:[2,4],AM:[2,3],RR:[3,1],PA:[4,3],AP:[5,1],TO:[5,5],MA:[6,3],PI:[7,4],CE:[8,3],RN:[8,2],PB:[8,4],PE:[8,5],AL:[8,6],SE:[8,7],BA:[7,6],MT:[4,5],MS:[4,7],GO:[5,6],DF:[6,6],MG:[6,7],ES:[7,7],RJ:[6,8],SP:[5,8],PR:[5,9],SC:[5,10],RS:[4,11]
};
function dashboardStateCounts() {
  const counts = new Map();
  activeReservations().forEach((r) => {
    const qty = reservationPeople(r.reserva_id, true).length || Number(r.total_colaboradores || 1);
    const uf = String(r.uf || r.uf_hotel || '').toUpperCase(); if (uf) counts.set(uf, (counts.get(uf) || 0) + qty);
  });
  return counts;
}
function renderDashboard() {
  const t = today(), active = activeReservations();
  const hospedados = active.reduce((sum, r) => sum + (reservationPeople(r.reserva_id, true).length || Number(r.total_colaboradores || 1)), 0);
  const awaiting = requestUnits().length;
  let checkins = 0, checkouts = 0;
  active.forEach((r) => reservationPeople(r.reserva_id, true).forEach(({ person }) => { if (reservationDateForPerson(person, 'in') === t) checkins += 1; if (reservationDateForPerson(person, 'out') === t) checkouts += 1; }));
  state.checkoutLots.filter((l) => iso(l.data_checkout) === t).forEach((lot) => { checkouts += state.checkoutPeople.filter((p) => String(p.lote_id) === String(lot.id)).length; });
  const counts = dashboardStateCounts(), max = Math.max(1, ...counts.values()), statesWithData = counts.size;
  const stateHtml = Object.entries(STATE_POS).map(([uf,[col,row]]) => {
    const count = counts.get(uf) || 0, level = count ? Math.max(1, Math.ceil((count / max) * 5)) : 0;
    return `<div class="hosp-rd-state${count ? ' has-data' : ''}" data-level="${level}" style="grid-column:${col};grid-row:${row}" title="${uf}: ${count} hospedado(s)"><b>${uf}</b>${count ? `<em>${count}</em>` : ''}</div>`;
  }).join('');
  const trend = trendPoints();
  $('#hospRdDashboard').innerHTML = `
    <div class="hosp-rd-kpis">
      <article class="hosp-rd-kpi" style="--accent:#4ade80"><strong>${hospedados}</strong><span>Hospedados agora</span><small>Colaboradores em reservas ativas</small></article>
      <article class="hosp-rd-kpi" style="--accent:#fde68a"><strong>${awaiting}</strong><span>Aguardando reserva</span><small>Agrupamentos contam como uma demanda</small></article>
      <article class="hosp-rd-kpi" style="--accent:#93c5fd"><strong>${checkins}</strong><span>Check-ins hoje</span><small>${brDate(t)}</small></article>
      <article class="hosp-rd-kpi" style="--accent:#c4b5fd"><strong>${checkouts}</strong><span>Checkouts hoje</span><small>${brDate(t)}</small></article>
    </div>
    <div class="hosp-rd-dashboard-grid">
      <article class="hosp-rd-card"><div class="hosp-rd-card-head"><div><h3>Distribuição por estado — <span class="hosp-rd-state-count">${statesWithData} estado(s)</span></h3><p>Quantidade de colaboradores hospedados atualmente</p></div></div><div class="hosp-rd-map-shell"><div class="hosp-rd-map"><div class="hosp-rd-map-grid">${stateHtml}</div></div></div></article>
      <article class="hosp-rd-card hosp-rd-trend"><div class="hosp-rd-card-head"><div><h3>Variação por data</h3><p>Colaboradores hospedados nos últimos 9 dias</p></div></div>${trend}</article>
    </div>`;
}
function trendPoints() {
  const end = today(), dates = Array.from({ length: 9 }, (_, i) => addDays(end, i - 8));
  const values = dates.map((date) => {
    let total = 0;
    uniqueReservations().forEach((r) => {
      const people = reservationPeople(r.reserva_id, false);
      if (people.length) people.forEach(({ person, assignment }) => {
        const cin = reservationDateForPerson(person, 'in'), planned = reservationDateForPerson(person, 'out');
        const cout = assignment.checkout_em ? iso(assignment.checkout_em) : planned;
        if (cin && cin <= date && (!cout || cout >= date)) total += 1;
      });
      else { const rg = reservationRange(r.reserva_id); if (rg.checkin && rg.checkin <= date && (!rg.checkout || rg.checkout >= date)) total += Number(r.total_colaboradores || 1); }
    });
    return total;
  });
  const max = Math.max(1, ...values), w = 500, h = 220, padX = 24, top = 20, bottom = 38;
  const points = values.map((v, i) => `${padX + i * ((w - padX * 2) / (values.length - 1))},${top + (1 - v / max) * (h - top - bottom)}`).join(' ');
  const labels = dates.map((d, i) => `<text x="${padX + i * ((w - padX * 2) / (dates.length - 1))}" y="208" text-anchor="middle">${brDate(d).slice(0,5)}</text>`).join('');
  return `<svg viewBox="0 0 500 220" aria-label="Variação por data"><g stroke="rgba(74,222,128,.10)" stroke-width="1"><line x1="24" y1="55" x2="476" y2="55"/><line x1="24" y1="105" x2="476" y2="105"/><line x1="24" y1="155" x2="476" y2="155"/></g><polyline fill="none" stroke="#4ade80" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${points}"/><g fill="#789587" font-size="9">${labels}</g></svg>`;
}

function filterUnits(units, scope) {
  const q = norm(state.search[scope]); if (!q) return units;
  return units.filter((u) => norm([u.row.cidade,u.row.uf,u.row.supervisao,u.row.solicitante_nome,...u.people.map((p) => p.nome_colaborador)].join(' ')).includes(q));
}
function renderSolicitacoes() {
  const units = filterUnits(requestUnits(), 'solicitacoes');
  $('#hospRdSolicitacoes').innerHTML = `<div class="hosp-rd-toolbar"><div class="hosp-rd-title"><h3>Solicitações</h3><p>Solicitações enviadas pelos gestores. Todas as ações permanecem visíveis.</p></div><div class="hosp-rd-toolbar-right"><div class="hosp-rd-field hosp-rd-search"><label>Buscar</label><input data-hosp-rd-search="solicitacoes" value="${esc(state.search.solicitacoes)}" placeholder="Colaborador, cidade, supervisão..." /></div></div></div>
    <div class="hosp-rd-table-wrap"><table class="hosp-rd-table"><thead><tr><th>Solicitação</th><th>Data</th><th>Dias</th><th>Colaboradores</th><th>Cidade</th><th>UF</th><th>Supervisão</th><th>Solicitante</th><th>Opções</th></tr></thead><tbody>${units.length ? units.map(requestRowHtml).join('') : '<tr><td colspan="9"><div class="hosp-rd-empty">Nenhuma solicitação pendente.</div></td></tr>'}</tbody></table></div>`;
}
function requestRowHtml(unit) {
  const kind = requestKind(unit), row = unit.row;
  const date = iso(row.data_checkin || row.data_checkin_prevista), maxCheckout = unit.rows.map((r) => iso(r.data_checkout || r.data_checkout_prevista)).filter(Boolean).sort().at(-1);
  const days = unit.rows.map((r) => Number(r.quantidade_diarias_prevista || diffDays(r.data_checkin_prevista, r.data_checkout_prevista))).filter(Boolean);
  const dayLabel = days.length > 1 ? [...new Set(days)].join(' / ') : (days[0] || diffDays(date, maxCheckout));
  const names = unit.people.map((p) => p.nome_colaborador || p.nome).filter(Boolean);
  const supervisors = [...new Set(unit.people.map((p) => p.supervisao).filter(Boolean))];
  const css = kind === 'Extensão' ? 'extensao' : kind === 'Checkout' ? 'checkout' : 'checkin';
  return `<tr data-request-unit="${esc(unit.ids.join(','))}"><td><span class="hosp-rd-type ${css}">${esc(kind === 'Checkin' ? 'Check-in' : kind)}</span>${unit.ids.length > 1 ? `<span class="hosp-rd-sub">${unit.ids.length} solicitações agrupadas</span>` : ''}</td><td>${brDate(date)}</td><td>${esc(dayLabel)}</td><td><div class="hosp-rd-people">${names.length ? names.map((n) => `<span class="hosp-rd-person">${esc(n)}</span>`).join('') : `<span class="hosp-rd-person">${esc(row.colaboradores || row.colaborador || '-')}</span>`}</div></td><td>${esc(row.cidade || '-')}</td><td>${esc(row.uf || '-')}</td><td>${esc(supervisors.join(', ') || row.supervisao || '-')}</td><td>${esc(row.solicitante_nome || '-')}</td><td><div class="hosp-rd-actions">
    <button class="hosp-rd-icon-btn blue" data-hosp-rd-action="extend" data-ids="${esc(unit.ids.join(','))}" title="Estender">${icon('extend')}</button>
    <button class="hosp-rd-icon-btn" data-hosp-rd-action="group" data-ids="${esc(unit.ids.join(','))}" title="Agrupar">${icon('group')}</button>
    <button class="hosp-rd-icon-btn amber" data-hosp-rd-action="quote" data-ids="${esc(unit.ids.join(','))}" title="Cotar">${icon('quote')}</button>
    <button class="hosp-rd-icon-btn green" data-hosp-rd-action="reserve" data-ids="${esc(unit.ids.join(','))}" title="Reservar / Check-in">${icon('reserve')}</button>
    <button class="hosp-rd-icon-btn red" data-hosp-rd-action="reject" data-ids="${esc(unit.ids.join(','))}" title="Recusar">${icon('reject')}</button>
  </div></td></tr>`;
}
function unitFromIds(raw) {
  const ids = String(raw || '').split(',').filter(Boolean), rows = ids.map((id) => state.rowsByRequest.get(String(id))).filter(Boolean);
  const items = rows.map((row) => ({ row, people: pendingPeople(row) }));
  return { row: rows[0], rows, ids, items, people: items.flatMap((i) => i.people) };
}

function renderAndamento() {
  const units = activeReservations().map((row) => ({ row, reservaId: row.reserva_id, people: reservationPeople(row.reserva_id, true) }));
  const filtered = filterUnits(units.map((u) => ({ ...u, row: u.row, people: u.people.map((x) => x.person) })), 'andamento');
  $('#hospRdAndamento').innerHTML = `<div class="hosp-rd-toolbar"><div class="hosp-rd-title"><h3>Em Andamento</h3><p>Reservas em uso. Checkout, extras, pagamento e cancelamento ficam em janelas separadas.</p></div><div class="hosp-rd-toolbar-right"><div class="hosp-rd-field hosp-rd-search"><label>Buscar</label><input data-hosp-rd-search="andamento" value="${esc(state.search.andamento)}" placeholder="Colaborador, hotel, cidade..." /></div></div></div>
    <div class="hosp-rd-table-wrap"><table class="hosp-rd-table"><thead><tr><th>Entrada</th><th>Saída</th><th>Colaboradores</th><th>Hotel</th><th>Cidade</th><th>UF</th><th>Opções</th></tr></thead><tbody>${filtered.length ? filtered.map(activeRowHtml).join('') : '<tr><td colspan="7"><div class="hosp-rd-empty">Nenhuma hospedagem em andamento.</div></td></tr>'}</tbody></table></div>`;
}
function activeRowHtml(unit) {
  const row = unit.row, range = reservationRange(row.reserva_id, true), people = reservationPeople(row.reserva_id, true).map((x) => x.person);
  return `<tr><td>${brDate(range.checkin)}</td><td>${brDate(range.checkout)}</td><td><div class="hosp-rd-people">${people.map((p) => `<span class="hosp-rd-person">${esc(p.nome_colaborador || '-')}</span>`).join('')}</div></td><td>${esc(row.hotel || hotelById(row.hotel_id)?.nome || '-')}</td><td>${esc(row.cidade || row.cidade_hotel || '-')}</td><td>${esc(row.uf || row.uf_hotel || '-')}</td><td><div class="hosp-rd-actions"><button class="hosp-rd-icon-btn blue" data-hosp-rd-action="checkout" data-reserva="${esc(row.reserva_id)}" title="Checkout">${icon('checkout')}</button><button class="hosp-rd-icon-btn" data-hosp-rd-action="extras" data-reserva="${esc(row.reserva_id)}" title="Extras">${icon('extra')}</button><button class="hosp-rd-icon-btn amber" data-hosp-rd-action="pay" data-reserva="${esc(row.reserva_id)}" title="Pagar">${icon('pay')}</button><button class="hosp-rd-icon-btn red" data-hosp-rd-action="cancel-reservation" data-reserva="${esc(row.reserva_id)}" title="Cancelar">${icon('reject')}</button></div></td></tr>`;
}

function finalizedUnits() {
  const result = [];
  const byLot = new Set();
  state.checkoutLots.filter((l) => String(l.status || '').toUpperCase() !== 'CANCELADO').forEach((lot) => {
    byLot.add(String(lot.reserva_id));
    const row = reservationRow(lot.reserva_id); if (!row) return;
    const names = state.checkoutPeople.filter((p) => String(p.lote_id) === String(lot.id)).map((p) => p.nome_colaborador).filter(Boolean);
    result.push({ type: 'lot', id: lot.id, lot, row, names });
  });
  uniqueReservations().filter((r) => String(r.status_hospedagem || '').toUpperCase() === 'CHECKOUT_REALIZADO' && !byLot.has(String(r.reserva_id))).forEach((row) => result.push({ type: 'legacy', id: row.reserva_id, row, names: reservationPeople(row.reserva_id, false).map((x) => x.person.nome_colaborador) }));
  return result.sort((a, b) => String(b.lot?.data_checkout || b.row.data_checkout || '').localeCompare(String(a.lot?.data_checkout || a.row.data_checkout || '')));
}
function renderFinalizado() {
  const units = finalizedUnits(); const q = norm(state.search.finalizado); const filtered = q ? units.filter((u) => norm([u.row.hotel,u.row.cidade,...u.names].join(' ')).includes(q)) : units;
  $('#hospRdFinalizado').innerHTML = `<div class="hosp-rd-toolbar"><div class="hosp-rd-title"><h3>Finalizado</h3><p>O checkout encerra a hospedagem operacional, mesmo que pagamento ou documentos ainda estejam pendentes.</p></div><div class="hosp-rd-toolbar-right"><div class="hosp-rd-field hosp-rd-search"><label>Buscar</label><input data-hosp-rd-search="finalizado" value="${esc(state.search.finalizado)}" placeholder="Colaborador, hotel, cidade..." /></div></div></div>
    <div class="hosp-rd-table-wrap"><table class="hosp-rd-table"><thead><tr><th>Saída</th><th>Dias</th><th>Colaboradores</th><th>Hotel</th><th>Cidade</th><th>UF</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${filtered.length ? filtered.map(finalRowHtml).join('') : '<tr><td colspan="8"><div class="hosp-rd-empty">Nenhuma hospedagem finalizada.</div></td></tr>'}</tbody></table></div>`;
}
function finalRowHtml(unit) {
  const row = unit.row, checkout = unit.lot?.data_checkout || row.data_checkout || row.data_checkout_prevista;
  const names = unit.names.length ? unit.names : reservationPeople(row.reserva_id, false).map((x) => x.person.nome_colaborador);
  const days = names.map((name) => {
    const person = reservationPeople(row.reserva_id, false).map((x) => x.person).find((p) => norm(p.nome_colaborador) === norm(name));
    const cin = reservationDateForPerson(person, 'in') || row.data_checkin; return diffDays(cin, checkout);
  });
  const fin = financeForReservation(row.reserva_id), value = unit.lot?.valor_total || fin?.valor_total || reservationTotal(row);
  return `<tr><td>${brDate(checkout)}</td><td>${days.map((d) => esc(d)).join('<br>')}</td><td><div class="hosp-rd-people">${names.map((n) => `<span class="hosp-rd-person">${esc(n)}</span>`).join('')}</div></td><td>${esc(row.hotel || hotelById(row.hotel_id)?.nome || '-')}</td><td>${esc(row.cidade || '-')}</td><td>${esc(row.uf || '-')}</td><td>${money(value)}</td><td><div class="hosp-rd-actions"><button class="hosp-rd-btn" data-hosp-rd-action="pay" data-reserva="${esc(row.reserva_id)}">Pagar</button><button class="hosp-rd-btn" data-hosp-rd-action="attachments" data-reserva="${esc(row.reserva_id)}">Anexos</button></div></td></tr>`;
}

function hotelRowsByFilter() {
  const activeIds = new Set(activeReservations().map((r) => String(r.hotel_id)).filter(Boolean));
  let rows = state.hotels.filter((h) => String(h.status || 'ATIVO').toUpperCase() !== 'INATIVO');
  if (state.hotelFilter === 'uso') rows = rows.filter((h) => activeIds.has(String(h.id)));
  else if (state.hotelFilter === 'negativos') rows = rows.filter((h) => hotelDebt(h.id) > availableCredit(h.id));
  else if (state.hotelFilter === 'saldo') rows = rows.filter((h) => availableCredit(h.id) > 0);
  const q = norm(state.search.hoteis); if (q) rows = rows.filter((h) => norm([h.nome,h.cidade,h.uf,h.razao_social,h.cnpj_cpf].join(' ')).includes(q));
  return rows;
}
function renderHoteis() {
  const rows = hotelRowsByFilter(), totalCredit = state.hotels.reduce((s,h) => s + availableCredit(h.id),0), totalDebt = state.hotels.reduce((s,h) => s + hotelDebt(h.id),0);
  const month = today().slice(0,7), paidMonth = state.finance.filter((f) => String(f.status_financeiro).toUpperCase() === 'PAGO' && iso(f.data_pagamento || f.pago_em).startsWith(month)).reduce((s,f) => s + Number(f.valor_pago || f.valor_total || 0),0);
  $('#hospRdHoteis').innerHTML = `<div class="hosp-rd-hotel-summary"><article class="hosp-rd-hotel-metric credit"><span>Crédito em hotéis</span><strong>${money(totalCredit)}</strong></article><article class="hosp-rd-hotel-metric debt"><span>A pagar</span><strong>${money(totalDebt)}</strong></article><article class="hosp-rd-hotel-metric"><span>Pago no mês</span><strong>${money(paidMonth)}</strong></article></div>
  <div class="hosp-rd-toolbar"><div class="hosp-rd-title"><h3>Hotéis</h3><p>Cadastro, pendências, créditos e fluxo financeiro por hotel.</p></div><div class="hosp-rd-toolbar-right"><button class="hosp-rd-btn" data-hosp-rd-action="cashflow">${icon('flow')} Fluxo de caixa</button><div class="hosp-rd-field hosp-rd-search"><label>Buscar</label><input data-hosp-rd-search="hoteis" value="${esc(state.search.hoteis)}" placeholder="Hotel, cidade, CNPJ..." /></div></div></div>
  <div class="hosp-rd-toolbar"><div class="hosp-rd-toolbar-left"><button class="hosp-rd-btn ${state.hotelFilter==='todos'?'primary':''}" data-hosp-rd-hotel-filter="todos">Todos</button><button class="hosp-rd-btn ${state.hotelFilter==='uso'?'primary':''}" data-hosp-rd-hotel-filter="uso">Em Uso</button><button class="hosp-rd-btn ${state.hotelFilter==='negativos'?'primary':''}" data-hosp-rd-hotel-filter="negativos">Negativos</button><button class="hosp-rd-btn ${state.hotelFilter==='saldo'?'primary':''}" data-hosp-rd-hotel-filter="saldo">Com Saldo</button></div></div>
  <div class="hosp-rd-table-wrap"><table class="hosp-rd-table"><thead><tr><th>Hotel</th><th>Cidade</th><th>UF</th><th>Saldo</th><th>Opções</th></tr></thead><tbody>${rows.length ? rows.map(hotelRowHtml).join('') : '<tr><td colspan="5"><div class="hosp-rd-empty">Nenhum hotel nesta janela.</div></td></tr>'}</tbody></table></div>`;
}
function hotelRowHtml(h) {
  const credit = availableCredit(h.id), debt = hotelDebt(h.id), net = credit - debt;
  return `<tr><td><strong>${esc(h.nome || '-')}</strong>${h.razao_social ? `<span class="hosp-rd-sub">${esc(h.razao_social)}</span>` : ''}</td><td>${esc(h.cidade || '-')}</td><td>${esc(h.uf || '-')}</td><td><span class="hosp-rd-pill ${net>0?'green':net<0?'red':''}">${net > 0 ? `Crédito ${money(net)}` : net < 0 ? `A pagar ${money(Math.abs(net))}` : 'Zerado'}</span></td><td><div class="hosp-rd-actions"><button class="hosp-rd-icon-btn" data-hosp-rd-action="edit-hotel" data-hotel="${esc(h.id)}" title="Editar">${icon('edit')}</button><button class="hosp-rd-icon-btn" data-hosp-rd-action="hotel-pending" data-hotel="${esc(h.id)}" title="Pendências">${icon('pending')}</button><button class="hosp-rd-icon-btn red" data-hosp-rd-action="remove-hotel" data-hotel="${esc(h.id)}" title="Remover">${icon('reject')}</button></div></td></tr>`;
}

function openModal(title, sub, html, size = '') {
  state.activeModal = title;
  $('#hospRdModalTitle').textContent = title; $('#hospRdModalSub').textContent = sub || '';
  $('#hospRdModalBody').innerHTML = html; $('#hospRdModalCard').className = `hosp-rd-modal-card ${size}`;
  $('#hospRdModal').classList.add('open'); $('#hospRdModal').setAttribute('aria-hidden','false');
}
function closeModal() { $('#hospRdModal')?.classList.remove('open'); $('#hospRdModal')?.setAttribute('aria-hidden','true'); state.activeModal = null; }
let toastTimer;
function toast(message, error = false) { const t = $('#hospRdToast'); if (!t) return; t.textContent = message; t.classList.toggle('error', error); t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }

function openGroup(unit) {
  const row = unit.row, date = iso(row.data_checkin || row.data_checkin_prevista);
  const candidates = pendingRequestRows().filter((r) => !unit.ids.includes(String(r.solicitacao_id)) && norm(r.cidade) === norm(row.cidade) && norm(r.uf) === norm(row.uf) && iso(r.data_checkin || r.data_checkin_prevista) === date);
  openModal('Agrupar solicitações', `${brDate(date)} · ${row.cidade || '-'} · ${row.uf || '-'}`, `<div class="hosp-rd-modal-section"><h4>Solicitação principal</h4><div class="hosp-rd-list">${unit.people.map((p) => `<div class="hosp-rd-list-row"><div><strong>${esc(p.nome_colaborador || '-')}</strong></div><span class="hosp-rd-pill blue">Principal</span></div>`).join('')}</div></div><div class="hosp-rd-modal-section"><h4>Agrupar</h4><div class="hosp-rd-list">${candidates.length ? candidates.map((r) => `<label class="hosp-rd-check"><input type="checkbox" data-group-candidate="${esc(r.solicitacao_id)}"><span>${esc(pendingPeople(r).map((p)=>p.nome_colaborador).join(', ') || r.colaboradores || '-')}</span></label>`).join('') : '<div class="hosp-rd-empty">Nenhuma outra solicitação compatível.</div>'}</div></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Recusar agrupamento</button><button class="hosp-rd-btn primary" data-hosp-rd-modal="confirm-group" data-base-ids="${esc(unit.ids.join(','))}" ${candidates.length?'':'disabled'}>Confirmar</button></div>`, 'small');
}
function confirmGroup(button) {
  const base = String(button.dataset.baseIds || '').split(',').filter(Boolean), selected = $$('[data-group-candidate]:checked', $('#hospRdModal')).map((x) => x.dataset.groupCandidate);
  const all = [...new Set([...base, ...selected])]; if (all.length < 2) return;
  for (const [key, ids] of state.manualGroups) { if (all.some((id) => ids.has(id))) state.manualGroups.delete(key); }
  state.manualGroups.set(all[0], new Set(all)); closeModal(); renderSolicitacoes(); updateCounts(); toast(`${all.length} solicitações agrupadas.`);
}
function triggerBase(action, solicitationId) {
  let helper = $('#hospRdBaseActionHelper'); if (!helper) { helper = document.createElement('button'); helper.id='hospRdBaseActionHelper'; helper.type='button'; helper.hidden=true; $('#pageContent')?.appendChild(helper); }
  helper.dataset.action = action; helper.dataset.id = solicitationId; helper.click();
}
function startReserve(unit) {
  state.pendingReserveIds = [...unit.ids]; window.__hospedagemSolicitacoesAgrupadas = [...unit.ids]; triggerBase('reservar', unit.row.solicitacao_id); setTimeout(() => enhanceReserveModal(unit), 60);
}
function startExtend(unit, candidate) {
  if (!candidate?.solicitacao_id) return toast('Reserva atual não localizada para extensão.', true);
  window.__hospedagemExtensaoSolicitacoes = [...unit.ids]; triggerBase('estender', candidate.solicitacao_id);
}
function reserveDecision(unit) {
  const candidate = extensionCandidateForUnit(unit);
  if (!candidate) return startReserve(unit);
  openModal('Colaborador já hospedado', `${unit.people.map((p)=>p.nome_colaborador).filter(Boolean).join(', ')}`, `<div class="hosp-rd-modal-section"><p style="margin:0;color:#d9eee3;font-size:12px">O colaborador já possui uma hospedagem ativa em <strong>${esc(candidate.hotel || '-')}</strong>. Deseja iniciar uma nova reserva ou estender a atual?</p></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn blue" data-hosp-rd-modal="new-reservation" data-ids="${esc(unit.ids.join(','))}">Nova reserva</button><button class="hosp-rd-btn primary" data-hosp-rd-modal="extend-existing" data-ids="${esc(unit.ids.join(','))}" data-target="${esc(candidate.solicitacao_id)}">Estender</button></div>`, 'small');
}
function quoteMessage(row, unit) {
  const count = unit.people.length || 1;
  const checkout = unit.rows.map((r) => iso(r.data_checkout || r.data_checkout_prevista)).filter(Boolean).sort().at(-1);
  const diarias = Math.max(1, ...unit.rows.map((r) => Number(r.quantidade_diarias_prevista || diffDays(r.data_checkin_prevista, r.data_checkout_prevista)) || 1));
  return `Olá! A Grão 1000 solicita uma cotação de hospedagem.\n\nSolicitação: ${row.codigo || row.solicitacao_id}\nCidade: ${[row.cidade, row.uf].filter(Boolean).join('/')}\nCheck-in: ${brDate(row.data_checkin_prevista || row.data_checkin)}\nCheck-out: ${brDate(checkout)}\nPessoas: ${count}\nQuartos: ${roomsLabel(row)}\nDiárias previstas: ${diarias}\n\nPor favor, informe disponibilidade, valor das diárias, valor total, café da manhã, estacionamento e se aceita pagamento no checkout.`;
}
function quoteUnit(unit) {
  const row = unit.row;
  const matching = state.hotels.filter((h) => String(h.status || '').toUpperCase() !== 'INATIVO' && String(h.status || '').toUpperCase() !== 'BLOQUEADO' && h.recebe_cotacao !== false && norm(h.cidade) === norm(row.cidade) && (!row.uf || !h.uf || norm(h.uf) === norm(row.uf)));
  const hotelsHtml = matching.length ? matching.map((h) => `<label class="hosp-rd-check"><input type="checkbox" data-quote-hotel value="${esc(h.id)}" ${h.whatsapp ? 'checked' : 'disabled'}><span>${esc(h.nome)} — ${esc(h.whatsapp || 'sem WhatsApp cadastrado')}</span></label>`).join('') : '<div class="hosp-rd-empty">Nenhum hotel ativo com WhatsApp cadastrado nesta cidade.</div>';
  state.pendingQuoteRow = row;
  openModal('Solicitar cotação', `${row.cidade || '-'}/${row.uf || ''}`, `<div class="hosp-rd-modal-section"><h4>Hotéis</h4><div class="hosp-rd-list">${hotelsHtml}</div></div><div class="hosp-rd-field full" style="margin-top:12px"><label>Mensagem que será enviada</label><textarea id="hospRdQuoteMessage" rows="8">${esc(quoteMessage(row, unit))}</textarea></div><div class="hosp-rd-modal-actions"><span id="hospRdQuoteFeedback" class="hosp-rd-feedback"></span><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn primary" data-hosp-rd-modal="send-quote" data-ids="${esc(unit.ids.join(','))}">Enviar cotação</button></div>`, 'wide');
}
function quoteFeedback(message, error = false) { const el = $('#hospRdQuoteFeedback'); if (!el) return; el.textContent = message || ''; el.className = `hosp-rd-feedback ${error ? 'err' : 'ok'}`; }
async function sendQuote(button) {
  const row = state.pendingQuoteRow; if (!row) return;
  const ids = String(button.dataset.ids || '').split(',').filter(Boolean);
  const hotelIds = $$('[data-quote-hotel]:checked', $('#hospRdModal')).map((el) => el.value);
  const hotels = state.hotels.filter((h) => hotelIds.includes(String(h.id)) && h.whatsapp);
  const message = $('#hospRdQuoteMessage')?.value.trim();
  if (!hotels.length) return quoteFeedback('Selecione pelo menos um hotel com WhatsApp.', true);
  if (!message) return quoteFeedback('A mensagem não pode ficar vazia.', true);
  quoteFeedback(`Enviando para ${hotels.length} hotel(is)...`);
  await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'EM_COTACAO' }).in('id', ids.length ? ids : [row.solicitacao_id]);
  let sent = 0; const failures = [];
  for (const hotel of hotels) {
    let quoteId = null;
    const { data } = await supabase.from('hospedagem_cotacoes').upsert({ solicitacao_id: row.solicitacao_id, hotel_id: hotel.id, hotel_nome: hotel.nome, status: 'ENVIANDO', quantidade_pessoas: unit_people_count(row), diarias_previstas: Number(row.quantidade_diarias_prevista || 1), aceita_pagamento_checkout: hotel.aceita_pagamento_checkout ?? null, mensagem_enviada: message }, { onConflict: 'solicitacao_id,hotel_id' }).select('id').single();
    quoteId = data?.id || null;
    try {
      const { data: res, error } = await supabase.functions.invoke('botconversa-send', { body: { phone: onlyDigits(hotel.whatsapp), nome: hotel.nome, message, flowId: HOSP_COTACAO_FLOW_ID } });
      if (error || res?.ok === false) throw new Error(res?.error || error?.message || 'Falha no envio');
      sent += 1;
      if (quoteId) await supabase.from('hospedagem_cotacoes').update({ status: 'ENVIADA', enviado_em: new Date().toISOString(), erro_envio: null }).eq('id', quoteId);
    } catch (err) {
      failures.push(`${hotel.nome}: ${err.message}`);
      if (quoteId) await supabase.from('hospedagem_cotacoes').update({ status: 'FALHA', erro_envio: err.message }).eq('id', quoteId);
    }
  }
  quoteFeedback(`${sent}/${hotels.length} enviados${failures.length ? ` · ${failures.join(' | ')}` : ''}`, failures.length > 0);
  await loadData();
  if (!failures.length) setTimeout(closeModal, 900);
}
function unit_people_count(row) { return peopleForRequest(row.solicitacao_id).length || null; }
function rejectUnit(unit) {
  openModal('Recusar solicitação', unit.people.map((p)=>p.nome_colaborador).filter(Boolean).join(', '), `<div class="hosp-rd-field"><label>Qual o motivo da recusa?</label><textarea id="hospRdRejectReason" rows="5" placeholder="Informe o motivo"></textarea></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn danger" data-hosp-rd-modal="confirm-reject" data-ids="${esc(unit.ids.join(','))}">Confirmar</button></div>`, 'small');
}
async function confirmReject(button) {
  const reason = $('#hospRdRejectReason')?.value.trim(); if (!reason) return toast('Informe o motivo da recusa.', true);
  const ids = String(button.dataset.ids||'').split(',').filter(Boolean);
  const payload = { status_solicitacao:'CANCELADA', motivo_cancelamento:reason, cancelado_em:new Date().toISOString(), cancelado_por:state.user?.id || null };
  const { error } = await supabase.from('hospedagem_solicitacoes').update(payload).in('id', ids); if (error) return toast(error.message,true);
  closeModal(); toast('Solicitação recusada.'); await loadData();
}

function enhanceReserveModal(unit) {
  const modal = $('#modalReservar'); if (!modal?.classList.contains('open')) return;
  const confirmed = $('#resConfirmado')?.closest('.adm-hosp-field')?.querySelector('label'); if (confirmed) confirmed.textContent='Responsável';
  let extra = modal.querySelector('.hosp-rd-reserve-extra'); if (!extra) { extra=document.createElement('section'); extra.className='hosp-rd-reserve-extra'; const room=modal.querySelector('.adm-room-wrap'); room?.insertAdjacentElement('afterend', extra); }
  extra.innerHTML = `<h4>Despesas inclusas</h4><div class="hosp-rd-inclusions"><label class="hosp-rd-inclusion"><input type="checkbox" id="hospRdIncluiCafe"> Café da manhã</label><label class="hosp-rd-inclusion"><input type="checkbox" id="hospRdIncluiAlmoco"> Almoço</label><label class="hosp-rd-inclusion"><input type="checkbox" id="hospRdIncluiJanta"> Jantar</label><label class="hosp-rd-inclusion"><input type="checkbox" id="hospRdIncluiEstacionamento"> Estacionamento</label></div><h4 style="margin-top:13px">Colaboradores / gênero</h4><div class="hosp-rd-gender-list">${unit.people.map((p,i)=>`<div class="hosp-rd-gender-row"><span>${esc(p.nome_colaborador||'-')}</span><select data-hosp-rd-gender="${i}" data-name="${esc(p.nome_colaborador||'')}"><option value="">Não informado</option><option value="Feminino">Feminino</option><option value="Masculino">Masculino</option></select></div>`).join('')}</div><div class="adm-hosp-field" style="margin-top:12px"><label>Emite NF?</label><select id="hospRdEmiteNf"><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select></div>`;
  const syncHotel = () => {
    const typed = $('#resHotelNome')?.value || '', selected = $('#resHotel')?.value;
    const hotel = state.hotels.find((h)=>String(h.id)===String(selected)) || state.hotels.find((h)=>norm(h.nome)===norm(typed)); if (!hotel) return;
    $('#hospRdIncluiCafe').checked=Boolean(hotel.inclui_cafe); $('#hospRdIncluiAlmoco').checked=Boolean(hotel.inclui_almoco); $('#hospRdIncluiJanta').checked=Boolean(hotel.inclui_janta); $('#hospRdIncluiEstacionamento').checked=Boolean(hotel.estacionamento); $('#hospRdEmiteNf').value=hotel.emite_nota_fiscal===true?'true':hotel.emite_nota_fiscal===false?'false':'';
  };
  $('#resHotelNome')?.addEventListener('change',syncHotel,{once:true}); $('#resHotel')?.addEventListener('change',syncHotel,{once:true}); setTimeout(syncHotel,30);
}
function captureReserveMeta() {
  if (!$('#modalReservar')?.classList.contains('open') || !state.pendingReserveIds.length) return;
  state.pendingReserveMeta = {
    ids:[...state.pendingReserveIds], cafe:Boolean($('#hospRdIncluiCafe')?.checked), almoco:Boolean($('#hospRdIncluiAlmoco')?.checked), janta:Boolean($('#hospRdIncluiJanta')?.checked), estacionamento:Boolean($('#hospRdIncluiEstacionamento')?.checked), emiteNf:$('#hospRdEmiteNf')?.value,
    genders:$$('[data-hosp-rd-gender]', $('#modalReservar')).map((s)=>({name:s.dataset.name,value:s.value})).filter((x)=>x.value),
    hotelName:$('#resHotelNome')?.value || '', hotelId:$('#resHotel')?.value || null,
  };
  watchReserveSuccess();
}
function watchReserveSuccess() {
  const feedback = $('#reservarFeedback'); if (!feedback || feedback.dataset.hospRdWatching==='1') return; feedback.dataset.hospRdWatching='1';
  const observer = new MutationObserver(async () => {
    const text=String(feedback.textContent||''); if (text.includes('Reserva salva com sucesso')) { observer.disconnect(); delete feedback.dataset.hospRdWatching; await persistReserveMeta(); }
    else if (feedback.classList.contains('err')) { observer.disconnect(); delete feedback.dataset.hospRdWatching; }
  }); observer.observe(feedback,{childList:true,subtree:true,characterData:true,attributes:true});
  setTimeout(()=>{observer.disconnect(); delete feedback.dataset.hospRdWatching;},120000);
}
async function persistReserveMeta() {
  const meta=state.pendingReserveMeta; if(!meta) return; await new Promise(r=>setTimeout(r,250));
  let reservaId=null; const {data:links}=await supabase.from('hospedagem_reserva_solicitacoes').select('reserva_id,solicitacao_id').in('solicitacao_id',meta.ids); if(links?.length) reservaId=links[0].reserva_id;
  if(!reservaId){const {data:r}=await supabase.from('hospedagem_reservas').select('id').in('solicitacao_id',meta.ids).order('created_at',{ascending:false}).limit(1);reservaId=r?.[0]?.id||null;}
  if(reservaId){const {data:current}=await supabase.from('hospedagem_reservas').select('observacao_hospedagem,hotel_id').eq('id',reservaId).maybeSingle(); const genderLine=meta.genders.length?`Gênero: ${meta.genders.map((g)=>`${g.name}=${g.value}`).join('; ')}`:''; const obs=[current?.observacao_hospedagem,genderLine].filter(Boolean).join('\n'); await supabase.from('hospedagem_reservas').update({inclui_cafe:meta.cafe,inclui_almoco:meta.almoco,inclui_janta:meta.janta,estacionamento:meta.estacionamento,observacao_hospedagem:obs||null}).eq('id',reservaId); const hotelId=current?.hotel_id||meta.hotelId; if(hotelId&&meta.emiteNf!=='')await supabase.from('hospedagem_hoteis').update({emite_nota_fiscal:meta.emiteNf==='true'}).eq('id',hotelId);}
  state.pendingReserveMeta=null; state.pendingReserveIds=[]; await loadData();
}

function openCheckout(reservaId) {
  const row=reservationRow(reservaId), people=reservationPeople(reservaId,true); if(!row||!people.length)return toast('Nenhum colaborador ativo nesta reserva.',true);
  openModal('Checkout', `${row.hotel||'-'} · ${row.cidade||'-'}/${row.uf||''}`, `<div class="hosp-rd-modal-section"><h4>Selecione os colaboradores</h4><div class="hosp-rd-list">${people.map((x,i)=>`<label class="hosp-rd-check"><input type="checkbox" data-checkout-person="${esc(x.person.id)}" checked><span>${esc(x.person.nome_colaborador||'-')}</span></label>`).join('')}</div></div><div class="hosp-rd-field"><label>Data do checkout</label><input id="hospRdCheckoutDate" type="date" value="${today()}"></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn primary" data-hosp-rd-modal="confirm-checkout" data-reserva="${esc(reservaId)}">Confirmar checkout</button></div>`, 'small');
}
async function confirmCheckout(button) {
  const reservaId=button.dataset.reserva,date=$('#hospRdCheckoutDate')?.value||today(),ids=$$('[data-checkout-person]:checked',$('#hospRdModal')).map((x)=>x.dataset.checkoutPerson); if(!ids.length)return toast('Selecione ao menos um colaborador.',true);
  const row=reservationRow(reservaId), selected=reservationPeople(reservaId,true).filter((x)=>ids.includes(String(x.person.id))); const checkoutTs=new Date(`${date}T12:00:00-03:00`).toISOString();
  for(const item of selected){const {error}=await supabase.from('hospedagem_reserva_colaboradores').update({status:'CHECKOUT',checkout_em:checkoutTs,checkout_por:state.user?.id||null}).eq('reserva_id',reservaId).eq('solicitacao_colaborador_id',item.person.id);if(error)return toast(error.message,true);}
  const all=assignmentsForReservation(reservaId,false), selectedSet=new Set(ids), remaining=all.filter((a)=>activeAssignment(a)&&!selectedSet.has(String(a.solicitacao_colaborador_id))); const totalPeople=Math.max(1,all.length), base=Number(row?.valor_total_previsto||0), proportion=selected.length/totalPeople, lotTotal=base*proportion;
  const {data:lot,error:lotError}=await supabase.from('hospedagem_checkout_lotes').insert({reserva_id:reservaId,hotel_id:row?.hotel_id||null,data_checkout:date,valor_diarias:lotTotal,valor_extras:0,valor_total:lotTotal,status:'PENDENTE',observacoes:'Checkout registrado pelo módulo Hotéis'}).select('id').single(); if(lotError)return toast(lotError.message,true);
  if(lot?.id)await supabase.from('hospedagem_checkout_lote_colaboradores').insert(selected.map((x)=>({lote_id:lot.id,reserva_colaborador_id:x.person.id,nome_colaborador:x.person.nome_colaborador||'-'})));
  await supabase.from('hospedagem_reservas').update({status_hospedagem:remaining.length?'HOSPEDADO':'CHECKOUT_REALIZADO',data_checkout:remaining.length?(row?.data_checkout||null):date,atualizado_por:state.user?.id||null}).eq('id',reservaId);
  closeModal();toast(remaining.length?'Checkout parcial registrado. Os demais permanecem hospedados.':'Checkout registrado e movido para Finalizado.');await loadData();
}

function openExtras(reservaId) {
  const row=reservationRow(reservaId), people=reservationPeople(reservaId,true).map((x)=>x.person), existing=extrasForReservation(reservaId); if(!row)return;
  openModal('Extras', `${row.hotel||'-'} · Total atual ${money(extrasTotal(reservaId))}`, `<div class="hosp-rd-modal-section"><h4>Já lançados</h4><div class="hosp-rd-list">${existing.length?existing.map((e)=>`<div class="hosp-rd-list-row"><div><strong>${esc(e.descricao||e.tipo||'Extra')}</strong><small>${esc(e.quantidade||1)} un · ${e.enviar_conferencia?'Enviado à Conferência':'Custo da hospedagem'}</small></div><span>${money(extraSignedTotal(e))}</span></div>`).join(''):'<div class="hosp-rd-empty">Nenhum extra lançado.</div>'}</div></div><div class="hosp-rd-modal-section"><h4>Novo lançamento</h4><div id="hospRdExtraRows"><div class="hosp-rd-extra-row" data-new-extra><div class="hosp-rd-field"><label>Un</label><input data-extra-qty type="number" min="1" step="1" value="1"></div><div class="hosp-rd-field"><label>Descrição</label><input data-extra-desc placeholder="Água, refrigerante, lavanderia..."></div><div class="hosp-rd-field"><label>Valor</label><input data-extra-value type="number" min="0" step="0.01"></div><div class="hosp-rd-field hosp-rd-extra-caixa"><label>Caixa?</label><select data-extra-person><option value="">Nenhum</option>${people.map((p)=>`<option value="${esc(p.id)}">${esc(p.nome_colaborador||'-')}</option>`).join('')}</select></div><button class="hosp-rd-icon-btn red hosp-rd-extra-remove" data-remove-extra type="button">${icon('reject')}</button></div></div><button class="hosp-rd-btn" data-hosp-rd-modal="add-extra-row" data-reserva="${esc(reservaId)}" type="button">+ Adicionar extra</button></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn primary" data-hosp-rd-modal="save-extras" data-reserva="${esc(reservaId)}">Confirmar</button></div>`, 'wide');
}
function addExtraRow(reservaId) {
  const people=reservationPeople(reservaId,true).map((x)=>x.person),wrap=$('#hospRdExtraRows');if(!wrap)return;
  wrap.insertAdjacentHTML('beforeend',`<div class="hosp-rd-extra-row" data-new-extra><div class="hosp-rd-field"><label>Un</label><input data-extra-qty type="number" min="1" step="1" value="1"></div><div class="hosp-rd-field"><label>Descrição</label><input data-extra-desc></div><div class="hosp-rd-field"><label>Valor</label><input data-extra-value type="number" min="0" step="0.01"></div><div class="hosp-rd-field hosp-rd-extra-caixa"><label>Caixa?</label><select data-extra-person><option value="">Nenhum</option>${people.map((p)=>`<option value="${esc(p.id)}">${esc(p.nome_colaborador||'-')}</option>`).join('')}</select></div><button class="hosp-rd-icon-btn red hosp-rd-extra-remove" data-remove-extra type="button">${icon('reject')}</button></div>`);
}
async function saveExtras(reservaId) {
  const row=reservationRow(reservaId), sourceId=linkedRequestIds(reservaId)[0]||row?.solicitacao_id; const items=$$('[data-new-extra]',$('#hospRdModal')).map((el)=>({qty:Number(el.querySelector('[data-extra-qty]')?.value||1),desc:el.querySelector('[data-extra-desc]')?.value.trim()||'',value:Number(el.querySelector('[data-extra-value]')?.value||0),personId:el.querySelector('[data-extra-person]')?.value||''})).filter((x)=>x.desc&&x.value>0); if(!items.length)return toast('Informe pelo menos um extra com descrição e valor.',true);
  for(const item of items){const person=state.peopleById.get(String(item.personId));const payload={solicitacao_id:sourceId||null,reserva_id:reservaId,tipo:'OUTROS',descricao:item.desc,quantidade:item.qty,valor_unitario:item.qty?item.value/item.qty:item.value,valor_total:item.value,data_custo:today(),observacoes:person?`CAIXA_COLABORADOR_ID=${person.id}; CAIXA_NOME=${person.nome_colaborador}`:null,enviar_conferencia:Boolean(person),status_conferencia:person?'PENDENTE':null};const {data:extra,error}=await supabase.from('hospedagem_custos_extras').insert(payload).select('id').single();if(error)return toast(error.message,true);if(person){const conference={data_referencia:today(),nome:person.nome_colaborador||null,colaborador:person.nome_colaborador||null,regional:person.regional||null,coordenacao:person.coordenacao||null,supervisao:person.supervisao||null,un:Math.max(1,Math.round(item.qty)),quantidade:Math.max(1,Math.round(item.qty)),situacao:'PENDENTE',status:'PENDENTE',observacoes:`Extra de hospedagem: ${item.desc}`,observacao:`Hotel ${row?.hotel||'-'} · Reserva ${reservaId}`,valor:item.value,origem:'HOSPEDAGEM',meta:{reserva_id:reservaId,extra_id:extra?.id||null,hotel_id:row?.hotel_id||null}};const {error:confError}=await supabase.from('conferencia_descontos').insert(conference);await supabase.from('hospedagem_custos_extras').update({status_conferencia:confError?'ERRO':'ENVIADO'}).eq('id',extra.id);if(confError)console.warn('[hosp-redesign] conferencia extra',confError);}}
  await syncReservationTotal(reservaId); closeModal();toast('Extras registrados. Itens com Caixa foram enviados à Conferência.');await loadData();
}
async function syncReservationTotal(reservaId) {
  const row=reservationRow(reservaId);if(!row)return;const total=Math.max(0,Number(row.valor_total_previsto||0)+extrasForReservation(reservaId).reduce((s,e)=>s+extraSignedTotal(e),0));await supabase.from('hospedagem_reservas').update({valor_total_final:total}).eq('id',reservaId);const fin=financeForReservation(reservaId);if(fin)await supabase.from('hospedagem_financeiro').update({valor_total:total,valor_original:total,saldo:Math.max(0,total-Number(fin.valor_pago||0))}).eq('id',fin.id);else await supabase.from('hospedagem_financeiro').insert({reserva_id:reservaId,valor_total:total,valor_original:total,status_financeiro:'NAO_INICIADO',saldo:total});
}

function openCancelReservation(reservaId) {
  const row=reservationRow(reservaId),people=reservationPeople(reservaId,true);if(!row)return;
  openModal('Cancelar hospedagem',row.hotel||'-',`<div class="hosp-rd-modal-section"><h4>Selecione os colaboradores</h4><div class="hosp-rd-list">${people.map((x)=>`<label class="hosp-rd-check"><input type="checkbox" data-cancel-person="${esc(x.person.id)}"><span>${esc(x.person.nome_colaborador||'-')}</span></label>`).join('')}</div></div><div class="hosp-rd-field"><label>Motivo</label><textarea id="hospRdCancelReason" rows="3"></textarea></div><div class="hosp-rd-modal-grid"><div class="hosp-rd-field"><label>Gerar crédito?</label><select id="hospRdCancelCredit"><option value="false">Não</option><option value="true">Sim</option></select></div><div class="hosp-rd-field"><label>Valor do crédito</label><input id="hospRdCancelValue" type="number" min="0" step="0.01" value="0"></div></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn danger" data-hosp-rd-modal="confirm-cancel-reservation" data-reserva="${esc(reservaId)}">Confirmar</button></div>`, 'small');
}
async function confirmCancelReservation(reservaId) {
  const ids=$$('[data-cancel-person]:checked',$('#hospRdModal')).map((x)=>x.dataset.cancelPerson),reason=$('#hospRdCancelReason')?.value.trim(),credit=$('#hospRdCancelCredit')?.value==='true',value=Number($('#hospRdCancelValue')?.value||0);if(!ids.length)return toast('Selecione ao menos um colaborador.',true);if(!reason)return toast('Informe o motivo.',true);if(credit&&value<=0)return toast('Informe o valor do crédito.',true);
  for(const personId of ids){await supabase.from('hospedagem_reserva_colaboradores').update({status:'CANCELADO',checkout_em:new Date().toISOString(),checkout_por:state.user?.id||null}).eq('reserva_id',reservaId).eq('solicitacao_colaborador_id',personId);}
  const row=reservationRow(reservaId),remaining=assignmentsForReservation(reservaId,true).filter((a)=>!ids.includes(String(a.solicitacao_colaborador_id)));if(!remaining.length)await supabase.from('hospedagem_reservas').update({status_hospedagem:'CANCELADA',observacao_hospedagem:`${row?.observacao_hospedagem||''}\nCancelamento: ${reason}`.trim()}).eq('id',reservaId);
  if(credit&&row?.hotel_id){const {data:adv,error}=await supabase.from('hospedagem_adiantamentos').insert({hotel_id:row.hotel_id,reserva_origem_id:reservaId,valor_creditado:value,saldo:value,status:'DISPONIVEL',observacoes:`Crédito por cancelamento: ${reason}`,criado_por:state.user?.id||null}).select('id').single();if(!error&&adv?.id)await supabase.from('hospedagem_adiantamento_movimentos').insert({adiantamento_id:adv.id,reserva_id:reservaId,tipo:'CREDITO',valor:value,observacoes:'Crédito gerado por cancelamento',criado_por:state.user?.id||null});}
  closeModal();toast(credit?'Cancelamento registrado e crédito lançado no hotel.':'Cancelamento registrado.');await loadData();
}

async function preparePayment(reservaId) {
  await syncReservationTotal(reservaId); await loadData(); const row=reservationRow(reservaId);if(!row)return;const total=reservationTotal(row),credit=availableCredit(row.hotel_id),ids=linkedRequestIds(reservaId);state.nativePayment={reservaId,row,total,credit,ids};window.__hospedagemAcaoLote=[...ids];const solId=ids[0]||row.solicitacao_id;if(typeof window.__abrirPagamentoHospedagem==='function')window.__abrirPagamentoHospedagem(solId);else triggerBase('enviar-pagamento',solId);setTimeout(()=>{const hotel=hotelById(row.hotel_id);if($('#pagarFornecedor'))$('#pagarFornecedor').value=hotel?.razao_social||hotel?.nome||row.hotel||'';if($('#pagarCnpj'))$('#pagarCnpj').value=hotel?.cnpj_cpf||'';if($('#pagarPix'))$('#pagarPix').value=hotel?.pix_chave||hotel?.chave_pix||'';if($('#pagarValor'))$('#pagarValor').value=Math.max(0,total-credit).toFixed(2);if($('#pagarResumoSelecao'))$('#pagarResumoSelecao').textContent=`Total da hospedagem ${money(total)}${credit?` · crédito disponível ${money(credit)}`:''}`;},100);
}
async function consumeCredits(hotelId,reservaId,limit){if(!hotelId||limit<=0)return 0;const{data,error}=await supabase.rpc('hospedagem_consumir_creditos',{p_hotel_id:hotelId,p_reserva_id:reservaId,p_limite:limit});if(error)throw error;return Number(data||0);}
async function upsertFinance(reservaId,payload){const existing=financeForReservation(reservaId);if(existing)return supabase.from('hospedagem_financeiro').update(payload).eq('id',existing.id);return supabase.from('hospedagem_financeiro').insert({reserva_id:reservaId,...payload});}
async function registerPaymentFromNative() {
  const ctx=state.nativePayment;if(!ctx)return;const paidCash=Number($('#pagarValor')?.value||0);const{data:lotes,error:loteError}=await supabase.from('hospedagem_checkout_lotes').select('id').eq('reserva_id',ctx.reservaId).in('status',['PENDENTE','PARCIAL']).order('created_at',{ascending:true}).limit(1);if(loteError)return toast(loteError.message,true);const loteId=lotes?.[0]?.id;if(!loteId)return toast('Nenhum lote pendente foi encontrado.',true);const{data,error}=await supabase.rpc('hospedagem_confirmar_pagamento_lote',{p_lote_id:loteId,p_valor_pago:paidCash,p_comprovante_url:null});if(error)return toast(error.message,true);const status=String(data?.status||'PARCIAL').toUpperCase();$('#modalPagar')?.classList.remove('open');state.nativePayment=null;toast(status==='PAGO'?'Pagamento registrado.':'Pagamento parcial registrado.');await loadData();
}
async function sendFinanceFromNative() {
  const ctx=state.nativePayment;if(!ctx)return;const{data:lotes,error:loteError}=await supabase.from('hospedagem_checkout_lotes').select('id').eq('reserva_id',ctx.reservaId).in('status',['PENDENTE','PARCIAL']).order('created_at',{ascending:false}).limit(1);if(loteError)return toast(loteError.message,true);const loteId=lotes?.[0]?.id;if(!loteId)return toast('Faça o checkout antes de enviar ao Financeiro.',true);const{error}=await supabase.rpc('hospedagem_enviar_lote_financeiro',{p_reserva_id:ctx.reservaId,p_lote_id:loteId});if(error)return toast(error.message,true);$('#modalPagar')?.classList.remove('open');state.nativePayment=null;toast('Lote enviado ao Financeiro sem alterar o status da hospedagem.');await loadData();
}

function triggerAttachments(reservaId) {
  const row=reservationRow(reservaId);if(!row)return;
  const ids=linkedRequestIds(reservaId);
  openDocumentModal(row, ids.length?ids:[String(row.solicitacao_id)]);
}
function reservationDocuments(row) {
  return state.documents.filter((d) => String(d.solicitacao_id || '') === String(row.solicitacao_id) || (row.reserva_id && String(d.reserva_id || '') === String(row.reserva_id)));
}
async function openDocumentModal(row, batchIds) {
  state.pendingDocumentRow = row;
  state.pendingDocumentIds = batchIds?.length ? batchIds : [String(row.solicitacao_id)];
  await renderDocumentModal(row);
}
async function signedDocumentUrl(value) {
  const raw=String(value||'');
  if (!raw.startsWith('storage://hospedagem-documentos/')) return raw;
  const path=raw.slice('storage://hospedagem-documentos/'.length);
  const {data,error}=await supabase.storage.from('hospedagem-documentos').createSignedUrl(path,900);
  return error?'':(data?.signedUrl||'');
}
async function renderDocumentModal(row) {
  const docs = reservationDocuments(row);
  const resolved=await Promise.all(docs.map(async(d)=>({...d,signed_url:await signedDocumentUrl(d.arquivo_url)})));
  const list = resolved.length ? resolved.map((d) => `<div class="hosp-rd-list-row"><div><strong>${esc(d.tipo || 'Documento')}</strong><small>${brDate(d.recebido_em || d.created_at)}${d.botconversa_enviado_em ? ' · enviado ao hotel' : ''}</small></div>${d.signed_url?`<a class="hosp-rd-btn" href="${esc(d.signed_url)}" target="_blank" rel="noopener">Abrir</a>`:'<span class="hosp-rd-feedback err">Sem acesso</span>'}</div>`).join('') : '<div class="hosp-rd-empty">Nenhum documento anexado.</div>';
  openModal('Documentos da hospedagem', `${row.hotel || hotelById(row.hotel_id)?.nome || '-'}`, `<div class="hosp-rd-modal-section"><h4>Já anexados</h4><div class="hosp-rd-list">${list}</div></div><div class="hosp-rd-modal-section"><h4>Novo documento</h4><div class="hosp-rd-modal-grid"><div class="hosp-rd-field"><label>Tipo</label><select id="hospV2DocumentType"><option value="COMPROVANTE">Comprovante de pagamento</option><option value="NFSE">NFS-e</option><option value="COTACAO">Cotação</option><option value="OUTRO">Outro</option></select></div><div class="hosp-rd-field"><label>Arquivo</label><input id="hospRdDocFile" type="file" accept="application/pdf,image/*"></div></div><div class="hosp-rd-field full" style="margin-top:8px"><label>Ou URL HTTPS</label><input id="hospRdDocUrl" placeholder="https://..."></div><label class="hosp-rd-check" style="margin-top:8px"><input type="checkbox" id="hospRdDocAutoSend" checked><span>Enviar automaticamente ao hotel quando for comprovante</span></label></div><div class="hosp-rd-modal-actions"><span id="hospRdDocFeedback" class="hosp-rd-feedback"></span><button class="hosp-rd-btn" data-hosp-rd-modal="close">Fechar</button><button class="hosp-rd-btn primary" id="hospV2SaveDocument" data-hosp-rd-modal="save-document">Anexar documento</button></div>`, 'wide');
}
function docFeedback(message, error = false) { const el = $('#hospRdDocFeedback'); if (!el) return; el.textContent = message || ''; el.className = `hosp-rd-feedback ${error ? 'err' : 'ok'}`; }
async function saveDocument() {
  const row = state.pendingDocumentRow; if (!row) return;
  const type = $('#hospV2DocumentType')?.value, file = $('#hospRdDocFile')?.files?.[0];
  let url = $('#hospRdDocUrl')?.value.trim() || '';
  if (!file && !/^https:\/\//i.test(url)) return docFeedback('Selecione um arquivo ou informe uma URL HTTPS.', true);
  docFeedback('Anexando documento...');
  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_'), path = `${row.solicitacao_id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('hospedagem-documentos').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) return docFeedback(uploadError.message, true);
    url = `storage://hospedagem-documentos/${path}`;
  }
  const ids = state.pendingDocumentIds?.length ? state.pendingDocumentIds : [String(row.solicitacao_id)];
  const targets = ids.map((id) => requestRow(id)).filter(Boolean);
  const documentTargets = targets.length ? targets : [row];
  const { data: docs, error } = await supabase.from('hospedagem_documentos').insert(documentTargets.map((item) => ({ solicitacao_id: item.solicitacao_id, reserva_id: item.reserva_id || row.reserva_id || null, tipo: type, arquivo_url: url, nome_arquivo: file?.name || url.split('/').pop(), mime_type: file?.type || null, origem: 'PAINEL', status: type === 'NFSE' ? 'RECEBIDO' : 'ANEXADO', recebido_em: new Date().toISOString() }))).select('*');
  if (error) return docFeedback(error.message, true);
  if (type === 'COMPROVANTE' && $('#hospRdDocAutoSend')?.checked) {
    const hotel = hotelById(row.hotel_id);
    if (hotel?.whatsapp) {
      const message = `Olá! Segue o comprovante de pagamento da hospedagem ${row.codigo || row.solicitacao_id}.`;
      const fileUrl=await signedDocumentUrl(url);
      const { data, error: sendError } = await supabase.functions.invoke('botconversa-send', { body: { phone: onlyDigits(hotel.whatsapp), nome: hotel.nome, message, fileUrl } });
      if (!sendError && data?.ok !== false) await supabase.from('hospedagem_documentos').update({ botconversa_enviado_em: new Date().toISOString(), botconversa_destinatario: hotel.whatsapp, status: 'ENVIADO' }).in('id', (docs || []).map((d) => d.id));
      else { docFeedback(`Documento anexado, mas o envio falhou: ${data?.error || sendError?.message}`, true); await loadData(); return; }
    }
  }
  docFeedback('Documento anexado.');
  await loadData();
  await renderDocumentModal(reservationRow(row.reserva_id) || row);
}
// Compatibilidade com adm-hotel-saldo-pagamento-safe.js (botão "Anexar NFSe"
// no modal nativo de pagamento) — mesma assinatura que fluxo-v2.js expunha.
window.__abrirHospedagemAcao = (action, solicitacaoId) => {
  const row = requestRow(solicitacaoId) || state.rows.find((r) => String(r.solicitacao_id) === String(solicitacaoId));
  if (!row) return;
  if (action === 'document') openDocumentModal(row, [String(row.solicitacao_id)]);
};

function openEditHotel(hotelId) {
  const h=hotelById(hotelId);if(!h)return;
  openModal('Editar hotel',h.nome||'',`<div class="hosp-rd-modal-grid"><div class="hosp-rd-field"><label>Nome Fantasia</label><input id="hospRdHotelNome" value="${esc(h.nome||'')}"></div><div class="hosp-rd-field"><label>CNPJ</label><input id="hospRdHotelCnpj" value="${esc(h.cnpj_cpf||'')}"></div><div class="hosp-rd-field"><label>Razão Social</label><input id="hospRdHotelRazao" value="${esc(h.razao_social||'')}"></div><div class="hosp-rd-field"><label>Cidade</label><input id="hospRdHotelCidade" value="${esc(h.cidade||'')}"></div><div class="hosp-rd-field"><label>UF</label><input id="hospRdHotelUf" maxlength="2" value="${esc(h.uf||'')}"></div><div class="hosp-rd-field"><label>Contato</label><input id="hospRdHotelContato" value="${esc(h.whatsapp||h.telefone||'')}"></div><div class="hosp-rd-field" style="grid-column:1/-1"><label>Endereço</label><input id="hospRdHotelEndereco" value="${esc(h.endereco||'')}"></div><div class="hosp-rd-field"><label>PIX</label><input id="hospRdHotelPix" value="${esc(h.pix_chave||h.chave_pix||'')}"></div><div class="hosp-rd-field"><label>Emite NF?</label><select id="hospRdHotelNf"><option value="true" ${h.emite_nota_fiscal===true?'selected':''}>Sim</option><option value="false" ${h.emite_nota_fiscal===false?'selected':''}>Não</option></select></div></div><div class="hosp-rd-modal-section"><h4>Diárias</h4><div class="hosp-rd-modal-grid three"><div class="hosp-rd-field"><label>Individual</label><input id="hospRdHotelIndividual" type="number" step="0.01" value="${esc(h.valor_diaria_individual||'')}"></div><div class="hosp-rd-field"><label>Duplo</label><input id="hospRdHotelDuplo" type="number" step="0.01" value="${esc(h.valor_diaria_duplo||'')}"></div><div class="hosp-rd-field"><label>Triplo</label><input id="hospRdHotelTriplo" type="number" step="0.01" value="${esc(h.valor_diaria_triplo||'')}"></div><div class="hosp-rd-field"><label>Quádruplo</label><input id="hospRdHotelQuad" type="number" step="0.01" value="${esc(h.valor_diaria_quadruplo||'')}"></div></div></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn primary" data-hosp-rd-modal="save-hotel" data-hotel="${esc(h.id)}">Salvar</button></div>`, 'wide');
}
async function saveHotel(hotelId) {
  const payload={nome:$('#hospRdHotelNome')?.value.trim(),cnpj_cpf:$('#hospRdHotelCnpj')?.value.trim()||null,razao_social:$('#hospRdHotelRazao')?.value.trim()||null,cidade:$('#hospRdHotelCidade')?.value.trim(),uf:$('#hospRdHotelUf')?.value.trim().toUpperCase(),endereco:$('#hospRdHotelEndereco')?.value.trim()||null,whatsapp:$('#hospRdHotelContato')?.value.trim()||null,pix_chave:$('#hospRdHotelPix')?.value.trim()||null,chave_pix:$('#hospRdHotelPix')?.value.trim()||null,emite_nota_fiscal:$('#hospRdHotelNf')?.value==='true',valor_diaria_padrao:Number($('#hospRdHotelIndividual')?.value||0)||null,valor_diaria_individual:Number($('#hospRdHotelIndividual')?.value||0)||null,valor_diaria_duplo:Number($('#hospRdHotelDuplo')?.value||0)||null,valor_diaria_triplo:Number($('#hospRdHotelTriplo')?.value||0)||null,valor_diaria_quadruplo:Number($('#hospRdHotelQuad')?.value||0)||null,atualizado_por:state.user?.id||null};if(!payload.nome||!payload.cidade)return toast('Informe nome e cidade.',true);const{error}=await supabase.from('hospedagem_hoteis').update(payload).eq('id',hotelId);if(error)return toast(error.message,true);closeModal();toast('Hotel atualizado.');await loadData();
}
function openHotelPending(hotelId) {
  const h=hotelById(hotelId),reservations=uniqueReservations().filter((r)=>String(r.hotel_id)===String(hotelId)).sort((a,b)=>String(a.data_checkin||'').localeCompare(String(b.data_checkin||'')));const credit=availableCredit(hotelId),debt=hotelDebt(hotelId);const lines=[];state.advances.filter((a)=>String(a.hotel_id)===String(hotelId)&&Number(a.valor_creditado||0)>0).forEach((a)=>lines.push(`<tr><td>${brDate(a.created_at)} Antecipado</td><td>-</td><td>-</td><td>${money(a.valor_creditado)}</td></tr>`));reservations.forEach((r)=>{const people=reservationPeople(r.reserva_id,false).map((x)=>x.person.nome_colaborador);const extra=extrasTotal(r.reserva_id),fin=financeForReservation(r.reserva_id);lines.push(`<tr><td>${brDate(r.data_checkin||r.data_checkin_prevista)} ${esc(people.join(', ')||r.colaboradores||'Reserva')}</td><td>${money(Number(r.valor_total_previsto||0))}</td><td>${extra?money(extra):'-'}</td><td>${Number(fin?.valor_pago||0)>0?money(fin.valor_pago):'-'}</td></tr>`)});const unpaid=reservations.find((r)=>{const f=financeForReservation(r.reserva_id);return !f||String(f.status_financeiro).toUpperCase()!=='PAGO';});openModal(`Pendências — ${h?.nome||'Hotel'}`,`${debt>credit?`A pagar ${money(debt-credit)}`:`Saldo a favor ${money(Math.max(0,credit-debt))}`}`,`<div class="hosp-rd-table-wrap"><table class="hosp-rd-flow-table"><thead><tr><th>Reservas</th><th>Diária / hospedagem</th><th>Extras</th><th>Pago</th></tr></thead><tbody>${lines.join('')||'<tr><td colspan="4">Sem movimentos</td></tr>'}</tbody></table></div><div class="hosp-rd-total"><span>${debt>credit?'Saldo a pagar':'Saldo disponível'}</span><strong>${money(Math.abs(credit-debt))}</strong></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="hotel-attachments" data-hotel="${esc(hotelId)}">Anexos</button><button class="hosp-rd-btn primary" data-hosp-rd-modal="hotel-pay" data-reserva="${esc(unpaid?.reserva_id||'')}" ${unpaid?'':'disabled'}>Pagar</button></div>`, 'wide');
}
function openHotelAttachments(hotelId) {const ids=new Set(uniqueReservations().filter((r)=>String(r.hotel_id)===String(hotelId)).map((r)=>String(r.reserva_id)));const docs=state.documents.filter((d)=>ids.has(String(d.reserva_id)));openModal('Anexos do hotel',hotelById(hotelId)?.nome||'',`<div class="hosp-rd-file-list">${docs.length?docs.map((d)=>`<div class="hosp-rd-file"><div><a href="${esc(d.arquivo_url)}" target="_blank" rel="noopener">${esc(d.nome_arquivo||d.tipo||'Documento')}</a><small>${esc(d.tipo||'')} · ${brDate(d.recebido_em||d.created_at)}</small></div><span class="hosp-rd-pill">${esc(d.status||'Recebido')}</span></div>`).join(''):'<div class="hosp-rd-empty">Nenhum anexo localizado.</div>'}</div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Fechar</button></div>`,'wide');}
async function removeHotel(hotelId) {const h=hotelById(hotelId);openModal('Remover hotel',h?.nome||'',`<p style="margin:0;color:#dceee5;font-size:12px">O hotel será marcado como inativo para preservar o histórico de reservas.</p><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn danger" data-hosp-rd-modal="confirm-remove-hotel" data-hotel="${esc(hotelId)}">Remover</button></div>`,'small');}
async function confirmRemoveHotel(hotelId){const{error}=await supabase.from('hospedagem_hoteis').update({status:'INATIVO',atualizado_por:state.user?.id||null}).eq('id',hotelId);if(error)return toast(error.message,true);closeModal();toast('Hotel removido da base ativa.');await loadData();}
function openCashflow(){const reservations=uniqueReservations(),lines=[];state.advances.forEach((a)=>lines.push({date:iso(a.created_at),type:'Crédito',desc:`${hotelById(a.hotel_id)?.nome||'Hotel'} · adiantamento`,in:Number(a.valor_creditado||0),out:0}));state.finance.forEach((f)=>{const r=reservationRow(f.reserva_id);if(Number(f.valor_pago||0)>0)lines.push({date:iso(f.data_pagamento||f.pago_em),type:'Pagamento',desc:`${r?.hotel||'Hotel'} · ${r?.codigo||''}`,in:0,out:Number(f.valor_pago||0)});});lines.sort((a,b)=>String(b.date).localeCompare(String(a.date)));openModal('Fluxo de caixa — Hotéis','Movimentos de créditos e pagamentos do módulo',`<div class="hosp-rd-table-wrap"><table class="hosp-rd-flow-table"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Entrada</th><th>Saída</th></tr></thead><tbody>${lines.length?lines.map((l)=>`<tr><td>${brDate(l.date)}</td><td>${esc(l.type)}</td><td>${esc(l.desc)}</td><td>${l.in?money(l.in):'-'}</td><td>${l.out?money(l.out):'-'}</td></tr>`).join(''):'<tr><td colspan="5">Sem movimentos.</td></tr>'}</tbody></table></div><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Fechar</button></div>`,'wide');}

async function handleAction(button) {
  const action=button.dataset.hospRdAction;if(action==='refresh'){await loadData();return;}if(action==='group')return openGroup(unitFromIds(button.dataset.ids));if(action==='quote')return quoteUnit(unitFromIds(button.dataset.ids));if(action==='reserve')return reserveDecision(unitFromIds(button.dataset.ids));if(action==='extend'){const u=unitFromIds(button.dataset.ids),candidate=extensionCandidateForUnit(u);if(candidate)return startExtend(u,candidate);return openModal('Extensão de estadia','Nenhuma hospedagem atual foi encontrada.',`<p style="margin:0;color:#dceee5;font-size:12px">Esta solicitação não possui uma reserva ativa compatível. Você pode iniciar uma nova reserva.</p><div class="hosp-rd-modal-actions"><button class="hosp-rd-btn" data-hosp-rd-modal="close">Cancelar</button><button class="hosp-rd-btn primary" data-hosp-rd-modal="new-reservation" data-ids="${esc(u.ids.join(','))}">Nova reserva</button></div>`,'small');}if(action==='reject')return rejectUnit(unitFromIds(button.dataset.ids));if(action==='checkout')return openCheckout(button.dataset.reserva);if(action==='extras')return openExtras(button.dataset.reserva);if(action==='pay')return preparePayment(button.dataset.reserva);if(action==='cancel-reservation')return openCancelReservation(button.dataset.reserva);if(action==='attachments')return triggerAttachments(button.dataset.reserva);if(action==='edit-hotel')return openEditHotel(button.dataset.hotel);if(action==='hotel-pending')return openHotelPending(button.dataset.hotel);if(action==='remove-hotel')return removeHotel(button.dataset.hotel);if(action==='cashflow')return openCashflow();
}
async function handleModalAction(button) {const a=button.dataset.hospRdModal;if(a==='close')return closeModal();if(a==='confirm-group')return confirmGroup(button);if(a==='confirm-reject')return confirmReject(button);if(a==='new-reservation'){const u=unitFromIds(button.dataset.ids);closeModal();return startReserve(u);}if(a==='extend-existing'){const u=unitFromIds(button.dataset.ids),target=state.rowsByRequest.get(String(button.dataset.target));closeModal();return startExtend(u,target);}if(a==='confirm-checkout')return confirmCheckout(button);if(a==='add-extra-row')return addExtraRow(button.dataset.reserva);if(a==='save-extras')return saveExtras(button.dataset.reserva);if(a==='confirm-cancel-reservation')return confirmCancelReservation(button.dataset.reserva);if(a==='save-hotel')return saveHotel(button.dataset.hotel);if(a==='confirm-remove-hotel')return confirmRemoveHotel(button.dataset.hotel);if(a==='hotel-pay'){closeModal();return preparePayment(button.dataset.reserva);}if(a==='hotel-attachments')return openHotelAttachments(button.dataset.hotel);if(a==='send-quote')return sendQuote(button);if(a==='save-document')return saveDocument();}

function bind() {
  const root=$('#hospRedesignRoot');if(!root)return;
  root.addEventListener('click',async(event)=>{const tab=event.target.closest('[data-hosp-rd-tab]');if(tab)return setTab(tab.dataset.hospRdTab);const filter=event.target.closest('[data-hosp-rd-hotel-filter]');if(filter){state.hotelFilter=filter.dataset.hospRdHotelFilter;renderHoteis();return;}const modal=event.target.closest('[data-hosp-rd-modal]');if(modal)return handleModalAction(modal);const action=event.target.closest('[data-hosp-rd-action]');if(action)return handleAction(action);const remove=event.target.closest('[data-remove-extra]');if(remove)return remove.closest('[data-new-extra]')?.remove();});
  root.addEventListener('input',(event)=>{
    const scope=event.target.dataset.hospRdSearch;if(!scope)return;
    state.search[scope]=event.target.value;
    const selStart=event.target.selectionStart,selEnd=event.target.selectionEnd;
    if(scope==='solicitacoes')renderSolicitacoes();else if(scope==='andamento')renderAndamento();else if(scope==='finalizado')renderFinalizado();else if(scope==='hoteis')renderHoteis();
    // Cada renderX() recria o HTML da aba inteira via innerHTML, o que apaga
    // e recria o próprio <input> de busca — sem restaurar foco/cursor aqui,
    // só o 1º caractere digitado registra (achado ao vivo 19/08).
    const fresh=root.querySelector(`[data-hosp-rd-search="${scope}"]`);
    if(fresh){fresh.focus();try{fresh.setSelectionRange(selStart,selEnd);}catch(err){}}
  });
  document.addEventListener('click',async(event)=>{
    if(event.target.closest('#btnConfirmarReserva'))captureReserveMeta();
    if(state.nativePayment&&event.target.closest('#btnPagarFinanceiro')){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();await sendFinanceFromNative();}
    else if(state.nativePayment&&event.target.closest('#btnConfirmarPagamento')){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();await registerPaymentFromNative();}
  },true);
  window.addEventListener('hashchange',()=>{const content=$('#pageContent');if(currentMode()==='hoteis'){content?.classList.add('hosp-rd-active');loadData();setupRealtime();}else content?.classList.remove('hosp-rd-active');});
}

// Tempo real: em vez de repovoar tudo a cada 60s tenha ou não mudado algo, a
// tela assina as tabelas relevantes e só recarrega quando o banco muda de
// verdade — mudança feita por outra pessoa/aba aparece em ~1s. Um poll de
// segurança bem espaçado (5min) cobre o caso raro de perder um evento
// (queda de conexão), sem virar o mecanismo principal de novo.
let realtimeChannel = null;
let reloadTimer = null;
function scheduleReload(delay = 400) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => { if (currentMode() === 'hoteis' && !state.loading) loadData(); }, delay);
}
function setupRealtime() {
  if (realtimeChannel || currentMode() !== 'hoteis') return;
  const tables = ['hospedagem_solicitacoes','hospedagem_reservas','hospedagem_reserva_colaboradores','hospedagem_financeiro','hospedagem_checkout_lotes','hospedagem_custos_extras','hospedagem_documentos','hospedagem_hoteis'];
  realtimeChannel = supabase.channel('hospedagem-hoteis-v2');
  tables.forEach((table) => realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table }, () => scheduleReload()));
  realtimeChannel.subscribe();
}

async function init() {
  let tries=0;while(!mount()&&tries<80){await new Promise(r=>setTimeout(r,50));tries+=1;}
  const root=$('#hospRedesignRoot');if(!root)return;
  // BUG (achado 19/08 testando ao vivo): o shell legado (adm-hotel.js) às
  // vezes só termina de renderizar DEPOIS que este mount() já rodou — o
  // innerHTML dele reescreve #pageContent inteiro e apaga o root recém
  // criado. adm-hotel-redesign-guard.js existe pra detectar isso e remontar.
  // Uma flag em window (versão anterior) bloqueava essa remontagem legítima
  // porque persistia mesmo com o root antigo já destruído: a tela ficava com
  // state.ready=true na memória (da instância morta) mas nada na tela e
  // nenhum clique funcionando, até um evento de realtime salvar de raspão
  // via querySelector buscando o DOM ao vivo. A flag fica no elemento (não
  // em window): um root NOVO nunca tem essa flag, então sempre reinicia o
  // boot; só evita bind()/loadData() duas vezes no MESMO root.
  if (root.dataset.v2Booted === '1') return;
  root.dataset.v2Booted = '1';
  const {data}=await supabase.auth.getUser();state.user=data?.user||null;state.userName=$('#welcomeUser')?.textContent?.replace(/^Olá\s*/i,'').trim()||state.user?.email||'Hotéis';
  bind(); if(currentMode()==='hoteis'){await loadData();setupRealtime();}
  setInterval(()=>{if(currentMode()==='hoteis'&&!state.loading)loadData();},300000);
  console.info(`[hosp-v2] ativo ${V2_VERSION}`);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
