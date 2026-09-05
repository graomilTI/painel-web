// Central de E-mails — Layout v4
// Overlay visual sobre emails.js + emails-layout-v3.js.
// Mantém queries, handlers e regras existentes; reorganiza somente apresentação/uso.

(() => {
  const STYLE_ID = 'emails-layout-v4-style';
  const READER_ID = 'emV4Reader';
  let timer = null;
  let actionExpanded = false;

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
      body.email-center-v4{
        --e4-bg:#06100d;--e4-card:#081713;--e4-card2:#0a1c17;
        --e4-line:rgba(92,216,136,.16);--e4-green:#59d47b;--e4-green2:#9af2ad;
        --e4-teal:#38d5c5;--e4-amber:#f6bd42;--e4-red:#ef5b5b;
        --e4-text:#effaf3;--e4-muted:#8fa59a;
        background:radial-gradient(circle at 16% 0,rgba(69,190,111,.12),transparent 26%),var(--e4-bg)!important;
      }
      body.email-center-v4 .emails-smart-page{max-width:none!important}
      body.email-center-v4 .emails-smart-page svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      body.email-center-v4 .emails-smart-page .em-wrap{gap:10px!important}
      body.email-center-v4 .emails-smart-page .em-hero,
      body.email-center-v4 .emails-smart-page .em-v3-health,
      body.email-center-v4 .emails-smart-page .em-v2-step-head{display:none!important}
      /* Badge só vale a pena mostrar quando carrega sinal de verdade — prioridade
         NORMAL (a maioria) e "sem regional/categoria identificada" (placeholder,
         não é dado) só poluem o card sem ajudar a triagem. */
      body.email-center-v4 .emails-smart-page .em-row .em-prio.normal,
      body.email-center-v4 .emails-smart-page .em-row .em-badge.em-v4-noise{display:none!important}

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
      body.email-center-v4 .em-v2-kpi-hint{display:none!important}

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
      body.email-center-v4 .emails-smart-page .em-step-head,
      body.email-center-v4 .emails-smart-page .em-col-list::after,
      body.email-center-v4 .emails-smart-page .em-col-main::after{display:none!important}

      /* Caixa de entrada */
      .em-v4-inbox-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:3px 3px 10px;margin-bottom:7px;border-bottom:1px solid var(--e4-line)}
      .em-v4-inbox-title{display:flex;align-items:center;gap:7px;color:var(--e4-text);font-size:14px;font-weight:850}
      .em-v4-inbox-title i{display:block;width:18px;height:18px;color:var(--e4-green2)}
      .em-v4-inbox-count{padding:4px 8px;border:1px solid rgba(89,212,123,.20);border-radius:999px;background:rgba(89,212,123,.06);color:#b9ccc1;font-size:9.5px;font-weight:750;white-space:nowrap}
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
      .em-v4-reader{display:grid;gap:9px}
      .em-v4-reader-tabs{display:flex;align-items:center;gap:4px;padding:4px;border:1px solid var(--e4-line);border-radius:10px;background:#06110e;width:fit-content}
      .em-v4-reader-tab{display:flex;align-items:center;gap:6px;min-height:33px;padding:7px 11px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--e4-muted);font:800 10px/1 system-ui,sans-serif;cursor:pointer}
      .em-v4-reader-tab i{display:block;width:15px;height:15px}
      .em-v4-reader-tab.active{color:var(--e4-green2);background:rgba(89,212,123,.11);border-color:rgba(89,212,123,.27)}
      .em-v4-reader-tab[data-pane="message"].active{color:#98e9e1;background:rgba(56,213,197,.09);border-color:rgba(56,213,197,.24)}
      .em-v4-pane{display:grid;gap:8px}.em-v4-pane[hidden]{display:none!important}
      .em-v4-pane-title{display:flex;align-items:center;gap:6px;padding:2px 1px;color:#b7c9c0;font-size:9.5px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}
      .em-v4-pane-title i{display:block;width:14px;height:14px;color:var(--e4-teal)}
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
      .em-v4-empty-ai{padding:20px;border:1px dashed rgba(89,212,123,.22);border-radius:11px;text-align:center;color:var(--e4-muted);font-size:10.5px;background:rgba(89,212,123,.025)}

      /* Ações rápidas */
      body.email-center-v4 .emails-smart-page .em-col-action{padding:10px!important;position:relative!important}
      .em-v4-action-head{display:flex;align-items:center;gap:6px;padding:3px 2px 10px;margin-bottom:7px;border-bottom:1px solid var(--e4-line);color:var(--e4-text);font-size:12.5px;font-weight:850}
      .em-v4-action-head i{display:block;width:15px;height:15px;color:var(--e4-green2)}
      .em-v4-action-buttons{display:grid;gap:7px}
      .em-v4-action-btn{display:flex;align-items:center;gap:8px;width:100%;min-height:41px;padding:8px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.09);background:#0a1b17;color:#d8e7df;font:800 10px/1.15 system-ui,sans-serif;cursor:pointer;text-align:left;transition:.15s ease}
      .em-v4-action-btn i{display:block;width:17px;height:17px;flex:none}
      .em-v4-action-btn:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(89,212,123,.34)}
      .em-v4-action-btn.forward{color:#93edb0;border-color:rgba(89,212,123,.29);background:rgba(39,132,73,.13)}
      .em-v4-action-btn.reply{color:#8feae0;border-color:rgba(56,213,197,.26);background:rgba(28,126,119,.10)}
      .em-v4-action-btn.resolve{color:#a7efb7}.em-v4-action-btn.more{color:#899c92;background:#07120f}
      .em-v4-action-btn:disabled{opacity:.36;cursor:not-allowed}
      body.email-center-v4 .emails-smart-page #emAction{display:none!important;margin-top:9px;padding-top:9px;border-top:1px solid var(--e4-line)}
      body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded{
        position:absolute!important;right:10px!important;top:10px!important;bottom:10px!important;width:min(430px,40vw)!important;z-index:20!important;overflow:auto!important;
        box-shadow:-20px 0 50px rgba(0,0,0,.48)!important;
      }
      body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded #emAction{display:block!important}
      .em-v4-action-close{display:none;width:100%;margin:0 0 8px;padding:8px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#0b1915;color:#b9cbc1;font-size:9.5px;font-weight:800;cursor:pointer}
      body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded .em-v4-action-close{display:block}
      body.email-center-v4 .emails-smart-page #emAction .em-detail{gap:8px!important}
      body.email-center-v4 .emails-smart-page #emAction .em-summary,
      body.email-center-v4 .emails-smart-page #emAction .em-reply{padding:11px!important;border-radius:10px!important}
      body.email-center-v4 .emails-smart-page #emAction textarea{min-height:105px!important}

      @media(max-width:1400px){body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:minmax(300px,32%) minmax(390px,1fr) 165px!important}}
      @media(max-width:1160px){
        body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:minmax(300px,38%) minmax(0,1fr)!important}
        body.email-center-v4 .emails-smart-page .em-col-action{grid-column:1/-1!important;min-height:auto!important}
        .em-v4-action-buttons{grid-template-columns:repeat(5,minmax(0,1fr))}
        body.email-center-v4 .emails-smart-page .em-col-action.em-v4-expanded{position:relative!important;right:auto!important;top:auto!important;bottom:auto!important;width:auto!important;grid-column:1/-1!important}
      }
      @media(max-width:820px){
        body.email-center-v4 .emails-smart-page .em-filter,
        body.email-center-v4 .em-v3-extra-filters,
        body.email-center-v4 .emails-smart-page #emDetailGrid{grid-template-columns:1fr!important}
        body.email-center-v4 .emails-smart-page #emDetailGrid>.em-card{min-height:auto!important}
        body.email-center-v4 .emails-smart-page .em-list{min-height:280px!important;max-height:420px!important}
        .em-v4-action-buttons{grid-template-columns:1fr 1fr}
        body.email-center-v4 .emails-smart-page .em-insights{grid-template-columns:1fr!important}
        body.email-center-v4 .emails-smart-page .em-tabs{width:100%!important;overflow:auto!important}
      }
    `;
    document.head.appendChild(style);
  }

  function visibleRows() {
    return [...document.querySelectorAll('#emList .em-row')].filter((row) => getComputedStyle(row).display !== 'none');
  }

  // categoria e regional usam a mesma classe (.em-badge.arquivado) — só dá pra
  // distinguir "placeholder sem dado" de "categoria/regional real" pelo texto.
  const NOISE_BADGE_TEXT = new Set(['SEM REGIONAL IDENTIFICADO', 'SEM CATEGORIA DEFINIDA']);
  function markNoiseBadges() {
    document.querySelectorAll('#emList .em-row .em-badge, #emPerigoList .em-row .em-badge').forEach((badge) => {
      const isNoise = NOISE_BADGE_TEXT.has((badge.textContent || '').trim().toUpperCase());
      badge.classList.toggle('em-v4-noise', isNoise);
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
      head.innerHTML = `<div class="em-v4-inbox-title"><i>${svg.inbox}</i><span>Caixa de Entrada</span></div><span class="em-v4-inbox-count" id="emV4InboxCount">0 e-mail(s) na lista</span>`;
      column.insertBefore(head, list);
    }

    const count = head.querySelector('#emV4InboxCount');
    const label = `${visibleRows().length} e-mail(s) na lista`;
    if (count && count.textContent !== label) count.textContent = label;
  }

  function showPane(reader, pane) {
    const summaryActive = pane === 'summary';
    reader.querySelectorAll('.em-v4-reader-tab').forEach((button) => {
      const active = button.dataset.pane === pane;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const summary = reader.querySelector('.em-v4-pane-summary');
    const message = reader.querySelector('.em-v4-pane-message');
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
    reader.className = 'em-v4-reader';
    reader.innerHTML = `
      <div class="em-v4-reader-tabs" role="tablist" aria-label="Conteúdo do e-mail">
        <button class="em-v4-reader-tab active" type="button" data-pane="summary" role="tab" aria-selected="true"><i>${svg.ai}</i>Resumo da IA</button>
        <button class="em-v4-reader-tab" type="button" data-pane="message" role="tab" aria-selected="false"><i>${svg.mail}</i>Mensagem original</button>
      </div>
      <section class="em-v4-pane em-v4-pane-summary"></section>
      <section class="em-v4-pane em-v4-pane-message" hidden><div class="em-v4-pane-title"><i>${svg.mail}</i>Mensagem original recebida</div></section>`;

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
    messagePane.appendChild(messageBlock);

    reader.addEventListener('click', (event) => {
      const button = event.target.closest('.em-v4-reader-tab');
      if (button) showPane(reader, button.dataset.pane);
    });
  }

  function originalAction(name) {
    return document.querySelector(`#emAction [data-action="${name}"]`);
  }

  function openActionPanel(target) {
    const aside = document.querySelector('#emDetailGrid .em-col-action');
    if (!aside) return;
    actionExpanded = true;
    aside.classList.add('em-v4-expanded');
    requestAnimationFrame(() => {
      const destination = target === 'reply' ? aside.querySelector('#emAction .em-reply') : aside.querySelector('#emAction .em-summary');
      destination?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (target === 'reply') aside.querySelector('#emAction textarea')?.focus({ preventScroll: true });
    });
  }

  function closeActionPanel() {
    actionExpanded = false;
    document.querySelector('#emDetailGrid .em-col-action')?.classList.remove('em-v4-expanded');
  }

  function ensureActionRail() {
    const actionHost = document.getElementById('emAction');
    const aside = actionHost?.closest('.em-col-action');
    if (!actionHost || !aside) return;

    let rail = aside.querySelector('.em-v4-action-ui');
    if (!rail) {
      rail = document.createElement('div');
      rail.className = 'em-v4-action-ui';
      rail.innerHTML = `
        <div class="em-v4-action-head"><i>${svg.send}</i><span>Ações</span></div>
        <div class="em-v4-action-buttons">
          <button class="em-v4-action-btn forward" type="button" data-v4-action="forward"><i>${svg.send}</i><span>Encaminhar</span></button>
          <button class="em-v4-action-btn reply" type="button" data-v4-action="reply"><i>${svg.reply}</i><span>Responder</span></button>
          <button class="em-v4-action-btn archive" type="button" data-v4-action="archive"><i>${svg.archive}</i><span>Arquivar</span></button>
          <button class="em-v4-action-btn resolve" type="button" data-v4-action="resolved"><i>${svg.check}</i><span>Resolvido</span></button>
          <button class="em-v4-action-btn more" type="button" data-v4-action="more"><i>${svg.more}</i><span>Mais opções</span></button>
        </div>
        <button class="em-v4-action-close" type="button">← Voltar às ações rápidas</button>`;
      aside.insertBefore(rail, actionHost);

      rail.addEventListener('click', (event) => {
        const button = event.target.closest('[data-v4-action]');
        if (button) {
          const name = button.dataset.v4Action;
          if (name === 'forward' || name === 'reply') return openActionPanel(name);
          if (name === 'more') return actionExpanded ? closeActionPanel() : openActionPanel('forward');
          originalAction(name)?.click();
          return;
        }
        if (event.target.closest('.em-v4-action-close')) closeActionPanel();
      });
    }

    const hasEmail = Boolean(document.querySelector('#emDetail .em-envelope'));
    rail.querySelectorAll('[data-v4-action]').forEach((button) => {
      if (button.dataset.v4Action !== 'more') button.disabled = !hasEmail;
    });
    if (actionExpanded) aside.classList.add('em-v4-expanded');
  }

  function enhance() {
    addStyles();
    if (!document.body.classList.contains('email-center-v4')) document.body.classList.add('email-center-v4');
    ensureInboxHeader();
    markNoiseBadges();
    ensureReader();
    ensureActionRail();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(enhance, 35);
  }

  function start() {
    enhance();
    const root = document.getElementById('pageContent') || document.body;
    new MutationObserver(schedule).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('.em-row,.em-filter,.em-v3-extra-filters,[data-kpi-filter]')) schedule();
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
