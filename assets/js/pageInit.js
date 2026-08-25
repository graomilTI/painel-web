import { requireAuth } from './authGuard.js';
import { renderAppLayout } from './layout.js';
import { bindLayoutActions } from './layoutActions.js';
import { initAgentUpdateStatus } from './agentUpdateStatus.js';
import { initAgentDataMode } from './agentDataMode.js';
import { initGestorMenuAjustes } from './gestor-menu-ajustes.js';
import { initProgramacaoRuntimeFixes } from './programacao-runtime-fixes.js';
import { initRouter } from './router.js';
import './painel-design-system.js?v=20260724-layout1';
import './searchableSelect.js?v=20260819-respeita-hidden';
import './logistica-saldo-filtros.js?v=20260803-saldo-filtros1';
import './logistica-abertura-upload.js?v=20260803-upload-autofill1';
import './pwa-register.js?v=20260713-cache-v10';

// Algumas páginas são compostas por vários módulos complementares ou ainda
// executam boot próprio no topo do módulo. A navegação suave pode importar o
// módulo e, ao mesmo tempo, chamar renderContent(), causando dois boots e duas
// cargas concorrentes. Essas rotas usam navegação completa e versionada.
const FULL_PAGE_RELEASES = new Map([
  ['adm-hotel', '20260825-fase1'],
  ['adm-logistica', '20260714-logistica-v4'],
]);

function routeFromPath(pathname) {
  return String(pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase() || 'dashboard';
}

function installFreshModuleNavigation() {
  if (window.__freshModuleNavigationBound) return;
  window.__freshModuleNavigationBound = true;

  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return;

    let url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }

    if (url.origin !== window.location.origin) return;

    const route = routeFromPath(url.pathname);
    const release = FULL_PAGE_RELEASES.get(route);
    if (!release) return;

    const currentRoute = routeFromPath(window.location.pathname);
    const targetPathAndHash = `${url.pathname}${url.hash}`;
    const currentPathAndHash = `${window.location.pathname}${window.location.hash}`;
    if (route === currentRoute && targetPathAndHash === currentPathAndHash) return;

    url.searchParams.set('_release', release);
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(url.href);
  }, true);
}

installFreshModuleNavigation();

// Aviso de "nova versão disponível": uma aba já aberta antes de um deploy fica
// com os módulos antigos na memória até um reload completo (nem o service
// worker resolve isso sozinho, só evita refetch repetido), e o cache-busting
// por ?v= nos <script> só age no reload da página. Em vez de deixar o usuário
// descobrir na marra (feature quebrada, precisa adivinhar que é F5), o painel
// faz poll de version.json — arquivo gerado pelo CI a cada deploy com o SHA do
// commit (ver .github/workflows/pages.yml). Isso detecta QUALQUER deploy, não
// só mudanças no router.js, sem depender de bump manual de versão.
const VERSION_URL = new URL('../../version.json', import.meta.url).href;
const VERSION_CHECK_INTERVAL_MS = 3 * 60 * 1000;
let knownVersionTag = null;
let updateBannerShown = false;

function showUpdateBanner() {
  if (updateBannerShown || document.getElementById('pgcUpdateBanner')) return;
  updateBannerShown = true;
  const bar = document.createElement('div');
  bar.id = 'pgcUpdateBanner';
  bar.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;background:#123524;color:#eef7f2;border:1px solid rgba(111,208,165,.4);border-radius:999px;padding:8px 8px 8px 16px;display:flex;align-items:center;gap:10px;font-size:13px;font-family:inherit;box-shadow:0 8px 24px rgba(0,0,0,.4)';
  bar.innerHTML = '<span>Nova versão do painel disponível.</span><button type="button" data-refresh style="background:#22c55e;color:#052e16;border:0;border-radius:999px;padding:6px 14px;font-weight:800;cursor:pointer;font-size:12px">Atualizar</button>';
  bar.querySelector('[data-refresh]').addEventListener('click', () => window.location.reload());
  document.body.appendChild(bar);
}

async function checkForNewVersion() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return;
    // version.json = { version: "<sha>", ... }. Se por algum motivo não vier o
    // campo (arquivo antigo/malformado), cai pro ETag/Last-Modified do próprio
    // arquivo como sinal de mudança.
    let tag = '';
    try { tag = (await res.clone().json())?.version || ''; } catch { /* não é JSON */ }
    if (!tag) tag = res.headers.get('etag') || res.headers.get('last-modified') || '';
    if (!tag) return;
    if (knownVersionTag === null) { knownVersionTag = tag; return; }
    if (tag !== knownVersionTag) showUpdateBanner();
  } catch { /* rede instável/offline — não é crítico, tenta de novo no próximo intervalo */ }
}

function startUpdateWatcher() {
  if (window.__pgcUpdateWatcherStarted) return;
  window.__pgcUpdateWatcherStarted = true;
  checkForNewVersion();
  setInterval(checkForNewVersion, VERSION_CHECK_INTERVAL_MS);
  // Checa também quando o usuário volta pra aba (deixou aberta o dia todo é o
  // caso mais comum de ficar preso numa versão antiga).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForNewVersion();
  });
}

function currentRouteName() {
  return String(window.location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase() || 'dashboard';
}

function finishBoot() {
  document.documentElement.classList.remove('is-route-booting', 'is-route-transitioning');
  document.documentElement.classList.add('is-route-ready', 'is-app-booted');
}

function renderBootError(message) {
  finishBoot();
  const content = document.getElementById('pageContent');
  if (content) {
    content.innerHTML = `<section class="card mt-16"><div class="log-empty">${message}</div></section>`;
    return;
  }

  document.body.innerHTML = `<main style="min-height:100vh;padding:24px;background:#06130e;color:#eef7f2;font-family:system-ui,-apple-system,sans-serif"><section style="max-width:760px;border:1px solid rgba(111,208,165,.22);border-radius:18px;padding:18px;background:rgba(8,22,17,.78)">${message}</section></main>`;
}

function withRejectTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function initProtectedPage(title, renderContent) {
  // Quando um módulo é importado pelo router durante soft-nav, o próprio router
  // será responsável por montar o layout e chamar renderContent. Muitos módulos
  // ainda mantêm initProtectedPage() no topo; sem esta guarda, ambos executam em
  // paralelo, duplicando RPCs/consultas e podendo deixar a tela preta.
  if (
    document.documentElement.classList.contains('is-app-booted') &&
    document.documentElement.classList.contains('is-route-transitioning')
  ) {
    return;
  }

  document.documentElement.classList.remove('is-route-transitioning');
  document.documentElement.classList.add('is-route-booting');

  // Evita a tela preta sem retorno: se algum passo do boot prender, a tela é liberada
  // e o usuário vê um aviso em vez de ficar com o painel vazio.
  const bootWatchdog = setTimeout(() => {
    finishBoot();
    const content = document.getElementById('pageContent');
    if (content && !content.children.length) {
      content.innerHTML = '<section class="card mt-16"><div class="log-empty">Carregamento demorou mais que o esperado. Recarregue a página ou confira a aba Console para ver o erro.</div></section>';
    }
  }, 9000);

  let userContext = null;
  try {
    userContext = await withRejectTimeout(requireAuth(), 12000, 'Tempo excedido ao validar usuário/permissões. Recarregue a página.');
  } catch (error) {
    clearTimeout(bootWatchdog);
    console.error('[pageInit] Falha no boot protegido:', error);
    renderBootError(`Erro ao validar usuário/permissões: ${String(error?.message || error)}.`);
    return;
  }

  if (!userContext) {
    clearTimeout(bootWatchdog);
    finishBoot();
    return;
  }

  try {
    initRouter();
    renderAppLayout({ userContext, currentPageTitle: title });
    bindLayoutActions();
    initGestorMenuAjustes();
    initAgentUpdateStatus();
    startUpdateWatcher();
  } catch (error) {
    clearTimeout(bootWatchdog);
    console.error('[pageInit] Falha ao montar layout:', error);
    renderBootError(`Erro ao montar layout: ${String(error?.message || error)}.`);
    return;
  }

  const content = document.getElementById('pageContent');
  if (content && typeof renderContent === 'function') {
    Promise.resolve(renderContent(content, userContext)).catch((error) => {
      console.error('[pageInit] Falha ao renderizar a página:', error);
      content.innerHTML = `<section class="card mt-16"><div class="log-empty">Erro ao carregar esta página: ${String(error?.message || error)}. Tente recarregar.</div></section>`;
    });

    try {
      initProgramacaoRuntimeFixes(content);
      // Informativos já faz o carregamento automático internamente.
      // Evita que a camada auxiliar dispare cliques duplicados e carregue a mesma base duas vezes.
      if (currentRouteName() !== 'logistica-informativos') initAgentDataMode(content);
    } catch (error) {
      console.warn('[pageInit] Complementos da página falharam:', error);
    }
  }

  clearTimeout(bootWatchdog);
  requestAnimationFrame(finishBoot);
}
