import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { initMetasFechamentoValidacao } from './metasFechamentoValidacao.js';
import './modules/metas.js';

initProtectedPage('METAS', async (content, ctx) => {
  initMetasFechamentoValidacao(content, supabase);

  await window.METAS.openHome(content, {
    supabase,
    api: { supabase },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => {
      window.location.href = './dre.html';
    }
  });
});
