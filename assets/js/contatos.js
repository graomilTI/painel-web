import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/contatos.js?v=20260512-google-job-real-v1';

export function renderContent(content, ctx) {
  window.CONTATOS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
}

initProtectedPage('Contatos', renderContent);
