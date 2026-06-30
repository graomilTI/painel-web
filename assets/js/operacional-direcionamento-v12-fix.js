(function () {
  'use strict';

  const STYLE_ID = 'opv12-filter-zindex-fix';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .opv2 > .opv2-card {
      overflow: visible !important;
      position: relative !important;
      isolation: isolate;
    }

    .opv2-head {
      position: relative !important;
      z-index: 30 !important;
    }

    .opv2-filter {
      position: relative !important;
      z-index: 2500 !important;
      overflow: visible !important;
      margin-bottom: 8px !important;
    }

    .opv2-filter .opv2-select,
    .opv2-select {
      position: relative !important;
      z-index: 2600 !important;
    }

    .opv2-legend {
      position: relative !important;
      z-index: 20 !important;
      margin-top: 2px !important;
      padding-top: 2px !important;
      clear: both !important;
    }

    .opv2-grid {
      position: relative !important;
      z-index: 1 !important;
    }

    .opv2-map,
    .opv2-map .leaflet-container,
    .opv2-map .leaflet-pane,
    .opv2-map .leaflet-top,
    .opv2-map .leaflet-bottom {
      z-index: 1 !important;
    }

    .opv2-map .leaflet-control-container,
    .opv2-map .leaflet-control {
      z-index: 10 !important;
    }
  `;

  document.head.appendChild(style);
})();
