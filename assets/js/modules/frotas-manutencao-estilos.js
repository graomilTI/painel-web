import { ESTILOS_LISTA } from './frotas-ui-lista.js?v=20261021-frotas-manut45';

// Estilos da tela de Manutenção (lista, ficha em modal, vencimentos e oficinas). Reaproveita o prefixo .fm-
// das demais listas do Frotas e acrescenta passo a passo, linha do tempo, orçamentos e formulários.
export const ESTILOS_MANUTENCAO = `
<style>
.fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}
.fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fm-body{padding:18px}
.fm-input,.fm-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark;font:inherit}.fm-select option{background:#0d0d18;color:#e2e2f0}
.fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-weight:950}.fm-btn:disabled{opacity:.45;cursor:not-allowed}
.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fm-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fm-btn.danger{border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.14);color:#fecaca}
.fm-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}
.fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:1040px}.fm-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fm-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:middle}.fm-table tr.fm-linha{cursor:pointer}.fm-table tr.fm-linha:hover td{background:rgba(22,101,52,.10)}
.fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.ok,.fm-badge.green{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-badge.warn,.fm-badge.amber{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fm-badge.err,.fm-badge.red{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fm-badge.blue{border-color:rgba(96,165,250,.34);background:rgba(59,130,246,.12);color:#bfdbfe}.fm-badge.purple{border-color:rgba(167,139,250,.34);background:rgba(139,92,246,.14);color:#ddd6fe}
.fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}
.fm-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fm-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none;font:inherit}.fm-field.full{grid-column:1/-1}.fm-field small{display:block;margin-top:5px;color:#94a3b8;font-size:11px}
.fm-check{display:flex;align-items:center;gap:8px;color:#e2e2f0;font-size:13px;font-weight:800;min-height:42px}.fm-check input{width:18px;height:18px;accent-color:#22c55e}
.fm-toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.fm-toolbar .fm-select{width:auto;min-width:150px}
${ESTILOS_LISTA}
/* Barra de ações das abas. NÃO usar .fm-head: o hub (frotas-hub.css) esconde esse bloco nas telas antigas. */
.fm-topo{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:14px}.fm-topo .fm-head-actions{display:flex;gap:10px;flex-wrap:wrap}
.fm-nota{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}
.fm-chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}.fm-chips .fm-badge{font-weight:800}
.fm-mm{color:#94a3b8;font-size:11px;display:block;margin-top:2px}
.fm-mod .ds-modal-card{max-width:1020px;padding:22px}
.fm-mod-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.fm-mod-head h3{margin:0;color:#f8fafc;font-size:21px;letter-spacing:-.02em}.fm-mod-head p{margin:4px 0 0;color:#94a3b8;font-size:13px}
.fm-x{appearance:none;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.8);color:#cbd5e1;border-radius:10px;width:34px;height:34px;cursor:pointer;font-size:15px}
.fm-steps{display:flex;gap:6px;margin:16px 0 6px;flex-wrap:wrap}.fm-step{flex:1 1 110px;min-width:96px;border-radius:12px;padding:8px 10px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.6);color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;text-align:center}.fm-step.feito{border-color:rgba(34,197,94,.3);background:rgba(22,101,52,.2);color:#86efac}.fm-step.atual{border-color:#4ade80;background:rgba(34,197,94,.18);color:#dcfce7;box-shadow:0 0 0 1px #4ade80}.fm-step.erro{border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.16);color:#fecaca}
.fm-sec{border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:14px;margin-top:14px;background:rgba(2,6,23,.3)}.fm-sec h4{margin:0 0 10px;color:#bbf7d0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;gap:8px}
.fm-grid2{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.fm-grid2.tres{grid-template-columns:repeat(3,minmax(0,1fr))}
.fm-ro{color:#f8fafc;font-size:14px;font-weight:700;line-height:1.4;word-break:break-word}.fm-ro small{display:block;color:#94a3b8;font-weight:600;font-size:11px;margin-top:2px}
.fm-itens{display:grid;gap:8px}.fm-item{display:grid;grid-template-columns:minmax(170px,2fr) minmax(170px,2.5fr) 120px 40px;gap:8px;align-items:start}.fm-item .fm-input,.fm-item .fm-select{height:38px;font-size:13px}
.fm-form.fm-item-novo{grid-template-columns:minmax(170px,2fr) minmax(170px,2.5fr) auto;margin-top:10px}
.fm-nova .fm-field .fm-check{text-transform:none;letter-spacing:0;font-size:13px;margin:0}
.fm-prev-comps{display:grid;gap:8px;margin-bottom:8px}.fm-prev-comps:empty{display:none}.fm-prev-comp strong{display:block;margin:0 0 4px;color:#e2e8f0;font-size:12px}
.fm-obrig{margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a;font-size:10px;letter-spacing:.06em}
.fm-pick-busca{margin-bottom:10px}
.fm-pick-corpo{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
.fm-pick-grupos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.fm-pick-g{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:54px;text-align:left;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:rgba(15,23,42,.6);color:#cbd5e1;padding:8px 12px;font:inherit;font-size:13px;font-weight:800;line-height:1.25;cursor:pointer}
.fm-pick-g:hover{border-color:rgba(34,197,94,.5)}.fm-pick-g.tem{border-color:rgba(34,197,94,.4)}.fm-pick-g.ativo{border-color:#4ade80;background:rgba(34,197,94,.2);color:#f0fdf4;box-shadow:0 0 0 1px #4ade80 inset}.fm-pick-g b{flex:none;min-width:22px;height:22px;border-radius:999px;display:inline-grid;place-items:center;background:#22c55e;color:#052e16;font-size:11px}
.fm-pick-painel{border:1px solid rgba(148,163,184,.16);border-radius:14px;background:rgba(2,6,23,.3);padding:14px;min-height:240px}
.fm-pick-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}.fm-pick-cab strong{color:#f8fafc;font-size:14px}
.fm-pick-tipo{display:inline-flex;gap:12px;align-items:center;color:#94a3b8;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.fm-pick-tipo label{display:inline-flex;gap:5px;align-items:center;color:#e2e8f0;text-transform:none;letter-spacing:0;font-size:13px;cursor:pointer}.fm-pick-tipo input{accent-color:#22c55e}
.fm-pick-lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px}
.fm-pick-item{display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:rgba(15,23,42,.6);color:#e2e8f0;font-size:13px;font-weight:700;line-height:1.3;cursor:pointer}.fm-pick-item:hover{border-color:rgba(34,197,94,.5)}.fm-pick-item.sel{border-color:rgba(34,197,94,.65);background:rgba(34,197,94,.16);color:#f0fdf4}.fm-pick-item input{margin-top:2px;accent-color:#22c55e;width:16px;height:16px;flex:none}.fm-pick-item small{display:block;color:#94a3b8;font-weight:600;font-size:11px;margin-top:2px}
.fm-pick-outro{display:flex;gap:8px;margin-top:10px}.fm-pick-outro .fm-input{height:38px;font-size:13px}
.fm-pick-vazio{color:#94a3b8;font-size:12px;padding:10px 2px}.fm-pick-obrig{color:#fde68a;border:1px dashed rgba(245,158,11,.4);border-radius:12px;background:rgba(245,158,11,.08);padding:10px 12px}
.fm-pick-resumo{display:grid;gap:8px}.fm-pick-rg{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.fm-pick-rg strong{color:#e2e8f0;font-size:12px;margin-right:4px}
.fm-ols{display:grid;gap:6px}.fm-ol,.fm-ol-cab{display:grid;grid-template-columns:minmax(170px,2fr) minmax(150px,2fr) 130px 36px;gap:8px;align-items:center}.fm-ol-cab{color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}.fm-ol .fm-input{height:38px;font-size:13px}
.fm-ol-lista{list-style:none;margin:6px 0 2px;padding:8px 0 0;border-top:1px solid rgba(148,163,184,.14);display:grid;gap:5px}.fm-ol-lista li{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#e2e8f0}.fm-ol-lista small{display:block;color:#94a3b8;font-size:11px}.fm-ol-lista b{white-space:nowrap;color:#f8fafc}
.fm-nova{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr) minmax(290px,350px);gap:14px;align-items:start;margin-top:14px}.fm-nova>.fm-sec{margin-top:0}
.fm-nova-resumo{position:sticky;top:12px}.fm-nova-campos{display:grid;gap:14px}.fm-nova-pedido textarea{min-height:170px}.fm-nova-prontos{margin-bottom:12px}
.fm-pend{list-style:none;margin:14px 0 0;padding:12px 0 0;border-top:1px solid rgba(148,163,184,.14);display:grid;gap:6px;font-size:13px;font-weight:700}.fm-pend li{display:flex;gap:8px;color:#94a3b8}.fm-pend li.ok{color:#86efac}
.fm-nova-acoes{display:grid;gap:8px;margin-top:14px}.fm-nova-acoes .fm-btn{width:100%}
.fm-pg.fm-pg-larga{max-width:none}
.fm-pagina[hidden],[data-vista-lista][hidden]{display:none}.fm-pg-barra{margin:0 0 12px}.fm-pg{max-width:1180px;margin:0 auto}.fm-pagina .fm-x{display:none}
.fm-pick-cel{display:grid;gap:4px;align-content:start}.fm-pick-pecas{display:flex;flex-wrap:wrap;gap:4px;padding:0 4px 2px}
.fm-pick-peca{border:1px solid rgba(96,165,250,.4);background:rgba(59,130,246,.1);color:#bfdbfe;border-radius:999px;padding:3px 10px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.fm-pick-peca:hover{border-color:#60a5fa}.fm-pick-peca.on{background:#2563eb;border-color:#60a5fa;color:#fff}
.fm-chip-peca{font-style:normal;margin-left:4px;padding:1px 7px;border-radius:999px;background:rgba(59,130,246,.2);color:#bfdbfe;font-size:10px;font-weight:900}
.fm-pick-tag{margin-left:auto;align-self:center;font-style:normal;padding:2px 8px;border-radius:999px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a;font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
.fm-pick-item.servico{border-style:dashed}.fm-chip-x.servico{border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a}.fm-chip-x.servico button{color:#fde68a}
.fm-comp.servico{border-style:dashed}.fm-comp .fm-pick-tag{margin-left:2px}
.fm-pick-outro .fm-select{width:auto;min-width:96px;height:38px;font-size:13px}
/* Nova manutenção: grupos numa lista à esquerda e itens do grupo à direita, cada um rolando sozinho (cabe sem rolar o modal). */
@media(min-width:901px){
.fm-nova .fm-pick-corpo{grid-template-columns:200px minmax(0,1fr)}
.fm-nova .fm-pick-grupos,.fm-nova .fm-pick-painel{max-height:max(300px,calc(100vh - 360px));overflow:auto}
.fm-nova .fm-pick-grupos{grid-template-columns:1fr;align-content:start;gap:6px;padding-right:4px}
.fm-nova .fm-pick-g{min-height:40px;padding:6px 10px;font-size:12.5px}
.fm-nova .fm-pick-lista{grid-template-columns:1fr}
.fm-nova .fm-pick-item{padding:7px 10px}
.fm-nova .fm-pick-painel{min-height:0;padding:12px}
.fm-nova .fm-pick-cab{position:sticky;top:-12px;z-index:1;margin:-12px -12px 10px;padding:10px 12px;background:#0a1410;border-bottom:1px solid rgba(148,163,184,.14);border-radius:14px 14px 0 0}
.fm-nova .fm-nova-pedido textarea{min-height:120px}
}
.fm-ol[data-tipo="servico"] .fm-ro{color:#fde68a}
.fm-item-comps{grid-column:1/-1}.fm-item-comps:empty{display:none}
.fm-comps{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:8px 10px;border:1px dashed rgba(148,163,184,.22);border-radius:12px;background:rgba(2,6,23,.28)}.fm-comps-t{flex:1 1 100%;color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.fm-comp{display:inline-flex;gap:6px;align-items:center;padding:4px 10px;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:rgba(15,23,42,.6);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer}.fm-comp:hover{border-color:rgba(34,197,94,.5)}.fm-comp input{accent-color:#22c55e;width:14px;height:14px;margin:0}.fm-comp:has(input:checked){border-color:rgba(34,197,94,.6);background:rgba(34,197,94,.16);color:#dcfce7}
.fm-etapa{display:flex;align-items:center;gap:10px;margin:14px 0 4px;color:#94a3b8;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.fm-etapa .fm-badge{font-size:12px;letter-spacing:0;text-transform:none;padding:5px 11px}
.fm-mais>summary{cursor:pointer;list-style:none;color:#86efac;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.fm-mais>summary::-webkit-details-marker{display:none}.fm-mais>summary::before{content:'▸ ';display:inline-block;width:14px}.fm-mais[open]>summary::before{content:'▾ '}.fm-mais[open]>summary{margin-bottom:10px}
details.fm-field.fm-mais{margin-top:2px}
.fm-item-cab{display:grid;grid-template-columns:minmax(170px,2fr) minmax(170px,2.5fr) 120px 40px;gap:8px;color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
.fm-nota-linha,.fm-nota-cab{display:grid;grid-template-columns:120px minmax(150px,2fr) 100px 120px minmax(180px,2fr) 40px;gap:8px;align-items:start}.fm-nota-linha .fm-input,.fm-nota-linha .fm-select{height:38px;font-size:13px}.fm-nota-cab{color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}.fm-nota-item{padding:6px 0;border-top:1px solid rgba(148,163,184,.1)}.fm-nota-item small{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.fm-orcs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.fm-orc{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:12px;background:rgba(15,23,42,.6);display:grid;gap:6px}.fm-orc.sel{border-color:#4ade80;box-shadow:0 0 0 1px #4ade80;background:rgba(22,101,52,.2)}.fm-orc strong{color:#f8fafc;font-size:15px}.fm-orc .v{font-size:20px;font-weight:950;color:#fff}.fm-orc-acoes{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.fm-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:10px;padding:12px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:14px}
.fm-tl{list-style:none;margin:0;padding:0;display:grid;gap:8px}.fm-tl li{display:grid;grid-template-columns:150px 1fr;gap:10px;font-size:12px;color:#cbd5e1;border-left:2px solid rgba(34,197,94,.4);padding-left:10px}.fm-tl time{color:#94a3b8}
.fm-acoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;align-items:center;justify-content:flex-end}.fm-acoes .fm-dica{flex:1 1 100%;color:#fde68a;font-size:12px;text-align:right}
.fm-aviso{margin-top:10px;padding:10px 12px;border-radius:12px;border:1px solid rgba(245,158,11,.34);background:rgba(245,158,11,.1);color:#fde68a;font-size:12px;line-height:1.5}
.fm-erros{margin:10px 0 0;padding:10px 12px 10px 28px;border-radius:12px;border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca;font-size:12px}
.fm-pvl-cab,.fm-pvl{display:grid;grid-template-columns:minmax(150px,1.3fr) 110px minmax(180px,1.6fr) minmax(200px,2fr) minmax(190px,auto);gap:12px;align-items:center}
.fm-pvl-cab{padding:0 14px 8px;color:#94a3b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.fm-pvl-lista{display:grid;gap:8px}
.fm-pvl{padding:11px 14px;border:1px solid rgba(148,163,184,.14);border-radius:16px;background:rgba(2,6,23,.34);cursor:pointer;transition:border-color .15s,background .15s}.fm-pvl:hover,.fm-pvl:focus{outline:none;border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.06)}
.fm-pvl strong{display:block;color:#f8fafc;font-size:13px}.fm-pvl .fm-mm{display:block}.fm-pvl-chips{display:flex;gap:5px;flex-wrap:wrap}.fm-pvl-acoes{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}.fm-pvl-km .fm-mm{display:none}
.fm-drawer{justify-content:flex-end;align-items:stretch;padding:0}.fm-drawer .ds-modal-card{box-sizing:border-box;max-width:680px;width:100%;max-height:100vh;height:100vh;border-radius:24px 0 0 24px;display:flex;flex-direction:column;padding:20px}.fm-drawer [data-painel]{display:flex;flex-direction:column;min-height:0;flex:1}
.fm-drawer-corpo{overflow:auto;flex:1;min-height:0;display:grid;gap:8px;align-content:start;padding-right:4px}.fm-drawer-rodape{margin-top:12px;padding-top:12px;border-top:1px solid rgba(148,163,184,.14);justify-content:flex-end}
.fm-prev-grupo{border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(2,6,23,.3)}.fm-prev-grupo>summary{cursor:pointer;list-style:none;display:flex;gap:8px;align-items:center;padding:10px 12px;font-weight:900;font-size:13px;color:#e2e8f0}.fm-prev-grupo>summary::-webkit-details-marker{display:none}.fm-prev-grupo>summary span:first-child{flex:1}.fm-prev-grupo[open]>summary{border-bottom:1px solid rgba(148,163,184,.1)}
.fm-passos{display:flex;gap:6px;list-style:none;margin:14px 0 12px;padding:0;flex-wrap:wrap}.fm-passos li{flex:1;min-width:120px;display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:12px;border:1px solid rgba(148,163,184,.14);color:#94a3b8;font-size:12px;font-weight:800}.fm-passos li b{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:rgba(148,163,184,.18);font-size:11px}.fm-passos li.ativo{border-color:rgba(34,197,94,.5);color:#f8fafc;background:rgba(34,197,94,.1)}.fm-passos li.ativo b,.fm-passos li.feito b{background:#22c55e;color:#052e16}.fm-passos li.feito{color:#86efac}
.fm-prev-busca{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0 8px}.fm-prev-busca .fm-input{flex:1;min-width:200px}.fm-prev-marcados{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;min-height:26px}
.fm-chip-x{display:inline-flex;gap:6px;align-items:center;padding:3px 4px 3px 9px;border-radius:999px;background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.3);color:#bbf7d0;font-size:11px;font-weight:800}.fm-chip-x button{border:0;background:transparent;color:#bbf7d0;cursor:pointer;font-size:12px;padding:0 4px}
.fm-prev-rodape{margin-top:14px}
.fm-svc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.fm-drawer .fm-svc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.fm-svc-grid-rolagem{max-height:42vh;overflow:auto;padding-right:4px}.fm-svc-grid .fm-empty{grid-column:1/-1}
.fm-svc-card{position:relative;text-align:left;display:flex;flex-direction:column;gap:3px;min-height:96px;padding:8px 24px 8px 10px;border:1px solid rgba(148,163,184,.18);border-left:4px solid rgba(148,163,184,.4);border-radius:14px;background:rgba(2,6,23,.4);color:#e2e8f0;cursor:pointer;font:inherit;transition:border-color .15s,background .15s}.fm-svc-card:hover{border-color:rgba(34,197,94,.5)}.fm-svc-card strong{font-size:12px;color:#f8fafc;line-height:1.25;overflow-wrap:anywhere}
.fm-svc-intervalo{font-size:10px;color:#94a3b8;font-weight:700;line-height:1.3}.fm-svc-prazo{font-size:10px;font-weight:800;margin-top:auto;color:#cbd5e1;line-height:1.3}.fm-svc-vence{font-size:10px;color:#94a3b8;font-weight:700}
.fm-svc-card-vencida{border-left-color:#ef4444}.fm-svc-card-vencida .fm-svc-prazo{color:#fca5a5}.fm-svc-card-proxima{border-left-color:#f59e0b}.fm-svc-card-proxima .fm-svc-prazo{color:#fde68a}.fm-svc-card-em_dia{border-left-color:#22c55e}.fm-svc-card-em_dia .fm-svc-prazo{color:#86efac}.fm-svc-card-sem_historico{border-left-color:rgba(59,130,246,.55)}.fm-svc-card-sem_historico .fm-svc-prazo{color:#93c5fd}
.fm-svc-check{position:absolute;top:6px;right:6px;width:16px;height:16px;border-radius:5px;border:1px solid rgba(148,163,184,.4);display:grid;place-items:center;font-size:12px;font-weight:900;color:transparent}.fm-svc-card.sel{border-color:#22c55e;background:rgba(34,197,94,.14);box-shadow:0 0 0 1px #22c55e inset}.fm-svc-card.sel .fm-svc-check{background:#22c55e;border-color:#22c55e;color:#052e16}
.fm-sel-acoes{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:0 0 8px}.fm-sel-acoes .fm-mm{flex:1 1 100%}.fm-link{border:0;background:transparent;color:#86efac;font:inherit;font-size:12px;font-weight:900;cursor:pointer;padding:0;text-decoration:underline}
.fm-faltas{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.fm-faltas-topo{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0}.fm-anexar{display:inline-flex;gap:6px;align-items:center;font-size:11px;color:#94a3b8;font-weight:800}.fm-anexar .fm-input{height:34px;width:auto;max-width:230px;font-size:12px}.fm-badge.gray{color:#94a3b8}
.fm-reg{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 12px;border-bottom:1px solid rgba(148,163,184,.08);font-size:12px;color:#e2e8f0}.fm-reg:last-child{border-bottom:0}.fm-reg strong{display:block}.fm-reg-fim{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.fm-prev-opcoes{display:flex;gap:6px 18px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:#94a3b8;font-weight:800}.fm-prev-opcoes-grupo{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}.fm-opcao{border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.7);color:#cbd5e1;border-radius:999px;padding:4px 10px;font:inherit;font-size:11px;font-weight:900;cursor:pointer}.fm-opcao:hover{border-color:rgba(34,197,94,.5);color:#bbf7d0}.fm-opcao.ativo{background:rgba(34,197,94,.2);border-color:rgba(34,197,94,.6);color:#bbf7d0}
@media(max-width:1100px){.fm-pvl-cab{display:none}.fm-pvl{grid-template-columns:1fr 1fr}.fm-pvl-urg,.fm-pvl-chips,.fm-pvl-acoes{grid-column:1/-1}.fm-pvl-acoes{justify-content:flex-start}.fm-pvl-km .fm-mm{display:inline;margin-right:6px}}
@media(max-width:700px){.fm-drawer .ds-modal-card{border-radius:0;max-width:none}.fm-svc-grid,.fm-drawer .fm-svc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fm-passos li{min-width:0;font-size:11px}}
.fm-mod .fm-input,.fm-mod .fm-select,.fm-mod .fm-field textarea{box-sizing:border-box;max-width:100%}.fm-nota-linha>*{min-width:0}.fm-nota-linha input[type=file]{max-width:100%}.fm-nota-pago{grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11px;color:#94a3b8;font-weight:800}.fm-nota-pago .fm-input{height:34px;width:auto;max-width:240px;font-size:12px}.fm-nota-pago label{display:flex;gap:6px;align-items:center}
.fm-prev-lista{display:grid;gap:6px;max-height:46vh;overflow:auto;padding-right:4px}.fm-prev-linha{border:1px solid rgba(148,163,184,.14);border-radius:12px;padding:8px 10px;background:rgba(2,6,23,.3)}.fm-prev-linha .fm-check{display:flex;gap:8px;align-items:center;font-weight:800;color:#e2e8f0;font-size:13px}.fm-prev-linha small{color:#94a3b8;font-weight:600;margin-left:6px}
.fm-prev-prazos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}.fm-prev-prazos label{display:grid;gap:4px;font-size:11px;color:#94a3b8;font-weight:800}.fm-prev-prazos[hidden]{display:none}
@media(max-width:1350px){.fm-nova{grid-template-columns:minmax(280px,340px) minmax(0,1fr)}.fm-nova-resumo{grid-column:2;position:static}}
@media(max-width:900px){.fm-nota-linha{grid-template-columns:1fr 1fr}.fm-nota-cab{display:none}.fm-grid2,.fm-grid2.tres,.fm-form{grid-template-columns:repeat(2,minmax(0,1fr))}.fm-pick-lista{grid-template-columns:1fr}.fm-nova{grid-template-columns:1fr}.fm-nova-resumo{grid-column:auto}.fm-ol-cab{display:none}.fm-ol{grid-template-columns:1fr 1fr}.fm-item,.fm-item-cab,.fm-form.fm-item-novo{grid-template-columns:1fr 1fr}.fm-item-cab{display:none}.fm-tl li{grid-template-columns:1fr}}
@media(max-width:560px){.fm-nota-linha{grid-template-columns:1fr}.fm-grid2,.fm-grid2.tres,.fm-form{grid-template-columns:1fr}.fm-item,.fm-form.fm-item-novo,.fm-nova{grid-template-columns:1fr}.fm-field[style*="span"]{grid-column:1/-1!important}}

/* Corretiva por etapas (modelo de Compras): abas com contador, um cartão por manutenção e a coluna de ações à direita. */
.fm-etapas{margin-bottom:14px}.fm-kpis.fm-etapas{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.fm-etapas .fm-kcard{min-width:0}.fm-bar .fm-search{flex:1 1 220px;min-width:0}.fm-bar .fm-search .fm-input{box-sizing:border-box}.fm-bar .fm-count{flex:none;white-space:nowrap}
@media(min-width:1180px){.fm-kpis.fm-etapas{grid-template-columns:repeat(7,minmax(0,1fr))}}
.fm-mcs{display:grid;gap:14px}
.fm-mc{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.7),rgba(2,6,23,.7));overflow:hidden}
.fm-mc.aberto{border-color:rgba(34,197,94,.4)}.fm-mc-corpo{min-width:0}
.fm-mc-topo{display:grid;grid-template-columns:16px 112px minmax(150px,1fr) minmax(220px,2.4fr) 160px auto;gap:12px;align-items:center;padding:14px 16px;cursor:pointer;background:rgba(15,23,42,.65);border-bottom:1px solid rgba(148,163,184,.12)}
.fm-mc-topo:hover{background:rgba(22,101,52,.12)}.fm-mc-topo:focus-visible{outline:2px solid #4ade80;outline-offset:-2px}
.fm-mc-seta{color:#86efac;font-size:12px;transition:transform .15s}.fm-mc.aberto .fm-mc-seta{transform:rotate(90deg)}
.fm-mc-topo strong{display:block;color:#f8fafc;font-size:13.5px}.fm-mc-desc{min-width:0;color:#e2e8f0;font-size:13px;font-weight:700;line-height:1.35}
.fm-mc-quando strong{font-size:13px}
.fm-mc-itens{padding:12px 16px 14px;display:grid;gap:8px}
.fm-mc-itens-cab{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:2px}.fm-mc-itens-cab .fm-mm{margin:0}.fm-mc-itens-cab .fm-link{margin-left:auto}
.fm-mc-todas{display:inline-flex;align-items:center;gap:8px;color:#e2e8f0;font-size:12px;font-weight:900;cursor:pointer}
.fm-mc input[type=checkbox]{width:17px;height:17px;accent-color:#22c55e;cursor:pointer;flex:none;margin:0}
.fm-mc-grupo{display:grid;grid-template-columns:190px minmax(0,1fr);gap:10px;align-items:start;padding-top:8px;border-top:1px solid rgba(148,163,184,.09)}
.fm-mc-gtit{display:flex;align-items:center;gap:8px;min-height:30px;color:#bbf7d0;font-size:12px;cursor:default}.fm-mc-gtit strong{font-size:12px;color:#bbf7d0;letter-spacing:.02em}
label.fm-mc-gtit{cursor:pointer}
.fm-mc-linhas{display:flex;flex-wrap:wrap;gap:6px}
.fm-mc-linha{display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:5px 10px;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:rgba(15,23,42,.6);color:#e2e8f0;font-size:12px;font-weight:700;line-height:1.3}
label.fm-mc-linha{cursor:pointer}label.fm-mc-linha:hover{border-color:rgba(34,197,94,.5)}.fm-mc-linha.sel{border-color:rgba(34,197,94,.65);background:rgba(34,197,94,.16);color:#f0fdf4}
.fm-mc-linha.servico{border-style:dashed}.fm-mc-nome{min-width:0;overflow-wrap:anywhere}
.fm-mc-tipo{font-style:normal;padding:1px 7px;border-radius:999px;font-size:9.5px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;border:1px solid rgba(96,165,250,.34);background:rgba(59,130,246,.12);color:#bfdbfe}.fm-mc-tipo.servico{border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.12);color:#fde68a}
.fm-mc-detalhe{padding:4px 16px 16px;border-top:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.28)}.fm-mc-detalhe>.fm-sec:first-of-type{margin-top:10px}
.fm-det-topo{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:12px}
.fm-mc-acoes{display:flex;flex-direction:row;gap:7px;align-items:center;justify-content:flex-end}
.fm-ic-act{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.7);color:#eef7f2;cursor:pointer;flex:none;padding:0;transition:.15s}
.fm-ic-act svg{width:16px;height:16px}.fm-ic-act:hover:not(:disabled){background:rgba(34,197,94,.16);border-color:rgba(34,197,94,.45)}.fm-ic-act:focus-visible{outline:2px solid #4ade80;outline-offset:2px}.fm-ic-act:disabled{opacity:.35;cursor:not-allowed}
.fm-ic-act.tom-iniciar_orcamento,.fm-ic-act.tom-reabrir_orcamento,.fm-ic-act.tom-aprovar,.fm-ic-act.tom-aprovar_sem_orcamento,.fm-ic-act.tom-concluir,.fm-ic-act.tom-emitir_os{background:rgba(16,185,129,.14);border-color:rgba(52,211,153,.28);color:#68f0ac}
.fm-ic-act.tom-orcamento,.fm-ic-act.tom-enviar_aprovacao,.fm-ic-act.tom-enviar_notas,.fm-ic-act.tom-notas{background:rgba(59,130,246,.12);border-color:rgba(96,165,250,.26);color:#93c5fd}
.fm-ic-act.tom-reprovar,.fm-ic-act.tom-cancelar{background:rgba(239,68,68,.09);border-color:rgba(248,113,113,.24);color:#ff7272}
.fm-ic-act.tom-detalhes.on{background:rgba(34,197,94,.2);border-color:#4ade80;color:#dcfce7}
.fm-modal-largo .ds-modal-card{width:min(1320px,calc(100vw - 32px));max-width:none;max-height:calc(100vh - 32px);overflow:auto}
@media(max-width:1100px){.fm-mc-topo{grid-template-columns:16px 100px minmax(0,1fr) 130px}.fm-mc-acoes{grid-column:2/-1;justify-content:flex-start}.fm-mc-desc{grid-column:2/-1;grid-row:2}.fm-mc-grupo{grid-template-columns:1fr}}
@media(max-width:700px){.fm-mc-acoes{flex-wrap:wrap}.fm-mc-topo{grid-template-columns:16px minmax(0,1fr) auto}}
</style>`;
