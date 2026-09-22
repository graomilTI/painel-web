const CACHE_NAME = 'grao1000-gestor-pwa-v17';
const STATIC_ASSETS = [
  '/painel/gestor-app',
  '/gestor-app.html',
  '/assets/css/gestor-app.css',
  '/assets/js/gestor-app.js',
  '/assets/js/layout.js',
  '/styles.css',
  '/assets/js/supabaseClient.js',
  '/assets/js/auth.js',
  '/assets/js/paths.js',
  '/manifest.webmanifest',
  '/logo-grao1000.svg',
  '/assets/icons/pwa-192.png',
  '/assets/icons/pwa-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: 'reload' }))).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/gestor-app.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Já tem no cache: responde na hora e revalida em segundo plano —
        // erro de rede aqui não pode derrubar a resposta já entregue.
        fetch(req).then((res) => {
          if (res && res.status === 200) caches.open(CACHE_NAME).then((cache) => cache.put(req, res)).catch(() => null);
        }).catch(() => null);
        return cached;
      }
      // Sem cache ainda (ex: versão nova do arquivo): precisa mesmo da rede.
      // Se a rede falhar aqui, deixa o erro propagar de verdade em vez de
      // responder com `undefined` (isso quebra o fetch do jeito errado e
      // trava o app sem nenhum aviso, em vez de simplesmente falhar).
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => null);
        }
        return res;
      });
    })
  );
});
