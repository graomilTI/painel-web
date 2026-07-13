// Ajustes de UX do mapa da Programação:
// - acrescenta legenda compacta para os formatos dos marcadores;
// - antecipa o carregamento das abas assim que o contexto fica disponível;
// - reaplica o render do mapa no primeiro frame após abrir a Etapa 2.

const PATCH_ID = 'programacaoMapaUxFastStyles';
const MAX_CONTEXT_WAIT_MS = 3200;
const CONTEXT_POLL_MS = 45;

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

function renderMapImmediately() {
  requestAnimationFrame(() => {
    window.__pmgRenderMapaGestor?.();
    ensureIconLegend();
    setTimeout(() => {
      window.__pmgRenderMapaGestor?.();
      ensureIconLegend();
    }, 32);
  });
}

function observeUi() {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureIconLegend();
      const pane = document.getElementById('pgcPane2');
      if (pane && !pane.hidden) renderMapImmediately();
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

  // O listener principal das etapas interrompe o evento "click" no document.
  // pointerdown chega antes e permite preparar o mapa sem competir com ele.
  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('#progSteps .stepbtn');
    if (!button) return;
    const step = button.dataset.uiStep
      || button.dataset.step
      || (button.textContent.match(/\d/) || [''])[0];
    if (String(step) === '2') setTimeout(renderMapImmediately, 0);
  }, true);
}

function boot() {
  injectStyles();
  bindFastInteractions();
  observeUi();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
