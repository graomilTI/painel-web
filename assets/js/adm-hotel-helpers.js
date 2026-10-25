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

// preferencia_hospedagem (hospedagem_solicitacoes) — sinalizada pelo gestor na tela de
// autoatendimento; é informativa (não roteia sozinha pra Alojamentos, que continua sendo
// decidido manualmente via Programação/tipo_estadia).
export const PREFERENCIA_HOSPEDAGEM = {
  HOTEL: 'Hotel',
  ALOJAMENTO: 'Alojamento',
  SEM_PREFERENCIA: 'Sem preferência',
};

export function preferenciaLabel(row) {
  return PREFERENCIA_HOSPEDAGEM[row?.preferencia_hospedagem] || 'Sem preferência';
}

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
  link.href = './assets/css/adm-hotel.css?v=20261024-hosp-acoes4';
  document.head.appendChild(link);
}

// status de public.hospedagem_cotacoes — vocabulário real confirmado no banco
// (webhook hospedagem-whatsapp-webhook grava RESPONDIDA/INDISPONIVEL na resposta).
export const STATUS_COTACAO = {
  PENDENTE: 'Pendente',
  ENVIADA: 'Enviada',
  FALHA: 'Falha no envio',
  RESPONDIDA: 'Respondida',
  INDISPONIVEL: 'Indisponível',
};

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// status de public.hospedagem_checkout_lotes — vocabulário real (visto na
// função hospedagem_realizar_checkout / hospedagem_confirmar_pagamento_lote).
export const LOTE_STATUS_LABEL = {
  PENDENTE: 'Pendente',
  PARCIAL: 'Parcial',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};

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
