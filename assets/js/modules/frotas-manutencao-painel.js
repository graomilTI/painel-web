// Frotas · Manutenção › Painel: dashboard da frota. Poucos números no topo, dois gráficos (custo por mês e manutenções por etapa),
// a saúde da preventiva, os maiores custos e o que pede atenção. A lista completa das manutenções fica na aba Corretiva.
import { dataBR, dinheiro, esc, toast } from '../core/ui.js';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261030-frotas-manut-url';
import { ESTILOS_VISAO, linkPlaca } from './frotas-manutencao-visao-estilos.js?v=20261030-frotas-manut-url';
import {
  SAUDE, contarSaude, custoDoMes, custoPorMes, filtrarPorVeiculos, hojeBrasil, listarParados, maioresCustos, montarAlertas, montarQuadro, opcoesDe, estaAberta, tempoMedioOficina,
} from './frotas-manutencao-visao-regras.js?v=20261030-frotas-manut-url';
import { abrirFicha, abrirNovaManutencao, abrirPreventiva, abrirProntuario, carregarVisao, invalidarVisao, irCorretiva } from './frotas-manutencao-visao-dados.js?v=20261030-frotas-manut-url';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_PAINEL';
  const LIMITE_PARADOS = 5; const LIMITE_ALERTAS = 5;
  const state = { supabase: null, root: null, visao: null, loading: false, coordenacao: '', supervisao: '', todosParados: false, todosAlertas: false };

  const dataCurta = (iso) => (iso ? dataBR(iso) : '—');
  // R$ 1.234 → "R$ 1,2 mil"; abaixo de mil, o valor inteiro. Eixos e rótulos curtos; o valor exato vai na dica.
  function moedaCurta(v) {
    const n = Number(v) || 0;
    if (n >= 1000000) return `R$ ${(n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (n >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
  }
  const nomeMes = (aaaamm) => new Date(`${aaaamm}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  // Teto do eixo: o próximo número "redondo" acima do maior valor (1, 2, 2,5, 5 × 10^n).
  function tetoEixo(max) {
    if (!(max > 0)) return 1;
    const base = 10 ** Math.floor(Math.log10(max));
    return ([1, 2, 2.5, 5, 10].map((f) => f * base).find((t) => t >= max)) || max;
  }

  // ---------- peças do dashboard ----------
  function htmlFaixa({ parados, andamento, atencao, custo, anterior, tempo }) {
    const delta = anterior > 0 ? Math.round(((custo.total - anterior) / anterior) * 100) : null;
    const dica = delta == null ? `${custo.qtd} serviço(s) concluído(s)` : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% sobre o mês anterior`;
    const cel = (valor, rotulo, nota, tom = '') => `<div class="fm-fx"><span>${esc(rotulo)}</span><strong class="${tom}">${valor}</strong><small>${nota}</small></div>`;
    return `<div class="fm-faixa">${cel(parados, 'Parados agora', parados ? 'veículos na oficina' : 'nenhum na oficina', parados ? 'red' : '')}
      ${cel(andamento, 'Em andamento', 'manutenções abertas')}
      ${cel(atencao, 'Pedem atenção', atencao ? 'veja a lista abaixo' : 'tudo no prazo', atencao ? 'amber' : '')}
      ${cel(esc(moedaCurta(custo.total)), 'Custo no mês', esc(dica))}
      ${cel(tempo == null ? '—' : `${tempo.toLocaleString('pt-BR')} d`, 'Tempo médio na oficina', 'concluídas nos últimos 90 dias')}</div>`;
  }

  // Colunas empilhadas por mês (preventiva embaixo, corretiva em cima), grade leve e dica ao passar o mouse.
  function htmlCustoMensal(meses) {
    const max = Math.max(...meses.map((m) => m.total));
    if (!(max > 0)) return '<div class="fm-graf-vazio">Ainda não há manutenção concluída com custo nos últimos 6 meses.</div>';
    const teto = tetoEixo(max);
    const grade = [1, 0.5].map((f) => `<div class="fm-grade" style="bottom:${f * 100}%"><span>${esc(moedaCurta(teto * f))}</span></div>`).join('');
    const colunas = meses.map((m) => {
      const h = (v) => `${(v / teto) * 100}%`;
      const dica = `${nomeMes(m.mes)}: ${dinheiro(m.total)} em ${m.qtd} serviço(s) — corretiva ${dinheiro(m.corretiva)}, preventiva ${dinheiro(m.preventiva)}`;
      return `<div class="fm-mes" data-tip="${esc(dica)}" tabindex="0" aria-label="${esc(dica)}">
        <div class="fm-mes-pilha">${m.corretiva ? `<i class="corretiva" style="height:${h(m.corretiva)}"></i>` : ''}${m.preventiva ? `<i class="preventiva" style="height:${h(m.preventiva)}"></i>` : ''}</div>
        <span class="fm-mes-nome">${esc(nomeMes(m.mes))}</span></div>`;
    }).join('');
    return `<div class="fm-graf-cols"><div class="fm-graf-area">${grade}<div class="fm-mes-lista">${colunas}</div></div></div>
      <div class="fm-legenda"><span><i class="corretiva"></i>Corretiva</span><span><i class="preventiva"></i>Preventiva</span></div>`;
  }

  // Barras horizontais com rótulo à esquerda e valor à direita. itens: [{ rotulo, valor, texto, extra?, tip, alvo? }]
  function htmlBarras(itens, { vazio, cor = 'azul' }) {
    if (!itens.length) return `<div class="fm-graf-vazio">${esc(vazio)}</div>`;
    const max = Math.max(...itens.map((i) => i.valor), 1);
    return `<div class="fm-barras">${itens.map((i) => {
      const rotulo = i.alvo ? `<button type="button" class="fm-placa" ${i.alvo}>${esc(i.rotulo)}</button>` : `<span>${esc(i.rotulo)}</span>`;
      const extra = i.extra ? `<i class="atraso" style="width:${(i.extra / max) * 100}%"></i>` : '';
      return `<div class="fm-barra" data-tip="${esc(i.tip)}"><div class="fm-barra-rot">${rotulo}</div><div class="fm-barra-trilho">${i.valor - (i.extra || 0) > 0 ? `<i class="${cor}" style="width:${((i.valor - (i.extra || 0)) / max) * 100}%"></i>` : ''}${extra}</div><div class="fm-barra-val">${esc(i.texto)}</div></div>`;
    }).join('')}</div>`;
  }

  function htmlSaude(cont, total) {
    if (!total) return '<div class="fm-graf-vazio">Nenhum veículo com plano de preventiva.</div>';
    const barra = SAUDE.map((s) => (cont[s.id] ? `<i class="tone-${s.tone}" style="flex:${cont[s.id]}" data-tip="${esc(`${s.rotulo}: ${cont[s.id]} veículo(s)`)}"></i>` : '')).join('');
    const pct = (n) => `${Math.round((n / total) * 100)}%`;
    return `<div class="fm-saude-barra">${barra}</div><ul class="fm-saude-leg">${SAUDE.map((s) => `<li><span class="fm-dot tone-${s.tone}"></span>${esc(s.rotulo)}<b>${cont[s.id]}</b><em>${pct(cont[s.id])}</em></li>`).join('')}</ul>`;
  }

  function htmlAlertas(alertas) {
    if (!alertas.length) return '<div class="fm-ok-vazio">Nada pedindo atenção agora.</div>';
    const lista = state.todosAlertas ? alertas : alertas.slice(0, LIMITE_ALERTAS);
    const mais = alertas.length > LIMITE_ALERTAS ? `<button class="fm-link" type="button" data-todos-alertas>${state.todosAlertas ? 'Mostrar só os mais graves' : `Ver os ${alertas.length} alertas`}</button>` : '';
    return `<ul class="fm-alertas">${lista.map((a) => `<li class="${a.tom}" role="button" tabindex="0" data-ficha="${esc(a.manutencao_id)}"><strong>${esc(a.titulo)}</strong><span>${esc(a.detalhe)}</span></li>`).join('')}</ul>${mais}`;
  }

  function htmlParados(todos) {
    if (!todos.length) return '<div class="fm-ok-vazio">Nenhum veículo parado na oficina.</div>';
    const lista = state.todosParados ? todos : todos.slice(0, LIMITE_PARADOS);
    const mais = todos.length > LIMITE_PARADOS ? `<button class="fm-link" type="button" data-todos-parados>${state.todosParados ? 'Mostrar só os mais antigos' : `Ver os ${todos.length} parados`}</button>` : '';
    return `<table class="fm-table fm-tab-curta"><thead><tr><th>Veículo</th><th>Parado há</th><th>Entrega</th></tr></thead><tbody>${lista.map((p) => {
      const entrega = p.previsao
        ? `<span class="${p.entregaAtrasada ? 'fm-venc' : ''}">${esc(dataCurta(p.previsao))}</span><span class="fm-mm">${p.diasParaEntrega < 0 ? `${-p.diasParaEntrega} dia(s) de atraso` : p.diasParaEntrega === 0 ? 'hoje' : `em ${p.diasParaEntrega} dia(s)`}</span>`
        : '<span class="fm-vazio-aviso">Sem previsão</span>';
      return `<tr class="fm-linha" data-ficha="${esc(p.id)}"><td>${linkPlaca(p.placa, p.veiculo_id)}<span class="fm-mm">${esc(p.oficina || p.modelo)}</span></td><td>${p.diasParado != null ? `${p.diasParado} dia(s)` : '—'}<span class="fm-mm">desde ${esc(dataCurta(p.desde))}</span></td><td>${entrega}</td></tr>`;
    }).join('')}</tbody></table>${mais}`;
  }

  // ---------- desenho ----------
  const opcoesSelect = (lista, atual, vazio) => `<option value="">${esc(vazio)}</option>${lista.map((o) => `<option value="${esc(o)}"${o === atual ? ' selected' : ''}>${esc(o)}</option>`).join('')}`;
  const card = (titulo, corpo, { acao = '', cls = '' } = {}) => `<section class="fm-dash-card ${cls}"><header><h4>${esc(titulo)}</h4>${acao}</header>${corpo}</section>`;

  function render() {
    const root = state.root; if (!root) return;
    const v = state.visao;
    if (!v) { root.querySelector('[data-corpo]').innerHTML = `<div class="fm-empty">${state.loading ? 'Carregando o painel da frota...' : 'Não foi possível carregar o painel.'}</div>`; return; }
    const hoje = hojeBrasil();
    const filtro = { coordenacao: state.coordenacao, supervisao: state.supervisao };
    const man = filtrarPorVeiculos(v.manutencoes, v.mapaVeiculos, filtro);
    const veiculos = v.veiculos.filter((x) => (!filtro.coordenacao || x.coordenacao === filtro.coordenacao) && (!filtro.supervisao || x.supervisao === filtro.supervisao));
    const parados = listarParados(man, v.mapaVeiculos, hoje);
    const alertas = montarAlertas(man, v.mapaVeiculos, hoje);
    const quadro = montarQuadro(man, v.mapaVeiculos, {}, hoje);
    const idsAtivos = new Set(veiculos.filter((x) => String(x.status).toUpperCase() === 'ATIVO').map((x) => x.id));
    const saude = contarSaude(v.preventivaPorVeiculo, idsAtivos);
    const totalSaude = Object.values(saude).reduce((s, n) => s + n, 0);
    const mesAtual = hoje.slice(0, 7);
    const mesAnterior = new Date(Date.UTC(Number(mesAtual.slice(0, 4)), Number(mesAtual.slice(5)) - 2, 1)).toISOString().slice(0, 7);
    const etapas = quadro.colunas.map((c) => ({
      rotulo: c.titulo, valor: c.itens.length, extra: c.atrasadas, texto: c.atrasadas ? `${c.itens.length} · ${c.atrasadas} atrasada(s)` : String(c.itens.length),
      tip: `${c.titulo}: ${c.itens.length} manutenção(ões)${c.atrasadas ? `, ${c.atrasadas} passou do prazo esperado` : ''}. ${c.dica}`,
    }));
    const oficinas = maioresCustos(man, v.mapaVeiculos, 'oficina').map((g) => ({ rotulo: g.rotulo, valor: g.total, texto: moedaCurta(g.total), tip: `${g.rotulo}: ${dinheiro(g.total)} em ${g.qtd} serviço(s) nos últimos 12 meses` }));
    const placas = maioresCustos(man, v.mapaVeiculos, 'veiculo').map((g) => {
      const veic = veiculos.find((x) => x.placa === g.rotulo);
      return { rotulo: g.rotulo, valor: g.total, texto: moedaCurta(g.total), alvo: veic ? `data-prontuario="${esc(veic.id)}"` : '', tip: `${g.rotulo}: ${dinheiro(g.total)} em ${g.qtd} serviço(s) nos últimos 12 meses` };
    });
    const emAndamento = man.filter(estaAberta).length;

    root.querySelector('[data-corpo]').innerHTML = `
      ${htmlFaixa({ parados: parados.length, andamento: emAndamento, atencao: alertas.length, custo: custoDoMes(man, mesAtual), anterior: custoDoMes(man, mesAnterior).total, tempo: tempoMedioOficina(man) })}
      <div class="fm-dash-grade">
        ${card('Custo por mês', htmlCustoMensal(custoPorMes(man)), { cls: 'c7', acao: '<span class="fm-mm">últimos 6 meses · pago pela empresa</span>' })}
        ${card('Manutenções por etapa', htmlBarras(etapas, { vazio: 'Nenhuma manutenção em andamento.' }), { cls: 'c5', acao: '<button class="fm-link" type="button" data-ir-corretiva>Abrir a lista →</button>' })}
        ${card('Preventiva da frota', htmlSaude(saude, totalSaude), { cls: 'c4', acao: '<button class="fm-link" type="button" data-ir-preventiva>Ver preventiva →</button>' })}
        ${card('Maiores custos por oficina', htmlBarras(oficinas, { vazio: 'Sem custo concluído nos últimos 12 meses.', cor: 'violeta' }), { cls: 'c4', acao: '<span class="fm-mm">12 meses</span>' })}
        ${card('Maiores custos por veículo', htmlBarras(placas, { vazio: 'Sem custo concluído nos últimos 12 meses.', cor: 'violeta' }), { cls: 'c4', acao: '<span class="fm-mm">12 meses</span>' })}
        ${card('Pedem atenção', htmlAlertas(alertas), { cls: 'c6', acao: `<span class="fm-badge ${alertas.length ? 'amber' : 'green'}">${alertas.length}</span>` })}
        ${card('Parados agora', htmlParados(parados), { cls: 'c6', acao: `<span class="fm-badge ${parados.length ? 'red' : 'green'}">${parados.length}</span>` })}
      </div>`;
    // as opções dos filtros acompanham os veículos
    root.querySelector('[data-coordenacao]').innerHTML = opcoesSelect(opcoesDe(v.veiculos, 'coordenacao'), state.coordenacao, 'Todas as coordenações');
    root.querySelector('[data-supervisao]').innerHTML = opcoesSelect(opcoesDe(v.veiculos, 'supervisao'), state.supervisao, 'Todas as supervisões');
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
      <div class="fm-topo fm-topo-dash"><div class="fm-filtros-dash"><select class="fm-select" data-coordenacao aria-label="Coordenação"><option value="">Todas as coordenações</option></select><select class="fm-select" data-supervisao aria-label="Supervisão"><option value="">Todas as supervisões</option></select></div>
        <div class="fm-head-actions"><button class="fm-btn soft" type="button" data-atualizar>↻ Atualizar</button><button class="fm-btn primary" type="button" data-nova>+ Nova manutenção</button></div></div>
      <div data-corpo></div></section>`;
    container.querySelector('[data-atualizar]').addEventListener('click', () => { invalidarVisao(); carregar({ forcar: true }); });
    container.querySelector('[data-nova]').addEventListener('click', () => abrirNovaManutencao({}));
    // Ouvintes no bloco interno: o corpo da aba é reaproveitado ao trocar de aba e ouvintes nele se acumulariam.
    const raiz = container.querySelector('.fm-shell');
    raiz.addEventListener('click', (e) => {
      if (e.target.closest('[data-ir-preventiva]')) return abrirPreventiva();
      if (e.target.closest('[data-ir-corretiva]')) return irCorretiva();
      if (e.target.closest('[data-todos-parados]')) { state.todosParados = !state.todosParados; return render(); }
      if (e.target.closest('[data-todos-alertas]')) { state.todosAlertas = !state.todosAlertas; return render(); }
      const placa = e.target.closest('[data-prontuario]'); if (placa) return abrirProntuario(placa.dataset.prontuario);
      const ficha = e.target.closest('[data-ficha]'); if (ficha) abrirFicha(ficha.dataset.ficha);
    });
    raiz.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-ficha]')) { e.preventDefault(); abrirFicha(e.target.dataset.ficha); }
    });
    raiz.addEventListener('change', (e) => {
      if (e.target.matches?.('[data-coordenacao]')) { state.coordenacao = e.target.value; render(); }
      if (e.target.matches?.('[data-supervisao]')) { state.supervisao = e.target.value; render(); }
    });
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
