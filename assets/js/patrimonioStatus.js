import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

const FETCH_BATCH_SIZE = 1000;
const ROWS_PER_PAGE = 30;
const SNAP_CACHE_KEY = 'grao1000:patrimonio-status:v1';
const SNAP_CACHE_TTL = 30 * 60 * 1000;

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDiasInfo(row) {
  if (row?.dias_sem_leitura === null || row?.dias_sem_leitura === undefined || row?.dias_sem_leitura === '') {
    return { hasValue: false, value: null };
  }
  const n = Number(row.dias_sem_leitura);
  return Number.isFinite(n) ? { hasValue: true, value: n } : { hasValue: false, value: null };
}

function getRegional(row) {
  return normalizeText(row.coordenacao) || 'Sem regional';
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function injectStatusStyles() {
  if (document.getElementById('patrimonio-status-styles')) return;
  const style = document.createElement('style');
  style.id = 'patrimonio-status-styles';
  style.textContent = `
    .pat-status-page .pat-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 14px;
    }
    .pat-status-page .pat-tab {
      appearance: none;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-bottom-color: transparent;
      background: rgba(15, 23, 42, 0.34);
      color: rgba(226, 232, 240, 0.72);
      font: inherit;
      font-weight: 600;
      font-size: 13.5px;
      text-decoration: none;
      cursor: pointer;
      padding: 10px 20px;
      border-radius: 12px 12px 0 0;
      box-shadow: inset 0 -3px 0 transparent;
      transition: color .15s ease, background .15s ease;
    }
    .pat-status-page .pat-tab:hover { color: #e2e8f0; }
    .pat-status-page .pat-tab.active {
      background: rgba(2, 12, 10, 0.55);
      color: #ecfdf5;
      border-color: rgba(45, 212, 191, 0.3);
      border-bottom-color: transparent;
      box-shadow: inset 0 -3px 0 #2dd4a0;
    }
    .pat-status-page .grid-cards {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 18px;
    }
    .pat-status-page .hero-metric {
      font-size: clamp(1.8rem, 2.5vw, 2.3rem);
      line-height: 1;
      margin-top: 12px;
    }
    .status-table-shell {
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 18px;
      overflow: hidden;
      background: rgba(2, 12, 10, 0.55);
    }
    .status-table-scroll {
      overflow: auto;
      max-height: calc(100vh - 320px);
    }
    .status-table {
      width: 100%;
      min-width: 940px;
      border-collapse: separate;
      border-spacing: 0;
    }
    .status-table thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: rgba(5, 18, 16, 0.98);
      padding: 13px 12px;
      font-size: .8rem;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: #dbeafe;
      white-space: nowrap;
      box-shadow: inset 0 -1px 0 rgba(148, 163, 184, 0.14);
    }
    .status-table td {
      padding: 12px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
      vertical-align: middle;
    }
    .status-table tbody tr:nth-child(odd) td {
      background: rgba(255,255,255,0.018);
    }
    .status-table tbody tr:hover td {
      background: rgba(52, 211, 153, 0.08);
    }
    .status-primary {
      font-weight: 600;
      color: #f8fafc;
    }
    .status-secondary {
      font-size: .82rem;
      color: #6b7280;
    }
    .progress-wrap {
      min-width: 220px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .progress-track {
      position: relative;
      flex: 1 1 auto;
      height: 12px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.14);
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.18);
    }
    .progress-bar {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      border-radius: 999px;
      background: linear-gradient(90deg, #22c55e, #86efac);
    }
    .progress-bar.warn {
      background: linear-gradient(90deg, #f59e0b, #fbbf24);
    }
    .progress-bar.danger {
      background: linear-gradient(90deg, #ef4444, #f87171);
    }
    .progress-label {
      min-width: 52px;
      text-align: right;
      font-weight: 700;
      color: #e2e8f0;
    }
    .status-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 5px 10px;
      background: rgba(45, 212, 191, 0.12);
      border: 1px solid rgba(45, 212, 191, 0.25);
      color: #ccfbf1;
      font-weight: 600;
      font-size: .82rem;
    }
    @media (max-width: 900px) {
      .status-table-scroll { max-height: none; }
      .progress-wrap { min-width: 180px; }
    }
  `;
  document.head.appendChild(style);
}

async function loadSnapshotRows() {
  const all = [];
  let from = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('patrimonios_snapshot')
      .select('coordenacao, supervisao, dias_sem_leitura')
      .order('coordenacao', { ascending: true })
      .order('supervisao', { ascending: true })
      .range(from, from + FETCH_BATCH_SIZE - 1);

    if (error) throw error;

    all.push(...(data || []));
    if ((data || []).length < FETCH_BATCH_SIZE) break;
    from += FETCH_BATCH_SIZE;
  }

  return all;
}

function buildStatusRows(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const regional = getRegional(row);
    const supervisao = normalizeText(row.supervisao) || 'Sem supervisão';
    const key = `${normalizeKey(regional)}|||${normalizeKey(supervisao)}`;

    if (!groups.has(key)) {
      groups.set(key, {
        coordenacao: regional,
        supervisao,
        total: 0,
        emDia: 0
      });
    }

    const group = groups.get(key);
    group.total += 1;

    const diasInfo = getDiasInfo(row);
    if (diasInfo.hasValue && diasInfo.value <= 10) {
      group.emDia += 1;
    }
  });

  return [...groups.values()]
    .map((item) => ({
      ...item,
      progresso: item.total ? (item.emDia / item.total) * 100 : 0
    }))
    .sort((a, b) => {
      const regionalCmp = a.coordenacao.localeCompare(b.coordenacao);
      if (regionalCmp !== 0) return regionalCmp;
      return a.supervisao.localeCompare(b.supervisao);
    });
}

function updateCards(rows) {
  const totalGrupos = rows.length;
  const totalItens = rows.reduce((sum, row) => sum + row.total, 0);
  const totalEmDia = rows.reduce((sum, row) => sum + row.emDia, 0);
  const percentual = totalItens ? Math.round((totalEmDia / totalItens) * 100) : 0;

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };

  set('sumGrupos', totalGrupos);
  set('sumItens', totalItens);
  set('sumEmDia', totalEmDia);
  set('sumPercentual', `${percentual}%`);
}

function progressClass(percentual) {
  if (percentual < 50) return 'danger';
  if (percentual < 80) return 'warn';
  return '';
}

function renderRows(rows, page) {
  const tbody = document.getElementById('statusRows');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum grupo encontrado com os filtros informados.</td></tr>';
    return;
  }

  const start = (page - 1) * ROWS_PER_PAGE;
  const pageRows = rows.slice(start, start + ROWS_PER_PAGE);

  tbody.innerHTML = pageRows.map((row) => {
    const percentual = Math.round(row.progresso);
    const klass = progressClass(percentual);
    return `
      <tr>
        <td>
          <div class="status-primary">${escapeHtml(row.coordenacao)}</div>
        </td>
        <td>
          <div class="status-primary">${escapeHtml(row.supervisao)}</div>
        </td>
        <td><span class="status-chip">${escapeHtml(row.total)}</span></td>
        <td><span class="status-chip">${escapeHtml(row.emDia)}</span></td>
        <td>
          <div class="progress-wrap">
            <div class="progress-track"><div class="progress-bar ${klass}" style="width:${percentual}%;"></div></div>
            <div class="progress-label">${escapeHtml(formatPercent(percentual))}</div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updatePagination(totalRows, page) {
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalRows ? ((safePage - 1) * ROWS_PER_PAGE) + 1 : 0;
  const end = Math.min(safePage * ROWS_PER_PAGE, totalRows);

  const info = document.getElementById('paginationInfo');
  const prev = document.getElementById('btnPrevPage');
  const next = document.getElementById('btnNextPage');

  if (info) info.textContent = totalRows ? `Página ${safePage}/${totalPages} • exibindo ${start}-${end} de ${totalRows}` : 'Página 1/1 • sem registros';
  if (prev) prev.disabled = safePage <= 1;
  if (next) next.disabled = safePage >= totalPages;

  return safePage;
}

export function renderContent(content) {
  injectStatusStyles();
  const relatoriosUrl = toPanelUrl('adm-patrimonio');
  const statusUrl = toPanelUrl('patrimonio-status');

  content.innerHTML = `
    <section class="base-page pat-status-page">
      <div class="pat-tabs" role="tablist">
        <a href="${relatoriosUrl}" class="pat-tab">Relatórios</a>
        <a href="${statusUrl}" class="pat-tab active">Status</a>
        <a href="${relatoriosUrl}" class="pat-tab">Desligados</a>
      </div>

      <div class="grid-cards">
        <article class="card"><h3>Grupos</h3><div class="hero-metric" id="sumGrupos">0</div></article>
        <article class="card"><h3>Total de itens</h3><div class="hero-metric" id="sumItens">0</div></article>
        <article class="card"><h3>Em dia</h3><div class="hero-metric" id="sumEmDia">0</div></article>
        <article class="card"><h3>Progresso médio</h3><div class="hero-metric" id="sumPercentual">0%</div></article>
      </div>

      <article class="base-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <strong>Status por coordenação e supervisão</strong>
            <div class="status-secondary">Tabela consolidada com barra de progresso por grupo.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button class="base-button secondary" id="btnPrevPage" type="button">Anterior</button>
            <span id="paginationInfo" class="status-chip">Página 1/1</span>
            <button class="base-button secondary" id="btnNextPage" type="button">Próxima</button>
          </div>
        </div>
        <div class="status-table-shell">
          <div class="status-table-scroll">
            <table class="status-table">
              <thead>
                <tr>
                  <th>Coordenação</th>
                  <th>Supervisão</th>
                  <th>Total</th>
                  <th>Em dia</th>
                  <th>Progresso</th>
                </tr>
              </thead>
              <tbody id="statusRows">
                <tr><td colspan="5">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </article>
    </section>
  `;

  const state = {
    allRows: [],
    page: 1
  };

  const render = () => {
    state.page = updatePagination(state.allRows.length, state.page);
    renderRows(state.allRows, state.page);
    updateCards(state.allRows);
  };

  document.getElementById('btnPrevPage')?.addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    state.page = updatePagination(state.allRows.length, state.page);
    renderRows(state.allRows, state.page);
  });
  document.getElementById('btnNextPage')?.addEventListener('click', () => {
    const maxPage = Math.max(1, Math.ceil(state.allRows.length / ROWS_PER_PAGE));
    state.page = Math.min(maxPage, state.page + 1);
    state.page = updatePagination(state.allRows.length, state.page);
    renderRows(state.allRows, state.page);
  });

  (async () => {
    try {
      let snapshotRows;
      try {
        const raw = localStorage.getItem(SNAP_CACHE_KEY);
        if (raw) {
          const { ts, rows } = JSON.parse(raw);
          if (Date.now() - ts < SNAP_CACHE_TTL) snapshotRows = rows;
        }
      } catch {}
      if (!snapshotRows) {
        snapshotRows = await loadSnapshotRows();
        try { localStorage.setItem(SNAP_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: snapshotRows })); } catch {}
      }
      state.allRows = buildStatusRows(snapshotRows);
      render();
    } catch (error) {
      console.error(error);
      updateCards([]);
      const tbody = document.getElementById('statusRows');
      if (tbody) tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(error?.message || 'Erro ao carregar o status de patrimônios.')}</td></tr>`;
    }
  })();
}

initProtectedPage('Status de Patrimônios', renderContent);
