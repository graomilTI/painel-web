const VERSION = '20260824-mode-lazy1';

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

let hotelsPromise = null;
let alojamentosPromise = null;

function loadHotelsExtras() {
  if (hotelsPromise) return hotelsPromise;
  hotelsPromise = new Promise((resolve) => schedule(async () => {
    await Promise.allSettled([
      importSafe('./adm-hotel-dashboard-map.js?v=20260824-mode-lazy1'),
      importSafe('./adm-hotel-redesign-integracoes.js?v=20260824-mode-lazy1'),
      importSafe('./adm-hotel-redesign-cadastro-hotel.js?v=20260824-mode-lazy1'),
    ]);
    console.info(`[hosp-deferred] melhorias de Hotéis carregadas ${VERSION}`);
    resolve();
  }));
  return hotelsPromise;
}

function loadAlojamentosModules() {
  if (alojamentosPromise) return alojamentosPromise;
  alojamentosPromise = new Promise((resolve) => schedule(async () => {
    // Estes módulos faziam consultas de alojamentos mesmo na tela de Hotéis.
    // Agora só entram em memória quando o usuário realmente abre Alojamentos.
    await Promise.allSettled([
      importSafe('./adm-hotel-alojamentos-v2.js?v=20260824-mode-lazy1'),
      importSafe('./adm-hotel-separacao-modulos.js?v=20260824-mode-lazy1'),
      importSafe('./adm-hotel-alojamentos-pagamentos.js?v=20260824-mode-lazy1'),
      importSafe('./adm-hotel-hospedados.js?v=20260824-mode-lazy1'),
    ]);
    console.info(`[hosp-deferred] módulos de Alojamentos carregados ${VERSION}`);
    resolve();
  }));
  return alojamentosPromise;
}

function loadForCurrentMode() {
  if (currentMode() === 'alojamentos') return loadAlojamentosModules();
  return loadHotelsExtras();
}

loadForCurrentMode();
window.addEventListener('hashchange', loadForCurrentMode);
