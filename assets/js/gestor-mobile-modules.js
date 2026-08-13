const MOBILE_BREAKPOINT = 768;
const TABLE_SELECTORS = ['.hosp-table', '.cmp-table', '.log-table', '.cc-table', '.pat-table'];

function isGestorMobile() {
  return document.body.classList.contains('mobile-gestor-mode') && window.innerWidth <= MOBILE_BREAKPOINT;
}

function cleanLabel(value) {
  return String(value || '')
    .replace(/[↕↑↓⇅▲▼]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function directHeaders(table) {
  const thead = [...table.children].find((el) => el.tagName === 'THEAD');
  if (!thead) return [];
  const rows = [...thead.children].filter((el) => el.tagName === 'TR');
  const row = rows.at(-1);
  if (!row) return [];
  return [...row.children]
    .filter((el) => el.tagName === 'TH')
    .map((th) => cleanLabel(th.innerText || th.textContent));
}

function directBodyRows(table) {
  const tbody = [...table.children].find((el) => el.tagName === 'TBODY');
  return tbody ? [...tbody.children].filter((el) => el.tagName === 'TR') : [];
}

function labelTable(table) {
  const headers = directHeaders(table);
  if (!headers.length) return;

  directBodyRows(table).forEach((row) => {
    let headerIndex = 0;
    [...row.children].forEach((cell) => {
      if (cell.tagName !== 'TD') return;
      const span = Math.max(1, Number(cell.colSpan) || 1);
      if (span === 1 && !cell.dataset.label) {
        const label = headers[headerIndex];
        if (label) cell.dataset.label = label;
      }
      headerIndex += span;
    });
  });
}

function labelKnownTables(root = document) {
  TABLE_SELECTORS.forEach((selector) => {
    root.querySelectorAll?.(selector).forEach(labelTable);
    if (root.matches?.(selector)) labelTable(root);
  });
}

function markMobileCards(root = document) {
  root.querySelectorAll?.('.hosp-table tbody tr, .cmp-table tbody tr, .log-table tbody tr, .cc-table tbody tr, .pat-table tbody tr')
    .forEach((row) => row.classList.add('gestor-mobile-table-card'));
}

function enhance() {
  if (!isGestorMobile()) return;
  labelKnownTables(document);
  markMobileCards(document);
}

function injectStyles() {
  if (document.getElementById('gestorMobileModulesStyles')) return;
  const style = document.createElement('style');
  style.id = 'gestorMobileModulesStyles';
  style.textContent = `
    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      body.mobile-gestor-mode .page-main {
        padding-left: 12px !important;
        padding-right: 12px !important;
        padding-bottom: calc(82px + env(safe-area-inset-bottom)) !important;
      }

      body.mobile-gestor-mode .page-main > .card,
      body.mobile-gestor-mode .page-main > section.card,
      body.mobile-gestor-mode .page-main .cmp-request-card,
      body.mobile-gestor-mode .page-main .cmp-history-card {
        border-radius: 18px !important;
      }

      /* Hospedagem: mantém o mesmo fluxo/banco do desktop, mas troca a grade
         larga por formulário e cards empilhados no celular. */
      body.mobile-gestor-mode .hosp-workspace {
        min-height: 0 !important;
        border-radius: 18px !important;
      }
      body.mobile-gestor-mode .hosp-workspace-body {
        display: block !important;
        min-height: 0 !important;
      }
      body.mobile-gestor-mode .hosp-form-pane {
        border-right: 0 !important;
        border-bottom: 1px solid var(--line) !important;
      }
      body.mobile-gestor-mode .hosp-form-intro,
      body.mobile-gestor-mode .hosp-form,
      body.mobile-gestor-mode .hosp-list-pane {
        padding-left: 12px !important;
        padding-right: 12px !important;
      }
      body.mobile-gestor-mode .hosp-list-pane {
        min-height: 0 !important;
        padding-bottom: 14px !important;
      }
      body.mobile-gestor-mode .hosp-stats {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        width: 100% !important;
      }
      body.mobile-gestor-mode .hosp-stat {
        min-width: 0 !important;
        padding: 11px 12px !important;
      }
      body.mobile-gestor-mode .hosp-refresh-wrap,
      body.mobile-gestor-mode .hosp-refresh {
        width: 100% !important;
      }
      body.mobile-gestor-mode .hosp-refresh {
        min-height: 44px !important;
      }
      body.mobile-gestor-mode .hosp-form-actions {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
      }
      body.mobile-gestor-mode .hosp-form-actions .btn {
        width: 100% !important;
        min-height: 44px !important;
      }
      body.mobile-gestor-mode .hosp-feedback {
        grid-column: 1 / -1 !important;
      }

      /* Contato Cliente: filtros e formulário deixam de formar colunas estreitas. */
      body.mobile-gestor-mode .cc-form-grid,
      body.mobile-gestor-mode .cc-filters-grid {
        grid-template-columns: 1fr !important;
        gap: 11px !important;
      }
      body.mobile-gestor-mode .cc-form-grid .field-span-2 {
        grid-column: 1 !important;
      }
      body.mobile-gestor-mode .cc-section-head {
        flex-direction: column !important;
        align-items: stretch !important;
      }
      body.mobile-gestor-mode .cc-filter-actions,
      body.mobile-gestor-mode .cc-form-actions {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        width: 100% !important;
        gap: 8px !important;
      }
      body.mobile-gestor-mode .cc-filter-actions button,
      body.mobile-gestor-mode .cc-form-actions button {
        width: 100% !important;
        min-height: 44px !important;
        margin: 0 !important;
      }
      body.mobile-gestor-mode .cc-form-actions > :not(button) {
        grid-column: 1 / -1 !important;
      }
      body.mobile-gestor-mode .cc-upload-zone {
        padding: 16px 12px !important;
      }
      body.mobile-gestor-mode .cc-file-item {
        width: calc(50% - 5px) !important;
        box-sizing: border-box !important;
      }
      body.mobile-gestor-mode .cc-file-item img,
      body.mobile-gestor-mode .cc-file-icon {
        width: 100% !important;
      }

      /* Patrimônio: controles passam a ocupar a largura útil e histórico/cadastro
         viram cartões, sem exigir arrasto horizontal. */
      body.mobile-gestor-mode .pat-tabs {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        width: 100% !important;
      }
      body.mobile-gestor-mode .pat-hist-card {
        min-height: 44px !important;
        justify-content: center !important;
      }
      body.mobile-gestor-mode .pat-actions,
      body.mobile-gestor-mode .pat-hist-controls {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 9px !important;
      }
      body.mobile-gestor-mode .pat-actions .btn,
      body.mobile-gestor-mode .pat-hist-controls input,
      body.mobile-gestor-mode .pat-download-select {
        width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
        min-height: 44px !important;
      }

      /* Compras: a regra mobile já transforma tabelas em cartões. Aqui garantimos
         largura/touch e os rótulos são preenchidos pelo enhancer acima. */
      body.mobile-gestor-mode .cmp-tabs {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        width: 100% !important;
      }
      body.mobile-gestor-mode .cmp-tab,
      body.mobile-gestor-mode .cmp-history-filter,
      body.mobile-gestor-mode #cmpRefresh {
        min-height: 44px !important;
      }
      body.mobile-gestor-mode .cmp-history-head {
        align-items: stretch !important;
      }
      body.mobile-gestor-mode #cmpRefresh {
        width: 100% !important;
      }

      /* Logística: preserva Abrir OS/Atualizar e as ações de conferência/saldo/
         finalização, usando toda a largura do card no touch. */
      body.mobile-gestor-mode .log-tab-bar {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        width: 100% !important;
      }
      body.mobile-gestor-mode .log-tab {
        width: 100% !important;
        min-height: 44px !important;
        padding: 9px 10px !important;
      }
      body.mobile-gestor-mode .atz-filtros {
        grid-template-columns: 1fr 1fr !important;
      }
      body.mobile-gestor-mode .atz-acoes {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
      body.mobile-gestor-mode .atz-acao-btn {
        min-height: 42px !important;
        padding: 7px 5px !important;
      }
      body.mobile-gestor-mode .atz-painel {
        display: grid !important;
        grid-template-columns: 1fr !important;
        align-items: stretch !important;
      }
      body.mobile-gestor-mode .atz-painel .log-input,
      body.mobile-gestor-mode .atz-painel input[type="file"],
      body.mobile-gestor-mode .atz-painel button,
      body.mobile-gestor-mode .log-btn-ok {
        width: 100% !important;
        max-width: none !important;
        min-height: 44px !important;
      }

      /* Tabelas dos módulos do gestor viram cartões. A marcação data-label é
         preenchida a partir do THEAD em tempo de execução, sem duplicar regra de negócio. */
      body.mobile-gestor-mode .hosp-table-wrap,
      body.mobile-gestor-mode .cc-table-wrap,
      body.mobile-gestor-mode .pat-table-wrap {
        overflow: visible !important;
        border: 0 !important;
        background: transparent !important;
      }
      body.mobile-gestor-mode .hosp-table,
      body.mobile-gestor-mode .cc-table,
      body.mobile-gestor-mode .pat-table {
        min-width: 0 !important;
        width: 100% !important;
        border-collapse: separate !important;
        border-spacing: 0 !important;
      }
      body.mobile-gestor-mode .hosp-table > thead,
      body.mobile-gestor-mode .cc-table > thead,
      body.mobile-gestor-mode .pat-table > thead {
        display: none !important;
      }
      body.mobile-gestor-mode .hosp-table,
      body.mobile-gestor-mode .hosp-table > tbody,
      body.mobile-gestor-mode .hosp-table > tbody > tr,
      body.mobile-gestor-mode .hosp-table > tbody > tr > td,
      body.mobile-gestor-mode .cc-table,
      body.mobile-gestor-mode .cc-table > tbody,
      body.mobile-gestor-mode .cc-table > tbody > tr,
      body.mobile-gestor-mode .cc-table > tbody > tr > td,
      body.mobile-gestor-mode .pat-table,
      body.mobile-gestor-mode .pat-table > tbody,
      body.mobile-gestor-mode .pat-table > tbody > tr,
      body.mobile-gestor-mode .pat-table > tbody > tr > td {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      body.mobile-gestor-mode .hosp-table > tbody > tr,
      body.mobile-gestor-mode .cc-table > tbody > tr,
      body.mobile-gestor-mode .pat-table > tbody > tr {
        margin: 0 0 12px !important;
        border: 1px solid rgba(45, 212, 160, .16) !important;
        border-radius: 17px !important;
        overflow: hidden !important;
        background: rgba(3, 18, 12, .58) !important;
      }
      body.mobile-gestor-mode .hosp-table > tbody > tr > td,
      body.mobile-gestor-mode .cc-table > tbody > tr > td,
      body.mobile-gestor-mode .pat-table > tbody > tr > td {
        padding: 10px 12px !important;
        border-bottom: 1px solid rgba(45, 212, 160, .09) !important;
      }
      body.mobile-gestor-mode .hosp-table > tbody > tr > td:last-child,
      body.mobile-gestor-mode .cc-table > tbody > tr > td:last-child,
      body.mobile-gestor-mode .pat-table > tbody > tr > td:last-child {
        border-bottom: 0 !important;
      }
      body.mobile-gestor-mode .hosp-table > tbody > tr > td[data-label]::before,
      body.mobile-gestor-mode .cc-table > tbody > tr > td[data-label]::before,
      body.mobile-gestor-mode .pat-table > tbody > tr > td[data-label]::before {
        content: attr(data-label);
        display: block;
        margin-bottom: 5px;
        color: #6fa589;
        font-size: 9px;
        line-height: 1.2;
        font-weight: 900;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      body.mobile-gestor-mode .hosp-table > tbody > tr > td[colspan]::before,
      body.mobile-gestor-mode .cc-table > tbody > tr > td[colspan]::before,
      body.mobile-gestor-mode .pat-table > tbody > tr > td[colspan]::before {
        display: none !important;
      }
      body.mobile-gestor-mode .hosp-row-actions,
      body.mobile-gestor-mode .cc-row-actions {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        min-width: 0 !important;
      }
      body.mobile-gestor-mode .hosp-row-actions button,
      body.mobile-gestor-mode .cc-row-actions button,
      body.mobile-gestor-mode .pat-table button {
        width: 100% !important;
        min-height: 42px !important;
        text-align: center !important;
      }
      body.mobile-gestor-mode .pat-table input {
        min-height: 44px !important;
      }

      /* Tabelas de Compras e Logística já possuem transformação mobile própria;
         o enhancer só injeta os labels que faltavam em linhas geradas dinamicamente. */
      body.mobile-gestor-mode .cmp-table td[data-label]::before,
      body.mobile-gestor-mode .log-table td[data-label]::before {
        color: #6fa589 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

let raf = 0;
function scheduleEnhance() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(enhance);
}

injectStyles();
new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', scheduleEnhance, { passive: true });
window.addEventListener('popstate', scheduleEnhance);
window.addEventListener('hashchange', scheduleEnhance);
scheduleEnhance();

export function refreshGestorMobileModules() {
  scheduleEnhance();
}
