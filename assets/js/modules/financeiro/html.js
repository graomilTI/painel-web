// Financeiro — HTML da tela do Financeiro (template único).
// Extraído de assets/js/financeiro.js em 15/10/2026 (arquivo de ~2.800 linhas). O código das funções e constantes
// foi movido sem alteração. Para publicar uma mudança em qualquer módulo de assets/js/modules/financeiro/, troque o
// token ?v=20261027-fin6 em TODOS os imports internos e nos carregadores (assets/js/financeiro.js, financeiro.html):
// tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { state, esc } from './util.js?v=20261027-fin6';
import { ICON } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';

  function htmlFinanceiro() {
    return `
    <style>
      .fin-wrap{display:grid;grid-template-columns:minmax(0,1fr);gap:20px}.fin-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.28));box-shadow:0 20px 50px rgba(2,6,23,.22)}
      .fin-hero h2{margin:0 0 6px;font-size:28px;color:#f8fafc}.fin-hero p{margin:0;color:#cbd5e1}.fin-actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.fin-grid{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:12px}.fin-kpi{border:1px solid rgba(148,163,184,.16);border-radius:20px;padding:16px;background:rgba(15,23,42,.86)}.fin-kpi span{display:block;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.fin-kpi strong{display:block;margin-top:8px;color:#f8fafc;font-size:22px}.fin-kpi small{color:#6b7280}.fin-card{border:1px solid rgba(148,163,184,.13);border-radius:24px;background:rgba(8,15,26,.75);padding:20px 22px;box-shadow:0 20px 50px rgba(2,6,23,.22);backdrop-filter:blur(10px)}
      .fin-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid rgba(148,163,184,.1)}.fin-head h3{margin:0;color:#f8fafc;font-size:17px;font-weight:700;letter-spacing:-.01em}.fin-head p{margin:3px 0 0;color:#64748b;font-size:13px}.pay-grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:14px}.pay-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(2,6,23,.34);padding:16px}.pay-card h4{margin:0 0 6px;color:#f8fafc;font-size:18px}.pay-card p{margin:0 0 14px;color:#6b7280}.pay-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:14px 0}.pay-mini{border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:12px;background:rgba(15,23,42,.7)}.pay-mini span{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.pay-mini strong{display:block;margin-top:5px;color:#f8fafc;font-size:18px}.pay-subtabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.pay-subtab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s}.pay-subtab:hover{color:#e2e8f0;background:rgba(15,23,42,.85)}.pay-subtab.active{background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(22,101,52,.35)}.pay-table{display:none}.pay-table.active{display:block}@media(max-width:1100px){.pay-grid,.pay-summary{grid-template-columns:1fr 1fr}}@media(max-width:700px){.pay-grid,.pay-summary{grid-template-columns:1fr}}.fin-tabs{display:flex;gap:4px;flex-wrap:wrap}.fin-tab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s;letter-spacing:.01em}.fin-tab:hover{color:#e2e8f0;background:rgba(15,23,42,.85);border-color:rgba(148,163,184,.25)}.fin-tab.active{background:linear-gradient(135deg,#166534,#16a34a);color:#fff;border-color:transparent;font-weight:700;box-shadow:0 2px 10px rgba(22,101,52,.4)}.fin-panel{display:none}.fin-panel.active{display:block}.fin-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.fin-field{display:grid;gap:6px}.fin-field.full{grid-column:1/-1}.fin-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}.fin-field input,.fin-field select,.fin-field textarea{width:100%;border:1px solid rgba(148,163,184,.18);border-radius:11px;background:rgba(15,23,42,.8);color:#e2e2f0;padding:10px 13px;color-scheme:dark;transition:border-color .14s}.fin-field input:focus,.fin-field select:focus,.fin-field textarea:focus{outline:0;border-color:rgba(52,211,153,.45);box-shadow:0 0 0 3px rgba(52,211,153,.08)}.fin-field textarea{min-height:78px;resize:vertical}.fin-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}.fin-table{width:100%;border-collapse:collapse;min-width:860px}.fin-table th,.fin-table td{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.08);text-align:left;color:#e2e8f0;font-size:14px}.fin-table th{background:rgba(8,15,26,.96);color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;position:sticky;top:0;z-index:1}.fin-table tbody tr:hover td{background:rgba(34,197,94,.05)}.fin-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.015)}.fin-muted{display:block;color:#6b7280;font-size:12px;margin-top:3px}.fin-status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800}.fin-status.ok{background:rgba(34,197,94,.14);color:#86efac}.fin-status.danger{background:rgba(239,68,68,.14);color:#fecaca}.fin-status.neutral{background:rgba(148,163,184,.14);color:#cbd5e1}.fin-import-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:14px}.fin-drop{border:1px dashed rgba(34,197,94,.35);border-radius:16px;padding:18px;background:rgba(22,101,52,.08);transition:border-color .14s,background .14s}.fin-drop:hover{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.14)}.pay-upload{border:1px dashed rgba(34,197,94,.45);border-radius:18px;background:rgba(22,101,52,.08);padding:14px;min-height:78px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;transition:.16s ease}.pay-upload:hover,.pay-upload.dragging{border-color:#22c55e;background:rgba(22,101,52,.18);transform:translateY(-1px)}.pay-upload input{display:none}.pay-upload strong{display:block;color:#e2e2f0;font-size:13px}.pay-upload span{display:block;color:#6b7280;font-size:12px;margin-top:4px;word-break:break-word}.pay-upload.has-file{border-style:solid;background:rgba(34,197,94,.14)}.fin-feedback{color:#6b7280;font-size:13px}.fin-feedback.ok{color:#86efac}.fin-feedback.err{color:#fecaca}.fin-empty{text-align:center;color:#6b7280;padding:24px!important}.fin-small{padding:8px 12px!important;font-size:13px!important}@media(max-width:1100px){.fin-grid{grid-template-columns:repeat(2,1fr)}.fin-form,.fin-import-grid{grid-template-columns:1fr}}@media(max-width:700px){.fin-grid{grid-template-columns:1fr}.fin-head{display:grid}}

      .pay-mode-panel{display:none}.pay-mode-panel.active{display:block}.pay-toolbar{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:14px 0}.pay-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;align-items:end}.pay-status-toggle{display:inline-flex;align-items:stretch;min-width:168px;overflow:hidden;border:2px solid rgba(226,232,240,.78);border-radius:999px;background:#020617;box-shadow:inset 0 0 0 1px rgba(15,23,42,.75)}.pay-status-btn{flex:1;border:0;background:transparent;color:#e2e2f0;padding:9px 14px;font-weight:900;font-size:12px;letter-spacing:.02em;cursor:pointer;transition:background .16s ease,color .16s ease,transform .16s ease}.pay-status-btn + .pay-status-btn{border-left:2px solid rgba(226,232,240,.78)}.pay-status-btn:hover{filter:brightness(1.06)}.pay-status-btn.active-ok{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.pay-status-btn.active-pendente{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff7f7}.pay-status-btn.is-inactive{background:#0d0d18;color:#cbd5e1}.pay-status-paid{display:inline-flex;align-items:center;justify-content:center;min-width:168px;padding:9px 14px;border-radius:999px;border:2px solid rgba(59,130,246,.4);background:linear-gradient(135deg,rgba(29,78,216,.25),rgba(59,130,246,.2));color:#bfdbfe;font-size:12px;font-weight:900;letter-spacing:.04em}.pay-footer{position:sticky;bottom:12px;z-index:2;margin-top:16px;border:1px solid rgba(34,197,94,.24);border-radius:20px;background:rgba(2,6,23,.94);backdrop-filter:blur(12px);padding:14px;display:flex;align-items:center;justify-content:space-between;gap:14px;box-shadow:0 18px 45px rgba(2,6,23,.38)}.pay-footer strong{display:block;color:#f8fafc}.pay-footer span{display:block;color:#6b7280;font-size:12px;margin-top:3px}.btn-pay-final{border:0;border-radius:16px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;font-weight:1000;padding:14px 28px;cursor:pointer}.btn-pay-final:disabled{opacity:.45;cursor:not-allowed}.pay-note{border:1px solid rgba(59,130,246,.24);background:rgba(37,99,235,.10);border-radius:16px;padding:12px;color:#bfdbfe;font-size:13px}.fin-status.pendente{background:rgba(245,158,11,.14);color:#fde68a}.fin-status.pago{background:rgba(59,130,246,.14);color:#bfdbfe}@media(max-width:900px){.pay-filter-grid{grid-template-columns:1fr 1fr}.pay-footer{position:static;display:grid}.btn-pay-final{width:100%}}@media(max-width:620px){.pay-filter-grid{grid-template-columns:1fr}.pay-status-toggle,.pay-status-paid{min-width:138px}}.pay-search-panel{margin:14px 0;display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:10px;align-items:end}.pay-search-field{display:grid;gap:6px}.pay-search-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}.pay-search-input{width:100%;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px 14px;color-scheme:dark}.pay-search-count{color:#6b7280;font-size:12px;margin-top:4px}@media(max-width:620px){.pay-search-panel{grid-template-columns:1fr}}

      .fin-setor-filter{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.fin-setor-btn{border:1px solid rgba(148,163,184,.22);background:#08111f;color:#cbd5e1;border-radius:999px;padding:9px 14px;font-weight:900;cursor:pointer}.fin-setor-btn.active{background:#166534;color:#fff;border-color:#22c55e}.fin-text-block{white-space:pre-wrap;line-height:1.45}.fin-pay-actions{display:flex;gap:8px;flex-wrap:wrap}.fin-pay-actions a{text-decoration:none}

      .fin-pay-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.fin-pay-modal.open{display:flex}.fin-pay-modal-card{width:min(820px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(148,163,184,.22);border-radius:22px;background:#15152a;color:#e2e2f0;padding:20px;box-shadow:0 24px 70px rgba(2,6,23,.45)}.fin-pay-preview{border:1px solid rgba(148,163,184,.16);border-radius:16px;background:rgba(15,23,42,.58);padding:14px}.mt-16{margin-top:16px}

      .cf-header{display:flex;align-items:center;flex-wrap:wrap;gap:10px;border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:13px 18px;background:rgba(8,15,26,.72);backdrop-filter:blur(14px)}
      .cf-balance-block{display:flex;align-items:center;gap:12px;padding-right:14px;border-right:1px solid rgba(52,211,153,.15);flex-shrink:0}
      .cf-balance-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6ee7b7;display:block}
      .cf-balance-value{font-size:24px;font-weight:900;color:#f8fafc;line-height:1;display:block;white-space:nowrap;letter-spacing:-.02em}
      .cf-balance-sub{font-size:10px;color:#475569;display:block;margin-top:1px}
      .cf-right-block{display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap;justify-content:space-between}
      .cf-kpi-row{display:flex;gap:5px;flex-wrap:wrap}
      .cf-kpi-pill{border:0!important;border-radius:10px!important;padding:8px 11px!important;background:rgba(15,23,42,.65)!important;transition:background .14s}
      .cf-kpi-pill:hover{background:rgba(15,23,42,.9)!important}
      .cf-kpi-pill span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
      .cf-kpi-pill strong{display:block;margin-top:2px;color:#f8fafc;font-size:15px;font-weight:900}
      .cf-kpi-pill small{display:none}
      .cf-kpi-pill.cf-receber strong{color:#86efac}
      .cf-kpi-pill.cf-pagar strong{color:#fca5a5}
      .cf-kpi-pill.cf-projected small.ok-label{color:#4ade80}
      .cf-kpi-pill.cf-projected small.danger-label{color:#f87171}
      .cf-actions-row{display:flex;gap:6px;flex-wrap:wrap}
      .cf-flow-mini{display:grid;grid-template-columns:repeat(3,1fr) 2fr;gap:12px;margin-bottom:18px;padding:16px;border:1px solid rgba(148,163,184,.1);border-radius:16px;background:rgba(8,15,26,.5);backdrop-filter:blur(8px)}
      .cf-flow-mini-item{display:flex;flex-direction:column;gap:4px}
      .cf-flow-mini-item .cf-fm-label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#64748b;font-weight:700}
      .cf-flow-mini-item .cf-fm-val{font-size:20px;font-weight:900;color:#f8fafc}
      .cf-flow-mini-item.cf-fm-receber .cf-fm-val{color:#86efac}
      .cf-flow-mini-item.cf-fm-pagar .cf-fm-val{color:#fca5a5}
      .cf-flow-mini-item.cf-fm-liquido .cf-fm-val{color:#93c5fd}
      .cf-flow-bar-wrap{display:flex;flex-direction:column;justify-content:center;gap:6px}
      .cf-flow-bar-label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#64748b;font-weight:700}
      .cf-flow-bar-track{height:8px;border-radius:999px;background:rgba(148,163,184,.1);overflow:hidden;display:flex}
      .cf-flow-bar-recv{height:100%;background:linear-gradient(90deg,#16a34a,#4ade80);transition:width .4s ease}
      .cf-flow-bar-pay{height:100%;background:linear-gradient(90deg,#dc2626,#f87171);transition:width .4s ease}
      @media(max-width:900px){.cf-balance-block{border-right:none;border-bottom:1px solid rgba(52,211,153,.12);padding-right:0;padding-bottom:10px;width:100%}.cf-flow-mini{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:640px){.cf-flow-mini{grid-template-columns:1fr 1fr}}

      .dash-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.dash-kpi-card{border-radius:22px;padding:20px;display:flex;align-items:center;gap:16px;border:1px solid rgba(148,163,184,.16);transition:transform .18s,box-shadow .18s}.dash-kpi-card:hover{transform:translateY(-3px);box-shadow:0 24px 50px rgba(2,6,23,.3)}.dash-kpi-saldo{background:linear-gradient(135deg,rgba(6,78,59,.55),rgba(4,47,46,.4));border-color:rgba(52,211,153,.22)}.dash-kpi-receber{background:linear-gradient(135deg,rgba(76,29,149,.5),rgba(46,16,101,.4));border-color:rgba(167,139,250,.22)}.dash-kpi-pagar{background:linear-gradient(135deg,rgba(127,29,29,.5),rgba(69,10,10,.4));border-color:rgba(252,165,165,.22)}.dash-kpi-projetado{background:linear-gradient(135deg,rgba(120,53,15,.5),rgba(69,26,3,.4));border-color:rgba(253,186,116,.22)}.dash-kpi-icon-wrap{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}.dash-kpi-saldo .dash-kpi-icon-wrap{background:rgba(52,211,153,.18)}.dash-kpi-receber .dash-kpi-icon-wrap{background:rgba(167,139,250,.18)}.dash-kpi-pagar .dash-kpi-icon-wrap{background:rgba(252,165,165,.18)}.dash-kpi-projetado .dash-kpi-icon-wrap{background:rgba(253,186,116,.18)}.dash-kpi-info{flex:1;min-width:0}.dash-kpi-label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;font-weight:700}.dash-kpi-value{display:block;font-size:22px;font-weight:900;color:#f8fafc;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-kpi-change{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;margin-top:5px;padding:3px 8px;border-radius:999px}.dash-kpi-change.up{background:rgba(34,197,94,.15);color:#86efac}.dash-kpi-change.down{background:rgba(239,68,68,.15);color:#fca5a5}.dash-kpi-change.neutral{background:rgba(148,163,184,.12);color:#6b7280}.dash-charts-row{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:18px}.dash-chart-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:20px}.dash-chart-card h3{margin:0;color:#f8fafc;font-size:16px}.dash-chart-card p{margin:3px 0 14px;color:#64748b;font-size:12px}.dash-chart-inner{position:relative;height:220px}.dash-bottom-row{display:grid;grid-template-columns:1fr;gap:16px}.dash-transactions-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:20px}.dash-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.dash-section-head h3{margin:0;color:#f8fafc;font-size:16px}.dash-tx-list{display:flex;flex-direction:column;gap:2px}.dash-tx-row{display:grid;grid-template-columns:36px 1fr auto auto;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;transition:background .14s}.dash-tx-row:hover{background:rgba(255,255,255,.04)}.dash-tx-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex-shrink:0}.dash-tx-icon.receber{background:rgba(52,211,153,.14);color:#34d399}.dash-tx-icon.pagar{background:rgba(252,165,165,.14);color:#f87171}.dash-tx-name{font-weight:600;color:#e2e8f0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-tx-sub{font-size:12px;color:#64748b;margin-top:1px}.dash-tx-date{font-size:12px;color:#64748b;text-align:right;white-space:nowrap}.dash-tx-value{font-weight:700;font-size:14px;text-align:right;white-space:nowrap}.dash-tx-value.receber{color:#86efac}.dash-tx-value.pagar{color:#fca5a5}.dash-loading{text-align:center;color:#64748b;padding:32px;font-size:14px}@media(max-width:1100px){.dash-kpi-grid{grid-template-columns:1fr 1fr}.dash-charts-row{grid-template-columns:1fr}}@media(max-width:640px){.dash-kpi-grid{grid-template-columns:1fr}}
      .spay-items{display:flex;flex-direction:column;gap:2px;margin-bottom:5px;font-size:13px;color:#e2e8f0}
      .spay-meta{font-size:13px;color:#e2e8f0;margin-top:3px;display:flex;align-items:baseline;gap:5px}
      .spay-meta-label{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;flex-shrink:0}
      .spay-link{color:#38bdf8;text-decoration:none;word-break:break-all}
      .spay-link:hover{text-decoration:underline}
      .spay-dados-details{margin-top:3px}
      .spay-dados-details summary{cursor:pointer;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700;list-style:none}
      .spay-dados-details summary::-webkit-details-marker{display:none}
      .spay-dados-details summary:before{content:'▸ ';font-size:10px}
      .spay-dados-details[open] summary:before{content:'▾ '}
      .spay-dados-details .spay-meta{margin-top:4px;max-width:520px;word-break:break-word}
      .spay-empty{color:#64748b;font-size:13px}
      .fin-btn-recusar{border:1px solid rgba(220,38,38,.3);background:rgba(220,38,38,.1);color:#fca5a5;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:all .14s;white-space:nowrap}
      .fin-btn-recusar:hover{background:rgba(220,38,38,.22);border-color:rgba(220,38,38,.5);color:#fecaca}
      .fin-det-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
      .fin-det-filters select,.fin-det-filters input{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(15,23,42,.8);color:#e5e7eb;padding:8px 12px;font-size:13px;color-scheme:dark;transition:border-color .14s;outline:0}
      .fin-det-filters select:focus,.fin-det-filters input:focus{border-color:rgba(52,211,153,.45);box-shadow:0 0 0 3px rgba(52,211,153,.08)}
      .det-th-sort{cursor:pointer;user-select:none;white-space:nowrap;transition:color .14s}
      .det-th-sort:hover{color:#e2e8f0!important}
      .det-th-active{color:#34d399!important}
      .det-sort-icon{margin-left:4px;opacity:.6;font-size:10px}
      .det-th-active .det-sort-icon{opacity:1;color:#34d399}
      .adiant-subtab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s}.adiant-subtab:hover{color:#e2e8f0;background:rgba(15,23,42,.85)}.adiant-subtab.active{background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(22,101,52,.35)}.adiant-table{display:none}.adiant-table.active{display:block}
      .adiant-th-sort{cursor:pointer;user-select:none;white-space:nowrap;transition:color .14s}
      .adiant-th-sort:hover{color:#e2e8f0!important}
      .adiant-th-active{color:#34d399!important}
      .adiant-sort-icon{margin-left:4px;opacity:.6;font-size:10px}
      .adiant-th-active .adiant-sort-icon{opacity:1;color:#34d399}
      .hist-colab-card{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:rgba(15,23,42,.6);padding:16px;margin-bottom:14px}
      .hist-colab-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-bottom:0;border-bottom:0;cursor:pointer;user-select:none}
      .hist-colab-card.expanded .hist-colab-head{margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(148,163,184,.1)}
      .hist-colab-name{font-size:15px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:8px}
      .hist-colab-toggle{display:inline-block;font-size:11px;color:#6b7280;transition:transform .16s ease}
      .hist-colab-card.expanded .hist-colab-toggle{transform:rotate(90deg)}
      .hist-colab-meta{display:flex;gap:18px;flex-wrap:wrap}
      .hist-colab-meta span{display:block;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}
      .hist-colab-meta strong{display:block;margin-top:2px;font-size:15px;color:#f8fafc}
      .hist-cal-row{display:none;gap:16px;flex-wrap:wrap}
      .hist-colab-card.expanded .hist-cal-row{display:flex}
      .hist-cal{width:238px}
      .hist-cal-title{font-size:12px;font-weight:700;color:#9fb7aa;text-transform:capitalize;margin-bottom:6px;text-align:center}
      .hist-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
      .hist-cal-dow{font-size:9px;color:#475569;text-align:center;font-weight:700;padding-bottom:2px}
      .hist-cal-day{min-height:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border-radius:6px;font-size:11px;color:#475569;background:rgba(255,255,255,.02)}
      .hist-cal-day .d{font-weight:700;line-height:1}
      .hist-cal-day .v{font-size:8px;line-height:1;opacity:.85}
      .hist-cal-day.paid{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}
      .hist-cal-day.recusado{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff7f7}
      .hist-cal-day.removido{background:linear-gradient(135deg,#475569,#64748b);color:#f1f5f9}
      .hist-cal-day.blank{background:transparent}
      .fin-tab-icon{margin-left:auto;border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#9fb7aa;border-radius:10px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;transition:all .14s}
      .fin-tab-icon:hover{color:#fff;background:linear-gradient(135deg,#166534,#16a34a);border-color:transparent}
      .ajustes-subtab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s}
      .ajustes-subtab:hover{color:#e2e8f0;background:rgba(15,23,42,.85)}
      .ajustes-subtab.active{background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(22,101,52,.35)}
      .ajustes-panel{display:none}
      .ajustes-panel.active{display:block}
      /* Abas do topo no padrão do Frotas (texto + risco embaixo do ativo; Atualizar como ícone à direita). */
      .fin-tabrow{display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(148,163,184,.14);margin-bottom:16px}
      .fin-tabrow .fin-tabs{gap:2px;flex:1;min-width:0;flex-wrap:nowrap;overflow-x:auto}
      .fin-tabrow .fin-tab{border:0;border-radius:0;background:transparent;box-shadow:none;padding:12px 14px 11px;color:#a9b8b1;font-size:13px;white-space:nowrap;border-bottom:2px solid transparent}
      .fin-tabrow .fin-tab:hover{color:#d9fbe8;background:rgba(34,197,94,.035);border-color:transparent}
      .fin-tabrow .fin-tab.active{color:#35e990;background:transparent;box-shadow:none;border-bottom-color:#22e58a}
      .fin-tabrow .fin-tab-icon{margin-left:0;flex:none}
      /* Aba Pagamentos (layout das listas do Frotas: cards que filtram, busca com chip, tabela fixa, ações em ícones). */
      #tab-pagamentos .fm-shell{display:grid;gap:16px}#tab-pagamentos .fm-topo{margin:0;justify-content:space-between;align-items:center}#tab-pagamentos .fm-prazo-dia{margin:0;font-size:13px}
      #tab-pagamentos .fm-kpis{margin:0}#tab-pagamentos .fm-table{min-width:1040px}#tab-pagamentos .fm-table td{vertical-align:top}#tab-pagamentos .fm-btn svg{width:16px;height:16px;flex:none}
      #tab-pagamentos .fm-kcard.tone-slate{--kc:#94a3b8;--kc-bg:rgba(148,163,184,.14)}
      .fin-cod{display:block;margin-top:3px;color:#93c5fd;white-space:nowrap;font-size:11.5px}
      .fin-baixa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px}.fin-baixa-head b{display:block;color:#f8fafc;font-size:16px}.fin-baixa-head .fm-prazo-dia{max-width:820px;line-height:1.5}
      .fin-baixa-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}.fin-file{flex:0 1 420px;min-width:240px;height:auto;min-height:42px;padding:5px 8px}.fin-file::file-selector-button{margin-right:10px;border:1px solid rgba(34,197,94,.24);border-radius:10px;background:rgba(34,197,94,.12);color:#86efac;padding:6px 12px;font:inherit;font-weight:900;cursor:pointer}
      .fin-baixa-head a.fm-btn{text-decoration:none}#baixaNfResumo{margin:0}
    </style>
    <section class="fin-wrap">
      <div class="cf-header">
        <div class="cf-balance-block">
          <div class="cf-balance-label">Saldo do dia</div>
          <div class="cf-balance-value" id="kpiSaldo">R$ 0,00</div>
          <div class="cf-balance-sub">Manual · hoje</div>
        </div>
        <div class="cf-right-block">
          <div class="cf-kpi-row">
            <article class="fin-kpi cf-kpi-pill cf-receber"><span>A Receber</span><strong id="kpiReceber">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill cf-pagar"><span>A Pagar</span><strong id="kpiPagar">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill"><span>Provisão</span><strong id="kpiProvisao">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill cf-projected"><span>Saldo Projetado</span><strong id="kpiProjetado">R$ 0,00</strong><small id="kpiStatus">OK</small></article>
          </div>
        </div>
      </div>

      <article class="fin-card">
        <div class="fin-tabrow">
          <div class="fin-tabs">
            <button class="fin-tab active" data-tab="dashboard" type="button">Dashboard</button>
            <button class="fin-tab" data-tab="fluxo" type="button">Fluxo</button>
            <button class="fin-tab" data-tab="despesas" type="button">Despesas</button>
            <button class="fin-tab" data-tab="pagamentos" type="button">Pagamentos</button>
            <button class="fin-tab" data-tab="notas-fiscais" type="button">Notas Fiscais</button>
            <button class="fin-tab" data-tab="ajustes" type="button">Ajustes</button>
          </div>
          <button class="fin-tab-icon" id="btnReload" type="button" title="Atualizar fluxo" aria-label="Atualizar fluxo">↻</button>
        </div>

        <div class="fin-panel active" id="tab-dashboard">
          <div class="dash-kpi-grid">
            <div class="dash-kpi-card dash-kpi-saldo">
              <div class="dash-kpi-icon-wrap">💼</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">Saldo do Mês</span>
                <strong class="dash-kpi-value" id="dKpiSaldo">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiSaldoChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-receber">
              <div class="dash-kpi-icon-wrap">📈</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">A Receber (mês)</span>
                <strong class="dash-kpi-value" id="dKpiReceber">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiReceberChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-pagar">
              <div class="dash-kpi-icon-wrap">📉</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">A Pagar (mês)</span>
                <strong class="dash-kpi-value" id="dKpiPagar">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiPagarChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-projetado">
              <div class="dash-kpi-icon-wrap">🎯</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">Saldo Projetado</span>
                <strong class="dash-kpi-value" id="dKpiProjetado">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiProjetadoChange">–</span>
              </div>
            </div>
          </div>
          <div class="dash-charts-row">
            <div class="dash-chart-card">
              <h3>Despesas Diárias</h3>
              <p>Próximos 15 dias</p>
              <div class="dash-chart-inner"><canvas id="dashLineChart"></canvas></div>
            </div>
            <div class="dash-chart-card">
              <h3>Categorias de Despesas</h3>
              <p>Últimos 90 dias</p>
              <div class="dash-chart-inner"><canvas id="dashDonutChart"></canvas></div>
            </div>
          </div>
          <div class="dash-bottom-row">
            <div class="dash-transactions-card">
              <div class="dash-section-head">
                <h3>Vencimentos de Hoje</h3>
                <button class="btn btn-secondary fin-small" data-tab-target="fluxo" type="button">Ver todos</button>
              </div>
              <div id="dashTransactions" class="dash-tx-list"><div class="dash-loading">Carregando...</div></div>
            </div>
          </div>
        </div>

        <div class="fin-panel" id="tab-fluxo">
          <div id="fluxoListaView">
            <div class="cf-flow-mini" id="cfFlowMini" style="display:none">
              <div class="cf-flow-mini-item cf-fm-receber">
                <span class="cf-fm-label">Total Receber</span>
                <span class="cf-fm-val" id="cfFmReceber">R$ 0,00</span>
              </div>
              <div class="cf-flow-mini-item cf-fm-pagar">
                <span class="cf-fm-label">Total Pagar</span>
                <span class="cf-fm-val" id="cfFmPagar">R$ 0,00</span>
              </div>
              <div class="cf-flow-mini-item cf-fm-liquido">
                <span class="cf-fm-label">Fluxo Líquido</span>
                <span class="cf-fm-val" id="cfFmLiquido">R$ 0,00</span>
              </div>
              <div class="cf-flow-bar-wrap">
                <span class="cf-flow-bar-label">Receber vs Pagar</span>
                <div class="cf-flow-bar-track">
                  <div class="cf-flow-bar-recv" id="cfBarRecv" style="width:50%"></div>
                  <div class="cf-flow-bar-pay" id="cfBarPay" style="width:50%"></div>
                </div>
              </div>
            </div>
            <form class="fin-form" id="periodForm">
              <div class="fin-field"><label>Data inicial</label><input id="filterInicio" type="date" value="${esc(state.filters.inicio)}"></div>
              <div class="fin-field"><label>Data final</label><input id="filterFim" type="date" value="${esc(state.filters.fim)}"></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Aplicar período</button></div>
            </form>
            <br>
            <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Saldo do dia</th><th>Receber</th><th>Pagar</th><th>Provisão</th><th>Saldo projetado</th><th>Status</th><th>Ação</th></tr></thead><tbody id="fluxoTbody"><tr><td colspan="8" class="fin-empty">Carregando...</td></tr></tbody></table></div>
          </div>

          <div id="fluxoDetalhesView" style="display:none">
            <div class="fin-head">
              <div><h3>Detalhes do dia selecionado</h3><p id="detalhesData">Selecione uma data no fluxo.</p></div>
              <button class="btn btn-secondary" id="btnVoltarFluxo" type="button">← Voltar</button>
            </div>
            <div class="fin-det-filters">
              <select id="detFiltroTipo"><option value="">Tipo</option><option value="Receber">Receber</option><option value="Pagar">Pagar</option></select>
              <select id="detFiltroSituacao"><option value="">Situação</option><option value="Recebida">Recebida</option><option value="A vencer">A vencer</option><option value="Vencida">Vencida</option><option value="Paga">Paga</option></select>
              <input type="text" id="detFiltroFavorecido" placeholder="Favorecido...">
              <input type="text" id="detFiltroDoc" placeholder="Documento...">
            </div>
            <div class="fin-table-wrap"><table class="fin-table"><thead><tr>
              <th data-det-sort="tipo" class="det-th-sort">Tipo <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="situacao" class="det-th-sort">Situação <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="nome" class="det-th-sort">Nome/Favorecido <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="doc" class="det-th-sort">Documento <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="valor" class="det-th-sort">Valor <span class="det-sort-icon">↕</span></th>
              <th data-det-sort="vencimento" class="det-th-sort">Vencimento <span class="det-sort-icon">↕</span></th>
            </tr></thead><tbody id="detalhesTbody"><tr><td colspan="6" class="fin-empty">Nenhuma data selecionada.</td></tr></tbody></table></div>
          </div>
        </div>

        <div class="fin-panel" id="tab-ajustes">
          <div class="fin-head"><div><h3>Ajustes</h3><p>Saldo e provisão manual, e importação de relatórios (contingência).</p></div></div>
          <div class="pay-subtabs">
            <button class="ajustes-subtab active" data-ajustes-tab="saldo" type="button">Saldo e Provisão</button>
            <button class="ajustes-subtab" data-ajustes-tab="importar" type="button">Importar relatórios</button>
          </div>

          <div class="ajustes-panel active" id="ajustes-saldo">
            <form class="fin-form" id="configForm">
              <div class="fin-field"><label>Data</label><input id="cfgData" type="date" value="${esc(state.currentDate)}" required></div>
              <div class="fin-field"><label>Saldo do dia</label><input id="cfgSaldo" type="number" step="0.01" placeholder="0,00"></div>
              <div class="fin-field"><label>Provisão automática</label><input id="cfgProvAuto" type="number" step="0.01" placeholder="0,00"></div>
              <div class="fin-field"><label>Ajuste manual provisão</label><input id="cfgProvManual" type="number" step="0.01" placeholder="0,00"></div>
              <div class="fin-field full"><label>Observações</label><textarea id="cfgObs" placeholder="Observações do financeiro"></textarea></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Salvar ajustes</button></div>
              <div class="fin-field"><label>&nbsp;</label><span id="fbConfig" class="fin-feedback"></span></div>
            </form>
          </div>

          <div class="ajustes-panel" id="ajustes-importar">
            <div class="fin-import-grid">
              <div class="fin-drop">
                <h3>Contas a Receber</h3>
                <p class="fin-muted">Use o relatório com colunas Código, Fatura, Cliente, Vencimento, Valor e Valor Pago.</p><br>
                <input id="fileReceber" type="file" accept=".xlsx,.xls,.csv">
                <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportReceber" type="button">Importar receber</button><span id="fbReceber" class="fin-feedback"></span></div>
              </div>
              <div class="fin-drop">
                <h3>Contas a Pagar</h3>
                <p class="fin-muted">Use o relatório com colunas Empresa, COD/Grupo, Favorecido, Doc, Vencimento, Parcela e Valor.</p><br>
                <input id="filePagar" type="file" accept=".xlsx,.xls,.csv">
                <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportPagar" type="button">Importar pagar</button><span id="fbPagar" class="fin-feedback"></span></div>
              </div>
            </div>
          </div>
        </div>


        <div class="fin-panel" id="tab-despesas">
          <div class="fin-head">
            <div><h3>Despesas</h3><p>Adiantamentos ficam concentrados aqui. Diária (Terceirizados) e Alimentação (almoço) saíram deste fluxo — o lançamento já é feito pelo agente de despesas retroativas direto no GRM.</p></div>
          </div>

          <section class="pay-card pay-mode-panel active" id="pay-mode-adiantamentos">
            <h4>ADIANTAMENTOS</h4>
            <p>Solicitações de Caixa Operacional sincronizadas automaticamente do GRM (agente sync-adiantamentos, a cada 15min). Marque ✓ para incluir no pagamento ou ✗ para recusar (motivo fica no histórico).</p>
            <div class="pay-filter-grid">
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnAtualizarAdiantamentos" type="button">↻ Atualizar</button></div>
              <div class="fin-field full"><label>&nbsp;</label><span id="fbAdiantamentos" class="fin-feedback"></span></div>
            </div>

            <div class="pay-summary">
              <div class="pay-mini"><span>Pendentes</span><strong id="adiantPendentes">0</strong></div>
              <div class="pay-mini"><span>Selecionados ✓</span><strong id="adiantSelecionados">0</strong></div>
              <div class="pay-mini"><span>Total selecionado</span><strong id="adiantTotalSelecionado">R$ 0,00</strong></div>
              <div class="pay-mini"><span>Recusados</span><strong id="adiantRecusados">0</strong></div>
            </div>

            <div class="pay-note">Somente linhas marcadas com <strong>✓</strong> entram no botão <strong>PAGAR</strong>. Ao pagar, recusar (motivo obrigatório) ou sair da lista de pendentes do GRM (resolvido direto por lá), a linha sai daqui e vai para <strong>Histórico de Pagamentos</strong> — evita pagamento duplicado.</div>

            <div class="pay-subtabs">
              <button class="adiant-subtab active" data-adiant-tab="ativos" type="button">Solicitações</button>
              <button class="adiant-subtab" data-adiant-tab="historico" type="button">Histórico de Pagamentos</button>
            </div>

            <div class="adiant-table active" id="adiant-ativos">
              <div class="fin-table-wrap">
                <table class="fin-table">
                  <thead><tr>
                    <th data-adiant-sort="data_solicitacao" class="adiant-th-sort">Data <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="colaborador" class="adiant-th-sort">Colaborador <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="coordenacao" class="adiant-th-sort">Coordenação <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="supervisao" class="adiant-th-sort">Supervisão <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="valor" class="adiant-th-sort">Valor <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="saldo" class="adiant-th-sort">Saldo <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="embarque" class="adiant-th-sort">Embarque <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="leitura_mais_antiga" class="adiant-th-sort">Leitura <span class="adiant-sort-icon">↕</span></th>
                    <th data-adiant-sort="descricao" class="adiant-th-sort">Descrição <span class="adiant-sort-icon">↕</span></th>
                    <th>Ação</th>
                  </tr></thead>
                  <tbody id="adiantTbody"><tr><td colspan="10" class="fin-empty">Carregando...</td></tr></tbody>
                </table>
              </div>

              <div class="pay-footer">
                <div><strong id="adiantFooterTotal">Total pronto para pagar: R$ 0,00</strong><span id="adiantFooterHint">Marque ✓ nas solicitações para liberar o botão.</span></div>
                <button class="btn-pay-final" id="btnPagarAdiantamentos" type="button" disabled>PAGAR</button>
              </div>
            </div>

            <div class="adiant-table" id="adiant-historico">
              <input id="histColaboradorFiltro" class="pay-search-input" type="search" placeholder="Filtrar por colaborador..." style="margin-bottom:14px">
              <div id="adiantHistoricoContent"><div class="fin-empty">Nenhum pagamento registrado ainda.</div></div>
            </div>
          </section>
        </div>

        <div class="fin-panel" id="tab-pagamentos">
          <div class="fm-shell">
            <div class="fm-topo">
              <p class="fm-prazo-dia">Fila de despesas enviadas por Compras, Hospedagem, RH e outros módulos para o financeiro realizar o pagamento.</p>
              <div class="fm-head-actions"><button class="fm-btn soft" id="btnReloadSetorPagamentos" type="button">↻ Atualizar</button></div>
            </div>

            <div class="fm-kpis" id="setorPagKpis"></div>

            <div class="fm-card"><div class="fm-body">
              <div class="fm-bar">
                <div class="fm-search">${ICON.busca}<input class="fm-input" id="setorPagBusca" type="search" placeholder="Buscar por setor, código, gestor, coordenação, conteúdo ou valor..." autocomplete="off"></div>
                <span data-chip></span>
                <span class="fm-count" id="setorPagCount"></span>
              </div>
              <div class="fm-table-wrap">
                <table class="fm-table">
                  <thead>
                    <tr>
                      <th>Setor</th>
                      <th>Data/Hora</th>
                      <th>Gestor</th>
                      <th>Coordenação</th>
                      <th>Conteúdo</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody id="setorPagamentosTbody">
                    <tr><td colspan="8" class="fm-empty">Carregando pagamentos enviados pelos setores...</td></tr>
                  </tbody>
                </table>
              </div>
            </div></div>

            <div class="fm-card"><div class="fm-body">
              <div class="fin-baixa-head">
                <div>
                  <b>Comprovantes de pagamento (Holerite/NF)</b>
                  <span class="fm-prazo-dia">Envie os comprovantes de PIX/TED de um lote já pago (holerite ou NF já lançados no GRM). Cada arquivo vira 1 item na fila de baixa — o casamento com o lançamento certo e a confirmação de casos ambíguos ficam no Painel de Notas Fiscais.</span>
                </div>
                <a class="fm-btn ghost" href="notas-fiscais.html#baixas">Ver e revisar →</a>
              </div>
              <div class="fin-baixa-bar">
                <input class="fm-input fin-file" id="baixaNfArquivos" type="file" multiple accept=".pdf" aria-label="Comprovantes em PDF">
                <button class="fm-btn primary" id="btnEnviarBaixaNf" type="button">Enviar comprovantes</button>
                <span id="fbBaixaNf" class="fin-feedback"></span>
              </div>
              <div id="baixaNfResumo" class="fm-kpis"></div>
            </div></div>
          </div>
        </div>

        <div class="fin-panel" id="tab-notas-fiscais">
          <div class="fin-head">
            <div>
              <h3>Notas Fiscais</h3>
              <p>Sincronizado automaticamente pelo agente sync-notas-fiscais. Dados de faturamento por nota fiscal.</p>
            </div>
            <button class="btn btn-secondary" id="nfReloadBtn" type="button">↻ Atualizar</button>
          </div>

          <div class="pay-summary" id="nfSummary"></div>

          <div class="fin-form" style="margin:14px 0 0">
            <div class="fin-field">
              <label>Cliente</label>
              <input id="nfFiltroCliente" type="text" placeholder="Buscar cliente..." />
            </div>
            <div class="fin-field">
              <label>Situação</label>
              <select id="nfFiltroSituacao">
                <option value="">Todas</option>
                <option value="Paga">Paga</option>
                <option value="Aguardando Pagamento">Aguardando Pagamento</option>
              </select>
            </div>
          </div>

          <div class="fin-table-wrap mt-16">
            <table class="fin-table">
              <thead>
                <tr>
                  <th>N.F.</th><th>Data N.F.</th><th>Cliente</th><th>Coordenação</th>
                  <th>Tons</th><th>Valor Bruto</th><th>Imposto</th><th>Valor da N.F.</th><th>Situação</th>
                </tr>
              </thead>
              <tbody id="nfTbody">
                <tr><td colspan="9" class="fin-empty">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
          <div class="fin-muted" id="nfPreviewNote"></div>
        </div>
      </article>
    </section>
  `;
  }

export { htmlFinanceiro };
