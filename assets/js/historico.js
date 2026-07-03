import { initProtectedPage } from './pageInit.js';

export function renderContent(content) {
  content.innerHTML = `
    <article class="card">
      <h3>Histórico Geral</h3>
      <p>Área preparada para exibir o histórico consolidado do sistema.</p>
    </article>
  `;
}

initProtectedPage('Histórico Geral', renderContent);
