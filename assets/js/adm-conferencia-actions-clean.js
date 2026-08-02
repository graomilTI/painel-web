// Garante o padrão único de ações ✓ | X também quando o filtro exibe
// registros já conferidos. O clique em ✓ reaproveita a proteção de
// reautorização existente na tela.
const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function ensureCheckAndRejectActions() {
  document.querySelectorAll('.conf-row-actions').forEach((actions) => {
    actions.querySelectorAll('button[data-action="EM_ANALISE"]').forEach((button) => button.remove());

    let approve = actions.querySelector('button[data-action="CONFERIDO"]');
    const reject = actions.querySelector('button[data-action="PENDENCIA"]');

    if (!approve && reject) {
      approve = document.createElement('button');
      approve.type = 'button';
      approve.className = 'conf-btn conf-btn-primary conf-row-icon-btn';
      approve.dataset.action = 'CONFERIDO';
      approve.dataset.id = reject.dataset.id || '';
      approve.title = 'Conferir';
      approve.setAttribute('aria-label', 'Conferir');
      approve.innerHTML = CHECK_SVG;
      actions.insertBefore(approve, reject);
    }

    if (reject) {
      reject.title = 'Recusar';
      reject.setAttribute('aria-label', 'Recusar');
    }
  });
}

const observer = new MutationObserver(() => queueMicrotask(ensureCheckAndRejectActions));
observer.observe(document.body, { childList: true, subtree: true });
ensureCheckAndRejectActions();
