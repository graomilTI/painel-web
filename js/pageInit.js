import { requireAuth } from './authGuard.js';
import { renderAppLayout } from './layout.js';

export async function initProtectedPage(title, renderContent) {
  const userContext = await requireAuth();
  if (!userContext) return;

  renderAppLayout({ userContext, currentPageTitle: title });

  const content = document.getElementById('pageContent');
  if (content && typeof renderContent === 'function') {
    renderContent(content, userContext);
  }
}
