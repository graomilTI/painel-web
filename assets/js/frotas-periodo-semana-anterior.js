function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function previousCompletedWeek(reference = new Date()) {
  const end = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const daysSinceSunday = end.getDay();
  end.setDate(end.getDate() - (daysSinceSunday || 7));

  const start = new Date(end);
  start.setDate(end.getDate() - 6);

  return {
    start: toInputDate(start),
    end: toInputDate(end)
  };
}

export function applyPreviousWeekDefaults(root = document) {
  const startInput = root.querySelector('[data-sync-report-start]');
  const endInput = root.querySelector('[data-sync-report-end]');
  if (!startInput || !endInput) return false;

  const range = previousCompletedWeek();
  if (!startInput.value) startInput.value = range.start;
  if (!endInput.value) endInput.value = range.end;
  return true;
}

function triggerAutomaticSync(root = document) {
  const startInput = root.querySelector('[data-sync-report-start]');
  const endInput = root.querySelector('[data-sync-report-end]');
  const syncButton = root.querySelector('[data-sync-bfleet-period]');
  if (!startInput?.value || !endInput?.value || !syncButton) return false;
  if (syncButton.dataset.autoSyncTriggered === '1') return true;

  syncButton.dataset.autoSyncTriggered = '1';
  window.setTimeout(() => {
    if (!syncButton.isConnected || syncButton.disabled) return;
    syncButton.click();
  }, 0);
  return true;
}

export function installPreviousWeekDefaults(root = document) {
  applyPreviousWeekDefaults(root);
  triggerAutomaticSync(root);
  const target = root.querySelector('#pageContent') || root.body;
  if (!target || target.dataset.previousWeekDefaultsInstalled === '1') return;

  const observer = new MutationObserver(() => {
    applyPreviousWeekDefaults(root);
    triggerAutomaticSync(root);
  });
  observer.observe(target, { childList: true, subtree: true });
  target.dataset.previousWeekDefaultsInstalled = '1';
}
