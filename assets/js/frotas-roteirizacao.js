import { initProtectedPage } from './pageInit.js';
import './operacional.js';

export function renderContent(content, ctx) {
  window.OPERACIONAL.openHome(content, { userContext: ctx });
}

initProtectedPage('Mapa de Direcionamento', renderContent);
