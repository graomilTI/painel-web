// Patch visual da Programação: KPIs na linha dos filtros e topo mais compacto.
(function () {
  const STYLE_ID = 'programacaoKpiInlinePatchStyles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .prog-toolbar{padding-bottom:10px!important;margin-bottom:12px!important}
      .prog-toolbar .prog-toolbar-row:first-child{display:grid!important;grid-template-columns:minmax(300px,1.25fr) 150px 112px minmax(330px,450px)!important;gap:10px!important;align-items:end!important}
      .prog-toolbar-row-steps{margin-top:8px!important;padding-top:8px!important}
      #progList{padding-top:0!important}
      #progList>.prog-section-title{margin:0 0 6px!important}
      #progList>.prog-section-title h4{font-size:18px!important;margin:0!important}
      #progList .peqb-legend{margin:0 0 6px!important;font-size:10.5px!important}
      #progList .peqb-toolbar{margin:0 0 8px auto!important}
      #progKpisInline{display:block!important;min-width:330px!important;align-self:stretch!important}
      #progKpisInline .peqb-kpis{display:grid!important;grid-template-columns:repeat(2,minmax(150px,1fr))!important;gap:8px!important;margin:0!important;height:100%!important}
      #progKpisInline .peqb-kpi{display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:48px!important;padding:6px 10px!important;border-radius:11px!important}
      #progKpisInline .peqb-kpi span{font-size:8.5px!important;line-height:1!important;letter-spacing:.08em!important}
      #progKpisInline .peqb-kpi strong{font-size:16px!important;line-height:1.05!important;margin-top:3px!important}
      @media(max-width:1280px){.prog-toolbar .prog-toolbar-row:first-child{grid-template-columns:minmax(260px,1fr) 150px 112px!important}#progKpisInline{grid-column:1 / -1!important;min-width:0!important}}
      @media(max-width:720px){.prog-toolbar .prog-toolbar-row:first-child{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function inlineKpis() {
    injectStyles();
    const loadBtn = document.getElementById('progLoadContext');
    const kpis = document.getElementById('progList')?.querySelector('.peqb-kpis');
    if (!loadBtn || !kpis) return;

    let host = document.getElementById('progKpisInline');
    if (!host) {
      host = document.createElement('div');
      host.id = 'progKpisInline';
      loadBtn.insertAdjacentElement('afterend', host);
    }
    if (!host.contains(kpis)) host.appendChild(kpis);
  }

  function boot() {
    injectStyles();
    inlineKpis();
    const observer = new MutationObserver(() => inlineKpis());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
