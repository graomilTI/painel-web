// Frotas · Manutenção › Veículos: a frota inteira em uma lista (situação de cada placa) e, ao clicar, o prontuário do veículo:
// o que está aberto, o histórico de manutenções (corretivas e preventivas), o custo do último ano e os serviços do guia
// vencidos ou perto de vencer. Daqui sai a nova manutenção e o registro de preventiva.
import { dataBR, dinheiro, esc, toast } from '../core/ui.js';
import { cardFiltro, ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261029-frotas-manut54';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261029-frotas-manut54';
import { ESTILOS_VISAO } from './frotas-manutencao-visao-estilos.js?v=20261029-frotas-manut54';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-manut54';
import { codigoManutencao, nomeDoGrupoDaCategoria, rotuloVeiculo, statusInfo } from './frotas-manutencao-regras.js?v=20261029-frotas-manut54';
import { montarLista, nomeCurto, restanteCelula } from './frotas-manutencao-preventiva-regras.js?v=20261029-frotas-manut54';
import { fmtKm, venceTexto } from './frotas-manutencao-preventiva-cards.js?v=20261029-frotas-manut54';
import {
  SITUACOES_VEICULO, dataBrasil, desdeDaEtapa, diasNaEtapa, listarVeiculos, montarProntuario, opcoesDe,
} from './frotas-manutencao-visao-regras.js?v=20261029-frotas-manut54';
import { abrirFicha, abrirNovaManutencao, abrirPreventiva, carregarVisao, invalidarVisao } from './frotas-manutencao-visao-dados.js?v=20261029-frotas-manut54';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_VEICULOS';
  const state = {
    supabase: null, root: null, visao: null, loading: false, filtro: 'todos', busca: '', coordenacao: '', supervisao: '',
    veiculoId: null, categorias: [], grupos: [], itens: [],
  };

  const dataCurta = (v) => (v ? dataBR(dataBrasil(v)) : '—');
  const natureza = (n) => (n === 'preventiva' ? '<span class="fm-badge green">Preventiva</span>' : n === 'corretiva' ? '<span class="fm-badge blue">Corretiva</span>' : '');

  // ---------- lista ----------
  function chips(l) {
    const r = l.resumo || {};
    return [
      l.sit.parado ? '<span class="fm-badge red">Parado</span>' : '',
      l.sit.abertas && !l.sit.parado ? `<span class="fm-badge amber">${l.sit.abertas} manutenção(ões) aberta(s)</span>` : '',
      r.vencida ? `<span class="fm-badge red">${r.vencida} vencida(s)</span>` : '',
      r.proxima ? `<span class="fm-badge amber">${r.proxima} próxima(s)</span>` : '',
      l.sit.docs ? `<span class="fm-badge amber" title="Preventivas com NF, comprovante ou envio pendente">${l.sit.docs} doc. pendente(s)</span>` : '',
      !l.sit.abertas && !r.vencida && !r.proxima && !l.sit.docs ? (l.resumo ? '<span class="fm-badge green">Em dia</span>' : '<span class="fm-badge gray">Sem plano de preventiva</span>') : '',
    ].join('');
  }

  function htmlLinha(l) {
    const urg = l.maisUrgente;
    const urgente = urg ? `<strong>${esc(nomeCurto(urg.plano_nome))}</strong><span class="fm-mm">${esc(venceTexto(urg))}${restanteCelula(urg) ? ` · ${esc(restanteCelula(urg))}` : ''}</span>` : '<span class="fm-mm">Nada vencido ou perto de vencer</span>';
    const v = l.veiculo;
    return `<div class="fm-vl${l.sit.parado ? ' parado' : ''}" role="button" tabindex="0" data-veic="${esc(v.id)}">
      <div><strong>${esc(l.placa)}</strong><span class="fm-mm">${esc(l.modelo)}</span></div>
      <div><span class="fm-mm">${esc(v.coordenacao || 'Sem coordenação')}</span><span class="fm-mm">${esc(v.motorista_atual || 'Sem condutor')}</span></div>
      <div><span class="fm-mm">Km atual</span><strong>${esc(fmtKm(l.km))}</strong></div>
      <div class="fm-vl-chips">${chips(l)}</div>
      <div class="fm-vl-urg">${urgente}</div>
      <div class="fm-vl-valor">${l.custo12m ? esc(dinheiro(l.custo12m)) : '—'}<span class="fm-mm">${l.ultima ? `última ${esc(dataBR(l.ultima))}` : 'sem serviço feito'}</span></div></div>`;
  }

  function renderLista() {
    const root = state.root; if (!root) return;
    const v = state.visao;
    const area = root.querySelector('[data-linhas]');
    if (!v) { area.innerHTML = `<div class="fm-empty">${state.loading ? 'Carregando a frota...' : 'Não foi possível carregar os veículos.'}</div>`; return; }
    const r = listarVeiculos(v.veiculos, v.manutencoes, v.preventivaPorVeiculo, v.pendencias, { busca: state.busca, filtro: state.filtro, coordenacao: state.coordenacao, supervisao: state.supervisao });
    root.querySelector('[data-kpis]').innerHTML = SITUACOES_VEICULO.map((s) => cardFiltro({ filtro: s.id, tone: s.tone, icone: s.id === 'parado' ? 'carro' : s.id === 'andamento' ? 'ferramenta' : s.id === 'documentos' ? 'doc' : s.id === 'todos' ? 'total' : s.id === 'vencida' ? 'erro' : 'relogio', label: s.rotulo, dica: s.dica, ativo: s.id === state.filtro, valor: String(r.contagem[s.id] ?? 0) })).join('');
    sincronizarCards(root, state.filtro);
    area.innerHTML = r.lista.length ? r.lista.map(htmlLinha).join('') : '<div class="fm-empty">Nenhum veículo neste filtro.</div>';
    root.querySelector('[data-contagem]').textContent = `${r.lista.length} veículo(s)`;
  }

  // ---------- prontuário ----------
  const rotuloResp = { empresa: 'Empresa', locadora: 'Locadora', colaborador: 'Colaborador', proprietario: 'Proprietário' };

  function htmlHistorico(lista) {
    if (!lista.length) return '<div class="fm-ok-vazio" style="color:#94a3b8">Nenhuma manutenção encerrada deste veículo ainda.</div>';
    return `<ul class="fm-hist">${lista.map((m) => {
      const grupos = [...new Set(state.itens.filter((i) => i.manutencao_id === m.id).map((i) => nomeDoGrupoDaCategoria({ categorias: state.categorias, grupos: state.grupos }, i.categoria_codigo)).filter(Boolean))];
      const data = m.status === 'concluida' ? (m.data_execucao || m.concluida_em) : (m.concluida_em || m.solicitado_em);
      const valor = m.status === 'concluida' && m.custo != null && Number(m.custo) > 0 ? esc(dinheiro(m.custo)) : '';
      return `<li role="button" tabindex="0" data-ficha="${esc(m.id)}"><time>${esc(dataCurta(data))}</time>
        <div><strong>${esc(m.descricao || 'Sem descrição')}</strong><span class="fm-mm">${esc(codigoManutencao(m))}${grupos.length ? ` · ${esc(grupos.join(', '))}` : ''}${m.oficina ? ` · ${esc(m.oficina)}` : ''}${m.km_execucao ? ` · ${esc(fmtKm(m.km_execucao))}` : ''}</span></div>
        <div class="fm-hist-fim">${natureza(m.natureza)}<span class="fm-badge ${statusInfo(m.status).tone}">${esc(statusInfo(m.status).label)}</span>${valor ? `<span>${valor}</span>` : ''}</div></li>`;
    }).join('')}</ul>`;
  }

  function htmlAbertas(lista) {
    if (!lista.length) return '<div class="fm-ok-vazio">Nenhuma manutenção em andamento.</div>';
    return `<ul class="fm-hist">${lista.map((m) => {
      const dias = diasNaEtapa(m);
      return `<li role="button" tabindex="0" data-ficha="${esc(m.id)}"><time>${esc(dataCurta(desdeDaEtapa(m)))}</time>
        <div><strong>${esc(m.descricao || 'Sem descrição')}</strong><span class="fm-mm">${esc(codigoManutencao(m))}${m.oficina ? ` · ${esc(m.oficina)}` : ''}${dias != null ? ` · ${dias} dia(s) nesta etapa` : ''}${m.previsao_entrega ? ` · entrega ${esc(dataBR(m.previsao_entrega))}` : ''}</span></div>
        <div class="fm-hist-fim">${m.veiculo_parado && m.status === 'em_execucao' ? '<span class="fm-badge red">Parado</span>' : ''}${natureza(m.natureza)}<span class="fm-badge ${statusInfo(m.status).tone}">${esc(statusInfo(m.status).label)}</span></div></li>`;
    }).join('')}</ul>`;
  }

  function htmlServicos(p) {
    if (!p.servicosAtencao.length) return `<div class="fm-ok-vazio">${p.servicosEmDia || p.servicosSemHistorico ? 'Nenhum serviço vencido ou perto de vencer.' : 'Este veículo ainda não tem plano de preventiva.'}</div>`;
    return `<ul class="fm-servicos">${p.servicosAtencao.map((s) => `<li class="${esc(s.status)}"><span><strong style="display:inline">${esc(nomeCurto(s.plano_nome))}</strong><small>vence ${esc(venceTexto(s))}</small></span><span class="fm-badge ${s.status === 'vencida' ? 'red' : 'amber'}">${esc(restanteCelula(s) || (s.status === 'vencida' ? 'Vencida' : 'Próxima'))}</span></li>`).join('')}</ul>`;
  }

  function renderProntuario() {
    const root = state.root; const v = state.visao; if (!root || !v) return;
    const veic = v.veiculos.find((x) => x.id === state.veiculoId) || v.mapaVeiculos.get(state.veiculoId);
    const pg = root.querySelector('[data-pagina]');
    if (!veic) { voltar(); return; }
    const prev = v.preventivaPorVeiculo.get(veic.id) || null;
    const p = montarProntuario(veic, v.manutencoes, prev, v.pendencias);
    const k = p.kpis;
    const parada = p.parada;
    pg.innerHTML = `<div class="fm-pg-barra"><button class="fm-btn ghost" type="button" data-voltar>← Voltar para os veículos</button></div>
      <div class="fm-card"><div class="fm-body fm-pg fm-pg-larga">
        <div class="fm-pront-topo"><div><h3>${esc(veic.placa)}</h3><p>${esc(rotuloVeiculo(veic))}${veic.coordenacao ? ` · ${esc(veic.coordenacao)}` : ''}${veic.supervisao ? ` · ${esc(veic.supervisao)}` : ''}</p></div>
          <div class="fm-pront-acoes"><button class="fm-btn primary" type="button" data-nova>+ Nova manutenção</button>${prev ? '<button class="fm-btn soft" type="button" data-registrar>+ Registrar preventiva</button>' : ''}<button class="fm-btn ghost" type="button" data-ir-preventiva>Preventiva do veículo</button></div></div>
        ${parada ? `<div class="fm-pront-faixa"><span>🚧 Veículo parado na oficina${parada.entrada_oficina_em ? ` desde ${esc(dataCurta(parada.entrada_oficina_em))}` : ''}${parada.previsao_entrega ? ` · entrega prevista ${esc(dataBR(parada.previsao_entrega))}` : ' · sem previsão de entrega'}${parada.oficina ? ` · ${esc(parada.oficina)}` : ''}</span><button class="fm-btn ghost fm-mini" type="button" data-ficha="${esc(parada.id)}">Abrir a ficha</button></div>` : ''}
        <div class="fm-pront-dados">
          <div class="fm-sec" style="margin:0"><h4>Km atual</h4><div class="fm-ro">${esc(fmtKm(prev?.hodometro))}<small>pelo rastreador (BFleet)</small></div></div>
          <div class="fm-sec" style="margin:0"><h4>Condutor</h4><div class="fm-ro">${esc(veic.motorista_atual || '—')}</div></div>
          <div class="fm-sec" style="margin:0"><h4>Quem paga a manutenção</h4><div class="fm-ro">${esc(rotuloResp[veic.responsavel_manutencao] || 'A classificar')}</div></div>
          <div class="fm-sec" style="margin:0"><h4>Serviços no último ano</h4><div class="fm-ro">${k.qtdAno}<small>${k.corretivas} corretiva(s) · ${k.preventivas} preventiva(s)</small></div></div>
          <div class="fm-sec" style="margin:0"><h4>Custo no último ano</h4><div class="fm-ro">${esc(dinheiro(k.custoAno))}<small>só o que a empresa paga</small></div></div>
          <div class="fm-sec" style="margin:0"><h4>Último serviço</h4><div class="fm-ro">${k.ultima ? esc(dataBR(k.ultima)) : '—'}</div></div>
        </div>
        <div class="fm-pront-cols" style="margin-top:14px">
          <div>
            <section class="fm-sec"><h4><span>Em andamento</span><span class="fm-badge ${p.abertas.length ? 'amber' : 'green'}">${p.abertas.length}</span></h4>${htmlAbertas(p.abertas)}</section>
            <section class="fm-sec"><h4><span>Histórico de manutenções</span><span class="fm-badge">${p.historico.length}</span></h4><div data-historico>${htmlHistorico(p.historico)}</div></section>
          </div>
          <div>
            <section class="fm-sec"><h4><span>Preventiva · pede atenção</span><span class="fm-badge ${p.servicosAtencao.length ? 'red' : 'green'}">${p.servicosAtencao.length}</span></h4>${htmlServicos(p)}
              ${p.servicosSemHistorico ? `<p class="fm-mm" style="margin-top:10px">${p.servicosSemHistorico} serviço(s) do guia sem nenhuma execução registrada.</p>` : ''}</section>
            ${p.docs.length ? `<section class="fm-sec"><h4><span>Documentos pendentes</span><span class="fm-badge amber">${p.docs.length}</span></h4><p class="fm-mm">${p.docs.length} preventiva(s) registrada(s) com NF, comprovante ou envio ao Financeiro pendente.</p><button class="fm-btn soft fm-mini" type="button" data-ir-preventiva>Completar na Preventiva</button></section>` : ''}
          </div>
        </div></div></div>`;
  }

  async function carregarItensDoVeiculo() {
    const id = state.veiculoId; if (!id || !state.visao) return;
    const ids = state.visao.manutencoes.filter((m) => m.veiculo_id === id).map((m) => m.id);
    state.itens = await dados.carregarItensDeManutencoes(state.supabase, ids).catch(() => []);
    if (state.veiculoId === id) {
      const alvo = state.root?.querySelector('[data-historico]');
      if (alvo) alvo.innerHTML = htmlHistorico(montarProntuario(state.visao.veiculos.find((x) => x.id === id) || { id }, state.visao.manutencoes, null, []).historico);
    }
  }

  function abrir(veiculoId) {
    if (!state.root || !state.visao) return;
    state.veiculoId = veiculoId; state.itens = [];
    state.root.querySelector('[data-vista-lista]').hidden = true;
    const pg = state.root.querySelector('[data-pagina]'); pg.hidden = false;
    renderProntuario();
    state.root.scrollIntoView?.({ block: 'start' });
    carregarItensDoVeiculo();
  }

  function voltar() {
    state.veiculoId = null;
    const pg = state.root.querySelector('[data-pagina]'); pg.hidden = true; pg.innerHTML = '';
    state.root.querySelector('[data-vista-lista]').hidden = false;
    renderLista();
  }

  async function registrarPreventiva() {
    const v = state.visao; const id = state.veiculoId; if (!v || !id) return;
    const doVeiculo = montarLista(v.linhasPreventiva.filter((l) => l.veiculo_id === id), { tipo: 'todos', pendencias: v.pendencias }).veiculos[0];
    if (!doVeiculo) return toast('Este veículo não tem plano de preventiva.', 'err');
    const { abrirRegistro } = await import('./frotas-manutencao-preventiva-registro.js?v=20261029-frotas-manut54');
    await abrirRegistro({ supabase: state.supabase, veiculo: doVeiculo, planos: v.planos, aoConcluir: async () => { invalidarVisao(); await carregar({ forcar: true }); } });
  }

  async function carregar({ forcar = false } = {}) {
    state.loading = true; if (!state.visao) renderLista();
    try { state.visao = await carregarVisao(state.supabase, { forcar }); }
    catch (err) { toast(err.message || 'Erro ao carregar os veículos.', 'err'); }
    state.loading = false;
    const v = state.visao;
    if (v) {
      const sel = (campo, atual, vazio) => `<option value="">${vazio}</option>${opcoesDe(v.veiculos, campo).map((o) => `<option value="${esc(o)}"${o === atual ? ' selected' : ''}>${esc(o)}</option>`).join('')}`;
      state.root.querySelector('[data-coordenacao]').innerHTML = sel('coordenacao', state.coordenacao, 'Todas as coordenações');
      state.root.querySelector('[data-supervisao]').innerHTML = sel('supervisao', state.supervisao, 'Todas as supervisões');
    }
    if (state.veiculoId) renderProntuario(); else renderLista();
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.root = container; state.visao = null; state.veiculoId = null;
    container.innerHTML = `${ESTILOS_MANUTENCAO}${ESTILOS_VISAO}<div data-vista-lista><section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" type="button" data-atualizar>↻ Atualizar</button><button class="fm-btn primary" type="button" data-nova-geral>+ Nova manutenção</button></div></div>
      <div class="fm-kpis" data-kpis></div>
      <div class="fm-card"><div class="fm-body"><div class="fm-filtros"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar por placa, modelo, condutor, coordenação..." data-busca></div>
        <select class="fm-select" data-coordenacao><option value="">Todas as coordenações</option></select>
        <select class="fm-select" data-supervisao><option value="">Todas as supervisões</option></select></div>
        <div class="fm-contagem"><span class="fm-count" data-contagem></span></div>
        <div class="fm-vl-cab"><span>Veículo</span><span>Coordenação · condutor</span><span>Km</span><span>Situação</span><span>Mais urgente</span><span style="text-align:right">Custo 12 meses</span></div>
        <div class="fm-vl-lista" data-linhas></div>
        <div class="fm-nota">Clique numa placa para abrir o prontuário: manutenções em andamento, histórico de serviços, custo e o que vence na preventiva. A lista começa pelos veículos que mais precisam de atenção (parados, com manutenção aberta, preventiva vencida).</div></div></div></section></div>
      <div class="fm-pagina fm-mod" data-pagina hidden></div>`;

    container.querySelector('[data-atualizar]').addEventListener('click', () => { invalidarVisao(); carregar({ forcar: true }); });
    container.querySelector('[data-nova-geral]').addEventListener('click', () => abrirNovaManutencao({}));
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; renderLista(); });
    container.querySelector('[data-coordenacao]').addEventListener('change', (e) => { state.coordenacao = e.target.value; renderLista(); });
    container.querySelector('[data-supervisao]').addEventListener('change', (e) => { state.supervisao = e.target.value; renderLista(); });
    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: renderLista });
    container.querySelector('[data-linhas]').addEventListener('click', (e) => { const l = e.target.closest('[data-veic]'); if (l) abrir(l.dataset.veic); });
    container.querySelector('[data-linhas]').addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-veic]')) { e.preventDefault(); abrir(e.target.dataset.veic); }
    });
    const pagina = container.querySelector('[data-pagina]');
    pagina.addEventListener('click', (e) => {
      if (e.target.closest('[data-voltar]')) return voltar();
      if (e.target.closest('[data-nova]')) return abrirNovaManutencao({ veiculo_id: state.veiculoId });
      if (e.target.closest('[data-registrar]')) return registrarPreventiva();
      if (e.target.closest('[data-ir-preventiva]')) return abrirPreventiva();
      const ficha = e.target.closest('[data-ficha]'); if (ficha) abrirFicha(ficha.dataset.ficha);
    });
    pagina.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-ficha]')) { e.preventDefault(); abrirFicha(e.target.dataset.ficha); }
    });

    // Aberto por outra aba (placa do Painel, botão da ficha): o pedido vem em window.
    const pedido = window.FROTAS_MANUT_VEICULO_ABRIR;
    window.FROTAS_MANUT_VEICULO_ABRIR = null;
    await carregar();
    if (pedido && state.visao) abrir(pedido);
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
  window[MODULE_NAME].abrir = abrir;
})();
