import { initProtectedPage } from './pageInit.js';

initProtectedPage('Logística', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Logística</h3>
      <p>Página base de logística com O.S, FOB e conferência.</p>
    </article>
  `;
});
