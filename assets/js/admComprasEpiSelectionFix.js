// Correção complementar para seleção de grupos na aba EPI do Painel de Compras.
// Usa delegação no DOM para marcar/desmarcar os checkboxes reais dos itens,
// mesmo quando a aba é reagrupada ou reordenada visualmente.

function getGroupRowsFromHeader(headerRow) {
  const rows = [];
  let cursor = headerRow?.nextElementSibling || null;

  while (cursor) {
    if (
      cursor.hasAttribute('data-epi-group-header') ||
      cursor.hasAttribute('data-epi-group-toolbar') ||
      cursor.hasAttribute('data-epi-sort-header')
    ) break;

    const itemCheckbox = cursor.querySelector('input[type="checkbox"][data-check]');
    if (itemCheckbox) rows.push(cursor);
    cursor = cursor.nextElementSibling;
  }

  return rows;
}

function setItemRowsChecked(rows, checked) {
  rows.forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"][data-check]');
    if (!checkbox) return;
    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function updateGroupHeaderState(headerRow, checked) {
  if (!headerRow) return;
  const rows = getGroupRowsFromHeader(headerRow);
  const selected = rows.filter((row) => row.querySelector('input[type="checkbox"][data-check]')?.checked).length;
  const total = rows.length;
  const groupCheckbox = headerRow.querySelector('[data-epi-group-select]');
  const status = headerRow.querySelector('[data-epi-group-status]');
  const button = headerRow.querySelector('[data-epi-group-check]');

  if (groupCheckbox) {
    groupCheckbox.checked = checked ?? (selected > 0 && selected === total);
    groupCheckbox.indeterminate = selected > 0 && selected < total;
  }

  if (status) {
    status.textContent = selected ? `${selected}/${total} selecionado(s)` : 'Grupo fechado — detalhes na cotação';
  }

  if (button) {
    button.textContent = selected === total && total > 0 ? 'Desmarcar grupo' : 'Selecionar grupo';
  }
}

function updateEpiToolbarSummary() {
  const body = document.getElementById('admCmpBody');
  const toolbar = body?.querySelector('[data-epi-group-toolbar]');
  if (!body || !toolbar) return;

  const groupCheckboxes = [...body.querySelectorAll('[data-epi-group-select]')];
  const checkedGroups = groupCheckboxes.filter((input) => input.checked).length;
  const selectedRows = [...body.querySelectorAll('tr')]
    .filter((row) => row.querySelector('input[type="checkbox"][data-check]')?.checked);

  const totalUnits = selectedRows.reduce((sum, row) => {
    const qtd = Number(String(row.children?.[3]?.textContent || '1').replace(/\D+/g, '') || 1);
    return sum + qtd;
  }, 0);

  const totalValue = selectedRows.reduce((sum, row) => {
    const text = row.children?.[7]?.textContent || '0';
    const clean = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    return sum + Number(clean || 0);
  }, 0);

  const money = totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const summary = toolbar.querySelector('[data-epi-selected-summary]');
  const materials = toolbar.querySelector('[data-epi-selected-materials]');

  if (summary) summary.textContent = `${checkedGroups} grupo(s) · ${selectedRows.length} item(ns) · ${totalUnits} unidade(s) · ${money}`;
  if (materials && !selectedRows.length) materials.textContent = 'Nenhum grupo selecionado';
}

function syncAllGroupHeaders() {
  document.querySelectorAll('[data-epi-group-header]').forEach((header) => updateGroupHeaderState(header));
  updateEpiToolbarSummary();
}

function toggleGroup(headerRow, forceChecked = null) {
  const rows = getGroupRowsFromHeader(headerRow);
  if (!rows.length) return;

  const checked = forceChecked ?? rows.some((row) => !row.querySelector('input[type="checkbox"][data-check]')?.checked);
  setItemRowsChecked(rows, checked);
  updateGroupHeaderState(headerRow, checked);
  updateEpiToolbarSummary();
}

document.addEventListener('change', (event) => {
  const groupCheckbox = event.target?.closest?.('[data-epi-group-select]');
  if (!groupCheckbox) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const headerRow = groupCheckbox.closest('[data-epi-group-header]');
  toggleGroup(headerRow, groupCheckbox.checked);
}, true);

document.addEventListener('click', (event) => {
  const groupButton = event.target?.closest?.('[data-epi-group-check]');
  if (groupButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleGroup(groupButton.closest('[data-epi-group-header]'));
    return;
  }

  const selectAll = event.target?.closest?.('[data-epi-select-all-groups]');
  if (selectAll) {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelectorAll('[data-epi-group-header]').forEach((header) => toggleGroup(header, true));
    return;
  }

  const clearAll = event.target?.closest?.('[data-epi-clear-groups]');
  if (clearAll) {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelectorAll('[data-epi-group-header]').forEach((header) => toggleGroup(header, false));
  }
}, true);

document.addEventListener('change', (event) => {
  if (!event.target?.matches?.('input[type="checkbox"][data-check]')) return;
  setTimeout(syncAllGroupHeaders, 0);
});

const epiSelectionObserver = new MutationObserver(() => {
  if (document.getElementById('admCmpBody')?.querySelector('[data-epi-group-header]')) {
    setTimeout(syncAllGroupHeaders, 80);
  }
});

epiSelectionObserver.observe(document.body, { childList: true, subtree: true });
