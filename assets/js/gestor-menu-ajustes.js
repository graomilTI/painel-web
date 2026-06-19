// Ajustes globais do menu do Gestor após mover O.S. para Programação > Distribuição.

function normalizePath(value = '') {
  return ('/' + String(value || '').replace(/^\.\//, '').replace(/^\//, '')).replace(/\/+/g, '/');
}

function patchProgramacaoPendingLink(container = document) {
  const links = [...container.querySelectorAll('a.os-pending-blocked')]
    .filter((link) => normalizePath(link.getAttribute('href') || '').includes('/programacao'));

  links.forEach((link) => {
    const target = String(link.dataset.blockTarget || '').toLowerCase();
    if (target.includes('logistica')) return;

    link.dataset.blockTarget = 'programacao#distribuicao';
    link.title = 'Existem O.S. pendentes. Abra Programação > Distribuição para verificar.';

    if (link.dataset.gestorMenuAjustado === '1') return;
    link.dataset.gestorMenuAjustado = '1';
    link.addEventListener('click', (event) => {
      const currentTarget = String(link.dataset.blockTarget || '').toLowerCase();
      if (currentTarget.includes('logistica')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = link.href;
    }, true);
  });
}

export function initGestorMenuAjustes() {
  const container = document.getElementById('sidebarMenu') || document.body;
  patchProgramacaoPendingLink(container);

  const observer = new MutationObserver(() => patchProgramacaoPendingLink(container));
  observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-block-target'] });
}
