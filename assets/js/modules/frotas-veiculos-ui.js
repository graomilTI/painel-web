const STYLE_ID = 'frotas-veiculos-ui-styles';
const TOTAL_COLUMNS = 11;
const MERCOSUL_TO_DIGIT = Object.freeze({ A: '0', B: '1', C: '2', D: '3', E: '4', F: '5', G: '6', H: '7', I: '8', J: '9' });

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

function applyVehicleColumns(container, tbody, vehiclesById) {
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

  const visibleVehicles = tbody.querySelectorAll('[data-edit]').length;
  const count = container.querySelector('[data-count]');
  if (count) count.textContent = `${visibleVehicles} veículo(s) encontrado(s)`;

  const uniqueTotal = new Set(Array.from(vehiclesById.values()).map((vehicle) => mercosulPlateKey(vehicle.placa)).filter(Boolean)).size;
  const total = container.querySelector('[data-kpi-total]');
  if (total) total.textContent = String(uniqueTotal);
}

async function loadVehicleMirror(supabase) {
  const fields = 'id, placa, renavam, patrimonio_codigo, patrimonio_dias_sem_leitura, motorista_atual, empresa, nome, marca, modelo, coordenacao, supervisao';
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

  let refreshTimer = null;
  let observer;

  const observe = () => observer.observe(tbody, { childList: true, subtree: true });
  const refresh = async () => {
    let vehiclesById = new Map();
    try {
      vehiclesById = await loadVehicleMirror(supabase);
    } catch (error) {
      console.warn('[Frotas] Não foi possível carregar os dados de patrimônio:', error);
    }

    observer.disconnect();
    applyVehicleColumns(container, tbody, vehiclesById);
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
