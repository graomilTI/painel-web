import { supabase } from './supabaseClient.js';
import { openModal, closeModal, confirmar, toast } from './core/ui.js';
import { CAMPOS_ABERTURA_OS, labelCampoAberturaOs } from './logistica-abertura-os-campos.js';

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

// Mesmo vocabulário de assets/js/logistica.js:TESTES_POR_PRODUTO — só pra
// exibição aqui, então achatado (não precisa validar contra o produto).
const TESTES_LABELS = {
  AFLATOXINA_QUALITATIVO: 'Aflatoxina — Qualitativo',
  AFLATOXINA_QUANTITATIVO: 'Aflatoxina — Quantitativo',
  AFLATOXINA_QUALI_QUANTI: 'Aflatoxina — Qualitativo e Quantitativo',
  INTACTA: 'Intacta',
  GMO_FREE: 'GMO Free',
  VOMITOXINA: 'Vomitoxina',
};
function testesResumo(row) {
  const opcoes = Array.isArray(row.testes?.opcoes) ? row.testes.opcoes : [];
  if (!opcoes.length) return '';
  return `Testes: ${esc(opcoes.map(k => TESTES_LABELS[k] || k).join(', '))}`;
}

function waitFor(selector, timeout=15000){return new Promise((resolve,reject)=>{const found=document.querySelector(selector);if(found)return resolve(found);const obs=new MutationObserver(()=>{const el=document.querySelector(selector);if(el){obs.disconnect();resolve(el);}});obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{obs.disconnect();reject(new Error(`Tempo esgotado aguardando ${selector}`));},timeout);});}
function count(...status){const set=new Set(status);return rows.filter(r=>set.has(String(r.status||'PENDENTE').toUpperCase())).length;}

function badge(row){const st=String(row.status||'PENDENTE').toUpperCase();const [label,cls]=STATUS[st]||[st,'neutral'];return `<span class="log-badge ${cls}">${esc(st==='CADASTRADO'?`Cadastrado: OS ${row.numero_os_cadastrada||'-'}`:label)}</span>`;}

// ── linha resumida da lista: Data/hora - Supervisão (regional) - Cliente - Produto - Abrir ──
function rowHtml(row){
  const id=esc(row.id);
  const temProblema=Array.isArray(row.pontos_problema)&&row.pontos_problema.length>0;
  return `<tr>
    <td><div class="log-title">${date(row.created_at,true)}</div>${badge(row)}</td>
    <td>${esc(row.regional||'-')}</td>
    <td>${esc(row.contratante_cliente||'-')}</td>
    <td>${esc(row.produto||'-')}</td>
    <td class="ab-abrir-cell">${temProblema?`<span class="ab-problema-dot" title="Ponto com problema reportado ao Gestor">❗</span>`:''}<button class="btn btn-secondary" data-abertura-abrir="${id}" type="button">Abrir</button></td>
  </tr>`;
}

function render(){
  const list=document.getElementById('aberturaOsList');
  if(!list||rendering)return;
  rendering=true;
  try{
    if(loading){list.innerHTML='<div data-abertura-workflow-root class="log-empty">Carregando solicitações...</div>';return;}
    const ordered=[...rows].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    list.innerHTML=`<div data-abertura-workflow-root><div class="abertura-kpis"><article class="card"><h3>Pendentes</h3><p class="metric log-kpi-warn">${count('PENDENTE')}</p><p class="muted">Aguardando decisão do ADM.</p></article><article class="card"><h3>No agente</h3><p class="metric">${count('APROVADO','PROCESSANDO')}</p><p class="muted">Aprovadas ou processando.</p></article><article class="card"><h3>Correção</h3><p class="metric log-kpi-warn">${count('CORRIGIR')}</p><p class="muted">Devolvidas ao Gestor.</p></article><article class="card"><h3>Recusadas</h3><p class="metric log-kpi-danger">${count('RECUSADO')}</p><p class="muted">Encerradas sem O.S.</p></article><article class="card"><h3>Cadastradas</h3><p class="metric log-kpi-ok">${count('CADASTRADO')}</p><p class="muted">Número devolvido.</p></article></div>${ordered.length?`<div class="log-table-wrap"><table class="log-table"><thead><tr><th>Solicitação</th><th>Supervisão</th><th>Cliente</th><th>Produto</th><th></th></tr></thead><tbody>${ordered.map(rowHtml).join('')}</tbody></table></div>`:'<div class="log-empty">Nenhuma solicitação de abertura de O.S.</div>'}</div>`;
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

// ── modal de detalhe (visualiza tudo, texto maior, e as 4 ações) ──
function camposCorrigirHtml(row){
  if(String(row.status||'').toUpperCase()!=='CORRIGIR')return '';
  const campos=Array.isArray(row.campos_corrigir)?row.campos_corrigir:[];
  if(!campos.length)return '';
  return `<div class="ds-modal-full"><div class="ds-modal-label">Campos marcados para correção</div><div class="ds-modal-value">${campos.map(c=>`<span class="ab-campo-badge">${esc(labelCampoAberturaOs(typeof c==='string'?c:c.campo))}</span>`).join(' ')}</div></div>`;
}
function pontosProblemaHtml(row){
  const pontos=Array.isArray(row.pontos_problema)?row.pontos_problema:[];
  if(!pontos.length)return '';
  const ordenados=[...pontos].sort((a,b)=>String(b.em||'').localeCompare(String(a.em||'')));
  return `<div class="ds-modal-full"><div class="ds-modal-label">❗ Pontos com problema reportados ao Gestor</div><div class="ds-modal-value">${ordenados.map(p=>`<div class="ab-ponto-problema-item">${esc(p.descricao||'-')}<span> · ${date(p.em,true)}</span></div>`).join('')}</div></div>`;
}

function detalheHtml(row){
  const testes=testesResumo(row);
  return `<h3 class="ds-modal-title">Solicitação de Abertura de O.S.</h3>
    <div class="ds-modal-grid">
      <div><div class="ds-modal-label">Solicitação</div><div class="ds-modal-value">${date(row.created_at,true)}</div></div>
      <div><div class="ds-modal-label">Status</div><div class="ds-modal-value">${badge(row)}</div></div>
      <div><div class="ds-modal-label">Regional / Supervisão</div><div class="ds-modal-value">${esc(row.regional||'-')}</div></div>
      <div><div class="ds-modal-label">Solicitante</div><div class="ds-modal-value">${esc(row.solicitante_nome||'-')}</div></div>
      <div><div class="ds-modal-label">Cliente contratante</div><div class="ds-modal-value">${esc(row.contratante_cliente||'-')}</div></div>
      <div><div class="ds-modal-label">Filial pagadora</div><div class="ds-modal-value">${esc(row.filial_pagadora||'-')}</div></div>
      <div><div class="ds-modal-label">Produtor</div><div class="ds-modal-value">${esc(row.produtor||'-')}</div></div>
      <div><div class="ds-modal-label">Número do contrato</div><div class="ds-modal-value">${esc(row.numero_contrato||'-')}</div></div>
      <div><div class="ds-modal-label">Armazém de embarque</div><div class="ds-modal-value">${esc(row.armazem_embarque||'-')}</div></div>
      <div><div class="ds-modal-label">Cidade de embarque</div><div class="ds-modal-value">${esc(row.cidade_embarque||'-')}</div></div>
      <div><div class="ds-modal-label">Local de destino</div><div class="ds-modal-value">${esc(row.local_destino||'-')}</div></div>
      <div><div class="ds-modal-label">Cidade de destino</div><div class="ds-modal-value">${esc(row.cidade_destino||'-')}</div></div>
      <div><div class="ds-modal-label">Produto</div><div class="ds-modal-value">${esc(row.produto||'-')}</div></div>
      <div><div class="ds-modal-label">Tipo de produto</div><div class="ds-modal-value">${esc(row.tipo_produto||'-')}</div></div>
      <div><div class="ds-modal-label">Volume inicial</div><div class="ds-modal-value">${num(row.volume_inicial)} tons</div></div>
      <div><div class="ds-modal-label">Serviço</div><div class="ds-modal-value">${esc(row.servico||'-')}</div></div>
      <div><div class="ds-modal-label">Troca de notas</div><div class="ds-modal-value">${esc(row.troca_notas||'-')}</div></div>
      ${testes?`<div class="ds-modal-full"><div class="ds-modal-label">Testes</div><div class="ds-modal-value">${testes}</div></div>`:''}
      ${row.status==='CADASTRADO'?`<div class="ds-modal-full"><div class="ds-modal-label">Número da O.S.</div><div class="ds-modal-value">${esc(row.numero_os_cadastrada||'-')}</div></div>`:''}
      ${row.erro_agente?`<div class="ds-modal-full"><div class="ds-modal-label">Erro do agente</div><div class="ds-modal-value" style="color:#fca5a5">${esc(row.erro_agente)}</div></div>`:''}
      ${row.observacao_adm?`<div class="ds-modal-full"><div class="ds-modal-label">Observação do ADM</div><div class="ds-modal-value">${esc(row.observacao_adm)}</div></div>`:''}
      ${camposCorrigirHtml(row)}
      ${pontosProblemaHtml(row)}
    </div>
    <div id="aberturaDetalheAcoes">${acoesDetalheHtml(row)}</div>`;
}

function acoesDetalheHtml(row){
  const st=String(row.status||'PENDENTE').toUpperCase();
  const id=esc(row.id);
  const podeDecidir=st==='PENDENTE'||st==='ERRO';
  if(!podeDecidir){
    if(st==='APROVADO')return '<div class="log-meta">Job enfileirado. Aguardando o worker.</div>';
    if(st==='PROCESSANDO')return '<div class="log-meta">O agente está preenchendo a O.S. no GRM.</div>';
    if(st==='CORRIGIR')return '<div class="log-meta">Devolvida ao Gestor para correção e reenvio.</div>';
    if(st==='RECUSADO')return '<div class="log-meta">Solicitação encerrada sem abrir O.S.</div>';
    if(st==='CADASTRADO')return `<div class="log-meta">Número devolvido ao Gestor em ${date(row.cadastrado_em,true)}.</div>`;
    return '';
  }
  return `<div class="ab-icon-actions">
      <button class="ab-icon-btn ok" data-abertura-action="OK" title="Confirmar${st==='ERRO'?' (tentar novamente)':''}" type="button">✓</button>
      <button class="ab-icon-btn correct" data-abertura-toggle="corrigir" title="Solicitar correção" type="button">✎</button>
      <button class="ab-icon-btn reject" data-abertura-toggle="recusar" title="Recusar" type="button">✗</button>
      <button class="ab-icon-btn alert" data-abertura-toggle="problema" title="Informar ponto com problema" type="button">❗</button>
    </div>
    <div class="ab-subpainel" id="abPainelCorrigir" hidden></div>
    <div class="ab-subpainel" id="abPainelRecusar" hidden></div>
    <div class="ab-subpainel" id="abPainelProblema" hidden></div>`;
}

function painelCorrigirHtml(){
  return `<p class="log-meta">Marque os campos que precisam de correção:</p>
    <div class="ab-campos-grid">${CAMPOS_ABERTURA_OS.map(c=>`<label class="ab-campo-chk"><input type="checkbox" data-corrigir-campo="${c.key}"> ${esc(c.label)}</label>`).join('')}</div>
    <textarea class="log-input log-textarea" data-ab-obs placeholder="Descreva o que precisa ser corrigido (obrigatório)"></textarea>
    <div class="ab-subpainel-actions"><button class="btn btn-secondary" data-abertura-cancelar type="button">Cancelar</button><button class="btn btn-primary" data-abertura-confirmar="CORRIGIR" type="button">Enviar correção</button></div>`;
}
function painelRecusarHtml(){
  return `<textarea class="log-input log-textarea" data-ab-obs placeholder="Motivo da recusa (obrigatório)"></textarea>
    <div class="ab-subpainel-actions"><button class="btn btn-secondary" data-abertura-cancelar type="button">Cancelar</button><button class="btn abertura-recusar" data-abertura-confirmar="RECUSAR" type="button">Confirmar recusa</button></div>`;
}
function painelProblemaHtml(){
  return `<textarea class="log-input log-textarea" data-ab-problema-texto placeholder="Descreva o ponto com problema (ex.: acesso ruim no armazém de embarque)"></textarea>
    <div class="ab-subpainel-actions"><button class="btn btn-secondary" data-abertura-cancelar type="button">Cancelar</button><button class="btn btn-primary" data-abertura-informar-problema type="button">Enviar aviso ao Gestor</button></div>`;
}

function hidePaineis(overlay){['abPainelCorrigir','abPainelRecusar','abPainelProblema'].forEach(pid=>{const el=overlay.querySelector('#'+pid);if(el){el.hidden=true;el.innerHTML='';}});}
function showPainel(overlay,kind){
  hidePaineis(overlay);
  const map={corrigir:['abPainelCorrigir',painelCorrigirHtml],recusar:['abPainelRecusar',painelRecusarHtml],problema:['abPainelProblema',painelProblemaHtml]};
  const entry=map[kind];
  if(!entry)return;
  const [pid,fn]=entry;
  const el=overlay.querySelector('#'+pid);
  if(!el)return;
  el.hidden=false;
  el.innerHTML=fn();
}

async function decide(id,action,{obs=null,campos=[]}={},button){
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent=action==='OK'?'Enfileirando...':'Salvando...';}
  const {data,error}=await supabase.rpc('decidir_abertura_os',{p_id:id,p_acao:action,p_observacao:obs,p_campos_corrigir:campos});
  if(error){
    toast(error.message,'err');
    if(button){button.disabled=false;button.textContent=original;}
    return;
  }
  closeModal('aberturaDetalheModal');
  await load();
  if(action==='OK')toast(`Solicitação aprovada.${data?.job_id?' Agente enfileirado para abrir no GRM.':''}`,'ok');
  else if(action==='CORRIGIR')toast('Correção solicitada ao Gestor.','ok');
  else toast('Solicitação recusada.','ok');
}

function abrirDetalhe(row){
  const overlay=openModal({id:'aberturaDetalheModal',conteudoHtml:detalheHtml(row)+'<div class="ds-modal-actions" style="margin-top:16px"><button class="ds-btn" data-ds-fechar type="button">Fechar</button></div>'});
  overlay.querySelector('[data-ds-fechar]')?.addEventListener('click',()=>closeModal('aberturaDetalheModal'));
  overlay.addEventListener('click',async(event)=>{
    const toggle=event.target.closest('[data-abertura-toggle]');
    if(toggle){showPainel(overlay,toggle.dataset.aberturaToggle);return;}
    const cancelar=event.target.closest('[data-abertura-cancelar]');
    if(cancelar){hidePaineis(overlay);return;}

    const btnOk=event.target.closest('[data-abertura-action="OK"]');
    if(btnOk){
      const ok=await confirmar({titulo:'Confirmar abertura de O.S.',mensagem:'O agente será enfileirado para abrir a O.S. no GRM e devolver o número. Confirmar?',confirmarLabel:'Confirmar'});
      if(ok)await decide(row.id,'OK',{},btnOk);
      return;
    }

    const btnCorrigir=event.target.closest('[data-abertura-confirmar="CORRIGIR"]');
    if(btnCorrigir){
      const painel=overlay.querySelector('#abPainelCorrigir');
      const campos=[...painel.querySelectorAll('[data-corrigir-campo]:checked')].map(chk=>({campo:chk.dataset.corrigirCampo,label:labelCampoAberturaOs(chk.dataset.corrigirCampo)}));
      const obs=painel.querySelector('[data-ab-obs]')?.value?.trim();
      if(!campos.length){toast('Selecione ao menos um campo para corrigir.','err');return;}
      if(!obs){toast('Descreva o que precisa ser corrigido.','err');return;}
      await decide(row.id,'CORRIGIR',{obs,campos},btnCorrigir);
      return;
    }

    const btnRecusar=event.target.closest('[data-abertura-confirmar="RECUSAR"]');
    if(btnRecusar){
      const painel=overlay.querySelector('#abPainelRecusar');
      const obs=painel.querySelector('[data-ab-obs]')?.value?.trim();
      if(!obs){toast('Informe o motivo da recusa.','err');return;}
      await decide(row.id,'RECUSAR',{obs},btnRecusar);
      return;
    }

    const btnProblema=event.target.closest('[data-abertura-informar-problema]');
    if(btnProblema){
      const painel=overlay.querySelector('#abPainelProblema');
      const texto=painel.querySelector('[data-ab-problema-texto]')?.value?.trim();
      if(!texto){toast('Descreva o ponto com problema.','err');return;}
      btnProblema.disabled=true;
      const {data,error}=await supabase.rpc('informar_ponto_problema_abertura_os',{p_id:row.id,p_descricao:texto});
      btnProblema.disabled=false;
      if(error){toast(error.message,'err');return;}
      toast('Ponto com problema enviado ao Gestor.','ok');
      row.pontos_problema=[...(Array.isArray(row.pontos_problema)?row.pontos_problema:[]),data.ponto];
      const idx=rows.findIndex(r=>String(r.id)===String(row.id));
      if(idx>=0)rows[idx]=row;
      render();
      abrirDetalhe(row);
      return;
    }
  });
}

function injectStyle(){if(document.getElementById('abertura-workflow-style'))return;const style=document.createElement('style');style.id='abertura-workflow-style';style.textContent=`.abertura-kpis{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin-bottom:14px}.abertura-kpis article.card{padding:10px 12px}.abertura-kpis h3{font-size:11px;margin:0 0 2px;text-transform:uppercase;color:#9fb7aa}.abertura-kpis .metric{font-size:22px;margin:0}.abertura-kpis .muted{font-size:10px;margin:2px 0 0}.ab-abrir-cell{display:flex;align-items:center;justify-content:flex-end;gap:8px}.ab-problema-dot{font-size:14px;cursor:default}.abertura-recusar{background:rgba(127,29,29,.82)!important;color:#fecaca!important;border:1px solid rgba(239,68,68,.35)!important}.ab-icon-actions{display:flex;gap:8px;margin-top:6px}.ab-icon-btn{width:38px;height:38px;border-radius:10px;border:1px solid transparent;font-size:18px;font-weight:900;line-height:1;cursor:pointer;transition:transform .14s ease}.ab-icon-btn:hover{transform:translateY(-1px)}.ab-icon-btn:disabled{opacity:.4;cursor:wait;transform:none}.ab-icon-btn.ok{border-color:rgba(22,215,144,.34);background:rgba(22,215,144,.13);color:#75edb7}.ab-icon-btn.correct{border-color:rgba(250,204,21,.34);background:rgba(250,204,21,.13);color:#fde68a}.ab-icon-btn.reject{border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.1);color:#fca5a5}.ab-icon-btn.alert{border-color:rgba(251,146,60,.34);background:rgba(251,146,60,.13);color:#fdba74}.ab-subpainel{margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(15,23,42,.36)}.ab-campos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;margin:8px 0}.ab-campo-chk{display:flex;align-items:center;gap:6px;font-size:12px;color:#cbd5e1}.ab-campo-badge{display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:999px;background:rgba(250,204,21,.14);color:#fde68a;font-size:11px;font-weight:700}.ab-ponto-problema-item{padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#fdba74}.ab-ponto-problema-item:last-child{border-bottom:0}.ab-ponto-problema-item span{color:#8fa1b5;font-size:11px}.ab-subpainel-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}@media(max-width:1100px){.abertura-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){.abertura-kpis{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(style);}

async function boot(){
  const list=await waitFor('#aberturaOsList');injectStyle();
  list.addEventListener('click',event=>{
    const abrir=event.target.closest('[data-abertura-abrir]');
    if(!abrir)return;
    event.preventDefault();
    const row=rows.find(r=>String(r.id)===String(abrir.dataset.aberturaAbrir));
    if(row)abrirDetalhe(row);
  });
  document.addEventListener('click',event=>{const reload=event.target.closest('#aberturaOsReload');if(!reload)return;event.preventDefault();event.stopImmediatePropagation();load();},true);
  new MutationObserver(()=>{if(!rendering&&!list.querySelector('[data-abertura-workflow-root]'))render();}).observe(list,{childList:true});
  const channel=supabase.channel('logistica-abertura-os-workflow').on('postgres_changes',{event:'*',schema:'public',table:'logistica_abertura_os'},()=>load()).subscribe();
  addEventListener('beforeunload',()=>supabase.removeChannel(channel),{once:true});
  await load();
}

boot().catch(error=>console.error('[abertura-os-workflow]',error));
