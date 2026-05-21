/* assets/js/modules/metas.js
 * Módulo Diretoria > METAS
 * Padrão do projeto: IIFE + window.METAS.openHome(container, { auth, api, onBack })
 *
 * Regras oficiais:
 * - Produção usada para bater meta = Relatório de Produção Diária
 * - Tabela: public.producao_snapshot
 * - Coluna: tons
 * - Não usar embarcado, total_embarcado_mais_teste nem views do Resultado Diário
 */

(function () {
  'use strict';

  const STYLE_ID = 'metas-module-style-v1';

  const MONTHS = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
  ];

  const DEFAULT_STATE = {
    loading: false,
    ano: new Date().getFullYear(),
    mes: new Date().getMonth() + 1,
    estado: '',
    regional: '',
    tab: 'geral',
    regionais: [],
    estados: [],
    mensal: [],
    metasCadastro: [],
    producaoCoordenacoes: [],
    metaEstimativa: '',
    erro: null
  };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .metas-page {
        --metas-bg: #020617;
        --metas-card: rgba(15, 23, 42, .92);
        --metas-card-2: rgba(17, 24, 39, .82);
        --metas-border: rgba(148, 163, 184, .18);
        --metas-text: #e2e2f0;
        --metas-muted: #6b7280;
        --metas-green: #22c55e;
        --metas-green-2: #166534;
        --metas-yellow: #facc15;
        --metas-red: #ef4444;
        --metas-blue: #38bdf8;
        color: var(--metas-text);
        width: 100%;
      }

      .metas-page * {
        box-sizing: border-box;
      }

      .metas-header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .metas-title-wrap h1 {
        margin: 0;
        font-size: 28px;
        letter-spacing: -.04em;
        line-height: 1.05;
      }

      .metas-title-wrap p {
        margin: 8px 0 0;
        color: var(--metas-muted);
        font-size: 13px;
        max-width: 760px;
      }

      .metas-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .metas-btn {
        border: 1px solid rgba(34, 197, 94, .35);
        background: linear-gradient(135deg, rgba(22, 101, 52, .96), rgba(21, 128, 61, .85));
        color: #ecfdf5;
        border-radius: 14px;
        padding: 10px 14px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 12px 26px rgba(0,0,0,.22);
        transition: transform .15s ease, border-color .15s ease, filter .15s ease;
      }

      .metas-btn:hover {
        transform: translateY(-1px);
        filter: brightness(1.05);
        border-color: rgba(74, 222, 128, .75);
      }

      .metas-btn.secondary {
        background: rgba(15, 23, 42, .78);
        color: var(--metas-text);
        border-color: var(--metas-border);
      }

      .metas-filter-card,
      .metas-card,
      .metas-table-card {
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, .08), transparent 32%),
          linear-gradient(180deg, rgba(15, 23, 42, .96), rgba(2, 6, 23, .88));
        border: 1px solid var(--metas-border);
        border-radius: 22px;
        box-shadow: 0 18px 40px rgba(0,0,0,.26);
      }

      .metas-filter-card {
        padding: 16px;
        margin-bottom: 16px;
      }

      .metas-filters {
        display: grid;
        grid-template-columns: repeat(5, minmax(120px, 1fr));
        gap: 12px;
        align-items: end;
      }

      .metas-field label {
        display: block;
        font-size: 11px;
        color: var(--metas-muted);
        margin: 0 0 6px;
        text-transform: uppercase;
        letter-spacing: .08em;
      }

      .metas-field select,
      .metas-field input {
        width: 100%;
        border: 1px solid var(--metas-border);
        border-radius: 14px;
        background: #0d0d18;
        color: #e2e2f0;
        padding: 10px 11px;
        outline: none;
        color-scheme: dark;
      }

      .metas-field select option {
        background: #0d0d18;
        color: #e2e2f0;
      }

      .metas-field select option:checked {
        background: #166534;
        color: #ffffff;
      }

      .metas-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 0 0 16px;
      }

      .metas-tab {
        border: 1px solid var(--metas-border);
        background: rgba(15, 23, 42, .72);
        color: var(--metas-muted);
        padding: 9px 12px;
        border-radius: 999px;
        font-weight: 700;
        cursor: pointer;
      }

      .metas-tab.active {
        color: #dcfce7;
        background: rgba(22, 101, 52, .84);
        border-color: rgba(74, 222, 128, .42);
      }

      .metas-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(140px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .metas-card {
        padding: 16px;
        overflow: hidden;
      }

      .metas-card-label {
        font-size: 12px;
        color: var(--metas-muted);
        margin-bottom: 8px;
      }

      .metas-card-value {
        font-size: 26px;
        font-weight: 900;
        letter-spacing: -.04em;
      }

      .metas-card-sub {
        margin-top: 8px;
        font-size: 12px;
        color: var(--metas-muted);
      }

      .metas-grid-2 {
        display: grid;
        grid-template-columns: 1.1fr .9fr;
        gap: 16px;
        margin-bottom: 16px;
      }

      .metas-section-title {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 14px;
      }

      .metas-section-title h2 {
        margin: 0;
        font-size: 16px;
        letter-spacing: -.02em;
      }

      .metas-section-title span {
        color: var(--metas-muted);
        font-size: 12px;
      }

      .metas-progress-wrap {
        margin-top: 12px;
      }

      .metas-progress {
        height: 16px;
        width: 100%;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(148, 163, 184, .18);
        border: 1px solid rgba(148, 163, 184, .16);
      }

      .metas-progress-fill {
        height: 100%;
        width: 0;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(34,197,94,.78), rgba(132,204,22,.94));
        transition: width .35s ease;
      }

      .metas-progress-meta {
        display: flex;
        justify-content: space-between;
        color: var(--metas-muted);
        font-size: 12px;
        margin-top: 8px;
      }

      .metas-bars {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .metas-bar-row {
        display: grid;
        grid-template-columns: minmax(120px, 190px) 1fr minmax(74px, 90px);
        gap: 10px;
        align-items: center;
      }

      .metas-bar-name {
        color: var(--metas-text);
        font-weight: 750;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .metas-bar-track {
        height: 13px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(148, 163, 184, .16);
      }

      .metas-bar-fill {
        height: 100%;
        width: 0;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(34,197,94,.72), rgba(56,189,248,.82));
      }

      .metas-bar-value {
        color: var(--metas-muted);
        text-align: right;
        font-size: 12px;
        font-weight: 700;
      }

      .metas-table-card {
        overflow: hidden;
      }

      .metas-table-top {
        padding: 14px 16px;
        border-bottom: 1px solid var(--metas-border);
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }

      .metas-table-top h2 {
        margin: 0;
        font-size: 16px;
      }

      .metas-table-wrap {
        width: 100%;
        overflow: auto;
      }

      .metas-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 760px;
      }

      .metas-table th,
      .metas-table td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(148, 163, 184, .10);
        text-align: left;
        font-size: 13px;
      }

      .metas-table th {
        color: var(--metas-muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .08em;
        background: rgba(15, 23, 42, .62);
      }

      .metas-table td.num,
      .metas-table th.num {
        text-align: right;
      }

      .metas-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 12px;
        font-weight: 800;
        background: rgba(148, 163, 184, .12);
        color: var(--metas-muted);
        border: 1px solid rgba(148, 163, 184, .14);
      }

      .metas-pill.good {
        color: #bbf7d0;
        background: rgba(22, 101, 52, .42);
        border-color: rgba(74, 222, 128, .26);
      }

      .metas-pill.warn {
        color: #fef08a;
        background: rgba(133, 77, 14, .35);
        border-color: rgba(250, 204, 21, .22);
      }

      .metas-pill.bad {
        color: #fecaca;
        background: rgba(127, 29, 29, .35);
        border-color: rgba(248, 113, 113, .22);
      }

      .metas-empty,
      .metas-error {
        padding: 22px;
        border: 1px dashed rgba(148, 163, 184, .25);
        border-radius: 18px;
        color: var(--metas-muted);
        background: rgba(15, 23, 42, .45);
      }

      .metas-error {
        color: #fecaca;
        border-color: rgba(248, 113, 113, .3);
        background: rgba(127, 29, 29, .18);
      }

      .metas-form-grid {
        display: grid;
        grid-template-columns: 110px 110px 120px 1fr 150px auto;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--metas-border);
        align-items: end;
      }



      .metas-suggest-card {
        padding: 16px;
        border-bottom: 1px solid var(--metas-border);
        display: grid;
        grid-template-columns: minmax(220px, 1fr) auto auto;
        gap: 12px;
        align-items: end;
      }

      .metas-config-hint {
        margin: 0;
        color: var(--metas-muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .metas-edit-input {
        width: 100%;
        min-width: 110px;
        border: 1px solid var(--metas-border);
        border-radius: 12px;
        background: #0d0d18;
        color: #e2e2f0;
        padding: 9px 10px;
        outline: none;
        color-scheme: dark;
      }

      .metas-edit-input:disabled {
        opacity: .65;
        cursor: not-allowed;
      }

      .metas-close-panel {
        padding: 14px 16px;
        border-bottom: 1px solid var(--metas-border);
        display: grid;
        grid-template-columns: minmax(260px, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      .metas-close-title {
        font-weight: 900;
        margin-bottom: 5px;
      }

      .metas-close-sub {
        color: var(--metas-muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .metas-row-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 14px 16px;
        border-top: 1px solid var(--metas-border);
      }

      .metas-mini {
        font-size: 11px;
        color: var(--metas-muted);
        margin-top: 4px;
      }

      .metas-section-spacer {
        margin-top: 16px;
      }

      .metas-loading {
        opacity: .65;
        pointer-events: none;
      }

      @media (max-width: 1100px) {
        .metas-filters,
        .metas-kpis,
        .metas-grid-2,
        .metas-form-grid,
        .metas-suggest-card,
        .metas-close-panel {
          grid-template-columns: 1fr 1fr;
        }
      }

      @media (max-width: 720px) {
        .metas-header {
          flex-direction: column;
        }

        .metas-filters,
        .metas-kpis,
        .metas-grid-2,
        .metas-form-grid,
        .metas-suggest-card,
        .metas-close-panel {
          grid-template-columns: 1fr;
        }

        .metas-actions {
          justify-content: flex-start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmtTons(value) {
    const n = Number(value || 0);
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
  }

  function fmtPct(value) {
    const n = Number(value || 0);
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function pctClass(value) {
    const n = Number(value || 0);
    if (n >= 100) return 'good';
    if (n >= 60) return 'warn';
    return 'bad';
  }

  function clampPct(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  function getSupabaseClient(api) {
    if (api && typeof api.from === 'function') return api;
    if (api && api.supabase) return api.supabase;
    if (api && api.client) return api.client;
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase) return window.supabase;
    if (window.sb) return window.sb;
    return null;
  }

  async function fetchAllRows(queryBuilder) {
    const { data, error } = await queryBuilder;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function getMonthName(mes) {
    const item = MONTHS.find(m => Number(m.value) === Number(mes));
    return item ? item.label : String(mes || '');
  }

  function buildOptions(items, current, allLabel) {
    return [
      `<option value="">${escapeHtml(allLabel)}</option>`,
      ...items.map(item => `<option value="${escapeHtml(item)}" ${String(item) === String(current) ? 'selected' : ''}>${escapeHtml(item)}</option>`)
    ].join('');
  }


  function normalizarTexto(value) {
    return String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  function toInputNumber(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    return String(Math.round(n * 100) / 100);
  }

  function getMonthRange(ano, mes) {
    const start = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const nextDate = new Date(Number(ano), Number(mes), 1);
    const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
    return { start, next };
  }

  function rowKey(row) {
    return normalizarTexto(row.regional || row.coordenacao || row.coordenação || '');
  }

  function isClosedRow(row) {
    return Boolean(row && (row.fechado || row.status_fechamento));
  }

  function isMonthClosed(state) {
    return state.metasCadastro.some(isClosedRow);
  }

  function getRowStatus(row) {
    const explicit = normalizarTexto(row.status_fechamento || '');
    if (explicit === 'ATINGIU' || explicit === 'OK') return 'ATINGIU';
    if (explicit === 'NAO_ATINGIU' || explicit === 'NÃO ATINGIU' || explicit === 'PENDENTE') return 'NAO_ATINGIU';

    const meta = Number(row.meta_tons || 0);
    const produzido = Number(row.produzido_tons || row.produzido_fechamento || 0);
    if (meta <= 0) return 'SEM_META';
    return produzido >= meta ? 'ATINGIU' : 'NAO_ATINGIU';
  }

  function mergeCoordenacoes(state) {
    const map = new Map();

    function put(row, source) {
      const key = rowKey(row);
      if (!key) return;
      const old = map.get(key) || {};
      map.set(key, {
        ...old,
        ...row,
        source: old.source || source,
        estado: row.estado || old.estado || '',
        regional: row.regional || row.coordenacao || old.regional || '',
        meta_tons: row.meta_tons ?? old.meta_tons ?? 0,
        produzido_tons: row.produzido_tons ?? old.produzido_tons ?? 0,
        restante_tons: row.restante_tons ?? old.restante_tons ?? Math.max(0, Number(row.meta_tons || old.meta_tons || 0) - Number(row.produzido_tons || old.produzido_tons || 0)),
        percentual_atingido: row.percentual_atingido ?? old.percentual_atingido ?? 0,
        ativo: row.ativo ?? old.ativo ?? true,
        fechado: row.fechado ?? old.fechado ?? false,
        status_fechamento: row.status_fechamento ?? old.status_fechamento ?? null,
        fechado_em: row.fechado_em ?? old.fechado_em ?? null
      });
    }

    state.producaoCoordenacoes.forEach(row => put(row, 'producao'));
    state.regionais.forEach(row => put(row, 'view'));
    state.metasCadastro.forEach(row => put(row, 'meta'));

    return Array.from(map.values()).sort((a, b) => String(a.regional || '').localeCompare(String(b.regional || ''), 'pt-BR'));
  }

  function calcularSugestoesDistribuicao(rows, totalEstimado) {
    const total = Number(totalEstimado || 0);
    if (!rows.length || !total) return new Map();

    const producaoTotal = rows.reduce((acc, row) => acc + Number(row.produzido_tons || 0), 0);
    const pesoIgual = 1 / rows.length;
    const out = new Map();

    rows.forEach(row => {
      const peso = producaoTotal > 0 ? Number(row.produzido_tons || 0) / producaoTotal : pesoIgual;
      out.set(rowKey(row), Math.round(total * peso * 100) / 100);
    });

    return out;
  }

  function fechamentoResumo(rows) {
    const atingiram = [];
    const naoAtingiram = [];
    const semMeta = [];

    rows.forEach(row => {
      const status = getRowStatus(row);
      if (status === 'ATINGIU') atingiram.push(row);
      else if (status === 'NAO_ATINGIU') naoAtingiram.push(row);
      else semMeta.push(row);
    });

    return { atingiram, naoAtingiram, semMeta };
  }

  function totalsFromRegional(rows) {
    const meta = rows.reduce((acc, r) => acc + Number(r.meta_tons || 0), 0);
    const produzido = rows.reduce((acc, r) => acc + Number(r.produzido_tons || 0), 0);
    const restante = Math.max(0, meta - produzido);
    const percentual = meta > 0 ? (produzido / meta) * 100 : 0;
    const best = [...rows].sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0))[0];
    const bestEstado = rows.reduce((map, row) => {
      const estado = row.estado || 'Sem estado';
      map[estado] = (map[estado] || 0) + Number(row.produzido_tons || 0);
      return map;
    }, {});
    const estadoTop = Object.entries(bestEstado).sort((a, b) => b[1] - a[1])[0];

    return { meta, produzido, restante, percentual, best, estadoTop };
  }

  function renderKpis(rows) {
    const total = totalsFromRegional(rows);

    return `
      <div class="metas-kpis">
        <div class="metas-card">
          <div class="metas-card-label">Meta do período</div>
          <div class="metas-card-value">${fmtTons(total.meta)}</div>
          <div class="metas-card-sub">Soma das metas regionais ativas</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">Produzido</div>
          <div class="metas-card-value">${fmtTons(total.produzido)}</div>
          <div class="metas-card-sub">Base: toneladas classificadas</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">Restante</div>
          <div class="metas-card-value">${fmtTons(total.restante)}</div>
          <div class="metas-card-sub">Saldo até atingir a meta</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">% atingido</div>
          <div class="metas-card-value">${fmtPct(total.percentual)}</div>
          <div class="metas-card-sub">${total.best ? `Líder: ${escapeHtml(total.best.regional)}` : 'Sem produção no período'}</div>
        </div>
      </div>
    `;
  }

  function renderProgress(rows) {
    const total = totalsFromRegional(rows);
    const pct = clampPct(total.percentual);

    return `
      <div class="metas-card">
        <div class="metas-section-title">
          <h2>Comparativo Produzido x Restante</h2>
          <span>${fmtPct(total.percentual)} atingido</span>
        </div>

        <div class="metas-progress-wrap">
          <div class="metas-progress" title="${fmtPct(total.percentual)}">
            <div class="metas-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="metas-progress-meta">
            <span>Produzido: ${fmtTons(total.produzido)}</span>
            <span>Restante: ${fmtTons(total.restante)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderBars(title, subtitle, rows, labelKey, valueKey, limit) {
    const list = [...rows]
      .sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0))
      .slice(0, limit || 12);

    const max = Math.max(...list.map(r => Number(r[valueKey] || 0)), 1);

    return `
      <div class="metas-card">
        <div class="metas-section-title">
          <h2>${escapeHtml(title)}</h2>
          <span>${escapeHtml(subtitle || '')}</span>
        </div>

        ${
          list.length
            ? `<div class="metas-bars">
                ${list.map(row => {
                  const value = Number(row[valueKey] || 0);
                  const pct = Math.max(2, (value / max) * 100);
                  return `
                    <div class="metas-bar-row">
                      <div class="metas-bar-name" title="${escapeHtml(row[labelKey])}">${escapeHtml(row[labelKey])}</div>
                      <div class="metas-bar-track">
                        <div class="metas-bar-fill" style="width:${pct}%"></div>
                      </div>
                      <div class="metas-bar-value">${fmtTons(value)}</div>
                    </div>
                  `;
                }).join('')}
              </div>`
            : `<div class="metas-empty">Nenhum dado encontrado para os filtros selecionados.</div>`
        }
      </div>
    `;
  }

  function renderRegionalTable(rows) {
    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Metas por Regional</h2>
          <span class="metas-pill">${rows.length} registros</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Regional</th>
                <th>Estado</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(row => `
                    <tr>
                      <td><strong>${escapeHtml(row.regional)}</strong></td>
                      <td>${escapeHtml(row.estado)}</td>
                      <td class="num">${fmtTons(row.meta_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_tons)}</td>
                      <td class="num">${fmtTons(row.restante_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="6"><div class="metas-empty">Nenhuma meta cadastrada para esse período.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderEstadoTable(rows) {
    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Consolidado por Estado</h2>
          <span class="metas-pill">${rows.length} estados</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(row => `
                    <tr>
                      <td><strong>${escapeHtml(row.estado)}</strong></td>
                      <td class="num">${fmtTons(row.meta_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_tons)}</td>
                      <td class="num">${fmtTons(row.restante_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="5"><div class="metas-empty">Nenhum estado encontrado para esse período.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderHistoricoTable(rows) {
    const ordered = [...rows].sort((a, b) => (Number(b.ano) - Number(a.ano)) || (Number(b.mes) - Number(a.mes)));

    return `
      <div class="metas-grid-2">
        ${renderBars('Histórico mensal', 'Produção por mês', [...rows].sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes))).map(r => ({
          label: `${getMonthName(r.mes).slice(0, 3)}/${r.ano}`,
          produzido_total_tons: r.produzido_total_tons
        })), 'label', 'produzido_total_tons', 12)}
        ${renderBars('Meta mensal', 'Comparativo por mês', [...rows].sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes))).map(r => ({
          label: `${getMonthName(r.mes).slice(0, 3)}/${r.ano}`,
          meta_total_tons: r.meta_total_tons
        })), 'label', 'meta_total_tons', 12)}
      </div>

      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Histórico mês a mês</h2>
          <span class="metas-pill">${ordered.length} meses</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                ordered.length
                  ? ordered.map(row => `
                    <tr>
                      <td><strong>${getMonthName(row.mes)}/${row.ano}</strong></td>
                      <td class="num">${fmtTons(row.meta_total_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_total_tons)}</td>
                      <td class="num">${fmtTons(row.restante_total_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="5"><div class="metas-empty">Histórico ainda não encontrado.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderCadastroMetas(state) {
    const years = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);

    const rows = mergeCoordenacoes(state);
    const fechado = isMonthClosed(state);
    const sugestoes = calcularSugestoesDistribuicao(rows, state.metaEstimativa);
    const resumo = fechamentoResumo(rows.filter(row => Number(row.meta_tons || 0) > 0));

    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Configurar Metas por Coordenação</h2>
          <span class="metas-pill ${fechado ? 'good' : ''}">${fechado ? 'Mês fechado' : 'Cadastro em lista'}</span>
        </div>

        <div class="metas-suggest-card">
          <div class="metas-field">
            <label>Valor estimado do mês</label>
            <input class="metas-edit-input" data-metas-estimativa type="number" step="0.01" min="0" value="${escapeHtml(state.metaEstimativa)}" placeholder="Ex.: 1000000" ${fechado ? 'disabled' : ''} />
            <p class="metas-config-hint">
              Informe a meta total do mês e clique em sugerir. A distribuição é proporcional à produção atual de cada coordenação; se ainda não houver produção, divide igualmente.
            </p>
          </div>
          <button class="metas-btn secondary" type="button" data-metas-suggest ${fechado ? 'disabled' : ''}>Sugerir distribuição</button>
          <button class="metas-btn" type="button" data-metas-save-list ${fechado ? 'disabled' : ''}>Salvar lista</button>
        </div>

        <div class="metas-close-panel">
          <div>
            <div class="metas-close-title">Fechamento da meta de ${getMonthName(state.mes)}/${state.ano}</div>
            <div class="metas-close-sub">
              Ao fechar, o painel marca cada coordenação como <strong>atingiu</strong> ou <strong>não atingiu</strong> e bloqueia novas alterações da meta cadastrada para o mês selecionado.
            </div>
          </div>
          <button class="metas-btn ${fechado ? 'secondary' : ''}" type="button" data-metas-close ${fechado ? 'disabled' : ''}>
            ${fechado ? 'Meta fechada' : 'Fechar meta'}
          </button>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Coordenação</th>
                <th class="num">Produção atual</th>
                <th class="num">Sugestão</th>
                <th class="num">Meta cadastrada</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(row => {
                    const key = rowKey(row);
                    const sugestao = sugestoes.get(key) || 0;
                    const metaAtual = Number(row.meta_tons || 0);
                    const inputValue = state.metaEstimativa ? toInputNumber(sugestao) : toInputNumber(metaAtual);
                    const status = getRowStatus(row);
                    return `
                      <tr data-metas-meta-row data-key="${escapeHtml(key)}">
                        <td>
                          <input class="metas-edit-input" data-meta-field="estado" value="${escapeHtml(row.estado || '')}" placeholder="UF/Estado" ${fechado ? 'disabled' : ''} />
                        </td>
                        <td>
                          <strong>${escapeHtml(row.regional || '')}</strong>
                          <input type="hidden" data-meta-field="regional" value="${escapeHtml(row.regional || '')}" />
                          <div class="metas-mini">Base: Produção Diária</div>
                        </td>
                        <td class="num">${fmtTons(row.produzido_tons)}</td>
                        <td class="num">${state.metaEstimativa ? fmtTons(sugestao) : '—'}</td>
                        <td class="num">
                          <input class="metas-edit-input" data-meta-field="meta_tons" type="number" step="0.01" min="0" value="${escapeHtml(inputValue)}" ${fechado ? 'disabled' : ''} />
                        </td>
                        <td><span class="metas-pill ${status === 'ATINGIU' ? 'good' : status === 'NAO_ATINGIU' ? 'bad' : 'warn'}">${status === 'ATINGIU' ? 'Atingiu' : status === 'NAO_ATINGIU' ? 'Não atingiu' : 'Sem meta'}</span></td>
                      </tr>
                    `;
                  }).join('')
                  : `<tr><td colspan="6"><div class="metas-empty">Nenhuma coordenação encontrada. Importe o Relatório de Produção Diária ou cadastre uma meta manualmente.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="metas-table-card metas-section-spacer">
        <div class="metas-table-top">
          <h2>Resumo do Fechamento</h2>
          <span class="metas-pill">${resumo.atingiram.length} atingiram · ${resumo.naoAtingiram.length} não atingiram</span>
        </div>
        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Situação</th>
                <th>Coordenação</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${[...resumo.atingiram, ...resumo.naoAtingiram].length
                ? [...resumo.atingiram.map(row => ({ ...row, label: 'Atingiu' })), ...resumo.naoAtingiram.map(row => ({ ...row, label: 'Não atingiu' }))].map(row => `
                  <tr>
                    <td><span class="metas-pill ${row.label === 'Atingiu' ? 'good' : 'bad'}">${row.label}</span></td>
                    <td><strong>${escapeHtml(row.regional)}</strong></td>
                    <td class="num">${fmtTons(row.meta_tons)}</td>
                    <td class="num">${fmtTons(row.produzido_tons || row.produzido_fechamento)}</td>
                    <td class="num">${fmtPct(row.percentual_atingido || row.percentual_fechamento)}</td>
                  </tr>
                `).join('')
                : `<tr><td colspan="5"><div class="metas-empty">Ainda não há metas cadastradas para gerar o resumo de fechamento.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderMainContent(state) {
    if (state.erro) {
      return `<div class="metas-error"><strong>Erro ao carregar metas:</strong><br>${escapeHtml(state.erro)}</div>`;
    }

    if (state.tab === 'regionais') {
      return `
        ${renderKpis(state.regionais)}
        ${renderBars('Corrida de produção por regional', 'Ranking por toneladas classificadas', state.regionais, 'regional', 'produzido_tons', 20)}
        ${renderRegionalTable(state.regionais)}
      `;
    }

    if (state.tab === 'estados') {
      return `
        ${renderBars('Comparativo por Estado', 'Estados com uma ou mais regionais', state.estados, 'estado', 'produzido_tons', 20)}
        ${renderEstadoTable(state.estados)}
      `;
    }

    if (state.tab === 'historico') {
      return renderHistoricoTable(state.mensal);
    }

    if (state.tab === 'configurar') {
      return renderCadastroMetas(state);
    }

    return `
      ${renderKpis(state.regionais)}
      <div class="metas-grid-2">
        ${renderProgress(state.regionais)}
        ${renderBars('Corrida de produção', 'Top regionais do mês', state.regionais, 'regional', 'produzido_tons', 8)}
      </div>
      <div class="metas-grid-2">
        ${renderBars('Comparativo por Estado', 'Produção consolidada', state.estados, 'estado', 'produzido_tons', 8)}
        ${renderBars('Histórico recente', 'Produção mensal', [...state.mensal].sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes))).map(r => ({
          label: `${getMonthName(r.mes).slice(0, 3)}/${r.ano}`,
          produzido_total_tons: r.produzido_total_tons
        })), 'label', 'produzido_total_tons', 8)}
      </div>
      ${renderRegionalTable(state.regionais)}
    `;
  }

  function render(container, state) {
    const estados = uniqueSorted([
      ...state.regionais.map(r => r.estado),
      ...state.estados.map(r => r.estado),
      ...state.metasCadastro.map(r => r.estado)
    ]);

    const regionais = uniqueSorted([
      ...state.regionais.map(r => r.regional),
      ...state.metasCadastro.map(r => r.regional)
    ]);

    const years = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);

    container.innerHTML = `
      <div class="metas-page ${state.loading ? 'metas-loading' : ''}">
        <div class="metas-header">
          <div class="metas-title-wrap">
            <h1>Metas de Produção</h1>
            <p>
              Acompanhamento mensal da meta por regional e estado.
              Produção considerada: <strong>Relatório de Produção Diária</strong>, coluna <strong>Tons</strong>.
            </p>
          </div>
          <div class="metas-actions">
            <button class="metas-btn secondary" type="button" data-metas-back>Voltar</button>
            <button class="metas-btn" type="button" data-metas-refresh>Atualizar</button>
          </div>
        </div>

        <div class="metas-filter-card">
          <div class="metas-filters">
            <div class="metas-field">
              <label>Mês da meta</label>
              <select data-metas-filter="mes">
                ${MONTHS.map(m => `<option value="${m.value}" ${Number(state.mes) === Number(m.value) ? 'selected' : ''}>${m.label}</option>`).join('')}
              </select>
            </div>

            <div class="metas-field">
              <label>Ano da meta</label>
              <select data-metas-filter="ano">
                ${years.map(y => `<option value="${y}" ${Number(state.ano) === y ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>

            <div class="metas-field">
              <label>Estado</label>
              <select data-metas-filter="estado">
                ${buildOptions(estados, state.estado, 'Todos os estados')}
              </select>
            </div>

            <div class="metas-field">
              <label>Regional</label>
              <select data-metas-filter="regional">
                ${buildOptions(regionais, state.regional, 'Todas as regionais')}
              </select>
            </div>

            <button class="metas-btn" type="button" data-metas-apply>Aplicar filtros</button>
          </div>
        </div>

        <div class="metas-close-panel" style="margin: 0 0 16px;">
          <div>
            <div class="metas-close-title">Período selecionado: ${getMonthName(state.mes)}/${state.ano}</div>
            <div class="metas-close-sub">As metas salvas, a progressão e o fechamento abaixo usam exatamente este mês/ano.</div>
          </div>
          <span class="metas-pill">Base: Produção Diária</span>
        </div>

        <div class="metas-tabs">
          <button type="button" class="metas-tab ${state.tab === 'geral' ? 'active' : ''}" data-metas-tab="geral">Visão Geral</button>
          <button type="button" class="metas-tab ${state.tab === 'regionais' ? 'active' : ''}" data-metas-tab="regionais">Regionais</button>
          <button type="button" class="metas-tab ${state.tab === 'estados' ? 'active' : ''}" data-metas-tab="estados">Estados</button>
          <button type="button" class="metas-tab ${state.tab === 'historico' ? 'active' : ''}" data-metas-tab="historico">Histórico Mensal</button>
          <button type="button" class="metas-tab ${state.tab === 'configurar' ? 'active' : ''}" data-metas-tab="configurar">Configurar / Fechar</button>
        </div>

        <div data-metas-content>
          ${renderMainContent(state)}
        </div>
      </div>
    `;
  }

  async function loadData(state, supabase) {
    state.loading = true;
    state.erro = null;

    try {
      const mes = Number(state.mes);
      const ano = Number(state.ano);
      const range = getMonthRange(ano, mes);
      const yearStart = `${ano}-01-01`;
      const yearNext = `${ano + 1}-01-01`;

      let metasQuery = supabase
        .from('metas_producao')
        .select('*')
        .eq('ano', ano)
        .eq('mes', mes)
        .order('estado', { ascending: true })
        .order('regional', { ascending: true });

      if (state.estado) metasQuery = metasQuery.eq('estado', state.estado);
      if (state.regional) metasQuery = metasQuery.eq('regional', state.regional);

      const producaoMesQuery = supabase
        .from('producao_snapshot')
        .select('data,coordenacao,tons')
        .gte('data', range.start)
        .lt('data', range.next)
        .limit(50000);

      const producaoAnoQuery = supabase
        .from('producao_snapshot')
        .select('data,coordenacao,tons')
        .gte('data', yearStart)
        .lt('data', yearNext)
        .limit(50000);

      const metasAnoQuery = supabase
        .from('metas_producao')
        .select('*')
        .eq('ano', ano);

      const [metasCadastro, producaoRows, producaoAnoRows, metasAnoRows] = await Promise.all([
        fetchAllRows(metasQuery),
        fetchAllRows(producaoMesQuery),
        fetchAllRows(producaoAnoQuery),
        fetchAllRows(metasAnoQuery)
      ]);

      const metaMap = new Map();
      metasCadastro.forEach(row => {
        const key = rowKey(row);
        if (key) metaMap.set(key, row);
      });

      const producaoMap = producaoRows.reduce((map, row) => {
        const regional = String(row.coordenacao || '').trim();
        const key = normalizarTexto(regional);
        if (!key) return map;
        const metaRow = metaMap.get(key) || {};
        const old = map.get(key) || {
          estado: metaRow.estado || '',
          regional,
          produzido_tons: 0
        };
        old.produzido_tons += Number(row.tons || 0);
        map.set(key, old);
        return map;
      }, new Map());

      metasCadastro.forEach(metaRow => {
        const key = rowKey(metaRow);
        if (!key) return;
        const old = producaoMap.get(key) || {
          estado: metaRow.estado || '',
          regional: metaRow.regional || metaRow.coordenacao || '',
          produzido_tons: 0
        };
        old.estado = metaRow.estado || old.estado || '';
        old.regional = metaRow.regional || metaRow.coordenacao || old.regional || '';
        producaoMap.set(key, old);
      });

      let regionais = Array.from(producaoMap.values()).map(row => {
        const metaRow = metaMap.get(rowKey(row)) || {};
        const meta = Number(metaRow.meta_tons || 0);
        const produzido = Number(row.produzido_tons || 0);
        return {
          ...row,
          estado: row.estado || metaRow.estado || '',
          regional: row.regional || metaRow.regional || '',
          meta_tons: meta,
          produzido_tons: produzido,
          restante_tons: Math.max(0, meta - produzido),
          percentual_atingido: meta > 0 ? (produzido / meta) * 100 : 0,
          ativo: metaRow.ativo ?? true,
          fechado: metaRow.fechado ?? false,
          status_fechamento: metaRow.status_fechamento ?? null,
          fechado_em: metaRow.fechado_em ?? null
        };
      });

      if (state.estado) regionais = regionais.filter(row => String(row.estado || '') === String(state.estado));
      if (state.regional) regionais = regionais.filter(row => String(row.regional || '') === String(state.regional));

      regionais.sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0));

      const estadoMap = regionais.reduce((map, row) => {
        const estado = row.estado || 'Sem estado';
        const old = map.get(estado) || { estado, meta_tons: 0, produzido_tons: 0 };
        old.meta_tons += Number(row.meta_tons || 0);
        old.produzido_tons += Number(row.produzido_tons || 0);
        map.set(estado, old);
        return map;
      }, new Map());

      const estados = Array.from(estadoMap.values()).map(row => ({
        ...row,
        restante_tons: Math.max(0, Number(row.meta_tons || 0) - Number(row.produzido_tons || 0)),
        percentual_atingido: Number(row.meta_tons || 0) > 0 ? (Number(row.produzido_tons || 0) / Number(row.meta_tons || 0)) * 100 : 0
      })).sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0));

      const mensalMap = new Map();
      producaoAnoRows.forEach(row => {
        const d = String(row.data || '').slice(0, 10);
        const m = Number(d.slice(5, 7));
        if (!m) return;
        const old = mensalMap.get(m) || { ano, mes: m, meta_total_tons: 0, produzido_total_tons: 0 };
        old.produzido_total_tons += Number(row.tons || 0);
        mensalMap.set(m, old);
      });

      metasAnoRows.forEach(row => {
        const m = Number(row.mes || 0);
        if (!m) return;
        const old = mensalMap.get(m) || { ano, mes: m, meta_total_tons: 0, produzido_total_tons: 0 };
        old.meta_total_tons += Number(row.meta_tons || 0);
        mensalMap.set(m, old);
      });

      const mensal = Array.from(mensalMap.values()).map(row => ({
        ...row,
        restante_total_tons: Math.max(0, Number(row.meta_total_tons || 0) - Number(row.produzido_total_tons || 0)),
        percentual_atingido: Number(row.meta_total_tons || 0) > 0 ? (Number(row.produzido_total_tons || 0) / Number(row.meta_total_tons || 0)) * 100 : 0
      })).sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes)));

      state.regionais = regionais;
      state.estados = estados;
      state.metasCadastro = metasCadastro;
      state.mensal = mensal;
      state.producaoCoordenacoes = regionais.map(row => ({
        estado: row.estado,
        regional: row.regional,
        produzido_tons: row.produzido_tons
      }));
    } catch (err) {
      console.error('[METAS] Erro ao carregar dados:', err);
      state.erro = err && err.message ? err.message : String(err);
    } finally {
      state.loading = false;
    }
  }

  async function salvarMeta(form, state, supabase, rerender) {
    const fd = new FormData(form);

    const payload = {
      ano: Number(fd.get('ano')),
      mes: Number(fd.get('mes')),
      estado: String(fd.get('estado') || '').trim().toUpperCase(),
      regional: String(fd.get('regional') || '').trim(),
      meta_tons: Number(fd.get('meta_tons') || 0),
      ativo: true,
      updated_at: new Date().toISOString()
    };

    if (!payload.ano || !payload.mes || !payload.estado || !payload.regional) {
      alert('Preencha ano, mês, estado e regional.');
      return;
    }

    const { error } = await supabase
      .from('metas_producao')
      .upsert(payload, { onConflict: 'ano,mes,regional' });

    if (error) {
      console.error('[METAS] Erro ao salvar meta:', error);
      alert('Erro ao salvar meta: ' + error.message);
      return;
    }

    state.ano = payload.ano;
    state.mes = payload.mes;
    state.estado = '';
    state.regional = '';

    await loadData(state, supabase);
    rerender();
  }

  async function salvarListaMetas(container, state, supabase, rerender) {
    if (isMonthClosed(state)) {
      alert('Esta meta já foi fechada. Não é possível alterar a lista do mês selecionado.');
      return;
    }

    const rows = Array.from(container.querySelectorAll('[data-metas-meta-row]'));
    const payloads = rows.map(tr => {
      const estado = tr.querySelector('[data-meta-field="estado"]');
      const regional = tr.querySelector('[data-meta-field="regional"]');
      const meta = tr.querySelector('[data-meta-field="meta_tons"]');
      return {
        ano: Number(state.ano),
        mes: Number(state.mes),
        estado: String(estado && estado.value ? estado.value : '').trim().toUpperCase(),
        regional: String(regional && regional.value ? regional.value : '').trim(),
        meta_tons: Number(meta && meta.value ? meta.value : 0),
        ativo: true,
        updated_at: new Date().toISOString()
      };
    }).filter(row => row.regional && row.meta_tons > 0);

    if (!payloads.length) {
      alert('Informe ao menos uma coordenação com meta maior que zero.');
      return;
    }

    const { error } = await supabase
      .from('metas_producao')
      .upsert(payloads, { onConflict: 'ano,mes,regional' });

    if (error) {
      console.error('[METAS] Erro ao salvar lista de metas:', error);
      alert('Erro ao salvar lista de metas: ' + error.message);
      return;
    }

    state.estado = '';
    state.regional = '';
    await loadData(state, supabase);
    rerender();
  }

  async function fecharMetaMes(state, supabase, rerender) {
    if (isMonthClosed(state)) {
      alert('A meta deste mês já está fechada.');
      return;
    }

    const rows = mergeCoordenacoes(state).filter(row => Number(row.meta_tons || 0) > 0);
    if (!rows.length) {
      alert('Cadastre as metas do mês antes de fechar.');
      return;
    }

    const confirmado = window.confirm(`Fechar a meta de ${getMonthName(state.mes)}/${state.ano}? Depois disso, a lista ficará bloqueada para edição.`);
    if (!confirmado) return;

    const now = new Date().toISOString();
    const payloads = rows.map(row => {
      const meta = Number(row.meta_tons || 0);
      const produzido = Number(row.produzido_tons || 0);
      const percentual = meta > 0 ? (produzido / meta) * 100 : 0;
      return {
        ano: Number(state.ano),
        mes: Number(state.mes),
        estado: String(row.estado || '').trim().toUpperCase(),
        regional: String(row.regional || '').trim(),
        meta_tons: meta,
        ativo: true,
        fechado: true,
        fechado_em: now,
        status_fechamento: produzido >= meta ? 'ATINGIU' : 'NAO_ATINGIU',
        produzido_fechamento: produzido,
        percentual_fechamento: percentual,
        updated_at: now
      };
    });

    const { error } = await supabase
      .from('metas_producao')
      .upsert(payloads, { onConflict: 'ano,mes,regional' });

    if (error) {
      console.error('[METAS] Erro ao fechar meta:', error);
      alert('Erro ao fechar meta: ' + error.message + '\n\nSe aparecer coluna inexistente, execute primeiro o SQL enviado junto com o ZIP.');
      return;
    }

    await loadData(state, supabase);
    rerender();
  }


  function bindEvents(container, state, supabase, opts) {
    const rerender = () => {
      render(container, state);
      bindEvents(container, state, supabase, opts);
    };

    const reload = async () => {
      await loadData(state, supabase);
      rerender();
    };

    const backBtn = container.querySelector('[data-metas-back]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (typeof opts.onBack === 'function') opts.onBack();
      });
    }

    const refreshBtn = container.querySelector('[data-metas-refresh]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', reload);
    }

    const applyBtn = container.querySelector('[data-metas-apply]');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        const mes = container.querySelector('[data-metas-filter="mes"]');
        const ano = container.querySelector('[data-metas-filter="ano"]');
        const estado = container.querySelector('[data-metas-filter="estado"]');
        const regional = container.querySelector('[data-metas-filter="regional"]');

        state.mes = Number(mes && mes.value ? mes.value : state.mes);
        state.ano = Number(ano && ano.value ? ano.value : state.ano);
        state.estado = estado ? estado.value : '';
        state.regional = regional ? regional.value : '';

        await reload();
      });
    }

    container.querySelectorAll('[data-metas-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tab = btn.getAttribute('data-metas-tab') || 'geral';
        rerender();
      });
    });

    const estimativa = container.querySelector('[data-metas-estimativa]');
    if (estimativa) {
      estimativa.addEventListener('input', () => {
        state.metaEstimativa = estimativa.value;
      });
    }

    const suggestBtn = container.querySelector('[data-metas-suggest]');
    if (suggestBtn) {
      suggestBtn.addEventListener('click', () => {
        const input = container.querySelector('[data-metas-estimativa]');
        state.metaEstimativa = input ? input.value : state.metaEstimativa;
        if (!Number(state.metaEstimativa || 0)) {
          alert('Informe o valor estimado do mês para sugerir a distribuição.');
          return;
        }
        rerender();
      });
    }

    const saveListBtn = container.querySelector('[data-metas-save-list]');
    if (saveListBtn) {
      saveListBtn.addEventListener('click', async () => {
        await salvarListaMetas(container, state, supabase, rerender);
      });
    }

    const closeBtn = container.querySelector('[data-metas-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        await fecharMetaMes(state, supabase, rerender);
      });
    }

    const form = container.querySelector('[data-metas-form]');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await salvarMeta(form, state, supabase, rerender);
      });
    }
  }

  async function openHome(container, opts) {
    injectStyle();

    const options = opts || {};
    const supabase = getSupabaseClient(options.supabase || options.api);

    if (!container) {
      console.error('[METAS] Container não informado.');
      return;
    }

    if (!supabase || typeof supabase.from !== 'function') {
      container.innerHTML = `
        <div class="metas-page">
          <div class="metas-error">
            <strong>Cliente Supabase não encontrado.</strong><br>
            O módulo METAS precisa receber api.supabase, api.client, window.supabaseClient, window.supabase ou window.sb.
          </div>
        </div>
      `;
      return;
    }

    const state = Object.assign({}, DEFAULT_STATE, {
      ano: Number(options.ano || DEFAULT_STATE.ano),
      mes: Number(options.mes || DEFAULT_STATE.mes)
    });

    render(container, state);
    bindEvents(container, state, supabase, options);

    await loadData(state, supabase);
    render(container, state);
    bindEvents(container, state, supabase, options);
  }

  window.METAS = {
    openHome
  };
})();
