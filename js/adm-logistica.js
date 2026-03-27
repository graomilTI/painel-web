import { initProtectedPage } from './pageInit.js';

initProtectedPage('Logística ADM', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Logística ADM</h3>
      <p>Página base da logística administrativa.</p>
    </article>
  `;
});
