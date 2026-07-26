// assets/js/modules/notas-fiscais/state.js
// Estado da página de Notas Fiscais (padrão docs/ARQUITETURA.md).

import { createState } from '../../core/state.js';

export const nfState = createState({
  status: 'loading',          // loading | ok | error | empty
  erro: null,
  itens: [],
  pagamentos: {},
  janela: 'pendentes',        // pendentes | lancados (demanda 6.1: sem Resumo Financeiro)
  busca: '',
  ordenacao: { coluna: 'comprado_em', asc: false },
  pagina: 1,
  porPagina: 25,
  atualizadoEm: null,
  duracaoMs: null,
});
