import { buildAllowedMenu, renderMenu } from './menuBuilder.js';
import { signOut } from './auth.js';
import { clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';

const SIDEBAR_COLLAPSED_KEY = 'painel_sidebar_collapsed';

function loadSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(collapsed) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {}
}

function applySidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
}

function ensureSidebarToggle() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return null;

  let button = document.getElementById('sidebarToggleBtn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'sidebarToggleBtn';
    button.className = 'sidebar-toggle-btn';
    button.setAttribute('aria-controls', 'sidebarMenu');
    button.innerHTML = '<span class="sidebar-toggle-icon">☰</span>';
    topbar.prepend(button);
  }

  return button;
}

function syncSidebarToggle(collapsed) {
  const button = ensureSidebarToggle();
  if (!button) return;
  const label = collapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-expanded', String(!collapsed));
  button.classList.toggle('is-collapsed', collapsed);
}

export function renderAppLayout({ userContext, currentPageTitle = 'Painel' }) {
  const collapsed = loadSidebarCollapsed();
  applySidebarCollapsed(collapsed);
  syncSidebarToggle(collapsed);

  const menu = buildAllowedMenu(userContext);
  renderMenu(document.getElementById('sidebarMenu'), menu, window.location.pathname);

  const toggleBtn = ensureSidebarToggle();
  if (toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.addEventListener('click', () => {
      const next = !document.body.classList.contains('sidebar-collapsed');
      applySidebarCollapsed(next);
      saveSidebarCollapsed(next);
      syncSidebarToggle(next);
    });
    toggleBtn.dataset.bound = '1';
  }

  const welcome = document.getElementById('welcomeUser');
  if (welcome) welcome.textContent = `Olá, ${userContext.user.name}`;

  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = currentPageTitle;

  const roleBadge = document.getElementById('roleBadge');
  if (roleBadge) {
    roleBadge.textContent = userContext.user.is_master
      ? 'MASTER'
      : (userContext.department?.name || userContext.user.role || 'USUÁRIO').toUpperCase();
  }

  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn && !signOutBtn.dataset.bound) {
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true;
      signOutBtn.textContent = 'Saindo...';
      try {
        await signOut();
      } finally {
        clearUserContext();
        window.location.replace(toPanelUrl('login.html'));
      }
    });
    signOutBtn.dataset.bound = '1';
  }
}
