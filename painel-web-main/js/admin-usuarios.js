import { initProtectedPage } from './pageInit.js';

initProtectedPage('Usuários e Acessos', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Usuários e Acessos</h3>
      <p>Página base para gestão de usuários, perfis e permissões.</p>
    </article>
  `;
});
