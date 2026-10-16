import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-checklists.js?v=20261016-frotas-manut22';

initProtectedPage('Frotas · Checklists', (content, ctx) => {
  window.FROTAS_CHECKLISTS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
