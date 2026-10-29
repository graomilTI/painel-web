// Frotas · Manutenção › CSS › seletor
// Seletor de itens (versão em lista): campos, itens marcáveis, resumo. Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_SELETOR = `
.fm-pick-corpo{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
.fm-pick-grupos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.fm-pick-g{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:54px;text-align:left;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:rgba(15,23,42,.6);color:#cbd5e1;padding:8px 12px;font:inherit;font-size:13px;font-weight:800;line-height:1.25;cursor:pointer}
.fm-pick-g:hover{border-color:rgba(34,197,94,.5)}.fm-pick-g.tem{border-color:rgba(34,197,94,.4)}.fm-pick-g.ativo{border-color:#4ade80;background:rgba(34,197,94,.2);color:#f0fdf4;box-shadow:0 0 0 1px #4ade80 inset}.fm-pick-g b{flex:none;min-width:22px;height:22px;border-radius:999px;display:inline-grid;place-items:center;background:#22c55e;color:#052e16;font-size:11px}
.fm-pick-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}.fm-pick-cab strong{color:#f8fafc;font-size:14px}
.fm-pick-tipo{display:inline-flex;gap:12px;align-items:center;color:#94a3b8;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.fm-pick-tipo label{display:inline-flex;gap:5px;align-items:center;color:#e2e8f0;text-transform:none;letter-spacing:0;font-size:13px;cursor:pointer}.fm-pick-tipo input{accent-color:#22c55e}
.fm-pick-lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px}
.fm-pick-item{display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:rgba(15,23,42,.6);color:#e2e8f0;font-size:13px;font-weight:700;line-height:1.3;cursor:pointer}.fm-pick-item:hover{border-color:rgba(34,197,94,.5)}.fm-pick-item.sel{border-color:rgba(34,197,94,.65);background:rgba(34,197,94,.16);color:#f0fdf4}.fm-pick-item input{margin-top:2px;accent-color:#22c55e;width:16px;height:16px;flex:none}.fm-pick-item small{display:block;color:#94a3b8;font-weight:600;font-size:11px;margin-top:2px}
.fm-pick-outro{display:flex;gap:8px;margin-top:10px}.fm-pick-outro .fm-input{height:38px;font-size:13px}
.fm-pick-vazio{color:#94a3b8;font-size:12px;padding:10px 2px}.fm-pick-obrig{color:#fde68a;border:1px dashed rgba(245,158,11,.4);border-radius:12px;background:rgba(245,158,11,.08);padding:10px 12px}
.fm-pick-resumo{display:grid;gap:8px}.fm-pick-rg{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.fm-pick-rg strong{color:#e2e8f0;font-size:12px;margin-right:4px}
`;
