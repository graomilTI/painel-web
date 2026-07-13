import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

const state = {
  colaboradores: [],
  porNome: new Map(),
  selecionadosPorNome: new Map(),
  sugestoesPorLista: new WeakMap(),
  carregando: false,
  pronto: false,
};

const normalizar = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function deduplicar(rows) {
  const porChave = new Map();
  for (const row of rows || []) {
    const cpf = String(row.cpf || '').replace(/\D/g, '');
    const nome = normalizar(row.nome);
    const chave = cpf || nome || String(row.id || '');
    if (!chave || porChave.has(chave)) continue;
    porChave.set(chave, row);
  }
  return [...porChave.values()].sort((a, b) =>
    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
  );
}

async function carregarListaCompleta() {
  if (state.carregando || state.pronto) return;
  state.carregando = true;
  try {
    const rows = await getColaboradores({ somenteAtivos: true });
    state.colaboradores = deduplicar(rows);
    state.porNome.clear();
    for (const row of state.colaboradores) {
      const key = normalizar(row.nome);
      if (key && !state.porNome.has(key)) state.porNome.set(key, row);
    }
    state.pronto = true;
    document.getElementById('colabFallback')?.style.setProperty('display', 'none');
  } catch (error) {
    console.error('[hospedagem] Não foi possível carregar a lista total de colaboradores:', error);
  } finally {
    state.carregando = false;
  }
}

function buscar(termo) {
  const q = normalizar(termo);
  const lista = q
    ? state.colaboradores.filter((row) => normalizar(row.nome).includes(q))
    : state.colaboradores;
  return lista.slice(0, 80);
}

function fecharListas(exceto = null) {
  document.querySelectorAll('#colabBox .hosp-ac-list').forEach((list) => {
    if (list !== exceto) list.hidden = true;
  });
}

function renderizarSugestoes(input) {
  const wrap = input.closest('.hosp-ac');
  const list = wrap?.querySelector('.hosp-ac-list');
  if (!list) return;

  const matches = buscar(input.value);
  state.sugestoesPorLista.set(list, matches);

  if (!state.pronto && state.carregando) {
    list.innerHTML = '<div class="hosp-ac-empty">Carregando lista completa...</div>';
  } else if (!matches.length) {
    list.innerHTML = '<div class="hosp-ac-empty">Nenhum colaborador encontrado na base completa</div>';
  } else {
    list.innerHTML = matches.map((row, index) => {
      const detalhe = [row.tipo, row.supervisao, row.coordenacao].filter(Boolean).join(' · ');
      return `<div class="hosp-ac-item" data-colab-total-index="${index}">${esc(row.nome)}<small>${esc(detalhe || 'Colaborador ativo')}</small></div>`;
    }).join('');
  }

  fecharListas(list);
  list.hidden = false;
}

function selecionar(item) {
  const list = item.closest('.hosp-ac-list');
  const rowEl = item.closest('.hosp-colab-row');
  const input = rowEl?.querySelector('.colabNome');
  const tipo = rowEl?.querySelector('.colabTipo');
  const matches = state.sugestoesPorLista.get(list) || [];
  const colaborador = matches[Number(item.dataset.colabTotalIndex)];
  if (!input || !colaborador) return;

  input.value = colaborador.nome || '';
  input.dataset.colaboradorId = colaborador.id || '';
  input.dataset.colaboradorCpf = colaborador.cpf || '';
  input.dataset.colaboradorSelecionado = '1';
  if (tipo) tipo.value = colaborador.tipo || '';

  const key = normalizar(colaborador.nome);
  if (key) state.selecionadosPorNome.set(key, colaborador);
  list.hidden = true;
}

function instalarAutocompleteGlobal() {
  document.addEventListener('input', (event) => {
    const input = event.target.closest?.('#colabBox .hosp-ac-input');
    if (!input) return;
    event.stopImmediatePropagation();
    input.dataset.colaboradorSelecionado = '';
    delete input.dataset.colaboradorId;
    delete input.dataset.colaboradorCpf;
    renderizarSugestoes(input);
  }, true);

  document.addEventListener('focus', (event) => {
    const input = event.target.closest?.('#colabBox .hosp-ac-input');
    if (!input) return;
    event.stopImmediatePropagation();
    renderizarSugestoes(input);
  }, true);

  document.addEventListener('blur', (event) => {
    const input = event.target.closest?.('#colabBox .hosp-ac-input');
    if (!input) return;
    event.stopImmediatePropagation();
    setTimeout(() => {
      const list = input.closest('.hosp-ac')?.querySelector('.hosp-ac-list');
      if (list) list.hidden = true;
    }, 180);
  }, true);

  document.addEventListener('click', (event) => {
    const item = event.target.closest?.('[data-colab-total-index]');
    if (item) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selecionar(item);
      return;
    }
    if (!event.target.closest?.('#colabBox .hosp-ac')) fecharListas();
  }, true);
}

function instalarEnriquecimentoDoInsert() {
  if (supabase.__hospedagemColaboradoresTotaisPatched) return;
  const originalFrom = supabase.from.bind(supabase);

  Object.defineProperty(supabase, '__hospedagemColaboradoresTotaisPatched', {
    value: true,
    configurable: false,
    enumerable: false,
  });

  supabase.from = function patchedFrom(table) {
    const builder = originalFrom(table);
    if (table !== 'hospedagem_solicitacao_colaboradores' || typeof builder?.insert !== 'function') {
      return builder;
    }

    const originalInsert = builder.insert.bind(builder);
    builder.insert = (values, options) => {
      const array = Array.isArray(values) ? values : [values];
      const enriched = array.map((value) => {
        const key = normalizar(value?.nome_colaborador);
        const colaborador = state.selecionadosPorNome.get(key) || state.porNome.get(key);
        if (!colaborador) return value;
        return {
          ...value,
          colaborador_id: colaborador.id || value.colaborador_id || null,
          cpf: colaborador.cpf || value.cpf || null,
          tipo_colaborador: colaborador.tipo || value.tipo_colaborador || null,
          empresa: colaborador.empresa || value.empresa || null,
          coordenacao: colaborador.coordenacao || value.coordenacao || null,
          supervisao: colaborador.supervisao || value.supervisao || null,
        };
      });
      return originalInsert(Array.isArray(values) ? enriched : enriched[0], options);
    };
    return builder;
  };
}

function atualizarAjudaVisual() {
  const fallback = document.getElementById('colabFallback');
  if (fallback) {
    fallback.textContent = 'A busca considera todos os colaboradores ativos da empresa, sem limitar pela regional do gestor.';
    fallback.style.display = 'block';
    fallback.style.borderColor = 'rgba(34,197,94,.24)';
    fallback.style.background = 'rgba(34,197,94,.07)';
    fallback.style.color = '#bbf7d0';
  }
}

async function boot() {
  instalarEnriquecimentoDoInsert();
  instalarAutocompleteGlobal();
  await carregarListaCompleta();

  const iniciarTela = () => {
    if (!document.getElementById('colabBox')) return false;
    atualizarAjudaVisual();
    return true;
  };

  if (iniciarTela()) return;
  const observer = new MutationObserver(() => {
    if (iniciarTela()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

boot();
