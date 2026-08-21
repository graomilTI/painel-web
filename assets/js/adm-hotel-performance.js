(() => {
  'use strict';

  const VERSION = '20260821-lazy-panels1';
  const PANEL_IDS = new Set([
    'hospRdDashboard',
    'hospRdSolicitacoes',
    'hospRdAndamento',
    'hospRdFinalizado',
    'hospRdHoteis',
    'hospRdCanceladas',
  ]);
  const TAB_TO_PANEL = {
    dashboard: 'hospRdDashboard',
    solicitacoes: 'hospRdSolicitacoes',
    andamento: 'hospRdAndamento',
    finalizado: 'hospRdFinalizado',
    hoteis: 'hospRdHoteis',
    canceladas: 'hospRdCanceladas',
  };

  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (!descriptor?.get || !descriptor?.set || descriptor.configurable === false) {
    console.warn('[hosp-performance] innerHTML não pôde ser otimizado');
    return;
  }

  const pendingHtml = new WeakMap();
  const nativeGet = descriptor.get;
  const nativeSet = descriptor.set;

  function isManagedPanel(element) {
    return element instanceof Element && PANEL_IDS.has(element.id);
  }

  function restorePanel(panel) {
    if (!panel || !pendingHtml.has(panel)) return false;
    const html = pendingHtml.get(panel);
    pendingHtml.delete(panel);
    nativeSet.call(panel, html);
    return true;
  }

  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get() {
      if (isManagedPanel(this) && pendingHtml.has(this)) return pendingHtml.get(this);
      return nativeGet.call(this);
    },
    set(value) {
      if (isManagedPanel(this) && !this.classList.contains('active')) {
        pendingHtml.set(this, String(value ?? ''));
        return;
      }
      pendingHtml.delete(this);
      nativeSet.call(this, value);
    },
  });

  document.addEventListener('click', (event) => {
    const rdTab = event.target.closest?.('[data-hosp-rd-tab]');
    const intTab = event.target.closest?.('[data-hosp-int-tab]');
    const key = rdTab?.dataset?.hospRdTab || intTab?.dataset?.hospIntTab;
    const panelId = TAB_TO_PANEL[key];
    if (!panelId) return;
    restorePanel(document.getElementById(panelId));
  }, true);

  window.__hospedagemPerformance = {
    version: VERSION,
    restore(panelOrId) {
      const panel = typeof panelOrId === 'string'
        ? document.getElementById(panelOrId)
        : panelOrId;
      return restorePanel(panel);
    },
    hasPending(panelOrId) {
      const panel = typeof panelOrId === 'string'
        ? document.getElementById(panelOrId)
        : panelOrId;
      return Boolean(panel && pendingHtml.has(panel));
    },
  };

  console.info(`[hosp-performance] ativo ${VERSION}`);
})();
