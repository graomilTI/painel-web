import './authGuard.js';
import './layout.js';
import './modules/dre.js';

async function bootDre() {
  const content = document.getElementById('pageContent') || document.getElementById('view') || document.body;
  const opts = {
    auth: window.auth || window.AUTH || null,
    api: window.api || window.API || null,
    supabase: window.supabaseClient || window.supabase || window.SUPABASE || null,
    onBack: () => { window.location.href = './dashboard.html'; }
  };

  if (!window.DRE || typeof window.DRE.openHome !== 'function') {
    content.innerHTML = '<div class="card"><strong>Erro ao carregar DRE.</strong><br>O módulo window.DRE.openHome não foi encontrado.</div>';
    return;
  }

  window.DRE.openHome(content, opts);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootDre);
} else {
  bootDre();
}
