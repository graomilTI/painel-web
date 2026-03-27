import { initProtectedPage } from './pageInit.js';

initProtectedPage('Programação', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Programação</h3>
      <p>Página base da Programação do Gestor. Próximo passo: conectar o formulário ao banco.</p>
    </article>
  `;
});
