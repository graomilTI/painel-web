// Frotas · Manutenção › CSS › extras
// Itens em lista única, peça faltante na cotação e botões do topo. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_EXTRAS = `
/* Itens da manutenção em lista única que minimiza; peça faltante na cotação. */
.fm-il-lista{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
.fm-il{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr) auto 36px;gap:10px;align-items:center;padding:7px 10px;border:1px solid rgba(148,163,184,.16);border-radius:12px;background:rgba(15,23,42,.5);font-size:13px}.fm-il.servico{border-style:dashed}
.fm-il-grupo{color:#bbf7d0;font-size:11px;font-weight:900;letter-spacing:.04em}.fm-il-nome{color:#f8fafc;font-weight:700;min-width:0;overflow-wrap:anywhere}
.fm-ol-falta{display:inline-flex;align-items:center;gap:6px;color:#fca5a5;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}.fm-ol-falta input{accent-color:#ef4444;width:16px;height:16px;margin:0}
.fm-ol.faltante .fm-input[data-ol="valor"]{opacity:.4}.fm-ol.faltante>.fm-ro,.fm-ol.faltante>.fm-input[data-ol="nome"]{text-decoration:line-through;color:#fca5a5}
@media(max-width:900px){.fm-il{grid-template-columns:1fr auto 36px}.fm-il-grupo{grid-column:1/-1}}
.fm-hub-btn{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid rgba(34,197,94,.3);background:rgba(34,197,94,.12);color:#86efac;cursor:pointer;padding:0;transition:.15s}.fm-hub-btn svg{width:18px;height:18px}.fm-hub-btn:hover{border-color:#4ade80;color:#dcfce7}.fm-hub-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);border-color:transparent;color:#052e16}.fm-hub-btn.primary:hover{color:#052e16;filter:brightness(1.08)}.fm-hub-btn:focus-visible{outline:2px solid #4ade80;outline-offset:2px}
`;
