// Frotas · Manutenção › CSS › janela
// Janela (ds-modal-card) e cabeçalho. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_JANELA = `
.fm-mod .ds-modal-card{max-width:1020px;padding:22px}
.fm-mod-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.fm-mod-head h3{margin:0;color:#f8fafc;font-size:21px;letter-spacing:-.02em}.fm-mod-head p{margin:4px 0 0;color:#94a3b8;font-size:13px}
.fm-x{appearance:none;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.8);color:#cbd5e1;border-radius:10px;width:34px;height:34px;cursor:pointer;font-size:15px}
`;
