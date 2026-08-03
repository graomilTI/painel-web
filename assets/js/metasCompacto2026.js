const STYLE_ID = 'metas-compacto-2026-style';
const TITLEBAR_CLASS = 'metas-compact-titlebar';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .metas-page {
      max-width: 1500px !important;
    }

    .metas-header,
    .metas-guide-strip,
    .metas-filter-intro,
    .metas-nav-desc {
      display: none !important;
    }

    .${TITLEBAR_CLASS} {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 58px;
      margin-bottom: 12px;
      padding: 4px 2px;
    }

    .${TITLEBAR_CLASS}__title {
      margin: 0;
      color: #f8fafc;
      font-size: clamp(22px, 2vw, 30px);
      line-height: 1.05;
      letter-spacing: -.035em;
      font-weight: 900;
      white-space: nowrap;
    }

    .${TITLEBAR_CLASS}__period {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 0 13px;
      border: 1px solid rgba(74, 222, 128, .25);
      border-radius: 12px;
      background: rgba(21, 128, 61, .14);
      color: #86efac;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .${TITLEBAR_CLASS}__updated {
      color: #94a3b8;
      font-size: 12px;
      white-space: nowrap;
    }

    .${TITLEBAR_CLASS}__actions {
      display: flex;
      gap: 9px;
      margin-left: auto;
    }

    .${TITLEBAR_CLASS}__actions .metas-btn {
      min-height: 38px !important;
      padding: 8px 14px !important;
      border-radius: 12px !important;
      font-size: 12px !important;
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

    .metas-month-section {
      min-width: 0;
      margin: 0 !important;
    }

    .metas-month-title {
      margin-bottom: 7px !important;
    }

    .metas-month-title strong {
      font-size: 11px !important;
    }

    .metas-month-title span {
      display: none !important;
    }

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
      font-size: 10px !important;
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

    .metas-nav-group {
      gap: 5px !important;
    }

    .metas-nav-group + .metas-nav-group {
      padding-left: 9px !important;
    }

    .metas-nav-group > strong,
    .metas-nav-group > span:not(.metas-tab-icon) {
      display: none !important;
    }

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

    .metas-card-label {
      font-size: 10px !important;
    }

    .metas-card-value {
      margin-top: 8px !important;
      font-size: clamp(27px, 2.5vw, 36px) !important;
      line-height: 1 !important;
    }

    .metas-card-sub {
      margin-top: 7px !important;
      font-size: 11px !important;
    }

    .metas-table-card,
    .metas-card,
    .metas-history-card,
    .metas-chart-card {
      border-radius: 18px !important;
    }

    @media (max-width: 1250px) {
      .metas-filter-card {
        grid-template-columns: 1fr !important;
      }

      .metas-month-bar {
        flex-wrap: wrap;
      }
    }

    @media (max-width: 760px) {
      .${TITLEBAR_CLASS} {
        align-items: flex-start;
        flex-wrap: wrap;
      }

      .${TITLEBAR_CLASS}__updated {
        width: 100%;
      }

      .${TITLEBAR_CLASS}__actions {
        margin-left: 0;
      }

      .metas-filters {
        grid-template-columns: 1fr !important;
      }

      .metas-month-btn {
        flex-basis: calc(25% - 6px);
      }

      .metas-kpis {
        grid-template-columns: 1fr 1fr !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function textOf(element) {
  return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function ensureTitlebar(container) {
  const page = container.querySelector('.metas-page');
  const oldHeader = page?.querySelector('.metas-header');
  if (!page || !oldHeader) return;

  let titlebar = page.querySelector(`.${TITLEBAR_CLASS}`);
  if (!titlebar) {
    titlebar = document.createElement('div');
    titlebar.className = TITLEBAR_CLASS;
    page.insertBefore(titlebar, page.firstChild);
  }

  const title = textOf(oldHeader.querySelector('h1')) || 'Metas de Produção';
  const period = textOf(oldHeader.querySelector('.metas-period-chip')) || textOf(container.querySelector('.metas-period-chip'));
  const updated = textOf(document.querySelector('[data-last-update], .topbar .metas-status, .topbar .meta'));
  const actions = oldHeader.querySelector('.metas-actions');

  titlebar.innerHTML = `
    <h1 class="${TITLEBAR_CLASS}__title">${title}</h1>
    ${period ? `<span class="${TITLEBAR_CLASS}__period">${period}</span>` : ''}
    ${updated ? `<span class="${TITLEBAR_CLASS}__updated">${updated}</span>` : ''}
    <div class="${TITLEBAR_CLASS}__actions"></div>
  `;

  if (actions) titlebar.querySelector(`.${TITLEBAR_CLASS}__actions`).appendChild(actions);
}

function isOverview(container) {
  const active = Array.from(container.querySelectorAll('.metas-tab.active, .metas-tab[aria-selected="true"]'))
    .find((element) => element.offsetParent !== null);
  return /visão geral/i.test(textOf(active));
}

function reorderOverview(container) {
  if (!isOverview(container)) return;

  const page = container.querySelector('.metas-page');
  const kpis = page?.querySelector('.metas-kpis');
  const filter = page?.querySelector('.metas-filter-card');
  if (!page || !kpis || !filter) return;

  if (filter.previousElementSibling !== kpis) {
    page.insertBefore(kpis, filter);
  }
}

function enhance(container) {
  if (!container?.querySelector('.metas-page')) return;
  ensureTitlebar(container);
  reorderOverview(container);
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
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
  container.__metasCompacto2026Observer = observer;
}

const boot = () => initMetasCompacto2026(document.getElementById('pageContent') || document);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
