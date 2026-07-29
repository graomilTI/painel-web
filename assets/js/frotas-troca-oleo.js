import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-troca-oleo.js';

initProtectedPage('Frotas · Troca de Óleo', (content, ctx) => {
  window.FROTAS_TROCA_OLEO.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
