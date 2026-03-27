import { initProtectedPage } from './pageInit.js';

initProtectedPage('Dashboard', (content, userContext) => {
  content.innerHTML = `
    <div class="grid-cards">
      <article class="card">
        <h3>Usuário atual</h3>
        <p><strong>Nome:</strong> ${userContext.user.name}</p>
        <p><strong>Email:</strong> ${userContext.user.email || '-'}</p>
        <p><strong>Perfil:</strong> ${userContext.user.role}</p>
      </article>
      <article class="card">
        <h3>Setor</h3>
        <p>${userContext.department?.name || 'Não definido'}</p>
      </article>
      <article class="card">
        <h3>Módulos liberados</h3>
        <p>${(userContext.modules || []).length}</p>
      </article>
    </div>
    <article class="card mt-16">
      <h3>Ambiente inicial</h3>
      <p>Login, menu dinâmico e proteção de páginas já estão prontos.</p>
    </article>
  `;
});
