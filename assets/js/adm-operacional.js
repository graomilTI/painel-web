import { initProtectedPage } from './pageInit.js';
import './operacional-motorista-placa-patch.js?v=20260703-fix-fetch-url';
import './operacional-rotas-inteligentes.js?v=20260703-rota-estendida-sutil';
import './operacional-irregularidades-acoes.js?v=20260702-1430';
import './operacional-filtros-click-fix.js?v=20260702-1735';

export function renderContent(content, userContext) {
  if (window.OPERACIONAL?.openHome) {
    window.OPERACIONAL.openHome(content, { userContext });
    return;
  }

  content.innerHTML = `
    <article class="card">
      <h3>Operacional ADM</h3>
      <p>Não foi possível carregar o módulo operacional.</p>
    </article>
  `;
}

initProtectedPage('Operacional ADM', renderContent);
