import { supabase } from './supabaseClient.js';

const FIX_VERSION = '20260817-andamento-colab1';
const CACHE_TTL_MS = 5000;

let cache = null;
let cacheAt = 0;
let loading = null;
let timer = null;
let applying = false;

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const iso = (value) => String(value || '').slice(0, 10);

function todaySaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function splitNames(value) {
  return String(value || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function buildIndex(rows) {
  const byReservation = new Map();

  for (const row of rows || []) {
    const reservaId = String(row.reserva_id || '');
    if (!reservaId) continue;

    let item = byReservation.get(reservaId);
    if (!item) {
      item = {
        reservaId,
        names: new Set(),
        maxCheckout: '',
        statuses: new Set(),
      };
      byReservation.set(reservaId, item);
    }

    splitNames(row.colaboradores).forEach((name) => item.names.add(name));

    const checkout = iso(row.data_checkout || row.data_checkout_prevista);
    if (checkout && (!item.maxCheckout || checkout > item.maxCheckout)) {
      item.maxCheckout = checkout;
    }

    const status = String(row.status_hospedagem || '').trim().toUpperCase();
    if (status) item.statuses.add(status);
  }

  const today = todaySaoPaulo();
  for (const item of byReservation.values()) {
    item.names = [...item.names];
    item.expired = Boolean(item.maxCheckout && item.maxCheckout < today);
    item.cancelled = item.statuses.size > 0 && [...item.statuses].every((status) => status === 'CANCELADA');
    item.checkoutDone = item.statuses.has('CHECKOUT_REALIZADO');
    item.active = !item.cancelled && !item.checkoutDone && !item.expired;
  }

  return byReservation;
}

async function loadIndex(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < CACHE_TTL_MS) return cache;
  if (loading) return loading;

  loading = (async () => {
    const { data, error } = await supabase
      .from('hospedagem_painel_geral')
      .select('reserva_id,data_checkout,data_checkout_prevista,status_hospedagem,colaboradores')
      .not('reserva_id', 'is', null);

    if (error) throw error;
    cache = buildIndex(data || []);
    cacheAt = Date.now();
    return cache;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

function setPeopleCell(cell, names) {
  if (!cell || !names?.length) return;
  const html = names
    .map((name) => `<span class="hosp-rd-person">${esc(name)}</span>`)
    .join('');
  const current = cell.querySelector('.hosp-rd-people');
  if (current) current.innerHTML = html;
  else cell.innerHTML = `<div class="hosp-rd-people">${html}</div>`;
}

function ensureEmptyState(tbody) {
  if (!tbody) return;
  const dataRows = [...tbody.querySelectorAll('tr')]
    .filter((row) => row.querySelector('[data-reserva]'));
  const existing = tbody.querySelector('[data-hosp-andamento-empty-fix]');

  if (dataRows.length === 0) {
    if (!existing) {
      tbody.insertAdjacentHTML(
        'beforeend',
        '<tr data-hosp-andamento-empty-fix="1"><td colspan="7"><div class="hosp-rd-empty">Nenhuma hospedagem em andamento.</div></td></tr>',
      );
    }
  } else if (existing) {
    existing.remove();
  }
}

async function applyFix({ force = false } = {}) {
  if (applying) return;
  const panel = document.querySelector('#hospRdAndamento');
  if (!panel) return;

  applying = true;
  try {
    const index = await loadIndex(force);
    const tbody = panel.querySelector('tbody');
    if (!tbody) return;

    const rows = [...tbody.querySelectorAll('tr')];
    for (const tr of rows) {
      const button = tr.querySelector('[data-reserva]');
      if (!button) continue;

      const reservaId = String(button.dataset.reserva || '');
      const info = index.get(reservaId);
      if (!info) continue;

      if (info.expired || info.cancelled || info.checkoutDone) {
        tr.remove();
        continue;
      }

      setPeopleCell(tr.children[2], info.names);
    }

    ensureEmptyState(tbody);

    const badge = document.querySelector('#hospRdCountActive');
    if (badge) {
      const totalActive = [...index.values()].filter((item) => item.active).length;
      badge.textContent = String(totalActive);
    }
  } catch (error) {
    console.error(`[${FIX_VERSION}] Falha ao ajustar Em Andamento`, error);
  } finally {
    applying = false;
  }
}

function schedule(options = {}) {
  clearTimeout(timer);
  timer = setTimeout(() => applyFix(options), 80);
}

function invalidateAndSchedule() {
  cacheAt = 0;
  schedule({ force: true });
  setTimeout(() => {
    cacheAt = 0;
    schedule({ force: true });
  }, 1200);
}

function start() {
  const observer = new MutationObserver(() => {
    if (!applying) schedule();
  });
  // Escopado no container da própria tela (não document.documentElement) —
  // observar o documento inteiro fazia esse callback disparar a cada mutação
  // de QUALQUER página do painel, competindo por tempo de main thread à toa.
  let tries = 0;
  const waitRoot = setInterval(() => {
    tries += 1;
    const root = document.getElementById('hospRedesignRoot');
    if (root) { clearInterval(waitRoot); observer.observe(root, { childList: true, subtree: true }); }
    else if (tries > 200) clearInterval(waitRoot);
  }, 50);

  document.addEventListener('click', (event) => {
    const refresh = event.target.closest('[data-hosp-rd-action="refresh"]');
    const checkout = event.target.closest('[data-hosp-rd-action="checkout"], [data-hosp-rd-action="cancel-reservation"]');
    const modalMutation = event.target.closest('[data-hosp-rd-modal="confirm-checkout"], [data-hosp-rd-modal="confirm-cancel-reservation"]');
    if (refresh || checkout || modalMutation) invalidateAndSchedule();
  }, true);

  schedule({ force: true });
}

start();
