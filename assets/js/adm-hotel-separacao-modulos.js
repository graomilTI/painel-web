import { supabase } from './supabaseClient.js';
import { contractAlert, money, esc, hydrateRow } from './adm-hotel-alojamentos-v2-helpers.js?v=20260720-kpis1';

const STYLE_ID = 'admHotelSeparacaoModulosCss';
const KPI_REFRESH_MS = 60_000;

const accommodationKpiState = {
  rows: Array.isArray(window.__alojamentosV2Rows) ? window.__alojamentosV2Rows : [],
  rowsReady: Boolean(window.__alojamentosV2RowsReady),
  rowsLoading: false,
  rowsLoadedAt: 0,
  baseFingerprint: '',
  usage: { collaborators: 0, accommodations: 0, ready: false, loading: false, error: false },
  usageDate: '',
  usageLoadedAt: 0,
  hotelHtml: '',
};

function normalizeHash() {
  return String(window.location.hash || '')
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function currentMode() {
  return normalizeHash().includes('aloj') ? 'alojamentos' : 'hoteis';
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function kpiIcon(name) {
  const paths = {
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
    active: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M16 8h-5a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4H8M12 6v12"/>',
    contract: '<path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.home}</svg>`;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #pageContent.adm-menu-mode-alojamentos .adm-hosp-tabs {
      display: none !important;
    }
    #pageContent.adm-menu-mode-alojamentos .adm-hosp-panel {
      display: none !important;
    }
    #pageContent.adm-menu-mode-alojamentos #tab-alojamentos {
      display: block !important;
    }
    #pageContent.adm-menu-mode-alojamentos .aloj-v2-kpis {
      display: none !important;
    }
    #pageContent.adm-menu-mode-hoteis [data-tab="alojamentos"],
    #pageContent.adm-menu-mode-hoteis #tab-alojamentos {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

function activatePanel(root, panelName) {
  root.querySelectorAll('.adm-hosp-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${panelName}`);
  });
  root.querySelectorAll('.adm-hosp-tab[data-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === panelName);
  });
}

function updateHero(root, mode) {
  const hero = root.querySelector('.hero-card');
  const pageTitle = document.getElementById('pageTitle');
  if (!hero) return;

  if (mode === 'alojamentos') {
    setText(pageTitle, 'Alojamentos');
    setText(hero.querySelector('.eyebrow'), 'Hospedagem');
    setText(hero.querySelector('h2'), 'Alojamentos');
    setText(hero.querySelector('p'), 'Controle dos alojamentos próprios e locados utilizados na Programação.');
    setText(hero.querySelector('.hero-badge'), 'ALOJAMENTOS');
    return;
  }

  setText(pageTitle, 'Hotéis');
  setText(hero.querySelector('.eyebrow'), 'Hospedagem');
  setText(hero.querySelector('h2'), 'Hotéis');
  setText(hero.querySelector('p'), 'Dashboard, solicitações, reservas, checkouts, histórico e cadastro de hotéis.');
  setText(hero.querySelector('.hero-badge'), 'HOTELARIA');
}

function accommodationRows() {
  if (Array.isArray(window.__alojamentosV2Rows)) return window.__alojamentosV2Rows;
  return accommodationKpiState.rows;
}

function renderAccommodationKpis() {
  const root = document.getElementById('hospV2Kpis');
  if (!root) return;

  const rows = accommodationRows();
  const ready = Boolean(window.__alojamentosV2RowsReady || accommodationKpiState.rowsReady);
  const total = rows.length;
  const activeRows = rows.filter((row) => String(row.status || 'ATIVO').toUpperCase() === 'ATIVO');
  const active = activeRows.length;
  const capacity = activeRows.reduce((sum, row) => sum + Number(row.capacidade || 0), 0);
  const rent = rows.reduce((sum, row) => sum + Number(row.valor_aluguel || 0), 0);
  const expiringContracts = rows.filter(contractAlert).length;
  const usage = accommodationKpiState.usage;

  let usageValue = '...';
  let usageNote = 'Consultando Programação';
  if (usage.error) {
    usageValue = '—';
    usageNote = 'Não foi possível consultar';
  } else if (usage.ready) {
    usageValue = usage.collaborators;
    usageNote = `${usage.accommodations} alojamento${usage.accommodations === 1 ? '' : 's'} em uso`;
  }

  const cards = [
    ['Alojamentos', ready ? total : '...', ready ? `${active} ativos` : 'Carregando cadastros', 'home', '#4ade80'],
    ['Ativos', ready ? active : '...', ready ? `${capacity} vagas cadastradas` : 'Carregando estrutura', 'active', '#4ade80'],
    ['Em uso hoje', usageValue, usageNote, 'users', '#38bdf8'],
    ['Aluguel mensal', ready ? money(rent) : '...', ready ? 'Custo fixo cadastrado' : 'Carregando valores', 'money', '#fb923c'],
    ['Contratos a vencer', ready ? expiringContracts : '...', 'Próximos 60 dias', 'contract', '#facc15'],
  ];

  const signature = JSON.stringify(cards);
  const isAccommodationRender = Boolean(root.querySelector('[data-kpi-scope="alojamentos"]'));
  if (!isAccommodationRender && root.innerHTML.trim()) accommodationKpiState.hotelHtml = root.innerHTML;
  if (isAccommodationRender && root.dataset.alojKpiSignature === signature) return;

  root.dataset.alojKpiSignature = signature;
  root.innerHTML = cards.map(([label, value, note, iconName, color]) => `
    <article class="hosp-v2-kpi" data-kpi-scope="alojamentos" style="--kpi:${color}">
      <div class="hosp-v2-kpi-ico">${kpiIcon(iconName)}</div>
      <div><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div>
    </article>`).join('');
}

function restoreHotelKpis() {
  const root = document.getElementById('hospV2Kpis');
  if (!root) return;
  const isAccommodationRender = Boolean(root.querySelector('[data-kpi-scope="alojamentos"]'));
  if (isAccommodationRender && accommodationKpiState.hotelHtml) root.innerHTML = accommodationKpiState.hotelHtml;
  root.removeAttribute('data-aloj-kpi-signature');
  if (!isAccommodationRender && root.innerHTML.trim()) accommodationKpiState.hotelHtml = root.innerHTML;
}

async function loadAccommodationRows({ force = false } = {}) {
  if (accommodationKpiState.rowsLoading) return;
  const isFresh = accommodationKpiState.rowsReady
    && Date.now() - accommodationKpiState.rowsLoadedAt < KPI_REFRESH_MS;
  if (!force && isFresh) return;

  accommodationKpiState.rowsLoading = true;
  try {
    const { data, error } = await supabase
      .from('hospedagem_alojamentos')
      .select('*')
      .order('cidade', { ascending: true })
      .order('nome', { ascending: true });
    if (error) throw error;
    accommodationKpiState.rows = (data || []).map(hydrateRow);
    accommodationKpiState.rowsReady = true;
    accommodationKpiState.rowsLoadedAt = Date.now();
  } catch (error) {
    console.error('[alojamentos-kpis] cadastros:', error);
  } finally {
    accommodationKpiState.rowsLoading = false;
  }
  if (currentMode() === 'alojamentos') renderAccommodationKpis();
}

async function loadAccommodationUsage({ force = false } = {}) {
  if (accommodationKpiState.usage.loading) return;
  const date = todayInSaoPaulo();
  const isFresh = accommodationKpiState.usage.ready
    && accommodationKpiState.usageDate === date
    && Date.now() - accommodationKpiState.usageLoadedAt < KPI_REFRESH_MS;
  if (!force && isFresh) return;

  accommodationKpiState.usage = { ...accommodationKpiState.usage, loading: true, error: false };
  renderAccommodationKpis();

  try {
    const [current, legacy] = await Promise.all([
      supabase.from('programacao_estadia').select('*').eq('data_referencia', date).limit(5000),
      supabase.from('programacao_estadia').select('*').is('data_referencia', null).lte('checkin', date).limit(5000),
    ]);
    if (current.error) throw current.error;
    if (legacy.error) console.warn('[alojamentos-kpis] registros sem data_referencia:', legacy.error.message);

    const rows = [...(current.data || []), ...(legacy.data || [])].filter((row) => {
      if (normalizeText(row.tipo_estadia) !== 'alojamento') return false;
      if (row.tem_estadia === false) return false;
      if (!row.alojamento_id && !String(row.alojamento_nome || '').trim()) return false;
      const referenceDate = row.data_referencia || row.checkin || '';
      const checkout = row.checkout || '';
      return referenceDate <= date && (!checkout || checkout >= date);
    });

    const collaborators = new Set();
    const accommodations = new Set();
    rows.forEach((row) => {
      const collaborator = String(row.colaborador_id || row.nome_colaborador || '').trim();
      const accommodation = String(row.alojamento_id || row.alojamento_nome || '').trim();
      if (collaborator) collaborators.add(normalizeText(collaborator));
      if (accommodation) accommodations.add(normalizeText(accommodation));
    });

    accommodationKpiState.usage = {
      collaborators: collaborators.size,
      accommodations: accommodations.size,
      ready: true,
      loading: false,
      error: false,
    };
    accommodationKpiState.usageDate = date;
    accommodationKpiState.usageLoadedAt = Date.now();
  } catch (error) {
    console.error('[alojamentos-kpis] Programação:', error);
    accommodationKpiState.usage = {
      collaborators: 0,
      accommodations: 0,
      ready: false,
      loading: false,
      error: true,
    };
    accommodationKpiState.usageDate = date;
    accommodationKpiState.usageLoadedAt = Date.now();
  }

  if (currentMode() === 'alojamentos') renderAccommodationKpis();
}

function internalKpiFingerprint() {
  return ['alojV2KpiTotal', 'alojV2KpiAtivos', 'alojV2KpiAluguel', 'alojV2KpiContratos']
    .map((id) => document.getElementById(id)?.textContent?.trim() || '')
    .join('|');
}

function applySeparation() {
  ensureStyles();
  const root = document.getElementById('pageContent');
  if (!root || !root.querySelector('.adm-hosp-tabs') || !root.querySelector('#tab-alojamentos')) return false;

  const mode = currentMode();
  root.classList.toggle('adm-menu-mode-alojamentos', mode === 'alojamentos');
  root.classList.toggle('adm-menu-mode-hoteis', mode === 'hoteis');
  updateHero(root, mode);

  if (mode === 'alojamentos') {
    activatePanel(root, 'alojamentos');
    const fingerprint = internalKpiFingerprint();
    const changed = fingerprint && fingerprint !== accommodationKpiState.baseFingerprint;
    if (changed) accommodationKpiState.baseFingerprint = fingerprint;
    renderAccommodationKpis();
    loadAccommodationRows({ force: changed });
    loadAccommodationUsage();
  } else {
    restoreHotelKpis();
    const activeHotelPanel = root.querySelector('.adm-hosp-panel.active:not(#tab-alojamentos)');
    if (!activeHotelPanel) activatePanel(root, 'dashboard');
  }
  return true;
}

let scheduled = false;
function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applySeparation();
  });
}

if (!window.__admHotelSeparacaoModulos) {
  window.__admHotelSeparacaoModulos = true;
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleApply);
  window.addEventListener('focus', () => {
    if (currentMode() === 'alojamentos') {
      loadAccommodationRows();
      loadAccommodationUsage();
    }
  });
  window.addEventListener('alojamentos:loaded', (event) => {
    accommodationKpiState.rows = Array.isArray(event.detail?.rows) ? event.detail.rows : [];
    accommodationKpiState.rowsReady = true;
    accommodationKpiState.rowsLoadedAt = Date.now();
    if (currentMode() === 'alojamentos') renderAccommodationKpis();
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('a[href*="adm-hotel#"]')) setTimeout(scheduleApply, 0);
  }, true);
}

scheduleApply();
