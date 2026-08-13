import './gestor-mobile-modules.js';

const MAX = 768;

function clean(v) {
  return String(v || '').replace(/[↕↑↓⇅▲▼]/g, '').replace(/\s+/g, ' ').trim();
}

function enhanceEpiTable() {
  if (!document.body.classList.contains('mobile-gestor-mode') || window.innerWidth > MAX) return;
  document.querySelectorAll('.epi-table').forEach((table) => {
    const headers = [...table.querySelectorAll('thead th')].map((th) => clean(th.innerText || th.textContent));
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (td.tagName !== 'TD' || Number(td.colSpan || 1) > 1 || td.dataset.label) return;
        if (headers[i]) td.dataset.label = headers[i];
      });
    });
  });
}

if (!document.getElementById('gestorMobileEpiStyles')) {
  const style = document.createElement('style');
  style.id = 'gestorMobileEpiStyles';
  style.textContent = `
    @media(max-width:${MAX}px){
      body.mobile-gestor-mode .epi-filter-tabs,
      body.mobile-gestor-mode .epi-filter-tabs-group{display:grid!important;grid-template-columns:1fr 1fr!important;width:100%!important;gap:8px!important}
      body.mobile-gestor-mode .epi-filter-tabs .btn{width:100%!important;min-height:44px!important;margin:0!important;padding:8px 6px!important}
      body.mobile-gestor-mode .epi-table-wrap{overflow:visible!important;border:0!important}
      body.mobile-gestor-mode .epi-table{min-width:0!important;width:100%!important}
      body.mobile-gestor-mode .epi-table thead{display:none!important}
      body.mobile-gestor-mode .epi-table,
      body.mobile-gestor-mode .epi-table tbody,
      body.mobile-gestor-mode .epi-table tr,
      body.mobile-gestor-mode .epi-table td{display:block!important;width:100%!important;box-sizing:border-box!important}
      body.mobile-gestor-mode .epi-table tr{margin-bottom:12px!important;border:1px solid rgba(45,212,160,.16)!important;border-radius:17px!important;overflow:hidden!important;background:rgba(3,18,12,.58)!important}
      body.mobile-gestor-mode .epi-table td{padding:10px 12px!important;border-bottom:1px solid rgba(45,212,160,.09)!important}
      body.mobile-gestor-mode .epi-table td:last-child{border-bottom:0!important}
      body.mobile-gestor-mode .epi-table td[data-label]::before{content:attr(data-label);display:block;margin-bottom:5px;color:#6fa589;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      body.mobile-gestor-mode .epi-table td[colspan]::before{display:none!important}
      body.mobile-gestor-mode .epi-acoes{display:grid!important;grid-template-columns:1fr 1fr!important}
      body.mobile-gestor-mode .epi-acoes .btn{width:100%!important;min-height:44px!important;margin:0!important}
      body.mobile-gestor-mode #epiGestorRefresh{width:100%!important;min-height:44px!important}
    }
  `;
  document.head.appendChild(style);
}

let raf = 0;
function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(enhanceEpiTable);
}
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', schedule, { passive: true });
schedule();
