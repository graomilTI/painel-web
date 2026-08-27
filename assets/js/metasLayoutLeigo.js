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

    .metas-config-workflow {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .metas-closing-actions { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; padding:16px 18px; border-bottom:1px solid rgba(148,163,184,.11); background:rgba(15,23,42,.46); }
    .metas-closing-actions h2 { margin:0; font-size:clamp(19px,2vw,25px); letter-spacing:-.035em; }
    .metas-closing-buttons { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .metas-closing-buttons .metas-btn { min-height:40px; box-shadow:none; }
    .metas-closing-buttons .metas-btn.is-active { color:#ecfdf5; border-color:rgba(74,222,128,.48); background:rgba(21,128,61,.30); }
    .metas-auditoria-btn.is-pending { color:#fef3c7 !important; border-color:rgba(250,204,21,.55) !important; background:rgba(161,98,7,.34) !important; }
    .metas-auditoria-btn.is-ready { color:#dcfce7 !important; border-color:rgba(74,222,128,.55) !important; background:rgba(21,128,61,.36) !important; }
    .metas-closing-panel[hidden] { display:none !important; }
    .metas-closing-panel { padding:16px 18px 18px; border-bottom:1px solid rgba(148,163,184,.11); }
    .metas-closing-summary .metas-section-spacer { margin:0 !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; }

    .metas-config-hero {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) auto;
      gap: 18px;
      padding: 20px;
      border-radius: 24px;
      border: 1px solid rgba(74, 222, 128, .18);
      background:
        radial-gradient(circle at top left, rgba(34, 197, 94, .16), transparent 34%),
        linear-gradient(135deg, rgba(15, 23, 42, .96), rgba(2, 6, 23, .84));
      box-shadow: 0 18px 46px rgba(0,0,0,.22);
    }

    .metas-config-hero h2 {
      margin: 0 0 7px;
      font-size: clamp(22px, 2.4vw, 30px);
      letter-spacing: -.04em;
    }

    .metas-config-hero p {
      margin: 0;
      max-width: 760px;
      color: #94a3b8;
      line-height: 1.55;
      font-size: 14px;
    }

    .metas-config-status {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      gap: 8px;
    }

    .metas-flow-stepper {
      display: grid;
      grid-template-columns: repeat(5, minmax(120px, 1fr));
      gap: 9px;
    }

    .metas-flow-step {
      display: flex;
      gap: 9px;
      align-items: center;
      padding: 11px 12px;
      border-radius: 16px;
      border: 1px solid rgba(148, 163, 184, .13);
      background: rgba(15, 23, 42, .52);
      color: #94a3b8;
      font-size: 12px;
      font-weight: 850;
    }

    .metas-flow-step strong {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: rgba(34, 197, 94, .15);
      color: #bbf7d0;
      border: 1px solid rgba(74, 222, 128, .22);
      flex-shrink: 0;
    }

    .metas-config-workflow-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }

    .metas-work-card {
      overflow: hidden;
      border-radius: 24px;
      border: 1px solid rgba(148, 163, 184, .16);
      background:
        radial-gradient(circle at top left, rgba(34, 197, 94, .07), transparent 32%),
        linear-gradient(180deg, rgba(15, 23, 42, .95), rgba(2, 6, 23, .86));
      box-shadow: 0 16px 42px rgba(0,0,0,.22);
    }

    .metas-work-card.is-primary {
      border-color: rgba(74, 222, 128, .26);
    }

    .metas-work-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      padding: 16px 18px;
      border-bottom: 1px solid rgba(148, 163, 184, .11);
      background: rgba(15, 23, 42, .46);
    }

    .metas-work-title-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .metas-work-num {
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      background: rgba(34, 197, 94, .16);
      border: 1px solid rgba(74, 222, 128, .24);
      color: #bbf7d0;
      font-weight: 950;
      flex-shrink: 0;
    }

    .metas-work-head h3 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -.02em;
    }

    .metas-work-head p {
      margin: 4px 0 0;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.45;
    }

    .metas-work-body {
      padding: 16px 18px 18px;
    }

    .metas-work-body > .metas-suggest-card {
      margin: 0;
      border: 1px solid rgba(148, 163, 184, .12);
      border-radius: 18px;
      background: rgba(2, 6, 23, .30);
    }

    .metas-work-body > .metas-table-wrap {
      border: 1px solid rgba(148, 163, 184, .10);
      border-radius: 18px;
      background: rgba(2, 6, 23, .25);
    }

    .metas-work-body > [style*="padding"] {
      padding: 0 !important;
      border-bottom: 0 !important;
    }

    .metas-work-card.is-close .metas-work-body {
      padding: 0;
    }

    .metas-work-card.is-close .metas-close-panel {
      margin: 0;
      border: 0;
      border-radius: 0;
      background:
        radial-gradient(circle at right, rgba(34, 197, 94, .16), transparent 36%),
        rgba(2, 6, 23, .18);
      padding: 20px;
    }

    .metas-work-card.is-close .metas-close-title {
      font-size: 22px;
      letter-spacing: -.03em;
    }

    .metas-work-card.is-close [data-metas-close] {
      min-height: 48px;
      padding-inline: 20px;
      font-size: 14px;
    }

    .metas-config-workflow .metas-section-spacer {
      margin: 0 !important;
      border-radius: 24px !important;
    }

    @media (max-width: 1100px) {
      .metas-month-bar {
        grid-template-columns: repeat(6, minmax(64px, 1fr));
      }
      .metas-guide-strip,
      .metas-kpis {
        grid-template-columns: repeat(2, minmax(170px, 1fr)) !important;
      }
      .metas-flow-stepper {
        grid-template-columns: repeat(2, minmax(170px, 1fr));
      }
      .metas-config-hero {
        grid-template-columns: 1fr;
      }
      .metas-config-status {
        align-items: flex-start;
      }
    }

    @media (max-width: 760px) {
      .metas-header,
      .metas-filter-intro,
      .metas-work-head {
        flex-direction: column;
      }
      .metas-guide-strip,
      .metas-kpis,
      .metas-filters,
      .metas-flow-stepper {
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
      <div><div class="metas-guide-title">Escolha o período</div><div class="metas-guide-desc">Clique no mês desejado. Ex.: Junho usa despesas de Maio.</div></div>
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
        <span>Ao escolher um mês, as despesas usadas serão sempre do mês anterior</span>
      </div>
      <div class="metas-month-bar" role="tablist" aria-label="Selecionar mês da meta"></div>
    `;

    const filters = filterCard.querySelector('.metas-filters');
    if (filters) filterCard.insertBefore(section, filters);
    else filterCard.appendChild(section);
  }

  const bar = section.querySelector('.metas-month-bar');
  const current = Number(mesSelect.value || 0);
  const selectedKey = String(current || '');

  if (bar.dataset.selectedMes === selectedKey && bar.children.length === MESES.length) return;

  bar.dataset.selectedMes = selectedKey;
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

    event.preventDefault();
    event.stopPropagation();

    const mesSelect = container.querySelector('[data-metas-filter="mes"]');
    const bar = container.querySelector('.metas-month-bar');
    if (!mesSelect) return;

    const value = btn.getAttribute('data-metas-month-btn');
    if (!value) return;

    mesSelect.value = value;
    if (bar) bar.dataset.selectedMes = String(value);
    mesSelect.dispatchEvent(new Event('change', { bubbles: true }));

    container.querySelectorAll('[data-metas-month-btn]').forEach((item) => {
      const active = item === btn;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    clickApply(container);
  });
}

function createWorkCard(num, title, desc, options = {}) {
  const card = document.createElement('section');
  card.className = `metas-work-card ${options.className || ''}`.trim();
  card.innerHTML = `
    <div class="metas-work-head">
      <div class="metas-work-title-row">
        <span class="metas-work-num">${num}</span>
        <div>
          <h3>${title}</h3>
          <p>${desc}</p>
        </div>
      </div>
      ${options.badge ? `<span class="metas-pill ${options.badgeClass || ''}">${options.badge}</span>` : ''}
    </div>
    <div class="metas-work-body"></div>
  `;
  return card;
}

function directChildByText(parent, text) {
  return Array.from(parent.children).find((el) => String(el.textContent || '').includes(text));
}

function directMetaTable(parent) {
  return Array.from(parent.children).find((el) => (
    el.classList?.contains('metas-table-wrap') &&
    el.querySelector('[data-metas-meta-row], [data-meta-field="meta_tons"]')
  ));
}

function ensureConfigWorkflow(container) {
  const content = container.querySelector('[data-metas-content]');
  if (!content || content.querySelector('.metas-config-workflow')) return;

  const sourceCard = Array.from(content.children).find((el) => (
    el.classList?.contains('metas-table-card') && el.querySelector('.metas-suggest-card')
  ));
  if (!sourceCard) return;

  const suggest = sourceCard.querySelector('.metas-suggest-card');
  const despesas = directChildByText(sourceCard, 'Despesas por Regional');
  const closePanel = sourceCard.querySelector('.metas-close-panel');
  const metasTable = directMetaTable(sourceCard);
  const resumo = Array.from(content.children).find((el) => (
    el !== sourceCard && el.classList?.contains('metas-section-spacer')
  ));

  if (!suggest || !despesas || !closePanel || !metasTable) return;

  const mesSelect = container.querySelector('[data-metas-filter="mes"]');
  const anoSelect = container.querySelector('[data-metas-filter="ano"]');
  const mes = mesSelect?.selectedOptions?.[0]?.textContent?.trim() || 'Mês';
  const ano = anoSelect?.value || new Date().getFullYear();
  const auditButton = sourceCard.querySelector('[data-metas-auditoria]');
  const auditInput = sourceCard.querySelector('[data-metas-auditoria-file]');
  const closeButton = closePanel.querySelector('[data-metas-close]');
  const saveButton = suggest.querySelector('[data-metas-save-list]');
  if (!auditButton || !auditInput || !closeButton || !saveButton) return;
  if (!closeButton.disabled) closeButton.textContent = 'Fechar Meta';

  const workflow = document.createElement('div');
  workflow.className = 'metas-config-workflow';
  workflow.innerHTML = `
    <section class="metas-work-card is-close">
      <div class="metas-closing-actions">
        <h2>Fechamento - ${mes}/${ano}</h2>
        <div class="metas-closing-buttons">
          <button class="metas-btn secondary" type="button" data-metas-closing-view="atribuir">Atribuir</button>
          <button class="metas-btn secondary" type="button" data-metas-closing-view="despesas">Despesas</button>
        </div>
      </div>
      <div class="metas-closing-panel" data-metas-closing-panel="atribuir" hidden></div>
      <div class="metas-closing-panel" data-metas-closing-panel="despesas" hidden></div>
      <div class="metas-closing-summary"></div>
    </section>
  `;

  const actions = workflow.querySelector('.metas-closing-buttons');
  actions.append(auditInput, auditButton, closeButton);
  const atribuirPanel = workflow.querySelector('[data-metas-closing-panel="atribuir"]');
  const despesasPanel = workflow.querySelector('[data-metas-closing-panel="despesas"]');
  saveButton.textContent = 'Salvar metas';
  atribuirPanel.append(saveButton, metasTable);
  despesasPanel.appendChild(despesas);
  const summary = workflow.querySelector('.metas-closing-summary');
  if (resumo) summary.appendChild(resumo);
  else summary.innerHTML = '<div class="metas-empty">O resumo será exibido após carregar ou fechar uma meta.</div>';
  workflow.querySelectorAll('[data-metas-closing-view]').forEach(button => {
    button.addEventListener('click', () => {
      const name = button.dataset.metasClosingView;
      const panel = workflow.querySelector(`[data-metas-closing-panel="${name}"]`);
      const willOpen = panel?.hasAttribute('hidden');
      workflow.querySelectorAll('[data-metas-closing-panel]').forEach(item => item.setAttribute('hidden', ''));
      workflow.querySelectorAll('[data-metas-closing-view]').forEach(item => item.classList.remove('is-active'));
      if (willOpen && panel) { panel.removeAttribute('hidden'); button.classList.add('is-active'); }
    });
  });
  content.insertBefore(workflow, sourceCard);
  sourceCard.remove();
}

function enhance(container) {
  const page = container.querySelector('.metas-page');
  if (!page) return;

  page.setAttribute(ENHANCED_ATTR, '1');
  ensureGuide(container);
  ensureFilterIntro(container.querySelector('.metas-filter-card'));
  ensureMonthBar(container);
  ensureConfigWorkflow(container);
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
