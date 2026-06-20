// Ajuste visual seguro para o select nativo de Supervisão na Programação.
// Mantém o select original, mas esconde a linha de etapas enquanto a lista está aberta/focada,
// evitando que os botões apareçam por trás do dropdown nativo do navegador.

function injectSupervisaoDropdownFixStyles() {
  if (document.getElementById('programacaoSupervisaoDropdownFixStyles')) return;

  const style = document.createElement('style');
  style.id = 'programacaoSupervisaoDropdownFixStyles';
  style.textContent = `
    #progSup,
    .prog-tfield-sup select {
      background: #020617 !important;
      background-color: #020617 !important;
      background-image: linear-gradient(#020617, #020617) !important;
      color: #f8fafc !important;
      opacity: 1 !important;
      color-scheme: dark !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    #progSup option,
    #progSup optgroup {
      background: #020617 !important;
      background-color: #020617 !important;
      color: #f8fafc !important;
      opacity: 1 !important;
      text-shadow: none !important;
    }

    #progSup option:checked,
    #progSup option:hover {
      background: #064e3b !important;
      background-color: #064e3b !important;
      color: #ffffff !important;
    }

    .prog-toolbar.prog-sup-dropdown-open .prog-toolbar-row-steps,
    .prog-toolbar.prog-sup-dropdown-open:has(#progSup:focus) .prog-toolbar-row-steps {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      margin-top: 12px !important;
      padding-top: 12px !important;
    }

    .prog-toolbar.prog-sup-dropdown-open #progSteps,
    .prog-toolbar.prog-sup-dropdown-open #progCtxFeedback {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}

function bindSupervisaoDropdownFix() {
  const sup = document.getElementById('progSup');
  if (!sup || sup.dataset.dropdownFixBound === '1') return;

  sup.dataset.dropdownFixBound = '1';
  const toolbar = sup.closest('.prog-toolbar');
  if (!toolbar) return;

  let closeTimer = null;
  const open = () => {
    clearTimeout(closeTimer);
    toolbar.classList.add('prog-sup-dropdown-open');
  };
  const close = (delay = 180) => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => toolbar.classList.remove('prog-sup-dropdown-open'), delay);
  };

  sup.addEventListener('pointerdown', open);
  sup.addEventListener('mousedown', open);
  sup.addEventListener('focus', open);
  sup.addEventListener('click', open);
  sup.addEventListener('change', () => close(80));
  sup.addEventListener('blur', () => close(180));
  sup.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Tab' || event.key === 'Enter') close(60);
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target !== sup) close(60);
  }, true);
}

function initSupervisaoDropdownFix() {
  injectSupervisaoDropdownFixStyles();
  bindSupervisaoDropdownFix();

  const observer = new MutationObserver(() => bindSupervisaoDropdownFix());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupervisaoDropdownFix, { once: true });
} else {
  initSupervisaoDropdownFix();
}
