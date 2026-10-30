// Frotas · Sinistros: CSS. Tudo dentro de .sn-shell (página) ou .sn-mod (ficha em janela) para não vazar para outras telas.
// Tema verde do módulo de Frotas: texto #eef7f2, apoio #8ba79a, fundos quase pretos; azul só em campos digitáveis e selos.
import { ESTILOS_LISTA } from './frotas-ui-lista.js?v=20261030-frotas-aprovar2';

export const ESTILOS_SINISTROS = `
${ESTILOS_LISTA}
.sn-shell,.sn-mod{color:#eef7f2}
.sn-shell .fm-input,.sn-mod .fm-input,.sn-mod .fm-select,.sn-shell .fm-select,.sn-mod textarea.fm-input{width:100%;box-sizing:border-box;height:42px;border:1px solid rgba(96,165,250,.28);border-radius:12px;background:#0a1220;color:#e8f0fe;padding:0 12px;outline:none;font:inherit;font-size:13px;color-scheme:dark}
.sn-mod textarea.fm-input{height:auto;min-height:84px;padding:10px 12px;line-height:1.45;resize:vertical}
.sn-shell .fm-search .fm-input{padding-left:38px}
.sn-bar .fm-search{flex:0 1 380px;min-width:200px}.sn-bar .fm-count{margin-left:0}.sn-bar-acoes{display:flex;gap:10px;margin-left:auto}
@media(max-width:680px){.sn-bar .fm-search{flex:1 1 100%}.sn-bar-acoes{width:100%}.sn-bar-acoes .fm-btn{flex:1}}
.sn-shell .fm-input:focus,.sn-mod .fm-input:focus,.sn-mod .fm-select:focus{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.18)}
.sn-shell .fm-btn,.sn-mod .fm-btn{border:0;border-radius:12px;min-height:40px;padding:0 14px;font:inherit;font-size:13px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap}
.sn-shell .fm-btn.primary,.sn-mod .fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}
.sn-shell .fm-btn.soft,.sn-mod .fm-btn.soft{border:1px solid rgba(34,197,94,.28);background:rgba(34,197,94,.12);color:#86efac}
.sn-shell .fm-btn.ghost,.sn-mod .fm-btn.ghost{border:1px solid rgba(139,167,154,.26);background:rgba(255,255,255,.03);color:#cfe3d8}
.sn-mod .fm-btn.danger{border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.12);color:#fca5a5}
.sn-mod .fm-btn.mini,.sn-shell .fm-btn.mini{min-height:32px;padding:0 11px;font-size:12px;border-radius:10px}
.sn-mod .fm-btn:disabled,.sn-shell .fm-btn:disabled{opacity:.55;cursor:wait}
.sn-shell .fm-card{border:1px solid rgba(134,239,172,.14);border-radius:22px;background:linear-gradient(180deg,#0d1814,#08100d);overflow:hidden}.sn-shell .fm-body{padding:18px}
.sn-shell .fm-table-wrap{overflow:auto;border:1px solid rgba(134,239,172,.12);border-radius:16px}
.sn-shell .fm-table{width:100%;border-collapse:collapse;min-width:980px}.sn-shell .fm-table th{padding:11px;color:#8ba79a;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(134,239,172,.14);background:#09110e}
.sn-shell .fm-table td{padding:12px 11px;border-bottom:1px solid rgba(134,239,172,.08);color:#eef7f2;font-size:13px}.sn-shell .fm-table tbody tr{cursor:pointer}.sn-shell .fm-table tbody tr:hover td{background:rgba(34,197,94,.07)}
.sn-shell .fm-empty{text-align:center;padding:30px!important;color:#8ba79a;cursor:default}
.sn-shell .fm-cell small,.sn-mod small{color:#8ba79a}.sn-shell .fm-cell strong{display:block;color:#fff}
.fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 9px;font-size:10.5px;font-weight:900;letter-spacing:.02em;border:1px solid rgba(139,167,154,.26);color:#cfe3d8;background:rgba(255,255,255,.04);white-space:nowrap}
.fm-badge.ok{border-color:rgba(34,197,94,.38);background:rgba(22,101,52,.28);color:#bbf7d0}.fm-badge.warn{border-color:rgba(245,158,11,.38);background:rgba(245,158,11,.13);color:#fde68a}.fm-badge.err{border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.13);color:#fecaca}.fm-badge.info{border-color:rgba(96,165,250,.38);background:rgba(59,130,246,.13);color:#bfdbfe}.fm-badge.purple{border-color:rgba(167,139,250,.4);background:rgba(139,92,246,.14);color:#ddd6fe}
.sn-prog{display:flex;align-items:center;gap:8px;min-width:120px}.sn-prog-bar{flex:1;height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}.sn-prog-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#16a34a,#4ade80)}.sn-prog.baixo .sn-prog-bar i{background:linear-gradient(90deg,#d97706,#fbbf24)}.sn-prog span{font-size:11px;font-weight:900;color:#cfe3d8;white-space:nowrap}
.sn-prazo-vencido{color:#fca5a5;font-weight:800}.sn-prazo-hoje{color:#fde68a;font-weight:800}.sn-prazo-proximo{color:#bbf7d0}
.sn-ajuda{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:14px;color:#8ba79a;font-size:12px;line-height:1.55}

/* Janela da ficha */
.sn-overlay .ds-modal-card{max-width:1040px;padding:0;background:#09110e;border-color:rgba(134,239,172,.18);overflow:hidden;display:flex;flex-direction:column;max-height:92vh}
.sn-overlay.sn-estreito .ds-modal-card{max-width:640px}
.sn-mod{display:flex;flex-direction:column;min-height:0;flex:1}.sn-mod>.sn-top,.sn-mod>.sn-faixa,.sn-mod>.sn-abas{flex:none}
.sn-top{padding:18px 22px 14px;border-bottom:1px solid rgba(134,239,172,.12);background:linear-gradient(180deg,#0d1814,#09110e)}
.sn-top-linha{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sn-top h3{margin:0;color:#fff;font-size:21px;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sn-top h3 small{font-size:12px;font-weight:800;letter-spacing:.08em;color:#86efac}
.sn-top p{margin:5px 0 0;color:#8ba79a;font-size:13px;line-height:1.45}
.sn-fechar{appearance:none;border:1px solid rgba(139,167,154,.26);background:rgba(255,255,255,.03);color:#cfe3d8;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:15px}
.sn-passos{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:16px 0 4px}
.sn-passo{position:relative;padding-top:12px;text-align:center;min-width:0}
.sn-passo::before{content:"";position:absolute;top:4px;left:0;right:0;height:4px;border-radius:99px;background:rgba(255,255,255,.09)}
.sn-passo.feito::before{background:#22c55e}.sn-passo.atual::before{background:linear-gradient(90deg,#22c55e,#fbbf24)}
.sn-passo strong{display:block;font-size:11.5px;color:#8ba79a;line-height:1.2}.sn-passo.feito strong{color:#bbf7d0}.sn-passo.atual strong{color:#fff}
.sn-passo small{display:block;margin-top:2px;font-size:10.5px;color:#6f8c7e}
.sn-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}.sn-acoes .grow{flex:1}
.sn-faixa{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,2fr) 150px 140px auto;gap:10px;align-items:end;padding:12px 22px;border-bottom:1px solid rgba(134,239,172,.12);background:rgba(34,197,94,.05)}
.sn-faixa label,.sn-grid label,.sn-t-grid label{display:block;margin:0 0 5px;color:#86efac;font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.sn-abas{display:flex;gap:4px;padding:10px 22px 0;border-bottom:1px solid rgba(134,239,172,.12);overflow-x:auto}
.sn-aba{appearance:none;border:0;border-bottom:3px solid transparent;background:none;color:#8ba79a;font:inherit;font-size:13px;font-weight:900;padding:10px 14px;cursor:pointer;white-space:nowrap}
.sn-aba:hover{color:#eef7f2}.sn-aba.ativa{color:#fff;border-bottom-color:#22c55e}.sn-aba .fm-badge{margin-left:6px;padding:2px 7px}
.sn-corpo{padding:18px 22px 24px;overflow:auto;min-height:0;flex:1}
.sn-sec{margin:0 0 20px}.sn-sec>h4{margin:0 0 10px;color:#fff;font-size:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sn-sec>h4 small{font-weight:700;color:#8ba79a}
.sn-resumo{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:12px 14px;border:1px solid rgba(134,239,172,.14);border-radius:14px;background:rgba(255,255,255,.025);margin-bottom:16px}
.sn-resumo .sn-prog{flex:1;min-width:200px}.sn-faltam{display:flex;gap:6px;flex-wrap:wrap}
.sn-item{display:flex;gap:12px;padding:11px 12px;border:1px solid rgba(134,239,172,.12);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:8px}
.sn-item.ok{border-color:rgba(34,197,94,.36);background:rgba(22,101,52,.14)}.sn-item.dispensado{opacity:.62}
.sn-item-ic{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:900;border:2px solid rgba(139,167,154,.4);color:#8ba79a;margin-top:1px}
.sn-item.ok .sn-item-ic{background:#22c55e;border-color:#22c55e;color:#052e16}.sn-item.dispensado .sn-item-ic{border-style:dashed}.sn-item.falta .sn-item-ic{border-color:#fbbf24;color:#fbbf24}
.sn-item-tx{flex:1;min-width:0}.sn-item-tx strong{color:#fff;font-size:13.5px}.sn-item-tx>small{display:block;margin-top:3px;line-height:1.4}
.sn-item-tit{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sn-arqs{display:grid;gap:5px;margin-top:8px}.sn-arq{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:10px;background:rgba(0,0,0,.25);font-size:12px}.sn-arq a,.sn-arq button.lnk{appearance:none;background:none;border:0;padding:0;color:#86efac;cursor:pointer;text-decoration:underline;font:inherit;text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sn-arq small{margin-left:auto;white-space:nowrap}
.sn-arq .x{appearance:none;border:0;background:rgba(255,255,255,.08);color:#cfe3d8;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:11px;flex:none}.sn-arq .x:hover{background:rgba(239,68,68,.35)}
.sn-item-bt{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;justify-content:flex-end;flex:none;max-width:230px}
.sn-drive{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 14px;border:1px solid rgba(96,165,250,.28);border-radius:14px;background:rgba(59,130,246,.07);margin-bottom:12px;font-size:13px}
.sn-drive-tx{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#cfe3d8}.sn-drive a{color:#93c5fd}
.sn-arq .drv{font-size:10.5px;font-weight:900;padding:2px 8px;border-radius:99px;white-space:nowrap;text-decoration:none;flex:none}.sn-arq .drv.ok{background:rgba(22,101,52,.3);color:#bbf7d0;border:1px solid rgba(34,197,94,.38)}.sn-arq .drv.pend{background:rgba(245,158,11,.13);color:#fde68a;border:1px solid rgba(245,158,11,.38)}
.sn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.sn-grid .c2{grid-column:span 2}.sn-grid .c3{grid-column:1/-1}
.sn-t-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.sn-t-grid .c3{grid-column:1/-1}
.sn-checks{display:flex;gap:18px;flex-wrap:wrap}.sn-checks label{display:flex;align-items:center;gap:8px;margin:0;text-transform:none;letter-spacing:0;font-size:13px;font-weight:800;color:#eef7f2;cursor:pointer}.sn-checks input{width:18px;height:18px;accent-color:#22c55e}
.sn-barra-salvar{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.sn-terc{border:1px solid rgba(134,239,172,.16);border-radius:18px;padding:14px;margin-bottom:14px;background:rgba(255,255,255,.02)}
.sn-terc-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}.sn-terc-head h4{margin:0;color:#fff;font-size:15px}
.sn-nota{display:grid;gap:8px;margin-bottom:16px}
.sn-tl{position:relative;margin:0;padding:0 0 0 18px;list-style:none;border-left:2px solid rgba(134,239,172,.18)}
.sn-tl li{position:relative;padding:0 0 14px 12px}.sn-tl li::before{content:"";position:absolute;left:-25px;top:4px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #09110e}.sn-tl li.nota::before{background:#60a5fa}
.sn-tl strong{color:#fff;font-size:13px}.sn-tl .quando{display:block;color:#6f8c7e;font-size:11px;margin-top:1px}.sn-tl p{margin:4px 0 0;color:#cfe3d8;font-size:13px;line-height:1.5;white-space:pre-wrap}
.sn-vazio{padding:22px;text-align:center;color:#8ba79a;border:1px dashed rgba(134,239,172,.2);border-radius:14px;font-size:13px;line-height:1.55}
.sn-novo{padding:20px 22px 22px}.sn-novo h3{margin:0 0 4px;color:#fff;font-size:20px}.sn-novo>p{margin:0 0 16px;color:#8ba79a;font-size:13px}
.sn-erro{margin-top:10px;color:#fecaca;font-size:12px;min-height:16px}
.sn-toast-leitura{margin:0 0 12px}
.sn-top-linha{flex-wrap:nowrap}.sn-top-linha>div:first-child{min-width:0}
@media(max-width:860px),(max-height:760px){.sn-overlay .ds-modal-card{overflow-y:auto;display:block}.sn-mod{display:block}.sn-corpo{overflow:visible}}
@media(max-width:860px){.sn-faixa{grid-template-columns:1fr 1fr}.sn-grid,.sn-t-grid{grid-template-columns:1fr 1fr}.sn-item{flex-wrap:wrap}.sn-item-bt{max-width:none;justify-content:flex-start;width:100%}}
@media(max-width:560px){.sn-passos{grid-template-columns:repeat(5,minmax(64px,1fr));overflow-x:auto}.sn-faixa,.sn-grid,.sn-t-grid{grid-template-columns:1fr}.sn-grid .c2{grid-column:auto}.sn-top,.sn-corpo,.sn-faixa,.sn-abas{padding-left:14px;padding-right:14px}}
`;
