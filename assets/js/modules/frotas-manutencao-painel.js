// Frotas · Manutenção › Painel: visão de conjunto da frota. Indicadores do dia, alertas, veículos parados, quadro por etapa
// (solicitada → orçamento → aprovação → OS → oficina) e a saúde da preventiva. Clicar num cartão abre a ficha na aba Corretiva.
import { dataBR, dinheiro, esc, toast } from '../core/ui.js';
import { cardFiltro } from './frotas-ui-lista.js?v=20261020-frotas-manut44';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261020-frotas-manut44';
import { ESTILOS_VISAO, linkPlaca } from './frotas-manutencao-visao-estilos.js?v=20261020-frotas-manut44';
import { PRIORIDADES, statusInfo } from './frotas-manutencao-regras.js?v=20261020-frotas-manut44';
import {
  FILTROS_VAZIOS, SAUDE, contarSaude, custoDoMes, hojeBrasil, listaPorAtencao, listarParados, montarAlertas, montarQuadro, opcoesDe, estaAberta,
} from './frotas-manutencao-visao-regras.js?v=20261020-frotas-manut44';
import { abrirFicha, abrirNovaManutencao, abrirPreventiva, irCorretiva, abrirProntuario, carregarVisao, invalidarVisao } from './frotas-manutencao-visao-dados.js?v=20261020-frotas-manut44';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_PAINEL';
  const LIMITE_LISTA = 10; const LIMITE_PARADOS = 6; const LIMITE_ALERTAS = 5;
  const state = { supabase: null, root: null, visao: null, todosParados: false, todosAlertas: false, filtros: { ...FILTROS_VAZIOS }, etapa: '', limite: LIMITE_LISTA, loading: false };

  const rotuloPrioridade = (id) => PRIORIDADES.find((p) => p.id === id)?.label || id;
  const dataCurta = (iso) => (iso ? dataBR(iso) : '—');

  // ---------- partes ----------
  // Faixa de etapas: só contagens (clicáveis), em vez de uma coluna de cartões por etapa.
  function htmlEtapas(q) {
    return `<div class="fm-etapas">${q.colunas.map((col) => `<button type="button" class="fm-etapa-b tone-${col.tone}${state.etapa === col.id ? ' ativo' : ''}" data-etapa="${col.id}" aria-pressed="${state.etapa === col.id}" title="${esc(col.dica)}"><strong>${col.itens.length}</strong><span>${esc(col.titulo)}</span>${col.atrasadas ? `<em>${col.atrasadas} atrasada(s)</em>` : ''}</button>`).join('')}</div>`;
  }

  // Lista compacta: uma linha por manutenção, as que pedem atenção primeiro, poucas por vez.
  function htmlLista(q) {
    const todas = listaPorAtencao(q, state.etapa);
    if (!todas.length) return '<div class="fm-empty">Nenhuma manutenção em andamento neste filtro.</div>';
    const linhas = todas.slice(0, state.limite).map((c) => {
      const prazo = c.entregaAtrasada ? '<span class="fm-badge red">Entrega atrasada</span>'
        : c.atrasada ? `<span class="fm-badge amber" title="Mais tempo na etapa do que o esperado">${c.dias} dia(s) aqui</span>`
        : `<span class="fm-mm">${c.dias ? `${c.dias} dia(s) na etapa` : 'entrou hoje'}</span>`;
      const marcas = [c.parado ? '<span class="fm-badge red">Parado</span>' : '', ['alta', 'urgente'].includes(c.prioridade) ? `<span class="fm-badge ${c.prioridade === 'urgente' ? 'red' : 'amber'}">${esc(rotuloPrioridade(c.prioridade))}</span>` : ''].join('');
      const extra = [c.status === 'em_execucao' ? (c.previsao ? `entrega ${esc(dataCurta(c.previsao))}` : '<span class="fm-vazio-aviso">sem previsão</span>') : '', c.valor != null ? esc(dinheiro(c.valor)) : ''].filter(Boolean).join(' · ');
      return `<div class="fm-pl${c.atrasada || c.entregaAtrasada ? ' atraso' : ''}" role="button" tabindex="0" data-ficha="${esc(c.id)}">
        <div class="fm-pl-id">${linkPlaca(c.placa, c.veiculo_id)}<span class="fm-mm">${esc(c.modelo)}${c.coordenacao ? ` · ${esc(c.coordenacao)}` : ''}</span></div>
        <div class="fm-pl-desc">${esc(c.descricao || 'Sem descrição')}${extra ? `<span class="fm-mm">${extra}</span>` : ''}</div>
        <div class="fm-pl-etapa"><span class="fm-badge ${statusInfo(c.status).tone}">${esc(statusInfo(c.status).label)}</span>${marcas}</div>
        <div class="fm-pl-prazo">${prazo}</div></div>`;
    }).join('');
    const resto = todas.length - state.limite;
    return `<div class="fm-pl-lista">${linhas}</div>${resto > 0 ? `<div class="fm-pl-mais"><button class="fm-btn ghost fm-mini" type="button" data-mais-lista>Mostrar mais ${Math.min(resto, LIMITE_LISTA)} (faltam ${resto})</button><button class="fm-link" type="button" data-ir-corretiva>Ver todas na Corretiva →</button></div>` : '<div class="fm-pl-mais"><button class="fm-link" type="button" data-ir-corretiva>Abrir a lista completa na Corretiva →</button></div>'}`;
  }

  function htmlAlertas(alertas) {
    if (!alertas.length) return '<div class="fm-ok-vazio">Nada pedindo atenção agora. 👌</div>';
    const lista = state.todosAlertas ? alertas : alertas.slice(0, LIMITE_ALERTAS);
    const mais = alertas.length > LIMITE_ALERTAS ? `<button class="fm-link" type="button" data-todos-alertas style="margin-top:8px">${state.todosAlertas ? 'Mostrar só os mais graves' : `Ver os ${alertas.length} alertas`}</button>` : '';
    return `<ul class="fm-alertas">${lista.map((a) => `<li class="${a.tom}" role="button" tabindex="0" data-ficha="${esc(a.manutencao_id)}"><strong>${esc(a.titulo)}</strong><span>${esc(a.detalhe)}</span></li>`).join('')}</ul>${mais}`;
  }

  function htmlParados(todos) {
    if (!todos.length) return '<div class="fm-ok-vazio">Nenhum veículo parado na oficina.</div>';
    const lista = state.todosParados ? todos : todos.slice(0, LIMITE_PARADOS);
    const mais = todos.length > LIMITE_PARADOS ? `<button class="fm-link" type="button" data-todos-parados style="margin-top:8px">${state.todosParados ? 'Mostrar só os mais antigos' : `Ver os ${todos.length} parados`}</button>` : '';
    return `<table class="fm-table fm-tab-curta"><thead><tr><th>Veículo</th><th>Parado há</th><th>Entrega</th><th>Oficina</th></tr></thead><tbody>${lista.map((p) => {
      const entrega = p.previsao
        ? `<span class="${p.entregaAtrasada ? 'fm-venc' : ''}">${esc(dataCurta(p.previsao))}</span><span class="fm-mm">${p.diasParaEntrega < 0 ? `${-p.diasParaEntrega} dia(s) de atraso` : p.diasParaEntrega === 0 ? 'hoje' : `em ${p.diasParaEntrega} dia(s)`}</span>`
        : '<span class="fm-vazio-aviso">Sem previsão</span>';
      return `<tr class="fm-linha" data-ficha="${esc(p.id)}"><td>${linkPlaca(p.placa, p.veiculo_id)}<span class="fm-mm">${esc(p.modelo)}</span></td><td>${p.diasParado != null ? `${p.diasParado} dia(s)` : '—'}<span class="fm-mm">desde ${esc(dataCurta(p.desde))}</span></td><td>${entrega}</td><td>${esc(p.oficina || '—')}</td></tr>`;
    }).join('')}</tbody></table>${mais}`;
  }

  function htmlSaude(cont, total) {
    if (!total) return '<div class="fm-ok-vazio">Nenhum veículo com plano de preventiva.</div>';
    const barra = SAUDE.map((s) => (cont[s.id] ? `<i class="tone-${s.tone}" style="flex:${cont[s.id]}" title="${esc(s.rotulo)}: ${cont[s.id]}"></i>` : '')).join('');
    return `<div class="fm-saude-barra">${barra}</div><ul class="fm-saude-leg">${SAUDE.map((s) => `<li><span class="fm-dot tone-${s.tone}"></span>${esc(s.rotulo)}<b>${cont[s.id]}</b></li>`).join('')}</ul>`;
  }

  // ---------- desenho ----------
  function opcoesSelect(lista, atual, vazio) {
    return `<option value="">${esc(vazio)}</option>${lista.map((o) => `<option value="${esc(o)}"${o === atual ? ' selected' : ''}>${esc(o)}</option>`).join('')}`;
  }

  function render() {
    const root = state.root; if (!root) return;
    const v = state.visao;
    if (!v) {
      root.querySelector('[data-corpo]').innerHTML = `<div class="fm-empty">${state.loading ? 'Carregando o painel da frota...' : 'Não foi possível carregar o painel.'}</div>`;
      return;
    }
    const hoje = hojeBrasil();
    const abertas = v.manutencoes.filter(estaAberta);
    const parados = listarParados(v.manutencoes, v.mapaVeiculos, hoje);
    const alertas = montarAlertas(v.manutencoes, v.mapaVeiculos, hoje);
    const paraAprovar = abertas.filter((m) => m.status === 'em_aprovacao').length;
    const idsAtivos = new Set(v.veiculos.filter((x) => String(x.status).toUpperCase() === 'ATIVO').map((x) => x.id));
    const saude = contarSaude(v.preventivaPorVeiculo, idsAtivos);
    const totalSaude = Object.values(saude).reduce((s, n) => s + n, 0);
    const custo = custoDoMes(v.manutencoes);
    const quadro = montarQuadro(v.manutencoes, v.mapaVeiculos, state.filtros, hoje);

    const kpis = [
      cardFiltro({ tone: parados.length ? 'red' : 'green', icone: 'carro', label: 'Veículos parados', valor: String(parados.length), dica: 'OS na oficina com o veículo marcado como parado' }),
      cardFiltro({ tone: 'amber', icone: 'ferramenta', label: 'Manutenções em andamento', valor: String(abertas.length), dica: 'Da solicitação até o serviço na oficina' }),
      cardFiltro({ tone: paraAprovar ? 'purple' : 'green', icone: 'relogio', label: 'Esperando aprovação', valor: String(paraAprovar), dica: 'Orçamento pronto, aguardando o aprovador' }),
      cardFiltro({ tone: alertas.length ? 'red' : 'green', icone: 'alerta', label: 'Pedem atenção', valor: String(alertas.length), dica: 'Entrega atrasada, parado sem previsão, etapa travada ou urgente' }),
      cardFiltro({ tone: saude.vencida ? 'red' : 'green', icone: 'erro', label: 'Veículos com preventiva vencida', valor: String(saude.vencida), dica: 'Algum serviço do guia já passou do km ou da data' }),
      cardFiltro({ tone: 'blue', icone: 'dinheiro', label: `Custo em ${new Date(`${hoje}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })}`, valor: dinheiro(custo.total), dica: `${custo.qtd} serviço(s) concluído(s) pagos pela empresa neste mês` }),
    ].join('');

    root.querySelector('[data-corpo]').innerHTML = `
      <div class="fm-kpis">${kpis}</div>
      <div class="fm-painel-duplo">
        <section class="fm-sec"><h4><span>Pedem atenção</span><span class="fm-badge ${alertas.length ? 'red' : 'green'}">${alertas.length}</span></h4>${htmlAlertas(alertas)}</section>
        <section class="fm-sec"><h4><span>Parados agora</span><span class="fm-badge ${parados.length ? 'red' : 'green'}">${parados.length}</span></h4>${htmlParados(parados)}</section>
        <section class="fm-sec"><h4><span>Preventiva da frota</span><button class="fm-link" type="button" data-ir-preventiva>Ver preventiva →</button></h4>${htmlSaude(saude, totalSaude)}</section>
      </div>
      <section class="fm-sec fm-sec-quadro"><h4><span>Manutenções em andamento</span><span class="fm-mm" data-total>${quadro.total} manutenção(ões)</span></h4>
        <div data-etapas>${htmlEtapas(quadro)}</div>
        <div class="fm-bar fm-bar-quadro">
          <div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" data-f="busca" placeholder="Buscar placa, descrição, oficina, quem pediu..." value="${esc(state.filtros.busca)}"></div>
          <select class="fm-select" data-f="coordenacao" style="width:auto">${opcoesSelect(opcoesDe(v.veiculos, 'coordenacao'), state.filtros.coordenacao, 'Todas as coordenações')}</select>
          <select class="fm-select" data-f="supervisao" style="width:auto">${opcoesSelect(opcoesDe(v.veiculos, 'supervisao'), state.filtros.supervisao, 'Todas as supervisões')}</select>
          <select class="fm-select" data-f="natureza" style="width:auto"><option value="">Corretiva e preventiva</option><option value="corretiva"${state.filtros.natureza === 'corretiva' ? ' selected' : ''}>Só corretiva</option><option value="preventiva"${state.filtros.natureza === 'preventiva' ? ' selected' : ''}>Só preventiva</option></select>
        </div>
        <div data-lista>${htmlLista(quadro)}</div></section>
      <div class="fm-nota">As etapas mostram quantas manutenções há em cada uma (clique para filtrar). A lista começa pelo que passou do prazo esperado (solicitada 2 dias, orçamento 3, aprovação 2, emitir OS 3, oficina 15) e mostra poucas por vez. Clique numa linha para abrir a ficha; a placa leva ao prontuário do veículo.</div>`;
  }

  // Ao filtrar, só a faixa de etapas e a lista são refeitas (a busca mantém o foco no campo).
  function renderLista() {
    const v = state.visao; if (!v) return;
    const quadro = montarQuadro(v.manutencoes, v.mapaVeiculos, state.filtros, hojeBrasil());
    state.root.querySelector('[data-etapas]').innerHTML = htmlEtapas(quadro);
    state.root.querySelector('[data-lista]').innerHTML = htmlLista(quadro);
    const n = state.root.querySelector('[data-total]'); if (n) n.textContent = `${quadro.total} manutenção(ões)`;
  }

  async function carregar({ forcar = false } = {}) {
    state.loading = true; if (!state.visao) render();
    try { state.visao = await carregarVisao(state.supabase, { forcar }); }
    catch (err) { toast(err.message || 'Erro ao carregar o painel da frota.', 'err'); }
    state.loading = false; render();
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.root = container; state.visao = null;
    container.innerHTML = `${ESTILOS_MANUTENCAO}${ESTILOS_VISAO}<section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" type="button" data-atualizar>↻ Atualizar</button><button class="fm-btn primary" type="button" data-nova>+ Nova manutenção</button></div></div>
      <div data-corpo></div></section>`;
    container.querySelector('[data-atualizar]').addEventListener('click', () => { invalidarVisao(); carregar({ forcar: true }); });
    container.querySelector('[data-nova]').addEventListener('click', () => abrirNovaManutencao({}));
    // Ouvintes no bloco interno: o corpo da aba é reaproveitado ao trocar de aba e ouvintes nele se acumulariam.
    const raiz = container.querySelector('.fm-shell');
    raiz.addEventListener('click', (e) => {
      if (e.target.closest('[data-ir-preventiva]')) return abrirPreventiva();
      if (e.target.closest('[data-ir-corretiva]')) return irCorretiva();
      if (e.target.closest('[data-mais-lista]')) { state.limite += LIMITE_LISTA; return renderLista(); }
      if (e.target.closest('[data-todos-parados]')) { state.todosParados = !state.todosParados; return render(); }
      if (e.target.closest('[data-todos-alertas]')) { state.todosAlertas = !state.todosAlertas; return render(); }
      const etapa = e.target.closest('[data-etapa]'); if (etapa) { state.etapa = state.etapa === etapa.dataset.etapa ? '' : etapa.dataset.etapa; state.limite = LIMITE_LISTA; return renderLista(); }
      const placa = e.target.closest('[data-prontuario]'); if (placa) return abrirProntuario(placa.dataset.prontuario);
      const ficha = e.target.closest('[data-ficha]'); if (ficha) abrirFicha(ficha.dataset.ficha);
    });
    raiz.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-ficha]')) { e.preventDefault(); abrirFicha(e.target.dataset.ficha); }
    });
    const mudou = (e) => {
      const f = e.target.closest?.('[data-f]'); if (!f) return;
      state.filtros[f.dataset.f] = f.type === 'checkbox' ? f.checked : f.value;
      state.limite = LIMITE_LISTA; renderLista();
    };
    raiz.addEventListener('input', (e) => { if (e.target.matches?.('input[data-f][type="text"],input[data-f]:not([type])')) mudou(e); });
    raiz.addEventListener('change', (e) => { if (!e.target.matches?.('input[data-f][type="text"],input[data-f]:not([type])')) mudou(e); });
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
