// Frotas · Manutenção › CSS › sugestoes
// Sugestões pela descrição do problema e a grade da nova solicitação em telas menores. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_SUGESTOES = `
.fm-sug{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:0 0 10px;padding:9px 12px;border:1px dashed rgba(96,165,250,.4);border-radius:14px;background:rgba(59,130,246,.07)}.fm-sug[hidden]{display:none}
.fm-sug-t{flex:none;color:#93c5fd;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.fm-sug button{border:1px solid rgba(96,165,250,.4);background:rgba(59,130,246,.12);color:#dbeafe;border-radius:999px;padding:4px 11px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.fm-sug button:hover{border-color:#60a5fa;background:rgba(59,130,246,.24)}.fm-sug button small{margin-left:6px;color:#93c5fd;font-weight:700}
.fm-sug button.fm-sug-todas{border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.16);color:#bbf7d0;margin-left:auto}.fm-sug button.fm-sug-grupo{border-style:dashed}
@media(max-width:1100px){.fm-nova{grid-template-columns:minmax(0,1fr);grid-template-areas:'pedido' 'itens' 'resumo'}.fm-nova-campos{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
