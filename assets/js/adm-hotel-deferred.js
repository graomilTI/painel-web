const VERSION = '20260821-deferred1';

function currentMode() {
  return String(location.hash || '').toLowerCase().includes('aloj') ? 'alojamentos' : 'hoteis';
}

async function importSafe(path) {
  try {
    await import(path);
  } catch (error) {
    console.error(`[hosp-deferred] falha ao carregar ${path}`, error);
  }
}

function schedule(callback) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 2200 });
    return;
  }
  window.setTimeout(callback, 650);
}

if (currentMode() === 'hoteis') {
  schedule(async () => {
    await Promise.allSettled([
      importSafe('./adm-hotel-dashboard-map.js?v=20260821-deferred1'),
      importSafe('./adm-hotel-redesign-integracoes.js?v=20260821-deferred1'),
      importSafe('./adm-hotel-redesign-cadastro-hotel.js?v=20260821-deferred1'),
    ]);
    console.info(`[hosp-deferred] melhorias carregadas ${VERSION}`);
  });
}
