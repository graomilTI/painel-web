// assets/js/modules/frotas-window.js
// Janela (modal) compartilhada pelos hubs de Frotas (Cadastros, Manutenção,
// Ocorrências). Reaproveita o modal padrão do design system (openModal/closeModal
// de core/ui.js) só trocando o tamanho do cartão — o conteúdo interno de cada
// janela é montado pelo `montar(bodyEl)` de cada hub, que por sua vez chama a
// tela antiga já existente (ex: window.FROTAS_VEICULOS.openHome(bodyEl, ctx)).

import { openModal, closeModal, esc } from '../core/ui.js';

const MODAL_ID = 'frotasWindowModal';

function onKeydown(event) {
  if (event.key === 'Escape') closeFrotasWindow();
}

export function closeFrotasWindow() {
  document.removeEventListener('keydown', onKeydown);
  closeModal(MODAL_ID);
}

export function openFrotasWindow({ titulo, montar }) {
  const overlay = openModal({
    id: MODAL_ID,
    conteudoHtml: `
      <div class="frotas-window-head">
        <h3>${esc(titulo)}</h3>
        <button class="frotas-window-close" type="button" data-frotas-window-close aria-label="Fechar">×</button>
      </div>
      <div class="frotas-window-body" data-frotas-window-body></div>
    `,
    aoFechar: () => document.removeEventListener('keydown', onKeydown),
  });

  overlay.querySelector('.ds-modal-card')?.classList.add('frotas-window-card');
  overlay.querySelector('[data-frotas-window-close]')?.addEventListener('click', closeFrotasWindow);
  document.addEventListener('keydown', onKeydown);

  const body = overlay.querySelector('[data-frotas-window-body]');
  if (body && typeof montar === 'function') {
    Promise.resolve(montar(body)).catch((error) => {
      console.error('[frotas-window] Falha ao montar janela:', error);
      body.innerHTML = `<div class="frotas-window-placeholder">Erro ao carregar esta janela: ${esc(String(error?.message || error))}.</div>`;
    });
  }

  return overlay;
}
