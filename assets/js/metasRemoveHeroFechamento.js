const SELECTOR = '.metas-config-hero, .metas-flow-stepper';

function removeRedundantBlocks(root = document) {
  root.querySelectorAll(SELECTOR).forEach((element) => element.remove());
}

function init() {
  removeRedundantBlocks();

  const target = document.getElementById('pageContent') || document.body;
  const observer = new MutationObserver(() => removeRedundantBlocks(target));
  observer.observe(target, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
