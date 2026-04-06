import { toPanelUrl } from './paths.js';
import { PANEL_MENU } from './menuConfig.js';

const MENU_STORAGE_KEY = 'painel_sidebar_open_sections';
const PREFETCHED_URLS = new Set();

function normalizeCode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function prefetchUrl(url) {
  try {
    const absolute = new URL(url, window.location.href).toString();
    if (PREFETCHED_URLS.has(absolute)) return;
    PREFETCHED_URLS.add(absolute);

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = absolute;
    link.as = 'document';
    document.head.appendChild(link);
  } catch {}
}

function shouldHandleAsNormalNavigation(event) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

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

function buildAllowedCodeSet(userContext) {
  const set = new Set();
  for (const mod of userContext?.modules || []) {
    if (mod?.can_view === false) continue;
    const code = normalizeCode(mod?.code);
    if (code) set.add(code);
  }
  return set;
}

function isItemAllowed(item, allowedCodes) {
  const candidates = [item.code, ...(Array.isArray(item.aliases) ? item.aliases : [])]
    .map(normalizeCode)
    .filter(Boolean);
  return candidates.some((code) => allowedCodes.has(code));
}

export function buildAllowedMenu(userContext) {
  if (!userContext) return [];

  if (userContext.user?.is_master) {
    return PANEL_MENU.map((section) => ({ ...section, items: [...section.items] }));
  }

  const allowedCodes = buildAllowedCodeSet(userContext);

  return PANEL_MENU
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isItemAllowed(item, allowedCodes)),
    }))
    .filter((section) => section.items.length > 0);
}

export function flattenAllowedMenu(userContext) {
  return buildAllowedMenu(userContext).flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.section }))
  );
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
        normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, '')) ||
        normalizedCurrent.endsWith(normalizedItemPath + '.html')
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

    const isOpen = hasItems && (hasActiveItem || storedOpenSections.has(section.section) || menuSections.length <= 3);

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
          normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, '')) ||
          normalizedCurrent.endsWith(normalizedItemPath + '.html')
        ) {
          link.classList.add('active');
        }

        link.addEventListener('mouseenter', () => prefetchUrl(link.href), { passive: true });
        link.addEventListener('focus', () => prefetchUrl(link.href), { passive: true });
        link.addEventListener('touchstart', () => prefetchUrl(link.href), { passive: true, once: true });
        link.addEventListener('click', (event) => {
          if (!shouldHandleAsNormalNavigation(event)) return;
          document.documentElement.classList.add('is-route-transitioning');
        });

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
