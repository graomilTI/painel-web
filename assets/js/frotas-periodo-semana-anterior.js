const LAST_SYNC_KEY = 'frotas_bfleet_ultima_sincronizacao_v1';
const BFLEET_FUNCTION = 'sync-bfleet-excesso-velocidade';

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

function ensureImportedRecordsVisible() {
  if (document.getElementById('frotasImportedRecordsVisible')) return;
  const style = document.createElement('style');
  style.id = 'frotasImportedRecordsVisible';
  style.textContent = `
    .speed-import-list{
      max-height:none !important;
      overflow:visible !important;
    }
    .speed-import-list .speed-import-filter-note{order:0}
    .speed-import-list .speed-import-item{order:1}
    .speed-import-list .speed-import-bulk{
      order:2;
      margin-top:12px;
      padding-top:12px;
      border-top:1px solid rgba(148,163,184,.14);
    }
  `;
  document.head.appendChild(style);
}

function loadLastSync() {
  try {
    return JSON.parse(localStorage.getItem(LAST_SYNC_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveLastSync(body = {}) {
  const start = body.dataInicial || body.startDate || '';
  const end = body.dataFinal || body.endDate || '';
  if (!start || !end) return;
  localStorage.setItem(LAST_SYNC_KEY, JSON.stringify({
    syncedOn: toInputDate(new Date()),
    start,
    end,
    syncedAt: new Date().toISOString()
  }));
}

function installSuccessfulSyncTracker(supabase) {
  const functions = supabase?.functions;
  if (!functions?.invoke || functions.__fleetSyncTrackerInstalled) return;

  try {
    const originalInvoke = functions.invoke.bind(functions);
    functions.invoke = async function trackedInvoke(name, options = {}) {
      const result = await originalInvoke(name, options);
      if (
        name === BFLEET_FUNCTION
        && !result?.error
        && !result?.data?.error
        && options?.body
      ) {
        saveLastSync(options.body);
      }
      return result;
    };

    Object.defineProperty(functions, '__fleetSyncTrackerInstalled', {
      value: true,
      enumerable: false
    });
  } catch (error) {
    console.warn('[FROTAS] Não foi possível registrar o controle diário da sincronização:', error);
  }
}

function alreadySyncedToday(start, end) {
  const last = loadLastSync();
  return Boolean(
    last
    && last.syncedOn === toInputDate(new Date())
    && last.start === start
    && last.end === end
  );
}

function showStoredDataStatus(root, start, end) {
  const count = root.querySelector('[data-imported-excess-count]');
  if (!count || count.dataset.storedStatusApplied === '1') return;
  count.dataset.storedStatusApplied = '1';
  count.title = `Dados já sincronizados hoje para ${start} até ${end}. Carregados do Supabase sem nova chamada à API.`;
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
  const refreshButton = root.querySelector('[data-refresh-imported-excessos]');
  if (!startInput?.value || !endInput?.value || !syncButton) return false;
  if (syncButton.dataset.autoSyncTriggered === '1') return true;

  syncButton.dataset.autoSyncTriggered = '1';
  window.setTimeout(() => {
    if (!syncButton.isConnected) return;
    if (alreadySyncedToday(startInput.value, endInput.value)) {
      showStoredDataStatus(root, startInput.value, endInput.value);
      if (refreshButton?.isConnected && !refreshButton.disabled) refreshButton.click();
      return;
    }
    if (!syncButton.disabled) syncButton.click();
  }, 0);
  return true;
}

export function installPreviousWeekDefaults(root = document, supabase = null) {
  installSuccessfulSyncTracker(supabase);
  ensureImportedRecordsVisible();
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
