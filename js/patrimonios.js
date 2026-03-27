import { initProtectedPage } from './pageInit.js';

initProtectedPage('Patrimônios', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Patrimônios</h3>
      <p>Página base de patrimônios com pendências e relatórios.</p>
    </article>
  `;
});
