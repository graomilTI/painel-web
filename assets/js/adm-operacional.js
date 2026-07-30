import { initProtectedPage } from './pageInit.js';
// Mapa Operacional simplificado (2026-07-30): só O.S. Atender + rotas, ver operacional.js.
// Os patches antigos (placa por motorista, carona/custo, irregularidades, filtros de camadas
// removidas) só faziam sentido em cima das abas/camadas retiradas do mapa — removidos junto.
import './operacional.js?v=20260730-mapa-simplificado1';

export function renderContent(content, userContext) {
  if (window.OPERACIONAL?.openHome) {
    window.OPERACIONAL.openHome(content, { userContext });
    return;
  }

  content.innerHTML = `
    <article class="card">
      <h3>Operacional ADM</h3>
      <p>Não foi possível carregar o módulo operacional.</p>
    </article>
  `;
}

initProtectedPage('Operacional ADM', renderContent);
