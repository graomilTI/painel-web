const ACTION_SELECTORS = '[data-identificar],[data-dobrar],[data-ok]';

function isLoadingTable(tbody) {
  return tbody.children.length === 1
    && tbody.textContent.trim().toLowerCase().startsWith('carregando multas');
}

export function installStableMultasActions(container) {
  const tbody = container.querySelector('[data-multas-table]');
  if (!tbody || tbody.dataset.stableActions === '1') return;
  tbody.dataset.stableActions = '1';

  let savedRows = null;
  let busyButton = null;
  let originalText = '';
  let resetTimer = null;

  function resetBusyButton() {
    window.clearTimeout(resetTimer);
    if (busyButton?.isConnected) {
      busyButton.disabled = false;
      busyButton.textContent = originalText;
    }
    busyButton = null;
    originalText = '';
  }

  function beginStableUpdate(button, label = 'Salvando...') {
    savedRows = Array.from(tbody.childNodes);
    busyButton = button || null;
    originalText = button?.textContent || '';

    window.setTimeout(() => {
      if (!busyButton?.isConnected) return;
      busyButton.disabled = true;
      busyButton.textContent = label;
    }, 0);

    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      savedRows = null;
      resetBusyButton();
    }, 20000);
  }

  container.addEventListener('click', (event) => {
    const button = event.target.closest(ACTION_SELECTORS);
    if (!button || !container.contains(button)) return;
    beginStableUpdate(button);
  }, true);

  document.addEventListener('click', (event) => {
    const save = event.target.closest('[data-fm-modal] [data-save]');
    if (!save) return;
    beginStableUpdate(save);
  }, true);

  const observer = new MutationObserver(() => {
    if (!savedRows) return;

    if (isLoadingTable(tbody)) {
      tbody.replaceChildren(...savedRows);
      return;
    }

    // A nova lista chegou do Supabase. Mantém o novo conteúdo e encerra o estado ocupado.
    savedRows = null;
    resetBusyButton();
  });

  observer.observe(tbody, { childList: true, subtree: false });
}
