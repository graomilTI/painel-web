import { supabase } from '../../supabaseClient.js';
import { ICON, aoClicarCard, cardFiltro, sincronizarCards } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';

const state = { rows: [], filter: 'pendente', search: '', loading: false, mounted: false };
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const brDate = (value) => { const [year,month,day] = String(value || '').slice(0,10).split('-'); return year && month && day ? `${day}/${month}/${year}` : '—'; };
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS = {
  pendente: 'Solicitado', em_cotacao: 'Em cotação', em_analise: 'Em análise',
  pendente_pagamento: 'Pendente pagamento', aguardando_nf: 'Aguardando NF',
  comprado: 'Comprado', recusado: 'Recusado', recusado_financeiro: 'Recusado',
};

function group(status) {
  const key = norm(status).replaceAll(' ', '_');
  if (key === 'pendente') return 'pendente';
  if (key === 'comprado') return 'comprado';
  if (['recusado','recusado_financeiro','cancelado'].includes(key)) return 'recusado';
  return 'andamento';
}

function targetName(request) {
  const first = String(request?.observacoes || '').split(/\r?\n/).find(Boolean) || '';
  return first.replace(/^alojamento\s*:\s*/i, '').trim() || 'Alojamento não informado';
}

function panelHtml() {
  return `<section class="aloj-buy-panel" id="alojBuyPanel">
    <div class="fm-topo"><div class="fm-head-actions"><button type="button" class="fm-btn soft" id="alojBuyRefresh">↻ Atualizar</button></div></div>
    <p class="fm-prazo-dia" style="margin:0">Solicitações enviadas pelos gestores para beliches, camas, lençóis, prateleiras e demais itens dos alojamentos.</p>
    <div class="fm-kpis" id="alojBuyKpis"></div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar"><div class="fm-search">${ICON.busca}<input class="fm-input" id="alojBuySearch" type="search" placeholder="Buscar alojamento, gestor ou item..." autocomplete="off"></div><span data-chip></span><span class="fm-count" id="alojBuyCount">0 item(ns)</span></div>
      <div class="aloj-buy-list" id="alojBuyList"><div class="fm-empty">Carregando solicitações...</div></div>
    </div></div>
    <div class="aloj-buy-modal" id="alojBuyModal" aria-hidden="true"></div>
  </section>`;
}

const ETAPAS = [
  ['pendente', 'Solicitações', 'amber', 'relogio'],
  ['andamento', 'Em andamento', 'blue', 'doc'],
  ['comprado', 'Comprados', 'green', 'ok'],
  ['recusado', 'Recusados', 'red', 'erro'],
];

function cardsHtml() {
  const contagem = (key) => state.rows.filter((row) => group(row.status) === key).length;
  return cardFiltro({ filtro: 'todos', label: 'Todas', tone: 'blue', icone: 'total', valor: String(state.rows.length), ativo: state.filter === 'todos' })
    + ETAPAS.map(([key, label, tone, icone]) => cardFiltro({ filtro: key, label, tone, icone, valor: String(contagem(key)), ativo: state.filter === key })).join('');
}

function ensureStyles() {
  if ($('#alojBuyStyles')) return;
  const style = document.createElement('style');
  style.id = 'alojBuyStyles';
  style.textContent = `
    .aloj-buy-panel{display:none}.aloj-v2-shell.aloj-buy-mode>.aloj-buy-panel{display:grid;gap:14px}
    .aloj-buy-list{display:grid;gap:12px}.aloj-buy-card{overflow:hidden;border:1px solid rgba(74,222,128,.16);border-radius:17px;background:linear-gradient(145deg,rgba(7,25,18,.96),rgba(3,15,11,.98))}.aloj-buy-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.1)}.aloj-buy-card-head h4{margin:0;color:#f0fff6;font-size:15px}.aloj-buy-card-head p{margin:4px 0 0;color:#82978c;font-size:11px}.aloj-buy-location{color:#87eab2;font-size:11px;font-weight:900;text-align:right}.aloj-buy-items{display:grid}.aloj-buy-item{display:grid;grid-template-columns:minmax(0,1fr) 120px auto;gap:14px;align-items:center;padding:13px 16px}.aloj-buy-item+.aloj-buy-item{border-top:1px solid rgba(148,163,184,.09)}.aloj-buy-item-main{display:grid;gap:3px}.aloj-buy-item-main strong{color:#e9f7ef;font-size:13px}.aloj-buy-item-main small{color:#82978c}.aloj-buy-value{color:#c9f9da;font-weight:900;text-align:right}.aloj-buy-side{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.aloj-buy-status{display:inline-flex;border-radius:999px;padding:5px 8px;background:rgba(202,138,4,.12);color:#fde68a;font-size:9px;font-weight:1000;text-transform:uppercase}.aloj-buy-status.comprado{background:rgba(22,101,52,.25);color:#86efac}.aloj-buy-status.recusado,.aloj-buy-status.recusado_financeiro{background:rgba(127,29,29,.22);color:#fecaca}.aloj-buy-action{border:1px solid rgba(74,222,128,.2);border-radius:9px;background:rgba(22,101,52,.12);color:#bdf7d3;padding:7px 9px;font-size:10px;font-weight:900;cursor:pointer}.aloj-buy-action.danger{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.14);color:#fecaca}.aloj-buy-empty{padding:42px;border:1px dashed rgba(148,163,184,.16);border-radius:17px;color:#82978c;text-align:center}
    .aloj-buy-modal{position:fixed;inset:0;z-index:10020;display:none;place-items:center;padding:18px;background:rgba(0,8,5,.82);backdrop-filter:blur(8px)}.aloj-buy-modal.open{display:grid}.aloj-buy-modal-card{width:min(560px,100%);border:1px solid rgba(74,222,128,.25);border-radius:22px;background:linear-gradient(150deg,#0c281c,#05140e);box-shadow:0 30px 90px rgba(0,0,0,.55);overflow:hidden}.aloj-buy-modal-head{display:flex;justify-content:space-between;gap:15px;padding:20px;border-bottom:1px solid rgba(148,163,184,.12)}.aloj-buy-modal-head h3{margin:0;color:#f0fff6}.aloj-buy-modal-head p{margin:5px 0 0;color:#88a094;font-size:12px}.aloj-buy-close{border:0;background:transparent;color:#9eb3a8;font-size:25px;cursor:pointer}.aloj-buy-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:20px}.aloj-buy-field{display:grid;gap:5px}.aloj-buy-field.full{grid-column:1/-1}.aloj-buy-field label{color:#90a69b;font-size:10px;font-weight:900;text-transform:uppercase}.aloj-buy-field input,.aloj-buy-field select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.17);border-radius:11px;background:#061610;color:#e6f3ec;padding:10px}.aloj-buy-modal-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;padding:15px 20px;border-top:1px solid rgba(148,163,184,.1)}.aloj-buy-feedback{margin-right:auto;color:#fecaca;font-size:11px;font-weight:800}
    @media(max-width:760px){.aloj-buy-item{grid-template-columns:1fr}.aloj-buy-value{text-align:left}.aloj-buy-side{justify-content:flex-start}.aloj-buy-form{grid-template-columns:1fr}.aloj-buy-field.full{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

function flattenRequests(requests) {
  return (requests || []).flatMap((request) => (request.compras_itens || []).map((item) => ({ ...item, request })));
}

async function loadRows() {
  if (state.loading) return;
  state.loading = true;
  const list = $('#alojBuyList');
  if (list) list.innerHTML = '<div class="fm-empty">Carregando solicitações...</div>';
  const { data, error } = await supabase.from('compras_solicitacoes').select('*, compras_itens(*)').eq('tipo_solicitacao','Alojamento').order('created_at',{ ascending: false }).limit(300);
  state.loading = false;
  if (error) {
    if (list) list.innerHTML = `<div class="aloj-buy-empty">${esc(error.message || 'Não foi possível carregar as compras.')}</div>`;
    return;
  }
  state.rows = flattenRequests(data);
  render();
}

function filteredRows() {
  const query = norm(state.search);
  return state.rows.filter((row) => {
    if (state.filter !== 'todos' && group(row.status) !== state.filter) return false;
    if (!query) return true;
    const request = row.request || {};
    return norm([row.material,row.tamanho,request.solicitante,request.cidade,request.uf,targetName(request)].join(' ')).includes(query);
  });
}

function itemActions(row) {
  const status = norm(row.status).replaceAll(' ','_');
  if (status === 'pendente') return `<button class="aloj-buy-action" data-aloj-buy-quote="${esc(row.id)}" type="button">Iniciar cotação</button><button class="aloj-buy-action danger" data-aloj-buy-reject="${esc(row.id)}" type="button">Recusar</button>`;
  if (!['comprado','recusado','recusado_financeiro'].includes(status)) return `<button class="aloj-buy-action" data-aloj-buy-purchase="${esc(row.id)}" type="button">Registrar compra</button><button class="aloj-buy-action danger" data-aloj-buy-reject="${esc(row.id)}" type="button">Recusar</button>`;
  return '';
}

function cardHtml(rows) {
  const request = rows[0].request || {};
  return `<article class="aloj-buy-card">
    <div class="aloj-buy-card-head"><div><h4>${esc(targetName(request))}</h4><p>${esc(request.solicitante || 'Gestor')} · ${brDate(request.data_solicitacao)}${request.observacoes ? ` · ${esc(String(request.observacoes).split(/\r?\n/).slice(1).join(' '))}` : ''}</p></div><div class="aloj-buy-location">${esc(request.cidade || '—')}${request.uf ? `/${esc(request.uf)}` : ''}</div></div>
    <div class="aloj-buy-items">${rows.map((row) => `<div class="aloj-buy-item"><div class="aloj-buy-item-main"><strong>${esc(row.quantidade || row.unidade || 1)}x ${esc(row.material)}</strong><small>${esc(row.tamanho || 'Sem especificação')}</small></div><div class="aloj-buy-value">${Number(row.valor_total || 0) ? money(row.valor_total) : '—'}</div><div class="aloj-buy-side"><span class="aloj-buy-status ${esc(norm(row.status).replaceAll(' ','_'))}">${esc(STATUS[norm(row.status).replaceAll(' ','_')] || row.status)}</span>${itemActions(row)}</div></div>`).join('')}</div>
  </article>`;
}

function render() {
  const list = $('#alojBuyList');
  if (!list) return;
  const rows = filteredRows();
  const groups = new Map();
  rows.forEach((row) => { const key = row.solicitacao_id || row.id; if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(row); });
  list.innerHTML = groups.size ? [...groups.values()].map(cardHtml).join('') : '<div class="fm-empty">Nenhuma solicitação neste filtro.</div>';
  const kpis = $('#alojBuyKpis');
  if (kpis) kpis.innerHTML = cardsHtml();
  const count = $('#alojBuyCount');
  if (count) count.textContent = `${rows.length} item(ns)`;
  const painel = $('#alojBuyPanel');
  if (painel) sincronizarCards(painel, state.filter);
  const pending = state.rows.filter((row) => group(row.status) === 'pendente').length;
  const badge = $('#alojBuyPendingBadge');
  if (badge) { badge.textContent = pending ? String(pending) : ''; badge.hidden = !pending; }
}

async function updateItem(id, values) {
  const { error } = await supabase.from('compras_itens').update(values).eq('id',id);
  if (error) throw error;
  await loadRows();
}

function closeModal() { const modal = $('#alojBuyModal'); modal?.classList.remove('open'); modal?.setAttribute('aria-hidden','true'); }

function openPurchase(row) {
  const modal = $('#alojBuyModal');
  modal.innerHTML = `<div class="aloj-buy-modal-card"><div class="aloj-buy-modal-head"><div><h3>Registrar compra</h3><p>${esc(row.quantidade || row.unidade || 1)}x ${esc(row.material)} · ${esc(targetName(row.request))}</p></div><button class="aloj-buy-close" type="button" aria-label="Fechar">×</button></div><form class="aloj-buy-form" id="alojBuyPurchaseForm"><div class="aloj-buy-field full"><label>Fornecedor *</label><input id="alojBuySupplier" required></div><div class="aloj-buy-field"><label>Valor unitário *</label><input id="alojBuyUnitValue" type="number" min="0.01" step="0.01" required></div><div class="aloj-buy-field"><label>Forma de pagamento</label><select id="alojBuyPayment"><option value="PIX">PIX</option><option value="BOLETO">Boleto</option><option value="CARTAO">Cartão</option><option value="TRANSFERENCIA">Transferência</option><option value="OUTRO">Outro</option></select></div></form><div class="aloj-buy-modal-actions"><span class="aloj-buy-feedback" id="alojBuyFeedback"></span><button class="aloj-buy-action" data-aloj-buy-cancel type="button">Cancelar</button><button class="aloj-buy-action" form="alojBuyPurchaseForm" type="submit">Confirmar compra</button></div></div>`;
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
  $('.aloj-buy-close',modal).onclick=closeModal; $('[data-aloj-buy-cancel]',modal).onclick=closeModal;
  $('#alojBuyPurchaseForm',modal).onsubmit=async(event)=>{
    event.preventDefault();
    const supplier=$('#alojBuySupplier',modal).value.trim(); const unit=Number($('#alojBuyUnitValue',modal).value||0);
    if(!supplier||unit<=0){$('#alojBuyFeedback',modal).textContent='Informe fornecedor e valor.';return;}
    try{await updateItem(row.id,{fornecedor:supplier,valor_unitario:unit,valor_total:unit*Number(row.quantidade||row.unidade||1),forma_pagamento:$('#alojBuyPayment',modal).value,status:'comprado',comprado_em:new Date().toISOString()});closeModal();}catch(error){$('#alojBuyFeedback',modal).textContent=error.message||'Não foi possível registrar.';}
  };
}

function bindEvents() {
  $('#alojBuyRefresh')?.addEventListener('click',loadRows);
  $('#alojBuySearch')?.addEventListener('input',(event)=>{state.search=event.target.value;render();});
  aoClicarCard($('#alojBuyPanel'),(card,limpar)=>{state.filter=limpar||!card||state.filter===card.dataset.filtro?'todos':card.dataset.filtro;render();});
  $('#alojBuyPanel')?.addEventListener('click',async(event)=>{
    const quote=event.target.closest('[data-aloj-buy-quote]');
    if(quote){quote.disabled=true;try{await updateItem(quote.dataset.alojBuyQuote,{status:'em_cotacao'});}catch(error){window.alert(error.message||'Não foi possível iniciar a cotação.');quote.disabled=false;}return;}
    const purchase=event.target.closest('[data-aloj-buy-purchase]');
    if(purchase){const row=state.rows.find((item)=>String(item.id)===String(purchase.dataset.alojBuyPurchase));if(row)openPurchase(row);return;}
    const reject=event.target.closest('[data-aloj-buy-reject]');
    if(reject){const reason=window.prompt('Motivo da recusa:')?.trim();if(!reason)return;reject.disabled=true;try{await updateItem(reject.dataset.alojBuyReject,{status:'recusado',motivo_recusa:reason});}catch(error){window.alert(error.message||'Não foi possível recusar.');reject.disabled=false;}}
  });
  $('#alojBuyModal')?.addEventListener('click',(event)=>{if(event.target===event.currentTarget)closeModal();});
}

function mount() {
  if (state.mounted) return true;
  const shell = $('.aloj-v2-shell');
  if (!shell || !$('#alojTabs .ds-tabs')) return false;
  ensureStyles();
  shell.insertAdjacentHTML('beforeend',panelHtml());
  state.mounted = true;
  bindEvents();
  loadRows();
  return true;
}

function scheduleMount() { window.setTimeout(() => mount(),40); }
window.addEventListener('alojamentos:compras',()=>{if(mount())loadRows();});
new MutationObserver(scheduleMount).observe(document.body,{childList:true,subtree:true});
scheduleMount();
