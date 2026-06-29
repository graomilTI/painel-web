// Patch visual da Programação: KPIs na linha dos filtros e topo mais compacto.
(function () {
  const STYLE_ID = 'programacaoKpiInlinePatchStyles';

  function injectStyles() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .prog-toolbar{padding:12px 20px 10px!important;margin-bottom:10px!important;min-height:0!important}
      .prog-toolbar .prog-toolbar-row:first-child{display:grid!important;grid-template-columns:minmax(300px,1.25fr) 150px 112px minmax(330px,450px)!important;gap:10px!important;align-items:end!important;margin:0!important}
      .prog-toolbar-row-steps{margin-top:6px!important;padding-top:6px!important;min-height:0!important;align-items:center!important}
      #progSteps{gap:7px!important}
      #progSteps .stepbtn{padding:8px 13px!important;min-height:34px!important}
      #progCtxFeedback{margin:0!important;font-size:11px!important;line-height:1.2!important}
      #progList{padding-top:0!important;margin-top:0!important}
      #progList>.prog-section-title{margin:0 0 3px!important;min-height:0!important}
      #progList>.prog-section-title h4{font-size:17px!important;line-height:1.1!important;margin:0!important}
      #progList>.prog-section-title .badge{padding:5px 9px!important;font-size:10px!important}
      #progList .peqb-legend{margin:0 0 4px!important;font-size:10px!important;line-height:1.1!important}
      #progList .peqb-toolbar{margin:-25px 0 2px auto!important;min-height:0!important}
      #progList .peqb-btn{padding:7px 13px!important;font-size:11.5px!important}
      #progList .peqb-block-head{margin:5px 0 6px!important;font-size:10.5px!important;line-height:1.1!important}
      #progList .peqb-empty{padding:10px!important}
      #progKpisInline{display:block!important;min-width:330px!important;align-self:stretch!important}
      #progKpisInline .peqb-kpis{display:grid!important;grid-template-columns:repeat(2,minmax(150px,1fr))!important;gap:8px!important;margin:0!important;height:100%!important}
      #progKpisInline .peqb-kpi{display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:46px!important;padding:5px 10px!important;border-radius:10px!important}
      #progKpisInline .peqb-kpi span{font-size:8px!important;line-height:1!important;letter-spacing:.08em!important}
      #progKpisInline .peqb-kpi strong{font-size:15px!important;line-height:1.05!important;margin-top:2px!important}
      @media(max-width:1280px){.prog-toolbar .prog-toolbar-row:first-child{grid-template-columns:minmax(260px,1fr) 150px 112px!important}#progKpisInline{grid-column:1 / -1!important;min-width:0!important}}
      @media(max-width:720px){.prog-toolbar .prog-toolbar-row:first-child{grid-template-columns:1fr!important}#progList .peqb-toolbar{margin:0 0 5px auto!important}}
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
