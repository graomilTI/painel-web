// Programação: ajuste leve de fonte para manter cliente/local em linha única, sem reticências.
(function () {
  const MIN_FONT = 8.2;
  let scheduled = false;
  let observerReady = false;

  function fitText(el, maxFont) {
    if (!el) return;
    el.style.fontSize = `${maxFont}px`;
    el.style.transform = '';
    el.style.display = 'block';
    el.style.whiteSpace = 'nowrap';
    el.style.overflow = 'visible';
    el.style.textOverflow = 'clip';
    el.style.transformOrigin = 'left center';

    const width = el.clientWidth;
    if (!width || width < 40) return;

    let size = maxFont;
    while (el.scrollWidth > width && size > MIN_FONT) {
      size -= 0.35;
      el.style.fontSize = `${size.toFixed(2)}px`;
    }

    if (el.scrollWidth > width) {
      const scale = Math.max(0.72, width / el.scrollWidth);
      el.style.transform = `scaleX(${scale.toFixed(3)})`;
    }
  }

  function applyFit() {
    document.querySelectorAll('.peqb-os2-cliente').forEach((el) => fitText(el, window.innerWidth <= 1380 ? 11.2 : 12.4));
    document.querySelectorAll('.peqb-os2-emb').forEach((el) => fitText(el, window.innerWidth <= 1380 ? 9.7 : 10.2));
  }

  function scheduleFit() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyFit();
    });
  }

  function bindObserver() {
    if (observerReady) return;
    const list = document.getElementById('progList');
    if (!list) return;
    observerReady = true;
    new MutationObserver(scheduleFit).observe(list, { childList: true, subtree: true });
  }

  function boot() {
    bindObserver();
    scheduleFit();
    setTimeout(scheduleFit, 120);
    setTimeout(scheduleFit, 450);
    window.addEventListener('resize', scheduleFit);
    const rootObserver = new MutationObserver(() => {
      bindObserver();
      scheduleFit();
    });
    rootObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
