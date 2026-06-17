import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { installSemMotoristaWindow } from './modules/frotas-multas-sem-motorista.js?v=20260615-2';
import { installStableMultasActions } from './modules/frotas-multas-stable-actions.js';
import { installTemporaryMultasUpload } from './modules/frotas-multas-temporary-upload.js';
import './modules/frotas-multas.js?v=20260617-etapas-1';

initProtectedPage('Frotas · Multas', (content, ctx) => {
  window.FROTAS_MULTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
  installStableMultasActions(content);
  installSemMotoristaWindow(content, supabase);
  installTemporaryMultasUpload(content, supabase);
});
