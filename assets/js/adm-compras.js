import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

const TABS = [
  ['solicitacoes','SOLICITAÇÕES'], ['cotacoes','COTAÇÕES'], ['analise','APROVAÇÃO'], ['aguardando','À PAGAR'], ['nf','NF'], ['termos','TERMOS'], ['comprados','COMPRADOS'], ['recusados','RECUSADOS'], ['catalogo','CATÁLOGO']
];
const STATUS = { pendente:'Pendente', em_cotacao:'Em cotação', em_analise:'Em análise', pendente_pagamento:'Pendente pagamento', aguardando_nf:'Aguardando NF', aguardando_termo:'Aguardando Termo', comprado:'Comprado', recusado:'Recusado' };
const state = { tab:'solicitacoes', rows:[], selected:new Set(), cotacao:null, colaboradores:[], cotacaoCache:{}, gruposSeparados:new Set(), catalogo:[] };
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
const money=(v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const norm=(v)=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const isEPI=(r)=>norm(r?.tipo||'').includes('epi');
function setMsg(msg,err=false){const el=document.getElementById('admCmpFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
function pill(v){return `<span class="adm-cmp-status ${esc(v)}">${esc(STATUS[v]||v||'-')}</span>`}
async function safe(fn,fallback=[]){try{const {data,error}=await fn(); if(error) throw error; return data||fallback;}catch(e){console.warn(e);return fallback;}}

// Agrupa pagamentos de Compras: se já existe um financeiro_pagamentos aberto (mesmo status)
// para o mesmo fornecedor/forma/dados, soma o valor nele em vez de criar um lançamento duplicado.
function normalizeFinPay(value){return String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}
function sameTextFinPay(a,b){return normalizeFinPay(a)===normalizeFinPay(b)}
function paymentKeyFinPay(payload){const fornecedor=payload?.fornecedor||payload?.favorecido||''; const forma=payload?.forma_pagamento||''; const dados=payload?.dados_pagamento||''; return [fornecedor,forma,dados].map(normalizeFinPay).join('|')}
function isComprasPayment(payload){if(!payload||Array.isArray(payload))return false; if(normalizeFinPay(payload.origem)!=='COMPRAS')return false; if(!Number.isFinite(Number(payload.valor))||Number(payload.valor)<=0)return false; return true}
function mergeDescriptionFinPay(current,incoming){const atual=String(current||'').trim(); const novo=String(incoming||'').trim(); if(!atual)return novo; if(!novo)return atual; if(normalizeFinPay(atual).includes(normalizeFinPay(novo)))return atual; return `${atual} | ${novo.replace(/^Compra:\s*/i,'')}`}
async function findOpenComprasPayment(payload){
  const status=payload.status||'PENDENTE'; const forma=payload.forma_pagamento||null; const targetKey=paymentKeyFinPay(payload);
  let query=supabase.from('financeiro_pagamentos').select('id,origem,origem_id,descricao,favorecido,fornecedor,forma_pagamento,dados_pagamento,valor,status,created_at').eq('origem','COMPRAS').eq('status',status).order('created_at',{ascending:false}).limit(200);
  if(forma) query=query.eq('forma_pagamento',forma);
  const {data,error}=await query;
  if(error){console.warn('[compras-financeiro-grouping] Falha ao buscar pagamentos existentes:',error); return null}
  return (data||[]).find((row)=>{
    if(String(row.origem_id||'')===String(payload.origem_id||''))return false;
    if(!sameTextFinPay(row.forma_pagamento||'',payload.forma_pagamento||''))return false;
    return paymentKeyFinPay(row)===targetKey;
  })||null;
}
async function mergeOrInsertComprasPayment(payload,options){
  if(!isComprasPayment(payload)) return supabase.from('financeiro_pagamentos').insert(payload,options);
  const existing=await findOpenComprasPayment(payload);
  if(!existing) return supabase.from('financeiro_pagamentos').insert(payload,options);
  const valorAtual=Number(existing.valor||0); const valorNovo=Number(payload.valor||0);
  const updatePayload={
    valor:valorAtual+valorNovo,
    descricao:mergeDescriptionFinPay(existing.descricao,payload.descricao),
    favorecido:payload.favorecido||existing.favorecido||payload.fornecedor||null,
    fornecedor:payload.fornecedor||existing.fornecedor||null,
    contato:payload.contato||existing.contato||null,
    dados_pagamento:payload.dados_pagamento||existing.dados_pagamento||null,
  };
  console.info('[compras-financeiro-grouping] Pagamento agrupado ao lançamento existente:',{pagamento_id:existing.id,valor_anterior:valorAtual,valor_adicionado:valorNovo,valor_total:updatePayload.valor});
  return supabase.from('financeiro_pagamentos').update(updatePayload).eq('id',existing.id).select('*');
}
async function loadColaboradores(){
  // Usa cache compartilhado (foto mais recente, via view colaboradores_atuais).
  try{ state.colaboradores=await getColaboradores({somenteAtivos:true}); }
  catch(e){ console.warn(e); state.colaboradores=[]; }
}
async function notifyByConfig(setor, message){
  const cfgs=await safe(()=>supabase.from('compras_notificacoes_config').select('*').eq('setor',setor).eq('ativo',true).limit(10));
  let ok=0; for(const cfg of cfgs){ if(!cfg.telefone) continue; try{const res=await fetch('/api/botconversa/send-message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({empresa:cfg.empresa||'Grao 1000',nome:cfg.nome||setor,telefone:cfg.telefone,cpf:cfg.cpf||'',mensagem:message})}); if(res.ok) ok++;}catch(e){console.warn(e)}} return ok;
}
function setCatalogoMsg(msg,err=false){const el=document.getElementById('admCmpCatalogoFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
async function loadCatalogoRows(){
  state.catalogo=await safe(()=>supabase.from('compras_catalogo').select('*').order('material'));
  renderCatalogoTable();
}
function renderCatalogoTable(){
  const body=document.getElementById('admCmpCatalogoBody');
  if(!body) return;
  if(!state.catalogo.length){ body.innerHTML='<tr><td colspan="5" class="adm-cmp-empty">Nenhum material cadastrado.</td></tr>'; return; }
  body.innerHTML=state.catalogo.map(c=>`<tr>
    <td>${esc(c.material)}</td><td>${esc(c.tipo)}</td><td>${esc(c.observacao||'-')}</td>
    <td>${c.ativo?'<span class="adm-cmp-status comprado">Ativo</span>':'<span class="adm-cmp-status recusado">Inativo</span>'}</td>
    <td><button class="btn btn-small btn-secondary" data-cat-editar="${esc(c.id)}" type="button">Editar</button> <button class="btn btn-small btn-secondary" data-cat-toggle="${esc(c.id)}" type="button">${c.ativo?'Inativar':'Reativar'}</button></td>
  </tr>`).join('');
  body.querySelectorAll('[data-cat-toggle]').forEach(b=>b.onclick=()=>toggleCatalogoAtivo(b.dataset.catToggle).catch(e=>setCatalogoMsg(e.message,true)));
  body.querySelectorAll('[data-cat-editar]').forEach(b=>b.onclick=()=>abrirEditarCatalogoModal(b.dataset.catEditar));
}
function abrirEditarCatalogoModal(id){
  const item=state.catalogo.find(c=>String(c.id)===String(id));
  if(!item) return;
  const modal=document.getElementById('admCmpModal');
  modal.innerHTML=`<div class="adm-cmp-modal-card"><div class="section-head"><div><h3>Editar material</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div><div class="adm-cmp-grid mt-16"><label>Material<input id="catEditMaterial" value="${esc(item.material)}"></label><label>Tipo<select id="catEditTipo"><option value="Uniforme"${item.tipo==='Uniforme'?' selected':''}>Uniforme</option><option value="Patrimonio"${item.tipo==='Patrimonio'?' selected':''}>Patrimônio</option><option value="EPI"${item.tipo==='EPI'?' selected':''}>EPI</option><option value="Outros"${item.tipo==='Outros'?' selected':''}>Outros</option></select></label><label class="adm-cmp-full">Observação<input id="catEditObs" value="${esc(item.observacao||'')}"></label></div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="catSalvar" type="button">Salvar</button><span class="adm-cmp-feedback" id="catEditFeedback"></span></div></div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#catSalvar').onclick=async()=>{
    const material=modal.querySelector('#catEditMaterial').value.trim();
    const tipo=modal.querySelector('#catEditTipo').value;
    const observacao=modal.querySelector('#catEditObs').value.trim()||null;
    if(!material){ modal.querySelector('#catEditFeedback').textContent='Informe o material.'; return; }
    const {error}=await supabase.from('compras_catalogo').update({material:material.toUpperCase(),tipo,observacao}).eq('id',id);
    if(error){ modal.querySelector('#catEditFeedback').textContent=error.message; return; }
    modal.classList.remove('open');
    await loadCatalogoRows();
  };
}
async function adicionarCatalogoItem(){
  const material=document.getElementById('catNovoMaterial')?.value.trim();
  const tipo=document.getElementById('catNovoTipo')?.value;
  const observacao=document.getElementById('catNovaObs')?.value.trim()||null;
  if(!material){ setCatalogoMsg('Informe o nome do material.',true); return; }
  const {error}=await supabase.from('compras_catalogo').insert({material:material.toUpperCase(),tipo,observacao});
  if(error){ setCatalogoMsg(error.message,true); return; }
  document.getElementById('catNovoMaterial').value='';
  document.getElementById('catNovaObs').value='';
  setCatalogoMsg('Material adicionado ao catálogo.');
  await loadCatalogoRows();
}
async function toggleCatalogoAtivo(id){
  const item=state.catalogo.find(c=>String(c.id)===String(id));
  if(!item) return;
  const {error}=await supabase.from('compras_catalogo').update({ativo:!item.ativo}).eq('id',id);
  if(error){ setCatalogoMsg(error.message,true); return; }
  await loadCatalogoRows();
}

async function loadRows(){
  const itensSection=document.getElementById('admCmpItensSection');
  const catalogoSection=document.getElementById('admCmpCatalogoSection');
  if(itensSection) itensSection.style.display=state.tab==='catalogo'?'none':'';
  if(catalogoSection) catalogoSection.style.display=state.tab==='catalogo'?'':'none';
  if(state.tab==='catalogo'){ await loadCatalogoRows(); return; }
  const wrap=document.getElementById('admCmpListWrap');
  wrap?.classList.add('is-loading');
  try{
    const statusByTab={solicitacoes:['pendente'],cotacoes:['em_cotacao'],analise:['em_analise'],aguardando:['pendente_pagamento'],nf:['aguardando_nf'],termos:['aguardando_termo'],comprados:['comprado'],recusados:['recusado']};
    let q=supabase.from('compras_itens').select('*, compras_solicitacoes(*)').order('created_at',{ascending:false}).limit(500);
    const statuses=statusByTab[state.tab]||[]; if(statuses.length) q=q.in('status',statuses);
    const {data,error}=await q; if(error){if(wrap) wrap.innerHTML=`<div class="adm-cmp-empty">${esc(error.message)}<br>Execute a migration de compras no Supabase.</div>`;return;}
    state.rows=data||[]; state.selected.clear(); renderTable();
  } finally {
    wrap?.classList.remove('is-loading');
  }
}
function rowLabel(r){return `${r.quantidade||r.unidade||1} un | ${r.material}${r.tamanho?` (${r.tamanho})`:''}${r.colaborador_nome?` | ${r.colaborador_nome}`:''}`;}

function updateSelCount(){
  const el=document.getElementById('admCmpSelCount');
  if(el) el.textContent=state.selected.size?`${state.selected.size} selecionado(s)`:'';
}
function bindCheckHandlers(body){
  const rowSel='tr, .adm-cmp-card-row';
  body.querySelectorAll('[data-check]').forEach(c=>{
    c.checked=state.selected.has(c.dataset.check);
    c.closest(rowSel)?.classList.toggle('is-selected',c.checked);
    c.onchange=()=>{
      c.checked?state.selected.add(c.dataset.check):state.selected.delete(c.dataset.check);
      c.closest(rowSel)?.classList.toggle('is-selected',c.checked);
      updateSelCount();
    };
  });
  body.querySelectorAll('[data-check-group]').forEach(c=>{
    const ids=c.dataset.checkGroup.split(',');
    c.checked=ids.every(id=>state.selected.has(id));
    c.closest(rowSel)?.classList.toggle('is-selected',c.checked);
    c.onchange=()=>{
      ids.forEach(id=>c.checked?state.selected.add(id):state.selected.delete(id));
      c.closest(rowSel)?.classList.toggle('is-selected',c.checked);
      ids.forEach(id=>{
        const child=body.querySelector(`[data-check="${CSS.escape(id)}"]`);
        if(child){ child.checked=c.checked; child.closest(rowSel)?.classList.toggle('is-selected',c.checked); }
      });
      updateSelCount();
    };
  });
  updateSelCount();
}

function groupKey(r, useNf=false){
  if(useNf){ const nf=norm(r.nf_url||''); if(nf) return `nf:${nf}`; }
  const fn=norm(r.fornecedor||'');
  const dp=norm(r.dados_pagamento||'');
  const fp=norm(r.forma_pagamento||'');
  if(fn) return `fn:${fn}`;
  if(dp) return `dp:${fp}:${dp}`;
  return `solo:${r.id}`;
}

// ─── Ícones de ação em linha (mesmo padrão visual de Conferência) ─────────────
const ICONS={
  check:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  tag:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3a1 1 0 0 0-1 1l.24 5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.82 0l4.36-4.36a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>`,
  send:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  doc:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></svg>`,
};
const ROW_ACTION_ICONS={cotar:'tag',aprovar_solicitar:'send',recusar:'x',comprar:'check',cancelar:'x',aprovar:'check',reprovar:'x',finalizar:'doc',finalizar_grupo:'doc'};
function iconBtn(action,id,title){
  return `<button class="adm-cmp-icon-btn" data-row-action="${esc(action)}" data-id="${esc(id)}" type="button" title="${esc(title)}" aria-label="${esc(title)}">${ICONS[ROW_ACTION_ICONS[action]]}</button>`;
}
function nfLinkHtml(r){
  const nfUrl=r?.nf_url||'';
  if(!nfUrl) return '<span class="muted">-</span>';
  return /^https?:\/\//i.test(nfUrl)?`<a href="${esc(nfUrl)}" target="_blank" rel="noopener" style="color:#86efac;font-size:12px">Ver NF</a>`:`<small class="muted">${esc(nfUrl)}</small>`;
}
function actionsCellForTab(r){
  if(state.tab==='analise') return `<div class="adm-cmp-row-actions">${iconBtn('aprovar',r.id,'Aprovar')}${iconBtn('reprovar',r.id,'Reprovar')}</div>`;
  if(state.tab==='nf') return `<div class="adm-cmp-row-actions">${iconBtn('finalizar',r.id,'Finalizar')}</div>`;
  if(state.tab==='recusados') return `<small class="muted">${esc(r.motivo_recusa||'-')}</small>`;
  if(state.tab==='comprados') return nfLinkHtml(r);
  return '<span class="muted">-</span>';
}

function singleRowHtml(r){
  const s=r.compras_solicitacoes||{};
  return `<tr>
    <td><input type="checkbox" data-check="${esc(r.id)}"></td><td>${brDate(s.data_solicitacao)}</td><td>${esc(s.solicitante||'-')}<br><small>${esc(s.coordenacao||'')}</small></td><td>${esc(r.quantidade||r.unidade||1)}</td><td>${esc(r.material)}${r.tamanho?`<br><small>Tam: ${esc(r.tamanho)}</small>`:''}${r.colaborador_nome?`<br><small>${esc(r.colaborador_nome)}</small>`:''}${r.codigo?`<br><small style="color:#86efac">Cód: ${esc(r.codigo)}</small>`:''}</td><td>${esc(r.tipo||'-')}</td><td>${pill(r.status)}</td><td>${money(r.valor_total||0)}</td><td>${actionsCellForTab(r)}</td>
  </tr>`;
}

// ─── Cards (SOLICITAÇÕES agrupa por solicitação) ──────────────────────────────
function rowActionsHtml(r){
  if(state.tab==='solicitacoes') return `${iconBtn('cotar',r.id,'Cotar')}${iconBtn('aprovar_solicitar',r.id,'Solicitar aprovação')}${iconBtn('recusar',r.id,'Recusar')}`;
  if(state.tab==='cotacoes') return `${iconBtn('comprar',r.id,'Comprar')}${iconBtn('cancelar',r.id,'Cancelar')}`;
  return '';
}
function cardRowHtml(r){
  return `<div class="adm-cmp-card-row" data-row-id="${esc(r.id)}">
    <input type="checkbox" data-check="${esc(r.id)}">
    <div class="adm-cmp-card-row-info">
      <strong>${esc(r.quantidade||r.unidade||1)}x ${esc(r.material)}</strong>
      <small>${esc(r.tipo||'-')}${r.tamanho?` · Tam: ${esc(r.tamanho)}`:''}${r.uniforme_cor?` · Cor: ${esc(r.uniforme_cor)}`:''}${r.colaborador_nome?` · ${esc(r.colaborador_nome)}`:''}${r.codigo?` · Cód: ${esc(r.codigo)}`:''}</small>
    </div>
    <div class="adm-cmp-card-row-value">${money(r.valor_total||0)}</div>
    <div class="adm-cmp-card-row-actions">${rowActionsHtml(r)}</div>
  </div>`;
}
function cardHtml(itens){
  const s=itens[0].compras_solicitacoes||{};
  const total=itens.reduce((sum,r)=>sum+Number(r.valor_total||0),0);
  const totalQtd=itens.reduce((sum,r)=>sum+Number(r.quantidade||r.unidade||1),0);
  const ids=itens.map(r=>r.id).join(',');
  return `<article class="adm-cmp-card">
    <div class="adm-cmp-card-head">
      <label class="adm-cmp-card-select"><input type="checkbox" data-check-group="${esc(ids)}"><div><strong>${esc(s.solicitante||'Gestor')}</strong><small>${esc(s.coordenacao||s.supervisao||'')} · ${brDate(s.data_solicitacao)}</small></div></label>
      <div class="adm-cmp-card-meta"><span>${totalQtd}&nbsp;un · ${itens.length} ${itens.length===1?'item':'itens'}</span><strong>${money(total)}</strong></div>
    </div>
    <div class="adm-cmp-card-body">${itens.map(cardRowHtml).join('')}</div>
  </article>`;
}
function renderCards(container,rows){
  if(!rows.length){container.innerHTML='<div class="adm-cmp-empty">Nenhum item nesta etapa.</div>'; return;}
  const groups=new Map();
  rows.forEach(r=>{const sid=r.solicitacao_id||r.compras_solicitacoes?.id||`solo:${r.id}`; if(!groups.has(sid))groups.set(sid,[]); groups.get(sid).push(r);});
  container.innerHTML=[...groups.values()].map(cardHtml).join('');
  bindCheckHandlers(container);
  wireRowActions(container);
}

// ─── Cards (COTAÇÕES agrupa por gestor+cidade — auto, com "Separar") ──────────
// Itens sem cidade informada caem sozinhos (não agrupa às cegas quando não há
// como confirmar que é a mesma compra).
function groupKeyCotacao(r){
  const s=r.compras_solicitacoes||{};
  const cidade=norm(s.cidade||'');
  const gestor=norm(s.solicitante||'');
  if(!cidade||!gestor) return `solo:${r.id}`;
  return `cot:${gestor}|${cidade}`;
}
function cotacaoMessage(rows){
  const linhas=rows.map(r=>`${r.quantidade||r.unidade||1} un | ${r.material}${r.tamanho?` | ${r.tamanho}`:''}`).join('\n');
  return `Solicitação de cotação\n${linhas}\n\nO fornecedor emite Nota Fiscal?`;
}
async function gerarMensagemCotacao(rows){
  if(!rows.length) return;
  const msg=cotacaoMessage(rows);
  await updateItems(rows,{mensagem_cotacao:msg});
  await navigator.clipboard?.writeText(msg).catch(()=>{});
  setMsg('Mensagem de cotação gerada e copiada.');
  await loadRows();
}
function cotacaoCardHtml(itens,gkey){
  const s=itens[0].compras_solicitacoes||{};
  const total=itens.reduce((sum,r)=>sum+Number(r.valor_total||0),0);
  const ids=itens.map(r=>r.id).join(',');
  const podeSeparar=itens.length>1&&gkey&&!gkey.startsWith('solo:');
  return `<article class="adm-cmp-card">
    <div class="adm-cmp-card-head">
      <label class="adm-cmp-card-select"><input type="checkbox" data-check-group="${esc(ids)}"><div><strong>${esc(s.solicitante||'Gestor')}</strong><small>${esc(s.cidade||'')}${s.uf?`/${esc(s.uf)}`:''}</small></div></label>
      <div class="adm-cmp-card-meta"><span>${itens.length} ${itens.length===1?'item':'itens'}</span><strong>${money(total)}</strong>
        <button class="btn btn-small btn-secondary" data-cotar-msg="${esc(ids)}" type="button">Gerar mensagem</button>
        ${podeSeparar?`<button class="btn btn-small btn-secondary" data-separar-grupo="${esc(gkey)}" type="button">Separar</button>`:''}
      </div>
    </div>
    <div class="adm-cmp-card-body">${itens.map(cardRowHtml).join('')}</div>
  </article>`;
}
function renderCotacoesCards(container,rows){
  if(!rows.length){container.innerHTML='<div class="adm-cmp-empty">Nenhum item nesta etapa.</div>'; return;}
  const groups=new Map();
  rows.forEach(r=>{
    const k=state.gruposSeparados.has(groupKeyCotacao(r))?`solo:${r.id}`:groupKeyCotacao(r);
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k).push(r);
  });
  container.innerHTML=[...groups.entries()].map(([k,itens])=>cotacaoCardHtml(itens,k)).join('');
  bindCheckHandlers(container);
  wireRowActions(container);
  container.querySelectorAll('[data-cotar-msg]').forEach(b=>b.onclick=()=>{
    const ids=b.dataset.cotarMsg.split(',');
    gerarMensagemCotacao(state.rows.filter(r=>ids.includes(String(r.id)))).catch(e=>setMsg(e.message,true));
  });
  container.querySelectorAll('[data-separar-grupo]').forEach(b=>b.onclick=()=>{
    state.gruposSeparados.add(b.dataset.separarGrupo);
    renderTable();
  });
}

// ─── Wiring dos ícones de ação em linha ────────────────────────────────────────
function selectOnly(id){ state.selected=new Set([String(id)]); }
async function cancelarItem(r){ await supabase.from('compras_itens').update({status:'pendente'}).eq('id',r.id); setMsg('Item cancelado, voltou para SOLICITAÇÕES.'); await loadRows(); }
async function aprovarItem(r){ const quem=prompt('Quem está aprovando?','')||null; await supabase.from('compras_itens').update({status:'pendente', aprovado_por:quem, aprovado_em:new Date().toISOString()}).eq('id',r.id); setMsg('Item aprovado, voltou para SOLICITAÇÕES.'); await loadRows(); }
async function reprovarItem(r){ const motivo=prompt('Motivo da recusa:'); if(!motivo) return; const quem=prompt('Quem está recusando? (opcional)','')||null; await supabase.from('compras_itens').update({status:'recusado', recusado_por:quem, motivo_recusa:motivo}).eq('id',r.id); setMsg('Item reprovado.'); await loadRows(); }

function wireRowActions(container){
  container.querySelectorAll('[data-row-action]').forEach(btn=>{
    btn.onclick=async()=>{
      const action=btn.dataset.rowAction;
      if(action==='finalizar_grupo'){ openGrupoModal(btn.dataset.id); return; }
      const r=state.rows.find(x=>String(x.id)===String(btn.dataset.id));
      if(!r) return;
      try{
        if(action==='cotar'){ selectOnly(r.id); abrirCotarModal(); }
        else if(action==='aprovar_solicitar'){ selectOnly(r.id); await solicitarAprovacao(); }
        else if(action==='recusar'){ selectOnly(r.id); await recusarSelecionados(); }
        else if(action==='comprar'){ selectOnly(r.id); abrirCompraSelecionados(); }
        else if(action==='cancelar'){ await cancelarItem(r); }
        else if(action==='aprovar'){ await aprovarItem(r); }
        else if(action==='reprovar'){ await reprovarItem(r); }
        else if(action==='finalizar'){ openFinalizarModal(r); }
      }catch(e){ setMsg(e.message,true); }
    };
  });
}

function renderTable(){
  const wrap=document.getElementById('admCmpListWrap');
  const rows=state.rows;

  if(state.tab==='solicitacoes'){
    wrap.innerHTML=`<div class="adm-cmp-cards" id="admCmpBody"></div>`;
    renderCards(document.getElementById('admCmpBody'), rows);
    return;
  }
  if(state.tab==='cotacoes'){
    wrap.innerHTML=`<div class="adm-cmp-cards" id="admCmpBody"></div>`;
    renderCotacoesCards(document.getElementById('admCmpBody'), rows);
    return;
  }

  wrap.innerHTML=`<table class="adm-cmp-table"><thead><tr><th></th><th>Data</th><th>Gestor</th><th>Un.</th><th>Material</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody id="admCmpBody"></tbody></table>`;
  const body=document.getElementById('admCmpBody');
  if(!rows.length){body.innerHTML='<tr><td colspan="9" class="adm-cmp-empty">Nenhum item nesta etapa.</td></tr>'; return;}

  if(state.tab==='aguardando'||state.tab==='nf'){
    const groups=new Map();
    rows.forEach(r=>{const k=groupKey(r); if(!groups.has(k))groups.set(k,[]); groups.get(k).push(r);});
    body.innerHTML=[...groups.values()].map(itens=>{
      if(itens.length===1) return singleRowHtml(itens[0]);
      const totalGrp=itens.reduce((s,r)=>s+Number(r.valor_total||0),0);
      const s0=itens[0].compras_solicitacoes||{};
      const fn=itens[0].fornecedor||itens[0].dados_pagamento||'';
      const stGrp=state.tab==='nf'?'aguardando_nf':'pendente_pagamento';
      const gids=itens.map(r=>r.id).join(',');
      const acao=`<div class="adm-cmp-row-actions">${iconBtn('finalizar_grupo',gids,state.tab==='nf'?'Finalizar grupo':'Ver grupo')}</div>`;
      return `<tr class="adm-cmp-group-row">
        <td><input type="checkbox" data-check-group="${esc(gids)}"></td>
        <td>${brDate(s0.data_solicitacao)}</td>
        <td>${esc(s0.solicitante||'-')}<br><small>${esc(s0.coordenacao||'')}</small></td>
        <td>${itens.length}&nbsp;itens</td>
        <td><b style="color:#bbf7d0">${esc(fn||'Mesmo fornecedor')}</b><br><small class="muted">${itens.map(r=>esc(r.material)).join(' · ')}</small></td>
        <td>-</td>
        <td>${pill(stGrp)}</td>
        <td>${money(totalGrp)}</td>
        <td>${acao}</td>
      </tr>`;
    }).join('');
    bindCheckHandlers(body);
    wireRowActions(body);
    return;
  }

  if(state.tab==='comprados'){
    const groups=new Map();
    rows.forEach(r=>{const k=groupKey(r,true); if(!groups.has(k))groups.set(k,[]); groups.get(k).push(r);});
    body.innerHTML=[...groups.values()].map(itens=>{
      if(itens.length===1) return singleRowHtml(itens[0]);
      const totalGrp=itens.reduce((s,r)=>s+Number(r.valor_total||0),0);
      const s0=itens[0].compras_solicitacoes||{};
      const fn=itens[0].fornecedor||itens[0].dados_pagamento||'';
      const comprado_em=itens[0].comprado_em||itens[0].created_at||'';
      const gids=itens.map(r=>r.id).join(',');
      return `<tr class="adm-cmp-group-row">
        <td><input type="checkbox" data-check-group="${esc(gids)}"></td>
        <td>${brDate(comprado_em)}</td>
        <td>${esc(s0.solicitante||'-')}<br><small>${esc(s0.coordenacao||'')}</small></td>
        <td>${itens.length}&nbsp;itens</td>
        <td><b style="color:#bbf7d0">${esc(fn||'Mesmo fornecedor')}</b><br><small class="muted">${itens.map(r=>r.codigo?`${esc(r.material)} (${esc(r.codigo)})`:esc(r.material)).join(' · ')}</small></td>
        <td>-</td>
        <td>${pill('comprado')}</td>
        <td>${money(totalGrp)}</td>
        <td>${nfLinkHtml(itens[0])}</td>
      </tr>`;
    }).join('');
    bindCheckHandlers(body);
    return;
  }

  body.innerHTML=rows.map(r=>singleRowHtml(r)).join('');
  bindCheckHandlers(body);
  wireRowActions(body);
}
function selectedRows(){return state.rows.filter(r=>state.selected.has(String(r.id)));}
// compras_solicitacoes.status é recalculado pela trigger sync_compras_solicitacao_status()
// sempre que compras_itens.status muda — não precisa (nem deve) ser feito aqui também.
async function updateItems(rows,payload){ if(!rows.length) throw new Error('Selecione pelo menos um item.'); const {error}=await supabase.from('compras_itens').update(payload).in('id',rows.map(r=>r.id)); if(error) throw error; }
function approvalMessage(rows){
  const byGestor=new Map(); rows.forEach(r=>{const s=r.compras_solicitacoes||{}; const k=s.solicitante||'Gestor'; if(!byGestor.has(k)) byGestor.set(k,[]); byGestor.get(k).push(r);});
  return [...byGestor.entries()].map(([gestor,itens])=>`Gestor que solicitou: ${gestor}\n${itens.map(i=>`${i.quantidade||i.unidade||1} un | ${i.material}${i.tamanho?` | ${i.tamanho}`:''}`).join('\n')}`).join('\n\n');
}

// ─── MODAL COTAR ──────────────────────────────────────────────────────────────
function abrirCotarModal(){
  const rows=selectedRows();
  if(!rows.length){setMsg('Selecione pelo menos um item para cotar.',true);return;}
  const modal=document.getElementById('admCmpModal');
  let fornecedores=[''];
  function renderModal(){
    modal.innerHTML=`<div class="adm-cmp-modal-card adm-cmp-modal-wide">
      <div class="section-head">
        <div><h3>Cotar itens selecionados</h3><p class="muted">Preencha os valores por fornecedor. Adicione mais fornecedores para comparar.</p></div>
        <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
      </div>
      <div class="adm-cot-forn-row mt-16">
        ${fornecedores.map((f,i)=>`<div class="adm-cot-forn-cell"><label>Fornecedor ${i+1}<input class="forn-nome" data-fi="${i}" value="${esc(f)}" placeholder="Nome do fornecedor ${i+1}"></label>${fornecedores.length>1?`<button class="btn btn-small btn-danger adm-cot-rem-forn" data-fi="${i}" type="button">×</button>`:''}</div>`).join('')}
        <button class="btn btn-secondary" id="addFornBtn" type="button">+ Fornecedor</button>
      </div>
      <div class="adm-cmp-table-wrap mt-16">
        <table class="adm-cmp-table adm-cot-table">
          <thead><tr><th>Un.</th><th>Material</th><th>Tipo</th>${rows.some(isEPI)?'<th>CA</th><th>Colaborador</th>':''}${fornecedores.map((_,i)=>`<th>Valor unit. F${i+1}</th>`).join('')}<th>Total melhor</th></tr></thead>
          <tbody>
            ${rows.map(r=>`<tr data-cot-id="${esc(r.id)}">
              <td>${esc(r.quantidade||r.unidade||1)}</td>
              <td>${esc(r.material)}${r.tamanho?`<br><small>${esc(r.tamanho)}</small>`:''}</td>
              <td>${esc(r.tipo||'-')}</td>
              ${rows.some(isEPI)?`<td>${isEPI(r)?`<input class="cot-ca" placeholder="Nº CA" value="${esc(r.ca||'')}" style="width:90px">`:'-'}</td><td>${isEPI(r)?`<div class="cot-colab-wrap"><input class="cot-colab-input" placeholder="Colaborador..." autocomplete="off" value="${esc(r.colaborador_nome||'')}"><div class="cot-colab-sug"></div></div>`:'-'}</td>`:''}
              ${fornecedores.map((_,i)=>`<td><input class="cot-val" data-fi="${i}" type="number" step="0.01" min="0" placeholder="0,00" value="${esc((state.cotacaoCache[r.id]?.valores?.[i])||'')}"></td>`).join('')}
              <td class="cot-melhor">-</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="adm-cmp-total-box mt-16" id="cotTotalBox"></div>
      <div class="adm-cmp-actions mt-16">
        <button class="btn btn-primary" id="cotConfirmar" type="button">Confirmar cotação</button>
        <button class="btn btn-secondary" id="cotCancelar" type="button">Cancelar</button>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
    modal.querySelector('#cotCancelar').onclick=()=>modal.classList.remove('open');
    modal.querySelector('#addFornBtn').onclick=()=>{
      modal.querySelectorAll('.forn-nome').forEach((el,i)=>{fornecedores[i]=el.value;});
      fornecedores.push(''); renderModal();
    };
    modal.querySelectorAll('.adm-cot-rem-forn').forEach(btn=>btn.onclick=()=>{
      modal.querySelectorAll('.forn-nome').forEach((el,i)=>{fornecedores[i]=el.value;});
      fornecedores.splice(Number(btn.dataset.fi),1); renderModal();
    });
    modal.querySelectorAll('.forn-nome').forEach((el,i)=>el.oninput=()=>{fornecedores[i]=el.value;});
    // colaborador autocomplete
    modal.querySelectorAll('.cot-colab-input').forEach(input=>{
      const sug=input.closest('.cot-colab-wrap').querySelector('.cot-colab-sug');
      input.addEventListener('input',()=>{
        const q=norm(input.value); if(q.length<2){sug.innerHTML='';return;}
        const list=state.colaboradores.filter(c=>norm(c.nome).includes(q)).slice(0,8);
        sug.innerHTML=list.map(c=>`<button type="button" data-cid="${esc(c.id)}" data-cnome="${esc(c.nome)}">${esc(c.nome)} <small>${esc(c.cargo||c.tipo||'')}</small></button>`).join('');
        sug.querySelectorAll('button').forEach(b=>b.onmousedown=(ev)=>{ev.preventDefault(); input.value=b.dataset.cnome; input.dataset.colaboradorId=b.dataset.cid; sug.innerHTML='';});
      });
      input.addEventListener('blur',()=>setTimeout(()=>{sug.innerHTML='';},160));
    });
    recalcCotacao();
    modal.querySelectorAll('.cot-val').forEach(inp=>inp.oninput=recalcCotacao);
    modal.querySelector('#cotConfirmar').onclick=()=>confirmarCotacao(rows, fornecedores);
  }
  function recalcCotacao(){
    const totais=fornecedores.map(()=>0);
    rows.forEach(r=>{
      const tr=modal.querySelector(`[data-cot-id="${CSS.escape(String(r.id))}"]`); if(!tr) return;
      const qtd=Number(r.quantidade||r.unidade||1);
      const vals=fornecedores.map((_,i)=>{
        const inp=tr.querySelector(`.cot-val[data-fi="${i}"]`);
        return Number(inp?.value||0);
      });
      const melhor=Math.max(...vals.filter(v=>v>0),0);
      tr.querySelector('.cot-melhor').textContent=melhor?money(melhor*qtd):'-';
      vals.forEach((v,i)=>{if(v>0) totais[i]+=v*qtd;});
    });
    const totBox=modal.querySelector('#cotTotalBox');
    if(totBox) totBox.innerHTML=fornecedores.map((f,i)=>`<span><b>Total ${f||`F${i+1}`}:</b> ${money(totais[i])}</span>`).join(' &nbsp;|&nbsp; ');
  }
  renderModal();
}

async function confirmarCotacao(rows, fornecedores){
  const modal=document.getElementById('admCmpModal');
  // Coleta nomes de fornecedores
  modal.querySelectorAll('.forn-nome').forEach((el,i)=>{fornecedores[i]=el.value.trim();});
  for(const r of rows){
    const tr=modal.querySelector(`[data-cot-id="${CSS.escape(String(r.id))}"]`); if(!tr) continue;
    const qtd=Number(r.quantidade||r.unidade||1);
    const vals=fornecedores.map((_,i)=>Number(tr.querySelector(`.cot-val[data-fi="${i}"]`)?.value||0));
    const ca=tr.querySelector('.cot-ca')?.value?.trim()||null;
    const colabInput=tr.querySelector('.cot-colab-input');
    const colabId=colabInput?.dataset?.colaboradorId||null;
    const colabNome=colabInput?.value?.trim()||null;
    // Salva no cache local para uso no COMPRAR
    state.cotacaoCache[r.id]={fornecedores: fornecedores.map((n,i)=>({nome:n,valor_unitario:vals[i],valor_total:vals[i]*qtd})), ca, colaborador_id:colabId, colaborador_nome:colabNome};
    // Persiste CA e colaborador no item
    const update={status:'em_cotacao'};
    if(ca) update.ca=ca;
    if(colabId) update.colaborador_id=colabId;
    if(colabNome) update.colaborador_nome=colabNome;
    if(vals.some(v=>v>0)){
      const melhor=Math.min(...vals.filter(v=>v>0));
      update.valor_unitario=melhor; update.valor_total=melhor*qtd;
    }
    {const {error:caErr}=await supabase.from('compras_itens').update(update).eq('id',r.id); if(caErr&&(caErr.message?.includes("'ca'")||caErr.code==='PGRST204')){delete update.ca; await supabase.from('compras_itens').update(update).eq('id',r.id);}}
  }
  modal.classList.remove('open');
  setMsg(`${rows.length} item(ns) enviado(s) para COTAÇÕES.`);
  await loadRows();
}

async function solicitarAprovacao(){ const rows=selectedRows(); const msg=approvalMessage(rows); await updateItems(rows,{status:'em_analise', mensagem_aprovacao:msg}); await navigator.clipboard?.writeText(msg).catch(()=>{}); setMsg('Mensagem de aprovação gerada e copiada. Itens movidos para EM ANÁLISE.'); await loadRows(); }
async function recusarSelecionados(){ const rows=selectedRows(); const motivo=prompt('Motivo da recusa:'); if(!motivo) return; await updateItems(rows,{status:'recusado', motivo_recusa:motivo}); setMsg('Itens recusados.'); await loadRows(); }

// ─── FINALIZAR NF (modal dedicado, chamado pelo ícone "Finalizar") ────────────
function openFinalizarModal(r){
  const modal=document.getElementById('admCmpModal');
  modal.innerHTML=`<div class="adm-cmp-modal-card">
    <div class="section-head"><div><h3>Finalizar compra</h3><p class="muted">${esc(r.material)}${r.tamanho?` · Tam: ${esc(r.tamanho)}`:''}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">URL ou número da NF<input id="mNf" placeholder="Cole o link ou número da NF"></label>
      <label>Marca<input id="mMarca" placeholder="Marca do item, se patrimônio"></label>
      ${isEPI(r)?`<label>Nº CA<input id="mCa" placeholder="Nº CA do EPI" value="${esc(r.ca||'')}"></label>`:''}
      <label class="adm-cmp-full">Ou anexar arquivo da NF<input id="mNfFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xml,.doc,.docx,.xls,.xlsx"></label>
    </div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="mFinalizar" type="button">Finalizar compra</button>${r.comprovante_url?`<a class="btn btn-secondary" href="${esc(r.comprovante_url)}" target="_blank">Abrir comprovante</a>`:''}</div>
    <span class="adm-cmp-feedback mt-8" id="nfFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#mFinalizar').addEventListener('click',async()=>{
    const btn=modal.querySelector('#mFinalizar'); const fb=modal.querySelector('#nfFeedback');
    btn.disabled=true; if(fb) fb.textContent='';
    try{
      const file=modal.querySelector('#mNfFile')?.files?.[0]||null;
      let nf=modal.querySelector('#mNf')?.value?.trim()||'';
      if(file){ if(fb) fb.textContent='Enviando arquivo...'; nf=await uploadArquivoNotasFiscais(file,'compras/nf'); }
      if(!nf){ alert('Informe a NF ou anexe um arquivo.'); btn.disabled=false; return; }
      const marca=modal.querySelector('#mMarca')?.value?.trim()||'';
      const ca=isEPI(r)?(modal.querySelector('#mCa')?.value?.trim()||r.ca||null):(r.ca||null);
      await finalizarCompra(r,{nf,marca,ca});
    }catch(e){ if(fb){fb.textContent=e.message; fb.classList.add('err');} btn.disabled=false; }
  });
}

// ─── MODAL COMPRAR (lote) ─────────────────────────────────────────────────────
function abrirCompraSelecionados(){
  const rows=selectedRows();
  if(!rows.length){setMsg('Selecione pelo menos um item em COTAÇÕES para comprar.',true);return;}
  const invalidos=rows.filter(r=>r.status!=='em_cotacao');
  if(invalidos.length){setMsg('Comprar em lote só está disponível para itens em COTAÇÕES.',true);return;}
  // Verifica se há múltiplos fornecedores em cache
  const comCache=rows.filter(r=>state.cotacaoCache[r.id]?.fornecedores?.length>1);
  if(comCache.length) openSelecionarFornecedor(rows);
  else openCompraLote(rows);
}

function openSelecionarFornecedor(rows){
  // Agrupa fornecedores disponíveis (pelo primeiro item com cache)
  const primeiroComCache=rows.find(r=>state.cotacaoCache[r.id]?.fornecedores?.length);
  const fns=(primeiroComCache?state.cotacaoCache[primeiroComCache.id].fornecedores:[]).filter(f=>f.nome||f.valor_unitario>0);
  if(!fns.length){openCompraLote(rows);return;}
  const modal=document.getElementById('admCmpModal');
  modal.innerHTML=`<div class="adm-cmp-modal-card">
    <div class="section-head">
      <div><h3>Selecionar fornecedor</h3><p class="muted">Escolha qual fornecedor será confirmado para esta compra.</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="adm-cot-forn-cards mt-16">
      ${fns.map((f,i)=>{
        const total=rows.reduce((s,r)=>{const c=state.cotacaoCache[r.id]?.fornecedores?.[i]; return s+(c?Number(c.valor_total||0):0);},0);
        return `<div class="adm-cot-forn-opt" data-fi="${i}">
          <div><b>${esc(f.nome||`Fornecedor ${i+1}`)}</b></div>
          <div class="adm-cot-forn-total">${money(total)}</div>
          <button class="btn btn-primary" data-sel-fi="${i}" type="button">Selecionar este fornecedor</button>
        </div>`;
      }).join('')}
    </div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-secondary" id="mClose2" type="button">Cancelar</button></div>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#mClose2').onclick=()=>modal.classList.remove('open');
  modal.querySelectorAll('[data-sel-fi]').forEach(btn=>btn.onclick=()=>{
    const fi=Number(btn.dataset.selFi);
    // Aplica os valores do fornecedor selecionado em cada row
    const rowsComValor=rows.map(r=>{
      const c=state.cotacaoCache[r.id]?.fornecedores?.[fi];
      return {...r, _valor_unitario:c?Number(c.valor_unitario||0):0, _valor_total:c?Number(c.valor_total||0):0, _fornecedor:fns[fi]?.nome||''};
    });
    openPagamentoLote(rowsComValor, true);
  });
}

function openCompraLote(rows){
  const modal=document.getElementById('admCmpModal');
  const totalInicial=rows.reduce((s,r)=>s+(Number(r.valor_total||0)),0);
  modal.innerHTML=`<div class="adm-cmp-modal-card adm-cmp-modal-wide">
    <div class="section-head">
      <div><h3>Comprar itens selecionados</h3><p class="muted">Informe o valor unitário de cada material.</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="adm-cmp-table-wrap mt-16">
      <table class="adm-cmp-table adm-cmp-buy-table">
        <thead><tr><th>Un.</th><th>Material</th><th>Tipo</th>${rows.some(isEPI)?'<th>CA</th>':''}<th>Valor unitário</th><th>Total</th></tr></thead>
        <tbody>
          ${rows.map(r=>`<tr data-buy-row="${esc(r.id)}">
            <td>${esc(r.quantidade||r.unidade||1)}</td>
            <td>${esc(r.material)}${r.tamanho?`<br><small>Tam: ${esc(r.tamanho)}</small>`:''}${r.colaborador_nome?`<br><small>${esc(r.colaborador_nome)}</small>`:''}</td>
            <td>${esc(r.tipo||'-')}</td>
            ${rows.some(isEPI)?`<td>${isEPI(r)?`<input class="buy-ca" placeholder="Nº CA" style="width:90px" value="${esc(r.ca||state.cotacaoCache[r.id]?.ca||'')}">`:'-'}</td>`:''}
            <td><input class="buy-unit" type="number" step="0.01" min="0" value="${esc(r.valor_unitario||state.cotacaoCache[r.id]?.fornecedores?.[0]?.valor_unitario||'')}" placeholder="0,00"></td>
            <td><input class="buy-total" type="number" step="0.01" readonly value="${esc(r.valor_total||'0')}"></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="adm-cmp-total-box mt-16"><span>Total da compra</span><strong id="buyGrandTotal">${money(totalInicial)}</strong></div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="buyContinue" type="button">COMPRAR</button><button class="btn btn-danger" id="buyCancel" type="button">CANCELAR</button></div>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#buyCancel').onclick=()=>modal.classList.remove('open');
  const recalc=()=>{
    let grand=0;
    rows.forEach(r=>{
      const tr=modal.querySelector(`[data-buy-row="${CSS.escape(String(r.id))}"]`); if(!tr) return;
      const qtd=Number(r.quantidade||r.unidade||1);
      const unit=Number(tr.querySelector('.buy-unit').value||0);
      const total=unit*qtd;
      tr.querySelector('.buy-total').value=total.toFixed(2);
      grand+=total;
    });
    modal.querySelector('#buyGrandTotal').textContent=money(grand);
  };
  modal.querySelectorAll('.buy-unit').forEach(inp=>inp.oninput=recalc);
  recalc();
  modal.querySelector('#buyContinue').onclick=()=>{
    const rowsComValor=rows.map(r=>{
      const tr=modal.querySelector(`[data-buy-row="${CSS.escape(String(r.id))}"]`);
      const qtd=Number(r.quantidade||r.unidade||1);
      const unit=Number(tr?.querySelector('.buy-unit')?.value||0);
      const ca=tr?.querySelector('.buy-ca')?.value?.trim()||r.ca||state.cotacaoCache[r.id]?.ca||null;
      return {...r, _valor_unitario:unit, _valor_total:unit*qtd, _ca:ca};
    });
    openPagamentoLote(rowsComValor, false);
  };
}

function safeFileName(name){return String(name||'arquivo').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);}
async function uploadArquivoNotasFiscais(file,prefixo='compras/boletos'){
  if(!file) return '';
  const ano=new Date().getFullYear();
  const path=`${prefixo}/${ano}/${Date.now()}_${safeFileName(file.name)}`;
  const {error}=await supabase.storage.from('notas-fiscais').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);
  const {data}=supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl||path;
}
async function coletarDadosPagamento(forma,area){
  const texto=area.querySelector('#payData')?.value?.trim()||'';
  const arquivo=area.querySelector('#payFile')?.files?.[0]||null;
  if(forma==='BOLETO'&&arquivo) return await uploadArquivoNotasFiscais(arquivo,'compras/boletos');
  return texto;
}
function updatePagamentoFields(area,forma){
  const label=area.querySelector('#payLabel'); const input=area.querySelector('#payData'); const fileWrap=area.querySelector('#payFileWrap');
  if(!label||!input) return;
  if(forma==='PIX'){label.firstChild.textContent='Chave PIX';input.placeholder='Informe a chave PIX';if(fileWrap)fileWrap.style.display='none';}
  else if(forma==='LINK'){label.firstChild.textContent='Link de pagamento';input.placeholder='Cole o link de pagamento';if(fileWrap)fileWrap.style.display='none';}
  else{label.firstChild.textContent='Boleto / URL';input.placeholder='Cole o link do boleto ou anexe abaixo';if(fileWrap)fileWrap.style.display='block';}
}

function openPagamentoLote(rows, fornecedorPreSelecionado=false){
  const total=rows.reduce((s,r)=>s+Number(r._valor_total||0),0);
  if(total<=0){alert('Informe o valor unitário de pelo menos um item.');return;}
  const fornecedorInicial=rows[0]?._fornecedor||'';
  const hasCelular=rows.some(r=>norm(r.material)==='celular');
  const area=document.querySelector('#admCmpModal .adm-cmp-modal-card');
  area.innerHTML=`<div class="section-head"><div><h3>Pagamento da compra</h3><p class="muted">Total da compra: <b>${money(total)}</b></p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="adm-cmp-table-wrap mt-16">
      <table class="adm-cmp-table adm-cmp-buy-table">
        <thead><tr><th>Un.</th><th>Material</th>${rows.some(r=>r._ca||isEPI(r))?'<th>CA</th>':''}<th>Valor unitário</th><th>Total</th></tr></thead>
        <tbody>${rows.map(r=>`<tr><td>${esc(r.quantidade||r.unidade||1)}</td><td>${esc(r.material)}${r.tamanho?`<br><small>${esc(r.tamanho)}</small>`:''}</td>${rows.some(x=>x._ca||isEPI(x))?`<td>${esc(r._ca||r.ca||'-')}</td>`:''}<td>${money(r._valor_unitario)}</td><td>${money(r._valor_total)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label>Fornecedor<input id="payFornecedor" placeholder="Nome do fornecedor" value="${esc(fornecedorInicial)}"></label>
      <label>Valor total<input id="payValorTotal" readonly value="${money(total)}"></label>
      <label class="adm-cmp-full">Contato<input id="payContato" placeholder="Telefone, WhatsApp, e-mail ou observação de contato"></label>
    </div>
    <div class="adm-cmp-tabs mt-16">
      <button class="btn btn-secondary active" data-pay="BOLETO" type="button">BOLETO</button>
      <button class="btn btn-secondary" data-pay="PIX" type="button">PIX</button>
      <button class="btn btn-secondary" data-pay="LINK" type="button">LINK</button>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label id="payLabel">Boleto / URL<input id="payData" placeholder="Cole o link do boleto ou anexe abaixo"></label>
      <label id="payFileWrap">Arquivo do boleto<input id="payFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"></label>
    </div>
    ${hasCelular?`<label style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer;color:#e2e2f0"><input type="checkbox" id="payPatrimonio" style="width:16px;height:16px;cursor:pointer"> <span>Celular como patrimônio (sem termo de desconto em folha)</span></label>`:''}
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="paySend" type="button">Enviar ao Financeiro</button><button class="btn btn-secondary" id="payBack" type="button">Voltar</button></div>`;
  let forma='BOLETO';
  area.querySelector('#mClose').onclick=()=>document.getElementById('admCmpModal').classList.remove('open');
  area.querySelector('#payBack').onclick=()=>fornecedorPreSelecionado?abrirCompraSelecionados():openCompraLote(rows.map(r=>({...r})));
  area.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{forma=b.dataset.pay; area.querySelectorAll('[data-pay]').forEach(x=>x.classList.toggle('active',x===b)); updatePagamentoFields(area,forma);});
  updatePagamentoFields(area,forma);
  area.querySelector('#paySend').onclick=async()=>{
    try{
      const dados=await coletarDadosPagamento(forma,area);
      const fornecedor=area.querySelector('#payFornecedor')?.value?.trim()||'';
      const contato=area.querySelector('#payContato')?.value?.trim()||'';
      const isPatrimonio=hasCelular&&!!area.querySelector('#payPatrimonio')?.checked;
      await enviarFinanceiroLote(rows,total,forma,dados,fornecedor,contato,isPatrimonio);
    }catch(e){setMsg(e.message,true);alert(e.message);}
  };
}

async function enviarFinanceiroLote(itens,total,forma,dados,fornecedor='',contato='',celularAsPatrimonio=false){
  if(celularAsPatrimonio){
    const celRows=itens.filter(r=>norm(r.material)==='celular');
    for(const r of celRows){
      await safe(()=>supabase.from('termos_celular').delete().eq('compra_item_id',r.id));
      await safe(()=>supabase.from('compras_itens').update({tipo:'Patrimonio'}).eq('id',r.id));
    }
  }
  const celularItens=celularAsPatrimonio?[]:itens.filter(r=>norm(r.material)==='celular');
  const normalItens=celularAsPatrimonio?itens:itens.filter(r=>norm(r.material)!=='celular');

  // Normal items → Financeiro
  if(normalItens.length){
    const normalTotal=normalItens.reduce((s,r)=>s+Number(r._valor_total||0),0);
    const descricao=`Compra: ${normalItens.map(r=>`${r.quantidade||r.unidade||1} un ${r.material}`).join(' | ')}`;
    const payload={origem:'COMPRAS',origem_id:normalItens[0]?.id||null,descricao,favorecido:fornecedor||'Fornecedor a definir',fornecedor:fornecedor||null,contato:contato||null,valor:normalTotal,forma_pagamento:forma,dados_pagamento:dados||null,status:'PENDENTE',vencimento:null,created_at:new Date().toISOString()};
    await safe(()=>mergeOrInsertComprasPayment(payload),null);
    for(const r of normalItens){
      const upd={status:'pendente_pagamento',valor_unitario:r._valor_unitario,valor_total:r._valor_total,forma_pagamento:forma,dados_pagamento:dados||null};
      if(r._ca||r.ca) upd.ca=r._ca||r.ca;
      if(fornecedor) upd.fornecedor=fornecedor;
      const {error:updErr}=await supabase.from('compras_itens').update(upd).eq('id',r.id);
      if(updErr){
        if(updErr.message?.includes("'ca'")||updErr.message?.includes("'fornecedor'")||updErr.code==='PGRST204'){delete upd.ca; delete upd.fornecedor; const {error:r2}=await supabase.from('compras_itens').update(upd).eq('id',r.id); if(r2) throw new Error(`Erro ao atualizar item ${r.material}: ${r2.message}`);}
        else throw new Error(`Erro ao atualizar item ${r.material}: ${updErr.message}`);
      }
    }
    const episComColab=normalItens.filter(r=>isEPI(r)&&(r.colaborador_id||r.colaborador_nome));
    if(episComColab.length){
      const rhPayload=episComColab.map(r=>({data_entrega:new Date().toISOString().slice(0,10),colaborador_id:r.colaborador_id||null,colaborador_nome:r.colaborador_nome||null,epi:r.material,ca:r._ca||r.ca||null,quantidade:Number(r.quantidade||r.unidade||1),compra_item_id:r.id,status:'aguardando_pagamento',created_at:new Date().toISOString()}));
      await safe(()=>supabase.from('rh_epi_registros').insert(rhPayload),null);
    }
    await notifyByConfig('FINANCEIRO',`Pagamento de compras pendente\nFornecedor: ${fornecedor||'Não informado'}\nContato: ${contato||'Não informado'}\nItens: ${normalItens.length}\nValor total: ${money(normalTotal)}\nForma: ${forma}`);
  }

  // Celular items → Termos (aguardando_termo)
  for(const r of celularItens){
    const upd={status:'aguardando_termo',valor_unitario:r._valor_unitario,valor_total:r._valor_total,forma_pagamento:forma,dados_pagamento:dados||null};
    if(fornecedor) upd.fornecedor=fornecedor;
    const {error:updErr}=await supabase.from('compras_itens').update(upd).eq('id',r.id);
    if(updErr&&(updErr.message?.includes("'fornecedor'")||updErr.code==='PGRST204')){delete upd.fornecedor; await supabase.from('compras_itens').update(upd).eq('id',r.id);}
    await safe(()=>supabase.from('termos_celular').update({valor:r._valor_total}).eq('compra_item_id',r.id));
  }

  document.getElementById('admCmpModal').classList.remove('open');
  if(celularItens.length&&normalItens.length) setMsg(`${normalItens.length} item(ns) ao Financeiro. ${celularItens.length} celular(es) aguardando termo.`);
  else if(celularItens.length) setMsg(`${celularItens.length} celular(es) encaminhado(s) para assinatura de termo.`);
  else setMsg('Compra enviada ao Financeiro e movida para PENDENTES.');
  await loadRows();
}

async function finalizarCompra(r,{nf,marca,ca}){
  const codigo=r.codigo||await safe(()=>supabase.rpc('gerar_codigo_compra',{p_tipo:r.tipo||'Outros'}),null);
  const updPayload={status:'comprado',nf_url:nf,marca,comprado_em:new Date().toISOString()};
  if(codigo) updPayload.codigo=codigo;
  if(isEPI(r)&&ca) updPayload.ca=ca;
  await supabase.from('compras_itens').update(updPayload).eq('id',r.id);
  if(isEPI(r)){const {data:epiReg}=await supabase.from('rh_epi_registros').select('id').eq('compra_item_id',r.id).maybeSingle(); if(epiReg) await safe(()=>supabase.from('rh_epi_registros').update({ca:ca||null}).eq('compra_item_id',r.id)); else if(r.colaborador_id||r.colaborador_nome) await safe(()=>supabase.from('rh_epi_registros').insert([{data_entrega:new Date().toISOString().slice(0,10),colaborador_id:r.colaborador_id||null,colaborador_nome:r.colaborador_nome||null,epi:r.material,ca:ca||null,quantidade:Number(r.quantidade||r.unidade||1),compra_item_id:r.id,status:'aguardando_pagamento',created_at:new Date().toISOString()}]),null);}
  if(norm(r.tipo).includes('patrimonio')) await supabase.from('compras_patrimonios_cadastro').insert({compra_item_id:r.id,material:r.material,marca,coordenacao:r.compras_solicitacoes?.coordenacao||null,status:'aguardando_numero'}); await notifyByConfig('GESTOR',`Compra concluída\nMaterial: ${r.material}\nNF: ${nf}`);
  try { const engine=window.__painelNotifEngine; const s=r.compras_solicitacoes||{}; const destinatarioId=s.solicitante_id||s.created_by||null; if(engine&&destinatarioId){ await engine.criarNotificacao({tipo:'compra_realizada',titulo:`Compra realizada: ${r.material}`,descricao:`Solicitação de ${s.solicitante||'Gestor'} foi concluída. NF disponível.`,destinatario_usuario_id:destinatarioId,referencia_tabela:'compras_itens',referencia_id:String(r.id),chave_dedup:`compra_realizada:${r.id}`}); } } catch(_){}
  document.getElementById('admCmpModal').classList.remove('open'); await loadRows(); }

// ─── GRUPO PENDENTES ──────────────────────────────────────────────────────────
function openGrupoModal(gids){
  const ids=gids.split(',').map(id=>id.trim());
  const itens=state.rows.filter(r=>ids.includes(String(r.id)));
  if(!itens.length) return;
  const modal=document.getElementById('admCmpModal');
  const total=itens.reduce((s,r)=>s+Number(r.valor_total||0),0);
  const fn=itens[0].fornecedor||itens[0].dados_pagamento||'';
  const comprovante=itens.find(r=>r.comprovante_url)?.comprovante_url||'';
  const stGrp=itens.some(r=>r.status==='aguardando_nf')?'aguardando_nf':'pendente_pagamento';
  const allAguardando=itens.every(r=>r.status==='aguardando_nf');
  modal.innerHTML=`<div class="adm-cmp-modal-card adm-cmp-modal-wide">
    <div class="section-head">
      <div><h3>Grupo de compras</h3><p class="muted">${esc(fn||'Mesmo fornecedor')} · ${money(total)} · ${pill(stGrp)}</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="adm-cmp-table-wrap mt-16">
      <table class="adm-cmp-table">
        <thead><tr><th>Un.</th><th>Material</th><th>Tipo</th><th>Valor</th><th>Status</th></tr></thead>
        <tbody>${itens.map(r=>`<tr><td>${esc(r.quantidade||r.unidade||1)}</td><td>${esc(r.material)}${r.tamanho?`<br><small>Tam: ${esc(r.tamanho)}</small>`:''}${r.colaborador_nome?`<br><small>${esc(r.colaborador_nome)}</small>`:''}</td><td>${esc(r.tipo||'-')}</td><td>${money(r.valor_total||0)}</td><td>${pill(r.status)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right;font-weight:700;padding:10px 12px">Total do grupo</td><td colspan="2" style="font-weight:800;color:#bbf7d0;padding:10px 12px">${money(total)}</td></tr></tfoot>
      </table>
    </div>
    ${comprovante?`<div class="mt-16"><a class="btn btn-secondary" href="${esc(comprovante)}" target="_blank" rel="noopener">Ver comprovante de pagamento</a></div>`:''}
    ${allAguardando?`<div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">URL ou número da NF<input id="mNfGrp" placeholder="Cole o link da NF ou informe o número"></label>
      <label class="adm-cmp-full">Ou anexar arquivo da NF<input id="mNfGrpFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xml,.doc,.docx,.xls,.xlsx"></label>
    </div>
    <div class="adm-cmp-actions mt-16">
      <button class="btn btn-primary" id="mFinalizarGrp" type="button">Finalizar grupo (${itens.length} itens)</button>
    </div>`:`<p class="muted mt-16">Aguardando pagamento — o financeiro precisa anexar o comprovante antes da NF.</p>`}
    <span class="adm-cmp-feedback mt-8" id="grpFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  const btn=modal.querySelector('#mFinalizarGrp');
  if(btn) btn.onclick=async()=>{
    const fb=modal.querySelector('#grpFeedback');
    btn.disabled=true; btn.textContent='Finalizando...'; if(fb)fb.textContent='';
    try{
      const file=modal.querySelector('#mNfGrpFile')?.files?.[0]||null;
      let nf=modal.querySelector('#mNfGrp')?.value?.trim()||'';
      if(file){if(fb)fb.textContent='Enviando arquivo...'; nf=await uploadArquivoNotasFiscais(file,'compras/nf');}
      if(!nf){alert('Informe a NF ou anexe um arquivo.');btn.disabled=false;btn.textContent=`Finalizar grupo (${itens.length} itens)`;return;}
      await finalizarCompraGrupo(itens,nf);
    }catch(e){if(fb)fb.textContent=e.message; btn.disabled=false; btn.textContent=`Finalizar grupo (${itens.length} itens)`;}
  };
}

async function finalizarCompraGrupo(itens,nf){
  for(const r of itens){
    const ca=r.ca||null;
    const codigo=r.codigo||await safe(()=>supabase.rpc('gerar_codigo_compra',{p_tipo:r.tipo||'Outros'}),null);
    const updPayload={status:'comprado',nf_url:nf,comprado_em:new Date().toISOString()};
    if(codigo) updPayload.codigo=codigo;
    if(isEPI(r)&&ca) updPayload.ca=ca;
    await supabase.from('compras_itens').update(updPayload).eq('id',r.id);
    if(isEPI(r)){const {data:epiReg}=await supabase.from('rh_epi_registros').select('id').eq('compra_item_id',r.id).maybeSingle(); if(epiReg) await safe(()=>supabase.from('rh_epi_registros').update({ca:ca||null}).eq('compra_item_id',r.id)); else if(r.colaborador_id||r.colaborador_nome) await safe(()=>supabase.from('rh_epi_registros').insert([{data_entrega:new Date().toISOString().slice(0,10),colaborador_id:r.colaborador_id||null,colaborador_nome:r.colaborador_nome||null,epi:r.material,ca:ca||null,quantidade:Number(r.quantidade||r.unidade||1),compra_item_id:r.id,status:'aguardando_pagamento',created_at:new Date().toISOString()}]),null);}
    if(norm(r.tipo).includes('patrimonio')) await supabase.from('compras_patrimonios_cadastro').insert({compra_item_id:r.id,material:r.material,marca:r.marca||null,coordenacao:r.compras_solicitacoes?.coordenacao||null,status:'aguardando_numero'});
  }
  try{const engine=window.__painelNotifEngine; for(const r of itens){const s=r.compras_solicitacoes||{}; const did=s.solicitante_id||s.created_by||null; if(engine&&did) await engine.criarNotificacao({tipo:'compra_realizada',titulo:`Compra realizada: ${r.material}`,descricao:`Solicitação de ${s.solicitante||'Gestor'} concluída. NF disponível.`,destinatario_usuario_id:did,referencia_tabela:'compras_itens',referencia_id:String(r.id),chave_dedup:`compra_realizada:${r.id}`});}}catch(_){}
  await notifyByConfig('GESTOR',`Compras concluídas\n${itens.length} itens finalizados\nNF: ${nf}\nTotal: ${money(itens.reduce((s,r)=>s+Number(r.valor_total||0),0))}`);
  document.getElementById('admCmpModal').classList.remove('open');
  setMsg(`${itens.length} item(ns) finalizado(s).`);
  await loadRows();
}

function styles(){return `<style>
.adm-cmp-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px}.adm-cmp-kpi{min-height:0;padding:14px 16px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:4px 16px}.adm-cmp-kpi h3{margin:0;font-size:13px;font-weight:700;color:var(--muted)}.adm-cmp-kpi .metric{grid-column:2;grid-row:1/3;margin:0;font-size:26px;line-height:1;font-weight:800;white-space:nowrap}.adm-cmp-kpi .muted{margin:0;font-size:12px;line-height:1.3}
.adm-cmp-tabs,.adm-cmp-actions{display:flex;gap:10px;flex-wrap:wrap}.adm-cmp-actions-footer{align-items:center}.adm-cmp-tabs-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.adm-cmp-tabs-row .adm-cmp-tabs{flex:1;min-width:0;margin:0!important}.adm-cmp-tabs-row #admCmpRefresh{flex-shrink:0}.adm-cmp-tabs:not(#admCmpTabs) .active{background:#166534!important;color:#fff!important}#admCmpTabs{gap:2px!important;overflow-x:auto!important;flex-wrap:nowrap!important}#admCmpTabs>button{border:0!important;border-radius:0!important;background:transparent!important;padding:14px 16px 13px!important;color:#a9b8b1!important;font-size:13px!important;font-weight:700!important;white-space:nowrap!important;border-bottom:2px solid transparent!important;outline:none!important}#admCmpTabs>button:hover{color:#d9fbe8!important;background:rgba(34,197,94,.035)!important}#admCmpTabs>button.active{color:#35e990!important;background:transparent!important;border-bottom-color:#22e58a!important}#admCmpTabs>button.active::after{display:none!important}.adm-cmp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;transition:opacity .15s ease}.adm-cmp-table-wrap.is-loading{opacity:.35;pointer-events:none}.adm-cmp-table{width:100%;border-collapse:collapse;min-width:1060px}.adm-cmp-table th,.adm-cmp-table td{padding:12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.adm-cmp-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.adm-cmp-status{display:inline-flex;padding:6px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.25);font-size:12px;font-weight:800}.adm-cmp-status.pendente,.adm-cmp-status.em_cotacao,.adm-cmp-status.em_analise,.adm-cmp-status.pendente_pagamento,.adm-cmp-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1)}.adm-cmp-status.aguardando_termo{color:#c4b5fd;background:rgba(139,92,246,.12)}.adm-cmp-status.comprado{color:#bbf7d0;background:rgba(22,101,52,.2)}.adm-cmp-status.recusado{color:#fecaca;background:rgba(220,38,38,.12)}.adm-cmp-empty{text-align:center;color:var(--muted);padding:20px!important}.adm-cmp-feedback{font-weight:800}.adm-cmp-feedback.err{color:#fecaca}.adm-cmp-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.adm-cmp-modal.open{display:flex}.adm-cmp-modal-card{width:min(900px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,0.06);border-radius:22px;padding:20px;color:#e2e2f0}.adm-cmp-modal-wide{width:min(1260px,100%)}.adm-cmp-buy-table input{width:160px;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-total-box{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid var(--line);border-radius:16px;padding:14px 16px;background:rgba(15,23,42,.55)}.adm-cmp-total-box strong{font-size:22px}.adm-cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-cmp-grid input,.adm-cmp-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-grid input[type=file]{padding:9px 12px;cursor:pointer}.adm-cmp-full{grid-column:1/-1}
.adm-cmp-cards{display:flex;flex-direction:column;gap:14px}.adm-cmp-card{border:1px solid var(--line);border-radius:16px;background:rgba(15,23,42,.4);overflow:hidden}.adm-cmp-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;background:rgba(15,23,42,.65);border-bottom:1px solid var(--line);flex-wrap:wrap}.adm-cmp-card-select{display:flex;align-items:center;gap:12px;cursor:pointer}.adm-cmp-card-select input{width:18px;height:18px;cursor:pointer;flex-shrink:0}.adm-cmp-card-select strong{display:block;font-size:14px}.adm-cmp-card-select small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.adm-cmp-card-meta{display:flex;align-items:center;gap:14px;font-size:13px;color:var(--muted);white-space:nowrap;flex-wrap:wrap}.adm-cmp-card-meta strong{color:#bbf7d0;font-size:16px}.adm-cmp-card-body{display:flex;flex-direction:column}.adm-cmp-card-row{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid rgba(148,163,184,.08);flex-wrap:wrap}.adm-cmp-card-body .adm-cmp-card-row:first-child{border-top:0}.adm-cmp-card-row input[type=checkbox]{width:17px;height:17px;cursor:pointer;flex-shrink:0}.adm-cmp-card-row-info{flex:1 1 220px;min-width:0}.adm-cmp-card-row-info strong{display:block;font-size:13.5px}.adm-cmp-card-row-info small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.adm-cmp-card-row-value{font-weight:700;font-size:13px;white-space:nowrap;margin-left:auto}.adm-cmp-card-row-actions,.adm-cmp-row-actions{display:flex;gap:6px;flex-shrink:0}.adm-cmp-icon-btn{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.7);color:#eef7f2;cursor:pointer;flex-shrink:0}.adm-cmp-icon-btn:hover{background:rgba(34,197,94,.14)}.adm-cmp-icon-btn svg{width:16px;height:16px}.adm-cmp-icon-btn[data-row-action="comprar"],.adm-cmp-icon-btn[data-row-action="aprovar"],.adm-cmp-icon-btn[data-row-action="cotar"]{background:rgba(16,185,129,.14);border-color:rgba(52,211,153,.25);color:#68f0ac}.adm-cmp-icon-btn[data-row-action="recusar"],.adm-cmp-icon-btn[data-row-action="reprovar"],.adm-cmp-icon-btn[data-row-action="cancelar"]{background:rgba(239,68,68,.09);border-color:rgba(248,113,113,.2);color:#ff7272}.adm-cmp-icon-btn[data-row-action="aprovar_solicitar"],.adm-cmp-icon-btn[data-row-action="finalizar"],.adm-cmp-icon-btn[data-row-action="finalizar_grupo"]{background:rgba(59,130,246,.1);border-color:rgba(96,165,250,.22);color:#93c5fd}
@media(max-width:760px){.adm-cmp-card-row-value{margin-left:44px}}
.adm-cot-forn-row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}.adm-cot-forn-cell{display:flex;flex-direction:column;gap:4px}.adm-cot-forn-cell label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}.adm-cot-forn-cell input{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:9px 12px;min-width:180px}.adm-cot-table input{width:120px;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px 10px;color-scheme:dark}.adm-cot-melhor{font-weight:700;color:#bbf7d0}.adm-cot-forn-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.adm-cot-forn-opt{border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:12px;text-align:center}.adm-cot-forn-total{font-size:22px;font-weight:800;color:#bbf7d0}
.cot-colab-wrap{position:relative}.cot-colab-sug{position:absolute;top:100%;left:0;right:0;z-index:60;background:#071b13;border:1px solid var(--line);border-radius:12px;padding:4px;max-height:200px;overflow:auto;box-shadow:0 12px 30px rgba(0,0,0,.38)}.cot-colab-sug:empty{display:none}.cot-colab-sug button{display:block;width:100%;text-align:left;border:none;background:transparent;color:#e2e2f0;padding:8px 10px;border-radius:8px;cursor:pointer}.cot-colab-sug button:hover{background:rgba(255,255,255,.06)}.cot-colab-input{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px 10px;width:160px;box-sizing:border-box;color-scheme:dark}
.adm-cmp-group-row{background:rgba(34,197,94,.04)}.adm-cmp-group-row>td:first-child{border-left:3px solid rgba(34,197,94,.5)}
.adm-cmp-table tbody tr.is-selected{background:rgba(34,197,94,.16)!important}.adm-cmp-table tbody tr.is-selected>td:first-child{border-left:3px solid #4ade80}
.adm-cmp-sel-count{display:inline-flex;align-items:center;font-weight:800;color:#86efac;font-size:13px}
@media(max-width:760px){.adm-cmp-kpis{grid-template-columns:1fr}.adm-cmp-kpi{padding:12px 14px}.adm-cmp-grid{grid-template-columns:1fr}.adm-cmp-table{min-width:920px}}
</style>`}

function updateActionButtons(){
  const tab=state.tab;
  const isCotacoes=tab==='cotacoes';
  const isSolic=tab==='solicitacoes';
  const btnCotar=document.getElementById('btnCotar');
  const btnComprar=document.getElementById('btnComprar');
  const btnAprovar=document.getElementById('btnAprovar');
  const btnRecusar=document.getElementById('btnRecusar');
  if(btnCotar) btnCotar.style.display=isSolic?'inline-flex':'none';
  if(btnComprar) btnComprar.style.display=isCotacoes?'inline-flex':'none';
  if(btnAprovar) btnAprovar.style.display=isSolic?'inline-flex':'none';
  if(btnRecusar) btnRecusar.style.display=(isSolic||isCotacoes||tab==='analise')?'inline-flex':'none';
  setMsg('');
}

initProtectedPage('Compras ADM', async (content)=>{
  await loadColaboradores();
  content.innerHTML=`${styles()}<section class="card"><div class="adm-cmp-tabs-row"><div class="adm-cmp-tabs" id="admCmpTabs">${TABS.map(([k,l])=>`<button class="btn btn-secondary ${k==='solicitacoes'?'active':''}" data-tab="${k}" type="button">${l}</button>`).join('')}</div><button class="btn btn-secondary" id="admCmpRefresh" type="button">↻ Atualizar</button></div><div id="admCmpItensSection"><div class="adm-cmp-table-wrap mt-16" id="admCmpListWrap"></div><div class="adm-cmp-actions adm-cmp-actions-footer mt-16"><span class="adm-cmp-sel-count" id="admCmpSelCount"></span><button class="adm-cmp-icon-btn" id="btnCotar" type="button" data-row-action="cotar" title="Cotar selecionados" aria-label="Cotar selecionados">${ICONS.tag}</button><button class="adm-cmp-icon-btn" id="btnComprar" type="button" data-row-action="comprar" title="Comprar selecionados" aria-label="Comprar selecionados" style="display:none">${ICONS.check}</button><button class="adm-cmp-icon-btn" id="btnAprovar" type="button" data-row-action="aprovar_solicitar" title="Solicitar aprovação dos selecionados" aria-label="Solicitar aprovação dos selecionados">${ICONS.send}</button><button class="adm-cmp-icon-btn" id="btnRecusar" type="button" data-row-action="recusar" title="Recusar selecionados" aria-label="Recusar selecionados">${ICONS.x}</button><span class="adm-cmp-feedback" id="admCmpFeedback"></span></div></div><div id="admCmpCatalogoSection" style="display:none"><div class="adm-cmp-grid mt-16"><label>Material<input id="catNovoMaterial" placeholder="Nome do material"></label><label>Tipo<select id="catNovoTipo"><option value="Uniforme">Uniforme</option><option value="Patrimonio">Patrimônio</option><option value="EPI">EPI</option><option value="Outros" selected>Outros</option></select></label><label class="adm-cmp-full">Observação<input id="catNovaObs" placeholder="Observação (opcional)"></label></div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="catAdicionar" type="button">Adicionar ao catálogo</button><span class="adm-cmp-feedback" id="admCmpCatalogoFeedback"></span></div><div class="adm-cmp-table-wrap mt-16"><table class="adm-cmp-table"><thead><tr><th>Material</th><th>Tipo</th><th>Observação</th><th>Status</th><th>Ações</th></tr></thead><tbody id="admCmpCatalogoBody"></tbody></table></div></div></section><div class="adm-cmp-modal" id="admCmpModal"></div>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b)); updateActionButtons(); loadRows();});
  document.getElementById('admCmpRefresh').onclick=loadRows;
  document.getElementById('btnCotar').onclick=()=>abrirCotarModal();
  document.getElementById('btnComprar').onclick=()=>abrirCompraSelecionados();
  document.getElementById('btnAprovar').onclick=()=>solicitarAprovacao().catch(e=>setMsg(e.message,true));
  document.getElementById('btnRecusar').onclick=()=>recusarSelecionados().catch(e=>setMsg(e.message,true));
  document.getElementById('catAdicionar').onclick=()=>adicionarCatalogoItem().catch(e=>setCatalogoMsg(e.message,true));
  updateActionButtons();
  await loadRows();
});

