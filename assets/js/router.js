// Navegação suave (soft-nav) para um allowlist explícito de páginas.
//
// Por que existe: o painel é multi-página (sem SPA); todo clique em link
// interno hoje é um reload completo do browser, reexecutando auth+layout+
// motor de notificações antes do conteúdo da própria página aparecer. Este
// módulo intercepta cliques em páginas allowlisted, troca só #pageContent
// via history.pushState, e deixa qualquer página NÃO listada (a maioria)
// navegar normalmente — fallback automático, sem risco pras páginas fora
// do allowlist.
//
// Checklist pra promover uma página nova pro allowlist:
//   1. Confirmar que o shell HTML segue o padrão (app-shell/sidebar/topbar/#pageContent).
//   2. Confirmar um único script de módulo por página (ou consolidar antes).
//   3. Extrair a função de render pra `export async function renderContent(container, userContext)`.
//   4. Auditar a função por suposições de "só roda uma vez" (listeners/timers
//      sem guarda) e adicionar guard tipo `window.__xInited` onde precisar.
//   5. Se precisar de CSS extra, adicionar um carregamento de <link> na entrada (ver TODO extraStyles).
//   6. Adicionar entrada em SOFT_NAV_PAGES abaixo.
//   7. Testar manualmente: carga direta, navegação suave até a página, navegação
//      suave pra longe e de volta (confirma que o cache de módulo ES re-renderiza
//      certo), botão Voltar/Avançar do browser, e uma falha simulada (throw dentro
//      do renderContent) pra confirmar que cai pro reload normal em vez de travar.
//   8. Revisão normal via PR.

import { normalizePath, canOpenPath, getFirstAllowedPath } from './authGuard.js';
import { loadUserContext } from './sessionStore.js';
import { renderAppLayout } from './layout.js';
import { bindLayoutActions } from './layoutActions.js';
import { toPanelUrl } from './paths.js';

const SOFT_NAV_PAGES = new Map([
  ['patrimonios', { title: 'Patrimônios', module: () => import('./patrimonios.js') }],
  ['historico-colaboradores', { title: 'Histórico de Importações', module: () => import('./historicoColaboradores.js') }],
  ['os', { title: 'OS', module: () => import('./os-page.js') }],
  ['consultar-colaboradores', { title: 'Consultar Base de Colaboradores', module: () => import('./consultarColaboradores.js') }],
]);

function routeNameFromUrl(url) {
  const clean = normalizePath(url.pathname);
  const parts = clean.split('/').filter(Boolean);
  const painelIndex = parts.findIndex((part) => part.toLowerCase() === 'painel');
  const last = painelIndex >= 0 ? parts[painelIndex + 1] : parts[parts.length - 1];
  return normalizePath(`${last || 'dashboard'}${url.hash || ''}`);
}

function currentRouteName() {
  return routeNameFromUrl(new URL(window.location.href));
}

function shouldHandleAsNormalNavigation(event) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function findAnchor(target) {
  let el = target;
  while (el && el !== document.body) {
    if (el.tagName === 'A' && el.hasAttribute('href')) return el;
    el = el.parentElement;
  }
  return null;
}

function setTransitioning(on) {
  document.documentElement.classList.toggle('is-route-transitioning', on);
}

function renderRoute(routeName, entry, mod, userContext) {
  if (entry.title) document.title = `${entry.title} · Painel`;

  renderAppLayout({ userContext, currentPageTitle: entry.title });
  bindLayoutActions();

  const content = document.getElementById('pageContent');
  if (content && typeof mod.renderContent === 'function') {
    content.innerHTML = '';
    mod.renderContent(content, userContext);
  }

  window.scrollTo(0, 0);

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('is-route-transitioning', 'is-route-booting');
    document.documentElement.classList.add('is-route-ready');
  });
}

async function navigateSoft(routeName, href) {
  const baseRoute = routeName.split('#')[0];
  const entry = SOFT_NAV_PAGES.get(baseRoute);
  if (!entry) {
    window.location.href = href;
    return;
  }

  const userContext = loadUserContext();
  if (!userContext) {
    window.location.href = href;
    return;
  }

  if (!canOpenPath(userContext, routeName)) {
    window.location.href = toPanelUrl(getFirstAllowedPath(userContext));
    return;
  }

  setTransitioning(true);
  try {
    const mod = await entry.module();
    if (typeof mod.renderContent !== 'function') {
      throw new Error(`Módulo de "${baseRoute}" não exporta renderContent`);
    }
    history.pushState({ routeName }, '', href);
    renderRoute(routeName, entry, mod, userContext);
  } catch (err) {
    console.error('[router] falha na navegação suave, caindo para reload completo:', err);
    window.location.href = href;
  }
}

function onLinkClick(event) {
  if (!shouldHandleAsNormalNavigation(event)) return;

  const anchor = findAnchor(event.target);
  if (!anchor) return;
  if (anchor.target && anchor.target !== '_self') return;
  if (anchor.hasAttribute('download')) return;

  const rawHref = anchor.getAttribute('href') || '';
  if (/^(mailto:|tel:|javascript:)/i.test(rawHref)) return;

  let url;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;

  const targetRoute = routeNameFromUrl(url);
  const entry = SOFT_NAV_PAGES.get(targetRoute.split('#')[0]);
  if (!entry) return; // não está na allowlist — deixa a navegação nativa acontecer
  if (targetRoute === currentRouteName()) return; // mesma rota (ex: só hash mudou)

  event.preventDefault();
  navigateSoft(targetRoute, url.href);
}

function onPopState() {
  const routeName = currentRouteName();
  const baseRoute = routeName.split('#')[0];
  const entry = SOFT_NAV_PAGES.get(baseRoute);
  const userContext = loadUserContext();

  if (!entry || !userContext || !canOpenPath(userContext, routeName)) {
    window.location.reload();
    return;
  }

  setTransitioning(true);
  entry.module()
    .then((mod) => renderRoute(routeName, entry, mod, userContext))
    .catch((err) => {
      console.error('[router] falha ao renderizar via popstate, recarregando:', err);
      window.location.reload();
    });
}

export function initRouter() {
  if (window.__painelRouterBound) return;
  window.__painelRouterBound = true;
  document.addEventListener('click', onLinkClick, true);
  window.addEventListener('popstate', onPopState);
}

export { shouldHandleAsNormalNavigation };
