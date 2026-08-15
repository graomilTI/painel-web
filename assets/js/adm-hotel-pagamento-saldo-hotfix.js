import { supabase } from './supabaseClient.js';

const VERSION = '20260815-pagamento-saldo2';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const num = (v) => Number(v || 0) || 0;
const iso = (v) => String(v || '').slice(0, 10);
const money = (v) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

const balance = {
  hotels: [], rows: [], finance: [], extras: [], advances: [], assignments: [],
  byHotel: new Map(), activeIds: new Set(), filter: 'uso', search: '', loading: false,
  observer: null, observerRoot: null,
};

const payment = {
  reservaId: '', requestId: '', baseDue: 0, sessionOpen: false, pendingProof: false,
  proofObserver: null, savingExtras: false,
};

function uniqueReservations(rows) {
  const map = new Map();
  rows.forEach((r) => { if (r.reserva_id && !map.has(String(r.reserva_id))) map.set(String(r.reserva_id), r); });
  return [...map.values()];
}
function signedExtra(e) {
  const v = num(e.valor_total ?? num(e.quantidade || 1) * num(e.valor_unitario));
  return String(e.tipo || '').toUpperCase() === 'DESCONTO' ? -v : v;
}
function reservationTotal(row, extras) {
  const base = num(row.valor_total_previsto || (num(row.valor_diaria) * Math.max(1, num(row.quantidade_diarias || 1)) * Math.max(1, num(row.quantidade_quartos || 1))));
  const extra = extras.filter((e) => String(e.reserva_id) === String(row.reserva_id)).reduce((s,e) => s + signedExtra(e), 0);
  const final = num(row.valor_total_final);
  return Math.max(0, final > 0 ? Math.max(final, base + extra) : base + extra);
}

async function loadBalances() {
  if (balance.loading) return;
  balance.loading = true;
  try {
    const [hotels, rows, finance, extras, advances, assignments] = await Promise.all([
      supabase.from('hospedagem_hoteis').select('*'),
      supabase.from('hospedagem_painel_geral').select('*'),
      supabase.from('hospedagem_financeiro').select('*'),
      supabase.from('hospedagem_custos_extras').select('*'),
      supabase.from('hospedagem_adiantamentos').select('*'),
      supabase.from('hospedagem_reserva_colaboradores').select('reserva_id,status,checkout_em'),
    ]);
    balance.hotels = hotels.data || [];
    balance.rows = rows.data || [];
    balance.finance = finance.data || [];
    balance.extras = extras.data || [];
    balance.advances = advances.data || [];
    balance.assignments = assignments.data || [];

    const reservations = uniqueReservations(balance.rows).filter((r) => String(r.status_hospedagem || '').toUpperCase() !== 'CANCELADA');
    const financeByReservation = new Map(balance.finance.map((f) => [String(f.reserva_id), f]));
    balance.activeIds = new Set();
    const activeReservations = new Set(balance.assignments.filter((a) => !a.checkout_em && !['CHECKOUT','CANCELADO'].includes(String(a.status || '').toUpperCase())).map((a) => String(a.reserva_id)));
    reservations.forEach((r) => {
      if (activeReservations.has(String(r.reserva_id)) && r.hotel_id) balance.activeIds.add(String(r.hotel_id));
    });

    balance.byHotel.clear();
    balance.hotels.forEach((h) => {
      const hotelReservations = reservations.filter((r) => String(r.hotel_id) === String(h.id));
      let debt = 0;
      hotelReservations.forEach((r) => {
        const total = reservationTotal(r, balance.extras);
        const fin = financeByReservation.get(String(r.reserva_id));
        const paid = num(fin?.valor_pago);
        debt += Math.max(0, total - paid);
      });
      const credit = balance.advances
        .filter((a) => String(a.hotel_id) === String(h.id) && String(a.status || '').toUpperCase() === 'DISPONIVEL')
        .reduce((s,a) => s + num(a.saldo), 0);
      balance.byHotel.set(String(h.id), { debt, credit, net: credit - debt });
    });
  } finally {
    balance.loading = false;
  }
}

function editIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></svg>'; }
function pendingIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'; }
function closeIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'; }

function hotelRow(h) {
  const b = balance.byHotel.get(String(h.id)) || { net: 0 };
  const net = b.net;
  return `<tr><td><strong>${esc(h.nome || '-')}</strong>${h.razao_social ? `<span class="hosp-rd-sub">${esc(h.razao_social)}</span>` : ''}</td><td>${esc(h.cidade || '-')}</td><td>${esc(h.uf || '-')}</td><td><span class="hosp-rd-pill ${net>0?'green':net<0?'red':''}">${net>0?`Crédito ${money(net)}`:net<0?`A pagar ${money(Math.abs(net))}`:'Zerado'}</span></td><td><div class="hosp-rd-actions"><button class="hosp-rd-icon-btn" data-hosp-rd-action="edit-hotel" data-hotel="${esc(h.id)}" title="Editar">${editIcon()}</button><button class="hosp-rd-icon-btn" data-hosp-rd-action="hotel-pending" data-hotel="${esc(h.id)}" title="Pendências">${pendingIcon()}</button><button class="hosp-rd-icon-btn red" data-hosp-rd-action="remove-hotel" data-hotel="${esc(h.id)}" title="Remover">${closeIcon()}</button></div></td></tr>`;
}

function connectBalanceObserver() {
  if (balance.observer && balance.observerRoot) balance.observer.observe(balance.observerRoot, { childList: true, subtree: true });
}
function renderBalances() {
  const panel = $('#hospRdHoteis');
  if (!panel || !balance.hotels.length) return;
  balance.observer?.disconnect();
  panel.querySelector('[data-hosp-rd-action="cashflow"]')?.remove();
  const desc = panel.querySelector('.hosp-rd-title p');
  if (desc) desc.textContent = 'Cadastro, pendências, créditos e saldo financeiro por hotel.';

  const metrics = $$('.hosp-rd-hotel-metric', panel);
  const totalPositive = [...balance.byHotel.values()].reduce((s,b) => s + Math.max(0,b.net),0);
  const totalNegative = [...balance.byHotel.values()].reduce((s,b) => s + Math.max(0,-b.net),0);
  const month = today().slice(0,7);
  const paidMonth = balance.finance.filter((f) => iso(f.data_pagamento || f.pago_em).startsWith(month)).reduce((s,f) => s + num(f.valor_pago),0);
  if (metrics[0]) metrics[0].querySelector('strong').textContent = money(totalPositive);
  if (metrics[1]) metrics[1].querySelector('strong').textContent = money(totalNegative);
  if (metrics[2]) metrics[2].querySelector('strong').textContent = money(paidMonth);

  $$('.hosp-rd-btn[data-hosp-rd-hotel-filter]', panel).forEach((btn) => btn.classList.toggle('primary', btn.dataset.hospRdHotelFilter === balance.filter));
  const searchInput = panel.querySelector('[data-hosp-rd-search="hoteis"]');
  if (searchInput && searchInput.value !== balance.search) searchInput.value = balance.search;

  let hotels = balance.hotels.filter((h) => String(h.status || 'ATIVO').toUpperCase() !== 'INATIVO');
  if (balance.filter === 'uso') hotels = hotels.filter((h) => balance.activeIds.has(String(h.id)));
  if (balance.filter === 'negativos') hotels = hotels.filter((h) => (balance.byHotel.get(String(h.id))?.net || 0) < 0);
  if (balance.filter === 'saldo') hotels = hotels.filter((h) => (balance.byHotel.get(String(h.id))?.net || 0) > 0);
  const q = balance.search.trim().toUpperCase();
  if (q) hotels = hotels.filter((h) => [h.nome,h.razao_social,h.cidade,h.uf,h.cnpj_cpf].filter(Boolean).join(' ').toUpperCase().includes(q));
  hotels.sort((a,b) => String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR',{sensitivity:'base'}));
  const tbody = panel.querySelector('.hosp-rd-table tbody');
  if (tbody) tbody.innerHTML = hotels.length ? hotels.map(hotelRow).join('') : '<tr><td colspan="5"><div class="hosp-rd-empty">Nenhum hotel nesta janela.</div></td></tr>';
  connectBalanceObserver();
}
async function refreshBalances() { await loadBalances(); renderBalances(); }

function parseMoneyInput(v) { return Number(String(v || '').replace(/\./g,'').replace(',','.')) || 0; }
function paymentRowsRoot() { return $('#hospPayInlineExtras'); }
function paymentExtrasTotal() {
  return $$('[data-pay-extra-row]', paymentRowsRoot() || document).reduce((s,row) => s + parseMoneyInput(row.querySelector('[data-pay-extra-value]')?.value), 0);
}
function recalcPaymentValue() {
  const input = $('#pagarValor'); if (!input) return;
  input.value = (payment.baseDue + paymentExtrasTotal()).toFixed(2);
  const total = $('#hospPayExtraTotal'); if (total) total.textContent = money(paymentExtrasTotal());
}
function addPaymentExtra() {
  const root = paymentRowsRoot(); if (!root) return;
  const row = document.createElement('div');
  row.className = 'hosp-pay-extra-row'; row.dataset.payExtraRow = '1';
  row.innerHTML = `<label><span>Un</span><input data-pay-extra-qty type="number" min="1" step="1" value="1"></label><label><span>Descrição</span><input data-pay-extra-desc placeholder="Água, lavanderia..."></label><label><span>Valor</span><input data-pay-extra-value type="number" min="0" step="0.01" placeholder="0,00"></label><button type="button" data-pay-extra-remove title="Remover">×</button>`;
  root.appendChild(row);
  row.querySelector('[data-pay-extra-remove]')?.addEventListener('click', () => { row.remove(); recalcPaymentValue(); });
  row.querySelectorAll('input').forEach((i) => i.addEventListener('input', recalcPaymentValue));
}
function patchPaymentModal() {
  const modal = $('#modalPagar'); if (!modal) return;
  const open = modal.classList.contains('open');
  if (open && !payment.sessionOpen) {
    payment.sessionOpen = true;
    setTimeout(() => {
      payment.baseDue = parseMoneyInput($('#pagarValor')?.value);
      if (paymentRowsRoot()) paymentRowsRoot().innerHTML = '';
      recalcPaymentValue();
    }, 180);
  } else if (!open) {
    payment.sessionOpen = false; payment.pendingProof = false; payment.reservaId = ''; payment.requestId = '';
  }
  const confirm = $('#btnConfirmarPagamento'); if (confirm) confirm.style.display = 'none';
  const box = modal.querySelector('.adm-payment-extras');
  if (box) {
    const strong = box.querySelector('strong'); const span = box.querySelector('span');
    if (strong) strong.textContent = 'Custos adicionais';
    if (span) span.textContent = 'Os itens abaixo são somados ao valor final do pagamento.';
    const add = $('#btnPagarExtra'); if (add) add.textContent = '+ ADICIONAR CUSTO';
    if (!$('#hospPayInlineExtras')) {
      box.insertAdjacentHTML('afterend', `<div class="hosp-pay-extra-box"><div class="hosp-pay-extra-head"><span>Un</span><span>Descrição</span><span>Valor</span><span></span></div><div id="hospPayInlineExtras"></div><div class="hosp-pay-extra-total"><span>Total adicionais</span><strong id="hospPayExtraTotal">R$ 0,00</strong></div></div>`);
    }
  }
  const proof = $('#btnPagarComprovante');
  if (proof && !$('#btnPagarNfse')) proof.insertAdjacentHTML('afterend','<button class="btn btn-secondary" type="button" id="btnPagarNfse">ANEXAR NFSe</button>');
}

async function resolvePaymentContext() {
  if (payment.reservaId) return payment;
  const ids = Array.isArray(window.__hospedagemAcaoLote) ? window.__hospedagemAcaoLote.map(String).filter(Boolean) : [];
  if (ids.length) {
    const { data } = await supabase.from('hospedagem_painel_geral').select('solicitacao_id,reserva_id,hotel_id,hotel,cidade,uf,codigo,data_checkin,data_checkin_prevista').in('solicitacao_id', ids);
    const row = (data || []).find((r) => r.reserva_id);
    if (row) { payment.reservaId = String(row.reserva_id); payment.requestId = String(row.solicitacao_id); payment.row = row; }
  }
  return payment;
}
async function persistInlineExtras() {
  if (payment.savingExtras) return;
  const ctx = await resolvePaymentContext(); if (!ctx.reservaId) return;
  const rows = $$('[data-pay-extra-row]', paymentRowsRoot() || document).filter((r) => r.dataset.saved !== '1');
  const items = rows.map((r) => ({ qty: Math.max(1,num(r.querySelector('[data-pay-extra-qty]')?.value)), desc: String(r.querySelector('[data-pay-extra-desc]')?.value || '').trim(), value: num(r.querySelector('[data-pay-extra-value]')?.value) })).filter((x) => x.desc && x.value > 0);
  if (!items.length) return;
  payment.savingExtras = true;
  try {
    const requestId = ctx.requestId || (Array.isArray(window.__hospedagemAcaoLote) ? String(window.__hospedagemAcaoLote[0] || '') : '');
    const payload = items.map((x) => ({ solicitacao_id: requestId || null, reserva_id: ctx.reservaId, tipo:'OUTROS', descricao:x.desc, quantidade:x.qty, valor_unitario:x.qty ? x.value/x.qty : x.value, valor_total:x.value, data_custo:today(), enviar_conferencia:false, status_conferencia:'NAO_ENVIADO' }));
    const { error } = await supabase.from('hospedagem_custos_extras').insert(payload); if (error) throw error;
    rows.forEach((r) => { r.dataset.saved = '1'; r.querySelectorAll('input').forEach((i) => i.disabled = true); });
    await syncReservationTotal(ctx.reservaId);
  } finally { payment.savingExtras = false; }
}
async function syncReservationTotal(reservaId) {
  const [{ data: rows }, { data: extras }, { data: fin }] = await Promise.all([
    supabase.from('hospedagem_painel_geral').select('*').eq('reserva_id',reservaId),
    supabase.from('hospedagem_custos_extras').select('*').eq('reserva_id',reservaId),
    supabase.from('hospedagem_financeiro').select('*').eq('reserva_id',reservaId),
  ]);
  const row=(rows||[])[0]; if(!row) return 0;
  const base=num(row.valor_total_previsto || (num(row.valor_diaria)*Math.max(1,num(row.quantidade_diarias||1))*Math.max(1,num(row.quantidade_quartos||1))));
  const total=Math.max(0,base+(extras||[]).reduce((s,e)=>s+signedExtra(e),0));
  await supabase.from('hospedagem_reservas').update({valor_total_final:total}).eq('id',reservaId);
  const f=(fin||[])[0]; const paid=num(f?.valor_pago);
  if(f) await supabase.from('hospedagem_financeiro').update({valor_total:total,valor_original:total,saldo:Math.max(0,total-paid)}).eq('id',f.id);
  else await supabase.from('hospedagem_financeiro').insert({reserva_id:reservaId,valor_total:total,valor_original:total,valor_pago:0,saldo:total,status_financeiro:'NAO_INICIADO'});
  return total;
}
async function availableCredits(hotelId) {
  const { data } = await supabase.from('hospedagem_adiantamentos').select('*').eq('hotel_id',hotelId).eq('status','DISPONIVEL').gt('saldo',0).order('created_at');
  return data || [];
}
async function consumeCredit(hotelId,reservaId,limit) {
  let remaining=limit,used=0; const items=await availableCredits(hotelId);
  for(const a of items){if(remaining<=0)break;const use=Math.min(remaining,num(a.saldo));if(!use)continue;const saldo=num(a.saldo)-use;await supabase.from('hospedagem_adiantamentos').update({saldo,status:saldo<=0?'UTILIZADO':'DISPONIVEL'}).eq('id',a.id);await supabase.from('hospedagem_adiantamento_movimentos').insert({adiantamento_id:a.id,reserva_id:reservaId,tipo:'UTILIZACAO',valor:use,observacoes:'Crédito aplicado ao pagamento da hospedagem'});remaining-=use;used+=use;}
  return used;
}
async function contextRow(reservaId) {
  const { data }=await supabase.from('hospedagem_painel_geral').select('*').eq('reserva_id',reservaId).limit(1); return (data||[])[0]||null;
}
async function upsertFinance(reservaId,payload){const {data}=await supabase.from('hospedagem_financeiro').select('id').eq('reserva_id',reservaId).limit(1);const f=(data||[])[0];return f?supabase.from('hospedagem_financeiro').update(payload).eq('id',f.id):supabase.from('hospedagem_financeiro').insert({reserva_id:reservaId,...payload});}
async function sendToFinance() {
  await persistInlineExtras(); const ctx=await resolvePaymentContext(); if(!ctx.reservaId)return;
  const row=await contextRow(ctx.reservaId); if(!row)return; const total=await syncReservationTotal(ctx.reservaId); const credit=await consumeCredit(row.hotel_id,ctx.reservaId,total); const due=Math.max(0,total-credit);
  const hotel=(await supabase.from('hospedagem_hoteis').select('*').eq('id',row.hotel_id).limit(1)).data?.[0];
  const payload={origem_setor:'HOSPEDAGEM',origem_tabela:'hospedagem_reservas',origem_id:ctx.reservaId,origem_codigo:row.codigo||null,competencia:row.data_checkin||row.data_checkin_prevista||today(),descricao:`Hospedagem ${row.hotel||hotel?.nome||''} · ${row.cidade||''}/${row.uf||''}`,favorecido_nome:hotel?.razao_social||hotel?.nome||row.hotel||'Hotel',forma_pagamento:'PIX',valor:due,status:'PENDENTE',prioridade:'NORMAL',observacoes:credit?`Crédito de ${money(credit)} aplicado antes do envio.`:null};
  const {error}=await supabase.from('financeiro_pagamentos').upsert(payload,{onConflict:'origem_tabela,origem_id'});if(error){alert(error.message);return;}
  await upsertFinance(ctx.reservaId,{valor_original:total,valor_total:total,valor_pago:credit,saldo:due,status_financeiro:'ENVIADO_AO_FINANCEIRO',origem_pagamento:'FINANCEIRO',enviado_financeiro_em:new Date().toISOString()});
  $('#modalPagar')?.classList.remove('open'); alert('Pagamento enviado ao Financeiro.'); document.querySelector('[data-hosp-rd-action="refresh"]')?.click(); setTimeout(refreshBalances,500);
}
async function confirmAfterProof() {
  const ctx=await resolvePaymentContext(); if(!ctx.reservaId)return;
  const {data:docs}=await supabase.from('hospedagem_documentos').select('id').eq('reserva_id',ctx.reservaId).eq('tipo','COMPROVANTE').limit(1);
  if(!(docs||[]).length){alert('O pagamento só pode ser confirmado após anexar o comprovante.');return;}
  const row=await contextRow(ctx.reservaId);if(!row)return;const total=await syncReservationTotal(ctx.reservaId);const credit=await consumeCredit(row.hotel_id,ctx.reservaId,total);const cash=Math.max(0,total-credit);const taxa=$('#pagarTaxaBancaria')?.checked?2:0;
  const {data:{user}}=await supabase.auth.getUser();
  const payload={valor_original:total,valor_total:total,valor_pago:total,saldo:0,pagamento_parcial:false,status_financeiro:'PAGO',data_pagamento:today(),pago_em:new Date().toISOString(),responsavel_pagamento:user?.user_metadata?.full_name||user?.email||'Hotéis',responsavel_pagamento_id:user?.id||null,origem_pagamento:'HOTEIS',taxa_bancaria:taxa,valor_comprovante:cash+taxa,classificacao_pagamento:'TOTAL'};
  const {error}=await upsertFinance(ctx.reservaId,payload);if(error){alert(error.message);return;}
  await supabase.from('hospedagem_checkout_lotes').update({status:'PAGO'}).eq('reserva_id',ctx.reservaId).eq('status','PENDENTE');
  $('#hospV2DocumentModal')?.classList.remove('open'); $('#modalPagar')?.classList.remove('open'); payment.pendingProof=false; alert('Comprovante anexado e pagamento confirmado.'); document.querySelector('[data-hosp-rd-action="refresh"]')?.click();setTimeout(refreshBalances,500);
}
function openDocument(type) {
  const ids=Array.isArray(window.__hospedagemAcaoLote)?window.__hospedagemAcaoLote:[];const sol=String(ids[0]||payment.requestId||'');if(!sol||typeof window.__abrirHospedagemAcao!=='function')return;
  window.__abrirHospedagemAcao('document',sol); setTimeout(()=>{const sel=$('#hospV2DocumentType');if(sel)sel.value=type;},80);
}

function injectStyles(){if($('#hospPayBalanceStyles'))return;const s=document.createElement('style');s.id='hospPayBalanceStyles';s.textContent=`
#hospPayInlineExtras{display:grid;gap:8px}.hosp-pay-extra-box{margin:-2px 0 14px;padding:12px;border:1px solid rgba(74,222,128,.16);border-radius:14px;background:rgba(2,18,13,.34)}.hosp-pay-extra-head,.hosp-pay-extra-row{display:grid;grid-template-columns:76px minmax(240px,1fr) 145px 38px;gap:10px;align-items:end}.hosp-pay-extra-head{padding:0 0 6px;color:#789487;font-size:10px;font-weight:900;text-transform:uppercase}.hosp-pay-extra-row label{display:grid;gap:5px}.hosp-pay-extra-row label span{display:none}.hosp-pay-extra-row input{width:100%;min-width:0;box-sizing:border-box;border:1px solid rgba(255,255,255,.08);background:#071b24;color:#eefbf5;border-radius:11px;padding:10px 11px}.hosp-pay-extra-row button{height:40px;border:1px solid rgba(248,113,113,.22);border-radius:10px;background:transparent;color:#fca5a5;font-size:18px;cursor:pointer}.hosp-pay-extra-total{display:flex;justify-content:flex-end;gap:12px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(74,222,128,.12);font-size:12px}.hosp-pay-extra-total strong{color:#86efac}.adm-payment-actions #btnPagarNfse{display:inline-flex!important}@media(max-width:760px){.hosp-pay-extra-head{display:none}.hosp-pay-extra-row{grid-template-columns:74px 1fr 38px}.hosp-pay-extra-row label:nth-child(3){grid-column:1/3}.hosp-pay-extra-row label span{display:block;color:#789487;font-size:9px;text-transform:uppercase}.hosp-pay-extra-row button{grid-column:3;grid-row:1/3;height:100%}}
`;document.head.appendChild(s);}

function bindEvents(){
  window.addEventListener('click',async(e)=>{
    const payAction=e.target.closest('[data-hosp-rd-action="pay"]');if(payAction){payment.reservaId=String(payAction.dataset.reserva||'');payment.requestId='';}
    if(e.target.closest('#btnPagarExtra')){e.preventDefault();e.stopImmediatePropagation();addPaymentExtra();return;}
    if(e.target.closest('#btnConfirmarPagamento')){e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.target.closest('#btnPagarFinanceiro')){e.preventDefault();e.stopImmediatePropagation();await sendToFinance();return;}
    if(e.target.closest('#btnPagarComprovante')){e.preventDefault();e.stopImmediatePropagation();await persistInlineExtras();payment.pendingProof=true;openDocument('COMPROVANTE');return;}
    if(e.target.closest('#btnPagarNfse')){e.preventDefault();e.stopImmediatePropagation();await persistInlineExtras();openDocument('NFSE');return;}
    const filter=e.target.closest('#hospRdHoteis [data-hosp-rd-hotel-filter]');if(filter){e.preventDefault();e.stopImmediatePropagation();balance.filter=filter.dataset.hospRdHotelFilter;renderBalances();return;}
  },true);
  window.addEventListener('input',(e)=>{if(e.target.matches('#hospRdHoteis [data-hosp-rd-search="hoteis"]')){e.stopImmediatePropagation();balance.search=e.target.value;renderBalances();}},true);
}
function watchDocumentFeedback(){const wait=setInterval(()=>{const feedback=$('#hospV2DocumentFeedback');if(!feedback)return;clearInterval(wait);payment.proofObserver=new MutationObserver(()=>{if(payment.pendingProof&&String(feedback.textContent||'').includes('Documento anexado com sucesso.'))setTimeout(confirmAfterProof,200);});payment.proofObserver.observe(feedback,{childList:true,subtree:true,characterData:true});},100);setTimeout(()=>clearInterval(wait),15000);}
function watchUi(){const wait=setInterval(()=>{const root=$('#hospRedesignRoot');if(!root)return;clearInterval(wait);balance.observerRoot=$('#hospRdHoteis');balance.observer=new MutationObserver(()=>setTimeout(async()=>{await loadBalances();renderBalances();patchPaymentModal();},80));connectBalanceObserver();refreshBalances();const pageObserver=new MutationObserver(()=>patchPaymentModal());pageObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});patchPaymentModal();},80);setTimeout(()=>clearInterval(wait),15000);}
async function init(){injectStyles();bindEvents();watchDocumentFeedback();watchUi();console.info(`[hosp-pagamento-saldo-hotfix] ativo ${VERSION}`);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
