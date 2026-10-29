// Frotas · Manutenção › CSS › cotacao-linhas
// Linhas da cotação (peça/serviço, marca, valor). Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_COTACAO_LINHAS = `
.fm-ols{display:grid;gap:6px}.fm-ol,.fm-ol-cab{display:grid;grid-template-columns:minmax(170px,2fr) minmax(150px,2fr) 130px 130px 36px;gap:8px;align-items:center}.fm-ol-cab{color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}.fm-ol .fm-input{height:38px;font-size:13px}
.fm-ol-lista{list-style:none;margin:6px 0 2px;padding:8px 0 0;border-top:1px solid rgba(148,163,184,.14);display:grid;gap:5px}.fm-ol-lista li{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#e2e8f0}.fm-ol-lista small{display:block;color:#94a3b8;font-size:11px}.fm-ol-lista b{white-space:nowrap;color:#f8fafc}
`;
