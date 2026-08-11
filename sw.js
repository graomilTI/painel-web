const CACHE_NAME = 'g1000-painel-pwa-v13';
const SHARE_CACHE = 'g1000-shared-file';

const STATIC_URLS = [
  '/painel/adm-app.html',
  '/painel/compras-estoque.html',
  '/painel/gestor-app.html',
  '/painel/comprovante-mobile.html',
  '/painel/styles.css',
  '/painel/logo-grao1000.svg',
  '/painel/assets/css/adm-app.css',
  '/painel/assets/js/adm-app.js',
  '/painel/assets/js/pwa-register.js',
  '/painel/assets/js/paths.js',
  '/painel/assets/js/auth.js',
  '/painel/assets/js/authGuard.js',
  '/painel/assets/js/sessionStore.js',
  '/painel/assets/js/supabaseClient.js',
  '/painel/assets/js/menuConfig.js',
  '/painel/assets/js/compras-estoque.js',
  '/painel/assets/js/compras-estoque-agrupamento.js',
  '/painel/assets/js/compras-estoque-layout.js',
  '/painel/manifest.webmanifest',
  '/painel/manifest-adm.webmanifest',
  '/painel/assets/icons/pwa-192.png',
  '/painel/assets/icons/pwa-512.png'
];

const HTML_FALLBACKS = new Map([
  ['adm-app', '/painel/adm-app.html'],
  ['compras-estoque', '/painel/compras-estoque.html'],
  ['gestor-app', '/painel/gestor-app.html'],
  ['comprovante-mobile', '/painel/comprovante-mobile.html']
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(STATIC_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== SHARE_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname.includes('comprovante-mobile')) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (isNavigationRequest(event.request)) {
    event.respondWith(networkFirst(event.request, fallbackForPath(url.pathname)));
    return;
  }

  // Código da aplicação precisa vir da rede primeiro. O comportamento anterior
  // (stale-while-revalidate) entregava o JS antigo na primeira abertura após um
  // deploy e só disponibilizava a versão nova no segundo carregamento/hard refresh.
  if (isApplicationCode(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (shouldCacheStatic(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
}

function isApplicationCode(pathname) {
  return pathname.endsWith('.js') || pathname.endsWith('.css');
}

function shouldCacheStatic(pathname) {
  return (
    pathname.startsWith('/painel/assets/') ||
    pathname.endsWith('.webmanifest') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  );
}

function fallbackForPath(pathname) {
  const clean = pathname.replace(/\/$/, '').split('/').pop() || '';
  if (HTML_FALLBACKS.has(clean)) return HTML_FALLBACKS.get(clean);
  if (clean.endsWith('.html')) {
    const withoutExt = clean.replace(/\.html$/i, '');
    return HTML_FALLBACKS.get(withoutExt) || null;
  }
  return null;
}

function freshRequest(request) {
  try {
    return new Request(request, { cache: 'no-store' });
  } catch {
    return request;
  }
}

function canCache(response) {
  return Boolean(response && response.ok && (response.type === 'basic' || response.type === 'default'));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const atualizado = fetch(freshRequest(request))
    .then((response) => {
      if (canCache(response)) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  return cached || (await atualizado) || fetch(request);
}

async function networkFirst(request, fallbackUrl = null) {
  try {
    const response = await fetch(freshRequest(request));
    if (canCache(response)) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (file && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put('/g1000-shared-file', new Response(file, {
        headers: {
          'Content-Type': file.type || 'image/jpeg',
          'X-File-Name': encodeURIComponent(file.name || 'comprovante.jpg')
        }
      }));
    }
  } catch (err) {
    console.warn('[SW] Falha ao capturar arquivo compartilhado:', err);
  }

  return Response.redirect('/painel/comprovante-mobile.html?shared=1', 303);
}
