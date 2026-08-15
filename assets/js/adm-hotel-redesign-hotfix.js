import { supabase } from './supabaseClient.js';

const HOTFIX_VERSION = '20260815-hoteis-totais1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function signedExtra(extra) {
  const value = Number(extra.valor_total ?? Number(extra.quantidade || 1) * Number(extra.valor_unitario || 0));
  return String(extra.tipo || '').toUpperCase() === 'DESCONTO' ? -value : value;
}

async function recalcReservation(reservaId) {
  if (!reservaId) return;
  const [reservationResult, extrasResult, financeResult] = await Promise.all([
    supabase.from('hospedagem_reservas').select('id,valor_total_previsto').eq('id', reservaId).maybeSingle(),
    supabase.from('hospedagem_custos_extras').select('tipo,quantidade,valor_unitario,valor_total').eq('reserva_id', reservaId),
    supabase.from('hospedagem_financeiro').select('id,valor_pago').eq('reserva_id', reservaId).maybeSingle(),
  ]);
  if (reservationResult.error || !reservationResult.data) return;

  const base = Number(reservationResult.data.valor_total_previsto || 0);
  const extraTotal = (extrasResult.data || []).reduce((sum, extra) => sum + signedExtra(extra), 0);
  const total = Math.max(0, base + extraTotal);

  await supabase.from('hospedagem_reservas').update({ valor_total_final: total }).eq('id', reservaId);

  const finance = financeResult.data;
  if (finance?.id) {
    const paid = Number(finance.valor_pago || 0);
    await supabase.from('hospedagem_financeiro').update({
      valor_original: total,
      valor_total: total,
      saldo: Math.max(0, total - paid),
    }).eq('id', finance.id);
  }
}

async function allocateUnassignedExtras(reservaId) {
  if (!reservaId) return;
  const [extrasResult, lotsResult] = await Promise.all([
    supabase.from('hospedagem_custos_extras').select('tipo,quantidade,valor_unitario,valor_total').eq('reserva_id', reservaId),
    supabase.from('hospedagem_checkout_lotes').select('id,valor_diarias,valor_extras,valor_total,created_at,status').eq('reserva_id', reservaId).neq('status', 'CANCELADO').order('created_at', { ascending: true }),
  ]);
  if (extrasResult.error || lotsResult.error) return;

  const extrasTotal = (extrasResult.data || []).reduce((sum, extra) => sum + signedExtra(extra), 0);
  const lots = lotsResult.data || [];
  if (!lots.length) return;

  const allocated = lots.reduce((sum, lot) => sum + Number(lot.valor_extras || 0), 0);
  const remaining = Number((extrasTotal - allocated).toFixed(2));
  if (Math.abs(remaining) < 0.005) return;

  const latest = lots.at(-1);
  const nextExtras = Number(latest.valor_extras || 0) + remaining;
  const nextTotal = Math.max(0, Number(latest.valor_diarias || 0) + nextExtras);
  await supabase.from('hospedagem_checkout_lotes').update({
    valor_extras: nextExtras,
    valor_total: nextTotal,
  }).eq('id', latest.id);
}

function scheduleExtrasRecalc(reservaId) {
  // O fluxo principal grava os extras e depois atualiza sua memória local.
  // Aguarda a transação terminar e recalcula usando a fonte real no banco.
  setTimeout(async () => {
    await recalcReservation(reservaId);
    window.dispatchEvent(new CustomEvent('hospedagem:redesign-totais-atualizados', { detail: { reservaId } }));
  }, 700);
}

function scheduleCheckoutRecalc(reservaId) {
  // Em checkout parcial, apenas o saldo de extras ainda não alocado é levado
  // ao lote mais recente. Assim um extra não é cobrado novamente no próximo
  // checkout da mesma reserva.
  setTimeout(async () => {
    await recalcReservation(reservaId);
    await allocateUnassignedExtras(reservaId);
    window.dispatchEvent(new CustomEvent('hospedagem:redesign-totais-atualizados', { detail: { reservaId } }));
  }, 900);
}

function bind() {
  document.addEventListener('click', (event) => {
    const saveExtras = event.target.closest('[data-hosp-rd-modal="save-extras"]');
    if (saveExtras?.dataset.reserva) scheduleExtrasRecalc(saveExtras.dataset.reserva);

    const checkout = event.target.closest('[data-hosp-rd-modal="confirm-checkout"]');
    if (checkout?.dataset.reserva) scheduleCheckoutRecalc(checkout.dataset.reserva);
  }, true);

  window.addEventListener('hospedagem:redesign-totais-atualizados', () => {
    // O botão de atualização pertence à nova camada e reaproveita o carregador
    // já ativo sem criar outra rotina paralela de renderização.
    document.querySelector('[data-hosp-rd-action="refresh"]')?.click();
  });
}

bind();
console.info(`[hosp-redesign-hotfix] ativo ${HOTFIX_VERSION}`);
