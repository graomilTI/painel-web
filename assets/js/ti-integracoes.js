import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/ti.js';

export function renderContent(content, ctx) {
  window.TI.openIntegracoes(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
}

initProtectedPage('TI · Integrações', renderContent);
