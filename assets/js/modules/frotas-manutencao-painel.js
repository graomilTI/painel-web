// Frotas · Manutenção › Painel: visão de conjunto da frota. Indicadores do dia, alertas, veículos parados, quadro por etapa
// (solicitada → orçamento → aprovação → OS → oficina) e a saúde da preventiva. Clicar num cartão abre a ficha na aba Corretiva.
import { dataBR, dinheiro, esc, toast } from '../core/ui.js';
import { cardFiltro } from './frotas-ui-lista.js?v=20261020-frotas-manut44';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261020-frotas-manut44';
import { ESTILOS_VISAO, linkPlaca } from './frotas-manutencao-visao-estilos.js?v=20261020-frotas-manut44';
import { PRIORIDADES } from './frotas-manutencao-regras.js?v=20261020-frotas-manut44';
import {
  FILTROS_VAZIOS, SAUDE, contarSaude, custoDoMes, hojeBrasil, listarParados, montarAlertas, montarQuadro, opcoesDe, estaAberta,
} from './frotas-manutencao-visao-regras.js?v=20261020-frotas-manut44';
import { abrirFicha, abrirNovaManutencao, abrirPreventiva, abrirProntuario, carregarVisao, invalidarVisao } from './frotas-manutencao-visao-dados.js?v=20261020-frotas-manut44';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_PAINEL';
  const state = { supabase: null, root: null, visao: null, filtros: { ...FILTROS_VAZIOS }, loading: false };

  const rotuloPrioridade = (id) => PRIORIDADES.find((p) => p.id === id)?.label || id;
  const dataCurta = (iso) => (iso ? dataBR(iso) : '—');

  // ---------- partes ----------
  function htmlCartao(c) {
    const aviso = c.entregaAtrasada ? '<span class="fm-badge red" title="A previsão de entrega já passou">Entrega atrasada</span>'
      : c.atrasada ? `<span class="fm-badge amber" title="Mais tempo nesta etapa do que o esperado">${c.dias} dia(s) aqui</span>`
      : c.dias != null && c.dias > 0 ? `<span class="fm-mm">${c.dias} dia(s) nesta etapa</span>` : '<span class="fm-mm">Entrou hoje</span>';
    const chips = [
      c.parado ? '<span class="fm-badge red">Parado</span>' : '',
      ['alta', 'urgente'].includes(c.prioridade) ? `<span class="fm-badge ${c.prioridade === 'urgente' ? 'red' : 'amber'}">${esc(rotuloPrioridade(c.prioridade))}</span>` : '',
      c.reprovada ? '<span class="fm-badge red">Reprovada</span>' : '',
      c.natureza ? `<span class="fm-badge ${c.natureza === 'preventiva' ? 'green' : 'blue'}">${c.natureza === 'preventiva' ? 'Preventiva' : 'Corretiva'}</span>` : '',
    ].join('');
    const rodape = [
      c.status === 'em_execucao' ? (c.previsao ? `Entrega ${esc(dataCurta(c.previsao))}` : '<span class="fm-vazio-aviso">Sem previsão de entrega</span>') : '',
      c.valor != null ? esc(dinheiro(c.valor)) : '',
      c.oficina ? esc(c.oficina) : '',
    ].filter(Boolean).join(' · ');
    return `<article class="fm-qd${c.atrasada || c.entregaAtrasada ? ' atraso' : ''}${c.parado ? ' parado' : ''}" role="button" tabindex="0" data-ficha="${esc(c.id)}">
      <header>${linkPlaca(c.placa, c.veiculo_id)}${aviso}</header>
      <p>${esc(c.descricao || 'Sem descrição')}</p>
      <div class="fm-qd-chips">${chips}</div>
      <footer><span>${esc(c.modelo)}${c.coordenacao ? ` · ${esc(c.coordenacao)}` : ''}</span>${rodape ? `<span>${rodape}</span>` : ''}</footer>
    </article>`;
  }

  function htmlQuadro(q) {
    if (!q.total) return '<div class="fm-empty">Nenhuma manutenção em andamento neste filtro.</div>';
    return `<div class="fm-quadro">${q.colunas.map((col) => `<section class="fm-col tone-${col.tone}" title="${esc(col.dica)}">
      <h4><span>${esc(col.titulo)}</span><span class="fm-col-n">${col.itens.length}</span>${col.atrasadas ? `<span class="fm-badge red" title="Cartões que passaram do prazo">${col.atrasadas} atrasada(s)</span>` : ''}</h4>
      <div class="fm-col-corpo">${col.itens.length ? col.itens.map(htmlCartao).join('') : '<div class="fm-col-vazio">Nada aqui</div>'}</div></section>`).join('')}</div>`;
  }

  function htmlAlertas(alertas) {
    if (!alertas.length) return '<div class="fm-ok-vazio">Nada pedindo atenção agora. 👌</div>';
    return `<ul class="fm-alertas">${alertas.slice(0, 12).map((a) => `<li class="${a.tom}" role="button" tabindex="0" data-ficha="${esc(a.manutencao_id)}"><strong>${esc(a.titulo)}</strong><span>${esc(a.detalhe)}</span></li>`).join('')}</ul>${alertas.length > 12 ? `<p class="fm-mm">+ ${alertas.length - 12} alerta(s) — filtre por "Só atrasadas" no quadro.</p>` : ''}`;
  }

  function htmlParados(lista) {
    if (!lista.length) return '<div class="fm-ok-vazio">Nenhum veículo parado na oficina.</div>';
    return `<table class="fm-table fm-tab-curta"><thead><tr><th>Veículo</th><th>Parado há</th><th>Entrega</th><th>Oficina</th></tr></thead><tbody>${lista.map((p) => {
      const entrega = p.previsao
        ? `<span class="${p.entregaAtrasada ? 'fm-venc' : ''}">${esc(dataCurta(p.previsao))}</span><span class="fm-mm">${p.diasParaEntrega < 0 ? `${-p.diasParaEntrega} dia(s) de atraso` : p.diasParaEntrega === 0 ? 'hoje' : `em ${p.diasParaEntrega} dia(s)`}</span>`
        : '<span class="fm-vazio-aviso">Sem previsão</span>';
      return `<tr class="fm-linha" data-ficha="${esc(p.id)}"><td>${linkPlaca(p.placa, p.veiculo_id)}<span class="fm-mm">${esc(p.modelo)}</span></td><td>${p.diasParado != null ? `${p.diasParado} dia(s)` : '—'}<span class="fm-mm">desde ${esc(dataCurta(p.desde))}</span></td><td>${entrega}</td><td>${esc(p.oficina || '—')}</td></tr>`;
    }).join('')}</tbody></table>`;
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
      <section class="fm-sec fm-sec-quadro"><h4><span>Quadro das manutenções em andamento</span><span class="fm-mm">${quadro.total} manutenção(ões)</span></h4>
        <div class="fm-bar fm-bar-quadro">
          <div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" data-f="busca" placeholder="Buscar placa, descrição, oficina, quem pediu..." value="${esc(state.filtros.busca)}"></div>
          <select class="fm-select" data-f="coordenacao" style="width:auto">${opcoesSelect(opcoesDe(v.veiculos, 'coordenacao'), state.filtros.coordenacao, 'Todas as coordenações')}</select>
          <select class="fm-select" data-f="supervisao" style="width:auto">${opcoesSelect(opcoesDe(v.veiculos, 'supervisao'), state.filtros.supervisao, 'Todas as supervisões')}</select>
          <select class="fm-select" data-f="natureza" style="width:auto"><option value="">Corretiva e preventiva</option><option value="corretiva"${state.filtros.natureza === 'corretiva' ? ' selected' : ''}>Só corretiva</option><option value="preventiva"${state.filtros.natureza === 'preventiva' ? ' selected' : ''}>Só preventiva</option></select>
          <label class="fm-check"><input type="checkbox" data-f="so_parados"${state.filtros.so_parados ? ' checked' : ''}> Só parados</label>
          <label class="fm-check"><input type="checkbox" data-f="so_atrasadas"${state.filtros.so_atrasadas ? ' checked' : ''}> Só atrasadas</label>
        </div>
        <div data-quadro>${htmlQuadro(quadro)}</div></section>
      <div class="fm-nota">Cada cartão mostra há quantos dias a manutenção está na etapa. Fica em destaque quando passa do prazo esperado (solicitada 2 dias, orçamento 3, aprovação 2, emitir OS 3, oficina 15). Clique num cartão para abrir a ficha; a placa leva ao prontuário do veículo na aba Veículos.</div>`;
  }

  // Só o quadro é refeito ao filtrar (a busca mantém o foco no campo).
  function renderQuadro() {
    const v = state.visao; if (!v) return;
    const quadro = montarQuadro(v.manutencoes, v.mapaVeiculos, state.filtros, hojeBrasil());
    state.root.querySelector('[data-quadro]').innerHTML = htmlQuadro(quadro);
    const n = state.root.querySelector('.fm-sec-quadro h4 .fm-mm'); if (n) n.textContent = `${quadro.total} manutenção(ões)`;
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
      const placa = e.target.closest('[data-prontuario]'); if (placa) return abrirProntuario(placa.dataset.prontuario);
      const ficha = e.target.closest('[data-ficha]'); if (ficha) abrirFicha(ficha.dataset.ficha);
    });
    raiz.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-ficha]')) { e.preventDefault(); abrirFicha(e.target.dataset.ficha); }
    });
    const mudou = (e) => {
      const f = e.target.closest?.('[data-f]'); if (!f) return;
      state.filtros[f.dataset.f] = f.type === 'checkbox' ? f.checked : f.value;
      renderQuadro();
    };
    raiz.addEventListener('input', (e) => { if (e.target.matches?.('input[data-f][type="text"],input[data-f]:not([type])')) mudou(e); });
    raiz.addEventListener('change', (e) => { if (!e.target.matches?.('input[data-f][type="text"],input[data-f]:not([type])')) mudou(e); });
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
