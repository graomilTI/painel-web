import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-manutencao.js';

initProtectedPage('Frotas · Manutenção', (content, ctx) => {
  window.FROTAS_MANUTENCAO.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
