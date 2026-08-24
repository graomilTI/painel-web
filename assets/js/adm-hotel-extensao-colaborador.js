import { supabase } from './supabaseClient.js';

const PATCH_VERSION = '20260824-v2-shared1';

const state = {
  rows: [],
  peopleByRequest: new Map(),
  peopleById: new Map(),
  assignments: [],
  requesters: new Map(),
  visibleIds: [],
  visibleOrder: new Map(),
  selectedIds: new Set(),
  pendingAction: null,
  loading: false,
  ready: false,
  observer: null,
  timer: null,
  lastLoad: 0,
};

const $ = (selector, root = document) => root.querySelector(selector);

async function waitForV2State(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const shared = window.__hospedagemV2State;
    if (shared?.ready) return shared;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.__hospedagemV2State?.ready ? window.__hospedagemV2State : null;
}
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();
const isoDate = (value) => String(value || '').slice(0, 10);
const brDate = (value) => {
  const [y, m, d] = isoDate(value).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
};

function icon(name) {
  const paths = {
    hotel: '<path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M17 9h3v12M8 7h2M13 7h.01M8 11h2M13 11h.01M8 15h2M13 15h.01M2 21h20"/>',
    quote: '<path d="M4 5h16v10H8l-4 4V5Z"/><path d="M8 9h.01M12 9h.01M16 9h.01"/>',
    reserve: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    extend: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    reject: '<path d="M18 6 6 18M6 6l12 12"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.hotel}</svg>`;
}

function injectStyles() {
  if ($('#hospExtColabStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospExtColabStyles';
  style.textContent = `
    .hosp-v2-kpis{grid-template-columns:repeat(6,minmax(0,1fr))!important}
    .hosp-ext-kind{display:inline-flex;align-items:center;gap:5px;margin-left:7px;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:950;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
    .hosp-ext-kind.nova{color:#bbf7d0;background:rgba(34,197,94,.10);border:1px solid rgba(74,222,128,.22)}
    .hosp-ext-kind.extensao{color:#bae6fd;background:rgba(14,165,233,.10);border:1px solid rgba(56,189,248,.25)}
    .hosp-ext-row-note{display:block;margin-top:3px;color:#7f968c;font-size:9.5px;font-weight:750}
    .hosp-ext-warning{display:block;margin-top:3px;color:#fbbf24;font-size:9.5px;font-weight:800}
    @media (max-width:1450px){.hosp-v2-kpis{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
    @media (max-width:820px){.hosp-v2-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  `;
  document.head.appendChild(style);
}

function bucket(row) {
  const fin = String(row.status_financeiro || 'NAO_INICIADO').toUpperCase();
  const hosp = String(row.status_hospedagem || '').toUpperCase();
  const sol = String(row.status_solicitacao || '').toUpperCase();
  if (fin === 'PAGO') return 'nf';
  if (sol === 'CANCELADA') return 'cancelada';
  if (fin === 'ENVIADO_AO_FINANCEIRO' || row.pendencia_financeira || row.pendencia_nf) return 'pagar';
  if (row.checkout_hoje || row.checkout_vencido || ['CHECKOUT_HOJE', 'RENOVACAO_NECESSARIA', 'CHECKOUT_REALIZADO'].includes(hosp)) return 'pagar';
  if (sol === 'RESERVADA' || ['CHECKIN_PREVISTO', 'HOSPEDADO'].includes(hosp)) return 'reservados';
  return 'solicitadas';
}

function getPeople(row) {
  return state.peopleByRequest.get(String(row?.solicitacao_id || '')) || [];
}

function personKey(person) {
  return norm(person?.colaborador_id || person?.funcionario_id || person?.cpf || person?.nome_colaborador || person?.nome);
}

function requestPersonIds(row) {
  return getPeople(row).map((person) => person.id).filter(Boolean).map(String);
}

function assignedCurrentPersonIds() {
  return new Set(state.assignments.map((item) => item.solicitacao_colaborador_id).filter(Boolean).map(String));
}

function reservationPersonKeys(reservaId) {
  const result = new Set();
  state.assignments
    .filter((item) => String(item.reserva_id || '') === String(reservaId || ''))
    .forEach((item) => {
      const person = state.peopleById.get(String(item.solicitacao_colaborador_id || ''));
      const key = personKey(person);
      if (key) result.add(key);
    });
  return result;
}

function fallbackReservationPersonKeys(candidate) {
  return new Set(getPeople(candidate).map(personKey).filter(Boolean));
}

function candidateIsUsable(candidate, row, person) {
  if (!candidate?.reserva_id) return false;
  if (String(candidate.solicitacao_id || '') === String(row.solicitacao_id || '')) return false;
  if (String(candidate.status_solicitacao || '').toUpperCase() === 'CANCELADA') return false;
  if (String(candidate.status_hospedagem || '').toUpperCase() === 'CANCELADA') return false;
  if (norm(candidate.cidade) !== norm(row.cidade)) return false;
  const candidateUf = norm(candidate.uf), rowUf = norm(row.uf);
  if (candidateUf && rowUf && candidateUf !== rowUf) return false;

  const checkin = isoDate(row.data_checkin || row.data_checkin_prevista);
  const checkout = isoDate(candidate.data_checkout || candidate.data_checkout_prevista);
  if (!checkin || !checkout) return false;
  const delta = Math.round((new Date(`${checkin}T12:00:00`) - new Date(`${checkout}T12:00:00`)) / 86400000);
  if (delta !== 0 && delta !== 1) return false;

  const key = personKey(person);
  if (!key) return false;
  const occupants = reservationPersonKeys(candidate.reserva_id);
  const keys = occupants.size ? occupants : fallbackReservationPersonKeys(candidate);
  return keys.has(key);
}

function findExtensionForPerson(row, person) {
  const candidates = state.rows
    .filter((candidate) => candidateIsUsable(candidate, row, person))
    .map((candidate) => {
      const checkin = isoDate(row.data_checkin || row.data_checkin_prevista);
      const checkout = isoDate(candidate.data_checkout || candidate.data_checkout_prevista);
      const delta = Math.round((new Date(`${checkin}T12:00:00`) - new Date(`${checkout}T12:00:00`)) / 86400000);
      return { candidate, delta, checkout };
    })
    .sort((a, b) => a.delta - b.delta || String(b.checkout).localeCompare(String(a.checkout)));
  return candidates[0]?.candidate || null;
}

function pendingFragments(rows) {
  const assigned = assignedCurrentPersonIds();
  const fragments = [];

  rows.forEach((row) => {
    const people = getPeople(row);
    if (!people.length) {
      fragments.push({ row, person: null, extension: null, collabId: null });
      return;
    }
    people.forEach((person) => {
      if (person.id && assigned.has(String(person.id))) return;
      fragments.push({
        row,
        person,
        extension: findExtensionForPerson(row, person),
        collabId: person.id ? String(person.id) : null,
      });
    });
  });
  return fragments;
}

function currentFragmentFilters(fragment) {
  const colaborador = $('#solFiltroColaborador')?.value || '';
  const cidade = $('#solFiltroCidade')?.value || '';
  const supervisao = $('#solFiltroSupervisao')?.value || '';
  const data = $('#solFiltroData')?.value || '';
  const row = fragment.row, person = fragment.person || {};
  const name = person.nome_colaborador || person.nome || row.colaborador || row.colaboradores || '';
  const sup = person.supervisao || person.regional || row.supervisao || '';
  const checkin = isoDate(row.data_checkin || row.data_checkin_prevista);
  return (!colaborador || norm(name).includes(norm(colaborador)))
    && (!cidade || norm(row.cidade).includes(norm(cidade)))
    && (!supervisao || norm(sup).includes(norm(supervisao)))
    && (!data || checkin === data);
}

function fragmentGroupKey(fragment) {
  const row = fragment.row;
  const checkin = isoDate(row.data_checkin || row.data_checkin_prevista);
  const checkout = isoDate(row.data_checkout || row.data_checkout_prevista);
  const target = fragment.extension?.reserva_id ? `ext:${fragment.extension.reserva_id}` : 'nova';
  // A data faz parte da chave para impedir que solicitações da mesma cidade,
  // porém de períodos diferentes, sejam consolidadas no mesmo card.
  return [norm(row.cidade), norm(row.uf), checkin, checkout, target].join('|');
}

function groupFragments(fragments) {
  const groups = new Map();
  fragments.forEach((fragment) => {
    const key = fragmentGroupKey(fragment);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fragment);
  });
  return [...groups.values()].map((items) => {
    const requestIds = [...new Set(items.map((item) => String(item.row.solicitacao_id)).filter(Boolean))];
    const collabIds = [...new Set(items.map((item) => item.collabId).filter(Boolean))];
    const people = items.map((item) => item.person).filter(Boolean);
    const extension = items.find((item) => item.extension)?.extension || null;
    return { items, row: items[0].row, requestIds, collabIds, people, extension };
  });
}

function extractNativeVisibility(root) {
  const nativeRows = $$('.hosp-v2-request-row:not([data-hosp-ext-patched="1"])', root);
  if (!nativeRows.length) return false;

  const ids = [];
  const order = new Map();
  const selected = new Set();
  nativeRows.forEach((element, index) => {
    const action = element.querySelector('[data-group-ids]');
    const checkbox = element.querySelector('[data-v2-select]');
    const groupIds = (action?.dataset.groupIds || checkbox?.value || '').split(',').map((id) => id.trim()).filter(Boolean);
    groupIds.forEach((id) => {
      if (!order.has(id)) order.set(id, index);
      if (!ids.includes(id)) ids.push(id);
    });
    if (checkbox?.checked) groupIds.forEach((id) => selected.add(id));
  });
  state.visibleIds = ids;
  state.visibleOrder = order;
  state.selectedIds = selected;
  return true;
}

function patchButton(action, group, ico, label, cls = '') {
  const attrs = [
    `data-hosp-patch-action="${action}"`,
    `data-request-ids="${esc(group.requestIds.join(','))}"`,
    `data-collab-ids="${esc(group.collabIds.join(','))}"`,
    `data-id="${esc(group.row.solicitacao_id)}"`,
  ];
  if (group.extension?.reserva_id) attrs.push(`data-reserva-id="${esc(group.extension.reserva_id)}"`);
  return `<button type="button" class="hosp-v2-btn ${cls}" ${attrs.join(' ')} title="${esc(label)}" aria-label="${esc(label)}">${icon(ico)}</button>`;
}

function groupCoversAllPendingPeople(group) {
  const groupIds = new Set(group.collabIds.map(String));
  const assigned = assignedCurrentPersonIds();
  return group.requestIds.every((requestId) => {
    const row = state.rows.find((item) => String(item.solicitacao_id) === String(requestId));
    if (!row) return true;
    const pending = requestPersonIds(row).filter((id) => !assigned.has(String(id)));
    return pending.every((id) => groupIds.has(String(id)));
  });
}

function requestRowHtml(group) {
  const row = group.row;
  const city = [row.cidade, row.uf].filter(Boolean).join('/') || '-';
  const checkin = row.data_checkin || row.data_checkin_prevista;
  const diarias = row.quantidade_diarias_prevista || row.quantidade_diarias || '-';
  const names = group.people.length
    ? group.people.map((person) => person.nome_colaborador || person.nome || '-').filter(Boolean)
    : [row.colaborador || row.colaboradores || '-'];
  const supervisors = [...new Set(group.people.map((person) => person.supervisao || person.regional).filter(Boolean))];
  const requesters = [...new Set(group.requestIds.map((id) => state.requesters.get(String(id))).filter(Boolean))];
  const isExtension = Boolean(group.extension?.reserva_id);
  const kind = isExtension ? 'Extensão' : 'Nova reserva';
  const actions = isExtension
    ? [patchButton('extend', group, 'extend', 'Estender'), patchButton('cancel', group, 'reject', 'Recusar', 'red')]
    : [patchButton('quote', group, 'quote', 'Cotar', 'amber'), patchButton('reserve', group, 'reserve', 'Reservar'), patchButton('cancel', group, 'reject', 'Recusar', 'red')];
  const mixedWarning = !groupCoversAllPendingPeople(group)
    ? '<span class="hosp-ext-warning">Solicitação com outros colaboradores pendentes</span>'
    : '';

  return `<article class="hosp-v2-row hosp-v2-request-row" data-hosp-ext-patched="1">
    <div class="hosp-v2-cell"><div class="hosp-v2-city">${icon('hotel')}<span>${esc(city)}</span><span class="hosp-ext-kind ${isExtension ? 'extensao' : 'nova'}">${kind}</span></div></div>
    <div class="hosp-v2-cell"><div class="hosp-v2-date">${icon('reserve')}<span>${brDate(checkin)} · ${esc(diarias)} diária(s)${group.requestIds.length > 1 ? ` · ${group.requestIds.length} solicitações` : ''}</span></div>${isExtension ? `<span class="hosp-ext-row-note">Continuidade da reserva atual até ${brDate(group.extension.data_checkout || group.extension.data_checkout_prevista)}</span>` : ''}</div>
    <div class="hosp-v2-cell"><div class="hosp-v2-people">${names.map((name) => `<span class="hosp-v2-person">${esc(name)}</span>`).join(', ')}</div>${mixedWarning}</div>
    <div class="hosp-v2-cell"><div class="hosp-v2-supervision">${esc(supervisors.join(', ') || row.supervisao || '-')}</div></div>
    <div class="hosp-v2-cell"><div class="hosp-v2-hotel">${esc(requesters.join(', ') || row.solicitante_nome || '-')}</div></div>
    <div class="hosp-v2-cell actions"><div class="hosp-v2-actions">${actions.join('')}</div></div>
  </article>`;
}

function renderPatchedRequestList(force = false) {
  const root = $('#hospV2Solicitadas');
  if (!root || !state.ready) return;
  const captured = extractNativeVisibility(root);
  if (!captured && !force) return;
  if (!state.visibleIds.length) return;

  const visible = new Set(state.visibleIds.map(String));
  const rows = state.rows
    .filter((row) => bucket(row) === 'solicitadas' && visible.has(String(row.solicitacao_id)))
    .sort((a, b) => (state.visibleOrder.get(String(a.solicitacao_id)) ?? 99999) - (state.visibleOrder.get(String(b.solicitacao_id)) ?? 99999));

  const fragments = pendingFragments(rows).filter(currentFragmentFilters);
  const groups = groupFragments(fragments);

  $$('.hosp-v2-request-row', root).forEach((element) => element.remove());
  const previousEmpty = root.querySelector('.hosp-ext-empty');
  previousEmpty?.remove();

  if (!groups.length) {
    root.insertAdjacentHTML('beforeend', '<div class="hosp-v2-empty hosp-ext-empty">Nenhuma solicitação pendente para os filtros atuais.</div>');
    return;
  }
  root.insertAdjacentHTML('beforeend', groups.map(requestRowHtml).join(''));
}

function patchKpis() {
  const root = $('#hospV2Kpis');
  if (!root || !state.ready) return;
  const cards = [...root.children].filter((el) => el.classList?.contains('hosp-v2-kpi'));
  if (!cards.length) return;
  const labels = cards.map((card) => card.querySelector('small')?.textContent?.trim());
  if (labels.includes('Extensões') && labels.includes('Novas reservas')) return;

  const solicitationCard = cards.find((card) => card.querySelector('small')?.textContent?.trim() === 'Solicitações');
  if (!solicitationCard) return;

  const pendingRows = state.rows.filter((row) => bucket(row) === 'solicitadas');
  const fragments = pendingFragments(pendingRows);
  const extensions = fragments.filter((fragment) => fragment.extension);
  const newReservations = fragments.filter((fragment) => !fragment.extension);

  solicitationCard.querySelector('small').textContent = 'Novas reservas';
  solicitationCard.querySelector('strong').textContent = String(newReservations.length);
  const note = solicitationCard.querySelector('em');
  if (note) note.textContent = `${newReservations.length} colaborador(es)`;

  const extensionCard = solicitationCard.cloneNode(true);
  extensionCard.style.setProperty('--kpi', '#38bdf8');
  extensionCard.dataset.v2Tab = 'solicitadas';
  extensionCard.querySelector('small').textContent = 'Extensões';
  extensionCard.querySelector('strong').textContent = String(extensions.length);
  const extensionNote = extensionCard.querySelector('em');
  if (extensionNote) extensionNote.textContent = `${extensions.length} continuidade(s)`;
  solicitationCard.insertAdjacentElement('afterend', extensionCard);
}

function patchNow(force = false) {
  if (!state.ready) return;
  patchKpis();
  renderPatchedRequestList(force);
}

async function loadPatchData() {
  if (state.loading) return;
  state.loading = true;
  try {
    const shared = await waitForV2State();
    let rows = shared?.rows || null;
    let people = shared?.people || null;
    let assignments = shared?.assignments || null;

    // Fallback somente se o V2 não subir. Em operação normal este bloco não
    // executa e não há uma segunda carga concorrente do módulo.
    if (!shared?.ready) {
      const [rowsRes, peopleRes, assignmentsRes] = await Promise.all([
        supabase.from('hospedagem_painel_geral').select('*').order('data_solicitacao', { ascending: false }),
        supabase.from('hospedagem_solicitacao_colaboradores').select('*'),
        supabase.from('hospedagem_reserva_colaboradores').select('reserva_id,solicitacao_colaborador_id,status'),
      ]);
      if (rowsRes.error) throw rowsRes.error;
      if (peopleRes.error) throw peopleRes.error;
      rows = rowsRes.data || [];
      people = peopleRes.data || [];
      assignments = assignmentsRes.error ? [] : (assignmentsRes.data || []);
    }

    state.rows = rows || [];
    state.assignments = assignments || [];
    state.peopleByRequest.clear();
    state.peopleById.clear();
    (people || []).forEach((person) => {
      const requestId = String(person.solicitacao_id || '');
      if (!state.peopleByRequest.has(requestId)) state.peopleByRequest.set(requestId, []);
      state.peopleByRequest.get(requestId).push(person);
      if (person.id) state.peopleById.set(String(person.id), person);
    });
    state.requesters.clear();
    state.rows.forEach((item) => state.requesters.set(String(item.solicitacao_id || ''), item.solicitante_nome || ''));
    state.ready = true;
    state.lastLoad = Date.now();
    patchNow(true);
  } catch (error) {
    console.error('[hosp-extensao-colaborador] load', error);
  } finally {
    state.loading = false;
  }
}

function getGroupFromAction(button) {
  const requestIds = (button.dataset.requestIds || '').split(',').filter(Boolean);
  const collabIds = (button.dataset.collabIds || '').split(',').filter(Boolean);
  const rows = requestIds.map((id) => state.rows.find((row) => String(row.solicitacao_id) === String(id))).filter(Boolean);
  const people = collabIds.map((id) => state.peopleById.get(String(id))).filter(Boolean);
  const extension = button.dataset.reservaId
    ? state.rows.find((row) => String(row.reserva_id) === String(button.dataset.reservaId)) || { reserva_id: button.dataset.reservaId }
    : null;
  return { requestIds, collabIds, rows, people, row: rows[0], extension };
}

function triggerBaseAction(action, row) {
  if (!row?.solicitacao_id) return;
  let helper = $('#hospExtBaseActionHelper');
  if (!helper) {
    helper = document.createElement('button');
    helper.id = 'hospExtBaseActionHelper';
    helper.type = 'button';
    helper.hidden = true;
    $('#pageContent')?.appendChild(helper);
  }
  helper.dataset.action = action;
  helper.dataset.id = row.solicitacao_id;
  helper.click();
}

function triggerV2Action(action, group) {
  if (!group.row?.solicitacao_id) return;
  const helper = document.createElement('button');
  helper.type = 'button';
  helper.hidden = true;
  helper.dataset.v2Action = action;
  helper.dataset.id = group.row.solicitacao_id;
  helper.dataset.groupIds = group.requestIds.join(',');
  $('#pageContent')?.appendChild(helper);
  helper.click();
  helper.remove();
}

async function linkedReservations(requestIds) {
  if (!requestIds.length) return new Set();
  const { data } = await supabase
    .from('hospedagem_reserva_solicitacoes')
    .select('reserva_id,solicitacao_id')
    .in('solicitacao_id', requestIds);
  return new Set((data || []).map((item) => String(item.reserva_id)).filter(Boolean));
}

function allowedPersonNames(group) {
  return new Set(group.people.map((person) => norm(person.nome_colaborador || person.nome)).filter(Boolean));
}

function filterReserveModal(group) {
  const modal = $('#modalReservar');
  if (!modal?.classList.contains('open')) return false;
  const allowed = allowedPersonNames(group);
  if (!allowed.size) return true;
  const chips = $$('#reservarColabList .adm-colab-chip', modal);
  if (!chips.length) return false;
  chips.forEach((chip) => {
    const name = norm(chip.querySelector('.cn')?.textContent);
    const remove = chip.querySelector('[data-remove-colab]');
    if (remove && !allowed.has(name)) remove.click();
  });
  return true;
}

function adjustQuoteMessage(group) {
  const textarea = $('#hospV2QuoteMessage');
  if (!textarea) return;
  const count = group.people.length || group.collabIds.length;
  if (count) textarea.value = textarea.value.replace(/Pessoas:\s*[^\n\r]+/i, `Pessoas: ${count}`);
}

function waitForFeedback(elementId, successText, callback) {
  const element = document.getElementById(elementId);
  if (!element) return;
  let finished = false;
  const finish = async () => {
    if (finished) return;
    const text = String(element.textContent || '');
    if (text.includes(successText)) {
      finished = true;
      observer.disconnect();
      await callback();
      return;
    }
    if (element.classList.contains('err')) {
      finished = true;
      observer.disconnect();
      state.pendingAction = null;
    }
  };
  const observer = new MutationObserver(finish);
  observer.observe(element, { childList: true, subtree: true, characterData: true, attributes: true });
  finish();
  setTimeout(() => { if (!finished) observer.disconnect(); }, 120000);
}

async function resolveNewReservationId(pending) {
  const after = await linkedReservations(pending.group.requestIds);
  const fresh = [...after].filter((id) => !pending.beforeReservationIds.has(id));
  if (fresh.length) return fresh[0];

  const firstRequestId = pending.group.requestIds[0];
  if (!firstRequestId) return null;
  const { data } = await supabase
    .from('hospedagem_reservas')
    .select('id,solicitacao_id')
    .eq('solicitacao_id', firstRequestId)
    .limit(10);
  const candidates = (data || []).map((item) => String(item.id)).filter(Boolean);
  return candidates.find((id) => !pending.beforeReservationIds.has(id)) || candidates.at(-1) || null;
}

async function persistFragmentAssignment(reservaId, group) {
  if (!reservaId || !group.collabIds.length) return;
  const payload = group.collabIds.map((solicitacao_colaborador_id) => ({
    reserva_id: reservaId,
    solicitacao_colaborador_id,
    status: 'HOSPEDADO',
  }));
  const { error } = await supabase
    .from('hospedagem_reserva_colaboradores')
    .upsert(payload, { onConflict: 'reserva_id,solicitacao_colaborador_id' });
  if (error) console.error('[hosp-extensao-colaborador] vínculo colaborador/reserva', error);
}

async function reconcileRequestStatuses(requestIds) {
  const ids = [...new Set(requestIds.filter(Boolean).map(String))];
  if (!ids.length) return;
  const { data: people, error: peopleError } = await supabase
    .from('hospedagem_solicitacao_colaboradores')
    .select('id,solicitacao_id')
    .in('solicitacao_id', ids);
  if (peopleError) return;
  const peopleIds = (people || []).map((person) => person.id).filter(Boolean).map(String);
  const { data: assignments } = peopleIds.length
    ? await supabase.from('hospedagem_reserva_colaboradores').select('solicitacao_colaborador_id').in('solicitacao_colaborador_id', peopleIds)
    : { data: [] };
  const assigned = new Set((assignments || []).map((item) => String(item.solicitacao_colaborador_id)));

  for (const requestId of ids) {
    const requestPeople = (people || []).filter((person) => String(person.solicitacao_id) === requestId);
    if (!requestPeople.length) continue;
    const complete = requestPeople.every((person) => assigned.has(String(person.id)));
    await supabase
      .from('hospedagem_solicitacoes')
      .update({ status_solicitacao: complete ? 'RESERVADA' : 'SOLICITADA' })
      .eq('id', requestId);
  }
}

async function finishPendingAction() {
  const pending = state.pendingAction;
  if (!pending) return;
  try {
    const reservaId = pending.type === 'extend'
      ? pending.reservaId
      : await resolveNewReservationId(pending);
    await persistFragmentAssignment(reservaId, pending.group);
    await reconcileRequestStatuses(pending.group.requestIds);
  } finally {
    state.pendingAction = null;
    if (window.__hospedagemV2Refresh) await window.__hospedagemV2Refresh();
    await loadPatchData();
    setTimeout(() => document.getElementById('refreshPainel')?.click(), 100);
  }
}

async function handleReserve(group) {
  state.pendingAction = {
    type: 'reserve',
    group,
    beforeReservationIds: await linkedReservations(group.requestIds),
  };
  window.__hospedagemSolicitacoesAgrupadas = [...group.requestIds];
  triggerBaseAction('reservar', group.row);
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (filterReserveModal(group) || tries > 30) clearInterval(timer);
  }, 50);
  waitForFeedback('reservarFeedback', 'Reserva salva com sucesso.', finishPendingAction);
}

async function handleExtend(group) {
  const target = state.rows.find((row) => String(row.reserva_id) === String(group.extension?.reserva_id));
  if (!target) {
    window.alert('Não foi possível localizar a reserva atual para extensão. Atualize a tela e tente novamente.');
    return;
  }
  state.pendingAction = {
    type: 'extend',
    group,
    reservaId: String(group.extension.reserva_id),
    beforeReservationIds: await linkedReservations(group.requestIds),
  };
  window.__hospedagemExtensaoSolicitacoes = [...group.requestIds];
  triggerBaseAction('estender', target);
  waitForFeedback('estenderFeedback', 'Extensão salva com sucesso.', finishPendingAction);
}

async function handleCancel(group) {
  if (!groupCoversAllPendingPeople(group)) {
    window.alert('Esta solicitação possui outros colaboradores ainda pendentes. Para evitar cancelar a hospedagem deles, a recusa parcial foi bloqueada. Finalize primeiro a reserva/extensão dos demais ou recuse a solicitação completa pelo fluxo administrativo.');
    return;
  }
  triggerV2Action('cancel', group);
}

function handleQuote(group) {
  triggerV2Action('quote', group);
  setTimeout(() => adjustQuoteMessage(group), 0);
}

async function handlePatchedAction(event) {
  const button = event.target.closest('[data-hosp-patch-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const group = getGroupFromAction(button);
  if (!group.row) return;
  const action = button.dataset.hospPatchAction;
  if (action === 'reserve') await handleReserve(group);
  else if (action === 'extend') await handleExtend(group);
  else if (action === 'quote') handleQuote(group);
  else if (action === 'cancel') await handleCancel(group);
}

function schedulePatch() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => { patchNow(false); }, 35);
}

function observe() {
  const root = $('#pageContent');
  if (!root || state.observer) return;
  state.observer = new MutationObserver(schedulePatch);
  state.observer.observe(root, { childList: true, subtree: true });
}

function bind() {
  document.addEventListener('click', handlePatchedAction, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('#refreshPainel')) setTimeout(loadPatchData, 650);
  });
  ['solFiltroColaborador', 'solFiltroCidade', 'solFiltroSupervisao', 'solFiltroData'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', schedulePatch);
    document.getElementById(id)?.addEventListener('change', schedulePatch);
  });
}

async function init() {
  injectStyles();
  observe();
  bind();
  await loadPatchData();
  window.addEventListener('hospedagem:v2-data', () => { if (!state.loading) loadPatchData(); });
  console.info(`[hosp-extensao-colaborador] ativo ${PATCH_VERSION}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
