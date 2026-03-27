import { initProtectedPage } from './pageInit.js';

initProtectedPage('Hospedagem', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Hospedagem</h3>
      <p>Página base de solicitações de hospedagem do gestor.</p>
    </article>
  `;
});
