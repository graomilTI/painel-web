import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { openHome } from './modules/frotas-sinistros.js?v=20261029-frotas-inst85';

export function renderContent(content, ctx) {
  return openHome(content, { supabase, auth: ctx, user: ctx?.user || null });
}

initProtectedPage('Frotas · Sinistros', renderContent);
