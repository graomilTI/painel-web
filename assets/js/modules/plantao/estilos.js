// Plantão (Início): CSS. Tudo dentro de .pg-shell (página) ou .pg-overlay (janelas) para não vazar para outras telas.
// Tema verde do painel: texto #eef7f2, apoio #8ba79a, fundos quase pretos; os campos digitáveis têm borda azulada.
export const ESTILOS_PLANTAO = `
.pg-shell{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;color:#eef7f2;padding-bottom:84px}
.pg-shell>*{min-width:0}
.pg-shell h2,.pg-shell h3,.pg-shell h4{margin:0}
.pg-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.pg-hero h2{font-size:26px;color:#fff}.pg-hero p{margin:6px 0 0;color:#8ba79a;max-width:640px;line-height:1.5}
.pg-bloco{border:1px solid rgba(134,239,172,.14);border-radius:22px;background:linear-gradient(180deg,#0d1814,#08100d);padding:18px}
.pg-bloco-titulo{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.pg-bloco-titulo h3{font-size:16px;color:#fff}.pg-bloco-titulo small{color:#8ba79a;font-size:12.5px}
.pg-aviso{border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.5;border:1px solid rgba(96,165,250,.35);background:rgba(59,130,246,.1);color:#dbeafe}
.pg-aviso.warn{border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.1);color:#fde68a}.pg-aviso.mini{margin:12px 0 0;font-size:12.5px}
.pg-aviso a{color:inherit;font-weight:800}

.pg-btn{border:0;border-radius:12px;min-height:42px;padding:0 16px;font:inherit;font-size:13px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap}
.pg-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}
.pg-btn.soft{border:1px solid rgba(34,197,94,.28);background:rgba(34,197,94,.12);color:#86efac}
.pg-btn.ghost{border:1px solid rgba(139,167,154,.26);background:rgba(255,255,255,.03);color:#cfe3d8}
.pg-btn.mini{min-height:34px;padding:0 12px;font-size:12px;border-radius:10px}
.pg-btn:disabled{opacity:.5;cursor:not-allowed}
.pg-input{width:100%;box-sizing:border-box;height:42px;border:1px solid rgba(96,165,250,.28);border-radius:12px;background:#0a1220;color:#e8f0fe;padding:0 12px;outline:none;font:inherit;font-size:14px;color-scheme:dark}
.pg-input:focus{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.18)}

/* Períodos */
.pg-chips{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 10px;scroll-snap-type:x proximity}
.pg-chip{appearance:none;flex:0 0 auto;scroll-snap-align:start;display:grid;gap:3px;justify-items:start;min-width:132px;padding:12px 14px;border-radius:16px;border:1px solid rgba(134,239,172,.16);background:rgba(255,255,255,.025);color:#eef7f2;font:inherit;cursor:pointer;text-align:left;transition:.15s}
.pg-chip:hover{border-color:rgba(34,197,94,.45)}
.pg-chip.ativo{border-color:#22c55e;background:rgba(34,197,94,.14);box-shadow:0 0 0 2px rgba(34,197,94,.16)}
.pg-chip.extra b::before{content:"★ ";color:#fbbf24}
.pg-chip b{font-size:15px;color:#fff}.pg-chip small{color:#8ba79a;font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-pontos{display:flex;gap:5px;margin-top:4px}
.pg-pontos i,.pg-legenda i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#3a4a43;vertical-align:middle}
.pg-pontos i.completo,.pg-legenda i.completo{background:#22c55e}.pg-pontos i.parcial,.pg-legenda i.parcial{background:#fbbf24}.pg-pontos i.vazio,.pg-legenda i.vazio{background:#475569}
.pg-contagem{font-size:11px;color:#8ba79a;display:flex;gap:6px;align-items:center}.pg-contagem em{font-style:normal;color:#86efac;font-weight:900}
.pg-chips-acoes{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px}
.pg-legenda{margin-left:auto;font-size:11.5px;color:#8ba79a;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.pg-legenda i{margin-left:6px}

/* Setores */
.pg-setor{border:1px solid rgba(134,239,172,.14);border-radius:18px;background:rgba(255,255,255,.02);padding:14px;margin-bottom:14px}
.pg-setor.leitura{opacity:.85}.pg-setor.sujo{border-color:rgba(251,191,36,.55)}
.pg-setor-topo{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.pg-setor-nome{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.pg-setor-nome h4{font-size:18px;color:#fff}
.pg-setor-acoes{display:flex;gap:8px;flex-wrap:wrap}
.pg-cobertura{border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:900;border:1px solid rgba(139,167,154,.3);color:#cfe3d8}
.pg-cobertura.completo{border-color:rgba(34,197,94,.4);background:rgba(22,101,52,.28);color:#bbf7d0}
.pg-cobertura.parcial{border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a}
.pg-setor.sujo .pg-setor-nome::after{content:"alterado, falta salvar";font-size:11.5px;font-weight:800;color:#fbbf24}
.pg-sub{margin:22px 0 10px;color:#8ba79a;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
.pg-badge{font-size:11px;font-weight:800;color:#8ba79a;border:1px solid rgba(139,167,154,.26);border-radius:999px;padding:3px 10px}
.pg-vazio{padding:16px;border:1px dashed rgba(134,239,172,.22);border-radius:14px;color:#8ba79a;font-size:13px;text-align:center}
.pg-lista{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.pg-pessoa{border:1px solid rgba(134,239,172,.12);border-radius:14px;background:rgba(3,10,6,.5);padding:10px 12px}
.pg-pessoa.erro{border-color:rgba(239,68,68,.55)}
.pg-pessoa-topo{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.pg-avatar{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.35);color:#bbf7d0;font-weight:900;font-size:13px}
.pg-pessoa-id{flex:1 1 220px;min-width:0}.pg-pessoa-id strong{display:block;color:#fff;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-pessoa-id small{display:block;color:#8ba79a;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-dias{display:flex;gap:6px;flex-wrap:wrap}
.pg-dia{appearance:none;border:1px solid rgba(139,167,154,.3);background:transparent;color:#8ba79a;border-radius:999px;padding:7px 12px;font:inherit;font-size:12px;font-weight:900;cursor:pointer}
.pg-dia.on{background:rgba(34,197,94,.2);border-color:#22c55e;color:#dcfce7}.pg-dia.fixo{cursor:default}
.pg-icone{appearance:none;width:34px;height:34px;border-radius:10px;border:1px solid rgba(139,167,154,.26);background:rgba(255,255,255,.03);color:#cfe3d8;cursor:pointer;font-size:16px;line-height:1}
.pg-icone[aria-expanded="true"]{border-color:#60a5fa;color:#bfdbfe}.pg-icone.perigo:hover{border-color:rgba(239,68,68,.6);color:#fca5a5}
.pg-detalhes{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1.7fr) repeat(4,minmax(0,.85fr));gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(134,239,172,.1)}
.pg-detalhes[hidden]{display:none}
.pg-detalhes label{display:block;color:#86efac;font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.pg-detalhes label .pg-input{margin-top:5px;text-transform:none;letter-spacing:0;font-weight:400}
@media(max-width:1180px){.pg-detalhes{grid-template-columns:repeat(12,minmax(0,1fr))}.pg-detalhes>label:nth-child(-n+3){grid-column:span 4}.pg-detalhes>label:nth-child(n+4){grid-column:span 3}}
.pg-erros{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.pg-erros span{font-size:12px;color:#fecaca;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:3px 8px}

/* Adicionar */
.pg-add{margin-top:12px;display:grid;gap:8px}
.pg-add-campo{position:relative}
.pg-sugestoes{position:absolute;z-index:30;left:0;right:0;top:46px;max-height:300px;overflow:auto;border:1px solid rgba(134,239,172,.25);border-radius:14px;background:#0a1410;box-shadow:0 18px 40px rgba(0,0,0,.5)}
.pg-sugestoes[hidden]{display:none}
.pg-sug{appearance:none;display:block;width:100%;text-align:left;border:0;border-bottom:1px solid rgba(134,239,172,.08);background:transparent;color:#eef7f2;padding:10px 14px;font:inherit;cursor:pointer}
.pg-sug:hover,.pg-sug.foco{background:rgba(34,197,94,.12)}.pg-sug strong{display:block;font-size:13.5px}.pg-sug small{display:block;color:#8ba79a;font-size:12px}
.pg-sug.manual strong{color:#fde68a}.pg-sug.vazio{color:#8ba79a;cursor:default;font-size:13px}
.pg-rapidos{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:#8ba79a}
.pg-rapido{appearance:none;border:1px dashed rgba(34,197,94,.45);background:rgba(34,197,94,.08);color:#bbf7d0;border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;font-weight:900;cursor:pointer}
.pg-rapido:hover{background:rgba(34,197,94,.2)}

/* Barra de salvar */
.pg-barra{position:fixed;left:0;right:0;bottom:0;z-index:50;pointer-events:none;display:flex;justify-content:center;padding:0 16px 16px}
.pg-barra[hidden]{display:none}
.pg-barra-in{pointer-events:auto;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;width:min(960px,100%);border:1px solid rgba(251,191,36,.5);border-radius:18px;background:#10150f;box-shadow:0 18px 50px rgba(0,0,0,.6);padding:12px 16px;font-size:13px}
.pg-barra-in div{display:flex;gap:10px}.pg-barra-in b{color:#fbbf24}

/* Janelas */
.pg-overlay .ds-modal-card{max-width:560px;padding:0;background:#09110e;border-color:rgba(134,239,172,.18);color:#eef7f2}
.pg-overlay.larga .ds-modal-card{max-width:1120px}
.pg-jan-topo{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 12px;border-bottom:1px solid rgba(134,239,172,.12)}
.pg-jan-topo h3{margin:0;font-size:19px;color:#fff}.pg-jan-topo p{margin:4px 0 0;color:#8ba79a;font-size:13px}
.pg-fechar{appearance:none;border:1px solid rgba(139,167,154,.26);background:rgba(255,255,255,.03);color:#cfe3d8;width:34px;height:34px;border-radius:50%;cursor:pointer}
.pg-jan-corpo{padding:16px 20px 20px;display:grid;gap:14px}
.pg-jan-corpo label{display:block;color:#86efac;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.pg-jan-corpo label .pg-input{margin-top:6px;text-transform:none;letter-spacing:0;font-weight:400}
.pg-jan-acoes{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
.pg-opcoes{display:grid;gap:8px;max-height:52vh;overflow:auto}
.pg-opcao{appearance:none;display:grid;gap:3px;text-align:left;border:1px solid rgba(134,239,172,.16);border-radius:14px;background:rgba(255,255,255,.025);color:#eef7f2;padding:11px 14px;font:inherit;cursor:pointer}
.pg-opcao:hover{border-color:#22c55e}.pg-opcao b{color:#fff}.pg-opcao span{color:#8ba79a;font-size:12.5px}
.pg-opcao.check{grid-template-columns:auto 1fr;column-gap:12px;align-items:center}.pg-opcao.check span{grid-column:2}.pg-opcao.check input{grid-row:1/3;width:18px;height:18px;accent-color:#22c55e}
.pg-img-opcoes{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:start}
.pg-rotulo{display:block;margin-bottom:6px;color:#86efac;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.pg-seg-grupo{display:inline-flex;border:1px solid rgba(139,167,154,.3);border-radius:12px;overflow:hidden}
.pg-seg{appearance:none;border:0;background:transparent;color:#cfe3d8;padding:10px 14px;font:inherit;font-size:12.5px;font-weight:900;cursor:pointer}.pg-seg.on{background:rgba(34,197,94,.22);color:#fff}
.pg-marcas{display:flex;gap:8px;flex-wrap:wrap}
.pg-jan-corpo label.pg-marca{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(139,167,154,.3);border-radius:999px;padding:7px 12px;font-size:12.5px;font-weight:800;letter-spacing:0;text-transform:none;color:#eef7f2;cursor:pointer}
.pg-marca.sem{opacity:.45}.pg-marca input{accent-color:#22c55e}
.pg-previa{border:1px solid rgba(134,239,172,.14);border-radius:14px;background:#020805;padding:10px;display:grid;place-items:center;max-height:62vh;overflow:auto}
.pg-previa canvas{max-width:100%;height:auto;border-radius:8px}
@media(max-width:760px){
  .pg-detalhes{grid-template-columns:repeat(2,minmax(0,1fr))}.pg-detalhes>label:nth-child(-n+3){grid-column:1/-1}.pg-detalhes>label:nth-child(n+4){grid-column:auto}
  .pg-img-opcoes{grid-template-columns:1fr}.pg-legenda{margin-left:0}.pg-hero .pg-btn{width:100%}
  .pg-barra-in div{width:100%}.pg-barra-in .pg-btn{flex:1}.pg-bloco{padding:14px}
}
`;
