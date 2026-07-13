// Ajustes de UX do mapa da Programação:
// - acrescenta legenda compacta para os formatos dos marcadores;
// - antecipa o carregamento das abas assim que o contexto fica disponível;
// - troca visualmente entre as etapas antes de iniciar qualquer trabalho pesado.

const PATCH_ID = 'programacaoMapaUxFastStyles';
const MAX_CONTEXT_WAIT_MS = 3200;
const CONTEXT_POLL_MS = 45;
const MAP_RENDERER_FLAG = '__pgcDeferredMapRenderer';

function injectStyles() {
  if (document.getElementById(PATCH_ID)) return;
  const style = document.createElement('style');
  style.id = PATCH_ID;
  style.textContent = `
    .pmg-icon-keys{
      display:inline-flex;
      align-items:center;
      gap:8px;
      margin-left:3px;
      padding-left:9px;
      border-left:1px solid rgba(148,163,184,.22);
      white-space:nowrap;
    }
    .pmg-icon-key{
      display:inline-flex;
      align-items:center;
      gap:4px;
      font-size:10px;
      line-height:1;
      color:#b8c9bf;
      font-weight:700;
    }
    .pmg-icon-key svg{
      width:14px;
      height:14px;
      display:block;
      fill:none;
      stroke:#d6fbe9;
      stroke-width:1.8;
      stroke-linecap:round;
      stroke-linejoin:round;
      flex:0 0 auto;
    }
    .pmg-icon-key.is-os svg{fill:#d6fbe9;stroke:#d6fbe9}
    .pgc-map-opening-hint{
      display:flex;
      align-items:center;
      gap:9px;
      min-height:38px;
      margin:0 0 8px;
      padding:8px 11px;
      border:1px solid rgba(52,211,153,.22);
      border-radius:11px;
      background:rgba(6,30,22,.88);
      color:#c8f7df;
      font-size:11px;
      font-weight:800;
      box-sizing:border-box;
    }
    .pgc-map-opening-hint::before{
      content:'';
      width:15px;
      height:15px;
      flex:0 0 auto;
      border-radius:999px;
      border:2px solid rgba(134,239,172,.24);
      border-top-color:#86efac;
      animation:pgcMapOpeningSpin .65s linear infinite;
    }
    @keyframes pgcMapOpeningSpin{to{transform:rotate(360deg)}}
    @media(max-width:1180px){
      .pmg-icon-keys{gap:6px;padding-left:7px}
      .pmg-icon-key{font-size:9px}
      .pmg-icon-key svg{width:13px;height:13px}
    }
    @media(max-width:900px){
      .pmg-icon-keys{width:100%;margin:4px 0 0;padding:4px 0 0;border-left:0;border-top:1px solid rgba(148,163,184,.16)}
    }
  `;
  document.head.appendChild(style);
}

function iconLegendHtml() {
  return `
    <span class="pmg-icon-key is-os" title="Marcador da Ordem de Serviço">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.75 5.58 6.16.9-4.46 4.34 1.05 6.13L12 16.86l-5.5 2.89 1.05-6.13-4.46-4.34 6.16-.9L12 2.8Z"/></svg>
      O.S.
    </span>
    <span class="pmg-icon-key" title="Marcador de colaborador; a letra indica o tipo de contrato">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3.2"/><path d="M5.5 21c.35-4.9 2.55-7.35 6.5-7.35S18.15 16.1 18.5 21"/></svg>
      Colaborador
    </span>
    <span class="pmg-icon-key" title="Marcador de veículo ou motorista vinculado à frota">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16 1.7-5.2c.3-.9 1.1-1.5 2.05-1.5h6.5c.95 0 1.75.6 2.05 1.5L19 16"/><path d="M4 16h16v3H4z"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/></svg>
      Frota
    </span>`;
}

function ensureIconLegend() {
  const legend = document.querySelector('#peqbMapBand .pmg-legend, .pmg-legend');
  if (!legend || legend.querySelector('.pmg-icon-keys')) return false;
  const group = document.createElement('span');
  group.className = 'pmg-icon-keys';
  group.setAttribute('aria-label', 'Legenda dos ícones do mapa');
  group.innerHTML = iconLegendHtml();
  const help = legend.querySelector('.pmg-help');
  legend.insertBefore(group, help || null);
  return true;
}

function currentContextSignature() {
  const directId = window.__progGetProgramacaoId?.() || '';
  const map = window.__progGetProgramacaoIdMap?.();
  const mapSignature = map instanceof Map
    ? [...map.entries()].map(([key, value]) => `${key}:${value}`).sort().join('|')
    : '';
  return `${directId}::${mapSignature}`;
}

function contextIsReady() {
  const supervisao = document.getElementById('progSup')?.value || '';
  const directId = window.__progGetProgramacaoId?.() || null;
  const map = window.__progGetProgramacaoIdMap?.();
  return Boolean(supervisao && (directId || (map instanceof Map && map.size)));
}

let contextWatchToken = 0;
function accelerateContextLoad() {
  const token = ++contextWatchToken;
  const startedAt = performance.now();
  const beforeSignature = currentContextSignature();

  const check = () => {
    if (token !== contextWatchToken) return;
    const elapsed = performance.now() - startedAt;
    const signatureChanged = currentContextSignature() !== beforeSignature;
    const canUseExistingContext = elapsed >= 180;

    if (typeof window.__pgcProgramacaoReload === 'function'
      && contextIsReady()
      && (signatureChanged || canUseExistingContext)) {
      Promise.resolve(window.__pgcProgramacaoReload()).catch((error) => {
        console.warn('[programacao-mapa-ux-fast] carregamento antecipado:', error);
      });
      return;
    }

    if (elapsed < MAX_CONTEXT_WAIT_MS) setTimeout(check, CONTEXT_POLL_MS);
  };

  queueMicrotask(check);
}

function openingHint(show) {
  const pane = document.getElementById('pgcPane2');
  if (!pane) return;
  let hint = pane.querySelector('.pgc-map-opening-hint');
  if (show) {
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'pgc-map-opening-hint';
      hint.textContent = 'Abrindo mapa e posicionando os marcadores...';
      pane.prepend(hint);
    }
  } else {
    hint?.remove();
  }
}

function showStepImmediately(step, button) {
  const key = String(step || '');
  const pane = document.getElementById(`pgcPane${key}`);
  if (!pane) return false;

  document.querySelectorAll('#pgcTabsShell .pgc-tab-pane').forEach((item) => {
    item.hidden = item !== pane;
  });
  document.querySelectorAll('#progSteps .stepbtn').forEach((item) => {
    const itemStep = item.dataset.uiStep
      || item.dataset.step
      || (item.textContent.match(/\d/) || [''])[0];
    const active = String(itemStep) === key;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  button?.classList.add('active');

  if (key === '2') openingHint(true);
  else openingHint(false);

  // Força o navegador a reconhecer a troca de painel antes do click principal.
  void pane.offsetHeight;
  return true;
}

function stepTwoVisible() {
  const pane = document.getElementById('pgcPane2');
  return Boolean(pane && !pane.hidden);
}

function installDeferredMapRenderer() {
  const current = window.__pmgRenderMapaGestor;
  if (typeof current !== 'function') return false;
  if (current[MAP_RENDERER_FLAG]) return true;

  let scheduled = false;
  let latestArgs = [];
  let waiters = [];

  const deferred = (...args) => {
    latestArgs = args;
    if (stepTwoVisible()) openingHint(true);

    const promise = new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    promise.catch(() => {});
    if (scheduled) return promise;
    scheduled = true;

    // Primeiro frame: a etapa escolhida aparece. Segundo frame: só inicia o
    // mapa se a Etapa 2 ainda estiver aberta.
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        scheduled = false;
        const batch = waiters;
        waiters = [];

        if (!stepTwoVisible()) {
          openingHint(false);
          batch.forEach(({ resolve }) => resolve(undefined));
          return;
        }

        try {
          const result = await current(...latestArgs);
          batch.forEach(({ resolve }) => resolve(result));
        } catch (error) {
          batch.forEach(({ reject }) => reject(error));
        } finally {
          openingHint(false);
          ensureIconLegend();
        }
      });
    });

    return promise;
  };

  deferred[MAP_RENDERER_FLAG] = true;
  deferred.__pgcOriginal = current;
  window.__pmgRenderMapaGestor = deferred;
  return true;
}

function requestMapRender() {
  if (!stepTwoVisible()) return;
  installDeferredMapRenderer();
  const render = window.__pmgRenderMapaGestor;
  if (typeof render !== 'function') return;
  Promise.resolve(render()).catch((error) => {
    console.warn('[programacao-mapa-ux-fast] render do mapa:', error);
    openingHint(false);
  });
}

function observeUi() {
  let scheduled = false;
  let lastPane = null;
  let lastPaneVisible = false;

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      installDeferredMapRenderer();
      ensureIconLegend();

      const pane = document.getElementById('pgcPane2');
      if (pane !== lastPane) {
        lastPane = pane;
        lastPaneVisible = false;
      }
      const paneVisible = Boolean(pane && !pane.hidden);
      if (paneVisible && !lastPaneVisible) requestMapRender();
      if (!paneVisible) openingHint(false);
      lastPaneVisible = paneVisible;
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });
  schedule();
}

function bindFastInteractions() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('#progLoadContext')) accelerateContextLoad();
  }, true);

  // Faz a troca visual no pointerdown para todas as etapas. Assim, ao voltar
  // da Etapa 2 para a Etapa 1, o mapa some antes de qualquer listener pesado.
  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('#progSteps .stepbtn');
    if (!button) return;
    const step = button.dataset.uiStep
      || button.dataset.step
      || (button.textContent.match(/\d/) || [''])[0];
    if (step) showStepImmediately(step, button);
  }, true);
}

function boot() {
  injectStyles();
  installDeferredMapRenderer();
  bindFastInteractions();
  observeUi();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();