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

if (!installDownloadStateObserver()) {
  const bootstrapObserver = new MutationObserver(() => {
    if (installDownloadStateObserver()) bootstrapObserver.disconnect();
  });

  bootstrapObserver.observe(document.body, { childList: true, subtree: true });
}
