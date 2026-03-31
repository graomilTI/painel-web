import { toPanelUrl } from './paths.js';
import { PANEL_MENU } from './menuConfig.js';

export function buildAllowedMenu(userContext) {
  if (!userContext) return [];
  if (userContext.user?.is_master) return PANEL_MENU;

  const allowedCodes = new Set(
    (userContext.modules || [])
      .filter((m) => m.can_view)
      .map((m) => m.code)
  );

  return PANEL_MENU
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowedCodes.has(item.code)),
    }))
    .filter((section) => section.items.length > 0);
}

export function renderMenu(container, menuSections, currentPath = '') {
  if (!container) return;
  container.innerHTML = '';

  const normalizedCurrent = currentPath.replace(/\/+/g, '/');

  menuSections.forEach((section) => {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'menu-section';

    const title = document.createElement('h4');
    title.textContent = section.section;
    sectionEl.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'menu-list';

    section.items.forEach((item) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = toPanelUrl(item.path);
      link.textContent = item.label;

      const normalizedItemPath = ('/' + String(item.path || '').replace(/^\.\//, '').replace(/^\//, '')).replace(/\/+/g, '/');
      if (
        normalizedCurrent.endsWith(normalizedItemPath) ||
        normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, ''))
      ) {
        link.classList.add('active');
      }

      li.appendChild(link);
      list.appendChild(li);
    });

    sectionEl.appendChild(list);
    container.appendChild(sectionEl);
  });
}
