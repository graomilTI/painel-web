import { supabase } from './supabaseClient.js';

const VERSION = '20260824-v2-shared1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();
const iso = (value) => String(value || '').slice(0, 10);

async function waitForV2State(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const shared = window.__hospedagemV2State;
    if (shared?.ready) return shared;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.__hospedagemV2State?.ready ? window.__hospedagemV2State : null;
}

const state = {
  reservationCheckout: new Map(),
  resolvedExtensions: new Set(),
  pendingRequestIds: [],
  lastRepairSignature: '',
  observer: null,
  timer: null,
};

function personIdentity(person) {
  const cpf = String(person?.cpf || '').replace(/\D/g, '');
  return cpf ? `CPF:${cpf}` : `NOME:${norm(person?.nome_colaborador || person?.nome)}`;
}

function brToIso(text) {
  const match = String(text || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function isoToBr(value) {
  const [y, m, d] = iso(value).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
}

function dedupeVisiblePeople() {
  $$('.hosp-rd-people').forEach((wrap) => {
    const seen = new Set();
    $$('.hosp-rd-person', wrap).forEach((item) => {
      const key = norm(item.textContent);
      if (!key || seen.has(key)) item.remove();
      else seen.add(key);
    });
  });
}

function projectReservationCheckout() {
  $$('#hospRdAndamento tbody tr').forEach((row) => {
    const action = row.querySelector('[data-reserva]');
    const reservaId = action?.dataset?.reserva;
    if (!reservaId) return;
    const checkout = state.reservationCheckout.get(String(reservaId));
    if (!checkout) return;
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;
    const current = brToIso(cells[1].textContent);
    if (!current || checkout > current) cells[1].textContent = isoToBr(checkout);
  });
}

function hideResolvedExtensionRequests() {
  const rows = $$('#hospRdSolicitacoes tbody tr');
  let visible = 0;
  rows.forEach((row) => {
    const buttons = $$('[data-ids]', row);
    const ids = [...new Set(buttons.flatMap((button) => String(button.dataset.ids || '').split(',')).map((id) => id.trim()).filter(Boolean))];
    const resolved = ids.length && ids.every((id) => state.resolvedExtensions.has(String(id)));
    row.style.display = resolved ? 'none' : '';
    if (!resolved) visible += 1;
  });
  const badge = $('#hospRdCountRequests');
  if (badge && rows.length) badge.textContent = String(visible);
}

function applyProjection() {
  dedupeVisiblePeople();
  projectReservationCheckout();
  hideResolvedExtensionRequests();
}

async function loadProjection() {
  try {
    const shared = await waitForV2State();
    let reservations = [];
    let links = [];
    let people = [];
    let assignments = [];

    if (shared?.ready) {
      const byReservation = new Map();
      (shared.rows || []).forEach((row) => {
        if (!row.reserva_id) return;
        const key = String(row.reserva_id);
        const checkout = iso(row.data_checkout || row.data_checkout_prevista);
        const current = byReservation.get(key);
        if (!current || (checkout && checkout > current.data_checkout)) {
          byReservation.set(key, { id: row.reserva_id, data_checkout: checkout });
        }
      });
      reservations = [...byReservation.values()];
      links = shared.links || [];
      people = shared.people || [];
      assignments = shared.assignments || [];
    } else {
      // Compatibilidade: somente se a fonte única V2 não iniciar.
      const [reservationsRes, linksRes, peopleRes, assignmentsRes] = await Promise.all([
        supabase.from('hospedagem_reservas').select('id,data_checkout'),
        supabase.from('hospedagem_reserva_solicitacoes').select('reserva_id,solicitacao_id'),
        supabase.from('hospedagem_solicitacao_colaboradores').select('id,solicitacao_id,nome_colaborador,cpf'),
        supabase.from('hospedagem_reserva_colaboradores').select('reserva_id,solicitacao_colaborador_id,status,checkout_em,created_at'),
      ]);
      reservations = reservationsRes.data || [];
      links = linksRes.data || [];
      people = peopleRes.data || [];
      assignments = assignmentsRes.data || [];
    }

    state.reservationCheckout.clear();
    reservations.forEach((reservation) => {
      if (reservation.id && reservation.data_checkout) state.reservationCheckout.set(String(reservation.id), iso(reservation.data_checkout));
    });

    const peopleById = new Map(people.map((person) => [String(person.id), person]));
    const peopleByRequest = new Map();
    people.forEach((person) => {
      const requestId = String(person.solicitacao_id || '');
      if (!peopleByRequest.has(requestId)) peopleByRequest.set(requestId, []);
      peopleByRequest.get(requestId).push(person);
    });

    const activeByReservation = new Map();
    assignments.forEach((assignment) => {
      const active = !assignment.checkout_em && !['CHECKOUT', 'CANCELADO'].includes(String(assignment.status || '').toUpperCase());
      if (!active) return;
      const reservaId = String(assignment.reserva_id || '');
      if (!activeByReservation.has(reservaId)) activeByReservation.set(reservaId, []);
      const person = peopleById.get(String(assignment.solicitacao_colaborador_id));
      if (person) activeByReservation.get(reservaId).push({ assignment, person });
    });

    state.resolvedExtensions.clear();
    links.forEach((link) => {
      const requestId = String(link.solicitacao_id || '');
      const reservaId = String(link.reserva_id || '');
      const requestPeople = peopleByRequest.get(requestId) || [];
      const occupants = activeByReservation.get(reservaId) || [];
      if (!requestPeople.length || !occupants.length) return;

      const allCoveredByIdentity = requestPeople.every((person) => {
        const identity = personIdentity(person);
        return occupants.some((occupant) => personIdentity(occupant.person) === identity);
      });
      const hasDirectAssignment = requestPeople.some((person) =>
        occupants.some((occupant) => String(occupant.person.id) === String(person.id))
      );

      // Extensão resolvida: a solicitação está vinculada à reserva, a pessoa já
      // existe nela pela identidade (CPF/nome), mas não por um segundo vínculo.
      if (allCoveredByIdentity && !hasDirectAssignment) state.resolvedExtensions.add(requestId);
    });

    applyProjection();
  } catch (error) {
    console.warn('[hosp-extensao-sem-duplicar] projeção', error);
  }
}

async function repairExtension(requestIds) {
  const ids = [...new Set((requestIds || []).map(String).filter(Boolean))];
  if (!ids.length) return;

  try {
    const [peopleRes, requestRes] = await Promise.all([
      supabase.from('hospedagem_solicitacao_colaboradores').select('id,solicitacao_id,nome_colaborador,cpf').in('solicitacao_id', ids),
      supabase.from('hospedagem_solicitacoes').select('id,status_solicitacao,data_checkout_prevista').in('id', ids),
    ]);
    if (peopleRes.error) throw peopleRes.error;

    const extensionPeople = peopleRes.data || [];
    const extensionPersonIds = extensionPeople.map((person) => person.id).filter(Boolean).map(String);
    if (!extensionPersonIds.length) return;

    // Aguarda o fluxo legado concluir o upsert. Em seguida o vínculo novo é
    // removido se a mesma pessoa já estava na reserva.
    const { data: extensionAssignments, error: assignmentError } = await supabase
      .from('hospedagem_reserva_colaboradores')
      .select('reserva_id,solicitacao_colaborador_id,status,checkout_em,created_at')
      .in('solicitacao_colaborador_id', extensionPersonIds);
    if (assignmentError) throw assignmentError;
    if (!(extensionAssignments || []).length) return;

    const peopleById = new Map(extensionPeople.map((person) => [String(person.id), person]));
    const reservationIds = [...new Set((extensionAssignments || []).map((assignment) => String(assignment.reserva_id)).filter(Boolean))];

    for (const reservaId of reservationIds) {
      const { data: allAssignments, error: allAssignmentsError } = await supabase
        .from('hospedagem_reserva_colaboradores')
        .select('reserva_id,solicitacao_colaborador_id,status,checkout_em,created_at')
        .eq('reserva_id', reservaId);
      if (allAssignmentsError) throw allAssignmentsError;

      const allPersonIds = (allAssignments || []).map((assignment) => assignment.solicitacao_colaborador_id).filter(Boolean).map(String);
      const { data: allPeople, error: allPeopleError } = allPersonIds.length
        ? await supabase.from('hospedagem_solicitacao_colaboradores').select('id,solicitacao_id,nome_colaborador,cpf').in('id', allPersonIds)
        : { data: [], error: null };
      if (allPeopleError) throw allPeopleError;
      const allPeopleById = new Map((allPeople || []).map((person) => [String(person.id), person]));

      for (const extensionAssignment of (extensionAssignments || []).filter((assignment) => String(assignment.reserva_id) === reservaId)) {
        const extensionPerson = peopleById.get(String(extensionAssignment.solicitacao_colaborador_id))
          || allPeopleById.get(String(extensionAssignment.solicitacao_colaborador_id));
        if (!extensionPerson) continue;
        const identity = personIdentity(extensionPerson);
        const samePersonAssignments = (allAssignments || [])
          .filter((assignment) => {
            const person = allPeopleById.get(String(assignment.solicitacao_colaborador_id));
            return person && personIdentity(person) === identity;
          })
          .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
        if (samePersonAssignments.length <= 1) continue;

        const keeper = samePersonAssignments[0];
        for (const duplicate of samePersonAssignments.slice(1)) {
          await supabase.from('hospedagem_reserva_colaboradores')
            .delete()
            .eq('reserva_id', reservaId)
            .eq('solicitacao_colaborador_id', duplicate.solicitacao_colaborador_id);
        }

        if (keeper) {
          await supabase.from('hospedagem_reserva_colaboradores')
            .update({ status: 'HOSPEDADO', checkout_em: null })
            .eq('reserva_id', reservaId)
            .eq('solicitacao_colaborador_id', keeper.solicitacao_colaborador_id);
        }
      }

      await supabase.from('hospedagem_reserva_solicitacoes').upsert(
        ids.map((solicitacao_id) => ({ reserva_id: reservaId, solicitacao_id })),
        { onConflict: 'reserva_id,solicitacao_id' }
      );

      const checkout = (requestRes.data || []).map((request) => iso(request.data_checkout_prevista)).filter(Boolean).sort().at(-1);
      if (checkout) {
        const { data: reservation } = await supabase.from('hospedagem_reservas').select('data_checkout').eq('id', reservaId).maybeSingle();
        const current = iso(reservation?.data_checkout);
        if (!current || checkout > current) {
          await supabase.from('hospedagem_reservas').update({ data_checkout: checkout }).eq('id', reservaId);
        }
      }
    }

    for (const request of (requestRes.data || [])) {
      if (String(request.status_solicitacao || '').toUpperCase() === 'CANCELADA') continue;
      await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'RESERVADA' }).eq('id', request.id);
    }

    if (window.__hospedagemV2Refresh) await window.__hospedagemV2Refresh();
    await loadProjection();
  } catch (error) {
    console.error('[hosp-extensao-sem-duplicar] reparo', error);
  }
}

function scheduleProjection() {
  clearTimeout(state.timer);
  state.timer = setTimeout(applyProjection, 40);
}

function bindExtensionRepair() {
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#btnConfirmarEstender')) return;
    state.pendingRequestIds = Array.isArray(window.__hospedagemExtensaoSolicitacoes)
      ? [...window.__hospedagemExtensaoSolicitacoes].map(String)
      : [];
  }, true);

  const observer = new MutationObserver(() => {
    scheduleProjection();
    const feedback = $('#estenderFeedback');
    const success = String(feedback?.textContent || '').includes('Extensão salva com sucesso.');
    if (!success || !state.pendingRequestIds.length) return;
    const signature = state.pendingRequestIds.slice().sort().join('|');
    if (!signature || signature === state.lastRepairSignature) return;
    state.lastRepairSignature = signature;
    const ids = [...state.pendingRequestIds];
    // A interface já é deduplicada imediatamente; o banco é reparado depois
    // que o fluxo legado terminou de gravar todos os vínculos.
    setTimeout(() => repairExtension(ids), 1200);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  state.observer = observer;
}

async function init() {
  bindExtensionRepair();
  await loadProjection();
  window.addEventListener('hospedagem:v2-data', loadProjection);
  console.info(`[hosp-extensao-sem-duplicar] ativo ${VERSION}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
