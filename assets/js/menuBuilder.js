import { toPanelUrl } from './paths.js';
import { PANEL_MENU } from './menuConfig.js';

const MENU_STORAGE_KEY = 'painel_sidebar_open_sections';

function loadOpenSections() {
  try {
    const raw = localStorage.getItem(MENU_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOpenSections(sectionNames) {
  try {
    localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(sectionNames));
  } catch {}
}

function normalizePath(value = '') {
  return ('/' + String(value || '').replace(/^\.\//, '').replace(/^\//, '')).replace(/\/+/g, '/');
}

export function buildAllowedMenu(userContext) {
  if (!userContext) return [];

  if (userContext.user?.is_master) {
    return PANEL_MENU.map((section) => ({ ...section, items: [...section.items] }));
  }

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
  const normalizedCurrent = normalizePath(currentPath);
  const storedOpenSections = new Set(loadOpenSections());

  menuSections.forEach((section) => {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'menu-section';

    const hasItems = Array.isArray(section.items) && section.items.length > 0;
    const hasActiveItem = (section.items || []).some((item) => {
      const normalizedItemPath = normalizePath(item.path);
      return (
        normalizedCurrent.endsWith(normalizedItemPath) ||
        normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, ''))
      );
    });

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'menu-section-toggle';
    if (hasActiveItem) titleBtn.classList.add('is-active');

    const titleText = document.createElement('span');
    titleText.textContent = section.section;

    const caret = document.createElement('span');
    caret.className = 'menu-section-caret';
    caret.textContent = hasItems ? '▾' : '•';

    titleBtn.appendChild(titleText);
    titleBtn.appendChild(caret);
    sectionEl.appendChild(titleBtn);

    const listWrap = document.createElement('div');
    listWrap.className = 'menu-section-body';

    let isOpen = hasItems && (hasActiveItem || storedOpenSections.has(section.section) || menuSections.length <= 3);

    if (!isOpen) {
      listWrap.hidden = true;
      titleBtn.classList.add('is-collapsed');
    }

    if (hasItems) {
      const list = document.createElement('ul');
      list.className = 'menu-list';

      section.items.forEach((item) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = toPanelUrl(item.path);
        link.textContent = item.label;

        const normalizedItemPath = normalizePath(item.path);
        if (
          normalizedCurrent.endsWith(normalizedItemPath) ||
          normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, ''))
        ) {
          link.classList.add('active');
        }

        li.appendChild(link);
        list.appendChild(li);
      });

      listWrap.appendChild(list);

      titleBtn.addEventListener('click', () => {
        const willOpen = listWrap.hidden;
        listWrap.hidden = !willOpen;
        titleBtn.classList.toggle('is-collapsed', !willOpen);

        const openSections = new Set(loadOpenSections());
        if (willOpen) openSections.add(section.section);
        else openSections.delete(section.section);
        saveOpenSections([...openSections]);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'menu-empty';
      empty.textContent = 'Em implantação';
      listWrap.appendChild(empty);
    }

    sectionEl.appendChild(listWrap);
    container.appendChild(sectionEl);
  });
}
