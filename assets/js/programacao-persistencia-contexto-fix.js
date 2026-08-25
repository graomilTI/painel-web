import { supabase } from './supabaseClient.js';

// Hotfix de persistência da Programação (21/08/2026).
//
// O programacao.js usa autosave com debounce de 450 ms. O saveRow() resolve
// programacao_id e data_referencia a partir do `state` no MOMENTO EM QUE O
// timer executa. Antes deste hotfix, clicar em "Carregar" podia trocar o
// contexto antes do timer terminar e fazer uma definição/despesa do contexto
// anterior ser gravada no dia/supervisão seguinte.
//
// Há ainda uma segunda proteção: ensureDefaultRows() do módulo principal
// promove registros existentes de SEM EMBARQUE -> OK durante o carregamento.
// Defaults devem valer somente na criação; uma decisão já salva pelo gestor
// não pode ser reclassificada ao reabrir a programação. Por isso guardamos o
// estado existente antes do load e restauramos apenas essa promoção automática
// específica, sem interferir em novos registros.

const LOAD_SELECTOR = '#progLoadContext';
const DATA_SELECTOR = '#progDataRef';
const SUP_SELECTOR = '#progSup';
const FEEDBACK_SELECTOR = '#progCtxFeedback';
const AUTOSAVE_GRACE_MS = 850;

let liberandoClique = false;
let transicaoEmAndamento = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function isTodas(value) {
  const key = norm(value);
  return !key || key === 'TODAS' || key === 'TODOS' || key.includes('TODAS SUPERVISOES');
}

function setFeedback(texto, tone = '') {
  const el = document.querySelector(FEEDBACK_SELECTOR);
  if (!el) return;
  el.textContent = texto;
  if (tone) el.dataset.tone = tone;
}

async function snapshotDefinicoes(dataReferencia, supervisao) {
  if (!dataReferencia) return [];

  let query = supabase
    .from('programacao_dia')
    .select('id,supervisao')
    .eq('data_referencia', dataReferencia);

  if (!isTodas(supervisao)) query = query.eq('supervisao', supervisao);

  const { data: dias, error: diasError } = await query;
  if (diasError) throw diasError;

  const programacaoIds = [...new Set((dias || []).map((row) => row.id).filter(Boolean))];
  if (!programacaoIds.length) return [];

  const { data, error } = await supabase
    .from('programacao_colaboradores')
    .select('programacao_id,colaborador_id,nome_colaborador,disponibilidade,observacao,placa_veiculo')
    .in('programacao_id', programacaoIds);

  if (error) throw error;
  return data || [];
}

function rowKey(row) {
  return `${row.programacao_id}:${row.colaborador_id}`;
}

async function restaurarPromocoesAutomaticas(snapshot) {
  if (!snapshot.length) return [];

  const ids = [...new Set(snapshot.map((row) => row.programacao_id).filter(Boolean))];
  const { data: atuais, error } = await supabase
    .from('programacao_colaboradores')
    .select('programacao_id,colaborador_id,disponibilidade,observacao,placa_veiculo')
    .in('programacao_id', ids);

  if (error) throw error;

  const atuaisMap = new Map((atuais || []).map((row) => [rowKey(row), row]));
  const restaurar = snapshot.filter((antes) => {
    const agora = atuaisMap.get(rowKey(antes));
    return antes.disponibilidade === 'SEM EMBARQUE' && agora?.disponibilidade === 'OK';
  });

  if (!restaurar.length) return [];

  const restaurados = [];
  for (const row of restaurar) {
    const { error: updateError } = await supabase
      .from('programacao_colaboradores')
      .update({
        disponibilidade: 'SEM EMBARQUE',
        observacao: row.observacao ?? null,
        placa_veiculo: row.placa_veiculo ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('programacao_id', row.programacao_id)
      .eq('colaborador_id', row.colaborador_id);

    if (updateError) throw updateError;
    restaurados.push(row);
  }

  return restaurados;
}

function refletirRestauradosNaTela(restaurados) {
  if (!restaurados.length) return;

  const ids = new Set(restaurados.map((row) => String(row.colaborador_id)));
  document
    .querySelectorAll('tr[data-table="programacao_colaboradores"][data-colab-id]')
    .forEach((tr) => {
      if (!ids.has(String(tr.dataset.colabId))) return;

      const field = tr.querySelector('[data-field="disponibilidade"]');
      if (field) field.value = 'SEM EMBARQUE';

      tr.querySelectorAll('.prog-tipo-btn[data-tipo]').forEach((btn) => {
        btn.classList.toggle('active', norm(btn.dataset.tipo) === 'SEM EMBARQUE');
      });

      const placa = tr.querySelector('[data-field="placa_veiculo"]');
      if (placa) placa.value = '';

      const status = tr.querySelector('.prog-status');
      if (status) {
        status.classList.remove('ok');
        status.classList.add('block');
        status.textContent = 'Bloqueado';
      }
    });
}

async function aguardarLoadPrincipal() {
  // O programacao.js publica a Promise do loadContext neste global. O clique
  // sintético abaixo é síncrono até registrar essa Promise, então basta lê-la
  // logo depois. Mantemos fallback curto para versões antigas/cacheadas.
  for (let i = 0; i < 20; i += 1) {
    const promise = window.__progLoadColaboradoresPromise;
    if (promise && typeof promise.then === 'function') {
      await promise;
      return;
    }
    await sleep(50);
  }
}

async function carregarComProtecao(btn) {
  if (transicaoEmAndamento) return;
  transicaoEmAndamento = true;

  const dataReferencia = document.querySelector(DATA_SELECTOR)?.value || '';
  const supervisao = document.querySelector(SUP_SELECTOR)?.value || '';
  let snapshot = [];

  try {
    // Deixa o debounce do contexto ATUAL terminar antes de o programacao.js
    // trocar state.dataReferencia/state.supervisao e desmontar as linhas.
    setFeedback('Salvando alterações pendentes antes de carregar...', 'warn');
    await sleep(AUTOSAVE_GRACE_MS);

    // O snapshot precisa ser feito depois do grace period: se o usuário acabou
    // de alterar o MESMO contexto, queremos preservar o valor recém-salvo, não
    // a versão anterior que ainda estava no banco ao clicar.
    snapshot = await snapshotDefinicoes(dataReferencia, supervisao);
  } catch (error) {
    console.warn('[programacao-persistencia] snapshot não disponível:', error);
  }

  try {
    liberandoClique = true;
    btn.disabled = false;
    btn.click();
  } finally {
    liberandoClique = false;
  }

  try {
    await aguardarLoadPrincipal();

    const restaurados = await restaurarPromocoesAutomaticas(snapshot);
    refletirRestauradosNaTela(restaurados);

    if (restaurados.length) {
      setFeedback(
        `${restaurados.length} definição(ões) manual(is) preservada(s).`,
        'ok',
      );
    }
  } catch (error) {
    console.error('[programacao-persistencia] falha ao proteger contexto:', error);
    setFeedback('Contexto carregado, mas houve falha ao validar a persistência.', 'error');
  } finally {
    transicaoEmAndamento = false;
  }
}

// Capture phase: roda antes do listener do programacao.js. Assim o contexto
// antigo continua ativo durante os 850 ms necessários ao autosave.
document.addEventListener(
  'click',
  (event) => {
    const target = event.target;
    const btn = target instanceof Element ? target.closest(LOAD_SELECTOR) : null;
    if (!btn || liberandoClique) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void carregarComProtecao(btn);
  },
  true,
);
