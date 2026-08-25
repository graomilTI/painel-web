// Módulo Hotel — Fase 1: casca + painel somente-leitura contra o banco real.
// Reconstrução em fases depois da PR #274 (zerou o módulo antigo). Continua
// servindo #alojamentos com a casca mínima (o conteúdo de verdade é montado
// por adm-hotel-alojamentos-v2.js e companhia, via adm-hotel-deferred.js).
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { ensureStyles, tabGroup, buildCotacaoMessage, toast } from './adm-hotel-helpers.js';
import {
  renderShellAlojamentos, renderTabsBar, renderTable, renderFluxoPlaceholder, renderDetalhes,
  renderCotacoesSection, renderHoteisPicker, renderPickerList,
} from './adm-hotel-view.js';

function currentMode() {
  return String(location.hash || '').toLowerCase().includes('aloj') ? 'alojamentos' : 'hoteis';
}

const state = {
  rows: [], hotels: [], people: [], assignments: [], links: [], quotes: [], finance: [], documents: [],
  loading: false, error: null, loaded: false,
  activeTab: 'todas', openKpi: null,
};

const picker = {
  open: false,
  solicitacaoId: null,
  query: '',
  selected: new Set(),
  sending: false,
};

let contentEl = null;
let quotesChannel = null;

function visibleRows() {
  if (state.activeTab === 'todas' || state.activeTab === 'fluxo') return state.rows;
  return state.rows.filter((r) => tabGroup(r) === state.activeTab);
}

function renderTabsAndWire() {
  const el = document.getElementById('ahTabs');
  if (!el) return;
  el.innerHTML = renderTabsBar(state.rows, state.activeTab, state.openKpi);
  el.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      state.activeTab = b.dataset.tab;
      state.openKpi = null;
      renderAll();
    });
  });
  el.querySelectorAll('.ah-kpi-arrow').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = a.dataset.kpi;
      state.openKpi = state.openKpi === key ? null : key;
      renderTabsAndWire();
    });
  });
}

function renderBoard() {
  const board = document.getElementById('ahBoard');
  if (!board) return;
  if (state.activeTab === 'fluxo') {
    board.innerHTML = renderFluxoPlaceholder();
    return;
  }
  if (state.loading) {
    board.innerHTML = '<div class="card ah-empty">Carregando...</div>';
    return;
  }
  if (state.error) {
    board.innerHTML = `<div class="card ah-empty ah-error">Erro ao carregar: ${state.error}</div>`;
    return;
  }
  board.innerHTML = renderTable(visibleRows());
  board.querySelectorAll('[data-open]').forEach((b) => {
    b.addEventListener('click', () => openDetalhes(b.dataset.open));
  });
}

function renderAll() {
  renderTabsAndWire();
  renderBoard();
}

async function loadPainel() {
  state.loading = true;
  state.error = null;
  renderAll();
  const { data, error } = await supabase.rpc('hospedagem_carregar_painel_v2');
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

function subscribeQuotes(solicitacaoId) {
  unsubscribeQuotes();
  quotesChannel = supabase
    .channel(`ah-cotacoes-${solicitacaoId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'hospedagem_cotacoes', filter: `solicitacao_id=eq.${solicitacaoId}`,
    }, (payload) => {
      const changed = (payload.new && Object.keys(payload.new).length) ? payload.new : payload.old;
      if (!changed) return;
      if (payload.eventType === 'DELETE') {
        state.quotes = state.quotes.filter((q) => q.id !== changed.id);
      } else {
        const idx = state.quotes.findIndex((q) => q.id === changed.id);
        if (idx >= 0) state.quotes[idx] = changed; else state.quotes.push(changed);
      }
      refreshCotacoesBox(solicitacaoId);
    })
    .subscribe();
}

function unsubscribeQuotes() {
  if (quotesChannel) {
    supabase.removeChannel(quotesChannel);
    quotesChannel = null;
  }
}

function refreshCotacoesBox(solicitacaoId) {
  const box = document.getElementById('ahCotacoesBox');
  if (!box) return;
  const quotesForRow = state.quotes.filter((q) => q.solicitacao_id === solicitacaoId);
  box.innerHTML = renderCotacoesSection(findRow(solicitacaoId) || {}, quotesForRow);
  wireCotacoesBox();
}

function wireCotacoesBox() {
  document.querySelectorAll('[data-use-quote]').forEach((b) => {
    b.addEventListener('click', () => useQuote(b.dataset.useQuote));
  });
}

async function useQuote(quoteId) {
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  const solicitacaoId = quote.solicitacao_id;
  const others = state.quotes.filter((q) => q.solicitacao_id === solicitacaoId && q.id !== quoteId && q.selecionada);

  const { error } = await supabase
    .from('hospedagem_cotacoes')
    .update({ selecionada: true, selecionada_em: new Date().toISOString() })
    .eq('id', quoteId);
  if (error) {
    toast(`Erro ao selecionar cotação: ${error.message}`, 'err');
    return;
  }
  if (others.length) {
    await supabase.from('hospedagem_cotacoes').update({ selecionada: false }).in('id', others.map((q) => q.id));
  }
  quote.selecionada = true;
  quote.selecionada_em = new Date().toISOString();
  others.forEach((q) => { q.selecionada = false; });
  refreshCotacoesBox(solicitacaoId);
  toast('Cotação selecionada — a reserva será feita na Fase 3.');
}

function openDetalhes(solicitacaoId) {
  const row = findRow(solicitacaoId);
  if (!row) return;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderDetalhes(row, state.quotes)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDetalhes));
  const cotarBtn = root.querySelector('[data-cotar]');
  if (cotarBtn) cotarBtn.addEventListener('click', () => openPicker(solicitacaoId));
  wireCotacoesBox();
  subscribeQuotes(solicitacaoId);
}

function closeDetalhes() {
  const root = document.getElementById('ahModalRoot');
  if (root) root.innerHTML = '';
  unsubscribeQuotes();
}

function hotelsForPicker() {
  return state.hotels.filter((h) => h.recebe_cotacao && h.whatsapp);
}

function sortedHotelsForPicker(row) {
  const uf = String(row?.uf || '').toUpperCase();
  return hotelsForPicker().sort((a, b) => {
    const am = String(a.uf || '').toUpperCase() === uf ? 0 : 1;
    const bm = String(b.uf || '').toUpperCase() === uf ? 0 : 1;
    if (am !== bm) return am - bm;
    return String(a.nome || '').localeCompare(String(b.nome || ''));
  });
}

function openPicker(solicitacaoId) {
  picker.open = true;
  picker.solicitacaoId = solicitacaoId;
  picker.query = '';
  picker.selected = new Set();
  picker.sending = false;
  renderPicker();
}

function renderPicker() {
  const row = findRow(picker.solicitacaoId);
  if (!row) return;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderHoteisPicker(row, picker.query)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-picker]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelector('[data-back-detalhes]')?.addEventListener('click', () => openDetalhes(row.solicitacao_id));
  const search = document.getElementById('ahPickerSearch');
  if (search) {
    search.addEventListener('input', () => {
      picker.query = search.value;
      renderPickerListBox(row);
    });
  }
  document.getElementById('ahPickerConfirm')?.addEventListener('click', () => confirmCotar(row));
  renderPickerListBox(row);
}

function renderPickerListBox(row) {
  const list = document.getElementById('ahPickerList');
  if (!list) return;
  list.innerHTML = renderPickerList(sortedHotelsForPicker(row), picker.query, picker.selected);
  list.querySelectorAll('[data-hotel-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.hotelId;
      if (cb.checked) picker.selected.add(id); else picker.selected.delete(id);
      updateConfirmButton();
    });
  });
  updateConfirmButton();
}

function updateConfirmButton() {
  const btn = document.getElementById('ahPickerConfirm');
  if (!btn) return;
  const n = picker.selected.size;
  btn.textContent = picker.sending ? 'Enviando...' : `Cotar em lote (${n})`;
  btn.disabled = n === 0 || picker.sending;
}

async function advanceStatusEmCotacao(row) {
  if (row.status_solicitacao !== 'SOLICITADA' && row.status_solicitacao !== 'EM_ANALISE') return;
  const { error } = await supabase
    .from('hospedagem_solicitacoes')
    .update({ status_solicitacao: 'EM_COTACAO' })
    .eq('id', row.solicitacao_id);
  if (!error) row.status_solicitacao = 'EM_COTACAO';
}

async function confirmCotar(row) {
  if (picker.sending || picker.selected.size === 0) return;
  picker.sending = true;
  updateConfirmButton();

  const hotels = state.hotels.filter((h) => picker.selected.has(h.id));
  const message = buildCotacaoMessage(row);
  let ok = 0;
  let fail = 0;

  for (const hotel of hotels) {
    const { data, error } = await supabase.functions.invoke('botconversa-send', {
      body: { phone: hotel.whatsapp, message, nome: hotel.nome },
    });
    const sentOk = !error && data?.ok;
    const payload = {
      solicitacao_id: row.solicitacao_id,
      hotel_id: hotel.id,
      hotel_nome: hotel.nome,
      status: sentOk ? 'ENVIADA' : 'FALHA',
      mensagem_enviada: message,
      erro_envio: sentOk ? null : (data?.error || error?.message || 'Falha ao enviar'),
      enviado_em: new Date().toISOString(),
      quantidade_pessoas: row.total_colaboradores ?? null,
      diarias_previstas: row.quantidade_diarias_prevista ?? null,
    };
    const { data: saved, error: saveErr } = await supabase
      .from('hospedagem_cotacoes')
      .upsert(payload, { onConflict: 'solicitacao_id,hotel_id' })
      .select()
      .single();
    if (!saveErr && saved) {
      const idx = state.quotes.findIndex((q) => q.id === saved.id);
      if (idx >= 0) state.quotes[idx] = saved; else state.quotes.push(saved);
    }
    if (sentOk) ok += 1; else fail += 1;
  }

  picker.sending = false;
  await advanceStatusEmCotacao(row);
  toast(fail === 0 ? `${ok} cotação(ões) enviada(s).` : `${ok} enviada(s), ${fail} falharam.`, fail === 0 ? 'ok' : 'err');
  renderAll();
  openDetalhes(row.solicitacao_id);
}

document.addEventListener('click', (e) => {
  if (state.openKpi && !e.target.closest('.ah-tab-wrap')) {
    state.openKpi = null;
    renderTabsAndWire();
  }
});

function renderHoteisShell() {
  contentEl.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Hospedagem</div>
        <h2>Hotéis</h2>
        <p>Cotação, reserva, pagamento e histórico de hospedagem em hotel.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">HOTELARIA</span></div>
    </section>
    <div class="ah-tabs" id="ahTabs"></div>
    <div id="ahBoard"></div>
  `;
  renderAll();
  if (!state.loaded && !state.loading) loadPainel();
}

function setPageTitle(mode) {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = mode === 'alojamentos' ? 'Alojamentos' : 'Hotéis';
}

export function renderContent(content) {
  ensureStyles();
  contentEl = content;
  const mode = currentMode();
  setPageTitle(mode);
  if (mode === 'alojamentos') {
    content.innerHTML = renderShellAlojamentos();
  } else {
    renderHoteisShell();
  }
}

window.addEventListener('hashchange', () => {
  if (!contentEl) return;
  renderContent(contentEl);
});

initProtectedPage('Hospedagem', renderContent);
