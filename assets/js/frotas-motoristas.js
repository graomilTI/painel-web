import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-motoristas.js?v=20261029-frotas-manut63';

initProtectedPage('Frotas · Motoristas', (content, ctx) => {
  window.FROTAS_MOTORISTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
