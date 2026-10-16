import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { installStableMultasActions } from './modules/frotas-multas-stable-actions.js?v=20261016-frotas-manut2';
import { installTemporaryMultasUpload } from './modules/frotas-multas-temporary-upload.js';
import { installMultasFluxo } from './modules/frotas-multas-fluxo.js?v=20261016-frotas-manut2';
import './modules/frotas-multas.js?v=20261016-frotas-manut2';

export function renderContent(content, ctx) {
  window.FROTAS_MULTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
  installStableMultasActions(content);
  installTemporaryMultasUpload(content, supabase);
  installMultasFluxo(content);
}

initProtectedPage('Frotas · Multas', renderContent);
