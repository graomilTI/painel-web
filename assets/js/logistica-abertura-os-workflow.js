import { supabase } from './supabaseClient.js';

const STATUS = {
  PENDENTE: ['Aguardando análise', 'warn'],
  APROVADO: ['Aguardando agente', 'info'],
  PROCESSANDO: ['Abrindo no GRM', 'info'],
  CORRIGIR: ['Correção solicitada', 'warn'],
  RECUSADO: ['Recusada', 'danger'],
  CADASTRADO: ['Cadastrada', 'ok'],
  ERRO: ['Erro no agente', 'danger'],
};

let rows = [];
let loading = false;
let rendering = false;

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const num = (v) => new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:3}).format(Number(v)||0);
const date = (v, time=false) => { const d=new Date(v); return !v||Number.isNaN(d.getTime())?'-':time?d.toLocaleString('pt-BR'):d.toLocaleDateString('pt-BR'); };

function waitFor(selector, timeout=15000){return new Promise((resolve,reject)=>{const found=document.querySelector(selector);if(found)return resolve(found);const obs=new MutationObserver(()=>{const el=document.querySelector(selector);if(el){obs.disconnect();resolve(el);}});obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{obs.disconnect();reject(new Error(`Tempo esgotado aguardando ${selector}`));},timeout);});}
function count(...status){const set=new Set(status);return rows.filter(r=>set.has(String(r.status||'PENDENTE').toUpperCase())).length;}

function badge(row){const st=String(row.status||'PENDENTE').toUpperCase();const [label,cls]=STATUS[st]||[st,'neutral'];return `<span class="log-badge ${cls}">${esc(st==='CADASTRADO'?`Cadastrado: OS ${row.numero_os_cadastrada||'-'}`:label)}</span>`;}

function actions(row){
  const st=String(row.status||'PENDENTE').toUpperCase();
  const id=esc(row.id);
  if(st==='PENDENTE') return `<textarea class="log-input log-textarea" data-abertura-obs="${id}" placeholder="Observação obrigatória para Corrigir ou Recusar">${esc(row.observacao_adm||'')}</textarea><div class="abertura-decision-actions"><button class="btn btn-primary" data-abertura-action="OK" data-abertura-id="${id}" type="button">Ok</button><button class="btn btn-secondary" data-abertura-action="CORRIGIR" data-abertura-id="${id}" type="button">Corrigir</button><button class="btn abertura-recusar" data-abertura-action="RECUSAR" data-abertura-id="${id}" type="button">Recusar</button></div>`;
  if(st==='ERRO') return `<div class="log-meta abertura-error">${esc(row.erro_agente||'Falha não detalhada pelo agente.')}</div><button class="btn btn-primary" data-abertura-action="OK" data-abertura-id="${id}" type="button">Tentar novamente</button>`;
  if(st==='APROVADO') return '<div class="log-meta">Job enfileirado. Aguardando o worker.</div>';
  if(st==='PROCESSANDO') return '<div class="log-meta">O agente está preenchendo a O.S. no GRM.</div>';
  if(st==='CORRIGIR') return '<div class="log-meta">Devolvida ao Gestor para correção e reenvio.</div>';
  if(st==='RECUSADO') return '<div class="log-meta">Solicitação encerrada sem abrir O.S.</div>';
  if(st==='CADASTRADO') return `<div class="log-meta">Número devolvido ao Gestor em ${date(row.cadastrado_em,true)}.</div>`;
  return '';
}

function render(){
  const list=document.getElementById('aberturaOsList');
  if(!list||rendering)return;
  rendering=true;
  try{
    if(loading){list.innerHTML='<div data-abertura-workflow-root class="log-empty">Carregando solicitações...</div>';return;}
    const ordered=[...rows].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    list.innerHTML=`<div data-abertura-workflow-root><div class="abertura-kpis"><article class="card"><h3>Pendentes</h3><p class="metric log-kpi-warn">${count('PENDENTE')}</p><p class="muted">Aguardando decisão do ADM.</p></article><article class="card"><h3>No agente</h3><p class="metric">${count('APROVADO','PROCESSANDO')}</p><p class="muted">Aprovadas ou processando.</p></article><article class="card"><h3>Correção</h3><p class="metric log-kpi-warn">${count('CORRIGIR')}</p><p class="muted">Devolvidas ao Gestor.</p></article><article class="card"><h3>Recusadas</h3><p class="metric log-kpi-danger">${count('RECUSADO')}</p><p class="muted">Encerradas sem O.S.</p></article><article class="card"><h3>Cadastradas</h3><p class="metric log-kpi-ok">${count('CADASTRADO')}</p><p class="muted">Número devolvido.</p></article></div>${ordered.length?`<div class="log-table-wrap"><table class="log-table"><thead><tr><th>Solicitação</th><th>Cliente / filial</th><th>Embarque</th><th>Destino</th><th>Produto</th><th>Status / decisão</th></tr></thead><tbody>${ordered.map(r=>`<tr><td><div class="log-title">${date(r.created_at,true)}</div><div class="log-meta">Regional: ${esc(r.regional||'-')}</div><div class="log-meta">Solicitante: ${esc(r.solicitante_nome||'-')}</div></td><td><div class="log-title">${esc(r.contratante_cliente||'-')}</div><div class="log-meta">Filial: ${esc(r.filial_pagadora||'-')}</div><div class="log-meta">Contrato: ${esc(r.numero_contrato||'-')}</div><div class="log-meta">Produtor: ${esc(r.produtor||'-')}</div></td><td><div class="log-title">${esc(r.armazem_embarque||'-')}</div><div class="log-meta">${esc(r.cidade_embarque||'-')}</div></td><td><div class="log-title">${esc(r.local_destino||'-')}</div><div class="log-meta">${esc(r.cidade_destino||'-')}</div></td><td><div class="log-title">${esc(r.produto||'-')}</div><div class="log-meta">${esc(r.tipo_produto||'-')}</div><div class="log-meta">Serviço: ${esc(r.servico||'-')}</div><div class="log-meta">Volume: ${num(r.volume_inicial)} tons · Troca notas: ${esc(r.troca_notas||'-')}</div></td><td>${badge(r)}${r.observacao_adm?`<div class="log-meta abertura-obs">${esc(r.observacao_adm)}</div>`:''}${actions(r)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="log-empty">Nenhuma solicitação de abertura de O.S.</div>'}</div>`;
  }finally{rendering=false;}
}

async function load(){
  if(loading)return;
  loading=true;render();
  const {data,error}=await supabase.from('logistica_abertura_os').select('*').order('created_at',{ascending:false}).limit(1000);
  loading=false;
  if(error){const list=document.getElementById('aberturaOsList');if(list)list.innerHTML=`<div data-abertura-workflow-root class="log-empty">${esc(error.message)}. Aplique a migration do fluxo de aprovação.</div>`;return;}
  rows=Array.isArray(data)?data:[];render();
}

async function decide(id,action,button){
  const obs=document.querySelector(`[data-abertura-obs="${CSS.escape(String(id))}"]`)?.value?.trim()||null;
  if(['CORRIGIR','RECUSAR'].includes(action)&&!obs){alert('Informe o motivo antes de Corrigir ou Recusar.');return;}
  const question=action==='OK'?'Confirmar esta solicitação? O agente será enfileirado para abrir a O.S. no GRM.':action==='CORRIGIR'?'Devolver esta solicitação ao Gestor para correção?':'Recusar esta solicitação de abertura de O.S.?';
  if(!confirm(question))return;
  button.disabled=true;button.textContent=action==='OK'?'Enfileirando...':'Salvando...';
  const {data,error}=await supabase.rpc('decidir_abertura_os',{p_id:id,p_acao:action,p_observacao:obs});
  if(error){alert(error.message);button.disabled=false;button.textContent=action==='OK'?'Ok':action==='CORRIGIR'?'Corrigir':'Recusar';return;}
  await load();
  if(action==='OK')alert(`Solicitação aprovada.${data?.job_id?` Job ${data.job_id} criado.`:''}`);
}

function injectStyle(){if(document.getElementById('abertura-workflow-style'))return;const style=document.createElement('style');style.id='abertura-workflow-style';style.textContent=`.abertura-kpis{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin-bottom:14px}.abertura-kpis article.card{padding:10px 12px}.abertura-kpis h3{font-size:11px;margin:0 0 2px;text-transform:uppercase;color:#9fb7aa}.abertura-kpis .metric{font-size:22px;margin:0}.abertura-kpis .muted{font-size:10px;margin:2px 0 0}.abertura-decision-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}.abertura-decision-actions .btn{padding:7px 12px}.abertura-recusar{background:rgba(127,29,29,.82)!important;color:#fecaca!important;border:1px solid rgba(239,68,68,.35)!important}.abertura-obs{margin:7px 0;max-width:260px;white-space:pre-wrap}.abertura-error{color:#fca5a5;margin:7px 0;max-width:280px;white-space:pre-wrap}@media(max-width:1100px){.abertura-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){.abertura-kpis{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(style);}

async function boot(){
  const list=await waitFor('#aberturaOsList');injectStyle();
  list.addEventListener('click',event=>{const button=event.target.closest('[data-abertura-action]');if(!button)return;event.preventDefault();event.stopPropagation();decide(button.dataset.aberturaId,button.dataset.aberturaAction,button);});
  document.addEventListener('click',event=>{const reload=event.target.closest('#aberturaOsReload');if(!reload)return;event.preventDefault();event.stopImmediatePropagation();load();},true);
  new MutationObserver(()=>{if(!rendering&&!list.querySelector('[data-abertura-workflow-root]'))render();}).observe(list,{childList:true});
  const channel=supabase.channel('logistica-abertura-os-workflow').on('postgres_changes',{event:'*',schema:'public',table:'logistica_abertura_os'},()=>load()).subscribe();
  addEventListener('beforeunload',()=>supabase.removeChannel(channel),{once:true});
  await load();
}

boot().catch(error=>console.error('[abertura-os-workflow]',error));
