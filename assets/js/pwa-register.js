const SW_VERSION = '20260811-toolbar-mobile-v13';

export function registerPanelPwa() {
  if (!('serviceWorker' in navigator)) return;

  const canRegister =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!canRegister) return;

  window.addEventListener('load', async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloadingForUpdate) return;
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
  });
}

registerPanelPwa();
