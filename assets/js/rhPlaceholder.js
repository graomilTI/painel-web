import { initProtectedPage } from './pageInit.js';

export function bootPlaceholder({ titulo, descricao }) {
  async function renderContent(content) {
    content.innerHTML = `
      <section class="card mt-16">
        <h2>${titulo}</h2>
        <p class="meta">${descricao}</p>
        <div class="log-empty">Esta tela está em construção e será liberada em breve.</div>
      </section>
    `;
  }

  initProtectedPage(titulo, renderContent);
}
