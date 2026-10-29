// Frotas · Manutenção › CSS › ficha-blocos
// Ficha: lista de cotações em linha, formulário, linha do tempo, ações, avisos e erros. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_FICHA_BLOCOS = `
.fm-orcs{display:grid;gap:6px}.fm-orc{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border:1px solid rgba(148,163,184,.18);border-radius:12px;padding:8px 12px;background:rgba(15,23,42,.6)}.fm-orc.sel{border-color:#4ade80;box-shadow:0 0 0 1px #4ade80;background:rgba(22,101,52,.2)}.fm-orc strong{color:#f8fafc;font-size:14px}.fm-orc .v{font-size:15px;font-weight:950;color:#fff;white-space:nowrap}.fm-orc-info{flex:1;min-width:140px;margin:0}.fm-orc-acoes{display:flex;gap:6px;margin-left:auto}
.fm-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:10px;padding:12px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:14px}
.fm-tl{list-style:none;margin:0;padding:0;display:grid;gap:8px}.fm-tl li{display:grid;grid-template-columns:150px 1fr;gap:10px;font-size:12px;color:#cbd5e1;border-left:2px solid rgba(34,197,94,.4);padding-left:10px}.fm-tl time{color:#94a3b8}
.fm-acoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;align-items:center;justify-content:flex-end}.fm-acoes .fm-dica{flex:1 1 100%;color:#fde68a;font-size:12px;text-align:right}
.fm-aviso{margin-top:10px;padding:10px 12px;border-radius:12px;border:1px solid rgba(245,158,11,.34);background:rgba(245,158,11,.1);color:#fde68a;font-size:12px;line-height:1.5}
.fm-erros{margin:10px 0 0;padding:10px 12px 10px 28px;border-radius:12px;border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca;font-size:12px}
`;
