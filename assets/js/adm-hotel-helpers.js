// Funções puras compartilhadas pelo módulo Hotel (controller + view).
// Convenção copiada de adm-hotel-alojamentos-v2-helpers.js.

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function brDate(value) {
  if (!value) return '—';
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

export function money(value) {
  const n = Number(value ?? 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// status_solicitacao (hospedagem_solicitacoes) — vocabulário real confirmado no banco.
export const STATUS_SOLICITACAO = {
  SOLICITADA: 'Solicitada',
  EM_ANALISE: 'Em análise',
  EM_COTACAO: 'Em cotação',
  RESERVADA: 'Reservada',
  CANCELADA: 'Cancelada',
  CONCLUIDA: 'Concluída',
};

// status_hospedagem (hospedagem_reservas) — sub-estado da reserva, só existe depois de reservar.
export const STATUS_HOSPEDAGEM = {
  CHECKIN_PREVISTO: 'Check-in previsto',
  HOSPEDADO: 'Hospedado',
  CHECKOUT_REALIZADO: 'Checkout realizado',
  CANCELADA: 'Cancelada',
};

// Agrupa o status real da solicitação nas abas do painel (Solicitada/Reservada/Concluída/Cancelada).
export function tabGroup(row) {
  const s = row.status_solicitacao;
  if (s === 'CANCELADA') return 'cancelada';
  if (s === 'CONCLUIDA') return 'concluida';
  if (s === 'RESERVADA') return 'reservada';
  return 'solicitada'; // SOLICITADA, EM_ANALISE, EM_COTACAO
}

export function statusLabel(row) {
  if (row.status_solicitacao === 'RESERVADA' && row.status_hospedagem) {
    return STATUS_HOSPEDAGEM[row.status_hospedagem] || row.status_hospedagem;
  }
  return STATUS_SOLICITACAO[row.status_solicitacao] || row.status_solicitacao || '—';
}

let stylesInjected = false;
export function ensureStyles() {
  if (stylesInjected || document.getElementById('admHotelCss')) return;
  stylesInjected = true;
  const link = document.createElement('link');
  link.id = 'admHotelCss';
  link.rel = 'stylesheet';
  link.href = './assets/css/adm-hotel.css?v=20260825-fase1';
  document.head.appendChild(link);
}

let toastTimer = null;
export function toast(message, type = 'ok') {
  let el = document.getElementById('admHotelToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'admHotelToast';
    el.className = 'ah-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('open');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('open'), 3200);
}
