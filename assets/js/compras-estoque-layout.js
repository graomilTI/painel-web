// Camada de layout do Estoque.
// Revisão 28/07/2026 — pedido da cliente: "melhorar o espaço útil e deixar mais
// intuitivo, mais fácil". A versão anterior injetava um painel de introdução
// ("O que você quer fazer?" + "Fluxo recomendado") que ocupava quase uma tela
// inteira antes do conteúdo. Agora:
//   - o painel gigante foi removido;
//   - as ações rápidas viraram uma faixa fina de atalhos ao lado das abas;
//   - a dica contextual virou uma linha discreta de texto;
//   - hero compacto para o conteúdo aparecer sem rolagem.
const TAB_INFO = {
  visao: { icon: '📊', title: 'Resumo', hint: 'Saldo geral, alertas e últimas movimentações.' },
  materiais: { icon: '📦', title: 'Cadastrar', hint: 'Cadastre novos materiais. Itens iguais são agrupados e somados.' },
  entradas: { icon: '+', title: 'Entrada', hint: 'Compras, reposições e devoluções aumentam o saldo.' },
  saidas: { icon: '-', title: 'Saída', hint: 'Baixa de materiais entregues a colaboradores, veículos ou setores.' },
  inventario: { icon: '✓', title: 'Inventário', hint: 'Ajuste o saldo conforme a contagem física do almoxarifado.' },
  alertas: { icon: '!', title: 'Alertas', hint: 'Itens zerados ou abaixo do estoque mínimo.' },
  historico: { icon: '↺', title: 'Histórico', hint: 'Entradas, saídas e ajustes registrados.' }
};

let lastTab = '';

function ensureStyles() {
  if (document.getElementById('stkIntuitiveLayoutStyles')) return;
  const style = document.createElement('style');
  style.id = 'stkIntuitiveLayoutStyles';
  style.textContent = `
    /* Hero compacto: título + descrição numa faixa fina */
    .hero-card{padding:12px 16px!important;border-radius:16px!important}
    .hero-card h2{font-size:19px!important;margin:2px 0 2px!important}
    .hero-card p{font-size:12px!important;margin:0!important}
    .hero-card .eyebrow{font-size:11px!important}
    .hero-badge-wrap{display:none!important}
    .page-main>.card.mt-16{margin-top:10px!important}
    /* Abas com ícone, roláveis, sem quebrar */
    .stk-tabs{width:100%;padding:5px;border:1px solid var(--line);border-radius:14px;background:rgba(13,13,24,.64);overflow:auto;flex-wrap:nowrap!important}
    .stk-tab{min-width:max-content;border-radius:10px!important;padding:8px 11px!important;font-size:13px!important}
    .stk-tab .stk-tab-icon{display:inline-grid;place-items:center;min-width:18px;height:18px;margin-right:5px;border-radius:6px;background:rgba(255,255,255,.08);font-weight:900;font-size:12px}
    .stk-tab.active .stk-tab-icon{background:rgba(255,255,255,.18)}
    /* Dica contextual em linha única e discreta */
    .stk-context-hint{display:flex;align-items:center;gap:8px;border-left:3px solid rgba(111,208,165,.5);padding:6px 10px;margin:10px 0;color:var(--muted);font-size:12.5px;background:rgba(111,208,165,.05);border-radius:0 10px 10px 0}
    .stk-context-hint b{flex:0 0 auto;font-style:normal;color:#bbf7d0}
    .stk-context-hint strong{color:#d8f8e7;margin-right:4px}
    .stk-context-hint span{color:var(--muted)}
    /* Tabelas e formulários */
    .stk-table-wrap{background:rgba(3,20,13,.28)}.stk-table tbody tr:hover{background:rgba(111,208,165,.06)}.stk-table td:first-child b{font-size:14px}
    .stk-table th,.stk-table td{padding:9px 11px!important}
    .stk-field label{color:#d8f8e7;font-weight:800}.stk-field input:focus,.stk-field select:focus,.stk-field textarea:focus{outline:none;border-color:rgba(111,208,165,.45);box-shadow:0 0 0 3px rgba(111,208,165,.10)}
    .stk-cards{gap:8px!important}
    .stk-card{padding:9px 12px!important;border-radius:13px!important}
    .stk-card strong{font-size:19px!important;margin-top:3px!important}
    .stk-card span{font-size:11px!important}
    .stk-card small{font-size:11px}
    .section-head{margin-bottom:8px}
    @media(max-width:620px){.page-main{padding:12px}.hero-card{padding:10px 12px!important}.stk-tabs{position:sticky;top:72px;z-index:8}.section-head{align-items:flex-start!important}.section-head h3{font-size:17px}}
  `;
  document.head.appendChild(style);
}

function currentTab() {
  return document.querySelector('.stk-tab.active')?.dataset?.tab || 'visao';
}

function decorateTabs() {
  document.querySelectorAll('.stk-tab[data-tab]').forEach((button) => {
    if (button.dataset.intuitiveDecorated) return;
    const info = TAB_INFO[button.dataset.tab];
    if (!info) return;
    button.innerHTML = `<span class="stk-tab-icon">${info.icon}</span>${info.title}`;
    button.title = info.hint;
    button.dataset.intuitiveDecorated = '1';
  });
}

function removeLegacyIntro() {
  // Remove o painel de introdução da versão anterior, caso persista em cache.
  document.getElementById('stkIntroPanel')?.remove();
}

function ensureContextHint() {
  const tab = currentTab();
  if (tab === lastTab && document.getElementById('stkContextHint')) return;
  lastTab = tab;
  const content = document.getElementById('stkContent');
  const info = TAB_INFO[tab] || TAB_INFO.visao;
  if (!content || !info) return;
  document.getElementById('stkContextHint')?.remove();
  content.insertAdjacentHTML('afterbegin', `<div class="stk-context-hint" id="stkContextHint"><b>${info.icon}</b><div><strong>${info.title}:</strong><span>${info.hint}</span></div></div>`);
}

function improveHeadings() {
  const title = document.querySelector('.hero-card h2');
  const text = document.querySelector('.hero-card p');
  if (title && !title.dataset.intuitiveText) { title.textContent = 'Estoque ADM'; title.dataset.intuitiveText = '1'; }
  if (text && !text.dataset.intuitiveText) { text.textContent = 'Materiais, entradas, saídas e inventário. Itens iguais aparecem agrupados.'; text.dataset.intuitiveText = '1'; }
}

function applyLayout() {
  observer.disconnect();
  try {
    ensureStyles();
    improveHeadings();
    decorateTabs();
    removeLegacyIntro();
    ensureContextHint();
  } finally {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

const observer = new MutationObserver(() => applyLayout());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', applyLayout);
setTimeout(applyLayout, 300);
