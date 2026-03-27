import { initProtectedPage } from './pageInit.js';

initProtectedPage('Compras ADM', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Compras ADM</h3>
      <p>Página base para gestão das solicitações recebidas pelo setor de compras.</p>
    </article>
  `;
});
