import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas.js';

initProtectedPage('Frotas · Multas', (content, ctx) => {
  window.FROTAS.openMultas(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
