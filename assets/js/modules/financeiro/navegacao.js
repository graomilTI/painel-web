// Financeiro — navegação entre abas e visões da tela.
// Extraído de assets/js/financeiro.js (renderContent) em 15/10/2026. Cada fábrica criarX(ctx) recebe o contexto da tela
// ({ content, userContext } + funções das fábricas anteriores) e devolve as funções que as outras partes usam. O código
// das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer módulo de
// assets/js/modules/financeiro/, troque o token ?v=20261016-fin3 em TODOS os imports internos e nos carregadores
// (assets/js/financeiro.js, financeiro.html): tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { state } from './util.js?v=20261016-fin3';

function criarNavegacao(ctx) {
  const { loadNotasFiscais, carregarResumoBaixaNf, loadSetorPagamentos, loadDashboardData, carregarDespesasTab } = ctx;

  function tabFromHash() {
    const tab = String(window.location.hash || '').replace(/^#/, '').split('?')[0].toLowerCase();
    return ['dashboard', 'fluxo', 'despesas', 'pagamentos', 'notas-fiscais', 'ajustes'].includes(tab) ? tab : 'dashboard';
  }

  function mostrarFluxoLista() {
    const lista = document.getElementById('fluxoListaView');
    const det = document.getElementById('fluxoDetalhesView');
    if (lista) lista.style.display = '';
    if (det) det.style.display = 'none';
  }

  function mostrarFluxoDetalhes() {
    const lista = document.getElementById('fluxoListaView');
    const det = document.getElementById('fluxoDetalhesView');
    if (lista) lista.style.display = 'none';
    if (det) det.style.display = '';
  }

  function setAjustesTab(tab) {
    document.querySelectorAll('.ajustes-subtab').forEach((btn) => btn.classList.toggle('active', btn.dataset.ajustesTab === tab));
    document.querySelectorAll('.ajustes-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`ajustes-${tab}`)?.classList.add('active');
  }

  function setTab(tab) {
    document.querySelectorAll('.fin-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.fin-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    if (tab === 'fluxo') mostrarFluxoLista();
    if (tab === 'despesas') carregarDespesasTab();
    if (tab === 'pagamentos') { loadSetorPagamentos(); carregarResumoBaixaNf(); }
    if (tab === 'dashboard') loadDashboardData();
    if (tab === 'notas-fiscais' && !state.notasFiscaisLoaded) loadNotasFiscais();
  }

  return { tabFromHash, mostrarFluxoLista, mostrarFluxoDetalhes, setAjustesTab, setTab };
}

export { criarNavegacao };
