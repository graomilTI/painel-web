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
  const [year, month, day] = localDate().split('-').map(Number);
  return localDate(new Date(Date.UTC(year, month - 1, day + days, 12)));
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

// Observer nunca desconecta: sob soft-nav o módulo só executa uma vez, mas o
// #cfgData/#filterInicio etc. são recriados a cada renderContent(). O guard
// dataset.localDateInitialized em applyLocalDefaults já evita reaplicar em
// campos que o usuário alterou, então é seguro rodar em todo re-render.
applyLocalDefaults();
new MutationObserver(applyLocalDefaults).observe(document.documentElement, { childList: true, subtree: true });
