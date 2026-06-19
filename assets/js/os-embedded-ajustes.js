// Modo embutido da tela de O.S. para uso dentro de Gestor > Programação > Distribuição.

const params = new URLSearchParams(window.location.search);
const IS_EMBEDDED = params.get('embedded') === '1';

function injectEmbeddedStyle() {
  if (!IS_EMBEDDED || document.getElementById('osEmbeddedAjustesStyle')) return;
  const style = document.createElement('style');
  style.id = 'osEmbeddedAjustesStyle';
  style.textContent = `
    html,body{background:transparent!important;min-height:auto!important}
    body.os-embedded .sidebar,
    body.os-embedded .topbar{display:none!important}
    body.os-embedded .app-shell{display:block!important;min-height:auto!important;background:transparent!important}
    body.os-embedded .content-wrap{margin:0!important;width:100%!important;min-height:auto!important;background:transparent!important}
    body.os-embedded .page-main{padding:0!important;background:transparent!important}
    body.os-embedded .card{box-shadow:none!important;background:rgba(13,13,24,.72)!important}
    body.os-embedded .os-embedded-block{margin-top:18px;border:1px solid rgba(52,211,153,.18);border-radius:18px;padding:14px;background:rgba(2,6,23,.24)}
    body.os-embedded .os-embedded-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px;color:#f8fafc;font-weight:950}
    body.os-embedded .os-embedded-title span{display:inline-flex;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:900;border:1px solid rgba(52,211,153,.22);background:rgba(22,101,52,.14);color:#bbf7d0}
  `;
  document.head.appendChild(style);
  document.body.classList.add('os-embedded');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function waitFor(selector, timeout = 12000) {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      } else if (Date.now() - started > timeout) {
        observer.disconnect();
        reject(new Error(`Elemento não encontrado: ${selector}`));
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function supervisionFromRow(row) {
  const metas = [...row.querySelectorAll('td:first-child .os-meta')];
  return metas[metas.length - 1]?.textContent?.trim() || 'Sem supervisão';
}

let grouping = false;
function groupBySupervisaoIfNeeded() {
  if (!IS_EMBEDDED || grouping) return;
  const select = document.getElementById('osSupervisao');
  if (select?.value) return;

  const list = document.getElementById('osList');
  const table = list?.querySelector(':scope > .os-table-wrap > table.os-table');
  const tbody = table?.querySelector('tbody');
  if (!list || !table || !tbody) return;

  const rows = [...tbody.querySelectorAll('tr[data-os-id]')];
  if (rows.length < 2) return;

  const groups = new Map();
  rows.forEach((row) => {
    const sup = supervisionFromRow(row);
    if (!groups.has(sup)) groups.set(sup, []);
    groups.get(sup).push(row);
  });
  if (groups.size <= 1) return;

  grouping = true;
  try {
    const colgroup = table.querySelector('colgroup');
    const thead = table.querySelector('thead');
    const frag = document.createDocumentFragment();
    [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .forEach(([sup, groupRows]) => {
        const block = document.createElement('section');
        block.className = 'os-embedded-block';
        block.innerHTML = `<div class="os-embedded-title"><strong>${sup}</strong><span>${groupRows.length} O.S.</span></div>`;

        const wrap = document.createElement('div');
        wrap.className = 'os-table-wrap';
        const newTable = document.createElement('table');
        newTable.className = table.className;
        if (colgroup) newTable.appendChild(colgroup.cloneNode(true));
        if (thead) newTable.appendChild(thead.cloneNode(true));
        const newBody = document.createElement('tbody');
        groupRows.forEach((row) => newBody.appendChild(row));
        newTable.appendChild(newBody);
        wrap.appendChild(newTable);
        block.appendChild(wrap);
        frag.appendChild(block);
      });

    list.innerHTML = '';
    list.appendChild(frag);
  } finally {
    setTimeout(() => { grouping = false; }, 0);
  }
}

async function applySupervisaoFromQuery() {
  const target = params.get('supervisao') || '';
  if (!target) return;
  const select = await waitFor('#osSupervisao').catch(() => null);
  if (!select || select.dataset.queryApplied === '1') return;

  const option = [...select.options].find((opt) => normalize(opt.value) === normalize(target));
  if (option) {
    select.value = option.value;
    select.dataset.queryApplied = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function adjustCopy() {
  if (!IS_EMBEDDED) return;
  const title = document.querySelector('#pageTitle');
  if (title) title.textContent = 'Distribuição de O.S.';
  const h3 = [...document.querySelectorAll('.section-head h3')].find((el) => normalize(el.textContent).includes('ORDENS DE SERVICO'));
  if (h3) h3.textContent = 'O.S. para verificação do gestor';
}

async function init() {
  if (!IS_EMBEDDED) return;
  injectEmbeddedStyle();
  await waitFor('#osList').catch(() => null);
  adjustCopy();
  await applySupervisaoFromQuery();

  const observer = new MutationObserver(() => {
    adjustCopy();
    groupBySupervisaoIfNeeded();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(groupBySupervisaoIfNeeded, 600);
}

init().catch((error) => console.warn('[os-embedded]', error));
