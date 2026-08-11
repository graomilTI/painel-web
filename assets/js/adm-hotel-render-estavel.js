const STAGING_CLASS = 'hosp-solicitacoes-staging';
const LOADER_ID = 'hospV2RequestsStableLoader';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function ensureLoader() {
  const panel = document.getElementById('tab-solicitadas');
  const card = panel?.querySelector('.card');
  if (!card || document.getElementById(LOADER_ID)) return;

  const loader = document.createElement('div');
  loader.id = LOADER_ID;
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML = '<span class="hosp-stable-spinner" aria-hidden="true"></span><div><strong>Carregando solicitações</strong><small>Organizando reservas novas e extensões…</small></div>';
  card.appendChild(loader);
}

function kpisAreFinal() {
  const labels = $$('#hospV2Kpis .hosp-v2-kpi small').map((item) => item.textContent?.trim());
  return labels.includes('Novas reservas') && labels.includes('Extensões');
}

function requestsAreFinal() {
  const root = document.getElementById('hospV2Solicitadas');
  if (!root || !kpisAreFinal()) return false;

  const nativeRows = root.querySelector('.hosp-v2-request-row:not([data-hosp-ext-patched="1"])');
  if (nativeRows) return false;

  const patchedRows = $$('.hosp-v2-request-row[data-hosp-ext-patched="1"]', root);
  if (patchedRows.length) {
    return patchedRows.every((row) => row.querySelector('[data-hosp-status-cell]'));
  }

  return Boolean(root.querySelector('.hosp-ext-empty, .hosp-v2-empty'));
}

function beginStableRender() {
  document.body.classList.add(STAGING_CLASS);
}

let revealTimer = null;
function finishStableRender() {
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => document.body.classList.remove(STAGING_CLASS));
    });
  }, 35);
}

function reconcile() {
  ensureLoader();

  const root = document.getElementById('hospV2Solicitadas');
  if (!root) return;

  if (root.querySelector('.hosp-v2-request-row:not([data-hosp-ext-patched="1"])')) {
    beginStableRender();
    return;
  }

  if (requestsAreFinal()) finishStableRender();
}

function init() {
  ensureLoader();
  reconcile();

  const page = document.getElementById('pageContent');
  if (page) {
    const observer = new MutationObserver(reconcile);
    observer.observe(page, { childList: true, subtree: true, characterData: true });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#refreshPainel')) beginStableRender();
  }, true);

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('.adm-hosp-tab[data-tab="solicitadas"]');
    if (!tab) return;
    if (!requestsAreFinal()) beginStableRender();
  }, true);

  // Segurança: se algum patch externo falhar, a aba nunca fica escondida indefinidamente.
  setTimeout(() => {
    if (document.body.classList.contains(STAGING_CLASS)) {
      console.warn('[hosp-render-estavel] timeout de segurança: liberando a aba Solicitações');
      document.body.classList.remove(STAGING_CLASS);
    }
  }, 10000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
