// Módulo Hotel — Fase 1: casca + painel somente-leitura contra o banco real.
// Reconstrução em fases depois da PR #274 (zerou o módulo antigo). Continua
// servindo #alojamentos com a casca mínima (o conteúdo de verdade é montado
// por adm-hotel-alojamentos-v2.js e companhia, via adm-hotel-deferred.js).
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { ensureStyles, tabGroup } from './adm-hotel-helpers.js';
import { renderShellAlojamentos, renderTabsBar, renderTable, renderFluxoPlaceholder, renderDetalhes } from './adm-hotel-view.js';

function currentMode() {
  return String(location.hash || '').toLowerCase().includes('aloj') ? 'alojamentos' : 'hoteis';
}

const state = {
  rows: [], hotels: [], people: [], assignments: [], links: [], quotes: [], finance: [], documents: [],
  loading: false, error: null, loaded: false,
  activeTab: 'todas', openKpi: null,
};

let contentEl = null;

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

function openDetalhes(solicitacaoId) {
  const row = state.rows.find((r) => r.solicitacao_id === solicitacaoId);
  if (!row) return;
  let root = document.getElementById('ahModalRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ahModalRoot';
    document.body.appendChild(root);
  }
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderDetalhes(row, state.quotes)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDetalhes));
}

function closeDetalhes() {
  const root = document.getElementById('ahModalRoot');
  if (root) root.innerHTML = '';
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
