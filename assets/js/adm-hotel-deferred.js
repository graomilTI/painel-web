// A tela de Hotéis foi zerada — este arquivo agora só carrega os módulos de
// Alojamentos sob demanda quando o hash aponta pra #alojamentos.
const VERSION = '20261024-aloj4';

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

let alojamentosPromise = null;

function loadAlojamentosModules() {
  if (alojamentosPromise) return alojamentosPromise;
  alojamentosPromise = new Promise((resolve) => schedule(async () => {
    await Promise.allSettled([
      importSafe('./modules/hospedagem-alojamentos/controle.js?v=20261024-aloj4'),
      importSafe('./modules/hospedagem-alojamentos/pagamentos.js?v=20261024-aloj4'),
      importSafe('./modules/hospedagem-alojamentos/compras.js?v=20261024-aloj4'),
      importSafe('./modules/hospedagem-alojamentos/hospedados.js?v=20261024-aloj4'),
    ]);
    console.info(`[hosp-deferred] módulos de Alojamentos carregados ${VERSION}`);
    resolve();
  }));
  return alojamentosPromise;
}

function loadForCurrentMode() {
  if (currentMode() === 'alojamentos') loadAlojamentosModules();
}

loadForCurrentMode();
window.addEventListener('hashchange', loadForCurrentMode);
