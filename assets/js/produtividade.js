import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/produtividade.js';

export function renderContent(content, ctx) {
  if (!window.PRODUTIVIDADE || typeof window.PRODUTIVIDADE.openHome !== 'function') {
    content.innerHTML = '<div class="card"><strong>Erro ao carregar Produtividade.</strong><br>O módulo window.PRODUTIVIDADE.openHome não foi encontrado.</div>';
    return;
  }

  window.PRODUTIVIDADE.openHome(content, {
    supabase,
    api: { supabase },
    auth: ctx,
    user: ctx?.user || null,
  });
}

initProtectedPage('Produtividade', renderContent);
