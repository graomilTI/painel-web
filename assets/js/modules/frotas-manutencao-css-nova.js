// Frotas · Manutenção › CSS › nova
// Nova solicitação: grade, campos, corpo e rodapé da janela. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_NOVA = `
.fm-nova{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:'pedido' 'itens';gap:14px;align-items:start;margin-top:14px}.fm-nova>.fm-sec{margin-top:0}.fm-nova-pedido{grid-area:pedido}.fm-nova-itens{grid-area:itens;min-width:0}
.fm-nova-campos{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1.3fr) minmax(0,.8fr) auto minmax(0,.55fr) minmax(0,1.1fr);gap:12px 14px;align-items:end}.fm-nova-problema{grid-column:1/-1}.fm-nova-pedido textarea{min-height:64px}.fm-check-caixa{min-height:42px;padding:0 14px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;margin:0!important;white-space:nowrap}.fm-check-caixa:has(input:checked){border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.12);color:#fecaca}.fm-nova-prontos{margin-bottom:12px}
.fm-pend{list-style:none;margin:14px 0 0;padding:12px 0 0;border-top:1px solid rgba(148,163,184,.14);display:grid;gap:6px;font-size:13px;font-weight:700}.fm-pend li{display:flex;gap:8px;color:#94a3b8}.fm-pend li.ok{color:#86efac}
.fm-nova-acoes{display:flex;gap:10px;flex:none}
.fm-nova-corpo{overflow:auto;flex:1 1 auto;min-height:0;padding:10px 16px}.fm-nova-corpo .fm-nova{margin-top:0;gap:10px}.fm-nova-pedido{padding:10px 12px}
.fm-nova-rodape{flex:none;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:14px 22px;border-top:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.55)}
.fm-nova-info{flex:1;min-width:220px}.fm-nova-info .fm-erros{margin:0 0 6px}.fm-pend-linha{display:flex;flex-wrap:wrap;gap:4px 18px;margin:0;padding:0;border:0}
`;
