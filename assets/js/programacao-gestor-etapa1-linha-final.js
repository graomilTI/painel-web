// Ajuste final da Etapa 1 do Gestor > Programação:
// organização horizontal: Cliente | Local | Remanescente | OS | Ações.

const CSS_ID = 'pgcEtapa1LinhaFinalCss';

function injectEtapa1LinhaCss() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = `
    #pgcPane1 .prog-section-title {
      margin-bottom: 8px !important;
    }

    #pgcPane1 .peqb-block,
    #pgcPane1 .peqb-os-list {
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
      overflow: visible !important;
      max-height: none !important;
    }

    #pgcPane1 .peqb-block-head {
      display: none !important;
    }

    #pgcPane1 .pgc-os-kpi-head,
    #pgcPane1 .pgc-os-line-head {
      display: grid !important;
      grid-template-columns: minmax(300px, 1.8fr) minmax(430px, 2.55fr) 112px 74px 224px !important;
      gap: 0 !important;
      align-items: center !important;
      margin: 0 0 4px !important;
      padding: 0 14px !important;
      background: transparent !important;
      border: 0 !important;
    }

    #pgcPane1 .pgc-os-kpi-head span,
    #pgcPane1 .pgc-os-line-head span {
      font-size: 10px !important;
      line-height: 1 !important;
      font-weight: 950 !important;
      text-transform: uppercase !important;
      letter-spacing: .06em !important;
      color: #93c5fd !important;
      padding: 0 8px !important;
      text-align: left !important;
    }

    #pgcPane1 .pgc-os-kpi-head span:nth-child(n+3),
    #pgcPane1 .pgc-os-line-head span:nth-child(n+3) {
      text-align: center !important;
    }

    #pgcPane1 .pgc-os-kpi-head span:last-child,
    #pgcPane1 .pgc-os-line-head span:last-child {
      color: #bbf7d0 !important;
    }

    #pgcPane1 .peqb-os-list {
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
    }

    #pgcPane1 .peqs-row {
      display: block !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 1px solid rgba(52, 211, 153, .18) !important;
      border-radius: 12px !important;
      background: rgba(2, 6, 23, .14) !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }

    #pgcPane1 .peqs-row:hover {
      border-color: rgba(52, 211, 153, .38) !important;
      background: rgba(2, 6, 23, .22) !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-left {
      display: grid !important;
      grid-template-columns: minmax(300px, 1.8fr) minmax(430px, 2.55fr) 112px 74px 224px !important;
      gap: 0 !important;
      align-items: stretch !important;
      min-height: 38px !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpis {
      display: contents !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi {
      min-width: 0 !important;
      height: 38px !important;
      min-height: 38px !important;
      margin: 0 !important;
      padding: 3px 12px !important;
      border: 0 !important;
      border-right: 1px solid rgba(148, 163, 184, .11) !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      justify-content: center !important;
      overflow: hidden !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi span {
      display: none !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi strong {
      display: block !important;
      width: 100% !important;
      margin: 0 !important;
      color: #f8fafc !important;
      font-size: 12px !important;
      font-weight: 900 !important;
      line-height: 1.1 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    /* Local de embarque: linha 1 = UF - Cidade, linha 2 = local em si
       (sem cabeçalho próprio — o rótulo já vem do cabeçalho único da lista). */
    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(2) strong {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 1px !important;
      white-space: normal !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi .peqb-os2-emb-l1,
    #pgcPane1 .peqs-row .peqb-os2-kpi .peqb-os2-emb-l2 {
      display: block !important;
      width: 100% !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi .peqb-os2-emb-l1 {
      font-size: 12px !important;
      font-weight: 900 !important;
      color: #f8fafc !important;
      line-height: 1.1 !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi .peqb-os2-emb-l2 {
      font-size: 10px !important;
      font-weight: 600 !important;
      color: #9fb7aa !important;
      line-height: 1.05 !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi .peqb-os2-uf {
      display: inline !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi strong *,
    #pgcPane1 .peqs-row .peqb-os2-kpi strong span {
      white-space: inherit !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi strong br {
      display: none !important;
    }

    /* Remanescente e OS: só o valor — o rótulo já está no cabeçalho único
       da lista (.pgc-os-kpi-head / .pgc-os-line-head), sem repetir aqui. */
    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(3),
    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(4) {
      align-items: center !important;
      justify-content: center !important;
      text-align: center !important;
      padding: 3px 6px !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(3) strong,
    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(4) strong {
      text-align: center !important;
      font-size: 11.5px !important;
      line-height: 1 !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-tagsrow {
      height: 38px !important;
      min-height: 38px !important;
      margin: 0 !important;
      padding: 0 8px !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: #020617 !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    #pgcPane1 .peqs-row .peqb-status-strip {
      margin: 0 !important;
      gap: 6px !important;
      flex-wrap: nowrap !important;
    }

    #pgcPane1 .peqs-row .peqb-st {
      height: 26px !important;
      min-width: 26px !important;
      width: 26px !important;
      padding: 0 !important;
      border-radius: 999px !important;
      font-size: 10px !important;
    }

    @media (max-width: 980px) {
      #pgcPane1 .pgc-os-kpi-head,
      #pgcPane1 .pgc-os-line-head {
        display: none !important;
      }
      #pgcPane1 .peqs-row .peqb-os2-left {
        grid-template-columns: 1fr 1fr !important;
      }
      #pgcPane1 .peqs-row .peqb-os2-kpi,
      #pgcPane1 .peqs-row .peqb-os2-tagsrow {
        border-bottom: 1px solid rgba(148, 163, 184, .10) !important;
      }
    }

    @media (max-width: 720px) {
      #pgcPane1 .peqs-row .peqb-os2-left {
        display: block !important;
      }
      #pgcPane1 .peqs-row .peqb-os2-kpi,
      #pgcPane1 .peqs-row .peqb-os2-tagsrow {
        height: auto !important;
        min-height: 34px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function normalizeEtapa1Texts() {
  const pane = document.getElementById('pgcPane1');
  if (!pane) return;

  const list = pane.querySelector('#peqsOsList, .peqb-os-list');
  if (list && !pane.querySelector('.pgc-os-line-head, .pgc-os-kpi-head')) {
    list.insertAdjacentHTML(
      'beforebegin',
      '<div class="pgc-os-line-head"><span>Cliente</span><span>Local de embarque</span><span>Remanescente</span><span>OS</span><span>Ações</span></div>'
    );
  }

  pane.querySelectorAll('.peqb-os2-kpi strong').forEach((strong) => {
    if (strong.children.length) return; // preserva o UF/cidade/local do embarqueHtml (2 linhas)
    const clean = String(strong.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (strong.textContent !== clean) strong.textContent = clean;
  });
}

function runEtapa1LinhaFinal() {
  injectEtapa1LinhaCss();
  normalizeEtapa1Texts();
}

function boot() {
  runEtapa1LinhaFinal();
  document.addEventListener('click', (event) => {
    if (event.target.closest('#progLoadContext, #progSteps .stepbtn')) {
      setTimeout(runEtapa1LinhaFinal, 500);
      setTimeout(runEtapa1LinhaFinal, 1200);
      setTimeout(runEtapa1LinhaFinal, 2200);
    }
  }, true);

  new MutationObserver(() => {
    clearTimeout(window.__pgcEtapa1LinhaFinalTimer);
    window.__pgcEtapa1LinhaFinalTimer = setTimeout(runEtapa1LinhaFinal, 220);
  }).observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
