// Frotas · Manutenção › CSS › ficha
// Ficha: passos, seções, grades, itens e rótulos. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_FICHA = `
.fm-steps{display:flex;gap:6px;margin:16px 0 6px;flex-wrap:wrap}.fm-step{flex:1 1 110px;min-width:96px;border-radius:12px;padding:8px 10px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.6);color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;text-align:center}.fm-step.feito{border-color:rgba(34,197,94,.3);background:rgba(22,101,52,.2);color:#86efac}.fm-step.atual{border-color:#4ade80;background:rgba(34,197,94,.18);color:#dcfce7;box-shadow:0 0 0 1px #4ade80}.fm-step.erro{border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.16);color:#fecaca}
.fm-sec{border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:14px;margin-top:14px;background:rgba(2,6,23,.3)}.fm-sec h4{margin:0 0 10px;color:#bbf7d0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;gap:8px}
.fm-grid2{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.fm-grid2.tres{grid-template-columns:repeat(3,minmax(0,1fr))}
.fm-ro{color:#f8fafc;font-size:14px;font-weight:700;line-height:1.4;word-break:break-word}.fm-ro small{display:block;color:#94a3b8;font-weight:600;font-size:11px;margin-top:2px}
.fm-itens{display:grid;gap:8px}.fm-item{display:grid;grid-template-columns:minmax(170px,2fr) minmax(170px,2.5fr) 120px 40px;gap:8px;align-items:start}.fm-item .fm-input,.fm-item .fm-select{height:38px;font-size:13px}
.fm-form.fm-item-novo{grid-template-columns:minmax(170px,2fr) minmax(170px,2.5fr) auto;margin-top:10px}
.fm-nova .fm-field .fm-check{text-transform:none;letter-spacing:0;font-size:13px;margin:0}
.fm-prev-comps{display:grid;gap:8px;margin-bottom:8px}.fm-prev-comps:empty{display:none}.fm-prev-comp strong{display:block;margin:0 0 4px;color:#e2e8f0;font-size:12px}
.fm-obrig{margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a;font-size:10px;letter-spacing:.06em}
`;
