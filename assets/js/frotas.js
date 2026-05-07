import { initProtectedPage } from './pageInit.js';
import './modules/frotas.js';

initProtectedPage('Frotas · Excesso de Velocidade', (content, userContext) => {
  if (window.FROTAS?.openHome) {
    window.FROTAS.openHome(content, { userContext, auth: userContext });
    return;
  }

  content.innerHTML = `
    <article class="card">
      <h3>Frotas</h3>
      <p>Não foi possível carregar o módulo de Frotas.</p>
    </article>
  `;
});
