// Frotas · Manutenção: fluxo completo (solicitação → orçamento → aprovação → OS → conclusão).
// Lista com cartões-filtro por etapa e ficha em modal. Regras em frotas-manutencao-regras.js, dados em
// frotas-manutencao-dados.js e HTML em frotas-manutencao-html.js. O banco valida cada etapa (trigger).
import { confirmar, toast } from '../core/ui.js';
import { ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261019-frotas-manut40';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261019-frotas-manut40';
import * as dados from './frotas-manutencao-dados.js?v=20261019-frotas-manut40';
import {
  acoesDisponiveis, categoriaDoGrupo, contarPorFiltro, grupoDaCategoria, itensPorTipo, tipoDoComponente, naturezaSugerida, normalizarLinhas, rotuloVeiculo, somarLinhas, totalDoOrcamento, validarNota, filtrarManutencoes, normalizarPlaca, numeroOuNulo, validarConclusao, validarOrcamento, validarSolicitacao,
} from './frotas-manutencao-regras.js?v=20261019-frotas-manut40';
import {
  htmlCasca, htmlErros, htmlFicha, htmlFormNova, htmlItensDoGrupo, htmlKpis, htmlLinhaOrcamento, htmlLinhas,
} from './frotas-manutencao-html.js?v=20261019-frotas-manut40';
import { criarSeletor } from './frotas-manutencao-seletor.js?v=20261019-frotas-manut40';

(function () {
  const MODULE_NAME = 'FROTAS_MANUTENCAO';
  const FICHA = 'fmFicha';
  const NOVA = 'fmNova';

  const state = {
    supabase: null, root: null, opts: null,
    base: { categorias: [], planos: [], oficinas: [], veiculos: [], componentes: [], grupos: [] },
    manut: [], itens: [], orcs: [], notas: [],
    vista: 'lista', // 'lista' | 'nova' | 'ficha': nova e ficha ocupam a área da aba (sem janela)
    filtro: 'todos', visao: 'andamento', busca: '',
    loading: false, ocupado: false,
    fichaId: null, maisAberto: false, orcForm: null, formAcao: null, kmSugerido: null, afetadas: [], financeiro: null,
  };

  // ---------- permissões ----------
  function podeAprovar() {
    const ctx = state.opts?.auth;
    if (ctx?.user?.is_master) return true;
    return (ctx?.modules || []).some((m) => String(m?.code || m?.codigo || '').toLowerCase() === 'frotas_manutencao' && m?.can_approve === true);
  }

  // ---------- índices ----------
  function indices() {
    const itensPorManut = new Map();
    for (const i of state.itens) { if (!itensPorManut.has(i.manutencao_id)) itensPorManut.set(i.manutencao_id, []); itensPorManut.get(i.manutencao_id).push(i); }
    const orcsPorManut = new Map();
    for (const o of state.orcs) { if (!orcsPorManut.has(o.manutencao_id)) orcsPorManut.set(o.manutencao_id, []); orcsPorManut.get(o.manutencao_id).push(o); }
    const notasPorManut = new Map();
    for (const n of state.notas) { if (!notasPorManut.has(n.manutencao_id)) notasPorManut.set(n.manutencao_id, []); notasPorManut.get(n.manutencao_id).push(n); }
    return { itensPorManut, orcsPorManut, notasPorManut };
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

  // ---------- lista ----------
  function renderLista() {
    const root = state.root; if (!root) return;
    const { itensPorManut, orcsPorManut, notasPorManut } = indices();
    const linhas = filtrarManutencoes(state.manut, state, itensPorManut, state.base.categorias);
    root.querySelector('[data-kpis]').innerHTML = htmlKpis(contarPorFiltro(state.manut), state.filtro);
    sincronizarCards(root, state.filtro);
    root.querySelector('[data-linhas]').innerHTML = state.loading
      ? '<tr><td colspan="6" class="fm-empty">Carregando manutenções...</td></tr>'
      : htmlLinhas(linhas, { itensPorManut, orcsPorManut, categorias: state.base.categorias, grupos: state.base.grupos, notasPorManut });
    root.querySelector('[data-contagem]').textContent = `${linhas.length} de ${state.manut.length} manutenção(ões)`;
  }

  async function carregar() {
    state.loading = true; renderLista();
    try {
      aplicarCarga(await dados.carregarManutencoes(state.supabase));
    } catch (err) {
      toast(err.message || 'Erro ao carregar as manutenções.', 'err');
      state.manut = []; state.itens = []; state.orcs = []; state.notas = [];
    }
    state.loading = false; renderLista();
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

  // Executa uma ação de gravação com trava contra clique duplo; erros do banco viram aviso.
  async function executar(fn, { sucesso = '', recarregar = true } = {}) {
    if (state.ocupado) return false;
    state.ocupado = true;
    try {
      await fn();
      if (recarregar && state.fichaId) await recarregarUma(state.fichaId);
      if (sucesso) toast(sucesso);
      if (state.fichaId) { atualizarAfetadas(); atualizarFinanceiro(); }
      return true;
    } catch (err) {
      toast(err.message || 'Não foi possível concluir a ação.', 'err', 5500);
      if (state.fichaId) { try { await recarregarUma(state.fichaId); } catch { /* mantém o que está na tela */ } }
      return false;
    } finally {
      state.ocupado = false;
      if (state.fichaId) renderFicha();
    }
  }

  // ---------- vistas: a lista e, no lugar dela, a nova manutenção ou a ficha (tela inteira da aba, não janela) ----------
  const paginaEl = () => state.root?.querySelector('[data-pagina]');

  // Elemento que rola a aba (o painel pode rolar por um contêiner ou pela página).
  function rolagemPai(el) {
    for (let n = el?.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement || document.documentElement;
  }

  const htmlPagina = (conteudo, larga = false) => `<div class="fm-pg-barra"><button class="fm-btn ghost" type="button" data-acao="fechar">← Voltar para a lista</button></div><div class="fm-card"><div class="fm-body fm-pg${larga ? ' fm-pg-larga' : ''}">${conteudo}</div></div>`;

  // Troca a lista pela página (nova ou ficha). O id da página é o que os tratadores de clique procuram.
  function mostrarPagina(vista, id, html, { manterRolagem = false, larga = false } = {}) {
    const pg = paginaEl(); if (!pg) return null;
    const rolagem = rolagemPai(pg); const topo = rolagem.scrollTop;
    state.vista = vista; pg.id = id; pg.hidden = false;
    state.root.querySelector('[data-vista-lista]').hidden = true;
    pg.innerHTML = htmlPagina(html, larga);
    rolagem.scrollTop = manterRolagem ? topo : 0;
    return pg;
  }

  function mostrarLista() {
    const pg = paginaEl(); if (!pg) return;
    state.vista = 'lista'; pg.hidden = true; pg.id = ''; pg.innerHTML = '';
    state.root.querySelector('[data-vista-lista]').hidden = false;
    renderLista();
  }

  // ---------- ficha ----------
  function fichaAtual() { return state.manut.find((m) => m.id === state.fichaId) || null; }

  function renderFicha() {
    const m = fichaAtual();
    if (!m) { state.fichaId = null; mostrarLista(); return; }
    const { itensPorManut, orcsPorManut } = indices();
    const html = htmlFicha(m, {
      itens: itensPorManut.get(m.id) || [], orcamentos: orcsPorManut.get(m.id) || [], base: state.base,
      podeAprovar: podeAprovar(), orcForm: state.orcForm, formAcao: state.formAcao, kmSugerido: state.kmSugerido, afetadas: state.afetadas, financeiro: state.financeiro,
      notas: state.notas.filter((x) => x.manutencao_id === m.id), maisAberto: state.maisAberto,
    });
    // Ao regravar um campo a ficha é redesenhada no mesmo lugar (mantém a rolagem); ao abrir, começa no topo.
    mostrarPagina('ficha', FICHA, html, { manterRolagem: state.vista === 'ficha' });
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

  function abrirFicha(id) {
    state.fichaId = id; state.maisAberto = false; state.orcForm = null; state.formAcao = null; state.kmSugerido = null; state.afetadas = []; state.financeiro = null;
    renderFicha();
    atualizarAfetadas();
    atualizarFinanceiro();
  }

  function fecharFicha() {
    state.fichaId = null; state.orcForm = null; state.formAcao = null;
    mostrarLista();
  }

  const val = (el, sel) => el.querySelector(sel)?.value ?? '';
  // Componentes do guia marcados dentro de um trecho da tela (item da ficha, linha de entrada ou item novo).
  // O seletor de grupo guarda o código do grupo; o item grava a categoria representativa dele. Sem grupos cadastrados,
  // o seletor volta a listar as categorias e o valor já é a categoria.
  const temGrupos = () => (state.base.grupos || []).length > 0;
  const categoriaDaEscolha = (valor) => (temGrupos() ? categoriaDoGrupo(state.base.grupos, valor) : Number(valor));
  const grupoDaEscolha = (valor) => (temGrupos() ? Number(valor) : grupoDaCategoria(state.base.categorias, valor));
  const marcadosEm = (el) => [...el.querySelectorAll('[data-comp]:checked')].map((c) => c.value);
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  async function mudarEtapa(m, a) {
    const { orcsPorManut, itensPorManut } = indices();
    const orcs = orcsPorManut.get(m.id) || [];
    // A natureza é obrigatória para aprovar: se ninguém definiu, vai a sugerida junto da aprovação.
    const natureza = m.natureza ? {} : { natureza: naturezaSugerida(m, itensPorManut.get(m.id) || []) };
    switch (a.id) {
      case 'aprovar_sem_orcamento': state.formAcao = 'sem_orcamento'; renderFicha(); return;
      case 'concluir':
        state.formAcao = 'conclusao';
        state.kmSugerido = await dados.kmAtualDoVeiculo(state.supabase, m.veiculo_id);
        renderFicha(); return;
      case 'reprovar':
      case 'cancelar': {
        const motivo = await confirmar({ titulo: a.rotulo, mensagem: `${m.__placa} · ${m.descricao || ''}`.slice(0, 160), confirmarLabel: a.rotulo, justificativa: true, justificativaMin: 3, justificativaPlaceholder: 'Informe o motivo...' });
        if (!motivo) return;
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para, { motivo_status: motivo }), { sucesso: a.id === 'reprovar' ? 'Manutenção reprovada.' : 'Manutenção cancelada.' });
        return;
      }
      case 'aprovar': {
        const sel = orcs.find((o) => o.selecionado);
        const ok = await confirmar({ titulo: 'Aprovar manutenção', mensagem: `Aprovar o orçamento de ${sel?.fornecedor || ''} (${Number(sel?.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})?`, confirmarLabel: 'Aprovar' });
        if (!ok) return;
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para, natureza), { sucesso: 'Manutenção aprovada.' });
        return;
      }
      case 'emitir_os': {
        const aviso = m.veiculo_parado ? '' : ' O veículo não está marcado como parado: a Programação e os alertas continuarão considerando-o disponível.';
        const ok = await confirmar({ titulo: 'Emitir OS', mensagem: `A manutenção segue para a oficina e a OS é emitida.${aviso}`, confirmarLabel: 'Emitir OS' });
        if (!ok) return;
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para), { sucesso: 'OS emitida.' });
        return;
      }
      default:
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para), { sucesso: 'Etapa atualizada.' });
    }
  }

  async function aoClicarFicha(e) {
    const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
    const ov = document.getElementById(FICHA); const m = fichaAtual(); if (!ov || !m) return;
    const acao = alvo.dataset.acao;
    const erros = (lista) => { ov.querySelector('[data-erros]').innerHTML = htmlErros(lista); };

    if (acao === 'fechar') return fecharFicha();
    if (acao === 'cancelar-form') { state.formAcao = null; return renderFicha(); }

    if (acao === 'etapa') {
      const { itensPorManut, orcsPorManut } = indices();
      const a = acoesDisponiveis(m, { podeAprovar: podeAprovar(), itens: itensPorManut.get(m.id) || [], orcamentos: orcsPorManut.get(m.id) || [] }).find((x) => x.id === alvo.dataset.etapa);
      if (!a || a.bloqueio) return;
      return mudarEtapa(m, a);
    }

    if (acao === 'item-adicionar') {
      const box = ov.querySelector('[data-item-novo]');
      const grupo = val(box, '[data-nv="grupo_codigo"]');
      if (!grupo) return erros(['Escolha o grupo do item.']);
      const cat = categoriaDaEscolha(grupo);
      const nomeCat = state.base.grupos.find((g) => String(g.codigo) === grupo)?.nome || state.base.categorias.find((c) => c.codigo === cat)?.nome || 'Serviço';
      const componentes = marcadosEm(box);
      const texto = val(box, '[data-nv="descricao"]').trim();
      // O tipo (peça ou serviço) vem de cada componente; "Mão de obra" e os serviços do guia viram um item de serviço.
      let novos = itensPorTipo(cat, componentes, (nome) => tipoDoComponente(state.base.componentes, grupoDaEscolha(grupo), nome));
      if (texto) novos = novos.length ? novos.map((n, i) => (i === 0 ? { ...n, descricao: `${n.descricao}; ${texto}` } : n)) : [{ categoria_codigo: cat, descricao: texto, tipo_item: 'peca', componentes: [] }];
      if (!novos.length) novos = [{ categoria_codigo: cat, descricao: nomeCat, tipo_item: 'peca', componentes: [] }];
      return executar(async () => { for (const n of novos) await dados.salvarItem(state.supabase, { manutencao_id: m.id, ...n }); }, { sucesso: novos.length > 1 ? 'Itens adicionados.' : 'Item adicionado.' });
    }
    if (acao === 'item-remover') {
      if (!(await confirmar({ titulo: 'Remover item', mensagem: 'Remover este item do serviço?', confirmarLabel: 'Remover' }))) return;
      return executar(() => dados.removerItem(state.supabase, alvo.dataset.id), { sucesso: 'Item removido.' });
    }

    if (acao === 'orc-novo') { state.orcForm = true; return renderFicha(); }
    if (acao === 'orc-cancelar') { state.orcForm = null; return renderFicha(); }
    if (acao === 'orc-editar') { state.orcForm = state.orcs.find((o) => o.id === alvo.dataset.id) || true; return renderFicha(); }
    if (acao === 'orc-escolher') return executar(() => dados.escolherOrcamento(state.supabase, alvo.dataset.id), { sucesso: 'Orçamento escolhido.' });
    if (acao === 'orc-remover') {
      if (!(await confirmar({ titulo: 'Remover orçamento', mensagem: 'Remover este orçamento?', confirmarLabel: 'Remover' }))) return;
      return executar(() => dados.removerOrcamento(state.supabase, alvo.dataset.id), { sucesso: 'Orçamento removido.' });
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
      if (lista.length) return erros(lista);
      const arquivo = f.querySelector('[data-o-arquivo]')?.files?.[0] || null;
      return executar(async () => {
        const anexo = arquivo ? await dados.enviarAnexo(state.supabase, m.id, 'orcamentos', arquivo) : null;
        await dados.salvarOrcamento(state.supabase, {
          id: f.dataset.orcId || undefined, manutencao_id: m.id, oficina_id: o('oficina_id') || null, fornecedor: o('fornecedor').trim(),
          fornecedor_contato: o('fornecedor_contato').trim() || null, valor_pecas: pecas, valor_mao_obra: mao, valor_total: total,
          prazo_dias: numeroOuNulo(o('prazo_dias')), validade: o('validade') || null, condicoes_pagamento: o('condicoes_pagamento').trim() || null,
          garantia: o('garantia').trim() || null, observacoes: o('observacoes').trim() || null, linhas, ...(anexo ? { anexo_url: anexo } : {}),
          // O primeiro orçamento já fica escolhido (não há o que comparar); com vários, quem decide escolhe.
          ...(!f.dataset.orcId && !state.orcs.some((x) => x.manutencao_id === m.id) ? { selecionado: true } : {}),
        });
        state.orcForm = null;
      }, { sucesso: 'Orçamento salvo.' });
    }

    if (acao === 'nota-add') {
      const f = ov.querySelector('[data-nota-entrada]');
      const nt = (k) => val(f, `[data-nt="${k}"]`).trim();
      const arquivo = f.querySelector('[data-nt-arquivo]')?.files?.[0] || null;
      const valor = numeroOuNulo(nt('valor'));
      const lista = validarNota({ valor, fornecedor: nt('fornecedor'), arquivo });
      if (lista.length) return erros(lista);
      const oficina = state.base.oficinas.find((o) => norm(o.nome) === norm(nt('fornecedor')));
      const comprovante = f.querySelector('[data-nt-comprovante]')?.files?.[0] || null;
      return executar(async () => {
        const anexo = await dados.enviarAnexo(state.supabase, m.id, 'nf', arquivo);
        const urlComprovante = comprovante ? await dados.enviarAnexo(state.supabase, m.id, 'comprovante', comprovante) : null;
        await dados.salvarNota(state.supabase, {
          manutencao_id: m.id, tipo: nt('tipo') || 'servico', fornecedor: nt('fornecedor'), oficina_id: oficina?.id || null,
          numero: nt('numero') || null, valor, anexo_url: anexo,
          comprovante_url: urlComprovante, pago_em: urlComprovante ? dados.dataPagamentoISO(nt('pago_em')) : null,
        });
      }, { sucesso: 'Nota adicionada.' });
    }
    if (acao === 'nota-remover') {
      if (!(await confirmar({ titulo: 'Remover nota', mensagem: 'Remover esta nota fiscal da manutenção?', confirmarLabel: 'Remover' }))) return;
      return executar(() => dados.removerNota(state.supabase, alvo.dataset.id), { sucesso: 'Nota removida.' });
    }
    if (acao === 'notas-enviar') {
      const pendentes = state.notas.filter((n) => n.manutencao_id === m.id && !n.enviada_em).length;
      if (!(await confirmar({ titulo: 'Enviar ao GRM e ao Financeiro', mensagem: `${pendentes} nota(s) entram na fila do GRM e viram pagamentos no Financeiro. Depois disso o custo final e as notas enviadas ficam travados.`, confirmarLabel: 'Enviar' }))) return;
      return executar(() => dados.enviarNfFinanceiro(state.supabase, m.id), { sucesso: 'Notas enviadas ao GRM e ao Financeiro.' });
    }

    if (acao === 'confirmar-sem-orcamento') {
      const valor = numeroOuNulo(val(ov, '[data-form-acao="sem_orcamento"] [data-a="valor_aprovado"]'));
      if (valor == null || valor < 0) return erros(['Informe o valor estimado aprovado.']);
      const naturezaDireta = m.natureza ? {} : { natureza: naturezaSugerida(m, state.itens.filter((i) => i.manutencao_id === m.id)) };
      return executar(async () => {
        await dados.mudarStatus(state.supabase, m.id, 'aprovada', { sem_orcamento: true, valor_aprovado: valor, ...naturezaDireta });
        state.formAcao = null;
      }, { sucesso: 'Manutenção aprovada sem orçamento.' });
    }
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
    tipo: r.querySelector('[data-ol="tipo"]')?.value === 'servico' ? 'servico' : 'peca',
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
    // Campos da ordem: salvam ao sair do campo.
    if (alvo.dataset.campo) {
      const campo = alvo.dataset.campo;
      let valor = alvo.type === 'checkbox' ? alvo.checked : alvo.value;
      if (valor === '') valor = null;
      if (typeof valor === 'string' && (campo === 'descricao' || campo === 'diagnostico')) valor = valor.trim() || null;
      return executar(() => dados.atualizarManutencao(state.supabase, m.id, { [campo]: valor }));
    }
    // Componentes do guia de um item já salvo: marcar ou desmarcar grava na hora.
    if (alvo.matches('[data-comp]')) {
      const linha = alvo.closest('[data-item-id]');
      if (!linha) return; // item novo (ainda não adicionado): vale só ao clicar em "+ Adicionar"
      return executar(() => dados.salvarItem(state.supabase, { id: linha.dataset.itemId, componentes: marcadosEm(linha) }));
    }
    // Item novo: ao escolher a categoria, aparecem os componentes dela.
    if (alvo.dataset.nv === 'grupo_codigo') {
      alvo.closest('[data-item-novo]').querySelector('[data-nv-comps]').innerHTML = htmlItensDoGrupo(state.base, grupoDaEscolha(alvo.value), []);
      return;
    }
    // Itens: salvam ao mudar; trocar a categoria zera o plano e os componentes (cada categoria tem os seus).
    if (alvo.dataset.item) {
      const linha = alvo.closest('[data-item-id]');
      const campo = alvo.dataset.item;
      const mudanca = { [campo]: campo === 'valor' ? numeroOuNulo(alvo.value) : (alvo.value === '' ? null : alvo.value) };
      if (campo === 'grupo_codigo') { delete mudanca.grupo_codigo; mudanca.categoria_codigo = categoriaDaEscolha(alvo.value); mudanca.plano_id = null; mudanca.componentes = []; }
      if (campo === 'descricao' && !alvo.value.trim()) return renderFicha();
      return executar(() => dados.salvarItem(state.supabase, { id: linha.dataset.itemId, ...mudanca }));
    }
    // Orçamento: escolher a oficina cadastrada preenche nome e contato.
    if (alvo.dataset.o === 'oficina_id') {
      const f = alvo.closest('[data-orc-form]');
      const of = state.base.oficinas.find((x) => x.id === alvo.value);
      if (of) {
        f.querySelector('[data-o="fornecedor"]').value = of.nome;
        const contato = f.querySelector('[data-o="fornecedor_contato"]');
        if (!contato.value) contato.value = of.telefone || of.contato_nome || '';
      }
    }
  }

  // ---------- nova solicitação ----------
  function abrirNova(preset = {}) {
    state.fichaId = null; state.orcForm = null; state.formAcao = null;
    const ov = mostrarPagina('nova', NOVA, htmlFormNova(state.base, preset), { larga: true });
    if (!ov) return;
    ov.dataset.origem = preset.origem || 'manual';
    ov.dataset.checklist = preset.checklist_id || '';
    // Seletor de itens em dois painéis (grupos | itens do grupo); a leitura fica guardada na própria página.
    ov.__seletor = criarSeletor(ov.querySelector('[data-seletor-corpo]'), state.base, { resumo: ov.querySelector('[data-pick-resumo]'), aoMudar: () => ov.__pendencias?.() });
    // Pendências ao vivo no resumo: o que ainda falta para registrar.
    ov.__pendencias = () => {
      const prontos = ov.querySelectorAll('[data-novo-item]').length;
      const itens = prontos + (ov.__seletor?.qtd() || 0);
      const pend = [
        [!!veiculoDaDigitacao(val(ov, '[data-n-veiculo]')), 'Veículo escolhido'],
        [!!val(ov, '[data-n-descricao]').trim(), 'Problema descrito'],
        [itens > 0, 'Ao menos um item marcado'],
      ];
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
    ov.__pendencias();
  }

  function veiculoDaDigitacao(texto) {
    const placa = normalizarPlaca(String(texto).split('·')[0]);
    return placa ? state.base.veiculos.find((v) => normalizarPlaca(v.placa) === placa) : null;
  }

  async function aoClicarNova(e) {
    const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
    const ov = document.getElementById(NOVA); if (!ov) return;
    if (alvo.dataset.acao === 'fechar') return mostrarLista();
    if (alvo.dataset.acao === 'novo-item-remover') { alvo.closest('[data-novo-item]').remove(); ov.__pendencias?.(); return; }
    if (alvo.dataset.acao !== 'novo-salvar') return;

    const veiculo = veiculoDaDigitacao(val(ov, '[data-n-veiculo]'));
    // Itens já informados (checklist ou plano) mais o que foi marcado no seletor.
    const itens = [...ov.querySelectorAll('[data-novo-item]')].map((linha) => JSON.parse(linha.dataset.itemJson)).concat(ov.__seletor?.ler() || []);
    const descricao = val(ov, '[data-n-descricao]').trim();
    const lista = validarSolicitacao({ veiculo_id: veiculo?.id, descricao, itens });
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
      await recarregarUma(id).catch(() => {});
      // Quem pede pela supervisão do veículo (sem o módulo Manutenção) não lê a tabela: só avisa que foi enviada.
      if (state.manut.some((m) => m.id === id)) { toast('Manutenção registrada.'); abrirFicha(id); }
      else { toast('Manutenção registrada e enviada para a equipe de Frotas.'); mostrarLista(); }
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
    state.fichaId = null; state.orcForm = null; state.formAcao = null;
    state.vista = 'lista';
    container.innerHTML = `${ESTILOS_MANUTENCAO}<div data-vista-lista>${htmlCasca()}</div><div class="fm-pagina fm-mod" data-pagina hidden></div>`;

    // Nova manutenção e ficha são páginas dentro da aba (no lugar da lista); os tratadores valem para a vista aberta.
    const pagina = container.querySelector('[data-pagina]');
    pagina.addEventListener('click', (e) => { if (state.vista === 'ficha') aoClicarFicha(e); else if (state.vista === 'nova') aoClicarNova(e); });
    pagina.addEventListener('change', (e) => { if (state.vista === 'ficha') aoMudarFicha(e); else if (state.vista === 'nova') pagina.__pendencias?.(); });
    pagina.addEventListener('input', (e) => { if (state.vista === 'ficha') aoDigitarFicha(e); else if (state.vista === 'nova') pagina.__pendencias?.(); });
    // "Mais detalhes" continua aberto/fechado ao salvar um campo (a ficha é redesenhada a cada gravação). O evento toggle não borbulha.
    pagina.addEventListener('toggle', (e) => { if (state.vista === 'ficha' && e.target?.dataset?.mais !== undefined) state.maisAberto = e.target.open; }, true);

    container.querySelector('[data-acao="nova"]').addEventListener('click', () => abrirNova());
    container.querySelector('[data-acao="atualizar"]').addEventListener('click', async () => { state.base = { categorias: [], planos: [], oficinas: [], veiculos: [], componentes: [], grupos: [] }; await garantirBase(); await carregar(); });
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; renderLista(); });
    container.querySelector('[data-f-visao]').addEventListener('change', (e) => { state.visao = e.target.value; renderLista(); });
    container.querySelector('[data-linhas]').addEventListener('click', (e) => {
      const linha = e.target.closest('[data-abrir]'); if (linha) abrirFicha(linha.dataset.abrir);
    });
    // Os cartões são só da lista em andamento: escolher um volta para "Em andamento".
    ligarCards(container, {
      obter: () => state.filtro,
      definir: (f) => {
        state.filtro = f;
        if (f !== 'todos' && state.visao !== 'andamento') { state.visao = 'andamento'; container.querySelector('[data-f-visao]').value = 'andamento'; }
      },
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
    // Já na aba Corretiva: abre a página aqui mesmo.
    if (state.root && document.body.contains(state.root) && paginaEl()) {
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
