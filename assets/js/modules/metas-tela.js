// Metas — abertura da tela (openHome) e estado inicial.
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.
import { getSupabaseClient } from './metas-util.js?v=20261015-metas1';
import { injectStyle } from './metas-estilos.js?v=20261015-metas1';
import { loadData } from './metas-dados.js?v=20261015-metas1';
import { render } from './metas-render.js?v=20261015-metas1';
import { bindEvents } from './metas-eventos.js?v=20261015-metas1';

  const DEFAULT_STATE = {
    loading: false,
    ano: new Date().getFullYear(),
    mes: new Date().getMonth() + 1,
    estado: '',
    regional: '',
    tab: 'geral',
    regionais: [],
    estados: [],
    mensal: [],
    metasCadastro: [],
    producaoCoordenacoes: [],
    metaEstimativa: '',
    erro: null,
    gestores: [],
    gestoresEditId: null,
    custosRegional: [],
    auditoria: []
  };

  async function openHome(container, opts) {
    injectStyle();

    const options = opts || {};
    const supabase = getSupabaseClient(options.supabase || options.api);

    if (!container) {
      console.error('[METAS] Container não informado.');
      return;
    }

    if (!supabase || typeof supabase.from !== 'function') {
      container.innerHTML = `
        <div class="metas-page">
          <div class="metas-error">
            <strong>Cliente Supabase não encontrado.</strong><br>
            O módulo METAS precisa receber api.supabase, api.client, window.supabaseClient, window.supabase ou window.sb.
          </div>
        </div>
      `;
      return;
    }

    const state = Object.assign({}, DEFAULT_STATE, {
      ano: Number(options.ano || DEFAULT_STATE.ano),
      mes: Number(options.mes || DEFAULT_STATE.mes)
    });

    render(container, state);
    bindEvents(container, state, supabase, options);

    await loadData(state, supabase);
    render(container, state);
    bindEvents(container, state, supabase, options);
  }

export { openHome };
