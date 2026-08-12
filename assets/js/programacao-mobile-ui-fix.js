const STYLE_ID = 'programacaoMobileUiFixStyles';

function injectMobileStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @media (max-width: 900px) {
      /* O redesign usa zoom:1.15 no desktop. Em celulares isso aumenta a
         largura calculada de toda a aplicação e fazia a lista/nav parecerem
         cortadas. O tamanho mobile já é definido abaixo, sem zoom global. */
      .app-shell {
        zoom: 1 !important;
      }

      html, body {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden !important;
      }

      body {
        background: #090914;
      }

      .app-shell {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
      }

      .sidebar {
        display: none !important;
      }

      .content-wrap {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
      }

      .topbar {
        position: sticky !important;
        top: 0 !important;
        z-index: 60 !important;
        padding: 12px max(12px, env(safe-area-inset-left)) !important;
        gap: 10px !important;
        align-items: center !important;
        background: rgba(9, 9, 20, .96) !important;
        backdrop-filter: blur(16px) !important;
        border-bottom: 1px solid rgba(255,255,255,.06) !important;
      }

      .topbar h1,
      #pageTitle {
        font-size: 20px !important;
        line-height: 1.05 !important;
        margin: 0 !important;
      }

      #welcomeUser,
      .topbar .meta {
        max-width: 54vw !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        font-size: 12px !important;
      }

      .topbar-actions {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        flex-shrink: 0 !important;
      }

      #roleBadge {
        display: none !important;
      }

      #signOutBtn {
        min-height: 38px !important;
        padding: 0 12px !important;
        border-radius: 12px !important;
        font-size: 12px !important;
      }

      .page-main {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        padding: 12px max(10px, env(safe-area-inset-left)) calc(24px + env(safe-area-inset-bottom)) !important;
        overflow-x: hidden !important;
      }

      .card,
      .prog-toolbar,
      .prog-list-card {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        border-radius: 20px !important;
        padding: 12px !important;
        overflow: visible !important;
      }

      .prog-toolbar {
        position: sticky !important;
        top: 64px !important;
        z-index: 45 !important;
        background: rgba(13, 13, 24, .98) !important;
        backdrop-filter: blur(14px) !important;
        display: block !important;
      }

      body.mobile-gestor-mode .prog-toolbar {
        position: relative !important;
        top: 0 !important;
      }

      .prog-toolbar .prog-toolbar-row {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 10px !important;
        align-items: stretch !important;
      }

      .prog-toolbar .prog-toolbar-row + .prog-toolbar-row {
        margin-top: 10px !important;
        padding-top: 10px !important;
      }

      .prog-tfield-sup,
      .prog-tfield-search,
      .prog-save-main {
        grid-column: 1 / -1 !important;
        width: 100% !important;
        max-width: none !important;
        flex: none !important;
      }

      .prog-toolbar #progLoadContext,
      .prog-toolbar #progGerarPdf,
      .prog-toolbar #progCompartilhar {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 44px !important;
        margin: 0 !important;
        padding: 0 10px !important;
        font-size: 13px !important;
        white-space: nowrap !important;
      }

      .prog-toolbar #progLoadContext { grid-column: 1 !important; }
      .prog-toolbar #progCompartilhar { grid-column: 2 !important; }
      .prog-toolbar #progGerarPdf {
        grid-column: 1 / -1 !important;
        order: initial !important;
      }

      .prog-tfield-date,
      .prog-tfield-os-status {
        width: 100% !important;
        max-width: none !important;
        flex: none !important;
      }

      .prog-tfield label {
        font-size: 10px !important;
      }

      .prog-tfield select,
      .prog-tfield input,
      #progLoadContext,
      .prog-save-main {
        min-height: 46px !important;
        font-size: 14px !important;
        border-radius: 14px !important;
      }

      .prog-toolbar-spacer {
        display: none !important;
      }

      .prog-toolbar-row-steps {
        grid-template-columns: 1fr !important;
        gap: 10px !important;
      }

      .prog-steps-compact,
      .steps-wrap {
        display: flex !important;
        flex-wrap: nowrap !important;
        width: 100% !important;
        gap: 5px !important;
        overflow: visible !important;
      }

      .prog-steps-compact .stepbtn,
      .stepbtn {
        flex: 1 1 0 !important;
        width: auto !important;
        min-width: 0 !important;
        min-height: 38px !important;
        white-space: normal !important;
        line-height: 1.1 !important;
        padding: 8px 2px !important;
        border-radius: 12px !important;
        text-align: center !important;
        font-size: 12px !important;
      }

      #progCtxFeedback,
      .prog-toolbar .feedback {
        width: 100% !important;
        max-width: none !important;
        white-space: normal !important;
        font-size: 12px !important;
        line-height: 1.35 !important;
        padding: 2px 1px !important;
      }

      .prog-list-card {
        margin-top: 10px !important;
      }

      /* Lista de O.S. do fluxo atual (lista + drawer). A implementação
         desktop é uma tabela larga; no celular cada linha vira um cartão
         sem alterar o DOM nem os listeners de clique. */
      #pldShell,
      #pldShell .pld-list-col,
      #pldListaBody,
      #pldShell .pld-table-wrap {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      #pldShell .pld-filters {
        gap: 10px !important;
      }

      #pldShell .pld-filters-row {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
        width: 100% !important;
      }

      #pldShell .pld-filters-row > * {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
      }

      #pldShell .pld-filters-row > :first-child {
        grid-column: auto !important;
      }

      #pldShell .pld-toggle {
        white-space: normal !important;
        line-height: 1.35 !important;
        align-items: flex-start !important;
      }

      #pldShell .pld-table-wrap {
        max-height: none !important;
        overflow: visible !important;
        border: 0 !important;
        background: transparent !important;
      }

      #pldShell .pld-table,
      #pldShell .pld-table tbody {
        display: block !important;
        width: 100% !important;
      }

      #pldShell .pld-table thead {
        display: none !important;
      }

      #pldShell .pld-row {
        position: relative !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        gap: 8px 12px !important;
        width: 100% !important;
        margin-bottom: 9px !important;
        padding: 13px 38px 13px 14px !important;
        border: 1px solid rgba(52,211,153,.14) !important;
        border-radius: 16px !important;
        background: rgba(2,6,23,.34) !important;
      }

      #pldShell .pld-row td {
        display: block !important;
        width: auto !important;
        min-width: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        overflow-wrap: anywhere !important;
      }

      #pldShell .pld-row td:nth-child(1),
      #pldShell .pld-row td:nth-child(2),
      #pldShell .pld-row td:nth-child(3) {
        grid-column: 1 !important;
      }

      #pldShell .pld-row td:nth-child(4) {
        grid-column: 2 !important;
        grid-row: 1 / span 2 !important;
        align-self: center !important;
        text-align: right !important;
      }

      #pldShell .pld-row td:nth-child(5) {
        position: absolute !important;
        right: 13px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
      }

      #pldShell .pld-os-num { font-size: 16px !important; }
      #pldShell .pld-cliente {
        font-size: 13px !important;
        line-height: 1.3 !important;
      }
      #pldShell .pld-local-uf { font-size: 11px !important; }
      #pldShell .pld-rem {
        max-width: 110px !important;
        font-size: 12px !important;
        color: #86efac !important;
      }

      #pldOverlayRoot .pld-drawer {
        width: 100% !important;
        max-width: 100% !important;
        padding: max(16px, env(safe-area-inset-top)) 16px calc(82px + env(safe-area-inset-bottom)) !important;
      }

      /* KPIs (Total filtrado, Na tela, Para atender...) só fazem sentido no desktop */
      #osLiteStats {
        display: none !important;
      }

      .prog-list,
      #progList {
        width: 100% !important;
        max-width: 100% !important;
        overflow: visible !important;
      }

      .prog-section-title {
        margin: 12px 0 8px !important;
        align-items: center !important;
      }

      .prog-section-title h4 {
        font-size: 14px !important;
      }

      .prog-table-wrap {
        width: 100% !important;
        max-width: 100% !important;
        overflow: visible !important;
        border: 0 !important;
        background: transparent !important;
      }

      .prog-table {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        border-collapse: separate !important;
        border-spacing: 0 !important;
      }

      .prog-table thead {
        display: none !important;
      }

      .prog-table tbody {
        display: grid !important;
        gap: 10px !important;
        width: 100% !important;
      }

      .prog-table tr {
        display: grid !important;
        width: 100% !important;
        min-width: 0 !important;
        gap: 9px !important;
        padding: 12px !important;
        border-radius: 18px !important;
        border: 1px solid rgba(52,211,153,.14) !important;
        background: rgba(15, 23, 42, .42) !important;
        box-shadow: 0 16px 38px rgba(0,0,0,.22) !important;
      }

      .prog-table td {
        display: grid !important;
        width: 100% !important;
        min-width: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        gap: 6px !important;
        white-space: normal !important;
      }

      .prog-table td::before {
        content: attr(data-mobile-label);
        display: block;
        color: #86efac;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .prog-table td[data-mobile-label="Colaborador"]::before {
        display: none;
      }

      .prog-table .colab-name {
        min-width: 0 !important;
        width: 100% !important;
        font-size: 16px !important;
        overflow-wrap: anywhere !important;
      }

      .prog-table .colab-meta {
        font-size: 12px !important;
      }

      .prog-table input,
      .prog-table select,
      .prog-table textarea {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        min-height: 44px !important;
        border-radius: 13px !important;
        font-size: 14px !important;
      }

      .prog-tipo-selector {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
        width: 100% !important;
      }

      .prog-tipo-btn {
        width: 100% !important;
        min-height: 42px !important;
        white-space: normal !important;
        line-height: 1.1 !important;
        padding: 8px 7px !important;
      }

      .prog-indisponivel-wrap,
      .prog-placa-wrap {
        width: 100% !important;
        max-width: none !important;
        display: grid !important;
        grid-template-columns: 1fr !important;
      }

      .prog-placa-wrap input {
        width: 100% !important;
      }

      .prog-estadia-selector {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        min-width: 0 !important;
        width: 100% !important;
        gap: 8px !important;
      }

      .prog-estadia-card {
        width: 100% !important;
        min-height: 88px !important;
        padding: 10px 8px !important;
      }

      .prog-extra-card {
        display: grid !important;
        grid-template-columns: 1fr !important;
        width: 100% !important;
        gap: 8px !important;
      }

      .prog-extra-total {
        text-align: left !important;
      }

      .prog-save-actions,
      .prog-os-modal-actions,
      .kg-modal-actions {
        display: grid !important;
        grid-template-columns: 1fr !important;
      }

      .prog-os-modal-backdrop {
        align-items: flex-end !important;
        padding: 10px !important;
      }

      .prog-os-modal {
        width: 100% !important;
        max-height: 88vh !important;
        padding: 16px !important;
        border-radius: 22px 22px 12px 12px !important;
      }

      .prog-os-modal-head {
        display: grid !important;
        gap: 10px !important;
      }

      .prog-os-modal-head h3 {
        font-size: 18px !important;
      }
    }

    @media (max-width: 380px) {
      .prog-steps-compact,
      .steps-wrap,
      .prog-tipo-selector,
      .prog-estadia-selector {
        grid-template-columns: 1fr !important;
      }

      .topbar h1,
      #pageTitle {
        font-size: 18px !important;
      }
    }

    /* Camada determinística para o App Gestor. Diversos módulos desta página
       injetam CSS assíncrono; ancorar no estado do shell impede que um patch
       desktop carregado depois reconstrua o cabeçalho como display:contents. */
    body.mobile-gestor-mode {
      min-width: 0 !important;
      overflow-x: clip !important;
      background: #06130e !important;
    }

    body.mobile-gestor-mode .app-shell {
      width: 100% !important;
      min-width: 0 !important;
      zoom: 1 !important;
      background: #06130e !important;
    }

    body.mobile-gestor-mode .page-main {
      width: 100% !important;
      min-width: 0 !important;
      padding-inline: 10px !important;
      background: #06130e !important;
    }

    body.mobile-gestor-mode .prog-toolbar {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      margin: 0 0 10px !important;
      padding: 12px !important;
      overflow: hidden !important;
      background: #0a1a12 !important;
      border: 1px solid rgba(111,208,165,.2) !important;
    }

    body.mobile-gestor-mode .prog-toolbar > .prog-toolbar-row {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 9px !important;
      width: 100% !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }

    body.mobile-gestor-mode .prog-toolbar > .prog-toolbar-row:first-child {
      grid-template-rows: auto 46px 46px !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-context-group,
    body.mobile-gestor-mode .prog-toolbar .prog-actions-block,
    body.mobile-gestor-mode .prog-toolbar .prog-action-row {
      display: contents !important;
    }

    body.mobile-gestor-mode .prog-toolbar > .prog-toolbar-row + .prog-toolbar-row {
      margin-top: 10px !important;
      padding-top: 10px !important;
      border-top: 1px solid rgba(111,208,165,.12) !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-tfield-sup,
    body.mobile-gestor-mode .prog-toolbar .prog-tfield-date {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 5px !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-tfield-sup {
      grid-column: 1 !important;
      grid-row: 1 !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-tfield-date {
      grid-column: 2 !important;
      grid-row: 1 !important;
    }

    body.mobile-gestor-mode .prog-toolbar .prog-tfield label {
      margin: 0 !important;
      white-space: nowrap !important;
      font-size: 10px !important;
      font-weight: 900 !important;
      line-height: 1.2 !important;
      letter-spacing: .08em !important;
      text-transform: uppercase !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progSupCombo,
    body.mobile-gestor-mode .prog-toolbar #progDataRef {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: 44px !important;
      margin: 0 !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progLoadContext,
    body.mobile-gestor-mode .prog-toolbar #progGerarPdf,
    body.mobile-gestor-mode .prog-toolbar #progCompartilhar,
    body.mobile-gestor-mode .prog-toolbar #progDuplicar {
      width: 100% !important;
      order: initial !important;
      min-width: 0 !important;
      padding-inline: 4px !important;
      font-size: 11.5px !important;
      min-height: 46px !important;
      height: 46px !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progGerarPdf {
      grid-column: 1 !important;
      grid-row: 2 !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progCompartilhar {
      grid-column: 2 !important;
      grid-row: 2 !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progLoadContext {
      grid-column: 1 !important;
      grid-row: 3 !important;
    }

    body.mobile-gestor-mode .prog-toolbar #progDuplicar {
      grid-column: 2 !important;
      grid-row: 3 !important;
    }

    body.mobile-gestor-mode .prog-toolbar-spacer,
    body.mobile-gestor-mode #progSearchWrap,
    body.mobile-gestor-mode #progSaveProgramacao {
      display: none !important;
    }

    body.mobile-gestor-mode #progSteps {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 7px !important;
      grid-column: 1 / -1 !important;
      width: 100% !important;
      min-width: 0 !important;
    }

    body.mobile-gestor-mode #progSteps .stepbtn {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      width: 100% !important;
      min-width: 0 !important;
      min-height: 42px !important;
      padding: 7px 5px !important;
      overflow: hidden !important;
    }

    body.mobile-gestor-mode #progSteps .stepbtn-label {
      display: inline !important;
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      font-size: 10px !important;
    }

    body.mobile-gestor-mode #progCtxFeedback {
      grid-column: 1 / -1 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 2px 0 0 !important;
      text-align: left !important;
      white-space: normal !important;
    }

    /* A Programação também é aberta pelo painel móvel por perfis que não têm
       o papel literal GESTOR. Nesse caminho o shell aplica mobile-panel-mode,
       portanto o grid não pode depender de mobile-gestor-mode. */
    body.mobile-panel-mode .prog-toolbar > .prog-toolbar-row:first-child {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      grid-template-rows: auto 46px 46px !important;
      gap: 9px !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-context-group,
    body.mobile-panel-mode .prog-toolbar .prog-actions-block,
    body.mobile-panel-mode .prog-toolbar .prog-action-row {
      display: contents !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-tfield-sup,
    body.mobile-panel-mode .prog-toolbar .prog-tfield-date {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 5px !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-tfield-sup {
      grid-column: 1 !important;
      grid-row: 1 !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-tfield-date {
      grid-column: 2 !important;
      grid-row: 1 !important;
    }

    body.mobile-panel-mode .prog-toolbar .prog-tfield label {
      margin: 0 !important;
      line-height: 1.2 !important;
      white-space: nowrap !important;
    }

    body.mobile-panel-mode .prog-toolbar #progSupCombo,
    body.mobile-panel-mode .prog-toolbar #progDataRef {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: 44px !important;
      margin: 0 !important;
    }

    body.mobile-panel-mode .prog-toolbar #progGerarPdf,
    body.mobile-panel-mode .prog-toolbar #progCompartilhar,
    body.mobile-panel-mode .prog-toolbar #progLoadContext,
    body.mobile-panel-mode .prog-toolbar #progDuplicar {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 46px !important;
      height: 46px !important;
      margin: 0 !important;
      padding-inline: 4px !important;
      font-size: 11.5px !important;
      order: initial !important;
    }

    body.mobile-panel-mode .prog-toolbar #progGerarPdf {
      grid-column: 1 !important;
      grid-row: 2 !important;
    }

    body.mobile-panel-mode .prog-toolbar #progCompartilhar {
      grid-column: 2 !important;
      grid-row: 2 !important;
    }

    body.mobile-panel-mode .prog-toolbar #progLoadContext {
      grid-column: 1 !important;
      grid-row: 3 !important;
    }

    body.mobile-panel-mode .prog-toolbar #progDuplicar {
      grid-column: 2 !important;
      grid-row: 3 !important;
    }

    body.mobile-gestor-mode .prog-list-card,
    body.mobile-gestor-mode #progList,
    body.mobile-gestor-mode #pldShell,
    body.mobile-gestor-mode #pldShell .pld-list-col {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      background: #06130e !important;
    }

    body.mobile-gestor-mode #pldShell .pld-filters-row {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
    }

    body.mobile-gestor-mode #pldShell .pld-filters-row > :first-child {
      grid-column: auto !important;
    }

    body.mobile-gestor-mode #pldShell .pld-filters-row input,
    body.mobile-gestor-mode #pldShell .pld-filters-row select,
    body.mobile-gestor-mode #pldShell .pld-filters-row .ssel-wrap,
    body.mobile-gestor-mode #pldShell .pld-filters-row .ssel-input {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      height: 40px !important;
      font-size: 11.5px !important;
      text-overflow: ellipsis !important;
    }

    body.mobile-gestor-mode #pldShell .pld-count-row {
      gap: 8px !important;
      flex-wrap: wrap !important;
    }
  `;
  document.head.appendChild(style);
}

function labelTableCells() {
  document.querySelectorAll('.prog-table').forEach((table) => {
    const labels = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, index) => {
        if (!td.dataset.mobileLabel) td.dataset.mobileLabel = labels[index] || '';
      });
    });
  });
}

function applyMobileFix() {
  injectMobileStyles();
  labelTableCells();
}

let scheduled = false;
function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyMobileFix();
  });
}

new MutationObserver(scheduleApply).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', scheduleApply);
scheduleApply();
