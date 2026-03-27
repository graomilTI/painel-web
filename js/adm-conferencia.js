import { initProtectedPage } from './pageInit.js';

initProtectedPage('ADM Conferência', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>ADM Conferência</h3>
      <p>Página base da operação de conferência.</p>
    </article>
  `;
});
