/* assets/js/modules/relatorios.js */
// Ponto de entrada da importação de relatórios (carregado por assets/js/relatorio-importador.js).
// Em 15/10/2026 o conteúdo antigo (um bloco autoexecutável de ~3.900 linhas) foi dividido em módulos
// relatorios-*.js: planilha → um módulo por tipo de relatório (colaboradores, financeiro, frotas, operacional,
// produção, hospedagem) / upload / detecção / estilos → tela. Este arquivo só publica a API em window.
import { openHome } from './relatorios-tela.js?v=20261015-relatorios1';

window.RELATORIOS = { openHome };
