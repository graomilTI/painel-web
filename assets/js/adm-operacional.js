import { initProtectedPage } from './pageInit.js';
import './operacional-motorista-placa-patch.js?v=20260702-1810';
import './operacional-rotas-inteligentes.js?v=20260703-escassez-primeiro';
import './operacional-irregularidades-acoes.js?v=20260702-1430';
import './operacional-filtros-click-fix.js?v=20260702-1735';

initProtectedPage('Operacional ADM', (content, userContext) => {
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
});
