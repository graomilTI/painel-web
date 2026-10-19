import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-checklists.js?v=20261019-frotas-manut38';

initProtectedPage('Frotas · Checklists', (content, ctx) => {
  window.FROTAS_CHECKLISTS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
