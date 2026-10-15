/* assets/js/modules/metas.js
 * Módulo Diretoria > METAS
 * Padrão do projeto: IIFE + window.METAS.openHome(container, { auth, api, onBack })
 *
 * Regras oficiais:
 * - Produção usada para bater meta = relatorio_resultado_diario.toneladas
 * - A base é o Relatório Resultado Diário: Coordenação, Data e Toneladas
 * - Não usar o snapshot, embarcado nem total_embarcado_mais_teste
 */
// Em 15/10/2026 o conteúdo (um bloco autoexecutável de ~3.300 linhas) foi dividido em módulos metas-*.js:
// util → cálculo / estilos → render / dados → bônus → fechamento → eventos → tela. Este arquivo só publica a API em window.
import { openHome } from './metas-tela.js?v=20261015-metas1';

window.METAS = {
    openHome
  };
