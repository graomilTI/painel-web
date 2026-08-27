const STYLE_ID = 'metas-gestao-janelas-2026-style';
const ACTIVE_ATTR = 'data-metas-gestao-janela';

function textOf(element) {
  return String(element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .metas-gestao-nav-compact {
      display: flex !important;
      align-items: flex-end !important;
      flex-wrap: wrap;
      gap: 10px !important;
    }

    .metas-gestao-toolbar {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      margin-left: auto;
      min-width: 0;
    }

    .metas-gestao-value-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 210px;
    }

    .metas-gestao-value-field > span {
      color: #94a3b8;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .07em;
      text-transform: uppercase;
    }

    .metas-gestao-value-field input {
      width: 100% !important;
      min-height: 36px !important;
      height: 36px !important;
      padding: 7px 10px !important;
      border-radius: 11px !important;
      font-size: 12px !important;
    }

    .metas-gestao-toolbar .metas-btn,
    .metas-gestao-toolbar button {
      min-height: 36px !important;
      height: 36px !important;
      padding: 7px 12px !important;
      border-radius: 11px !important;
      white-space: nowrap;
      font-size: 12px !important;
    }

    .metas-gestao-window-nav {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 10px 0 12px;
      padding: 5px;
      border: 1px solid rgba(148, 163, 184, .14);
      border-radius: 14px;
      background: rgba(15, 23, 42, .42);
      width: fit-content;
    }

    .metas-gestao-window-btn {
      min-height: 34px;
      padding: 7px 14px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 900;
      cursor: pointer;
      transition: background .15s ease, color .15s ease, border-color .15s ease;
    }

    .metas-gestao-window-btn:hover {
      color: #e2e8f0;
      background: rgba(34, 197, 94, .08);
    }

    .metas-gestao-window-btn.active {
      color: #ecfdf5;
      border-color: rgba(74, 222, 128, .28);
      background: rgba(21, 128, 61, .24);
    }

    .metas-gestao-hidden-card {
      display: none !important;
    }

    .metas-gestao-stage-hidden {
      display: none !important;
    }

    @media (max-width: 1050px) {
      .metas-gestao-toolbar {
        width: 100%;
        margin-left: 0;
        flex-wrap: wrap;
      }

      .metas-gestao-value-field {
        flex: 1 1 240px;
      }
    }
  `;
  document.head.appendChild(style);
}

function findManagementBar(container) {
  const candidates = Array.from(container.querySelectorAll('nav, section, div'))
    .filter((element) => {
      const text = textOf(element);
      return /área de gestão/i.test(text) && /gestores/i.test(text) && /metas e fechamento/i.test(text);
    })
    .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
  return candidates[0] || null;
}

function findWorkflowCard(container, pattern) {
  return Array.from(container.querySelectorAll('.metas-work-card, section, article'))
    .find((card) => {
      const heading = card.querySelector('h1, h2, h3, .metas-work-head');
      return pattern.test(textOf(heading));
    }) || null;
}

function findButtonByText(root, pattern) {
  return Array.from(root?.querySelectorAll('button, [role="button"]') || [])
    .find((button) => pattern.test(textOf(button))) || null;
}

function moveActionToToolbar(toolbar, button, fallbackLabel) {
  if (!button) return;
  if (fallbackLabel) button.textContent = fallbackLabel;
  toolbar.appendChild(button);
}

function createWindowNav(container, anchor) {
  let nav = container.querySelector('.metas-gestao-window-nav');
  if (nav) return nav;

  nav = document.createElement('div');
  nav.className = 'metas-gestao-window-nav';
  nav.setAttribute('role', 'tablist');
  nav.innerHTML = `
    <button type="button" class="metas-gestao-window-btn active" data-metas-gestao-window="metas" role="tab" aria-selected="true">Metas</button>
    <button type="button" class="metas-gestao-window-btn" data-metas-gestao-window="despesas" role="tab" aria-selected="false">Despesas</button>
    <button type="button" class="metas-gestao-window-btn" data-metas-gestao-window="resumo" role="tab" aria-selected="false">Resumo</button>
  `;
  anchor.insertAdjacentElement('afterend', nav);
  return nav;
}

function applyWindow(container, name) {
  const cards = {
    metas: [
      findWorkflowCard(container, /conferir metas por regional/i)
    ],
    despesas: [
      findWorkflowCard(container, /conferir despesas do mês anterior/i)
    ],
    resumo: [
      findWorkflowCard(container, /resumo do fechamento/i)
    ]
  };

  Object.values(cards).flat().filter(Boolean).forEach((card) => {
    card.classList.add('metas-gestao-stage-hidden');
  });

  (cards[name] || []).filter(Boolean).forEach((card) => {
    card.classList.remove('metas-gestao-stage-hidden');
  });

  container.setAttribute(ACTIVE_ATTR, name);
  container.querySelectorAll('[data-metas-gestao-window]').forEach((button) => {
    const active = button.dataset.metasGestaoWindow === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function bindWindowNav(container) {
  if (container.__metasGestaoWindowBound) return;
  container.__metasGestaoWindowBound = true;

  container.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-metas-gestao-window]');
    if (!button || !container.contains(button)) return;
    applyWindow(container, button.dataset.metasGestaoWindow || 'metas');
  });
}

function enhance(container) {
  injectStyle();

  const managementBar = findManagementBar(container);
  const step1 = findWorkflowCard(container, /definir ou sugerir a meta do mês/i);
  if (!managementBar || !step1) return;

  managementBar.classList.add('metas-gestao-nav-compact');

  let toolbar = managementBar.querySelector('.metas-gestao-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'metas-gestao-toolbar';
    managementBar.appendChild(toolbar);
  }

  const input = step1.querySelector('input');
  if (input && !toolbar.contains(input)) {
    let field = toolbar.querySelector('.metas-gestao-value-field');
    if (!field) {
      field = document.createElement('label');
      field.className = 'metas-gestao-value-field';
      field.innerHTML = '<span>Valor estimado do mês</span>';
      toolbar.appendChild(field);
    }
    field.appendChild(input);
  }

  const suggestButton = findButtonByText(step1, /sugerir distribuição/i);
  const saveButton = findButtonByText(step1, /salvar lista/i);
  moveActionToToolbar(toolbar, suggestButton);
  moveActionToToolbar(toolbar, saveButton);

  step1.classList.add('metas-gestao-hidden-card');

  const windowNav = createWindowNav(container, managementBar);
  bindWindowNav(container);

  const activeWindow = container.getAttribute(ACTIVE_ATTR) || 'metas';
  applyWindow(container, activeWindow);

  if (windowNav.nextElementSibling === step1) {
    step1.classList.add('metas-gestao-hidden-card');
  }
}

export function initMetasGestaoJanelas2026(container = document) {
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

  if (container.__metasGestaoJanelasObserver) return;
  const observer = new MutationObserver(run);
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
  container.__metasGestaoJanelasObserver = observer;
}

const boot = () => initMetasGestaoJanelas2026(document.getElementById('pageContent') || document);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
