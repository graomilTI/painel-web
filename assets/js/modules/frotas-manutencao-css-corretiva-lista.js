// Frotas · Manutenção › CSS › corretiva-lista
// Corretiva por etapas: cartões de manutenção, ficha chapada dentro do cartão, ícones de ação, janelas largas. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_CORRETIVA_LISTA = `
/* Corretiva por etapas (modelo de Compras): abas com contador, um cartão por manutenção e a coluna de ações à direita. */
.fm-etapas{margin-bottom:14px}.fm-kpis.fm-etapas{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.fm-etapas .fm-kcard{min-width:0}.fm-bar .fm-search{flex:1 1 220px;min-width:0}.fm-bar .fm-search .fm-input{box-sizing:border-box}.fm-bar .fm-count{flex:none;white-space:nowrap}
@media(min-width:1180px){.fm-kpis.fm-etapas{grid-template-columns:repeat(8,minmax(0,1fr))}}
.fm-mcs{display:grid;gap:14px}
.fm-mc{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.7),rgba(2,6,23,.7));overflow:hidden}
.fm-mc.aberto{border-color:rgba(34,197,94,.4)}.fm-mc-corpo{min-width:0}
.fm-mc-topo,.fm-mc-cab{display:grid;grid-template-columns:16px 118px 100px minmax(150px,1.3fr) minmax(130px,1fr) 96px 96px 224px;gap:12px;align-items:center}
.fm-mc-topo{padding:12px 16px;cursor:pointer;background:rgba(15,23,42,.65)}
.fm-mc-topo:hover{background:rgba(22,101,52,.12)}.fm-mc-topo:focus-visible{outline:2px solid #4ade80;outline-offset:-2px}
.fm-mc-resumo{display:flex;flex-wrap:wrap;gap:4px 18px;padding:2px 16px 12px 44px;font-size:12.5px;color:#cbd5e1}.fm-mc-resumo b{color:#86efac;font-weight:800;margin-right:4px}.fm-mc-resumo p{flex:1 1 100%;margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;color:#e2e8f0}
.fm-mc-seta{color:#86efac;font-size:12px;transition:transform .15s}.fm-mc.aberto .fm-mc-seta{transform:rotate(90deg)}
.fm-mc-topo strong{display:block;color:#f8fafc;font-size:13.5px}
.fm-mc-itens{padding:12px 16px 14px;display:grid;gap:8px}
.fm-mc-itens-cab{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:2px}.fm-mc-itens-cab .fm-mm{margin:0}.fm-mc-itens-cab .fm-link{margin-left:auto}
.fm-mc-todas{display:inline-flex;align-items:center;gap:8px;color:#e2e8f0;font-size:12px;font-weight:900;cursor:pointer}
.fm-mc input[type=checkbox]{width:17px;height:17px;accent-color:#22c55e;cursor:pointer;flex:none;margin:0}
.fm-mc-grupo{display:grid;grid-template-columns:190px minmax(0,1fr);gap:10px;align-items:start;padding-top:8px;border-top:1px solid rgba(148,163,184,.09)}
.fm-mc-gtit{display:flex;align-items:center;gap:8px;min-height:30px;color:#bbf7d0;font-size:12px;cursor:default}.fm-mc-gtit strong{font-size:12px;color:#bbf7d0;letter-spacing:.02em}
label.fm-mc-gtit{cursor:pointer}
.fm-mc-linhas{display:flex;flex-wrap:wrap;gap:6px}
.fm-mc-linha{display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:5px 10px;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:rgba(15,23,42,.6);color:#e2e8f0;font-size:12px;font-weight:700;line-height:1.3}
label.fm-mc-linha{cursor:pointer}label.fm-mc-linha:hover{border-color:rgba(34,197,94,.5)}.fm-mc-linha.sel{border-color:rgba(34,197,94,.65);background:rgba(34,197,94,.16);color:#f0fdf4}
.fm-mc-linha.servico{border-style:dashed}.fm-mc-nome{min-width:0;overflow-wrap:anywhere}
.fm-mc-tipo{font-style:normal;padding:1px 7px;border-radius:999px;font-size:9.5px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;border:1px solid rgba(96,165,250,.34);background:rgba(59,130,246,.12);color:#bfdbfe}.fm-mc-tipo.servico{border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a}
.fm-mc-detalhe{padding:2px 16px 10px;border-top:1px solid rgba(148,163,184,.12)}
/* Dentro do cartão a ficha é chapada: seções separadas por uma linha fina, sem caixa dentro da caixa. */
.fm-mc-detalhe .fm-sec{border:0;border-radius:0;background:transparent;padding:12px 0;margin:0}.fm-mc-detalhe .fm-sec+.fm-sec{border-top:1px solid rgba(148,163,184,.12)}
.fm-mc-detalhe .fm-sec h4{margin-bottom:8px}.fm-h4-acoes{display:inline-flex;gap:8px;align-items:center;margin-left:auto}
.fm-ic-act.on{background:rgba(34,197,94,.2);border-color:#4ade80;color:#dcfce7}
.fm-mc-detalhe .fm-mais>summary{padding:0}.fm-mc-detalhe details.fm-sec{padding:11px 0}.fm-mc-detalhe .fm-acoes{margin-top:8px;padding-top:10px;border-top:1px solid rgba(148,163,184,.12)}
.fm-mc-detalhe .fm-form{background:rgba(2,6,23,.3)}.fm-mc-detalhe .fm-input,.fm-mc-detalhe .fm-select,.fm-mc-detalhe .fm-field textarea{box-sizing:border-box;max-width:100%}
.fm-det-topo{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:12px}
.fm-mc-acoes{display:flex;flex-direction:row;gap:7px;align-items:center;justify-content:flex-end}
.fm-mc-cel{min-width:0;color:#e2e8f0;font-size:13px;font-weight:600;overflow-wrap:anywhere}.fm-mc-cel strong{font-size:13.5px;color:#f8fafc}.fm-mc-cel.fm-atraso{color:#fca5a5;font-weight:900}
.fm-mc-cab{padding:0 16px 8px}.fm-mc-cab-col{appearance:none;border:0;background:transparent;color:#94a3b8;font:inherit;font-size:10.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;text-align:left;padding:4px 0;cursor:pointer;display:inline-flex;align-items:center;gap:5px}.fm-mc-cab-col:hover,.fm-mc-cab-col.ativa{color:#bbf7d0}.fm-mc-cab-col:focus-visible{outline:2px solid #4ade80;outline-offset:2px}.fm-mc-cab-col span{font-size:9px}
.fm-ic-act{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.7);color:#eef7f2;cursor:pointer;flex:none;padding:0;transition:.15s}
.fm-ic-act svg{width:16px;height:16px}.fm-ic-act:hover:not(:disabled){background:rgba(34,197,94,.16);border-color:rgba(34,197,94,.45)}.fm-ic-act:focus-visible{outline:2px solid #4ade80;outline-offset:2px}.fm-ic-act:disabled{opacity:.35;cursor:not-allowed}
.fm-ic-act.tom-iniciar_orcamento,.fm-ic-act.tom-reabrir_orcamento,.fm-ic-act.tom-aprovar,.fm-ic-act.tom-concluir,.fm-ic-act.tom-emitir_os{background:rgba(16,185,129,.14);border-color:rgba(52,211,153,.28);color:#68f0ac}
.fm-ic-act.tom-orcamento,.fm-ic-act.tom-enviar_aprovacao,.fm-ic-act.tom-enviar_notas,.fm-ic-act.tom-financeiro,.fm-ic-act.tom-notas{background:rgba(59,130,246,.12);border-color:rgba(96,165,250,.26);color:#93c5fd}
.fm-ic-act.tom-reprovar,.fm-ic-act.tom-cancelar{background:rgba(239,68,68,.09);border-color:rgba(248,113,113,.24);color:#ff7272}

.fm-modal-largo .ds-modal-card{width:min(1320px,calc(100vw - 32px));max-width:none;max-height:calc(100vh - 32px)}
/* janelas largas: o topo fica fixo e só a parte de baixo cresce ou encolhe com o conteúdo (sem a janela "pular" ao abrir e fechar grupos) */
.ds-modal.fm-modal-largo{align-items:flex-start;padding-top:max(16px,5vh)}.fm-modal-largo .ds-modal-card{max-height:calc(100vh - max(16px,5vh) - 16px)}
@media(max-width:1100px){.fm-mc-cab{display:none}.fm-mc-seta{grid-row:1/span 2;align-self:start;margin-top:14px}.fm-mc-topo{grid-template-columns:16px repeat(3,minmax(0,1fr));row-gap:8px}.fm-mc-topo .fm-mc-cel::before{content:attr(data-rot);display:block;color:#94a3b8;font-size:9.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:1px}.fm-mc-acoes{grid-column:2/-1;justify-content:flex-start}.fm-mc-grupo{grid-template-columns:1fr}}
@media(max-width:700px){.fm-mc-acoes{flex-wrap:wrap}.fm-mc-topo{grid-template-columns:16px repeat(2,minmax(0,1fr))}}
`;
