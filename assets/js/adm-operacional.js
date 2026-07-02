import { initProtectedPage } from './pageInit.js';
import './operacional-rotas-inteligentes.js?v=20260702-carona-filtros';
import './operacional-irregularidades-acoes.js?v=20260702-1430';

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
