// Ajuste visual seguro para o select nativo de Supervisão na Programação.
// Em vez de deixar o navegador desenhar o menu suspenso por cima das etapas,
// o próprio select vira temporariamente uma lista opaca com altura controlada.

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
      padding: 10px 12px !important;
    }

    #progSup option:checked,
    #progSup option:hover {
      background: #064e3b !important;
      background-color: #064e3b !important;
      color: #ffffff !important;
    }

    #progSup.prog-sup-listbox-open {
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      top: 22px !important;
      width: 100% !important;
      min-width: 320px !important;
      height: auto !important;
      min-height: 306px !important;
      max-height: 306px !important;
      overflow-y: auto !important;
      z-index: 12001 !important;
      border-radius: 14px !important;
      border: 1px solid rgba(52, 211, 153, .45) !important;
      box-shadow: 0 24px 70px rgba(0, 0, 0, .86) !important;
      background: #020617 !important;
      background-color: #020617 !important;
      outline: none !important;
    }

    .prog-toolbar.prog-sup-listbox-active .prog-toolbar-row-steps,
    .prog-toolbar.prog-sup-listbox-active #progSteps,
    .prog-toolbar.prog-sup-listbox-active #progCtxFeedback {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    @media(max-width: 900px) {
      #progSup.prog-sup-listbox-open {
        min-width: 0 !important;
        max-height: 286px !important;
        min-height: 286px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function bindSupervisaoDropdownFix() {
  const sup = document.getElementById('progSup');
  if (!sup || sup.dataset.dropdownFixBound === '1') return;

  sup.dataset.dropdownFixBound = '1';
  const field = sup.closest('.prog-tfield-sup');
  const toolbar = sup.closest('.prog-toolbar');
  if (!field || !toolbar) return;

  let closeTimer = null;
  let openedByFix = false;

  const openListbox = () => {
    clearTimeout(closeTimer);
    const totalOptions = Math.max(2, sup.options?.length || 2);
    const visibleRows = Math.min(Math.max(totalOptions, 6), 8);
    openedByFix = true;
    toolbar.classList.add('prog-sup-listbox-active');
    field.classList.add('prog-sup-listbox-field');
    sup.classList.add('prog-sup-listbox-open');
    sup.size = visibleRows;
    sup.focus({ preventScroll: true });
  };

  const closeListbox = (delay = 120) => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      openedByFix = false;
      sup.size = 1;
      sup.classList.remove('prog-sup-listbox-open');
      field.classList.remove('prog-sup-listbox-field');
      toolbar.classList.remove('prog-sup-listbox-active');
    }, delay);
  };

  sup.addEventListener('mousedown', (event) => {
    if (sup.classList.contains('prog-sup-listbox-open')) return;
    event.preventDefault();
    openListbox();
  });

  sup.addEventListener('pointerdown', (event) => {
    if (sup.classList.contains('prog-sup-listbox-open')) return;
    event.preventDefault();
    openListbox();
  });

  sup.addEventListener('focus', () => {
    if (!openedByFix && !sup.classList.contains('prog-sup-listbox-open')) return;
    openListbox();
  });

  sup.addEventListener('change', () => closeListbox(80));
  sup.addEventListener('blur', () => closeListbox(160));
  sup.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeListbox(20);
      sup.blur();
    }
    if (event.key === 'Enter' || event.key === 'Tab') closeListbox(20);
  });

  document.addEventListener('mousedown', (event) => {
    if (event.target !== sup) closeListbox(20);
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
