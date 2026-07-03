import { requireAuth } from './authGuard.js';
import { renderAppLayout } from './layout.js';
import { bindLayoutActions } from './layoutActions.js';
import { initAgentUpdateStatus } from './agentUpdateStatus.js';
import { initAgentDataMode } from './agentDataMode.js';
import { initGestorMenuAjustes } from './gestor-menu-ajustes.js';
import { initProgramacaoRuntimeFixes } from './programacao-runtime-fixes.js';
import { initRouter } from './router.js';
import './searchableSelect.js';

function currentRouteName() {
  return String(window.location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase() || 'dashboard';
}

export async function initProtectedPage(title, renderContent) {
  document.documentElement.classList.remove('is-route-transitioning');
  document.documentElement.classList.add('is-route-booting');
  const userContext = await requireAuth();
  if (!userContext) return;

  initRouter();

  renderAppLayout({ userContext, currentPageTitle: title });
  bindLayoutActions();
  initGestorMenuAjustes();
  initAgentUpdateStatus();

  const content = document.getElementById('pageContent');
  if (content && typeof renderContent === 'function') {
    renderContent(content, userContext);
    initProgramacaoRuntimeFixes(content);

    // Informativos já faz o carregamento automático internamente.
    // Evita que a camada auxiliar dispare cliques duplicados e carregue a mesma base duas vezes.
    if (currentRouteName() !== 'logistica-informativos') initAgentDataMode(content);
  }

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('is-route-booting');
    // is-app-booted marca que o fade-in de boot (routeFadeIn) já tocou uma vez.
    // Navegação suave (router.js) nunca remove is-route-ready/is-app-booted, então
    // o CSS não replay-a essa animação a cada troca de página.
    document.documentElement.classList.add('is-route-ready', 'is-app-booted');
  });
}
