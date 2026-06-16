const CONTEXT_KEY = 'painel_user_context';

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getAccess() {
  try {
    const context = JSON.parse(localStorage.getItem(CONTEXT_KEY) || 'null');
    if (!context) return null;
    if (context?.user?.is_master || normalize(context?.user?.role) === 'master') {
      return { allowed: new Set(['dashboard', 'fluxo', 'importar', 'config', 'detalhes', 'despesas', 'pagamentos']), editFluxo: true };
    }

    const modules = Array.isArray(context.modules) ? context.modules : [];
    const visible = new Map();
    modules.forEach((module) => {
      if (module?.can_view === false) return;
      visible.set(normalize(module.code || module.codigo), module);
    });

    const has = (...codes) => codes.some((code) => visible.has(normalize(code)));
    const canEdit = (...codes) => codes.some((code) => {
      const module = visible.get(normalize(code));
      return module && (module.can_edit || module.can_create || module.can_approve);
    });

    const allowed = new Set();
    if (has('financeiro', 'financeiro_fluxo_caixa', 'fluxo_caixa')) {
      allowed.add('dashboard');
      allowed.add('fluxo');
      allowed.add('detalhes');
      if (canEdit('financeiro', 'financeiro_fluxo_caixa', 'fluxo_caixa')) {
        allowed.add('importar');
        allowed.add('config');
      }
    }
    if (has('financeiro_despesas', 'financeiro_adiantamentos', 'financeiro_alimentacao', 'adiantamentos', 'alimentacao', 'diarias')) {
      allowed.add('despesas');
    }
    if (has('financeiro_pagamentos', 'pagamentos')) allowed.add('pagamentos');

    return { allowed, editFluxo: allowed.has('importar') || allowed.has('config') };
  } catch {
    return null;
  }
}

function firstAllowed(allowed) {
  return ['dashboard', 'fluxo', 'despesas', 'pagamentos', 'importar', 'config', 'detalhes'].find((tab) => allowed.has(tab)) || '';
}

function applyPermissions() {
  const access = getAccess();
  if (!access || !access.allowed.size) return;

  document.querySelectorAll('.fin-tab[data-tab]').forEach((button) => {
    button.hidden = !access.allowed.has(button.dataset.tab);
  });
  document.querySelectorAll('[data-tab-target]').forEach((button) => {
    button.hidden = !access.allowed.has(button.dataset.tabTarget);
  });

  const current = normalize(window.location.hash.replace(/^#/, '')) || 'dashboard';
  if (!access.allowed.has(current)) {
    const fallback = firstAllowed(access.allowed);
    if (fallback) history.replaceState(null, '', `#${fallback}`);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-tab], [data-tab-target]');
  if (!target) return;
  const tab = target.dataset.tab || target.dataset.tabTarget;
  const access = getAccess();
  if (tab && access && !access.allowed.has(tab)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    alert('Você não possui permissão para esta área financeira.');
  }
}, true);

window.addEventListener('hashchange', applyPermissions);
new MutationObserver(applyPermissions).observe(document.documentElement, { childList: true, subtree: true });
applyPermissions();
