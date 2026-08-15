import { supabase } from './supabaseClient.js';

const VERSION = '20260815-periodo-reserva1';
const state = { periods: new Map(), observer: null, timer: null };
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
    const { data, error } = await supabase
      .from('hospedagem_reservas')
      .select('id,data_checkin,data_checkout');
    if (error) throw error;
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
    if (event.target.closest('[data-hosp-rd-action="refresh"]')) setTimeout(loadPeriods, 250);
  });
  window.addEventListener('hospedagem:redesign-totais-atualizados', () => setTimeout(loadPeriods, 150));
  setInterval(loadPeriods, 30000);
  console.info(`[hosp-periodo-reserva] ativo ${VERSION}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
