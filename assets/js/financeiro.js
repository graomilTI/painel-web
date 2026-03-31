import { initProtectedPage } from './pageInit.js';

initProtectedPage('Financeiro', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Financeiro</h3>
      <p>Página base de lançamentos e pagamentos do financeiro.</p>
    </article>
  `;
});
