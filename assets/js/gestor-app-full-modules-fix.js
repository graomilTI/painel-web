import { toPanelUrl } from './paths.js';

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

// O App Gestor nasceu com abas internas simplificadas de Programação e
// Patrimônio. Hoje os módulos reais já têm apresentação mobile no painel; por
// isso o shell deve abrir essas rotas reais, preservando todas as regras e
// procedimentos em vez de manter uma segunda implementação parcial.
document.addEventListener('click', interceptModuleLinks, true);
document.addEventListener('click', interceptLegacyTabs, true);
