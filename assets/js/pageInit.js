import { requireAuth } from './authGuard.js';
import { renderAppLayout } from './layout.js';
import { bindLayoutActions } from './layoutActions.js';
import { initAgentUpdateStatus } from './agentUpdateStatus.js';
import { initAgentDataMode } from './agentDataMode.js';
import { initGestorMenuAjustes } from './gestor-menu-ajustes.js';
import './searchableSelect.js';

export async function initProtectedPage(title, renderContent) {
  document.documentElement.classList.remove('is-route-transitioning');
  document.documentElement.classList.add('is-route-booting');
  const userContext = await requireAuth();
  if (!userContext) return;

  renderAppLayout({ userContext, currentPageTitle: title });
  bindLayoutActions();
  initGestorMenuAjustes();
  initAgentUpdateStatus();

  const content = document.getElementById('pageContent');
  if (content && typeof renderContent === 'function') {
    renderContent(content, userContext);
    initAgentDataMode(content);
  }

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('is-route-booting');
    document.documentElement.classList.add('is-route-ready');
  });
}
