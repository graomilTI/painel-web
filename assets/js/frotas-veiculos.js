import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { enhanceFrotasVeiculos } from './modules/frotas-veiculos-ui.js';
import { enhanceFrotasVeiculosXlsx } from './modules/frotas-veiculos-xlsx.js';
import './modules/frotas-veiculos.js';

initProtectedPage('Frotas · Veículos', (content, ctx) => {
  window.FROTAS_VEICULOS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });

  enhanceFrotasVeiculos(content, { supabase });
  enhanceFrotasVeiculosXlsx(content, { supabase });
});