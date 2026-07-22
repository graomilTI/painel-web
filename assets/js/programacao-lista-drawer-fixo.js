// Programação: lista de O.S. comprimida + painel lateral fixo.
// Mantém a lógica e o autosave dos módulos existentes; altera só a composição visual.

const DESKTOP_QUERY = window.matchMedia('(min-width: 1050px)');
let scheduled = false;

function injectFixedLayoutStyles() {
  if (document.getElementById('pldFixedLayoutStyles')) return;

  const style = document.createElement('style');
  style.id = 'pldFixedLayoutStyles';
  style.textContent = `
    @media (min-width:1050px) {
      #pldShell.pld-fixed-layout {
        display:grid !important;
        grid-template-columns:minmax(0,1fr) !important;
        gap:16px;
        align-items:start;
        width:100%;
      }
      #pldShell.pld-fixed-layout.pld-drawer-open {
        grid-template-columns:minmax(0,1fr) clamp(360px,30vw,430px) !important;
      }
      #pldShell.pld-fixed-layout .pld-list-col {
        width:100%;
        max-width:none !important;
        min-width:0;
      }
      #pldShell.pld-fixed-layout > #pldOverlayRoot.pld-fixed-side {
        position:relative !important;
        inset:auto !important;
        z-index:30 !important;
        width:100%;
        height:auto;
        min-width:0;
        pointer-events:auto !important;
        align-self:start;
      }
      #pldShell.pld-fixed-layout > #pldOverlayRoot.pld-fixed-side .pld-backdrop {
        display:none !important;
      }
      #pldShell.pld-fixed-layout > #pldOverlayRoot.pld-fixed-side .pld-drawer {
        position:sticky !important;
        top:74px !important;
        right:auto !important;
        z-index:30 !important;
        width:100% !important;
        height:auto !important;
        min-height:calc(100vh - 88px);
        max-height:calc(100vh - 88px);
        overflow-y:auto;
        transform:none !important;
        transition:none !important;
        border:1px solid rgba(52,211,153,.22);
        border-radius:16px;
        background:#081a12;
        padding:14px 16px 16px;
        box-shadow:0 16px 38px rgba(0,0,0,.28);
        scrollbar-width:thin;
        scrollbar-color:rgba(111,208,165,.35) transparent;
      }
      #pldShell.pld-fixed-layout.pld-drawer-open .pld-table thead th,
      #pldShell.pld-fixed-layout.pld-drawer-open .pld-row td {
        padding-left:9px;
        padding-right:9px;
      }
      #pldShell.pld-fixed-layout.pld-drawer-open .pld-row td {font-size:11.5px}
      #pldShell.pld-fixed-layout.pld-drawer-open .pld-cliente {
        min-width:135px;
        line-height:1.3;
      }
      #pldShell.pld-fixed-layout.pld-drawer-open .pld-local-uf {
        font-size:11px;
        line-height:1.35;
      }
      #pldShell.pld-fixed-layout.pld-drawer-open .pld-rem {font-size:11.5px}
      #pldShell.pld-fixed-layout.pld-drawer-open .pld-filters input[type="text"] {flex:1 1 100%}
      #pldShell.pld-fixed-layout.pld-drawer-open .pld-filters select {
        flex:1 1 150px;
        min-width:0;
      }
    }

    /* Cabeçalho e ações compactos, seguindo o modelo enviado. */
    #pldOverlayRoot .pld-drawer-head {gap:8px}
    #pldOverlayRoot .pld-os-title {font-size:17px}
    #pldOverlayRoot .pld-drawer-sub {
      margin:9px 0 12px;
      padding-bottom:11px;
      gap:10px;
    }
    #pldOverlayRoot .pld-sub-left {font-size:11.5px;line-height:1.4}
    #pldOverlayRoot .pld-sub-emb {font-size:10.5px}
    #pldOverlayRoot .pld-sub-rem strong {font-size:15px}
    #pldOverlayRoot .pld-section-label {margin-bottom:7px}
    #pldOverlayRoot .pld-acoes-row {
      display:grid;
      grid-template-columns:repeat(5,minmax(0,1fr));
      gap:3px;
      margin-bottom:14px;
    }
    #pldOverlayRoot .pld-acao-btn {
      width:auto;
      min-width:0;
      gap:4px;
      font-size:9px;
      line-height:1.15;
      padding:0;
    }
    #pldOverlayRoot .pld-acao-btn span.pld-acao-ico {
      width:38px;
      height:38px;
      font-size:15px;
    }
    #pldOverlayRoot .pld-acao-menu-wrap {min-width:0}

    /* Colaborador como ficha simples, sem cartão dentro de cartão. */
    #pldOverlayRoot .pld-colab-card {
      border:0;
      border-top:1px solid rgba(111,208,165,.15);
      border-radius:0;
      background:transparent;
      padding:10px 0 0;
      margin:0 0 8px;
    }
    #pldOverlayRoot .pld-colab-card .peqd-card {
      border:0 !important;
      border-radius:0 !important;
      padding:0 !important;
      background:transparent !important;
    }
    #pldOverlayRoot .pld-colab-head {margin-bottom:3px}
    #pldOverlayRoot .pld-colab-head .peqb-avatar-badge {
      width:27px;
      height:27px;
      border-radius:6px;
    }
    #pldOverlayRoot .pld-colab-nome {font-size:12px}
    #pldOverlayRoot .pld-colab-tag {font-size:9px;padding:3px 7px}

    #pldOverlayRoot .peqd-sec {
      margin-top:0 !important;
      padding:11px 0 !important;
      border-top:1px solid rgba(111,208,165,.13) !important;
    }
    #pldOverlayRoot .peqd-sec-label {margin-bottom:7px;font-size:10px}
    #pldOverlayRoot .peqd-inp {min-height:32px;font-size:11px;border-radius:7px}
    #pldOverlayRoot .peqd-chip {padding:5px 10px;font-size:11px}

    /* Estadia: tipo + destino / diárias + observação. */
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-row {
      display:grid;
      grid-template-columns:118px minmax(0,1fr);
      gap:6px;
      align-items:center;
    }
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-tipo-est,
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] [data-estadia-destino],
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-obs {
      width:100%;
      min-width:0;
      max-width:none;
      flex:none;
    }
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] [data-estadia-destino] > * {
      width:100%;
      min-width:0;
    }
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-dias {
      width:64px !important;
      min-width:64px;
      justify-self:start;
    }

    /* Deslocamento em linhas curtas e legíveis. */
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-row {
      display:grid;
      grid-template-columns:minmax(0,1fr) 92px;
      gap:6px;
      align-items:center;
    }
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-tipo-desl,
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-placa,
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-km,
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-valor,
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-obs {
      width:100%;
      min-width:0;
      max-width:none;
      flex:none;
    }
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-obs {grid-column:1 / -1}

    #pldOverlayRoot .peqd-extra-item {
      display:grid;
      grid-template-columns:minmax(0,1fr) 88px 32px;
      gap:5px;
    }
    #pldOverlayRoot .peqd-extra-tipo,
    #pldOverlayRoot .peqd-extra-desc,
    #pldOverlayRoot .peqd-extra-valor,
    #pldOverlayRoot .peqd-extra-obs {
      width:100%;
      min-width:0;
      max-width:none;
      flex:none;
    }
    #pldOverlayRoot .peqd-extra-desc {grid-column:1 / 3}
    #pldOverlayRoot .peqd-extra-obs {grid-column:1 / -1}
    #pldOverlayRoot .peqd-extra-rm {grid-column:3;grid-row:1}

    /* Adicionar colaborador fica limpo e só abre o seletor quando usado. */
    #pldOverlayRoot .pld-add-box {
      display:block;
      border:0;
      border-top:1px solid rgba(111,208,165,.15);
      background:transparent;
      border-radius:0;
      padding:11px 0 3px;
      margin:0 0 9px;
    }
    #pldOverlayRoot .pld-add-toggle {
      display:block;
      width:100%;
      border:0;
      background:transparent;
      color:#c9f7dc;
      font-size:11.5px;
      font-weight:850;
      text-align:center;
      cursor:pointer;
      padding:7px;
    }
    #pldOverlayRoot .pld-add-toggle:hover {color:#86efac}
    #pldOverlayRoot .pld-add-editor {
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:6px;
      margin-top:6px;
    }
    #pldOverlayRoot .pld-add-editor[hidden] {display:none !important}
    #pldOverlayRoot .pld-add-editor select {width:100%;min-width:0}

    #pldOverlayRoot .pld-save-row {margin-top:10px;padding-top:8px}
    #pldOverlayRoot .pld-save-btn {height:40px;font-size:12px}

    @media (max-width:1049px) {
      #pldOverlayRoot .pld-acoes-row {grid-template-columns:repeat(5,minmax(54px,1fr))}
    }
  `;

  document.head.appendChild(style);
}

function enhanceAddBoxes(root = document) {
  root.querySelectorAll('.pld-add-box:not([data-fixed-enhanced])').forEach((box) => {
    const select = box.querySelector('[data-add-colab-select]');
    const confirm = box.querySelector('[data-add-colab-confirm]');
    if (!select || !confirm) return;

    box.dataset.fixedEnhanced = '1';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pld-add-toggle';
    toggle.dataset.pldAddToggle = '1';
    toggle.textContent = '＋ Adicionar colaborador';

    const editor = document.createElement('div');
    editor.className = 'pld-add-editor';
    editor.hidden = true;
    editor.append(select, confirm);

    box.replaceChildren(toggle, editor);
  });
}

function applyFixedLayout() {
  scheduled = false;
  injectFixedLayoutStyles();

  const shell = document.getElementById('pldShell');
  const overlayRoot = document.getElementById('pldOverlayRoot');
  if (!shell || !overlayRoot) return;

  if (DESKTOP_QUERY.matches) {
    shell.classList.add('pld-fixed-layout');
    overlayRoot.classList.add('pld-fixed-side');
    if (overlayRoot.parentElement !== shell) shell.appendChild(overlayRoot);
  } else {
    shell.classList.remove('pld-fixed-layout');
    overlayRoot.classList.remove('pld-fixed-side');
    if (overlayRoot.parentElement !== document.body) document.body.appendChild(overlayRoot);
  }

  enhanceAddBoxes(overlayRoot);
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applyFixedLayout);
}

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-pld-add-toggle]');
  if (!toggle) return;

  const editor = toggle.parentElement?.querySelector('.pld-add-editor');
  if (!editor) return;

  editor.hidden = !editor.hidden;
  toggle.textContent = editor.hidden ? '＋ Adicionar colaborador' : '− Fechar seleção';
  if (!editor.hidden) editor.querySelector('select')?.focus();
});

const observer = new MutationObserver(scheduleApply);
observer.observe(document.body, { childList: true, subtree: true });
DESKTOP_QUERY.addEventListener?.('change', scheduleApply);
window.addEventListener('resize', scheduleApply, { passive: true });

scheduleApply();
