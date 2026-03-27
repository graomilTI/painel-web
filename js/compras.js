import { initProtectedPage } from './pageInit.js';

initProtectedPage('Compras', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Compras</h3>
      <p>Página base de solicitações de compras.</p>
    </article>
  `;
});
