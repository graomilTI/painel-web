import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/dashboard-socio.js';

initProtectedPage('Dashboard do Sócio', (content, ctx) => {
  if (!window.DASHBOARD_SOCIO || typeof window.DASHBOARD_SOCIO.openHome !== 'function') {
    content.innerHTML = '<div class="card"><strong>Erro ao carregar o Dashboard do Sócio.</strong><br>O módulo window.DASHBOARD_SOCIO.openHome não foi encontrado.</div>';
    return;
  }

  window.DASHBOARD_SOCIO.openHome(content, {
    supabase,
    api: { supabase },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => {
      window.location.href = './dashboard.html';
    }
  });
});
