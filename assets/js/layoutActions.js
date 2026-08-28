const MENU_OPEN_SECTIONS_KEY = 'painel_sidebar_open_sections';

function clearPersistedSidebarSections() {
  try {
    localStorage.removeItem(MENU_OPEN_SECTIONS_KEY);
  } catch {}
}

// Não restaura submenus abertos de uma página/atualização anterior.
// Este módulo é importado antes da montagem do layout, então a preferência
// antiga é limpa antes de o menu ser renderizado.
clearPersistedSidebarSections();

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function visibleLinks(sidebar) {
  return [...sidebar.querySelectorAll('a[href]')].filter((link) => {
    const item = link.closest('li') || link;
    return !item.hidden && getComputedStyle(item).display !== 'none';
  });
}

function collapseSidebarSubmenus(sidebar = document.querySelector('.sidebar, #sidebar, [data-sidebar]')) {
  clearPersistedSidebarSections();
  if (!sidebar) return;

  sidebar.querySelectorAll('.menu-section-body').forEach((body) => {
    body.hidden = true;
  });

  sidebar.querySelectorAll('.menu-section-toggle').forEach((toggle) => {
    toggle.classList.add('is-collapsed');
  });
}

function bindSidebarAutoCollapse(sidebar) {
  if (!sidebar || sidebar.dataset.submenuAutoCollapseBound) return;
  sidebar.dataset.submenuAutoCollapseBound = 'true';

  // Ao escolher qualquer submenu, recolhe tudo imediatamente. Isso também
  // cobre a navegação suave do router, sem depender de um reload completo.
  sidebar.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (link) collapseSidebarSubmenus(sidebar);
  });

  if (!window.__sidebarHistoryCollapseBound) {
    window.__sidebarHistoryCollapseBound = true;
    window.addEventListener('hashchange', () => collapseSidebarSubmenus());
    window.addEventListener('popstate', () => collapseSidebarSubmenus());
  }
}

export function bindLayoutActions() {
  const sidebar = document.querySelector('.sidebar, #sidebar, [data-sidebar]');
  const search = document.querySelector(
    '#globalSearch, [data-global-search], .topbar input[type="search"], header input[type="search"]'
  );
  const appsButton = document.querySelector(
    '#appsButton, [data-apps-button], .topbar [aria-label*="Aplic"], header [aria-label*="Aplic"]'
  );

  // Abertura do painel, F5/Ctrl+R e toda remontagem do layout começam com
  // apenas os títulos das seções visíveis; o item ativo continua destacado.
  collapseSidebarSubmenus(sidebar);
  bindSidebarAutoCollapse(sidebar);

  if (search && sidebar && !search.dataset.layoutSearchBound) {
    search.dataset.layoutSearchBound = 'true';

    const applyFilter = () => {
      const term = normalize(search.value);
      sidebar.querySelectorAll('a[href]').forEach((link) => {
        const item = link.closest('li') || link;
        item.hidden = Boolean(term) && !normalize(link.textContent).includes(term);
      });
    };

    search.addEventListener('input', applyFilter);
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        search.value = '';
        applyFilter();
        search.blur();
      }

      if (event.key === 'Enter') {
        const first = visibleLinks(sidebar)[0];
        if (first) {
          collapseSidebarSubmenus(sidebar);
          window.location.assign(first.href);
        }
      }
    });
  }

  if (appsButton && !appsButton.dataset.layoutAppsBound) {
    appsButton.dataset.layoutAppsBound = 'true';
    appsButton.addEventListener('click', () => {
      document.body.classList.remove('sidebar-collapsed');
      sidebar?.classList.remove('is-collapsed', 'collapsed');
      if (search) {
        search.focus();
        search.select();
      } else {
        sidebar?.querySelector('a[href]')?.focus();
      }
    });
  }
}
