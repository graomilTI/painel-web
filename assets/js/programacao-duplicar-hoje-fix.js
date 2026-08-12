const MAX_SELECTED_DATES = 5;

function todayIsoLocal() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

function duplicateSourceIso() {
  if (typeof window.__progGetDataReferencia === 'function') {
    return String(window.__progGetDataReferencia() || '').slice(0, 10);
  }
  return String(document.getElementById('progDataRef')?.value || '').slice(0, 10);
}

function buildDuplicateDay(iso, selected = false) {
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const date = new Date(`${iso}T12:00:00`);

  const button = document.createElement('button');
  button.className = `prog-duplicate-day${selected ? ' is-selected' : ''}`;
  button.type = 'button';
  button.dataset.duplicateDate = iso;
  button.setAttribute('aria-pressed', String(selected));
  button.setAttribute('aria-label', `${weekdays[date.getDay()]}, ${date.getDate()} de ${months[date.getMonth()]}`);
  button.innerHTML = `<span class="prog-duplicate-day-check">✓</span><span class="prog-duplicate-day-week">${weekdays[date.getDay()]}</span><strong class="prog-duplicate-day-number">${date.getDate()}</strong><span class="prog-duplicate-day-month">${months[date.getMonth()]}</span>`;
  return button;
}

function setFeedback(message, type = 'warn') {
  const feedback = document.getElementById('progCtxFeedback');
  if (!feedback) return;
  feedback.className = `feedback mt-16 prog-feedback-${type}`;
  feedback.textContent = message;
}

function patchDuplicateCalendar() {
  const sourceIso = duplicateSourceIso();
  const todayIso = todayIsoLocal();
  const dates = document.getElementById('progDuplicateDates');
  const label = document.querySelector('.prog-duplicate-calendar-label span:first-child');

  if (!dates || !sourceIso) return;

  const retroactive = sourceIso < todayIso;
  if (label) label.textContent = retroactive ? 'Hoje + próximos 5 dias' : 'Próximos 5 dias';
  if (!retroactive) return;

  // programacao.js gera amanhã até D+5 para uma origem retroativa. Mantemos
  // esse horizonte e acrescentamos apenas D0 (hoje), sem alterar a origem.
  if (!dates.querySelector(`[data-duplicate-date="${todayIso}"]`)) {
    dates.querySelectorAll('[data-duplicate-date].is-selected').forEach((day) => {
      day.classList.remove('is-selected');
      day.setAttribute('aria-pressed', 'false');
    });
    dates.prepend(buildDuplicateDay(todayIso, true));
  }
}

function installDuplicateTodayFix() {
  const duplicateButton = document.getElementById('progDuplicar');
  const modal = document.getElementById('progDuplicateModal');
  if (!duplicateButton || !modal) return false;
  if (duplicateButton.dataset.duplicateTodayFix === '1') return true;

  duplicateButton.dataset.duplicateTodayFix = '1';

  // O listener original abre/renderiza o modal de forma síncrona. Executar em
  // microtask garante que o calendário-base já exista antes de inserir hoje.
  duplicateButton.addEventListener('click', () => queueMicrotask(patchDuplicateCalendar));

  // Ao exibir hoje + D+1…D+5 existem 6 opções possíveis, mas a regra atual
  // continua permitindo selecionar no máximo 5 datas por duplicação.
  modal.addEventListener('click', (event) => {
    const day = event.target.closest('[data-duplicate-date]');
    if (!day || !modal.contains(day) || day.classList.contains('is-selected')) return;

    const selectedCount = modal.querySelectorAll('[data-duplicate-date].is-selected').length;
    if (selectedCount < MAX_SELECTED_DATES) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setFeedback('Selecione no máximo 5 datas para duplicar a programação.', 'warn');
  }, true);

  return true;
}

if (!installDuplicateTodayFix()) {
  const observer = new MutationObserver(() => {
    if (installDuplicateTodayFix()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
