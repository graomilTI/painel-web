function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function installReportFilters() {
  const dateFrom = document.getElementById('liDateFrom');
  const dateTo = document.getElementById('liDateTo');
  const minimumLoads = document.getElementById('liMinimumLoads');
  const recentDays = document.getElementById('liRecentDays');
  const minimumSequence = document.getElementById('liMinimumSequence');
  const feedback = document.getElementById('liFeedback');
  const generate = document.getElementById('liGenerate');

  if (!dateFrom || !dateTo || !minimumLoads || !recentDays || !minimumSequence || !feedback || !generate) {
    return false;
  }
  if (dateFrom.dataset.filtersInstalled === 'true') return true;

  dateFrom.dataset.filtersInstalled = 'true';
  const today = localToday();
  dateFrom.value = today;
  dateTo.value = today;
  minimumLoads.value = '9';
  recentDays.value = '3';
  minimumSequence.value = '3';

  recentDays.closest('.li-field')?.querySelector('label')?.replaceChildren('Contagem de dias');
  minimumSequence.closest('.li-field')?.setAttribute('hidden', '');

  const markChanged = (input) => { input.dataset.userChanged = 'true'; };
  [dateFrom, dateTo, minimumLoads].forEach((input) => {
    input.addEventListener('input', () => markChanged(input));
  });

  recentDays.addEventListener('input', () => {
    const count = Math.max(2, Number(recentDays.value) || 3);
    recentDays.value = String(count);
    minimumSequence.value = String(count);
  });

  const restoreVolumeDefaults = () => {
    let changed = false;
    if (dateFrom.dataset.userChanged !== 'true' && dateFrom.value !== today) {
      dateFrom.value = today;
      changed = true;
    }
    if (dateTo.dataset.userChanged !== 'true' && dateTo.value !== today) {
      dateTo.value = today;
      changed = true;
    }
    if (minimumLoads.dataset.userChanged !== 'true' && minimumLoads.value !== '9') {
      minimumLoads.value = '9';
      changed = true;
    }
    if (changed && document.querySelector('[data-mode="volume"]')?.classList.contains('active')) {
      generate.click();
    }
  };

  new MutationObserver(() => {
    const message = feedback.textContent || '';
    if (/linhas (carregadas|processadas)/i.test(message)) restoreVolumeDefaults();
  }).observe(feedback, { childList: true, characterData: true, subtree: true });

  return true;
}

function installFileImportButton() {
  const legacyLabel = document.getElementById('liFileLabel');
  const fileInput = document.getElementById('liFileInput');

  if (document.getElementById('liFileButton')) return true;
  if (!legacyLabel || !fileInput) return false;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'liFileButton';
  button.className = 'btn btn-secondary';

  const updateCaption = () => {
    const nheMode = document.querySelector('[data-mode="nhe"]')?.classList.contains('active');
    button.textContent = nheMode ? 'Importar relatório NHE' : 'Importar Resultado Diário';
  };

  fileInput.hidden = true;
  legacyLabel.before(fileInput);
  legacyLabel.replaceWith(button);

  button.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  document.querySelectorAll('[data-mode]').forEach((modeButton) => {
    modeButton.addEventListener('click', () => queueMicrotask(updateCaption));
  });

  updateCaption();
  return true;
}

function installDownloadStateObserver() {
  const pages = document.getElementById('liReportPages');
  const downloadAll = document.getElementById('liDownloadAll');

  if (!pages || !downloadAll) return false;
  if (pages.dataset.downloadObserverInstalled === 'true') return true;

  pages.dataset.downloadObserverInstalled = 'true';

  const updateDownloadState = () => {
    const hasPages = Boolean(pages.querySelector('.li-report-page'));
    const isGenerating = downloadAll.textContent.includes('Gerando');
    downloadAll.disabled = !hasPages || isGenerating;
  };

  new MutationObserver(updateDownloadState).observe(pages, { childList: true });
  updateDownloadState();
  return true;
}

function installUiEnhancements() {
  const filtersReady = installReportFilters();
  const fileReady = installFileImportButton();
  const downloadReady = installDownloadStateObserver();
  return filtersReady && fileReady && downloadReady;
}

if (!installUiEnhancements()) {
  const bootstrapObserver = new MutationObserver(() => {
    if (installUiEnhancements()) bootstrapObserver.disconnect();
  });

  bootstrapObserver.observe(document.body, { childList: true, subtree: true });
}
