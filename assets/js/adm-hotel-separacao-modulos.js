const STYLE_ID = 'admHotelSeparacaoModulosCss';

function normalizeHash() {
  return String(window.location.hash || '')
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function currentMode() {
  return normalizeHash().includes('aloj') ? 'alojamentos' : 'hoteis';
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
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
  } else {
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
  document.addEventListener('click', (event) => {
    if (event.target.closest('a[href*="adm-hotel#"]')) setTimeout(scheduleApply, 0);
  }, true);
}

scheduleApply();
