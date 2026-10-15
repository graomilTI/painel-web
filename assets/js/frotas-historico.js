import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas.js?v=20261015-frotas-carga1';

export function renderContent(content, ctx) {
  window.FROTAS.openHistorico(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
}

initProtectedPage('Frotas', renderContent);
