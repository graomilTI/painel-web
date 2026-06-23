// Aba EPI do Painel de Compras — versão leve.
// Mantém os checkboxes reais dos itens e só reagrupa quando a tabela é renderizada.

let epiTabVisual = 'solicitacoes';
let epiInternalClick = false;
let epiApplying = false;
let epiSort = { field: 'funcionario', dir: 'asc' };
let epiObserverInstalled = false;
let epiObserver = null;
let epiDelegationInstalled = false;
let epiApplyTimer = null;
const epiExpanded = new Set();

function normEpi(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function moneyEpi(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isEmptyRow(row) {
  return row?.querySelector?.('.adm-cmp-empty');
}

function baseRows(body) {
  return [...(body?.querySelectorAll(':scope > tr') || [])].filter((row) => (
    !row.hasAttribute('data-epi-toolbar') &&
    !row.hasAttribute('data-epi-sort-header') &&
    !row.hasAttribute('data-epi-group-header') &&
    !row.hasAttribute('data-epi-empty-row')
  ));
}

function isEpiRow(row) {
  if (!row || isEmptyRow(row)) return false;
  const tipo = row.children?.[5]?.textContent || '';
  const material = row.children?.[4]?.textContent || '';
  const n = `${normEpi(tipo)} ${normEpi(material)}`;
  return n.includes('epi') || n.includes('ca pendente') || n.includes('ca:');
}

function getColaborador(row) {
  const materialCell = row.children?.[4];
  if (!materialCell) return 'SEM COLABORADOR';
  const smalls = [...materialCell.querySelectorAll('small')]
    .map((el) => el.textContent.trim())
    .filter(Boolean)
    .filter((txt) => !/^tam\s*:/i.test(txt));
  return smalls[smalls.length - 1] || 'SEM COLABORADOR';
}

function getRegional(row) {
  const solicitanteCell = row.children?.[2];
  const small = solicitanteCell?.querySelector?.('small')?.textContent?.trim();
  return small || 'Não informada';
}

function getQtd(row) {
  return Number(String(row.children?.[3]?.textContent || '1').replace(/\D+/g, '') || 1);
}

function getValor(row) {
  const text = row.children?.[7]?.textContent || '0';
  const clean = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(clean || 0);
}

function getMaterial(row, colaborador) {
  const cell = row.children?.[4];
  const clone = cell?.cloneNode(true);
  clone?.querySelectorAll('small').forEach((small) => small.remove());
  return (clone?.textContent || cell?.textContent || '')
    .replace(colaborador, '')
    .replace(/CA\s*:?\s*pendente/ig, '')
    .replace(/CA\s*:?\s*\d+/ig, '')
    .trim();
}

function compareText(a, b) {
  const dir = epiSort.dir === 'desc' ? -1 : 1;
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base', numeric: true }) * dir;
}

function sortGroups(groups) {
  return [...groups].sort((a, b) => {
    if (epiSort.field === 'regional') {
      const byRegional = compareText(a.regional, b.regional);
      if (byRegional) return byRegional;
    }
    return compareText(a.nome, b.nome);
  });
}

function sortLabel(field) {
  if (epiSort.field !== field) return '↕';
  return epiSort.dir === 'asc' ? '↑' : '↓';
}

function setSort(field) {
  if (epiSort.field === field) epiSort = { field, dir: epiSort.dir === 'asc' ? 'desc' : 'asc' };
  else epiSort = { field, dir: 'asc' };
  applyEpiVisual();
}

function groupRowsFromHeader(header) {
  const rows = [];
  let cursor = header?.nextElementSibling;
  while (cursor) {
    if (
      cursor.hasAttribute('data-epi-toolbar') ||
      cursor.hasAttribute('data-epi-sort-header') ||
      cursor.hasAttribute('data-epi-group-header') ||
      cursor.hasAttribute('data-epi-empty-row')
    ) break;
    if (cursor.querySelector('input[type="checkbox"][data-check]')) rows.push(cursor);
    cursor = cursor.nextElementSibling;
  }
  return rows;
}

function setRowsChecked(rows, checked) {
  rows.forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"][data-check]');
    if (!checkbox) return;
    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function updateGroupState(header) {
  const rows = groupRowsFromHeader(header);
  const total = rows.length;
  const selected = rows.filter((row) => row.querySelector('input[type="checkbox"][data-check]')?.checked).length;
  const box = header?.querySelector?.('[data-epi-group-select]');
  const status = header?.querySelector?.('[data-epi-group-status]');
  const btn = header?.querySelector?.('[data-epi-group-check]');
  const arrow = header?.querySelector?.('[data-epi-group-arrow]');
  const kpi = header?.querySelector?.('[data-epi-group-kpi]');
  if (box) {
    box.checked = total > 0 && selected === total;
    box.indeterminate = selected > 0 && selected < total;
  }
  const expanded = epiExpanded.has(header?.dataset?.epiGroupKey);
  if (arrow) arrow.textContent = expanded ? '▾' : '▸';
  if (kpi) kpi.title = `Clique para ${expanded ? 'recolher' : 'expandir'} e ver os itens individualmente`;
  if (status) status.textContent = selected ? `${selected}/${total} selecionado(s)` : (expanded ? 'Marque os itens abaixo para liberar ou comprar individualmente' : 'Clique aqui para ver e marcar os itens individualmente');
  if (btn) btn.textContent = total > 0 && selected === total ? 'Desmarcar grupo' : 'Selecionar grupo';
}

function toggleGroupExpand(header) {
  const key = header?.dataset?.epiGroupKey;
  if (!key) return;
  const expand = !epiExpanded.has(key);
  if (expand) epiExpanded.add(key); else epiExpanded.delete(key);
  groupRowsFromHeader(header).forEach((row) => { row.style.display = expand ? '' : 'none'; });
  updateGroupState(header);
}

function updateSummary() {
  const body = document.getElementById('admCmpBody');
  const toolbar = body?.querySelector('[data-epi-toolbar]');
  if (!body || !toolbar) return;
  const groups = [...body.querySelectorAll('[data-epi-group-select]')];
  const checkedGroups = groups.filter((input) => input.checked).length;
  const rows = baseRows(body).filter((row) => isEpiRow(row) && row.querySelector('input[type="checkbox"][data-check]')?.checked);
  const unidades = rows.reduce((sum, row) => sum + getQtd(row), 0);
  const valor = rows.reduce((sum, row) => sum + getValor(row), 0);
  const materiais = new Map();
  rows.forEach((row) => {
    const colab = getColaborador(row);
    const mat = getMaterial(row, colab) || 'EPI';
    const key = normEpi(mat);
    materiais.set(key, { nome: mat, qtd: (materiais.get(key)?.qtd || 0) + getQtd(row) });
  });
  const matText = [...materiais.values()].slice(0, 5).map((m) => `${m.qtd}x ${m.nome}`).join(' · ') || 'Nenhum grupo selecionado';
  toolbar.querySelector('[data-epi-selected-summary]').textContent = `${checkedGroups} grupo(s) · ${rows.length} item(ns) · ${unidades} unidade(s) · ${moneyEpi(valor)}`;
  toolbar.querySelector('[data-epi-selected-materials]').textContent = matText;
}

function syncHeaders() {
  document.querySelectorAll('[data-epi-group-header]').forEach(updateGroupState);
  updateSummary();
}

function toggleGroup(header, checked = null) {
  const rows = groupRowsFromHeader(header);
  const shouldCheck = checked ?? rows.some((row) => !row.querySelector('input[type="checkbox"][data-check]')?.checked);
  setRowsChecked(rows, shouldCheck);
  updateGroupState(header);
  updateSummary();
}

function clearEpiRows(body) {
  body?.querySelectorAll('[data-epi-toolbar],[data-epi-sort-header],[data-epi-group-header],[data-epi-empty-row]').forEach((row) => row.remove());
}

function makeToolbar(groups, colCount) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-epi-toolbar', '1');
  tr.innerHTML = `
    <td colspan="${colCount}" style="background:rgba(15,23,42,.88);border:1px solid rgba(148,163,184,.25);padding:12px 14px">
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div>
          <strong style="color:#e2e8f0">Selecionar vários grupos para compra</strong>
          <div data-epi-selected-summary style="font-size:12px;color:#bbf7d0;margin-top:4px;font-weight:700">0 grupo(s) · 0 item(ns) · 0 unidade(s) · ${moneyEpi(0)}</div>
          <div data-epi-selected-materials style="font-size:12px;color:#94a3b8;margin-top:4px">Nenhum grupo selecionado</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button type="button" class="btn btn-small btn-secondary" data-epi-select-all-groups>Selecionar todos</button>
          <button type="button" class="btn btn-small btn-secondary" data-epi-clear-groups>Limpar seleção</button>
        </div>
      </div>
    </td>`;
  tr._epiGroups = groups;
  return tr;
}

function makeSortHeader(colCount) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-epi-sort-header', '1');
  tr.innerHTML = `
    <td colspan="${colCount}" style="background:rgba(30,41,59,.96);border-bottom:1px solid rgba(148,163,184,.28);padding:0">
      <div style="display:grid;grid-template-columns:minmax(240px,1fr) minmax(180px,.7fr) 150px 170px;align-items:center;font-size:12px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#cbd5e1">
        <button type="button" data-epi-sort="funcionario" style="all:unset;cursor:pointer;padding:10px 14px;color:#e2e8f0">Funcionário ${sortLabel('funcionario')}</button>
        <button type="button" data-epi-sort="regional" style="all:unset;cursor:pointer;padding:10px 14px;color:#e2e8f0">Regional/Supervisão ${sortLabel('regional')}</button>
        <div style="padding:10px 14px;text-align:right">Valor</div>
        <div style="padding:10px 14px;text-align:right">Ação</div>
      </div>
    </td>`;
  return tr;
}

function makeGroupHeader(group, colCount, key) {
  const totalItens = group.rows.length;
  const totalUn = group.rows.reduce((sum, row) => sum + getQtd(row), 0);
  const totalValor = group.rows.reduce((sum, row) => sum + getValor(row), 0);
  const materiais = group.rows.map((row) => getMaterial(row, group.nome)).filter(Boolean).join(' · ');
  const expanded = epiExpanded.has(key);
  const tr = document.createElement('tr');
  tr.setAttribute('data-epi-group-header', '1');
  tr.dataset.epiGroupKey = key;
  tr.innerHTML = `
    <td colspan="${colCount}" style="background:rgba(16,185,129,.11);border-top:1px solid rgba(74,222,128,.35);border-bottom:1px solid rgba(74,222,128,.2);padding:12px 14px">
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div style="display:flex;gap:10px;align-items:flex-start;min-width:260px">
          <input type="checkbox" data-epi-group-select aria-label="Selecionar grupo ${group.nome}" style="margin-top:3px;transform:scale(1.15)">
          <div data-epi-group-kpi style="cursor:pointer" title="Clique para ${expanded ? 'recolher' : 'expandir'} e ver os itens individualmente">
            <strong style="color:#bbf7d0"><span data-epi-group-arrow>${expanded ? '▾' : '▸'}</span> EPI — ${group.nome}</strong>
            <div style="font-size:12px;color:#fde68a;margin-top:4px;font-weight:700">Regional/Supervisão: ${group.regional}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">${totalItens} item(ns) · ${totalUn} unidade(s) · ${materiais}</div>
            <div data-epi-group-status style="font-size:12px;color:#bbf7d0;margin-top:4px">${expanded ? 'Marque os itens abaixo para liberar ou comprar individualmente' : 'Clique aqui para ver e marcar os itens individualmente'}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <strong style="color:#e2e8f0">${moneyEpi(totalValor)}</strong>
          <button type="button" class="btn btn-small btn-secondary" data-epi-group-check>Selecionar grupo</button>
        </div>
      </div>
    </td>`;
  return tr;
}

function makeEmptyRow(colCount, msg) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-epi-empty-row', '1');
  tr.innerHTML = `<td colspan="${colCount}" class="adm-cmp-empty">${msg}</td>`;
  return tr;
}

function applySolicitacoes(body) {
  clearEpiRows(body);
  const rows = baseRows(body);
  let visible = 0;
  rows.forEach((row) => {
    const show = isEmptyRow(row) || !isEpiRow(row);
    row.style.display = show ? '' : 'none';
    if (show && !isEmptyRow(row)) visible += 1;
  });
  if (!visible && rows.some(isEpiRow)) body.appendChild(makeEmptyRow(rows[0]?.children?.length || 9, 'Nenhuma solicitação comum nesta etapa. As solicitações de EPI ficam na aba EPI.'));
}

function applyEpi(body) {
  clearEpiRows(body);
  const rows = baseRows(body).filter((row) => !isEmptyRow(row));
  const epiRows = rows.filter(isEpiRow);
  const colCount = rows[0]?.children?.length || 9;

  rows.forEach((row) => { row.style.display = 'none'; });

  if (!epiRows.length) {
    body.appendChild(makeEmptyRow(colCount, 'Nenhuma solicitação de EPI pendente. Depois da cotação, os EPIs seguem nas demais abas do fluxo.'));
    return;
  }

  const map = new Map();
  epiRows.forEach((row) => {
    const nome = getColaborador(row);
    const key = normEpi(nome);
    if (!map.has(key)) map.set(key, { key, nome, regional: getRegional(row), rows: [] });
    map.get(key).rows.push(row);
  });

  const groups = sortGroups(map.values());
  const frag = document.createDocumentFragment();
  frag.appendChild(makeToolbar(groups, colCount));
  frag.appendChild(makeSortHeader(colCount));

  groups.forEach((group) => {
    const expanded = epiExpanded.has(group.key);
    frag.appendChild(makeGroupHeader(group, colCount, group.key));
    group.rows.forEach((row) => {
      row.style.display = expanded ? '' : 'none';
      row.style.borderLeft = '3px solid rgba(74,222,128,.35)';
      frag.appendChild(row);
    });
  });

  body.appendChild(frag);
  syncHeaders();
}

function applyEpiVisual() {
  if (epiApplying) return;
  const body = document.getElementById('admCmpBody');
  if (!body) return;
  epiApplying = true;
  // Desliga o observer enquanto reorganizamos o DOM: sem isso, o MutationObserver
  // só processa a fila de mutações depois que este bloco termina (microtask), quando
  // epiApplying já voltou a false — ele então achava que era uma mudança externa e
  // chamava scheduleApply de novo, reconstruindo a tabela em loop e piscando tudo.
  epiObserver?.disconnect();
  try {
    if (epiTabVisual === 'epi') applyEpi(body);
    else if (epiTabVisual === 'solicitacoes') applySolicitacoes(body);
    else {
      clearEpiRows(body);
      baseRows(body).forEach((row) => { row.style.display = ''; });
    }
  } finally {
    epiApplying = false;
    if (epiObserverInstalled) epiObserver?.observe(body, { childList: true });
  }
}

function scheduleApply(delay = 120) {
  clearTimeout(epiApplyTimer);
  epiApplyTimer = setTimeout(applyEpiVisual, delay);
}

function updateTabs() {
  const tabs = document.querySelector('.adm-cmp-tabs');
  if (!tabs) return;
  const epiBtn = tabs.querySelector('[data-tab-epi-exclusivo]');
  const tabButtons = [...tabs.querySelectorAll('[data-tab]')];
  if (epiTabVisual === 'epi') {
    tabButtons.forEach((btn) => btn.classList.remove('active'));
    epiBtn?.classList.add('active');
  } else epiBtn?.classList.remove('active');
}

function installEpiTab() {
  const tabs = document.querySelector('.adm-cmp-tabs');
  if (!tabs) return;
  const solicitacoesBtn = tabs.querySelector('[data-tab="solicitacoes"]');
  if (!solicitacoesBtn) return;

  if (!tabs.querySelector('[data-tab-epi-exclusivo]')) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.type = 'button';
    btn.setAttribute('data-tab-epi-exclusivo', '1');
    btn.textContent = 'EPI';
    solicitacoesBtn.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', () => {
      epiInternalClick = true;
      solicitacoesBtn.click();
      epiInternalClick = false;
      epiTabVisual = 'epi';
      updateTabs();
      scheduleApply(180);
    });
  }

  tabs.querySelectorAll('[data-tab]').forEach((btn) => {
    if (btn.dataset.epiBound) return;
    btn.dataset.epiBound = '1';
    btn.addEventListener('click', () => {
      if (epiInternalClick) return;
      epiTabVisual = btn.dataset.tab || 'solicitacoes';
      updateTabs();
      scheduleApply(140);
    });
  });
}

function installDelegation() {
  if (epiDelegationInstalled) return;
  epiDelegationInstalled = true;

  document.addEventListener('click', (event) => {
    const sortBtn = event.target.closest?.('[data-epi-sort]');
    if (sortBtn) {
      event.preventDefault();
      setSort(sortBtn.dataset.epiSort);
      return;
    }

    const groupBtn = event.target.closest?.('[data-epi-group-check]');
    if (groupBtn) {
      event.preventDefault();
      toggleGroup(groupBtn.closest('[data-epi-group-header]'));
      return;
    }

    const kpi = event.target.closest?.('[data-epi-group-kpi]');
    if (kpi) {
      event.preventDefault();
      toggleGroupExpand(kpi.closest('[data-epi-group-header]'));
      return;
    }

    const allBtn = event.target.closest?.('[data-epi-select-all-groups]');
    if (allBtn) {
      event.preventDefault();
      document.querySelectorAll('[data-epi-group-header]').forEach((header) => toggleGroup(header, true));
      return;
    }

    const clearBtn = event.target.closest?.('[data-epi-clear-groups]');
    if (clearBtn) {
      event.preventDefault();
      document.querySelectorAll('[data-epi-group-header]').forEach((header) => toggleGroup(header, false));
    }
  });

  document.addEventListener('change', (event) => {
    const groupSelect = event.target.closest?.('[data-epi-group-select]');
    if (groupSelect) {
      toggleGroup(groupSelect.closest('[data-epi-group-header]'), groupSelect.checked);
      return;
    }

    if (event.target.matches?.('input[type="checkbox"][data-check]')) setTimeout(syncHeaders, 0);
  });
}

function installBodyObserver() {
  if (epiObserverInstalled) return;
  const body = document.getElementById('admCmpBody');
  if (!body) return;
  epiObserverInstalled = true;
  epiObserver = new MutationObserver((mutations) => {
    if (epiApplying) return;
    if (!mutations.some((m) => [...m.addedNodes, ...m.removedNodes].some((node) => node.nodeType === 1 && !node.hasAttribute?.('data-epi-toolbar') && !node.hasAttribute?.('data-epi-sort-header') && !node.hasAttribute?.('data-epi-group-header') && !node.hasAttribute?.('data-epi-empty-row')))) return;
    scheduleApply(120);
  });
  epiObserver.observe(body, { childList: true });
}

function bootEpiCompras() {
  installDelegation();
  const tick = setInterval(() => {
    installEpiTab();
    installBodyObserver();
    updateTabs();
    if (document.querySelector('.adm-cmp-tabs') && document.getElementById('admCmpBody')) {
      scheduleApply(120);
      clearInterval(tick);
    }
  }, 250);
  setTimeout(() => clearInterval(tick), 10000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootEpiCompras, { once: true });
else bootEpiCompras();
