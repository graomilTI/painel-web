import { requireAuth } from './authGuard.js';
import { renderAppLayout } from './layout.js';
import { bindLayoutActions } from './layoutActions.js';
import { initAgentUpdateStatus } from './agentUpdateStatus.js';
import { initAgentDataMode } from './agentDataMode.js';
import { initGestorMenuAjustes } from './gestor-menu-ajustes.js';
import { initProgramacaoRuntimeFixes } from './programacao-runtime-fixes.js';
import { initRouter } from './router.js';
import './searchableSelect.js';

// Aviso de "nova versão disponível": router.js e o resto do bootstrap
// compartilhado (layout, auth etc.) não têm cache-busting por query string
// como os scripts de patch da Programação -- uma aba já aberta antes de um
// deploy fica com o módulo antigo na memória até um reload completo (nem o
// service worker resolve isso sozinho, só evita refetch repetido). Em vez de
// deixar o usuário descobrir na marra (feature quebrada, precisa adivinhar
// que é F5), poll leve comparando o ETag/Last-Modified do router.js a cada
// alguns minutos e mostra um aviso discreto pra atualizar quando mudar.
const ROUTER_VERSION_URL = new URL('./router.js', import.meta.url).href;
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let lastRouterVersionTag = null;
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
    const res = await fetch(ROUTER_VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const tag = res.headers.get('etag') || res.headers.get('last-modified') || res.headers.get('content-length') || '';
    if (!tag) return;
    if (lastRouterVersionTag === null) { lastRouterVersionTag = tag; return; }
    if (tag !== lastRouterVersionTag) showUpdateBanner();
  } catch { /* rede instável/offline — não é crítico, tenta de novo no próximo intervalo */ }
}

function startUpdateWatcher() {
  if (window.__pgcUpdateWatcherStarted) return;
  window.__pgcUpdateWatcherStarted = true;
  checkForNewVersion();
  setInterval(checkForNewVersion, VERSION_CHECK_INTERVAL_MS);
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
