import { supabase } from './supabaseClient.js';

const HOSP_COTACAO_FLOW_ID = '8660973';

const state = {
  rows: [],
  hotels: [],
  quotes: [],
  extras: [],
  documents: [],
  collaborators: new Map(),
  selectedRequests: new Set(),
  selectedId: null,
  requestStatus: 'todas',
  requestSort: { field: 'data', direction: 'desc' },
  stageSort: { andamento: { field: 'data', direction: 'asc' }, pagar: { field: 'data', direction: 'asc' }, nf: { field: 'data', direction: 'desc' } },
  stageFilters: { colaborador:'', cidade:'', supervisao:'', hotel:'' },
  requesters: new Map(),
  mounted: false,
  loading: false,
  lastLoad: 0,
  tables: { quotes: true, extras: true, documents: true, messages: true },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brDate = (value) => {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};
const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
const todayIso = () => new Date().toISOString().slice(0, 10);

function icon(name) {
  const paths = {
    quote: '<path d="M4 5h16v10H8l-4 4V5Z"/><path d="M8 9h.01M12 9h.01M16 9h.01"/>',
    reserve: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    checkout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/>',
    extend: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    pay: '<circle cx="12" cy="12" r="9"/><path d="M16 8h-5a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4H8M12 6v12"/>',
    finance: '<path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18M12 3l9 5H3l9-5Z"/>',
    attach: '<path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7L9.7 17.7a2 2 0 0 1-2.8-2.8l8.9-8.9"/>',
    extra: '<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9"/>',
    detail: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    hotel: '<path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M17 9h3v12M8 7h2M13 7h.01M8 11h2M13 11h.01M8 15h2M13 15h.01M2 21h20"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    reject: '<path d="M18 6 6 18M6 6l12 12"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.detail}</svg>`;
}

function injectStyles() {
  if ($('#hospV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'hospV2Styles';
  style.textContent = `
    :root{--hv2-bg:#03110d;--hv2-panel:#061913;--hv2-card:#071d16;--hv2-line:rgba(34,197,94,.34);--hv2-green:#4ade80;--hv2-muted:#8aa49a;--hv2-text:#eefbf5;--hv2-amber:#f59e0b;--hv2-purple:#a78bfa;--hv2-blue:#38bdf8}
    #pageContent{position:relative;padding-top:10px!important}#pageContent>.hero-card{display:none!important}
    .hosp-v2-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 12px}
    .hosp-v2-kpi{position:relative;display:grid;grid-template-columns:40px 1fr;gap:10px;align-items:center;min-height:76px;padding:12px 14px;border-radius:15px;background:linear-gradient(145deg,rgba(5,29,21,.96),rgba(2,17,13,.96));border:1px solid rgba(34,197,94,.25);overflow:hidden}
    .hosp-v2-kpi::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,transparent,var(--kpi,#4ade80),transparent);opacity:.8}.hosp-v2-kpi-ico{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(74,222,128,.09);color:var(--kpi,#4ade80)}.hosp-v2-kpi-ico svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.hosp-v2-kpi small{display:block;color:#91a89e;font-size:11px;font-weight:800}.hosp-v2-kpi strong{display:block;color:#f4fff9;font-size:25px;line-height:1;margin-top:4px}.hosp-v2-kpi em{display:block;color:var(--kpi,#4ade80);font-size:11px;font-weight:850;font-style:normal;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .adm-hosp-tabs{padding:4px!important;border:1px solid rgba(34,197,94,.22)!important;border-radius:15px!important;background:rgba(2,15,11,.88)!important;margin:0 0 8px!important;align-items:center}.adm-hosp-tab{border:0!important;background:transparent!important;border-radius:11px!important;color:#a9bbb3!important;padding:9px 18px!important}.adm-hosp-tab.active{background:linear-gradient(180deg,rgba(22,101,52,.48),rgba(9,55,35,.5))!important;color:#b9ffd1!important;box-shadow:inset 0 0 0 1px rgba(74,222,128,.22),0 7px 22px rgba(0,0,0,.18)!important}.adm-hosp-tabs-sep,.adm-hosp-tabs-label{display:none!important}.adm-hosp-tabs>#refreshPainel{margin-left:auto!important;padding:9px 15px!important}.adm-hosp-panel>.card{padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important}.adm-hosp-panel>.card>.section-head{display:none!important}.adm-hosp-filterbar{margin:0 0 8px!important;border-radius:0!important;border-left:0!important;border-right:0!important;padding:9px 10px!important;background:#07151d!important}.adm-hosp-filter-meta{display:none!important}
    .hosp-v2-view-tools{display:flex;align-items:center;gap:7px;overflow-x:auto;margin:0 0 10px;padding:2px;scrollbar-width:none}.hosp-v2-view-tools::-webkit-scrollbar{display:none}.hosp-v2-filter{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;border:1px solid rgba(74,222,128,.17);border-radius:999px;background:rgba(2,18,13,.65);color:#91a89e;padding:7px 11px;font-size:10.5px;font-weight:850;cursor:pointer}.hosp-v2-filter b{display:grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:rgba(255,255,255,.06);color:#c9ddd3;font-size:9.5px}.hosp-v2-filter.active{border-color:rgba(74,222,128,.48);background:rgba(22,101,52,.34);color:#d9ffe6}.hosp-v2-filter.active b{background:#4ade80;color:#052814}.hosp-v2-kpi{cursor:pointer;transition:.16s ease}.hosp-v2-kpi:hover{border-color:rgba(74,222,128,.55);transform:translateY(-1px)}.hosp-v2-pay-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px}.hosp-v2-pay-metric{padding:14px 16px;border:1px solid rgba(74,222,128,.2);border-radius:14px;background:linear-gradient(145deg,rgba(5,29,21,.95),rgba(2,17,13,.95))}.hosp-v2-pay-metric small{display:block;color:#8da59a;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.hosp-v2-pay-metric strong{display:block;margin-top:7px;color:#f0fff6;font-size:21px}.hosp-v2-pay-metric.pending strong{color:#fbbf24}.hosp-v2-pay-metric.finance strong{color:#c4b5fd}
    .hosp-v2-hide-base{display:none!important}.hosp-v2-list{display:grid;gap:7px;overflow-x:auto}.hosp-v2-list-head{display:grid;grid-template-columns:minmax(150px,.9fr) minmax(190px,1.05fr) minmax(240px,1.35fr) minmax(150px,.9fr) minmax(150px,.9fr) minmax(230px,1.2fr);min-width:1080px;padding:0 10px;color:#91a89e;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.hosp-v2-sort{display:flex;align-items:center;justify-content:flex-start;gap:6px;width:100%;padding:5px 9px;border:0;background:transparent;color:inherit;font:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer;border-radius:7px;text-align:left}.hosp-v2-sort:hover{color:#d8ffe4;background:rgba(74,222,128,.07)}.hosp-v2-sort.is-active{color:#86efac}.hosp-v2-sort-arrow{font-size:12px;line-height:1;color:#4ade80}.hosp-v2-list-head-label{padding:5px 9px}
    .hosp-v2-row.hosp-v2-request-row{grid-template-columns:minmax(150px,.9fr) minmax(190px,1.05fr) minmax(240px,1.35fr) minmax(150px,.9fr) minmax(150px,.9fr) minmax(230px,1.2fr);min-width:1080px;border-radius:4px}.hosp-v2-request-row .hosp-v2-cell{padding:10px 12px;display:flex;align-items:center}.hosp-v2-request-row .hosp-v2-cell.actions{padding:5px}.hosp-v2-request-row .hosp-v2-city{display:flex;gap:7px;align-items:center;font-size:12px;font-weight:900;color:#effff5}.hosp-v2-request-row .hosp-v2-city svg,.hosp-v2-request-row .hosp-v2-date svg{width:14px;height:14px;fill:none;stroke:#4ade80;stroke-width:1.9;flex:0 0 auto}.hosp-v2-request-row .hosp-v2-date{display:flex;gap:7px;align-items:center;font-size:11.5px;font-weight:850;white-space:nowrap}.hosp-v2-select{display:flex;gap:9px;align-items:center;cursor:pointer}.hosp-v2-select input{width:17px;height:17px;accent-color:#4ade80}.hosp-v2-select span{display:flex;gap:7px;align-items:center}.hosp-v2-select svg{width:14px;height:14px;fill:none;stroke:#4ade80;stroke-width:1.9}.hosp-v2-people{display:block;color:#d8eee3;font-size:11px;font-weight:800;line-height:1.4}.hosp-v2-person{display:inline;padding:0;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;text-transform:none}.hosp-v2-supervision{font-size:11px;font-weight:800;color:#c8dbd2}.hosp-v2-request-row .hosp-v2-hotel{font-size:11px}.hosp-v2-request-row .hosp-v2-actions{display:grid;grid-template-columns:repeat(3,minmax(64px,1fr));width:100%;gap:5px}.hosp-v2-request-row .hosp-v2-btn{min-height:39px;font-size:8.5px;border-radius:9px}.hosp-v2-request-row .hosp-v2-btn svg{width:15px;height:15px}
    .hosp-v2-row{position:relative;display:grid;grid-template-columns:minmax(190px,.9fr) minmax(310px,1.6fr) minmax(185px,.85fr) minmax(248px,1fr);gap:0;border:1px solid rgba(34,197,94,.28);border-radius:15px;background:linear-gradient(100deg,rgba(5,27,20,.98),rgba(2,16,12,.98));box-shadow:0 10px 28px rgba(0,0,0,.18);overflow:hidden;transition:.16s ease}
    .hosp-v2-row::before{content:"";position:absolute;left:4px;top:28px;width:3px;height:28px;border-radius:999px;background:#4ade80;box-shadow:0 0 14px rgba(74,222,128,.65)}.hosp-v2-row:hover,.hosp-v2-row.is-selected{border-color:rgba(74,222,128,.78);box-shadow:0 0 0 1px rgba(74,222,128,.15),0 16px 40px rgba(0,0,0,.28)}
    .hosp-v2-cell{padding:14px 15px;border-right:1px solid rgba(74,222,128,.11);min-width:0}.hosp-v2-cell:last-child{border-right:0}.hosp-v2-code{font-size:15px;font-weight:950;color:#f5fff9}.hosp-v2-sub{display:block;color:#91a89e;font-size:11.5px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hosp-v2-mainline{display:flex;gap:18px;align-items:center;flex-wrap:wrap;color:#f0fff7;font-size:12.5px;font-weight:800}.hosp-v2-mainline span{display:inline-flex;gap:6px;align-items:center}.hosp-v2-mainline svg{width:15px;height:15px;fill:none;stroke:#4ade80;stroke-width:1.9}.hosp-v2-meta{display:flex;gap:8px 14px;flex-wrap:wrap;margin-top:11px;color:#b6c9c0;font-size:11.5px}.hosp-v2-paycond{margin-top:8px;font-size:11.5px;color:#d3e5dc}
    .hosp-v2-hotel{font-weight:850;color:#effff5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hosp-v2-status{display:inline-flex;align-items:center;gap:6px;margin-top:9px;padding:5px 9px;border-radius:999px;border:1px solid rgba(74,222,128,.22);background:rgba(22,101,52,.22);color:#a7f3c0;font-size:10px;font-weight:950;text-transform:uppercase}.hosp-v2-status.quote{color:#fde68a;background:rgba(146,89,5,.17);border-color:rgba(245,158,11,.32)}.hosp-v2-status.finance{color:#ddd6fe;background:rgba(91,33,182,.18);border-color:rgba(167,139,250,.3)}.hosp-v2-status.paid{color:#bbf7d0;background:rgba(22,101,52,.28)}.hosp-v2-note{display:flex;gap:7px;align-items:center;color:#5ef497;font-size:10.5px;font-weight:850;margin-top:8px}.hosp-v2-note svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2}
    .hosp-v2-actions{display:grid;grid-template-columns:repeat(4,minmax(46px,1fr));gap:7px;align-content:center}.hosp-v2-btn{min-height:42px;border:1px solid rgba(74,222,128,.25);background:rgba(2,18,13,.8);color:#bfffd2;border-radius:11px;display:flex;flex-direction:column;gap:3px;align-items:center;justify-content:center;cursor:pointer;font-size:9.5px;font-weight:850;line-height:1.05;padding:5px;transition:.12s ease}.hosp-v2-btn:hover{transform:translateY(-1px);background:rgba(12,55,38,.8);border-color:rgba(74,222,128,.55)}.hosp-v2-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.85;stroke-linecap:round;stroke-linejoin:round}.hosp-v2-btn.amber{color:#fbbf24;border-color:rgba(245,158,11,.4);background:rgba(120,71,5,.12)}.hosp-v2-btn.purple{color:#c4b5fd;border-color:rgba(167,139,250,.38);background:rgba(76,29,149,.12)}.hosp-v2-btn.blue{color:#7dd3fc;border-color:rgba(56,189,248,.35);background:rgba(3,105,161,.1)}.hosp-v2-btn.red{color:#fca5a5;border-color:rgba(248,113,113,.4);background:rgba(127,29,29,.16)}.hosp-v2-btn:disabled{opacity:.35;cursor:not-allowed;transform:none}.hosp-v2-btn.wide{grid-column:span 2;flex-direction:row;gap:7px;font-size:10px}
    .hosp-v2-empty{padding:34px;border:1px dashed rgba(74,222,128,.22);border-radius:15px;text-align:center;color:#8aa49a;background:rgba(3,20,15,.45)}
    .hosp-v2-stage-head,.hosp-v2-stage-row{display:grid;grid-template-columns:minmax(185px,1.15fr) minmax(135px,.8fr) minmax(170px,.9fr) minmax(260px,1.5fr) minmax(120px,.7fr) minmax(190px,.9fr);min-width:1060px}.hosp-v2-stage-head{padding:0 11px;color:#91a89e;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.hosp-v2-stage-head span{padding:7px 10px}.hosp-v2-stage-row{position:relative;overflow:hidden;border:1px solid rgba(34,197,94,.28);border-radius:12px;background:linear-gradient(100deg,rgba(5,27,20,.98),rgba(2,16,12,.98));box-shadow:0 8px 24px rgba(0,0,0,.16);transition:.16s ease}.hosp-v2-stage-row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#4ade80}.hosp-v2-stage-row:hover,.hosp-v2-stage-row.is-selected{border-color:rgba(74,222,128,.68);transform:translateY(-1px)}.hosp-v2-stage-row.is-selected{background:linear-gradient(100deg,rgba(10,53,35,.98),rgba(3,25,18,.98));box-shadow:0 0 0 1px rgba(74,222,128,.16),0 10px 28px rgba(0,0,0,.2)}.hosp-v2-stage-cell{display:flex;flex-direction:column;justify-content:center;min-width:0;padding:12px 14px;color:#d8eee3;font-size:11.5px}.hosp-v2-stage-cell strong{color:#f1fff7;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hosp-v2-stage-cell small{margin-top:4px;color:#88a298;font-size:10.5px}.hosp-v2-stage-cell.people{white-space:normal;line-height:1.4}.hosp-v2-team-list{display:grid;gap:4px;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}.hosp-v2-team-list span{display:block;padding-left:10px;position:relative}.hosp-v2-team-list span::before{content:"";position:absolute;left:0;top:.55em;width:4px;height:4px;border-radius:50%;background:#4ade80}.hosp-v2-stage-cell.value strong{color:#86efac;font-size:13px}.hosp-v2-stage-hotel{display:grid;grid-template-columns:18px minmax(0,1fr);gap:9px;align-items:center;cursor:pointer}.hosp-v2-stage-hotel input{width:17px;height:17px;margin:0;accent-color:#4ade80}.hosp-v2-stage-hotel span{min-width:0;color:#f1fff7;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hosp-v2-stage-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.hosp-v2-stage-actions .hosp-v2-btn{min-height:38px;flex-direction:row;font-size:9.5px}.hosp-v2-stage-actions .hosp-v2-btn svg{width:15px;height:15px}
    .hosp-v2-drawer{position:fixed;z-index:9997;top:0;right:0;width:min(430px,96vw);height:100vh;background:linear-gradient(180deg,#041711,#020d0a);border-left:1px solid rgba(74,222,128,.38);box-shadow:-24px 0 60px rgba(0,0,0,.42);transform:translateX(102%);transition:transform .2s ease;overflow:auto;padding:18px}.hosp-v2-drawer.open{transform:none}.hosp-v2-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid rgba(74,222,128,.18)}.hosp-v2-drawer-head h3{margin:0;color:#f2fff7}.hosp-v2-drawer-close{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#d1e3da;cursor:pointer}.hosp-v2-drawer-body{display:grid;gap:12px;padding:14px 0}.hosp-v2-detail-box{border:1px solid rgba(74,222,128,.2);border-radius:14px;background:rgba(6,31,23,.55);padding:13px}.hosp-v2-detail-box h4{margin:0 0 10px;color:#f3fff8;font-size:13px}.hosp-v2-detail-grid{display:grid;grid-template-columns:1fr auto;gap:8px 12px;color:#a9beb4;font-size:11.5px}.hosp-v2-detail-grid strong{color:#effff5;text-align:right}.hosp-v2-total{color:#5df294!important;font-size:15px}.hosp-v2-doc{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 10px;border:1px solid rgba(74,222,128,.15);border-radius:11px;margin-top:7px}.hosp-v2-doc a{color:#d9fff0;text-decoration:none;font-weight:800;font-size:11.5px}.hosp-v2-doc small{display:block;color:#7f9a8e;margin-top:2px}.hosp-v2-quote{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid rgba(74,222,128,.12)}.hosp-v2-quote:last-child{border-bottom:0}.hosp-v2-quote strong{font-size:11.5px;color:#eafff2}.hosp-v2-quote small{display:block;color:#819a8f;margin-top:2px}.hosp-v2-linkbtn{border:1px solid rgba(74,222,128,.28);background:rgba(22,101,52,.18);color:#afffc6;border-radius:9px;padding:7px 9px;font-size:10px;font-weight:850;cursor:pointer}.hosp-v2-drawer-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.hosp-v2-drawer-actions button{min-height:42px;border-radius:11px;font-weight:900;font-size:11px;cursor:pointer}.hosp-v2-paylocal{border:1px solid rgba(245,158,11,.5);background:linear-gradient(180deg,rgba(180,83,9,.65),rgba(120,53,15,.65));color:#fff7ed}.hosp-v2-payfinance{border:1px solid rgba(167,139,250,.45);background:rgba(76,29,149,.32);color:#ede9fe}
    .hosp-v2-timeline{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;align-items:start}.hosp-v2-step{text-align:center;color:#748e82;font-size:8.5px;position:relative}.hosp-v2-step::before{content:"";position:absolute;top:12px;left:-50%;right:50%;height:1px;background:rgba(74,222,128,.22)}.hosp-v2-step:first-child::before{display:none}.hosp-v2-step i{position:relative;z-index:1;width:25px;height:25px;border-radius:50%;display:grid;place-items:center;margin:0 auto 5px;background:#09261a;border:1px solid rgba(74,222,128,.28);color:#4ade80;font-style:normal}.hosp-v2-step.done{color:#b9d1c5}.hosp-v2-step.done i{background:#0b4b2c;border-color:#4ade80;color:#caffd8}.hosp-v2-step.active i{box-shadow:0 0 0 4px rgba(74,222,128,.12)}
    .hosp-v2-modal{position:fixed;z-index:10010;inset:0;display:none;place-items:center;padding:16px;background:rgba(0,8,5,.82);backdrop-filter:blur(5px)}.hosp-v2-modal.open{display:grid}.hosp-v2-modal-card{width:min(720px,100%);max-height:92vh;overflow:auto;background:#041a12;border:1px solid rgba(74,222,128,.35);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.55);padding:18px}.hosp-v2-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.hosp-v2-modal-head h3{margin:0;color:#f0fff6}.hosp-v2-modal-head p{margin:4px 0 0;color:#86a095;font-size:12px}.hosp-v2-modal-close{border:1px solid rgba(255,255,255,.12);background:transparent;color:#e5f5ed;border-radius:9px;padding:8px 11px;cursor:pointer}.hosp-v2-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:14px}.hosp-v2-field{display:grid;gap:6px}.hosp-v2-field.full{grid-column:1/-1}.hosp-v2-field label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#91aa9f;font-weight:900}.hosp-v2-field input,.hosp-v2-field select,.hosp-v2-field textarea{width:100%;box-sizing:border-box;background:#071f17;border:1px solid rgba(74,222,128,.2);color:#eafff2;border-radius:11px;padding:10px 11px;outline:none;color-scheme:dark}.hosp-v2-field textarea{min-height:82px;resize:vertical}.hosp-v2-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.hosp-v2-primary{border:1px solid rgba(74,222,128,.5);background:rgba(22,101,52,.5);color:#d8ffe4;border-radius:10px;padding:10px 15px;font-weight:900;cursor:pointer}.hosp-v2-secondary{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#d9ebe2;border-radius:10px;padding:10px 15px;font-weight:850;cursor:pointer}.hosp-v2-feedback{font-size:11.5px;color:#9bb0a6;margin-right:auto;align-self:center}.hosp-v2-feedback.ok{color:#72f3a0}.hosp-v2-feedback.err{color:#fca5a5}.hosp-v2-mini-list{display:grid;gap:7px;margin-top:12px}.hosp-v2-mini-item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px;border:1px solid rgba(74,222,128,.16);border-radius:11px;background:rgba(2,16,12,.5)}.hosp-v2-mini-item strong{color:#eafff2;font-size:11.5px}.hosp-v2-mini-item small{display:block;color:#81998e;margin-top:2px}.hosp-v2-mini-item button{border:1px solid rgba(248,113,113,.25);background:rgba(127,29,29,.18);color:#fecaca;border-radius:8px;padding:6px 8px;cursor:pointer}
    @media(max-width:1280px){.hosp-v2-kpis{grid-template-columns:repeat(3,1fr)}.hosp-v2-row:not(.hosp-v2-request-row){grid-template-columns:minmax(180px,.8fr) minmax(300px,1.5fr) minmax(180px,.8fr)}.hosp-v2-row:not(.hosp-v2-request-row) .hosp-v2-cell.actions{grid-column:1/-1;border-top:1px solid rgba(74,222,128,.11);border-right:0}.hosp-v2-row:not(.hosp-v2-request-row) .hosp-v2-actions{grid-template-columns:repeat(7,minmax(70px,1fr))}}
    @media(max-width:820px){.hosp-v2-kpis{grid-template-columns:1fr 1fr}.hosp-v2-row{grid-template-columns:1fr}.hosp-v2-cell{border-right:0;border-bottom:1px solid rgba(74,222,128,.1)}.hosp-v2-actions{grid-template-columns:repeat(4,1fr)}.hosp-v2-form{grid-template-columns:1fr}.hosp-v2-field.full{grid-column:auto}}
    #andamentoFiltros{display:none!important}.hosp-v2-stage-filterbar{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:9px;margin:0 0 10px;padding:11px;border:1px solid rgba(34,197,94,.2);border-radius:12px;background:#07151d}.hosp-v2-stage-filterbar label{display:grid;gap:5px;color:#91a89e;font-size:9.5px;font-weight:900;text-transform:uppercase}.hosp-v2-stage-filterbar select{padding:9px;border:1px solid rgba(74,222,128,.2);border-radius:9px;background:#061d15;color:#eafff2}.hosp-v2-stage-head,.hosp-v2-stage-row{grid-template-columns:minmax(175px,1.05fr) minmax(120px,.68fr) minmax(145px,.78fr) minmax(220px,1.25fr) minmax(150px,.82fr) minmax(105px,.58fr) 44px 44px minmax(170px,.9fr);min-width:1230px}.hosp-v2-mass-check{display:flex;align-items:center;gap:7px}.hosp-v2-mass-check input{width:16px;height:16px;accent-color:#4ade80}.hosp-v2-dot-status{display:inline-flex;align-items:center;gap:7px;font-size:10.5px;font-weight:850}.hosp-v2-dot-status::before{content:"";width:9px;height:9px;border-radius:50%;background:#facc15}.hosp-v2-dot-status.paid::before{background:#4ade80}.hosp-v2-dot-status.partial::before{background:#38bdf8}
  `;
  document.head.appendChild(style);
}

function bucket(row) {
  const fin = String(row.status_financeiro || 'NAO_INICIADO').toUpperCase();
  const nf = String(row.status_nota || 'NAO_SOLICITADA').toUpperCase();
  const hosp = String(row.status_hospedagem || '').toUpperCase();
  const sol = String(row.status_solicitacao || '').toUpperCase();
  const docs = getDocuments(row);
  const hasProof = docs.some((d) => String(d.tipo).toUpperCase() === 'COMPROVANTE');
  const hasNf = docs.some((d) => String(d.tipo).toUpperCase() === 'NFSE');
  if ((fin === 'PAGO' || sol === 'CONCLUIDA') && hasProof && hasNf) return 'concluidos';
  if (fin === 'PAGO') return 'nf';
  if (sol === 'CANCELADA') return 'cancelada';
  if (fin === 'ENVIADO_AO_FINANCEIRO' || row.pendencia_financeira || row.pendencia_nf) return 'pagar';
  if (row.checkout_hoje || row.checkout_vencido || ['CHECKOUT_HOJE', 'RENOVACAO_NECESSARIA', 'CHECKOUT_REALIZADO'].includes(hosp)) return 'pagar';
  if (sol === 'RESERVADA' || ['CHECKIN_PREVISTO', 'HOSPEDADO'].includes(hosp)) return 'reservados';
  return 'solicitadas';
}

function getPeople(row) { return state.collaborators.get(String(row.solicitacao_id || '')) || []; }
function getQuotes(row) { return state.quotes.filter((q) => String(q.solicitacao_id) === String(row.solicitacao_id)); }
function getExtras(row) { return state.extras.filter((e) => String(e.solicitacao_id || '') === String(row.solicitacao_id) || (row.reserva_id && String(e.reserva_id || '') === String(row.reserva_id))); }
function getDocuments(row) { return state.documents.filter((d) => String(d.solicitacao_id || '') === String(row.solicitacao_id) || (row.reserva_id && String(d.reserva_id || '') === String(row.reserva_id))); }
function getHotel(row) { return state.hotels.find((h) => String(h.id) === String(row.hotel_id)) || null; }
function roomsLabel(row) { return row.composicao_quartos || row.tipo_quarto || row.quartos || row.observacao_quartos || 'A definir'; }
function stayTotal(row) {
  const daily = Number(row.valor_diaria || row.valor_diaria_padrao || 0);
  const nights = Number(row.quantidade_diarias || row.quantidade_diarias_prevista || 1);
  const rooms = Number(row.quantidade_quartos || 1);
  const base = Number(row.valor_total_previsto || daily * nights * rooms || 0);
  const extraTotal = getExtras(row).reduce((sum, e) => sum + (String(e.tipo).toUpperCase() === 'DESCONTO' ? -1 : 1) * Number(e.valor_total ?? Number(e.quantidade || 1) * Number(e.valor_unitario || 0)), 0);
  return Number(row.valor_financeiro || base + extraTotal || 0);
}
function paymentCondition(row) {
  const selectedQuote = getQuotes(row).find((q) => q.selecionada) || getQuotes(row).find((q) => String(q.hotel_id) === String(row.hotel_id));
  const hotel = getHotel(row);
  if (selectedQuote?.aceita_pagamento_checkout === true) return 'Pagamento no checkout: Sim';
  if (selectedQuote?.aceita_pagamento_checkout === false) return 'Pagamento no checkout: Não';
  if (hotel?.aceita_pagamento_checkout === true) return 'Pagamento no checkout: Sim';
  if (hotel?.aceita_pagamento_checkout === false) return 'Pagamento no checkout: Não';
  return 'Condição de pagamento a confirmar';
}
function statusMeta(row) {
  const b = bucket(row);
  if (String(row.status_financeiro).toUpperCase() === 'PAGO') return { label: 'PAGO', cls: 'paid' };
  if (b === 'financeiro') return { label: 'ENVIADO AO FINANCEIRO', cls: 'finance' };
  if (b === 'solicitadas' && String(row.status_solicitacao).toUpperCase() === 'EM_COTACAO') return { label: 'EM COTAÇÃO', cls: 'quote' };
  if (String(row.status_hospedagem).toUpperCase() === 'HOSPEDADO') return { label: 'HOSPEDADO', cls: '' };
  if (b === 'reservados') return { label: 'RESERVADO', cls: '' };
  if (b === 'checkout') return { label: 'CHECK-OUT / PAGAMENTO', cls: 'quote' };
  if (b === 'concluidos') return { label: 'CONCLUÍDO', cls: 'paid' };
  return { label: String(row.status_solicitacao || 'SOLICITADO').replaceAll('_', ' '), cls: 'quote' };
}

function mountShell() {
  if (state.mounted || !$('.adm-hosp-tabs')) return;
  state.mounted = true;
  injectStyles();
  const tabs = $('.adm-hosp-tabs');
  const title = $('#pageTitle');
  if (title) title.textContent = 'Hotéis';
  const kpis = document.createElement('section');
  kpis.className = 'hosp-v2-kpis';
  kpis.id = 'hospV2Kpis';
  tabs.parentElement.insertBefore(kpis, tabs);
  const refresh = $('#refreshPainel');
  if (refresh) tabs.appendChild(refresh);
  [['tab-solicitadas', 'hospV2Solicitadas'], ['tab-andamento', 'hospV2Andamento'], ['tab-pagar', 'hospV2Pagar']].forEach(([tabId, listId]) => {
    const panel = document.getElementById(tabId);
    const card = panel?.querySelector('.card');
    const table = panel?.querySelector('.adm-hosp-table-wrap');
    if (!card || !table) return;
    table.classList.add('hosp-v2-hide-base');
    const list = document.createElement('div');
    list.id = listId;
    list.className = 'hosp-v2-list';
    if (tabId === 'tab-pagar') {
      const summary = document.createElement('section');
      summary.id = 'hospV2PaymentSummary';
      summary.className = 'hosp-v2-pay-summary';
      card.appendChild(summary);
    }
    card.appendChild(list);
  });
  const andamentoList=$('#hospV2Andamento');
  if(andamentoList) andamentoList.insertAdjacentHTML('beforebegin','<div class="hosp-v2-stage-filterbar" id="hospV2StageFilters"></div>');
  document.body.insertAdjacentHTML('beforeend', drawerHtml() + modalsHtml());
  bindEvents();
  observeBaseChanges();
  // Sinal explícito disparado por adm-hotel.js ao fim de loadRows() (reservar,
  // checkout, pagamento, cancelar, estender...): pula o throttle de 4s do
  // observeBaseChanges() pra não deixar Solicitações/Em Andamento mostrando
  // dado velho logo depois de uma ação salvar com sucesso.
  document.addEventListener('hospedagem:baseAtualizada', () => { if (!state.loading) loadData(); });
}

function drawerHtml() {
  return `<aside class="hosp-v2-drawer" id="hospV2Drawer"><div class="hosp-v2-drawer-head"><div><small style="color:#6f8e80;font-weight:900;text-transform:uppercase">Hospedagem</small><h3 id="hospV2DrawerTitle">Detalhes</h3></div><button type="button" class="hosp-v2-drawer-close" data-v2-close-drawer>✕</button></div><div class="hosp-v2-drawer-body" id="hospV2DrawerBody"></div></aside>`;
}
function modalsHtml() {
  return `<div class="hosp-v2-modal" id="hospV2QuoteModal"><div class="hosp-v2-modal-card"><div class="hosp-v2-modal-head"><div><h3>Solicitar cotação</h3><p id="hospV2QuoteSub"></p></div><button type="button" class="hosp-v2-modal-close" data-v2-close="hospV2QuoteModal">Fechar</button></div><div id="hospV2QuoteHotels" class="hosp-v2-mini-list"></div><div class="hosp-v2-field full" style="margin-top:12px"><label>Mensagem que será enviada</label><textarea id="hospV2QuoteMessage"></textarea></div><div class="hosp-v2-modal-actions"><span id="hospV2QuoteFeedback" class="hosp-v2-feedback"></span><button class="hosp-v2-secondary" type="button" data-v2-close="hospV2QuoteModal">Cancelar</button><button class="hosp-v2-primary" type="button" id="hospV2SendQuote">Enviar para os hotéis</button></div></div></div>
  <div class="hosp-v2-modal" id="hospV2ExtraModal"><div class="hosp-v2-modal-card"><div class="hosp-v2-modal-head"><div><h3>Custos adicionais</h3><p id="hospV2ExtraSub"></p></div><button type="button" class="hosp-v2-modal-close" data-v2-close="hospV2ExtraModal">Fechar</button></div><div id="hospV2ExtraList" class="hosp-v2-mini-list"></div><div class="hosp-v2-form"><div class="hosp-v2-field"><label>Categoria</label><select id="hospV2ExtraType"><option>ALIMENTACAO</option><option>FRIGOBAR</option><option>LAVANDERIA</option><option>ESTACIONAMENTO</option><option>DIARIA_ADICIONAL</option><option>QUARTO_ADICIONAL</option><option>TAXA</option><option>DANOS</option><option>DESCONTO</option><option>OUTROS</option></select></div><div class="hosp-v2-field"><label>Item</label><input id="hospV2ExtraDescription" /></div><div class="hosp-v2-field"><label>Quantidade</label><input id="hospV2ExtraQty" type="number" min="0.01" step="0.01" value="1" /></div><div class="hosp-v2-field"><label>Valor unitário</label><input id="hospV2ExtraUnit" type="number" min="0" step="0.01" /></div><label class="hosp-v2-field full" style="display:flex;grid-template-columns:auto 1fr;align-items:center"><input id="hospV2ExtraConference" type="checkbox" style="width:17px"><span>Enviar para conferência</span></label></div><div class="hosp-v2-modal-actions"><span id="hospV2ExtraFeedback" class="hosp-v2-feedback"></span><button class="hosp-v2-primary" type="button" id="hospV2SaveExtra">Adicionar custo</button></div></div></div>
  <div class="hosp-v2-modal" id="hospV2DocumentModal"><div class="hosp-v2-modal-card"><div class="hosp-v2-modal-head"><div><h3>Documentos da hospedagem</h3><p id="hospV2DocumentSub"></p></div><button type="button" class="hosp-v2-modal-close" data-v2-close="hospV2DocumentModal">Fechar</button></div><div id="hospV2DocumentList" class="hosp-v2-mini-list"></div><div class="hosp-v2-form"><div class="hosp-v2-field"><label>Tipo</label><select id="hospV2DocumentType"><option value="COMPROVANTE">Comprovante de pagamento</option><option value="NFSE">NFS-e</option><option value="COTACAO">Cotação</option><option value="OUTRO">Outro</option></select></div><div class="hosp-v2-field"><label>Arquivo</label><input id="hospV2DocumentFile" type="file" accept="application/pdf,image/*" /></div><div class="hosp-v2-field full"><label>Ou URL HTTPS</label><input id="hospV2DocumentUrl" placeholder="https://..." /></div><label class="hosp-v2-field full" style="display:flex;grid-template-columns:auto 1fr;align-items:center"><input id="hospV2DocumentAutoSend" type="checkbox" checked style="width:17px"><span>Enviar automaticamente ao hotel quando for comprovante</span></label></div><div class="hosp-v2-modal-actions"><span id="hospV2DocumentFeedback" class="hosp-v2-feedback"></span><button class="hosp-v2-primary" type="button" id="hospV2SaveDocument">Anexar documento</button></div></div></div>`;
}

function setFeedback(id, message, type = '') { const el = document.getElementById(id); if (!el) return; el.textContent = message || ''; el.className = `hosp-v2-feedback ${type}`; }
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const close = event.target.closest('[data-v2-close]');
    if (close) { closeModal(close.dataset.v2Close); return; }
    if (event.target.closest('[data-v2-close-drawer]')) { $('#hospV2Drawer')?.classList.remove('open'); return; }
    const tabShortcut = event.target.closest('[data-v2-tab]');
    if (tabShortcut) { document.querySelector(`.adm-hosp-tab[data-tab="${tabShortcut.dataset.v2Tab}"]`)?.click(); return; }
    const statusFilter = event.target.closest('[data-v2-status-filter]');
    if (statusFilter) {
      if (statusFilter.dataset.v2FilterScope === 'requests') state.requestStatus = statusFilter.dataset.v2StatusFilter;
      renderAll(); return;
    }
    const sort = event.target.closest('[data-v2-sort]');
    if (sort) {
      const field = sort.dataset.v2Sort;
      state.requestSort.direction = state.requestSort.field === field && state.requestSort.direction === 'asc' ? 'desc' : 'asc';
      state.requestSort.field = field;
      const select = $('#solOrdenar');
      if (select && [...select.options].some((option) => option.value === field)) select.value = field;
      const direction = $('#solDirecao');
      if (direction) { direction.textContent = state.requestSort.direction === 'asc' ? '↑' : '↓'; direction.title = state.requestSort.direction === 'asc' ? 'Ordem crescente' : 'Ordem decrescente'; }
      renderAll();
      return;
    }
    const stageSort = event.target.closest('[data-v2-stage-sort]');
    if (stageSort) {
      const stage=stageSort.dataset.v2Stage;
      const field=stageSort.dataset.v2StageSort;
      const current=state.stageSort[stage]||{field:'data',direction:'asc'};
      state.stageSort[stage]={field,direction:current.field===field&&current.direction==='asc'?'desc':'asc'};
      renderAll(); return;
    }
    const selector = event.target.closest('[data-v2-select]');
    if (selector) {
      selector.checked ? state.selectedRequests.add(selector.value) : state.selectedRequests.delete(selector.value);
      renderAll(); return;
    }
    const selectAll=event.target.closest('[data-v2-select-all]');
    if(selectAll){const rows=selectAll.dataset.stage==='andamento'?filteredStageRows(state.rows.filter((r)=>bucket(r)==='reservados')):state.rows.filter((r)=>bucket(r)===selectAll.dataset.stage);rows.forEach((r)=>selectAll.checked?state.selectedRequests.add(String(r.solicitacao_id)):state.selectedRequests.delete(String(r.solicitacao_id)));renderAll();return;}
    const action = event.target.closest('[data-v2-action]');
    if (!action) return;
    const row = state.rows.find((r) => String(r.solicitacao_id) === String(action.dataset.id));
    if (!row) return;
    const selectedRows=state.rows.filter((r)=>state.selectedRequests.has(String(r.solicitacao_id)));
    const actionGroupIds=(action.dataset.groupIds||'').split(',').filter(Boolean);
    const actionGroup=state.rows.filter((item)=>actionGroupIds.includes(String(item.solicitacao_id)));
    const targets=actionGroup.length?actionGroup:(state.selectedRequests.has(String(row.solicitacao_id))&&selectedRows.length?selectedRows:[row]);
    state.selectedId = row.solicitacao_id;
    if (action.dataset.v2Action === 'detail') openDetails(row);
    else if (action.dataset.v2Action === 'quote') { setGroupedRequests(action,row); openQuoteModal(row); }
    else if (action.dataset.v2Action === 'extra') {window.__hospedagemAcaoLote=targets.map((r)=>r.solicitacao_id);openExtraModal(row);}
    else if (action.dataset.v2Action === 'document') { window.__hospedagemAcaoLote=targets.map((item)=>item.solicitacao_id); openDocumentModal(row); }
    else if (action.dataset.v2Action === 'reserve') {
      const selected = setGroupedRequests(action,row);
      window.__hospedagemSolicitacoesAgrupadas = selected.map((item) => item.solicitacao_id);
      triggerBaseAction('reservar', row);
    }
    else if (action.dataset.v2Action === 'extend') {
      const reservation=state.rows.find((item)=>String(item.reserva_id)===String(action.dataset.reservaId));
      window.__hospedagemExtensaoSolicitacoes=(action.dataset.groupIds||String(row.solicitacao_id)).split(',');
      triggerBaseAction('estender', reservation||row);
    }
    else if (action.dataset.v2Action === 'payment' || action.dataset.v2Action === 'finance') triggerBaseAction('enviar-pagamento', row);
    else if (action.dataset.v2Action === 'pay-local') {window.__hospedagemAcaoLote=targets.map((r)=>r.solicitacao_id);openLocalPayment(row);}
    else if (action.dataset.v2Action === 'checkout') { window.__hospedagemAcaoLote=targets.map((item)=>item.solicitacao_id); triggerBaseAction('enviar-pagamento',row); }
    else if (action.dataset.v2Action === 'quote-edit') await editQuote(action.dataset.quoteId, row);
    else if (action.dataset.v2Action === 'cancel') {
      const ids=(action.dataset.groupIds||String(row.solicitacao_id)).split(',').filter(Boolean);
      if (window.confirm(`Recusar ${ids.length} solicitação(ões) deste grupo?`)) {
        await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'CANCELADA' }).in('id', ids);
        await loadData();
      }
    }
  });
  $('#hospV2SendQuote')?.addEventListener('click', sendQuoteBatch);
  $('#hospV2SaveExtra')?.addEventListener('click', saveExtra);
  $('#hospV2SaveDocument')?.addEventListener('click', saveDocument);
  ['solFiltroColaborador','solFiltroCidade','solFiltroSupervisao','solFiltroData'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input',() => queueMicrotask(renderAll));
    document.getElementById(id)?.addEventListener('change',() => queueMicrotask(renderAll));
  });
  $('#solOrdenar')?.addEventListener('change',(event) => { state.requestSort.field = event.target.value; queueMicrotask(renderAll); });
  $('#solDirecao')?.addEventListener('click',() => queueMicrotask(() => { state.requestSort.direction = $('#solDirecao')?.textContent?.trim() === '↑' ? 'asc' : 'desc'; renderAll(); }));
  $('#solLimparFiltros')?.addEventListener('click',() => queueMicrotask(() => { state.requestSort = { field:'data', direction:'desc' }; renderAll(); }));
  document.addEventListener('change',(event)=>{const field=event.target?.dataset?.stageFilter;if(field){state.stageFilters[field]=event.target.value;renderAll();}});
  document.addEventListener('keydown',(event)=>{const shortcut=event.target?.closest?.('[data-v2-tab]');if(shortcut&&['Enter',' '].includes(event.key)){event.preventDefault();shortcut.click();}});
}

function observeBaseChanges() {
  let timer;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => { if (!state.loading && Date.now() - state.lastLoad > 4000) loadData(); }, 350); });
  ['tbodySolicitadas', 'tbodyAndamento', 'tbodyConcluidos'].forEach((id) => { const el = document.getElementById(id); if (el) observer.observe(el, { childList: true, subtree: true }); });
}
async function loadOptional(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    if (/does not exist|schema cache|Could not find/i.test(error.message || '')) return { data: [], missing: true };
    console.warn(`[hosp-v2] ${table}:`, error.message); return { data: [], missing: false };
  }
  return { data: data || [], missing: false };
}
async function loadData() {
  if (state.loading || !state.mounted) return;
  state.loading = true;
  try {
    const [rowsRes, hotelsRes, peopleRes, requestersRes, quotesRes, extrasRes, docsRes] = await Promise.all([
      supabase.from('hospedagem_painel_geral').select('*').order('data_solicitacao', { ascending: false }),
      supabase.from('hospedagem_hoteis').select('*').order('cidade', { ascending: true }).order('nome', { ascending: true }),
      supabase.from('hospedagem_solicitacao_colaboradores').select('*'),
      supabase.from('hospedagem_solicitacoes').select('id,solicitante_nome'),
      loadOptional('hospedagem_cotacoes'), loadOptional('hospedagem_custos_extras'), loadOptional('hospedagem_documentos'),
    ]);
    if (rowsRes.error) throw rowsRes.error;
    state.rows = rowsRes.data || []; state.hotels = hotelsRes.data || []; state.quotes = quotesRes.data || []; state.extras = extrasRes.data || []; state.documents = docsRes.data || [];
    state.tables.quotes = !quotesRes.missing; state.tables.extras = !extrasRes.missing; state.tables.documents = !docsRes.missing;
    state.collaborators.clear();
    state.requesters.clear();
    (requestersRes.data||[]).forEach((item)=>state.requesters.set(String(item.id),item.solicitante_nome||''));
    (peopleRes.data || []).forEach((person) => { const key = String(person.solicitacao_id || ''); if (!state.collaborators.has(key)) state.collaborators.set(key, []); state.collaborators.get(key).push(person); });
    renderAll();
  } catch (error) { console.error('[hosp-v2] loadData', error); } finally { state.loading = false; state.lastLoad = Date.now(); }
}

function requestStage(row) {
  const sol = String(row.status_solicitacao || '').toUpperCase(), b = bucket(row);
  if (sol === 'EM_COTACAO' || getQuotes(row).length) return 'cotadas';
  if (b === 'reservados') return String(row.status_hospedagem || '').toUpperCase() === 'HOSPEDADO' ? 'ativas' : 'reservadas';
  if (['pagar','nf','concluidos'].includes(b)) return 'ativas';
  return 'pendentes';
}
function renderFilterBar(id, scope, options, active) {
  const root = document.getElementById(id); if (!root) return;
  root.innerHTML = options.map(([value,label,count]) => `<button type="button" class="hosp-v2-filter${active===value?' active':''}" data-v2-filter-scope="${scope}" data-v2-status-filter="${value}">${esc(label)} <b>${count}</b></button>`).join('');
}
function renderRequestFilters() {
  const rows = state.rows.filter((row) => bucket(row) !== 'cancelada'), count = (stage) => rows.filter((row) => requestStage(row) === stage).length;
  renderFilterBar('hospV2RequestFilters','requests',[['todas','Todas',rows.length],['pendentes','Pendentes',count('pendentes')],['cotadas','Cotadas',count('cotadas')],['reservadas','Reservadas',count('reservadas')],['ativas','Ativas',count('ativas')]],state.requestStatus);
}
function reservationRows() { return state.rows.filter((row) => row.reserva_id && bucket(row) !== 'cancelada'); }
function renderPaymentSummary() {
  const rows=state.rows.filter((row)=>row.reserva_id), total=(items)=>items.reduce((sum,row)=>sum+Number(row.valor_financeiro||row.valor_total_previsto||0),0);
  const paid=total(rows.filter((row)=>String(row.status_financeiro||'').toUpperCase()==='PAGO'));
  const finance=total(rows.filter((row)=>String(row.status_financeiro||'').toUpperCase()==='ENVIADO_AO_FINANCEIRO'));
  const pending=total(rows.filter((row)=>!['PAGO','SEM_COBRANCA'].includes(String(row.status_financeiro||'').toUpperCase())));
  const root=$('#hospV2PaymentSummary'); if(!root)return;
  root.innerHTML=`<article class="hosp-v2-pay-metric"><small>Total pago</small><strong>${money(paid)}</strong></article><article class="hosp-v2-pay-metric finance"><small>Enviado ao Financeiro</small><strong>${money(finance)}</strong></article><article class="hosp-v2-pay-metric pending"><small>Pendente de quitação</small><strong>${money(pending)}</strong></article>`;
}
function renderAll() {
  renderKpis();
  renderRequestFilters();
  renderPaymentSummary();
  renderList('hospV2Solicitadas', groupRequestedRows(filteredRequestedRows()), true);
  const andamento=filteredStageRows(reservationRows());
  renderStageFilters(andamento);
  renderList('hospV2Andamento', sortedStageRows(andamento,'andamento'), false, 'andamento');
  renderList('hospV2Pagar', groupPaymentRows(sortedStageRows(state.rows.filter((r) => bucket(r) === 'pagar'),'pagar')), false, 'pagar');
  if (state.selectedId) { const selected = state.rows.find((r) => String(r.solicitacao_id) === String(state.selectedId)); if (selected && $('#hospV2Drawer')?.classList.contains('open')) renderDetails(selected); }
}
function setGroupedRequests(action,row){
  const ids=(action.dataset.groupIds||String(row.solicitacao_id)).split(',').filter(Boolean);
  const grouped=state.rows.filter((item)=>ids.includes(String(item.solicitacao_id)));
  window.__hospedagemSolicitacoesAgrupadas=ids;
  state.selectedRequests=new Set(ids);
  return grouped.length?grouped:[row];
}
function groupRequestedRows(rows){
  const groups=new Map();
  rows.forEach((row)=>{
    const pending=bucket(row)==='solicitadas';
    // Cada solicitação só entra no mesmo card se tiver o mesmo destino: a
    // mesma reserva a estender, ou nenhuma (aí é reserva nova). Isso evita
    // misturar num card só quem precisa de Reservar com quem precisa de
    // Estender — o usuário de Hotéis vê os dois separados.
    const alvo=pending?(extensionReservation([row])?.reserva_id||'nova'):'';
    const key=pending?`${norm(row.cidade)}|${norm(row.uf)}|${alvo}`:`single:${row.solicitacao_id}`;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  });
  return [...groups.values()].map((items)=>Object.assign({},items[0],{_groupRows:items,_groupIds:items.map((item)=>item.solicitacao_id)}));
}
function groupPaymentRows(rows){
  const groups=new Map();
  rows.forEach((row)=>{const key=String(row.hotel_id||norm(row.hotel||getHotel(row)?.nome)||row.reserva_id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);});
  return [...groups.values()].map((items)=>Object.assign({},items[0],{_paymentRows:items,_groupIds:items.map((item)=>item.solicitacao_id),valor_financeiro:items.reduce((sum,item)=>sum+stayTotal(item),0)}));
}
function extensionReservation(group){
  const requestPeople=new Set(group.flatMap((row)=>getPeople(row).map((p)=>norm(p.colaborador_id||p.nome_colaborador))));
  const dates=group.map((row)=>String(row.data_checkin||row.data_checkin_prevista||'').slice(0,10)).filter(Boolean).sort();
  return state.rows.find((candidate)=>{
    const candidateUf=norm(candidate.uf), groupUf=norm(group[0]?.uf);
    if(!candidate.reserva_id||bucket(candidate)!=='reservados'||norm(candidate.cidade)!==norm(group[0]?.cidade)||(candidateUf&&groupUf&&candidateUf!==groupUf))return false;
    const candidatePeople=getPeople(candidate).map((p)=>norm(p.colaborador_id||p.nome_colaborador));
    if(!candidatePeople.some((person)=>requestPeople.has(person)))return false;
    const checkout=String(candidate.data_checkout||candidate.data_checkout_prevista||'').slice(0,10);
    if(!checkout||!dates[0])return false;
    const delta=Math.round((new Date(`${dates[0]}T12:00:00`)-new Date(`${checkout}T12:00:00`))/86400000);
    return delta===0||delta===1;
  });
}
function requesterName(row){return state.requesters.get(String(row.solicitacao_id))||row.solicitante_nome||'-';}
function filteredStageRows(rows){const f=state.stageFilters;return rows.filter((row)=>{const people=getPeople(row);return(!f.colaborador||people.some((p)=>String(p.nome_colaborador||'')===f.colaborador))&&(!f.cidade||String(row.cidade||'')===f.cidade)&&(!f.supervisao||people.some((p)=>String(p.supervisao||'')===f.supervisao))&&(!f.hotel||String(row.hotel||getHotel(row)?.nome||'')===f.hotel);});}
function renderStageFilters(visible){const root=$('#hospV2StageFilters');if(!root)return;const all=reservationRows();const choices=(values)=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));const fields={colaborador:choices(all.flatMap((r)=>getPeople(r).map((p)=>p.nome_colaborador))),cidade:choices(all.map((r)=>r.cidade)),supervisao:choices(all.flatMap((r)=>getPeople(r).map((p)=>p.supervisao))),hotel:choices(all.map((r)=>r.hotel||getHotel(r)?.nome))};root.innerHTML=Object.entries(fields).map(([key,values])=>`<label>${key}<select data-stage-filter="${key}"><option value="">Todos</option>${values.map((v)=>`<option value="${esc(v)}" ${state.stageFilters[key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`).join('');root.dataset.visibleIds=visible.map((r)=>r.solicitacao_id).join(',');}
function renderKpis() {
  const counts = { requests: state.rows.filter((r) => bucket(r) === 'solicitadas').length, quotes: state.rows.filter((r) => String(r.status_solicitacao).toUpperCase() === 'EM_COTACAO').length, reserved: state.rows.filter((r) => bucket(r) === 'reservados').length, pay: state.rows.filter((r) => ['checkout', 'financeiro'].includes(bucket(r)) && String(r.status_financeiro).toUpperCase() !== 'PAGO').length, nf: state.rows.filter((r) => !getDocuments(r).some((d) => String(d.tipo).toUpperCase() === 'NFSE') && !['LANCADO', 'DISPENSADO'].includes(String(r.status_nota).toUpperCase())).length };
  const quoteValue = state.quotes.reduce((sum, q) => sum + Number(q.valor_total || 0), 0);
  const reservedValue = state.rows.filter((r) => bucket(r) === 'reservados').reduce((sum, r) => sum + Number(r.valor_financeiro || r.valor_total_previsto || 0), 0);
  const payValue = state.rows.filter((r) => ['checkout', 'financeiro'].includes(bucket(r))).reduce((sum, r) => sum + Number(r.valor_financeiro || r.valor_total_previsto || 0), 0);
  const cards = [['Solicitações', counts.requests, `${state.rows.length} no fluxo`, 'quote', '#4ade80'], ['Em cotação', counts.quotes, quoteValue ? money(quoteValue) : 'Aguardando respostas', 'quote', '#facc15'], ['Reservados', counts.reserved, reservedValue ? money(reservedValue) : 'Reservas ativas', 'reserve', '#4ade80'], ['A pagar', counts.pay, payValue ? money(payValue) : 'Sem saldo calculado', 'pay', '#fb923c'], ['NFS-e pendentes', counts.nf, `${state.documents.filter((d) => String(d.tipo).toUpperCase() === 'NFSE').length} recebidas`, 'file', '#a78bfa']];
  const root = $('#hospV2Kpis'); if (!root) return;
  const destinations=['solicitadas','solicitadas','andamento','pagar'];
  root.innerHTML = cards.map(([label, value, note, ico, color],index) => index===4
    ? `<a class="hosp-v2-kpi" style="--kpi:${color};text-decoration:none" href="notas-fiscais.html"><div class="hosp-v2-kpi-ico">${icon(ico)}</div><div><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div></a>`
    : `<article class="hosp-v2-kpi" style="--kpi:${color}" data-v2-tab="${destinations[index]}" role="button" tabindex="0"><div class="hosp-v2-kpi-ico">${icon(ico)}</div><div><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div></article>`).join('');
}
function requestedValues(row) {
  const people = getPeople(row);
  return {
    colaborador: people.map((p) => p.nome_colaborador).filter(Boolean).join(' ') || row.colaborador || row.colaboradores || '',
    cidade: [row.cidade,row.uf].filter(Boolean).join(' '),
    supervisao: people.map((p) => p.supervisao).filter(Boolean).join(' ') || row.supervisao || '',
    data: String(row.data_solicitacao || '').slice(0,10),
    checkin: String(row.data_checkin || row.data_checkin_prevista || '').slice(0,10),
    hotel: row.hotel || getHotel(row)?.nome || '',
    gestor: requesterName(row),
  };
}
function filteredRequestedRows() {
  const values = {
    colaborador: $('#solFiltroColaborador')?.value || '', cidade: $('#solFiltroCidade')?.value || '',
    supervisao: $('#solFiltroSupervisao')?.value || '', data: $('#solFiltroData')?.value || '',
  };
  const order = state.requestSort.field;
  const direction = state.requestSort.direction === 'asc' ? 1 : -1;
  const rows = state.rows.filter((row) => bucket(row) === 'solicitadas').filter((row) => {
    const item = requestedValues(row);
    return (!values.colaborador || norm(item.colaborador).includes(norm(values.colaborador)))
      && (!values.cidade || norm(item.cidade).includes(norm(values.cidade)))
      && (!values.supervisao || norm(item.supervisao).includes(norm(values.supervisao)))
      && (!values.data || item.data === values.data);
  });
  return rows.sort((a,b) => String(requestedValues(a)[order] || '').localeCompare(String(requestedValues(b)[order] || ''),'pt-BR',{numeric:true,sensitivity:'base'}) * direction);
}
function renderList(id, rows, requested = false, stage = '') {
  const root = document.getElementById(id); if (!root) return;
  if (!rows.length) { root.innerHTML = '<div class="hosp-v2-empty">Nenhuma hospedagem nesta etapa.</div>'; return; }
  const operational = ['andamento','pagar','nf'].includes(stage);
  const visibleIds=rows.map((row)=>String(row.solicitacao_id));const allSelected=visibleIds.length&&visibleIds.every((id)=>state.selectedRequests.has(id));
  const head = requested ? `<div class="hosp-v2-list-head">${sortHeader('cidade','Cidade')}${sortHeader('checkin','Check-in / Diárias')}${sortHeader('colaborador','Colaboradores')}${sortHeader('supervisao','Supervisão')}${sortHeader('gestor','Gestor')}<span class="hosp-v2-list-head-label">Ações</span></div>` : operational ? `<div class="hosp-v2-stage-head"><div class="hosp-v2-mass-check"><input type="checkbox" data-v2-select-all data-stage="${stage}" ${allSelected?'checked':''} aria-label="Selecionar todas as linhas visíveis"><span>${stageSortHeader(stage,'hotel','Hotel')}</span></div>${stageSortHeader(stage,'cidade','Cidade')}${stageSortHeader(stage,'data','Data')}${stageSortHeader(stage,'colaboradores','Colaboradores')}<span>Supervisor</span>${stageSortHeader(stage,'valor','Valor')}<span>$</span><span>NF</span><span>Ações</span></div>` : '';
  root.innerHTML = head + rows.map(requested ? requestedRowHtml : operational ? (row) => operationalRowHtml(row,stage) : (row) => cardHtml(row, stage)).join('');
}

function stageSortHeader(stage,field,label) {
  const current=state.stageSort[stage]||{};
  const active=current.field===field;
  return `<button type="button" class="hosp-v2-sort${active?' is-active':''}" data-v2-stage="${stage}" data-v2-stage-sort="${field}">${label}${active?`<span class="hosp-v2-sort-arrow">${current.direction==='asc'?'↑':'↓'}</span>`:''}</button>`;
}

function sortedStageRows(rows,stage) {
  const current=state.stageSort[stage]||{field:'data',direction:'asc'};
  const direction=current.direction==='asc'?1:-1;
  const value=(row) => {
    if(current.field==='hotel') return row.hotel||getHotel(row)?.nome||'';
    if(current.field==='cidade') return [row.cidade,row.uf].filter(Boolean).join('/');
    if(current.field==='colaboradores') return getPeople(row).map((person) => person.nome_colaborador).join(' ')||row.colaboradores||row.colaborador||'';
    if(current.field==='valor') return Number(row.valor_financeiro||row.valor_total_previsto||0);
    return row.data_checkin||row.data_checkin_prevista||'';
  };
  return [...rows].sort((a,b) => typeof value(a)==='number'?(value(a)-value(b))*direction:String(value(a)).localeCompare(String(value(b)),'pt-BR',{numeric:true,sensitivity:'base'})*direction);
}

function operationalRowHtml(row,stage) {
  const grouped=row._paymentRows||[row];
  const people=grouped.flatMap((item)=>getPeople(item)).map((person) => person.nome_colaborador).filter(Boolean);
  const hotel=row.hotel||getHotel(row)?.nome||'Hotel não informado';
  const city=[row.cidade,row.uf].filter(Boolean).join('/')||'-';
  const checkin=row.data_checkin||row.data_checkin_prevista;
  const checkout=row.data_checkout||row.data_checkout_prevista;
  const value=row.valor_financeiro||row.valor_total_previsto;
  const fin=String(row.status_financeiro||'').toUpperCase();const paid=fin==='PAGO';const partial=fin==='PARCIAL'||Number(row.valor_pago||0)>0;const hasNf=getDocuments(row).some((d)=>String(d.tipo).toUpperCase()==='NFSE');
  const actionAttrs=` data-group-ids="${esc((row._groupIds||[row.solicitacao_id]).join(','))}"`;
  const groupedButton=(action,ico,label,cls='')=>button(action,row,ico,label,cls).replace(' data-id=',`${actionAttrs} data-id=`);
  const actions=stage==='pagar'
    ? `${groupedButton('pay-local','pay','Pagar','amber')}${groupedButton('document','attach','Anexos','purple')}`
    : stage==='nf' ? `${button('document',row,'attach','Anexar NF','purple')}${button('detail',row,'detail','Detalhes')}`
    : `${button('pay-local',row,'pay','Pagar','amber')}${button('checkout',row,'checkout','Checkout','blue')}`;
  const selected=state.selectedRequests.has(String(row.solicitacao_id));
  return `<article class="hosp-v2-stage-row ${selected?'is-selected':''}">
    <div class="hosp-v2-stage-cell"><label class="hosp-v2-stage-hotel"><input type="checkbox" data-v2-select value="${esc(row.solicitacao_id)}" ${selected?'checked':''} aria-label="Selecionar ${esc(hotel)}"><span title="${esc(hotel)}">${esc(hotel)}</span></label></div>
    <div class="hosp-v2-stage-cell"><strong>${esc(city)}</strong></div>
    <div class="hosp-v2-stage-cell"><strong>${brDate(checkin)}</strong><small>até ${brDate(checkout)}</small></div>
    <div class="hosp-v2-stage-cell people"><strong class="hosp-v2-team-list">${people.length?people.map((name)=>`<span>${esc(name)}</span>`).join(''):`<span>${esc(row.colaboradores||row.colaborador||'-')}</span>`}</strong></div>
    <div class="hosp-v2-stage-cell"><strong>${esc([...new Set(grouped.map(requesterName))].join(', '))}</strong></div>
    <div class="hosp-v2-stage-cell value"><strong>${value?money(value):'A confirmar'}</strong></div>
    <div class="hosp-v2-stage-cell" style="align-items:center"><span class="hosp-v2-dot-status ${paid?'paid':partial?'partial':''}" title="${paid?'Pago':partial?'Pagamento parcial':'Pagamento pendente'}" role="img" aria-label="${paid?'Pago':partial?'Pagamento parcial':'Pagamento pendente'}"></span></div>
    <div class="hosp-v2-stage-cell" style="align-items:center"><span class="hosp-v2-dot-status ${hasNf?'paid':''}" title="${hasNf?'NF anexada':'NF pendente'}" role="img" aria-label="${hasNf?'NF anexada':'NF pendente'}"></span></div>
    <div class="hosp-v2-stage-cell"><div class="hosp-v2-stage-actions">${actions}</div></div>
  </article>`;
}
function sortHeader(field,label) {
  const active = state.requestSort.field === field;
  const arrow = active ? `<span class="hosp-v2-sort-arrow" aria-hidden="true">${state.requestSort.direction === 'asc' ? '↑' : '↓'}</span>` : '';
  const ariaSort = active ? (state.requestSort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  return `<button type="button" class="hosp-v2-sort${active?' is-active':''}" data-v2-sort="${field}" aria-sort="${ariaSort}" title="Ordenar por ${esc(label)}">${esc(label)}${arrow}</button>`;
}
function requestedRowHtml(row) {
  const group=row._groupRows||[row];
  const people = group.flatMap((item)=>getPeople(item)), quotes = group.flatMap((item)=>getQuotes(item));
  const hotel = row.hotel || getHotel(row)?.nome || (quotes.length ? `${quotes.length} hotel(is) cotado(s)` : 'A definir');
  const supervisors = [...new Set(people.map((p) => p.supervisao).filter(Boolean))];
  const extension=extensionReservation(group);
  const attrs=` data-group-ids="${esc((row._groupIds||[row.solicitacao_id]).join(','))}"`;
  const actionButton=(action,ico,label,cls='')=>button(action,row,ico,label,cls).replace(' data-id=',`${attrs}${extension?` data-reserva-id="${esc(extension.reserva_id)}"`:''} data-id=`);
  const actions = bucket(row) === 'solicitadas'
    ? (extension?[actionButton('extend','extend','Estender'),actionButton('cancel','reject','Recusar','red')]:[actionButton('quote','quote','Cotar','amber'), actionButton('reserve','reserve','Reservar'), actionButton('cancel','reject','Recusar','red')])
    : [button('detail',row,'detail','Detalhes')];
  return `<article class="hosp-v2-row hosp-v2-request-row ${String(state.selectedId)===String(row.solicitacao_id)?'is-selected':''}">
    <div class="hosp-v2-cell"><label class="hosp-v2-select"><input type="checkbox" data-v2-select value="${esc(row.solicitacao_id)}" ${state.selectedRequests.has(String(row.solicitacao_id))?'checked':''}><span>${icon('hotel')}${esc([row.cidade,row.uf].filter(Boolean).join('/')||'-')}</span></label></div>
    <div class="hosp-v2-cell"><div class="hosp-v2-date">${icon('reserve')}<span>${brDate(row.data_checkin||row.data_checkin_prevista)} · ${esc(row.quantidade_diarias_prevista||row.quantidade_diarias||'-')} diária(s)${group.length>1?` · ${group.length} solicitações`:''}</span></div></div>
    <div class="hosp-v2-cell"><div class="hosp-v2-people">${people.length?people.map((p)=>`<span class="hosp-v2-person">${esc(p.nome_colaborador||'-')}</span>`).join(', '):`<span class="hosp-v2-person">${esc(row.colaborador||row.colaboradores||'-')}</span>`}</div></div>
    <div class="hosp-v2-cell"><div class="hosp-v2-supervision">${esc(supervisors.join(', ')||row.supervisao||'-')}</div></div>
    <div class="hosp-v2-cell"><div class="hosp-v2-hotel">${esc(requesterName(row))}</div></div>
    <div class="hosp-v2-cell actions"><div class="hosp-v2-actions">${actions.join('')}</div></div>
  </article>`;
}
function cardHtml(row, stage = '') {
  const people = getPeople(row), quotes = getQuotes(row), docs = getDocuments(row), extras = getExtras(row), status = statusMeta(row), b = bucket(row), hasReservation = Boolean(row.reserva_id);
  const hotel = row.hotel || getHotel(row)?.nome || (quotes.length ? `${quotes.length} hotel(is) cotado(s)` : 'Hotel ainda não definido');
  const os = row.numero_os || row.os || row.codigo_os || '';
  const totalExtras = extras.reduce((sum, e) => sum + (String(e.tipo).toUpperCase() === 'DESCONTO' ? -1 : 1) * Number(e.valor_total ?? Number(e.quantidade || 1) * Number(e.valor_unitario || 0)), 0);
  const proofSent = docs.some((d) => String(d.tipo).toUpperCase() === 'COMPROVANTE' && d.botconversa_enviado_em), nfReceived = docs.some((d) => String(d.tipo).toUpperCase() === 'NFSE');
  const actions = [];
  if (stage === 'andamento') { actions.push(button('extend', row, 'extend', 'Estender')); actions.push(button('checkout', row, 'checkout', 'Checkout', 'blue')); }
  else if (stage === 'pagar') { actions.push(button('pay-local', row, 'pay', 'Pagar', 'amber')); actions.push(button('extra', row, 'extra', 'Custos')); }
  else if (stage === 'nf') { actions.push(button('document', row, 'attach', 'Anexar NF', 'purple')); actions.push(button('detail', row, 'detail', 'Detalhes')); }
  return `<article class="hosp-v2-row ${String(state.selectedId) === String(row.solicitacao_id) ? 'is-selected' : ''}"><div class="hosp-v2-cell"><div class="hosp-v2-code">${esc(row.codigo || row.solicitacao_id || '-')}</div><span class="hosp-v2-sub">Cliente: ${esc(row.cliente || '-')}</span>${os ? `<span class="hosp-v2-sub">OS: ${esc(os)}</span>` : ''}<span class="hosp-v2-sub">Origem: ${esc(row.origem || row.tipo_origem || 'Solicitação')}</span></div><div class="hosp-v2-cell"><div class="hosp-v2-mainline"><span>${icon('hotel')}${esc([row.cidade, row.uf].filter(Boolean).join('/') || '-')}</span><span>${icon('reserve')}${brDate(row.data_checkin || row.data_checkin_prevista)} a ${brDate(row.data_checkout || row.data_checkout_prevista)}</span></div><div class="hosp-v2-meta"><span>Equipe: <b>${people.length || row.quantidade_pessoas || '-'}</b></span><span>Quartos: <b>${esc(roomsLabel(row))}</b></span><span>Diárias: <b>${esc(row.quantidade_diarias || row.quantidade_diarias_prevista || '-')}</b></span>${totalExtras ? `<span>Extras: <b>${money(totalExtras)}</b></span>` : ''}</div><div class="hosp-v2-paycond">${esc(paymentCondition(row))}</div>${proofSent ? `<div class="hosp-v2-note">${icon('file')} Comprovante anexado • enviado via BotConversa</div>` : nfReceived ? `<div class="hosp-v2-note">${icon('file')} NFS-e recebida automaticamente via WhatsApp</div>` : ''}</div><div class="hosp-v2-cell"><div class="hosp-v2-hotel">${esc(hotel)}</div><span class="hosp-v2-status ${status.cls}">${esc(status.label)}</span><span class="hosp-v2-sub">${quotes.length ? `${quotes.length} cotação(ões)` : `Check-in: ${brDate(row.data_checkin || row.data_checkin_prevista)}`}</span><span class="hosp-v2-sub">Valor: ${(row.valor_financeiro || row.valor_total_previsto) ? money(row.valor_financeiro || row.valor_total_previsto) : 'a confirmar'}</span></div><div class="hosp-v2-cell actions"><div class="hosp-v2-actions">${actions.join('')}</div></div></article>`;
}
function button(action, row, ico, label, cls = '', disabled = false) { return `<button type="button" class="hosp-v2-btn ${cls}" data-v2-action="${action}" data-id="${esc(row.solicitacao_id)}" title="${esc(label)}" aria-label="${esc(label)}" ${disabled ? 'disabled' : ''}>${icon(ico)}</button>`; }
function triggerBaseAction(action, row) { let helper = $('#hospV2BaseActionHelper'); if (!helper) { helper = document.createElement('button'); helper.id = 'hospV2BaseActionHelper'; helper.type = 'button'; helper.hidden = true; $('#pageContent')?.appendChild(helper); } helper.dataset.action = action; helper.dataset.id = row.solicitacao_id; helper.click(); }
function openLocalPayment(row) { if (typeof window.__abrirPagamentoHospedagem === 'function') { window.__abrirPagamentoHospedagem(row.solicitacao_id); return; } triggerBaseAction('enviar-pagamento', row); }
async function checkoutOnly(row) { if (!row.reserva_id) return; if (!window.confirm(`Confirmar o check-out da hospedagem ${row.codigo || ''}?\n\nO pagamento e a NFS-e continuarão pendentes.`)) return; const { error } = await supabase.from('hospedagem_reservas').update({ status_hospedagem: 'CHECKOUT_REALIZADO', data_checkout: row.data_checkout || todayIso() }).eq('id', row.reserva_id); if (error) return window.alert(`Erro ao registrar check-out: ${error.message}`); await loadData(); }
function openDetails(row) { state.selectedId = row.solicitacao_id; renderAll(); renderDetails(row); $('#hospV2Drawer')?.classList.add('open'); }
function renderDetails(row) {
  const root = $('#hospV2DrawerBody'); if (!root) return; $('#hospV2DrawerTitle').textContent = row.codigo || 'Detalhes da hospedagem';
  const people = getPeople(row), quotes = getQuotes(row).sort((a, b) => Number(a.valor_total || Infinity) - Number(b.valor_total || Infinity)), extras = getExtras(row), docs = getDocuments(row);
  const daily = Number(row.valor_diaria || row.valor_diaria_padrao || 0), nights = Number(row.quantidade_diarias || row.quantidade_diarias_prevista || 1), rooms = Number(row.quantidade_quartos || 1), base = Number(row.valor_total_previsto || daily * nights * rooms || 0);
  const extraTotal = extras.reduce((sum, e) => sum + (String(e.tipo).toUpperCase() === 'DESCONTO' ? -1 : 1) * Number(e.valor_total ?? Number(e.quantidade || 1) * Number(e.valor_unitario || 0)), 0), final = Number(row.valor_financeiro || base + extraTotal || 0), b = bucket(row);
  const timeline = ['Solicitação', 'Cotação', 'Reserva', 'Hospedagem', 'Pagamento', 'Documentos']; const idx = b === 'solicitadas' ? (String(row.status_solicitacao).toUpperCase() === 'EM_COTACAO' ? 1 : 0) : b === 'reservados' ? 2 : b === 'checkout' ? 3 : b === 'financeiro' ? 4 : 5;
  root.innerHTML = `<div class="hosp-v2-detail-box"><h4>${esc(row.hotel || 'Hotel ainda não selecionado')}</h4><div class="hosp-v2-detail-grid"><span>Cidade</span><strong>${esc([row.cidade, row.uf].filter(Boolean).join('/') || '-')}</strong><span>Período</span><strong>${brDate(row.data_checkin || row.data_checkin_prevista)} a ${brDate(row.data_checkout || row.data_checkout_prevista)}</strong><span>Hóspedes</span><strong>${people.length || row.quantidade_pessoas || '-'}</strong><span>Quartos</span><strong>${esc(roomsLabel(row))}</strong><span>Condição</span><strong>${esc(paymentCondition(row).replace('Pagamento no checkout: ', 'Checkout: '))}</strong></div></div><div class="hosp-v2-detail-box"><h4>Resumo financeiro</h4><div class="hosp-v2-detail-grid"><span>Hospedagem prevista</span><strong>${money(base)}</strong><span>Custos adicionais</span><strong>${money(extraTotal)}</strong><span>Total final</span><strong class="hosp-v2-total">${money(final)}</strong></div></div><div class="hosp-v2-drawer-actions"><button type="button" class="hosp-v2-paylocal" data-v2-action="pay-local" data-id="${esc(row.solicitacao_id)}" ${row.reserva_id ? '' : 'disabled'}>Pagar neste módulo</button><button type="button" class="hosp-v2-payfinance" data-v2-action="finance" data-id="${esc(row.solicitacao_id)}" ${row.reserva_id ? '' : 'disabled'}>Enviar ao Financeiro</button></div><div class="hosp-v2-detail-box"><h4>Cotações ${quotes.length ? `(${quotes.length})` : ''}</h4>${quotes.length ? quotes.map((q) => `<div class="hosp-v2-quote"><div><strong>${esc(q.hotel_nome || state.hotels.find((h) => String(h.id) === String(q.hotel_id))?.nome || 'Hotel')}</strong><small>${q.valor_total ? `${money(q.valor_total)} total` : 'Aguardando valor'} · ${q.aceita_pagamento_checkout === true ? 'aceita checkout' : q.aceita_pagamento_checkout === false ? 'pagamento antecipado' : 'condição pendente'}</small></div><button class="hosp-v2-linkbtn" type="button" data-v2-action="quote-edit" data-quote-id="${esc(q.id)}" data-id="${esc(row.solicitacao_id)}">Editar</button></div>`).join('') : '<div style="color:#80998d;font-size:11.5px">Nenhuma cotação registrada.</div>'}<button class="hosp-v2-linkbtn" style="margin-top:9px" type="button" data-v2-action="quote" data-id="${esc(row.solicitacao_id)}">Solicitar cotação</button></div><div class="hosp-v2-detail-box"><h4>Documentos</h4>${docs.length ? docs.map((d) => `<div class="hosp-v2-doc"><div><a href="${esc(d.arquivo_url)}" target="_blank" rel="noopener">${esc(String(d.tipo).toUpperCase() === 'NFSE' ? 'NFS-e' : d.tipo || 'Documento')}</a><small>${esc(d.origem || 'Painel')} · ${brDate(d.recebido_em || d.created_at)}</small></div><span style="color:#6df39d">${d.botconversa_enviado_em ? 'Enviado ✓' : ''}</span></div>`).join('') : '<div style="color:#80998d;font-size:11.5px">Nenhum documento anexado.</div>'}<button class="hosp-v2-linkbtn" style="margin-top:9px" type="button" data-v2-action="document" data-id="${esc(row.solicitacao_id)}">Anexar documento</button></div><div class="hosp-v2-detail-box"><h4>Fluxo da hospedagem</h4><div class="hosp-v2-timeline">${timeline.map((label, i) => `<div class="hosp-v2-step ${i < idx ? 'done' : i === idx ? 'active' : ''}"><i>${i < idx ? '✓' : i + 1}</i>${label}</div>`).join('')}</div></div>`;
}
function quoteMessage(row) { const people = getPeople(row).length || row.quantidade_pessoas || '-'; return `Olá! A Grão 1000 solicita uma cotação de hospedagem.\n\nSolicitação: ${row.codigo || row.solicitacao_id}\nCidade: ${[row.cidade, row.uf].filter(Boolean).join('/')}\nCheck-in: ${brDate(row.data_checkin_prevista)}\nCheck-out: ${brDate(row.data_checkout_prevista)}\nPessoas: ${people}\nQuartos: ${roomsLabel(row)}\nDiárias previstas: ${row.quantidade_diarias_prevista || '-'}\n\nPor favor, informe disponibilidade, valor das diárias, valor total, café da manhã, estacionamento e se aceita pagamento no checkout.`; }
function openQuoteModal(row) {
  state.selectedId = row.solicitacao_id; const matching = state.hotels.filter((hotel) => hotel.status !== 'INATIVO' && hotel.status !== 'BLOQUEADO' && hotel.recebe_cotacao !== false && norm(hotel.cidade) === norm(row.cidade) && (!row.uf || !hotel.uf || norm(hotel.uf) === norm(row.uf)));
  $('#hospV2QuoteSub').textContent = `${row.codigo || ''} · ${[row.cidade, row.uf].filter(Boolean).join('/')}`; $('#hospV2QuoteMessage').value = quoteMessage(row);
  $('#hospV2QuoteHotels').innerHTML = matching.length ? matching.map((hotel) => `<label class="hosp-v2-mini-item"><div><strong>${esc(hotel.nome)}</strong><small>${esc(hotel.whatsapp || 'Sem WhatsApp')} · ${hotel.aceita_pagamento_checkout === true ? 'aceita pagamento no checkout' : hotel.aceita_pagamento_checkout === false ? 'não aceita checkout' : 'condição não cadastrada'}</small></div><input type="checkbox" data-v2-quote-hotel value="${esc(hotel.id)}" ${hotel.whatsapp ? 'checked' : 'disabled'}></label>`).join('') : '<div class="hosp-v2-empty">Nenhum hotel ativo com WhatsApp cadastrado nesta cidade.</div>';
  setFeedback('hospV2QuoteFeedback', ''); openModal('hospV2QuoteModal');
}
async function sendQuoteBatch() {
  const row = state.rows.find((r) => String(r.solicitacao_id) === String(state.selectedId)); if (!row) return;
  const ids = $$('[data-v2-quote-hotel]:checked', $('#hospV2QuoteHotels')).map((el) => el.value), hotels = state.hotels.filter((hotel) => ids.includes(String(hotel.id)) && hotel.whatsapp), message = $('#hospV2QuoteMessage').value.trim();
  if (!hotels.length) return setFeedback('hospV2QuoteFeedback', 'Selecione pelo menos um hotel com WhatsApp.', 'err'); if (!message) return setFeedback('hospV2QuoteFeedback', 'A mensagem não pode ficar vazia.', 'err');
  setFeedback('hospV2QuoteFeedback', `Enviando para ${hotels.length} hotel(is)...`); $('#hospV2SendQuote').disabled = true; let sent = 0; const failures = [];
  await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'EM_COTACAO' }).eq('id', row.solicitacao_id);
  for (const hotel of hotels) {
    let quoteId = null;
    if (state.tables.quotes) { const payload = { solicitacao_id: row.solicitacao_id, hotel_id: hotel.id, hotel_nome: hotel.nome, status: 'ENVIANDO', quantidade_pessoas: getPeople(row).length || null, quantidade_quartos: row.quantidade_quartos || null, composicao_quartos: roomsLabel(row), diarias_previstas: Number(row.quantidade_diarias_prevista || 1), aceita_pagamento_checkout: hotel.aceita_pagamento_checkout ?? null, mensagem_enviada: message }; const { data } = await supabase.from('hospedagem_cotacoes').upsert(payload, { onConflict: 'solicitacao_id,hotel_id' }).select('id').single(); quoteId = data?.id || null; }
    try { const { data, error } = await supabase.functions.invoke('botconversa-send', { body: { phone: onlyDigits(hotel.whatsapp), nome: hotel.nome, message, flowId: HOSP_COTACAO_FLOW_ID } }); if (error || data?.ok === false) throw new Error(data?.error || error?.message || 'Falha no envio'); sent += 1; if (quoteId) await supabase.from('hospedagem_cotacoes').update({ status: 'ENVIADA', enviado_em: new Date().toISOString(), erro_envio: null }).eq('id', quoteId); if (state.tables.messages) await supabase.from('hospedagem_mensagens').insert({ solicitacao_id: row.solicitacao_id, reserva_id: row.reserva_id || null, hotel_id: hotel.id, direcao: 'SAIDA', tipo: 'COTACAO', canal: 'BOTCONVERSA', destinatario: hotel.whatsapp, conteudo: message, status: 'ENVIADA', enviado_em: new Date().toISOString() }); }
    catch (error) { failures.push(`${hotel.nome}: ${error.message}`); if (quoteId) await supabase.from('hospedagem_cotacoes').update({ status: 'FALHA', erro_envio: error.message }).eq('id', quoteId); }
  }
  $('#hospV2SendQuote').disabled = false; setFeedback('hospV2QuoteFeedback', `${sent}/${hotels.length} enviados${failures.length ? ` · ${failures.join(' | ')}` : ''}`, failures.length ? 'err' : 'ok'); await loadData(); setTimeout(() => closeModal('hospV2QuoteModal'), failures.length ? 2400 : 900);
}
async function editQuote(quoteId, row) { if (!state.tables.quotes) return window.alert('A migration do novo fluxo de hospedagem ainda não foi aplicada.'); const quote = state.quotes.find((q) => String(q.id) === String(quoteId)); if (!quote) return; const daily = window.prompt('Valor da diária:', quote.valor_diaria || ''); if (daily === null) return; const total = window.prompt('Valor total da cotação:', quote.valor_total || ''); if (total === null) return; const checkout = window.confirm('O hotel aceita pagamento no checkout?\nOK = Sim | Cancelar = Não'); const note = window.prompt('Observação da cotação:', quote.observacoes || '') ?? quote.observacoes; const { error } = await supabase.from('hospedagem_cotacoes').update({ valor_diaria: Number(String(daily).replace(',', '.')) || null, valor_total: Number(String(total).replace(',', '.')) || null, aceita_pagamento_checkout: checkout, observacoes: note || null, status: 'RESPONDIDA', respondido_em: new Date().toISOString(), resposta_texto: note || null }).eq('id', quote.id); if (error) return window.alert(error.message); await loadData(); openDetails(row); }
function openExtraModal(row) { state.selectedId = row.solicitacao_id; $('#hospV2ExtraSub').textContent = `${row.codigo || ''} · ${row.hotel || '-'}`; renderExtraModal(row); setFeedback('hospV2ExtraFeedback', ''); openModal('hospV2ExtraModal'); }
function renderExtraModal(row) { const extras = getExtras(row); $('#hospV2ExtraList').innerHTML = extras.length ? extras.map((e) => `<div class="hosp-v2-mini-item"><div><strong>${esc(e.descricao || e.tipo)}</strong><small>${esc(e.tipo)} · ${money(e.valor_total ?? Number(e.quantidade || 1) * Number(e.valor_unitario || 0))}</small></div><button type="button" data-v2-delete-extra="${esc(e.id)}">Excluir</button></div>`).join('') : '<div class="hosp-v2-empty">Nenhum custo adicional.</div>'; $$('[data-v2-delete-extra]', $('#hospV2ExtraList')).forEach((btn) => btn.addEventListener('click', async () => { if (!window.confirm('Excluir este custo?')) return; await supabase.from('hospedagem_custos_extras').delete().eq('id', btn.dataset.v2DeleteExtra); await loadData(); renderExtraModal(row); })); }
async function saveExtra() { const row = state.rows.find((r) => String(r.solicitacao_id) === String(state.selectedId)); if (!row) return; if (!state.tables.extras) return setFeedback('hospV2ExtraFeedback', 'A migration do fluxo v2 ainda não foi aplicada.', 'err'); const type = $('#hospV2ExtraType').value, description = $('#hospV2ExtraDescription').value.trim(), qty = Number($('#hospV2ExtraQty').value || 1), unit = Number($('#hospV2ExtraUnit').value || 0), conference = Boolean($('#hospV2ExtraConference')?.checked); if (!description || !unit) return setFeedback('hospV2ExtraFeedback', 'Informe item e valor.', 'err'); const { error } = await supabase.from('hospedagem_custos_extras').insert({ solicitacao_id: row.solicitacao_id, reserva_id: row.reserva_id || null, tipo: type, descricao: description, quantidade: qty, valor_unitario: unit, valor_total: qty * unit, data_custo: todayIso(), enviar_conferencia: conference, status_conferencia: conference ? 'PENDENTE' : 'NAO_ENVIADO' }); if (error) return setFeedback('hospV2ExtraFeedback', error.message, 'err'); $('#hospV2ExtraDescription').value = ''; $('#hospV2ExtraUnit').value = ''; if ($('#hospV2ExtraConference')) $('#hospV2ExtraConference').checked = false; setFeedback('hospV2ExtraFeedback', 'Custo adicionado.', 'ok'); await loadData(); renderExtraModal(row); }
function openDocumentModal(row) { state.selectedId = row.solicitacao_id; $('#hospV2DocumentSub').textContent = `${row.codigo || ''} · ${row.hotel || '-'}`; renderDocumentModal(row); setFeedback('hospV2DocumentFeedback', ''); openModal('hospV2DocumentModal'); }
function renderDocumentModal(row) { const docs = getDocuments(row); $('#hospV2DocumentList').innerHTML = docs.length ? docs.map((d) => `<div class="hosp-v2-mini-item"><div><strong>${esc(d.tipo || 'Documento')}</strong><small>${esc(d.origem || 'PAINEL')} · ${brDate(d.recebido_em || d.created_at)}${d.botconversa_enviado_em ? ' · enviado ao hotel' : ''}</small></div><a class="hosp-v2-linkbtn" href="${esc(d.arquivo_url)}" target="_blank" rel="noopener">Abrir</a></div>`).join('') : '<div class="hosp-v2-empty">Nenhum documento anexado.</div>'; }
async function saveDocument() {
  const row = state.rows.find((r) => String(r.solicitacao_id) === String(state.selectedId)); if (!row) return; if (!state.tables.documents) return setFeedback('hospV2DocumentFeedback', 'A migration do fluxo v2 ainda não foi aplicada.', 'err');
  const type = $('#hospV2DocumentType').value, file = $('#hospV2DocumentFile').files?.[0]; let url = $('#hospV2DocumentUrl').value.trim(); if (!file && !/^https:\/\//i.test(url)) return setFeedback('hospV2DocumentFeedback', 'Selecione um arquivo ou informe uma URL HTTPS.', 'err'); setFeedback('hospV2DocumentFeedback', 'Anexando documento...');
  if (file) { const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_'), path = `${row.solicitacao_id}/${Date.now()}-${safeName}`; const { error: uploadError } = await supabase.storage.from('hospedagem-documentos').upload(path, file, { upsert: false, contentType: file.type || undefined }); if (uploadError) return setFeedback('hospV2DocumentFeedback', uploadError.message, 'err'); url = supabase.storage.from('hospedagem-documentos').getPublicUrl(path).data.publicUrl; }
  const batchIds=Array.isArray(window.__hospedagemAcaoLote)?window.__hospedagemAcaoLote:[];
  const targets=state.rows.filter((item)=>batchIds.includes(item.solicitacao_id));
  const documentTargets=targets.length?targets:[row];
  const { data: docs, error } = await supabase.from('hospedagem_documentos').insert(documentTargets.map((item)=>({ solicitacao_id: item.solicitacao_id, reserva_id: item.reserva_id || null, tipo: type, arquivo_url: url, nome_arquivo: file?.name || url.split('/').pop(), mime_type: file?.type || null, origem: 'PAINEL', status: type === 'NFSE' ? 'RECEBIDO' : 'ANEXADO', recebido_em: new Date().toISOString() }))).select('*'); if (error) return setFeedback('hospV2DocumentFeedback', error.message, 'err');
  const doc=docs?.[0];
  if (type === 'COMPROVANTE' && $('#hospV2DocumentAutoSend').checked) { const hotel = getHotel(row); if (hotel?.whatsapp) { const message = `Olá! Segue o comprovante de pagamento da hospedagem ${row.codigo || row.solicitacao_id}.`; const { data, error: sendError } = await supabase.functions.invoke('botconversa-send', { body: { phone: onlyDigits(hotel.whatsapp), nome: hotel.nome, message, fileUrl: url } }); if (!sendError && data?.ok !== false) await supabase.from('hospedagem_documentos').update({ botconversa_enviado_em: new Date().toISOString(), botconversa_destinatario: hotel.whatsapp, status: 'ENVIADO' }).in('id', (docs||[]).map((item)=>item.id)); else setFeedback('hospV2DocumentFeedback', `Documento anexado, mas o envio falhou: ${data?.error || sendError?.message}`, 'err'); } }
  $('#hospV2DocumentFile').value = ''; $('#hospV2DocumentUrl').value = ''; setFeedback('hospV2DocumentFeedback', 'Documento anexado com sucesso.', 'ok'); await loadData(); renderDocumentModal(row);
}
function boot() { injectStyles(); const start = () => { mountShell(); if (state.mounted) loadData(); }; start(); const observer = new MutationObserver(start); observer.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(() => observer.disconnect(), 15000); window.addEventListener('hashchange', () => setTimeout(loadData, 300)); document.addEventListener('visibilitychange', () => { if (!document.hidden) loadData(); }); }
window.__abrirHospedagemAcao=(action,solicitacaoId)=>{const row=state.rows.find((item)=>String(item.solicitacao_id)===String(solicitacaoId));if(!row)return;if(action==='extra')openExtraModal(row);if(action==='document')openDocumentModal(row);};
boot();
