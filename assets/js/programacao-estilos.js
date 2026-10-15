// Programação — CSS da tela de Programação (injetado uma vez no <head>).
// Extraído de programacao.js em 15/10/2026 (declarações do topo do arquivo e funções de renderContent que não
// dependem do estado da tela). Código movido sem alteração. Ao editar, troque o ?v= deste módulo em TODOS os
// imports (programacao.js e demais módulos programacao-*): o teste tests/programacao-modulos-versao.test.mjs confere.

function injectProgramacaoStyles() {
  if (document.getElementById('programacao-table-styles')) return;
  const style = document.createElement('style');
  style.id = 'programacao-table-styles';
  style.textContent = `
    .prog-toolbar{padding:14px 16px}
    .prog-toolbar-row{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
    .prog-toolbar-row + .prog-toolbar-row{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)}
    .prog-tfield{display:flex;flex-direction:column;gap:4px;min-width:0}
    .prog-tfield label{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#7d8aa3;margin:0}
    .prog-tfield select,.prog-tfield input{min-height:38px;padding:8px 11px;border-radius:11px;border:1px solid rgba(52,211,153,.18);background:#0d0d18!important;color:#e2e2f0!important;font-size:13px;color-scheme:dark}
    .prog-tfield select option{background:#0d0d18;color:#e2e2f0}
    .prog-tfield-sup{flex:1 1 200px;max-width:300px}
    .prog-tfield-date{flex:0 0 148px}
    .prog-tfield-search{flex:1 1 220px}
    #progLoadContext{flex:0 0 auto;width:auto;margin-top:0;min-height:38px;padding:0 18px;white-space:nowrap;border-radius:11px}
    .prog-toolbar-spacer{flex:1 1 auto;min-width:8px}
    .prog-toolbar-row .prog-save-main{flex:0 0 auto;min-height:38px;padding:0 18px;white-space:nowrap}
    .prog-toolbar-row-steps{align-items:center;justify-content:space-between;flex-wrap:wrap}
    .prog-steps-compact{gap:6px;flex:1 1 auto}
    .prog-steps-compact .stepbtn{padding:8px 12px;border-radius:11px;font-size:12.5px}
    .prog-toolbar .feedback{margin:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;flex:0 1 auto}
    .prog-list-card{padding:14px 16px}
    @media(max-width:900px){
      .prog-toolbar-row{align-items:stretch}
      .prog-tfield-sup,.prog-tfield-date,.prog-tfield-search,#progLoadContext,.prog-toolbar-row .prog-save-main{flex:1 1 100%;max-width:none}
      .prog-toolbar-spacer{display:none}
      .prog-toolbar-row-steps{flex-direction:column;align-items:stretch;gap:8px}
      .prog-toolbar .feedback{max-width:none;white-space:normal}
    }
    .prog-table-wrap{width:100%;overflow:auto;border:1px solid rgba(52,211,153,.18);border-radius:18px;background:rgba(2,6,23,.26)}
    .prog-table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px;color:#e2e2f0}
    .prog-table th{position:sticky;top:0;z-index:1;background:#07170f;color:#c7f9df;font-size:12px;text-transform:uppercase;letter-spacing:.045em;text-align:left;padding:13px 12px;border-bottom:1px solid rgba(52,211,153,.2)}
    .prog-table td{padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:middle;background:rgba(15,23,42,.28)}
    .prog-table tr:hover td{background:rgba(22,101,52,.12)}
    .prog-table .colab-name{font-weight:900;color:#f8fafc;line-height:1.15;min-width:240px}
    .prog-table .colab-meta{font-size:12px;color:#a7b5aa;margin-top:3px}
    .prog-table input,.prog-table select,.prog-table textarea,.prog-context-grid select{color-scheme:dark;background:#0d0d18!important;color:#e2e2f0!important;border:1px solid rgba(52,211,153,.18);border-radius:11px;padding:9px 10px;outline:none;width:100%;min-height:38px}
    .prog-table select option,.prog-context-grid select option{background:#0d0d18;color:#e2e2f0}
    .prog-table input[type="checkbox"]{width:18px;min-height:18px;accent-color:#16a34a}
    .prog-table input:disabled,.prog-table select:disabled,.prog-table textarea:disabled{opacity:.58;cursor:not-allowed;background:#10101e!important}
    .prog-status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;white-space:nowrap;border:1px solid rgba(148,163,184,.18)}
    .prog-status.ok{background:rgba(22,163,74,.14);color:#bbf7d0;border-color:rgba(34,197,94,.22)}
    .prog-status.block{background:rgba(239,68,68,.12);color:#fecaca;border-color:rgba(248,113,113,.22)}
    .prog-mini-btn{border:1px solid rgba(52,211,153,.28);background:rgba(22,101,52,.22);color:#dcfce7;border-radius:12px;padding:9px 12px;font-weight:800;cursor:pointer;white-space:nowrap}
    .prog-mini-btn:hover{background:rgba(22,101,52,.42)}
    .prog-mini-btn.danger{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.25);color:#fecaca}
    .prog-save-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .prog-save-main{border:1px solid rgba(187,247,208,.32);background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border-radius:14px;padding:12px 18px;font-weight:950;cursor:pointer;box-shadow:0 14px 35px rgba(22,163,74,.18)}
    .prog-save-main:hover{filter:brightness(1.04)}
    .prog-save-main:disabled{opacity:.55;cursor:not-allowed;filter:none}
    .prog-extra-card{display:grid;grid-template-columns:160px 1.2fr 120px 1.2fr 86px;gap:8px;align-items:center;margin-bottom:8px;padding:8px;border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(15,23,42,.38)}
    .prog-extra-total{font-weight:900;color:#bbf7d0;text-align:right;white-space:nowrap}
    .prog-feedback-ok{color:#bbf7d0}.prog-feedback-error{color:#fecaca}.prog-feedback-warn{color:#fde68a}
    .prog-patrimonio-alert{display:none;margin-top:6px;border:1px solid rgba(250,204,21,.24);background:rgba(113,63,18,.20);color:#fde68a;border-radius:10px;padding:7px 9px;font-size:11px;font-weight:800;line-height:1.35}
    .prog-patrimonio-alert.show{display:block}
    .prog-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0 10px}
    .prog-section-title h4{margin:0;color:#f8fafc;font-size:15px;font-weight:950;letter-spacing:.02em}
    .prog-section-title .badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:900;border:1px solid rgba(52,211,153,.22);background:rgba(22,101,52,.14);color:#bbf7d0}
    .prog-section-title.blocked .badge{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.18);color:#fecaca}
    .prog-empty-section{border:1px dashed rgba(148,163,184,.2);border-radius:16px;padding:14px;color:#6b7280;background:rgba(15,23,42,.18)}
    .prog-os-modal-backdrop{position:fixed;inset:0;z-index:9990;background:rgba(2,6,23,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:18px}
    .prog-tipo-selector{display:flex;gap:6px;flex-wrap:wrap}
    .prog-tipo-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.5);color:#6b7280;border-radius:10px;padding:7px 11px;font-size:12px;font-weight:800;cursor:pointer;transition:all .15s}
    .prog-tipo-btn:hover{background:rgba(22,101,52,.25);color:#bbf7d0}
    .prog-tipo-btn.disabled,.prog-tipo-btn:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.45)}
    .prog-tipo-btn.disabled:hover,.prog-tipo-btn:disabled:hover{background:rgba(15,23,42,.5);color:#6b7280}
    .prog-tipo-btn.active{background:rgba(22,101,52,.35);color:#bbf7d0;border-color:rgba(52,211,153,.55)}
    .prog-tipo-btn.active[data-tipo="SEM EMBARQUE"],.prog-tipo-btn.active[data-tipo="INDISPONIVEL"]{background:rgba(127,29,29,.30);color:#fecaca;border-color:rgba(248,113,113,.45)}
    .prog-indisponivel-wrap{display:flex;align-items:center;gap:8px;margin-top:8px;max-width:260px}
    .prog-indisponivel-wrap select{min-height:34px!important;padding:6px 9px!important}
    .prog-estadia-selector{display:grid;grid-template-columns:repeat(3,minmax(78px,1fr));gap:7px;min-width:280px}
    .prog-estadia-card{border:1px solid rgba(52,211,153,.18);background:rgba(15,23,42,.56);color:#e2e2f0;border-radius:12px;padding:7px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font-weight:900;transition:all .15s;min-height:62px}
    .prog-estadia-card svg{width:22px;height:22px;stroke:#86efac;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
    .prog-estadia-card:hover{background:rgba(22,101,52,.22);transform:translateY(-1px)}
    .prog-estadia-card.active{border-color:rgba(134,239,172,.70);background:rgba(22,101,52,.34);box-shadow:0 0 0 1px rgba(134,239,172,.16) inset}
    .prog-estadia-card span{font-size:10.5px;letter-spacing:.02em;text-align:center}
    .prog-required-note{margin-top:6px;font-size:11px;color:#fde68a;font-weight:800}
    .prog-required-note--info{color:#9ca3af}
    .prog-km-note{display:block;margin-top:4px;color:#6b7280;font-size:11px;line-height:1.35}
    .prog-placa-wrap{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
    .prog-placa-wrap input{width:130px!important;font-family:monospace;text-transform:uppercase;min-height:32px!important;padding:5px 8px!important}
    .prog-placa-suggest-btn{border:1px solid rgba(52,211,153,.28);background:rgba(22,101,52,.22);color:#dcfce7;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
    .prog-placa-suggest-btn:hover{background:rgba(22,101,52,.42)}
    .prog-placa-alert{display:none;margin-top:6px;border:1px solid rgba(250,204,21,.24);background:rgba(113,63,18,.20);color:#fde68a;border-radius:10px;padding:6px 8px;font-size:11px;font-weight:700;line-height:1.35;width:100%}
    .prog-placa-alert.show{display:block}
    .prog-os-modal{width:min(920px,96vw);max-height:86vh;overflow:auto;border:1px solid rgba(52,211,153,.22);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#07130d);box-shadow:0 30px 90px rgba(0,0,0,.55);color:#e2e2f0;padding:22px}
    .prog-os-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}.prog-os-modal-head h3{margin:0;color:#f8fafc;font-size:22px}.prog-os-modal-head p{margin:6px 0 0;color:#6b7280}
    .prog-os-list{display:grid;gap:10px}.prog-os-card{border:1px solid rgba(52,211,153,.16);background:rgba(15,23,42,.62);border-radius:18px;padding:14px}.prog-os-card.zero{box-shadow:inset 4px 0 0 #facc15}.prog-os-title{font-weight:950;color:#f8fafc}.prog-os-meta{font-size:12px;color:#6b7280;margin-top:4px}.prog-os-rem{display:inline-flex;border-radius:999px;padding:5px 10px;margin-top:8px;font-size:12px;font-weight:950;border:1px solid rgba(250,204,21,.25);color:#fde68a;background:rgba(113,63,18,.22)}
    .prog-os-modal-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}.prog-os-close{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.72);color:#e2e2f0;border-radius:13px;padding:10px 14px;font-weight:900;cursor:pointer}.prog-os-go{border:1px solid rgba(187,247,208,.32);background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border-radius:13px;padding:10px 14px;font-weight:950;cursor:pointer}
    .prog-duplicate-backdrop[hidden]{display:none}.prog-duplicate-backdrop{position:fixed;inset:0;z-index:9992;display:grid;place-items:center;padding:18px;background:rgba(1,8,5,.78);backdrop-filter:blur(9px)}
    .prog-duplicate-modal{width:min(560px,96vw);max-height:90vh;overflow:auto;border:1px solid rgba(111,208,165,.3);border-radius:24px;background:linear-gradient(155deg,#0d241a,#07120d 70%);box-shadow:0 30px 90px rgba(0,0,0,.58);padding:22px;color:#e8f6ee}
    .prog-duplicate-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.prog-duplicate-head h3{margin:0;font-size:20px}.prog-duplicate-head p{margin:6px 0 0;color:#8ba79a;font-size:12px}.prog-duplicate-close{width:34px;height:34px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(2,6,23,.35);color:#b8ccc0;font-size:20px;cursor:pointer}
    .prog-duplicate-source{margin:16px 0 14px;padding:11px 13px;border:1px solid rgba(111,208,165,.15);border-radius:13px;background:rgba(63,168,120,.08);color:#b8ccc0;font-size:11px}.prog-duplicate-calendar-label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;color:#8ba79a;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.prog-duplicate-calendar-label span:last-child{color:#5f7d6e;font-weight:700;letter-spacing:0;text-transform:none}.prog-duplicate-dates{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.prog-duplicate-day{position:relative;min-width:0;min-height:92px;padding:10px 7px;border:1px solid rgba(111,208,165,.18);border-radius:14px;background:rgba(7,25,17,.74);color:#b8ccc0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;transition:transform .15s,border-color .15s,background .15s,box-shadow .15s}.prog-duplicate-day:hover{transform:translateY(-2px);border-color:rgba(111,208,165,.42);background:rgba(30,91,61,.22)}.prog-duplicate-day-week{font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#759686}.prog-duplicate-day-number{font-size:25px;line-height:1;font-weight:950;color:#eef7f2}.prog-duplicate-day-month{font-size:10px;color:#8ba79a}.prog-duplicate-day-check{position:absolute;right:7px;top:7px;width:17px;height:17px;border:1px solid rgba(111,208,165,.28);border-radius:6px;display:grid;place-items:center;color:transparent;font-size:11px}.prog-duplicate-day.is-selected{border-color:#6fd0a5;background:linear-gradient(150deg,rgba(35,134,90,.52),rgba(15,61,40,.7));box-shadow:0 8px 24px rgba(31,111,74,.2),inset 0 0 0 1px rgba(111,208,165,.12)}.prog-duplicate-day.is-selected .prog-duplicate-day-check{background:#6fd0a5;color:#07331f;border-color:#6fd0a5}.prog-duplicate-day.is-selected .prog-duplicate-day-week{color:#bdebd2}
    .prog-duplicate-options{margin-top:14px;padding:12px 13px;border:1px solid rgba(111,208,165,.18);border-radius:13px;background:rgba(7,25,17,.62)}.prog-duplicate-checkbox{display:flex;align-items:flex-start;gap:10px;color:#d9eee3;font-size:12px;font-weight:850;cursor:pointer}.prog-duplicate-checkbox input{width:17px;height:17px;margin:0;flex:0 0 auto;accent-color:#6fd0a5}.prog-duplicate-checkbox small{display:block;margin-top:4px;color:#789486;font-size:10px;font-weight:650;line-height:1.4}.prog-duplicate-note{margin-top:13px;color:#789486;font-size:10px;line-height:1.5}.prog-duplicate-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.prog-duplicate-actions button{min-height:40px;padding:0 15px;border-radius:12px;font-weight:900;cursor:pointer}.prog-duplicate-cancel{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.45);color:#cbd5e1}.prog-duplicate-confirm{border:1px solid rgba(111,208,165,.35);background:linear-gradient(135deg,#23865a,#6fd0a5);color:#042d1c}.prog-duplicate-confirm:disabled{opacity:.5;cursor:wait}
    @media(max-width:900px){.prog-extra-card{grid-template-columns:1fr}.prog-table{min-width:860px}.prog-os-modal{padding:16px}.prog-estadia-selector{grid-template-columns:repeat(3,minmax(70px,1fr));min-width:220px}}
    @media(max-width:560px){.prog-duplicate-dates{grid-template-columns:repeat(2,minmax(0,1fr))}.prog-duplicate-day:last-child{grid-column:1/-1}.prog-duplicate-modal{padding:17px}.prog-duplicate-actions{flex-direction:column-reverse}.prog-duplicate-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

export { injectProgramacaoStyles };
