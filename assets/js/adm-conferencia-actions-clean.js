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

function ensureBonusMenu() {
  const tabs = document.querySelector('.conf-tabs');
  if (!tabs || tabs.querySelector('[data-conferencia-bonus]')) return;

  if (!document.getElementById('confBonusMenuStyle')) {
    const style = document.createElement('style');
    style.id = 'confBonusMenuStyle';
    style.textContent = `
      .conf-bonus-link{display:inline-flex;align-items:center;border:0;border-radius:0;background:transparent;padding:18px 16px 15px;color:#a9b8b1;font:inherit;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent;transition:color .16s ease,background .16s ease}
      .conf-bonus-link:hover{color:#d9fbe8;background:rgba(34,197,94,.035);border-bottom-color:rgba(34,229,138,.35)}
    `;
    document.head.appendChild(style);
  }

  const link = document.createElement('a');
  link.href = './conferencia-bonus.html';
  link.className = 'conf-bonus-link';
  link.dataset.conferenciaBonus = '1';
  link.textContent = 'Bônus';
  link.title = 'Produção mensal e auditoria do bônus';
  tabs.appendChild(link);
}

const observer = new MutationObserver(() => queueMicrotask(() => {
  ensureCheckAndRejectActions();
  ensureBonusMenu();
}));
observer.observe(document.body, { childList: true, subtree: true });
ensureCheckAndRejectActions();
ensureBonusMenu();
