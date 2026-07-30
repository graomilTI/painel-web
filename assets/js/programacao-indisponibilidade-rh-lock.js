// Bloqueia no Gestor qualquer indisponibilidade definida pelo RH.
// O módulo programacao-indisponibilidade-sync.js identifica os cards e grava
// data-indisponivel-rh; este módulo transforma esses registros em somente leitura.

const STATUS_LABELS = {
  ATESTADO: 'Atestado',
  FALTA: 'Falta',
  FERIAS: 'Férias',
  FOLGA: 'Folga',
  INDISPONIVEL: 'Indisponível',
};

let scanAgendado = false;

function statusLabel(status) {
  return STATUS_LABELS[String(status || '').trim().toUpperCase()] || 'Indisponível';
}

function injetarStyles() {
  if (document.getElementById('programacaoIndisponibilidadeRhLockStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoIndisponibilidadeRhLockStyles';
  style.textContent = `
    .pso-card.pso-rh-locked{
      border-color:rgba(245,158,11,.32)!important;
      background:rgba(120,53,15,.08)!important;
    }
    .pso-card.pso-rh-locked .pso-sit-btn,
    .pso-card.pso-rh-locked .pso-obs{
      cursor:not-allowed!important;
    }
    .pso-card.pso-rh-locked .pso-sit-btn:not(.on){
      opacity:.42!important;
    }
    .pso-card.pso-rh-locked .pso-sit-btn.on{
      opacity:1!important;
      border-color:rgba(245,158,11,.55)!important;
      background:rgba(245,158,11,.18)!important;
      color:#fde68a!important;
    }
    .pso-card.pso-rh-locked .pso-obs{
      opacity:.68!important;
    }
    .pso-rh-status.locked{
      background:rgba(245,158,11,.14)!important;
      color:#fde68a!important;
      border:1px solid rgba(245,158,11,.35)!important;
      cursor:help;
    }
    .pso-rh-status.locked.pulse{animation:psoRhLockPulse .45s ease}
    @keyframes psoRhLockPulse{
      50%{background:rgba(245,158,11,.3);transform:scale(1.05)}
    }
  `;
  document.head.appendChild(style);
}

function mostrarBloqueio(card) {
  const el = card?.querySelector('[data-rh-status]');
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

function bloquearCard(card) {
  const status = String(card?.dataset.indisponivelRh || '').trim().toUpperCase();
  if (!card || !status) return;

  card.dataset.rhLock = '1';
  card.classList.add('pso-rh-locked');

  card.querySelectorAll('.pso-sit-btn[data-situacao]').forEach((btn) => {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.title = 'Status definido pelo RH. Altere somente em RH > Indisponibilidade.';
  });

  const obs = card.querySelector('.pso-obs');
  if (obs) {
    obs.disabled = true;
    obs.readOnly = true;
    obs.setAttribute('aria-disabled', 'true');
    obs.title = 'Indisponibilidade definida pelo RH. A observação não pode ser alterada pelo Gestor.';
  }

  const el = card.querySelector('[data-rh-status]');
  if (!el) return;
  el.className = 'pso-rh-status locked';
  el.textContent = `🔒 ${statusLabel(status)}`;
  el.title = `${statusLabel(status)} definido pelo RH. Alterações somente em RH > Indisponibilidade.`;
}

function processarCards() {
  document.querySelectorAll('.pso-card[data-indisponivel-rh]').forEach(bloquearCard);
}

function agendarScan() {
  if (scanAgendado) return;
  scanAgendado = true;
  requestAnimationFrame(() => {
    scanAgendado = false;
    processarCards();
  });
}

function bloquearEventoDoGestor(event) {
  const alvo = event.target.closest?.('.pso-sit-btn[data-situacao], .pso-obs');
  if (!alvo) return;
  const card = alvo.closest('.pso-card[data-rh-lock="1"]');
  if (!card || card.dataset.rhAutoAplicando === '1') return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  mostrarBloqueio(card);
}

function boot() {
  injetarStyles();

  // Captura antes dos handlers originais do Sem O.S., evitando qualquer gravação.
  document.addEventListener('click', bloquearEventoDoGestor, true);
  document.addEventListener('input', bloquearEventoDoGestor, true);
  document.addEventListener('change', bloquearEventoDoGestor, true);

  const observer = new MutationObserver(agendarScan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-indisponivel-rh'],
  });

  agendarScan();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
