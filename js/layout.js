import { buildAllowedMenu, renderMenu } from './menuBuilder.js';
import { signOut } from './auth.js';
import { clearUserContext } from './sessionStore.js';

export function renderAppLayout({ userContext, currentPageTitle = 'Painel' }) {
  const menu = buildAllowedMenu(userContext);
  renderMenu(document.getElementById('sidebarMenu'), menu, window.location.pathname);

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
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await signOut();
      } finally {
        clearUserContext();
        window.location.href = './login.html';
      }
    });
  }
}
