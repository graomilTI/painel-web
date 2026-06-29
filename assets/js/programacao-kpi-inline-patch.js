// Patch visual seguro da Programação: apenas CSS, sem MutationObserver.
(function () {
  const STYLE_ID = 'programacaoKpiInlinePatchStyles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .prog-toolbar{padding:12px 20px 10px!important;margin-bottom:10px!important;min-height:0!important}
      .prog-toolbar .prog-toolbar-row:first-child{display:grid!important;grid-template-columns:minmax(300px,1.25fr) 150px 112px!important;gap:10px!important;align-items:end!important;margin:0!important}
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
      .peqb-kpis{gap:8px!important;margin-bottom:8px!important}
      .peqb-kpi{min-height:38px!important;padding:4px 9px!important;border-radius:9px!important}
      .peqb-kpi span{font-size:7.5px!important;line-height:1!important}
      .peqb-kpi strong{font-size:13px!important;line-height:1!important;margin-top:1px!important}
      .peqb-cand-av{display:none!important}
      .peqb-row.peqb-os2{grid-template-columns:minmax(660px,1.35fr) minmax(500px,.95fr)!important}
      .peqb-os2-left{min-width:0!important;padding-right:18px!important;gap:5px!important}
      .peqb-os2-right{min-width:0!important}
      .peqb-conf-head{display:grid!important;grid-template-columns:minmax(260px,360px) auto minmax(170px,1fr)!important;grid-template-rows:auto!important;gap:6px 8px!important;align-items:center!important}
      .peqb-name-sel{grid-column:1!important;grid-row:1!important;width:100%!important;max-width:360px!important;min-width:0!important}
      .peqb-conf-head .peqb-row-btn.hotel{grid-column:2!important;grid-row:1!important;justify-self:start!important;height:28px!important;min-height:28px!important;padding:0 10px!important;white-space:nowrap!important}
      .peqb-ali{grid-column:3!important;grid-row:1!important;justify-content:flex-end!important;margin-left:auto!important;white-space:nowrap!important}
      @media(max-width:1280px){
        .prog-toolbar .prog-toolbar-row:first-child{grid-template-columns:minmax(260px,1fr) 150px 112px!important}
        .peqb-row.peqb-os2{grid-template-columns:1fr!important}
        .peqb-conf-head{grid-template-columns:minmax(240px,360px) auto!important}
        .peqb-ali{grid-column:1 / -1!important;grid-row:2!important;justify-content:flex-start!important;margin-left:0!important}
      }
      @media(max-width:720px){
        .prog-toolbar .prog-toolbar-row:first-child{grid-template-columns:1fr!important}
        #progList .peqb-toolbar{margin:0 0 5px auto!important}
        .peqb-conf-head{grid-template-columns:1fr!important}
        .peqb-conf-head .peqb-row-btn.hotel,.peqb-ali{grid-column:1!important;grid-row:auto!important}
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectStyles, { once: true });
  else injectStyles();
}());
