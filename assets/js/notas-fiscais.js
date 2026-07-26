// assets/js/notas-fiscais.js
// Ponto de entrada da rota (mantido no caminho legado para compatibilidade
// com notas-fiscais.html e com o router de navegação suave).
//
// A implementação vive em assets/js/modules/notas-fiscais/ seguindo o padrão
// da fundação (docs/ARQUITETURA.md): index/state/service/repository/components.
//
// Demanda 6.1: a aba "Resumo Financeiro" foi removida — o módulo tem apenas
// as janelas PENDENTES e LANÇADOS.

import { initProtectedPage } from './pageInit.js';
import { renderContent } from './modules/notas-fiscais/index.js';

export { renderContent };

initProtectedPage('Notas Fiscais', renderContent);
