const SW_VERSION = '20261026-sem-reload-na-saida1';

export function registerPanelPwa() {
  if (!('serviceWorker' in navigator)) return;

  const canRegister =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!canRegister) return;

  // O mesmo arquivo é carregado por URLs diferentes (com e sem ?v=) e cada URL é um módulo
  // próprio: sem esta guarda o registro e os listeners abaixo rodariam mais de uma vez.
  if (window.__painelPwaRegistered) return;
  window.__painelPwaRegistered = true;

  // Páginas como Agentes saem por navegação completa. Se o navegador instalar um service worker
  // novo nesse meio tempo, o controllerchange abaixo recarregava a página atual e o reload
  // cancelava a navegação em andamento: o clique no menu voltava para a mesma tela. A página de
  // destino já abre com o service worker novo, então o reload não faz falta quando se está saindo.
  let leavingPage = false;
  window.addEventListener('beforeunload', () => { leavingPage = true; });
  window.addEventListener('pagehide', () => { leavingPage = true; });
  window.addEventListener('pageshow', () => { leavingPage = false; });

  const start = async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloadingForUpdate) return;
      if (leavingPage || document.visibilityState !== 'visible') return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    try {
      const registration = await navigator.serviceWorker.register(
        `./sw.js?v=${SW_VERSION}`,
        { scope: './', updateViaCache: 'none' }
      );

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // Não depende da verificação periódica do navegador: sempre consulta a
      // versão atual do service worker ao abrir o painel.
      await registration.update();
    } catch (error) {
      console.warn('[pwa] service worker', error);
    }
  };

  // Carregado depois do load (ex.: import dinâmico do router), o evento já passou.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
}

registerPanelPwa();
