const STYLE_ID = 'painelDesignSystemStyles';
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
  link.href = new URL('../css/painel-design-system.css?v=20260724-layout1', import.meta.url).href;
  link.addEventListener('load', enableDesignSystem, { once: true });
  link.addEventListener('error', () => {
    console.warn('[painel-design-system] Não foi possível carregar a camada visual global.');
  }, { once: true });

  document.head.appendChild(link);
  enableDesignSystem();
  return link;
}

ensureDesignSystemStyles();

export { ensureDesignSystemStyles };
