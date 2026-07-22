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
        grid-template-columns:minmax(0,1fr) clamp(310px,24vw,345px) !important;
        gap:12px;
        align-items:start;
        width:100%;
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
        display:block !important;
        width:100% !important;
        height:auto !important;
        min-height:calc(100vh - 88px);
        max-height:calc(100vh - 88px);
        overflow-y:auto;
        transform:none !important;
        transition:none !important;
        border:1px solid rgba(52,211,153,.22);
        border-radius:14px;
        background:#081a12;
        padding:12px 13px 14px;
        box-shadow:0 14px 32px rgba(0,0,0,.25);
        scrollbar-width:thin;
        scrollbar-color:rgba(111,208,165,.35) transparent;
      }
      #pldShell.pld-fixed-layout .pld-table thead th,
      #pldShell.pld-fixed-layout .pld-row td {
        padding-left:9px;
        padding-right:9px;
      }
      #pldShell.pld-fixed-layout .pld-row td {font-size:11.5px}
      #pldShell.pld-fixed-layout .pld-cliente {
        min-width:130px;
        line-height:1.3;
      }
      #pldShell.pld-fixed-layout .pld-local-uf {
        font-size:11px;
        line-height:1.35;
      }
      #pldShell.pld-fixed-layout .pld-rem {font-size:11.5px}
      #pldShell.pld-fixed-layout .pld-filters input[type="text"] {flex:1 1 100%}
      #pldShell.pld-fixed-layout .pld-filters select {
        flex:1 1 150px;
        min-width:0;
      }
    }

    /* Estado permanente antes de selecionar uma O.S. */
    #pldOverlayRoot .pld-fixed-empty {
      min-height:calc(100vh - 120px);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:9px;
      padding:26px 15px;
      text-align:center;
      color:#789588;
    }
    #pldOverlayRoot .pld-fixed-empty-icon {
      width:42px;
      height:42px;
      border-radius:12px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:1px solid rgba(111,208,165,.22);
      background:rgba(34,197,94,.08);
      color:#86efac;
      font-size:20px;
    }
    #pldOverlayRoot .pld-fixed-empty strong {color:#d8eee3;font-size:13px}
    #pldOverlayRoot .pld-fixed-empty span {max-width:230px;font-size:11.5px;line-height:1.45}

    /* Cabeçalho e ações compactos. */
    #pldOverlayRoot .pld-drawer-head {gap:7px}
    #pldOverlayRoot .pld-os-title {font-size:16px}
    #pldOverlayRoot .pld-drawer-sub {
      margin:8px 0 11px;
      padding-bottom:10px;
      gap:8px;
    }
    #pldOverlayRoot .pld-sub-left {font-size:11px;line-height:1.4}
    #pldOverlayRoot .pld-sub-emb {font-size:10px}
    #pldOverlayRoot .pld-sub-rem strong {font-size:14px}
    #pldOverlayRoot .pld-section-label {margin-bottom:6px}
    #pldOverlayRoot .pld-acoes-row {
      display:grid;
      grid-template-columns:repeat(5,minmax(0,1fr));
      gap:2px;
      margin-bottom:12px;
    }
    #pldOverlayRoot .pld-acao-btn {
      width:auto;
      min-width:0;
      gap:3px;
      font-size:8.5px;
      line-height:1.15;
      padding:0;
    }
    #pldOverlayRoot .pld-acao-btn span.pld-acao-ico {
      width:34px;
      height:34px;
      font-size:14px;
    }
    #pldOverlayRoot .pld-acao-menu-wrap {min-width:0}

    /* Colaborador como ficha simples, com recolhimento individual. */
    #pldOverlayRoot .pld-colab-card {
      border:0;
      border-top:1px solid rgba(111,208,165,.15);
      border-radius:0;
      background:transparent;
      padding:9px 0 0;
      margin:0 0 7px;
    }
    #pldOverlayRoot .pld-colab-card .peqd-card {
      border:0 !important;
      border-radius:0 !important;
      padding:0 !important;
      background:transparent !important;
    }
    #pldOverlayRoot .pld-colab-head {margin-bottom:3px;gap:6px}
    #pldOverlayRoot .pld-colab-head .peqb-avatar-badge {
      width:25px;
      height:25px;
      border-radius:6px;
    }
    #pldOverlayRoot .pld-colab-nome {font-size:11.5px}
    #pldOverlayRoot .pld-colab-tag {font-size:8.5px;padding:3px 6px}
    #pldOverlayRoot .pld-colab-collapse {
      width:22px;
      height:22px;
      flex:0 0 22px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:0;
      border-radius:6px;
      background:transparent;
      color:#86efac;
      font-size:15px;
      line-height:1;
      cursor:pointer;
      transition:transform .15s ease,background .15s ease;
    }
    #pldOverlayRoot .pld-colab-collapse:hover {background:rgba(111,208,165,.1)}
    #pldOverlayRoot .pld-colab-card.pld-colab-collapsed .pld-colab-collapse {transform:rotate(-90deg)}
    #pldOverlayRoot .pld-colab-card.pld-colab-collapsed > .peqd-card {display:none !important}

    #pldOverlayRoot .peqd-sec {
      margin-top:0 !important;
      padding:10px 0 !important;
      border-top:1px solid rgba(111,208,165,.13) !important;
    }
    #pldOverlayRoot .peqd-sec-label {margin-bottom:6px;font-size:9.5px}
    #pldOverlayRoot .peqd-inp {min-height:31px;font-size:10.5px;border-radius:7px}
    #pldOverlayRoot .peqd-chip {padding:5px 9px;font-size:10.5px}

    /* Estadia: tipo + destino / diárias + observação. */
    #pldOverlayRoot .peqd-sec[data-sec="estadia"] .peqd-row {
      display:grid;
      grid-template-columns:108px minmax(0,1fr);
      gap:5px;
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
      width:58px !important;
      min-width:58px;
      justify-self:start;
    }

    /* Deslocamento em linhas curtas e legíveis. */
    #pldOverlayRoot .peqd-sec[data-sec="deslocamento"] .peqd-row {
      display:grid;
      grid-template-columns:minmax(0,1fr) 84px;
      gap:5px;
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
      grid-template-columns:minmax(0,1fr) 80px 30px;
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
      padding:10px 0 3px;
      margin:0 0 8px;
    }
    #pldOverlayRoot .pld-add-toggle {
      display:block;
      width:100%;
      border:0;
      background:transparent;
      color:#c9f7dc;
      font-size:11px;
      font-weight:850;
      text-align:center;
      cursor:pointer;
      padding:7px;
    }
    #pldOverlayRoot .pld-add-toggle:hover {color:#86efac}
    #pldOverlayRoot .pld-add-editor {
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:5px;
      margin-top:5px;
    }
    #pldOverlayRoot .pld-add-editor[hidden] {display:none !important}
    #pldOverlayRoot .pld-add-editor select {width:100%;min-width:0}

    #pldOverlayRoot .pld-save-row {margin-top:9px;padding-top:7px}
    #pldOverlayRoot .pld-save-btn {height:38px;font-size:11.5px}

    @media (max-width:1049px) {
      #pldOverlayRoot .pld-acoes-row {grid-template-columns:repeat(5,minmax(54px,1fr))}
      #pldOverlayRoot .pld-fixed-empty {display:none}
    }
  `;

  document.head.appendChild(style);
}

function fixedPlaceholderHtml() {
  return `
    <div class="pld-fixed-empty" data-pld-fixed-placeholder>
      <div class="pld-fixed-empty-icon">▤</div>
      <strong>Programação da O.S.</strong>
      <span>Selecione uma O.S. na lista para visualizar ou editar os colaboradores e despesas.</span>
    </div>
  `;
}

function ensureDesktopPanel(shell, overlayRoot) {
  const backdrop = overlayRoot.querySelector('#pldBackdrop');
  const drawer = overlayRoot.querySelector('#pldDrawer');
  if (!drawer) return;

  if (backdrop) {
    backdrop.hidden = true;
    backdrop.classList.remove('show');
  }

  drawer.hidden = false;
  drawer.classList.add('open');
  shell.classList.add('pld-panel-permanent');

  if (!drawer.innerHTML.trim()) drawer.innerHTML = fixedPlaceholderHtml();
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

function enhanceCollaboratorCards(root = document) {
  root.querySelectorAll('.pld-colab-card:not([data-collapse-enhanced])').forEach((card) => {
    const head = card.querySelector(':scope > .pld-colab-head');
    const name = head?.querySelector('.pld-colab-nome');
    const body = card.querySelector(':scope > .peqd-card');
    if (!head || !name || !body) return;

    card.dataset.collapseEnhanced = '1';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pld-colab-collapse';
    button.dataset.pldColabCollapse = '1';
    button.setAttribute('aria-expanded', 'true');
    button.title = 'Minimizar despesas';
    button.textContent = '⌄';
    name.insertAdjacentElement('afterend', button);
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
    ensureDesktopPanel(shell, overlayRoot);
  } else {
    shell.classList.remove('pld-fixed-layout', 'pld-panel-permanent');
    overlayRoot.classList.remove('pld-fixed-side');
    const placeholder = overlayRoot.querySelector('[data-pld-fixed-placeholder]');
    if (placeholder) placeholder.remove();
    if (overlayRoot.parentElement !== document.body) document.body.appendChild(overlayRoot);
  }

  enhanceAddBoxes(overlayRoot);
  enhanceCollaboratorCards(overlayRoot);
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applyFixedLayout);
}

document.addEventListener('click', (event) => {
  const collapse = event.target.closest('[data-pld-colab-collapse]');
  if (collapse) {
    event.preventDefault();
    event.stopPropagation();
    const card = collapse.closest('.pld-colab-card');
    if (!card) return;

    const collapsed = card.classList.toggle('pld-colab-collapsed');
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.title = collapsed ? 'Expandir despesas' : 'Minimizar despesas';
    return;
  }

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