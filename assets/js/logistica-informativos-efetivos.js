import { supabase } from './supabaseClient.js';

const ROWS_PER_PAGE = 20;
const PT = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

const efetivosState = {
  active: false,
  busy: false,
  rows: [],
  sort: { index: 0, direction: 'asc' },
  sourceLabel: '',
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

function clean(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function cpfNorm(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function firstValue(row, fields) {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== null && value !== undefined && clean(value) !== '') return value;
  }
  return '';
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  }
  return '';
}

function dateFromISO(value) {
  const iso = isoDate(value);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDaysISO(value, days) {
  const date = dateFromISO(value);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function formatDate(value) {
  const date = dateFromISO(value);
  return date ? date.toLocaleDateString('pt-BR') : '';
}

function enumerateDates(from, to) {
  const dates = [];
  let cursor = from;
  while (cursor && cursor <= to && dates.length < 370) {
    dates.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

function saoPauloTodayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function defaultConferenceRange() {
  const today = saoPauloTodayISO();
  const day = dateFromISO(today)?.getDay();
  const to = addDaysISO(today, -1);
  return {
    from: day === 1 ? addDaysISO(today, -3) : to,
    to,
  };
}

async function fetchAll(table, select = '*', configure = null, maxRows = 20000) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let query = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function isEffectiveClassifier(row) {
  const contract = norm(firstValue(row, ['tipo_contrato', 'tipo', 'contrato', 'regime', 'vinculo']));
  const role = norm(firstValue(row, ['cargo', 'funcao', 'função']));
  return contract.includes('EFETIV') && role.includes('CLASSIFIC');
}

function isActiveDuringRange(row, from, to) {
  if (row?.ativo === false) return false;
  const status = norm(firstValue(row, ['situacao', 'status']));
  if (['INATIV', 'DESLIGAD', 'DEMITID'].some((term) => status.includes(term))) return false;

  const admission = isoDate(firstValue(row, ['admissao', 'data_admissao', 'admission_date']));
  const dismissal = isoDate(firstValue(row, ['desligamento', 'data_desligamento', 'dismissal_date']));
  if (admission && admission > to) return false;
  if (dismissal && dismissal < from) return false;
  return true;
}

function employeeIdentity(row) {
  return {
    id: clean(firstValue(row, ['id', 'colaborador_id'])),
    cpf: cpfNorm(firstValue(row, ['cpf', 'documento'])),
    name: clean(firstValue(row, ['nome', 'colaborador_nome', 'funcionario'])),
  };
}

function identityKeys(identity) {
  const keys = [];
  if (identity.id) keys.push(`id:${identity.id}`);
  if (identity.cpf) keys.push(`cpf:${identity.cpf}`);
  const normalizedName = norm(identity.name);
  if (normalizedName) keys.push(`nome:${normalizedName}`);
  return keys;
}

function normalizeEmployee(row) {
  const identity = employeeIdentity(row);
  return {
    ...identity,
    coordenacao: clean(firstValue(row, ['coordenacao', 'regional'])),
    supervisao: clean(firstValue(row, ['supervisao'])),
    admission: isoDate(firstValue(row, ['admissao', 'data_admissao', 'admission_date'])),
    dismissal: isoDate(firstValue(row, ['desligamento', 'data_desligamento', 'dismissal_date'])),
  };
}

function dedupeEmployees(rows) {
  const byKey = new Map();
  rows.forEach((row) => {
    const employee = normalizeEmployee(row);
    if (!employee.name) return;
    const key = employee.cpf || norm(employee.name);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, employee);
  });
  return [...byKey.values()];
}

async function loadEffectiveEmployees(from, to) {
  const rows = await fetchAll('colaboradores_atuais', '*', (query) => query.order('nome', { ascending: true }), 15000);
  return dedupeEmployees(rows.filter((row) => isEffectiveClassifier(row) && isActiveDuringRange(row, from, to)));
}

async function loadLoadNames(from, to) {
  const rows = await fetchAll(
    'relatorio_resultado_diario',
    'funcionario,data,cargas,os',
    (query) => query.gte('data', from).lte('data', to).order('data', { ascending: true }),
    50000
  );
  return new Set(rows.map((row) => norm(row.funcionario)).filter(Boolean));
}

async function loadUuidDirectory(uuids) {
  const result = new Map();
  const unique = [...new Set(uuids.filter(Boolean))];
  for (let index = 0; index < unique.length; index += 200) {
    const chunk = unique.slice(index, index + 200);
    const { data, error } = await supabase.from('colaboradores').select('id,cpf,nome').in('id', chunk);
    if (error) throw error;
    (data || []).forEach((row) => result.set(String(row.id), row));
  }
  return result;
}

function intervalFromRow(row, fallbackFrom, fallbackTo) {
  const start = isoDate(firstValue(row, ['data_inicio', 'inicio', 'data']));
  const end = isoDate(firstValue(row, ['data_fim', 'fim'])) || start;
  return {
    start: start || fallbackFrom,
    end: end || fallbackTo,
  };
}

function addInterval(intervalsByKey, keys, interval) {
  if (!interval.start || !interval.end) return;
  keys.forEach((key) => {
    if (!key) return;
    if (!intervalsByKey.has(key)) intervalsByKey.set(key, []);
    intervalsByKey.get(key).push(interval);
  });
}

async function safeUnavailabilityQuery(table, statuses, from, to) {
  try {
    let query = supabase.from(table).select('*').lte('data_inicio', to).gte('data_fim', from);
    if (statuses?.length) query = query.in('status', statuses);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn(`[informativos/efetivos] ${table} indisponível`, error);
    return [];
  }
}

async function loadUnavailabilityIntervals(from, to) {
  const [vacations, certificates, legacy] = await Promise.all([
    safeUnavailabilityQuery('rh_ferias', ['programada', 'em_gozo'], from, to),
    safeUnavailabilityQuery('rh_atestados', ['lancado', 'aprovado'], from, to),
    safeUnavailabilityQuery('indisponibilidades', null, from, to),
  ]);
  const rows = [...vacations, ...certificates, ...legacy];
  const uuids = rows.map((row) => clean(firstValue(row, ['colaborador_id', 'id_colaborador']))).filter(Boolean);
  let directory = new Map();
  try {
    directory = await loadUuidDirectory(uuids);
  } catch (error) {
    console.warn('[informativos/efetivos] não foi possível resolver UUIDs de indisponibilidade', error);
  }

  const intervalsByKey = new Map();
  rows.forEach((row) => {
    const uuid = clean(firstValue(row, ['colaborador_id', 'id_colaborador']));
    const registered = uuid ? directory.get(uuid) : null;
    const identity = {
      id: uuid,
      cpf: cpfNorm(firstValue(row, ['colaborador_cpf', 'cpf']) || registered?.cpf),
      name: clean(firstValue(row, ['colaborador_nome', 'nome']) || registered?.nome),
    };
    addInterval(intervalsByKey, identityKeys(identity), intervalFromRow(row, from, to));
  });
  return intervalsByKey;
}

function isCoveredByUnavailable(employee, date, intervalsByKey) {
  return identityKeys(employee).some((key) => (intervalsByKey.get(key) || [])
    .some((interval) => interval.start <= date && interval.end >= date));
}

function isFullyUnavailable(employee, from, to, intervalsByKey) {
  const activeFrom = employee.admission && employee.admission > from ? employee.admission : from;
  const activeTo = employee.dismissal && employee.dismissal < to ? employee.dismissal : to;
  const dates = enumerateDates(activeFrom, activeTo);
  return dates.length > 0 && dates.every((date) => isCoveredByUnavailable(employee, date, intervalsByKey));
}

function periodLabel(from, to) {
  return from === to ? formatDate(from) : `${formatDate(from)} a ${formatDate(to)}`;
}

function sortedRows() {
  const factor = efetivosState.sort.direction === 'asc' ? 1 : -1;
  return [...efetivosState.rows].sort((a, b) => PT.compare(a[efetivosState.sort.index], b[efetivosState.sort.index]) * factor);
}

function reportTitle(from, to) {
  return `Efetivos sem registro de cargas - ${periodLabel(from, to)}`;
}

function renderEffectiveReport(elements, from, to) {
  const rows = sortedRows();
  const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);
  elements.reportCount.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;
  elements.downloadAll.disabled = !rows.length || efetivosState.busy;
  elements.reportPages.innerHTML = '';

  if (!rows.length) {
    elements.reportPages.innerHTML = '<div class="li-empty">Todos os efetivos ativos aparecem no relatório de cargas ou estão cobertos por indisponibilidade no período.</div>';
    return;
  }

  const headers = ['Colaborador', 'Coordenação', 'Supervisão'];
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const pageRows = rows.slice(pageIndex * ROWS_PER_PAGE, (pageIndex + 1) * ROWS_PER_PAGE);
    const section = document.createElement('section');
    section.className = 'li-report-page';
    section.id = `li-report-page-${pageIndex}`;
    section.innerHTML = `
      <div class="li-report-head">
        <div>
          <h3>${esc(reportTitle(from, to))}</h3>
          <p>${esc(efetivosState.sourceLabel)}</p>
        </div>
        <span>Página ${pageIndex + 1} de ${totalPages}</span>
      </div>
      <div class="li-report-table-wrap">
        <table class="li-report-table">
          <thead><tr>${headers.map((header, index) => {
            const active = efetivosState.sort.index === index;
            const arrow = active ? (efetivosState.sort.direction === 'asc' ? '↑' : '↓') : '↕';
            return `<th><button type="button" data-efetivos-sort="${index}">${esc(header)} <span>${arrow}</span></button></th>`;
          }).join('')}</tr></thead>
          <tbody>${pageRows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="li-page-actions" data-html2canvas-ignore>
        <button class="btn btn-secondary" type="button" data-efetivos-download-page="${pageIndex}">Baixar PNG desta página</button>
      </div>`;
    elements.reportPages.appendChild(section);
  }
}

function setFeedback(elements, message, error = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle('is-error', error);
}

function setEffectiveBusy(elements, busy, message = '') {
  efetivosState.busy = busy;
  elements.generate.disabled = busy;
  elements.effectiveButton.disabled = busy;
  elements.downloadAll.disabled = busy || !efetivosState.rows.length;
  if (message) setFeedback(elements, message);
}

async function buildEffectiveReport(elements) {
  const from = elements.effectiveDateFrom.value;
  const to = elements.effectiveDateTo.value;
  if (!from || !to) {
    setFeedback(elements, 'Informe a data inicial e a data final.', true);
    return;
  }
  if (from > to) {
    setFeedback(elements, 'A data inicial não pode ser posterior à data final.', true);
    return;
  }

  setEffectiveBusy(elements, true, 'Cruzando efetivos ativos, cargas e indisponibilidades...');
  try {
    const [employees, loadNames, unavailableIntervals] = await Promise.all([
      loadEffectiveEmployees(from, to),
      loadLoadNames(from, to),
      loadUnavailabilityIntervals(from, to),
    ]);

    const unavailable = employees.filter((employee) => isFullyUnavailable(employee, from, to, unavailableIntervals));
    const missing = employees
      .filter((employee) => !loadNames.has(norm(employee.name)))
      .filter((employee) => !isFullyUnavailable(employee, from, to, unavailableIntervals))
      .sort((a, b) => PT.compare(a.name, b.name));

    efetivosState.rows = missing.map((employee) => [
      employee.name,
      employee.coordenacao || '-',
      employee.supervisao || '-',
    ]);
    efetivosState.sort = { index: 0, direction: 'asc' };
    efetivosState.sourceLabel = `Cruzamento do painel/Supabase: ${employees.length} efetivos ativos analisados; ${unavailable.length} indisponíveis por férias, atestado ou outro afastamento foram desconsiderados.`;
    renderEffectiveReport(elements, from, to);
    setFeedback(elements, `Conferência concluída: ${efetivosState.rows.length} efetivo(s) sem registro de cargas no período.`);
  } catch (error) {
    console.error('[informativos/efetivos] falha ao gerar relatório', error);
    efetivosState.rows = [];
    elements.reportPages.innerHTML = '<div class="li-empty">Não foi possível gerar o relatório de efetivos.</div>';
    elements.reportCount.textContent = '0 registros';
    setFeedback(elements, `Não foi possível gerar o relatório de efetivos: ${error.message || error}`, true);
  } finally {
    setEffectiveBusy(elements, false);
  }
}

async function ensureHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar o gerador de PNG.'));
    document.head.appendChild(script);
  });
  return window.html2canvas;
}

function slugify(value) {
  return String(value || 'relatorio')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

async function downloadEffectivePage(pageIndex, elements) {
  const page = document.getElementById(`li-report-page-${pageIndex}`);
  if (!page) return;
  const html2canvas = await ensureHtml2Canvas();
  const canvas = await html2canvas(page, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });
  const title = reportTitle(elements.effectiveDateFrom.value, elements.effectiveDateTo.value);
  const link = document.createElement('a');
  link.download = `${slugify(title)}_pag_${pageIndex + 1}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadAllEffective(elements) {
  const totalPages = elements.reportPages.querySelectorAll('.li-report-page').length;
  if (!totalPages || efetivosState.busy) return;
  setEffectiveBusy(elements, true);
  elements.downloadAll.textContent = 'Gerando páginas...';
  try {
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      elements.downloadAll.textContent = `Gerando ${pageIndex + 1}/${totalPages}...`;
      await downloadEffectivePage(pageIndex, elements);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  } catch (error) {
    setFeedback(elements, error.message || 'Falha ao gerar os arquivos PNG.', true);
  } finally {
    setEffectiveBusy(elements, false);
    elements.downloadAll.textContent = 'Baixar PNG de todas as páginas';
  }
}

function injectEnhancementStyles() {
  if (document.getElementById('liEfetivosEnhancementStyles')) return;
  const style = document.createElement('style');
  style.id = 'liEfetivosEnhancementStyles';
  style.textContent = `
    .li-head{display:block!important}
    .li-head .li-mode{justify-content:flex-start!important;margin-top:14px}
    .li-source{border-top:0!important;padding-top:0!important}
    .li-source-row{display:none!important}
    .li-actions{display:none!important}
    .li-generate-field{display:flex;align-items:flex-end}
    .li-generate-field .btn{width:100%;min-height:40px}
    #liEfetivosControls{grid-template-columns:repeat(3,minmax(180px,1fr))}
    @media(max-width:800px){#liEfetivosControls{grid-template-columns:1fr 1fr}.li-generate-field{grid-column:1/-1}}
    @media(max-width:520px){#liEfetivosControls{grid-template-columns:1fr}.li-generate-field{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

function makeGenerateSlot() {
  const slot = document.createElement('div');
  slot.className = 'li-field li-generate-field';
  slot.innerHTML = '<label>&nbsp;</label>';
  return slot;
}

function moveGenerateToVisibleControls(elements) {
  const target = efetivosState.active
    ? elements.effectiveControls
    : (!elements.volumeControls.hidden ? elements.volumeControls : elements.nheControls);
  if (!target) return;
  let slot = target.querySelector('.li-generate-field');
  if (!slot) {
    slot = makeGenerateSlot();
    target.appendChild(slot);
  }
  if (elements.generate.parentElement !== slot) slot.appendChild(elements.generate);
}

function activateEffectiveMode(elements) {
  efetivosState.active = true;
  elements.originalModeButtons.forEach((button) => button.classList.remove('active'));
  elements.effectiveButton.classList.add('active');
  elements.volumeControls.hidden = true;
  elements.nheControls.hidden = true;
  elements.effectiveControls.hidden = false;
  moveGenerateToVisibleControls(elements);
  buildEffectiveReport(elements);
}

function deactivateEffectiveMode(elements) {
  if (!efetivosState.active) return;
  efetivosState.active = false;
  elements.effectiveButton.classList.remove('active');
  elements.effectiveControls.hidden = true;
  window.setTimeout(() => moveGenerateToVisibleControls(elements), 0);
}

function installEnhancements() {
  const mode = document.querySelector('.li-mode');
  const sourceRow = document.querySelector('.li-source-row');
  const volumeControls = document.getElementById('liVolumeControls');
  const nheControls = document.getElementById('liNheControls');
  const generate = document.getElementById('liGenerate');
  const feedback = document.getElementById('liFeedback');
  const reportCount = document.getElementById('liReportCount');
  const reportPages = document.getElementById('liReportPages');
  const downloadAll = document.getElementById('liDownloadAll');
  if (!mode || !sourceRow || !volumeControls || !nheControls || !generate || !feedback || !reportCount || !reportPages || !downloadAll) return false;
  if (mode.dataset.efetivosInstalled === 'true') return true;
  mode.dataset.efetivosInstalled = 'true';

  injectEnhancementStyles();
  sourceRow.remove();

  const effectiveButton = document.createElement('button');
  effectiveButton.type = 'button';
  effectiveButton.textContent = 'Efetivos';
  effectiveButton.dataset.efetivosMode = 'true';
  mode.appendChild(effectiveButton);

  const range = defaultConferenceRange();
  const effectiveControls = document.createElement('div');
  effectiveControls.className = 'li-controls';
  effectiveControls.id = 'liEfetivosControls';
  effectiveControls.hidden = true;
  effectiveControls.innerHTML = `
    <div class="li-field"><label>Data inicial</label><input type="date" id="liEfetivosDateFrom" value="${range.from}" /></div>
    <div class="li-field"><label>Data final</label><input type="date" id="liEfetivosDateTo" value="${range.to}" /></div>`;
  nheControls.insertAdjacentElement('afterend', effectiveControls);

  const elements = {
    mode,
    originalModeButtons: Array.from(mode.querySelectorAll('[data-mode]')),
    effectiveButton,
    volumeControls,
    nheControls,
    effectiveControls,
    effectiveDateFrom: effectiveControls.querySelector('#liEfetivosDateFrom'),
    effectiveDateTo: effectiveControls.querySelector('#liEfetivosDateTo'),
    generate,
    feedback,
    reportCount,
    reportPages,
    downloadAll,
  };

  moveGenerateToVisibleControls(elements);

  effectiveButton.addEventListener('click', () => {
    if (efetivosState.busy || efetivosState.active) return;
    activateEffectiveMode(elements);
  });

  elements.originalModeButtons.forEach((button) => {
    button.addEventListener('click', () => deactivateEffectiveMode(elements), { capture: true });
    button.addEventListener('click', () => window.setTimeout(() => moveGenerateToVisibleControls(elements), 0));
  });

  generate.addEventListener('click', (event) => {
    if (!efetivosState.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    buildEffectiveReport(elements);
  }, { capture: true });

  [elements.effectiveDateFrom, elements.effectiveDateTo].forEach((input) => {
    input.addEventListener('change', () => {
      if (efetivosState.active && !efetivosState.busy) buildEffectiveReport(elements);
    });
  });

  reportPages.addEventListener('click', (event) => {
    if (!efetivosState.active) return;
    const download = event.target.closest('[data-efetivos-download-page]');
    if (download) {
      event.preventDefault();
      event.stopImmediatePropagation();
      downloadEffectivePage(Number(download.dataset.efetivosDownloadPage), elements)
        .catch((error) => setFeedback(elements, error.message, true));
      return;
    }
    const sort = event.target.closest('[data-efetivos-sort]');
    if (!sort) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const index = Number(sort.dataset.efetivosSort);
    efetivosState.sort = {
      index,
      direction: efetivosState.sort.index === index && efetivosState.sort.direction === 'asc' ? 'desc' : 'asc',
    };
    renderEffectiveReport(elements, elements.effectiveDateFrom.value, elements.effectiveDateTo.value);
  }, { capture: true });

  downloadAll.addEventListener('click', (event) => {
    if (!efetivosState.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    downloadAllEffective(elements);
  }, { capture: true });

  return true;
}

if (!installEnhancements()) {
  const observer = new MutationObserver(() => {
    if (installEnhancements()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
