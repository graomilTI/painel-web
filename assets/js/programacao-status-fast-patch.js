import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const pendentes = new Set();
let currentUserPromise = null;

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function normalizeStatus(status) {
  return String(status || '').toUpperCase().trim();
}

function statusLabel(status) {
  const st = normalizeStatus(status);
  if (st === 'AGUARDAR') return 'Aguardar';
  if (st === 'ATENDER') return 'Atender';
  if (st === 'FINALIZAR') return 'Finalizar';
  return st || '-';
}

function statusChipClass(status) {
  const st = normalizeStatus(status);
  if (st === 'AGUARDAR') return 'warn';
  if (st === 'FINALIZAR') return 'danger';
  return '';
}

async function currentUserId() {
  if (!currentUserPromise) currentUserPromise = getCurrentUser().catch(() => null);
  const user = await currentUserPromise;
  return user?.id || null;
}

function snapshot(osId) {
  const buttons = [...document.querySelectorAll(`[data-os="${cssEscape(osId)}"][data-status]`)];
  return {
    buttons: buttons.map((btn) => ({ btn, on: btn.classList.contains('on'), disabled: btn.disabled, opacity: btn.style.opacity || '' })),
    chips: [...document.querySelectorAll(`[data-os-id="${cssEscape(osId)}"] .peqb-na-head .peqb-chip`)].map((chip) => ({ chip, text: chip.textContent, className: chip.className })),
  };
}

function restore(snap) {
  snap.buttons.forEach(({ btn, on, disabled, opacity }) => {
    btn.classList.toggle('on', on);
    btn.classList.remove('is-saving', 'is-saved');
    btn.disabled = disabled;
    btn.style.opacity = opacity;
  });
  snap.chips.forEach(({ chip, text, className }) => {
    chip.textContent = text;
    chip.className = className;
  });
}

function applyVisual(osId, nextStatus) {
  const st = normalizeStatus(nextStatus);
  const buttons = [...document.querySelectorAll(`[data-os="${cssEscape(osId)}"][data-status]`)];
  buttons.forEach((btn) => {
    const isTarget = normalizeStatus(btn.dataset.status) === st;
    btn.classList.toggle('on', isTarget);
    btn.classList.toggle('is-saving', isTarget);
    btn.disabled = isTarget;
    btn.style.opacity = isTarget ? '.72' : '';
  });

  document.querySelectorAll(`[data-os-id="${cssEscape(osId)}"] .peqb-na-head .peqb-chip`).forEach((chip) => {
    chip.textContent = statusLabel(st);
    chip.className = `peqb-chip ${statusChipClass(st)}`.trim();
  });
}

async function buildPatch(nextStatus) {
  const agoraIso = new Date().toISOString();
  const st = normalizeStatus(nextStatus);
  const patch = {
    status_gestor: st,
    configurada_em: agoraIso,
    observacao_logistica: null,
    updated_at: agoraIso,
  };

  if (st === 'FINALIZAR') {
    patch.status_logistica = 'PENDENTE';
    patch.enviado_logistica_em = agoraIso;
    patch.logistica_solicitado_por = await currentUserId();
  } else {
    patch.status_logistica = null;
    patch.enviado_logistica_em = null;
    patch.logistica_solicitado_por = null;
  }

  return patch;
}

async function salvarStatusRapido(btn) {
  const osId = btn.dataset.os;
  const nextStatus = btn.dataset.status;
  if (!osId || !nextStatus || pendentes.has(osId)) return;

  pendentes.add(osId);
  const snap = snapshot(osId);
  applyVisual(osId, nextStatus);

  try {
    const patch = await buildPatch(nextStatus);
    const { error } = await supabase.from('operacional_os').update(patch).eq('id', osId);
    if (error) throw error;
    document.querySelectorAll(`[data-os="${cssEscape(osId)}"][data-status="${cssEscape(nextStatus)}"]`).forEach((statusBtn) => {
      statusBtn.classList.remove('is-saving');
      statusBtn.classList.add('is-saved');
      statusBtn.disabled = false;
      statusBtn.style.opacity = '';
      setTimeout(() => statusBtn.classList.remove('is-saved'), 900);
    });
  } catch (error) {
    console.error('[programacao status rápido]', error);
    restore(snap);
    window.alert(error.message || 'Não foi possível atualizar a O.S.');
  } finally {
    pendentes.delete(osId);
  }
}

function injectStyles() {
  if (document.getElementById('programacaoStatusFastPatchStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoStatusFastPatchStyles';
  style.textContent = `
    .peqb-st.is-saving{filter:saturate(.9);box-shadow:0 0 0 2px rgba(255,255,255,.08) inset}
    .peqb-st.is-saved{box-shadow:0 0 0 2px rgba(134,239,172,.45) inset,0 0 16px rgba(34,197,94,.28)}
  `;
  document.head.appendChild(style);
}

function boot() {
  injectStyles();
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-status][data-os]');
    const list = document.getElementById('peqbOsList');
    if (!btn || !list || !list.contains(btn)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    salvarStatusRapido(btn);
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
