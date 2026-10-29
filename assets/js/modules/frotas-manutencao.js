// Frotas · Manutenção › Corretiva: fluxo completo (orçamento → aprovação → OS → conclusão → pagamento e nota), no modelo de
// Compras: um cartão por etapa (Cotações, Em andamento, À pagar, Aguardando NF, Concluído) e um cartão por manutenção, com
// a coluna de ações à direita. Quem registra já é da equipe de Frotas: a manutenção nasce em Cotações. A ficha abre dentro do cartão (sem janela).
// Regras em frotas-manutencao-regras.js e -etapas.js, dados em -dados.js, HTML em -cards.js e -html.js. O banco valida cada
// etapa (trigger frotas_manutencoes_fluxo).
import { closeModal, confirmar, esc, openModal, toast } from '../core/ui.js';
import { ligarCards } from './frotas-ui-lista.js?v=20261029-frotas-manut62';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261029-frotas-manut62';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-manut62';
import {
  acoesDisponiveis, modeloDoVeiculo, naturezaSugerida, pecasDoModelo, rotuloModelo, normalizarLinhas, rotuloVeiculo, totalDoOrcamento, validarNota, normalizarPlaca, numeroOuNulo, validarConclusao, validarOrcamento, validarSolicitacao, somarLinhas, linhasIniciais, compraDividida,
} from './frotas-manutencao-regras.js?v=20261029-frotas-manut62';
import {
  ETAPAS, ETAPA_PADRAO, contarPorEtapa, etapaDaManutencao, manutencoesDaEtapa,
} from './frotas-manutencao-etapas.js?v=20261029-frotas-manut62';
import { htmlBotoesTopo, htmlCards, htmlCasca, htmlEtapas } from './frotas-manutencao-cards.js?v=20261029-frotas-manut62';
import { faltantesDoOrcamento, htmlErros, htmlFicha, htmlFormNova, htmlComparativo, htmlLinhaOrcamento, htmlModalHistorico, htmlModalOrcamento } from './frotas-manutencao-html.js?v=20261029-frotas-manut62';
import { carregarCidades, cidadesDaUf, htmlOpcoesCidade } from './frotas-manutencao-cidades.js?v=20261029-frotas-manut62';
import { criarSeletor } from './frotas-manutencao-seletor.js?v=20261029-frotas-manut62';
import { sugerirItens } from './frotas-manutencao-sugestoes.js?v=20261029-frotas-manut62';

(function () {
  const MODULE_NAME = 'FROTAS_MANUTENCAO';
  const FICHA = 'fmFicha';
  const NOVA = 'fmNova';
  const ORC = 'fmOrcamento';
  const CMP = 'fmComparativo';
  const HIST = 'fmHistorico';

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
    // Orçamento aberto: peças, mão de obra e total já vêm somados das linhas (que podem vir com a peça escolhida nos itens).
    recalcularOrcamento(el.querySelector('[data-orc-form]'));
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
    if (!m || !state.notas.some((n) => n.manutencao_id === id && n.enviada_em)) { state.financeiro = null; return; }
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

  // Ao aprovar, as peças (com marca/referência) do orçamento escolhido entram no catálogo do modelo do veículo.
  async function aprenderPecasDaManutencao(m) {
    try {
      const veiculo = state.base.veiculos.find((v) => v.id === m.veiculo_id);
      const modelo = modeloDoVeiculo(veiculo || m.__modelo || '');
      if (!modelo) return;
      const n = await dados.aprenderPecas(state.supabase, m.id, modelo);
      if (n > 0) {
        state.base.pecas = await dados.carregarPecas(state.supabase);
        toast(`${n} peça(s) salva(s) no catálogo do ${rotuloModelo(modelo)}.`);
      }
    } catch { /* o catálogo é um extra: a aprovação já foi feita */ }
  }

  async function mudarEtapa(m, a) {
    const { orcsPorManut, itensPorManut } = indices();
    const orcs = orcsPorManut.get(m.id) || [];
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
      case 'aprovar': {
        const sel = orcs.find((o) => o.selecionado);
        const dividida = compraDividida(orcs, m.escolha_itens);
        const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const outros = dividida.trocas.length ? ` Itens comprados de outros fornecedores: ${dividida.trocas.map((t) => `${t.nome} (${t.orcamento?.fornecedor || '—'})`).join(', ')}. Total aprovado: ${brl(dividida.total)}.` : '';
        // Aprovar a cotação já põe o serviço em andamento: a OS é emitida junto (não há etapa separada de "emitir OS").
        const aviso = m.veiculo_parado ? '' : ' O veículo não está marcado como parado: a Programação e os alertas continuarão considerando-o disponível.';
        const ok = await confirmar({ titulo: 'Aprovar manutenção', mensagem: `Aprovar a cotação de ${sel?.fornecedor || ''} (${brl(sel?.valor_total)})? O serviço entra em andamento e a OS é emitida.${outros}${faltantesDoOrcamento(sel).length ? ` Atenção: este fornecedor não tem ${faltantesDoOrcamento(sel).join(', ')}.` : ''}${aviso}`, confirmarLabel: 'Aprovar' });
        if (!ok) return;
        const aprovou = await executar(async () => {
          await dados.mudarStatus(state.supabase, m.id, a.para, natureza);
          await dados.mudarStatus(state.supabase, m.id, 'em_execucao'); // se falhar, fica aprovada e "Emitir OS" continua disponível
        }, { id: m.id, sucesso: 'Manutenção aprovada, OS emitida.' });
        if (aprovou) aprenderPecasDaManutencao(m);
        return;
      }
      case 'emitir_os': {
        const aviso = m.veiculo_parado ? '' : ' O veículo não está marcado como parado: a Programação e os alertas continuarão considerando-o disponível.';
        const ok = await confirmar({ titulo: 'Emitir OS', mensagem: `A manutenção segue para a oficina e a OS é emitida.${aviso}`, confirmarLabel: 'Emitir OS' });
        if (!ok) return;
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para), { id: m.id, sucesso: 'OS emitida.' });
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
    if (acao === 'comparar') return abrirComparativo(m);
    if (acao === 'historico') return abrirHistorico(m);
    if (acao === 'orcamento') {
      return abrirOrcamento(m);
    }
    if (acao === 'notas') {
      if (state.fichaId !== id) abrirFicha(id);
      rolarPara('[data-nota-entrada]'); return;
    }
    if (acao === 'enviar_notas') return enviarNotas(m);
    const { itensPorManut, orcsPorManut } = indices();
    const a = acoesDisponiveis(m, { podeAprovar: podeAprovar(), itens: itensPorManut.get(id) || [], orcamentos: orcsPorManut.get(id) || [] }).find((x) => x.id === acao);
    if (!a || a.bloqueio) return;
    return mudarEtapa(m, a);
  }

  async function enviarNotas(m) {
    const pendentes = state.notas.filter((n) => n.manutencao_id === m.id && !n.enviada_em).length;
    if (!(await confirmar({ titulo: 'Enviar ao GRM e ao Financeiro', mensagem: `${pendentes} nota(s) entram na fila do GRM e viram pagamentos no Financeiro. Depois disso o custo final e as notas enviadas ficam travados.`, confirmarLabel: 'Enviar' }))) return;
    return executar(() => dados.enviarNfFinanceiro(state.supabase, m.id), { id: m.id, sucesso: 'Notas enviadas ao GRM e ao Financeiro.' });
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
    if (acao === 'orc-editar') return abrirOrcamento(m, state.orcs.find((o) => o.id === alvo.dataset.id) || {});
    if (acao === 'orc-escolher') return executar(() => dados.escolherOrcamento(state.supabase, alvo.dataset.id), { sucesso: 'Cotação escolhida.' });
    if (acao === 'orc-remover') {
      if (!(await confirmar({ titulo: 'Remover cotação', mensagem: 'Remover esta cotação?', confirmarLabel: 'Remover' }))) return;
      return executar(() => dados.removerOrcamento(state.supabase, alvo.dataset.id), { sucesso: 'Cotação removida.' });
    }
    if (acao === 'nota-add') {
      const f = ov.querySelector('[data-nota-entrada]');
      const nt = (k) => val(f, `[data-nt="${k}"]`).trim();
      const arquivo = f.querySelector('[data-nt-arquivo]')?.files?.[0] || null;
      const comprovante = f.querySelector('[data-nt-comprovante]')?.files?.[0] || null;
      const valor = numeroOuNulo(nt('valor'));
      // Paga primeiro e a nota chega depois (ou o contrário): basta a NF ou o comprovante; o que faltar mantém a etapa (À pagar / Aguardando NF).
      const lista = validarNota({ valor, fornecedor: nt('fornecedor'), arquivo, comprovante });
      if (lista.length) return erros(lista);
      const oficina = state.base.oficinas.find((o) => norm(o.nome) === norm(nt('fornecedor')));
      return executar(async () => {
        const anexo = arquivo ? await dados.enviarAnexo(state.supabase, m.id, 'nf', arquivo) : null;
        const urlComprovante = comprovante ? await dados.enviarAnexo(state.supabase, m.id, 'comprovante', comprovante) : null;
        await dados.salvarNota(state.supabase, {
          manutencao_id: m.id, tipo: nt('tipo') || 'servico', fornecedor: nt('fornecedor'), oficina_id: oficina?.id || null,
          numero: nt('numero') || null, valor, anexo_url: anexo,
          comprovante_url: urlComprovante, pago_em: urlComprovante ? (dados.dataPagamentoISO(nt('pago_em')) || new Date().toISOString()) : null,
        });
      }, { sucesso: 'Nota adicionada.' });
    }
    if (acao === 'nota-remover') {
      if (!(await confirmar({ titulo: 'Remover nota', mensagem: 'Remover esta nota fiscal da manutenção?', confirmarLabel: 'Remover' }))) return;
      return executar(() => dados.removerNota(state.supabase, alvo.dataset.id), { sucesso: 'Nota removida.' });
    }
    if (acao === 'notas-enviar') return enviarNotas(m);

    if (acao === 'confirmar-conclusao') {
      const f = ov.querySelector('[data-form-acao="conclusao"]');
      const campos = { data_execucao: val(f, '[data-a="data_execucao"]'), km_execucao: numeroOuNulo(val(f, '[data-a="km_execucao"]')), custo: numeroOuNulo(val(f, '[data-a="custo"]')) };
      const lista = validarConclusao(campos);
      if (lista.length) return erros(lista);
      const enviar = !!f.querySelector('[data-a-enviar]')?.checked;
      return executar(async () => {
        await dados.mudarStatus(state.supabase, m.id, 'concluida', { ...campos });
        state.formAcao = null;
        if (enviar) {
          try { await dados.enviarNfFinanceiro(state.supabase, m.id); toast('Notas enviadas ao GRM e ao Financeiro.'); }
          catch (err) { toast(`Concluída, mas o envio ao GRM/Financeiro falhou: ${err.message}`, 'err', 8000); }
        }
      }, { sucesso: 'Manutenção concluída.' });
    }
  }

  // Linhas do orçamento (peça/serviço, marca/observação, valor) como estão na tela.
  const linhasDoFormulario = (f) => [...f.querySelectorAll('[data-orc-linha]')].map((r) => ({
    nome: r.querySelector('[data-ol="nome"]').value, detalhe: r.querySelector('[data-ol="detalhe"]').value, valor: numeroOuNulo(r.querySelector('[data-ol="valor"]').value),
    tipo: r.querySelector('[data-ol="tipo"]')?.value === 'servico' ? 'servico' : 'peca', faltante: !!r.querySelector('[data-ol="faltante"]')?.checked,
  }));

  // Peças = soma das linhas de peça, Mão de obra = soma das de serviço e total = peças + mão de obra, enquanto a pessoa não digitar
  // um valor próprio nesses campos.
  function recalcularOrcamento(f) {
    if (!f) return;
    const campo = (k) => f.querySelector('[data-o="' + k + '"]');
    const linhas = linhasDoFormulario(f);
    const pecas = campo('valor_pecas'); const mao = campo('valor_mao_obra'); const total = campo('valor_total');
    if (pecas.dataset.auto !== '0') pecas.value = somarLinhas(linhas, 'peca') ?? '';
    if (mao.dataset.auto !== '0') mao.value = somarLinhas(linhas, 'servico') ?? '';
    if (total.dataset.auto !== '0') total.value = totalDoOrcamento({ pecas: numeroOuNulo(pecas.value), maoObra: numeroOuNulo(mao.value) }) ?? '';
  }

  function aoDigitarFicha(e) {
    const f = e.target.closest?.('[data-orc-form]'); if (!f) return;
    const t = e.target;
    // Digitar direto em Peças, Mão de obra ou no total desliga a soma automática daquele campo (apagar religa).
    if (t.matches('[data-o="valor_pecas"],[data-o="valor_mao_obra"],[data-o="valor_total"]')) t.dataset.auto = t.value === '' ? '1' : '0';
    recalcularOrcamento(f);
  }

  async function aoMudarFicha(e) {
    const m = fichaAtual(); if (!m) return;
    const alvo = e.target;
    // NF ou comprovante que chegou depois, na própria nota (sem NF a nota fica em Aguardando NF; sem comprovante, em À pagar).
    if (alvo.matches('[data-anexar-nf],[data-anexar-comp]') && alvo.files?.[0]) {
      const ehNf = alvo.matches('[data-anexar-nf]');
      const nota = state.notas.find((n) => n.id === (ehNf ? alvo.dataset.anexarNf : alvo.dataset.anexarComp)); if (!nota) return;
      const arquivo = alvo.files[0];
      const pagoEm = dados.dataPagamentoISO(alvo.closest('.fm-nota-pago')?.querySelector('[data-anexar-data]')?.value) || new Date().toISOString();
      return executar(async () => {
        if (ehNf) await dados.atualizarNota(state.supabase, nota.id, { anexo_url: await dados.enviarAnexo(state.supabase, m.id, 'nf', arquivo) });
        else {
          const url = await dados.enviarAnexo(state.supabase, m.id, 'comprovante', arquivo);
          if (nota.enviada_em) await dados.comprovanteTardio(state.supabase, nota.id, url, pagoEm);
          else await dados.atualizarNota(state.supabase, nota.id, { comprovante_url: url, pago_em: pagoEm });
        }
      }, { sucesso: ehNf ? 'NF anexada.' : 'Comprovante anexado.' });
    }
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

  // ---------- histórico (janela) ----------
  function abrirHistorico(m) {
    const ov = openModal({ id: HIST, conteudoHtml: htmlModalHistorico(m) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-acao="hist-fechar"]')) closeModal(HIST); });
  }

  // ---------- comparativo das cotações (janela, lado a lado) ----------
  function abrirComparativo(m) {
    const orcs = state.orcs.filter((o) => o.manutencao_id === m.id);
    const ov = openModal({ id: CMP, conteudoHtml: htmlComparativo(m, orcs) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    ov.addEventListener('click', async (e) => {
      const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
      if (alvo.dataset.acao === 'cmp-fechar') return closeModal(CMP);
      if (alvo.dataset.acao === 'cmp-item') {
        // Comprar o item de outro fornecedor (ou voltar para a cotação principal). Vale só até a aprovação.
        const atual = state.manut.find((x) => x.id === m.id) || m;
        const principal = orcs.find((o) => o.selecionado); if (!principal) return;
        const escolha = { ...(atual.escolha_itens || {}) };
        const { nome, id } = alvo.dataset;
        if (id === principal.id || escolha[nome] === id) delete escolha[nome]; else escolha[nome] = id;
        const feito = await executar(() => dados.atualizarManutencao(state.supabase, m.id, { escolha_itens: escolha }), { id: m.id });
        if (feito) abrirComparativo(state.manut.find((x) => x.id === m.id) || m);
        return;
      }
      if (alvo.dataset.acao === 'cmp-escolher') {
        const feito = await executar(() => dados.escolherOrcamento(state.supabase, alvo.dataset.id), { sucesso: 'Cotação escolhida.', id: m.id });
        if (feito) abrirComparativo(state.manut.find((x) => x.id === m.id) || m);
      }
    });
  }

  // ---------- cotação (janela: adicionar ou editar) ----------
  function abrirOrcamento(m, orc = {}) {
    const { itensPorManut } = indices();
    const ov = openModal({ id: ORC, conteudoHtml: htmlModalOrcamento(m, state.base, orc, itensPorManut.get(m.id) || []) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    const mostrarErros = (lista) => { ov.querySelector('[data-erros]').innerHTML = htmlErros(lista); };
    recalcularOrcamento(ov.querySelector('[data-orc-form]'));
    // Adicionar itens ao pedido (o mesmo seletor de grupos): os itens novos entram também nas linhas desta cotação.
    const caixaItens = ov.querySelector('[data-orc-add-itens]');
    const corpoItens = caixaItens.querySelector('[data-seletor-corpo]');
    const moldeItens = corpoItens.innerHTML;
    let seletorItens = null;
    const fecharItens = () => {
      caixaItens.hidden = true; seletorItens = null;
      const limpo = caixaItens.querySelector('[data-seletor-corpo]').cloneNode(false); // sem os ouvintes do seletor anterior
      limpo.innerHTML = moldeItens;
      caixaItens.querySelector('[data-seletor-corpo]').replaceWith(limpo);
      caixaItens.querySelector('[data-pick-resumo]').innerHTML = '';
    };
    const abrirItens = () => {
      if (seletorItens) return;
      caixaItens.hidden = false; caixaItens.closest('details').open = true;
      seletorItens = criarSeletor(caixaItens.querySelector('[data-seletor-corpo]'), state.base, { resumo: caixaItens.querySelector('[data-pick-resumo]') });
      const modelo = modeloDoVeiculo(state.base.veiculos.find((v) => v.id === m.veiculo_id) || m.__modelo || '');
      seletorItens.setPecas(pecasDoModelo(state.base.pecas, modelo), rotuloModelo(modelo));
      caixaItens.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    ov.addEventListener('input', aoDigitarFicha);
    ov.addEventListener('change', (e) => {
      const alvo = e.target;
      // Peça faltante na cotação: o fornecedor não tem; a linha perde o valor e sai da soma.
      if (alvo.matches('[data-ol="faltante"]')) {
        const linha = alvo.closest('[data-orc-linha]'); const valor = linha.querySelector('[data-ol="valor"]');
        linha.classList.toggle('faltante', alvo.checked); valor.disabled = alvo.checked; if (alvo.checked) valor.value = '';
        return recalcularOrcamento(ov.querySelector('[data-orc-form]'));
      }
      // O nome digitado que bate com uma oficina cadastrada liga a cotação a ela e preenche o contato.
      if (alvo.dataset.o === 'fornecedor') {
        const f = ov.querySelector('[data-orc-form]');
        const of = state.base.oficinas.find((x) => norm(x.nome) === norm(alvo.value));
        f.querySelector('[data-o="oficina_id"]').value = of?.id || '';
        const contato = f.querySelector('[data-o="fornecedor_contato"]');
        if (of && contato && !contato.value) contato.value = of.telefone || of.contato_nome || '';
      }
    });
    ov.addEventListener('click', async (e) => {
      const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
      const acao = alvo.dataset.acao;
      if (acao === 'orc-cancelar') return closeModal(ORC);
      if (acao === 'orc-itens-abrir') return abrirItens();
      if (acao === 'orc-itens-cancelar') return fecharItens();
      if (acao === 'orc-itens-confirmar') {
        const novos = seletorItens?.ler() || [];
        if (!novos.length) return mostrarErros(['Marque ao menos um item (escolha o grupo e marque o que será feito).']);
        const feito = await executar(async () => {
          for (const n of novos) await dados.salvarItem(state.supabase, { manutencao_id: m.id, ...n });
        }, { sucesso: novos.length > 1 ? 'Itens adicionados.' : 'Item adicionado.', id: m.id });
        if (!feito) return;
        mostrarErros([]);
        const f = ov.querySelector('[data-orc-form]');
        const ja = new Set([...f.querySelectorAll('[data-orc-linha] [data-ol="nome"]')].map((i) => norm(i.value)));
        const novas = linhasIniciais(novos, []).filter((l) => !ja.has(norm(l.nome)));
        f.querySelector('[data-orc-linhas]').insertAdjacentHTML('beforeend', novas.map((l) => htmlLinhaOrcamento(l, { fixa: true })).join(''));
        f.querySelector('[data-ol-cab]').hidden = false;
        recalcularOrcamento(f);
        return fecharItens();
      }
      if (acao === 'orc-linha-add') {
        ov.querySelector('[data-orc-linhas]').insertAdjacentHTML('beforeend', htmlLinhaOrcamento({ tipo: alvo.dataset.tipo === 'servico' ? 'servico' : 'peca' }, { fixa: false }));
        ov.querySelector('[data-orc-linhas] [data-orc-linha]:last-child [data-ol="nome"]')?.focus();
        return;
      }
      if (acao === 'orc-linha-rem') { alvo.closest('[data-orc-linha]').remove(); return recalcularOrcamento(ov.querySelector('[data-orc-form]')); }
      if (acao === 'orc-salvar') {
        const f = ov.querySelector('[data-orc-form]');
        const o = (k) => val(f, `[data-o="${k}"]`);
        const pecas = numeroOuNulo(o('valor_pecas')); const mao = numeroOuNulo(o('valor_mao_obra'));
        const total = numeroOuNulo(o('valor_total')) ?? totalDoOrcamento({ pecas, maoObra: mao });
        const linhas = normalizarLinhas(linhasDoFormulario(f));
        const lista = validarOrcamento({ fornecedor: o('fornecedor'), valor_total: total });
        if (lista.length) return mostrarErros(lista);
        const arquivo = f.querySelector('[data-o-arquivo]')?.files?.[0] || null;
        const feito = await executar(async () => {
          const anexo = arquivo ? await dados.enviarAnexo(state.supabase, m.id, 'orcamentos', arquivo) : null;
          await dados.salvarOrcamento(state.supabase, {
            id: f.dataset.orcId || undefined, manutencao_id: m.id, oficina_id: o('oficina_id') || null, fornecedor: o('fornecedor').trim(),
            fornecedor_contato: o('fornecedor_contato').trim() || null, valor_pecas: pecas, valor_mao_obra: mao, valor_total: total,
            prazo_dias: numeroOuNulo(o('prazo_dias')), validade: o('validade') || null, condicoes_pagamento: o('condicoes_pagamento').trim() || null,
            garantia: o('garantia').trim() || null, observacoes: o('observacoes').trim() || null, linhas, ...(anexo ? { anexo_url: anexo } : {}),
            // O primeiro orçamento já fica escolhido (não há o que comparar); com vários, quem decide escolhe.
            ...(!f.dataset.orcId && !state.orcs.some((x) => x.manutencao_id === m.id) ? { selecionado: true } : {}),
          });
        }, { sucesso: 'Cotação salva.', id: m.id });
        if (feito) closeModal(ORC);
      }
    });
    ov.querySelector('[data-o="fornecedor"]')?.focus();
  }

  // ---------- nova solicitação (janela larga, como a nova solicitação de Compras) ----------
  function abrirNova(preset = {}) {
    state.formAcao = null;
    const ov = openModal({ id: NOVA, conteudoHtml: htmlFormNova(state.base, preset) });
    ov.classList.add('fm-mod', 'fm-modal-largo');
    ov.dataset.origem = preset.origem || 'manual';
    ov.dataset.checklist = preset.checklist_id || '';
    ov.addEventListener('click', aoClicarNova);
    ov.addEventListener('change', () => ov.__pendencias?.());
    ov.addEventListener('input', () => ov.__pendencias?.());
    // Seletor de itens em dois painéis (grupos | itens do grupo); a leitura fica guardada na própria janela.
    ov.__seletor = criarSeletor(ov.querySelector('[data-seletor-corpo]'), state.base, { resumo: ov.querySelector('[data-pick-resumo]'), aoMudar: () => ov.__pendencias?.() });
    // Peças já usadas no modelo do veículo escolhido (Mobi, Argo, Kwid...): aparecem sob cada item para escolher a peça específica.
    const atualizarPecas = () => {
      const modelo = modeloDoVeiculo(veiculoDaDigitacao(val(ov, '[data-n-veiculo]')) || '');
      ov.__seletor.setPecas(pecasDoModelo(state.base.pecas, modelo), rotuloModelo(modelo));
    };
    // Sugestões a partir do que foi escrito no problema: chips de um clique (o que já está marcado some da lista).
    const caixaSug = ov.querySelector('[data-sugestoes]');
    const atualizarSugestoes = () => {
      const sug = sugerirItens(state.base, val(ov, '[data-n-descricao]'));
      const itens = sug.itens.filter((i) => !ov.__seletor.estaMarcado(i.grupo, i.nome));
      caixaSug.hidden = !itens.length && !sug.grupos.length;
      caixaSug.innerHTML = caixaSug.hidden ? '' : `<span class="fm-sug-t">Sugestões pela descrição</span>${itens.map((i) => `<button type="button" data-sug-item data-grupo="${i.grupo}" data-nome="${esc(i.nome)}" title="Marcar ${esc(i.nome)}">+ ${esc(i.nome)}<small>${esc(i.grupoNome)}</small></button>`).join('')}${sug.grupos.map((g) => `<button type="button" class="fm-sug-grupo" data-sug-grupo="${g.codigo}" title="Abrir o grupo para escolher os itens">Ver ${esc(g.nome)}</button>`).join('')}${itens.length > 1 ? '<button type="button" class="fm-sug-todas" data-sug-todas>Marcar sugeridas</button>' : ''}`;
      caixaSug.__itens = itens;
    };
    caixaSug.addEventListener('click', (e) => {
      const um = e.target.closest('[data-sug-item]'); const grupo = e.target.closest('[data-sug-grupo]');
      if (um) ov.__seletor.marcar(um.dataset.grupo, um.dataset.nome);
      else if (grupo) { ov.__seletor.irPara(grupo.dataset.sugGrupo); return; }
      else if (e.target.closest('[data-sug-todas]')) (caixaSug.__itens || []).forEach((i) => ov.__seletor.marcar(i.grupo, i.nome));
      else return;
      atualizarSugestoes();
    });
    // UF libera a lista de cidades daquela UF (relação do IBGE, como na abertura de OS).
    const campoUf = ov.querySelector('[data-n-uf]'); const campoCidade = ov.querySelector('[data-n-cidade]');
    const preencherCidades = async (selecionada = '') => {
      campoCidade.disabled = !campoUf.value;
      if (!campoUf.value) { campoCidade.innerHTML = htmlOpcoesCidade(''); return; }
      campoCidade.innerHTML = '<option value="">Carregando cidades...</option>';
      await carregarCidades();
      campoCidade.innerHTML = htmlOpcoesCidade(campoUf.value, selecionada, undefined);
      if (!cidadesDaUf(campoUf.value).length && !selecionada) campoCidade.innerHTML = '<option value="">Sem lista do IBGE: tente de novo</option>';
      ov.__pendencias?.();
    };
    campoUf.addEventListener('change', () => preencherCidades(''));
    if (preset.uf) preencherCidades(preset.cidade || '');
    // Pendências ao vivo no resumo: o que ainda falta para registrar.
    ov.__pendencias = () => {
      const prontos = ov.querySelectorAll('[data-novo-item]').length;
      const itens = prontos + (ov.__seletor?.qtd() || 0);
      const pend = [
        [!!veiculoDaDigitacao(val(ov, '[data-n-veiculo]')), 'Veículo escolhido'],
        [!!campoUf.value && !!campoCidade.value, 'UF e cidade escolhidas'],
        [!!val(ov, '[data-n-descricao]').trim(), 'Problema descrito'],
        [itens > 0, 'Ao menos um item marcado'],
      ];
      atualizarSugestoes();
      ov.querySelector('[data-nova-pendencias]').innerHTML = pend.map(([ok, txt]) => `<li class="${ok ? 'ok' : 'falta'}"><span>${ok ? '✔' : '○'}</span> ${txt}</li>`).join('');
    };
    // "Quem pediu": vem com o condutor do veículo escolhido; se a pessoa digitar outro nome, o campo deixa de ser trocado sozinho.
    const campoPediu = ov.querySelector('[data-n-solicitante]');
    campoPediu.addEventListener('input', () => { campoPediu.dataset.auto = campoPediu.value.trim() ? '0' : '1'; });
    const preencherCondutor = () => {
      if (campoPediu.dataset.auto === '0') return;
      campoPediu.value = veiculoDaDigitacao(val(ov, '[data-n-veiculo]'))?.motorista_atual || '';
      campoPediu.dataset.auto = '1';
    };
    ov.querySelector('[data-n-veiculo]').addEventListener('input', preencherCondutor);
    ov.querySelector('[data-n-veiculo]').addEventListener('change', preencherCondutor);
    ov.querySelector('[data-n-veiculo]').addEventListener('input', atualizarPecas);
    ov.querySelector('[data-n-veiculo]').addEventListener('change', atualizarPecas);
    atualizarPecas();
    ov.__pendencias();
  }

  function veiculoDaDigitacao(texto) {
    const placa = normalizarPlaca(String(texto).split('·')[0]);
    return placa ? state.base.veiculos.find((v) => normalizarPlaca(v.placa) === placa) : null;
  }

  async function aoClicarNova(e) {
    const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
    const ov = document.getElementById(NOVA); if (!ov) return;
    if (alvo.dataset.acao === 'fechar') return closeModal(NOVA);
    if (alvo.dataset.acao === 'novo-item-remover') { alvo.closest('[data-novo-item]').remove(); ov.__pendencias?.(); return; }
    if (alvo.dataset.acao !== 'novo-salvar') return;

    const veiculo = veiculoDaDigitacao(val(ov, '[data-n-veiculo]'));
    // Itens já informados (checklist ou plano) mais o que foi marcado no seletor.
    const itens = [...ov.querySelectorAll('[data-novo-item]')].map((linha) => JSON.parse(linha.dataset.itemJson)).concat(ov.__seletor?.ler() || []);
    const descricao = val(ov, '[data-n-descricao]').trim();
    const lista = validarSolicitacao({ veiculo_id: veiculo?.id, descricao, itens, uf: val(ov, '[data-n-uf]'), cidade: val(ov, '[data-n-cidade]') });
    if (lista.length) { ov.querySelector('[data-erros]').innerHTML = htmlErros(lista); return; }
    if (state.ocupado) return;
    state.ocupado = true;
    try {
      const id = await dados.solicitar(state.supabase, {
        veiculo_id: veiculo.id, descricao, prioridade: val(ov, '[data-n-prioridade]'), origem: ov.dataset.origem || 'manual',
        checklist_id: ov.dataset.checklist || null, veiculo_parado: ov.querySelector('[data-n-parado]').checked,
        solicitante_nome: val(ov, '[data-n-solicitante]').trim(),
        itens: itens.map((i) => ({
          ...i,
          descricao: i.descricao || state.base.planos.find((p) => p.id === i.plano_id)?.nome
            || state.base.grupos.find((g) => Number(g.categoria_codigo) === Number(i.categoria_codigo))?.nome || state.base.categorias.find((c) => c.codigo === i.categoria_codigo)?.nome || descricao,
        })),
      });
      closeModal(NOVA);
      // Quem registra é da equipe de Frotas: a manutenção já nasce em cotação (sem etapa de solicitação). Quem pede pela
      // supervisão do veículo (sem o módulo) não pode mexer no status: a manutenção fica solicitada para a equipe.
      await dados.mudarStatus(state.supabase, id, 'em_orcamento', { uf: val(ov, '[data-n-uf]'), cidade: val(ov, '[data-n-cidade]') }).catch(() => {});
      await recarregarUma(id).catch(() => {});
      // Quem pede pela supervisão do veículo (sem o módulo Manutenção) não lê a tabela: só avisa que foi enviada.
      if (state.manut.some((m) => m.id === id)) {
        toast('Manutenção registrada em Cotações.');
        state.etapa = 'cotacoes'; state.etapaEscolhida = true;
        renderLista();
        state.root?.querySelector(`[data-mc="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        toast('Manutenção registrada e enviada para a equipe de Frotas.');
      }
    } catch (err) {
      ov.querySelector('[data-erros]').innerHTML = htmlErros([err.message || 'Erro ao abrir a solicitação.']);
    } finally {
      state.ocupado = false;
    }
  }

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
    lista.addEventListener('input', (e) => { if (e.target.closest('#' + FICHA)) aoDigitarFicha(e); });
    lista.addEventListener('keydown', (e) => {
      const topo = e.target.closest?.('[data-abrir]');
      if (topo && e.target === topo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alternarFicha(topo.dataset.abrir); }
    });

    barra.querySelector('[data-acao="nova"]').addEventListener('click', () => abrirNova());
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
    if (nova) { window.FROTAS_MANUTENCAO_NOVA = null; abrirNova(nova); }
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
  // Para outras telas (Veículos, Checklists, Preventiva): leva o usuário à nova manutenção da aba Corretiva, já preenchida.
  window[MODULE_NAME].abrirNova = async (opts, preset = {}) => {
    // Já na aba Corretiva: abre a janela aqui mesmo.
    if (state.root?.isConnected && state.root.querySelector('[data-lista]')) {
      await garantirBase();
      abrirNova(preset);
      return;
    }
    // Outra aba do mesmo painel: troca para a Corretiva, que abre a nova manutenção ao montar.
    window.FROTAS_MANUTENCAO_NOVA = preset;
    const aba = document.querySelector('[data-ds-tab="manutencao"]');
    if (aba) { aba.click(); return; }
    // Outra página (Veículos): guarda o pedido e abre o painel de Manutenção.
    try { sessionStorage.setItem('fm_nova_preset', JSON.stringify(preset)); } catch { /* sem armazenamento: abre só a aba */ }
    window.location.href = 'frotas-manutencao-grupo.html';
  };
})();
