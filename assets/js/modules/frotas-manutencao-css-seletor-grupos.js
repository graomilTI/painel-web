// Frotas · Manutenção › CSS › seletor-grupos
// Janelas largas e a grade de ícones dos grupos do guia (seletor da Corretiva e da Preventiva). Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_SELETOR_GRUPOS = `
.fm-modal-largo .ds-modal-card{display:flex;flex-direction:column;padding:0;overflow:hidden}
/* Grupos do guia numa grade de 4 colunas (12 grupos = 4x3); cada quadrado tem a caixa de "grupo todo" na ponta e abre os itens abaixo. */
.fm-pick-resumo[hidden]{display:none}
.fm-pick-grade{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px}.fm-pick-abertos[hidden]{display:none}
.fm-pick-gr{display:flex;align-items:stretch;min-height:56px;border:1px solid rgba(148,163,184,.2);border-radius:14px;background:rgba(15,23,42,.55);overflow:hidden}.fm-pick-gr.tem{border-color:rgba(34,197,94,.45)}.fm-pick-gr.aberto{border-color:#4ade80;background:rgba(34,197,94,.14);box-shadow:0 0 0 1px #4ade80 inset}
.fm-pick-gt{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:2px;min-width:0;border:0;background:transparent;color:#e2e8f0;padding:8px 10px;font:inherit;text-align:left;cursor:pointer}.fm-pick-gt:hover{background:rgba(34,197,94,.08)}.fm-pick-gt:focus-visible{outline:2px solid #4ade80;outline-offset:-2px}
.fm-pick-gt strong{font-size:12.5px;line-height:1.25;font-weight:800}.fm-pick-gt b{font-size:10.5px;color:#bbf7d0;font-weight:900}.fm-pick-gt b:empty{display:none}
.fm-pick-gck{display:inline-flex;align-items:flex-start;padding:8px 10px 0 0;cursor:pointer}.fm-pick-gck input{width:18px;height:18px;accent-color:#22c55e;cursor:pointer;margin:0}
.fm-pick-gr{position:relative}.fm-pick-gt{flex-direction:row;align-items:center;justify-content:center;padding:8px 6px}
.fm-pick-gt b{position:absolute;left:6px;top:5px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#22c55e;color:#052e16;font-size:10px;line-height:16px;text-align:center}
.fm-pick-gck{position:absolute;top:5px;right:5px;padding:0}.fm-pick-gck input{width:14px;height:14px}
.fm-pick-ic{flex:none;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:rgba(148,163,184,.12);color:#94a3b8}.fm-pick-ic svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.fm-pick-gr.tem .fm-pick-ic,.fm-pick-gr.aberto .fm-pick-ic,.fm-pick-gc-cab .fm-pick-ic{background:rgba(34,197,94,.22);color:#86efac}.fm-pick-gc-cab .fm-pick-ic{width:26px;height:26px;border-radius:8px}.fm-pick-gc-cab .fm-pick-ic svg{width:15px;height:15px}
.fm-pick-abertos{display:grid;margin-top:10px}.fm-pick-abertos:empty{display:none}
/* o grupo clicado entra deslizando logo abaixo da grade */
@keyframes fm-pick-vai{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
.fm-pick-vai{animation:fm-pick-vai .22s ease-out}
@media(prefers-reduced-motion:reduce){.fm-pick-vai{animation:none}}
.fm-pick-gc{padding:12px 14px 14px;display:grid;gap:10px;border:1px solid rgba(34,197,94,.3);border-radius:14px;background:rgba(2,6,23,.38)}
.fm-pick-gc-cab{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.fm-pick-gc-cab strong{color:#f8fafc;font-size:14px}.fm-pick-gc-cab .fm-mm{margin:0}.fm-pick-gtodos{margin-left:auto;display:inline-flex;gap:6px;align-items:center;color:#e2e8f0;font-size:12px;font-weight:800;cursor:pointer}.fm-pick-gtodos input{width:16px;height:16px;accent-color:#22c55e;margin:0}
@media(max-width:900px){.fm-dados{grid-template-columns:repeat(2,minmax(0,1fr))}.fm-pick-grade{grid-template-columns:repeat(6,minmax(0,1fr))}}
`;
