import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/dre.js';

initProtectedPage('DRE', (content, ctx) => {
  if (!window.DRE || typeof window.DRE.openHome !== 'function') {
    content.innerHTML = '<div class="empty-state"><h2>DRE indisponível</h2><p>O módulo DRE não foi carregado corretamente.</p></div>';
    return;
  }

  window.DRE.openHome(content, {
    supabase,
    api: { supabase },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => {
      window.location.href = './dashboard.html';
    }
  });
});
