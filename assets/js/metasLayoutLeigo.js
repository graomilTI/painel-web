const STYLE_ID = 'metas-layout-leigo-style-v1';
const ENHANCED_ATTR = 'data-metas-layout-leigo';

const MESES = [
  { value: 1, label: 'Jan', full: 'Janeiro' },
  { value: 2, label: 'Fev', full: 'Fevereiro' },
  { value: 3, label: 'Mar', full: 'Março' },
  { value: 4, label: 'Abr', full: 'Abril' },
  { value: 5, label: 'Mai', full: 'Maio' },
  { value: 6, label: 'Jun', full: 'Junho' },
  { value: 7, label: 'Jul', full: 'Julho' },
  { value: 8, label: 'Ago', full: 'Agosto' },
  { value: 9, label: 'Set', full: 'Setembro' },
  { value: 10, label: 'Out', full: 'Outubro' },
  { value: 11, label: 'Nov', full: 'Novembro' },
  { value: 12, label: 'Dez', full: 'Dezembro' },
];

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .metas-page {
      max-width: 1440px;
      margin: 0 auto;
    }

    .metas-header {
      padding: 20px 22px;
      border: 1px solid rgba(148, 163, 184, .14);
      border-radius: 24px;
      background:
        radial-gradient(circle at 12% 12%, rgba(34, 197, 94, .16), transparent 34%),
        linear-gradient(135deg, rgba(15, 23, 42, .98), rgba(2, 6, 23, .90));
      box-shadow: 0 18px 46px rgba(0,0,0,.24);
    }

    .metas-title-wrap h1 {
      font-size: clamp(26px, 3vw, 38px) !important;
    }

    .metas-title-wrap p {
      font-size: 14px !important;
      line-height: 1.55;
      max-width: 820px !important;
    }

    .metas-actions .metas-btn,
    .metas-filter-card .metas-btn {
      min-height: 42px;
    }

    .metas-guide-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(170px, 1fr));
      gap: 10px;
      margin: 14px 0 16px;
    }

    .metas-guide-item {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 13px 14px;
      border-radius: 18px;
      border: 1px solid rgba(148, 163, 184, .13);
      background: rgba(15, 23, 42, .62);
    }

    .metas-guide-num {
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: rgba(34, 197, 94, .18);
      border: 1px solid rgba(74, 222, 128, .24);
      color: #bbf7d0;
      font-size: 12px;
      font-weight: 900;
      flex-shrink: 0;
    }

    .metas-guide-title {
      color: #e2e2f0;
      font-weight: 900;
      font-size: 13px;
      margin-bottom: 3px;
    }

    .metas-guide-desc {
      color: #94a3b8;
      font-size: 12px;
      line-height: 1.35;
    }

    .metas-filter-card {
      padding: 18px !important;
      border-radius: 24px !important;
    }

    .metas-filter-intro {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(148, 163, 184, .12);
    }

    .metas-filter-intro h2 {
      margin: 0 0 4px;
      font-size: 17px;
      letter-spacing: -.02em;
    }

    .metas-filter-intro p {
      margin: 0;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.45;
    }

    .metas-month-section {
      margin-bottom: 14px;
    }

    .metas-month-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 9px;
    }

    .metas-month-title strong {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .10em;
      color: #cbd5e1;
    }

    .metas-month-title span {
      font-size: 12px;
      color: #64748b;
    }

    .metas-month-bar {
      display: grid;
      grid-template-columns: repeat(12, minmax(56px, 1fr));
      gap: 7px;
      padding: 7px;
      border-radius: 18px;
      border: 1px solid rgba(148, 163, 184, .12);
      background: rgba(2, 6, 23, .38);
    }

    .metas-month-btn {
      border: 1px solid transparent;
      border-radius: 13px;
      min-height: 42px;
      background: rgba(15, 23, 42, .72);
      color: #94a3b8;
      font-size: 12px;
      font-weight: 900;
      cursor: pointer;
      transition: transform .14s ease, background .14s ease, border-color .14s ease, color .14s ease, box-shadow .14s ease;
    }

    .metas-month-btn:hover {
      color: #e2e2f0;
      background: rgba(34, 197, 94, .10);
      border-color: rgba(74, 222, 128, .22);
      transform: translateY(-1px);
    }

    .metas-month-btn.active {
      color: #ecfdf5;
      background: linear-gradient(135deg, rgba(21, 128, 61, .94), rgba(34, 197, 94, .58));
      border-color: rgba(134, 239, 172, .45);
      box-shadow: 0 10px 24px rgba(34, 197, 94, .16);
    }

    .metas-field-month-hidden {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .metas-filters {
      grid-template-columns: minmax(110px, .6fr) minmax(170px, 1fr) minmax(220px, 1.35fr) auto !important;
      align-items: end !important;
    }

    .metas-field label {
      color: #94a3b8 !important;
      font-weight: 900;
    }

    .metas-field select,
    .metas-field input {
      min-height: 42px;
      border-radius: 13px !important;
      font-size: 13px;
    }

    .metas-nav {
      padding: 10px !important;
      border: 1px solid rgba(148, 163, 184, .13) !important;
      border-radius: 22px;
      background: rgba(15, 23, 42, .48);
      gap: 18px !important;
    }

    .metas-nav-group + .metas-nav-group {
      padding-left: 18px !important;
    }

    .metas-tab {
      min-height: 42px;
      padding: 10px 13px !important;
    }

    .metas-nav-desc {
      padding: 10px 14px;
      border-radius: 16px;
      background: rgba(15, 23, 42, .46);
      border: 1px solid rgba(148, 163, 184, .10);
    }

    .metas-kpis {
      grid-template-columns: repeat(4, minmax(170px, 1fr)) !important;
    }

    .metas-card,
    .metas-table-card {
      border-radius: 24px !important;
    }

    .metas-card-label {
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 900;
    }

    .metas-card-value {
      font-size: clamp(28px, 3vw, 40px) !important;
    }

    @media (max-width: 1100px) {
      .metas-month-bar {
        grid-template-columns: repeat(6, minmax(64px, 1fr));
      }
      .metas-guide-strip,
      .metas-kpis {
        grid-template-columns: repeat(2, minmax(170px, 1fr)) !important;
      }
    }

    @media (max-width: 760px) {
      .metas-header,
      .metas-filter-intro {
        flex-direction: column;
      }
      .metas-guide-strip,
      .metas-kpis,
      .metas-filters {
        grid-template-columns: 1fr !important;
      }
      .metas-month-bar {
        grid-template-columns: repeat(3, minmax(72px, 1fr));
      }
    }
  `;

  document.head.appendChild(style);
}

function findMesField(select) {
  return select?.closest?.('.metas-field') || null;
}

function clickApply(container) {
  const apply = container.querySelector('[data-metas-apply]');
  if (apply) apply.click();
}

function ensureGuide(container) {
  const page = container.querySelector('.metas-page');
  const header = container.querySelector('.metas-header');
  if (!page || !header || page.querySelector('.metas-guide-strip')) return;

  const guide = document.createElement('div');
  guide.className = 'metas-guide-strip';
  guide.innerHTML = `
    <div class="metas-guide-item">
      <span class="metas-guide-num">1</span>
      <div><div class="metas-guide-title">Escolha o período</div><div class="metas-guide-desc">Clique no mês desejado e confirme o ano.</div></div>
    </div>
    <div class="metas-guide-item">
      <span class="metas-guide-num">2</span>
      <div><div class="metas-guide-title">Confira o avanço</div><div class="metas-guide-desc">Veja meta, realizado e quanto falta.</div></div>
    </div>
    <div class="metas-guide-item">
      <span class="metas-guide-num">3</span>
      <div><div class="metas-guide-title">Feche com segurança</div><div class="metas-guide-desc">O painel valida produção, custo e leitura antes do bônus.</div></div>
    </div>
  `;
  header.insertAdjacentElement('afterend', guide);
}

function ensureFilterIntro(filterCard) {
  if (!filterCard || filterCard.querySelector('.metas-filter-intro')) return;

  const intro = document.createElement('div');
  intro.className = 'metas-filter-intro';
  intro.innerHTML = `
    <div>
      <h2>Filtros do acompanhamento</h2>
      <p>Use o mês em botões rápidos. Estado e regional são opcionais para detalhar a análise.</p>
    </div>
    <span class="metas-pill">Atualiza ao aplicar</span>
  `;
  filterCard.prepend(intro);
}

function ensureMonthBar(container) {
  const filterCard = container.querySelector('.metas-filter-card');
  const mesSelect = container.querySelector('[data-metas-filter="mes"]');
  if (!filterCard || !mesSelect) return;

  const mesField = findMesField(mesSelect);
  if (mesField) mesField.classList.add('metas-field-month-hidden');

  let section = filterCard.querySelector('.metas-month-section');
  if (!section) {
    section = document.createElement('div');
    section.className = 'metas-month-section';
    section.innerHTML = `
      <div class="metas-month-title">
        <strong>Mês da meta</strong>
        <span>Clique em um mês para carregar o período</span>
      </div>
      <div class="metas-month-bar" role="tablist" aria-label="Selecionar mês da meta"></div>
    `;

    const filters = filterCard.querySelector('.metas-filters');
    if (filters) filterCard.insertBefore(section, filters);
    else filterCard.appendChild(section);
  }

  const bar = section.querySelector('.metas-month-bar');
  const current = Number(mesSelect.value || 0);
  bar.innerHTML = MESES.map((m) => `
    <button type="button"
            class="metas-month-btn ${Number(m.value) === current ? 'active' : ''}"
            data-metas-month-btn="${m.value}"
            role="tab"
            aria-selected="${Number(m.value) === current ? 'true' : 'false'}"
            title="${m.full}">
      ${m.label}
    </button>
  `).join('');
}

function bindMonthBar(container) {
  if (container.__metasMonthBarBound) return;
  container.__metasMonthBarBound = true;

  container.addEventListener('click', (event) => {
    const btn = event.target?.closest?.('[data-metas-month-btn]');
    if (!btn || !container.contains(btn)) return;

    const mesSelect = container.querySelector('[data-metas-filter="mes"]');
    if (!mesSelect) return;

    const value = btn.getAttribute('data-metas-month-btn');
    if (!value || String(mesSelect.value) === String(value)) return;

    mesSelect.value = value;
    mesSelect.dispatchEvent(new Event('change', { bubbles: true }));

    container.querySelectorAll('[data-metas-month-btn]').forEach((item) => {
      const active = item === btn;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    clickApply(container);
  });
}

function enhance(container) {
  const page = container.querySelector('.metas-page');
  if (!page) return;

  page.setAttribute(ENHANCED_ATTR, '1');
  ensureGuide(container);
  ensureFilterIntro(container.querySelector('.metas-filter-card'));
  ensureMonthBar(container);
  bindMonthBar(container);
}

export function initMetasLayoutLeigo(container) {
  if (!container) return;
  injectStyle();

  const run = () => requestAnimationFrame(() => enhance(container));
  run();

  if (container.__metasLayoutLeigoObserver) return;

  const observer = new MutationObserver(() => run());
  observer.observe(container, { childList: true, subtree: true });
  container.__metasLayoutLeigoObserver = observer;
}
