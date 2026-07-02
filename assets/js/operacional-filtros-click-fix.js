// Correção de interação dos filtros do Mapa Operacional.
// Evita que a legenda/camada do mapa fique por cima dos selects em telas menores.

(function () {
  'use strict';

  const STYLE_ID = 'mo-filtros-click-fix-style';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mo-map-tools{
        position:relative!important;
        z-index:5000!important;
        overflow:visible!important;
      }
      .mo-map-tools .mo-filter{
        position:relative!important;
        z-index:5100!important;
        pointer-events:auto!important;
        isolation:isolate!important;
      }
      .mo-map-tools .mo-filter select,
      .mo-map-tools [data-estado],
      .mo-map-tools [data-ponto],
      .mo-map-tools [data-filtro-os]{
        position:relative!important;
        z-index:5200!important;
        pointer-events:auto!important;
        cursor:pointer!important;
        min-width:0!important;
      }
      .mo-map-tools .mo-legend{
        position:relative!important;
        z-index:100!important;
        pointer-events:auto!important;
      }
      @media(max-width:1500px){
        .mo-map-tools{
          grid-template-columns:1fr!important;
          align-items:start!important;
        }
        .mo-map-tools .mo-filter{
          grid-template-columns:180px minmax(220px,1fr) 190px!important;
          max-width:760px!important;
        }
        .mo-map-tools .mo-legend{
          justify-content:flex-start!important;
        }
      }
      @media(max-width:900px){
        .mo-map-tools .mo-filter{
          grid-template-columns:1fr!important;
          max-width:none!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function fixSelects(root = document) {
    root.querySelectorAll('.mo-map-tools select, [data-filtro-os]').forEach((el) => {
      el.style.pointerEvents = 'auto';
      el.style.position = 'relative';
      el.style.zIndex = '5200';
      el.removeAttribute('aria-disabled');
      el.disabled = false;
    });
  }

  function bindCapture() {
    if (window.__MO_FILTROS_CLICK_FIX__) return;
    window.__MO_FILTROS_CLICK_FIX__ = true;

    document.addEventListener('pointerdown', (event) => {
      const select = event.target.closest?.('.mo-map-tools select, [data-filtro-os]');
      if (!select) return;
      // Impede que drag/click do mapa/legenda capture o evento antes do select abrir.
      event.stopPropagation();
    }, true);

    document.addEventListener('click', (event) => {
      const select = event.target.closest?.('.mo-map-tools select, [data-filtro-os]');
      if (!select) return;
      event.stopPropagation();
    }, true);
  }

  function init() {
    installStyle();
    bindCapture();
    fixSelects();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes?.length) fixSelects(document);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  init();
})();
