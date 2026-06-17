export function registerPanelPwa() {
  if (!('serviceWorker' in navigator)) return;

  const canRegister =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!canRegister) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .catch((error) => console.warn('[pwa] service worker', error));
  });
}

registerPanelPwa();
