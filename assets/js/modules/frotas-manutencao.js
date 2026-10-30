// Frotas · Manutenção › Corretiva: fluxo completo (orçamento → aprovação → OS → conclusão → pagamento e nota), no modelo de
// Compras: um cartão por etapa (Cotações, Em andamento, À pagar, Aguardando NF, Concluído) e um cartão por manutenção, com
// a coluna de ações à direita. Quem registra já é da equipe de Frotas: a manutenção nasce em Cotações. A ficha abre dentro do cartão (sem janela).
// Regras em frotas-manutencao-regras.js e -etapas.js, dados em -dados.js, HTML em -cards.js e -html.js. O banco valida cada
// etapa (trigger frotas_manutencoes_fluxo).
import { confirmar, toast } from '../core/ui.js';
import { temAcessoFrota } from './frotas-permissoes.js';
import { ligarCards } from './frotas-ui-lista.js?v=20261030-frotas-manut-solic';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261030-frotas-manut-solic';
import * as dados from './frotas-manutencao-dados.js?v=20261030-frotas-manut-solic';
import {
  acoesDisponiveis, modeloDoVeiculo, naturezaSugerida, pecasDoModelo, rotuloModelo, normalizarLinhas, rotuloVeiculo, totalDoOrcamento, validarNota, normalizarPlaca, numeroOuNulo, validarConclusao, validarOrcamento, validarSolicitacao, somarLinhas, linhasIniciais, compraDividida, oficinaCadastradaDaManutencao,
} from './frotas-manutencao-regras.js?v=20261030-frotas-manut-solic';
import {
  ETAPAS, ETAPA_PADRAO, contarPorEtapa, etapaDaManutencao, manutencoesDaEtapa,
} from './frotas-manutencao-etapas.js?v=20261030-frotas-manut-solic';
import { htmlBotoesTopo, htmlCards, htmlCasca, htmlEtapas } from './frotas-manutencao-cards.js?v=20261030-frotas-manut-solic';
import { htmlErros, htmlFicha } from './frotas-manutencao-html.js?v=20261030-frotas-manut-solic';
import { criarSeletor } from './frotas-manutencao-seletor.js?v=20261030-frotas-manut-solic';
import { criarAprovacao } from './frotas-manutencao-janela-aprovacao.js?v=20261030-frotas-manut-solic';
import { criarConsulta } from './frotas-manutencao-janela-consulta.js?v=20261030-frotas-manut-solic';
import { criarOrcamento } from './frotas-manutencao-janela-orcamento.js?v=20261030-frotas-manut-solic';
import { criarNova } from './frotas-manutencao-nova.js?v=20261030-frotas-manut-solic';
import { criarNotas } from './frotas-manutencao-notas.js?v=20261030-frotas-manut-solic';

(function () {
  const MODULE_NAME = 'FROTAS_MANUTENCAO';
  const FICHA = 'fmFicha';

  const state = {
    supabase: null, root: null, opts: null,
    base: { categorias: [], planos: [], oficinas: [], veiculos: [], componentes: [], grupos: [] },
    manut: [], itens: [], orcs: [], notas: [],
    estadoItens: {}, // seleção do seletor de itens da ficha sem itens (sobrevive ao redesenho da ficha)
    etapa: ETAPA_PADRAO, etapaEscolhida: false, busca: '', ordem: null, // ordem: { coluna, sentido } escolhida no cabeçalho
    loading: false, ocupado: false,
    fichaId: null, formAcao: null, kmSugerido: null, afetadas: [], financeiro: null,
  };

  // ---------- permissões ----------
  function podeAprovar() {
    const ctx = state.opts?.auth;
    if (ctx?.user?.is_master) return true;
    return (ctx?.modules || []).some((m) => String(m?.code || m?.codigo || '').toLowerCase() === 'frotas_manutencao' && m?.can_approve === true);
  }

  // ---------- índices ----------
  function indices() {
    const agrupar = (lista) => {
      const mapa = new Map();
      for (const x of lista) { if (!mapa.has(x.manutencao_id)) mapa.set(x.manutencao_id, []); mapa.get(x.manutencao_id).push(x); }
      return mapa;
    };
    return { itensPorManut: agrupar(state.itens), orcsPorManut: agrupar(state.orcs), notasPorManut: agrupar(state.notas) };
  }

  function enriquecer(m) {
    const v = state.base.veiculos.find((x) => x.id === m.veiculo_id);
    return { ...m, __placa: v?.placa || '', __modelo: v ? rotuloVeiculo(v) : '', __coordenacao: v?.coordenacao || '' };
  }

  function aplicarCarga({ manutencoes, itens, orcamentos, notas }) {
    state.manut = manutencoes.map(enriquecer);
    state.itens = itens;
    state.orcs = orcamentos;
    state.notas = notas || [];
  }

  const etapaDe = (m) => etapaDaManutencao(m, state.notas.filter((n) => n.manutencao_id === m.id));
  const rotuloEtapa = (id) => ETAPAS.find((e) => e.id === id)?.rotulo || id;

  // ---------- lista ----------
  function contextoCards(ind = indices()) {
    return {
      ...ind, base: state.base, etapa: state.etapa, ordem: state.ordem, aberto: state.fichaId, podeAprovar: podeAprovar(),
    };
  }

  function renderLista() {
    const root = state.root; if (!root) return;
    const ind = indices();
    root.querySelector('[data-etapas]').innerHTML = htmlEtapas(contarPorEtapa(state.manut, ind.notasPorManut), state.etapa);
    const daEtapa = state.manut.filter((m) => etapaDe(m) === state.etapa);
    const linhas = manutencoesDaEtapa(state.manut, { etapa: state.etapa, busca: state.busca, ordem: state.ordem }, { ...ind, categorias: state.base.categorias });
    // A ficha aberta é redesenhada só por renderFicha: o nó dela passa para o cartão novo (não se perde o que foi digitado).
    const lista = root.querySelector('[data-lista]');
    const detalhe = lista.querySelector('[data-detalhe]');
    lista.innerHTML = state.loading ? '<div class="fm-empty">Carregando manutenções...</div>' : htmlCards(linhas, contextoCards(ind));
    const slot = lista.querySelector('[data-detalhe]');
    if (detalhe && slot) slot.replaceWith(detalhe);
    root.querySelector('[data-contagem]').textContent = linhas.length === daEtapa.length ? `${linhas.length} manutenção(ões)` : `${linhas.length} de ${daEtapa.length} manutenção(ões)`;
    root.querySelector('[data-nota-etapa]').textContent = ETAPAS.find((e) => e.id === state.etapa)?.dica || '';
  }

  async function carregar() {
    state.loading = true; renderLista();
    try {
      aplicarCarga(await dados.carregarManutencoes(state.supabase));
    } catch (err) {
      toast(err.message || 'Erro ao carregar as manutenções.', 'err');
      state.manut = []; state.itens = []; state.orcs = []; state.notas = [];
    }
    state.loading = false;
    // Na primeira carga abre a primeira etapa que tem manutenção (quem entra não cai numa aba vazia).
    if (!state.etapaEscolhida) {
      state.etapaEscolhida = true;
      const contagens = contarPorEtapa(state.manut, indices().notasPorManut);
      state.etapa = ETAPAS.find((e) => e.id !== 'canceladas' && contagens[e.id] > 0)?.id || ETAPA_PADRAO;
    }
    renderLista();
    if (state.fichaId) renderFicha();
  }

  async function recarregarUma(id) {
    const r = await dados.carregarUma(state.supabase, id);
    if (!r.manutencao) { state.manut = state.manut.filter((m) => m.id !== id); }
    else {
      const novo = enriquecer(r.manutencao);
      const i = state.manut.findIndex((m) => m.id === id);
      if (i >= 0) state.manut[i] = novo; else state.manut.unshift(novo);
    }
    state.itens = [...state.itens.filter((x) => x.manutencao_id !== id), ...r.itens];
    state.orcs = [...state.orcs.filter((x) => x.manutencao_id !== id), ...r.orcamentos];
    state.notas = [...state.notas.filter((x) => x.manutencao_id !== id), ...(r.notas || [])];
    renderLista();
  }

  // Executa uma ação de gravação com trava contra clique duplo; erros do banco viram aviso. `id` é a manutenção que a ação
  // mexe (padrão: a ficha aberta). Quando a manutenção muda de etapa, o aviso diz para onde ela foi.
  async function executar(fn, { sucesso = '', id = state.fichaId } = {}) {
    if (state.ocupado) return false;
    state.ocupado = true;
    const antes = state.manut.find((m) => m.id === id);
    const etapaAntes = antes ? etapaDe(antes) : null;
    try {
      await fn();
      if (id) await recarregarUma(id);
      const depois = state.manut.find((m) => m.id === id);
      const mudou = depois && etapaAntes && etapaDe(depois) !== etapaAntes;
      if (sucesso) toast(mudou ? `${sucesso} Agora em "${rotuloEtapa(etapaDe(depois))}".` : sucesso);
      if (state.fichaId) { atualizarAfetadas(); atualizarFinanceiro(); }
      return true;
    } catch (err) {
      toast(err.message || 'Não foi possível concluir a ação.', 'err', 5500);
      if (id) { try { await recarregarUma(id); } catch { /* mantém o que está na tela */ } }
      return false;
    } finally {
      state.ocupado = false;
      if (state.fichaId) renderFicha();
    }
  }

  // ---------- ficha dentro do cartão ----------
  function fichaAtual() { return state.manut.find((m) => m.id === state.fichaId) || null; }

  function renderFicha() {
    const m = fichaAtual();
    const el = state.root?.querySelector('[data-detalhe]');
    // Sem cartão na etapa aberta (mudou de etapa ou saiu da busca): a ficha se recolhe.
    if (!m || !el) { if (state.fichaId) { state.fichaId = null; renderLista(); } return; }
    const { itensPorManut, orcsPorManut } = indices();
    el.innerHTML = htmlFicha(m, {
      itens: itensPorManut.get(m.id) || [], orcamentos: orcsPorManut.get(m.id) || [], base: state.base,
      podeAprovar: podeAprovar(), formAcao: state.formAcao, kmSugerido: state.kmSugerido, afetadas: state.afetadas, financeiro: state.financeiro,
      notas: state.notas.filter((x) => x.manutencao_id === m.id), semCabecalho: true,
    });
    // Seletor de itens (o mesmo da nova manutenção): aberto na ficha enquanto não há itens (depois, só na janela da cotação).
    const corpo = el.querySelector('[data-add-itens] [data-seletor-corpo]');
    el.__seletorItens = corpo ? criarSeletor(corpo, state.base, { resumo: el.querySelector('[data-add-itens] [data-pick-resumo]'), estado: state.estadoItens }) : null;
    if (el.__seletorItens) {
      const modelo = modeloDoVeiculo(state.base.veiculos.find((v) => v.id === m.veiculo_id) || m.__modelo || '');
      el.__seletorItens.setPecas(pecasDoModelo(state.base.pecas, modelo), rotuloModelo(modelo));
    }
  }

  // Programação que usa o veículo parado (só quando a OS está em execução); atualiza a ficha ao chegar.
  async function atualizarAfetadas() {
    const m = fichaAtual();
    const id = m?.id;
    if (!m || m.status !== 'em_execucao' || !m.veiculo_parado) { state.afetadas = []; return; }
    const lista = await dados.programacoesAfetadas(state.supabase, id);
    if (state.fichaId !== id) return;
    state.afetadas = lista;
    renderFicha();
  }

  // NF no GRM e pagamento no Financeiro (manutenção concluída e já enviada); atualiza a ficha ao chegar.
  async function atualizarFinanceiro() {
    const m = fichaAtual();
    const id = m?.id;
    if (!m || !state.notas.some((n) => n.manutencao_id === id && (n.enviada_em || n.pagamento_id))) { state.financeiro = null; return; }
    const fin = await dados.statusNfFinanceiro(state.supabase, id);
    if (state.fichaId !== id) return;
    state.financeiro = fin;
    renderFicha();
  }

  // Abre a ficha no cartão (uma por vez). Na etapa certa: quem veio de um aviso ou de outra aba cai onde a manutenção está.
  function abrirFicha(id) {
    state.fichaId = id; state.estadoItens = {}; state.formAcao = null; state.kmSugerido = null; state.afetadas = []; state.financeiro = null;
    const m = fichaAtual();
    if (m && etapaDe(m) !== state.etapa) { state.etapa = etapaDe(m); }
    if (m && state.busca) { state.busca = ''; const campo = state.root?.querySelector('[data-busca]'); if (campo) campo.value = ''; } // a busca não pode esconder o cartão
    renderLista();
    renderFicha();
    atualizarAfetadas();
    atualizarFinanceiro();
  }

  function fecharFicha() {
    state.fichaId = null; state.formAcao = null;
    renderLista();
  }

  function alternarFicha(id) { if (state.fichaId === id) fecharFicha(); else abrirFicha(id); }

  const rolarPara = (sel) => state.root?.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const val = (el, sel) => el.querySelector(sel)?.value ?? '';
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  async function mudarEtapa(m, a) {
    const { itensPorManut } = indices();
    // A natureza é obrigatória para aprovar: se ninguém definiu, vai a sugerida junto da aprovação.
    const natureza = m.natureza ? {} : { natureza: naturezaSugerida(m, itensPorManut.get(m.id) || []) };
    switch (a.id) {
      case 'concluir':
        if (state.fichaId !== m.id) abrirFicha(m.id);
        state.formAcao = 'conclusao';
        state.kmSugerido = await dados.kmAtualDoVeiculo(state.supabase, m.veiculo_id);
        renderFicha(); rolarPara('[data-form-acao="conclusao"]'); return;
      case 'reprovar':
      case 'cancelar': {
        const motivo = await confirmar({ titulo: a.rotulo, mensagem: `${m.__placa} · ${m.descricao || ''}`.slice(0, 160), confirmarLabel: a.rotulo, justificativa: true, justificativaMin: 3, justificativaPlaceholder: 'Informe o motivo...' });
        if (!motivo) return;
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para, { motivo_status: motivo }), { id: m.id, sucesso: a.id === 'reprovar' ? 'Manutenção reprovada.' : 'Manutenção cancelada.' });
        return;
      }
      case 'aprovar':
        return aprovacao.abrirAprovacao(m, natureza);
      case 'emitir_os': {
        // A cotação aceitou um nome livre; para executar o serviço a oficina precisa estar cadastrada (CNPJ alimenta nota e pagamento).
        const oficina = oficinaCadastradaDaManutencao(m, state.base.oficinas);
        if (!oficina) {
          toast(`A oficina "${m.oficina || 'da cotação'}" ainda não está cadastrada. Cadastre em Oficinas (com o mesmo nome) antes de emitir a OS.`, 'err', 7000);
          return;
        }
        const aviso = m.veiculo_parado ? '' : ' O veículo não está marcado como parado: a Programação e os alertas continuarão considerando-o disponível.';
        const ok = await confirmar({ titulo: 'Emitir OS', mensagem: `A manutenção segue para a oficina e a OS é emitida.${aviso}`, confirmarLabel: 'Emitir OS' });
        if (!ok) return;
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para, m.oficina_id ? {} : { oficina_id: oficina.id }), { id: m.id, sucesso: 'OS emitida.' });
        return;
      }
      case 'devolver': {
        // Pedir mais uma cotação: a manutenção volta para Cotações e a janela de nova cotação já abre.
        const ok = await executar(() => dados.mudarStatus(state.supabase, m.id, a.para), { id: m.id, sucesso: 'Devolvida para cotação.' });
        const atual = state.manut.find((x) => x.id === m.id);
        if (ok && atual) orcamento.abrirOrcamento(atual);
        return;
      }
      default:
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para), { id: m.id, sucesso: 'Etapa atualizada.' });
    }
  }

  // Ação de um ícone da coluna da direita (vale com a ficha aberta ou fechada).
  async function aoAcaoCard(botao) {
    const id = botao.dataset.id; const m = state.manut.find((x) => x.id === id); if (!m) return;
    const acao = botao.dataset.mcAcao;
    if (acao === 'comparar') return consulta.abrirComparativo(m);
    if (acao === 'historico') return consulta.abrirHistorico(m);
    if (acao === 'orcamento') {
      return orcamento.abrirOrcamento(m);
    }
    if (acao === 'notas') {
      if (state.fichaId !== id) abrirFicha(id);
      rolarPara('[data-nota-entrada]'); return;
    }
    if (acao === 'enviar_notas') return notas.enviarLancamento(m);
    if (acao === 'financeiro') return notas.abrirFinanceiro(m);
    const { itensPorManut, orcsPorManut } = indices();
    const a = acoesDisponiveis(m, { podeAprovar: podeAprovar(), itens: itensPorManut.get(id) || [], orcamentos: orcsPorManut.get(id) || [] }).find((x) => x.id === acao);
    if (!a || a.bloqueio) return;
    return mudarEtapa(m, a);
  }

  async function aoClicarFicha(e) {
    const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
    const ov = document.getElementById(FICHA); const m = fichaAtual(); if (!ov || !m) return;
    const acao = alvo.dataset.acao;
    const erros = (lista) => { ov.querySelector('[data-erros]').innerHTML = htmlErros(lista); };

    if (acao === 'fechar') return fecharFicha();
    if (acao === 'cancelar-form') { state.formAcao = null; return renderFicha(); }

    // Seletor de itens da ficha (o mesmo da nova manutenção): peças e Mão de obra viram itens separados, com o tipo vindo de cada componente.
    if (acao === 'itens-confirmar') {
      const novos = ov.__seletorItens?.ler() || [];
      if (!novos.length) return erros(['Marque ao menos um item (escolha o grupo e marque o que será feito).']);
      return executar(async () => {
        for (const n of novos) await dados.salvarItem(state.supabase, { manutencao_id: m.id, ...n });
        state.estadoItens = {};
      }, { sucesso: novos.length > 1 ? 'Itens adicionados.' : 'Item adicionado.' });
    }
    if (acao === 'orc-editar') return orcamento.abrirOrcamento(m, state.orcs.find((o) => o.id === alvo.dataset.id) || {});
    if (acao === 'orc-remover') {
      if (!(await confirmar({ titulo: 'Remover cotação', mensagem: 'Remover esta cotação?', confirmarLabel: 'Remover' }))) return;
      return executar(() => dados.removerOrcamento(state.supabase, alvo.dataset.id), { sucesso: 'Cotação removida.' });
    }
    if (notas.acoes.includes(acao)) return notas.aoClicarFicha({ acao, alvo, ov, m, erros });

    if (acao === 'confirmar-conclusao') {
      const f = ov.querySelector('[data-form-acao="conclusao"]');
      const campos = { data_execucao: val(f, '[data-a="data_execucao"]'), km_execucao: numeroOuNulo(val(f, '[data-a="km_execucao"]')), custo: numeroOuNulo(val(f, '[data-a="custo"]')) };
      const lista = validarConclusao(campos);
      if (lista.length) return erros(lista);
      return executar(async () => {
        await dados.mudarStatus(state.supabase, m.id, 'concluida', { ...campos });
        state.formAcao = null;
      }, { sucesso: 'Manutenção concluída.' });
    }
  }

  async function aoMudarFicha(e) {
    const m = fichaAtual(); if (!m) return;
    const alvo = e.target;
    if (notas.ehMudancaDeNota(alvo)) return notas.aoMudarFicha(alvo, m);
    // Campos da ordem: salvam ao sair do campo.
    if (alvo.dataset.campo) {
      const campo = alvo.dataset.campo;
      let valor = alvo.type === 'checkbox' ? alvo.checked : alvo.value;
      if (valor === '') valor = null;
      if (typeof valor === 'string' && (campo === 'descricao' || campo === 'diagnostico')) valor = valor.trim() || null;
      return executar(() => dados.atualizarManutencao(state.supabase, m.id, { [campo]: valor }));
    }
  }

  function aoClicarLista(e) {
    const col = e.target.closest('[data-ordenar]');
    if (col) {
      const c = col.dataset.ordenar;
      state.ordem = state.ordem?.coluna === c ? { coluna: c, sentido: state.ordem.sentido === 'asc' ? 'desc' : 'asc' } : { coluna: c, sentido: c === 'entrada' ? 'desc' : 'asc' };
      renderLista(); return;
    }
    const acao = e.target.closest('[data-mc-acao]');
    if (acao) { aoAcaoCard(acao); return; }
    const topo = e.target.closest('[data-abrir]');
    if (topo && !e.target.closest('input,button,a,label,select,textarea') && !String(window.getSelection?.() || '')) alternarFicha(topo.dataset.abrir);
  }

  // Contexto compartilhado com as janelas (cada uma é uma fábrica em seu próprio arquivo).
  const ctx = { state, dados, indices, executar, recarregarUma, renderFicha, renderLista, podeAprovar, rolarPara, val, norm, garantirBase, fichaAtual, abrirFicha };
  const aprovacao = criarAprovacao(ctx);
  const consulta = criarConsulta(ctx);
  const orcamento = criarOrcamento(ctx);
  const solicitacao = criarNova(ctx);
  const notas = criarNotas(ctx);

  // ---------- montagem ----------
  async function garantirBase() {
    if (state.base.categorias.length) return;
    state.base = await dados.carregarBase(state.supabase);
    state.base.colaboradores = await dados.carregarColaboradores(state.supabase);
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.opts = opts; state.root = container;
    state.fichaId = null; state.formAcao = null;
    state.etapaEscolhida = false; state.busca = ''; 
    // Atualizar e Nova manutenção vão para a linha das abas do painel de Frotas (se ela existir); senão, para o alto da tela.
    const hub = document.querySelector('[data-hub-acoes]');
    container.innerHTML = `${ESTILOS_MANUTENCAO}${htmlCasca({ comTopo: !hub })}`;
    if (hub) hub.innerHTML = htmlBotoesTopo();
    const barra = hub || container;

    // A lista é um só contêiner: cartões, marcação de itens e a ficha aberta dentro do cartão (cada um com o seu tratador).
    const lista = container.querySelector('[data-lista]');
    lista.addEventListener('click', (e) => { if (e.target.closest('#' + FICHA)) aoClicarFicha(e); else aoClicarLista(e); });
    lista.addEventListener('change', (e) => { if (e.target.closest('#' + FICHA)) aoMudarFicha(e); });
    lista.addEventListener('keydown', (e) => {
      const topo = e.target.closest?.('[data-abrir]');
      if (topo && e.target === topo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alternarFicha(topo.dataset.abrir); }
    });

    barra.querySelector('[data-acao="nova"]').addEventListener('click', () => solicitacao.abrirNova());
    barra.querySelector('[data-acao="atualizar"]').addEventListener('click', async () => { state.base = { categorias: [], planos: [], oficinas: [], veiculos: [], componentes: [], grupos: [] }; await garantirBase(); await carregar(); });
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; renderLista(); });
    // Cada etapa é um cartão: o clique troca a lista (clicar na etapa aberta não a desliga, sempre há uma etapa).
    ligarCards(container, {
      obter: () => state.etapa,
      definir: (f) => { if (f === 'todos' || f === state.etapa) return; state.etapa = f; state.etapaEscolhida = true; state.fichaId = null; state.formAcao = null; },
      aoMudar: renderLista,
    });

    state.loading = true; renderLista();
    try {
      await garantirBase();
    } catch (err) {
      toast(err.message || 'Erro ao carregar os cadastros.', 'err');
    }
    await carregar();

    // Quem abriu a solicitação em outra aba (Preventiva) pede para abrir a ficha aqui.
    const pedido = window.FROTAS_MANUTENCAO_ABRIR;
    if (pedido) { window.FROTAS_MANUTENCAO_ABRIR = null; if (state.manut.some((m) => m.id === pedido)) abrirFicha(pedido); }
    // Quem pediu uma nova manutenção em outra tela (Veículos, Checklists) vem para cá com o pedido já preenchido.
    const nova = window.FROTAS_MANUTENCAO_NOVA;
    if (nova) { window.FROTAS_MANUTENCAO_NOVA = null; solicitacao.abrirNova(nova); }
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
  // Para outras telas (Veículos, Checklists, Preventiva): leva o usuário à nova manutenção da aba Corretiva, já preenchida.
  // Botão "Enviar para manutenção" do Checklist: não leva a lugar nenhum. A pessoa descreve o problema e o pedido vira um
  // cartão em Corretiva > Solicitações (para todos, com ou sem o módulo Manutenção); a equipe decide cotar, aprovar e quando fazer.
  window[MODULE_NAME].enviarPedido = async (opts, preset = {}) => {
    const { abrirEnvio } = await import('./frotas-manutencao-enviar.js?v=20261030-frotas-manut-solic');
    await abrirEnvio(opts, preset);
  };
  window[MODULE_NAME].abrirNova = async (opts, preset = {}) => {
    // Sem o módulo Manutenção (ex.: só Cadastros): não há tela de Manutenção para abrir; o pedido é enviado aqui mesmo
    // e a equipe de Manutenção decide cotar, aprovar e quando fazer.
    if (opts?.auth && !temAcessoFrota(opts.auth, ['FROTAS_MANUTENCAO', 'MANUTENCAO'])) {
      const { abrirEnvio } = await import('./frotas-manutencao-enviar.js?v=20261030-frotas-manut-solic');
      await abrirEnvio(opts, preset);
      return;
    }
    // Já na aba Corretiva: abre a janela aqui mesmo.
    if (state.root?.isConnected && state.root.querySelector('[data-lista]')) {
      await garantirBase();
      solicitacao.abrirNova(preset);
      return;
    }
    // Outra aba do mesmo painel: troca para a Corretiva, que abre a nova manutenção ao montar.
    window.FROTAS_MANUTENCAO_NOVA = preset;
    const aba = document.querySelector('[data-ds-tab="manutencao"]');
    if (aba) { aba.click(); return; }
    // Outra página (Veículos): guarda o pedido e abre o painel de Manutenção.
    try { sessionStorage.setItem('fm_nova_preset', JSON.stringify(preset)); } catch { /* sem armazenamento: abre só a aba */ }
    // Sem ".html" em produção: o roteador do painel manda /painel/*.html para a home do site.
    const emProducao = /(^|\.)grao1000\.com\.br$/i.test(window.location.hostname) || window.location.pathname.includes('/painel');
    window.location.href = emProducao ? '/painel/frotas-manutencao-grupo' : 'frotas-manutencao-grupo.html';
  };
})();
