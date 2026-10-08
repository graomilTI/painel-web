import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/ti.js';
import { montarCartaoTokenGrm } from './ti-grm-token.js?v=20261008-token-grm';

export function renderContent(content, ctx) {
  window.TI.openIntegracoes(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
  montarCartaoTokenGrm(content, { supabase });
}

initProtectedPage('TI · Integrações', renderContent);
