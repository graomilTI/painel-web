import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { installDailyDriverResolution } from './frotas-motorista-leitura-diaria.js';
import './modules/frotas.js';

installDailyDriverResolution(supabase);

initProtectedPage('Frotas', (content, ctx) => {
  window.FROTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
