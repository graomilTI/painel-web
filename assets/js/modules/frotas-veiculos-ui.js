const STYLE_ID = 'frotas-veiculos-ui-styles';
const TOTAL_COLUMNS = 11;
const MERCOSUL_TO_DIGIT = Object.freeze({ A: '0', B: '1', C: '2', D: '3', E: '4', F: '5', G: '6', H: '7', I: '8', J: '9' });
const SORT_COLUMNS = Object.freeze([
  { key: 'placa', label: 'PLACA / EMPRESA' },
  { key: 'patrimonio', label: 'PATRIMÔNIO' },
  { key: 'renavam', label: 'RENAVAM' },
  { key: 'veiculo', label: 'VEÍCULO' },
  { key: 'motorista', label: 'MOTORISTA' },
  { key: 'dias', label: 'DIAS SEM LEITURA' },
  { key: 'coordenacao', label: 'COORDENAÇÃO' },
  { key: 'custo', label: 'CUSTO' },
  { key: 'validacao', label: 'VALIDAÇÃO' },
  { key: 'status', label: 'STATUS' },
  null
]);

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function mercosulPlateKey(value) {
  const plate = normalizePlate(value);
  if (/^[A-Z]{3}[0-9][A-J][0-9]{2}$/.test(plate)) {
    return `${plate.slice(0, 4)}${MERCOSUL_TO_DIGIT[plate[4]]}${plate.slice(5)}`;
  }
  return plate;
}

function isMercosulPlate(value) {
  return /^[A-Z]{3}[0-9][A-J][0-9]{2}$/.test(normalizePlate(value));
}

function vehicleScore(vehicle) {
  const fields = ['renavam', 'patrimonio_codigo', 'motorista_atual', 'empresa', 'nome', 'marca', 'modelo', 'coordenacao', 'supervisao'];
  return (isMercosulPlate(vehicle.placa) ? 100 : 0)
    + (vehicle.renavam ? 50 : 0)
    + fields.reduce((score, field) => score + (vehicle[field] ? 5 : 0), 0);
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .fv-create-bar{display:flex;justify-content:flex-start;margin:0 0 14px}
    .fv-form[hidden]{display:none!important}
    .fv-form-actions{display:flex!important;align-items:center;gap:10px;flex-wrap:wrap}
    .fv-table{min-width:1420px!important;table-layout:auto}
    .fv-table th,.fv-table td{vertical-align:middle}
    .fv-table th:nth-child(1),.fv-table td:nth-child(1){min-width:125px}
    .fv-table th:nth-child(2),.fv-table td:nth-child(2){min-width:115px;white-space:nowrap}
    .fv-table th:nth-child(3),.fv-table td:nth-child(3){min-width:130px;white-space:nowrap}
    .fv-table th:nth-child(4),.fv-table td:nth-child(4){min-width:185px}
    .fv-table th:nth-child(5),.fv-table td:nth-child(5){min-width:180px}
    .fv-table th:nth-child(6),.fv-table td:nth-child(6){min-width:120px;white-space:nowrap;text-align:center}
    .fv-table th:nth-child(7),.fv-table td:nth-child(7){min-width:160px}
    .fv-table th:nth-child(8),.fv-table td:nth-child(8){min-width:115px;white-space:nowrap}
    .fv-table th:nth-child(9),.fv-table td:nth-child(9){min-width:155px}
    .fv-table th:nth-child(10),.fv-table td:nth-child(10){min-width:90px;white-space:nowrap}
    .fv-table th:nth-child(11),.fv-table td:nth-child(11){min-width:150px;white-space:nowrap}
    .fv-sort-button{width:100%;border:0;background:transparent;color:inherit;padding:0;display:flex;align-items:center;justify-content:space-between;gap:8px;font:inherit;letter-spacing:inherit;text-transform:inherit;text-align:left;cursor:pointer}
    .fv-sort-button:hover,.fv-sort-button:focus-visible{color:#f8fafc;outline:none}
    .fv-sort-button:focus-visible{box-shadow:inset 0 -2px 0 #22c55e}
    .fv-sort-indicator{min-width:12px;color:#64748b;font-size:12px;line-height:1}
    .fv-table th[aria-sort="ascending"] .fv-sort-indicator,.fv-table th[aria-sort="descending"] .fv-sort-indicator{color:#86efac}
    .fv-days{display:inline-flex;min-width:62px;justify-content:center;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:700;background:#eef2f7;color:#52606d}
    .fv-days.is-ok{background:#e7f7ee;color:#18794e}
    .fv-days.is-warn{background:#fff4d6;color:#8a6100}
    .fv-days.is-late{background:#fde8e7;color:#b42318}
    .fv-plate-equivalent{display:block;margin-top:4px;color:#86efac;font-size:10px;font-weight:800;letter-spacing:.02em}
    .fv-table td:last-child .fv-btn{padding-left:10px;padding-right:10px}
    @media (max-width:760px){.fv-create-bar{margin-bottom:10px}.fv-form-actions{grid-column:1/-1}.fv-table{min-width:1320px!important}}
  `;
  document.head.appendChild(style);
}

function makeHeader(label, marker) {
  const th = document.createElement('th');
  th.textContent = label;
  th.dataset[marker] = 'true';
  return th;
}

function ensureHeaders(table) {
  const row = table?.querySelector('thead tr');
  if (!row || row.querySelector('[data-fv-patrimonio-header]')) return;

  const original = Array.from(row.children);
  if (original.length < 5) return;

  row.insertBefore(makeHeader('PATRIMÔNIO', 'fvPatrimonioHeader'), original[1]);
  row.insertBefore(makeHeader('DIAS SEM LEITURA', 'fvDiasHeader'), original[4]);
}

function updateSortHeaders(table, sortState) {
  table.querySelectorAll('thead th[data-sort-key]').forEach((header) => {
    const active = header.dataset.sortKey === sortState.key;
    const direction = active ? sortState.direction : null;
    header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none');
    const indicator = header.querySelector('[data-sort-indicator]');
    if (indicator) indicator.textContent = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕';
  });
}

function configureSortableHeaders(table, sortState, onSort) {
  const headers = Array.from(table.querySelectorAll('thead th'));
  SORT_COLUMNS.forEach((column, index) => {
    const header = headers[index];
    if (!header || !column || header.dataset.sortReady === 'true') return;

    header.dataset.sortReady = 'true';
    header.dataset.sortKey = column.key;
    header.textContent = '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fv-sort-button';
    button.dataset.sortButton = column.key;
    button.setAttribute('aria-label', `Ordenar por ${column.label}`);

    const label = document.createElement('span');
    label.textContent = column.label;

    const indicator = document.createElement('span');
    indicator.className = 'fv-sort-indicator';
    indicator.dataset.sortIndicator = 'true';
    indicator.setAttribute('aria-hidden', 'true');

    button.append(label, indicator);
    button.addEventListener('click', () => {
      if (sortState.key === column.key) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.key = column.key;
        sortState.direction = 'asc';
      }
      updateSortHeaders(table, sortState);
      onSort();
    });
    header.appendChild(button);
  });

  updateSortHeaders(table, sortState);
}

function setFormVisible(form, addButton, visible) {
  form.hidden = !visible;
  addButton.setAttribute('aria-expanded', String(visible));
  if (visible) form.querySelector('[name="placa"]')?.focus();
}

function ensureCreateControls(container, form) {
  let bar = container.querySelector('[data-fv-create-bar]');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'fv-create-bar';
    bar.dataset.fvCreateBar = 'true';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'fv-btn primary';
    addButton.dataset.addNewVehicle = 'true';
    addButton.textContent = 'Adicionar Novo';
    addButton.setAttribute('aria-expanded', 'false');
    bar.appendChild(addButton);
    form.before(bar);
  }

  const addButton = bar.querySelector('[data-add-new-vehicle]');
  const saveButton = form.querySelector('[data-save-veiculo]');
  const actions = saveButton?.parentElement;

  if (actions && !actions.querySelector('[data-cancel-veiculo]')) {
    actions.classList.add('fv-form-actions');
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'fv-btn';
    cancelButton.dataset.cancelVeiculo = 'true';
    cancelButton.textContent = 'Cancelar';
    actions.appendChild(cancelButton);
  }

  form.hidden = true;

  addButton?.addEventListener('click', () => {
    form.reset();
    setFormVisible(form, addButton, true);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.querySelector('[data-cancel-veiculo]')?.addEventListener('click', () => {
    form.reset();
    setFormVisible(form, addButton, false);
  });

  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-edit]')) return;
    setFormVisible(form, addButton, true);
  }, true);
}

function buildDaysBadge(value) {
  const badge = document.createElement('span');
  badge.className = 'fv-days';

  if (value === null || value === undefined || value === '') {
    badge.textContent = '—';
    return badge;
  }

  const days = Number(value);
  if (!Number.isFinite(days)) {
    badge.textContent = '—';
    return badge;
  }

  badge.textContent = `${days} d`;
  badge.title = `${days} dia${days === 1 ? '' : 's'} sem leitura`;
  badge.classList.add(days <= 7 ? 'is-ok' : days <= 30 ? 'is-warn' : 'is-late');
  return badge;
}

function reconcileRenderedRows(tbody, vehiclesById) {
  const groups = new Map();

  tbody.querySelectorAll('tr').forEach((row) => {
    const editButton = row.querySelector('[data-edit]');
    if (!editButton) return;
    const vehicle = vehiclesById.get(String(editButton.dataset.edit || ''));
    const key = mercosulPlateKey(vehicle?.placa);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, vehicle: vehicle || {} });
  });

  groups.forEach((entries, key) => {
    if (entries.length < 2) return;
    entries.sort((a, b) => vehicleScore(b.vehicle) - vehicleScore(a.vehicle));
    const [preferred, ...duplicates] = entries;
    duplicates.forEach(({ row }) => row.remove());

    const plateCell = preferred.row.children[0];
    if (plateCell && !plateCell.querySelector('[data-fv-equivalent-plate]')) {
      const note = document.createElement('small');
      note.className = 'fv-plate-equivalent';
      note.dataset.fvEquivalentPlate = 'true';
      note.textContent = `Conciliada com ${key}`;
      plateCell.appendChild(note);
    }
  });
}

function sortValue(vehicle, key) {
  switch (key) {
    case 'placa': return mercosulPlateKey(vehicle.placa);
    case 'patrimonio': return vehicle.patrimonio_codigo;
    case 'renavam': return vehicle.renavam;
    case 'veiculo': return [vehicle.marca, vehicle.modelo, vehicle.nome].filter(Boolean).join(' ');
    case 'motorista': return vehicle.motorista_atual;
    case 'dias': return vehicle.patrimonio_dias_sem_leitura;
    case 'coordenacao': return [vehicle.coordenacao, vehicle.supervisao].filter(Boolean).join(' ');
    case 'custo': return vehicle.valor_mensal;
    case 'validacao': {
      const detran = vehicle.detran_confirmado || ['CONFIRMADO', 'DETRAN'].includes(String(vehicle.detran_status || '').toUpperCase()) ? 2 : vehicle.renavam ? 1 : 0;
      const tracker = vehicle.rastreador_bfleet || vehicle.bfleet_confirmado || ['OK', 'ATIVO', 'COM_RASTREADOR'].includes(String(vehicle.bfleet_status || '').toUpperCase()) ? 1 : 0;
      return detran * 10 + tracker;
    }
    case 'status': return vehicle.status;
    default: return '';
  }
}

function compareSortValues(a, b, direction) {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const factor = direction === 'desc' ? -1 : 1;
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return (aNumber - bNumber) * factor;
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }) * factor;
}

function sortRenderedRows(tbody, vehiclesById, sortState) {
  if (!sortState.key) return;

  const rows = Array.from(tbody.querySelectorAll('tr')).filter((row) => row.querySelector('[data-edit]'));
  rows.sort((rowA, rowB) => {
    const idA = String(rowA.querySelector('[data-edit]')?.dataset.edit || '');
    const idB = String(rowB.querySelector('[data-edit]')?.dataset.edit || '');
    const vehicleA = vehiclesById.get(idA) || {};
    const vehicleB = vehiclesById.get(idB) || {};
    const result = compareSortValues(sortValue(vehicleA, sortState.key), sortValue(vehicleB, sortState.key), sortState.direction);
    return result || compareSortValues(mercosulPlateKey(vehicleA.placa), mercosulPlateKey(vehicleB.placa), 'asc');
  });
  rows.forEach((row) => tbody.appendChild(row));
}

function applyVehicleColumns(container, tbody, vehiclesById, sortState) {
  reconcileRenderedRows(tbody, vehiclesById);

  tbody.querySelectorAll('tr').forEach((row) => {
    row.querySelector('[data-detran]')?.remove();

    const editButton = row.querySelector('[data-edit]');
    if (!editButton) {
      const spanningCell = row.querySelector('td[colspan]');
      if (spanningCell) spanningCell.colSpan = TOTAL_COLUMNS;
      return;
    }

    const id = String(editButton.dataset.edit || '');
    const vehicle = vehiclesById.get(id) || {};
    const originalCells = Array.from(row.children).filter((cell) => !cell.hasAttribute('data-fv-extra-cell'));
    if (originalCells.length < 5) return;

    let patrimonioCell = row.querySelector('[data-fv-patrimonio-cell]');
    if (!patrimonioCell) {
      patrimonioCell = document.createElement('td');
      patrimonioCell.dataset.fvExtraCell = 'true';
      patrimonioCell.dataset.fvPatrimonioCell = 'true';
      row.insertBefore(patrimonioCell, originalCells[1]);
    }
    patrimonioCell.textContent = vehicle.patrimonio_codigo || '—';

    let daysCell = row.querySelector('[data-fv-dias-cell]');
    if (!daysCell) {
      daysCell = document.createElement('td');
      daysCell.dataset.fvExtraCell = 'true';
      daysCell.dataset.fvDiasCell = 'true';
      row.insertBefore(daysCell, originalCells[4]);
    }
    daysCell.replaceChildren(buildDaysBadge(vehicle.patrimonio_dias_sem_leitura));
  });

  sortRenderedRows(tbody, vehiclesById, sortState);

  const visibleVehicles = tbody.querySelectorAll('[data-edit]').length;
  const count = container.querySelector('[data-count]');
  if (count) count.textContent = `${visibleVehicles} veículo(s) encontrado(s)`;

  const uniqueTotal = new Set(Array.from(vehiclesById.values()).map((vehicle) => mercosulPlateKey(vehicle.placa)).filter(Boolean)).size;
  const total = container.querySelector('[data-kpi-total]');
  if (total) total.textContent = String(uniqueTotal);
}

async function loadVehicleMirror(supabase) {
  const fields = 'id, placa, renavam, patrimonio_codigo, patrimonio_dias_sem_leitura, motorista_atual, empresa, nome, marca, modelo, coordenacao, supervisao, valor_mensal, detran_confirmado, detran_status, rastreador_bfleet, bfleet_confirmado, bfleet_status, status';
  const { data, error } = await supabase.from('frotas_veiculos').select(fields);
  if (error) throw error;
  return new Map((data || []).map((vehicle) => [String(vehicle.id), vehicle]));
}

export function enhanceFrotasVeiculos(container, { supabase }) {
  const form = container.querySelector('[data-veiculo-form]');
  const table = container.querySelector('.fv-table');
  const tbody = container.querySelector('[data-veiculos-table]');
  if (!form || !table || !tbody || !supabase) return;

  injectStyles();
  ensureCreateControls(container, form);
  ensureHeaders(table);

  const sortState = { key: null, direction: 'asc' };
  let refreshTimer = null;
  let observer;
  let vehiclesById = new Map();

  const observe = () => observer.observe(tbody, { childList: true, subtree: true });
  const applyCurrentSort = () => {
    observer.disconnect();
    sortRenderedRows(tbody, vehiclesById, sortState);
    observe();
  };

  configureSortableHeaders(table, sortState, applyCurrentSort);

  const refresh = async () => {
    try {
      vehiclesById = await loadVehicleMirror(supabase);
    } catch (error) {
      vehiclesById = new Map();
      console.warn('[Frotas] Não foi possível carregar os dados de patrimônio:', error);
    }

    observer.disconnect();
    applyVehicleColumns(container, tbody, vehiclesById, sortState);
    observe();
  };

  const scheduleRefresh = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, 20);
  };

  observer = new MutationObserver(scheduleRefresh);
  observe();
  scheduleRefresh();
}
