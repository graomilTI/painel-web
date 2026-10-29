// Frotas · Manutenção › CSS › base-b
// Base (depois da lista compartilhada): barra de ações das abas, nota, chips e texto de apoio. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_BASE_B = `
/* Barra de ações das abas. NÃO usar .fm-head: o hub (frotas-hub.css) esconde esse bloco nas telas antigas. */
.fm-topo{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:14px}.fm-topo .fm-head-actions{display:flex;gap:10px;flex-wrap:wrap}
.fm-nota{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}
.fm-chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}.fm-chips .fm-badge{font-weight:800}
.fm-mm{color:#94a3b8;font-size:11px;display:block;margin-top:2px}
`;
