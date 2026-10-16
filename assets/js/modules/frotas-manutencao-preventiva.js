// Frotas · Manutenção › Preventiva: lista com um veículo por linha (pela placa), com a situação dos serviços do guia
// (frotas_manutencao_vencimentos_v). Ao clicar no veículo abre o painel lateral com os serviços agrupados por sistema,
// o "+" para registrar o que foi feito (assistente em passos) e "Solicitar" para abrir a solicitação dos vencidos.
import { closeModal, dataBR, esc, openModal, toast } from '../core/ui.js';
import { cardFiltro, ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261016-frotas-manut18';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261016-frotas-manut18';
import * as dados from './frotas-manutencao-dados.js?v=20261016-frotas-manut18';
import { STATUS_VENCIMENTO, descreverIntervalo } from './frotas-manutencao-regras.js?v=20261016-frotas-manut18';
import {
  FILTROS_PREVENTIVA, agruparPorSistema, categoriasDisponiveis, montarLista, pendentesDoVeiculo, restanteCelula,
} from './frotas-manutencao-preventiva-regras.js?v=20261016-frotas-manut18';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_PREVENTIVA';
  const PAINEL = 'fmPreventivaPainel';
  const state = {
    supabase: null, root: null, linhas: [], planos: new Map(), filtro: 'todos', busca: '', tipo: 'servico', categoria: '',
    loading: false, ocupado: false, lista: null, painelVeiculo: null, painelVerificacoes: false,
  };

  const fmtKm = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`);
  const venceTexto = (l) => [l.vencimento_data ? dataBR(l.vencimento_data) : '', l.vencimento_km != null ? fmtKm(l.vencimento_km) : ''].filter(Boolean).join(' · ') || '—';
  const selo = (status) => { const st = STATUS_VENCIMENTO[status] || { label: status, tone: 'blue' }; return `<span class="fm-badge ${st.tone}">${esc(st.label)}</span>`; };

  // ---------- lista ----------
  function htmlLinha(v) {
    const r = v.resumo;
    const chips = [
      r.vencida ? `<span class="fm-badge red">${r.vencida} vencida${r.vencida > 1 ? 's' : ''}</span>` : '',
      r.proxima ? `<span class="fm-badge amber">${r.proxima} próxima${r.proxima > 1 ? 's' : ''}</span>` : '',
      r.sem_historico ? `<span class="fm-badge blue">${r.sem_historico} sem histórico</span>` : '',
      !r.vencida && !r.proxima && !r.sem_historico ? '<span class="fm-badge green">Tudo em dia</span>' : '',
    ].join('');
    const u = v.maisUrgente;
    const urgente = u
      ? `<strong>${esc(u.plano_nome)}</strong><span class="fm-mm">${esc(venceTexto(u))}${restanteCelula(u) ? ` · ${esc(restanteCelula(u))}` : ''}</span>`
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
    const m = montarLista(state.linhas, { tipo: state.tipo, busca: state.busca, filtro: state.filtro, categoria: state.categoria });
    state.lista = m;
    root.querySelector('[data-kpis]').innerHTML = FILTROS_PREVENTIVA.map((f) => cardFiltro({
      filtro: f.id, tone: f.tone, icone: f.icone, label: f.rotulo, dica: f.dica, ativo: f.id === state.filtro, valor: String(m.contagem[f.id] ?? 0),
    })).join('');
    sincronizarCards(root, state.filtro);
    root.querySelector('[data-linhas]').innerHTML = state.loading
      ? '<div class="fm-empty">Carregando vencimentos...</div>'
      : m.veiculos.length ? m.veiculos.map(htmlLinha).join('') : '<div class="fm-empty">Nenhum veículo neste filtro.</div>';
    root.querySelector('[data-contagem]').textContent = `${m.veiculos.length} veículo(s)`;
  }

  const veiculoCompleto = (id) => montarLista(state.linhas, { tipo: 'todos' }).veiculos.find((x) => x.veiculo_id === id) || null;

  // ---------- painel lateral do veículo ----------
  function htmlServico(s) {
    const p = state.planos.get(s.plano_id) || {};
    const ultima = s.data_ultima ? `Última vez ${dataBR(s.data_ultima)}${s.km_ultima != null ? ` a ${fmtKm(s.km_ultima)}` : ''}` : 'Nunca registrado';
    return `<div class="fm-svc fm-svc-${esc(s.status)}">
      <div class="fm-svc-main"><strong>${esc(s.plano_nome)}</strong><span class="fm-mm">${esc(descreverIntervalo(p) || '')}${s.tipo === 'verificacao' ? ' · verificação' : ''}</span><span class="fm-mm">${esc(ultima)}</span></div>
      <div class="fm-svc-vence">${s.status === 'sem_historico' ? '<span class="fm-mm">Sem prazo calculado</span>' : `<strong>${esc(venceTexto(s))}</strong><span class="fm-mm">${esc(restanteCelula(s))}</span>`}</div>
      <div class="fm-svc-fim">${selo(s.status)}${s.em_andamento ? '<span class="fm-badge amber">Em andamento</span>' : ''}<button class="fm-pc-mais" type="button" data-reg-plano="${esc(s.plano_id)}" title="Registrar que foi feito" aria-label="Registrar ${esc(s.plano_nome)}">+</button></div></div>`;
  }

  function renderPainel() {
    const ov = document.getElementById(PAINEL); if (!ov || !state.painelVeiculo) return;
    const v = veiculoCompleto(state.painelVeiculo);
    const corpo = ov.querySelector('[data-painel]');
    if (!v) { corpo.innerHTML = '<div class="fm-empty">Veículo não encontrado.</div>'; return; }
    const exibidos = v.servicos.filter((s) => state.painelVerificacoes || s.tipo === 'servico');
    const grupos = agruparPorSistema(exibidos);
    const cont = (st) => exibidos.filter((s) => s.status === st).length;
    const pend = pendentesDoVeiculo({ servicos: exibidos }, 'todos');
    corpo.innerHTML = `<div class="fm-mod-head"><div><h3>${esc(v.placa)}</h3><p>${esc(v.marca_modelo || '')}${v.coordenacao ? ` · ${esc(v.coordenacao)}` : ''} · Km atual ${esc(fmtKm(v.hodometro))}</p></div><button class="fm-x" type="button" data-fechar-painel aria-label="Fechar">✕</button></div>
      <div class="fm-pvl-chips" style="margin:10px 0">${cont('vencida') ? `<span class="fm-badge red">${cont('vencida')} vencida(s)</span>` : ''}${cont('proxima') ? `<span class="fm-badge amber">${cont('proxima')} próxima(s)</span>` : ''}${cont('em_dia') ? `<span class="fm-badge green">${cont('em_dia')} em dia</span>` : ''}${cont('sem_historico') ? `<span class="fm-badge blue">${cont('sem_historico')} sem histórico</span>` : ''}</div>
      <label class="fm-check" style="margin-bottom:8px"><input type="checkbox" data-painel-ver${state.painelVerificacoes ? ' checked' : ''}> Mostrar verificações (nível, calibragem, inspeções)</label>
      <div class="fm-drawer-corpo">${grupos.map((g) => `<details class="fm-prev-grupo"${g.atencao ? ' open' : ''}><summary><span>${String(g.categoria_codigo).padStart(2, '0')} · ${esc(g.categoria_nome)}</span><span class="fm-badge">${g.itens.length}</span>${g.vencida ? `<span class="fm-badge red">${g.vencida} vencida(s)</span>` : ''}${g.proxima ? `<span class="fm-badge amber">${g.proxima} próxima(s)</span>` : ''}</summary>${g.itens.map(htmlServico).join('')}</details>`).join('') || '<div class="fm-empty">Nenhum serviço.</div>'}</div>
      <div class="fm-acoes fm-drawer-rodape"><button class="fm-btn primary" type="button" data-reg-painel>+ Registrar</button>${pend.length ? `<button class="fm-btn ghost" type="button" data-sol-painel${state.ocupado ? ' disabled' : ''}>Solicitar (${pend.length})</button>` : ''}</div>`;
  }

  async function carregar() {
    state.loading = true; render();
    try {
      const [linhas, planos] = await Promise.all([dados.carregarVencimentos(state.supabase), dados.carregarPlanos(state.supabase)]);
      state.linhas = linhas; state.planos = new Map(planos.map((p) => [p.id, p]));
    } catch (err) { toast(err.message || 'Erro ao carregar as preventivas.', 'err'); state.linhas = []; }
    state.loading = false; opcoesCategoria(); render(); renderPainel();
  }

  function abrirPainel(veiculoId) {
    state.painelVeiculo = veiculoId;
    const ov = openModal({ id: PAINEL, conteudoHtml: '<div data-painel></div>', aoFechar: () => { state.painelVeiculo = null; } });
    ov.classList.add('fm-drawer', 'fm-mod');
    renderPainel();
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-fechar-painel]')) return closeModal(PAINEL);
      const plano = e.target.closest('[data-reg-plano]'); if (plano) return registrar(veiculoId, plano.dataset.regPlano);
      if (e.target.closest('[data-reg-painel]')) return registrar(veiculoId, null);
      if (e.target.closest('[data-sol-painel]')) abrirSolicitacao(veiculoId);
    });
    ov.addEventListener('change', (e) => { if (e.target.matches('[data-painel-ver]')) { state.painelVerificacoes = e.target.checked; renderPainel(); } });
  }

  async function registrar(veiculoId, planoInicial) {
    const v = veiculoCompleto(veiculoId); if (!v) return;
    const { abrirRegistro } = await import('./frotas-manutencao-preventiva-registro.js?v=20261016-frotas-manut18');
    await abrirRegistro({ supabase: state.supabase, veiculo: v, planos: state.planos, planoInicial, aoConcluir: carregar });
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
      const { abrirImportacaoHistorico } = await import('./frotas-manutencao-historico.js?v=20261016-frotas-manut18');
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
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
