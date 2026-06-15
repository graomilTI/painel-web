import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

const EXPORT_COLUMNS = Object.freeze([
  ['ID', 'id'],
  ['PLACA', 'placa'],
  ['RENAVAM', 'renavam'],
  ['NOME INTERNO', 'nome'],
  ['EMPRESA', 'empresa'],
  ['CNPJ', 'cnpj'],
  ['MARCA', 'marca'],
  ['MODELO', 'modelo'],
  ['COR', 'cor'],
  ['ANO', 'ano'],
  ['TIPO', 'tipo'],
  ['COORDENAÇÃO', 'coordenacao'],
  ['SUPERVISÃO', 'supervisao'],
  ['MOTORISTA ATUAL', 'motorista_atual'],
  ['HODÔMETRO', 'hodometro'],
  ['VALOR MENSAL', 'valor_mensal'],
  ['DIA VENCIMENTO', 'dia_vencimento'],
  ['VALOR KM', 'valor_km'],
  ['STATUS', 'status'],
  ['OBSERVAÇÕES', 'observacoes'],
  ['PATRIMÔNIO (CONSULTA)', 'patrimonio_codigo'],
  ['DIAS SEM LEITURA (CONSULTA)', 'patrimonio_dias_sem_leitura'],
  ['STATUS DETRAN (CONSULTA)', 'detran_status'],
  ['STATUS BFLEET (CONSULTA)', 'bfleet_status'],
  ['ATUALIZADO EM (CONSULTA)', 'updated_at'],
]);

const WRITABLE_COLUMNS = Object.freeze([
  ['PLACA', 'placa', 'plate'],
  ['RENAVAM', 'renavam', 'digits'],
  ['NOME INTERNO', 'nome', 'text'],
  ['EMPRESA', 'empresa', 'text'],
  ['CNPJ', 'cnpj', 'digits'],
  ['MARCA', 'marca', 'text'],
  ['MODELO', 'modelo', 'text'],
  ['COR', 'cor', 'text'],
  ['ANO', 'ano', 'number'],
  ['TIPO', 'tipo', 'text'],
  ['COORDENAÇÃO', 'coordenacao', 'text'],
  ['SUPERVISÃO', 'supervisao', 'text'],
  ['MOTORISTA ATUAL', 'motorista_atual', 'text'],
  ['HODÔMETRO', 'hodometro', 'number'],
  ['VALOR MENSAL', 'valor_mensal', 'number'],
  ['DIA VENCIMENTO', 'dia_vencimento', 'number'],
  ['VALOR KM', 'valor_km', 'number'],
  ['STATUS', 'status', 'status'],
  ['OBSERVAÇÕES', 'observacoes', 'text'],
]);

const ALLOWED_STATUS = new Set(['ATIVO', 'INATIVO', 'VENDIDO', 'MANUTENCAO']);

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function digits(value) {
  const text = String(value ?? '').replace(/\D/g, '');
  return text || null;
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value) {
  return normalizeHeader(value).replace(/\s+/g, '_');
}

function rowIndex(row) {
  const index = new Map();
  Object.entries(row || {}).forEach(([key, value]) => index.set(normalizeHeader(key), value));
  return index;
}

function getIndexed(index, label) {
  return index.get(normalizeHeader(label));
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}

function fileStamp() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

function showToast(message, error = false) {
  let toast = document.querySelector('[data-fv-xlsx-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.dataset.fvXlsxToast = 'true';
    toast.className = 'fv-xlsx-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('is-error', error);
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 5000);
}

function injectStyles() {
  if (document.getElementById('frotas-veiculos-xlsx-styles')) return;
  const style = document.createElement('style');
  style.id = 'frotas-veiculos-xlsx-styles';
  style.textContent = `
    .fv-xlsx-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 14px}
    .fv-xlsx-actions .fv-btn:disabled{opacity:.55;cursor:wait}
    .fv-xlsx-note{color:#94a3b8;font-size:12px}
    .fv-xlsx-toast{position:fixed;right:22px;bottom:22px;z-index:10020;max-width:min(520px,calc(100vw - 44px));border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.97);color:#dcfce7;border-radius:14px;padding:12px 14px;font-weight:800;box-shadow:0 16px 45px rgba(0,0,0,.38);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}
    .fv-xlsx-toast.is-error{border-color:rgba(254,202,202,.35);background:rgba(127,29,29,.97);color:#fee2e2}
    .fv-xlsx-toast.show{opacity:1;transform:translateY(0)}
  `;
  document.head.appendChild(style);
}

function buildExportRow(vehicle) {
  return Object.fromEntries(EXPORT_COLUMNS.map(([label, field]) => {
    let value = vehicle?.[field] ?? '';
    if (field === 'updated_at') value = formatDateTime(value);
    if (['id', 'placa', 'renavam', 'cnpj'].includes(field)) value = String(value || '');
    return [label, value];
  }));
}

async function exportVehicles(supabase, button) {
  button.disabled = true;
  button.textContent = 'Gerando XLSX...';
  try {
    const { data, error } = await supabase
      .from('frotas_veiculos')
      .select('*')
      .order('placa', { ascending: true });
    if (error) throw error;

    const rows = (data || []).map(buildExportRow);
    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: EXPORT_COLUMNS.map(([label]) => label),
    });
    sheet['!autofilter'] = { ref: sheet['!ref'] || `A1:Y${rows.length + 1}` };
    sheet['!cols'] = EXPORT_COLUMNS.map(([label]) => ({
      wch: Math.min(34, Math.max(12, label.length + 2)),
    }));

    const instructions = XLSX.utils.aoa_to_sheet([
      ['REIMPORTAÇÃO DE VEÍCULOS'],
      ['1', 'Edite somente a aba VEICULOS e mantenha os cabeçalhos.'],
      ['2', 'Não altere o ID. Ele identifica o veículo; a placa é usada apenas como contingência.'],
      ['3', 'Campos vazios serão gravados como vazios. STATUS vazio preserva o status atual.'],
      ['4', 'Status aceitos: ATIVO, INATIVO, VENDIDO e MANUTENCAO.'],
      ['5', 'Colunas com (CONSULTA) não são reimportadas, pois são sincronizadas por outros módulos.'],
      ['6', 'A importação atualiza apenas veículos existentes e nunca cria registros novos.'],
    ]);
    instructions['!cols'] = [{ wch: 8 }, { wch: 110 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'VEICULOS');
    XLSX.utils.book_append_sheet(workbook, instructions, 'INSTRUCOES');
    XLSX.writeFile(workbook, `veiculos_${fileStamp()}.xlsx`, { compression: true });
    showToast(`${rows.length} veículo(s) exportado(s).`);
  } catch (error) {
    showToast(error.message || 'Falha ao exportar os veículos.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Exportar XLSX';
  }
}

function parsePayload(index, currentStatus) {
  const payload = { origem_importacao: 'painel' };
  for (const [label, field, type] of WRITABLE_COLUMNS) {
    const value = getIndexed(index, label);
    if (type === 'plate') payload[field] = normalizePlate(value);
    else if (type === 'digits') payload[field] = digits(value);
    else if (type === 'number') payload[field] = numberValue(value);
    else if (type === 'status') {
      const status = normalizeStatus(value);
      if (status && !ALLOWED_STATUS.has(status)) {
        throw new Error(`Status inválido: ${value}`);
      }
      payload[field] = status || currentStatus || 'ATIVO';
    } else payload[field] = cleanText(value);
  }
  if (!payload.placa) throw new Error('Placa vazia.');
  return payload;
}

async function updateInBatches(supabase, updates) {
  const errors = [];
  let updated = 0;
  const batchSize = 10;

  for (let offset = 0; offset < updates.length; offset += batchSize) {
    const batch = updates.slice(offset, offset + batchSize);
    const results = await Promise.all(batch.map(async ({ id, payload, line }) => {
      const { error } = await supabase.from('frotas_veiculos').update(payload).eq('id', id);
      return { error, line };
    }));
    results.forEach((result) => {
      if (result.error) errors.push(`Linha ${result.line}: ${result.error.message}`);
      else updated += 1;
    });
  }
  return { updated, errors };
}

async function importVehicles(file, supabase, button, container) {
  button.disabled = true;
  button.textContent = 'Importando...';
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets.VEICULOS || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('A planilha não possui a aba VEICULOS.');

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    if (!rows.length) throw new Error('A planilha não possui veículos para importar.');

    const firstIndex = rowIndex(rows[0]);
    if (!firstIndex.has('ID') || !firstIndex.has('PLACA') || !firstIndex.has('STATUS')) {
      throw new Error('Modelo inválido. Exporte um novo XLSX pela tela de Veículos.');
    }

    const { data: existing, error } = await supabase
      .from('frotas_veiculos')
      .select('id,placa,status');
    if (error) throw error;

    const byId = new Map((existing || []).map((vehicle) => [String(vehicle.id), vehicle]));
    const byPlate = new Map((existing || []).map((vehicle) => [normalizePlate(vehicle.placa), vehicle]));
    const seen = new Set();
    const updates = [];
    const skipped = [];

    rows.forEach((row, rowNumber) => {
      const line = rowNumber + 2;
      const index = rowIndex(row);
      const id = String(getIndexed(index, 'ID') || '').trim();
      const plate = normalizePlate(getIndexed(index, 'PLACA'));
      const current = byId.get(id) || byPlate.get(plate);
      if (!current) {
        skipped.push(`Linha ${line}: veículo não encontrado.`);
        return;
      }
      if (seen.has(String(current.id))) {
        skipped.push(`Linha ${line}: veículo duplicado na planilha.`);
        return;
      }
      try {
        updates.push({
          id: current.id,
          line,
          payload: parsePayload(index, current.status),
        });
        seen.add(String(current.id));
      } catch (rowError) {
        skipped.push(`Linha ${line}: ${rowError.message}`);
      }
    });

    if (!updates.length) throw new Error(skipped[0] || 'Nenhum veículo válido para atualizar.');
    if (!window.confirm(`Atualizar ${updates.length} veículo(s) com os dados desta planilha?`)) {
      showToast('Importação cancelada.');
      return;
    }

    const result = await updateInBatches(supabase, updates);
    container.querySelector('[data-refresh]')?.click();

    const failures = result.errors.length + skipped.length;
    showToast(
      `${result.updated} veículo(s) atualizado(s)${failures ? `; ${failures} linha(s) ignorada(s)` : ''}.`,
      Boolean(result.errors.length),
    );
    if (failures) console.warn('[Frotas XLSX] Linhas não importadas:', [...skipped, ...result.errors]);
  } catch (error) {
    showToast(error.message || 'Falha ao importar a planilha.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Reimportar XLSX';
  }
}

export function enhanceFrotasVeiculosXlsx(container, { supabase }) {
  const firstToolbar = container.querySelector('.fv-toolbar');
  if (!firstToolbar || !supabase || container.querySelector('[data-fv-xlsx-actions]')) return;

  injectStyles();
  const actions = document.createElement('div');
  actions.className = 'fv-xlsx-actions';
  actions.dataset.fvXlsxActions = 'true';
  actions.innerHTML = `
    <button class="fv-btn ghost" type="button" data-export-vehicles-xlsx>Exportar XLSX</button>
    <button class="fv-btn ghost" type="button" data-import-vehicles-xlsx>Reimportar XLSX</button>
    <input type="file" accept=".xlsx,.xls" data-vehicles-xlsx-file hidden>
    <span class="fv-xlsx-note">Atualiza somente veículos existentes; dados sincronizados permanecem protegidos.</span>
  `;
  firstToolbar.before(actions);

  const exportButton = actions.querySelector('[data-export-vehicles-xlsx]');
  const importButton = actions.querySelector('[data-import-vehicles-xlsx]');
  const fileInput = actions.querySelector('[data-vehicles-xlsx-file]');

  exportButton.addEventListener('click', () => exportVehicles(supabase, exportButton));
  importButton.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) importVehicles(file, supabase, importButton, container);
  });
}
