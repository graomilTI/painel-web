import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { installStableMultasActions } from './modules/frotas-multas-stable-actions.js';
import { installTemporaryMultasUpload } from './modules/frotas-multas-temporary-upload.js';
import './modules/frotas-multas.js?v=20260721-vencimento-indicacao';

export function renderContent(content, ctx) {
  window.FROTAS_MULTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
  installStableMultasActions(content);
  installTemporaryMultasUpload(content, supabase);
}

initProtectedPage('Frotas · Multas', renderContent);
