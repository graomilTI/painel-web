import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-rastreadores.js';

initProtectedPage('Frotas · Rastreadores', (content, ctx) => {
  window.FROTAS_RASTREADORES.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
