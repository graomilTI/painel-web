import { toPanelUrl } from './paths.js';

function getCurrentMonthParam() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function buildHistoryUrl() {
  const base = toPanelUrl('consultar-producao');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}mes=${getCurrentMonthParam()}`;
}

function injectStyles() {
  if (document.getElementById('dbProductionHistoryLinkStyles')) return;
  const style = document.createElement('style');
  style.id = 'dbProductionHistoryLinkStyles';
  style.textContent = `
    .db-history-btn {
      text-decoration:none;
      background:rgba(0,200,122,.10) !important;
      border-color:rgba(0,200,122,.30) !important;
      color:#00c87a !important;
      white-space:nowrap;
    }
    .db-history-btn:hover { background:rgba(0,200,122,.17) !important; }
    @media(max-width:720px) {
      .db-section-head { align-items:flex-start; }
      .db-section-head > .db-head-actions { width:100%; justify-content:flex-start; }
    }
  `;
  document.head.appendChild(style);
}

function addHistoryButton() {
  const section = document.getElementById('dbGestorSection');
  const head = section?.querySelector('.db-section-head');
  if (!head || document.getElementById('dbHistoryBtn')) return false;

  injectStyles();

  const refreshBtn = document.getElementById('dbRefreshBtn');
  let actions = head.querySelector('.db-head-actions');

  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'db-head-actions';
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '10px';
    actions.style.flexWrap = 'wrap';

    if (refreshBtn && refreshBtn.parentElement === head) {
      head.insertBefore(actions, refreshBtn);
      actions.appendChild(refreshBtn);
    } else {
      head.appendChild(actions);
    }
  }

  const link = document.createElement('a');
  link.id = 'dbHistoryBtn';
  link.className = 'db-refresh-btn db-history-btn';
  link.href = buildHistoryUrl();
  link.textContent = 'Histórico de produção';
  link.title = 'Ver produção dos meses anteriores';

  actions.insertBefore(link, actions.firstChild);
  return true;
}

if (!addHistoryButton()) {
  const observer = new MutationObserver(() => {
    if (addHistoryButton()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
