const STYLE_ID = 'metas-compacto-2026-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .metas-page { max-width: 1500px !important; }

    .metas-header,
    .metas-guide-strip,
    .metas-filter-intro,
    .metas-nav-desc,
    .metas-compact-titlebar,
    [data-metas-auto-notice] {
      display: none !important;
    }

    .metas-filter-card {
      display: grid !important;
      grid-template-columns: minmax(570px, 1.35fr) minmax(520px, 1fr) !important;
      align-items: end !important;
      gap: 14px !important;
      margin-bottom: 12px !important;
      padding: 14px 16px !important;
      border-radius: 18px !important;
    }

    .metas-month-section { min-width: 0; margin: 0 !important; }
    .metas-month-title { margin-bottom: 7px !important; }
    .metas-month-title strong { font-size: 11px !important; }
    .metas-month-title span { display: none !important; }

    .metas-month-bar {
      display: flex !important;
      gap: 6px !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
    }

    .metas-month-btn {
      flex: 0 1 44px;
      min-width: 38px;
      min-height: 36px !important;
      padding: 0 9px !important;
      border-radius: 11px !important;
    }

    .metas-filters {
      display: grid !important;
      grid-template-columns: 100px minmax(130px, .9fr) minmax(150px, 1fr) auto !important;
      gap: 9px !important;
      align-items: end !important;
      min-width: 0;
    }

    .metas-field label {
      margin-bottom: 5px !important;
      color: #94a3b8 !important;
      font-size: 10px !important;
      font-weight: 900 !important;
      letter-spacing: .07em !important;
    }

    .metas-field select,
    .metas-field input {
      min-height: 36px !important;
      height: 36px !important;
      padding: 7px 10px !important;
      border-radius: 11px !important;
      font-size: 12px !important;
    }

    .metas-filter-card .metas-btn {
      min-height: 36px !important;
      height: 36px !important;
      padding: 7px 13px !important;
      border-radius: 11px !important;
      white-space: nowrap;
      font-size: 12px !important;
    }

    .metas-nav {
      margin-bottom: 12px !important;
      padding: 5px 8px !important;
      border-radius: 16px !important;
      gap: 8px !important;
    }

    .metas-nav-group { gap: 5px !important; }
    .metas-nav-group + .metas-nav-group { padding-left: 9px !important; }
    .metas-nav-group > strong,
    .metas-nav-group > span:not(.metas-tab-icon) { display: none !important; }

    .metas-tab {
      min-height: 36px !important;
      padding: 7px 12px !important;
      border-radius: 11px !important;
      font-size: 12px !important;
    }

    .metas-kpis {
      gap: 12px !important;
      margin: 0 0 12px !important;
    }

    .metas-card {
      min-height: 104px !important;
      padding: 16px 18px !important;
      border-radius: 18px !important;
    }

    .metas-card-label { font-size: 10px !important; }
    .metas-card-value {
      margin-top: 8px !important;
      font-size: clamp(27px, 2.5vw, 36px) !important;
      line-height: 1 !important;
    }
    .metas-card-sub { margin-top: 7px !important; font-size: 11px !important; }

    .metas-table-card,
    .metas-card,
    .metas-history-card,
    .metas-chart-card { border-radius: 18px !important; }

    .metas-sortable-header {
      cursor: pointer !important;
      user-select: none;
      white-space: nowrap;
    }

    .metas-sortable-header:hover { color: #86efac !important; }
    .metas-sortable-header::after {
      content: ' ⇅';
      color: #64748b;
      font-size: 10px;
    }
    .metas-sortable-header[data-sort-direction='asc']::after { content: ' ↑'; color: #4ade80; }
    .metas-sortable-header[data-sort-direction='desc']::after { content: ' ↓'; color: #4ade80; }

    @media (max-width: 1250px) {
      .metas-filter-card { grid-template-columns: 1fr !important; }
      .metas-month-bar { flex-wrap: wrap; }
    }

    @media (max-width: 760px) {
      .metas-filters { grid-template-columns: 1fr !important; }
      .metas-month-btn { flex-basis: calc(25% - 6px); }
      .metas-kpis { grid-template-columns: 1fr 1fr !important; }
    }
  `;
  document.head.appendChild(style);
}

function textOf(element) {
  return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function activeTabText(container) {
  const active = Array.from(container.querySelectorAll('.metas-tab.active, .metas-tab[aria-selected="true"]'))
    .find((element) => element.offsetParent !== null);
  return textOf(active);
}

function removeRedundantHeaders(container) {
  container.querySelectorAll('.metas-compact-titlebar').forEach((element) => element.remove());

  const page = container.querySelector('.metas-page');
  if (!page) return;

  Array.from(page.children).forEach((element) => {
    const text = textOf(element);
    if (/metas com atualização automática/i.test(text)) {
      element.setAttribute('data-metas-auto-notice', '1');
    }
  });
}

function placeKpisBelowNavigation(container) {
  const page = container.querySelector('.metas-page');
  const nav = page?.querySelector('.metas-nav');
  const kpis = page?.querySelector('.metas-kpis');
  if (!page || !nav || !kpis) return;

  if (nav.nextElementSibling !== kpis) {
    nav.insertAdjacentElement('afterend', kpis);
  }
}

function findRegionalTableCards(container) {
  return Array.from(container.querySelectorAll('.metas-table-card, .metas-card, section, article'))
    .filter((card) => {
      const heading = card.querySelector('h1, h2, h3, .metas-table-title, .metas-card-title');
      const title = textOf(heading);
      return /^metas por regional$/i.test(title) || /^consolidado por regional$/i.test(title);
    });
}

function hideOverviewRegionalDuplicate(container) {
  const isOverview = /visão geral/i.test(activeTabText(container));
  findRegionalTableCards(container).forEach((card) => {
    card.style.display = isOverview ? 'none' : '';
  });
}

function parseSortableValue(value) {
  const text = String(value || '').trim();
  if (!text) return { type: 'text', value: '' };

  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/R\$/gi, '')
    .replace(/t\b/gi, '')
    .replace(/%/g, '')
    .trim();

  if (/^-?[\d.]+(?:,\d+)?$/.test(cleaned)) {
    const number = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(number)) return { type: 'number', value: number };
  }

  return { type: 'text', value: cleaned.toLocaleLowerCase('pt-BR') };
}

function compareValues(a, b, direction) {
  if (a.type === 'number' && b.type === 'number') {
    return direction === 'asc' ? a.value - b.value : b.value - a.value;
  }
  const result = String(a.value).localeCompare(String(b.value), 'pt-BR', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function makeRegionalHeadersSortable(container) {
  findRegionalTableCards(container).forEach((card) => {
    const table = card.querySelector('table');
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('thead th'));
    headers.forEach((header, columnIndex) => {
      if (header.dataset.metasSortBound === '1') return;
      const label = textOf(header);
      if (!label || /ação|ações/i.test(label)) return;

      header.dataset.metasSortBound = '1';
      header.classList.add('metas-sortable-header');
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-label', `Ordenar por ${label}`);

      const sort = () => {
        const tbody = table.tBodies[0];
        if (!tbody) return;

        const nextDirection = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
        headers.forEach((item) => delete item.dataset.sortDirection);
        header.dataset.sortDirection = nextDirection;

        const rows = Array.from(tbody.rows);
        rows.sort((rowA, rowB) => {
          const a = parseSortableValue(rowA.cells[columnIndex]?.textContent);
          const b = parseSortableValue(rowB.cells[columnIndex]?.textContent);
          return compareValues(a, b, nextDirection);
        });
        rows.forEach((row) => tbody.appendChild(row));
      };

      header.addEventListener('click', sort);
      header.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          sort();
        }
      });
    });
  });
}

function enhance(container) {
  if (!container?.querySelector('.metas-page')) return;
  removeRedundantHeaders(container);
  placeKpisBelowNavigation(container);
  hideOverviewRegionalDuplicate(container);
  makeRegionalHeadersSortable(container);
}

export function initMetasCompacto2026(container = document) {
  injectStyle();

  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhance(container);
    });
  };

  run();

  if (container.__metasCompacto2026Observer) return;
  const observer = new MutationObserver(run);
  observer.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-selected']
  });
  container.__metasCompacto2026Observer = observer;
}

const boot = () => initMetasCompacto2026(document.getElementById('pageContent') || document);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
