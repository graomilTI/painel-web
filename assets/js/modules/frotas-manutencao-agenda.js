// Frotas · Manutenção › Agenda: calendário do mês com as entradas na oficina, as previsões de entrega, os serviços concluídos e os
// vencimentos da preventiva. Ao lado: o dia clicado no calendário (com tudo o que acontece nele), quem está na oficina e as OS sem
// previsão de entrega, onde a data pode ser preenchida na hora.
import { dataBR, esc, toast } from '../core/ui.js';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261030-frotas-aprovar2';
import { ESTILOS_VISAO, linkPlaca } from './frotas-manutencao-visao-estilos.js?v=20261030-frotas-aprovar2';
import * as dados from './frotas-manutencao-dados.js?v=20261030-frotas-aprovar2';
import {
  TIPOS_EVENTO, eventosDaAgenda, gradeDoMes, hojeBrasil, naOficina, semPrevisao,
} from './frotas-manutencao-visao-regras.js?v=20261030-frotas-aprovar2';
import { abrirFicha, abrirProntuario, carregarVisao, invalidarVisao } from './frotas-manutencao-visao-dados.js?v=20261030-frotas-aprovar2';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_AGENDA';
  const MAX_POR_DIA = 3;
  const state = {
    supabase: null, root: null, visao: null, loading: false, ocupado: false,
    ano: 0, mes: 0, tipos: new Set(['entrada', 'entrega', 'atraso', 'concluida', 'vence']), dia: '', expandidos: new Set(),
  };

  const nomeMes = (ano, mes) => {
    const t = new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

  function eventosDoMes() {
    const v = state.visao; if (!v) return new Map();
    const semanas = gradeDoMes(state.ano, state.mes);
    const inicio = semanas[0][0].iso; const fim = semanas[semanas.length - 1][6].iso;
    const todos = eventosDaAgenda(v.manutencoes, v.mapaVeiculos, v.linhasPreventiva, { inicio, fim });
    const filtrado = new Map();
    for (const [dia, lista] of todos) {
      const ok = lista.filter((e) => state.tipos.has(e.tipo));
      if (ok.length) filtrado.set(dia, ok);
    }
    return filtrado;
  }

  const textoEvento = (e) => `${e.placa} · ${e.tipo === 'vence' ? e.texto : (TIPOS_EVENTO[e.tipo]?.rotulo || e.tipo)}`;

  function htmlEvento(e) {
    const tone = TIPOS_EVENTO[e.tipo]?.tone || 'blue';
    const alvo = e.manutencao_id ? `data-ficha="${esc(e.manutencao_id)}"` : `data-prontuario="${esc(e.veiculo_id)}"`;
    return `<button type="button" class="fm-cal-ev ${tone}" ${alvo} title="${esc(`${e.placa} · ${TIPOS_EVENTO[e.tipo]?.rotulo || ''}${e.texto ? ` · ${e.texto}` : ''}`)}">${esc(textoEvento(e))}</button>`;
  }

  function htmlCalendario(eventos) {
    const hoje = hojeBrasil();
    const semanas = gradeDoMes(state.ano, state.mes);
    const dias = semanas.flat().map((d) => {
      const lista = eventos.get(d.iso) || [];
      const aberto = state.expandidos.has(d.iso);
      // Vencimentos da preventiva podem ser dezenas por dia: fechados, viram um só item que abre a lista do dia.
      const vencem = lista.filter((e) => e.tipo === 'vence');
      const demais = lista.filter((e) => e.tipo !== 'vence');
      const mostrados = aberto ? lista : demais.slice(0, MAX_POR_DIA);
      const grupo = !aberto && vencem.length ? `<button type="button" class="fm-cal-ev purple" data-mais="${d.iso}" title="Mostrar os vencimentos do dia">${vencem.length} preventiva${vencem.length > 1 ? 's' : ''} vence${vencem.length > 1 ? 'm' : ''}</button>` : '';
      return `<div class="fm-cal-dia${d.doMes ? '' : ' fora'}${d.iso === hoje ? ' hoje' : ''}${d.iso === state.dia ? ' sel' : ''}" data-dia="${d.iso}" tabindex="0" aria-label="Ver os eventos de ${esc(dataBR(d.iso))}" aria-pressed="${d.iso === state.dia}"><div class="fm-cal-n"><span>${Number(d.iso.slice(8))}</span>${lista.length ? `<span class="fm-mm">${lista.length}</span>` : ''}</div>
        ${mostrados.map(htmlEvento).join('')}${grupo}${demais.length > MAX_POR_DIA && !aberto ? `<button type="button" class="fm-cal-mais" data-mais="${d.iso}">+ ${demais.length - MAX_POR_DIA} mais</button>` : ''}${aberto && lista.length > 1 ? `<button type="button" class="fm-cal-mais" data-menos="${d.iso}">recolher</button>` : ''}</div>`;
    }).join('');
    return `<div class="fm-cal">${SEMANA.map((s) => `<div class="fm-cal-sem">${s}</div>`).join('')}${dias}</div>`;
  }

  // Painel do dia clicado: todos os eventos do dia (respeitando os filtros da legenda), do mais urgente ao menos.
  function htmlDia(eventos) {
    const iso = state.dia; if (!iso) return '';
    const lista = eventos.get(iso) || [];
    const semana = new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
    const itens = lista.map((e) => {
      const t = TIPOS_EVENTO[e.tipo] || { rotulo: e.tipo, tone: 'blue' };
      const alvo = e.manutencao_id ? `data-ficha="${esc(e.manutencao_id)}"` : `data-prontuario="${esc(e.veiculo_id)}"`;
      return `<li class="fm-dia-ev" ${alvo} role="button" tabindex="0">${linkPlaca(e.placa, e.veiculo_id)}<span class="fm-badge ${t.tone}">${esc(t.rotulo)}</span>${e.texto ? `<span class="fm-mm fm-dia-ev-txt">${esc(e.texto)}</span>` : ''}</li>`;
    }).join('');
    const vazio = '<div class="fm-ok-vazio" style="color:#94a3b8">Nada neste dia.</div>';
    return `<section class="fm-sec" data-painel-dia><h4><span>${esc(dataBR(iso))} · ${esc(semana)}</span><span class="fm-badge ${lista.length ? 'blue' : 'green'}">${lista.length}</span></h4>
      ${lista.length ? `<ul class="fm-dia-lista">${itens}</ul>` : vazio}
      <button class="fm-btn ghost fm-mini" type="button" data-limpar-dia style="margin-top:8px">Fechar o dia</button></section>`;
  }

  function htmlNaOficina(lista) {
    if (!lista.length) return '<div class="fm-ok-vazio" style="color:#94a3b8">Nenhum veículo na oficina.</div>';
    return `<ul class="fm-dia-lista">${lista.map((c) => `<li data-ficha="${esc(c.id)}" role="button" tabindex="0">${linkPlaca(c.placa, c.veiculo_id)}<span>${esc(c.oficina || 'oficina não informada')}</span><small>${c.previsao ? `${c.entregaAtrasada ? '⚠ ' : ''}${esc(dataBR(c.previsao))}` : 'sem previsão'}</small></li>`).join('')}</ul>`;
  }

  function htmlSemPrevisao(lista) {
    if (!lista.length) return '<div class="fm-ok-vazio">Todas as OS na oficina têm previsão de entrega.</div>';
    return lista.map((c) => `<div class="fm-ag-prev"><div>${linkPlaca(c.placa, c.veiculo_id)}<span class="fm-mm">${esc(c.descricao || '')}</span></div>
      <div class="fm-ag-prev-lin"><input class="fm-input" type="date" min="${hojeBrasil()}" data-previsao="${esc(c.id)}" aria-label="Previsão de entrega de ${esc(c.placa)}"><button class="fm-btn soft fm-mini" type="button" data-salvar-previsao="${esc(c.id)}">Salvar</button></div></div>`).join('');
  }

  function render() {
    const root = state.root; if (!root) return;
    const corpo = root.querySelector('[data-corpo]');
    const v = state.visao;
    if (!v) { corpo.innerHTML = `<div class="fm-empty">${state.loading ? 'Carregando a agenda...' : 'Não foi possível carregar a agenda.'}</div>`; return; }
    const hoje = hojeBrasil();
    const eventos = eventosDoMes();
    const oficina = naOficina(v.manutencoes, v.mapaVeiculos, hoje);
    const sem = semPrevisao(v.manutencoes, v.mapaVeiculos, hoje);
    const legenda = Object.entries(TIPOS_EVENTO).map(([id, t]) => `<label><input type="checkbox" data-tipo="${id}"${state.tipos.has(id) ? ' checked' : ''}><span class="fm-badge ${t.tone}">${esc(t.rotulo)}</span></label>`).join('');
    corpo.innerHTML = `<div class="fm-card"><div class="fm-body">
      <div class="fm-ag-topo"><button class="fm-btn ghost fm-mini" type="button" data-mes="-1" aria-label="Mês anterior">←</button><h3>${esc(nomeMes(state.ano, state.mes))}</h3><button class="fm-btn ghost fm-mini" type="button" data-mes="1" aria-label="Próximo mês">→</button><button class="fm-btn soft fm-mini" type="button" data-hoje>Hoje</button><div class="fm-ag-leg">${legenda}</div></div>
      <div class="fm-ag-corpo"><div>${htmlCalendario(eventos)}</div>
        <aside class="fm-ag-lado">
          ${htmlDia(eventos)}
          <section class="fm-sec"><h4><span>Na oficina agora</span><span class="fm-badge ${oficina.length ? 'amber' : 'green'}">${oficina.length}</span></h4>${htmlNaOficina(oficina)}</section>
          <section class="fm-sec"><h4><span>Sem previsão de entrega</span><span class="fm-badge ${sem.length ? 'amber' : 'green'}">${sem.length}</span></h4>${htmlSemPrevisao(sem)}${sem.length ? '<p class="fm-mm" style="margin-top:8px">Com a data, a Programação sabe quando o veículo volta.</p>' : ''}</section>
        </aside></div>
      <div class="fm-nota">As entradas e as previsões vêm das ordens de serviço; os vencimentos, do plano de preventiva (serviços com data de vencimento). Clique num dia para ver o que acontece nele ao lado, ou num item do calendário para abrir a ficha da manutenção ou o prontuário do veículo.</div></div></div>`;
  }

  async function salvarPrevisao(id) {
    const campo = state.root.querySelector(`[data-previsao="${CSS.escape(id)}"]`);
    const data = campo?.value;
    if (!data) return toast('Escolha a data de entrega prevista.', 'err');
    if (data < hojeBrasil()) return toast('A previsão não pode ser anterior a hoje.', 'err');
    if (state.ocupado) return;
    state.ocupado = true;
    try {
      await dados.atualizarManutencao(state.supabase, id, { previsao_entrega: data });
      toast('Previsão de entrega salva.');
      invalidarVisao();
      state.visao = await carregarVisao(state.supabase, { forcar: true });
    } catch (err) {
      toast(err.message || 'Não foi possível salvar a previsão.', 'err', 5500);
    } finally {
      state.ocupado = false; render();
    }
  }

  function selecionarDia(iso, { rolar = true } = {}) {
    state.dia = state.dia === iso ? '' : iso;
    // Se o dia vem do mês vizinho (dias esmaecidos), a grade continua a mesma: só o painel muda.
    render();
    // Em telas estreitas o painel fica abaixo do calendário: leva até ele.
    if (rolar && state.dia && window.innerWidth <= 1250) state.root.querySelector('[data-painel-dia]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function mudarMes(delta) {
    let m = state.mes + delta; let a = state.ano;
    if (m < 1) { m = 12; a -= 1; } else if (m > 12) { m = 1; a += 1; }
    state.mes = m; state.ano = a; state.dia = ''; state.expandidos.clear(); render();
  }

  async function carregar({ forcar = false } = {}) {
    state.loading = true; if (!state.visao) render();
    try { state.visao = await carregarVisao(state.supabase, { forcar }); }
    catch (err) { toast(err.message || 'Erro ao carregar a agenda.', 'err'); }
    state.loading = false; render();
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.root = container; state.visao = null;
    const hoje = hojeBrasil();
    state.ano = Number(hoje.slice(0, 4)); state.mes = Number(hoje.slice(5, 7)); state.dia = ''; state.expandidos.clear();
    container.innerHTML = `${ESTILOS_MANUTENCAO}${ESTILOS_VISAO}<section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" type="button" data-atualizar>↻ Atualizar</button></div></div>
      <div data-corpo></div></section>`;
    container.querySelector('[data-atualizar]').addEventListener('click', () => { invalidarVisao(); carregar({ forcar: true }); });
    // Ouvintes no bloco interno: o corpo da aba é reaproveitado ao trocar de aba e ouvintes nele se acumulariam.
    const raiz = container.querySelector('.fm-shell');
    raiz.addEventListener('click', (e) => {
      const mes = e.target.closest('[data-mes]'); if (mes) return mudarMes(Number(mes.dataset.mes));
      if (e.target.closest('[data-hoje]')) { state.ano = Number(hojeBrasil().slice(0, 4)); state.mes = Number(hojeBrasil().slice(5, 7)); state.dia = hojeBrasil(); state.expandidos.clear(); return render(); }
      const mais = e.target.closest('[data-mais]'); if (mais) { state.expandidos.add(mais.dataset.mais); return render(); }
      const menos = e.target.closest('[data-menos]'); if (menos) { state.expandidos.delete(menos.dataset.menos); return render(); }
      const salvar = e.target.closest('[data-salvar-previsao]'); if (salvar) return salvarPrevisao(salvar.dataset.salvarPrevisao);
      const placa = e.target.closest('[data-prontuario]'); if (placa) return abrirProntuario(placa.dataset.prontuario);
      if (e.target.closest('[data-limpar-dia]')) { state.dia = ''; return render(); }
      const ficha = e.target.closest('[data-ficha]'); if (ficha) return abrirFicha(ficha.dataset.ficha);
      const dia = e.target.closest('[data-dia]'); if (dia) selecionarDia(dia.dataset.dia);
    });
    raiz.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // Só quando o foco está na célula do dia (os itens dentro dela já são botões).
      const dia = e.target.closest?.('[data-dia]');
      if (dia && e.target === dia) { e.preventDefault(); selecionarDia(dia.dataset.dia, { rolar: false }); }
    });
    raiz.addEventListener('change', (e) => {
      const t = e.target.closest?.('[data-tipo]'); if (!t) return;
      if (t.checked) state.tipos.add(t.dataset.tipo); else state.tipos.delete(t.dataset.tipo);
      render();
    });
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
