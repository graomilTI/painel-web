function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function installVolumeDefaults() {
  const dateFrom = document.getElementById('liDateFrom');
  const dateTo = document.getElementById('liDateTo');
  const minimumLoads = document.getElementById('liMinimumLoads');
  const feedback = document.getElementById('liFeedback');
  const generate = document.getElementById('liGenerate');

  if (!dateFrom || !dateTo || !minimumLoads || !feedback || !generate) return false;
  if (dateFrom.dataset.defaultsInstalled === 'true') return true;

  dateFrom.dataset.defaultsInstalled = 'true';
  const today = localToday();
  dateFrom.value = today;
  dateTo.value = today;
  minimumLoads.value = '9';

  [dateFrom, dateTo, minimumLoads].forEach((input) => {
    input.addEventListener('input', () => { input.dataset.userChanged = 'true'; });
  });

  const restoreDefaults = () => {
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
    if (/linhas (carregadas|processadas)/i.test(feedback.textContent || '')) restoreDefaults();
  }).observe(feedback, { childList: true, characterData: true, subtree: true });

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
  return installVolumeDefaults() && installDownloadStateObserver();
}

if (!installUiEnhancements()) {
  const bootstrapObserver = new MutationObserver(() => {
    if (installUiEnhancements()) bootstrapObserver.disconnect();
  });

  bootstrapObserver.observe(document.body, { childList: true, subtree: true });
}
