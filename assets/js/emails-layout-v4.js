// Central de E-mails — Layout v4
// Camada visual sobre emails.js/v3. Mantém a lógica, queries e ações existentes.
// Objetivo: caixa compacta + leitura separada entre interpretação da IA e mensagem original.

(() => {
  const STYLE_ID = 'emails-layout-v4-style';
  const READER_ID = 'emV4Reader';
  let actionExpanded = false;
  let enhanceTimer = null;

  const icons = {
    inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></svg>',
    ai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L4 9l5.3-1.7L12 2Z"/><path d="m19 15 .8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-8 18-2-7-8-3Z"/><path d="m11 14 10-11"/></svg>',
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 8-5 4 5 4"/><path d="M5 12h8c4 0 6 2 6 6"/></svg>',
    archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v11H4z"/><path d="M3 5h18v3H3z"/><path d="M9 12h6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>'
  };

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body.email-center-v4{
        --mail-bg:#06100d;
        --mail-card:#091713;
        --mail-card-2:#0b1b17;
        --mail-line:rgba(92,216,136,.16);
        --mail-line-strong:rgba(92,216,136,.42);
        --mail-green:#59d47b;
        --mail-green-2:#9af2ad;
        --mail-teal:#38d5c5;
        --mail-amber:#f6bd42;
        --mail-red:#ef5b5b;
        --mail-text:#f1fbf5;
        --mail-muted:#8fa59a;
        background:radial-gradient(circle at 18% 0,rgba(66,190,112,.12),transparent 25%),#06100d;
      }
      body.email-center-v4 .emails-smart-page{max-width:none}
      body.email-center-v4 .emails-smart-page svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      body.email-center-v4 .emails-smart-page .em-wrap{gap:12px}
      body.email-center-v4 .emails-smart-page .em-hero{display:none!important}
      body.email-center-v4 .emails-smart-page .em-v3-health{display:none!important}

      /* Navegação principal do módulo */
      body.email-center-v4 .emails-smart-page .em-tabs{
        display:flex!important;width:fit-content!important;max-width:100%;gap:4px!important;padding:5px!important;
        border:1px solid var(--mail-line)!important;border-radius:14px!important;background:#071410!important;
        box-shadow:0 12px 28px rgba(0,0,0,.18)!important;
      }
      body.email-center-v4 .emails-smart-page .em-tab{
        min-height:38px;padding:9px 14px!important;border:1px solid transparent!important;border-radius:10px!important;
        background:transparent!important;color:var(--mail-muted)!important;font-size:11px!important;font-weight:850!important;
        text-transform:uppercase;letter-spacing:.055em;white-space:nowrap;
      }
      body.email-center-v4 .emails-smart-page .em-tab.active{
        color:var(--mail-green-2)!important;background:linear-gradient(135deg,rgba(51,157,85,.28),rgba(24,108,59,.18))!important;
        border-color:rgba(89,212,123,.38)!important;box-shadow:inset 0 0 18px rgba(89,212,123,.06)!important;
      }

      /* KPIs viram filtros rápidos, sem ocupar altura */
      body.email-center-v4 .em-v2-kpis{
        display:flex!important;align-items:center;gap:7px!important;overflow:auto;padding:0 0 2px!important;
      }
      body.email-center-v4 .em-v2-kpi{
        min-height:36px!important;width:auto!important;flex:0 0 auto!important;gap:7px!important;padding:7px 11px!important;
        border-radius:9px!important;background:#0a211d!important;border:1px solid rgba(72,180,131,.24)!important;
        box-shadow:none!important;transform:none!important;
      }
      body.email-center-v4 .em-v2-kpi:hover{border-color:rgba(89,212,123,.58)!important;background:#0c2a23!important}
      body.email-center-v4 .em-v2-kpi-icon{width:17px!important;height:17px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important}
      body.email-center-v4 .em-v2-kpi-label{font-size:10px!important;color:#c3d2ca!important;letter-spacing:.035em!important}
      body.email-center-v4 .em-v2-kpi-value{font:800 11px/1 system-ui,sans-serif!important;color:var(--mail-text)!important;margin:0!important}
      body.email-center-v4 .em-v2-kpi-hint{display:none!important}
      body.email-center-v4 .em-v2-kpi > div:last-child{display:flex;align-items:center;gap:6px}

      /* Barra de filtros */
      body.email-center-v4 .emails-smart-page .em-v2-filter-card{
        padding:10px!important;border-radius:14px!important;background:#071612!important;border:1px solid var(--mail-line)!important;box-shadow:none!important;
      }
      body.email-center-v4 .emails-smart-page .em-filter{display:grid!important;grid-template-columns:170px 170px minmax(230px,1fr) auto!important;gap:8px!important}
      body.email-center-v4 .emails-smart-page .em-field input,
      body.email-center-v4 .emails-smart-page .em-field select,
      body.email-center-v4 .em-v3-extra-filters select{
        min-height:39px!important;border-radius:10px!important;background:#071a16!important;border-color:rgba(87,205,142,.18)!important;color:var(--mail-text)!important;
      }
      body.email-center-v4 .em-v3-extra-filters{display:grid!important;grid-template-columns:repeat(3,minmax(150px,1fr)) auto!important;gap:8px!important;margin-top:8px!important}
      body.email-center-v4 .em-v3-extra-filters .em-v3-clear{min-height:39px;border-radius:10px!important}

      /* Estrutura principal */
      body.email-center-v4 .emails-smart-page #emDetailGrid{
        display:grid!important;grid-template-columns:minmax(330px,34%) minmax(430px,1fr) 190px!important;gap:10px!important;align-items:stretch!important;
      }
      body.email-center-v4 .emails-smart-page #emDetailGrid > .em-card{
        min-height:660px;padding:12px!important;border-radius:15px!important;background:linear-gradient(180deg,#081713,#06120f)!important;
        border:1px solid var(--mail-line)!important;box-shadow:0 18px 44px rgba(0,0,0,.18)!important;
      }
      body.email-center-v4 .emails-smart-page .em-step-head{display:none!important}
      body.email-center-v4 .emails-smart-page .em-col-list::after,
      body.email-center-v4 .emails-smart-page .em-col-main::after{display:none!important}

      /* Caixa de entrada */
      .em-v4-inbox-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:3px 4px 11px;border-bottom:1px solid var(--mail-line);margin-bottom:8px}
      .em-v4-inbox-title{display:flex;align-items:center;gap:8px;color:var(--mail-text);font-size:15px;font-weight:850}
      .em-v4-inbox-title i{display:block;width:19px;height:19px;color:var(--mail-green-2)}
      .em-v4-inbox-count{padding:5px 9px;border:1px solid rgba(89,212,123,.2);border-radius:999px;background:rgba(89,212,123,.07);color:#bfd0c6;font-size:10px;font-weight:750;white-space:nowrap}
      body.email-center-v4 .emails-smart-page .em-list{max-height:calc(100vh - 315px)!important;min-height:560px!important;padding:0 3px 0 0!important;overflow:auto}
      body.email-center-v4 .emails-smart-page .em-row{
        padding:11px 10px 11px 12px!important;margin-bottom:7px!important;border-radius:11px!important;background:#091915!important;border:1px solid rgba(255,255,255,.055)!important;
        box-shadow:none!important;position:relative;transition:background .15s,border-color .15s,transform .15s;
      }
      body.email-center-v4 .emails-smart-page .em-row:before{content:'';position:absolute;left:0;top:9px;bottom:9px;width:2px;border-radius:2px;background:transparent}
      body.email-center-v4 .emails-smart-page .em-row:hover{background:#0c211b!important;border-color:rgba(89,212,123,.25)!important;transform:translateY(-1px)!important}
      body.email-center-v4 .emails-smart-page .em-row.active{background:linear-gradient(100deg,rgba(41,148,86,.17),#0a1d18 60%)!important;border-color:rgba(89,212,123,.7)!important}
      body.email-center-v4 .emails-smart-page .em-row.active:before{background:var(--mail-green)!important;box-shadow:0 0 10px rgba(89,212,123,.45)}
      body.email-center-v4 .emails-smart-page .em-avatar.sm{width:29px!important;height:29px!important;border-radius:9px!important;font-size:10px!important}
      body.email-center-v4 .emails-smart-page .em-subject{font-size:12px!important;line-height:1.35!important;color:var(--mail-text)!important;-webkit-line-clamp:2!important;white-space:normal!important}
      body.email-center-v4 .emails-smart-page .em-meta{font-size:10px!important;color:var(--mail-muted)!important}
      body.email-center-v4 .emails-smart-page .em-snippet{font-size:10.5px!important;line-height:1.4!important;color:#81988c!important;-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
      body.email-center-v4 .emails-smart-page .em-badge,
      body.email-center-v4 .emails-smart-page .em-prio{padding:3px 6px!important;font-size:8.5px!important;letter-spacing:.035em!important}

      /* Leitor */
      body.email-center-v4 .emails-smart-page .em-col-main{padding:0!important;overflow:hidden}
      body.email-center-v4 .emails-smart-page #emDetail{padding:12px!important}
      body.email-center-v4 .emails-smart-page #emDetail > .em-detail{gap:10px!important}
      body.email-center-v4 .emails-smart-page .em-envelope{
        margin:0!important;padding:12px 13px!important;border:1px solid rgba(255,255,255,.065)!important;border-radius:12px!important;background:#081713!important;
      }
      body.email-center-v4 .emails-smart-page .em-envelope .em-avatar{width:38px!important;height:38px!important;border-radius:11px!important;font-size:12px!important}
      body.email-center-v4 .emails-smart-page .em-envelope-main h3{font-size:16px!important;margin:0 0 5px!important;padding:0 0 6px!important}
      body.email-center-v4 .emails-smart-page .em-from{font-size:11px!important;margin-top:4px!important}
      body.email-center-v4 .emails-smart-page .em-to,
      body.email-center-v4 .emails-smart-page .em-v2-recipients{font-size:10px!important;margin-top:5px!important}
      body.email-center-v4 .emails-smart-page .em-date{font-size:9.5px!important}

      .em-v4-reader{display:grid;gap:10px}
      .em-v4-reader-tabs{display:flex;align-items:center;gap:5px;padding:4px;border:1px solid var(--mail-line);border-radius:11px;background:#06110e;width:fit-content}
      .em-v4-reader-tab{display:flex;align-items:center;gap:7px;min-height:34px;padding:7px 12px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--mail-muted);font:800 10.5px/1 system-ui,sans-serif;cursor:pointer}
      .em-v4-reader-tab i{display:block;width:16px;height:16px}
      .em-v4-reader-tab.active{color:var(--mail-green-2);background:rgba(89,212,123,.12);border-color:rgba(89,212,123,.28)}
      .em-v4-reader-tab[data-pane="message"].active{color:#9cebe3;background:rgba(56,213,197,.09);border-color:rgba(56,213,197,.25)}
      .em-v4-pane{display:grid;gap:9px}
      .em-v4-pane[hidden]{display:none!important}
      .em-v4-pane-title{display:flex;align-items:center;gap:7px;color:#b7cac0;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.06em;padding:2px 1px}
      .em-v4-pane-title i{display:block;width:15px;height:15px;color:var(--mail-teal)}
      body.email-center-v4 .emails-smart-page .em-insights{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}
      body.email-center-v4 .emails-smart-page .em-insight-cell,
      body.email-center-v4 .emails-smart-page .em-chip{padding:8px 9px!important;border-radius:9px!important;background:#081a15!important;border:1px solid rgba(255,255,255,.055)!important;font-size:9.5px!important}
      body.email-center-v4 .emails-smart-page .em-summary{
        padding:15px 16px!important;border-radius:12px!important;background:linear-gradient(135deg,rgba(80,65,18,.20),rgba(9,21,17,.8))!important;
        border:1px solid rgba(246,189,66,.38)!important;box-shadow:inset 0 0 28px rgba(246,189,66,.025)!important;
      }
      body.email-center-v4 .emails-smart-page .em-summary-label{color:var(--mail-amber)!important;font-size:10px!important;font-weight:900!important}
      body.email-center-v4 .emails-smart-page .em-summary p{font-size:12px!important;line-height:1.65!important;color:#d9e7df!important;text-align:center}
      body.email-center-v4 .emails-smart-page .em-extracted{
        padding:12px 14px!important;border-radius:12px!important;background:#071713!important;border:1px solid rgba(56,213,197,.18)!important;
      }
      body.email-center-v4 .emails-smart-page .em-extracted .em-section-label{color:var(--mail-teal)!important;text-align:center}
      body.email-center-v4 .emails-smart-page .em-section-label{font-size:9.5px!important;padding-bottom:7px!important;margin-bottom:8px!important}
      body.email-center-v4 .emails-smart-page .em-dl{grid-template-columns:minmax(120px,.65fr) 1fr!important;gap:0!important;font-size:10.5px!important}
      body.email-center-v4 .emails-smart-page .em-dl dt,
      body.email-center-v4 .emails-smart-page .em-dl dd{padding:6px 7px!important;border-bottom:1px solid rgba(255,255,255,.045)!important}
      body.email-center-v4 .emails-smart-page .em-dl dt{color:#6ecf9d!important;font-weight:750!important}
      body.email-center-v4 .emails-smart-page .em-dl dd{color:#e5f0ea!important;font-weight:750!important}
      body.email-center-v4 .emails-smart-page .em-attachments{display:flex!important;gap:7px!important;flex-wrap:wrap!important}
      body.email-center-v4 .emails-smart-page .em-attachment{border-radius:9px!important;font-size:9.5px!important;padding:8px 10px!important;background:#081a16!important}
      body.email-center-v4 .emails-smart-page .em-letter{padding:16px!important;border-radius:12px!important;background:#071612!important;border:1px solid rgba(56,213,197,.16)!important}
      body.email-center-v4 .emails-smart-page .em-letter:before{background:var(--mail-teal)!important}
      body.email-center-v4 .emails-smart-page .em-letter pre{max-height:520px!important;font-size:11.5px!important;line-height:1.65!important;color:#dce9e2!important}
      .em-v4-empty-ai{padding:22px;border:1px dashed rgba(89,212,123,.22);border-radius:12px;text-align:center;color:var(--mail-muted);font-size:11px;background:rgba(89,212,123,.025)}

      /* Ações: coluna curta + detalhe sob demanda */
      body.email-center-v4 .emails-smart-page .em-col-action{padding:11px!important;position:relative}
      .em-v4-action-head{display:flex;align-items:center;gap:7px;padding:3px 2px 11px;margin-bottom:8px;border-bottom:1px solid var(--mail-line);color:var(--mail-text);font-size:13px;font-weight:850}
      .em-v4-action-head i{width:16px;height:16px;color:var(--mail-green-2)}
      .em-v4-action-buttons{display:grid;gap:8px}
      .em-v4-action-btn{display:flex;align-items:center;gap:9px;width:100%;min-height:42px;padding:9px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.09);background:#0a1b17;color:#d8e7df;font:800 10.5px/1.15 system-ui,sans-serif;cursor:pointer;text-align:left}
      .em-v4-action-btn i{width:18px;height:18px;flex:none}
      .em-v4-action-btn:hover{transform:translateY(-1px);border-color:rgba(89,212,123,.35)}
      .em-v4-action-btn.forward{color:#93edb0;border-color:rgba(89,212,123,.3);background:rgba(39,132,73,.13)}
      .em-v4-action-btn.reply{color:#8feae0;border-color:rgba(56,213,197,.27);background:rgba(28,126,119,.10)}
      .em-v4-action-btn.archive{color:#c3d0ca}
      .em-v4-action-btn.resolve{color:#a7efb7}
      .em-v4-action-btn.more{margin-top:3px;color:#84998e;background:#07120f}
      .em-v4-action-btn:disabled{opacity:.38;cursor:not-allowed;transform:none}
      body.email-center-v4 .emails-smart-page #emAction{display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--mail-line)}
      body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded{grid-column:3;min-width:330px}
      body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded #emAction{display:block}
      body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded{position:absolute;right:12px;top:12px;bottom:12px;width:min(430px,40vw);z-index:20;overflow:auto;box-shadow:-18px 0 48px rgba(0,0,0,.45)!important}
      body.email-center-v4 .emails-smart-page #emAction .em-detail{gap:9px!important}
      body.email-center-v4 .emails-smart-page #emAction .em-summary,
      body.email-center-v4 .emails-smart-page #emAction .em-reply{padding:12px!important;border-radius:11px!important}
      body.email-center-v4 .emails-smart-page #emAction textarea{min-height:110px!important}
      .em-v4-action-close{display:none;position:sticky;top:0;z-index:4;width:100%;margin:0 0 8px;padding:8px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#0b1915;color:#b9cbc1;font-size:10px;font-weight:800;cursor:pointer}
      body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded .em-v4-action-close{display:block}

      @media(max-width:1450px){
        body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:minmax(300px,32%) minmax(400px,1fr) 170px!important}
      }
      @media(max-width:1180px){
        body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:minmax(300px,38%) minmax(0,1fr)!important}
        body.email-center-v4 .emails-smart-page .em-col-action{grid-column:1/-1!important;min-height:auto!important}
        .em-v4-action-buttons{grid-template-columns:repeat(5,minmax(0,1fr))}
        body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded{position:relative;right:auto;top:auto;bottom:auto;width:auto;grid-column:1/-1!important}
      }
      @media(max-width:820px){
        body.email-center-v4 .emails-smart-page .em-filter,
        body.email-center-v4 .em-v3-extra-filters,
        body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:1fr!important}
        body.email-center-v4 .emails-smart-page #emDetailGrid > .em-card{min-height:auto}
        body.email-center-v4 .emails-smart-page .em-list{min-height:280px!important;max-height:420px!important}
        .em-v4-action-buttons{grid-template-columns:1fr 1fr}
        body.email-center-v4 .emails-smart-page .em-insights{grid-template-columns:1fr!important}
        body.email-center-v4 .emails-smart-page .em-tabs{width:100%!important;overflow:auto}
      }
    `;
    document.head.appendChild(style);
  }

  function visibleEmailRows() {
    return [...document.querySelectorAll('#emList .em-row')].filter((row) => {
      const style = getComputedStyle(row);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function ensureInboxHeader() {
    const list = document.getElementById('emList');
    const column = list?.closest('.em-col-list');
    if (!list || !column) return;

    let head = column.querySelector('.em-v4-inbox-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'em-v4-inbox-head';
      head.innerHTML = `<div class="em-v4-inbox-title"><i>${icons.inbox}</i><span>Caixa de Entrada</span></div><span class="em-v4-inbox-count" id="emV4InboxCount">0 e-mail(s) na lista</span>`;
      column.insertBefore(head, list);
    }
    const count = document.getElementById('emV4InboxCount');
    if (count) count.textContent = `${visibleEmailRows().length} e-mail(s) na lista`;
  }

  function setReaderPane(reader, pane) {
    const isSummary = pane === 'summary';
    reader.querySelector('[data-pane="summary"]')?.classList.toggle('active', isSummary);
    reader.querySelector('[data-pane="message"]')?.classList.toggle('active', !isSummary);
    const summary = reader.querySelector('.em-v4-pane-summary');
    const message = reader.querySelector('.em-v4-pane-message');
    if (summary) summary.hidden = !isSummary;
    if (message) message.hidden = isSummary;
  }

  function ensureReaderTabs() {
    const detailHost = document.getElementById('emDetail');
    const detail = detailHost?.querySelector(':scope > .em-detail');
    if (!detail || detail.querySelector(`#${READER_ID}`)) return;

    const envelope = detail.querySelector(':scope > .em-envelope');
    const messageLetter = detail.querySelector('.em-letter');
    if (!envelope || !messageLetter) return;

    const messageBlock = messageLetter.parentElement;
    const insights = detail.querySelector(':scope > .em-insights');
    const aiSummary = detail.querySelector(':scope > .em-summary');
    const extracted = detail.querySelector(':scope > .em-extracted');
    const attachments = detail.querySelector(':scope > div > .em-attachments')?.parentElement || detail.querySelector('.em-attachments')?.parentElement;

    const reader = document.createElement('div');
    reader.id = READER_ID;
    reader.className = 'em-v4-reader';
    reader.innerHTML = `
      <div class="em-v4-reader-tabs" role="tablist" aria-label="Conteúdo do e-mail">
        <button class="em-v4-reader-tab active" type="button" data-pane="summary" role="tab" aria-selected="true"><i>${icons.ai}</i>Resumo da IA</button>
        <button class="em-v4-reader-tab" type="button" data-pane="message" role="tab" aria-selected="false"><i>${icons.mail}</i>Mensagem original</button>
      </div>
      <section class="em-v4-pane em-v4-pane-summary"></section>
      <section class="em-v4-pane em-v4-pane-message" hidden><div class="em-v4-pane-title"><i>${icons.mail}</i>Mensagem original recebida</div></section>
    `;

    envelope.insertAdjacentElement('afterend', reader);
    const summaryPane = reader.querySelector('.em-v4-pane-summary');
    const messagePane = reader.querySelector('.em-v4-pane-message');

    [insights, aiSummary, extracted, attachments].filter(Boolean).forEach((node) => summaryPane.appendChild(node));
    if (!aiSummary && !extracted) {
      const empty = document.createElement('div');
      empty.className = 'em-v4-empty-ai';
      empty.textContent = 'A IA ainda não registrou um resumo estruturado para esta mensagem.';
      summaryPane.appendChild(empty);
    }
    if (messageBlock) messagePane.appendChild(messageBlock);

    reader.querySelectorAll('.em-v4-reader-tab').forEach((button) => {
      button.addEventListener('click', () => {
        setReaderPane(reader, button.dataset.pane);
        reader.querySelectorAll('.em-v4-reader-tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab === button)));
      });
    });
  }

  function findExistingAction(name) {
    return document.querySelector(`#emAction [data-action="${name}"]`);
  }

  function openAdvanced(target) {
    const aside = document.querySelector('#emDetailGrid .em-col-action');
    if (!aside) return;
    actionExpanded = true;
    aside.classList.add('em-v4-expanded');
    requestAnimationFrame(() => {
      const node = target === 'reply'
        ? aside.querySelector('#emAction .em-reply')
        : aside.querySelector('#emAction .em-summary');
      node?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (target === 'reply') aside.querySelector('#emAction textarea')?.focus({ preventScroll: true });
    });
  }

  function closeAdvanced() {
    const aside = document.querySelector('#emDetailGrid .em-col-action');
    actionExpanded = false;
    aside?.classList.remove('em-v4-expanded');
  }

  function ensureActionRail() {
    const action = document.getElementById('emAction');
    const aside = action?.closest('.em-col-action');
    if (!action || !aside) return;

    let rail = aside.querySelector('.em-v4-action-ui');
    if (!rail) {
      rail = document.createElement('div');
      rail.className = 'em-v4-action-ui';
      rail.innerHTML = `
        <div class="em-v4-action-head"><i>${icons.send}</i><span>Ações</span></div>
        <div class="em-v4-action-buttons">
          <button class="em-v4-action-btn forward" type="button" data-v4-action="forward"><i>${icons.send}</i><span>Encaminhar</span></button>
          <button class="em-v4-action-btn reply" type="button" data-v4-action="reply"><i>${icons.reply}</i><span>Responder</span></button>
          <button class="em-v4-action-btn archive" type="button" data-v4-action="archive"><i>${icons.archive}</i><span>Arquivar</span></button>
          <button class="em-v4-action-btn resolve" type="button" data-v4-action="resolved"><i>${icons.check}</i><span>Resolvido</span></button>
          <button class="em-v4-action-btn more" type="button" data-v4-action="more"><i>${icons.more}</i><span>Mais opções</span></button>
        </div>
        <button class="em-v4-action-close" type="button">← Voltar às ações rápidas</button>
      `;
      aside.insertBefore(rail, action);

      rail.addEventListener('click', (event) => {
        const button = event.target.closest('[data-v4-action]');
        if (button) {
          const what = button.dataset.v4Action;
          if (what === 'forward' || what === 'reply') return openAdvanced(what);
          if (what === 'more') return actionExpanded ? closeAdvanced() : openAdvanced('forward');
          const original = findExistingAction(what);
          if (original) original.click();
          return;
        }
        if (event.target.closest('.em-v4-action-close')) closeAdvanced();
      });
    }

    const hasEmail = Boolean(document.querySelector('#emDetail .em-envelope'));
    rail.querySelectorAll('[data-v4-action]').forEach((button) => {
      if (button.dataset.v4Action === 'more') return;
      button.disabled = !hasEmail;
    });
    if (actionExpanded) aside.classList.add('em-v4-expanded');
  }

  function enhance() {
    addStyle();
    document.body.classList.add('email-center-v4');
    ensureInboxHeader();
    ensureReaderTabs();
    ensureActionRail();
  }

  function scheduleEnhance() {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhance, 30);
  }

  function start() {
    enhance();
    const page = document.getElementById('pageContent') || document.body;
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.em-row,[data-kpi-filter],.em-v3-extra-filters,.em-filter')) scheduleEnhance();
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
