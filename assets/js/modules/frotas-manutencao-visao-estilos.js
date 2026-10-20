import { esc } from '../core/ui.js';

// Placa que leva ao prontuário do veículo. Dentro de um cartão clicável, o clique na placa não abre a ficha (o tratador da tela
// procura [data-prontuario] antes de [data-ficha]).
export function linkPlaca(placa, veiculoId) {
  return veiculoId
    ? `<button type="button" class="fm-placa" data-prontuario="${esc(veiculoId)}" title="Abrir o prontuário do veículo">${esc(placa)}</button>`
    : `<strong>${esc(placa)}</strong>`;
}

// Estilos do Painel, da aba Veículos (prontuário) e da Agenda. Somam-se a ESTILOS_MANUTENCAO.
export const ESTILOS_VISAO = `
<style>
.fm-placa{appearance:none;border:0;background:transparent;padding:0;font:inherit;font-weight:950;color:#f8fafc;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(134,239,172,.45);text-underline-offset:3px}.fm-placa:hover{color:#86efac}
.fm-shell .fm-input,.fm-shell .fm-select{box-sizing:border-box;max-width:100%}
.fm-filtros{display:grid;grid-template-columns:minmax(220px,2fr) repeat(3,minmax(150px,1fr));gap:10px;margin-bottom:12px;align-items:center}.fm-filtros .fm-search{min-width:0}.fm-filtros .fm-select{width:100%;min-width:0;appearance:auto}.fm-contagem{display:flex;justify-content:flex-end;margin:-4px 0 8px}
.fm-vazio-aviso{color:#fbbf24;font-weight:800}.fm-ok-vazio{color:#86efac;font-size:13px;font-weight:800;padding:8px 2px}
.fm-painel-duplo{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start;margin-bottom:14px}.fm-painel-duplo>.fm-sec{margin-top:0;min-width:0}
.fm-sec h4 .fm-link{text-transform:none;letter-spacing:0}
.fm-alertas{list-style:none;margin:0;padding:0;display:grid;gap:7px}.fm-alertas li{display:grid;gap:2px;padding:9px 12px;border:1px solid rgba(148,163,184,.16);border-left:4px solid #94a3b8;border-radius:12px;background:rgba(15,23,42,.6);cursor:pointer}.fm-alertas li:hover{border-color:rgba(34,197,94,.45)}.fm-alertas li.red{border-left-color:#ef4444}.fm-alertas li.amber{border-left-color:#f59e0b}.fm-alertas strong{color:#f8fafc;font-size:13px}.fm-alertas span{color:#94a3b8;font-size:12px;line-height:1.35}
.fm-tab-curta{min-width:0}.fm-tab-curta th{padding:8px 8px}.fm-tab-curta td{padding:8px;font-size:12px}
.fm-saude-barra{display:flex;height:16px;border-radius:999px;overflow:hidden;background:rgba(148,163,184,.14);gap:2px}.fm-saude-barra i{display:block;min-width:4px}
.fm-saude-barra i.tone-red,.fm-dot.tone-red{background:#ef4444}.fm-saude-barra i.tone-amber,.fm-dot.tone-amber{background:#f59e0b}.fm-saude-barra i.tone-green,.fm-dot.tone-green{background:#22c55e}.fm-saude-barra i.tone-blue,.fm-dot.tone-blue{background:#60a5fa}
.fm-saude-leg{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px}.fm-saude-leg li{display:flex;align-items:center;gap:8px;color:#cbd5e1;font-size:13px}.fm-saude-leg b{margin-left:auto;color:#f8fafc}.fm-dot{width:10px;height:10px;border-radius:50%;flex:none}
.fm-bar-quadro{margin-bottom:14px}.fm-bar-quadro .fm-check{min-height:0}
.fm-etapas{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:12px}
.fm-etapa-b{--kc:#60a5fa;appearance:none;font:inherit;text-align:left;display:grid;gap:2px;padding:10px 12px;border:1px solid rgba(148,163,184,.16);border-top:3px solid var(--kc);border-radius:14px;background:rgba(15,23,42,.6);color:#e2e8f0;cursor:pointer}.fm-etapa-b:hover{border-color:var(--kc)}.fm-etapa-b.ativo{background:rgba(2,6,23,.7);box-shadow:0 0 0 1px var(--kc)}
.fm-etapa-b.tone-amber{--kc:#fbbf24}.fm-etapa-b.tone-purple{--kc:#a78bfa}.fm-etapa-b.tone-green{--kc:#4ade80}
.fm-etapa-b strong{font-size:24px;line-height:1;color:#fff}.fm-etapa-b span{font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8}.fm-etapa-b em{font-style:normal;font-size:11px;font-weight:900;color:#fca5a5}
.fm-pl-lista{display:grid;gap:6px}
.fm-pl{display:grid;grid-template-columns:minmax(140px,1fr) minmax(200px,2.4fr) minmax(170px,1.3fr) minmax(110px,.8fr);gap:12px;align-items:center;padding:8px 12px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.55);cursor:pointer}.fm-pl:hover,.fm-pl:focus{outline:none;border-color:rgba(34,197,94,.5)}.fm-pl.atraso{border-left:4px solid #f87171}
.fm-pl-id .fm-mm,.fm-pl-desc .fm-mm{display:block}.fm-pl-desc{color:#e2e8f0;font-size:13px;line-height:1.35;min-width:0;overflow-wrap:anywhere}.fm-pl-etapa{display:flex;gap:4px;flex-wrap:wrap}.fm-pl-prazo{text-align:right}
.fm-pl-mais{display:flex;gap:14px;align-items:center;margin-top:10px;flex-wrap:wrap}
/* Veículos */
.fm-vl-cab,.fm-vl{display:grid;grid-template-columns:minmax(140px,1.2fr) minmax(130px,1.1fr) 100px minmax(190px,1.8fr) minmax(170px,1.6fr) 120px;gap:12px;align-items:center}
.fm-vl-cab{padding:0 14px 8px;color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.fm-vl-lista{display:grid;gap:8px}
.fm-vl{padding:10px 14px;border:1px solid rgba(148,163,184,.14);border-radius:16px;background:rgba(2,6,23,.34);cursor:pointer;transition:border-color .15s,background .15s}.fm-vl:hover,.fm-vl:focus{outline:none;border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.06)}.fm-vl.parado{border-left:4px solid #ef4444}.fm-vl strong{display:block;color:#f8fafc;font-size:13px}
.fm-vl-chips{display:flex;gap:5px;flex-wrap:wrap}.fm-vl-valor{text-align:right;color:#f8fafc;font-weight:800;font-size:13px}.fm-vl-valor .fm-mm{display:block}
.fm-pront-topo{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}.fm-pront-topo h3{margin:0;color:#f8fafc;font-size:26px;letter-spacing:-.02em}.fm-pront-topo p{margin:4px 0 0;color:#94a3b8;font-size:13px}.fm-pront-acoes{display:flex;gap:8px;flex-wrap:wrap}
.fm-pront-faixa{margin-top:14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(239,68,68,.45);background:rgba(239,68,68,.12);color:#fecaca;font-size:13px;font-weight:700;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.fm-pront-faixa button{margin-left:auto}
.fm-pront-dados{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:14px}
.fm-pront-cols{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;align-items:start;margin-top:4px}.fm-pront-cols>div{min-width:0}
.fm-hist{list-style:none;margin:0;padding:0;display:grid;gap:8px}.fm-hist li{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 12px;border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(15,23,42,.6);cursor:pointer}.fm-hist li:hover{border-color:rgba(34,197,94,.45)}.fm-hist time{color:#94a3b8;font-size:12px;font-weight:800}.fm-hist strong{display:block;color:#f8fafc;font-size:13px}.fm-hist .fm-mm{display:block}.fm-hist-fim{text-align:right;display:grid;gap:4px;justify-items:end;font-size:13px;color:#f8fafc;font-weight:800}
.fm-servicos{list-style:none;margin:0;padding:0;display:grid;gap:7px}.fm-servicos li{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 10px;border:1px solid rgba(148,163,184,.14);border-left:4px solid #94a3b8;border-radius:12px;background:rgba(15,23,42,.6);font-size:13px;color:#e2e8f0}.fm-servicos li.vencida{border-left-color:#ef4444}.fm-servicos li.proxima{border-left-color:#f59e0b}.fm-servicos small{display:block;color:#94a3b8}
/* Agenda */
.fm-ag-topo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.fm-ag-topo h3{margin:0;color:#f8fafc;font-size:20px;letter-spacing:-.02em;min-width:170px;text-align:center}
.fm-ag-leg{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}.fm-ag-leg label{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#cbd5e1;font-weight:800;cursor:pointer}.fm-ag-leg input{accent-color:#22c55e}
.fm-ag-corpo{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
.fm-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid rgba(148,163,184,.14);border-radius:16px;overflow:hidden}
.fm-cal-sem{padding:8px;text-align:center;color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;background:rgba(2,6,23,.5);border-bottom:1px solid rgba(148,163,184,.14)}
.fm-cal-dia{min-height:104px;padding:6px;border-right:1px solid rgba(148,163,184,.08);border-bottom:1px solid rgba(148,163,184,.08);background:rgba(15,23,42,.35);min-width:0}.fm-cal-dia:nth-child(7n){border-right:0}.fm-cal-dia.fora{opacity:.4}.fm-cal-dia.hoje{background:rgba(34,197,94,.1);box-shadow:0 0 0 1px #22c55e inset}
.fm-cal-n{display:flex;justify-content:space-between;color:#cbd5e1;font-size:12px;font-weight:900;margin-bottom:4px}.fm-cal-ev{display:block;width:100%;text-align:left;appearance:none;border:0;border-left:3px solid #94a3b8;border-radius:6px;background:rgba(148,163,184,.12);color:#e2e8f0;font:inherit;font-size:11px;font-weight:800;padding:2px 5px;margin-top:3px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fm-cal-ev:hover{background:rgba(148,163,184,.26)}
.fm-cal-ev.blue{border-left-color:#60a5fa}.fm-cal-ev.amber{border-left-color:#fbbf24}.fm-cal-ev.red{border-left-color:#ef4444;background:rgba(239,68,68,.16)}.fm-cal-ev.green{border-left-color:#4ade80}.fm-cal-ev.purple{border-left-color:#a78bfa}
.fm-cal-mais{display:block;width:100%;appearance:none;border:0;background:transparent;color:#86efac;font:inherit;font-size:11px;font-weight:900;text-align:left;padding:3px 2px;cursor:pointer}
.fm-ag-lado{display:grid;gap:14px}.fm-ag-lado .fm-sec{margin-top:0}
.fm-ag-prev{display:grid;gap:8px;padding:9px 10px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.6)}.fm-ag-prev+.fm-ag-prev{margin-top:8px}.fm-ag-prev-lin{display:flex;gap:8px}.fm-ag-prev .fm-input{height:34px;font-size:12px}
.fm-dia-lista{list-style:none;margin:0;padding:0;display:grid;gap:6px}.fm-dia-lista li{display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.6);font-size:13px;color:#e2e8f0;cursor:pointer}.fm-dia-lista li:hover{border-color:rgba(34,197,94,.45)}.fm-dia-lista small{color:#94a3b8;margin-left:auto}
@media(max-width:1250px){.fm-painel-duplo{grid-template-columns:1fr 1fr}.fm-painel-duplo>.fm-sec:last-child{grid-column:1/-1}.fm-ag-corpo{grid-template-columns:1fr}.fm-pront-cols{grid-template-columns:1fr}}
@media(max-width:1100px){.fm-vl-cab{display:none}.fm-vl{grid-template-columns:1fr 1fr}.fm-vl-chips,.fm-vl-urg{grid-column:1/-1}.fm-vl-valor{text-align:left}}
@media(max-width:900px){.fm-filtros{grid-template-columns:1fr 1fr}.fm-filtros .fm-search{grid-column:1/-1}.fm-etapas{grid-template-columns:repeat(3,minmax(0,1fr))}.fm-pl{grid-template-columns:1fr 1fr}.fm-pl-desc,.fm-pl-etapa{grid-column:1/-1}.fm-pl-prazo{text-align:left}}
@media(max-width:760px){.fm-painel-duplo{grid-template-columns:1fr}.fm-cal-dia{min-height:74px;padding:3px}.fm-cal-ev{font-size:9px;padding:1px 3px}.fm-hist li{grid-template-columns:1fr}.fm-hist-fim{justify-items:start;text-align:left}.fm-ag-topo h3{min-width:0}.fm-ag-leg{margin-left:0}}
</style>`;
