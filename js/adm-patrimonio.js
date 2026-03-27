import { initProtectedPage } from './pageInit.js';

initProtectedPage('Patrimônio ADM', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Patrimônio ADM</h3>
      <p>Página base do patrimônio administrativo.</p>
    </article>
  `;
});
