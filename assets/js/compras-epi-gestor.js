import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { confirmar } from './core/ui.js';

const state = { ctx:null, supervisoes:[], solicitacoes:[], filter:'aguardando_gestor' };

const esc = (v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const norm = (v)=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const brDate = (v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-';};
async function safe(fn,fallback=[]){try{const {data,error}=await fn(); if(error) throw error; return data||fallback;}catch(e){console.warn(e);return fallback;}}
function usuario(ctx){ return ctx?.user || {}; }
function setMsg(msg,err=false){const el=document.getElementById('epiGestorFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err);}}

// ---------- Escopo do gestor (mesma RPC já usada em Programação/Logística/Hospedagem) ----------
async function carregarSupervisoesGestor(){
  try{
    const {data,error}=await supabase.rpc('programacao_listar_supervisoes');
    if(error) throw error;
    state.supervisoes=(data||[]).map(r=>norm(r.nome||r.supervisao)).filter(Boolean);
  }catch(e){
    console.warn('[compras-epi-gestor] supervisões:',e);
    state.supervisoes=[];
  }
}

// ---------- Dados ----------
async function loadSolicitacoes(){
  const rows=await safe(()=>supabase.from('compras_solicitacoes').select('*, compras_itens(*)').eq('tipo_solicitacao','epi_rh').order('created_at',{ascending:false}).limit(200));
  state.solicitacoes=rows.filter(s=>{
    const itens=s.compras_itens||[];
    const sup=norm(itens[0]?.colaborador_supervisao || s.supervisao || '');
    if(!sup) return false;
    return state.supervisoes.some(g=>sup.includes(g)||g.includes(sup));
  });
  renderLista();
}

// ---------- Buckets (aba interna) ----------
function bucket(s){
  if(s.status==='aguardando_gestor') return 'aguardando_gestor';
  const itens=s.compras_itens||[];
  if(s.status==='comprado' && itens.some(i=>i.motivo_recusa)) return 'resolvido_recusa';
  return 'enviado_compras';
}

function statusPill(v){
  const map={
    aguardando_gestor:['#fde68a','rgba(245,158,11,.1)','Aguardando decisão'],
    pendente:['#93c5fd','rgba(59,130,246,.12)','Enviado à Compras'],
    em_cotacao:['#93c5fd','rgba(59,130,246,.12)','Em cotação'],
    em_analise:['#c4b5fd','rgba(139,92,246,.12)','Em análise'],
    pendente_pagamento:['#fde68a','rgba(245,158,11,.1)','Pend. Pagamento'],
    aguardando_nf:['#fde68a','rgba(245,158,11,.1)','Aguard. NF'],
    aguardando_termo:['#fde68a','rgba(245,158,11,.1)','Aguard. Termo'],
    comprado:['#bbf7d0','rgba(22,101,52,.18)','Comprado'],
    recusado:['#fecaca','rgba(220,38,38,.12)','Recusado'],
    concluido:['#a5b4fc','rgba(99,102,241,.14)','Concluído'],
    cancelado:['#fecaca','rgba(220,38,38,.12)','Cancelado'],
  };
  const [color,bg,label]=map[v]||['#cbd5e1','rgba(148,163,184,.1)',v||'-'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${color};background:${bg};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

// ---------- Render ----------
function renderLista(){
  const body=document.getElementById('epiGestorBody');
  if(!body) return;
  const lista=state.filter==='todos'?state.solicitacoes:state.solicitacoes.filter(s=>bucket(s)===state.filter);
  if(!lista.length){
    body.innerHTML=`<tr><td colspan="6" class="epi-empty">${state.solicitacoes.length?'Nenhuma solicitação nesta aba.':'Nenhuma solicitação de EPI para a sua supervisão.'}</td></tr>`;
    return;
  }
  body.innerHTML=lista.map(s=>{
    const itens=s.compras_itens||[];
    const primeiro=itens[0]||{};
    const nome=primeiro.colaborador_nome||s.colaborador_nome||'-';
    const supervisao=primeiro.colaborador_supervisao||s.supervisao||'-';
    const itensHtml=itens.map(i=>{
      const caTag=i.ca?`<span style="color:#86efac;font-size:11px;font-weight:700"> · CA: ${esc(i.ca)}</span>`:(norm(i.material)==='colete refletivo'?`<span style="color:#94a3b8;font-size:11px"> · CA não obrigatório</span>`:`<span style="color:#fde68a;font-size:11px"> · CA pendente</span>`);
      return `<div style="font-size:13px">${esc(i.material)}${i.tamanho?` <small class="muted">T:${esc(i.tamanho)}</small>`:''}${caTag}</div>`;
    }).join('');
    const b=bucket(s);
    let acoes;
    if(b==='aguardando_gestor'){
      acoes=`<div class="epi-acoes"><button class="btn btn-small btn-primary" data-comprar="${esc(s.id)}" type="button">Comprar</button><button class="btn btn-small btn-secondary" data-recusar="${esc(s.id)}" type="button" style="color:#fecaca;border-color:rgba(220,38,38,.4)">Recusar</button></div>`;
    }else if(b==='resolvido_recusa'){
      const motivo=itens.find(i=>i.motivo_recusa)?.motivo_recusa||'';
      const quem=itens.find(i=>i.recusado_por)?.recusado_por||'';
      acoes=`<span class="muted" title="${esc(motivo)}">Recusado${quem?` por ${esc(quem)}`:''}</span>`;
    }else{
      const quem=itens.find(i=>i.aprovado_por)?.aprovado_por||'';
      acoes=quem?`<span class="muted">Aprovado por ${esc(quem)}</span>`:'<span class="muted">—</span>';
    }
    return `<tr><td>${brDate(s.data_solicitacao||s.created_at)}</td><td><b>${esc(nome)}</b></td><td>${esc(supervisao)}</td><td style="max-width:280px;line-height:1.8">${itensHtml||'-'}</td><td>${statusPill(s.status||'aguardando_gestor')}</td><td>${acoes}</td></tr>`;
  }).join('');
  body.querySelectorAll('[data-comprar]').forEach(btn=>btn.onclick=()=>aprovarSolicitacao(btn.dataset.comprar));
  body.querySelectorAll('[data-recusar]').forEach(btn=>{
    const s=state.solicitacoes.find(x=>String(x.id)===String(btn.dataset.recusar));
    btn.onclick=()=>recusarSolicitacao(s);
  });
}

// ---------- CA da última compra: mesma supervisão primeiro, senão qualquer supervisão ----------
// (duplica a ideia de buscarUltimoCaPorMaterial de adm-compras.js, mas ordenando por
// comprado_em — a data real da compra — em vez de created_at)
async function buscarCaMaisRecente(material, supervisao){
  let q=supabase.from('compras_itens').select('ca,comprado_em,created_at').eq('material',material).eq('status','comprado').not('ca','is',null);
  if(supervisao) q=q.eq('colaborador_supervisao',supervisao);
  const rows=await safe(()=>q.order('comprado_em',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).limit(1));
  return rows?.[0]?.ca||null;
}
async function resolverCaParaRecusa(material, supervisao){
  if(supervisao){
    const ca=await buscarCaMaisRecente(material, supervisao);
    if(ca) return ca;
  }
  return await buscarCaMaisRecente(material, null);
}

// ---------- Notificação (movida daqui de epiRh.js — só dispara quando o gestor aprova) ----------
async function notifyCompras(message){
  const cfgs=await safe(()=>supabase.from('compras_notificacoes_config').select('*').eq('setor','COMPRAS').eq('ativo',true).limit(10));
  for(const cfg of cfgs){
    if(!cfg.telefone) continue;
    try{
      const tel=String(cfg.telefone).replace(/\D/g,'');
      await supabase.functions.invoke('botconversa-send',{body:{phone:tel,message,nome:cfg.nome||''}});
    }catch(e){console.warn('[notifyCompras]',e);}
  }
}

// ---------- Ações ----------
async function aprovarSolicitacao(id){
  setMsg('Aprovando...');
  const gestorNome=usuario(state.ctx).name||usuario(state.ctx).email||'Gestor';
  const {data:upd,error}=await supabase.from('compras_solicitacoes').update({status:'pendente'}).eq('id',id).eq('status','aguardando_gestor').select('id');
  if(error){ setMsg(error.message,true); return; }
  if(!upd?.length){ setMsg('Esta solicitação já foi resolvida por outro gestor.',true); await loadSolicitacoes(); return; }
  await supabase.from('compras_itens').update({status:'pendente',aprovado_por:gestorNome,aprovado_em:new Date().toISOString()}).eq('solicitacao_id',id).eq('status','aguardando_gestor');
  const s=state.solicitacoes.find(x=>String(x.id)===String(id));
  const itens=s?.compras_itens||[];
  const nome=itens[0]?.colaborador_nome||s?.colaborador_nome||'-';
  await notifyCompras(`Nova solicitação de EPI aprovada pelo gestor\nColaborador: ${nome}\nItens: ${itens.map(i=>i.material+(i.tamanho?` (${i.tamanho})`:'')).join(', ')}`);
  setMsg('Solicitação enviada ao setor de Compras.');
  await loadSolicitacoes();
}

async function recusarSolicitacao(s){
  if(!s) return;
  const itens=s.compras_itens||[];
  const nome=itens[0]?.colaborador_nome||s.colaborador_nome||'este colaborador';
  const motivo=await confirmar({
    titulo:'Recusar solicitação de EPI',
    mensagem:`Recusar a compra de EPI para ${nome}? Os itens voltam para o RH já marcados como Comprados, reaproveitando o CA da última compra do mesmo material (primeiro na mesma supervisão, senão de qualquer supervisão). Informe o motivo:`,
    confirmarLabel:'Recusar', justificativa:true, justificativaMin:5,
    justificativaPlaceholder:'Ex.: já entregue em estoque, colaborador desligado...',
  });
  if(!motivo) return;
  setMsg('Recusando...');
  const gestorNome=usuario(state.ctx).name||usuario(state.ctx).email||'Gestor';
  const {data:upd,error}=await supabase.from('compras_solicitacoes').update({status:'comprado'}).eq('id',s.id).eq('status','aguardando_gestor').select('id');
  if(error){ setMsg(error.message,true); return; }
  if(!upd?.length){ setMsg('Esta solicitação já foi resolvida por outro gestor.',true); await loadSolicitacoes(); return; }
  for(const item of itens){
    const supervisaoItem=item.colaborador_supervisao||s.supervisao||null;
    const ca=await resolverCaParaRecusa(item.material, supervisaoItem);
    await supabase.from('compras_itens').update({
      status:'comprado', ca:ca||null,
      motivo_recusa:motivo, recusado_por:gestorNome,
      comprado_em:new Date().toISOString(),
    }).eq('id',item.id);
  }
  setMsg('Solicitação recusada e devolvida ao RH.');
  await loadSolicitacoes();
}

// ---------- Estilos (mesmas classes .epi-* de epiRh.js, duplicadas — sem utils compartilhado) ----------
function styles(){return `<style>
.epi-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
.epi-table{width:100%;border-collapse:collapse;min-width:760px}
.epi-table th,.epi-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
.epi-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
.epi-empty{text-align:center;color:var(--muted)}
.epi-acoes{display:flex;gap:8px;flex-wrap:wrap}
.epi-feedback{font-weight:700;display:block}
.epi-feedback.err{color:#fecaca}
.epi-filter-tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.epi-filter-tabs-group{display:flex;gap:8px;flex-wrap:wrap}
.epi-filter-tabs .active{background:#166534!important;color:#fff!important}
.mt-8{margin-top:8px}
.mt-16{margin-top:16px}
</style>`;}

export async function renderContent(content, userContext){
  state.ctx=userContext;
  content.innerHTML=`${styles()}<section class="card"><div class="section-head"><div><h3>EPI — Aprovação do Gestor</h3><p class="muted">Solicitações de EPI do RH para colaboradores da sua supervisão. Decida comprar ou recusar (com motivo obrigatório).</p></div><button class="btn btn-secondary" id="epiGestorRefresh" type="button">↻ Atualizar</button></div><div class="epi-filter-tabs mt-16"><div class="epi-filter-tabs-group"><button class="btn btn-secondary active" data-ef="aguardando_gestor" type="button">Aguardando decisão</button><button class="btn btn-secondary" data-ef="enviado_compras" type="button">Enviado à Compras</button><button class="btn btn-secondary" data-ef="resolvido_recusa" type="button">Resolvido por mim</button><button class="btn btn-secondary" data-ef="todos" type="button">Todos</button></div></div><div class="epi-table-wrap mt-16"><table class="epi-table"><thead><tr><th>Data</th><th>Colaborador</th><th>Supervisão</th><th>EPIs / CA</th><th>Status</th><th>Ações</th></tr></thead><tbody id="epiGestorBody"><tr><td colspan="6" class="epi-empty">Carregando...</td></tr></tbody></table></div><span class="epi-feedback mt-8" id="epiGestorFeedback"></span></section>`;

  document.getElementById('epiGestorRefresh').onclick=()=>loadSolicitacoes();
  content.querySelectorAll('[data-ef]').forEach(btn=>btn.onclick=()=>{
    state.filter=btn.dataset.ef;
    content.querySelectorAll('[data-ef]').forEach(b=>b.classList.toggle('active',b===btn));
    renderLista();
  });

  await carregarSupervisoesGestor();
  if(!state.supervisoes.length){
    document.getElementById('epiGestorBody').innerHTML=`<tr><td colspan="6" class="epi-empty">Você não está vinculado a nenhuma supervisão. Peça ao TI o vínculo em Programação para ver as solicitações de EPI da sua equipe.</td></tr>`;
    return;
  }
  await loadSolicitacoes();
}

initProtectedPage('Compras · EPI', renderContent);
