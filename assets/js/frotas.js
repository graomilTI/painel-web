import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { installDailyDriverResolution } from './frotas-motorista-leitura-diaria.js?v=20260615d';
import { installPreviousWeekDefaults } from './frotas-periodo-semana-anterior.js?v=20260615d';
import { installIntuitiveFleetLayout } from './frotas-layout-intuitivo.js?v=20260804b';
import './modules/frotas.js?v=20260830-tabs-cleanup';

function installFleetHeaderCleanup(root = document) {
  if (root.getElementById('frotasHeaderCleanupStyles')) return;

  const style = root.createElement('style');
  style.id = 'frotasHeaderCleanupStyles';
  style.textContent = `
    .frotas-header {
      display: none !important;
    }
  `;
  root.head.appendChild(style);
}

installFleetHeaderCleanup(document);
installDailyDriverResolution(supabase);
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
