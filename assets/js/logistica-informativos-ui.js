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
  const fileReady = installFileImportButton();
  const downloadReady = installDownloadStateObserver();
  return fileReady && downloadReady;
}

if (!installUiEnhancements()) {
  const bootstrapObserver = new MutationObserver(() => {
    if (installUiEnhancements()) bootstrapObserver.disconnect();
  });

  bootstrapObserver.observe(document.body, { childList: true, subtree: true });
}
