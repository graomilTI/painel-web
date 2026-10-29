// Base visual do Frotas (.fm-*) compartilhada pelas abas de Patrimônios (Relatórios, Status e Desligados):
// a mesma das telas de Motoristas/Manutenção + ESTILOS_LISTA (cards, busca, chip, tabela fixa, ícones).

import { ESTILOS_LISTA } from './modules/frotas-ui-lista.js?v=20261029-frotas-manut73';

export const ESTILOS_BASE = `
  .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#94a3b8;line-height:1.55;margin:0}
  .fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fm-body{padding:18px}
  .fm-input,.fm-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark;font:inherit}.fm-select option{background:#0d0d18;color:#e2e2f0}
  .fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-weight:950;width:auto;margin:0}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fm-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fm-btn:disabled{opacity:.5;cursor:not-allowed}.fm-btn[hidden]{display:none}
  .fm-actions{display:flex;gap:6px}
  .fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:980px}.fm-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fm-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:top}.fm-table tr:hover td{background:rgba(22,101,52,.08)}
  .fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fm-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fm-badge.info{border-color:rgba(99,102,241,.4);background:rgba(99,102,241,.16);color:#c7d2fe}
  .fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}
  .fm-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fm-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none;font:inherit;color-scheme:dark}
  .fm-bar .fm-select,.fm-bar .ssel-wrap{flex:0 1 200px;min-width:150px;width:auto}.fm-bar .ssel-input,html.painel-ui-v2 .fm-bar .ssel-input{height:42px;min-height:42px;padding:0 12px;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;font:inherit;font-size:13px;box-sizing:border-box}
  .fm-mat{display:flex;align-items:center;gap:8px;appearance:none;border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.1);color:#bbf7d0;font:inherit;font-weight:900;font-size:12px;padding:5px 10px;border-radius:999px;cursor:pointer;min-width:150px}.fm-mat:hover{background:rgba(34,197,94,.2)}.fm-mat .seta{display:inline-block;width:10px;transition:transform .15s ease}.fm-mat[aria-expanded="true"] .seta{transform:rotate(90deg)}.fm-mat .soma{margin-left:auto;color:#fde68a}
  .fm-itens{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:3px;font-size:12px;color:#cbd5e1}.fm-itens li{display:flex;gap:8px;justify-content:space-between}.fm-itens b{color:#f8fafc}.fm-itens .v{color:#fde68a;white-space:nowrap}.fm-itens .sv{color:#64748b;white-space:nowrap}.fm-itens-total{margin-top:6px;font-size:12px;font-weight:900;color:#fde68a}.fm-itens-total small{color:#94a3b8;font-weight:600}
  .fm-prazo-dia{display:block;margin-top:4px;color:#94a3b8;font-size:11.5px}
  .fm-modal-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(2,6,23,.8);display:flex;align-items:center;justify-content:center;padding:22px}.fm-modal{width:min(640px,96vw);max-height:90vh;overflow:auto;border:1px solid rgba(148,163,184,.20);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.55);color:#e2e2f0}.fm-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px;border-bottom:1px solid rgba(148,163,184,.16)}.fm-modal-head h3{margin:0;color:#fff;font-size:20px}.fm-modal-head p{margin:6px 0 0;color:#94a3b8;font-size:13px;line-height:1.45}.fm-modal-body{padding:20px;display:grid;gap:14px}.fm-modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid rgba(148,163,184,.12)}
  .fm-field{position:relative}.fm-sugestoes{position:absolute;left:0;right:0;top:100%;z-index:5;margin-top:4px;border:1px solid rgba(148,163,184,.25);border-radius:14px;background:#0d0d18;max-height:260px;overflow:auto;box-shadow:0 14px 40px rgba(0,0,0,.5)}.fm-sugestoes[hidden]{display:none}.fm-sug{display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;appearance:none;border:0;border-bottom:1px solid rgba(148,163,184,.1);background:transparent;color:#e2e8f0;font:inherit;font-size:13px;padding:10px 12px;cursor:pointer}.fm-sug:hover{background:rgba(34,197,94,.12)}.fm-sug small{color:#94a3b8}
  .fm-previa{border:1px dashed rgba(34,197,94,.35);border-radius:14px;padding:10px 12px;font-size:12.5px;line-height:1.6;color:#cbd5e1}.fm-previa.erro{border-color:rgba(239,68,68,.5);color:#fecaca}.fm-erro{color:#fecaca;font-size:12.5px;min-height:16px}.fm-hint{font-size:12px;color:#94a3b8;margin-top:6px}
  .fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;max-width:360px;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:800;font-size:13px;box-shadow:0 16px 45px rgba(0,0,0,.35)}.fm-toast.erro{border-color:rgba(252,165,165,.4);background:rgba(127,29,29,.96);color:#fee2e2}
  .fm-venc{color:#fca5a5}
  .fm-sort{appearance:none;border:0;background:transparent;color:inherit;font:inherit;font-weight:950;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px}.fm-sort:hover{color:#fff}.fm-sort-mark{font-size:10px;color:#86efac}.fm-sort-mark.idle{color:#64748b;opacity:.7}
  .fm-btn.ghost[aria-pressed="true"]{border-color:rgba(34,197,94,.55);background:rgba(34,197,94,.16);color:#bbf7d0}
  .fm-table tr.fm-grupo td{background:rgba(34,197,94,.09);border-bottom:1px solid rgba(34,197,94,.22);padding:10px 12px}.fm-grupo-in{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.fm-grupo-in strong{color:#bbf7d0;font-size:14px;letter-spacing:.02em}.fm-grupo-in span{color:#94a3b8;font-size:12px;font-weight:800}.fm-grupo-in .fm-actions{margin-left:auto}
`;

export function injectEstilosFrotas() {
  if (document.getElementById('patLayoutFrotasStyles')) return;
  const style = document.createElement('style');
  style.id = 'patLayoutFrotasStyles';
  style.textContent = `${ESTILOS_BASE}${ESTILOS_LISTA}`;
  document.head.appendChild(style);
}

// ---- Ordenação por cabeçalho (mesmo padrão do Frotas: clique ordena, clique de novo inverte) ----

/** <th> clicável. estado = { chave, dir }; o clique é tratado por quem usa (atributo data-sort). */
export function cabecalhoOrdenavel(chave, rotulo, estado, { colspan = 0, attr = 'data-sort' } = {}) {
  const ativo = estado?.chave === chave;
  const marca = ativo ? `<span class="fm-sort-mark">${estado.dir === 'asc' ? '▲' : '▼'}</span>` : '<span class="fm-sort-mark idle">↕</span>';
  return `<th${colspan ? ` colspan="${colspan}"` : ''}${ativo ? ` aria-sort="${estado.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button class="fm-sort" type="button" ${attr}="${chave}" title="Ordenar por ${rotulo}">${rotulo} ${marca}</button></th>`;
}

/** Clique na mesma coluna inverte; coluna nova começa crescente. */
export function proximaOrdenacao(estado, chave) {
  return { chave, dir: estado?.chave === chave && estado.dir === 'asc' ? 'desc' : 'asc' };
}

/** Compara números como números e o resto como texto pt-BR (com números naturais). */
export function compararValores(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Ordena uma cópia de lista por estado.chave usando getters[chave]; sem chave conhecida devolve a lista como está. */
export function ordenarPor(lista, estado, getters) {
  const get = getters[estado?.chave];
  if (!get) return lista;
  const fator = estado.dir === 'desc' ? -1 : 1;
  return [...lista].sort((x, y) => compararValores(get(x), get(y)) * fator);
}

export { ICON, cardFiltro, sincronizarCards, aoClicarCard, iconBtn } from './modules/frotas-ui-lista.js?v=20261029-frotas-manut73';
