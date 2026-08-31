import { toPanelUrl } from './paths.js';

const GROUPS = [
  ['Operação do dia', [
    ['dashboard', 'Início', 'Indicadores e atalhos principais', '⌂', 'dashboard', null, true],
    ['programacao', 'Programação', 'Distribuir O.S., aguardar, atender e finalizar', '📅', 'programacao', null, true],
    ['logistica', 'Logística', 'FOB, report, abrir e finalizar OS', '🚚', null, 'logistica'],
  ]],
  ['Solicitações', [
    ['hospedagem', 'Hospedagem', 'Pedir reservas e acompanhar solicitações', '🏨', null, 'hospedagem'],
    ['compras', 'Compras', 'Materiais, uniformes e solicitações', '🛒', null, 'compras'],
    ['contato-cliente', 'Contato Cliente', 'Registrar visitas e contatos', '🤝', null, 'contato-cliente'],
  ]],
  ['Controle e consulta', [
    ['patrimonio', 'Patrimônio', 'Leitura e cadastro pelo app', '📦', 'patrimonio'],
    ['email', 'E-mail', 'Caixa de entrada e mensagens do gestor', '✉', 'email'],
    ['patrimonios-web', 'Patrimônios Web', 'Tela completa do painel', '🖥', null, 'patrimonios'],
    ['painel-web', 'Painel Web', 'Abrir versão completa', '↗', null, 'dashboard'],
  ]],
].map(([title, items]) => ({
  title,
  items: items.map(([id, label, desc, icon, tab, path, primary]) => ({ id, label, desc, icon, tab, path, primary, title })),
}));

const FLAT = GROUPS.flatMap((g) => g.items);
const NAV = { dashboard: ['⌂', 'Início'], programacao: ['📅', 'Prog.'], patrimonio: ['📦', 'Patrim.'], email: ['✉', 'E-mail'], mais: ['☰', 'Menu'] };

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function itemById(id) { return FLAT.find((item) => item.id === id); }

function openItem(item) {
  if (!item) return;
  if (item.tab) {
    document.querySelector(`.nav-btn[data-tab="${item.tab}"]`)?.click();
    closeSheet();
    return;
  }
  if (item.path) window.location.href = toPanelUrl(item.path);
}

function card(item) {
  const tag = item.path ? 'a' : 'button';
  const href = item.path ? ` href="${toPanelUrl(item.path)}"` : '';
  const type = item.path ? '' : ' type="button"';
  return `<${tag}${href}${type} class="ux-menu-card${item.primary ? ' is-primary' : ''}" data-ux-module="${item.id}">
    <span class="ux-menu-card-icon">${item.icon}</span>
    <span><b>${item.label}</b><span>${item.desc}</span></span>
  </${tag}>`;
}

function renderGroups(container) {
  if (!container) return;
  container.innerHTML = `<div class="ux-menu-grid">${FLAT.map(card).join('')}</div>`;
}

function bindModuleClicks(root) {
  if (!root || root.dataset.uxModuleBound === '1') return;
  root.dataset.uxModuleBound = '1';
  root.addEventListener('click', (event) => {
    const link = event.target.closest('[data-ux-module]');
    if (!link) return;
    const item = itemById(link.dataset.uxModule);
    if (item?.tab) event.preventDefault();
    openItem(item);
  });
}

function ensureSheet() {
  let sheet = document.getElementById('uxMenuSheet');
  if (sheet) return sheet;

  sheet = document.createElement('div');
  sheet.id = 'uxMenuSheet';
  sheet.className = 'ux-sheet';
  sheet.innerHTML = `
    <div class="ux-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="uxMenuTitle">
      <div class="ux-sheet-handle"></div>
      <div class="ux-sheet-head">
        <div><h2 id="uxMenuTitle">Menu do gestor</h2><p>Toque em um módulo para navegar sem abrir a sidebar do painel.</p></div>
        <button class="ux-sheet-close" id="uxSheetClose" type="button" aria-label="Fechar menu">×</button>
      </div>
      <div id="uxSheetContent"></div>
    </div>`;
  document.body.appendChild(sheet);

  const content = sheet.querySelector('#uxSheetContent');
  renderGroups(content);
  bindModuleClicks(sheet);

  sheet.querySelector('#uxSheetClose').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (event) => { if (event.target === sheet) closeSheet(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });
  return sheet;
}

function openSheet() {
  const sheet = ensureSheet();
  sheet.classList.add('is-open');
  renderGroups(sheet.querySelector('#uxSheetContent'));
}

function closeSheet() { document.getElementById('uxMenuSheet')?.classList.remove('is-open'); }

function ensureTopButton() {
  const actions = document.querySelector('.top-actions');
  if (!actions || document.getElementById('uxMenuBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'uxMenuBtn';
  btn.className = 'ux-menu-btn';
  btn.type = 'button';
  btn.textContent = 'Menu';
  btn.addEventListener('click', openSheet);
  actions.prepend(btn);
}

function enhanceBottomNav() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach((btn) => {
    if (btn.dataset.uxEnhanced === '1') return;
    const meta = NAV[btn.dataset.tab];
    if (!meta) return;
    btn.innerHTML = `<span class="nav-ico">${meta[0]}</span><span class="nav-label">${meta[1]}</span>`;
    btn.dataset.uxEnhanced = '1';
  });
}

function enhanceDashboard(main) {
  if (!main?.querySelector('.db-topbar') || main.querySelector('.ux-home-actions')) return;
  const wrap = document.createElement('div');
  wrap.className = 'ux-home-actions';
  wrap.innerHTML = `
    <button class="ux-home-search" type="button" id="uxHomeSearch">
      <span><strong>Abrir módulo</strong><span>Programação, Logística, Compras...</span></span><b>☰</b>
    </button>
    <div class="ux-home-shortcuts">
      <button class="ux-home-chip" type="button" data-ux-module="programacao">Programação</button>
      <button class="ux-home-chip" type="button" data-ux-module="logistica">Logística</button>
      <button class="ux-home-chip" type="button" data-ux-module="compras">Compras</button>
    </div>`;
  main.querySelector('.db-topbar').insertAdjacentElement('afterend', wrap);
  wrap.querySelector('#uxHomeSearch')?.addEventListener('click', openSheet);
  bindModuleClicks(wrap);
}

function enhanceMore(main) {
  const title = main?.querySelector('.hero-card h1')?.textContent || '';
  if (!norm(title).includes('mais') || main.querySelector('#uxMoreContent')) return;
  main.innerHTML = `
    <section class="hero-card ux-more-head"><h1>Menu do gestor</h1><p>Toque em um módulo para abrir.</p></section>
    <section class="section-card">
      <div id="uxMoreContent"></div>
    </section>`;
  const content = main.querySelector('#uxMoreContent');
  renderGroups(content);
  bindModuleClicks(main);
}

function enhanceOs(main) {
  if (!main?.querySelector('#filterStatus')) return;
  const filterCard = main.querySelector('.section-card');
  if (filterCard && !filterCard.querySelector('.ux-status-chips')) {
    const chips = document.createElement('div');
    chips.className = 'ux-status-chips';
    chips.innerHTML = [
      ['', 'Todos'], ['PENDENTE', 'Pendentes'], ['AGUARDAR', 'Aguardar'], ['ATENDER', 'Conferência'], ['FINALIZAR', 'Finalizar'],
    ].map(([value, label]) => `<button class="ux-status-chip" type="button" data-status="${value}">${label}</button>`).join('');
    filterCard.appendChild(chips);
    chips.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-status]');
      const select = main.querySelector('#filterStatus');
      if (!btn || !select) return;
      select.value = btn.dataset.status;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  const current = main.querySelector('#filterStatus')?.value || '';
  main.querySelectorAll('.ux-status-chip').forEach((btn) => btn.classList.toggle('is-active', (btn.dataset.status || '') === current));
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
  main.querySelectorAll('.action-grid .status-dot').forEach((el) => { el.dataset.uxLabel = 'Pendente'; });
}

function enhance() {
  ensureTopButton();
  ensureSheet();
  enhanceBottomNav();
  const main = document.getElementById('appMain');
  if (!main) return;
  enhanceDashboard(main);
  enhanceMore(main);
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
