// Frotas · Manutenção › Preventiva: lista com um veículo por linha (pela placa), com a situação dos serviços do guia
// (frotas_manutencao_vencimentos_v). Ao clicar no veículo abre o painel lateral com os serviços agrupados por sistema,
// o "+" para registrar o que foi feito (assistente em passos) e "Solicitar" para abrir a solicitação dos vencidos.
import { esc, toast } from '../core/ui.js';
import { cardFiltro, ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261030-frotas-aprovar2';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261030-frotas-aprovar2';
import * as dados from './frotas-manutencao-dados.js?v=20261030-frotas-aprovar2';
import {
  FILTROS_PREVENTIVA, categoriasDisponiveis, expandirPainel, montarLista, nomeCurto, pendentesDoVeiculo, restanteCelula,
} from './frotas-manutencao-preventiva-regras.js?v=20261030-frotas-aprovar2';
import { fmtKm, venceTexto } from './frotas-manutencao-preventiva-cards.js?v=20261030-frotas-aprovar2';
import { criarPainel } from './frotas-manutencao-preventiva-painel.js?v=20261030-frotas-aprovar2';
import { criarHistoricoPreventiva } from './frotas-manutencao-preventiva-historico.js?v=20261030-frotas-aprovar2';
import { criarSolicitacao } from './frotas-manutencao-preventiva-solicitacao.js?v=20261030-frotas-aprovar2';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_PREVENTIVA';
  // Última leitura: ao voltar para a aba a lista aparece na hora e atualiza em segundo plano.
  let cache = null;
  const PAINEL = 'fmPreventivaPainel';
  const HIST = 'fmPreventivaHistorico';
  const state = {
    supabase: null, root: null, linhas: [], planos: new Map(), filtro: 'todos', busca: '', tipo: 'servico', categoria: '',
    loading: false, ocupado: false, lista: null, painelVeiculo: null, painelRegistros: null, pendencias: [], painelSelecionados: new Set(), painelGrupo: null, categorias: [], grupos: [],
  };

  // ---------- lista ----------
  function htmlLinha(v) {
    const r = v.resumo;
    const chips = [
      r.vencida ? `<span class="fm-badge red">${r.vencida} vencida${r.vencida > 1 ? 's' : ''}</span>` : '',
      r.proxima ? `<span class="fm-badge amber">${r.proxima} próxima${r.proxima > 1 ? 's' : ''}</span>` : '',
      r.sem_historico ? `<span class="fm-badge blue">${r.sem_historico} sem histórico</span>` : '',
      r.documentos ? `<span class="fm-badge amber" title="Preventivas registradas a que faltam NF, comprovante ou envio">${r.documentos} com documento pendente</span>` : '',
      !r.vencida && !r.proxima && !r.sem_historico && !r.documentos ? '<span class="fm-badge green">Tudo em dia</span>' : '',
    ].join('');
    const u = v.maisUrgente;
    const urgente = u
      ? `<strong>${esc(nomeCurto(u.plano_nome))}</strong><span class="fm-mm">${esc(venceTexto(u))}${restanteCelula(u) ? ` · ${esc(restanteCelula(u))}` : ''}</span>`
      : '<span class="fm-mm">Nada vencido ou perto de vencer</span>';
    const pend = pendentesDoVeiculo(v, state.tipo);
    return `<div class="fm-pvl" role="button" tabindex="0" data-abrir-veic="${esc(v.veiculo_id)}">
      <div class="fm-pvl-id"><strong>${esc(v.placa)}</strong><span class="fm-mm">${esc(v.marca_modelo || '')}${v.coordenacao ? ` · ${esc(v.coordenacao)}` : ''}</span></div>
      <div class="fm-pvl-km"><span class="fm-mm">Km atual</span><strong>${esc(fmtKm(v.hodometro))}</strong></div>
      <div class="fm-pvl-chips">${chips}</div>
      <div class="fm-pvl-urg">${urgente}</div>
      <div class="fm-pvl-acoes"><button class="fm-ic-act fm-hist-btn" type="button" data-hist-prev="${esc(v.veiculo_id)}" title="Histórico de preventivas: data da última e da próxima manutenção" aria-label="Histórico de preventivas"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg></button>${pend.length ? `<button class="fm-btn ghost fm-mini" type="button" data-sol="${esc(v.veiculo_id)}"${state.ocupado ? ' disabled' : ''} title="Abre a solicitação dos serviços vencidos ou próximos">Solicitar (${pend.length})</button>` : ''}</div></div>`;
  }

  function opcoesCategoria() {
    const sel = state.root.querySelector('[data-categoria]');
    const cats = categoriasDisponiveis(state.linhas, state.tipo);
    if (state.categoria && !cats.some((c) => String(c.codigo) === state.categoria)) state.categoria = '';
    sel.innerHTML = `<option value="">Todos os sistemas</option>${cats.map((c) => `<option value="${c.codigo}"${String(c.codigo) === state.categoria ? ' selected' : ''}>${String(c.codigo).padStart(2, '0')} · ${esc(c.nome)}</option>`).join('')}`;
  }

  function render() {
    const root = state.root; if (!root) return;
    const m = montarLista(state.linhas, { tipo: state.tipo, busca: state.busca, filtro: state.filtro, categoria: state.categoria, pendencias: state.pendencias });
    state.lista = m;
    root.querySelector('[data-kpis]').innerHTML = FILTROS_PREVENTIVA.map((f) => cardFiltro({
      filtro: f.id, tone: f.tone, icone: f.icone, label: f.rotulo, dica: f.dica, ativo: f.id === state.filtro, valor: state.loading && !state.linhas.length ? '…' : String(m.contagem[f.id] ?? 0),
    })).join('');
    sincronizarCards(root, state.filtro);
    root.querySelector('[data-linhas]').innerHTML = state.loading
      ? '<div class="fm-empty">Carregando vencimentos...</div>'
      : m.veiculos.length ? m.veiculos.map(htmlLinha).join('') : '<div class="fm-empty">Nenhum veículo neste filtro.</div>';
    root.querySelector('[data-contagem]').textContent = `${m.veiculos.length} veículo(s)`;
  }

  const veiculoCompleto = (id) => montarLista(state.linhas, { tipo: 'todos', pendencias: state.pendencias }).veiculos.find((x) => x.veiculo_id === id) || null;

  // Uma ida ao banco para a lista (RPC) em paralelo com os serviços, os sistemas e as pendências de documento.
  async function lerTudo() {
    const [lista, planos, categorias, pendencias, grupos] = await Promise.all([
      dados.carregarPainelPreventiva(state.supabase).catch(() => null),
      dados.carregarPlanos(state.supabase),
      dados.carregarCategorias(state.supabase).catch(() => []),
      dados.carregarPendenciasPreventivas(state.supabase).catch(() => []),
      dados.carregarGrupos(state.supabase).catch(() => []),
    ]);
    const mapaPlanos = new Map(planos.map((p) => [p.id, p]));
    const linhas = lista
      ? expandirPainel(lista, mapaPlanos, new Map(categorias.map((c) => [c.codigo, c.nome])))
      : await dados.carregarVencimentos(state.supabase); // plano B: view paginada
    return { linhas, planos: mapaPlanos, pendencias, categorias, grupos };
  }

  async function carregar() {
    const temCache = !!state.linhas.length;
    if (!temCache) { state.loading = true; render(); }
    try {
      const r = await lerTudo();
      state.linhas = r.linhas; state.planos = r.planos; state.pendencias = r.pendencias; state.categorias = r.categorias || []; state.grupos = r.grupos || [];
      cache = r;
    } catch (err) { toast(err.message || 'Erro ao carregar as preventivas.', 'err'); if (!temCache) state.linhas = []; }
    state.loading = false; opcoesCategoria(); render(); painel.renderPainel();
  }

  // Contexto compartilhado com as janelas (cada uma é uma fábrica em seu próprio arquivo). As funções que apontam para outra janela
  // são chamadas só na hora do uso, quando todas já foram criadas.
  const ctx = { state, veiculoCompleto, carregar, render, renderPainel: () => painel.renderPainel(), abrirSolicitacao: (id) => solicitacao.abrirSolicitacao(id) };
  const painel = criarPainel(ctx);
  const historico = criarHistoricoPreventiva(ctx);
  const solicitacao = criarSolicitacao(ctx);

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.root = container;
    if (cache) { state.linhas = cache.linhas; state.planos = cache.planos; state.pendencias = cache.pendencias; }
    container.innerHTML = `${ESTILOS_MANUTENCAO}<section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn ghost" type="button" data-historico>Importar histórico</button><button class="fm-btn soft" type="button" data-atualizar>↻ Atualizar</button></div></div>
      <div class="fm-kpis" data-kpis></div>
      <div class="fm-card"><div class="fm-body"><div class="fm-bar"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar por placa, modelo, coordenação..." data-busca></div>
      <select class="fm-select" data-categoria style="width:auto"><option value="">Todos os sistemas</option></select>
      <select class="fm-select" data-tipo style="width:auto"><option value="servico">Serviços (trocas e revisões)</option><option value="verificacao">Verificações (nível, calibragem...)</option><option value="todos">Serviços e verificações</option></select>
      <span class="fm-count" data-contagem></span></div>
      <div class="fm-pvl-cab"><span>Veículo</span><span>Km</span><span>Situação</span><span>Mais urgente</span><span></span></div>
      <div class="fm-pvl-lista" data-linhas></div>
      <div class="fm-nota">Clique no veículo para ver os serviços por sistema, o vencimento de cada um e registrar o que foi feito. O vencimento usa o km do rastreador (BFleet) e o último serviço registrado. "Sem histórico" é o serviço que ainda não teve nenhuma execução registrada. O painel abre as solicitações dos vencidos sozinho (todo dia às 07h, Brasília).</div></div></div></section>`;

    container.querySelector('[data-atualizar]').addEventListener('click', carregar);
    container.querySelector('[data-historico]').addEventListener('click', async () => {
      const { abrirImportacaoHistorico } = await import('./frotas-manutencao-historico.js?v=20261030-frotas-aprovar2');
      abrirImportacaoHistorico({ supabase: state.supabase, aoConcluir: carregar });
    });
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; render(); });
    container.querySelector('[data-tipo]').addEventListener('change', (e) => { state.tipo = e.target.value; opcoesCategoria(); render(); });
    container.querySelector('[data-categoria]').addEventListener('change', (e) => { state.categoria = e.target.value; render(); });
    const lista = container.querySelector('[data-linhas]');
    lista.addEventListener('click', (e) => {
      const h = e.target.closest('[data-hist-prev]'); if (h) return historico.abrirHistoricoPreventiva(h.dataset.histPrev);
      const s = e.target.closest('[data-sol]'); if (s) { if (!s.disabled) solicitacao.abrirSolicitacao(s.dataset.sol); return; }
      const linha = e.target.closest('[data-abrir-veic]'); if (linha) painel.abrirPainel(linha.dataset.abrirVeic);
    });
    lista.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-abrir-veic]')) { e.preventDefault(); painel.abrirPainel(e.target.dataset.abrirVeic); }
    });
    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: render });
    if (state.linhas.length) { opcoesCategoria(); render(); }
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
