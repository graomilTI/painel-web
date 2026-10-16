// Frotas · Manutenção: fluxo completo (solicitação → orçamento → aprovação → OS → conclusão).
// Lista com cartões-filtro por etapa e ficha em modal. Regras em frotas-manutencao-regras.js, dados em
// frotas-manutencao-dados.js e HTML em frotas-manutencao-html.js. O banco valida cada etapa (trigger).
import { closeModal, confirmar, openModal, toast } from '../core/ui.js';
import { ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261016-frotas-manut17';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261016-frotas-manut17';
import * as dados from './frotas-manutencao-dados.js?v=20261016-frotas-manut17';
import {
  acoesDisponiveis, contarPorFiltro, rotuloVeiculo, validarNota, filtrarManutencoes, normalizarPlaca, numeroOuNulo, validarConclusao, validarOrcamento, validarSolicitacao,
} from './frotas-manutencao-regras.js?v=20261016-frotas-manut17';
import {
  htmlCasca, htmlEntradaItem, htmlErros, htmlFicha, htmlFormNova, htmlItemAdicionado, htmlKpis, htmlLinhas, opcoesPlanos,
} from './frotas-manutencao-html.js?v=20261016-frotas-manut17';

(function () {
  const MODULE_NAME = 'FROTAS_MANUTENCAO';
  const FICHA = 'fmFicha';
  const NOVA = 'fmNova';

  const state = {
    supabase: null, root: null, opts: null,
    base: { categorias: [], planos: [], oficinas: [], veiculos: [] },
    manut: [], itens: [], orcs: [], notas: [],
    filtro: 'abertas', busca: '', natureza: '', prioridade: '',
    loading: false, ocupado: false,
    fichaId: null, orcForm: null, formAcao: null, kmSugerido: null, afetadas: [], financeiro: null,
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
    return { itensPorManut, orcsPorManut };
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
    const { itensPorManut, orcsPorManut } = indices();
    const linhas = filtrarManutencoes(state.manut, state, itensPorManut, state.base.categorias);
    root.querySelector('[data-kpis]').innerHTML = htmlKpis(contarPorFiltro(state.manut), state.filtro);
    sincronizarCards(root, state.filtro);
    root.querySelector('[data-linhas]').innerHTML = state.loading
      ? '<tr><td colspan="8" class="fm-empty">Carregando manutenções...</td></tr>'
      : htmlLinhas(linhas, { itensPorManut, orcsPorManut, categorias: state.base.categorias });
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

  // ---------- ficha ----------
  function fichaAtual() { return state.manut.find((m) => m.id === state.fichaId) || null; }

  function renderFicha() {
    const m = fichaAtual();
    if (!m) { closeModal(FICHA); return; }
    const { itensPorManut, orcsPorManut } = indices();
    const html = htmlFicha(m, {
      itens: itensPorManut.get(m.id) || [], orcamentos: orcsPorManut.get(m.id) || [], base: state.base,
      podeAprovar: podeAprovar(), orcForm: state.orcForm, formAcao: state.formAcao, kmSugerido: state.kmSugerido, afetadas: state.afetadas, financeiro: state.financeiro,
      notas: state.notas.filter((x) => x.manutencao_id === m.id),
    });
    let ov = document.getElementById(FICHA);
    if (!ov) {
      ov = openModal({ id: FICHA, conteudoHtml: '', aoFechar: () => { state.fichaId = null; renderLista(); } });
      ov.classList.add('fm-mod');
      ov.addEventListener('click', aoClicarFicha);
      ov.addEventListener('change', aoMudarFicha);
    }
    const card = ov.querySelector('.ds-modal-card');
    const topo = card.scrollTop;
    card.innerHTML = html;
    card.scrollTop = topo;
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
    state.fichaId = id; state.orcForm = null; state.formAcao = null; state.kmSugerido = null; state.afetadas = []; state.financeiro = null;
    renderFicha();
    atualizarAfetadas();
    atualizarFinanceiro();
  }

  function fecharFicha() {
    state.fichaId = null; state.orcForm = null; state.formAcao = null;
    closeModal(FICHA);
    renderLista();
  }

  const val = (el, sel) => el.querySelector(sel)?.value ?? '';
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  async function mudarEtapa(m, a) {
    const { orcsPorManut } = indices();
    const orcs = orcsPorManut.get(m.id) || [];
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
        await executar(() => dados.mudarStatus(state.supabase, m.id, a.para), { sucesso: 'Manutenção aprovada.' });
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
      const cat = val(box, '[data-nv="categoria_codigo"]');
      if (!cat) return erros(['Escolha a categoria do item.']);
      const nomeCat = state.base.categorias.find((c) => String(c.codigo) === cat)?.nome || 'Serviço';
      return executar(() => dados.salvarItem(state.supabase, {
        manutencao_id: m.id, categoria_codigo: Number(cat), natureza: val(box, '[data-nv="natureza"]') || null,
        descricao: val(box, '[data-nv="descricao"]').trim() || nomeCat, plano_id: val(box, '[data-nv="plano_id"]') || null,
        tipo_item: val(box, '[data-nv="tipo_item"]') || 'servico',
      }), { sucesso: 'Item adicionado.' });
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
    if (acao === 'orc-salvar') {
      const f = ov.querySelector('[data-orc-form]');
      const o = (k) => val(f, `[data-o="${k}"]`);
      const pecas = numeroOuNulo(o('valor_pecas')); const mao = numeroOuNulo(o('valor_mao_obra'));
      const total = numeroOuNulo(o('valor_total')) ?? (pecas != null || mao != null ? (pecas || 0) + (mao || 0) : null);
      const lista = validarOrcamento({ fornecedor: o('fornecedor'), valor_total: total });
      if (lista.length) return erros(lista);
      const arquivo = f.querySelector('[data-o-arquivo]')?.files?.[0] || null;
      return executar(async () => {
        const anexo = arquivo ? await dados.enviarAnexo(state.supabase, m.id, 'orcamentos', arquivo) : null;
        await dados.salvarOrcamento(state.supabase, {
          id: f.dataset.orcId || undefined, manutencao_id: m.id, oficina_id: o('oficina_id') || null, fornecedor: o('fornecedor').trim(),
          fornecedor_contato: o('fornecedor_contato').trim() || null, valor_pecas: pecas, valor_mao_obra: mao, valor_total: total,
          prazo_dias: numeroOuNulo(o('prazo_dias')), validade: o('validade') || null, condicoes_pagamento: o('condicoes_pagamento').trim() || null,
          garantia: o('garantia').trim() || null, observacoes: o('observacoes').trim() || null, ...(anexo ? { anexo_url: anexo } : {}),
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
      return executar(async () => {
        await dados.mudarStatus(state.supabase, m.id, 'aprovada', { sem_orcamento: true, valor_aprovado: valor });
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
    // Itens: salvam ao mudar; trocar a categoria zera o plano (cada categoria tem os seus planos).
    if (alvo.dataset.item) {
      const linha = alvo.closest('[data-item-id]');
      const campo = alvo.dataset.item;
      const mudanca = { [campo]: campo === 'valor' ? numeroOuNulo(alvo.value) : (alvo.value === '' ? null : alvo.value) };
      if (campo === 'categoria_codigo') { mudanca.categoria_codigo = Number(alvo.value); mudanca.plano_id = null; }
      if (campo === 'descricao' && !alvo.value.trim()) return renderFicha();
      return executar(() => dados.salvarItem(state.supabase, { id: linha.dataset.itemId, ...mudanca }));
    }
    // Novo item: ao escolher a categoria, mostra só os planos dela.
    if (alvo.dataset.nv === 'categoria_codigo') {
      const planoSel = alvo.closest('[data-item-novo]').querySelector('[data-nv="plano_id"]');
      planoSel.innerHTML = opcoesPlanos(state.base.planos, alvo.value);
      return;
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
    const ov = openModal({ id: NOVA, conteudoHtml: htmlFormNova(state.base, preset), aoFechar: () => {} });
    ov.classList.add('fm-mod');
    ov.dataset.origem = preset.origem || 'manual';
    ov.dataset.checklist = preset.checklist_id || '';
    ov.addEventListener('click', aoClicarNova);
    // "Quem pediu": vem com o condutor do veículo escolhido; se a pessoa digitar outro nome, o campo deixa de ser trocado sozinho.
    const campoPediu = ov.querySelector('[data-n-solicitante]');
    ov.addEventListener('input', (e) => {
      if (e.target === campoPediu) campoPediu.dataset.auto = campoPediu.value.trim() ? '0' : '1';
    });
    const preencherCondutor = () => {
      if (campoPediu.dataset.auto === '0') return;
      campoPediu.value = veiculoDaDigitacao(val(ov, '[data-n-veiculo]'))?.motorista_atual || '';
      campoPediu.dataset.auto = '1';
    };
    ov.querySelector('[data-n-veiculo]').addEventListener('input', preencherCondutor);
    ov.querySelector('[data-n-veiculo]').addEventListener('change', preencherCondutor);
    ov.addEventListener('change', (e) => {
      if (e.target.dataset.n === 'categoria_codigo') {
        const linha = e.target.closest('[data-novo-entrada]');
        const plano = linha.querySelector('[data-n="plano_id"]');
        plano.innerHTML = opcoesPlanos(state.base.planos, e.target.value);
      }
      if (e.target.dataset.n === 'plano_id' && e.target.value) {
        const linha = e.target.closest('[data-novo-entrada]');
        const nat = linha.querySelector('[data-n="natureza"]');
        if (!nat.value) nat.value = 'preventiva';
      }
    });
  }

  function veiculoDaDigitacao(texto) {
    const placa = normalizarPlaca(String(texto).split('·')[0]);
    return placa ? state.base.veiculos.find((v) => normalizarPlaca(v.placa) === placa) : null;
  }

  async function aoClicarNova(e) {
    const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
    const ov = document.getElementById(NOVA); if (!ov) return;
    if (alvo.dataset.acao === 'fechar') return closeModal(NOVA);
    // Lê a linha de entrada (categoria, natureza, descrição, plano, tipo); devolve null se a categoria não foi escolhida.
    const lerEntrada = () => {
      const linha = ov.querySelector('[data-novo-entrada]');
      const cat = linha.querySelector('[data-n="categoria_codigo"]').value;
      if (!cat) return null;
      return {
        categoria_codigo: Number(cat),
        natureza: linha.querySelector('[data-n="natureza"]').value || null,
        descricao: linha.querySelector('[data-n="descricao"]').value.trim(),
        plano_id: linha.querySelector('[data-n="plano_id"]').value || null,
        tipo_item: linha.querySelector('[data-n="tipo_item"]').value || 'servico',
      };
    };
    const limparEntrada = () => {
      const linha = ov.querySelector('[data-novo-entrada]');
      linha.querySelector('[data-n="categoria_codigo"]').value = '';
      linha.querySelector('[data-n="natureza"]').value = '';
      linha.querySelector('[data-n="descricao"]').value = '';
      linha.querySelector('[data-n="plano_id"]').innerHTML = opcoesPlanos(state.base.planos, null);
      linha.querySelector('[data-n="tipo_item"]').value = 'servico';
    };
    if (alvo.dataset.acao === 'novo-item-add') {
      const item = lerEntrada();
      if (!item) { ov.querySelector('[data-erros]').innerHTML = htmlErros(['Escolha a categoria do item antes de clicar em +.']); return; }
      ov.querySelector('[data-erros]').innerHTML = '';
      ov.querySelector('[data-novo-itens]').insertAdjacentHTML('beforeend', htmlItemAdicionado(state.base, item));
      limparEntrada();
      ov.querySelector('[data-novo-entrada] [data-n="categoria_codigo"]').focus();
      return;
    }
    if (alvo.dataset.acao === 'novo-item-remover') { alvo.closest('[data-novo-item]').remove(); return; }
    if (alvo.dataset.acao !== 'novo-salvar') return;

    const veiculo = veiculoDaDigitacao(val(ov, '[data-n-veiculo]'));
    const itens = [...ov.querySelectorAll('[data-novo-item]')].map((linha) => JSON.parse(linha.dataset.itemJson));
    // Item preenchido na linha de entrada mas sem clicar em +: entra junto (não se perde).
    const pendente = lerEntrada();
    if (pendente) itens.push(pendente);
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
            || state.base.categorias.find((c) => c.codigo === i.categoria_codigo)?.nome || descricao,
        })),
      });
      closeModal(NOVA);
      await recarregarUma(id).catch(() => {});
      // Quem pede pela supervisão do veículo (sem o módulo Manutenção) não lê a tabela: só avisa que foi enviada.
      if (state.manut.some((m) => m.id === id)) { toast('Manutenção registrada.'); abrirFicha(id); }
      else toast('Manutenção registrada e enviada para a equipe de Frotas.');
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
    container.innerHTML = ESTILOS_MANUTENCAO + htmlCasca();

    container.querySelector('[data-acao="nova"]').addEventListener('click', () => abrirNova());
    container.querySelector('[data-acao="atualizar"]').addEventListener('click', async () => { state.base = { categorias: [], planos: [], oficinas: [], veiculos: [] }; await garantirBase(); await carregar(); });
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; renderLista(); });
    container.querySelector('[data-f-natureza]').addEventListener('change', (e) => { state.natureza = e.target.value; renderLista(); });
    container.querySelector('[data-f-prioridade]').addEventListener('change', (e) => { state.prioridade = e.target.value; renderLista(); });
    container.querySelector('[data-linhas]').addEventListener('click', (e) => {
      const linha = e.target.closest('[data-abrir]'); if (linha) abrirFicha(linha.dataset.abrir);
    });
    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: renderLista });

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
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
  // Para outras telas (Veículos, Checklists, Preventiva): abre a janela de nova solicitação já preenchida.
  window[MODULE_NAME].abrirNova = async (opts, preset) => {
    state.supabase = opts.supabase; state.opts = opts;
    await garantirBase();
    abrirNova(preset);
  };
})();
