import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/contatos.js';

initProtectedPage('Contatos', (content, ctx) => {
  window.CONTATOS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
