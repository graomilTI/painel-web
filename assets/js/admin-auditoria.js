import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

const state = { tab: tabFromHash(), solicitacoes: [], historico: [], agrupamentos: [], auditoriasRegional: [], selected: null, userContext: null };

function esc(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function norm(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase(); }
function brDate(value){ if(!value) return '-'; const s=String(value).slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return esc(value); return DATE.format(new Date(`${s}T00:00:00Z`)); }
function money(value){ return MONEY.format(Number(value || 0)); }
function tabFromHash(){ const h=String(window.location.hash||'').replace('#','').toLowerCase(); return ['solicitadas','abertas','agrupadas','lancadas','histórico','historico'].includes(h) ? (h==='histórico'?'historico':h) : 'abertas'; }
function setMsg(text, cls=''){ const el=document.getElementById('admAudMsg'); if(el){ el.textContent=text||''; el.className=`adm-aud-msg ${cls}`.trim(); } }

function styles(){ return `<style>
  .adm-aud-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;background:radial-gradient(circle at top right,rgba(34,197,94,.16),transparent 34%),linear-gradient(180deg,rgba(8,22,17,.96),rgba(6,18,14,.96));border:1px solid var(--line);border-radius:28px;padding:24px;box-shadow:var(--shadow)}
  .adm-aud-hero h2{font-size:30px;margin:4px 0 8px}.adm-aud-hero p{margin:0;color:var(--muted)}.adm-aud-kpis{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:10px;min-width:620px}.adm-aud-kpi{border:1px solid rgba(111,208,165,.18);background:rgba(15,23,42,.65);border-radius:18px;padding:14px}.adm-aud-kpi b{display:block;font-size:25px;color:#dcfce7}.adm-aud-kpi span{display:block;color:var(--muted);font-size:12px;margin-top:4px}
  .adm-aud-panel{margin-top:16px;background:rgba(8,22,17,.72);border:1px solid var(--line);border-radius:24px;padding:18px;box-shadow:var(--shadow-soft)}.adm-aud-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.adm-aud-tabs{display:flex;gap:10px;flex-wrap:wrap}.adm-aud-tab{border:1px solid rgba(111,208,165,.22);background:#15152a;color:#e2e2f0;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.adm-aud-tab.active{background:rgba(34,197,94,.22);border-color:rgba(111,208,165,.45);color:#dcfce7}.adm-aud-actions{display:flex;gap:8px;flex-wrap:wrap}.adm-aud-btn{border:1px solid rgba(111,208,165,.22);background:rgba(15,23,42,.78);color:#eef7f2;border-radius:12px;padding:9px 12px;font-weight:900;cursor:pointer}.adm-aud-btn:hover{background:rgba(22,101,52,.28)}.adm-aud-primary{background:#3fa878;color:#04130d}.adm-aud-warn{background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.35);color:#fde68a}.adm-aud-danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.32)}.adm-aud-muted{color:var(--muted);font-size:13px}.adm-aud-msg{min-height:20px;color:var(--muted);font-weight:800}.adm-aud-msg.ok{color:#bbf7d0}.adm-aud-msg.err{color:#fecaca}
  .adm-aud-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:#081611}.adm-aud-table{width:100%;min-width:1260px;border-collapse:collapse}.adm-aud-table th,.adm-aud-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;vertical-align:top}.adm-aud-table th{background:rgba(15,23,42,.92);color:#dcfce7;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.adm-aud-table td{color:#e2e2f0}.adm-aud-table small{display:block;color:var(--muted);margin-top:4px}.adm-aud-empty{text-align:center!important;color:var(--muted);padding:22px!important}
  .adm-aud-chip{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.adm-aud-chip.ok{background:rgba(34,197,94,.16);color:#bbf7d0}.adm-aud-chip.warn{background:rgba(234,179,8,.14);color:#fde68a}.adm-aud-chip.info{background:rgba(59,130,246,.16);color:#bfdbfe}.adm-aud-chip.neutral{background:rgba(148,163,184,.12);color:#cbd5e1}
  .adm-aud-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);display:none;align-items:center;justify-content:center;z-index:9999;padding:18px}.adm-aud-modal.open{display:flex}.adm-aud-dialog{width:min(1050px,96vw);max-height:90vh;overflow:auto;background:#07140f;border:1px solid rgba(111,208,165,.22);border-radius:24px;padding:18px;box-shadow:0 22px 70px rgba(0,0,0,.45)}.adm-aud-dialog h3{margin:0 0 12px}.adm-aud-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.adm-aud-field{border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:11px;background:rgba(15,23,42,.48)}.adm-aud-field span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;font-weight:900;letter-spacing:.06em;margin-bottom:4px}.adm-aud-field b{color:#f8fafc}.adm-aud-full{grid-column:1/-1}.adm-aud-select-row{display:flex;align-items:center;gap:10px;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px;margin-bottom:8px;background:rgba(15,23,42,.42)}
  @media(max-width:1000px){.adm-aud-hero{display:block}.adm-aud-kpis{min-width:0;margin-top:14px;grid-template-columns:repeat(2,minmax(120px,1fr))}.adm-aud-grid{grid-template-columns:1fr}.adm-aud-head{display:block}.adm-aud-actions{margin-top:10px}}
</style>`; }

function chip(value){ const v=norm(value||'ABERTA'); const cls=v==='OK'?'ok':v==='INTERNA'?'ok':v==='EXTERNA'?'warn':v.includes('AGRUP')?'warn':v.includes('LANC')?'info':'neutral'; return `<span class="adm-aud-chip ${cls}">${esc(value||'ABERTA')}</span>`; }
function origemChip(v){ return chip(norm(v)==='INTERNA'?'INTERNA':'EXTERNA'); }

async function loadAll(){
  const [solRes, histRes, groupRes] = await Promise.all([
    supabase.from('auditoria_solicitacoes').select('*').order('created_at',{ascending:false}).limit(1000),
    supabase.from('operacional_auditoria_colaborador').select('*').order('data_evento',{ascending:false, nullsFirst:false}).limit(1000),
    supabase.from('auditoria_agrupamentos').select('*').order('created_at',{ascending:false}).limit(500)
  ]);
  if (solRes.error) console.warn('[Auditoria] auditoria_solicitacoes:', solRes.error.message);
  if (histRes.error) console.warn('[Auditoria] operacional_auditoria_colaborador:', histRes.error.message);
  if (groupRes.error) console.warn('[Auditoria] auditoria_agrupamentos:', groupRes.error.message);
  state.solicitacoes = solRes.error ? [] : (solRes.data || []);
  state.historico = histRes.error ? [] : (histRes.data || []);
  state.agrupamentos = groupRes.error ? [] : (groupRes.data || []);
}
function rowsByTab(){
  if(state.tab==='solicitadas') return state.solicitacoes.filter(r=>norm(r.status)==='SOLICITADA');
  if(state.tab==='abertas') return state.solicitacoes.filter(r=>['SOLICITADA','ABERTA'].includes(norm(r.status)));
  if(state.tab==='agrupadas') return state.solicitacoes.filter(r=>norm(r.status)==='AGRUPADA');
  if(state.tab==='lancadas') return state.solicitacoes.filter(r=>['LANCADA','PAGAMENTO_SOLICITADO','PAGO'].includes(norm(r.status)) || r.pagamento_solicitado);
  return state.historico;
}
function kpis(){
  return { solicitadas: state.solicitacoes.filter(r=>norm(r.status)==='SOLICITADA').length,
    abertas: state.solicitacoes.filter(r=>['SOLICITADA','ABERTA'].includes(norm(r.status))).length,
    agrupadas: state.solicitacoes.filter(r=>norm(r.status)==='AGRUPADA').length,
    lancadas: state.solicitacoes.filter(r=>['LANCADA','PAGAMENTO_SOLICITADO','PAGO'].includes(norm(r.status)) || r.pagamento_solicitado).length,
    historico: state.historico.length + state.solicitacoes.filter(r=>norm(r.status)==='OK').length };
}
function rowHtml(r){ return `<tr><td>${origemChip(r.origem)}</td><td>${chip(r.status)}</td><td><strong>${esc(r.placa||'-')}</strong><small>Class.: ${brDate(r.data_classificacao)}</small></td><td>${brDate(r.data_auditoria)}<small>Criada: ${brDate(r.created_at)}</small></td><td>${esc(r.cliente||'-')}<small>OS: ${esc(r.os||'-')}</small></td><td>${esc(r.classificador||'-')}<small>Bônus: ${r.perdera_bonus?'Perde':'Não perde'}</small></td><td>${esc(r.auditor||'-')}<small>PIX: ${esc(r.pix||'-')}</small></td><td>${money(r.valor)}</td><td><div class="adm-aud-actions"><button class="adm-aud-btn adm-aud-primary" data-lancar="${esc(r.id)}" type="button">Lançar</button></div></td></tr>`; }
function histRowHtml(r){ return `<tr><td>${origemChip(r.origem||'INTERNA')}</td><td>${chip(r.status || r.severidade || 'Histórico')}</td><td><strong>${esc(r.placa||'-')}</strong><small>Class.: ${brDate(r.data_classificacao)}</small></td><td>${brDate(r.data_auditoria || r.data_evento || r.data_resultado)}</td><td>${esc(r.cliente_final||r.cliente_regional||r.cliente_nacional||r.cliente||'-')}<small>OS: ${esc(r.os||'-')}</small></td><td>${esc(r.nome_colaborador||r.classificador||'-')}<small>${esc(r.tipo_funcionario||'')}</small></td><td>${esc(r.auditor||'-')}</td><td>${money(r.valor||0)}</td><td>${esc(r.resultado||r.resultado_auditoria||r.motivo_recusa||'-')}</td></tr>`; }

function renderTable(){
  const rows=rowsByTab();
  const target=document.getElementById('admAudTable'); if(!target) return;
  if(state.tab==='historico'){
    target.innerHTML = `<div class="adm-aud-table-wrap"><table class="adm-aud-table"><thead><tr><th>Origem</th><th>Status</th><th>Placa</th><th>Data Auditoria</th><th>Cliente / OS</th><th>Classificador</th><th>Auditor</th><th>Valor</th><th>Resultado</th></tr></thead><tbody>${rows.length?rows.map(histRowHtml).join(''):'<tr><td colspan="9" class="adm-aud-empty">Nenhum histórico de auditoria localizado. Importe a planilha de auditorias em Relatórios para preencher o histórico.</td></tr>'}</tbody></table></div>`;
  } else {
    target.innerHTML = `<div class="adm-aud-table-wrap"><table class="adm-aud-table"><thead><tr><th>Origem</th><th>Status</th><th>Placa</th><th>Data Auditoria</th><th>Cliente / OS</th><th>Classificador</th><th>Auditor</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${rows.length?rows.map(rowHtml).join(''):'<tr><td colspan="9" class="adm-aud-empty">Nenhum item nesta fila.</td></tr>'}</tbody></table></div>`;
  }
  target.querySelectorAll('[data-lancar]').forEach(btn=>btn.addEventListener('click',()=>openDetalhes(btn.dataset.lancar)));
}
function field(label, value){ return `<div class="adm-aud-field"><span>${esc(label)}</span><b>${esc(value||'-')}</b></div>`; }
function openDetalhes(id){
  const r=state.solicitacoes.find(x=>String(x.id)===String(id)); if(!r) return;
  state.selected=r;
  const modal=document.getElementById('admAudModal'); const body=document.getElementById('admAudModalBody');
  body.innerHTML = `<h3>Auditoria · ${esc(r.placa||'-')}</h3><div class="adm-aud-grid">
    ${field('Origem', r.origem)}${field('Status', r.status)}${field('Data da classificação', brDate(r.data_classificacao))}${field('Data da auditoria', brDate(r.data_auditoria))}
    ${field('Cliente', r.cliente)}${field('OS', r.os)}${field('Classificador', r.classificador)}${field('Perderá bônus?', r.perdera_bonus?'Sim':'Não')}
    ${field('Auditor', r.auditor)}${field('PIX', r.pix)}${field('Valor', money(r.valor))}${field('Pagamento', r.pagamento_solicitado?'Solicitado':'Não solicitado')}
    <div class="adm-aud-field adm-aud-full"><span>Classificação na Origem</span><b>${esc(r.classificacao_origem||'-')}</b></div>
    <div class="adm-aud-field adm-aud-full"><span>Motivo da Recusa</span><b>${esc(r.motivo_recusa||'-')}</b></div>
    <div class="adm-aud-field adm-aud-full"><span>Resultado da Auditoria</span><b>${esc(r.resultado_auditoria||'-')}</b></div>
    <div class="adm-aud-field adm-aud-full"><span>Observação</span><b>${esc(r.observacao||'-')}</b></div>
  </div><div class="adm-aud-actions" style="margin-top:14px">
    <button class="adm-aud-btn adm-aud-primary" id="btnSolicitarPagamento" type="button">Solicitar Pagamento</button>
    <button class="adm-aud-btn adm-aud-warn" id="btnAgrupar" type="button">Agrupar</button>
    <button class="adm-aud-btn" id="btnOkAuditoria" type="button">OK</button>
    <button class="adm-aud-btn adm-aud-danger" id="btnCloseModal" type="button">Fechar</button>
  </div><div class="adm-aud-msg" id="admAudModalMsg"></div>`;
  modal.classList.add('open');
  document.getElementById('btnCloseModal').onclick=()=>modal.classList.remove('open');
  document.getElementById('btnOkAuditoria').onclick=()=>marcarOk(r);
  document.getElementById('btnSolicitarPagamento').onclick=()=>solicitarPagamento(r);
  document.getElementById('btnAgrupar').onclick=()=>openAgrupar(r);
}
function modalMsg(text, cls=''){ const el=document.getElementById('admAudModalMsg'); if(el){ el.textContent=text; el.className=`adm-aud-msg ${cls}`.trim(); } }
async function marcarOk(row){
  modalMsg('Salvando OK...');
  const { error } = await supabase.from('auditoria_solicitacoes').update({ status:'OK', ok_em:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', row.id);
  if(error){ modalMsg(error.message,'err'); return; }
  modalMsg('Auditoria finalizada em OK.', 'ok'); await loadAll(); renderKpis(); renderTable();
}
function pagamentoPayload(row, total=null, ids=null){
  const valor = total ?? Number(row.valor || 0);
  const placa = ids ? `${ids.length} auditoria(s)` : `placa ${row.placa || '-'}`;
  return { origem:'AUDITORIA', origem_setor:'AUDITORIA', origem_tabela:'auditoria_solicitacoes', origem_id: row.id,
    descricao:`Auditoria data ${brDate(row.data_auditoria)} ${placa}`, favorecido: row.auditor || 'Auditor', favorecido_nome: row.auditor || 'Auditor', valor,
    forma_pagamento:'PIX', dados_pagamento: row.pix || null, pix: row.pix || null, status:'PENDENTE', created_at:new Date().toISOString(),
    gestor: row.gestor || null, coordenacao: row.coordenacao || null, observacoes: ids ? `Auditorias agrupadas: ${ids.join(', ')}` : (row.observacao || null) };
}
async function solicitarPagamento(row){
  if(norm(row.origem)==='INTERNA' && Number(row.valor||0)<=0){ modalMsg('Auditoria interna sem valor: use OK para concluir sem pagamento.', 'err'); return; }
  modalMsg('Enviando ao Financeiro...');
  const payload=pagamentoPayload(row);
  const { data, error } = await supabase.from('financeiro_pagamentos').insert(payload).select('*').single();
  if(error){ modalMsg(error.message,'err'); return; }
  const upd=await supabase.from('auditoria_solicitacoes').update({ status:'LANCADA', pagamento_solicitado:true, pagamento_id:data?.id||null, updated_at:new Date().toISOString() }).eq('id', row.id);
  if(upd.error){ modalMsg(upd.error.message,'err'); return; }
  modalMsg('Pagamento solicitado ao Financeiro.', 'ok'); await loadAll(); renderKpis(); renderTable();
}
function openAgrupar(row){
  const candidatos=state.solicitacoes.filter(x=>String(x.id)!==String(row.id) && norm(x.auditor)===norm(row.auditor) && !x.pagamento_solicitado && !x.agrupamento_id && ['SOLICITADA','ABERTA'].includes(norm(x.status)));
  const selected=[row, ...candidatos];
  const body=document.getElementById('admAudModalBody');
  body.innerHTML=`<h3>Agrupar auditorias · ${esc(row.auditor||'-')}</h3><p class="adm-aud-muted">Selecione as auditorias do mesmo auditor que entrarão no agrupamento. Depois de agrupada, a única ação será Pagar.</p><div id="groupRows">${selected.map(x=>`<label class="adm-aud-select-row"><input type="checkbox" data-group-id="${esc(x.id)}" checked /> <strong>${esc(x.placa||'-')}</strong> <span>${brDate(x.data_auditoria)}</span> <span>${money(x.valor)}</span> <small>${esc(x.cliente||'')}</small></label>`).join('')}</div><div class="adm-aud-actions"><button class="adm-aud-btn adm-aud-primary" id="btnSalvarGrupo" type="button">Criar agrupamento</button><button class="adm-aud-btn adm-aud-danger" id="btnCloseModal" type="button">Fechar</button></div><div class="adm-aud-msg" id="admAudModalMsg"></div>`;
  document.getElementById('btnCloseModal').onclick=()=>document.getElementById('admAudModal').classList.remove('open');
  document.getElementById('btnSalvarGrupo').onclick=()=>salvarGrupo(row);
}
async function salvarGrupo(base){
  const ids=[...document.querySelectorAll('[data-group-id]:checked')].map(i=>i.dataset.groupId);
  if(!ids.length){ modalMsg('Selecione pelo menos uma auditoria.','err'); return; }
  const rows=state.solicitacoes.filter(r=>ids.includes(String(r.id)));
  const total=rows.reduce((s,r)=>s+Number(r.valor||0),0);
  modalMsg('Criando agrupamento...');
  const { data, error } = await supabase.from('auditoria_agrupamentos').insert({ auditor:base.auditor||null, pix:base.pix||null, total, quantidade:rows.length, status:'AGRUPADO', auditoria_ids:ids, created_at:new Date().toISOString() }).select('*').single();
  if(error){ modalMsg(error.message,'err'); return; }
  const upd=await supabase.from('auditoria_solicitacoes').update({ status:'AGRUPADA', agrupamento_id:data?.id||null, updated_at:new Date().toISOString() }).in('id', ids);
  if(upd.error){ modalMsg(upd.error.message,'err'); return; }
  modalMsg('Agrupamento criado. Use a aba Agrupadas para pagar o lote.', 'ok'); await loadAll(); renderKpis(); renderTable();
}
async function pagarGrupo(groupId){
  const rows=state.solicitacoes.filter(r=>String(r.agrupamento_id)===String(groupId));
  if(!rows.length){ setMsg('Nenhuma auditoria encontrada no agrupamento.','err'); return; }
  const total=rows.reduce((s,r)=>s+Number(r.valor||0),0);
  const base=rows[0];
  setMsg('Enviando agrupamento ao Financeiro...');
  const { data, error }=await supabase.from('financeiro_pagamentos').insert(pagamentoPayload(base,total,rows.map(r=>r.id))).select('*').single();
  if(error){ setMsg(error.message,'err'); return; }
  const ids=rows.map(r=>r.id);
  const upd=await supabase.from('auditoria_solicitacoes').update({ status:'LANCADA', pagamento_solicitado:true, pagamento_id:data?.id||null, updated_at:new Date().toISOString() }).in('id', ids);
  if(upd.error){ setMsg(upd.error.message,'err'); return; }
  await supabase.from('auditoria_agrupamentos').update({ status:'PAGAMENTO_SOLICITADO', pagamento_id:data?.id||null, updated_at:new Date().toISOString() }).eq('id', groupId);
  setMsg('Agrupamento enviado ao Financeiro.', 'ok'); await loadAll(); renderKpis(); renderTable();
}
function renderAgrupadasActions(){
  if(state.tab!=='agrupadas') return;
  document.querySelectorAll('[data-group-pay]').forEach(btn=>btn.addEventListener('click',()=>pagarGrupo(btn.dataset.groupPay)));
}
function renderTableOverrideForAgrupadas(){
  if(state.tab!=='agrupadas') { renderTable(); return; }
  const groups=new Map();
  state.solicitacoes.filter(r=>norm(r.status)==='AGRUPADA').forEach(r=>{
    const id=r.agrupamento_id || `semgrupo-${r.id}`;
    if(!groups.has(id)) groups.set(id,{id, auditor:r.auditor, pix:r.pix, rows:[], total:0});
    const g=groups.get(id); g.rows.push(r); g.total+=Number(r.valor||0);
  });
  const arr=[...groups.values()];
  const target=document.getElementById('admAudTable');
  target.innerHTML=`<div class="adm-aud-table-wrap"><table class="adm-aud-table"><thead><tr><th>Auditor</th><th>PIX</th><th>Qtd.</th><th>Valor total</th><th>Auditorias</th><th>Ação</th></tr></thead><tbody>${arr.length?arr.map(g=>`<tr><td><strong>${esc(g.auditor||'-')}</strong></td><td>${esc(g.pix||'-')}</td><td>${g.rows.length}</td><td>${money(g.total)}</td><td>${g.rows.map(r=>`${esc(r.placa||'-')} · ${brDate(r.data_auditoria)} · ${money(r.valor)}`).join('<br>')}</td><td><button class="adm-aud-btn adm-aud-primary" data-group-pay="${esc(g.id)}" type="button">Pagar</button></td></tr>`).join(''):'<tr><td colspan="6" class="adm-aud-empty">Nenhum agrupamento pendente.</td></tr>'}</tbody></table></div>`;
  renderAgrupadasActions();
}
function renderKpis(){
  const k=kpis();
  const el=document.getElementById('admAudKpis'); if(!el) return;
  el.innerHTML=`<div class="adm-aud-kpi"><b>${k.solicitadas}</b><span>Solicitadas</span></div><div class="adm-aud-kpi"><b>${k.abertas}</b><span>Abertas</span></div><div class="adm-aud-kpi"><b>${k.agrupadas}</b><span>Agrupadas</span></div><div class="adm-aud-kpi"><b>${k.lancadas}</b><span>Lançadas</span></div><div class="adm-aud-kpi"><b>${k.historico}</b><span>Histórico</span></div>`;
}
async function loadAuditoriasRegional(){
  try {
    const { data: maxRows, error: maxErr } = await supabase
      .from('grm_auditorias_importacoes').select('created_at').order('created_at', { ascending: false }).limit(1);
    if (maxErr) throw maxErr;
    const maxCreatedAt = maxRows?.[0]?.created_at;
    if (!maxCreatedAt) { state.auditoriasRegional = []; return; }
    // o agente recarrega a tabela inteira a cada sincronização; pegamos só o lote mais recente.
    const threshold = new Date(new Date(maxCreatedAt).getTime() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('grm_auditorias_importacoes').select('dados_json').gte('created_at', threshold).limit(200);
    if (error) throw error;
    state.auditoriasRegional = (data || []).map((row) => row.dados_json);
  } catch (error) {
    console.warn('[Auditoria] falha ao carregar resumo regional do agente', error);
    state.auditoriasRegional = [];
  }
}

function renderAuditoriasRegional(){
  const tbody = document.getElementById('admAudRegionalBody');
  if (!tbody) return;
  const rows = [...(state.auditoriasRegional || [])].sort((a, b) => Number(b?.auditValue || 0) - Number(a?.auditValue || 0));
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="adm-aud-empty">Nenhum resumo encontrado.</td></tr>';
    return;
  }
  const totalCount = rows.reduce((sum, r) => sum + Number(r?.auditCount || 0), 0);
  const totalValue = rows.reduce((sum, r) => sum + Number(r?.auditValue || 0), 0);
  tbody.innerHTML = rows.map((r) => `<tr><td>${esc(r?.reportName || '-')}</td><td>${esc(r?.auditCount ?? '-')}</td><td>${money(r?.auditValue)}</td></tr>`).join('')
    + `<tr><td><strong>Total</strong></td><td><strong>${totalCount}</strong></td><td><strong>${money(totalValue)}</strong></td></tr>`;
}

function renderActive(){
  document.querySelectorAll('.adm-aud-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  if(state.tab==='agrupadas') renderTableOverrideForAgrupadas(); else renderTable();
}

export async function renderContent(content, userContext) {
  state.userContext=userContext;
  await loadAll();
  content.innerHTML=`${styles()}<section class="adm-aud-hero"><div><div class="eyebrow">Módulo Auditoria</div><h2>Auditorias operacionais</h2><p>Fila para lançar auditorias, solicitar pagamento individual, agrupar por auditor ou finalizar internas em OK.</p></div><div class="adm-aud-kpis" id="admAudKpis"></div></section><section class="adm-aud-panel"><div class="adm-aud-head"><div><h3 style="margin:0">Auditorias por região</h3><p class="adm-aud-muted">Resumo sincronizado automaticamente pelo agente sync-auditorias.</p></div></div><div class="adm-aud-table-wrap"><table class="adm-aud-table" style="min-width:0"><thead><tr><th>Região</th><th>Qtd. auditorias</th><th>Valor faturado</th></tr></thead><tbody id="admAudRegionalBody"><tr><td colspan="3" class="adm-aud-empty">Carregando...</td></tr></tbody></table></div></section><section class="adm-aud-panel"><div class="adm-aud-head"><div class="adm-aud-tabs"><button class="adm-aud-tab" data-tab="solicitadas" type="button">Solicitadas</button><button class="adm-aud-tab" data-tab="abertas" type="button">Abertas</button><button class="adm-aud-tab" data-tab="agrupadas" type="button">Agrupadas</button><button class="adm-aud-tab" data-tab="lancadas" type="button">Lançadas</button><button class="adm-aud-tab" data-tab="historico" type="button">Histórico</button></div><div class="adm-aud-actions"><button class="adm-aud-btn" id="btnReloadAuditoria" type="button">↻ Atualizar</button></div></div><div class="adm-aud-msg" id="admAudMsg"></div><div id="admAudTable"></div></section><div class="adm-aud-modal" id="admAudModal"><div class="adm-aud-dialog" id="admAudModalBody"></div></div>`;
  renderKpis(); renderActive();
  loadAuditoriasRegional().then(renderAuditoriasRegional);
  document.querySelectorAll('.adm-aud-tab').forEach(btn=>btn.addEventListener('click',()=>{ state.tab=btn.dataset.tab; history.replaceState(null,'',`#${state.tab}`); renderActive(); }));
  document.getElementById('btnReloadAuditoria')?.addEventListener('click',async()=>{ setMsg('Atualizando...'); await loadAll(); renderKpis(); renderActive(); await loadAuditoriasRegional(); renderAuditoriasRegional(); setMsg('Atualizado.','ok'); });
  document.getElementById('admAudModal')?.addEventListener('click',(ev)=>{ if(ev.target.id==='admAudModal') ev.currentTarget.classList.remove('open'); });
}

initProtectedPage('Auditoria', renderContent);
