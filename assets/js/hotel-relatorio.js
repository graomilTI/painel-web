import { initProtectedPage } from './pageInit.js';
import { renderContent } from './hotel-relatorio-v2.js';

export { renderContent };

initProtectedPage('Relatórios de Hospedagem', renderContent);
