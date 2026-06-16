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

export function bindLayoutActions() {
  const sidebar = document.querySelector('.sidebar, #sidebar, [data-sidebar]');
  const search = document.querySelector(
    '#globalSearch, [data-global-search], .topbar input[type="search"], header input[type="search"]'
  );
  const appsButton = document.querySelector(
    '#appsButton, [data-apps-button], .topbar [aria-label*="Aplic"], header [aria-label*="Aplic"]'
  );

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
        if (first) window.location.assign(first.href);
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
