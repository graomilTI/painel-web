// Frotas · Manutenção › Preventiva: lista com um veículo por linha (pela placa), com a situação dos serviços do guia
// (frotas_manutencao_vencimentos_v). Ao clicar no veículo abre o painel lateral com os serviços agrupados por sistema,
// o "+" para registrar o que foi feito (assistente em passos) e "Solicitar" para abrir a solicitação dos vencidos.
import { closeModal, dataBR, esc, openModal, toast } from '../core/ui.js';
import { cardFiltro, ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261029-frotas-manut69';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261029-frotas-manut69';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-manut69';
import {
  FILTROS_PREVENTIVA, categoriasDisponiveis, expandirPainel, filtrarServicos, grupoDoServico, gruposDoPainel, montarLista, nomeCurto, pendenciasDoRegistro, pendentesDoVeiculo, restanteCelula,
} from './frotas-manutencao-preventiva-regras.js?v=20261029-frotas-manut69';
import { fmtKm, htmlCardServico, venceTexto } from './frotas-manutencao-preventiva-cards.js?v=20261029-frotas-manut69';
import { htmlIconeGrupo } from './frotas-manutencao-seletor.js?v=20261029-frotas-manut69';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_PREVENTIVA';
  // Última leitura: ao voltar para a aba a lista aparece na hora e atualiza em segundo plano.
  let cache = null;
  const PAINEL = 'fmPreventivaPainel';
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
      <div class="fm-pvl-acoes"><button class="fm-btn soft fm-mini" type="button" data-reg="${esc(v.veiculo_id)}" title="Registrar o que foi feito neste veículo">+ Registrar</button>${pend.length ? `<button class="fm-btn ghost fm-mini" type="button" data-sol="${esc(v.veiculo_id)}"${state.ocupado ? ' disabled' : ''} title="Abre a solicitação dos serviços vencidos ou próximos">Solicitar (${pend.length})</button>` : ''}</div></div>`;
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

  // ---------- painel lateral do veículo ----------
  // Preventivas já registradas do veículo, com a situação do pagamento e o botão para lançar/completar (Pagamento e NF).
  function htmlRegistros() {
    const regs = state.painelRegistros || [];
    if (!regs.length) return '';
    const sit = regs.map(pendenciasDoRegistro);
    const pedeAtencao = sit.filter((x) => x.id === 'pendente').length;
    return `<details class="fm-prev-grupo"${pedeAtencao ? ' open' : ''}><summary><span>Registros feitos</span><span class="fm-badge">${regs.length}</span>${pedeAtencao ? `<span class="fm-badge amber">${pedeAtencao} com pendência</span>` : ''}</summary>
      ${regs.map((r, i) => `<div class="fm-reg"><div class="fm-reg-main"><strong>${esc(r.data_execucao ? dataBR(r.data_execucao) : '—')} · ${esc(fmtKm(r.km_execucao))}</strong><span class="fm-mm">${esc(String(r.descricao || '').replace(/^Preventiva registrada: /, '') || 'Preventiva')}</span>
        <span class="fm-faltas">${sit[i].itens.length ? sit[i].itens.map((x) => `<span class="fm-badge amber">${esc(x.texto)}</span>`).join('') : `<span class="fm-badge ${sit[i].tom}">${esc(sit[i].texto)}</span>`}</span></div>
        <div class="fm-reg-fim"><button class="fm-btn ${sit[i].id === 'pendente' ? 'primary' : 'soft'} fm-mini" type="button" data-pagamento="${esc(r.id)}">${sit[i].id === 'pendente' ? 'Completar' : 'Pagamento e NF'}</button></div></div>`).join('')}</details>`;
  }

  function renderPainel() {
    const ov = document.getElementById(PAINEL); if (!ov || !state.painelVeiculo) return;
    const v = veiculoCompleto(state.painelVeiculo);
    const corpo = ov.querySelector('[data-painel]');
    if (!v) { corpo.innerHTML = '<div class="fm-empty">Veículo não encontrado.</div>'; return; }
    const exibidos = v.servicos; // serviços e verificações: tudo entra, agrupado pelo sistema
    const cont = (st) => exibidos.filter((s) => s.status === st).length;
    const pend = pendentesDoVeiculo({ servicos: exibidos }, 'todos');
    corpo.innerHTML = `<div class="fm-orc-cab"><div class="fm-mod-head"><div><h3>${esc(v.placa)}</h3><p>${esc(v.marca_modelo || '')}${v.coordenacao ? ` · ${esc(v.coordenacao)}` : ''} · Km atual ${esc(fmtKm(v.hodometro))}</p></div><button class="fm-x" type="button" data-fechar-painel aria-label="Fechar">✕</button></div>
      <div class="fm-pvl-chips" style="margin:10px 0 0">${cont('vencida') ? `<span class="fm-badge red">${cont('vencida')} vencida(s)</span>` : ''}${cont('proxima') ? `<span class="fm-badge amber">${cont('proxima')} próxima(s)</span>` : ''}${cont('em_dia') ? `<span class="fm-badge green">${cont('em_dia')} em dia</span>` : ''}${cont('sem_historico') ? `<span class="fm-badge blue">${cont('sem_historico')} sem histórico</span>` : ''}</div></div>
      <div class="fm-nova-corpo">
        <div class="fm-sel-acoes"><span class="fm-mm">Escolha o grupo e toque nos serviços feitos; depois use Registrar.</span><button type="button" class="fm-link" data-sel-limpar>Limpar seleção</button></div>
        <div class="fm-pick-grade" data-grupos-prev aria-label="Grupos do guia"></div>
        <div class="fm-prev-grupo" data-grupo-aberto hidden></div>
        ${htmlRegistros()}
      </div>
      <div class="fm-nova-rodape"><div class="fm-nova-info"></div><div class="fm-nova-acoes"><button class="fm-btn primary" type="button" data-reg-painel>+ Registrar</button>${pend.length ? `<button class="fm-btn ghost" type="button" data-sol-painel${state.ocupado ? ' disabled' : ''}>Solicitar (${pend.length})</button>` : ''}</div></div>`;
    renderGrupos();
  }

  // Serviços do painel: todos os do veículo (verificações só quando ligadas ou já marcadas) ou só os do grupo aberto.
  function servicosDoPainel(soGrupo = false) {
    const v = veiculoCompleto(state.painelVeiculo);
    const lista = v ? filtrarServicos(v.servicos, { verificacoes: true, selecionados: state.painelSelecionados }) : [];
    return soGrupo && state.painelGrupo != null ? lista.filter((s) => grupoDoServico(s, { categorias: state.categorias }) === state.painelGrupo) : lista;
  }

  function atualizarBotaoRegistrar() {
    const botao = document.querySelector(`#${PAINEL} [data-reg-painel]`); if (!botao) return;
    const n = state.painelSelecionados.size;
    botao.textContent = n ? `+ Registrar (${n})` : '+ Registrar';
  }

  const ICONE_PENDENTES = '<span class="fm-pick-ic" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M11 6h10M11 12h10M11 18h10"/></svg></span>';

  // Grade de ícones dos grupos (como na Corretiva): clicar abre os serviços do grupo abaixo, clicar de novo fecha, outro ícone troca.
  function renderGrupos() {
    const grade = document.querySelector(`#${PAINEL} [data-grupos-prev]`); if (!grade) return;
    const grupos = gruposDoPainel(servicosDoPainel(), { categorias: state.categorias, grupos: state.grupos });
    if (state.painelGrupo != null && !grupos.some((g) => g.codigo === state.painelGrupo)) state.painelGrupo = null;
    const marcadosDe = (cod) => servicosDoPainel().filter((x) => grupoDoServico(x, { categorias: state.categorias }) === cod && state.painelSelecionados.has(x.plano_id)).length;
    grade.innerHTML = grupos.length ? grupos.map((g) => {
      const n = marcadosDe(g.codigo);
      const aberto = state.painelGrupo === g.codigo;
      return `<div class="fm-pick-gr pg-${esc(g.status)}${aberto ? ' aberto' : ''}${n ? ' tem' : ''}" data-pgr="${g.codigo}"><button type="button" class="fm-pick-gt" data-pgrupo="${g.codigo}" aria-expanded="${aberto}" title="${esc(g.nome)} · ${g.total} serviço(s)" aria-label="${esc(g.nome)}">${htmlIconeGrupo(g.codigo)}<b>${n || ''}</b></button></div>`;
    }).join('') : '<div class="fm-empty">Nenhum serviço neste veículo.</div>';
    // Ícone próprio ao lado dos grupos: marca de uma vez as vencidas e próximas (sem outra solicitação em andamento).
    const pendentes = servicosDoPainel().filter((x) => ['vencida', 'proxima'].includes(x.status) && !x.em_andamento);
    if (grupos.length) {
      grade.insertAdjacentHTML('beforeend', `<div class="fm-pick-gr fm-pick-sel${pendentes.length ? ' tem' : ''}"><button type="button" class="fm-pick-gt" data-sel-pendentes${pendentes.length ? '' : ' disabled'} title="${pendentes.length ? `Selecionar as ${pendentes.length} vencidas e próximas` : 'Nenhum serviço vencido ou próximo'}" aria-label="Selecionar vencidas e próximas">${ICONE_PENDENTES}<b>${pendentes.length || ''}</b></button></div>`);
    }
    renderCards();
  }

  function renderCards() {
    const caixa = document.querySelector(`#${PAINEL} [data-grupo-aberto]`);
    if (caixa) {
      const g = state.painelGrupo != null ? gruposDoPainel(servicosDoPainel(), { categorias: state.categorias, grupos: state.grupos }).find((x) => x.codigo === state.painelGrupo) : null;
      caixa.hidden = !g;
      if (g) {
        const lista = servicosDoPainel(true);
        caixa.innerHTML = `<div class="fm-pick-gc-cab">${htmlIconeGrupo(g.codigo)}<strong>${esc(g.nome)}</strong><span class="fm-mm">${lista.length} serviço(s)</span></div><div class="fm-svc-grid" data-cards>${lista.map((s) => htmlCardServico(s, state.planos.get(s.plano_id) || {}, state.painelSelecionados.has(s.plano_id))).join('')}</div>`;
      } else caixa.innerHTML = '';
    }
    atualizarBotaoRegistrar();
  }

  // Contadores dos ícones (serviços marcados por grupo) sem refazer a janela.
  function atualizarContadores() {
    for (const gr of document.querySelectorAll(`#${PAINEL} [data-pgr]`)) {
      const cod = Number(gr.dataset.pgr);
      const n = servicosDoPainel().filter((x) => grupoDoServico(x, { categorias: state.categorias }) === cod && state.painelSelecionados.has(x.plano_id)).length;
      gr.classList.toggle('tem', n > 0);
      gr.querySelector('b').textContent = n || '';
    }
    atualizarBotaoRegistrar();
  }

  // Uma ida ao banco para a lista (RPC) em paralelo com os serviços, os sistemas e as pendências de documento.
  async function lerTudo() {
    const [painel, planos, categorias, pendencias, grupos] = await Promise.all([
      dados.carregarPainelPreventiva(state.supabase).catch(() => null),
      dados.carregarPlanos(state.supabase),
      dados.carregarCategorias(state.supabase).catch(() => []),
      dados.carregarPendenciasPreventivas(state.supabase).catch(() => []),
      dados.carregarGrupos(state.supabase).catch(() => []),
    ]);
    const mapaPlanos = new Map(planos.map((p) => [p.id, p]));
    const linhas = painel
      ? expandirPainel(painel, mapaPlanos, new Map(categorias.map((c) => [c.codigo, c.nome])))
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
    state.loading = false; opcoesCategoria(); render(); renderPainel();
  }

  async function carregarRegistros(veiculoId) {
    try { state.painelRegistros = await dados.carregarRegistrosPreventivos(state.supabase, veiculoId); } catch { state.painelRegistros = []; }
    if (state.painelVeiculo === veiculoId) renderPainel();
  }

  async function abrirPagamentoDe(veiculoId, registroId) {
    const registro = (state.painelRegistros || []).find((r) => r.id === registroId); if (!registro) return;
    const { abrirPagamento } = await import('./frotas-manutencao-preventiva-pagamento.js?v=20261029-frotas-manut69');
    await abrirPagamento({ supabase: state.supabase, registro, placa: veiculoCompleto(veiculoId)?.placa || '', aoConcluir: async () => { await carregar(); await carregarRegistros(veiculoId); } });
  }

  function abrirPainel(veiculoId) {
    state.painelVeiculo = veiculoId; state.painelRegistros = null; state.painelSelecionados = new Set(); state.painelGrupo = null;
    const ov = openModal({ id: PAINEL, conteudoHtml: '<div data-painel></div>', aoFechar: () => { state.painelVeiculo = null; } });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    renderPainel(); carregarRegistros(veiculoId);
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-fechar-painel]')) return closeModal(PAINEL);
      const gr = e.target.closest('[data-pgrupo]');
      if (gr) {
        const cod = Number(gr.dataset.pgrupo);
        state.painelGrupo = state.painelGrupo === cod ? null : cod; // segundo clique fecha; outro ícone troca
        renderGrupos();
        document.querySelector(`#${PAINEL} [data-pgr="${cod}"] [data-pgrupo]`)?.focus({ preventScroll: true });
        return;
      }
      const card = e.target.closest('[data-card]');
      if (card) {
        const id = card.dataset.card; const marcado = !state.painelSelecionados.has(id);
        if (marcado) state.painelSelecionados.add(id); else state.painelSelecionados.delete(id);
        card.classList.toggle('sel', marcado); card.setAttribute('aria-pressed', marcado ? 'true' : 'false'); atualizarContadores();
        return;
      }
      if (e.target.closest('[data-sel-pendentes]')) {
        servicosDoPainel().filter((s) => ['vencida', 'proxima'].includes(s.status) && !s.em_andamento).forEach((s) => state.painelSelecionados.add(s.plano_id));
        return renderGrupos();
      }
      if (e.target.closest('[data-sel-limpar]')) { state.painelSelecionados.clear(); return renderGrupos(); }
      const pag = e.target.closest('[data-pagamento]'); if (pag) return abrirPagamentoDe(veiculoId, pag.dataset.pagamento);
      if (e.target.closest('[data-reg-painel]')) return registrar(veiculoId, [...state.painelSelecionados]);
      if (e.target.closest('[data-sol-painel]')) abrirSolicitacao(veiculoId);
    });
  }

  async function registrar(veiculoId, planosIniciais = []) {
    const v = veiculoCompleto(veiculoId); if (!v) return;
    const { abrirRegistro } = await import('./frotas-manutencao-preventiva-registro.js?v=20261029-frotas-manut69');
    await abrirRegistro({ supabase: state.supabase, veiculo: v, planos: state.planos, planosIniciais, aoConcluir: async () => { state.painelSelecionados = new Set(); await carregar(); if (state.painelVeiculo === veiculoId) await carregarRegistros(veiculoId); } });
  }

  // ---------- Solicitar ----------
  async function abrirSolicitacao(veiculoId) {
    const v = veiculoCompleto(veiculoId); if (!v || state.ocupado) return;
    const pend = pendentesDoVeiculo({ servicos: v.servicos.filter((s) => s.tipo === 'servico') }, 'servico'); if (!pend.length) return;
    state.ocupado = true; render(); renderPainel();
    try {
      const id = await dados.solicitar(state.supabase, {
        veiculo_id: veiculoId, origem: 'plano', prioridade: pend.some((p) => p.status === 'vencida') ? 'alta' : 'normal',
        descricao: `Manutenção programada: ${pend.map((p) => p.plano_nome).join(', ')} — ${v.placa}`,
        itens: pend.map((p) => ({ categoria_codigo: p.categoria_codigo, natureza: 'preventiva', descricao: p.plano_nome, plano_id: p.plano_id })),
      });
      toast('Solicitação aberta. Abrindo a ficha...');
      closeModal(PAINEL);
      window.FROTAS_MANUTENCAO_ABRIR = id;
      document.querySelector('[data-ds-tab="manutencao"]')?.click();
    } catch (err) {
      toast(err.message || 'Erro ao abrir a solicitação.', 'err', 5500);
    } finally {
      state.ocupado = false; render(); renderPainel();
    }
  }

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
      const { abrirImportacaoHistorico } = await import('./frotas-manutencao-historico.js?v=20261029-frotas-manut69');
      abrirImportacaoHistorico({ supabase: state.supabase, aoConcluir: carregar });
    });
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; render(); });
    container.querySelector('[data-tipo]').addEventListener('change', (e) => { state.tipo = e.target.value; opcoesCategoria(); render(); });
    container.querySelector('[data-categoria]').addEventListener('change', (e) => { state.categoria = e.target.value; render(); });
    const lista = container.querySelector('[data-linhas]');
    lista.addEventListener('click', (e) => {
      const r = e.target.closest('[data-reg]'); if (r) return registrar(r.dataset.reg, null);
      const s = e.target.closest('[data-sol]'); if (s) { if (!s.disabled) abrirSolicitacao(s.dataset.sol); return; }
      const linha = e.target.closest('[data-abrir-veic]'); if (linha) abrirPainel(linha.dataset.abrirVeic);
    });
    lista.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-abrir-veic]')) { e.preventDefault(); abrirPainel(e.target.dataset.abrirVeic); }
    });
    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: render });
    if (state.linhas.length) { opcoesCategoria(); render(); }
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
