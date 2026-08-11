const STYLE_ID = 'hospStatusLayoutStyles';
const STATUS_HEAD_ATTR = 'data-hosp-status-head';
const STATUS_CELL_ATTR = 'data-hosp-status-cell';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* KPIs mais limpos: sem linhas/bordas divisórias. */
    #hospV2Kpis .hosp-v2-kpi{
      border:0!important;
      box-shadow:none!important;
    }
    #hospV2Kpis .hosp-v2-kpi::before{
      display:none!important;
      content:none!important;
    }

    /* Solicitações: Cidade | Status | Check-in | Colaboradores | Supervisão | Gestor | Ações */
    #hospV2Solicitadas .hosp-v2-list-head,
    #hospV2Solicitadas .hosp-v2-row.hosp-v2-request-row{
      grid-template-columns:
        minmax(155px,.85fr)
        minmax(112px,.55fr)
        minmax(185px,.95fr)
        minmax(250px,1.35fr)
        minmax(180px,1fr)
        minmax(175px,.9fr)
        minmax(190px,1fr)!important;
      min-width:1240px!important;
    }

    #hospV2Solicitadas .hosp-ext-status-cell{
      display:flex!important;
      align-items:center;
      justify-content:flex-start;
    }
    #hospV2Solicitadas .hosp-ext-status-cell .hosp-ext-kind{
      margin-left:0!important;
    }
    #hospV2Solicitadas .hosp-ext-row-note{
      display:none!important;
    }
  `;
  document.head.appendChild(style);
}

function patchHeader() {
  const head = $('#hospV2Solicitadas .hosp-v2-list-head');
  if (!head || head.querySelector(`[${STATUS_HEAD_ATTR}]`)) return;

  const status = document.createElement('div');
  status.className = 'hosp-v2-list-head-label';
  status.setAttribute(STATUS_HEAD_ATTR, '1');
  status.textContent = 'STATUS';
  head.insertBefore(status, head.children[1] || null);
}

function patchRows() {
  $$('#hospV2Solicitadas .hosp-v2-request-row[data-hosp-ext-patched="1"]').forEach((row) => {
    row.querySelectorAll('.hosp-ext-row-note').forEach((note) => note.remove());

    if (row.querySelector(`[${STATUS_CELL_ATTR}]`)) return;

    const cityCell = row.children[0];
    if (!cityCell) return;

    const badge = cityCell.querySelector('.hosp-ext-kind');
    const statusCell = document.createElement('div');
    statusCell.className = 'hosp-v2-cell hosp-ext-status-cell';
    statusCell.setAttribute(STATUS_CELL_ATTR, '1');

    if (badge) statusCell.appendChild(badge);
    else statusCell.textContent = '-';

    cityCell.insertAdjacentElement('afterend', statusCell);
  });
}

function applyLayout() {
  injectStyles();
  patchHeader();
  patchRows();
}

let timer = null;
function scheduleLayout() {
  clearTimeout(timer);
  timer = setTimeout(applyLayout, 25);
}

function init() {
  applyLayout();
  const root = document.getElementById('pageContent');
  if (!root) return;
  const observer = new MutationObserver(scheduleLayout);
  observer.observe(root, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
