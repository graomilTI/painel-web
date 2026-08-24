import { supabase } from './supabaseClient.js';

const VERSION = '20260824-v2-shared1';
const state = { periods: new Map(), observer: null, timer: null };

async function waitForV2State(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const shared = window.__hospedagemV2State;
    if (shared?.ready) return shared;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.__hospedagemV2State?.ready ? window.__hospedagemV2State : null;
}
const iso = (value) => String(value || '').slice(0, 10);
const br = (value) => {
  const [y,m,d] = iso(value).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
};

function applyPeriods() {
  document.querySelectorAll('#hospRdAndamento tbody tr').forEach((tr) => {
    const action = tr.querySelector('[data-reserva]');
    const id = action?.dataset?.reserva;
    if (!id) return;
    const period = state.periods.get(String(id));
    if (!period) return;
    const cells = tr.querySelectorAll('td');
    if (cells.length < 2) return;
    if (period.checkin) {
      const next = br(period.checkin);
      if (cells[0].textContent.trim() !== next) cells[0].textContent = next;
    }
    if (period.checkout) {
      const next = br(period.checkout);
      if (cells[1].textContent.trim() !== next) cells[1].textContent = next;
    }
  });
}

async function loadPeriods() {
  try {
    const shared = await waitForV2State();
    let data;
    if (shared?.ready) {
      const byReservation = new Map();
      (shared.rows || []).forEach((row) => {
        if (!row.reserva_id) return;
        const key = String(row.reserva_id);
        const current = byReservation.get(key) || { id: row.reserva_id, data_checkin: '', data_checkout: '' };
        const checkin = iso(row.data_checkin || row.data_checkin_prevista);
        const checkout = iso(row.data_checkout || row.data_checkout_prevista);
        if (checkin && (!current.data_checkin || checkin < current.data_checkin)) current.data_checkin = checkin;
        if (checkout && (!current.data_checkout || checkout > current.data_checkout)) current.data_checkout = checkout;
        byReservation.set(key, current);
      });
      data = [...byReservation.values()];
    } else {
      const result = await supabase
        .from('hospedagem_reservas')
        .select('id,data_checkin,data_checkout');
      if (result.error) throw result.error;
      data = result.data || [];
    }

    state.periods.clear();
    (data || []).forEach((r) => {
      state.periods.set(String(r.id), {
        checkin: iso(r.data_checkin),
        checkout: iso(r.data_checkout),
      });
    });
    applyPeriods();
  } catch (error) {
    console.warn('[hosp-periodo-reserva] load', error);
  }
}

function scheduleApply() {
  clearTimeout(state.timer);
  state.timer = setTimeout(applyPeriods, 30);
}

function init() {
  loadPeriods();
  const wait = setInterval(() => {
    const root = document.getElementById('hospRedesignRoot');
    if (!root) return;
    clearInterval(wait);
    state.observer = new MutationObserver(scheduleApply);
    state.observer.observe(root, { childList: true, subtree: true });
    applyPeriods();
  }, 50);
  setTimeout(() => clearInterval(wait), 15000);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-hosp-rd-action="refresh"]')) setTimeout(loadPeriods, 650);
  });
  window.addEventListener('hospedagem:v2-data', loadPeriods);
  window.addEventListener('hospedagem:redesign-totais-atualizados', () => setTimeout(loadPeriods, 150));
  console.info(`[hosp-periodo-reserva] ativo ${VERSION}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
