import { supabase } from './supabaseClient.js';

const STYLE_ID = 'conferenciaBonusFechamentoStyles';
const CLOSED_BANNER_HTML = '<strong>Competência fechada.</strong> Valores congelados pela fotografia do fechamento. Novos lançamentos estão bloqueados; somente falhas já aprovadas podem ser reenviadas.';
let competenciaConsultada = null;
let competenciaFechada = false;
let carregando = false;
let observer = null;
let enhanceQueued = false;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .bonus-closed-banner{display:none;align-items:center;gap:8px;margin:0 0 12px;padding:9px 12px;border:1px solid rgba(251,191,36,.2);border-radius:11px;background:rgba(245,158,11,.08);color:#f4cf78;font-size:11.5px;font-weight:750}
    .bonus-closed-banner.visible{display:flex}
    .bonus-closed-banner strong{color:#ffe3a1}
    .bonus-check.bonus-closed-new:disabled{opacity:.18;cursor:not-allowed}
  `;
  document.head.appendChild(style);
}

function getCompetencia() {
  const month = Number(document.querySelector('#bonusPeriodo .bonus-month.active')?.dataset.month ?? new Date().getMonth());
  const year = Number(document.querySelector('#bonusPeriodo .bonus-year strong')?.textContent ?? new Date().getFullYear());
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function ensureBanner() {
  const body = document.getElementById('bonusBody');
  if (!body) return null;
  let banner = document.getElementById('bonusClosedBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'bonusClosedBanner';
    banner.className = 'bonus-closed-banner';
    body.parentElement?.insertBefore(banner, body);
  }
  return banner;
}

function applyClosedState() {
  const banner = ensureBanner();
  if (banner) {
    banner.classList.toggle('visible', competenciaFechada);
    const nextHtml = competenciaFechada ? CLOSED_BANNER_HTML : '';
    if (banner.innerHTML !== nextHtml) banner.innerHTML = nextHtml;
  }

  document.querySelectorAll('#bonusBody .bonus-table tbody tr').forEach((tr) => {
    const checkbox = tr.querySelector('[data-row-check]');
    if (!checkbox) return;
    const launchStatus = tr.dataset.bonusLaunchStatus || '';
    const blockNew = competenciaFechada && launchStatus === 'NAO_LANCADO';
    checkbox.classList.toggle('bonus-closed-new', blockNew);
    if (blockNew) {
      checkbox.checked = false;
      checkbox.disabled = true;
      checkbox.title = 'Competência fechada: novos lançamentos não podem ser incluídos após o fechamento.';
    }
  });

  const auditInput = document.getElementById('bonusAuditFile');
  const auditLabel = document.querySelector('label[for="bonusAuditFile"]');
  if (auditInput) auditInput.disabled = competenciaFechada;
  if (auditLabel) {
    auditLabel.style.pointerEvents = competenciaFechada ? 'none' : '';
    auditLabel.style.opacity = competenciaFechada ? '.45' : '';
    auditLabel.title = competenciaFechada ? 'Competência fechada: a auditoria está congelada.' : '';
  }
}

async function refreshClosedState(force = false) {
  const comp = getCompetencia();
  if (!force && competenciaConsultada === comp) {
    applyClosedState();
    return;
  }
  if (carregando) return;
  carregando = true;
  try {
    const { data, error } = await supabase.rpc('bonus_competencia_fechada', { p_competencia: comp });
    if (error) throw error;
    competenciaConsultada = comp;
    competenciaFechada = data === true;
    applyClosedState();
  } catch (error) {
    console.error('[conferencia-bonus-fechamento] consulta', error);
  } finally {
    carregando = false;
  }
}

function scheduleApply() {
  if (enhanceQueued) return;
  enhanceQueued = true;
  queueMicrotask(() => {
    enhanceQueued = false;
    applyClosedState();
    void refreshClosedState();
  });
}

function start() {
  injectStyles();
  const host = document.getElementById('pageContent') || document.body;
  observer = new MutationObserver(() => scheduleApply());
  observer.observe(host, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-month],[data-year-step],.bonus-tab')) return;
    competenciaConsultada = null;
    window.setTimeout(() => void refreshClosedState(true), 0);
  });

  void refreshClosedState(true);
}

start();
