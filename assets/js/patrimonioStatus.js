import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';
import { injectEstilosFrotas, cardFiltro } from './patrimonioLayoutFrotas.js?v=20261019-layout-geral';

const SVG_SETA = (pontos) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="${pontos}"></polyline></svg>`;
const ICON_ANTERIOR = SVG_SETA('15 18 9 12 15 6');
const ICON_PROXIMA = SVG_SETA('9 18 15 12 9 6');

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

// Mesmo limiar do Dashboard/gestor-app/histórico (dashboard.js, gestor-app.js) —
// unificado em 09/09/2026, esta tela usava 10 dias e as demais 7.
const DIAS_LIMITE_ATRASO = 7;

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
    /* Abas no padrão dos hubs do Frotas (assets/css/frotas-hub.css): texto + risco no ativo. */
    .pat-status-page .frotas-hub-tabs { margin-bottom: 14px; }
    .pat-status-page a.ds-tab { text-decoration: none; }
    .status-table { min-width: 940px; }
    .status-primary { font-weight: 600; color: #f8fafc; }
    .status-secondary { font-size: .82rem; color: #94a3b8; }
    .pat-status-page .pat-pagination { display:flex; gap:8px; align-items:center; white-space:nowrap; margin-left:auto; }
    .pat-status-page .pat-pagination .fm-ic:disabled { opacity:.35; cursor:not-allowed; }
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
    .status-chip { display:inline-flex; align-items:center; justify-content:center; border-radius:999px; padding:4px 10px; background:rgba(15,23,42,.72); border:1px solid rgba(148,163,184,.18); color:#e2e8f0; font-weight:900; font-size:12px; }
    @media (max-width: 900px) {
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
      .order('id', { ascending: true }) // desempate: sem chave única a paginação repete/pula linhas
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
    if (diasInfo.hasValue && diasInfo.value <= DIAS_LIMITE_ATRASO) {
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
    tbody.innerHTML = '<tr><td colspan="5" class="fm-empty">Nenhum grupo encontrado com os filtros informados.</td></tr>';
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
  injectEstilosFrotas();
  injectStatusStyles();
  const relatoriosUrl = toPanelUrl('adm-patrimonio');
  const statusUrl = toPanelUrl('patrimonio-status');

  content.innerHTML = `
    <section class="base-page pat-status-page">
      <div class="frotas-hub-tabs">
        <div class="ds-tabs" role="tablist">
          <a href="${relatoriosUrl}" class="ds-tab" role="tab" aria-selected="false">Relatórios</a>
          <a href="${statusUrl}" class="ds-tab active" role="tab" aria-selected="true">Status</a>
          <a href="${relatoriosUrl}" class="ds-tab" role="tab" aria-selected="false">Desligados</a>
        </div>
      </div>

      <div class="fm-kpis">
        ${cardFiltro({ label: 'Grupos', tone: 'blue', icone: 'total', kpi: 'id="sumGrupos"', dica: 'Combinações de regional e supervisão' })}
        ${cardFiltro({ label: 'Total de itens', tone: 'amber', icone: 'ferramenta', kpi: 'id="sumItens"' })}
        ${cardFiltro({ label: 'Em dia', tone: 'green', icone: 'ok', kpi: 'id="sumEmDia"', dica: 'Patrimônios com leitura em dia' })}
        ${cardFiltro({ label: 'Progresso médio', tone: 'purple', icone: 'relogio', kpi: 'id="sumPercentual"' })}
      </div>

      <div class="fm-card"><div class="fm-body">
        <div class="fm-bar">
          <span class="status-secondary">Status por coordenação e supervisão — tabela consolidada com barra de progresso por grupo.</span>
          <div class="pat-pagination">
            <button class="fm-ic" id="btnPrevPage" type="button" title="Página anterior" aria-label="Página anterior">${ICON_ANTERIOR}</button>
            <span id="paginationInfo" class="status-chip">Página 1/1</span>
            <button class="fm-ic" id="btnNextPage" type="button" title="Próxima página" aria-label="Próxima página">${ICON_PROXIMA}</button>
          </div>
        </div>
        <div class="fm-table-wrap">
          <table class="fm-table status-table">
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
              <tr><td colspan="5" class="fm-empty">Carregando...</td></tr>
            </tbody>
          </table>
        </div>
      </div></div>
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
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="fm-empty">${escapeHtml(error?.message || 'Erro ao carregar o status de patrimônios.')}</td></tr>`;
    }
  })();
}

initProtectedPage('Status de Patrimônios', renderContent);
