// Módulo Hotel — Fase 1: casca + painel somente-leitura contra o banco real.
// Reconstrução em fases depois da PR #274 (zerou o módulo antigo). Continua
// servindo #alojamentos com a casca mínima (o conteúdo de verdade é montado
// por adm-hotel-alojamentos-v2.js e companhia, via adm-hotel-deferred.js).
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { ensureStyles, tabGroup, normalizeText, buildCotacaoMessage, toast, nightsBetween, esc, brDate, money } from './adm-hotel-helpers.js';
import {
  renderShellAlojamentos, renderTabsBar, renderTable, renderDetalhes,
  renderCotacoesSection, renderHoteisPicker, renderPickerList,
  renderReservarForm, renderQuartosBox, renderQuartosSummaryText,
  renderAgruparPicker, renderEstenderForm,
  renderCheckoutForm, renderExtrasBox, renderExtrasTotalText, renderDiferencaForm,
  renderFinanceiroShell, renderFinanceiroQueue,
  renderFluxoBoard, renderHotelExtrato,
} from './adm-hotel-view.js';

function currentMode() {
  const hash = String(location.hash || '').toLowerCase();
  if (hash.includes('financeiro')) return 'financeiro';
  if (hash.includes('aloj')) return 'alojamentos';
  return 'hoteis';
}

const state = {
  rows: [], hotels: [], people: [], assignments: [], links: [], quotes: [], finance: [], documents: [],
  advances: [], advanceMoves: [], checkoutLots: [],
  v3Items: [], v3Changes: [], v3Checkout: [], v3Payments: [], v3Installments: [],
  loading: false, error: null, loaded: false,
  activeTab: 'todas', openKpi: null,
  v3Filters: { status:'',date:'',city:'',person:'',supervision:'' },
};

const picker = {
  open: false,
  solicitacaoId: null,
  query: '',
  selected: new Set(),
  sending: false,
};

const reservar = {
  open: false,
  solicitacaoId: null,
  selectedHotelId: '',
  selectedQuote: null,
  quartos: [],
  assignments: new Map(),
  saving: false,
};

const checkout = {
  open: false,
  solicitacaoId: null,
  reservaId: null,
  selected: new Set(),
  extras: [],
  saving: false,
};

const financeiro = {
  loaded: false,
  loading: false,
  items: [],
};

let contentEl = null;
let quotesChannel = null;

function visibleRows() {
  if (state.activeTab === 'todas' || state.activeTab === 'fluxo') return state.rows;
  return state.rows.filter((r) => tabGroup(r) === state.activeTab);
}

function renderTabsAndWire() {
  const el = document.getElementById('ahTabs');
  if (!el) return;
  el.innerHTML = renderTabsBar(state.rows, state.activeTab, state.openKpi);
  el.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      state.activeTab = b.dataset.tab;
      state.openKpi = null;
      renderAll();
    });
  });
  el.querySelectorAll('.ah-kpi-arrow').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = a.dataset.kpi;
      state.openKpi = state.openKpi === key ? null : key;
      renderTabsAndWire();
    });
  });
}

const V3_LABELS = { AGUARDANDO:'Aguardando',EM_COTACAO:'Em cotação',AGUARDANDO_HOTEL:'Aguardando hotel',RESERVADO:'Reservado',ALTERACAO_PENDENTE:'Alteração pendente',CHECKOUT_PENDENTE:'Checkout pendente',CHECKOUT:'Checkout',RECUSADO:'Recusado' };

function renderV3Queue() {
  const f=state.v3Filters;
  const items = state.v3Items.filter((i) => i.status_item !== 'CANCELADO'
    && (!f.status||i.status_item===f.status) && (!f.date||i.data_checkin_prevista===f.date)
    && (!f.city||normalizeText(`${i.cidade} ${i.uf}`).includes(normalizeText(f.city)))
    && (!f.person||normalizeText(i.nome_colaborador).includes(normalizeText(f.person)))
    && (!f.supervision||normalizeText(i.supervisao).includes(normalizeText(f.supervision))));
  if (!items.length) return '';
  return `<style>.ah-v3-head,.ah-v3-item{display:grid;align-items:center;gap:12px}.ah-v3-head{grid-template-columns:1fr auto;margin-bottom:14px}.ah-v3-head h3{margin:3px 0}.ah-v3-filters{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px;margin-bottom:12px}.ah-v3-list{display:grid;gap:8px}.ah-v3-item{grid-template-columns:24px minmax(170px,1.2fr) minmax(180px,1fr) minmax(145px,.8fr) auto;padding:12px;border:1px solid var(--line);border-radius:12px}.ah-v3-item small,.ah-v3-status{display:block;margin-top:4px}.ah-v3-actions{display:flex;gap:6px}.ah-v3-actions .btn{width:auto;padding:7px 10px}.ah-v3-status{font-size:11px;font-weight:800;text-transform:uppercase}.ah-v3-modal-list{display:grid;gap:7px;padding:10px;border:1px solid var(--line);border-radius:10px}@media(max-width:900px){.ah-v3-filters{grid-template-columns:1fr 1fr}.ah-v3-item{grid-template-columns:24px 1fr}.ah-v3-actions{grid-column:2;flex-wrap:wrap}}</style><section class="card ah-v3" style="margin-bottom:16px"><div class="ah-v3-head"><div><span class="ah-eyebrow">NOVO FLUXO</span><h3>Solicitações por colaborador</h3></div><span>${items.length} item(ns)</span></div>
    <div class="ah-v3-filters"><select data-v3-filter="status"><option value="">Todos os status</option>${Object.entries(V3_LABELS).map(([v,l])=>`<option value="${v}" ${f.status===v?'selected':''}>${l}</option>`).join('')}</select><input data-v3-filter="date" type="date" value="${esc(f.date)}"><input data-v3-filter="city" placeholder="Cidade/UF" value="${esc(f.city)}"><input data-v3-filter="person" placeholder="Colaborador" value="${esc(f.person)}"><input data-v3-filter="supervision" placeholder="Supervisão" value="${esc(f.supervision)}"></div>
    <div class="ah-v3-list">${items.map((i) => `<article class="ah-v3-item">
      <label class="ah-v3-check"><input type="checkbox" data-v3-select="${esc(i.item_id)}" ${['AGUARDANDO','EM_COTACAO'].includes(i.status_item) ? '' : 'disabled'}></label>
      <div><b>${esc(i.nome_colaborador)}</b><small>${esc(i.supervisao || 'Sem supervisão')} · ${esc(i.sexo === 'FEMININO' ? 'Feminino' : i.sexo === 'MASCULINO' ? 'Masculino' : 'Sexo pendente')}</small></div>
      <div><b>${esc(i.cidade)}/${esc(i.uf)}</b><small>${brDate(i.data_checkin_prevista)} ${esc(String(i.horario_chegada_previsto || '').slice(0,5))} · ${i.quantidade_diarias_prevista} diária(s)</small></div>
      <div><span class="ah-v3-status s-${esc(i.status_item)}">${esc(V3_LABELS[i.status_item] || i.status_item)}</span>${i.hotel ? `<small>${esc(i.hotel)} · ${esc(i.codigo_operacional || '')}</small>` : ''}</div>
      <div class="ah-v3-actions">${['AGUARDANDO','EM_COTACAO'].includes(i.status_item) ? `<button class="btn btn-secondary" data-v3-cotar="${esc(i.item_id)}">Cotar</button><button class="btn btn-primary" data-v3-reservar="${esc(i.item_id)}">Reservar</button><button class="btn btn-ghost" data-v3-recusar="${esc(i.item_id)}">Recusar</button>` : ''}${i.status_item === 'RESERVADO' ? `<button class="btn btn-secondary" data-v3-extra="${esc(i.reserva_id)}">Despesa extra</button><button class="btn btn-secondary" data-v3-payment="${esc(i.reserva_id)}">Pagamento</button>` : ''}${i.status_item === 'CHECKOUT_PENDENTE' ? `<span class="muted">Aguardando confirmações</span>` : ''}</div>
    </article>`).join('')}</div>
    ${state.v3Checkout.filter((d)=>d.status==='AGUARDANDO_ADM').map((d)=>`<div class="hosp-note">Hotel confirmou ${esc(d.decisao || 'checkout')} · <button class="btn btn-primary" data-v3-validate-checkout="${esc(d.id)}">Validar e concluir</button></div>`).join('')}
    ${state.v3Changes.map((a)=>`<div class="hosp-note">Alteração ${esc(a.tipo)} aguardando tratamento · ${brDate(a.solicitada_em)} ${['PRORROGACAO','CANCELAMENTO'].includes(a.tipo)&&a.status==='AGUARDANDO_ADM'?`<button class="btn btn-primary" data-v3-handle-change="${esc(a.id)}">Enviar ao hotel</button>`:''}${['MUDANCA_DATAS','MUDANCA_CIDADE'].includes(a.tipo)&&a.status==='AGUARDANDO_ADM'?`<button class="btn btn-primary" data-v3-new-change-reservation="${esc(a.id)}">Criar nova reserva</button>`:''}</div>`).join('')}
    </section>`;
}

function selectedV3Ids(fallback) {
  const ids = [...document.querySelectorAll('[data-v3-select]:checked')].map((el) => el.dataset.v3Select);
  return ids.length ? ids : [fallback];
}

function v3EligibleTogether(base, candidate) {
  return base.cidade === candidate.cidade && base.uf === candidate.uf && candidate.data_checkin_prevista < base.data_checkout_prevista && candidate.data_checkout_prevista > base.data_checkin_prevista && ['AGUARDANDO','EM_COTACAO'].includes(candidate.status_item);
}

function openV3Action(kind, itemId) {
  const base = state.v3Items.find((i) => i.item_id === itemId);
  if (!base) return;
  const preselected = new Set(selectedV3Ids(itemId));
  const candidates = state.v3Items.filter((i) => v3EligibleTogether(base,i));
  const hotels = state.hotels.filter((h) => h.status !== 'INATIVO');
  modalRoot().innerHTML = `<div class="ah-overlay"><div class="ah-modal"><header><div><span class="ah-eyebrow">${kind === 'quote' ? 'COTAÇÃO' : 'RESERVA'}</span><h2>${esc(base.cidade)}/${esc(base.uf)}</h2></div><button class="ah-x" data-v3-close>×</button></header>
    <div class="ah-body"><div class="ds-field"><label>Colaboradores</label><div class="ah-v3-modal-list">${candidates.map((i) => `<label><input type="checkbox" data-v3-modal-item value="${esc(i.item_id)}" ${preselected.has(i.item_id) ? 'checked' : ''}> ${esc(i.nome_colaborador)} · ${brDate(i.data_checkin_prevista)}–${brDate(i.data_checkout_prevista)} · ${esc(i.sexo)}</label>`).join('')}</div></div>
    <div class="ds-field"><label>Hotel *</label><select id="v3Hotel"><option value="">Selecione</option>${hotels.map((h) => `<option value="${esc(h.id)}">${esc(h.nome)} — ${esc(h.cidade || '')}/${esc(h.uf || '')}</option>`).join('')}</select><button type="button" class="btn btn-secondary" data-v3-new-hotel style="margin-top:8px">Cadastrar novo hotel</button></div>
    ${kind === 'reserve' ? `<div class="ds-field"><label>Valor da diária *</label><input id="v3Daily" type="number" min="0" step="0.01"></div><div class="ds-field"><label>Composição dos quartos *</label><textarea id="v3Rooms" rows="4" placeholder="Ex.: 2 quartos duplos masculino, R$ 180 por quarto"></textarea></div><button class="btn btn-secondary" data-v3-suggest>Sugerir menor custo</button>` : ''}
    <p class="ah-error" id="v3Error"></p></div><footer><button class="btn btn-secondary" data-v3-close>Cancelar</button><button class="btn btn-primary" data-v3-confirm>${kind === 'quote' ? 'Enviar cotação' : 'Solicitar reserva ao hotel'}</button></footer></div></div>`;
  modalRoot().querySelectorAll('[data-v3-close]').forEach((b) => b.onclick = () => { modalRoot().innerHTML=''; });
  modalRoot().querySelector('[data-v3-new-hotel]').onclick = () => createV3Hotel(base,kind,itemId);
  modalRoot().querySelector('[data-v3-suggest]')?.addEventListener('click', () => suggestRooms(candidates.filter((i) => modalRoot().querySelector(`[data-v3-modal-item][value="${i.item_id}"]`)?.checked)));
  modalRoot().querySelector('[data-v3-confirm]').onclick = () => submitV3Action(kind,base.solicitacao_id);
}

async function createV3Hotel(base,kind,itemId) {
  const nome=window.prompt('Nome do hotel:')?.trim(); if(!nome)return;
  const whatsapp=window.prompt('WhatsApp do hotel com DDD:')?.trim(); if(!whatsapp)return;
  const link=window.prompt('Link de localização do hotel:')?.trim(); if(!link)return;
  const {error}=await supabase.from('hospedagem_hoteis').insert({nome,cidade:base.cidade,uf:base.uf,whatsapp,link_maps:link,status:'ATIVO',recebe_cotacao:true});
  if(error)return toast(error.message,'err');
  toast('Hotel cadastrado.','ok'); await loadPainel(); openV3Action(kind,itemId);
}

function suggestRooms(items) {
  const groups = ['MASCULINO','FEMININO'].map((sexo) => ({ sexo, total: items.filter((i) => i.sexo === sexo).length })).filter((g) => g.total);
  const lines = groups.map((g) => g.total === 1 ? `1 quarto individual ${g.sexo.toLowerCase()}` : `${Math.floor(g.total/4)} quarto(s) quádruplo(s)${g.total%4 ? ` + 1 quarto para ${g.total%4}` : ''} ${g.sexo.toLowerCase()}`);
  const el=modalRoot().querySelector('#v3Rooms'); if(el) el.value=lines.join('\n');
}

async function submitV3Action(kind,solicitacaoId) {
  const root=modalRoot(); const itemIds=[...root.querySelectorAll('[data-v3-modal-item]:checked')].map((e)=>e.value); const hotelId=root.querySelector('#v3Hotel')?.value;
  if(!itemIds.length||!hotelId){ root.querySelector('#v3Error').textContent='Selecione colaboradores e hotel.'; return; }
  let result;
  if(kind==='quote') result=await supabase.rpc('hospedagem_v3_iniciar_cotacao',{p_solicitacao_id:solicitacaoId,p_item_ids:itemIds,p_hotel_ids:[hotelId]});
  else {
    const daily=Number(root.querySelector('#v3Daily')?.value); const text=root.querySelector('#v3Rooms')?.value.trim();
    if(!Number.isFinite(daily)||daily<0||!text){ root.querySelector('#v3Error').textContent='Informe valor e composição dos quartos.'; return; }
    const selected=state.v3Items.filter((i)=>itemIds.includes(i.item_id));
    const quartos=[];for(const [sexo,genero] of [['MASCULINO','MASC'],['FEMININO','FEM']]){let total=selected.filter((i)=>i.sexo===sexo).length;while(total>0){let cap;if(total===1)cap=1;else if(total%4===1)cap=3;else cap=Math.min(4,total);const tipo={1:'INDIVIDUAL',2:'DUPLO',3:'TRIPLO',4:'QUADRUPLO'}[cap];quartos.push({tipo_quarto:tipo,quantidade:1,genero,capacidade:cap,valor_diaria:daily,descricao:text});total-=cap;}}
    result=await supabase.rpc('hospedagem_v3_solicitar_reserva',{p_solicitacao_id:solicitacaoId,p_hotel_id:hotelId,p_item_ids:itemIds,p_valor_diaria:daily,p_quartos:quartos,p_cotacao_id:null});
  }
  if(result.error){ root.querySelector('#v3Error').textContent=result.error.message; return; }
  root.innerHTML=''; toast(kind==='quote'?'Cotação enviada ao hotel.':'Pedido enviado; o status mudará após confirmação do hotel.','ok'); await loadPainel();
}

function wireV3Queue(board) {
  board.querySelectorAll('[data-v3-filter]').forEach((el)=>el.onchange=()=>{state.v3Filters[el.dataset.v3Filter]=el.value;renderBoard();});
  board.querySelectorAll('[data-v3-cotar]').forEach((b)=>b.onclick=()=>openV3Action('quote',b.dataset.v3Cotar));
  board.querySelectorAll('[data-v3-reservar]').forEach((b)=>b.onclick=()=>openV3Action('reserve',b.dataset.v3Reservar));
  board.querySelectorAll('[data-v3-recusar]').forEach((b)=>b.onclick=async()=>{ const motivo=window.prompt('Informe o motivo obrigatório da recusa:'); if(!motivo?.trim()) return; const {error}=await supabase.rpc('hospedagem_v3_recusar_item',{p_item_id:b.dataset.v3Recusar,p_motivo:motivo.trim()}); if(error)return toast(error.message,'err'); toast('Solicitação recusada e gestor notificado.','ok'); await loadPainel(); });
  board.querySelectorAll('[data-v3-payment]').forEach((b)=>b.onclick=()=>openV3Payment(b.dataset.v3Payment));
  board.querySelectorAll('[data-v3-extra]').forEach((b)=>b.onclick=()=>openV3Extra(b.dataset.v3Extra));
  board.querySelectorAll('[data-v3-validate-checkout]').forEach((b)=>b.onclick=async()=>{ const {error}=await supabase.rpc('hospedagem_v3_validar_checkout',{p_decisao_id:b.dataset.v3ValidateCheckout}); if(error)return toast(error.message,'err'); toast('Checkout validado.','ok'); await loadPainel(); });
  board.querySelectorAll('[data-v3-handle-change]').forEach((b)=>b.onclick=async()=>{const {error}=await supabase.rpc('hospedagem_v3_tratar_alteracao',{p_alteracao_id:b.dataset.v3HandleChange});if(error)return toast(error.message,'err');toast('Alteração enviada ao hotel.','ok');await loadPainel();});
  board.querySelectorAll('[data-v3-new-change-reservation]').forEach((b)=>b.onclick=async()=>{const {data,error}=await supabase.rpc('hospedagem_v3_preparar_nova_reserva_alteracao',{p_alteracao_id:b.dataset.v3NewChangeReservation});if(error)return toast(error.message,'err');await loadPainel();openV3Action('reserve',data.item_id);});
}

function openV3Extra(reservaId) {
  const people=state.v3Items.filter((i)=>i.reserva_id===reservaId);
  modalRoot().innerHTML=`<div class="ah-overlay"><form class="ah-modal" id="v3ExtraForm"><header><div><span class="ah-eyebrow">DESPESA EXTRA</span><h2>Conferir cobrança do hotel</h2></div><button type="button" class="ah-x" data-v3-close>×</button></header><div class="ah-body"><div class="ds-field"><label>Descrição *</label><input id="v3ExtraDesc" required></div><div class="ds-field"><label>Valor total *</label><input id="v3ExtraValue" type="number" min="0.01" step="0.01" required></div><p class="muted">Informe abaixo a parte indevida que deve ir ao caixa de cada colaborador. O restante será somado ao pagamento do hotel.</p>${people.map((p)=>`<div class="ds-field"><label>${esc(p.nome_colaborador)}</label><input data-v3-extra-split="${esc(p.item_id)}" type="number" min="0" step="0.01" value="0"></div>`).join('')}<p class="ah-error" id="v3ExtraError"></p></div><footer><button type="button" class="btn btn-secondary" data-v3-close>Cancelar</button><button class="btn btn-primary">Registrar</button></footer></form></div>`;
  modalRoot().querySelectorAll('[data-v3-close]').forEach((b)=>b.onclick=()=>{modalRoot().innerHTML='';});
  modalRoot().querySelector('#v3ExtraForm').onsubmit=async(e)=>{e.preventDefault();const root=modalRoot();const value=Number(root.querySelector('#v3ExtraValue').value);const rateios=[...root.querySelectorAll('[data-v3-extra-split]')].map((i)=>({item_id:i.dataset.v3ExtraSplit,valor:Number(i.value||0)})).filter((r)=>r.valor>0);if(rateios.reduce((s,r)=>s+r.valor,0)>value){root.querySelector('#v3ExtraError').textContent='O rateio não pode superar o valor total.';return;}const {error}=await supabase.rpc('hospedagem_v3_registrar_extra',{p_reserva_id:reservaId,p_descricao:root.querySelector('#v3ExtraDesc').value,p_valor:value,p_rateios:rateios});if(error){root.querySelector('#v3ExtraError').textContent=error.message;return;}root.innerHTML='';toast('Despesa extra registrada e rateada.','ok');await loadPainel();};
}

function openV3Payment(reservaId) {
  const existing=state.v3Payments.find((p)=>p.reserva_id===reservaId);
  const fields=existing
    ? `<div class="hosp-note">Total ${money(existing.valor_total)} · pago ${money(existing.valor_pago)} · saldo ${money(existing.saldo)} · ${esc(existing.status)}</div><div class="ds-field"><label>Valor desta parcela *</label><input id="v3PartValue" type="number" min="0.01" max="${esc(existing.saldo)}" step="0.01" required></div><div class="ds-field"><label>Data do pagamento *</label><input id="v3PartDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="ds-field"><label>Comprovante *</label><input id="v3PartProof" type="file" accept="application/pdf,image/*" required></div><div class="ds-field"><label>Responsável</label><select id="v3PartSector"><option value="ADM">ADM/Hospedagem</option><option value="FINANCEIRO">Financeiro</option></select></div>`
    : `<div class="ds-field"><label>Forma *</label><select id="v3PayMethod"><option value="PIX">PIX</option><option value="BOLETO">Boleto</option></select></div><div class="ds-field"><label>Valor total, incluindo extras *</label><input id="v3PayTotal" type="number" min="0.01" step="0.01" required></div><div class="ds-field"><label>Chave PIX</label><input id="v3PayPix"></div><div class="ds-field"><label>URL do boleto PDF</label><input id="v3PayBoleto" type="url"></div><div class="ds-field"><label>Vencimento</label><input id="v3PayDue" type="date"></div><label><input id="v3PayFinance" type="checkbox"> Enviar ao Financeiro agora</label>`;
  modalRoot().innerHTML=`<div class="ah-overlay"><form class="ah-modal" id="v3PaymentForm"><header><div><span class="ah-eyebrow">FINANCEIRO</span><h2>${existing?'Registrar pagamento':'Novo lançamento consolidado'}</h2></div><button type="button" class="ah-x" data-v3-close>×</button></header><div class="ah-body">${fields}<p class="ah-error" id="v3PayError"></p></div><footer><button type="button" class="btn btn-secondary" data-v3-close>Cancelar</button><button class="btn btn-primary">${existing?'Registrar parcela':'Criar lançamento'}</button></footer></form></div>`;
  modalRoot().querySelectorAll('[data-v3-close]').forEach((b)=>b.onclick=()=>{modalRoot().innerHTML='';});
  modalRoot().querySelector('#v3PaymentForm').onsubmit=async(e)=>{e.preventDefault();const root=modalRoot();let error;
    if(existing){const file=root.querySelector('#v3PartProof').files?.[0];if(!file)return;const path=`v3/comprovantes/${existing.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const up=await supabase.storage.from('hospedagem-documentos').upload(path,file,{upsert:false});if(up.error){error=up.error;}else{const signed=await supabase.storage.from('hospedagem-documentos').createSignedUrl(path,60*60*24*7);const result=await supabase.rpc('hospedagem_v3_registrar_parcela',{p_pagamento_id:existing.id,p_valor:Number(root.querySelector('#v3PartValue').value),p_data:root.querySelector('#v3PartDate').value,p_comprovante_url:signed.data?.signedUrl||path,p_setor:root.querySelector('#v3PartSector').value});error=result.error;}}
    else{const result=await supabase.rpc('hospedagem_v3_criar_pagamento',{p_reserva_id:reservaId,p_forma:root.querySelector('#v3PayMethod').value,p_valor:Number(root.querySelector('#v3PayTotal').value),p_chave_pix:root.querySelector('#v3PayPix').value||null,p_boleto_url:root.querySelector('#v3PayBoleto').value||null,p_linha_digitavel:null,p_vencimento:root.querySelector('#v3PayDue').value||null,p_enviar_financeiro:root.querySelector('#v3PayFinance').checked});error=result.error;}
    if(error){root.querySelector('#v3PayError').textContent=error.message;return;}root.innerHTML='';toast(existing?'Pagamento registrado e comprovante enviado ao hotel.':'Lançamento de hospedagem criado.','ok');await loadPainel();};
}

function renderBoard() {
  const board = document.getElementById('ahBoard');
  if (!board) return;
  if (state.activeTab === 'fluxo') {
    if (state.loading) {
      board.innerHTML = '<div class="card ah-empty">Carregando...</div>';
      return;
    }
    board.innerHTML = renderFluxoBoard(hotelLedger());
    board.querySelectorAll('[data-open-extrato]').forEach((b) => {
      b.addEventListener('click', () => openHotelExtrato(b.dataset.openExtrato));
    });
    return;
  }
  if (state.loading) {
    board.innerHTML = '<div class="card ah-empty">Carregando...</div>';
    return;
  }
  if (state.error) {
    board.innerHTML = `<div class="card ah-empty ah-error">Erro ao carregar: ${state.error}</div>`;
    return;
  }
  board.innerHTML = `${renderV3Queue()}${renderTable(visibleRows().filter((r) => Number(r.fluxo_versao || 2) !== 3))}`;
  board.querySelectorAll('[data-open]').forEach((b) => {
    b.addEventListener('click', () => openDetalhes(b.dataset.open));
  });
  wireV3Queue(board);
}

function renderAll() {
  renderTabsAndWire();
  renderBoard();
}

async function loadPainel() {
  state.loading = true;
  state.error = null;
  renderAll();
  const [painel, itens, alteracoes, decisoes, pagamentos, parcelas] = await Promise.all([
    supabase.rpc('hospedagem_carregar_painel_v2'),
    supabase.from('hospedagem_v3_itens').select('*').neq('status_item','CANCELADO').order('data_checkin_prevista').order('horario_chegada_previsto').order('solicitado_em'),
    supabase.from('hospedagem_alteracoes').select('*').in('status',['AGUARDANDO_ADM','ENVIADA_HOTEL']).order('created_at'),
    supabase.from('hospedagem_checkout_decisoes').select('*').in('status',['AGUARDANDO_GESTOR','SEM_RESPOSTA','AGUARDANDO_HOTEL','AGUARDANDO_ADM']).order('data_checkout_prevista'),
    supabase.from('hospedagem_pagamentos_v3').select('*').neq('status','CANCELADO').order('created_at',{ascending:false}),
    supabase.from('hospedagem_pagamento_parcelas').select('*').order('created_at',{ascending:false}),
  ]);
  const { data, error } = painel;
  state.loading = false;
  if (error) {
    state.error = error.message;
    renderAll();
    return;
  }
  state.rows = data?.rows || [];
  state.hotels = data?.hotels || [];
  state.people = data?.people || [];
  state.assignments = data?.assignments || [];
  state.links = data?.links || [];
  state.quotes = data?.quotes || [];
  state.finance = data?.finance || [];
  state.documents = data?.documents || [];
  state.advances = data?.advances || [];
  state.advanceMoves = data?.advanceMoves || [];
  state.checkoutLots = data?.checkoutLots || [];
  state.v3Items = itens.data || [];
  state.v3Changes = alteracoes.data || [];
  state.v3Checkout = decisoes.data || [];
  state.v3Payments = pagamentos.data || [];
  state.v3Installments = parcelas.data || [];
  state.loaded = true;
  renderAll();
}

function findRow(solicitacaoId) {
  return state.rows.find((r) => r.solicitacao_id === solicitacaoId);
}

function modalRoot() {
  let root = document.getElementById('ahModalRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ahModalRoot';
    document.body.appendChild(root);
  }
  return root;
}

function subscribeQuotes(solicitacaoId) {
  unsubscribeQuotes();
  quotesChannel = supabase
    .channel(`ah-cotacoes-${solicitacaoId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'hospedagem_cotacoes', filter: `solicitacao_id=eq.${solicitacaoId}`,
    }, (payload) => {
      const changed = (payload.new && Object.keys(payload.new).length) ? payload.new : payload.old;
      if (!changed) return;
      if (payload.eventType === 'DELETE') {
        state.quotes = state.quotes.filter((q) => q.id !== changed.id);
      } else {
        const idx = state.quotes.findIndex((q) => q.id === changed.id);
        if (idx >= 0) state.quotes[idx] = changed; else state.quotes.push(changed);
      }
      refreshCotacoesBox(solicitacaoId);
    })
    .subscribe();
}

function unsubscribeQuotes() {
  if (quotesChannel) {
    supabase.removeChannel(quotesChannel);
    quotesChannel = null;
  }
}

function refreshCotacoesBox(solicitacaoId) {
  const box = document.getElementById('ahCotacoesBox');
  if (!box) return;
  const quotesForRow = state.quotes.filter((q) => q.solicitacao_id === solicitacaoId);
  box.innerHTML = renderCotacoesSection(findRow(solicitacaoId) || {}, quotesForRow);
  wireCotacoesBox();
}

function wireCotacoesBox() {
  document.querySelectorAll('[data-use-quote]').forEach((b) => {
    b.addEventListener('click', () => useQuote(b.dataset.useQuote));
  });
}

async function useQuote(quoteId) {
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return;
  const solicitacaoId = quote.solicitacao_id;
  const others = state.quotes.filter((q) => q.solicitacao_id === solicitacaoId && q.id !== quoteId && q.selecionada);

  const { error } = await supabase
    .from('hospedagem_cotacoes')
    .update({ selecionada: true, selecionada_em: new Date().toISOString() })
    .eq('id', quoteId);
  if (error) {
    toast(`Erro ao selecionar cotação: ${error.message}`, 'err');
    return;
  }
  if (others.length) {
    await supabase.from('hospedagem_cotacoes').update({ selecionada: false }).in('id', others.map((q) => q.id));
  }
  quote.selecionada = true;
  quote.selecionada_em = new Date().toISOString();
  others.forEach((q) => { q.selecionada = false; });
  refreshCotacoesBox(solicitacaoId);
  toast('Cotação selecionada — a reserva será feita na Fase 3.');
}

function openDetalhes(solicitacaoId) {
  const row = findRow(solicitacaoId);
  if (!row) return;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderDetalhes(row, state.quotes)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDetalhes));
  const cotarBtn = root.querySelector('[data-cotar]');
  if (cotarBtn) cotarBtn.addEventListener('click', () => openPicker(solicitacaoId));
  const reservarBtn = root.querySelector('[data-reservar]');
  if (reservarBtn) reservarBtn.addEventListener('click', () => openReservar(solicitacaoId));
  const agruparBtn = root.querySelector('[data-agrupar]');
  if (agruparBtn) agruparBtn.addEventListener('click', () => openAgrupar(solicitacaoId));
  const estenderBtn = root.querySelector('[data-estender]');
  if (estenderBtn) estenderBtn.addEventListener('click', () => openEstender(solicitacaoId));
  const checkoutBtn = root.querySelector('[data-checkout]');
  if (checkoutBtn) checkoutBtn.addEventListener('click', () => openCheckout(solicitacaoId));
  const diferencaBtn = root.querySelector('[data-diferenca]');
  if (diferencaBtn) diferencaBtn.addEventListener('click', () => openDiferenca(solicitacaoId));
  wireCotacoesBox();
  subscribeQuotes(solicitacaoId);
}

function closeDetalhes() {
  const root = document.getElementById('ahModalRoot');
  if (root) root.innerHTML = '';
  unsubscribeQuotes();
}

function hotelsForPicker() {
  return state.hotels.filter((h) => h.recebe_cotacao && h.whatsapp);
}

function sortedHotelsForPicker(row) {
  const uf = String(row?.uf || '').toUpperCase();
  return hotelsForPicker().sort((a, b) => {
    const am = String(a.uf || '').toUpperCase() === uf ? 0 : 1;
    const bm = String(b.uf || '').toUpperCase() === uf ? 0 : 1;
    if (am !== bm) return am - bm;
    return String(a.nome || '').localeCompare(String(b.nome || ''));
  });
}

function openPicker(solicitacaoId) {
  picker.open = true;
  picker.solicitacaoId = solicitacaoId;
  picker.query = '';
  picker.selected = new Set();
  picker.sending = false;
  renderPicker();
}

function renderPicker() {
  const row = findRow(picker.solicitacaoId);
  if (!row) return;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderHoteisPicker(row, picker.query)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-picker]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelector('[data-back-detalhes]')?.addEventListener('click', () => openDetalhes(row.solicitacao_id));
  const search = document.getElementById('ahPickerSearch');
  if (search) {
    search.addEventListener('input', () => {
      picker.query = search.value;
      renderPickerListBox(row);
    });
  }
  document.getElementById('ahPickerConfirm')?.addEventListener('click', () => confirmCotar(row));
  renderPickerListBox(row);
}

function renderPickerListBox(row) {
  const list = document.getElementById('ahPickerList');
  if (!list) return;
  list.innerHTML = renderPickerList(sortedHotelsForPicker(row), picker.query, picker.selected);
  list.querySelectorAll('[data-hotel-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.hotelId;
      if (cb.checked) picker.selected.add(id); else picker.selected.delete(id);
      updateConfirmButton();
    });
  });
  updateConfirmButton();
}

function updateConfirmButton() {
  const btn = document.getElementById('ahPickerConfirm');
  if (!btn) return;
  const n = picker.selected.size;
  btn.textContent = picker.sending ? 'Enviando...' : `Cotar em lote (${n})`;
  btn.disabled = n === 0 || picker.sending;
}

async function advanceStatusEmCotacao(row) {
  if (row.status_solicitacao !== 'SOLICITADA' && row.status_solicitacao !== 'EM_ANALISE') return;
  const { error } = await supabase
    .from('hospedagem_solicitacoes')
    .update({ status_solicitacao: 'EM_COTACAO' })
    .eq('id', row.solicitacao_id);
  if (!error) row.status_solicitacao = 'EM_COTACAO';
}

async function confirmCotar(row) {
  if (picker.sending || picker.selected.size === 0) return;
  picker.sending = true;
  updateConfirmButton();

  const hotels = state.hotels.filter((h) => picker.selected.has(h.id));
  const message = buildCotacaoMessage(row);
  let ok = 0;
  let fail = 0;

  for (const hotel of hotels) {
    const { data, error } = await supabase.functions.invoke('botconversa-send', {
      body: { phone: hotel.whatsapp, message, nome: hotel.nome },
    });
    const sentOk = !error && data?.ok;
    const payload = {
      solicitacao_id: row.solicitacao_id,
      hotel_id: hotel.id,
      hotel_nome: hotel.nome,
      status: sentOk ? 'ENVIADA' : 'FALHA',
      mensagem_enviada: message,
      erro_envio: sentOk ? null : (data?.error || error?.message || 'Falha ao enviar'),
      enviado_em: new Date().toISOString(),
      quantidade_pessoas: row.total_colaboradores ?? null,
      diarias_previstas: row.quantidade_diarias_prevista ?? null,
    };
    const { data: saved, error: saveErr } = await supabase
      .from('hospedagem_cotacoes')
      .upsert(payload, { onConflict: 'solicitacao_id,hotel_id' })
      .select()
      .single();
    if (!saveErr && saved) {
      const idx = state.quotes.findIndex((q) => q.id === saved.id);
      if (idx >= 0) state.quotes[idx] = saved; else state.quotes.push(saved);
    }
    if (sentOk) ok += 1; else fail += 1;
  }

  picker.sending = false;
  await advanceStatusEmCotacao(row);
  toast(fail === 0 ? `${ok} cotação(ões) enviada(s).` : `${ok} enviada(s), ${fail} falharam.`, fail === 0 ? 'ok' : 'err');
  renderAll();
  openDetalhes(row.solicitacao_id);
}

function peopleForRow(solicitacaoId) {
  return state.people.filter((p) => p.solicitacao_id === solicitacaoId);
}

function newQuarto() {
  const localId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `q-${Date.now()}-${Math.random()}`;
  return { localId, tipoQuarto: 'INDIVIDUAL', genero: '', valorDiaria: 0 };
}

function sortedAllHotels(row) {
  const uf = String(row?.uf || '').toUpperCase();
  return state.hotels.slice().sort((a, b) => {
    const am = String(a.uf || '').toUpperCase() === uf ? 0 : 1;
    const bm = String(b.uf || '').toUpperCase() === uf ? 0 : 1;
    if (am !== bm) return am - bm;
    return String(a.nome || '').localeCompare(String(b.nome || ''));
  });
}

function openReservar(solicitacaoId) {
  const row = findRow(solicitacaoId);
  if (!row) return;
  const selectedQuote = state.quotes.find((q) => q.solicitacao_id === solicitacaoId && q.selecionada) || null;
  const firstQuarto = newQuarto();
  if (selectedQuote?.valor_diaria != null) firstQuarto.valorDiaria = selectedQuote.valor_diaria;
  reservar.open = true;
  reservar.solicitacaoId = solicitacaoId;
  reservar.selectedHotelId = selectedQuote?.hotel_id || '';
  reservar.selectedQuote = selectedQuote;
  reservar.quartos = [firstQuarto];
  reservar.assignments = new Map();
  reservar.saving = false;
  renderReservar();
}

function renderReservar() {
  const row = findRow(reservar.solicitacaoId);
  if (!row) return;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderReservarForm(row, sortedAllHotels(row), reservar.selectedHotelId)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-reservar]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelector('[data-back-detalhes-resv]')?.addEventListener('click', () => openDetalhes(row.solicitacao_id));

  const hotelSelect = document.getElementById('ahResvHotel');
  if (hotelSelect) hotelSelect.addEventListener('change', () => { reservar.selectedHotelId = hotelSelect.value; });

  document.getElementById('ahResvCheckin')?.addEventListener('change', updateQuartosSummary);
  document.getElementById('ahResvCheckout')?.addEventListener('change', updateQuartosSummary);

  if (reservar.selectedQuote) {
    const cafeEl = document.getElementById('ahResvCafe');
    if (cafeEl) cafeEl.checked = Boolean(reservar.selectedQuote.cafe_incluso);
    const estEl = document.getElementById('ahResvEstacionamento');
    if (estEl) estEl.checked = Boolean(reservar.selectedQuote.estacionamento_incluso);
  }

  document.getElementById('ahResvConfirm')?.addEventListener('click', () => confirmReservar(row));

  renderQuartosBoxUI();
}

function renderQuartosBoxUI() {
  const box = document.getElementById('ahResvQuartosBox');
  if (!box) return;
  const checkin = document.getElementById('ahResvCheckin')?.value || '';
  const checkout = document.getElementById('ahResvCheckout')?.value || '';
  const people = peopleForRow(reservar.solicitacaoId);
  box.innerHTML = renderQuartosBox(reservar.quartos, people, reservar.assignments, checkin, checkout);
  wireQuartosBox();
}

function updateQuartosSummary() {
  const el = document.getElementById('ahResvSummary');
  if (!el) return;
  const checkin = document.getElementById('ahResvCheckin')?.value || '';
  const checkout = document.getElementById('ahResvCheckout')?.value || '';
  el.textContent = renderQuartosSummaryText(reservar.quartos, checkin, checkout);
}

function wireQuartosBox() {
  document.querySelectorAll('[data-quarto-field]').forEach((el) => {
    const field = el.dataset.quartoField;
    const id = el.dataset.quartoId;
    const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      const quarto = reservar.quartos.find((q) => q.localId === id);
      if (!quarto) return;
      quarto[field] = field === 'valorDiaria' ? Number(el.value || 0) : el.value;
      if (field === 'tipoQuarto') renderQuartosBoxUI();
      else if (field === 'valorDiaria') updateQuartosSummary();
    });
  });
  document.querySelectorAll('[data-remove-quarto]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.removeQuarto;
      reservar.quartos = reservar.quartos.filter((q) => q.localId !== id);
      reservar.assignments.forEach((quartoId, personId) => {
        if (quartoId === id) reservar.assignments.delete(personId);
      });
      renderQuartosBoxUI();
    });
  });
  document.querySelector('[data-add-quarto]')?.addEventListener('click', () => {
    reservar.quartos.push(newQuarto());
    renderQuartosBoxUI();
  });
  document.querySelectorAll('[data-assign-person]').forEach((chip) => {
    chip.addEventListener('click', () => {
      cycleAssignment(chip.dataset.assignPerson);
      renderQuartosBoxUI();
    });
  });
}

function cycleAssignment(personId) {
  if (!reservar.quartos.length) return;
  const current = reservar.assignments.get(personId);
  if (!current) {
    reservar.assignments.set(personId, reservar.quartos[0].localId);
    return;
  }
  const idx = reservar.quartos.findIndex((q) => q.localId === current);
  if (idx === -1 || idx === reservar.quartos.length - 1) {
    reservar.assignments.delete(personId);
  } else {
    reservar.assignments.set(personId, reservar.quartos[idx + 1].localId);
  }
}

function reservarFieldValue(id) {
  return document.getElementById(id)?.value || '';
}

async function confirmReservar(row) {
  if (reservar.saving) return;
  const errorBox = document.getElementById('ahResvErrorBox');
  if (errorBox) errorBox.textContent = '';

  const hotelId = reservarFieldValue('ahResvHotel');
  const checkin = reservarFieldValue('ahResvCheckin');
  const checkout = reservarFieldValue('ahResvCheckout');

  if (!hotelId) return showReservarError('Selecione um hotel.');
  if (!checkin || !checkout) return showReservarError('Informe check-in e check-out.');
  if (checkout < checkin) return showReservarError('Check-out não pode ser antes do check-in.');
  if (reservar.quartos.length === 0) return showReservarError('Adicione pelo menos um quarto.');

  const hotel = state.hotels.find((h) => h.id === hotelId);
  const nights = nightsBetween(checkin, checkout);
  const somaDiarias = reservar.quartos.reduce((s, q) => s + Number(q.valorDiaria || 0), 0);

  reservar.saving = true;
  const confirmBtn = document.getElementById('ahResvConfirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Salvando...'; }

  const { data: reserva, error: reservaErr } = await supabase
    .from('hospedagem_reservas')
    .insert({
      solicitacao_id: row.solicitacao_id,
      hotel_id: hotelId,
      nome_hotel: hotel?.nome || null,
      cidade_hotel: hotel?.cidade || null,
      uf_hotel: hotel?.uf || null,
      valor_diaria: somaDiarias,
      quantidade_diarias: nights,
      quantidade_quartos: reservar.quartos.length,
      tipo_quarto: reservar.quartos[0]?.tipoQuarto || 'INDIVIDUAL',
      valor_total_previsto: somaDiarias * nights,
      data_checkin: checkin,
      data_checkout: checkout,
      horario_chegada: reservarFieldValue('ahResvHorario') || null,
      inclui_cafe: document.getElementById('ahResvCafe')?.checked || false,
      inclui_almoco: document.getElementById('ahResvAlmoco')?.checked || false,
      inclui_janta: document.getElementById('ahResvJanta')?.checked || false,
      estacionamento: document.getElementById('ahResvEstacionamento')?.checked || false,
      confirmado_com: reservarFieldValue('ahResvConfirmadoCom') || null,
      contato_confirmacao: reservarFieldValue('ahResvContato') || null,
      codigo_reserva_hotel: reservarFieldValue('ahResvCodigo') || null,
    })
    .select()
    .single();

  if (reservaErr || !reserva) {
    reservar.saving = false;
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirmar reserva'; }
    return showReservarError(`Erro ao criar reserva: ${reservaErr?.message || 'falha desconhecida'}`);
  }

  const { error: linkErr } = await supabase
    .from('hospedagem_reserva_solicitacoes')
    .insert({ reserva_id: reserva.id, solicitacao_id: row.solicitacao_id });
  if (linkErr) {
    reservar.saving = false;
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirmar reserva'; }
    return showReservarError(`Reserva criada, mas falhou ao vincular a solicitação: ${linkErr.message}`);
  }

  const quartoIdByLocal = new Map();
  for (const q of reservar.quartos) {
    const { data: savedQuarto, error: quartoErr } = await supabase
      .from('hospedagem_reserva_quartos')
      .insert({
        reserva_id: reserva.id,
        quantidade: 1,
        tipo_quarto: q.tipoQuarto,
        genero: q.genero || null,
        valor_diaria: q.valorDiaria || 0,
      })
      .select()
      .single();
    if (quartoErr || !savedQuarto) {
      toast(`Aviso: falha ao gravar um dos quartos (${quartoErr?.message || 'erro'}).`, 'err');
      continue;
    }
    quartoIdByLocal.set(q.localId, savedQuarto.id);
  }

  const people = peopleForRow(row.solicitacao_id);
  if (people.length) {
    const assignRows = people.map((p) => ({
      reserva_id: reserva.id,
      solicitacao_colaborador_id: p.id,
      status: 'HOSPEDADO',
      reserva_quarto_id: quartoIdByLocal.get(reservar.assignments.get(p.id)) || null,
    }));
    const { error: assignErr } = await supabase.from('hospedagem_reserva_colaboradores').insert(assignRows);
    if (assignErr) toast(`Aviso: falha ao alocar colaboradores na reserva: ${assignErr.message}`, 'err');
  }

  await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'RESERVADA' }).eq('id', row.solicitacao_id);

  reservar.saving = false;
  reservar.open = false;
  toast('Reserva criada com sucesso.');
  const solicitacaoId = row.solicitacao_id;
  await loadPainel();
  openDetalhes(solicitacaoId);
}

function showReservarError(message) {
  const errorBox = document.getElementById('ahResvErrorBox');
  if (errorBox) errorBox.textContent = message;
  toast(message, 'err');
}

// Reservas ativas (não canceladas/checkout já realizado) em outras solicitações
// na mesma cidade/UF — regra de Agrupar definida pelo usuário: "é como se já
// houvesse 1 reserva, e vai entrar mais uma pessoa".
function activeReservasForGroup(row) {
  const uf = String(row.uf || '').toUpperCase();
  const cidade = normalizeText(row.cidade);
  const seen = new Map();
  state.rows.forEach((r) => {
    if (!r.reserva_id || r.solicitacao_id === row.solicitacao_id) return;
    if (String(r.uf || '').toUpperCase() !== uf || normalizeText(r.cidade) !== cidade) return;
    if (r.status_hospedagem === 'CANCELADA' || r.status_hospedagem === 'CHECKOUT_REALIZADO') return;
    if (!seen.has(r.reserva_id)) seen.set(r.reserva_id, r);
  });
  return [...seen.values()];
}

function openAgrupar(solicitacaoId) {
  const row = findRow(solicitacaoId);
  if (!row) return;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderAgruparPicker(row, activeReservasForGroup(row))}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-agrupar]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelector('[data-back-detalhes-agrupar]')?.addEventListener('click', () => openDetalhes(solicitacaoId));
  root.querySelectorAll('[data-agrupar-reserva]').forEach((b) => {
    b.addEventListener('click', () => agruparReserva(row, b.dataset.agruparReserva));
  });
}

async function agruparReserva(row, reservaId) {
  const { error: linkErr } = await supabase
    .from('hospedagem_reserva_solicitacoes')
    .insert({ reserva_id: reservaId, solicitacao_id: row.solicitacao_id });
  if (linkErr) {
    toast(`Erro ao agrupar: ${linkErr.message}`, 'err');
    return;
  }

  const people = peopleForRow(row.solicitacao_id);
  if (people.length) {
    const assignRows = people.map((p) => ({
      reserva_id: reservaId,
      solicitacao_colaborador_id: p.id,
      status: 'HOSPEDADO',
    }));
    const { error: assignErr } = await supabase.from('hospedagem_reserva_colaboradores').insert(assignRows);
    if (assignErr) toast(`Aviso: falha ao adicionar colaboradores na reserva: ${assignErr.message}`, 'err');
  }

  await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'RESERVADA' }).eq('id', row.solicitacao_id);

  toast('Solicitação agrupada na reserva existente.');
  const solicitacaoId = row.solicitacao_id;
  await loadPainel();
  openDetalhes(solicitacaoId);
}

function openEstender(solicitacaoId) {
  const row = findRow(solicitacaoId);
  if (!row) return;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderEstenderForm(row)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-estender]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelector('[data-back-detalhes-estender]')?.addEventListener('click', () => openDetalhes(solicitacaoId));
  document.getElementById('ahExtConfirm')?.addEventListener('click', () => confirmEstender(row));
}

async function confirmEstender(row) {
  const errorBox = document.getElementById('ahExtErrorBox');
  if (errorBox) errorBox.textContent = '';

  const novoCheckout = document.getElementById('ahExtCheckout')?.value || '';
  if (!novoCheckout || novoCheckout <= row.data_checkout) {
    const msg = 'A nova data de check-out precisa ser depois da atual.';
    if (errorBox) errorBox.textContent = msg;
    toast(msg, 'err');
    return;
  }

  const confirmBtn = document.getElementById('ahExtConfirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Salvando...'; }

  const nights = nightsBetween(row.data_checkin, novoCheckout);
  const novoTotal = Number(row.valor_diaria || 0) * nights;

  const { error: reservaErr } = await supabase
    .from('hospedagem_reservas')
    .update({ data_checkout: novoCheckout, quantidade_diarias: nights, valor_total_previsto: novoTotal })
    .eq('id', row.reserva_id);
  if (reservaErr) {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirmar extensão'; }
    const msg = `Erro ao estender: ${reservaErr.message}`;
    if (errorBox) errorBox.textContent = msg;
    toast(msg, 'err');
    return;
  }

  const solicitacaoIds = state.rows.filter((r) => r.reserva_id === row.reserva_id).map((r) => r.solicitacao_id);
  if (solicitacaoIds.length) {
    const { error: solErr } = await supabase
      .from('hospedagem_solicitacoes')
      .update({ data_checkout_prevista: novoCheckout })
      .in('id', solicitacaoIds);
    if (solErr) toast(`Aviso: reserva estendida, mas falhou ao atualizar alguma solicitação: ${solErr.message}`, 'err');
  }

  toast('Hospedagem estendida.');
  const solicitacaoId = row.solicitacao_id;
  await loadPainel();
  openDetalhes(solicitacaoId);
}

// Colaboradores de uma reserva, filtrados por status (HOSPEDADO/CHECKOUT/CANCELADO)
// via hospedagem_reserva_colaboradores, com o nome resolvido em state.people.
function colaboradoresForReserva(reservaId, statuses) {
  return state.assignments
    .filter((a) => a.reserva_id === reservaId && (!statuses || statuses.includes(a.status)))
    .map((a) => ({
      id: a.solicitacao_colaborador_id,
      nome: state.people.find((p) => p.id === a.solicitacao_colaborador_id)?.nome_colaborador || 'Não informado',
    }));
}

function newExtra() {
  const localId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `e-${Date.now()}-${Math.random()}`;
  return { localId, tipo: 'adicional', descricao: '', valor: 0 };
}

function openCheckout(solicitacaoId) {
  const row = findRow(solicitacaoId);
  if (!row || !row.reserva_id) return;
  const colaboradores = colaboradoresForReserva(row.reserva_id, ['HOSPEDADO']);
  checkout.open = true;
  checkout.solicitacaoId = solicitacaoId;
  checkout.reservaId = row.reserva_id;
  checkout.selected = new Set(colaboradores.map((c) => c.id));
  checkout.extras = [];
  checkout.saving = false;
  renderCheckout();
}

function renderCheckout() {
  const row = findRow(checkout.solicitacaoId);
  if (!row) return;
  const colaboradores = colaboradoresForReserva(checkout.reservaId, ['HOSPEDADO']);
  const valorDiarias = row.valor_total_previsto ?? row.valor_diaria ?? 0;
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderCheckoutForm(row, colaboradores, checkout.selected, valorDiarias)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-checkout]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelector('[data-back-detalhes-checkout]')?.addEventListener('click', () => openDetalhes(row.solicitacao_id));
  root.querySelectorAll('[data-colaborador-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.colaboradorId;
      if (cb.checked) checkout.selected.add(id); else checkout.selected.delete(id);
      const count = document.getElementById('ahCkoColabCount');
      if (count) count.textContent = `${checkout.selected.size}/${colaboradores.length}`;
    });
  });
  document.getElementById('ahCkoConfirm')?.addEventListener('click', () => confirmCheckout(row));
  renderExtrasBoxUI();
}

function renderExtrasBoxUI() {
  const box = document.getElementById('ahCkoExtrasBox');
  if (!box) return;
  box.innerHTML = renderExtrasBox(checkout.extras);
  wireExtrasBox();
}

function wireExtrasBox() {
  document.querySelectorAll('[data-extra-field]').forEach((el) => {
    const field = el.dataset.extraField;
    const id = el.dataset.extraId;
    const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      const extra = checkout.extras.find((x) => x.localId === id);
      if (!extra) return;
      extra[field] = field === 'valor' ? Number(el.value || 0) : el.value;
      if (field === 'tipo') {
        renderExtrasBoxUI();
      } else if (field === 'valor') {
        const label = document.getElementById('ahCkoExtrasLabel');
        if (label) label.textContent = renderExtrasTotalText(checkout.extras);
      }
    });
  });
  document.querySelectorAll('[data-remove-extra]').forEach((b) => {
    b.addEventListener('click', () => {
      checkout.extras = checkout.extras.filter((x) => x.localId !== b.dataset.removeExtra);
      renderExtrasBoxUI();
    });
  });
  document.querySelector('[data-add-extra]')?.addEventListener('click', () => {
    checkout.extras.push(newExtra());
    renderExtrasBoxUI();
  });
}

function showCheckoutError(message) {
  const errorBox = document.getElementById('ahCkoErrorBox');
  if (errorBox) errorBox.textContent = message;
  toast(message, 'err');
}

async function confirmCheckout(row) {
  if (checkout.saving) return;
  const errorBox = document.getElementById('ahCkoErrorBox');
  if (errorBox) errorBox.textContent = '';

  if (checkout.selected.size === 0) return showCheckoutError('Selecione ao menos um colaborador.');
  const valorDiarias = Number(document.getElementById('ahCkoValorDiarias')?.value || 0);
  if (valorDiarias < 0) return showCheckoutError('Valor das diárias inválido.');

  const colaboradores = colaboradoresForReserva(checkout.reservaId, ['HOSPEDADO'])
    .filter((c) => checkout.selected.has(c.id))
    .map((c) => ({ solicitacao_colaborador_id: c.id, nome_colaborador: c.nome }));
  const extrasPayload = checkout.extras
    .filter((e) => Number(e.valor || 0) > 0)
    .map((e) => ({ tipo: e.tipo, valor: Number(e.valor), descricao: e.descricao || null }));
  const observacoes = document.getElementById('ahCkoObservacoes')?.value || null;

  checkout.saving = true;
  const confirmBtn = document.getElementById('ahCkoConfirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Processando...'; }

  const { error } = await supabase.rpc('hospedagem_realizar_checkout', {
    p_reserva_id: checkout.reservaId,
    p_colaboradores: colaboradores,
    p_valor_diarias: valorDiarias,
    p_extras: extrasPayload,
    p_observacoes: observacoes,
  });

  checkout.saving = false;
  if (error) {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirmar check-out'; }
    return showCheckoutError(`Erro ao realizar check-out: ${error.message}`);
  }

  toast('Check-out realizado e enviado ao Financeiro.');
  const solicitacaoId = row.solicitacao_id;
  await loadPainel();
  openDetalhes(solicitacaoId);
}

function openDiferenca(solicitacaoId) {
  const row = findRow(solicitacaoId);
  if (!row || !row.reserva_id) return;
  const colaboradores = colaboradoresForReserva(row.reserva_id, null);
  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderDiferencaForm(row, colaboradores)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-diferenca]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelector('[data-back-detalhes-diferenca]')?.addEventListener('click', () => openDetalhes(solicitacaoId));
  document.getElementById('ahDifConfirm')?.addEventListener('click', () => confirmDiferenca(row));
}

async function confirmDiferenca(row) {
  const errorBox = document.getElementById('ahDifErrorBox');
  if (errorBox) errorBox.textContent = '';

  const solicitacaoColaboradorId = document.getElementById('ahDifColaborador')?.value || '';
  const valor = Number(document.getElementById('ahDifValor')?.value || 0);
  const observacoes = document.getElementById('ahDifObs')?.value || null;

  if (!solicitacaoColaboradorId) {
    const msg = 'Selecione o colaborador.';
    if (errorBox) errorBox.textContent = msg;
    toast(msg, 'err');
    return;
  }
  if (!(valor > 0)) {
    const msg = 'Informe um valor maior que zero.';
    if (errorBox) errorBox.textContent = msg;
    toast(msg, 'err');
    return;
  }

  const confirmBtn = document.getElementById('ahDifConfirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Salvando...'; }

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('hospedagem_diferencas_colaborador').insert({
    reserva_id: row.reserva_id,
    solicitacao_colaborador_id: solicitacaoColaboradorId,
    valor,
    observacoes,
    criado_por: userData?.user?.id || null,
  });

  if (error) {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Registrar diferença'; }
    const msg = `Erro ao registrar diferença: ${error.message}`;
    if (errorBox) errorBox.textContent = msg;
    toast(msg, 'err');
    return;
  }

  toast('Diferença registrada no caixa do colaborador.');
  const solicitacaoId = row.solicitacao_id;
  openDetalhes(solicitacaoId);
}

async function loadFinanceiroQueue() {
  financeiro.loading = true;
  renderFinanceiroBoard();
  const { data, error } = await supabase
    .from('financeiro_pagamentos')
    .select('id, descricao, favorecido_nome, valor, status, competencia, comprovante_url, hospedagem_checkout_lote_id, created_at')
    .eq('origem_setor', 'HOSPEDAGEM')
    .in('status', ['PENDENTE', 'EM_ANALISE'])
    .order('created_at', { ascending: false });
  financeiro.loading = false;
  if (error) {
    financeiro.items = [];
    financeiro.loaded = true;
    financeiro.error = error.message;
    renderFinanceiroBoard();
    return;
  }
  financeiro.items = data || [];
  financeiro.loaded = true;
  financeiro.error = null;
  renderFinanceiroBoard();
}

function renderFinanceiroBoard() {
  const board = document.getElementById('ahFinBoard');
  if (!board) return;
  if (financeiro.loading) {
    board.innerHTML = '<div class="card ah-empty">Carregando...</div>';
    return;
  }
  if (financeiro.error) {
    board.innerHTML = `<div class="card ah-empty ah-error">Erro ao carregar: ${financeiro.error}</div>`;
    return;
  }
  board.innerHTML = renderFinanceiroQueue(financeiro.items);
  board.querySelectorAll('[data-confirmar-pagamento]').forEach((b) => {
    b.addEventListener('click', () => confirmarPagamento(b.dataset.confirmarPagamento));
  });
}

// Chamada compartilhada entre a fila do Financeiro e o extrato por hotel (Fase 7)
// — os dois usam os mesmos data-attributes (data-fin-field/data-fin-id) nos inputs.
async function submitConfirmarPagamento(loteId, onSuccess) {
  if (!loteId) {
    toast('Este pagamento não tem um lote de check-out vinculado — confirme em Financeiro > Pagamentos.', 'err');
    return;
  }
  const valorInput = document.querySelector(`[data-fin-field="valorPago"][data-fin-id="${loteId}"]`);
  const comprovanteInput = document.querySelector(`[data-fin-field="comprovante"][data-fin-id="${loteId}"]`);
  const valorPago = Number(valorInput?.value || 0);
  const comprovanteUrl = comprovanteInput?.value?.trim() || null;

  if (!(valorPago >= 0)) {
    toast('Valor pago inválido.', 'err');
    return;
  }

  const btn = document.querySelector(`[data-confirmar-pagamento="${loteId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Confirmando...'; }

  const { error } = await supabase.rpc('hospedagem_confirmar_pagamento_lote', {
    p_lote_id: loteId,
    p_valor_pago: valorPago,
    p_comprovante_url: comprovanteUrl,
  });

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar pagamento'; }
    toast(`Erro ao confirmar pagamento: ${error.message}`, 'err');
    return;
  }

  toast('Pagamento confirmado.');
  await onSuccess();
}

async function confirmarPagamento(loteId) {
  await submitConfirmarPagamento(loteId, loadFinanceiroQueue);
}

async function confirmarPagamentoExtrato(loteId, hotelId) {
  await submitConfirmarPagamento(loteId, async () => {
    await loadPainel();
    openHotelExtrato(hotelId);
  });
}

// Saldo real por hotel: soma o que ainda está devido (hospedagem_financeiro,
// exceto lotes já PAGO) e o crédito disponível (hospedagem_adiantamentos com
// status DISPONIVEL) — substitui o "saldo" simulado do protótipo original.
function hotelLedger() {
  const reservaHotel = new Map();
  state.rows.forEach((r) => { if (r.reserva_id && r.hotel_id) reservaHotel.set(r.reserva_id, r.hotel_id); });

  const byHotel = new Map();
  function ensure(hotelId) {
    if (!byHotel.has(hotelId)) {
      const h = state.hotels.find((x) => x.id === hotelId);
      byHotel.set(hotelId, {
        hotelId, nome: h?.nome || 'Hotel', cidade: h?.cidade || '', uf: h?.uf || '',
        saldoDevido: 0, creditoDisponivel: 0, hasActivity: false,
      });
    }
    return byHotel.get(hotelId);
  }

  state.finance.forEach((f) => {
    const hotelId = reservaHotel.get(f.reserva_id);
    if (!hotelId) return;
    const entry = ensure(hotelId);
    entry.hasActivity = true;
    if (f.status_financeiro !== 'PAGO') entry.saldoDevido += Number(f.saldo || 0);
  });

  state.advances.forEach((a) => {
    if (!a.hotel_id) return;
    const entry = ensure(a.hotel_id);
    entry.hasActivity = true;
    if (a.status === 'DISPONIVEL') entry.creditoDisponivel += Number(a.saldo || 0);
  });

  return [...byHotel.values()].filter((h) => h.hasActivity).sort((a, b) => b.saldoDevido - a.saldoDevido);
}

function groupReservasForHotel(hotelId) {
  const seen = new Map();
  state.rows.forEach((r) => {
    if (r.hotel_id !== hotelId || !r.reserva_id) return;
    if (!seen.has(r.reserva_id)) seen.set(r.reserva_id, r);
  });
  return [...seen.values()].sort((a, b) => new Date(b.data_checkin || 0) - new Date(a.data_checkin || 0));
}

async function fetchPendingPaymentsForLots(loteIds) {
  if (loteIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('financeiro_pagamentos')
    .select('id, valor, status, hospedagem_checkout_lote_id')
    .in('hospedagem_checkout_lote_id', loteIds)
    .in('status', ['PENDENTE', 'EM_ANALISE']);
  if (error) return new Map();
  const map = new Map();
  (data || []).forEach((p) => map.set(p.hospedagem_checkout_lote_id, p));
  return map;
}

function openHotelExtrato(hotelId) {
  const root = modalRoot();
  root.innerHTML = '<div class="ah-overlay" id="ahOverlay"><div class="ah-modal"><div class="ah-modal-body"><div class="ah-empty">Carregando extrato...</div></div></div></div>';
  document.getElementById('ahOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'ahOverlay') closeDetalhes();
  });
  renderHotelExtratoAsync(hotelId);
}

async function renderHotelExtratoAsync(hotelId) {
  const hotelData = hotelLedger().find((h) => h.hotelId === hotelId);
  if (!hotelData) return;
  const reservas = groupReservasForHotel(hotelId);
  const lots = state.checkoutLots
    .filter((l) => l.hotel_id === hotelId)
    .sort((a, b) => new Date(b.data_checkout || 0) - new Date(a.data_checkout || 0));
  const advances = state.advances.filter((a) => a.hotel_id === hotelId);
  const advanceIds = new Set(advances.map((a) => a.id));
  const moves = state.advanceMoves
    .filter((m) => advanceIds.has(m.adiantamento_id))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const pendingByLote = await fetchPendingPaymentsForLots(lots.map((l) => l.id));

  const root = modalRoot();
  root.innerHTML = `<div class="ah-overlay" id="ahOverlay">${renderHotelExtrato(hotelData, reservas, lots, pendingByLote, advances, moves)}</div>`;
  const overlay = document.getElementById('ahOverlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDetalhes(); });
  root.querySelectorAll('[data-close-extrato]').forEach((b) => b.addEventListener('click', closeDetalhes));
  root.querySelectorAll('[data-confirmar-pagamento]').forEach((b) => {
    b.addEventListener('click', () => confirmarPagamentoExtrato(b.dataset.confirmarPagamento, hotelId));
  });
}

document.addEventListener('click', (e) => {
  if (state.openKpi && !e.target.closest('.ah-tab-wrap')) {
    state.openKpi = null;
    renderTabsAndWire();
  }
});

function renderHoteisShell() {
  contentEl.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Hospedagem</div>
        <h2>Hotéis</h2>
        <p>Cotação, reserva, pagamento e histórico de hospedagem em hotel.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">HOTELARIA</span></div>
    </section>
    <div class="ah-tabs" id="ahTabs"></div>
    <div id="ahBoard"></div>
  `;
  renderAll();
  if (!state.loaded && !state.loading) loadPainel();
}

function renderFinanceiroPage() {
  contentEl.innerHTML = renderFinanceiroShell();
  if (!financeiro.loaded && !financeiro.loading) {
    loadFinanceiroQueue();
  } else {
    renderFinanceiroBoard();
  }
}

function setPageTitle(mode) {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = mode === 'alojamentos' ? 'Alojamentos' : mode === 'financeiro' ? 'Confirmação de Pagamento' : 'Hotéis';
}

export function renderContent(content) {
  ensureStyles();
  contentEl = content;
  const mode = currentMode();
  setPageTitle(mode);
  if (mode === 'alojamentos') {
    content.innerHTML = renderShellAlojamentos();
  } else if (mode === 'financeiro') {
    renderFinanceiroPage();
  } else {
    renderHoteisShell();
  }
}

window.addEventListener('hashchange', () => {
  if (!contentEl) return;
  renderContent(contentEl);
});

initProtectedPage('Hospedagem', renderContent);
