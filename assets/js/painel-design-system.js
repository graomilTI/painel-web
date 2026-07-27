const STYLE_ID = 'painelDesignSystemStyles';
const FIXES_STYLE_ID = 'painelDesignSystemFixes';
const ROOT_CLASS = 'painel-ui-v2';

function enableDesignSystem() {
  document.documentElement.classList.add(ROOT_CLASS);
}

function ensureDesignSystemStyles() {
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    enableDesignSystem();
    return existing;
  }

  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../css/painel-design-system.css?v=20260727-visual2', import.meta.url).href;
  link.addEventListener('load', enableDesignSystem, { once: true });
  link.addEventListener('error', () => {
    console.warn('[painel-design-system] Não foi possível carregar a camada visual global.');
  }, { once: true });

  document.head.appendChild(link);
  enableDesignSystem();
  return link;
}

function ensureDesignSystemFixes() {
  const existing = document.getElementById(FIXES_STYLE_ID);
  if (existing) return existing;

  const link = document.createElement('link');
  link.id = FIXES_STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../css/painel-design-system-fixes.css?v=20260724-layout2', import.meta.url).href;
  link.addEventListener('error', () => {
    console.warn('[painel-design-system] Não foi possível carregar as correções visuais isoladas.');
  }, { once: true });

  document.head.appendChild(link);
  return link;
}

ensureDesignSystemStyles();
ensureDesignSystemFixes();

export { ensureDesignSystemStyles, ensureDesignSystemFixes };
