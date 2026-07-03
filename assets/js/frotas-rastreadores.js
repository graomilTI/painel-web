import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-rastreadores.js';
import './modules/frotas-rastreadores-bfleet-status.js';

export function renderContent(content, ctx) {
  window.FROTAS_RASTREADORES.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
}

initProtectedPage('Frotas · Rastreadores', renderContent);
