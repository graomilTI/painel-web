import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { installDailyDriverResolution } from './frotas-motorista-leitura-diaria.js?v=20260615d';
import './modules/frotas.js?v=20261016-frotas-hist1';

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

export function renderContent(content, ctx) {
  window.FROTAS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
}

initProtectedPage('Frotas', renderContent);
