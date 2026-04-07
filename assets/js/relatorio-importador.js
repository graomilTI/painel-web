
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/relatorios.js';

initProtectedPage('Importar Relatórios', (content, ctx) => {
  window.RELATORIOS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
