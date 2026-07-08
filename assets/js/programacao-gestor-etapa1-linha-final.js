// Ajuste final da Etapa 1 do Gestor > Programação:
// mantém KPIs em linha compacta, sem card gigante e sem blocos internos.

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
      grid-template-columns: minmax(280px, 1.85fr) minmax(430px, 2.75fr) 68px 62px 176px !important;
      gap: 6px !important;
      align-items: center !important;
      margin: 0 0 5px !important;
      padding: 0 7px !important;
      background: transparent !important;
      border: 0 !important;
    }

    #pgcPane1 .pgc-os-kpi-head span,
    #pgcPane1 .pgc-os-line-head span {
      font-size: 9.5px !important;
      line-height: 1 !important;
      font-weight: 950 !important;
      text-transform: uppercase !important;
      letter-spacing: .06em !important;
      color: #93c5fd !important;
      padding: 0 !important;
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
      border: 1px solid rgba(52, 211, 153, .13) !important;
      border-radius: 9px !important;
      background: rgba(2, 6, 23, .18) !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }

    #pgcPane1 .peqs-row:hover {
      border-color: rgba(52, 211, 153, .30) !important;
      background: rgba(2, 6, 23, .26) !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-left {
      display: grid !important;
      grid-template-columns: minmax(280px, 1.85fr) minmax(430px, 2.75fr) 68px 62px 176px !important;
      gap: 0 !important;
      align-items: stretch !important;
      min-height: 32px !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpis {
      display: contents !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi {
      min-width: 0 !important;
      height: 32px !important;
      min-height: 32px !important;
      margin: 0 !important;
      padding: 0 8px !important;
      border: 0 !important;
      border-right: 1px solid rgba(148, 163, 184, .10) !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
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
      font-size: 11.5px !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi strong *,
    #pgcPane1 .peqs-row .peqb-os2-kpi strong span {
      display: inline !important;
      white-space: nowrap !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi strong br {
      display: none !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(3),
    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(4) {
      justify-content: center !important;
      text-align: center !important;
      padding-left: 4px !important;
      padding-right: 4px !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(3) strong,
    #pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(4) strong {
      text-align: center !important;
    }

    #pgcPane1 .peqs-row .peqb-os2-tagsrow {
      height: 32px !important;
      min-height: 32px !important;
      margin: 0 !important;
      padding: 0 6px !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
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
      min-width: 28px !important;
      width: 28px !important;
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
        height: 32px !important;
        min-height: 32px !important;
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
      '<div class="pgc-os-line-head"><span>Cliente</span><span>Local de embarque</span><span>Rem.</span><span>O.S.</span><span>Ações</span></div>'
    );
  }

  pane.querySelectorAll('.peqb-os2-kpi strong').forEach((strong) => {
    strong.textContent = String(strong.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
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
