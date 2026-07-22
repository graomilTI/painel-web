// Ajustes finais do painel lateral de Programação.
// Complementa programacao-lista-drawer-fixo.js sem alterar a lógica de persistência.

let hotfixScheduled = false;

function injectHotfixStyles() {
  if (document.getElementById('pldUxHotfixStyles')) return;

  const style = document.createElement('style');
  style.id = 'pldUxHotfixStyles';
  style.textContent = `
    /* O título "AÇÕES" é redundante: os ícones já explicam a faixa. */
    #pldOverlayRoot .pld-drawer-sub + .pld-section-label {
      display:none !important;
    }

    /* Ações mais baixas e compactas. */
    #pldOverlayRoot .pld-acoes-row {
      margin-top:4px !important;
      margin-bottom:9px !important;
      align-items:start;
    }
    #pldOverlayRoot .pld-acao-btn {
      gap:2px !important;
      font-size:8px !important;
      line-height:1.05 !important;
    }
    #pldOverlayRoot .pld-acao-btn span.pld-acao-ico {
      width:28px !important;
      height:28px !important;
      font-size:12px !important;
    }

    /* O seletor precisa aparecer acima do botão Salvar e sem ser clipado. */
    #pldOverlayRoot .pld-add-editor {
      position:relative;
      z-index:6;
    }
    #pldOverlayRoot .pld-add-editor:not([hidden]) {
      display:grid !important;
    }
  `;

  document.head.appendChild(style);
}

function setAddEditorOpen(box, open) {
  if (!box) return false;

  const toggle = box.querySelector('[data-pld-add-toggle]');
  const editor = box.querySelector('.pld-add-editor');

  // Estrutura já aprimorada pelo arquivo programacao-lista-drawer-fixo.js.
  if (editor) {
    editor.hidden = !open;
    if (toggle) {
      toggle.textContent = open ? '− Fechar seleção' : '＋ Adicionar colaborador';
      toggle.setAttribute('aria-expanded', String(open));
    }
    if (open) {
      requestAnimationFrame(() => {
        // Quando o searchableSelect.js já transformou o select num combobox
        // pesquisável, o campo de verdade (visível e focável) é o .ssel-input;
        // o <select> original fica com display:none escondido atrás dele.
        const foco = editor.querySelector('.ssel-input, [data-add-colab-select], select');
        foco?.focus();
        editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
    return true;
  }

  // Fallback caso o clique aconteça antes do outro script reorganizar o box.
  const select = box.querySelector('[data-add-colab-select]');
  const confirm = box.querySelector('[data-add-colab-confirm]');
  if (!select || !confirm) return false;
  select.hidden = !open;
  confirm.hidden = !open;
  if (open) requestAnimationFrame(() => select.focus());
  return true;
}

function applyHotfixes() {
  hotfixScheduled = false;
  injectHotfixStyles();
}

function scheduleHotfixes() {
  if (hotfixScheduled) return;
  hotfixScheduled = true;
  requestAnimationFrame(applyHotfixes);
}

// Captura antes dos listeners antigos para impedir que o mesmo clique abra e
// feche o editor duas vezes. Esse era o motivo de "Adicionar colaborador" não
// aparentar responder em alguns renders do drawer.
document.addEventListener('click', (event) => {
  const addToggle = event.target.closest('[data-pld-add-toggle]');
  if (addToggle) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const box = addToggle.closest('.pld-add-box');
    const editor = box?.querySelector('.pld-add-editor');
    setAddEditorOpen(box, editor?.hidden !== false);
  }
}, true);

const hotfixObserver = new MutationObserver(scheduleHotfixes);
hotfixObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener('resize', scheduleHotfixes, { passive: true });

scheduleHotfixes();
