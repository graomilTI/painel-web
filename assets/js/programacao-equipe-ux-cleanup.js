// Ajuste visual complementar da Etapa 2 (Equipe + Mapa).
// Mantém a lógica existente e atua somente na apresentação, carregando por último
// para prevalecer sobre os estilos injetados por programacao-equipe.js.

const STYLE_ID = 'programacaoEquipeUxCleanup';

function injectCleanupStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Área principal mais limpa e com leitura horizontal. */
    .peqb-os-list-full{
      display:flex!important;
      flex-direction:column!important;
      gap:8px!important;
    }

    .peqb-row.peqb-os2{
      display:grid!important;
      grid-template-columns:minmax(220px,26%) minmax(0,1fr)!important;
      align-items:stretch!important;
      padding:0!important;
      overflow:visible!important;
      border-radius:14px!important;
      background:rgba(2,12,9,.52)!important;
      border-color:rgba(111,208,165,.16)!important;
      box-shadow:none!important;
      cursor:default!important;
    }

    .peqb-row.peqb-os2:hover,
    .peqb-row.peqb-os2.focus{
      border-color:rgba(111,208,165,.38)!important;
      background:rgba(4,22,16,.68)!important;
    }

    /* Resumo da OS: número primeiro, demais dados como apoio. */
    .peqb-os2-left{
      position:relative!important;
      padding:12px 14px 11px 16px!important;
      border-right:1px solid rgba(111,208,165,.12)!important;
      border-bottom:0!important;
      min-width:0!important;
    }

    .peqb-os2-left::before{
      content:"";
      position:absolute;
      left:0;
      top:11px;
      bottom:11px;
      width:3px;
      border-radius:0 999px 999px 0;
      background:#34d399;
      opacity:.78;
    }

    .peqb-os2-kpis{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      grid-template-areas:
        "os rem"
        "cliente rem"
        "local rem"!important;
      gap:2px 10px!important;
      margin:0!important;
      align-items:center!important;
    }

    .peqb-os2-kpi{
      min-width:0!important;
      padding:0!important;
      border:0!important;
      background:transparent!important;
      border-radius:0!important;
      overflow:hidden!important;
    }

    .peqb-os2-kpi:nth-child(1){grid-area:cliente!important}
    .peqb-os2-kpi:nth-child(2){grid-area:local!important}
    .peqb-os2-kpi:nth-child(3){grid-area:rem!important;align-self:center!important;text-align:right!important}
    .peqb-os2-kpi:nth-child(4){grid-area:os!important}

    .peqb-os2-kpi span{
      display:none!important;
    }

    .peqb-os2-kpi:nth-child(4)::before{
      content:"OS";
      display:inline-block;
      margin-right:7px;
      color:#6fd0a5;
      font-size:9px;
      font-weight:950;
      letter-spacing:.08em;
      vertical-align:middle;
    }

    .peqb-os2-kpi:nth-child(4) strong{
      display:inline!important;
      color:#fff!important;
      font-size:22px!important;
      line-height:1!important;
      font-weight:950!important;
      letter-spacing:.01em!important;
    }

    .peqb-os2-kpi:nth-child(1) strong{
      font-size:12.5px!important;
      line-height:1.2!important;
      font-weight:850!important;
      color:#f4fbf7!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }

    .peqb-os2-kpi:nth-child(2) strong{
      font-size:10.5px!important;
      line-height:1.25!important;
      font-weight:700!important;
      color:#83a99a!important;
    }

    .peqb-os2-emb-l1,
    .peqb-os2-emb-l2{
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }

    .peqb-os2-emb-l2{
      display:none!important;
    }

    .peqb-os2-kpi:nth-child(3)::before{
      content:"Rem.";
      display:block;
      color:#6f9083;
      font-size:8.5px;
      font-weight:900;
      letter-spacing:.06em;
      text-transform:uppercase;
    }

    .peqb-os2-kpi:nth-child(3) strong{
      font-size:12px!important;
      line-height:1.15!important;
      color:#dcebe4!important;
      font-weight:900!important;
      white-space:nowrap!important;
    }

    /* Equipe e deslocamento ficam claramente separados, sem caixas duplicadas. */
    .peqb-os2-right{
      padding:10px 12px!important;
      border-top:0!important;
      border-radius:0 13px 13px 0!important;
      background:rgba(6,14,22,.38)!important;
      min-width:0!important;
      display:flex!important;
      align-items:center!important;
    }

    .peqb-team-row{
      width:100%!important;
      display:grid!important;
      grid-template-columns:minmax(0,1fr) 205px!important;
      gap:12px!important;
      align-items:center!important;
    }

    .peqb-team-zone{
      min-width:0!important;
      position:relative!important;
      padding-top:15px!important;
    }

    .peqb-team-zone::before{
      content:"Equipe da O.S.";
      position:absolute;
      top:0;
      left:2px;
      color:#79a08f;
      font-size:9px;
      font-weight:900;
      letter-spacing:.07em;
      text-transform:uppercase;
    }

    .peqb-conf-head{
      margin:0!important;
      gap:6px!important;
      flex-wrap:nowrap!important;
    }

    .peqb-conf-name,
    .peqb-extra-colab{
      min-height:34px!important;
      padding:3px 5px!important;
      border-radius:9px!important;
      background:rgba(15,23,42,.42)!important;
      border-color:rgba(148,163,184,.14)!important;
    }

    .peqb-avatar-badge{
      width:26px!important;
      height:26px!important;
      margin:0 5px 0 0!important;
      font-size:9px!important;
    }

    .peqb-name-sel{
      font-size:12.5px!important;
      padding:5px 20px 5px 6px!important;
    }

    .peqb-conf-tagwrap{
      padding:0 4px!important;
    }

    .peqb-conf-tag{
      font-size:8.5px!important;
      padding:2px 6px!important;
    }

    .peqb-add-colab{
      width:25px!important;
      height:25px!important;
      min-height:25px!important;
      border:1px solid rgba(56,189,248,.2)!important;
      border-radius:999px!important;
      color:#7dd3fc!important;
      background:rgba(56,189,248,.06)!important;
    }

    .peqb-extra-colabs{
      gap:5px!important;
      margin:5px 0 0!important;
    }

    .peqb-conf-km{
      margin-top:5px!important;
      font-size:9.5px!important;
      color:#759487!important;
    }

    .peqb-desloc-card{
      min-height:58px!important;
      flex-basis:auto!important;
      padding:9px 11px!important;
      border-radius:11px!important;
      box-sizing:border-box!important;
    }

    .peqb-desloc-card::before{
      content:"Deslocamento";
      position:absolute;
      top:6px;
      left:42px;
      color:currentColor;
      opacity:.62;
      font-size:8px;
      font-weight:900;
      letter-spacing:.06em;
      text-transform:uppercase;
      pointer-events:none;
    }

    .peqb-desloc-main{
      padding-top:10px!important;
    }

    .peqb-desloc-main strong,
    .peqb-desloc-label{
      font-size:12px!important;
    }

    .peqb-desloc-main small{
      font-size:8.5px!important;
    }

    /* Ações ocasionais não devem competir com a associação principal. */
    .peqb-conf-head > .peqb-row-btn.hotel{
      margin-left:auto!important;
      height:28px!important;
      font-size:10px!important;
      padding:0 8px!important;
    }

    /* Lista lateral mais leve e fácil de varrer visualmente. */
    .peqb-pool-item,
    [data-pool-colab],
    [draggable="true"].peqb-pool-row{
      min-height:38px!important;
    }

    /* Responsividade: volta a empilhar sem perder hierarquia. */
    @media(max-width:1180px){
      .peqb-row.peqb-os2{
        grid-template-columns:minmax(190px,30%) minmax(0,1fr)!important;
      }
      .peqb-team-row{
        grid-template-columns:minmax(0,1fr) 180px!important;
      }
    }

    @media(max-width:900px){
      .peqb-row.peqb-os2{
        grid-template-columns:1fr!important;
      }
      .peqb-os2-left{
        border-right:0!important;
        border-bottom:1px solid rgba(111,208,165,.1)!important;
      }
      .peqb-os2-right{
        border-radius:0 0 13px 13px!important;
      }
    }

    @media(max-width:640px){
      .peqb-team-row{
        grid-template-columns:1fr!important;
      }
      .peqb-os2-kpis{
        grid-template-columns:minmax(0,1fr) auto!important;
      }
      .peqb-desloc-card{
        width:100%!important;
      }
    }
  `;

  document.head.appendChild(style);
}

injectCleanupStyles();

// Alguns módulos reconstroem a etapa inteira. O estilo permanece no head, mas
// este observer também garante a injeção caso outro hotfix remova o nó.
new MutationObserver(injectCleanupStyles).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
