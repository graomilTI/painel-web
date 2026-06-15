import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { installOneTimeMultasXlsx } from './modules/frotas-multas-one-time-xlsx.js';
import './modules/frotas-multas.js';

initProtectedPage('Frotas · Multas', (content, ctx) => {
  window.FROTAS_MULTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
  installOneTimeMultasXlsx(content, supabase);
});
