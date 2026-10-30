import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { abrirPlantao } from './modules/plantao/tela.js?v=20261030-plantao1';

export function renderContent(content, ctx) {
  return abrirPlantao(content, { supabase, auth: ctx });
}

initProtectedPage('Plantão', renderContent);
