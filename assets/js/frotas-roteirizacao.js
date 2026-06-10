import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-roteirizacao.js';

initProtectedPage('Frotas · Roteirização', (content, ctx) => {
  window.FROTAS_ROTEIRIZACAO.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
