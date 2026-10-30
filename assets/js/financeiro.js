import { initProtectedPage } from './pageInit.js';
import { state } from './modules/financeiro/util.js?v=20261030-fin13';
import { injectEstilosFrotas } from './patrimonioLayoutFrotas.js?v=20261019-ordenar';
import { sincronizarContasAgente } from './modules/financeiro/contas.js?v=20261030-fin13';
import { htmlFinanceiro } from './modules/financeiro/html.js?v=20261030-fin13';
import { criarFeedback } from './modules/financeiro/feedback.js?v=20261030-fin13';
import { criarDashboard } from './modules/financeiro/dashboard.js?v=20261030-fin13';
import { criarNotasFiscais } from './modules/financeiro/notas-fiscais.js?v=20261030-fin13';
import { criarSetorPagamentos } from './modules/financeiro/setor-pagamentos.js?v=20261030-fin13';
import { criarAdiantamentos } from './modules/financeiro/adiantamentos.js?v=20261030-fin13';
import { criarNavegacao } from './modules/financeiro/navegacao.js?v=20261030-fin13';
import { criarFluxo } from './modules/financeiro/fluxo.js?v=20261030-fin13';

export function renderContent(content, userContext) {
  injectEstilosFrotas();
  content.innerHTML = htmlFinanceiro();

  // Cada parte da tela é uma fábrica criarX(ctx) em modules/financeiro/: recebe o contexto e devolve as funções que
  // as partes seguintes (e as ligações abaixo) usam.
  const ctx = { content, userContext };
  Object.assign(ctx, criarFeedback(ctx));
  Object.assign(ctx, criarDashboard(ctx));
  Object.assign(ctx, criarNotasFiscais(ctx));
  Object.assign(ctx, criarSetorPagamentos(ctx));
  Object.assign(ctx, criarAdiantamentos(ctx));
  Object.assign(ctx, criarNavegacao(ctx));
  Object.assign(ctx, criarFluxo(ctx));
  const { tabFromHash, mostrarFluxoLista, setAjustesTab, setTab, loadNotasFiscais, renderNotasFiscais, enviarComprovantesBaixaNf, loadSetorPagamentos, ligarSetorPagamentos, loadFluxo, loadDetalhes, renderDetalhes, importFile, saveConfig, carregarAdiantamentos, setAdiantTab, renderAdiantamentosTable, renderHistoricoAgrupado, pagarAdiantamentos, carregarDespesasTab } = ctx;

  state.adiantamentosRows = [];
  state.adiantamentosLoaded = false;
  document.querySelectorAll('.fin-tab').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tab); if (btn.dataset.tab && btn.dataset.tab !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tab}`); }));
  document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tabTarget); if (btn.dataset.tabTarget && btn.dataset.tabTarget !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tabTarget}`); }));
  document.getElementById('btnReload').addEventListener('click', loadFluxo);
  document.getElementById('btnReloadSetorPagamentos')?.addEventListener('click', loadSetorPagamentos);
  document.getElementById('btnEnviarBaixaNf')?.addEventListener('click', enviarComprovantesBaixaNf);
  document.getElementById('nfReloadBtn')?.addEventListener('click', loadNotasFiscais);
  document.getElementById('nfFiltroCliente')?.addEventListener('input', (event) => { state.notasFiscaisFiltro.cliente = event.target.value; renderNotasFiscais(); });
  document.getElementById('nfFiltroSituacao')?.addEventListener('change', (event) => { state.notasFiscaisFiltro.situacao = event.target.value; renderNotasFiscais(); });
  ligarSetorPagamentos();
  document.getElementById('btnImportReceber').addEventListener('click', () => importFile('receber'));
  document.getElementById('btnImportPagar').addEventListener('click', () => importFile('pagar'));
  document.getElementById('configForm').addEventListener('submit', saveConfig);
  document.querySelectorAll('.det-th-sort').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.detSort;
      if (state.detSort.col === col) { state.detSort.dir *= -1; } else { state.detSort.col = col; state.detSort.dir = 1; }
      renderDetalhes();
    });
  });
  document.querySelectorAll('.adiant-th-sort').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.adiantSort;
      if (state.adiantSort.col === col) { state.adiantSort.dir *= -1; } else { state.adiantSort.col = col; state.adiantSort.dir = 1; }
      renderAdiantamentosTable();
    });
  });
  document.getElementById('detFiltroTipo')?.addEventListener('change', (e) => { state.detFilter.tipo = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroSituacao')?.addEventListener('change', (e) => { state.detFilter.situacao = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroFavorecido')?.addEventListener('input', (e) => { state.detFilter.favorecido = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroDoc')?.addEventListener('input', (e) => { state.detFilter.doc = e.target.value; renderDetalhes(); });
  document.getElementById('btnAtualizarAdiantamentos')?.addEventListener('click', carregarAdiantamentos);
  document.getElementById('btnPagarAdiantamentos')?.addEventListener('click', pagarAdiantamentos);
  document.querySelectorAll('.adiant-subtab').forEach((btn) => btn.addEventListener('click', () => setAdiantTab(btn.dataset.adiantTab)));
  document.getElementById('histColaboradorFiltro')?.addEventListener('input', () => renderHistoricoAgrupado(state.adiantamentosHistorico || []));
  document.getElementById('periodForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters.inicio = document.getElementById('filterInicio').value;
    state.filters.fim = document.getElementById('filterFim').value;
    loadFluxo();
  });
  content.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-detail-date]');
    if (btn) loadDetalhes(btn.dataset.detailDate);
  });
  document.getElementById('btnVoltarFluxo')?.addEventListener('click', mostrarFluxoLista);
  document.querySelectorAll('.ajustes-subtab').forEach((btn) => btn.addEventListener('click', () => setAjustesTab(btn.dataset.ajustesTab)));
  window.addEventListener('hashchange', () => setTab(tabFromHash()));
  carregarDespesasTab();
  setTab(tabFromHash());
  sincronizarContasAgente().then(loadFluxo, loadFluxo);
}

initProtectedPage('Financeiro', renderContent);
