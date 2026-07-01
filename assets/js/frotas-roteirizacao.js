import { initProtectedPage } from './pageInit.js';
import './operacional.js';

initProtectedPage('Mapa de Direcionamento', (content, ctx) => {
  window.OPERACIONAL.openHome(content, { userContext: ctx });
});
