import { supabase } from './supabaseClient.js';

const VERSION = '20260824-v2-shared1';

async function waitForV2State(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const shared = window.__hospedagemV2State;
    if (shared?.ready) return shared;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.__hospedagemV2State?.ready ? window.__hospedagemV2State : null;
}

const state = {
  hotels: new Map(),
  rows: new Map(),
  quotes: new Map(),
  editingHotelId: null,
  refreshTimer: null,
  decorating: false,
};

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function injectStyles() {
  if (document.getElementById('hospNfAlertStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospNfAlertStyles';
  style.textContent = `
    .hosp-nf-alert{display:inline-flex;align-items:center;gap:5px;margin-top:7px;padding:4px 8px;border-radius:999px;border:1px solid rgba(251,146,60,.46);background:rgba(124,45,18,.2);color:#fdba74;font-size:10px;font-weight:950;line-height:1.2}
    .hosp-nf-alert.finance{border-color:rgba(248,113,113,.48);background:rgba(127,29,29,.2);color:#fecaca}
    .hosp-nf-hotel-tag{display:inline-flex;align-items:center;gap:4px;margin:5px 0 0 7px;padding:3px 7px;border-radius:999px;border:1px solid rgba(251,146,60,.35);background:rgba(124,45,18,.14);color:#fdba74;font-size:10px;font-weight:900;white-space:nowrap}
    .hosp-nf-kpi-alert{position:absolute;right:8px;top:7px;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid rgba(248,113,113,.5);background:rgba(127,29,29,.34);color:#fecaca;font-size:12px;font-style:normal;box-shadow:0 0 14px rgba(248,113,113,.16);cursor:help}
    .hosp-quote-flow-data{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.hosp-quote-flow-chip{padding:3px 6px;border-radius:999px;border:1px solid rgba(74,222,128,.22);background:rgba(22,101,52,.15);color:#bbf7d0;font-size:9px;font-weight:900}.hosp-quote-flow-chip.warn{border-color:rgba(248,113,113,.38);background:rgba(127,29,29,.17);color:#fecaca}
  `;
  document.head.appendChild(style);
}

function ensureInvoiceField() {
  const form = document.getElementById('hotelForm');
  if (!form || document.getElementById('hotelEmiteNotaFiscal')) return;
  const observationField = document.getElementById('hotelObs')?.closest('.adm-hosp-field');
  const wrapper = document.createElement('div');
  wrapper.className = 'adm-hosp-field';
  wrapper.innerHTML = '<label>Emite Nota Fiscal?</label><select id="hotelEmiteNotaFiscal"><option value="SIM">Sim</option><option value="NAO">Não</option></select>';
  if (observationField) form.insertBefore(wrapper, observationField);
  else form.appendChild(wrapper);
}

async function loadHotelField(id) {
  ensureInvoiceField();
  const select = document.getElementById('hotelEmiteNotaFiscal');
  if (!select) return;
  if (!id) {
    select.value = 'SIM';
    return;
  }
  const cached = state.hotels.get(String(id));
  if (cached) {
    select.value = cached.emite_nota_fiscal === false ? 'NAO' : 'SIM';
    return;
  }
  const { data } = await supabase.from('hospedagem_hoteis').select('id,emite_nota_fiscal').eq('id', id).maybeSingle();
  select.value = data?.emite_nota_fiscal === false ? 'NAO' : 'SIM';
}

async function resolveSavedHotelId(snapshot) {
  if (snapshot.id) return snapshot.id;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { data } = await supabase
      .from('hospedagem_hoteis')
      .select('id')
      .eq('nome', snapshot.nome)
      .eq('cidade', snapshot.cidade)
      .eq('uf', snapshot.uf)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function persistInvoiceChoice(snapshot) {
  const id = await resolveSavedHotelId(snapshot);
  if (!id) return;
  const { error } = await supabase
    .from('hospedagem_hoteis')
    .update({ emite_nota_fiscal: snapshot.emite })
    .eq('id', id);
  if (error) {
    const feedback = document.getElementById('hotelFeedback');
    if (feedback) {
      feedback.textContent = `Hotel salvo, mas não foi possível gravar “Emite Nota Fiscal?”: ${error.message}`;
      feedback.className = 'adm-hosp-feedback err';
    }
    return;
  }
  state.editingHotelId = null;
  if (window.__hospedagemV2Refresh) await window.__hospedagemV2Refresh();
  await refreshData();
}

function bindHotelForm() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    const edit = target.closest('[data-action="edit-hotel"]');
    if (edit) {
      state.editingHotelId = edit.dataset.id || null;
      setTimeout(() => loadHotelField(state.editingHotelId), 0);
      return;
    }
    if (target.closest('#btnAbrirCadastroHotel') || target.closest('#hotelClear')) {
      state.editingHotelId = null;
      setTimeout(() => loadHotelField(null), 0);
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'hotelForm') return;
    ensureInvoiceField();
    const snapshot = {
      id: state.editingHotelId,
      nome: document.getElementById('hotelNome')?.value.trim() || '',
      cidade: document.getElementById('hotelCidade')?.value.trim() || '',
      uf: document.getElementById('hotelUf')?.value.trim().toUpperCase() || '',
      emite: document.getElementById('hotelEmiteNotaFiscal')?.value !== 'NAO',
    };
    setTimeout(() => persistInvoiceChoice(snapshot), 50);
  }, true);
}

function decorateHotelTable() {
  document.querySelectorAll('#hotelTbody tr').forEach((row) => {
    const existing = row.querySelector('.hosp-nf-hotel-tag');
    const id = row.querySelector('[data-action="edit-hotel"]')?.dataset.id;
    const hotel = id ? state.hotels.get(String(id)) : null;
    const shouldAlert = hotel?.emite_nota_fiscal === false;
    if (!shouldAlert) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const title = row.querySelector('td:first-child strong');
    if (title) title.insertAdjacentHTML('afterend', '<span class="hosp-nf-hotel-tag" title="Este hotel foi cadastrado como não emissor de nota fiscal">⚠ Não emite NF</span>');
  });
}

function rowHotel(row) {
  if (!row) return null;
  return state.hotels.get(String(row.hotel_id || '')) || null;
}

function isFinance(row) {
  const status = String(row?.status_financeiro || '').toUpperCase();
  return status === 'ENVIADO_AO_FINANCEIRO' || Boolean(row?.pendencia_financeira);
}

function isActive(row) {
  const solicitation = String(row?.status_solicitacao || '').toUpperCase();
  const finance = String(row?.status_financeiro || '').toUpperCase();
  return solicitation !== 'CANCELADA' && solicitation !== 'CONCLUIDA' && finance !== 'PAGO';
}

function decorateLodgingCards() {
  document.querySelectorAll('.hosp-v2-row').forEach((card) => {
    const existing = card.querySelector('.hosp-nf-alert');
    const id = card.querySelector('[data-v2-action][data-id]')?.dataset.id;
    const row = id ? state.rows.get(String(id)) : null;
    const hotel = rowHotel(row);
    const shouldAlert = Boolean(row && hotel?.emite_nota_fiscal === false);
    if (!shouldAlert) {
      existing?.remove();
      return;
    }
    const finance = isFinance(row);
    const text = finance ? '⚠ Financeiro: hotel não emite NF' : '⚠ Hotel não emite NF';
    const title = finance ? 'Pagamento enviado ao Financeiro sem previsão de nota fiscal' : 'Hotel cadastrado como não emissor de nota fiscal';
    if (existing) {
      existing.classList.toggle('finance', finance);
      if (existing.textContent !== text) existing.textContent = text;
      if (existing.title !== title) existing.title = title;
      return;
    }
    const target = card.querySelector('.hosp-v2-hotel')?.parentElement || card.querySelector('.hosp-v2-cell:nth-child(3)');
    if (!target) return;
    target.insertAdjacentHTML('beforeend', `<div class="hosp-nf-alert ${finance ? 'finance' : ''}" title="${title}">${text}</div>`);
  });
}

function decorateKpis() {
  const activeNoInvoice = [...state.rows.values()].filter((row) => isActive(row) && rowHotel(row)?.emite_nota_fiscal === false);
  const financeNoInvoice = activeNoInvoice.filter(isFinance);
  document.querySelectorAll('#hospV2Kpis .hosp-v2-kpi').forEach((card) => {
    const existing = card.querySelector('.hosp-nf-kpi-alert');
    const label = card.querySelector('small')?.textContent?.trim().toLowerCase();
    let count = 0;
    let title = '';
    if (label === 'nfs-e pendentes') {
      count = activeNoInvoice.length;
      title = `${count} hospedagem(ns) em hotel que não emite nota fiscal`;
    } else if (label === 'a pagar') {
      count = financeNoInvoice.length;
      title = `${count} pagamento(s) enviado(s) ao Financeiro para hotel que não emite nota fiscal`;
    }
    if (!count) {
      existing?.remove();
      return;
    }
    if (existing) {
      if (existing.title !== title) existing.title = title;
      return;
    }
    card.insertAdjacentHTML('beforeend', `<i class="hosp-nf-kpi-alert" title="${esc(title)}">⚠</i>`);
  });
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function decorateQuoteResponses() {
  document.querySelectorAll('.hosp-v2-quote').forEach((quoteEl) => {
    const id = quoteEl.querySelector('[data-quote-id]')?.dataset.quoteId;
    const quote = id ? state.quotes.get(String(id)) : null;
    let details = quoteEl.querySelector('.hosp-quote-flow-data');
    if (!quote) {
      details?.remove();
      return;
    }
    const summary = quoteEl.querySelector('small');
    if (summary) {
      const total = quote.valor_total ? `${money(quote.valor_total)} total` : quote.valor_diaria ? `${money(quote.valor_diaria)} por diária` : 'Valor pendente';
      const checkout = quote.aceita_pagamento_checkout === true ? 'aceita checkout' : quote.aceita_pagamento_checkout === false ? 'pagamento antecipado' : 'condição pendente';
      const text = `${total} · ${checkout}`;
      if (summary.textContent !== text) summary.textContent = text;
    }
    const chips = [
      quote.disponibilidade === false ? '<span class="hosp-quote-flow-chip warn">Indisponível</span>' : quote.disponibilidade === true ? '<span class="hosp-quote-flow-chip">Disponível</span>' : '',
      quote.cafe_incluso === true ? '<span class="hosp-quote-flow-chip">Café incluso</span>' : quote.cafe_incluso === false ? '<span class="hosp-quote-flow-chip warn">Sem café</span>' : '',
      quote.estacionamento_incluso === true ? '<span class="hosp-quote-flow-chip">Estacionamento incluso</span>' : quote.estacionamento_incluso === false ? '<span class="hosp-quote-flow-chip warn">Sem estacionamento</span>' : '',
      quote.valor_diaria ? `<span class="hosp-quote-flow-chip">Diária ${money(quote.valor_diaria)}</span>` : '',
    ].filter(Boolean).join('');
    if (!chips) {
      details?.remove();
      return;
    }
    if (!details) {
      details = document.createElement('div');
      details.className = 'hosp-quote-flow-data';
      summary?.insertAdjacentElement('afterend', details);
    }
    if (details.innerHTML !== chips) details.innerHTML = chips;
  });
}

function decorate() {
  if (state.decorating) return;
  state.decorating = true;
  try {
    ensureInvoiceField();
    decorateHotelTable();
    decorateLodgingCards();
    decorateKpis();
    decorateQuoteResponses();
  } finally {
    state.decorating = false;
  }
}

function scheduleDecorate() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(decorate, 120);
}

async function refreshData() {
  const shared = await waitForV2State();
  if (shared?.ready) {
    state.hotels = new Map((shared.hotels || []).map((hotel) => [String(hotel.id), hotel]));
    state.rows = new Map((shared.rows || []).map((row) => [String(row.solicitacao_id), row]));
    state.quotes = new Map((shared.quotes || []).map((quote) => [String(quote.id), quote]));
    decorate();
    return;
  }

  // Fallback apenas se o V2 não iniciar.
  const [hotelsRes, rowsRes, quotesRes] = await Promise.all([
    supabase.from('hospedagem_hoteis').select('id,nome,cidade,uf,emite_nota_fiscal'),
    supabase.from('hospedagem_painel_geral').select('solicitacao_id,hotel_id,status_solicitacao,status_financeiro,pendencia_financeira'),
    supabase.from('hospedagem_cotacoes').select('id,solicitacao_id,hotel_id,status,disponibilidade,valor_diaria,valor_total,aceita_pagamento_checkout,cafe_incluso,estacionamento_incluso,observacoes,respondido_em'),
  ]);
  if (!hotelsRes.error) state.hotels = new Map((hotelsRes.data || []).map((hotel) => [String(hotel.id), hotel]));
  if (!rowsRes.error) state.rows = new Map((rowsRes.data || []).map((row) => [String(row.solicitacao_id), row]));
  if (!quotesRes.error) state.quotes = new Map((quotesRes.data || []).map((quote) => [String(quote.id), quote]));
  decorate();
}

function boot() {
  injectStyles();
  ensureInvoiceField();
  bindHotelForm();
  refreshData();
  const observer = new MutationObserver(scheduleDecorate);
  const target = document.getElementById('pageContent') || document.body;
  observer.observe(target, { childList: true, subtree: true });
  window.addEventListener('hospedagem:v2-data', refreshData);
  window.addEventListener('hashchange', () => setTimeout(refreshData, 250));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.__hospedagemV2Refresh) window.__hospedagemV2Refresh();
  });
  console.info(`[hosp-nf-alert] ativo ${VERSION}`);
}

boot();
