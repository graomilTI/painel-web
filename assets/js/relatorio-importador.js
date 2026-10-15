
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/relatorios.js?v=20261015-relatorios1';
import * as painelCache from './painelCache.js';

export function renderContent(content, ctx) {
  window.RELATORIOS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null,
    cache: painelCache
  });
}

initProtectedPage('Importar Relatórios', renderContent);
