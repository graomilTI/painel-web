import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-checklists.js?v=20261020-frotas-manut44';

initProtectedPage('Frotas · Checklists', (content, ctx) => {
  window.FROTAS_CHECKLISTS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
