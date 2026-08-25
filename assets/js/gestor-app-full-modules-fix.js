import { toPanelUrl } from './paths.js';
import './gestor-app-home-loader-v2.js?v=20260813-home2';

const REAL_MODULES = {
  programacao: 'programacao',
  patrimonio: 'patrimonios',
};

function go(path) {
  window.location.href = toPanelUrl(path);
}

function interceptModuleLinks(event) {
  const target = event.target.closest?.('[data-ux-module]');
  if (!target) return;
  const path = REAL_MODULES[target.dataset.uxModule];
  if (!path) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  go(path);
}

function interceptLegacyTabs(event) {
  const nav = event.target.closest?.('.nav-btn[data-tab]');
  if (nav) {
    const path = REAL_MODULES[nav.dataset.tab];
    if (path) {
      event.preventDefault();
      event.stopImmediatePropagation();
      go(path);
      return;
    }
  }

  const programacaoCard = event.target.closest?.('[data-go="programacao"]');
  if (programacaoCard) {
    event.preventDefault();
    event.stopImmediatePropagation();
    go('programacao');
    return;
  }

  const patrimonioCard = event.target.closest?.('[data-go="patrimonio"], [data-go="patrimonio-leitura"]');
  if (patrimonioCard) {
    event.preventDefault();
    event.stopImmediatePropagation();
    go('patrimonios');
  }
}

document.addEventListener('click', interceptModuleLinks, true);
document.addEventListener('click', interceptLegacyTabs, true);
