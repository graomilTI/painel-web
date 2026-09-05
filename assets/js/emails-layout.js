// Central de E-mails — camada visual
// Overlay sobre emails.js: mantém toda a lógica (queries, handlers, regras)
// intacta e só reorganiza apresentação/produtividade por cima do DOM já
// renderizado. Fusão de emails-layout-v3.js + emails-layout-v4.js (eram duas
// camadas carregadas ao mesmo tempo, cada uma injetando seu próprio header
// "Caixa de Entrada" — daí a duplicação visual corrigida em 05/09/2026).
//
// O que este arquivo faz:
//   1. KPIs clicáveis (Novos/Pendentes/Urgentes/Sem regional/Respondidos) —
//      clicar já filtra a lista.
//   2. Filtros extras de Regional, Categoria e Prioridade, aplicados direto
//      nas linhas já renderizadas (sem tocar em emails.js).
//   3. Esconde badge sem informação (prioridade NORMAL, "sem regional/
//      categoria identificada") — só aparece quando carrega sinal de verdade.
//   4. Leitor com abas (Resumo da IA / Mensagem original) e trilho de ações
//      compacto (Encaminhar/Responder/Arquivar/Resolvido/Mais opções).
import { supabase } from './supabaseClient.js';

const STYLE_ID = 'emails-layout-style';
const READER_ID = 'emReader';
let readerTimer = null;
let actionExpanded = false;
let enhancing = false;

// Ícones dos KPIs do topo.
const icon = {
  mail: '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v6l4 2"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12.5 2.3 2.3 4.9-5"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>'
};

// Ícones do leitor e do trilho de ações.
const svg = {
  inbox: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></svg>',
  ai: '<svg viewBox="0 0 24 24"><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L4 9l5.3-1.7L12 2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="m3 11 18-8-8 18-2-7-8-3Z"/><path d="m11 14 10-11"/></svg>',
  reply: '<svg viewBox="0 0 24 24"><path d="m10 8-5 4 5 4"/><path d="M5 12h8c4 0 6 2 6 6"/></svg>',
  archive: '<svg viewBox="0 0 24 24"><path d="M4 8h16v11H4z"/><path d="M3 5h18v3H3z"/><path d="M9 12h6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>'
};

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body.email-center-v2{--eg:#65d46e;--eg2:#9df58f;--et:#f4fff6;--em:#a7b7ae;--el:rgba(115,231,153,.16);--ered:#ef4444;--eam:#f59e0b}
    .emails-smart-page .em-wrap{gap:10px}
    .emails-smart-page .em-hero{display:none!important}
    .emails-smart-page svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

    .em-v2-kpis{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .em-v2-kpi{display:flex;align-items:center;gap:14px;min-height:82px;padding:16px;border:1px solid var(--el);border-radius:20px;background:linear-gradient(145deg,rgba(16,31,29,.94),rgba(9,18,17,.88));box-shadow:0 18px 44px rgba(0,0,0,.22);cursor:pointer;transition:all 160ms}
    .em-v2-kpi:hover{border-color:rgba(101,212,110,.5);transform:translateY(-2px)}
    .em-v2-kpi-icon{width:44px;height:44px;border-radius:15px;display:grid;place-items:center;color:var(--eg);background:rgba(101,212,110,.14);border:1px solid rgba(101,212,110,.25);flex:none}
    .em-v2-kpi[data-accent=amber] .em-v2-kpi-icon{color:var(--eam);background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.28)}
    .em-v2-kpi[data-accent=red] .em-v2-kpi-icon{color:var(--ered);background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.28)}
    .em-v2-kpi[data-accent=gray] .em-v2-kpi-icon{color:var(--em);background:rgba(167,183,174,.12);border-color:rgba(167,183,174,.25)}
    .em-v2-kpi-label{color:var(--em);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
    .em-v2-kpi-value{color:var(--et);font:900 30px/1 'Syne',system-ui,sans-serif;margin-top:4px}

    .emails-smart-page .em-tabs{width:fit-content;max-width:100%;border:1px solid var(--el);border-radius:18px;background:rgba(9,18,17,.55);padding:6px;gap:6px}
    .emails-smart-page .em-tab{border-color:transparent;background:transparent;color:var(--em);border-radius:13px;padding:10px 14px}
    .emails-smart-page .em-tab.active{background:rgba(101,212,110,.16);border-color:rgba(101,212,110,.28);color:var(--eg2)}
    .emails-smart-page #emTabHint,.emails-smart-page .em-guia,.emails-smart-page .em-guia-toggle{display:none!important}
    .emails-smart-page #emPanelEntrada{display:grid;gap:12px}
    .emails-smart-page .em-card{border-color:var(--el);background:linear-gradient(145deg,rgba(14,27,25,.92),rgba(8,18,17,.86));box-shadow:0 20px 52px rgba(0,0,0,.24);border-radius:20px}
    .emails-smart-page .em-v2-filter-card{padding:14px}
    .emails-smart-page .em-filter{display:grid;grid-template-columns:150px 150px minmax(180px,1fr) auto;gap:10px}
    .emails-smart-page .em-field label{color:var(--em);font-size:10px}
    .emails-smart-page .em-field input,.emails-smart-page .em-field select,.emails-smart-page .em-field textarea{background:rgba(5,12,11,.58);border-color:var(--el);color:var(--et);border-radius:13px}

    .em-v3-extra-filters{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr)) auto;gap:10px;margin-top:10px}
    .em-v3-extra-filters select{border:1px solid var(--el);border-radius:13px;background:rgba(5,12,11,.58);color:var(--et);padding:11px 14px;font-size:13px;color-scheme:dark;font-family:inherit;cursor:pointer}
    .em-v3-extra-filters .em-v3-clear{border:1px solid rgba(255,255,255,.11);border-radius:13px;background:rgba(255,255,255,.035);color:var(--et);padding:11px 16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
    .em-v3-extra-filters .em-v3-clear:hover{border-color:var(--eg)}

    .emails-smart-page .em-grid{grid-template-columns:minmax(320px,390px) minmax(0,1fr);gap:14px}
    .emails-smart-page .em-grid-3{grid-template-columns:minmax(300px,360px) minmax(0,1.1fr) minmax(300px,.85fr);gap:14px}
    .emails-smart-page .em-step-head{display:none}
    .emails-smart-page .em-list{max-height:min(74vh,760px);padding-right:4px}
    .emails-smart-page .em-row{border-color:rgba(255,255,255,.07);background:rgba(10,21,19,.72);border-radius:16px}
    .emails-smart-page .em-row:hover,.emails-smart-page .em-row.active{border-color:rgba(101,212,110,.78);background:linear-gradient(135deg,rgba(101,212,110,.16),rgba(20,38,32,.82));box-shadow:0 14px 34px rgba(0,0,0,.24)}
    .emails-smart-page .em-row.active:before{background:var(--eg)}
    .emails-smart-page .em-avatar{background:rgba(101,212,110,.24)!important;color:var(--eg2)}
    .emails-smart-page .em-subject{color:var(--et);font-size:15px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .emails-smart-page .em-meta,.emails-smart-page .em-snippet{color:var(--em)}
    .emails-smart-page .em-badge,.emails-smart-page .em-prio{border-radius:999px;padding:5px 9px;font-size:10px;background:rgba(255,255,255,.04)}
    /* Badge só vale a pena mostrar quando carrega sinal de verdade — prioridade
       NORMAL (a maioria) e "sem regional/categoria identificada" (placeholder,
       não é dado) só poluem o card sem ajudar a triagem. */
    .emails-smart-page .em-row .em-prio.normal,
    .emails-smart-page .em-row .em-badge.em-noise{display:none!important}

    .emails-smart-page .em-detail{display:block}
    .emails-smart-page .em-envelope,.emails-smart-page .em-summary,.emails-smart-page .em-extracted,.emails-smart-page .em-letter,.emails-smart-page .em-reply{border:1px solid rgba(255,255,255,.08);background:rgba(5,12,11,.42);border-radius:16px;margin-bottom:12px}
    .emails-smart-page .em-envelope{padding:16px}
    .emails-smart-page .em-envelope-main h3{font-size:20px;margin-bottom:8px}
    .emails-smart-page .em-insights{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .emails-smart-page .em-chip{border-color:rgba(255,255,255,.07);background:rgba(255,255,255,.035);border-radius:14px;text-transform:none;letter-spacing:0;justify-content:space-between}
    .emails-smart-page .em-summary-label,.emails-smart-page .em-section-label{color:var(--eg2)}
    .emails-smart-page .em-letter pre{max-height:280px;font-size:13px;line-height:1.7}
    .emails-smart-page .em-reply textarea{min-height:150px}
    .emails-smart-page .em-actions{display:flex;gap:10px;flex-wrap:wrap}
    .emails-smart-page .btn.btn-primary,.emails-smart-page .em-v2-primary-action{background:linear-gradient(135deg,#3fa64a,#65d46e)!important;border-color:rgba(101,212,110,.68)!important;color:#041007!important;font-weight:900;box-shadow:0 12px 28px rgba(76,175,80,.2)}
    .emails-smart-page .btn.btn-secondary{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.11);color:var(--et)}
    .emails-smart-page #emAction .btn{width:100%;justify-content:center;min-height:44px;border-radius:14px}
    .emails-smart-page .em-empty{border-color:rgba(101,212,110,.2);color:var(--em)}

    .emails-smart-page .em-to{margin-top:10px}
    .emails-smart-page .em-v2-recipients{border:1px solid rgba(101,212,110,.16);background:rgba(101,212,110,.06);border-radius:13px;padding:9px 11px;color:var(--em);font-size:12px}
    .emails-smart-page .em-v2-recipients summary{cursor:pointer;color:var(--eg2);font-weight:800;list-style:none}
    .emails-smart-page .em-v2-recipients summary::-webkit-details-marker{display:none}
    .emails-smart-page .em-v2-recipients summary:after{content:' · ver detalhes';color:var(--em);font-weight:600}
    .emails-smart-page .em-v2-recipients[open] summary:after{content:' · ocultar'}
    .emails-smart-page .em-v2-recipients pre{margin:10px 0 0;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:var(--em);font:12px/1.55 'DM Sans',system-ui,sans-serif}

    body.email-center-v4{
      --e4-bg:#06100d;--e4-card:#081713;--e4-card2:#0a1c17;
      --e4-line:rgba(92,216,136,.16);--e4-green:#59d47b;--e4-green2:#9af2ad;
      --e4-teal:#38d5c5;--e4-amber:#f6bd42;--e4-red:#ef5b5b;
      --e4-text:#effaf3;--e4-muted:#8fa59a;
      background:radial-gradient(circle at 16% 0,rgba(69,190,111,.12),transparent 26%),var(--e4-bg)!important;
    }
    body.email-center-v4 .emails-smart-page{max-width:none!important}
    body.email-center-v4 .emails-smart-page .em-wrap{gap:10px!important}

    /* Navegação do módulo */
    body.email-center-v4 .emails-smart-page .em-tabs{
      display:flex!important;width:fit-content!important;max-width:100%;gap:4px!important;padding:5px!important;
      border:1px solid var(--e4-line)!important;border-radius:13px!important;background:#071410!important;box-shadow:none!important;
    }
    body.email-center-v4 .emails-smart-page .em-tab{
      min-height:37px;padding:8px 13px!important;border:1px solid transparent!important;border-radius:9px!important;
      background:transparent!important;color:var(--e4-muted)!important;font-size:10.5px!important;font-weight:850!important;
      text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;
    }
    body.email-center-v4 .emails-smart-page .em-tab.active{
      color:var(--e4-green2)!important;background:rgba(57,157,88,.20)!important;border-color:rgba(89,212,123,.36)!important;
    }

    /* Filtros rápidos: KPIs grandes viram chips */
    body.email-center-v4 .em-v2-kpis{display:flex!important;align-items:center;gap:6px!important;overflow:auto;padding:0 0 1px!important}
    body.email-center-v4 .em-v2-kpi{
      display:flex!important;align-items:center!important;min-height:35px!important;width:auto!important;flex:0 0 auto!important;
      gap:7px!important;padding:7px 10px!important;border-radius:9px!important;background:#09201b!important;
      border:1px solid rgba(78,190,134,.22)!important;box-shadow:none!important;transform:none!important;
    }
    body.email-center-v4 .em-v2-kpi:hover{background:#0c2922!important;border-color:rgba(89,212,123,.52)!important}
    body.email-center-v4 .em-v2-kpi-icon{width:16px!important;height:16px!important;padding:0!important;border:0!important;background:transparent!important}
    body.email-center-v4 .em-v2-kpi > div:last-child{display:flex!important;align-items:center!important;gap:5px!important}
    body.email-center-v4 .em-v2-kpi-label{font-size:9.5px!important;color:#c4d2ca!important;letter-spacing:.03em!important}
    body.email-center-v4 .em-v2-kpi-value{font:800 10.5px/1 system-ui,sans-serif!important;color:var(--e4-text)!important;margin:0!important}

    /* Barra de pesquisa/filtros */
    body.email-center-v4 .emails-smart-page .em-v2-filter-card{
      padding:9px!important;border:1px solid var(--e4-line)!important;border-radius:13px!important;background:#071612!important;box-shadow:none!important;
    }
    body.email-center-v4 .emails-smart-page .em-filter{display:grid!important;grid-template-columns:160px 170px minmax(240px,1fr) auto!important;gap:7px!important}
    body.email-center-v4 .emails-smart-page .em-field input,
    body.email-center-v4 .emails-smart-page .em-field select,
    body.email-center-v4 .em-v3-extra-filters select{
      min-height:38px!important;border-radius:9px!important;background:#071a16!important;border-color:rgba(87,205,142,.18)!important;color:var(--e4-text)!important;
    }
    body.email-center-v4 .em-v3-extra-filters{display:grid!important;grid-template-columns:repeat(3,minmax(140px,1fr)) auto!important;gap:7px!important;margin-top:7px!important}
    body.email-center-v4 .em-v3-extra-filters .em-v3-clear{min-height:38px!important;border-radius:9px!important}

    /* 3 colunas: caixa / leitor / ações */
    body.email-center-v4 .emails-smart-page #emDetailGrid{
      position:relative;display:grid!important;grid-template-columns:minmax(320px,34%) minmax(430px,1fr) 185px!important;
      gap:9px!important;align-items:stretch!important;
    }
    body.email-center-v4 .emails-smart-page #emDetailGrid>.em-card{
      min-height:650px;padding:11px!important;border-radius:14px!important;background:linear-gradient(180deg,#081713,#06120f)!important;
      border:1px solid var(--e4-line)!important;box-shadow:0 16px 42px rgba(0,0,0,.17)!important;
    }
    body.email-center-v4 .emails-smart-page .em-col-list::after,
    body.email-center-v4 .emails-smart-page .em-col-main::after{display:none!important}

    /* Caixa de entrada */
    .em-inbox-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:3px 3px 10px;margin-bottom:7px;border-bottom:1px solid var(--e4-line)}
    .em-inbox-title{display:flex;align-items:center;gap:7px;color:var(--e4-text);font-size:14px;font-weight:850}
    .em-inbox-title i{display:block;width:18px;height:18px;color:var(--e4-green2)}
    .em-inbox-count{padding:4px 8px;border:1px solid rgba(89,212,123,.20);border-radius:999px;background:rgba(89,212,123,.06);color:#b9ccc1;font-size:9.5px;font-weight:750;white-space:nowrap}
    body.email-center-v4 .emails-smart-page .em-list{max-height:calc(100vh - 300px)!important;min-height:550px!important;padding-right:3px!important;overflow:auto!important}
    body.email-center-v4 .emails-smart-page .em-row{
      position:relative;padding:10px 9px 10px 11px!important;margin-bottom:6px!important;border-radius:10px!important;
      background:#091915!important;border:1px solid rgba(255,255,255,.055)!important;box-shadow:none!important;transition:.15s ease!important;
    }
    body.email-center-v4 .emails-smart-page .em-row:before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:2px;background:transparent}
    body.email-center-v4 .emails-smart-page .em-row:hover{background:#0c211b!important;border-color:rgba(89,212,123,.25)!important;transform:translateY(-1px)!important}
    body.email-center-v4 .emails-smart-page .em-row.active{background:linear-gradient(100deg,rgba(43,149,87,.17),#0a1d18 60%)!important;border-color:rgba(89,212,123,.68)!important}
    body.email-center-v4 .emails-smart-page .em-row.active:before{background:var(--e4-green)!important;box-shadow:0 0 9px rgba(89,212,123,.42)}
    body.email-center-v4 .emails-smart-page .em-avatar.sm{width:28px!important;height:28px!important;border-radius:8px!important;font-size:9.5px!important}
    body.email-center-v4 .emails-smart-page .em-subject{font-size:11.5px!important;line-height:1.35!important;color:var(--e4-text)!important;white-space:normal!important;display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;overflow:hidden!important}
    body.email-center-v4 .emails-smart-page .em-meta{font-size:9.5px!important;color:var(--e4-muted)!important}
    body.email-center-v4 .emails-smart-page .em-snippet{font-size:10px!important;line-height:1.4!important;color:#80968b!important;display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;overflow:hidden!important}
    body.email-center-v4 .emails-smart-page .em-badge,
    body.email-center-v4 .emails-smart-page .em-prio{padding:3px 6px!important;font-size:8px!important;letter-spacing:.03em!important}

    /* Cabeçalho do e-mail */
    body.email-center-v4 .emails-smart-page .em-col-main{padding:0!important;overflow:hidden!important}
    body.email-center-v4 .emails-smart-page #emDetail{padding:11px!important}
    body.email-center-v4 .emails-smart-page #emDetail>.em-detail{gap:9px!important}
    body.email-center-v4 .emails-smart-page .em-envelope{
      margin:0!important;padding:11px 12px!important;border:1px solid rgba(255,255,255,.065)!important;border-radius:11px!important;background:#081713!important;
    }
    body.email-center-v4 .emails-smart-page .em-envelope .em-avatar{width:37px!important;height:37px!important;border-radius:10px!important;font-size:11px!important}
    body.email-center-v4 .emails-smart-page .em-envelope-main h3{font-size:15px!important;margin:0 0 5px!important;padding:0 0 6px!important}
    body.email-center-v4 .emails-smart-page .em-from{font-size:10.5px!important;margin-top:4px!important}
    body.email-center-v4 .emails-smart-page .em-to,
    body.email-center-v4 .emails-smart-page .em-v2-recipients{font-size:9.5px!important;margin-top:5px!important}
    body.email-center-v4 .emails-smart-page .em-date{font-size:9px!important}

    /* Leitor: IA separada do conteúdo original */
    .em-reader{display:grid;gap:9px}
    .em-reader-tabs{display:flex;align-items:center;gap:4px;padding:4px;border:1px solid var(--e4-line);border-radius:10px;background:#06110e;width:fit-content}
    .em-reader-tab{display:flex;align-items:center;gap:6px;min-height:33px;padding:7px 11px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--e4-muted);font:800 10px/1 system-ui,sans-serif;cursor:pointer}
    .em-reader-tab i{display:block;width:15px;height:15px}
    .em-reader-tab.active{color:var(--e4-green2);background:rgba(89,212,123,.11);border-color:rgba(89,212,123,.27)}
    .em-reader-tab[data-pane="message"].active{color:#98e9e1;background:rgba(56,213,197,.09);border-color:rgba(56,213,197,.24)}
    .em-pane{display:grid;gap:8px}.em-pane[hidden]{display:none!important}
    .em-pane-title{display:flex;align-items:center;gap:6px;padding:2px 1px;color:#b7c9c0;font-size:9.5px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}
    .em-pane-title i{display:block;width:14px;height:14px;color:var(--e4-teal)}
    body.email-center-v4 .emails-smart-page .em-insights{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}
    body.email-center-v4 .emails-smart-page .em-insight-cell,
    body.email-center-v4 .emails-smart-page .em-chip{padding:7px 8px!important;border-radius:8px!important;background:#081a15!important;border:1px solid rgba(255,255,255,.055)!important;font-size:9px!important}
    body.email-center-v4 .emails-smart-page #emDetail .em-summary{
      padding:14px 15px!important;border-radius:11px!important;background:linear-gradient(135deg,rgba(80,65,18,.19),rgba(9,21,17,.8))!important;
      border:1px solid rgba(246,189,66,.36)!important;box-shadow:none!important;
    }
    body.email-center-v4 .emails-smart-page #emDetail .em-summary-label{color:var(--e4-amber)!important;font-size:9.5px!important;font-weight:900!important}
    body.email-center-v4 .emails-smart-page #emDetail .em-summary p{font-size:11.5px!important;line-height:1.6!important;color:#d9e6df!important;text-align:center!important}
    body.email-center-v4 .emails-smart-page .em-extracted{padding:11px 13px!important;border-radius:11px!important;background:#071713!important;border:1px solid rgba(56,213,197,.18)!important}
    body.email-center-v4 .emails-smart-page .em-extracted .em-section-label{color:var(--e4-teal)!important;text-align:center!important}
    body.email-center-v4 .emails-smart-page .em-section-label{font-size:9px!important;padding-bottom:6px!important;margin-bottom:7px!important}
    body.email-center-v4 .emails-smart-page .em-dl{grid-template-columns:minmax(115px,.65fr) 1fr!important;gap:0!important;font-size:10px!important}
    body.email-center-v4 .emails-smart-page .em-dl dt,
    body.email-center-v4 .emails-smart-page .em-dl dd{padding:5.5px 6px!important;border-bottom:1px solid rgba(255,255,255,.045)!important}
    body.email-center-v4 .emails-smart-page .em-dl dt{color:#6ecf9d!important;font-weight:750!important}
    body.email-center-v4 .emails-smart-page .em-dl dd{color:#e5f0ea!important;font-weight:750!important}
    body.email-center-v4 .emails-smart-page .em-attachments{display:flex!important;gap:6px!important;flex-wrap:wrap!important}
    body.email-center-v4 .emails-smart-page .em-attachment{border-radius:8px!important;font-size:9px!important;padding:7px 9px!important;background:#081a16!important}
    body.email-center-v4 .emails-smart-page .em-letter{padding:15px!important;border-radius:11px!important;background:#071612!important;border:1px solid rgba(56,213,197,.16)!important}
    body.email-center-v4 .emails-smart-page .em-letter:before{background:var(--e4-teal)!important}
    body.email-center-v4 .emails-smart-page .em-letter pre{max-height:530px!important;font-size:11px!important;line-height:1.65!important;color:#dce8e2!important}
    .em-empty-ai{padding:20px;border:1px dashed rgba(89,212,123,.22);border-radius:11px;text-align:center;color:var(--e4-muted);font-size:10.5px;background:rgba(89,212,123,.025)}

    /* Ações rápidas */
    body.email-center-v4 .emails-smart-page .em-col-action{padding:10px!important;position:relative!important}
    .em-action-head{display:flex;align-items:center;gap:6px;padding:3px 2px 10px;margin-bottom:7px;border-bottom:1px solid var(--e4-line);color:var(--e4-text);font-size:12.5px;font-weight:850}
    .em-action-head i{display:block;width:15px;height:15px;color:var(--e4-green2)}
    .em-action-buttons{display:grid;gap:7px}
    .em-action-btn{display:flex;align-items:center;gap:8px;width:100%;min-height:41px;padding:8px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.09);background:#0a1b17;color:#d8e7df;font:800 10px/1.15 system-ui,sans-serif;cursor:pointer;text-align:left;transition:.15s ease}
    .em-action-btn i{display:block;width:17px;height:17px;flex:none}
    .em-action-btn:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(89,212,123,.34)}
    .em-action-btn.forward{color:#93edb0;border-color:rgba(89,212,123,.29);background:rgba(39,132,73,.13)}
    .em-action-btn.reply{color:#8feae0;border-color:rgba(56,213,197,.26);background:rgba(28,126,119,.10)}
    .em-action-btn.resolve{color:#a7efb7}.em-action-btn.more{color:#899c92;background:#07120f}
    .em-action-btn:disabled{opacity:.36;cursor:not-allowed}
    body.email-center-v4 .emails-smart-page #emAction{display:none!important;margin-top:9px;padding-top:9px;border-top:1px solid var(--e4-line)}
    body.email-center-v4 .emails-smart-page .em-col-action.em-expanded{
      position:absolute!important;right:10px!important;top:10px!important;bottom:10px!important;width:min(430px,40vw)!important;z-index:20!important;overflow:auto!important;
      box-shadow:-20px 0 50px rgba(0,0,0,.48)!important;
    }
    body.email-center-v4 .emails-smart-page .em-col-action.em-expanded #emAction{display:block!important}
    .em-action-close{display:none;width:100%;margin:0 0 8px;padding:8px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#0b1915;color:#b9cbc1;font-size:9.5px;font-weight:800;cursor:pointer}
    body.email-center-v4 .emails-smart-page .em-col-action.em-expanded .em-action-close{display:block}
    body.email-center-v4 .emails-smart-page #emAction .em-detail{gap:8px!important}
    body.email-center-v4 .emails-smart-page #emAction .em-summary,
    body.email-center-v4 .emails-smart-page #emAction .em-reply{padding:11px!important;border-radius:10px!important}
    body.email-center-v4 .emails-smart-page #emAction textarea{min-height:105px!important}

    @media(max-width:1280px){.emails-smart-page .em-grid,.emails-smart-page .em-grid-3{grid-template-columns:1fr}.emails-smart-page .em-list{max-height:unset}.em-v2-kpis{flex-wrap:wrap}}
    @media(max-width:880px){.emails-smart-page .em-filter,.em-v3-extra-filters,.emails-smart-page .em-insights{grid-template-columns:1fr}.emails-smart-page .em-tabs{width:100%}.emails-smart-page .em-tab{flex:1 1 auto}}
    @media(max-width:1400px){body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:minmax(300px,32%) minmax(390px,1fr) 165px!important}}
    @media(max-width:1160px){
      body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:minmax(300px,38%) minmax(0,1fr)!important}
      body.email-center-v4 .emails-smart-page .em-col-action{grid-column:1/-1!important;min-height:auto!important}
      .em-action-buttons{grid-template-columns:repeat(5,minmax(0,1fr))}
      body.email-center-v4 .emails-smart-page .em-col-action.em-expanded{position:relative!important;right:auto!important;top:auto!important;bottom:auto!important;width:auto!important;grid-column:1/-1!important}
    }
    @media(max-width:820px){
      body.email-center-v4 .emails-smart-page .em-filter,
      body.email-center-v4 .em-v3-extra-filters,
      body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:1fr!important}
      body.email-center-v4 .emails-smart-page #emDetailGrid>.em-card{min-height:auto!important}
      body.email-center-v4 .emails-smart-page .em-list{min-height:280px!important;max-height:420px!important}
      .em-action-buttons{grid-template-columns:1fr 1fr}
      body.email-center-v4 .emails-smart-page .em-insights{grid-template-columns:1fr!important}
      body.email-center-v4 .emails-smart-page .em-tabs{width:100%!important;overflow:auto!important}
    }
  `;
  document.head.appendChild(style);
}

// ── KPIs (topo) ───────────────────────────────────────────────────────────
function ensureKpis(wrap) {
  if (wrap.dataset.kpisReady === '1') return;
  wrap.dataset.kpisReady = '1';
  const data = [
    ['novos', 'Novos', icon.mail, 'green'],
    ['pendentes', 'Pendentes', icon.clock, 'amber'],
    ['urgentes', 'Urgentes', icon.alert, 'red'],
    ['semregional', 'Sem regional', icon.pin, 'gray'],
    ['respondidos', 'Respondidos', icon.check, 'green']
  ];
  wrap.insertAdjacentHTML('afterbegin', `<div class="em-v2-kpis">${data.map(([k, l, i, a]) => `<div class="em-v2-kpi" data-accent="${a}" data-kpi="${k}" title="Clique para ver estes e-mails"><div class="em-v2-kpi-icon">${i}</div><div><div class="em-v2-kpi-label">${l}</div><div class="em-v2-kpi-value" data-kpi-value="${k}">—</div></div></div>`).join('')}</div>`);
}

function countBy(apply) {
  const q = supabase.from('email_messages').select('id', { count: 'exact', head: true });
  return apply(q).then(({ count }) => count ?? 0).catch(() => null);
}

async function refreshKpis() {
  const values = await Promise.all([
    countBy((q) => q.in('status', ['NOVO'])),
    countBy((q) => q.in('status', ['PENDENTE', 'RESPONDER'])),
    countBy((q) => q.in('prioridade', ['ALTA', 'URGENTE']).in('status', ['NOVO', 'PENDENTE', 'RESPONDER'])),
    countBy((q) => q.is('regional', null).in('status', ['NOVO', 'PENDENTE', 'RESPONDER'])),
    countBy((q) => q.in('status', ['RESPONDIDO', 'RESOLVIDO']))
  ]);
  ['novos', 'pendentes', 'urgentes', 'semregional', 'respondidos'].forEach((key, i) => {
    const el = document.querySelector(`[data-kpi-value="${key}"]`);
    if (el && values[i] !== null) el.textContent = String(values[i]);
  });
}

function bindKpiClicks() {
  document.querySelectorAll('.em-v2-kpi[data-kpi]').forEach((kpi) => {
    if (kpi.dataset.bound === '1') return;
    kpi.dataset.bound = '1';
    kpi.addEventListener('click', () => {
      const key = kpi.dataset.kpi;
      const statusSel = document.getElementById('emStatus');
      const prioSel = document.getElementById('emV3Prioridade');
      const regSel = document.getElementById('emV3Regional');
      if (!statusSel) return;
      extraFilter.prioridade = ''; extraFilter.regional = '';
      if (prioSel) prioSel.value = ''; if (regSel) regSel.value = '';
      if (key === 'novos' || key === 'pendentes') statusSel.value = 'NOVO,PENDENTE,RESPONDER';
      if (key === 'respondidos') statusSel.value = 'RESPONDIDO,RESOLVIDO';
      if (key === 'urgentes') { statusSel.value = 'NOVO,PENDENTE,RESPONDER'; extraFilter.prioridade = 'ALTA'; if (prioSel) prioSel.value = 'ALTA'; }
      if (key === 'semregional') { statusSel.value = 'NOVO,PENDENTE,RESPONDER'; extraFilter.regional = '__SEM__'; if (regSel) regSel.value = '__SEM__'; }
      document.getElementById('emFilter')?.requestSubmit?.();
      setTimeout(applyExtraFilters, 800);
      document.getElementById('emPanelEntrada')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ── Filtros extras (regional / categoria / prioridade) ──────────────────────
const extraFilter = { regional: '', categoria: '', prioridade: '' };

const REGIONAL_OPTIONS = ['BAHIA', 'GOIAS', 'MARANHAO', 'MATO GROSSO DO SUL', 'MINAS GERAIS', 'MATO GROSSO MT1', 'MATO GROSSO MT2', 'MATO GROSSO MT3', 'MATO GROSSO MT4', 'PARA', 'PARAGUAI', 'PR PONTA GROSSA', 'PR CASCAVEL', 'PR LONDRINA', 'PR MARINGA', 'RIO GRANDE DO SUL', 'SAO PAULO', 'TOCANTINS'];
const CATEGORIA_OPTIONS = ['LOGÍSTICA', 'LOGISTICA', 'QUALIDADE', 'NOTAS FISCAIS', 'NOTAS_FISCAIS', 'FINANCEIRO', 'FROTAS', 'RH', 'COMERCIAL', 'COTACAO', 'CONTRATO', 'PROPOSTA', 'PHISHING', 'GERAL'];

function ensureExtraFilters() {
  const filterForm = document.getElementById('emFilter');
  if (!filterForm || document.getElementById('emV3Regional')) return;
  const holder = document.createElement('div');
  holder.className = 'em-v3-extra-filters';
  holder.innerHTML = `
    <select id="emV3Regional" title="Filtrar por regional"><option value="">🗺️ Todas as regionais</option>${REGIONAL_OPTIONS.map((r) => `<option value="${r}">${r}</option>`).join('')}<option value="__SEM__">— Sem regional identificada —</option></select>
    <select id="emV3Categoria" title="Filtrar por categoria"><option value="">🏷️ Todas as categorias</option>${[...new Set(CATEGORIA_OPTIONS)].map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
    <select id="emV3Prioridade" title="Filtrar por prioridade"><option value="">⚡ Todas as prioridades</option><option value="URGENTE">URGENTE</option><option value="ALTA">ALTA</option><option value="NORMAL">NORMAL</option><option value="BAIXA">BAIXA</option></select>
    <button type="button" class="em-v3-clear" id="emV3Clear">Limpar filtros</button>
  `;
  filterForm.after(holder);
  ['emV3Regional', 'emV3Categoria', 'emV3Prioridade'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      extraFilter.regional = document.getElementById('emV3Regional').value;
      extraFilter.categoria = document.getElementById('emV3Categoria').value;
      extraFilter.prioridade = document.getElementById('emV3Prioridade').value;
      applyExtraFilters();
    });
  });
  document.getElementById('emV3Clear').addEventListener('click', () => {
    extraFilter.regional = ''; extraFilter.categoria = ''; extraFilter.prioridade = '';
    document.getElementById('emV3Regional').value = '';
    document.getElementById('emV3Categoria').value = '';
    document.getElementById('emV3Prioridade').value = '';
    const busca = document.getElementById('emBusca');
    if (busca) busca.value = '';
    document.getElementById('emFilter')?.requestSubmit?.();
    applyExtraFilters();
  });
}

// A filtragem extra é feita em cima das linhas já renderizadas (não refaz a
// query): cada linha exibe badges com regional/categoria/prioridade, então dá
// pra filtrar pelo texto delas sem alterar emails.js.
let applyingFilters = false;
function applyExtraFilters() {
  if (applyingFilters) return;
  applyingFilters = true;
  try { applyExtraFiltersInner(); } finally { applyingFilters = false; }
}

function applyExtraFiltersInner() {
  const rows = document.querySelectorAll('#emList .em-row');
  rows.forEach((row) => {
    const texto = (row.textContent || '').toUpperCase();
    let ok = true;
    if (extraFilter.regional === '__SEM__') ok = texto.includes('SEM REGIONAL');
    else if (extraFilter.regional) {
      const alias = {
        'BAHIA': ['BAHIA'], 'GOIAS': ['GOIÁS', 'GOIAS'], 'MARANHAO': ['MARANHÃO', 'MARANHAO'],
        'MATO GROSSO DO SUL': ['MATO GROSSO DO SUL'], 'MINAS GERAIS': ['MINAS GERAIS'],
        'MATO GROSSO MT1': ['MT1'], 'MATO GROSSO MT2': ['MT2'], 'MATO GROSSO MT3': ['MT3'], 'MATO GROSSO MT4': ['MT4'],
        'PARA': ['PARÁ', 'PARA'], 'PARAGUAI': ['PARAGUAI'],
        'PR PONTA GROSSA': ['PONTA GROSSA'], 'PR CASCAVEL': ['CASCAVEL'], 'PR LONDRINA': ['LONDRINA'], 'PR MARINGA': ['MARINGÁ', 'MARINGA'],
        'RIO GRANDE DO SUL': ['RIO GRANDE DO SUL'], 'SAO PAULO': ['SÃO PAULO', 'SAO PAULO'], 'TOCANTINS': ['TOCANTINS']
      }[extraFilter.regional] || [extraFilter.regional];
      ok = alias.some((a) => texto.includes(a));
    }
    if (ok && extraFilter.categoria) {
      const aliasCat = {
        'LOGISTICA': ['LOGÍSTICA', 'LOGISTICA', 'EMBARQUE'], 'LOGÍSTICA': ['LOGÍSTICA', 'LOGISTICA', 'EMBARQUE'],
        'NOTAS FISCAIS': ['NOTAS FISCAIS', 'NOTA FISCAL'], 'NOTAS_FISCAIS': ['NOTAS FISCAIS', 'NOTAS_FISCAIS', 'NOTA FISCAL'],
        'QUALIDADE': ['QUALIDADE'], 'FINANCEIRO': ['FINANCEIRO'], 'FROTAS': ['FROTAS', 'MULTA'], 'RH': ['RECURSOS HUMANOS', 'RH'],
        'COMERCIAL': ['COMERCIAL'], 'COTACAO': ['COTAÇÃO', 'COTACAO'], 'CONTRATO': ['CONTRATO'],
        'PROPOSTA': ['PROPOSTA'], 'PHISHING': ['GOLPE', 'PHISHING'], 'GERAL': ['SEM CATEGORIA', 'GERAL']
      }[extraFilter.categoria] || [extraFilter.categoria];
      ok = aliasCat.some((a) => texto.includes(a));
    }
    if (ok && extraFilter.prioridade) ok = texto.includes(extraFilter.prioridade);
    const display = ok ? '' : 'none';
    // Só toca no DOM quando muda de verdade — evita retrigger do MutationObserver.
    if (row.style.display !== display) row.style.display = display;
  });
  updateInboxCount();
}

// ── Caixa de entrada, badges de ruído e contagem ────────────────────────────
function visibleRows() {
  return [...document.querySelectorAll('#emList .em-row')].filter((row) => getComputedStyle(row).display !== 'none');
}

function updateInboxCount() {
  const count = document.getElementById('emInboxCount');
  if (!count) return;
  const label = `${visibleRows().length} e-mail(s) na lista`;
  if (count.textContent !== label) count.textContent = label;
}

function ensureInboxHeader() {
  const list = document.getElementById('emList');
  const column = list?.closest('.em-col-list');
  if (!list || !column) return;
  if (!column.querySelector('.em-inbox-head')) {
    const head = document.createElement('div');
    head.className = 'em-inbox-head';
    head.innerHTML = `<div class="em-inbox-title"><i>${svg.inbox}</i><span>Caixa de Entrada</span></div><span class="em-inbox-count" id="emInboxCount">0 e-mail(s) na lista</span>`;
    column.insertBefore(head, list);
  }
  updateInboxCount();
}

// categoria e regional usam a mesma classe (.em-badge.arquivado) — só dá pra
// distinguir "placeholder sem dado" de "categoria/regional real" pelo texto.
const NOISE_BADGE_TEXT = new Set(['SEM REGIONAL IDENTIFICADO', 'SEM CATEGORIA DEFINIDA']);
function markNoiseBadges() {
  document.querySelectorAll('#emList .em-row .em-badge, #emPerigoList .em-row .em-badge').forEach((badge) => {
    const isNoise = NOISE_BADGE_TEXT.has((badge.textContent || '').trim().toUpperCase());
    badge.classList.toggle('em-noise', isNoise);
  });
}

// ── Detalhe do e-mail: rótulos, destinatários compactos ─────────────────────
function compactRecipients(root) {
  const to = root.querySelector('.em-to');
  if (!to || to.dataset.emailV2Compact === '1') return;
  const raw = (to.textContent || '').replace(/\s+/g, ' ').trim();
  if (!raw) return;
  const count = (raw.match(/@/g) || []).length;
  const summary = count > 1 ? `Destinatários e cópias ocultos (${count} contatos)` : 'Destinatário oculto';
  to.textContent = '';
  const details = document.createElement('details');
  details.className = 'em-v2-recipients';
  const summaryEl = document.createElement('summary');
  summaryEl.textContent = summary;
  const pre = document.createElement('pre');
  pre.textContent = raw;
  details.append(summaryEl, pre);
  to.appendChild(details);
  to.dataset.emailV2Compact = '1';
}

function enhanceButtons() {
  const inner = document.getElementById('emDetail')?.querySelector('.em-detail');
  if (inner && inner.dataset.emailV2 !== '1') {
    inner.dataset.emailV2 = '1';
    compactRecipients(inner);
  }

  const actionInner = document.getElementById('emAction')?.querySelector('.em-detail');
  if (!actionInner || actionInner.dataset.emailV2 === '1') return;
  actionInner.dataset.emailV2 = '1';
  const forward = actionInner.querySelector('#emAprovarEncaminhamento');
  if (forward) { forward.textContent = 'Aprovar e redirecionar ao gestor'; forward.classList.add('em-v2-primary-action'); }
  const replySubmit = actionInner.querySelector('#emReplyForm button[type="submit"]');
  if (replySubmit) replySubmit.textContent = 'Aprovar resposta';
  const replyLabel = actionInner.querySelector('.em-reply .em-section-label');
  if (replyLabel) replyLabel.textContent = 'Resposta sugerida pela IA';
  const helper = actionInner.querySelector('.em-reply .em-muted.em-small');
  if (helper) helper.textContent = 'Revise o texto, aprove a resposta ou use as ações secundárias para resolver, arquivar ou manter pendente.';
}

// ── Leitor com abas (Resumo da IA / Mensagem original) ──────────────────────
function showPane(reader, pane) {
  const summaryActive = pane === 'summary';
  reader.querySelectorAll('.em-reader-tab').forEach((button) => {
    const active = button.dataset.pane === pane;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const summary = reader.querySelector('.em-pane-summary');
  const message = reader.querySelector('.em-pane-message');
  if (summary) summary.hidden = !summaryActive;
  if (message) message.hidden = summaryActive;
}

function ensureReader() {
  const detail = document.querySelector('#emDetail > .em-detail');
  if (!detail || detail.querySelector(`#${READER_ID}`)) return;

  const envelope = detail.querySelector(':scope > .em-envelope');
  const letter = detail.querySelector('.em-letter');
  if (!envelope || !letter) return;

  const insights = detail.querySelector(':scope > .em-insights');
  const aiSummary = detail.querySelector(':scope > .em-summary');
  const extracted = detail.querySelector(':scope > .em-extracted');
  const attachments = detail.querySelector('.em-attachments')?.parentElement || null;
  const messageBlock = letter.parentElement;

  const reader = document.createElement('div');
  reader.id = READER_ID;
  reader.className = 'em-reader';
  reader.innerHTML = `
    <div class="em-reader-tabs" role="tablist" aria-label="Conteúdo do e-mail">
      <button class="em-reader-tab active" type="button" data-pane="summary" role="tab" aria-selected="true"><i>${svg.ai}</i>Resumo da IA</button>
      <button class="em-reader-tab" type="button" data-pane="message" role="tab" aria-selected="false"><i>${svg.mail}</i>Mensagem original</button>
    </div>
    <section class="em-pane em-pane-summary"></section>
    <section class="em-pane em-pane-message" hidden><div class="em-pane-title"><i>${svg.mail}</i>Mensagem original recebida</div></section>`;

  envelope.insertAdjacentElement('afterend', reader);
  const summaryPane = reader.querySelector('.em-pane-summary');
  const messagePane = reader.querySelector('.em-pane-message');

  [insights, aiSummary, extracted, attachments].filter(Boolean).forEach((node) => summaryPane.appendChild(node));
  if (!aiSummary && !extracted) {
    const empty = document.createElement('div');
    empty.className = 'em-empty-ai';
    empty.textContent = 'A IA ainda não registrou um resumo estruturado para esta mensagem.';
    summaryPane.appendChild(empty);
  }
  messagePane.appendChild(messageBlock);

  reader.addEventListener('click', (event) => {
    const button = event.target.closest('.em-reader-tab');
    if (button) showPane(reader, button.dataset.pane);
  });
}

// ── Trilho de ações compacto ─────────────────────────────────────────────────
function originalAction(name) {
  return document.querySelector(`#emAction [data-action="${name}"]`);
}

function openActionPanel(target) {
  const aside = document.querySelector('#emDetailGrid .em-col-action');
  if (!aside) return;
  actionExpanded = true;
  aside.classList.add('em-expanded');
  requestAnimationFrame(() => {
    const destination = target === 'reply' ? aside.querySelector('#emAction .em-reply') : aside.querySelector('#emAction .em-summary');
    destination?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (target === 'reply') aside.querySelector('#emAction textarea')?.focus({ preventScroll: true });
  });
}

function closeActionPanel() {
  actionExpanded = false;
  document.querySelector('#emDetailGrid .em-col-action')?.classList.remove('em-expanded');
}

function ensureActionRail() {
  const actionHost = document.getElementById('emAction');
  const aside = actionHost?.closest('.em-col-action');
  if (!actionHost || !aside) return;

  let rail = aside.querySelector('.em-action-ui');
  if (!rail) {
    rail = document.createElement('div');
    rail.className = 'em-action-ui';
    rail.innerHTML = `
      <div class="em-action-head"><i>${svg.send}</i><span>Ações</span></div>
      <div class="em-action-buttons">
        <button class="em-action-btn forward" type="button" data-rail-action="forward"><i>${svg.send}</i><span>Encaminhar</span></button>
        <button class="em-action-btn reply" type="button" data-rail-action="reply"><i>${svg.reply}</i><span>Responder</span></button>
        <button class="em-action-btn archive" type="button" data-rail-action="archive"><i>${svg.archive}</i><span>Arquivar</span></button>
        <button class="em-action-btn resolve" type="button" data-rail-action="resolved"><i>${svg.check}</i><span>Resolvido</span></button>
        <button class="em-action-btn more" type="button" data-rail-action="more"><i>${svg.more}</i><span>Mais opções</span></button>
      </div>
      <button class="em-action-close" type="button">← Voltar às ações rápidas</button>`;
    aside.insertBefore(rail, actionHost);

    rail.addEventListener('click', (event) => {
      const button = event.target.closest('[data-rail-action]');
      if (button) {
        const name = button.dataset.railAction;
        if (name === 'forward' || name === 'reply') return openActionPanel(name);
        if (name === 'more') return actionExpanded ? closeActionPanel() : openActionPanel('forward');
        originalAction(name)?.click();
        return;
      }
      if (event.target.closest('.em-action-close')) closeActionPanel();
    });
  }

  const hasEmail = Boolean(document.querySelector('#emDetail .em-envelope'));
  rail.querySelectorAll('[data-rail-action]').forEach((button) => {
    if (button.dataset.railAction !== 'more') button.disabled = !hasEmail;
  });
  if (actionExpanded) aside.classList.add('em-expanded');
}

// ── Orquestração ─────────────────────────────────────────────────────────────
function enhance() {
  if (enhancing) return;
  enhancing = true;
  try {
    const content = document.getElementById('pageContent');
    const wrap = content?.querySelector('.em-wrap');
    if (!wrap) return;
    if (!document.body.classList.contains('email-center-v2')) document.body.classList.add('email-center-v2');
    if (!document.body.classList.contains('email-center-v4')) document.body.classList.add('email-center-v4');
    if (!content.classList.contains('emails-smart-page')) content.classList.add('emails-smart-page');
    const title = document.getElementById('pageTitle');
    if (title && title.textContent !== 'Central de E-mails Inteligente') title.textContent = 'Central de E-mails Inteligente';

    ensureKpis(wrap);
    ensureExtraFilters();
    ensureInboxHeader();
    markNoiseBadges();
    enhanceButtons();
    ensureReader();
    ensureActionRail();
    bindKpiClicks();
    applyExtraFilters();
  } finally {
    enhancing = false;
  }
}

function scheduleEnhance() {
  clearTimeout(readerTimer);
  readerTimer = setTimeout(enhance, 120);
}

function boot() {
  addStyles();
  enhance();
  refreshKpis();
  new MutationObserver(scheduleEnhance).observe(document.getElementById('pageContent') || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  document.addEventListener('submit', (e) => { if (['emFilter', 'emReplyForm'].includes(e.target?.id)) setTimeout(() => { refreshKpis(); applyExtraFilters(); }, 900); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action], #emAprovarEncaminhamento')) setTimeout(refreshKpis, 900);
    if (e.target.closest('.em-row,.em-filter,.em-v3-extra-filters,[data-kpi-filter]')) scheduleEnhance();
  });
  setInterval(() => {
    refreshKpis();
    // Atualização automática da lista só quando o usuário não está lendo um
    // e-mail, pra não puxar o tapete no meio de uma aprovação.
    const detailAberto = document.querySelector('#emDetail .em-detail');
    const abaEntrada = document.getElementById('emPanelEntrada')?.style.display !== 'none';
    if (!detailAberto && abaEntrada) document.getElementById('emFilter')?.requestSubmit?.();
  }, 120000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
