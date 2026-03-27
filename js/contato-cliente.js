import { initProtectedPage } from './pageInit.js';

initProtectedPage('Contato Cliente', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Contato Cliente</h3>
      <p>Página reservada para migrar o módulo já existente.</p>
    </article>
  `;
});
