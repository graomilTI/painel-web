/* assets/js/modules/metas.js
 * Módulo Diretoria > METAS
 * Padrão do projeto: IIFE + window.METAS.openHome(container, { auth, api, onBack })
 *
 * Regras oficiais:
 * - Produção usada para bater meta = produção diária importada em producao_snapshot.tons
 * - A base é o Relatório de Produção Diária: Coordenação, Data e Tons
 * - Não usar Resultado Diário, embarcado nem total_embarcado_mais_teste
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
    erro: null,
    gestores: [],
    gestoresEditId: null
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

      .metas-compare-wrap {
        margin-top: 12px;
      }

      .metas-compare-chart-area {
        display: flex;
        gap: 20px;
        height: 130px;
        align-items: flex-end;
        padding: 0 32px;
      }

      .metas-compare-col-bar {
        flex: 1;
        display: flex;
        align-items: flex-end;
        height: 100%;
      }

      .metas-compare-bar {
        width: 100%;
        border-radius: 8px 8px 0 0;
        min-height: 4px;
        transition: height .4s ease;
      }

      .metas-compare-bar.bar-meta {
        background: linear-gradient(180deg, rgba(56,189,248,.72), rgba(14,165,233,.48));
        border: 1px solid rgba(56,189,248,.28);
        border-bottom: none;
      }

      .metas-compare-bar.bar-prod.good {
        background: linear-gradient(180deg, rgba(34,197,94,.84), rgba(22,163,74,.60));
        border: 1px solid rgba(34,197,94,.32);
        border-bottom: none;
      }

      .metas-compare-bar.bar-prod.warn {
        background: linear-gradient(180deg, rgba(250,204,21,.84), rgba(234,179,8,.60));
        border: 1px solid rgba(250,204,21,.32);
        border-bottom: none;
      }

      .metas-compare-bar.bar-prod.bad {
        background: linear-gradient(180deg, rgba(239,68,68,.84), rgba(220,38,38,.60));
        border: 1px solid rgba(239,68,68,.32);
        border-bottom: none;
      }

      .metas-compare-x-axis {
        height: 1px;
        background: rgba(148,163,184,.22);
        margin: 0 32px;
      }

      .metas-compare-labels {
        display: flex;
        gap: 20px;
        padding: 10px 32px 0;
      }

      .metas-compare-col-label {
        flex: 1;
        text-align: center;
      }

      .metas-compare-lbl {
        font-size: 11px;
        color: var(--metas-muted);
        text-transform: uppercase;
        letter-spacing: .08em;
        font-weight: 700;
      }

      .metas-compare-val {
        font-size: 14px;
        font-weight: 800;
        margin-top: 3px;
      }

      .metas-compare-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--metas-border);
        color: var(--metas-muted);
        font-size: 12px;
      }

      .metas-rc-legend {
        display: flex;
        gap: 18px;
        justify-content: center;
        margin-bottom: 10px;
      }

      .metas-rc-legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--metas-muted);
      }

      .metas-rc-legend-dot {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        flex-shrink: 0;
      }

      .metas-rc-legend-dot.restante {
        background: rgba(187,247,208,.45);
        border: 1px solid rgba(134,239,172,.5);
      }

      .metas-rc-legend-dot.atual {
        background: rgba(22,163,74,.9);
        border: 1px solid rgba(74,222,128,.4);
      }

      .metas-rc-scroll {
        overflow-x: auto;
        overflow-y: visible;
        padding-bottom: 4px;
      }

      .metas-rc-inner {
        display: flex;
        gap: 5px;
        height: 300px;
        align-items: stretch;
        width: 100%;
      }

      .metas-rc-col {
        flex: 1;
        min-width: 46px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .metas-rc-top-val {
        height: 20px;
        font-size: 8px;
        color: var(--metas-muted);
        font-weight: 700;
        text-align: center;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        width: 100%;
        text-overflow: ellipsis;
      }

      .metas-rc-bar {
        flex: 1;
        width: 100%;
        display: flex;
        flex-direction: column;
        border-radius: 4px 4px 0 0;
        overflow: hidden;
        cursor: default;
        position: relative;
      }

      .metas-rc-restante {
        width: 100%;
        background: rgba(187,247,208,.42);
        border: 1px solid rgba(134,239,172,.35);
        border-bottom: none;
        box-sizing: border-box;
        flex-shrink: 0;
      }

      .metas-rc-atual {
        width: 100%;
        background: linear-gradient(180deg, rgba(34,197,94,.92), rgba(21,128,61,.97));
        flex-shrink: 0;
      }

      .metas-rc-label-wrap {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }

      .metas-rc-label {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        font-size: 10px;
        font-weight: 800;
        color: #fff;
        white-space: nowrap;
        text-shadow: 0 1px 4px rgba(0,0,0,.75), 0 0 10px rgba(0,0,0,.45);
        letter-spacing: .02em;
      }

      .metas-rc-bot-val {
        height: 18px;
        font-size: 8px;
        color: var(--metas-text);
        font-weight: 700;
        text-align: center;
        display: flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        width: 100%;
        overflow: hidden;
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

      .metas-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.65);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        backdrop-filter: blur(2px);
      }
      .metas-modal {
        background: #0d0d18;
        border: 1px solid rgba(52,211,153,.2);
        border-radius: 20px;
        padding: 24px;
        max-width: 860px;
        width: 100%;
        max-height: 88vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .metas-modal-header h3 {
        margin: 0 0 6px;
        font-size: 18px;
        font-weight: 800;
        color: #f1f5f9;
      }
      .metas-modal-header p {
        margin: 0;
        font-size: 13px;
        color: var(--metas-muted);
      }
      .metas-modal-threshold {
        padding: 12px 0 16px;
        border-bottom: 1px solid var(--metas-border);
      }
      .metas-modal-footer {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding-top: 8px;
        border-top: 1px solid var(--metas-border);
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

  async function fetchAllRows(queryBuilder, pageSize = 1000, maxRows = 50000) {
    const rows = [];
    let from = 0;

    while (from < maxRows) {
      const to = from + pageSize - 1;
      const pageBuilder = typeof queryBuilder.range === 'function' ? queryBuilder.range(from, to) : queryBuilder;
      const { data, error } = await pageBuilder;
      if (error) throw error;

      const page = Array.isArray(data) ? data : [];
      rows.push(...page);

      if (page.length < pageSize || typeof queryBuilder.range !== 'function') break;
      from += pageSize;
    }

    return rows;
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

  function contarDiasUteisAte(ano, mes, ateDia) {
    let total = 0;
    for (let d = 1; d <= ateDia; d++) {
      const dow = new Date(ano, mes - 1, d).getDay();
      if (dow !== 0 && dow !== 6) total++;
    }
    return total;
  }

  function projetarProducaoMes(rows, ano, mes) {
    const hoje = new Date();
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const ateDia = (ano === hoje.getFullYear() && mes === hoje.getMonth() + 1)
      ? Math.min(hoje.getDate(), ultimoDia)
      : ultimoDia;

    const diasDecorridos = contarDiasUteisAte(ano, mes, ateDia);
    const diasTotais = contarDiasUteisAte(ano, mes, ultimoDia);
    const fator = diasDecorridos > 0 ? diasTotais / diasDecorridos : 1;

    const producaoTotal = rows.reduce((acc, row) => acc + Number(row.produzido_tons || 0), 0);
    return Math.round(producaoTotal * fator * 100) / 100;
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
          <div class="metas-card-sub">Base: Relatório de Produção Diária · coluna Tons</div>
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
    const cls = pctClass(total.percentual);
    const withMeta = rows.filter(r => Number(r.meta_tons || 0) > 0);
    const sorted = [...withMeta].sort((a, b) => String(a.regional || '').localeCompare(String(b.regional || ''), 'pt-BR'));
    const statusMsg = total.produzido >= total.meta ? 'Meta atingida!' : `Faltam ${fmtTons(total.restante)}`;

    const cols = sorted.map(row => {
      const meta = Number(row.meta_tons || 0);
      const prod = Number(row.produzido_tons || 0);
      const prodPct = Math.min(100, meta > 0 ? (prod / meta) * 100 : 0);
      const restPct = 100 - prodPct;

      return `
        <div class="metas-rc-col">
          <div class="metas-rc-top-val" title="${fmtTons(meta)}">${fmtTons(meta)}</div>
          <div class="metas-rc-bar" title="${escapeHtml(row.regional)}: ${fmtPct(prodPct)} atingido">
            <div class="metas-rc-restante" style="height:${restPct.toFixed(2)}%"></div>
            <div class="metas-rc-atual" style="height:${Math.max(prodPct, 0).toFixed(2)}%"></div>
            <div class="metas-rc-label-wrap">
              <span class="metas-rc-label">${escapeHtml(row.regional)}</span>
            </div>
          </div>
          <div class="metas-rc-bot-val" title="${fmtTons(prod)}">${fmtTons(prod)}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="metas-card">
        <div class="metas-section-title">
          <h2>Meta vs Realizado por Regional</h2>
          <span class="metas-pill ${cls}">${fmtPct(total.percentual)} atingido</span>
        </div>

        <div class="metas-rc-legend">
          <span class="metas-rc-legend-item">
            <span class="metas-rc-legend-dot restante"></span>Restante
          </span>
          <span class="metas-rc-legend-item">
            <span class="metas-rc-legend-dot atual"></span>Atual
          </span>
        </div>

        <div class="metas-rc-scroll">
          <div class="metas-rc-inner">
            ${cols || '<div style="color:var(--metas-muted);font-size:13px;padding:16px;">Nenhuma meta cadastrada para o período.</div>'}
          </div>
        </div>

        <div class="metas-compare-footer">
          <span>${statusMsg}</span>
          <span class="metas-pill ${cls}">${fmtPct(total.percentual)} atingido</span>
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

  function renderGestores(state) {
    const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const calcBI = g => (Number(g.salario || 0) + Number(g.grat40 || 0)) * 0.1;

    const rows = [...state.gestores].sort((a, b) =>
      String(a.coordenacao || '').localeCompare(String(b.coordenacao || ''), 'pt-BR') ||
      String(a.gestor || '').localeCompare(String(b.gestor || ''), 'pt-BR')
    );

    function rowHtml(g) {
      const editing = String(g.id) === String(state.gestoresEditId);
      if (editing) {
        return `
          <tr data-metas-gestor-row data-id="${escapeHtml(String(g.id))}">
            <td><input class="metas-edit-input" data-gf="coordenacao" value="${escapeHtml(g.coordenacao || '')}" placeholder="Coordenação" /></td>
            <td><input class="metas-edit-input" data-gf="gestor" value="${escapeHtml(g.gestor || '')}" placeholder="Nome" /></td>
            <td><input class="metas-edit-input" data-gf="supervisao" value="${escapeHtml(g.supervisao || '')}" placeholder="Supervisão" /></td>
            <td class="num"><input class="metas-edit-input" data-gf="salario" type="number" step="0.01" value="${g.salario || ''}" placeholder="0,00" style="text-align:right;width:100px" /></td>
            <td class="num"><input class="metas-edit-input" data-gf="grat40" type="number" step="0.01" value="${g.grat40 || ''}" placeholder="0,00" style="text-align:right;width:90px" /></td>
            <td class="num" style="color:#86efac;font-weight:800">R$ ${fmtBRL(calcBI(g))}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="metas-btn" style="padding:5px 10px;font-size:11px" data-metas-gestor-save-edit="${escapeHtml(String(g.id))}">Salvar</button>
              <button class="metas-btn secondary" style="padding:5px 10px;font-size:11px;margin-left:4px" data-metas-gestor-cancel-edit>✕</button>
            </td>
          </tr>`;
      }
      return `
        <tr data-metas-gestor-row data-id="${escapeHtml(String(g.id))}">
          <td><strong>${escapeHtml(g.coordenacao || '')}</strong></td>
          <td>${escapeHtml(g.gestor || '')}</td>
          <td>${escapeHtml(g.supervisao || '—')}</td>
          <td class="num">R$ ${fmtBRL(g.salario)}</td>
          <td class="num">${Number(g.grat40 || 0) > 0 ? 'R$ ' + fmtBRL(g.grat40) : '—'}</td>
          <td class="num" style="color:#86efac;font-weight:800">R$ ${fmtBRL(calcBI(g))}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="metas-btn secondary" style="padding:5px 10px;font-size:11px" data-metas-gestor-edit="${escapeHtml(String(g.id))}">Editar</button>
            <button class="metas-btn secondary" style="padding:5px 10px;font-size:11px;color:#fca5a5;border-color:rgba(239,68,68,.3);margin-left:4px" data-metas-gestor-del="${escapeHtml(String(g.id))}">Excluir</button>
          </td>
        </tr>`;
    }

    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Gestores por Regional</h2>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="metas-pill">${rows.length} gestores</span>
            <button class="metas-btn" type="button" data-metas-gestor-add>+ Adicionar</button>
          </div>
        </div>

        <div id="metasGestorAddForm" style="display:none;padding:14px 16px;border-bottom:1px solid var(--metas-border)">
          <div style="display:grid;grid-template-columns:1fr 1.6fr 1.6fr 110px 110px auto;gap:10px;align-items:end">
            <div class="metas-field"><label>Coordenação</label><input class="metas-edit-input" id="mgfCoord" placeholder="Ex.: GOIAS" /></div>
            <div class="metas-field"><label>Gestor</label><input class="metas-edit-input" id="mgfGestor" placeholder="Nome completo" /></div>
            <div class="metas-field"><label>Supervisão</label><input class="metas-edit-input" id="mgfSup" placeholder="Ex.: GOIAS 1 - Rio Verde" /></div>
            <div class="metas-field"><label>Salário (R$)</label><input class="metas-edit-input" id="mgfSalario" type="number" step="0.01" min="0" placeholder="0,00" /></div>
            <div class="metas-field"><label>Grat. 40%</label><input class="metas-edit-input" id="mgfGrat" type="number" step="0.01" min="0" placeholder="0,00" /></div>
            <div style="display:flex;gap:6px">
              <button class="metas-btn" type="button" data-metas-gestor-save-new>Salvar</button>
              <button class="metas-btn secondary" type="button" data-metas-gestor-cancel>✕</button>
            </div>
          </div>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Coordenação</th>
                <th>Gestor</th>
                <th>Supervisão</th>
                <th class="num">Salário</th>
                <th class="num">Grat. 40%</th>
                <th class="num">Bônus Inicial</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.length
                ? rows.map(rowHtml).join('')
                : `<tr><td colspan="7"><div class="metas-empty">Nenhum gestor cadastrado.</div></td></tr>`}
            </tbody>
          </table>
        </div>
        <p class="metas-config-hint" style="padding:10px 16px">Bônus inicial = (salário + grat.40%) × 10%.</p>
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
              Clique em "Sugerir distribuição" para projetar automaticamente a produção do mês com base nos dias úteis decorridos. O total calculado será preenchido aqui e distribuído proporcionalmente por coordenação. Você também pode informar um valor manualmente antes de clicar.
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
                          <div class="metas-mini">Base: Produção Diária · Tons</div>
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
                  : `<tr><td colspan="6"><div class="metas-empty">Nenhuma coordenação encontrada. Importe o Resultado Diário ou cadastre uma meta manualmente.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="metas-table-card metas-section-spacer">
        <div class="metas-table-top">
          <h2>Resumo do Fechamento</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="metas-pill">${resumo.atingiram.length} atingiram · ${resumo.naoAtingiram.length} não atingiram</span>
            ${resumo.atingiram.filter(r => r.qualifica_bonus).length ? `<span class="metas-pill good">${resumo.atingiram.filter(r => r.qualifica_bonus).length} recebem bônus</span>` : ''}
          </div>
        </div>
        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Situação</th>
                <th>Coordenação</th>
                <th>Gestor</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">%</th>
                <th class="num">Bônus (produção)</th>
              </tr>
            </thead>
            <tbody>
              ${[...resumo.atingiram, ...resumo.naoAtingiram].length
                ? [...resumo.atingiram.map(row => ({ ...row, label: 'Atingiu' })), ...resumo.naoAtingiram.map(row => ({ ...row, label: 'Não atingiu' }))].map(row => {
                    const bonus = Number(row.bonus_producao || 0);
                    const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    return `
                      <tr>
                        <td><span class="metas-pill ${row.label === 'Atingiu' ? 'good' : 'bad'}">${row.label}</span></td>
                        <td><strong>${escapeHtml(row.regional)}</strong></td>
                        <td>${row.gestor ? escapeHtml(row.gestor) : '<span style="color:var(--metas-muted)">—</span>'}</td>
                        <td class="num">${fmtTons(row.meta_tons)}</td>
                        <td class="num">${fmtTons(row.produzido_tons || row.produzido_fechamento)}</td>
                        <td class="num">${fmtPct(row.percentual_atingido || row.percentual_fechamento)}</td>
                        <td class="num">${row.qualifica_bonus && bonus > 0 ? `<span style="color:#86efac;font-weight:800">${fmtBRL(bonus)}</span>` : '<span style="color:var(--metas-muted)">—</span>'}</td>
                      </tr>
                    `;
                  }).join('')
                : `<tr><td colspan="7"><div class="metas-empty">Ainda não há metas cadastradas para gerar o resumo de fechamento.</div></td></tr>`}
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

    if (state.tab === 'gestores') {
      return renderGestores(state);
    }

    if (state.tab === 'configurar') {
      return renderCadastroMetas(state);
    }

    return `
      ${renderKpis(state.regionais)}
      ${renderProgress(state.regionais)}
      ${renderBars('Produção por Estado', 'Produção consolidada por estado', state.estados, 'estado', 'produzido_tons', 20)}
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
              <label>Mês</label>
              <select data-metas-filter="mes">
                ${MONTHS.map(m => `<option value="${m.value}" ${Number(state.mes) === Number(m.value) ? 'selected' : ''}>${m.label}</option>`).join('')}
              </select>
            </div>

            <div class="metas-field">
              <label>Ano</label>
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

        <div class="metas-tabs">
          <button type="button" class="metas-tab ${state.tab === 'geral' ? 'active' : ''}" data-metas-tab="geral">Visão Geral</button>
          <button type="button" class="metas-tab ${state.tab === 'regionais' ? 'active' : ''}" data-metas-tab="regionais">Regionais</button>
          <button type="button" class="metas-tab ${state.tab === 'estados' ? 'active' : ''}" data-metas-tab="estados">Estados</button>
          <button type="button" class="metas-tab ${state.tab === 'historico' ? 'active' : ''}" data-metas-tab="historico">Histórico Mensal</button>
          <button type="button" class="metas-tab ${state.tab === 'gestores' ? 'active' : ''}" data-metas-tab="gestores">Gestores</button>
          <button type="button" class="metas-tab ${state.tab === 'configurar' ? 'active' : ''}" data-metas-tab="configurar">Configurar / Fechar</button>
        </div>

        <div data-metas-content>
          ${renderMainContent(state)}
        </div>
      </div>
    `;
  }

  function calcularLinhaMeta(row) {
    const meta = Number(row.meta_tons || 0);
    const produzido = Number(row.produzido_tons || 0);
    return {
      ...row,
      restante_tons: Math.max(0, meta - produzido),
      percentual_atingido: meta > 0 ? (produzido / meta) * 100 : 0
    };
  }

  function montarRegionaisDaProducao(producaoRows, metasCadastro, filtros = {}) {
    const map = new Map();

    producaoRows.forEach(row => {
      const regional = String(row.coordenacao || row.regional || '').trim();
      const key = normalizarTexto(regional);
      if (!key) return;
      const old = map.get(key) || {
        estado: '',
        regional,
        produzido_tons: 0,
        meta_tons: 0,
        ativo: true
      };
      old.produzido_tons += Number(row.tons || row.toneladas || 0);
      map.set(key, old);
    });

    metasCadastro.forEach(meta => {
      const regional = String(meta.regional || meta.coordenacao || '').trim();
      const key = normalizarTexto(regional);
      if (!key) return;
      const old = map.get(key) || {
        estado: '',
        regional,
        produzido_tons: 0,
        meta_tons: 0,
        ativo: true
      };
      map.set(key, {
        ...old,
        ...meta,
        regional: meta.regional || old.regional || regional,
        estado: meta.estado || old.estado || '',
        produzido_tons: old.produzido_tons || 0,
        meta_tons: Number(meta.meta_tons || old.meta_tons || 0),
        ativo: meta.ativo ?? old.ativo ?? true,
        fechado: meta.fechado ?? old.fechado ?? false,
        status_fechamento: meta.status_fechamento ?? old.status_fechamento ?? null,
        fechado_em: meta.fechado_em ?? old.fechado_em ?? null
      });
    });

    return Array.from(map.values())
      .map(calcularLinhaMeta)
      .filter(row => !filtros.estado || String(row.estado || '') === String(filtros.estado))
      .filter(row => !filtros.regional || rowKey(row) === normalizarTexto(filtros.regional))
      .sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0));
  }

  function montarEstadosDasRegionais(regionais) {
    const map = new Map();
    regionais.forEach(row => {
      const estado = String(row.estado || 'Sem estado').trim() || 'Sem estado';
      const old = map.get(estado) || {
        estado,
        meta_tons: 0,
        produzido_tons: 0,
        restante_tons: 0,
        percentual_atingido: 0
      };
      old.meta_tons += Number(row.meta_tons || 0);
      old.produzido_tons += Number(row.produzido_tons || 0);
      map.set(estado, old);
    });
    return Array.from(map.values())
      .map(calcularLinhaMeta)
      .sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0));
  }

  function montarHistoricoMensalProducao(producaoRows, metasCadastro, anoAtual, mesAtual) {
    const map = new Map();

    metasCadastro.forEach(row => {
      const key = `${row.ano}-${String(row.mes).padStart(2, '0')}`;
      const old = map.get(key) || { ano: Number(row.ano), mes: Number(row.mes), meta_total_tons: 0, produzido_total_tons: 0 };
      old.meta_total_tons += Number(row.meta_tons || 0);
      map.set(key, old);
    });

    const currentKey = `${anoAtual}-${String(mesAtual).padStart(2, '0')}`;
    const current = map.get(currentKey) || { ano: Number(anoAtual), mes: Number(mesAtual), meta_total_tons: 0, produzido_total_tons: 0 };
    current.produzido_total_tons = producaoRows.reduce((acc, row) => acc + Number(row.tons || row.toneladas || 0), 0);
    map.set(currentKey, current);

    return Array.from(map.values())
      .map(row => {
        const meta = Number(row.meta_total_tons || 0);
        const produzido = Number(row.produzido_total_tons || 0);
        return {
          ...row,
          restante_total_tons: Math.max(0, meta - produzido),
          percentual_atingido: meta > 0 ? (produzido / meta) * 100 : 0
        };
      })
      .sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes)));
  }

  async function loadData(state, supabase) {
    state.loading = true;
    state.erro = null;

    try {
      const range = getMonthRange(Number(state.ano), Number(state.mes));

      let metasQuery = supabase
        .from('metas_producao')
        .select('*')
        .eq('ano', Number(state.ano))
        .eq('mes', Number(state.mes))
        .order('estado', { ascending: true })
        .order('regional', { ascending: true });

      if (state.estado) metasQuery = metasQuery.eq('estado', state.estado);
      if (state.regional) metasQuery = metasQuery.eq('regional', state.regional);

      const producaoQuery = supabase
        .from('producao_snapshot')
        .select('data,data_referencia,coordenacao,tons')
        .gte('data', range.start)
        .lt('data', range.next)
        .order('data', { ascending: true });

      const [metasCadastro, metasHistorico, producaoRows] = await Promise.all([
        fetchAllRows(metasQuery),
        fetchAllRows(
          supabase
            .from('metas_producao')
            .select('ano,mes,regional,estado,meta_tons')
            .order('ano', { ascending: true })
            .order('mes', { ascending: true })
        ),
        fetchAllRows(producaoQuery).catch(err => {
          console.warn('[METAS] Não foi possível carregar Produção Diária em producao_snapshot:', err);
          return [];
        })
      ]);

      const regionais = montarRegionaisDaProducao(producaoRows, metasCadastro, {
        estado: state.estado,
        regional: state.regional
      });

      state.regionais = regionais;
      state.estados = montarEstadosDasRegionais(regionais);
      state.metasCadastro = metasCadastro;
      state.mensal = montarHistoricoMensalProducao(producaoRows, metasHistorico, Number(state.ano), Number(state.mes));
      state.producaoCoordenacoes = regionais.map(row => ({
        regional: row.regional,
        estado: row.estado,
        produzido_tons: row.produzido_tons
      }));

      state.gestores = await fetchAllRows(
        supabase.from('metas_gestores')
          .select('id,coordenacao,gestor,supervisao,salario,grat40,ativo')
          .eq('ativo', true)
          .order('coordenacao', { ascending: true })
          .order('gestor', { ascending: true })
      ).catch(() => []);
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

  function showFecharMetaModal(state, rows, onConfirm) {
    const existing = document.getElementById('metas-fechar-modal-overlay');
    if (existing) existing.remove();

    const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // % atingido por regional
    const percByKey = new Map(rows.map(row => {
      const meta = Number(row.meta_tons || 0);
      const prod = Number(row.produzido_tons || 0);
      return [rowKey(row), meta > 0 ? (prod / meta) * 100 : 0];
    }));

    // gestores ativos enriquecidos com % da regional
    const gestoresEnriq = (state.gestores || []).map(g => {
      const key = normalizarTexto(g.coordenacao || '');
      const pct = percByKey.has(key) ? percByKey.get(key) : null;
      const bi = (Number(g.salario || 0) + Number(g.grat40 || 0)) * 0.1;
      return { ...g, _key: key, pct, bonusInicial: bi };
    });

    // regionais com meta mas sem gestor cadastrado
    const comGestor = new Set(gestoresEnriq.map(g => g._key));
    const semGestor = rows.filter(r => !comGestor.has(rowKey(r)));

    const overlay = document.createElement('div');
    overlay.id = 'metas-fechar-modal-overlay';
    overlay.className = 'metas-modal-overlay';

    overlay.innerHTML = `
      <div class="metas-modal">
        <div class="metas-modal-header">
          <h3>Fechar Meta — ${escapeHtml(getMonthName(state.mes))}/${state.ano}</h3>
          <p>Defina o percentual mínimo para elegibilidade ao bônus e confira o cálculo por gestor.</p>
        </div>
        <div class="metas-modal-threshold">
          <div class="metas-field" style="max-width:280px">
            <label>Percentual mínimo para receber bônus (%)</label>
            <input class="metas-edit-input" id="metasMinPercInput" type="number" min="0" max="200" step="1" value="100" placeholder="Ex.: 90" />
            <p class="metas-config-hint">Regionais com % atingido ≥ esse valor — todos os gestores vinculados recebem bônus.</p>
          </div>
        </div>
        ${gestoresEnriq.length ? `
          <div class="metas-table-wrap">
            <table class="metas-table">
              <thead>
                <tr>
                  <th>Gestor</th>
                  <th>Coordenação</th>
                  <th>Supervisão</th>
                  <th class="num">% Regional</th>
                  <th class="num">Qualifica</th>
                  <th class="num">Bônus Inicial</th>
                  <th class="num">Bônus (produção)</th>
                </tr>
              </thead>
              <tbody>
                ${gestoresEnriq.map(g => `
                  <tr data-metas-bonus-row
                      data-gestor-id="${escapeHtml(String(g.id))}"
                      data-key="${escapeHtml(g._key)}"
                      data-percentual="${(g.pct ?? 0).toFixed(6)}"
                      data-bonus-inicial="${g.bonusInicial.toFixed(6)}">
                    <td><strong>${escapeHtml(g.gestor || '')}</strong></td>
                    <td>${escapeHtml(g.coordenacao || '')}</td>
                    <td style="color:var(--metas-muted);font-size:12px">${escapeHtml(g.supervisao || '—')}</td>
                    <td class="num">${g.pct !== null ? `<span class="metas-pill ${pctClass(g.pct)}">${fmtPct(g.pct)}</span>` : '<span class="metas-pill">sem meta</span>'}</td>
                    <td class="num" data-metas-qualifica-cell>—</td>
                    <td class="num">${fmtBRL(g.bonusInicial)}</td>
                    <td class="num" data-metas-bonus-cell style="font-weight:800">—</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : `<div class="metas-empty">Nenhum gestor cadastrado. Acesse a aba <strong>Gestores</strong> para cadastrar antes de fechar.</div>`}
        ${semGestor.length ? `
          <div class="metas-error" style="padding:10px 14px;font-size:12px">
            <strong>Regionais sem gestor vinculado:</strong> ${semGestor.map(r => escapeHtml(r.regional || '')).join(', ')}
          </div>` : ''}
        <p class="metas-config-hint">Bônus = % regional × bônus inicial × 40% · Bônus inicial = (salário + grat.40%) × 10%.</p>
        <div class="metas-modal-footer">
          <button class="metas-btn secondary" type="button" id="metasFecharCancelar">Cancelar</button>
          <button class="metas-btn" type="button" id="metasFecharConfirmar">Confirmar Fechamento</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const minInput = overlay.querySelector('#metasMinPercInput');

    function updateBadges() {
      const min = Number(minInput.value || 100);
      overlay.querySelectorAll('[data-metas-bonus-row]').forEach(tr => {
        const pct = Number(tr.dataset.percentual || 0);
        const bi = Number(tr.dataset.bonusInicial || 0);
        const qualifica = pct >= min;
        const qualCell = tr.querySelector('[data-metas-qualifica-cell]');
        const bonusCell = tr.querySelector('[data-metas-bonus-cell]');
        if (qualCell) qualCell.innerHTML = qualifica ? '<span class="metas-pill good">Qualifica</span>' : '<span class="metas-pill bad">Não qualifica</span>';
        if (bonusCell) {
          if (qualifica && bi > 0) {
            bonusCell.textContent = fmtBRL((pct / 100) * bi * 0.4);
            bonusCell.style.color = '#86efac';
          } else {
            bonusCell.textContent = '—';
            bonusCell.style.color = '#6b7280';
          }
        }
      });
    }

    minInput.addEventListener('input', updateBadges);
    updateBadges();

    overlay.querySelector('#metasFecharCancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#metasFecharConfirmar').addEventListener('click', () => {
      const min = Number(minInput.value || 100);
      const gestoresBonus = [];
      overlay.querySelectorAll('[data-metas-bonus-row]').forEach(tr => {
        const pct = Number(tr.dataset.percentual || 0);
        const bi = Number(tr.dataset.bonusInicial || 0);
        const qualifica = pct >= min;
        gestoresBonus.push({
          coordenacaoKey: tr.dataset.key,
          gestorId: Number(tr.dataset.gestorId),
          qualifica,
          bonusInicial: bi,
          bonusProducao: qualifica && bi > 0 ? (pct / 100) * bi * 0.4 : 0
        });
      });
      overlay.remove();
      onConfirm({ percentualMinimo: min, gestoresBonus });
    });
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

    showFecharMetaModal(state, rows, async (params) => {
      const now = new Date().toISOString();

      // Agrupa bonus por regional (soma de todos gestores qualificados)
      const bonusByKey = new Map();
      for (const gb of (params.gestoresBonus || [])) {
        const k = gb.coordenacaoKey;
        if (!bonusByKey.has(k)) bonusByKey.set(k, { total: 0, qualifica: false });
        if (gb.qualifica) {
          bonusByKey.get(k).total += gb.bonusProducao;
          bonusByKey.get(k).qualifica = true;
        }
      }

      const payloads = rows.map(row => {
        const meta = Number(row.meta_tons || 0);
        const produzido = Number(row.produzido_tons || 0);
        const percentual = meta > 0 ? (produzido / meta) * 100 : 0;
        const key = rowKey(row);
        const bonusInfo = bonusByKey.get(key) || { total: 0, qualifica: false };

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
          bonus_percentual_minimo: params.percentualMinimo || 100,
          bonus_producao: bonusInfo.total,
          qualifica_bonus: bonusInfo.qualifica,
          updated_at: now
        };
      });

      const { error } = await supabase
        .from('metas_producao')
        .upsert(payloads, { onConflict: 'ano,mes,regional' });

      if (error) {
        console.error('[METAS] Erro ao fechar meta:', error);
        alert('Erro ao fechar meta: ' + error.message + '\n\nExecute a migration 20260603_metas_bonus_fields.sql no Supabase Dashboard.');
        return;
      }

      await loadData(state, supabase);
      rerender();
    });
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
          const rows = mergeCoordenacoes(state);
          if (!rows.length) {
            alert('Sem dados de produção disponíveis para gerar sugestão.');
            return;
          }
          const projecao = projetarProducaoMes(rows, Number(state.ano), Number(state.mes));
          if (!projecao) {
            alert('Sem produção registrada no mês. Informe o valor estimado manualmente ou importe o Resultado Diário.');
            return;
          }
          state.metaEstimativa = String(projecao);
          if (input) input.value = state.metaEstimativa;
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

    // ── Gestores ──────────────────────────────────────────────────────────
    const gestorAddBtn = container.querySelector('[data-metas-gestor-add]');
    if (gestorAddBtn) {
      gestorAddBtn.addEventListener('click', () => {
        const f = document.getElementById('metasGestorAddForm');
        if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
      });
    }

    const gestorCancelBtn = container.querySelector('[data-metas-gestor-cancel]');
    if (gestorCancelBtn) {
      gestorCancelBtn.addEventListener('click', () => {
        const f = document.getElementById('metasGestorAddForm');
        if (f) f.style.display = 'none';
      });
    }

    const gestorSaveNewBtn = container.querySelector('[data-metas-gestor-save-new]');
    if (gestorSaveNewBtn) {
      gestorSaveNewBtn.addEventListener('click', async () => {
        const coord = document.getElementById('mgfCoord')?.value?.trim().toUpperCase();
        const gestor = document.getElementById('mgfGestor')?.value?.trim().toUpperCase();
        const sup = document.getElementById('mgfSup')?.value?.trim() || null;
        const sal = Number(document.getElementById('mgfSalario')?.value || 0) || null;
        const grat = Number(document.getElementById('mgfGrat')?.value || 0) || null;
        if (!coord || !gestor) { alert('Coordenação e Gestor são obrigatórios.'); return; }
        const { error } = await supabase.from('metas_gestores').insert({ coordenacao: coord, gestor, supervisao: sup, salario: sal, grat40: grat, ativo: true, updated_at: new Date().toISOString() });
        if (error) { alert('Erro: ' + error.message); return; }
        await reload();
      });
    }

    const gestorCancelEditBtn = container.querySelector('[data-metas-gestor-cancel-edit]');
    if (gestorCancelEditBtn) {
      gestorCancelEditBtn.addEventListener('click', () => { state.gestoresEditId = null; rerender(); });
    }

    container.querySelectorAll('[data-metas-gestor-edit]').forEach(btn => {
      btn.addEventListener('click', () => { state.gestoresEditId = btn.dataset.metasGestorEdit; rerender(); });
    });

    container.querySelectorAll('[data-metas-gestor-save-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.metasGestorSaveEdit);
        const tr = btn.closest('[data-metas-gestor-row]');
        if (!tr) return;
        const gf = f => tr.querySelector(`[data-gf="${f}"]`)?.value?.trim();
        const coord = gf('coordenacao')?.toUpperCase();
        const gestor = gf('gestor')?.toUpperCase();
        if (!coord || !gestor) { alert('Coordenação e Gestor são obrigatórios.'); return; }
        const { error } = await supabase.from('metas_gestores').update({
          coordenacao: coord,
          gestor,
          supervisao: gf('supervisao') || null,
          salario: Number(tr.querySelector('[data-gf="salario"]')?.value || 0) || null,
          grat40: Number(tr.querySelector('[data-gf="grat40"]')?.value || 0) || null,
          updated_at: new Date().toISOString()
        }).eq('id', id);
        if (error) { alert('Erro: ' + error.message); return; }
        state.gestoresEditId = null;
        await reload();
      });
    });

    container.querySelectorAll('[data-metas-gestor-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este gestor?')) return;
        const id = Number(btn.dataset.metasGestorDel);
        const { error } = await supabase.from('metas_gestores').update({ ativo: false, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) { alert('Erro: ' + error.message); return; }
        await reload();
      });
    });
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
