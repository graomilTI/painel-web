const REDESIGN_GUARD_VERSION = '20260819-fix-boot-flag-por-root';

function waitForBaseShell() {
  return new Promise((resolve) => {
    const ready = () => document.querySelector('#pageContent .adm-hosp-tabs');
    if (ready()) return resolve();

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (ready() || tries >= 200) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

async function ensureRedesign() {
  await waitForBaseShell();
  if (document.getElementById('hospRedesignRoot')) return;

  // O primeiro import pode ter montado antes do shell legado terminar o
  // próprio render. O query string distinto força uma nova avaliação do
  // módulo somente quando o root realmente desapareceu.
  await import(`./adm-hotel-v2.js?v=${REDESIGN_GUARD_VERSION}-remount`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureRedesign, { once: true });
} else {
  ensureRedesign();
}
