// Patch visual da Programação: KPIs na linha dos filtros, topo compacto e supervisão sincronizada.
(function () {
  const STYLE_ID = 'programacaoKpiInlinePatchStyles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
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
      #progKpisInline .peqb-kpi{display:flex!important;flex-direction:column!important;justify-content:center!important;min-height:36px!important;padding:3px 9px!important;border-radius:9px!important}
      #progKpisInline .peqb-kpi span{font-size:7.5px!important;line-height:1!important;letter-spacing:.08em!important}
      #progKpisInline .peqb-kpi strong{font-size:13px!important;line-height:1!important;margin-top:1px!important}
      .peqb-kpis .peqb-kpi{min-height:38px!important;padding:4px 9px!important}
      .peqb-kpis .peqb-kpi span{font-size:7.5px!important;line-height:1!important}
      .peqb-kpis .peqb-kpi strong{font-size:13px!important;line-height:1!important;margin-top:1px!important}
      .peqb-cand-av{display:none!important}
      .peqb-conf-head{grid-template-columns:minmax(250px,1fr) auto!important}
      .peqb-name-sel{grid-column:1!important}
      .peqb-ali{grid-column:2!important}
      .peqb-conf-head .peqb-row-btn.hotel{grid-column:1!important}
      .peqb-os2-left{gap:5px!important}
      .peqb-os-title-line,.peqb-os-location-line{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important}
      .peqb-os-title-line{justify-content:space-between!important}
      .peqb-os-location-line{margin-top:2px!important}
      .peqb-os-title-line .peqb-os2-cliente,.peqb-os-location-line .peqb-os2-emb{margin:0!important}
      .peqb-os-title-line .peqb-status-strip{margin:0!important;gap:6px!important;flex-shrink:0!important}
      .peqb-os-location-line .peqb-os2-tagsrow{margin:0!important;gap:7px!important;align-items:center!important}
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

  function reorganizarCards() {
    document.querySelectorAll('.peqb-row.peqb-os2').forEach((row) => {
      const left = row.querySelector('.peqb-os2-left');
      const cliente = left?.querySelector('.peqb-os2-cliente');
      const local = left?.querySelector('.peqb-os2-emb');
      const tags = left?.querySelector('.peqb-os2-tagsrow');
      const actions = left?.querySelector('.peqb-status-strip');
      if (!left || !cliente || !local || !tags || row.dataset.kpiInlineReorg === '1') return;

      const titleLine = document.createElement('div');
      titleLine.className = 'peqb-os-title-line';
      const locationLine = document.createElement('div');
      locationLine.className = 'peqb-os-location-line';

      left.insertBefore(titleLine, left.firstChild);
      titleLine.appendChild(cliente);
      if (actions) titleLine.appendChild(actions);
      left.insertBefore(locationLine, titleLine.nextSibling);
      locationLine.appendChild(local);
      locationLine.appendChild(tags);
      row.dataset.kpiInlineReorg = '1';
    });
  }

  function syncSupervisaoDisplay() {
    const select = document.getElementById('progSup');
    const input = document.getElementById('progSupCombo');
    if (!select || !input) return;
    const opt = select.options[select.selectedIndex];
    if (opt && opt.value) input.value = opt.textContent || opt.value;
  }

  function bindSupervisaoSync() {
    const select = document.getElementById('progSup');
    if (!select || select.dataset.kpiInlineSupSync === '1') return;
    select.dataset.kpiInlineSupSync = '1';
    select.addEventListener('change', () => setTimeout(syncSupervisaoDisplay, 0), true);
    select.addEventListener('input', () => setTimeout(syncSupervisaoDisplay, 0), true);
  }

  function aplicarPatch() {
    inlineKpis();
    bindSupervisaoSync();
    reorganizarCards();
  }

  function boot() {
    injectStyles();
    aplicarPatch();
    setTimeout(syncSupervisaoDisplay, 300);
    document.addEventListener('mousedown', (event) => {
      if (event.target.closest('.prog-sup-combo-item')) setTimeout(syncSupervisaoDisplay, 0);
    }, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && document.activeElement?.id === 'progSupCombo') {
        setTimeout(syncSupervisaoDisplay, 0);
      }
    }, true);
    const observer = new MutationObserver(() => aplicarPatch());
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
