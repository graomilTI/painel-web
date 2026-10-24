// Controller da página de Hospedagem (ADM): Hotéis (fila v3 em modules/hospedagem/ + painel legado v2 só leitura), Fluxo por hotel,
// Confirmação de Pagamento (lotes antigos) e a casca de #alojamentos (conteúdo montado por adm-hotel-alojamentos-v2.js e companhia,
// via adm-hotel-deferred.js).
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { ensureStyles, normalizeText, toast, esc, brDate, money } from './adm-hotel-helpers.js';
import { tabs } from './core/ui.js';
import { injectEstilosFrotas, aoClicarCard, sincronizarCards } from './patrimonioLayoutFrotas.js?v=20261019-ordenar';
import {
  renderShellAlojamentos, renderDetalhes, renderHistorico, renderHistoricoCards, renderHistoricoCorpo, filtrarHistorico,
  renderFinanceiroShell, renderFinanceiroQueue, renderFinanceiroCards, renderFinanceiroCorpo, filtrarFinanceiro,
  renderFluxoBoard, renderHotelExtrato,
} from './adm-hotel-view.js';
import { criarRepositorio } from './modules/hospedagem/repository.js?v=20261024-hosp-layout6';
import { criarCotacaoHotel } from './modules/hospedagem/cotacao-ui.js?v=20261024-hosp-layout6';
import { criarFila } from './modules/hospedagem/fila-ui.js?v=20261024-hosp-layout6';
import { criarReserva } from './modules/hospedagem/reserva-ui.js?v=20261024-hosp-layout6';
import { criarPagamento } from './modules/hospedagem/pagamento-ui.js?v=20261024-hosp-layout6';

function currentMode() {
  const hash = String(location.hash || '').toLowerCase();
  if (hash.includes('financeiro')) return 'financeiro';
  if (hash.includes('aloj')) return 'alojamentos';
  return 'hoteis';
}

const state = {
  rows: [], hotels: [], people: [], assignments: [], links: [], quotes: [], finance: [], documents: [],
  advances: [], advanceMoves: [], checkoutLots: [],
  v3Items: [], v3Changes: [], v3Checkout: [], v3Payments: [], v3Installments: [], v3Cotacoes: [], v3Pedidos: [],
  loading: false, error: null, loaded: false,
  activeTab: 'solicitacoes', // solicitacoes (fila v3) | historico (fluxo antigo, leitura) | fluxo (saldo por hotel)
  v3Filtro: 'todos', v3Busca: '',
  histFiltro: 'todos', histBusca: '',
};

const financeiro = {
  filtro: 'todos',
  busca: '',
  loaded: false,
  loading: false,
  items: [],
};

let contentEl = null;

// Fila v3 (módulos em modules/hospedagem/): cada fábrica recebe o contexto e devolve suas ações; o contexto vai juntando as peças.
const ctx = { state, repo: criarRepositorio(supabase), modalRoot, loadPainel, renderBoard, toast, esc, money, brDate, normalizeText };
ctx.cotacao = criarCotacaoHotel(ctx);
ctx.reserva = criarReserva(ctx);
ctx.pagamento = criarPagamento(ctx);
const filaV3 = criarFila(ctx);

const ABAS = [
  ['solicitacoes', 'Solicitações'],
  ['historico', 'Histórico (fluxo antigo)'],
  ['fluxo', 'Fluxo por hotel'],
];

// Solicitações do fluxo antigo (v2): as do v3 aparecem na fila, não aqui.
const linhasHistorico = () => state.rows.filter((r) => Number(r.fluxo_versao || 2) !== 3);

function renderTabsAndWire() {
  const el = document.getElementById('ahTabs');
  if (!el) return;
  const badge = { solicitacoes: state.v3Items.filter((i) => i.status_item !== 'CANCELADO').length, historico: linhasHistorico().length };
  el.innerHTML = tabs({ itens: ABAS.map(([id, label]) => ({ id, label, badge: badge[id] })), ativo: state.activeTab, attr: 'data-tab' });
  el.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      state.activeTab = b.dataset.tab;
      renderAll();
    });
  });
}

// Histórico do fluxo antigo: busca e cards só trocam o miolo (a caixa de busca mantém o foco).
function ligarHistorico(board) {
  const atualizar = () => {
    const lista = filtrarHistorico(linhasHistorico(), { filtro: state.histFiltro, busca: state.histBusca });
    board.querySelector('#ahHistKpis').innerHTML = renderHistoricoCards(linhasHistorico(), state.histFiltro);
    board.querySelector('#ahHistCorpo').innerHTML = renderHistoricoCorpo(lista);
    board.querySelector('#ahHistCount').textContent = `${lista.length} solicitação(ões)`;
    sincronizarCards(board, state.histFiltro);
    ligarAbrirDetalhes(board);
  };
  board.querySelector('#ahHistBusca').addEventListener('input', (e) => { state.histBusca = e.target.value; atualizar(); });
  aoClicarCard(board, (card, limpar) => {
    state.histFiltro = limpar || !card || state.histFiltro === card.dataset.filtro ? 'todos' : card.dataset.filtro;
    atualizar();
  });
  sincronizarCards(board, state.histFiltro);
  ligarAbrirDetalhes(board);
}

function ligarAbrirDetalhes(raiz) {
  raiz.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetalhes(b.dataset.open)));
}

function renderBoard() {
  const board = document.getElementById('ahBoard');
  if (!board) return;
  if (state.loading) {
    board.innerHTML = '<div class="fm-card"><div class="fm-body"><div class="fm-empty">Carregando...</div></div></div>';
    return;
  }
  if (state.error) {
    board.innerHTML = `<div class="fm-card"><div class="fm-body"><div class="fm-empty ah-error">Erro ao carregar: ${esc(state.error)}</div></div></div>`;
    return;
  }
  if (state.activeTab === 'fluxo') {
    board.innerHTML = renderFluxoBoard(hotelLedger());
    board.querySelectorAll('[data-open-extrato]').forEach((b) => {
      b.addEventListener('click', () => openHotelExtrato(b.dataset.openExtrato));
    });
    return;
  }
  if (state.activeTab === 'historico') {
    board.innerHTML = renderHistorico(linhasHistorico(), { filtro: state.histFiltro, busca: state.histBusca });
    ligarHistorico(board);
    return;
  }
  board.innerHTML = filaV3.render();
  filaV3.ligar(board);
}

function renderAll() {
  renderTabsAndWire();
  renderBoard();
}

async function loadPainel() {
  state.loading = true;
  state.error = null;
  renderAll();
  const [painel, itens, alteracoes, decisoes, pagamentos, parcelas, cotacoes, pedidos] = await ctx.repo.carregarFila();
  const { data, error } = painel;
  state.loading = false;
  if (error) {
    state.error = error.message;
    renderAll();
    return;
  }
  state.rows = data?.rows || [];
  state.hotels = data?.hotels || [];
  state.people = data?.people || [];
  state.assignments = data?.assignments || [];
  state.links = data?.links || [];
  state.quotes = data?.quotes || [];
  state.finance = data?.finance || [];
  state.documents = data?.documents || [];
  state.advances = data?.advances || [];
  state.advanceMoves = data?.advanceMoves || [];
  state.checkoutLots = data?.checkoutLots || [];
  state.v3Items = itens.data || [];
  state.v3Changes = alteracoes.data || [];
  state.v3Checkout = decisoes.data || [];
  state.v3Payments = pagamentos.data || [];
  state.v3Installments = parcelas.data || [];
  state.v3Cotacoes = cotacoes.data || [];
  state.v3Pedidos = pedidos.data || [];
  state.loaded = true;
  renderAll();
}

function findRow(solicitacaoId) {
  return state.rows.find((r) => r.solicitacao_id === solicitacaoId);
}

function modalRoot() {
  let root = document.getElementById('ahModalRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ahModalRoot';
    document.body.appendChild(root);
  }
  return root;
}

// Detalhe de uma solicitação do fluxo antigo (v2): somente leitura. O v2 foi congelado em 24/10/2026; cotar, reservar, agrupar,
// estender, check-out e diferença agora são feitos só pela fila v3 (modules/hospedagem/).
function openDetalhes(solicitacaoId) {
  const row = findRow(solicitacaoId);
  if (!row) return;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderDetalhes(row, state.quotes)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDetalhes));
}

function closeDetalhes() {
  const root = document.getElementById('ahModalRoot');
  if (root) root.innerHTML = '';
}

async function loadFinanceiroQueue() {
  financeiro.loading = true;
  renderFinanceiroBoard();
  const { data, error } = await supabase
    .from('financeiro_pagamentos')
    .select('id, descricao, favorecido_nome, valor, status, competencia, comprovante_url, hospedagem_checkout_lote_id, created_at')
    .eq('origem_setor', 'HOSPEDAGEM')
    .neq('origem_tabela', 'hospedagem_pagamentos_v3') // v3 é pago e confirmado pela fila de Hotéis ou pelo Financeiro (sem lote de check-out)
    .in('status', ['PENDENTE', 'EM_ANALISE'])
    .order('created_at', { ascending: false });
  financeiro.loading = false;
  if (error) {
    financeiro.items = [];
    financeiro.loaded = true;
    financeiro.error = error.message;
    renderFinanceiroBoard();
    return;
  }
  financeiro.items = data || [];
  financeiro.loaded = true;
  financeiro.error = null;
  renderFinanceiroBoard();
}

function renderFinanceiroBoard() {
  const board = document.getElementById('ahFinBoard');
  if (!board) return;
  if (financeiro.loading) {
    board.innerHTML = '<div class="fm-card"><div class="fm-body"><div class="fm-empty">Carregando...</div></div></div>';
    return;
  }
  if (financeiro.error) {
    board.innerHTML = `<div class="fm-card"><div class="fm-body"><div class="fm-empty ah-error">Erro ao carregar: ${esc(financeiro.error)}</div></div></div>`;
    return;
  }
  board.innerHTML = renderFinanceiroQueue(financeiro.items, { filtro: financeiro.filtro, busca: financeiro.busca });
  ligarFinanceiro(board);
}

// Busca e cards só trocam o miolo (a caixa de busca mantém o foco); o botão confirma o lote pelo mesmo caminho de sempre.
function ligarFinanceiro(board) {
  const atualizar = () => {
    const lista = filtrarFinanceiro(financeiro.items, { filtro: financeiro.filtro, busca: financeiro.busca });
    board.querySelector('#ahFinKpis').innerHTML = renderFinanceiroCards(financeiro.items, financeiro.filtro);
    board.querySelector('#ahFinCorpo').innerHTML = renderFinanceiroCorpo(lista);
    board.querySelector('#ahFinCount').textContent = `${lista.length} pagamento(s)`;
    sincronizarCards(board, financeiro.filtro);
    ligarConfirmar(board);
  };
  board.querySelector('#ahFinBusca').addEventListener('input', (e) => { financeiro.busca = e.target.value; atualizar(); });
  aoClicarCard(board, (card, limpar) => {
    financeiro.filtro = limpar || !card || financeiro.filtro === card.dataset.filtro ? 'todos' : card.dataset.filtro;
    atualizar();
  });
  sincronizarCards(board, financeiro.filtro);
  ligarConfirmar(board);
}

function ligarConfirmar(raiz) {
  raiz.querySelectorAll('[data-confirmar-pagamento]').forEach((b) => {
    b.addEventListener('click', () => confirmarPagamento(b.dataset.confirmarPagamento));
  });
}

// Chamada compartilhada entre a fila do Financeiro e o extrato por hotel (Fase 7)
// — os dois usam os mesmos data-attributes (data-fin-field/data-fin-id) nos inputs.
async function submitConfirmarPagamento(loteId, onSuccess) {
  if (!loteId) {
    toast('Este pagamento não tem um lote de check-out vinculado — confirme em Financeiro > Pagamentos.', 'err');
    return;
  }
  const valorInput = document.querySelector(`[data-fin-field="valorPago"][data-fin-id="${loteId}"]`);
  const comprovanteInput = document.querySelector(`[data-fin-field="comprovante"][data-fin-id="${loteId}"]`);
  const valorPago = Number(valorInput?.value || 0);
  const comprovanteUrl = comprovanteInput?.value?.trim() || null;

  if (!(valorPago >= 0)) {
    toast('Valor pago inválido.', 'err');
    return;
  }

  const btn = document.querySelector(`[data-confirmar-pagamento="${loteId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Confirmando...'; }

  const { error } = await supabase.rpc('hospedagem_confirmar_pagamento_lote', {
    p_lote_id: loteId,
    p_valor_pago: valorPago,
    p_comprovante_url: comprovanteUrl,
  });

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar pagamento'; }
    toast(`Erro ao confirmar pagamento: ${error.message}`, 'err');
    return;
  }

  toast('Pagamento confirmado.');
  await onSuccess();
}

async function confirmarPagamento(loteId) {
  await submitConfirmarPagamento(loteId, loadFinanceiroQueue);
}

async function confirmarPagamentoExtrato(loteId, hotelId) {
  await submitConfirmarPagamento(loteId, async () => {
    await loadPainel();
    openHotelExtrato(hotelId);
  });
}

// Saldo real por hotel: soma o que ainda está devido (hospedagem_financeiro,
// exceto lotes já PAGO) e o crédito disponível (hospedagem_adiantamentos com
// status DISPONIVEL) — substitui o "saldo" simulado do protótipo original.
function hotelLedger() {
  const reservaHotel = new Map();
  state.rows.forEach((r) => { if (r.reserva_id && r.hotel_id) reservaHotel.set(r.reserva_id, r.hotel_id); });

  const byHotel = new Map();
  function ensure(hotelId) {
    if (!byHotel.has(hotelId)) {
      const h = state.hotels.find((x) => x.id === hotelId);
      byHotel.set(hotelId, {
        hotelId, nome: h?.nome || 'Hotel', cidade: h?.cidade || '', uf: h?.uf || '',
        saldoDevido: 0, creditoDisponivel: 0, hasActivity: false,
      });
    }
    return byHotel.get(hotelId);
  }

  state.finance.forEach((f) => {
    const hotelId = reservaHotel.get(f.reserva_id);
    if (!hotelId) return;
    const entry = ensure(hotelId);
    entry.hasActivity = true;
    if (f.status_financeiro !== 'PAGO') entry.saldoDevido += Number(f.saldo || 0);
  });

  state.advances.forEach((a) => {
    if (!a.hotel_id) return;
    const entry = ensure(a.hotel_id);
    entry.hasActivity = true;
    if (a.status === 'DISPONIVEL') entry.creditoDisponivel += Number(a.saldo || 0);
  });

  return [...byHotel.values()].filter((h) => h.hasActivity).sort((a, b) => b.saldoDevido - a.saldoDevido);
}

function groupReservasForHotel(hotelId) {
  const seen = new Map();
  state.rows.forEach((r) => {
    if (r.hotel_id !== hotelId || !r.reserva_id) return;
    if (!seen.has(r.reserva_id)) seen.set(r.reserva_id, r);
  });
  return [...seen.values()].sort((a, b) => new Date(b.data_checkin || 0) - new Date(a.data_checkin || 0));
}

async function fetchPendingPaymentsForLots(loteIds) {
  if (loteIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('financeiro_pagamentos')
    .select('id, valor, status, hospedagem_checkout_lote_id')
    .in('hospedagem_checkout_lote_id', loteIds)
    .in('status', ['PENDENTE', 'EM_ANALISE']);
  if (error) return new Map();
  const map = new Map();
  (data || []).forEach((p) => map.set(p.hospedagem_checkout_lote_id, p));
  return map;
}

function openHotelExtrato(hotelId) {
  const root = modalRoot();
  root.innerHTML = '<div class="ah-overlay" id="ahOverlay"><div class="ah-modal"><div class="ah-modal-body"><div class="ah-empty">Carregando extrato...</div></div></div></div>';
  document.getElementById('ahOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'ahOverlay') closeDetalhes();
  });
  renderHotelExtratoAsync(hotelId);
}

async function renderHotelExtratoAsync(hotelId) {
  const hotelData = hotelLedger().find((h) => h.hotelId === hotelId);
  if (!hotelData) return;
  const reservas = groupReservasForHotel(hotelId);
  const lots = state.checkoutLots
    .filter((l) => l.hotel_id === hotelId)
    .sort((a, b) => new Date(b.data_checkout || 0) - new Date(a.data_checkout || 0));
  const advances = state.advances.filter((a) => a.hotel_id === hotelId);
  const advanceIds = new Set(advances.map((a) => a.id));
  const moves = state.advanceMoves
    .filter((m) => advanceIds.has(m.adiantamento_id))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const pendingByLote = await fetchPendingPaymentsForLots(lots.map((l) => l.id));

  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderHotelExtrato(hotelData, reservas, lots, pendingByLote, advances, moves)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-extrato]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelectorAll('[data-confirmar-pagamento]').forEach((b) => {
    b.addEventListener('click', () => confirmarPagamentoExtrato(b.dataset.confirmarPagamento, hotelId));
  });
}

function renderHoteisShell() {
  injectEstilosFrotas();
  contentEl.innerHTML = `
    <section class="card mt-16 ah-page" id="ahPage">
      <div class="frotas-hub-tabs" id="ahTabs"></div>
      <div class="frotas-hub-tab-body fm-shell">
        <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" id="ahAtualizar" type="button">↻ Atualizar</button></div></div>
        <div id="ahBoard"></div>
      </div>
    </section>
  `;
  document.getElementById('ahAtualizar').onclick = () => loadPainel();
  renderAll();
  if (!state.loaded && !state.loading) loadPainel();
}

function renderFinanceiroPage() {
  injectEstilosFrotas();
  contentEl.innerHTML = renderFinanceiroShell();
  document.getElementById('ahFinAtualizar').onclick = () => loadFinanceiroQueue();
  if (!financeiro.loaded && !financeiro.loading) {
    loadFinanceiroQueue();
  } else {
    renderFinanceiroBoard();
  }
}

function setPageTitle(mode) {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = mode === 'alojamentos' ? 'Alojamentos' : mode === 'financeiro' ? 'Confirmação de Pagamento' : 'Hotéis';
}

export function renderContent(content) {
  ensureStyles();
  contentEl = content;
  const mode = currentMode();
  setPageTitle(mode);
  if (mode === 'alojamentos') {
    injectEstilosFrotas();
    content.innerHTML = renderShellAlojamentos();
  } else if (mode === 'financeiro') {
    renderFinanceiroPage();
  } else {
    renderHoteisShell();
  }
}

window.addEventListener('hashchange', () => {
  if (!contentEl) return;
  renderContent(contentEl);
});

initProtectedPage('Hospedagem', renderContent);
