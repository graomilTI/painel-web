const BOUND_ATTR = 'data-metas-estado-sort-bound';

function textOf(element) {
  return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function parseValue(value) {
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

  const result = String(a.value).localeCompare(String(b.value), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  });
  return direction === 'asc' ? result : -result;
}

function findStateTables(container) {
  return Array.from(container.querySelectorAll('.metas-table-card, .metas-card, section, article'))
    .filter((card) => {
      const heading = card.querySelector('h1, h2, h3, .metas-table-title, .metas-card-title');
      return /^consolidado por estado$/i.test(textOf(heading));
    })
    .map((card) => card.querySelector('table'))
    .filter(Boolean);
}

function bindTable(table) {
  const headers = Array.from(table.querySelectorAll('thead th'));

  headers.forEach((header, columnIndex) => {
    if (header.getAttribute(BOUND_ATTR) === '1') return;

    const label = textOf(header);
    if (!label || /ação|ações/i.test(label)) return;

    header.setAttribute(BOUND_ATTR, '1');
    header.classList.add('metas-sortable-header');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-label', `Ordenar por ${label}`);

    const sort = () => {
      const tbody = table.tBodies[0];
      if (!tbody) return;

      const direction = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
      headers.forEach((item) => delete item.dataset.sortDirection);
      header.dataset.sortDirection = direction;

      const rows = Array.from(tbody.rows);
      rows.sort((rowA, rowB) => {
        const a = parseValue(rowA.cells[columnIndex]?.textContent);
        const b = parseValue(rowB.cells[columnIndex]?.textContent);
        return compareValues(a, b, direction);
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
}

function enhance(container) {
  findStateTables(container).forEach(bindTable);
}

function boot() {
  const container = document.getElementById('pageContent') || document;

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

  const observer = new MutationObserver(run);
  observer.observe(container, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
