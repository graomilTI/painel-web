/* assets/js/modules/metas.js
 * Módulo Diretoria > METAS
 * Padrão do projeto: IIFE + window.METAS.openHome(container, { auth, api, onBack })
 *
 * Regras oficiais:
 * - Produção usada para bater meta = relatorio_resultado_diario.toneladas
 * - A base é o Relatório Resultado Diário: Coordenação, Data e Toneladas
 * - Não usar o snapshot, embarcado nem total_embarcado_mais_teste
 */

import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import html2canvas from 'https://esm.sh/html2canvas@1.4.1';
import JSZip from 'https://esm.sh/jszip@3.10.1';

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

  const TAB_ICON_SVG = {
    geral: '<rect x="3" y="3" width="7.5" height="9.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="2"/>',
    regionais: '<path d="M12 21s7-6.2 7-11.2a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.6" r="2.6"/>',
    estados: '<path d="M5.5 3v18"/><path d="M5.5 4.5h12l-2.2 3.5 2.2 3.5h-12"/>',
    historico: '<path d="M3.5 11a8.5 8.5 0 1 1 2.5 6"/><path d="M3.5 5.5V11h5.5"/><path d="M12 7.5V12l3.4 2"/>',
    gestores: '<circle cx="9" cy="8" r="3.4"/><path d="M2.6 19.2c.6-3.2 3-5 6.4-5s5.8 1.8 6.4 5"/><circle cx="17.4" cy="6.8" r="2.6"/><path d="M16.2 14.2c2.7.4 4.5 2.1 5 4.7"/>',
    configurar: '<rect x="4" y="10" width="16" height="11" rx="2.4"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="m9.3 15.4 1.9 1.9 3.5-3.7"/>'
  };

  function tabIconMarkup(id) {
    const path = TAB_ICON_SVG[id];
    if (!path) return '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  const TAB_GROUPS = [
    {
      label: 'Acompanhamento',
      tabs: [
        { id: 'geral',     label: 'Visão Geral',  desc: 'Indicadores consolidados do período: meta total, produção realizada e percentual de atingimento.' },
        { id: 'estados',   label: 'Estados',      desc: 'Visão consolidada por estado, somando o resultado das regionais correspondentes.' }
      ]
    },
    {
      label: 'Gestão',
      tabs: [
        { id: 'gestores',   label: 'Gestores',            desc: 'Cadastro dos gestores de cada coordenação/supervisão — base para o cálculo do bônus.' },
        { id: 'configurar', label: 'Fechamento',  desc: 'Cadastro das metas do mês, auditoria, fechamento do período e cálculo do bônus dos gestores.' }
      ]
    }
  ];

  function findTabMeta(tabId) {
    for (const group of TAB_GROUPS) {
      const found = group.tabs.find(t => t.id === tabId);
      if (found) return found;
    }
    return null;
  }

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
    gestoresEditId: null,
    custosRegional: [],
    auditoria: []
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
          <div class="metas-card-sub">Base: Relatório Resultado Diário · coluna Toneladas</div>
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
      const pctReal = Number(row.percentual_atingido || 0);
      const prodPct = Math.min(100, meta > 0 ? (prod / meta) * 100 : 0);
      const restPct = 100 - prodPct;

      return `
        <div class="metas-rc-col">
          <div class="metas-rc-top-val" title="${fmtTons(meta)}">${fmtTons(meta)}</div>
          <div class="metas-rc-bar" title="${escapeHtml(row.regional)}: ${fmtPct(pctReal)} atingido">
            <div class="metas-rc-restante" style="height:${restPct.toFixed(2)}%"></div>
            <div class="metas-rc-atual" style="height:${Math.max(prodPct, 0).toFixed(2)}%"></div>
            <div class="metas-rc-label-wrap">
              <span class="metas-rc-label">${escapeHtml(row.regional)}</span>
            </div>
          </div>
          <div class="metas-rc-pct ${pctClass(pctReal)}" title="Percentual atingido">${fmtPct(pctReal)}</div>
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
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="metas-pill ${fechado ? 'good' : ''}">${fechado ? 'Mês fechado' : 'Cadastro em lista'}</span>
            <input type="file" accept=".xlsx,.xls" data-metas-auditoria-file hidden />
            <button class="metas-btn secondary metas-auditoria-btn ${(state.auditoria || []).length ? 'is-ready' : 'is-pending'}" type="button" data-metas-auditoria aria-label="${(state.auditoria || []).length ? 'Auditoria anexada' : 'Auditoria pendente'}" ${fechado ? 'disabled' : ''}>Auditoria</button>
          </div>
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

        <div style="padding:14px 16px;border-bottom:1px solid var(--metas-border)">
          <div class="metas-section-title" style="margin-bottom:10px">
            <h2>Despesas por Regional — M-1 (${(() => { const m = mesAnterior(state.ano, state.mes); return `${getMonthName(m.mes)}/${m.ano}`; })()})</h2>
            <span class="metas-pill ${state.custosRegional.length ? 'good' : ''}">${state.custosRegional.length ? `${state.custosRegional.length} regionais` : 'aguardando upload'}</span>
          </div>
          ${state.custosRegional.length ? `
          <div class="metas-table-wrap">
            <table class="metas-table">
              <thead><tr><th>Coordenação</th><th class="num">Total Regional</th><th class="num">Rateio GERAL</th><th class="num">Total c/ Rateio</th></tr></thead>
              <tbody>
                ${state.custosRegional.map(c => {
                  const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  return `<tr>
                    <td><strong>${escapeHtml(c.coordenacao || '')}</strong></td>
                    <td class="num">${fmtBRL(c.total_coordenacao)}</td>
                    <td class="num" style="color:var(--metas-muted)">${fmtBRL(c.rateio)}</td>
                    <td class="num" style="color:#86efac;font-weight:800">${fmtBRL(c.total_com_rateio)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : `<p class="metas-config-hint">Carregue o <strong>Relatório de Despesas</strong> no módulo de Relatórios para popular automaticamente. Os dados são usados para calcular o componente de custo (30%) do bônus.</p>`}
        </div>

        <div class="metas-close-panel">
          <div>
            <div class="metas-close-title">Fechamento da meta de ${getMonthName(state.mes)}/${state.ano}</div>
            <div class="metas-close-sub">
              Ao fechar, o painel marca cada coordenação como <strong>atingiu</strong> ou <strong>não atingiu</strong> e bloqueia novas alterações da meta cadastrada para o mês selecionado.
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="metas-btn ${fechado ? 'secondary' : ''}" type="button" data-metas-close ${fechado ? 'disabled' : ''}>
              ${fechado ? 'Meta fechada' : 'Fechar meta'}
            </button>
            ${fechado ? `
            <button class="metas-btn danger" type="button" data-metas-reopen title="Reabre o período e limpa os resultados calculados no fechamento">
              Reverter fechamento
            </button>` : ''}
            ${fechado && rows.some(r => r.qualifica_bonus) ? `
            <button class="metas-btn secondary" type="button" data-metas-baixar-bonus>
              Exportar relatório de bônus (XLS)
            </button>` : ''}
          </div>
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

    const fechado = isMonthClosed(state);
    const tabAtiva = findTabMeta(state.tab);

    container.innerHTML = `
      <div class="metas-page ${state.loading ? 'metas-loading' : ''}">
        <div class="metas-header">
          <div class="metas-title-wrap">
            <div class="metas-title-row">
              <h1>Metas de Produção</h1>
              <span class="metas-period-chip ${fechado ? 'is-closed' : 'is-open'}" title="${fechado ? 'O período já foi fechado: valores de bônus calculados e alterações bloqueadas.' : 'O período ainda está aberto para cadastro e ajustes.'}">
                <span class="metas-period-chip-dot"></span>
                ${escapeHtml(getMonthName(state.mes))}/${state.ano} · ${fechado ? 'Período fechado' : 'Período em aberto'}
              </span>
            </div>
            <p>
              Acompanhamento mensal da meta por regional e estado.
              Produção considerada: <strong>Relatório Resultado Diário</strong>, coluna <strong>Toneladas</strong>.
            </p>
          </div>
          <div class="metas-actions">
            <button class="metas-btn secondary" type="button" data-metas-back>Voltar</button>
            <button class="metas-btn" type="button" data-metas-refresh>↻ Atualizar</button>
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

        <nav class="metas-nav" aria-label="Seções de Metas">
          ${TAB_GROUPS.map(group => `
            <div class="metas-nav-group">
              <span class="metas-nav-group-label">${escapeHtml(group.label)}</span>
              <div class="metas-nav-group-tabs" role="tablist">
                ${group.tabs.map(t => `
                  <button type="button"
                          class="metas-tab ${state.tab === t.id ? 'active' : ''}"
                          data-metas-tab="${t.id}"
                          role="tab"
                          aria-selected="${state.tab === t.id ? 'true' : 'false'}"
                          title="${escapeHtml(t.desc)}">
                    ${tabIconMarkup(t.id)}
                    <span>${escapeHtml(t.label)}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </nav>
        ${tabAtiva ? `<p class="metas-nav-desc">${escapeHtml(tabAtiva.desc)}</p>` : ''}

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

  function regionaisTemplateAnterior(metasHistorico, ano, mes) {
    const atual = Number(ano) * 12 + Number(mes);
    const porChave = new Map();
    (metasHistorico || []).forEach(row => {
      const chave = Number(row.ano) * 12 + Number(row.mes);
      if (chave >= atual) return;
      if (!porChave.has(chave)) porChave.set(chave, new Map());
      const grupo = porChave.get(chave);
      const key = normalizarTexto(row.regional || '');
      if (key && !grupo.has(key)) grupo.set(key, { regional: row.regional, estado: row.estado });
    });
    const chaves = Array.from(porChave.keys()).sort((a, b) => b - a);
    if (!chaves.length) return [];
    return Array.from(porChave.get(chaves[0]).values());
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
        .from('relatorio_resultado_diario')
        .select('data,coordenacao,toneladas')
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
          console.warn('[METAS] Não foi possível carregar Resultado Diário:', err);
          return [];
        })
      ]);

      let regionais = montarRegionaisDaProducao(producaoRows, metasCadastro, {
        estado: state.estado,
        regional: state.regional
      });

      // Mês novo ainda sem produção/meta cadastrada: usa a lista de regionais do mês anterior como modelo,
      // para o usuário conseguir digitar a meta antes da produção diária começar a ser sincronizada.
      if (!regionais.length && !producaoRows.length && !metasCadastro.length && !state.estado && !state.regional) {
        const template = regionaisTemplateAnterior(metasHistorico, state.ano, state.mes)
          .map(r => ({ regional: r.regional, estado: r.estado, meta_tons: 0, ativo: true }));
        if (template.length) {
          regionais = montarRegionaisDaProducao([], template, { estado: state.estado, regional: state.regional });
        }
      }

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

      const m1 = mesAnterior(Number(state.ano), Number(state.mes));
      state.custosRegional = await fetchAllRows(
        supabase.from('dre_despesas_mensal')
          .select('coordenacao, total_coordenacao, rateio, total_com_rateio, total_geral, total_todas_regionais, ano, mes')
          .eq('ano', m1.ano)
          .eq('mes', m1.mes)
          .order('coordenacao', { ascending: true })
      ).catch(() => []);

      state.auditoria = await fetchAllRows(
        supabase.from('metas_auditoria')
          .select('ano,mes,regional,valor_auditoria,total_embarcado,percentual_limite,apto,nome_arquivo')
          .eq('ano', Number(state.ano))
          .eq('mes', Number(state.mes))
          .order('regional', { ascending: true })
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

  function mesAnterior(ano, mes) {
    return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  }

  function calcMultiplicadorLeitura(pct) {
    if (pct >= 100) return 1.8;
    if (pct >= 90)  return 1.6;
    if (pct >= 80)  return 1.4;
    if (pct >= 70)  return 1.2;
    if (pct >= 60)  return 1.0;
    return 0;
  }

  async function enrichGestoresParaFechamento(state, supabase, anoMeta, mesMeta) {
    const m1 = mesAnterior(anoMeta, mesMeta);
    const m1Start = `${m1.ano}-${String(m1.mes).padStart(2, '0')}-01`;
    const metaStart = `${anoMeta}-${String(mesMeta).padStart(2, '0')}-01`;

    const [leituraRes, resultadoRows, despesaRows] = await Promise.all([
      supabase.from('v_leitura_supervisao').select('coordenacao,supervisao,leitura_pct,total_ativos,lidos_30d,data_referencia'),
      fetchAllRows(
        supabase.from('relatorio_resultado_diario').select('coordenacao,toneladas').gte('data', m1Start).lt('data', metaStart)
      ).catch(() => []),
      fetchAllRows(
        supabase.from('dre_despesas_mensal')
          .select('coordenacao,total_com_rateio,total_geral,total_todas_regionais')
          .eq('ano', m1.ano).eq('mes', m1.mes)
      ).catch(() => [])
    ]);

    // Leitura map: supervisão normalizada → pct
    const leituraMap = new Map();
    for (const r of (leituraRes.data || [])) {
      leituraMap.set(normalizarTexto(r.supervisao || ''), { pct: Number(r.leitura_pct || 0), total: r.total_ativos, lidos: r.lidos_30d, dataRef: r.data_referencia });
    }

    // Volume Classificado M-1: toneladas por coordenação (igual ao DRE — denominador do custo por ton)
    const volClassMap = new Map();
    let volClassGeral = 0;
    for (const r of resultadoRows) {
      const k = normalizarTexto(r.coordenacao || '');
      if (k === 'GERAL') continue;
      volClassMap.set(k, (volClassMap.get(k) || 0) + Number(r.toneladas || 0));
      volClassGeral += Number(r.toneladas || 0);
    }

    // Despesa M-1 (dre_despesas_mensal): total_com_rateio por regional
    const despesaMap = new Map(); // coord → total_com_rateio
    let despesaTotalEmpresa = 0;
    for (const r of despesaRows) {
      const k = normalizarTexto(r.coordenacao || '');
      despesaMap.set(k, Number(r.total_com_rateio || 0));
    }
    if (despesaRows.length) {
      const ref = despesaRows[0];
      despesaTotalEmpresa = Number(ref.total_todas_regionais || 0) + Number(ref.total_geral || 0);
    }

    // cptGeral = custo por tonelada do volume classificado da empresa (igual à linha do DRE)
    const cptGeral = volClassGeral > 0 ? despesaTotalEmpresa / volClassGeral : 0;
    const temDespesas = despesaMap.size > 0;

    return (state.gestores || []).map(g => {
      const key  = normalizarTexto(g.coordenacao || '');
      const supK = normalizarTexto(g.supervisao  || '');

      const sal = Number(g.salario || 0);
      const gr  = Number(g.grat40  || 0);
      const bonusInicial = (sal + gr) * 0.1;

      // Leitura
      const leit = leituraMap.get(supK) || null;
      const leituraPct  = leit ? leit.pct : null;
      const multLeitura = calcMultiplicadorLeitura(leituraPct ?? 0);
      const valorLeitura = multLeitura * bonusInicial * 0.3;

      // Custo: fator = cptGeral / cptCoord  (custo/ton geral ÷ custo/ton da coordenação)
      const volClassCoord = volClassMap.get(key) || 0;
      const despesaCoord  = despesaMap.get(key)  || 0;
      let fatorCusto = 0;
      let valorCusto = 0;
      let cptCoord = 0;
      if (cptGeral > 0 && volClassCoord > 0 && despesaCoord > 0) {
        cptCoord = despesaCoord / volClassCoord;
        fatorCusto = cptCoord > 0 ? cptGeral / cptCoord : 0;
        valorCusto = fatorCusto * bonusInicial * 0.3;
      }

      return {
        ...g,
        _key: key,
        bonusInicial,
        leituraPct, multLeitura, valorLeitura,
        volClassCoord, despesaCoord, fatorCusto, valorCusto,
        cptGeral, cptCoord,
        temDespesas,
        m1Ref: `${String(m1.mes).padStart(2,'0')}/${m1.ano}`
      };
    });
  }

  function showFecharMetaModal(state, rows, gestoresEnriq, onConfirm) {
    const existing = document.getElementById('metas-fechar-modal-overlay');
    if (existing) existing.remove();

    const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtF   = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

    const percByKey = new Map(rows.map(row => {
      const meta = Number(row.meta_tons || 0);
      const prod = Number(row.produzido_tons || 0);
      return [rowKey(row), meta > 0 ? (prod / meta) * 100 : 0];
    }));
    const metaProdByKey = new Map(rows.map(row => [rowKey(row), {
      metaTons: Number(row.meta_tons || 0),
      produzidoTons: Number(row.produzido_tons || 0)
    }]));
    const auditoriaByKey = new Map((state.auditoria || []).map(row => [normalizarTexto(row.regional), row]));

    // Enriquece com % regional e calcula produção
    const gestores = gestoresEnriq.map(g => {
      const pct = percByKey.has(g._key) ? percByKey.get(g._key) : null;
      const valorProducao = pct !== null ? (pct / 100) * g.bonusInicial * 0.4 : 0;
      const auditoria = auditoriaByKey.get(g._key) || null;
      return { ...g, pct, valorProducao, auditoria, auditoriaApta: auditoria ? auditoria.apto !== false : true };
    });

    const comGestor = new Set(gestores.map(g => g._key));
    const semGestor = rows.filter(r => !comGestor.has(rowKey(r)));
    const semDespesa = gestores.some(g => !g.temDespesas);

    const overlay = document.createElement('div');
    overlay.id = 'metas-fechar-modal-overlay';
    overlay.className = 'metas-modal-overlay';

    overlay.innerHTML = `
      <div class="metas-modal" style="max-width:1100px">
        <div class="metas-modal-header">
          <h3>Fechar Meta — ${escapeHtml(getMonthName(state.mes))}/${state.ano}</h3>
          <p>Bônus calculado com três componentes (Produção 40% · Custo 30% · Leitura 30%) usando dados de M-1 (${escapeHtml(gestores[0]?.m1Ref || '')}).</p>
        </div>
        <div class="metas-modal-threshold">
          <div class="metas-field" style="max-width:280px">
            <label>Percentual mínimo para receber bônus (%)</label>
            <input class="metas-edit-input" id="metasMinPercInput" type="number" min="0" max="200" step="1" value="100" placeholder="Ex.: 90" />
            <p class="metas-config-hint">Regionais com % atingido ≥ esse valor — todos os gestores vinculados recebem bônus.</p>
          </div>
        </div>
        ${semDespesa ? `<div class="metas-error" style="padding:10px 14px;font-size:12px;margin-bottom:0">
          <strong>Custo:</strong> Sem despesas cadastradas para M-1. Cadastre na aba <strong>Configurar / Fechar → Custos</strong> para incluir o componente de custo (30%). O bônus será calculado sem esse componente.
        </div>` : ''}
        ${gestores.length ? `
          <div class="metas-table-wrap">
            <table class="metas-table" style="min-width:1000px">
              <thead>
                <tr>
                  <th>Gestor</th>
                  <th>Coordenação / Supervisão</th>
                  <th class="num">% Regional</th>
                  <th class="num">Auditoria</th>
                  <th class="num">Qualifica</th>
                  <th class="num">B. Inicial</th>
                  <th class="num" title="Produção 40%">Prod (40%)</th>
                  <th class="num" title="Custo 30%">Custo (30%)</th>
                  <th class="num" title="Leitura 30%">Leitura (30%)</th>
                  <th class="num" style="color:#86efac">Total</th>
                </tr>
              </thead>
              <tbody>
                ${gestores.map(g => {
                  const total = g.valorProducao + g.valorCusto + g.valorLeitura;
                  return `
                    <tr data-metas-bonus-row
                        data-gestor-id="${escapeHtml(String(g.id))}"
                        data-key="${escapeHtml(g._key)}"
                        data-percentual="${(g.pct ?? 0).toFixed(6)}"
                        data-auditoria-apta="${g.auditoriaApta ? '1' : '0'}"
                        data-valor-producao="${g.valorProducao.toFixed(6)}"
                        data-valor-custo="${g.valorCusto.toFixed(6)}"
                        data-valor-leitura="${g.valorLeitura.toFixed(6)}"
                        data-bonus-total="${total.toFixed(6)}">
                      <td><strong>${escapeHtml(g.gestor || '')}</strong></td>
                      <td>
                        <div>${escapeHtml(g.coordenacao || '')}</div>
                        <div style="font-size:11px;color:var(--metas-muted)">${escapeHtml(g.supervisao || '—')}</div>
                      </td>
                      <td class="num">${g.pct !== null ? `<span class="metas-pill ${pctClass(g.pct)}">${fmtPct(g.pct)}</span>` : '<span class="metas-pill">sem meta</span>'}</td>
                      <td class="num">${g.auditoria ? `<span class="metas-pill ${g.auditoriaApta ? 'good' : 'bad'}">${g.auditoriaApta ? 'Dentro do limite' : 'Acima do limite'}</span>` : '<span class="metas-pill">não anexada</span>'}</td>
                      <td class="num" data-metas-qualifica-cell>—</td>
                      <td class="num" style="font-size:11px">${fmtBRL(g.bonusInicial)}</td>
                      <td class="num" data-bonus-cell-prod style="font-size:11px">—</td>
                      <td class="num" data-bonus-cell-custo style="font-size:11px">${g.valorCusto > 0 ? `<span title="Fator: ${fmtF(g.fatorCusto)}">${fmtBRL(g.valorCusto)}</span>` : '<span style="color:var(--metas-muted)">sem dado</span>'}</td>
                      <td class="num" data-bonus-cell-leitura style="font-size:11px">${g.leituraPct !== null ? `<span title="${fmtPct(g.leituraPct ?? 0)} · mult ${g.multLeitura}x">${fmtBRL(g.valorLeitura)}</span>` : '<span style="color:var(--metas-muted)">sem dado</span>'}</td>
                      <td class="num" data-bonus-cell-total style="font-weight:800">—</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : `<div class="metas-empty">Nenhum gestor cadastrado. Acesse a aba <strong>Gestores</strong>.</div>`}
        ${semGestor.length ? `<div class="metas-error" style="padding:10px 14px;font-size:12px;margin-top:0">
          <strong>Regionais sem gestor:</strong> ${semGestor.map(r => escapeHtml(r.regional || '')).join(', ')}
        </div>` : ''}
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
        const pct      = Number(tr.dataset.percentual    || 0);
        const vProd    = Number(tr.dataset.valorProducao  || 0);
        const vCusto   = Number(tr.dataset.valorCusto     || 0);
        const vLeitura = Number(tr.dataset.valorLeitura   || 0);
        const qualifica = pct >= min && tr.dataset.auditoriaApta !== '0';
        const total = qualifica ? vProd + vCusto + vLeitura : 0;

        const qc = tr.querySelector('[data-metas-qualifica-cell]');
        if (qc) qc.innerHTML = qualifica ? '<span class="metas-pill good">Qualifica</span>' : '<span class="metas-pill bad">Não qualifica</span>';

        const setCell = (sel, val, color) => {
          const c = tr.querySelector(sel);
          if (!c) return;
          if (qualifica && val > 0) { c.innerHTML = `<span style="color:${color};font-weight:800">${fmtBRL(val)}</span>`; }
          else if (!qualifica) { c.innerHTML = '<span style="color:#6b7280">—</span>'; }
        };
        setCell('[data-bonus-cell-prod]',  vProd,    '#86efac');
        setCell('[data-bonus-cell-total]', total,    '#86efac');
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
        const qualifica = pct >= min && tr.dataset.auditoriaApta !== '0';
        const mp = metaProdByKey.get(tr.dataset.key) || { metaTons: 0, produzidoTons: 0 };
        gestoresBonus.push({
          coordenacaoKey: tr.dataset.key,
          gestorId: Number(tr.dataset.gestorId),
          qualifica,
          pct,
          metaTons: mp.metaTons,
          produzidoTons: mp.produzidoTons,
          bonusProducao: qualifica ? Number(tr.dataset.valorProducao  || 0) : 0,
          bonusCusto:    qualifica ? Number(tr.dataset.valorCusto     || 0) : 0,
          bonusLeitura:  qualifica ? Number(tr.dataset.valorLeitura   || 0) : 0
        });
      });
      overlay.remove();
      onConfirm({ percentualMinimo: min, gestoresBonus });
    });
  }

  function gerarRelatorioBonusXlsx(state, gestoresEnriq, gestoresBonus) {
    const porId = new Map(gestoresEnriq.map(g => [g.id, g]));
    const round2 = v => Number(Number(v || 0).toFixed(2));

    const linhas = (gestoresBonus || [])
      .filter(gb => gb.qualifica && (gb.bonusProducao + gb.bonusCusto + gb.bonusLeitura) > 0)
      .map(gb => {
        const g = porId.get(gb.gestorId) || {};
        const total = gb.bonusProducao + gb.bonusCusto + gb.bonusLeitura;
        return [
          g.gestor || '',
          g.coordenacao || '',
          g.supervisao || '',
          round2(g.bonusInicial),
          round2(gb.bonusProducao),
          round2(gb.bonusCusto),
          round2(gb.bonusLeitura),
          round2(total)
        ];
      })
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));

    if (!linhas.length) return;

    const headers = ['Gestor', 'Coordenação', 'Supervisão', 'Bônus Inicial', 'Produção (40%)', 'Custo (30%)', 'Patrimônios/Leitura (30%)', 'Total Bônus'];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...linhas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bônus');

    const ref = `${String(state.mes).padStart(2, '0')}-${state.ano}`;
    XLSX.writeFile(wb, `bonus_metas_${ref}.xlsx`);
  }

  function slugFileName(str) {
    return normalizarTexto(str).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'gestor';
  }

  function montarDadosCartaoBonus(gestoresEnriq, gestoresBonus, state) {
    const porId = new Map(gestoresEnriq.map(g => [g.id, g]));

    return (gestoresBonus || [])
      .filter(gb => gb.qualifica && (gb.bonusProducao + gb.bonusCusto + gb.bonusLeitura) > 0)
      .map(gb => {
        const g = porId.get(gb.gestorId) || {};
        const total = gb.bonusProducao + gb.bonusCusto + gb.bonusLeitura;
        const pctDe = v => (total > 0 ? (v / total) * 100 : 0);

        return {
          gestor: g.gestor || '',
          coordenacao: g.coordenacao || '',
          supervisao: g.supervisao || '',
          mes: state.mes,
          ano: state.ano,
          bonusInicial: g.bonusInicial || 0,
          total,
          producao: {
            valor: gb.bonusProducao,
            pctTotal: pctDe(gb.bonusProducao),
            metaTons: gb.metaTons || 0,
            produzidoTons: gb.produzidoTons || 0,
            pct: gb.pct || 0
          },
          despesas: {
            valor: gb.bonusCusto,
            pctTotal: pctDe(gb.bonusCusto),
            cptGeral: g.cptGeral || 0,
            cptCoord: g.cptCoord || 0
          },
          leitura: {
            valor: gb.bonusLeitura,
            pctTotal: pctDe(gb.bonusLeitura),
            leituraPct: g.leituraPct
          }
        };
      });
  }

  function desenharPizza3D(canvas, slices) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2;
    const rx = W * 0.39;
    const ry = rx * 0.55;
    const depth = rx * 0.27;
    const cyTop = ry + 10;

    const total = slices.reduce((s, sl) => s + Math.max(sl.value, 0), 0) || 1;
    let acc = 0;
    const spans = slices.map(sl => {
      const startClock = (acc / total) * 360;
      acc += Math.max(sl.value, 0);
      const endClock = (acc / total) * 360;
      return { ...sl, startClock, endClock };
    });
    const toCanvasAngle = (clockDeg) => ((clockDeg - 90) * Math.PI) / 180;

    ctx.clearRect(0, 0, W, H);

    // sombra suave de apoio
    ctx.save();
    ctx.filter = 'blur(6px)';
    ctx.beginPath();
    ctx.ellipse(cx, cyTop + depth + ry * 0.5, rx * 0.92, ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.restore();

    // ponto de luz único (mesma posição pra todas as fatias) — dá o efeito "cromado"
    const highlightX = cx - rx * 0.35;
    const highlightY = cyTop - ry * 0.45;

    // parede (extrusão) cromada — só a metade voltada pra frente (ângulo canvas 0°–180°)
    spans.forEach(sl => {
      const a0 = toCanvasAngle(sl.startClock);
      const a1 = toCanvasAngle(sl.endClock);
      const visStart = Math.max(a0, 0);
      const visEnd = Math.min(a1, Math.PI);
      if (visStart >= visEnd) return;

      const wallGrad = ctx.createLinearGradient(cx, cyTop, cx, cyTop + depth);
      wallGrad.addColorStop(0, sl.top);
      wallGrad.addColorStop(0.5, sl.wall);
      wallGrad.addColorStop(1, sl.rim);

      ctx.beginPath();
      ctx.ellipse(cx, cyTop, rx, ry, 0, visStart, visEnd, false);
      ctx.lineTo(cx + rx * Math.cos(visEnd), cyTop + depth + ry * Math.sin(visEnd));
      ctx.ellipse(cx, cyTop + depth, rx, ry, 0, visEnd, visStart, true);
      ctx.closePath();
      ctx.fillStyle = wallGrad;
      ctx.fill();
    });

    // topo cromado (face de cima, com brilho radial por fatia)
    spans.forEach(sl => {
      const a0 = toCanvasAngle(sl.startClock);
      const a1 = toCanvasAngle(sl.endClock);

      const topGrad = ctx.createRadialGradient(highlightX, highlightY, rx * 0.03, cx, cyTop, rx);
      topGrad.addColorStop(0, sl.highlight);
      topGrad.addColorStop(0.45, sl.top);
      topGrad.addColorStop(1, sl.wall);

      ctx.beginPath();
      ctx.moveTo(cx, cyTop);
      ctx.ellipse(cx, cyTop, rx, ry, 0, a0, a1, false);
      ctx.closePath();
      ctx.fillStyle = topGrad;
      ctx.fill();
    });
  }

  async function renderCartaoBonusPng(dados) {
    const fmtBRL  = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtT    = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const fmtPct1 = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const linhaComponente = (cor, titulo, peso, valor, metaLabel, metaValor, atingidoLabel, atingidoValor) => `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <div style="width:9px;height:9px;border-radius:50%;background:${cor};flex:none;"></div>
            <span style="font-size:12.5px;color:#f3f4f6;font-weight:600;">${escapeHtml(titulo)} · ${peso}%</span>
          </div>
          <span style="font-size:12.5px;color:#f3f4f6;font-weight:600;">${fmtBRL(valor)}</span>
        </div>
        <div style="display:flex;background:rgba(148,163,184,.08);border-radius:8px;overflow:hidden;">
          <div style="flex:1;padding:6px 10px;border-right:1px solid rgba(148,163,184,.14);">
            <p style="margin:0;font-size:10px;color:#7d8590;">${escapeHtml(metaLabel)}</p>
            <p style="margin:1px 0 0;font-size:12px;color:#e5e7eb;font-weight:600;">${metaValor}</p>
          </div>
          <div style="flex:1;padding:6px 10px;">
            <p style="margin:0;font-size:10px;color:#7d8590;">${escapeHtml(atingidoLabel)}</p>
            <p style="margin:1px 0 0;font-size:12px;color:#86efac;font-weight:600;">${atingidoValor}</p>
          </div>
        </div>
      </div>`;

    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';

    const card = document.createElement('div');
    card.style.cssText = 'width:360px;background:#0b1220;border:1px solid rgba(148,163,184,.18);border-radius:20px;padding:24px 22px;font-family:"DM Sans",system-ui,sans-serif;color:#e5e7eb;box-sizing:border-box;';
    card.innerHTML = `
      <div style="margin-bottom:16px;">
        <p style="margin:0;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#7d8590;">Bônus · ${escapeHtml(getMonthName(dados.mes))}/${dados.ano}</p>
        <p style="margin:2px 0 0;font-size:17px;font-weight:600;color:#f3f4f6;">${escapeHtml(dados.gestor)}</p>
        <p style="margin:1px 0 0;font-size:12px;color:#9ca3af;">${escapeHtml(dados.coordenacao)}${dados.supervisao ? ' · ' + escapeHtml(dados.supervisao) : ''}</p>
      </div>
      <div style="display:flex;background:rgba(148,163,184,.08);border-radius:10px;overflow:hidden;margin:2px 0 16px;">
        <div style="flex:1;text-align:center;padding:14px 10px;border-right:1px solid rgba(148,163,184,.14);">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Bônus de Partida</p>
          <p style="margin:4px 0 0;font-size:21px;font-weight:600;color:#e5e7eb;">${fmtBRL(dados.bonusInicial)}</p>
        </div>
        <div style="flex:1;text-align:center;padding:14px 10px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Bônus Final</p>
          <p style="margin:4px 0 0;font-size:21px;font-weight:600;color:#86efac;">${fmtBRL(dados.total)}</p>
        </div>
      </div>
      <div style="display:flex;justify-content:center;margin-bottom:14px;">
        <canvas id="metasBonusDonut" width="300" height="210" style="width:150px;height:105px;"></canvas>
      </div>
      <div style="border-top:1px solid rgba(148,163,184,.16);padding-top:14px;">
        ${linhaComponente('#166534', 'Produção', 40, dados.producao.valor,
          'Meta', `${fmtT(dados.producao.metaTons)} t`,
          'Atingido', `${fmtT(dados.producao.produzidoTons)} t (${fmtPct1(dados.producao.pct)}%)`)}
        ${linhaComponente('#4ade80', 'Despesas', 30, dados.despesas.valor,
          'Meta (custo/t empresa)', fmtBRL(dados.despesas.cptGeral),
          'Atingido (custo/t regional)', dados.despesas.cptCoord > 0 ? fmtBRL(dados.despesas.cptCoord) : 'sem dado')}
        ${linhaComponente('#bbf7d0', 'Leitura', 30, dados.leitura.valor,
          'Meta', '100%',
          'Atingido', dados.leitura.leituraPct !== null && dados.leitura.leituraPct !== undefined ? `${fmtPct1(dados.leitura.leituraPct)}%` : 'sem dado')}
      </div>
    `;

    holder.appendChild(card);
    document.body.appendChild(holder);

    const canvas = card.querySelector('#metasBonusDonut');
    desenharPizza3D(canvas, [
      { value: dados.producao.valor, top: '#166534', wall: '#0d3d1f', highlight: '#a7f3c9', rim: '#04170c' },
      { value: dados.despesas.valor, top: '#4ade80', wall: '#2c854d', highlight: '#eafff5', rim: '#0d3d20' },
      { value: dados.leitura.valor, top: '#bbf7d0', wall: '#70947d', highlight: '#ffffff', rim: '#345940' }
    ]);

    try {
      // Pequena espera pra garantir que o layout/DOM assentou antes da captura.
      // Não usar requestAnimationFrame aqui: em lote (vários gestores seguidos), o
      // usuário pode trocar de aba durante a geração e o navegador suspende rAF em
      // abas em segundo plano, travando o fechamento indefinidamente. setTimeout
      // continua rodando (só com throttling leve).
      await new Promise(resolve => setTimeout(resolve, 50));
      const canvasImg = await html2canvas(card, { backgroundColor: '#0b1220', scale: 2 });
      return canvasImg.toDataURL('image/png');
    } finally {
      holder.remove();
    }
  }

  async function gerarImagensBonusPorGestor(state, dadosGestores) {
    if (!dadosGestores.length) return;

    const zip = new JSZip();
    for (const dados of dadosGestores) {
      const dataUrl = await renderCartaoBonusPng(dados);
      const base64 = dataUrl.split(',')[1];
      const ref = `${String(state.mes).padStart(2, '0')}-${state.ano}`;
      zip.file(`bonus_${slugFileName(dados.gestor)}_${ref}.png`, base64, { base64: true });
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bonus_imagens_${String(state.mes).padStart(2, '0')}-${state.ano}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  async function baixarRelatorioBonusFechado(state, supabase) {
    if (!isMonthClosed(state)) return;

    const rows = mergeCoordenacoes(state).filter(row => Number(row.meta_tons || 0) > 0);
    if (!rows.length) {
      alert('Nenhuma meta cadastrada para este mês.');
      return;
    }

    const fechadoRow = (state.metasCadastro || []).find(r => r.fechado);
    const min = Number(fechadoRow?.bonus_percentual_minimo || 100);

    const gestoresEnriq = await enrichGestoresParaFechamento(state, supabase, Number(state.ano), Number(state.mes));

    const percByKey = new Map(rows.map(row => {
      const meta = Number(row.meta_tons || 0);
      const prod = Number(row.produzido_tons || 0);
      return [rowKey(row), meta > 0 ? (prod / meta) * 100 : 0];
    }));

    const gestoresBonus = gestoresEnriq.map(g => {
      const pct = percByKey.has(g._key) ? percByKey.get(g._key) : 0;
      const auditoria = (state.auditoria || []).find(a => normalizarTexto(a.regional) === g._key);
      const qualifica = pct >= min && (!auditoria || auditoria.apto !== false);
      return {
        coordenacaoKey: g._key,
        gestorId: g.id,
        qualifica,
        bonusProducao: qualifica ? (pct / 100) * g.bonusInicial * 0.4 : 0,
        bonusCusto:    qualifica ? g.valorCusto  : 0,
        bonusLeitura:  qualifica ? g.valorLeitura : 0
      };
    });

    if (!gestoresBonus.some(gb => gb.qualifica)) {
      alert('Nenhum gestor qualificado para bônus neste mês.');
      return;
    }

    gerarRelatorioBonusXlsx(state, gestoresEnriq, gestoresBonus);
  }

  function pedirPercentualAuditoria(nomeArquivo) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'metas-modal-overlay';
      overlay.innerHTML = `<div class="metas-modal" style="max-width:520px"><div class="metas-modal-header"><h3>Configurar auditoria</h3><p>${escapeHtml(nomeArquivo)}</p></div><div class="metas-field"><label>Qual o percentual de auditoria será considerado?</label><input class="metas-edit-input" type="number" min="0" max="100" step="0.01" value="1" data-auditoria-percentual /><p class="metas-config-hint">O limite será calculado sobre o Total Embarcado de cada regional.</p></div><div class="metas-modal-footer"><button class="metas-btn secondary" type="button" data-cancelar>Cancelar</button><button class="metas-btn" type="button" data-confirmar>Aplicar auditoria</button></div></div>`;
      document.body.appendChild(overlay);
      const finish = value => { overlay.remove(); resolve(value); };
      overlay.querySelector('[data-cancelar]').onclick = () => finish(null);
      overlay.querySelector('[data-confirmar]').onclick = () => {
        const value = Number(overlay.querySelector('[data-auditoria-percentual]').value);
        if (!Number.isFinite(value) || value < 0 || value > 100) return alert('Informe um percentual entre 0 e 100.');
        finish(value);
      };
    });
  }

  async function importarAuditoria(file, state, supabase, reload) {
    const percentual = await pedirPercentualAuditoria(file.name);
    if (percentual === null) return;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const dados = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const auditoria = new Map();
    dados.forEach(row => {
      const regional = String(row['Coordenação'] ?? row['Coordenacao'] ?? '').trim();
      const valor = Number(row.Total || 0);
      if (!regional || normalizarTexto(regional) === 'total geral' || !Number.isFinite(valor)) return;
      const key = normalizarTexto(regional);
      auditoria.set(key, { regional, valor: (auditoria.get(key)?.valor || 0) + valor });
    });
    if (!auditoria.size) return alert('A planilha precisa conter as colunas Coordenação e Total.');

    const range = getMonthRange(Number(state.ano), Number(state.mes));
    const embarques = await fetchAllRows(supabase.from('relatorio_resultado_diario').select('coordenacao,embarcado,data').gte('data', range.start).lt('data', range.next));
    const totalEmbarcado = new Map();
    embarques.forEach(row => {
      const key = normalizarTexto(row.coordenacao);
      totalEmbarcado.set(key, (totalEmbarcado.get(key) || 0) + Number(row.embarcado || 0));
    });
    const now = new Date().toISOString();
    const payload = Array.from(auditoria.entries()).map(([key, item]) => {
      const embarcado = totalEmbarcado.get(key) || 0;
      const limite = embarcado * (percentual / 100);
      return { ano: Number(state.ano), mes: Number(state.mes), regional: item.regional, valor_auditoria: item.valor, total_embarcado: embarcado, percentual_limite: percentual, apto: item.valor <= limite, nome_arquivo: file.name, updated_at: now };
    });
    const { error } = await supabase.from('metas_auditoria').upsert(payload, { onConflict: 'ano,mes,regional' });
    if (error) return alert('Erro ao salvar auditoria: ' + error.message);
    alert(`Auditoria aplicada em ${payload.length} regionais. ${payload.filter(r => !r.apto).length} ficaram acima do limite.`);
    await reload();
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

    const gestoresEnriq = await enrichGestoresParaFechamento(state, supabase, Number(state.ano), Number(state.mes));

    showFecharMetaModal(state, rows, gestoresEnriq, async (params) => {
      const now = new Date().toISOString();

      // Agrupa bonus por regional (soma todos gestores qualificados)
      const bonusByKey = new Map();
      for (const gb of (params.gestoresBonus || [])) {
        const k = gb.coordenacaoKey;
        if (!bonusByKey.has(k)) bonusByKey.set(k, { prod: 0, custo: 0, leitura: 0, qualifica: false });
        if (gb.qualifica) {
          bonusByKey.get(k).prod    += gb.bonusProducao;
          bonusByKey.get(k).custo   += gb.bonusCusto;
          bonusByKey.get(k).leitura += gb.bonusLeitura;
          bonusByKey.get(k).qualifica = true;
        }
      }

      const payloads = rows.map(row => {
        const meta = Number(row.meta_tons || 0);
        const produzido = Number(row.produzido_tons || 0);
        const percentual = meta > 0 ? (produzido / meta) * 100 : 0;
        const key = rowKey(row);
        const b = bonusByKey.get(key) || { prod: 0, custo: 0, leitura: 0, qualifica: false };

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
          bonus_producao: b.prod,
          bonus_custo:    b.custo,
          bonus_leitura:  b.leitura,
          bonus_total:    b.prod + b.custo + b.leitura,
          qualifica_bonus: b.qualifica,
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

      try {
        gerarRelatorioBonusXlsx(state, gestoresEnriq, params.gestoresBonus);
      } catch (e) {
        console.error('[METAS] Erro ao gerar relatório de bônus:', e);
        alert('Meta fechada com sucesso, mas houve um erro ao gerar o XLS de bônus: ' + (e?.message || e) + '\n\nVocê pode gerar o relatório novamente pelo botão "Exportar relatório de bônus (XLS)".');
      }

      try {
        const dadosGestores = montarDadosCartaoBonus(gestoresEnriq, params.gestoresBonus, state);
        await gerarImagensBonusPorGestor(state, dadosGestores);
      } catch (e) {
        console.error('[METAS] Erro ao gerar imagens de bônus:', e);
        alert('Meta fechada com sucesso, mas houve um erro ao gerar as imagens de bônus: ' + (e?.message || e));
      }

      await loadData(state, supabase);
      rerender();
    });
  }

  async function reverterFechamentoMes(state, supabase, rerender, button) {
    if (!isMonthClosed(state)) {
      alert('A meta deste mês já está aberta.');
      return;
    }

    const periodo = `${getMonthName(state.mes)}/${state.ano}`;
    const confirmado = confirm(
      `Reverter o fechamento de ${periodo}?\n\n` +
      'O período será reaberto para edição. Os status e valores de bônus calculados serão limpos, mas as metas cadastradas serão mantidas.'
    );
    if (!confirmado) return;

    const original = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Revertendo...';
    }

    const { error } = await supabase
      .from('metas_producao')
      .update({
        fechado: false,
        fechado_em: null,
        status_fechamento: null,
        produzido_fechamento: null,
        percentual_fechamento: null,
        bonus_percentual_minimo: null,
        bonus_producao: 0,
        bonus_custo: 0,
        bonus_leitura: 0,
        bonus_total: 0,
        qualifica_bonus: false,
        updated_at: new Date().toISOString()
      })
      .eq('ano', Number(state.ano))
      .eq('mes', Number(state.mes));

    if (error) {
      console.error('[METAS] Erro ao reverter fechamento:', error);
      alert('Erro ao reverter o fechamento: ' + error.message);
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
      return;
    }

    await loadData(state, supabase);
    rerender();
    alert(`Fechamento de ${periodo} revertido. O período está aberto novamente.`);
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

    const reopenBtn = container.querySelector('[data-metas-reopen]');
    if (reopenBtn) {
      reopenBtn.addEventListener('click', async () => {
        await reverterFechamentoMes(state, supabase, rerender, reopenBtn);
      });
    }

    const baixarBonusBtn = container.querySelector('[data-metas-baixar-bonus]');
    if (baixarBonusBtn) {
      baixarBonusBtn.addEventListener('click', async () => {
        baixarBonusBtn.disabled = true;
        const original = baixarBonusBtn.textContent;
        baixarBonusBtn.textContent = 'Gerando...';
        try {
          await baixarRelatorioBonusFechado(state, supabase);
        } catch (e) {
          console.error('[METAS] Erro ao gerar relatório de bônus:', e);
          alert('Erro ao gerar relatório de bônus: ' + (e?.message || e));
        } finally {
          baixarBonusBtn.disabled = false;
          baixarBonusBtn.textContent = original;
        }
      });
    }

    const form = container.querySelector('[data-metas-form]');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await salvarMeta(form, state, supabase, rerender);
      });
    }

    // ── Auditoria ─────────────────────────────────────────────────────────
    const auditoriaBtn = container.querySelector('[data-metas-auditoria]');
    const auditoriaFile = container.querySelector('[data-metas-auditoria-file]');
    if (auditoriaBtn && auditoriaFile) {
      auditoriaBtn.addEventListener('click', () => auditoriaFile.click());
      auditoriaFile.addEventListener('change', async () => {
        const file = auditoriaFile.files?.[0];
        if (file) await importarAuditoria(file, state, supabase, reload);
        auditoriaFile.value = '';
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
