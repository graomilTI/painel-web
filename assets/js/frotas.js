import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { installDailyDriverResolution } from './frotas-motorista-leitura-diaria.js?v=20260615d';
import { installPrintDriverValidation } from './frotas-validacao-condutor-print.js?v=20260615a';
import { installPreviousWeekDefaults } from './frotas-periodo-semana-anterior.js?v=20260615d';
import { installIntuitiveFleetLayout } from './frotas-layout-intuitivo.js?v=20260804a';
import './modules/frotas.js';

installDailyDriverResolution(supabase);
installPrintDriverValidation(supabase);
installPreviousWeekDefaults(document, supabase);
installIntuitiveFleetLayout(document);

export function renderContent(content, ctx) {
  window.FROTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
}

initProtectedPage('Frotas', renderContent);
