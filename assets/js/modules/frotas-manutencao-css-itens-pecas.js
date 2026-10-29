// Frotas · Manutenção › CSS › itens-pecas
// Peças já usadas, etiquetas de serviço, componentes, etapa, blocos recolhíveis. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_ITENS_PECAS = `

.fm-pg.fm-pg-larga{max-width:none}
.fm-pagina[hidden],[data-vista-lista][hidden]{display:none}.fm-pg-barra{margin:0 0 12px}.fm-pg{max-width:1180px;margin:0 auto}.fm-pagina .fm-x{display:none}
.fm-pick-cel{display:grid;gap:4px;align-content:start}.fm-pick-pecas{display:flex;flex-wrap:wrap;gap:4px;padding:0 4px 2px}
.fm-pick-peca{border:1px solid rgba(96,165,250,.4);background:rgba(59,130,246,.1);color:#bfdbfe;border-radius:999px;padding:3px 10px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.fm-pick-peca:hover{border-color:#60a5fa}.fm-pick-peca.on{background:#2563eb;border-color:#60a5fa;color:#fff}
.fm-chip-peca{font-style:normal;margin-left:4px;padding:1px 7px;border-radius:999px;background:rgba(59,130,246,.2);color:#bfdbfe;font-size:10px;font-weight:900}
.fm-pick-tag{margin-left:auto;align-self:center;font-style:normal;padding:2px 8px;border-radius:999px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a;font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
.fm-pick-item.servico{border-style:dashed}.fm-chip-x.servico{border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a}.fm-chip-x.servico button{color:#fde68a}
.fm-comp.servico{border-style:dashed}.fm-comp .fm-pick-tag{margin-left:2px}
.fm-pick-outro .fm-select{width:auto;min-width:96px;height:38px;font-size:13px}
.fm-ol[data-tipo="servico"] .fm-ro{color:#fde68a}
.fm-item-comps{grid-column:1/-1}.fm-item-comps:empty{display:none}
.fm-comps{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:8px 10px;border:1px dashed rgba(148,163,184,.22);border-radius:12px;background:rgba(2,6,23,.28)}.fm-comps-t{flex:1 1 100%;color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.fm-comp{display:inline-flex;gap:6px;align-items:center;padding:4px 10px;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:rgba(15,23,42,.6);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer}.fm-comp:hover{border-color:rgba(34,197,94,.5)}.fm-comp input{accent-color:#22c55e;width:14px;height:14px;margin:0}.fm-comp:has(input:checked){border-color:rgba(34,197,94,.6);background:rgba(34,197,94,.16);color:#dcfce7}
.fm-etapa{display:flex;align-items:center;gap:10px;margin:14px 0 4px;color:#94a3b8;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.fm-etapa .fm-badge{font-size:12px;letter-spacing:0;text-transform:none;padding:5px 11px}
.fm-mais>summary{cursor:pointer;list-style:none;color:#86efac;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.fm-mais>summary::-webkit-details-marker{display:none}.fm-mais>summary::before{content:'▸ ';display:inline-block;width:14px}.fm-mais[open]>summary::before{content:'▾ '}.fm-mais[open]>summary{margin-bottom:10px}
details.fm-field.fm-mais{margin-top:2px}
`;
