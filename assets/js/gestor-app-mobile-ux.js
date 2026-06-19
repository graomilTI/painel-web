import { toPanelUrl } from './paths.js';

const MODULE_GROUPS = [
  {
    title: 'Operação do dia',
    items: [
      { id: 'dashboard', label: 'Início', desc: 'Indicadores e atalhos principais', icon: '⌂', tab: 'dashboard', primary: true },
      { id: 'os', label: 'OS', desc: 'Indicar, aguardar e finalizar O.S.', icon: 'OS', tab: 'os', primary: true },
      { id: 'programacao', label: 'Programação', desc: 'Disponibilidade, estadia e extras', icon: '📅', tab: 'programacao' },
      { id: 'logistica', label: 'Logística', desc: 'FOB, report, abrir e finalizar OS', icon: '🚚', path: 'logistica' },
    ],
  },
  {
    title: 'Solicitações',
    items: [
      { id: 'hospedagem', label: 'Hospedagem', desc: 'Pedir reservas e acompanhar solicitações', icon: '🏨', path: 'hospedagem' },
      { id: 'compras', label: 'Compras', desc: 'Materiais, uniformes e solicitações', icon: '🛒', path: 'compras' },
      { id: 'contato-cliente', label: 'Contato Cliente', desc: 'Registrar visitas e contatos', icon: '🤝', path: 'contato-cliente' },
    ],
  },
  {
    title: 'Controle e consulta',
    items: [
      { id: 'patrimonio', label: 'Patrimônio', desc: 'Leitura e cadastro pelo app', icon: '📦', tab: 'patrimonio' },
      { id: 'patrimonios-web', label: 'Patrimônios Web', desc: 'Tela completa do painel', icon: '🖥', path: 'patrimonios' },
      { id: 'painel-web', label: 'Painel Web', desc: 'Abrir versão completa', icon: '↗', path: 'dashboard' },
    ],
  },
];

const NAV_META = {
  dashboard: ['⌂', 'Início'],
  os: ['OS', 'OS'],
  programacao: ['📅', 'Prog.'],
  patrimonio: ['📦', 'Patrim.'],
  mais: ['☰', 'Menu'],
};

const flatModules = MODULE_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })));

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function openItem(item) {
  if (!item) return;
  if (item.tab) {
    document.querySelector(`.nav-btn[data-tab="${item.tab}"]`)?.click();
    closeMenuSheet();
    return;
  }
  if (item.path) window.location.href = toPanelUrl(item.path);
}

function cardHtml(item) {
  const tag = item.path ? 'a' : 'button';
  const href = item.path ? ` href="${toPanelUrl(item.path)}"` : '';
  const type = item.path ? '' : ' type="button"';
  return `<${tag}${href}${type} class="ux-menu-card${item.primary ? ' is-primary' : ''}" data-ux-module="${item.id}">
    <span class="ux-menu-card-icon">${item.icon}</span>
    <span><b>${item.label}</b><span>${item.desc}</span></span>
  </${tag}>`;
}

function renderGroupedModules(container, query = '') {
  const q = norm(query);
  const groupsHtml = MODULE_GROUPS.map((group) => {
    const items = group.items.filter((item) => {
      if (!q) return true;
      return norm(`${group.title} ${item.label} ${item.desc}`).includes(q);
    });
    if (!items.length) return '';
    return `<section class="ux-menu-group">
      <h3 class="ux-menu-group-title">${group.title}</h3>
      <div class="ux-menu-grid">${items.map(cardHtml).join('')}</div>
    </section>`;
  }).join('');

  container.innerHTML = groupsHtml || '<div class="ux-empty-search">Nenhum módulo encontrado para essa busca.</div>';
}

function ensureMenuSheet() {
  let sheet = document.getElementById('uxMenuSheet');
  if (sheet) return sheet;

  sheet = document.createElement('div');
  sheet.id = 'uxMenuSheet';
  sheet.className = 'ux-sheet';
  sheet.innerHTML = `
    <div class="ux-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="uxMenuTitle">
      <div class="ux-sheet-handle"></div>
      <div class="ux-sheet-head">
        <div>
          <h2 id="uxMenuTitle">Menu do gestor</h2>
          <p>Busque ou toque em um módulo para navegar sem abrir a sidebar do painel.</p>
        </div>
        <button class="ux-sheet-close" id="uxSheetClose" type="button" aria-label="Fechar menu">×</button>
      </div>
      <div class="ux-search-wrap"><input class="ux-search" id="uxSheetSearch" type="search" placeholder="Buscar módulo, OS, compras..." autocomplete="off" /></div>
      <div id="uxSheetContent"></div>
    </div>
  `;
  document.body.appendChild(sheet);

  const content = sheet.querySelector('#uxSheetContent');
  const search = sheet.querySelector('#uxSheetSearch');
  renderGroupedModules(content);

  sheet.querySelector('#uxSheetClose').addEventListener('click', closeMenuSheet);
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) closeMenuSheet();
    const card = event.target.closest('[data-ux-module]');
    if (!card) return;
    const item = flatModules.find((mod) => mod.id === card.dataset.uxModule);
    if (item?.tab) event.preventDefault();
    openItem(item);
  });
  search.addEventListener('input', () => renderGroupedModules(content, search.value));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenuSheet();
  });

  return sheet;
}

function openMenuSheet() {
  const sheet = ensureMenuSheet();
  sheet.classList.add('is-open');
  const search = sheet.querySelector('#uxSheetSearch');
  search.value = '';
  renderGroupedModules(sheet.querySelector('#uxSheetContent'));
  setTimeout(() => search.focus(), 60);
}

function closeMenuSheet() {
  document.getElementById('uxMenuSheet')?.classList.remove('is-open');
}

function ensureTopMenuButton() {
  const actions = document.querySelector('.top-actions');
  if (!actions || document.getElementById('uxMenuBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'uxMenuBtn';
  btn.className = 'ux-menu-btn';
  btn.type = 'button';
  btn.textContent = 'Menu';
  btn.addEventListener('click', openMenuSheet);
  actions.prepend(btn);
}

function enhanceBottomNav() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach((btn) => {
    if (btn.dataset.uxEnhanced === '1') return;
    const meta = NAV_META[btn.dataset.tab];
    if (!meta) return;
    btn.innerHTML = `<span class="nav-ico">${meta[0]}</span><span class="nav-label">${meta[1]}</span>`;
    btn.dataset.uxEnhanced = '1';
  });
}

function enhanceDashboard(main) {
  if (!main || main.querySelector('.ux-home-actions')) return;
  if (!main.querySelector('.db-topbar')) return;

  const wrap = document.createElement('div');
  wrap.className = 'ux-home-actions';
  wrap.innerHTML = `
    <button class="ux-home-search" type="button" id="uxHomeSearch">
      <span><strong>Buscar ou abrir módulo</strong><span>OS, Programação, Logística, Compras...</span></span>
      <b>☰</b>
    </button>
    <div class="ux-home-shortcuts">
      <button class="ux-home-chip" type="button" data-ux-module="os">OS</button>
      <button class="ux-home-chip" type="button" data-ux-module="programacao">Programação</button>
      <button class="ux-home-chip" type="button" data-ux-module="logistica">Logística</button>
      <button class="ux-home-chip" type="button" data-ux-module="compras">Compras</button>
    </div>
  `;
  const topbar = main.querySelector('.db-topbar');
  topbar.insertAdjacentElement('afterend', wrap);
  wrap.querySelector('#uxHomeSearch')?.addEventListener('click', openMenuSheet);
  wrap.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-ux-module]');
    if (!btn) return;
    openItem(flatModules.find((mod) => mod.id === btn.dataset.uxModule));
  });
}

function enhanceMais(main) {
  if (!main || main.dataset.uxMore === '1') return;
  const title = main.querySelector('.hero-card h1')?.textContent || '';
  if (!norm(title).includes('mais')) return;

  main.dataset.uxMore = '1';
  main.innerHTML = `
    <section class="hero-card ux-more-head">
      <h1>Menu do gestor</h1>
      <p>Módulos organizados por rotina. Use a busca para encontrar rápido no celular.</p>
    </section>
    <section class="section-card">
      <div class="ux-search-wrap"><input class="ux-search" id="uxMoreSearch" type="search" placeholder="Buscar módulo..." autocomplete="off" /></div>
      <div id="uxMoreContent"></div>
    </section>
  `;
  const content = main.querySelector('#uxMoreContent');
  const search = main.querySelector('#uxMoreSearch');
  renderGroupedModules(content);
  search.addEventListener('input', () => renderGroupedModules(content, search.value));
  main.addEventListener('click', (event) => {
    const card = event.target.closest('[data-ux-module]');
    if (!card) return;
    const item = flatModules.find((mod) => mod.id === card.dataset.uxModule);
    if (item?.tab) event.preventDefault();
    openItem(item);
  });
}

function enhanceOs(main) {
  if (!main || !main.querySelector('#filterStatus')) return;

  const filterCard = main.querySelector('.section-card');
  if (filterCard && !filterCard.querySelector('.ux-status-chips')) {
    const chips = document.createElement('div');
    chips.className = 'ux-status-chips';
    chips.innerHTML = [
      ['', 'Todos'],
      ['PENDENTE', 'Pendentes'],
      ['AGUARDAR', 'Aguardar'],
      ['ATENDER', 'Conferência'],
      ['FINALIZAR', 'Finalizar'],
    ].map(([value, label]) => `<button class="ux-status-chip" type="button" data-status="${value}">${label}</button>`).join('');
    filterCard.appendChild(chips);
    chips.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-status]');
      if (!btn) return;
      const select = main.querySelector('#filterStatus');
      select.value = btn.dataset.status;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  const currentStatus = main.querySelector('#filterStatus')?.value || '';
  main.querySelectorAll('.ux-status-chip').forEach((btn) => {
    btn.classList.toggle('is-active', (btn.dataset.status || '') === currentStatus);
  });

  main.querySelectorAll('.action-grid .btn[data-action]').forEach((btn) => {
    const labels = { AGUARDAR: 'Aguardar', ATENDER: 'Atender', FINALIZAR: 'Finalizar' };
    btn.dataset.uxLabel = labels[btn.dataset.action] || btn.title || btn.dataset.action;
    btn.setAttribute('aria-label', btn.dataset.uxLabel);
  });
  main.querySelectorAll('.action-grid .btn[data-action-kg]').forEach((btn) => {
    btn.dataset.uxLabel = btn.textContent.trim().length > 4 ? '' : 'Mais saldo';
    btn.setAttribute('aria-label', 'Solicitar mais saldo');
  });
  main.querySelectorAll('.action-grid .btn[data-action-laudo]').forEach((btn) => {
    btn.dataset.uxLabel = 'Anexar laudo';
    btn.setAttribute('aria-label', 'Anexar laudo');
  });
  main.querySelectorAll('.action-grid .status-dot').forEach((el) => {
    el.dataset.uxLabel = 'Pendente';
  });
}

function enhance() {
  ensureTopMenuButton();
  ensureMenuSheet();
  enhanceBottomNav();
  const main = document.getElementById('appMain');
  if (!main) return;
  enhanceDashboard(main);
  enhanceMais(main);
  enhanceOs(main);
}

let scheduled = false;
function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance();
  });
}

new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', scheduleEnhance);
scheduleEnhance();
