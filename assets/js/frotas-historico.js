import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas.js?v=20260918-fora-horario-acoes';

export function renderContent(content, ctx) {
  window.FROTAS.openHistorico(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
}

initProtectedPage('Frotas', renderContent);
