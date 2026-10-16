// Frotas · Manutenção › Vencimentos: o que vence por veículo e plano do guia (frotas_manutencao_vencimentos_v),
// com abertura de solicitação em um clique. A solicitação é aberta pela RPC e a ficha abre na aba Manutenção.
import { esc, dataBR, toast } from '../core/ui.js';
import { cardFiltro, ligarCards, sincronizarCards } from './frotas-ui-lista.js?v=20261016-frotas-manut10';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261016-frotas-manut10';
import * as dados from './frotas-manutencao-dados.js?v=20261016-frotas-manut10';
import { STATUS_VENCIMENTO, norm } from './frotas-manutencao-regras.js?v=20261016-frotas-manut10';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_VENCIMENTOS';
  const LIMITE_LINHAS = 600;
  const FILTROS = [
    { id: 'atencao', rotulo: 'Vencidas e próximas', tone: 'red', icone: 'alerta', dica: 'Precisam de atenção agora' },
    { id: 'vencida', rotulo: 'Vencidas', tone: 'red', icone: 'erro', dica: 'Passaram do km ou da data' },
    { id: 'proxima', rotulo: 'Próximas', tone: 'amber', icone: 'relogio', dica: 'Vencem em breve' },
    { id: 'em_dia', rotulo: 'Em dia', tone: 'green', icone: 'ok', dica: 'Dentro do prazo' },
    { id: 'sem_historico', rotulo: 'Sem histórico', tone: 'blue', icone: 'doc', dica: 'Ainda não há serviço registrado para este plano' },
    { id: 'todos', rotulo: 'Todos', tone: 'blue', icone: 'total', dica: 'Todos os planos de todos os veículos ativos' },
  ];
  const state = { supabase: null, opts: null, linhas: [], filtro: 'atencao', busca: '', tipo: 'servico', categoria: '', loading: false, root: null, ocupado: false };

  const bate = (l, f) => (f === 'todos' ? true : f === 'atencao' ? ['vencida', 'proxima'].includes(l.status) : l.status === f);
  const dosFiltros = (l) => (state.tipo === 'todos' || l.tipo === state.tipo)
    && (!state.categoria || String(l.categoria_codigo) === state.categoria);

  function visiveis() {
    const termo = norm(state.busca);
    return state.linhas.filter((l) => dosFiltros(l) && bate(l, state.filtro)
      && (!termo || norm([l.placa, l.marca_modelo, l.plano_nome, l.categoria_nome, l.coordenacao, l.supervisao].join(' ')).includes(termo)));
  }

  function fmtKm(v) { return v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`; }

  function restante(l) {
    const partes = [];
    if (l.km_restante != null) partes.push(l.km_restante < 0 ? `${fmtKm(Math.abs(l.km_restante))} acima` : `${fmtKm(l.km_restante)}`);
    if (l.dias_restantes != null) partes.push(l.dias_restantes < 0 ? `${Math.abs(l.dias_restantes)} dia(s) atrasado` : `${l.dias_restantes} dia(s)`);
    return partes.join(' · ') || '—';
  }

  function render() {
    const root = state.root; if (!root) return;
    const base = state.linhas.filter(dosFiltros);
    root.querySelector('[data-kpis]').innerHTML = FILTROS.map((f) => cardFiltro({
      filtro: f.id, tone: f.tone, icone: f.icone, label: f.rotulo, dica: f.dica, ativo: f.id === state.filtro, valor: String(base.filter((l) => bate(l, f.id)).length),
    })).join('');
    sincronizarCards(root, state.filtro);
    const lista = visiveis();
    const mostrar = lista.slice(0, LIMITE_LINHAS);
    root.querySelector('[data-linhas]').innerHTML = state.loading
      ? '<tr><td colspan="8" class="fm-empty">Carregando vencimentos...</td></tr>'
      : mostrar.length ? mostrar.map((l) => {
        const st = STATUS_VENCIMENTO[l.status] || { label: l.status, tone: 'blue' };
        const aberta = l.em_andamento;
        return `<tr>
          <td><strong>${esc(l.placa)}</strong><span class="fm-mm">${esc(l.marca_modelo || '')}${l.coordenacao ? ` · ${esc(l.coordenacao)}` : ''}</span></td>
          <td>${esc(l.plano_nome)}<span class="fm-mm">${String(l.categoria_codigo).padStart(2, '0')} · ${esc(l.categoria_nome)}${l.tipo === 'verificacao' ? ' · verificação' : ''}</span></td>
          <td>${l.data_ultima ? dataBR(l.data_ultima) : '—'}<span class="fm-mm">${fmtKm(l.km_ultima)}</span></td>
          <td>${l.vencimento_data ? dataBR(l.vencimento_data) : '—'}<span class="fm-mm">${fmtKm(l.vencimento_km)}</span></td>
          <td>${esc(restante(l))}<span class="fm-mm">Km atual ${fmtKm(l.hodometro)}</span></td>
          <td><span class="fm-badge ${st.tone}">${esc(st.label)}</span>${aberta ? ' <span class="fm-badge amber">Em andamento</span>' : ''}</td>
          <td><button class="fm-btn soft fm-mini" type="button" data-abrir-sol="${esc(l.veiculo_id)}|${esc(l.plano_id)}"${aberta || state.ocupado ? ' disabled' : ''}>${aberta ? 'Já aberta' : 'Abrir solicitação'}</button></td></tr>`;
      }).join('') : '<tr><td colspan="8" class="fm-empty">Nada neste filtro.</td></tr>';
    root.querySelector('[data-contagem]').textContent = `${Math.min(lista.length, LIMITE_LINHAS)} de ${lista.length} vencimento(s)${lista.length > LIMITE_LINHAS ? ' (refine a busca)' : ''}`;
  }

  async function abrirSolicitacao(veiculoId, planoId) {
    const l = state.linhas.find((x) => x.veiculo_id === veiculoId && x.plano_id === planoId); if (!l || state.ocupado) return;
    state.ocupado = true; render();
    try {
      const id = await dados.solicitar(state.supabase, {
        veiculo_id: veiculoId, origem: 'plano', prioridade: l.status === 'vencida' ? 'alta' : 'normal',
        descricao: `${l.plano_nome} — ${l.placa}${l.status === 'vencida' ? ' (vencida)' : ''}`,
        itens: [{ categoria_codigo: l.categoria_codigo, natureza: 'preventiva', descricao: l.plano_nome, plano_id: l.plano_id }],
      });
      toast('Solicitação aberta. Abrindo a ficha...');
      window.FROTAS_MANUTENCAO_ABRIR = id;
      document.querySelector('[data-ds-tab="manutencao"]')?.click();
    } catch (err) {
      toast(err.message || 'Erro ao abrir a solicitação.', 'err', 5500);
    } finally {
      state.ocupado = false; render();
    }
  }

  async function carregar() {
    state.loading = true; render();
    try { state.linhas = await dados.carregarVencimentos(state.supabase); }
    catch (err) { toast(err.message || 'Erro ao carregar os vencimentos.', 'err'); state.linhas = []; }
    state.loading = false; render();
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.opts = opts; state.root = container;
    container.innerHTML = `${ESTILOS_MANUTENCAO}<section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn ghost" type="button" data-historico>Importar histórico</button><button class="fm-btn soft" type="button" data-atualizar>↻ Atualizar</button></div></div>
      <div class="fm-kpis" data-kpis></div>
      <div class="fm-card"><div class="fm-body"><div class="fm-bar"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar por placa, plano, categoria, coordenação..." data-busca></div>
      <select class="fm-select" data-tipo style="width:auto"><option value="servico">Serviços (trocas e revisões)</option><option value="verificacao">Verificações (nível, calibragem...)</option><option value="todos">Serviços e verificações</option></select>
      <select class="fm-select" data-categoria style="width:auto"><option value="">Todas as categorias</option></select>
      <span data-chip></span><span class="fm-count" data-contagem></span></div>
      <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Veículo</th><th>Plano</th><th>Última vez</th><th>Vence em</th><th>Restante</th><th>Situação</th><th></th></tr></thead><tbody data-linhas></tbody></table></div>
      <div class="fm-nota">"Sem histórico" é todo plano que ainda não teve serviço concluído registrado. Use "Importar histórico" para informar a última vez de cada serviço por veículo; depois disso o painel calcula os vencimentos e abre as solicitações sozinho (todo dia às 07h, Brasília). O km atual vem do rastreador (BFleet) e do km informado ao concluir cada serviço.</div></div></div></section>`;

    container.querySelector('[data-atualizar]').addEventListener('click', carregar);
    container.querySelector('[data-historico]').addEventListener('click', async () => {
      const { abrirImportacaoHistorico } = await import('./frotas-manutencao-historico.js?v=20261016-frotas-manut10');
      abrirImportacaoHistorico({ supabase: state.supabase, aoConcluir: carregar });
    });
    container.querySelector('[data-busca]').addEventListener('input', (e) => { state.busca = e.target.value; render(); });
    container.querySelector('[data-tipo]').addEventListener('change', (e) => { state.tipo = e.target.value; render(); });
    container.querySelector('[data-categoria]').addEventListener('change', (e) => { state.categoria = e.target.value; render(); });
    container.querySelector('[data-linhas]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-abrir-sol]'); if (!b || b.disabled) return;
      const [v, p] = b.dataset.abrirSol.split('|'); abrirSolicitacao(v, p);
    });
    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: render });

    await carregar();
    const cats = new Map(state.linhas.map((l) => [l.categoria_codigo, l.categoria_nome]));
    container.querySelector('[data-categoria]').insertAdjacentHTML('beforeend',
      [...cats.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => `<option value="${c}">${String(c).padStart(2, '0')} · ${esc(n)}</option>`).join(''));
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
