const STYLE_ID = 'metas-nav-objetivo-style-v1';
const ENHANCED_ATTR = 'data-metas-nav-objetivo';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .metas-tab.metas-tab-secondary-source {
      display: none !important;
    }

    .metas-tab.metas-tab-parent-active {
      color: #ecfdf5 !important;
      background: linear-gradient(135deg, rgba(16,185,129,.95), rgba(34,197,94,.78)) !important;
      border-color: rgba(110,231,183,.34) !important;
      box-shadow: 0 10px 24px rgba(16,185,129,.14) !important;
    }

    .metas-objective-subnav {
      display: none;
      align-items: center;
      gap: 8px;
      margin: 8px 0 12px;
      padding: 8px;
      width: fit-content;
      max-width: 100%;
      border: 1px solid rgba(148,163,184,.13);
      border-radius: 16px;
      background: rgba(15,23,42,.46);
    }

    .metas-objective-subnav.is-visible {
      display: flex;
    }

    .metas-objective-subnav-label {
      padding: 0 8px;
      color: #64748b;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .metas-objective-subtab {
      min-height: 36px;
      padding: 8px 13px;
      border: 1px solid rgba(148,163,184,.13);
      border-radius: 11px;
      background: rgba(2,6,23,.28);
      color: #94a3b8;
      font: inherit;
      font-size: 12px;
      font-weight: 850;
      cursor: pointer;
      transition: background .14s ease, border-color .14s ease, color .14s ease;
    }

    .metas-objective-subtab:hover {
      color: #e2e8f0;
      border-color: rgba(74,222,128,.24);
      background: rgba(34,197,94,.08);
    }

    .metas-objective-subtab.active {
      color: #ecfdf5;
      border-color: rgba(110,231,183,.28);
      background: rgba(16,185,129,.20);
    }

    @media (max-width: 760px) {
      .metas-objective-subnav {
        width: 100%;
        flex-wrap: wrap;
      }

      .metas-objective-subnav-label {
        width: 100%;
      }

      .metas-objective-subtab {
        flex: 1 1 140px;
      }
    }
  `;

  document.head.appendChild(style);
}

function findTab(container, label) {
  const wanted = normalize(label);
  return Array.from(container.querySelectorAll('.metas-tab')).find((tab) => {
    const original = normalize(tab.dataset.metasOriginalLabel);
    return original === wanted || normalize(tab.textContent) === wanted;
  });
}

function replaceVisibleLabel(tab, oldLabel, newLabel) {
  if (!tab) return;
  if (!tab.dataset.metasOriginalLabel) tab.dataset.metasOriginalLabel = oldLabel;
  if (tab.dataset.metasObjectiveLabel === newLabel) return;

  const oldNormalized = normalize(oldLabel);
  const walker = document.createTreeWalker(tab, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    if (normalize(node.nodeValue) === oldNormalized) {
      node.nodeValue = newLabel;
      tab.dataset.metasObjectiveLabel = newLabel;
      tab.setAttribute('aria-label', newLabel);
      return;
    }
    node = walker.nextNode();
  }

  const labelNode = tab.querySelector('[data-label], .label, span:last-child');
  if (labelNode) {
    labelNode.textContent = newLabel;
    tab.dataset.metasObjectiveLabel = newLabel;
    tab.setAttribute('aria-label', newLabel);
  }
}

function isTabActive(tab) {
  if (!tab) return false;
  return tab.classList.contains('active') ||
    tab.classList.contains('is-active') ||
    tab.getAttribute('aria-selected') === 'true' ||
    tab.dataset.active === 'true';
}

function makeSubnav(type, label, items) {
  const nav = document.createElement('div');
  nav.className = 'metas-objective-subnav';
  nav.dataset.metasObjectiveSubnav = type;
  nav.setAttribute('aria-label', label);
  nav.innerHTML = `<span class="metas-objective-subnav-label">${label}</span>`;

  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'metas-objective-subtab';
    button.dataset.target = item.target;
    button.textContent = item.label;
    button.addEventListener('click', () => item.tab?.click());
    nav.appendChild(button);
  });

  return nav;
}

function updateState(container, refs) {
  const performanceActive = isTabActive(refs.regionais) || isTabActive(refs.estados);
  const managementActive = isTabActive(refs.gestores) || isTabActive(refs.config);

  refs.regionais?.classList.toggle('metas-tab-parent-active', performanceActive);
  refs.config?.classList.toggle('metas-tab-parent-active', managementActive);

  refs.performanceSubnav?.classList.toggle('is-visible', performanceActive);
  refs.managementSubnav?.classList.toggle('is-visible', managementActive);

  refs.performanceSubnav?.querySelectorAll('.metas-objective-subtab').forEach((button) => {
    const active = button.dataset.target === 'regionais' ? isTabActive(refs.regionais) : isTabActive(refs.estados);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  refs.managementSubnav?.querySelectorAll('.metas-objective-subtab').forEach((button) => {
    const active = button.dataset.target === 'gestores' ? isTabActive(refs.gestores) : isTabActive(refs.config);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function enhance(container) {
  const nav = container.querySelector('.metas-nav');
  if (!nav) return;

  const regionais = findTab(container, 'Regionais');
  const estados = findTab(container, 'Estados');
  const gestores = findTab(container, 'Gestores');
  const config = findTab(container, 'Metas & Fechamento');

  if (!regionais || !estados || !gestores || !config) return;

  replaceVisibleLabel(regionais, 'Regionais', 'Desempenho');
  replaceVisibleLabel(config, 'Metas & Fechamento', 'Gestão');

  estados.classList.add('metas-tab-secondary-source');
  gestores.classList.add('metas-tab-secondary-source');

  let performanceSubnav = container.querySelector('[data-metas-objective-subnav="desempenho"]');
  let managementSubnav = container.querySelector('[data-metas-objective-subnav="gestao"]');

  if (!performanceSubnav) {
    performanceSubnav = makeSubnav('desempenho', 'Detalhar desempenho', [
      { label: 'Regionais', target: 'regionais', tab: regionais },
      { label: 'Estados', target: 'estados', tab: estados },
    ]);
    nav.insertAdjacentElement('afterend', performanceSubnav);
  }

  if (!managementSubnav) {
    managementSubnav = makeSubnav('gestao', 'Área de gestão', [
      { label: 'Gestores', target: 'gestores', tab: gestores },
      { label: 'Metas e fechamento', target: 'config', tab: config },
    ]);
    performanceSubnav.insertAdjacentElement('afterend', managementSubnav);
  }

  nav.setAttribute(ENHANCED_ATTR, '1');
  updateState(container, {
    regionais,
    estados,
    gestores,
    config,
    performanceSubnav,
    managementSubnav,
  });
}

function init() {
  injectStyle();

  const run = () => requestAnimationFrame(() => enhance(document));
  run();

  const observer = new MutationObserver(run);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-selected', 'data-active'],
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
