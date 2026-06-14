const TIME_ZONE = 'America/Sao_Paulo';

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dateOffset(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function applyLocalDefaults() {
  const today = localDate();
  const start = dateOffset(-7);
  const fields = {
    filterInicio: start,
    filterFim: dateOffset(30),
    cfgData: today,
    alimInicio: start,
    alimFim: today,
  };

  if (!document.getElementById('cfgData')) return false;
  let periodChanged = false;
  Object.entries(fields).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.localDateInitialized) return;
    periodChanged ||= id.startsWith('filter') && input.value !== value;
    input.value = value;
    input.dataset.localDateInitialized = 'true';
  });

  if (periodChanged) {
    document.getElementById('periodForm')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
  return true;
}

if (!applyLocalDefaults()) {
  const observer = new MutationObserver(() => {
    if (applyLocalDefaults()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15000);
}
