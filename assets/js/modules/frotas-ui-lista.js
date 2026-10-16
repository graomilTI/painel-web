// Layout das listas do Frotas (Motoristas, Manutenção, Troca de Óleo, Checklists, Multas...): cabeçalho com ações,
// cards de resumo CLICÁVEIS que filtram a tabela, busca com chip do filtro ativo e tabela com cabeçalho fixo.
// Quem usa injeta ESTILOS_LISTA no <style> do módulo, monta os cards com cardFiltro() e chama ligarCards() uma vez.

export const ICON = {
  total: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 15h3"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/></svg>',
  alerta: '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  erro: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
  relogio: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  dinheiro: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
  carro: '<svg viewBox="0 0 24 24"><path d="M5 17h14M4 17v-4l2-5h12l2 5v4"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/></svg>',
  sinal: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>',
  ferramenta: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z"/></svg>',
  calendario: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  busca: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  editar: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  excluir: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  anexo: '<svg viewBox="0 0 24 24"><path d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>',
  ver: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
};

export const ESTILOS_LISTA = `
      .fm-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}.fm-head-actions{display:flex;gap:10px;flex-wrap:wrap}
      .fm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(146px,1fr));gap:12px;margin:0 0 16px}
      .fm-kcard{--kc:#94a3b8;--kc-bg:rgba(148,163,184,.12);appearance:none;font:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px;border-radius:18px;border:1px solid rgba(148,163,184,.16);background:linear-gradient(180deg,rgba(15,23,42,.9),rgba(2,6,23,.9));color:#e2e2f0;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;min-width:0}
      .fm-kcard:hover{transform:translateY(-2px);border-color:var(--kc)}.fm-kcard:focus-visible{outline:2px solid var(--kc);outline-offset:2px}
      .fm-kcard[aria-pressed="true"],.fm-kcard.active{border-color:var(--kc);box-shadow:0 0 0 1px var(--kc),0 10px 28px rgba(0,0,0,.28);background:linear-gradient(180deg,var(--kc-bg),rgba(2,6,23,.92))}
      .fm-kcard.tone-green{--kc:#4ade80;--kc-bg:rgba(34,197,94,.14)}.fm-kcard.tone-amber{--kc:#fbbf24;--kc-bg:rgba(245,158,11,.14)}.fm-kcard.tone-red{--kc:#f87171;--kc-bg:rgba(239,68,68,.14)}.fm-kcard.tone-purple{--kc:#a78bfa;--kc-bg:rgba(139,92,246,.14)}.fm-kcard.tone-blue{--kc:#60a5fa;--kc-bg:rgba(59,130,246,.14)}
      .fm-kcard-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--kc-bg);color:var(--kc)}.fm-kcard-ic svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .fm-kcard-tx{min-width:0}.fm-kcard-tx strong{display:block;font-size:26px;line-height:1;color:#fff;letter-spacing:-.02em}.fm-kcard-tx span{display:block;margin-top:5px;color:#94a3b8;font-size:11px;font-weight:850;letter-spacing:.04em;text-transform:uppercase;line-height:1.2}
      .fm-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.fm-search{position:relative;flex:1 1 280px;min-width:220px}.fm-search svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:#64748b;fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none}.fm-search .fm-input{padding-left:38px}
      .fm-count{color:#94a3b8;font-size:12px;font-weight:800;margin-left:auto}
      .fm-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(34,197,94,.34);background:rgba(22,101,52,.22);color:#bbf7d0;border-radius:999px;padding:6px 8px 6px 12px;font-size:12px;font-weight:900}.fm-chip button{appearance:none;border:0;background:rgba(255,255,255,.1);color:inherit;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;padding:0}.fm-chip button:hover{background:rgba(255,255,255,.22)}
      .fm-table-wrap{max-height:66vh}.fm-table th{position:sticky;top:0;z-index:2;background:#0b1224}.fm-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.015)}.fm-table td{vertical-align:middle}
      .fm-person{display:flex;align-items:center;gap:10px;min-width:0}.fm-avatar{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#166534,#22c55e);color:#052e16;font-weight:950;font-size:12px}.fm-person.inativo .fm-avatar{background:linear-gradient(135deg,#334155,#64748b);color:#e2e8f0}.fm-person strong{display:block;color:#f8fafc}.fm-person small,.fm-cell small{color:#94a3b8}
      .fm-cell{line-height:1.35}.fm-venc{color:#fca5a5}.fm-prox{color:#fde68a}.fm-situacao{display:flex;gap:6px;flex-wrap:wrap}
      .fm-badge.off{opacity:.8}
      @media(max-width:680px){.fm-kpis{grid-template-columns:repeat(2,1fr)}.fm-count{margin-left:0;width:100%}.fm-head-actions{width:100%}.fm-head-actions .fm-btn{flex:1}}
      .fm-actions{flex-wrap:nowrap}.fm-ic{width:34px;height:34px;min-height:34px;padding:0;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;transition:.15s ease}.fm-ic svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.fm-ic:hover{color:#fff;border-color:rgba(148,163,184,.4)}.fm-ic.termo{border-color:rgba(34,197,94,.30);background:rgba(34,197,94,.12);color:#86efac}.fm-ic.anexo{border-color:rgba(96,165,250,.32);background:rgba(59,130,246,.12);color:#93c5fd}.fm-ic.anexo.feito{border-color:rgba(34,197,94,.30);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-ic.danger{border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.2);color:#fca5a5}.fm-ic:disabled{opacity:.5;cursor:wait}.fm-ic.busy svg{animation:fm-pulse .8s ease-in-out infinite}@keyframes fm-pulse{50%{opacity:.25}}a.fm-badge{text-decoration:none}
/* Barra de ações das abas de Manutenção (Atualizar, + Nova...). Não usar .fm-head: o hub (frotas-hub.css) esconde esse bloco. */
.fm-topo{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:14px}.fm-topo .fm-head-actions{display:flex;gap:10px;flex-wrap:wrap}
.fm-kcard.info{cursor:default}.fm-kcard.info:hover{transform:none;border-color:rgba(148,163,184,.16)}
`;

// Tabela com cabeçalho fixo na rolagem e linhas alternadas, para telas que já têm <prefixo>-table-wrap / <prefixo>-table.
export const tabelaCss = (p) => `.${p}-table-wrap{max-height:66vh}.${p}-table th{position:sticky;top:0;z-index:2;background:#0b1224}.${p}-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.015)}`;

const escAttr = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

// Card de resumo. kpi = atributo data-* que o módulo já usa para gravar o número (ex.: 'data-kpi-total').
// filtro = chave do filtro que o clique aplica; sem filtro o card é só informativo.
// atributo = nome do atributo que guarda a chave do filtro (data-filtro, ou data-kpi-filter nas telas que já usavam esse).
export function cardFiltro({ filtro = '', label, tone = 'blue', icone = 'total', kpi = '', valor = '0', dica = '', atributo = 'data-filtro', ativo = false }) {
  const miolo = `<span class="fm-kcard-ic">${ICON[icone] || ''}</span><span class="fm-kcard-tx"><strong ${kpi}>${valor}</strong><span>${escAttr(label)}</span></span>`;
  if (!filtro) return `<div class="fm-kcard info tone-${tone}" title="${escAttr(dica)}">${miolo}</div>`;
  return `<button type="button" class="fm-kcard tone-${tone}${ativo ? ' active' : ''}" ${atributo}="${escAttr(filtro)}" data-rotulo="${escAttr(label)}" aria-pressed="${ativo}" title="${escAttr(dica || 'Filtrar: ' + label)}">${miolo}</button>`;
}

// Chip "Filtro: X ✕" e estado pressionado dos cards.
export function sincronizarCards(container, filtro) {
  container.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)));
  const chip = container.querySelector('[data-chip]');
  if (!chip) return;
  const card = filtro && filtro !== 'todos' ? container.querySelector(`[data-filtro="${filtro}"]`) : null;
  chip.innerHTML = card ? `<span class="fm-chip">Filtro: ${escAttr(card.dataset.rotulo || filtro)} <button type="button" data-limpar-filtro aria-label="Limpar filtro" title="Limpar filtro">✕</button></span>` : '';
}

// O corpo da aba é reaproveitado ao trocar de aba: um ouvinte só por container (se ficasse acumulando,
// cada clique alternaria o filtro várias vezes e ele nunca ligaria).
export function aoClicarCard(container, fn) {
  if (container.__fmCardClick) container.removeEventListener('click', container.__fmCardClick);
  container.__fmCardClick = (e) => {
    const card = e.target.closest('[data-filtro]');
    const limpar = e.target.closest('[data-limpar-filtro]');
    if (card || limpar) fn(card, limpar);
  };
  container.addEventListener('click', container.__fmCardClick);
}

// Clique num card aplica o filtro; clicar de novo (ou no ✕ do chip) limpa. obter/definir guardam o filtro no estado do módulo.
export function ligarCards(container, { obter, definir, aoMudar }) {
  aoClicarCard(container, (card, limpar) => {
    const atual = obter();
    definir(limpar ? 'todos' : (atual === card.dataset.filtro ? 'todos' : card.dataset.filtro));
    sincronizarCards(container, obter());
    aoMudar();
  });
}

export function iconBtn(attr, id, classe, titulo, icone) {
  return `<button type="button" class="fm-ic ${classe}" ${attr}="${escAttr(id)}" title="${escAttr(titulo)}" aria-label="${escAttr(titulo)}">${ICON[icone] || icone}</button>`;
}
