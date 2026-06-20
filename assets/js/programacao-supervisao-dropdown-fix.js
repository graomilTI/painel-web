// Ajuste visual seguro para o campo Supervisão na Programação.
// O select original continua existindo e recebendo o valor, mas fica oculto.
// A seleção visível passa a ser uma lista própria, 100% opaca, para evitar o menu translúcido do navegador.

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function injectSupervisaoDropdownFixStyles() {
  if (document.getElementById('programacaoSupervisaoDropdownFixStyles')) return;

  const style = document.createElement('style');
  style.id = 'programacaoSupervisaoDropdownFixStyles';
  style.textContent = `
    .prog-tfield-sup {
      position: relative !important;
      z-index: 12000 !important;
      overflow: visible !important;
    }

    #progSup.prog-sup-native-hidden,
    .prog-tfield-sup > #progSup.prog-sup-native-hidden {
      display: none !important;
    }

    .prog-sup-combo {
      position: relative !important;
      width: 100% !important;
      z-index: 12001 !important;
    }

    .prog-sup-button {
      width: 100% !important;
      min-height: 38px !important;
      border-radius: 11px !important;
      border: 1px solid rgba(52, 211, 153, .45) !important;
      background: #020617 !important;
      background-color: #020617 !important;
      color: #f8fafc !important;
      box-shadow: 0 10px 26px rgba(0,0,0,.42) !important;
      padding: 8px 38px 8px 11px !important;
      text-align: left !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      cursor: pointer !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      position: relative !important;
    }

    .prog-sup-button::after {
      content: '▾';
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #86efac;
      font-size: 13px;
    }

    .prog-sup-button[aria-expanded="true"] {
      border-color: rgba(134, 239, 172, .78) !important;
      box-shadow: 0 0 0 3px rgba(52,211,153,.14), 0 18px 44px rgba(0,0,0,.48) !important;
    }

    .prog-sup-menu {
      position: absolute !important;
      top: calc(100% + 7px) !important;
      left: 0 !important;
      right: 0 !important;
      max-height: 314px !important;
      overflow-y: auto !important;
      z-index: 12002 !important;
      padding: 6px !important;
      border-radius: 14px !important;
      border: 1px solid rgba(52, 211, 153, .48) !important;
      background: #020617 !important;
      background-color: #020617 !important;
      color: #f8fafc !important;
      opacity: 1 !important;
      box-shadow: 0 24px 70px rgba(0,0,0,.88) !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    .prog-sup-menu[hidden] {
      display: none !important;
    }

    .prog-sup-option {
      display: block !important;
      width: 100% !important;
      border: 0 !important;
      border-radius: 10px !important;
      background: #020617 !important;
      background-color: #020617 !important;
      color: #f8fafc !important;
      text-align: left !important;
      padding: 10px 11px !important;
      font-size: 13px !important;
      font-weight: 750 !important;
      line-height: 1.25 !important;
      cursor: pointer !important;
      opacity: 1 !important;
    }

    .prog-sup-option:hover,
    .prog-sup-option.active {
      background: #064e3b !important;
      background-color: #064e3b !important;
      color: #ffffff !important;
    }

    .prog-sup-option.placeholder {
      color: #94a3b8 !important;
      font-style: italic !important;
    }

    .prog-toolbar.prog-sup-combo-open .prog-toolbar-row-steps,
    .prog-toolbar.prog-sup-combo-open #progSteps,
    .prog-toolbar.prog-sup-combo-open #progCtxFeedback {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}

function buildMenu(select, combo) {
  const menu = combo.querySelector('.prog-sup-menu');
  if (!menu) return;

  const options = [...select.options];
  menu.innerHTML = options.map((option, index) => {
    const value = option.value || '';
    const label = option.textContent || value || 'Selecione...';
    const active = String(value) === String(select.value || '');
    return `<button type="button" class="prog-sup-option ${active ? 'active' : ''} ${value ? '' : 'placeholder'}" data-index="${index}">${escapeHtml(label)}</button>`;
  }).join('');

  menu.querySelectorAll('.prog-sup-option').forEach((item) => {
    item.addEventListener('click', () => {
      const option = select.options[Number(item.dataset.index)];
      if (!option) return;
      select.value = option.value || '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncCombo(select, combo);
      closeCombo(combo);
    });
  });
}

function syncCombo(select, combo) {
  const button = combo.querySelector('.prog-sup-button');
  if (!button) return;
  const selected = select.options[select.selectedIndex];
  button.textContent = selected?.textContent || 'Selecione...';
  buildMenu(select, combo);
}

function closeCombo(combo) {
  const menu = combo?.querySelector('.prog-sup-menu');
  const button = combo?.querySelector('.prog-sup-button');
  const toolbar = combo?.closest('.prog-toolbar');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
  if (toolbar) toolbar.classList.remove('prog-sup-combo-open');
}

function openCombo(select, combo) {
  buildMenu(select, combo);
  const menu = combo.querySelector('.prog-sup-menu');
  const button = combo.querySelector('.prog-sup-button');
  const toolbar = combo.closest('.prog-toolbar');
  if (menu) menu.hidden = false;
  if (button) button.setAttribute('aria-expanded', 'true');
  if (toolbar) toolbar.classList.add('prog-sup-combo-open');
}

function bindSupervisaoDropdownFix() {
  const select = document.getElementById('progSup');
  if (!select || select.dataset.dropdownFixBound === '1') return;

  select.dataset.dropdownFixBound = '1';
  select.classList.add('prog-sup-native-hidden');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  const combo = document.createElement('div');
  combo.className = 'prog-sup-combo';
  combo.innerHTML = `
    <button type="button" class="prog-sup-button" aria-expanded="false">Selecione...</button>
    <div class="prog-sup-menu" hidden></div>
  `;
  select.insertAdjacentElement('afterend', combo);

  const button = combo.querySelector('.prog-sup-button');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const menu = combo.querySelector('.prog-sup-menu');
    if (menu && !menu.hidden) closeCombo(combo);
    else openCombo(select, combo);
  });

  select.addEventListener('change', () => syncCombo(select, combo));

  const observer = new MutationObserver(() => syncCombo(select, combo));
  observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.prog-sup-combo')) closeCombo(combo);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCombo(combo);
  });

  syncCombo(select, combo);
}

function initSupervisaoDropdownFix() {
  injectSupervisaoDropdownFixStyles();

  const tryBind = () => {
    bindSupervisaoDropdownFix();
    if (document.getElementById('progSup')?.dataset.dropdownFixBound === '1') {
      clearInterval(timer);
    }
  };

  const timer = setInterval(tryBind, 250);
  tryBind();
  setTimeout(() => clearInterval(timer), 12000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupervisaoDropdownFix, { once: true });
} else {
  initSupervisaoDropdownFix();
}
