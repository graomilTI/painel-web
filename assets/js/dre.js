import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/dre.js';

initProtectedPage('DRE', (content, ctx) => {
  window.DRE.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
