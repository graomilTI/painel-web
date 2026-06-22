const STYLE_ID = 'programacaoMobileUiFixStyles';

function injectMobileStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @media (max-width: 900px) {
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
      }

      .prog-toolbar-row {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
        align-items: stretch !important;
      }

      .prog-tfield,
      .prog-tfield-sup,
      .prog-tfield-date,
      .prog-tfield-search,
      #progLoadContext,
      .prog-save-main {
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
        gap: 10px !important;
      }

      .prog-steps-compact,
      .steps-wrap {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        width: 100% !important;
        gap: 8px !important;
        overflow: visible !important;
      }

      .prog-steps-compact .stepbtn,
      .stepbtn {
        width: 100% !important;
        min-height: 46px !important;
        white-space: normal !important;
        line-height: 1.15 !important;
        padding: 9px 8px !important;
        border-radius: 14px !important;
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
