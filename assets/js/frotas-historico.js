import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas.js';

export function renderContent(content, ctx) {
  window.FROTAS.openHistorico(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
}

initProtectedPage('Frotas', renderContent);
