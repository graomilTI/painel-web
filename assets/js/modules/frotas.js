/* assets/js/modules/frotas.js */
// Ponto de entrada do módulo Frotas (carregado por frotas.js, frotas-historico.js e frotas-ocorrencias.js).
// Em 14/10/2026 o conteúdo antigo (um bloco autoexecutável de ~4.100 linhas) foi dividido em módulos
// frotas-*.js por camada: base → ocr → colaboradores → excessos → fora do horário (util, mapa, dossiê,
// dados) → upload de prints → histórico → tela de excesso. Este arquivo só publica a API em window.
import { MODULE_NAME } from './frotas-base.js?v=20261015-frotas-dos1';
import { renderHistoricoFrotas } from './frotas-historico-tela.js?v=20261015-frotas-dos1';
import { renderExcessoVelocidade } from './frotas-excesso-velocidade.js?v=20261015-frotas-dos1';

function renderHome(container, opts = {}) { renderExcessoVelocidade(container, opts); }
window[MODULE_NAME] = window[MODULE_NAME] || {};
window[MODULE_NAME].openHome = renderHome;
window[MODULE_NAME].openHistorico = renderHistoricoFrotas;
window.ADM_MODULES = window.ADM_MODULES || {};
window.ADM_MODULES.frotas = { mount: renderHome };
