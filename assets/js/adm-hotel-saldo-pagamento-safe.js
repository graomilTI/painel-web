import { supabase } from './supabaseClient.js';

const VERSION = '20260816-saldo-pagamento-safe1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const num = (v) => Number(String(v ?? 0).replace(',', '.')) || 0;
const iso = (v) => String(v || '').slice(0, 10);
const money = (v) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

const state = {
  root: null,
  filter: 'uso',
  search: '',
  hotels: [], rows: [], finance: [], extras: [], advances: [], assignments: [],
  balances: new Map(), activeHotelIds: new Set(),
  payment: { reservaId: '', requestId: '', baseDue: 0, open: false, docType: '', beforeDocIds: new Set(), savingExtras: false },
  skip: new Set(),
};

function signedExtra(extra) {
  const value = num(extra.valor_total ?? num(extra.quantidade || 1) * num(extra.valor_unitario));
  return String(extra.tipo || '').toUpperCase() === 'DESCONTO' ? -value : value;
}
function uniqueReservations(rows = state.rows) {
  const map = new Map();
  rows.forEach((row) => { if (row.reserva_id && !map.has(String(row.reserva_id))) map.set(String(row.reserva_id), row); });
  return [...map.values()];
}
function extrasForReservation(reservaId) { return state.extras.filter((e) => String(e.reserva_id) === String(reservaId)); }
function reservationTotal(row) {
  if (!row) return 0;
  const base = num(row.valor_total_previsto || (num(row.valor_diaria) * Math.max(1, num(row.quantidade_diarias || 1)) * Math.max(1, num(row.quantidade_quartos || 1))));
  const extra = extrasForReservation(row.reserva_id).reduce((s,e) => s + signedExtra(e), 0);
  const final = num(row.valor_total_final);
  return Math.max(0, final > 0 ? Math.max(final, base + extra) : base + extra);
}
function financeForReservation(reservaId) { return state.finance.find((f) => String(f.reserva_id) === String(reservaId)) || null; }
function hotelById(id) { return state.hotels.find((h) => String(h.id) === String(id)) || null; }
function availableCredit(hotelId) {
  return state.advances.filter((a) => String(a.hotel_id) === String(hotelId) && String(a.status || '').toUpperCase() === 'DISPONIVEL').reduce((s,a) => s + num(a.saldo),0);
}

async function loadBalanceData() {
  const [hotels, rows, finance, extras, advances, assignments] = await Promise.all([
    supabase.from('hospedagem_hoteis').select('*'),
    supabase.from('hospedagem_painel_geral').select('*'),
    supabase.from('hospedagem_financeiro').select('*'),
    supabase.from('hospedagem_custos_extras').select('*'),
    supabase.from('hospedagem_adiantamentos').select('*'),
    supabase.from('hospedagem_reserva_colaboradores').select('reserva_id,status,checkout_em'),
  ]);
  state.hotels = hotels.data || [];
  state.rows = rows.data || [];
  state.finance = finance.data || [];
  state.extras = extras.data || [];
  state.advances = advances.data || [];
  state.assignments = assignments.data || [];

  const activeReservationIds = new Set(state.assignments
    .filter((a) => !a.checkout_em && !['CHECKOUT','CANCELADO'].includes(String(a.status || '').toUpperCase()))
    .map((a) => String(a.reserva_id)));
  state.activeHotelIds = new Set();
  const reservations = uniqueReservations().filter((r) => String(r.status_hospedagem || '').toUpperCase() !== 'CANCELADA');
  reservations.forEach((r) => { if (activeReservationIds.has(String(r.reserva_id)) && r.hotel_id) state.activeHotelIds.add(String(r.hotel_id)); });

  state.balances.clear();
  state.hotels.forEach((hotel) => {
    let debt = 0;
    reservations.filter((r) => String(r.hotel_id) === String(hotel.id)).forEach((r) => {
      const total = reservationTotal(r);
      const paid = num(financeForReservation(r.reserva_id)?.valor_pago);
      debt += Math.max(0, total - paid);
    });
    const credit = availableCredit(hotel.id);
    state.balances.set(String(hotel.id), { debt, credit, net: credit - debt });
  });
}

function editIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></svg>'; }
function pendingIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'; }
function closeIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'; }
function hotelRow(h) {
  const b = state.balances.get(String(h.id)) || { net: 0 };
  const net = b.net;
  return `<tr><td><strong>${esc(h.nome || '-')}</strong>${h.razao_social ? `<span class="hosp-rd-sub">${esc(h.razao_social)}</span>` : ''}</td><td>${esc(h.cidade || '-')}</td><td>${esc(h.uf || '-')}</td><td><span class="hosp-rd-pill ${net>0?'green':net<0?'red':''}">${net>0?`Crédito ${money(net)}`:net<0?`A pagar ${money(Math.abs(net))}`:'Zerado'}</span></td><td><div class="hosp-rd-actions"><button class="hosp-rd-icon-btn" data-hosp-rd-action="edit-hotel" data-hotel="${esc(h.id)}" title="Editar">${editIcon()}</button><button class="hosp-rd-icon-btn" data-hosp-rd-action="hotel-pending" data-hotel="${esc(h.id)}" title="Pendências">${pendingIcon()}</button><button class="hosp-rd-icon-btn red" data-hosp-rd-action="remove-hotel" data-hotel="${esc(h.id)}" title="Remover">${closeIcon()}</button></div></td></tr>`;
}
function renderHotelBalances() {
  const panel = $('#hospRdHoteis');
  if (!panel) return;
  panel.querySelector('[data-hosp-rd-action="cashflow"]')?.remove();
  const desc = panel.querySelector('.hosp-rd-title p');
  if (desc) desc.textContent = 'Cadastro, pendências, créditos e saldo financeiro por hotel.';

  const metrics = $$('.hosp-rd-hotel-metric', panel);
  const positive = [...state.balances.values()].reduce((s,b) => s + Math.max(0,b.net),0);
  const negative = [...state.balances.values()].reduce((s,b) => s + Math.max(0,-b.net),0);
  const month = today().slice(0,7);
  const paidMonth = state.finance.filter((f) => iso(f.data_pagamento || f.pago_em).startsWith(month)).reduce((s,f) => s + num(f.valor_pago),0);
  if (metrics[0]?.querySelector('strong')) metrics[0].querySelector('strong').textContent = money(positive);
  if (metrics[1]?.querySelector('strong')) metrics[1].querySelector('strong').textContent = money(negative);
  if (metrics[2]?.querySelector('strong')) metrics[2].querySelector('strong').textContent = money(paidMonth);

  let hotels = state.hotels.filter((h) => String(h.status || 'ATIVO').toUpperCase() !== 'INATIVO');
  if (state.filter === 'uso') hotels = hotels.filter((h) => state.activeHotelIds.has(String(h.id)));
  if (state.filter === 'negativos') hotels = hotels.filter((h) => (state.balances.get(String(h.id))?.net || 0) < 0);
  if (state.filter === 'saldo') hotels = hotels.filter((h) => (state.balances.get(String(h.id))?.net || 0) > 0);
  const q = state.search.trim().toUpperCase();
  if (q) hotels = hotels.filter((h) => [h.nome,h.razao_social,h.cidade,h.uf,h.cnpj_cpf].filter(Boolean).join(' ').toUpperCase().includes(q));
  hotels.sort((a,b) => String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR',{sensitivity:'base'}));
  const tbody = panel.querySelector('.hosp-rd-table tbody');
  if (tbody) tbody.innerHTML = hotels.length ? hotels.map(hotelRow).join('') : '<tr><td colspan="5"><div class="hosp-rd-empty">Nenhum hotel nesta janela.</div></td></tr>';
  $$('.hosp-rd-btn[data-hosp-rd-hotel-filter]', panel).forEach((btn) => btn.classList.toggle('primary', btn.dataset.hospRdHotelFilter === state.filter));
}
async function refreshHotels() { await loadBalanceData(); renderHotelBalances(); }

function injectStyles() {
  if ($('#hospSafeStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospSafeStyles';
  style.textContent = `
    .hosp-pay-extra-box{margin-top:10px;padding:12px;border:1px solid rgba(74,222,128,.22);border-radius:14px;background:rgba(2,18,13,.48)}
    .hosp-pay-extra-head,.hosp-pay-extra-row{display:grid;grid-template-columns:76px minmax(240px,1fr) 150px 38px;gap:10px;align-items:end}
    .hosp-pay-extra-head{padding:0 0 7px;color:#8ba69a;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
    .hosp-pay-extra-row{margin-top:8px}.hosp-pay-extra-row label{display:grid;gap:5px;min-width:0}.hosp-pay-extra-row label>span{font-size:10px;color:#8ba69a;font-weight:900;text-transform:uppercase}.hosp-pay-extra-row input{width:100%;min-width:0;box-sizing:border-box;border:1px solid rgba(255,255,255,.09);background:#081e27;color:#eefbf5;border-radius:11px;padding:10px 11px;outline:none}.hosp-pay-extra-row button{width:38px;height:38px;border:1px solid rgba(239,68,68,.3);border-radius:10px;background:rgba(127,29,29,.16);color:#fca5a5;cursor:pointer}
    .hosp-pay-extra-total{display:flex;justify-content:flex-end;gap:16px;align-items:center;margin-top:11px;padding-top:10px;border-top:1px solid rgba(74,222,128,.14);font-size:12px}.hosp-pay-extra-total strong{color:#86efac;font-size:14px}
    @media(max-width:850px){.hosp-pay-extra-head{display:none}.hosp-pay-extra-row{grid-template-columns:76px 1fr 110px 38px}}
  `;
  document.head.appendChild(style);
}

function paymentRowsRoot() { return $('#hospPayInlineExtras'); }
function paymentExtrasTotal() { return $$('[data-pay-extra-row]', paymentRowsRoot() || document).reduce((s,row) => s + num(row.querySelector('[data-pay-extra-value]')?.value),0); }
function recalcPaymentValue() {
  const input = $('#pagarValor'); if (input) input.value = (state.payment.baseDue + paymentExtrasTotal()).toFixed(2);
  const total = $('#hospPayExtraTotal'); if (total) total.textContent = money(paymentExtrasTotal());
}
function addPaymentExtra() {
  const root = paymentRowsRoot(); if (!root) return;
  const row = document.createElement('div');
  row.className = 'hosp-pay-extra-row'; row.dataset.payExtraRow = '1';
  row.innerHTML = `<label><span>Un</span><input data-pay-extra-qty type="number" min="1" step="1" value="1"></label><label><span>Descrição</span><input data-pay-extra-desc placeholder="Água, lavanderia..."></label><label><span>Valor</span><input data-pay-extra-value type="number" min="0" step="0.01" placeholder="0,00"></label><button type="button" data-pay-extra-remove title="Remover">×</button>`;
  root.appendChild(row);
  row.querySelector('[data-pay-extra-remove]')?.addEventListener('click', () => { row.remove(); recalcPaymentValue(); });
  row.querySelectorAll('input').forEach((input) => input.addEventListener('input', recalcPaymentValue));
}
function patchPaymentModal() {
  const modal = $('#modalPagar'); if (!modal?.classList.contains('open')) return false;
  if (!state.payment.open) {
    state.payment.open = true;
    state.payment.baseDue = num($('#pagarValor')?.value);
  }
  const confirm = $('#btnConfirmarPagamento'); if (confirm) confirm.style.display = 'none';
  const box = modal.querySelector('.adm-payment-extras');
  if (box) {
    const strong = box.querySelector('strong'); const span = box.querySelector('span');
    if (strong) strong.textContent = 'Custos adicionais';
    if (span) span.textContent = 'Inclua apenas quantidade, descrição e valor. O total será somado ao pagamento.';
    const add = $('#btnPagarExtra'); if (add) add.textContent = '+ ADICIONAR CUSTO';
    if (!$('#hospPayInlineExtras')) box.insertAdjacentHTML('afterend', `<div class="hosp-pay-extra-box"><div class="hosp-pay-extra-head"><span>Un</span><span>Descrição</span><span>Valor</span><span></span></div><div id="hospPayInlineExtras"></div><div class="hosp-pay-extra-total"><span>Total adicionais</span><strong id="hospPayExtraTotal">R$ 0,00</strong></div></div>`);
  }
  const proof = $('#btnPagarComprovante');
  if (proof && !$('#btnPagarNfse')) proof.insertAdjacentHTML('afterend','<button class="btn btn-secondary" type="button" id="btnPagarNfse">ANEXAR NFSe</button>');
  recalcPaymentValue();
  return true;
}
function waitPaymentModal(reservaId) {
  state.payment.reservaId = String(reservaId || ''); state.payment.open = false;
  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    if (patchPaymentModal()) { clearInterval(timer); await resolvePaymentContext(); }
    if (tries > 40) clearInterval(timer);
  }, 100);
}
async function resolvePaymentContext() {
  if (!state.payment.reservaId) return state.payment;
  const rows = state.rows.filter((r) => String(r.reserva_id) === String(state.payment.reservaId));
  const row = rows[0] || null;
  state.payment.requestId = String(row?.solicitacao_id || '');
  state.payment.row = row;
  return state.payment;
}
async function persistInlineExtras() {
  if (state.payment.savingExtras || !state.payment.reservaId) return;
  const rows = $$('[data-pay-extra-row]', paymentRowsRoot() || document).filter((r) => r.dataset.saved !== '1');
  const items = rows.map((r) => ({ qty: Math.max(1,num(r.querySelector('[data-pay-extra-qty]')?.value)), desc: String(r.querySelector('[data-pay-extra-desc]')?.value || '').trim(), value: num(r.querySelector('[data-pay-extra-value]')?.value) })).filter((x) => x.desc && x.value > 0);
  if (!items.length) return;
  state.payment.savingExtras = true;
  try {
    await resolvePaymentContext();
    const payload = items.map((x) => ({ solicitacao_id: state.payment.requestId || null, reserva_id: state.payment.reservaId, tipo:'OUTROS', descricao:x.desc, quantidade:x.qty, valor_unitario:x.qty ? x.value/x.qty : x.value, valor_total:x.value, data_custo:today(), enviar_conferencia:false, status_conferencia:'NAO_ENVIADO' }));
    const { error } = await supabase.from('hospedagem_custos_extras').insert(payload); if (error) throw error;
    rows.forEach((r) => { r.dataset.saved = '1'; r.querySelectorAll('input').forEach((i) => i.disabled = true); });
    await syncReservationTotal(state.payment.reservaId);
    await loadBalanceData();
  } finally { state.payment.savingExtras = false; }
}
async function syncReservationTotal(reservaId) {
  const { data: reservationRows } = await supabase.from('hospedagem_painel_geral').select('*').eq('reserva_id',reservaId).limit(1);
  const row = reservationRows?.[0]; if (!row) return;
  const { data: extras } = await supabase.from('hospedagem_custos_extras').select('*').eq('reserva_id',reservaId);
  const base = num(row.valor_total_previsto || (num(row.valor_diaria) * Math.max(1,num(row.quantidade_diarias||1)) * Math.max(1,num(row.quantidade_quartos||1))));
  const total = Math.max(0, base + (extras || []).reduce((s,e) => s + signedExtra(e),0));
  await supabase.from('hospedagem_reservas').update({ valor_total_final: total }).eq('id',reservaId);
  const { data: finRows } = await supabase.from('hospedagem_financeiro').select('*').eq('reserva_id',reservaId).limit(1);
  const fin = finRows?.[0];
  if (fin) await supabase.from('hospedagem_financeiro').update({ valor_total:total, valor_original:total, saldo:Math.max(0,total-num(fin.valor_pago)) }).eq('id',fin.id);
  else await supabase.from('hospedagem_financeiro').insert({ reserva_id:reservaId, valor_total:total, valor_original:total, saldo:total, status_financeiro:'NAO_INICIADO' });
  state.payment.baseDue = Math.max(0,total-availableCredit(row.hotel_id));
  recalcPaymentValue();
}

async function upsertFinance(reservaId, payload) {
  const { data } = await supabase.from('hospedagem_financeiro').select('id').eq('reserva_id',reservaId).limit(1);
  if (data?.[0]?.id) return supabase.from('hospedagem_financeiro').update(payload).eq('id',data[0].id);
  return supabase.from('hospedagem_financeiro').insert({ reserva_id:reservaId, ...payload });
}
async function consumeCredits(hotelId, reservaId, limit) {
  if (!hotelId || limit <= 0) return 0;
  const { data, error } = await supabase.rpc('hospedagem_consumir_creditos', {
    p_hotel_id:hotelId,
    p_reserva_id:reservaId,
    p_limite:limit
  });
  if (error) throw error;
  return num(data);
}
async function confirmPaymentWithProof() {
  const reservaId = state.payment.reservaId; if (!reservaId) return;
  await persistInlineExtras();
  const paidCash = num($('#pagarValor')?.value);
  const { data: lotes, error: lotError } = await supabase.from('hospedagem_checkout_lotes').select('id').eq('reserva_id',reservaId).in('status',['PENDENTE','PARCIAL']).order('created_at',{ascending:true}).limit(1);
  if (lotError) throw lotError;
  const loteId=lotes?.[0]?.id;
  if (!loteId) throw new Error('Nenhum lote financeiro pendente foi encontrado.');
  const { data: result, error } = await supabase.rpc('hospedagem_confirmar_pagamento_lote', {
    p_lote_id:loteId,
    p_valor_pago:paidCash,
    p_comprovante_url:null
  });
  if (error) throw error;
  const status=String(result?.status||'PARCIAL').toUpperCase();
  const feedback = $('#pagarFeedback'); if (feedback) { feedback.textContent = status==='PAGO'?'Pagamento confirmado pelo comprovante anexado.':'Comprovante anexado; pagamento registrado como parcial.'; feedback.className='adm-hosp-feedback ok'; }
  await refreshHotels();
}
async function sendToFinance() {
  const reservaId = state.payment.reservaId; if (!reservaId) return;
  await persistInlineExtras();
  const { data: lotes, error: lotError } = await supabase.from('hospedagem_checkout_lotes').select('id').eq('reserva_id',reservaId).in('status',['PENDENTE','PARCIAL']).order('created_at',{ascending:false}).limit(1);
  if (lotError) throw lotError;
  const loteId=lotes?.[0]?.id;
  if (!loteId) throw new Error('Faça o checkout antes de enviar ao Financeiro.');
  const { error } = await supabase.rpc('hospedagem_enviar_lote_financeiro', { p_reserva_id:reservaId,p_lote_id:loteId });
  if (error) throw error;
  $('#modalPagar')?.classList.remove('open'); state.payment.open=false;
  await refreshHotels();
}

async function openDocument(type) {
  await persistInlineExtras();
  await resolvePaymentContext();
  if (!state.payment.requestId) return;
  state.payment.docType = type;
  window.__hospedagemAcaoLote = [state.payment.requestId];
  const { data: existing } = await supabase.from('hospedagem_documentos').select('id').eq('reserva_id',state.payment.reservaId).eq('tipo',type);
  state.payment.beforeDocIds = new Set((existing || []).map((d) => String(d.id)));
  window.__abrirHospedagemAcao?.('document',state.payment.requestId);
  setTimeout(() => { const select=$('#hospV2DocumentType');if(select)select.value=type; },120);
}
function waitForNewProof() {
  if (state.payment.docType !== 'COMPROVANTE' || !state.payment.reservaId) return;
  let tries=0;
  const timer=setInterval(async()=>{
    tries+=1;
    const { data }=await supabase.from('hospedagem_documentos').select('id').eq('reserva_id',state.payment.reservaId).eq('tipo','COMPROVANTE');
    const fresh=(data||[]).find((d)=>!state.payment.beforeDocIds.has(String(d.id)));
    if(fresh){clearInterval(timer);state.payment.docType='';try{await confirmPaymentWithProof();}catch(error){console.error('[hosp-safe] confirmar comprovante',error);const f=$('#pagarFeedback');if(f){f.textContent=error.message||'Erro ao confirmar pagamento.';f.className='adm-hosp-feedback err';}}}
    if(tries>35)clearInterval(timer);
  },300);
}

function bindRoot(root) {
  if (root.dataset.hospSafeBound === '1') return;
  root.dataset.hospSafeBound = '1';
  root.addEventListener('click',(event)=>{
    const filter=event.target.closest('[data-hosp-rd-hotel-filter]');
    if(filter){state.filter=filter.dataset.hospRdHotelFilter;setTimeout(renderHotelBalances,60);}
    const tab=event.target.closest('[data-hosp-rd-tab="hoteis"]'); if(tab)setTimeout(()=>{refreshHotels();},150);
    const refresh=event.target.closest('[data-hosp-rd-action="refresh"]'); if(refresh)setTimeout(()=>refreshHotels(),500);
    const pay=event.target.closest('[data-hosp-rd-action="pay"]'); if(pay?.dataset.reserva)waitPaymentModal(pay.dataset.reserva);
    const hotelPay=event.target.closest('[data-hosp-rd-modal="hotel-pay"]'); if(hotelPay?.dataset.reserva)waitPaymentModal(hotelPay.dataset.reserva);
  });
  root.addEventListener('input',(event)=>{if(event.target.matches('[data-hosp-rd-search="hoteis"]')){state.search=event.target.value;setTimeout(renderHotelBalances,20);}});
}

window.addEventListener('click',async(event)=>{
  const target=event.target.closest('button'); if(!target)return;
  if(target.id==='btnPagarExtra'){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();addPaymentExtra();return;
  }
  if(target.id==='btnPagarComprovante'){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();try{await openDocument('COMPROVANTE');}catch(error){console.error(error);}return;
  }
  if(target.id==='btnPagarNfse'){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();try{await openDocument('NFSE');}catch(error){console.error(error);}return;
  }
  if(target.id==='btnPagarFinanceiro'){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();try{await sendToFinance();}catch(error){console.error('[hosp-safe] financeiro',error);const f=$('#pagarFeedback');if(f){f.textContent=error.message||'Erro ao enviar ao Financeiro.';f.className='adm-hosp-feedback err';}}return;
  }
  if(target.id==='btnGerarPix' && !state.skip.has('qr')){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();try{await persistInlineExtras();state.skip.add('qr');target.click();setTimeout(()=>state.skip.delete('qr'),0);}catch(error){console.error(error);}return;
  }
  if(target.id==='hospV2SaveDocument' && state.payment.docType==='COMPROVANTE') setTimeout(waitForNewProof,100);
},true);

function start() {
  injectStyles();
  let tries=0;
  const timer=setInterval(()=>{
    tries+=1;
    const root=$('#hospRedesignRoot');
    if(root){clearInterval(timer);state.root=root;bindRoot(root);state.filter=$('.hosp-rd-btn.primary[data-hosp-rd-hotel-filter]',root)?.dataset.hospRdHotelFilter||'uso';state.search=$('[data-hosp-rd-search="hoteis"]',root)?.value||'';setTimeout(refreshHotels,1400);}
    if(tries>150)clearInterval(timer);
  },100);
  console.info(`[adm-hotel-safe] ${VERSION}`);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
