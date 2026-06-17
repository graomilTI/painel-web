const TAB_INFO = {
  visao: { icon: '📊', title: 'Resumo', hint: 'Veja o saldo geral, alertas e as últimas movimentações.' },
  materiais: { icon: '📦', title: 'Cadastrar', hint: 'Cadastre novos materiais. Se já existir, o estoque soma no item agrupado.' },
  entradas: { icon: '+', title: 'Entrada', hint: 'Registre compras, reposições e devoluções para aumentar o saldo.' },
  saidas: { icon: '-', title: 'Saída', hint: 'Baixe materiais entregues para colaboradores, veículos ou setores.' },
  inventario: { icon: '✓', title: 'Inventário', hint: 'Ajuste o saldo conforme a contagem física do almoxarifado.' },
  alertas: { icon: '!', title: 'Alertas', hint: 'Acompanhe itens zerados ou abaixo do estoque mínimo.' },
  historico: { icon: '↺', title: 'Histórico', hint: 'Consulte entradas, saídas e ajustes registrados.' }
};

const QUICK_ACTIONS = [
  { tab: 'saidas', label: 'Registrar saída', detail: 'Entrega ou uso de material', tone: 'primary' },
  { tab: 'entradas', label: 'Registrar entrada', detail: 'Compra ou reposição' },
  { tab: 'materiais', label: 'Novo material', detail: 'Cadastrar item no estoque' },
  { tab: 'alertas', label: 'Ver alertas', detail: 'Itens baixos ou zerados' }
];

let lastTab = '';

function ensureStyles() {
  if (document.getElementById('stkIntuitiveLayoutStyles')) return;
  const style = document.createElement('style');
  style.id = 'stkIntuitiveLayoutStyles';
  style.textContent = `
    .stk-intro-panel{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;margin:16px 0}
    .stk-flow-card,.stk-help-card{border:1px solid var(--line);border-radius:18px;background:rgba(13,13,24,.72);padding:16px}
    .stk-flow-card h3,.stk-help-card h3{margin:0 0 6px;font-size:18px;letter-spacing:0}
    .stk-flow-card p,.stk-help-card p{margin:0;color:var(--muted)}
    .stk-quick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}
    .stk-quick-action{border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:13px;text-align:left;cursor:pointer;min-height:82px}
    .stk-quick-action strong{display:block;font-size:14px;margin-bottom:3px}
    .stk-quick-action span{display:block;color:var(--muted);font-size:12px;line-height:1.3}
    .stk-quick-action.primary{background:linear-gradient(135deg,rgba(22,101,52,.46),rgba(13,13,24,.92));border-color:rgba(111,208,165,.34)}
    .stk-help-steps{display:grid;gap:8px;margin-top:12px}
    .stk-help-step{display:grid;grid-template-columns:28px 1fr;gap:9px;align-items:start;color:#d8f8e7;font-size:13px}
    .stk-help-step b{width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:rgba(111,208,165,.14);color:#bbf7d0}
    .stk-tabs{width:100%;padding:6px;border:1px solid var(--line);border-radius:16px;background:rgba(13,13,24,.64);overflow:auto;flex-wrap:nowrap!important}
    .stk-tab{min-width:max-content;border-radius:12px!important;padding:10px 13px!important}
    .stk-tab .stk-tab-icon{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-right:6px;border-radius:7px;background:rgba(255,255,255,.08);font-weight:900}
    .stk-tab.active .stk-tab-icon{background:rgba(255,255,255,.18)}
    .stk-context-hint{display:flex;align-items:flex-start;gap:10px;border:1px solid rgba(111,208,165,.18);border-radius:16px;background:rgba(111,208,165,.08);padding:13px 14px;margin:16px 0}
    .stk-context-hint b{display:grid;place-items:center;flex:0 0 auto;width:30px;height:30px;border-radius:10px;background:rgba(111,208,165,.16);color:#bbf7d0}
    .stk-context-hint strong{display:block;margin-bottom:2px}.stk-context-hint span{display:block;color:var(--muted);font-size:13px}
    .stk-table-wrap{background:rgba(3,20,13,.28)}.stk-table tbody tr:hover{background:rgba(111,208,165,.06)}.stk-table td:first-child b{font-size:14px}
    .stk-field label{color:#d8f8e7;font-weight:800}.stk-field input:focus,.stk-field select:focus,.stk-field textarea:focus{outline:none;border-color:rgba(111,208,165,.45);box-shadow:0 0 0 3px rgba(111,208,165,.10)}
    @media(max-width:900px){.stk-intro-panel{grid-template-columns:1fr}.stk-quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:620px){.page-main{padding:14px}.hero-card{padding:18px}.stk-intro-panel{margin:12px 0}.stk-flow-card,.stk-help-card{padding:14px}.stk-quick-grid{grid-template-columns:1fr}.stk-tabs{position:sticky;top:72px;z-index:8}.stk-context-hint{margin:12px 0}.section-head{align-items:flex-start!important}.section-head h3{font-size:18px}}
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

function buildIntro() {
  return `
    <div class="stk-intro-panel" id="stkIntroPanel">
      <section class="stk-flow-card">
        <h3>O que você quer fazer?</h3>
        <p>Escolha uma ação rápida. O estoque abre direto na etapa certa.</p>
        <div class="stk-quick-grid">
          ${QUICK_ACTIONS.map((action) => `
            <button class="stk-quick-action ${action.tone || ''}" type="button" data-quick-tab="${action.tab}">
              <strong>${action.label}</strong>
              <span>${action.detail}</span>
            </button>`).join('')}
        </div>
      </section>
      <section class="stk-help-card">
        <h3>Fluxo recomendado</h3>
        <p>Use sempre nessa ordem para manter o saldo correto.</p>
        <div class="stk-help-steps">
          <div class="stk-help-step"><b>1</b><span>Cadastre o material uma única vez.</span></div>
          <div class="stk-help-step"><b>2</b><span>Registre entradas quando chegar compra ou reposição.</span></div>
          <div class="stk-help-step"><b>3</b><span>Registre saídas quando entregar ou usar material.</span></div>
          <div class="stk-help-step"><b>4</b><span>Use inventário para corrigir diferença de contagem.</span></div>
        </div>
      </section>
    </div>`;
}

function ensureIntro() {
  const card = document.querySelector('.page-main > .card');
  const content = document.getElementById('stkContent');
  if (!card || !content || document.getElementById('stkIntroPanel')) return;
  content.insertAdjacentHTML('beforebegin', buildIntro());
  document.querySelectorAll('[data-quick-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = document.querySelector(`.stk-tab[data-tab="${button.dataset.quickTab}"]`);
      if (tab) tab.click();
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function ensureContextHint() {
  const tab = currentTab();
  if (tab === lastTab && document.getElementById('stkContextHint')) return;
  lastTab = tab;
  const content = document.getElementById('stkContent');
  const info = TAB_INFO[tab] || TAB_INFO.visao;
  if (!content || !info) return;
  document.getElementById('stkContextHint')?.remove();
  content.insertAdjacentHTML('afterbegin', `<div class="stk-context-hint" id="stkContextHint"><b>${info.icon}</b><div><strong>${info.title}</strong><span>${info.hint}</span></div></div>`);
}

function improveHeadings() {
  const title = document.querySelector('.hero-card h2');
  const text = document.querySelector('.hero-card p');
  if (title && !title.dataset.intuitiveText) { title.textContent = 'Estoque ADM'; title.dataset.intuitiveText = '1'; }
  if (text && !text.dataset.intuitiveText) { text.textContent = 'Controle materiais, entradas, saídas e inventário em uma tela simples. Itens iguais aparecem agrupados.'; text.dataset.intuitiveText = '1'; }
}

function applyLayout() {
  observer.disconnect();
  try {
    ensureStyles();
    improveHeadings();
    decorateTabs();
    ensureIntro();
    ensureContextHint();
  } finally {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

const observer = new MutationObserver(() => applyLayout());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', applyLayout);
setTimeout(applyLayout, 300);
