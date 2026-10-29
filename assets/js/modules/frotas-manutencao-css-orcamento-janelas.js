// Frotas · Manutenção › CSS › orcamento-janelas
// Janelas de cotação, comparativo e aprovação (e os ajustes de largura). Faz parte de ESTILOS_MANUTENCAO (frotas-manutencao-estilos.js), que junta os arquivos
// frotas-manutencao-css-*.js NESTA ORDEM: a ordem decide quem vence entre regras de mesma especificidade.
// Mexeu aqui? Rode os testes e o harness (tests/harness/manutencao).
export const CSS_ORCAMENTO_JANELAS = `
.fm-orc-linha{display:grid;grid-template-columns:minmax(0,2.4fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,1.6fr);gap:12px;align-items:end;margin-top:8px}
@media(max-width:900px){.fm-orc-linha{grid-template-columns:repeat(2,minmax(0,1fr))}.fm-nota-linha{grid-template-columns:1fr 1fr}.fm-nota-cab{display:none}.fm-grid2,.fm-grid2.tres,.fm-form{grid-template-columns:repeat(2,minmax(0,1fr))}.fm-pick-lista{grid-template-columns:1fr}.fm-nova{grid-template-columns:1fr}.fm-nova-resumo{grid-column:auto}.fm-ol-cab{display:none}.fm-ol{grid-template-columns:1fr 1fr}.fm-item,.fm-item-cab,.fm-form.fm-item-novo{grid-template-columns:1fr 1fr}.fm-item-cab{display:none}.fm-tl li{grid-template-columns:1fr}}
.fm-ol-cab[hidden],.fm-add-itens[hidden]{display:none}
/* comparativo das cotações */
.fm-cmp-rolagem{overflow:auto}.fm-cmp{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;color:#e2e8f0}.fm-cmp th,.fm-cmp td{padding:9px 12px;text-align:left;vertical-align:top;border-bottom:1px solid rgba(148,163,184,.12)}.fm-cmp thead th{color:#f8fafc;font-size:13px;background:rgba(2,6,23,.4)}.fm-cmp thead th .fm-badge{display:block;width:max-content;margin-top:4px}
.fm-cmp tbody th{color:#94a3b8;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}.fm-cmp small{display:block;color:#94a3b8;font-size:11px}
.fm-cmp-destaque td{font-size:15px}.fm-cmp-total.menor{color:#86efac}.fm-cmp td .fm-badge{margin-left:6px}.fm-cmp-sec th{color:#bbf7d0;background:rgba(34,197,94,.06)}.fm-cmp-acao th,.fm-cmp-acao td{border-bottom:0}
.fm-apr-modo{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px;font-size:13px;font-weight:800;color:#e2e8f0}.fm-apr-modo label{display:inline-flex;gap:7px;align-items:center;cursor:pointer}.fm-apr-modo input{accent-color:#22c55e}
.fm-apr-lista{display:grid;gap:8px;margin-top:8px}.fm-apr-orc{display:flex;gap:12px;align-items:center;padding:12px 14px;border:1px solid rgba(148,163,184,.2);border-radius:14px;background:rgba(15,23,42,.5);cursor:pointer}.fm-apr-orc:hover{border-color:rgba(34,197,94,.5)}.fm-apr-orc:has(input:checked){border-color:#4ade80;background:rgba(34,197,94,.14)}.fm-apr-orc input{accent-color:#22c55e;width:18px;height:18px;flex:none}.fm-apr-orc-t{flex:1;min-width:0;display:grid;gap:3px}.fm-apr-orc-t .fm-badge{justify-self:start}.fm-apr-orc-t small{color:#94a3b8;font-size:11px}.fm-apr-orc b{font-size:16px;color:#f8fafc;white-space:nowrap}
.fm-apr-cel{display:inline-flex;gap:7px;align-items:center;padding:6px 9px;border:1px solid rgba(148,163,184,.2);border-radius:10px;cursor:pointer}.fm-apr-cel:has(input:checked){border-color:#4ade80;background:rgba(34,197,94,.16);color:#f0fdf4}.fm-apr-cel input{accent-color:#22c55e}
.fm-cmp-resumo{display:grid;gap:4px;margin-top:12px;padding:10px 12px;border:1px solid rgba(34,197,94,.25);border-radius:12px;background:rgba(34,197,94,.08);color:#e2e8f0;font-size:13px}
/* janela da cotação */
.fm-modal-largo.fm-modal-orc .ds-modal-card{width:min(960px,calc(100vw - 32px))}.fm-orc-cab{padding:18px 22px 12px;border-bottom:1px solid rgba(148,163,184,.14)}
.fm-orc-form{grid-template-columns:minmax(0,1fr);margin:0;padding:0;border:0;background:none;gap:12px}.fm-orc-form>details.fm-mais{border:1px solid rgba(148,163,184,.16);border-radius:14px;background:rgba(2,6,23,.3);padding:12px 14px;margin:0}.fm-orc-form>details.fm-mais>summary{padding:0}
@media(max-width:560px){.fm-dados{grid-template-columns:1fr}.fm-nota-entrada{grid-template-columns:1fr}.fm-nota-linha{grid-template-columns:1fr}.fm-grid2,.fm-grid2.tres,.fm-form{grid-template-columns:1fr}.fm-item,.fm-form.fm-item-novo,.fm-nova{grid-template-columns:1fr}.fm-field[style*="span"]{grid-column:1/-1!important}}
`;
