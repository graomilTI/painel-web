// Metas — CSS do módulo.
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.

  const STYLE_ID = 'metas-module-style-v1';

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

      .metas-title-row {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }

      .metas-period-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .05em;
        text-transform: uppercase;
        padding: 7px 13px;
        border-radius: 999px;
        border: 1px solid var(--metas-border);
        background: rgba(15, 23, 42, .58);
        color: var(--metas-muted);
        white-space: nowrap;
      }

      .metas-period-chip-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--metas-muted);
        flex-shrink: 0;
      }

      .metas-period-chip.is-open {
        color: #bbf7d0;
        border-color: rgba(74, 222, 128, .32);
        background: rgba(22, 101, 52, .22);
      }

      .metas-period-chip.is-open .metas-period-chip-dot {
        background: #4ade80;
        box-shadow: 0 0 0 0 rgba(74, 222, 128, .45);
        animation: metas-chip-pulse 2.6s ease-in-out infinite;
      }

      .metas-period-chip.is-closed {
        color: #cbd5e1;
        border-color: rgba(148, 163, 184, .3);
        background: rgba(51, 65, 85, .38);
      }

      .metas-period-chip.is-closed .metas-period-chip-dot {
        background: #94a3b8;
      }

      @keyframes metas-chip-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, .4); }
        50%      { box-shadow: 0 0 0 5px rgba(74, 222, 128, 0); }
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

      .metas-btn.danger {
        background: rgba(127, 29, 29, .2);
        color: #fecaca;
        border-color: rgba(248, 113, 113, .38);
      }

      .metas-btn.danger:hover {
        border-color: rgba(248, 113, 113, .78);
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

      .metas-nav {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 30px;
        margin: 6px 0 8px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--metas-border);
      }

      .metas-nav-group {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }

      .metas-nav-group + .metas-nav-group {
        padding-left: 30px;
        border-left: 1px solid var(--metas-border);
      }

      .metas-nav-group-label {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .18em;
        text-transform: uppercase;
        color: var(--metas-muted);
        padding-left: 2px;
      }

      .metas-nav-group-tabs {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .metas-tab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--metas-muted);
        padding: 9px 14px;
        border-radius: 12px;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        transition: color .15s ease, background .15s ease, border-color .15s ease, transform .15s ease;
      }

      .metas-tab svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        opacity: .6;
        transition: opacity .15s ease;
      }

      .metas-tab:hover {
        color: var(--metas-text);
        background: rgba(148, 163, 184, .08);
        border-color: var(--metas-border);
      }

      .metas-tab:hover svg {
        opacity: .9;
      }

      .metas-tab.active {
        color: #dcfce7;
        background: linear-gradient(135deg, rgba(22, 101, 52, .55), rgba(21, 128, 61, .28));
        border-color: rgba(74, 222, 128, .4);
        box-shadow: 0 10px 26px rgba(34, 197, 94, .16);
        transform: translateY(-1px);
      }

      .metas-tab.active svg {
        opacity: 1;
      }

      .metas-nav-desc {
        margin: 0 0 18px;
        font-size: 12.5px;
        line-height: 1.55;
        color: var(--metas-muted);
        max-width: 760px;
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
        min-width: 60px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .metas-rc-top-val {
        min-height: 32px;
        font-size: 11px;
        line-height: 1.25;
        color: var(--metas-muted);
        font-weight: 700;
        text-align: center;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding-bottom: 4px;
        white-space: normal;
        word-break: keep-all;
        width: 100%;
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

      .metas-rc-pct {
        margin-top: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .01em;
        padding: 2px 8px;
        border-radius: 999px;
        white-space: nowrap;
        background: rgba(148, 163, 184, .12);
        color: var(--metas-muted);
        border: 1px solid rgba(148, 163, 184, .14);
      }

      .metas-rc-pct.good {
        color: #bbf7d0;
        background: rgba(22, 101, 52, .42);
        border-color: rgba(74, 222, 128, .26);
      }

      .metas-rc-pct.warn {
        color: #fef08a;
        background: rgba(133, 77, 14, .35);
        border-color: rgba(250, 204, 21, .22);
      }

      .metas-rc-pct.bad {
        color: #fecaca;
        background: rgba(127, 29, 29, .35);
        border-color: rgba(248, 113, 113, .22);
      }

      .metas-rc-bot-val {
        min-height: 34px;
        font-size: 12px;
        line-height: 1.25;
        color: #86efac;
        font-weight: 800;
        text-align: center;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 4px;
        white-space: normal;
        word-break: keep-all;
        width: 100%;
        text-shadow: 0 1px 8px rgba(0,0,0,.35);
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

        .metas-nav-group + .metas-nav-group {
          padding-left: 0;
          border-left: none;
          margin-top: 4px;
          padding-top: 14px;
          border-top: 1px solid var(--metas-border);
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

export { injectStyle };
