import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { initMetasFechamentoValidacao } from './metasFechamentoValidacao.js';
import { initMetasLayoutLeigo } from './metasLayoutLeigo.js';
import './modules/metas.js?v=20261015-metas1';

export async function renderContent(content, ctx) {
  initMetasFechamentoValidacao(content, supabase);
  initMetasLayoutLeigo(content);

  await window.METAS.openHome(content, {
    supabase,
    api: { supabase },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => {
      window.location.href = './dre.html';
    }
  });
}

initProtectedPage('METAS', renderContent);
