import { supabase } from './supabaseClient.js';

const state = {
  rows: [],
  search: '',
  loading: false,
  mounted: false,
};

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function cancelIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
}

function injectStyles() {
  if (document.getElementById('hospCanceladasStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospCanceladasStyles';
  style.textContent = `
    .hosp-rd-tab[data-hosp-canceladas-tab] svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
    .hosp-rd-tab[data-hosp-canceladas-tab].active{color:#fecaca!important;background:rgba(127,29,29,.24)!important}
    #hospRdCanceladas .hosp-rd-table{min-width:1180px}
    #hospRdCanceladas .hosp-rd-table td{vertical-align:middle}
    #hospRdCanceladas .hosp-canceladas-person{font-weight:800;color:#e9fff4}
    #hospRdCanceladas .hosp-canceladas-muted{color:#91a89e;font-size:11px;margin-top:3px}
  `;
  document.head.appendChild(style);
}

function filteredRows() {
  const q = norm(state.search);
  if (!q) return state.rows;
  return state.rows.filter((row) => norm([
    row.solicitacao,
    row.data,
    row.colaboradores,
    row.cidade,
    row.uf,
    row.supervisao,
    row.solicitante,
    row.cancelado_por,
  ].join(' ')).includes(q));
}

function renderBody() {
  const tbody = document.getElementById('hospRdCanceladasBody');
  if (!tbody) return;
  const rows = filteredRows();
  tbody.innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td>${esc(row.solicitacao || '-')}</td>
      <td>${brDate(row.data)}</td>
      <td>${esc(row.dias ?? '-')}</td>
      <td><div class="hosp-canceladas-person">${esc(row.colaboradores || '-')}</div></td>
      <td>${esc(row.cidade || '-')}</td>
      <td>${esc(row.uf || '-')}</td>
      <td>${esc(row.supervisao || '-')}</td>
      <td>${esc(row.solicitante || '-')}</td>
      <td>${esc(row.cancelado_por || 'Não registrado')}</td>
    </tr>
  `).join('') : '<tr><td colspan="9"><div class="hosp-rd-empty">Nenhuma reserva cancelada encontrada.</div></td></tr>';

  const meta = document.getElementById('hospRdCanceladasMeta');
  if (meta) meta.textContent = state.search
    ? `${rows.length} de ${state.rows.length} canceladas`
    : `${state.rows.length} canceladas`;
}

async function loadCanceladas({ render = true } = {}) {
  if (state.loading) return;
  state.loading = true;
  const body = document.getElementById('hospRdCanceladasBody');
  if (render && body) body.innerHTML = '<tr><td colspan="9"><div class="hosp-rd-loading">Carregando canceladas...</div></td></tr>';
  try {
    const { data, error } = await supabase
      .from('hospedagem_canceladas')
      .select('*')
      .order('cancelado_em', { ascending: false, nullsFirst: false })
      .order('data', { ascending: false });
    if (error) throw error;
    state.rows = data || [];
    const count = document.getElementById('hospRdCountCancelled');
    if (count) count.textContent = String(state.rows.length);
    if (render) renderBody();
  } catch (error) {
    console.error('[hosp-canceladas] load', error);
    if (body) body.innerHTML = `<tr><td colspan="9"><div class="hosp-rd-empty">Não foi possível carregar canceladas: ${esc(error.message || error)}</div></td></tr>`;
  } finally {
    state.loading = false;
  }
}

function openCanceladas() {
  const root = document.getElementById('hospRedesignRoot');
  if (!root) return;
  root.querySelectorAll('.hosp-rd-tab').forEach((tab) => tab.classList.remove('active'));
  root.querySelector('[data-hosp-canceladas-tab]')?.classList.add('active');
  root.querySelectorAll('.hosp-rd-panel').forEach((panel) => panel.classList.remove('active'));
  document.getElementById('hospRdCanceladas')?.classList.add('active');
  loadCanceladas();
}

function mountCanceladas() {
  if (state.mounted) return true;
  const root = document.getElementById('hospRedesignRoot');
  const tabs = root?.querySelector('.hosp-rd-tabs');
  if (!root || !tabs) return false;

  injectStyles();

  if (!root.querySelector('[data-hosp-canceladas-tab]')) {
    const button = document.createElement('button');
    button.className = 'hosp-rd-tab';
    button.type = 'button';
    button.dataset.hospCanceladasTab = 'true';
    button.setAttribute('data-hosp-canceladas-tab', '');
    button.innerHTML = `${cancelIcon()} Canceladas <span class="hosp-rd-count" id="hospRdCountCancelled">0</span>`;
    const hotelsTab = tabs.querySelector('[data-hosp-rd-tab="hoteis"]');
    tabs.insertBefore(button, hotelsTab || tabs.querySelector('.hosp-rd-refresh'));
  }

  if (!document.getElementById('hospRdCanceladas')) {
    const panel = document.createElement('div');
    panel.id = 'hospRdCanceladas';
    panel.className = 'hosp-rd-panel';
    panel.innerHTML = `
      <div class="hosp-rd-toolbar">
        <div class="hosp-rd-title">
          <h3>Canceladas</h3>
          <p>Arquivo de solicitações e reservas canceladas. Os registros permanecem disponíveis para auditoria.</p>
        </div>
        <div class="hosp-rd-toolbar-right">
          <span class="hosp-canceladas-muted" id="hospRdCanceladasMeta">0 canceladas</span>
          <div class="hosp-rd-field hosp-rd-search">
            <label>Buscar</label>
            <input id="hospRdCanceladasSearch" type="search" autocomplete="off" placeholder="Colaborador, cidade, supervisão..." />
          </div>
        </div>
      </div>
      <div class="hosp-rd-table-wrap">
        <table class="hosp-rd-table">
          <thead><tr>
            <th>Solicitação</th>
            <th>Data</th>
            <th>Dias</th>
            <th>Colaboradores</th>
            <th>Cidade</th>
            <th>UF</th>
            <th>Supervisão</th>
            <th>Solicitante</th>
            <th>Cancelado por</th>
          </tr></thead>
          <tbody id="hospRdCanceladasBody"><tr><td colspan="9"><div class="hosp-rd-loading">Carregando canceladas...</div></td></tr></tbody>
        </table>
      </div>`;
    const hotelsPanel = document.getElementById('hospRdHoteis');
    root.insertBefore(panel, hotelsPanel || document.getElementById('hospRdModal'));
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-hosp-canceladas-tab]')) {
      event.preventDefault();
      openCanceladas();
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.id !== 'hospRdCanceladasSearch') return;
    state.search = event.target.value;
    renderBody();
  });

  state.mounted = true;
  loadCanceladas({ render: false });
  return true;
}

// Corrige os filtros do redesign: os painéis eram recriados a cada caractere,
// substituindo o input e derrubando foco/cursor.
let focusGeneration = 0;
const trackedSearchSelector = [
  '[data-hosp-rd-search]',
  '#solFiltroColaborador',
  '#solFiltroCidade',
  '#solFiltroSupervisao',
  '#solFiltroData',
].join(',');

function inputLocator(input) {
  if (input.dataset?.hospRdSearch) {
    return `[data-hosp-rd-search="${CSS.escape(input.dataset.hospRdSearch)}"]`;
  }
  return input.id ? `#${CSS.escape(input.id)}` : null;
}

function restoreFilterFocus(locator, value, start, end, generation) {
  if (generation !== focusGeneration || !locator) return;
  const replacement = document.querySelector(locator);
  if (!replacement || replacement.disabled || replacement.type === 'date') return;
  replacement.value = value;
  replacement.focus({ preventScroll: true });
  try {
    const length = replacement.value.length;
    replacement.setSelectionRange(Math.min(start ?? length, length), Math.min(end ?? length, length));
  } catch {}
}

document.addEventListener('pointerdown', () => { focusGeneration += 1; }, true);
document.addEventListener('input', (event) => {
  const input = event.target.closest?.(trackedSearchSelector);
  if (!input) return;
  const locator = inputLocator(input);
  if (!locator) return;
  const generation = ++focusGeneration;
  const value = input.value;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  queueMicrotask(() => restoreFilterFocus(locator, value, start, end, generation));
  requestAnimationFrame(() => restoreFilterFocus(locator, value, start, end, generation));
}, true);

if (!mountCanceladas()) {
  const observer = new MutationObserver(() => {
    if (mountCanceladas()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
