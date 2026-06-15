const pages = document.getElementById('liReportPages');
const downloadAll = document.getElementById('liDownloadAll');

if (pages && downloadAll) {
  const updateDownloadState = () => {
    const hasPages = Boolean(pages.querySelector('.li-report-page'));
    const isGenerating = downloadAll.textContent.includes('Gerando');
    downloadAll.disabled = !hasPages || isGenerating;
  };

  new MutationObserver(updateDownloadState).observe(pages, { childList: true });
  updateDownloadState();
}
