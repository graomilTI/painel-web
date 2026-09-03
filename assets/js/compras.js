import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores, searchColaboradores } from './colaboradoresCache.js?v=20260827-situacao';

let CATALOGO = [];
async function loadCatalogo(){
  CATALOGO = await safe(()=>supabase.from('compras_catalogo').select('material,tipo,observacao').eq('ativo',true).order('material'));
}
const UNIFORME_TAMANHOS = ['PP','P','M','G','GG','XG','EXG'];
const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const STATUS = { pendente:'Pendente', em_cotacao:'Em cotação', em_analise:'Em análise', pendente_pagamento:'Pendente pagamento', aguardando_nf:'Aguardando NF', aguardando_termo:'Aguardando termo', comprado:'Comprado', recusado:'Recusado' };
const state = { mode:'itens', historyFilter:'pendentes', rows:[], itens:[], colaboradores:[], uniformes:[] };

const esc = (v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate = (v)=>{ const [y,m,d]=String(v||'').slice(0,10).split('-'); return y&&m&&d?`${d}/${m}/${y}`:'-'; };
const today = ()=>new Date().toISOString().slice(0,10);
const money = (v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const norm = (v)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function usuario(ctx){ return ctx?.user || {}; }
function solicitanteNome(ctx){ return usuario(ctx).name || usuario(ctx).email || 'Usuário logado'; }
function setMsg(id,msg,err=false){ const el=document.getElementById(id); if(el){ el.textContent=msg||''; el.classList.toggle('err',!!err); }}
function pill(v){ return `<span class="cmp-status ${esc(v)}">${esc(STATUS[v]||v||'-')}</span>`; }
async function safe(fn,fallback=[]){ try{ const {data,error}=await fn(); if(error) throw error; return data||fallback; }catch(e){ console.warn(e); return fallback; } }
const COLAB_CACHE_KEY = 'grao1000:compras-colab:v1';
const COLAB_CACHE_TTL = 4 * 60 * 60 * 1000;

async function loadColaboradores(){
  // A coluna Situação do relatório é a fonte de verdade para colaboradores ativos.
  try {
    const dados = await getColaboradores({ force: true });
    state.colaboradores = dedupeColaboradores(dados).filter(c=>norm(c.situacao)==='ativo');
  } catch(e) { console.warn(e); state.colaboradores = []; }
}
function colaboradorKey(c){ return String(c?.cpf || c?.documento || c?.id || norm(c?.nome || '')).trim(); }
function dedupeColaboradores(lista){
  const map=new Map();
  for(const c of (lista||[])){
    const key=colaboradorKey(c);
    if(!key) continue;
    const atual=map.get(key);
    // Mantém o registro mais completo quando houver duplicidade no snapshot/histórico.
    if(!atual || Object.keys(c||{}).filter(k=>c[k]).length > Object.keys(atual||{}).filter(k=>atual[k]).length){
      map.set(key,c);
    }
  }
  return [...map.values()].sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
}
function pushUniforme(c){
  const key=colaboradorKey(c);
  if(!key) return;
  if(!state.uniformes.some(x=>colaboradorKey(x)===key)) state.uniformes.push(c);
}
function uniformeCorOptions(value){
  return ['Verde','Cinza'].map(c=>`<option value="${c}"${norm(c)===norm(value)?' selected':''}>${c}</option>`).join('');
}
function uniformeTamanhoOptions(value){
  return UNIFORME_TAMANHOS.map(t=>`<option value="${t}"${t===value?' selected':''}>${t}</option>`).join('');
}
async function notifyCompras(message){
  const cfgs = await safe(()=>supabase.from('compras_notificacoes_config').select('*').eq('setor','COMPRAS').eq('ativo',true).limit(10));
  if(!cfgs.length) return {ok:false,msg:'Solicitação salva. Nenhum responsável configurado em compras_notificacoes_config.'};
  let ok=0;
  for(const cfg of cfgs){
    if(!cfg.telefone) continue;
    try{
      const tel=String(cfg.telefone).replace(/\D/g,'');
      const {data,error}=await supabase.functions.invoke('botconversa-send',{body:{phone:tel,message,nome:cfg.nome||''}});
      if(error || !data?.ok) console.warn('[notifyCompras] falha botconversa:', error, data);
      if(!error && data?.ok) ok++;
    }catch(e){ console.warn('[notifyCompras]',e); }
  }
  return {ok:ok>0,msg:ok?`BotConversa enviado para ${ok} responsável(is).`:'Solicitação salva, mas não foi possível enviar pelo BotConversa.'};
}
function buildMessage(ctx, tipo, itens){
  const nome=solicitanteNome(ctx); const data=brDate(document.getElementById('cmpData').value); const linhas=itens.map(i=>`• ${i.unidade||i.quantidade||1} un | ${i.material}${i.tamanho?` | Tam: ${i.tamanho}`:''}${i.colaborador_nome?` | ${i.colaborador_nome}`:''}`).join('\n');
  return `Nova solicitação de compras\nGestor: ${nome}\nData: ${data}\nTipo: ${tipo}\n\n${linhas}`;
}
function findCatalogoItem(value){
  const key=norm(value);
  return CATALOGO.find(i=>norm(i.material)===key);
}
function itemNeedsDetail(value){
  return ['botina','peneira individual'].includes(norm(value));
}
function updateDetalheState(material){
  const tam=document.getElementById('cmpNovoTam');
  if(!tam) return;
  const canonical=findCatalogoItem(material)?.material || material || '';
  const needs=itemNeedsDetail(canonical);
  tam.disabled=!needs;
  tam.placeholder=canonical==='BOTINA'?'Tamanho da botina':(canonical==='PENEIRA INDIVIDUAL'?'Abertura/tamanho da peneira':'Selecione Botina ou Peneira Individual');
  if(!needs) tam.value='';
}
function currentItemForm(){
  const raw=(document.getElementById('cmpNovoItem')?.value || '').trim();
  const found=findCatalogoItem(raw);
  const qtd=Number(document.getElementById('cmpNovaUn')?.value||1);
  return {
    unidade:qtd,
    material:found?.material || raw.toUpperCase(),
    tipo:found?.tipo || '',
    tamanho:(document.getElementById('cmpNovoTam')?.value||'').trim() || null,
    quantidade:qtd
  };
}
function selectCatalogoItem(material){
  const found=findCatalogoItem(material);
  const input=document.getElementById('cmpNovoItem');
  const box=document.getElementById('cmpItemSug');
  if(input) input.value=found?.material || material || '';
  updateDetalheState(found?.material || material || '');
  if(box) box.innerHTML='';
}
function renderItemSugestoes(){
  const input=document.getElementById('cmpNovoItem');
  const box=document.getElementById('cmpItemSug');
  if(!input || !box) return;
  const q=norm(input.value);
  const exact=findCatalogoItem(input.value);
  updateDetalheState(exact?.material || '');
  if(q.length<1){ box.innerHTML=''; return; }
  const list=CATALOGO.filter(i=>norm(i.material).includes(q)).slice(0,10);
  box.innerHTML=list.length
    ? list.map(i=>`<button type="button" data-item-sug="${esc(i.material)}"><span>${esc(i.material)}</span><small>${esc(i.tipo)}</small></button>`).join('')
    : '<div class="cmp-no-sug">Não está no catálogo — selecione o tipo e adicione como novo material.</div>';
  box.querySelectorAll('[data-item-sug]').forEach(btn=>btn.onmousedown=(ev)=>{
    ev.preventDefault();
    selectCatalogoItem(btn.dataset.itemSug);
  });
}
function resetItemForm(){
  document.getElementById('cmpNovaUn').value = 1;
  document.getElementById('cmpNovoItem').value = '';
  const box=document.getElementById('cmpItemSug');
  if(box) box.innerHTML='';
  const tam=document.getElementById('cmpNovoTam');
  tam.value=''; tam.disabled=true; tam.placeholder='Selecione Botina ou Peneira Individual';
}
function closeComprasModal(modal){
  modal?.classList.remove('open');
  document.body.classList.remove('cmp-modal-open');
}
function showComprasModal(modal){
  if(!modal) return;
  modal.classList.add('open');
  document.body.classList.add('cmp-modal-open');
  modal.onclick=e=>{ if(e.target===modal) closeComprasModal(modal); };
  modal.onkeydown=e=>{ if(e.key==='Escape') closeComprasModal(modal); };
  requestAnimationFrame(()=>modal.querySelector('input:not([disabled]),select:not([disabled]),button')?.focus());
}
function openCelularModal(baseItem){
  const modal=document.getElementById('cmpCelularModal');
  modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-labelledby','celModalTitle');
  modal.innerHTML=`<div class="cmp-cel-card cmp-dialog-card">
    <div class="cmp-dialog-head">
      <div class="cmp-dialog-title"><span class="cmp-dialog-icon" aria-hidden="true">▣</span><div><small>Nova solicitação</small><h3 id="celModalTitle">Compra de celular</h3><p>Informe quem receberá o aparelho e como será o desconto.</p></div></div>
      <button class="cmp-dialog-close" id="celClose" type="button" aria-label="Fechar janela">×</button>
    </div>
    <div class="cmp-dialog-body"><div class="cmp-grid">
      <div class="cmp-field cmp-full cmp-autocomplete-wrap">
        <label>Colaborador que receberá o celular</label>
        <input id="celColab" type="text" placeholder="Digite para pesquisar..." autocomplete="off">
        <div class="cmp-suggest cmp-item-suggest" id="celColabSug"></div>
      </div>
      <div class="cmp-field">
        <label>Tipo de desconto em folha</label>
        <select id="celMetodo">
          <option value="a_vista">À vista</option>
          <option value="parcelado">Parcelado</option>
        </select>
      </div>
      <div class="cmp-field" id="celParcelasWrap" style="display:none">
        <label>Número de parcelas (máx. 5x)</label>
        <select id="celParcelas">
          ${[2,3,4,5].map(n=>`<option value="${n}">${n}x</option>`).join('')}
        </select>
      </div>
    </div></div>
    <div class="cmp-dialog-footer">
      <span class="cmp-feedback" id="celFeedback"></span>
      <button class="btn btn-primary" id="celConfirmar" type="button">Adicionar à lista</button>
      <button class="btn btn-secondary" id="celCancelar" type="button">Cancelar</button>
    </div>
  </div>`;
  showComprasModal(modal);
  modal.querySelector('#celClose').onclick=()=>closeComprasModal(modal);
  modal.querySelector('#celCancelar').onclick=()=>closeComprasModal(modal);
  const metodo=modal.querySelector('#celMetodo');
  const parcelasWrap=modal.querySelector('#celParcelasWrap');
  metodo.onchange=()=>{ parcelasWrap.style.display=metodo.value==='parcelado'?'flex':'none'; };
  const colabInput=modal.querySelector('#celColab');
  const colabSug=modal.querySelector('#celColabSug');
  let selectedColab=null;
  let celDebounce=null;
  colabInput.addEventListener('input',()=>{
    selectedColab=null;
    const q=colabInput.value.trim(); if(q.length<2){colabSug.innerHTML='';return;}
    clearTimeout(celDebounce);
    celDebounce=setTimeout(async()=>{
      const data=await searchColaboradores(q,{limite:60}); // cache local
      const seen=new Set();
      const list=(data||[]).filter(c=>{const t=norm(c.ativo??'ativo');if(['false','0','inativo','desligado'].includes(t))return false;const k=norm(c.nome||'');if(seen.has(k))return false;seen.add(k);return true;}).slice(0,12);
      colabSug.innerHTML=list.map(c=>`<button type="button" data-cid="${esc(c.id)}" data-cnome="${esc(c.nome)}" data-ctipo="${esc(c.tipo||c.cargo||'')}">${esc(c.nome)} <small>${esc(c.cargo||c.tipo||'')}</small></button>`).join('');
      colabSug.querySelectorAll('button').forEach(b=>b.onmousedown=(ev)=>{ev.preventDefault(); selectedColab={id:b.dataset.cid,nome:b.dataset.cnome,tipo:b.dataset.ctipo}; colabInput.value=b.dataset.cnome; colabSug.innerHTML='';});
    },250);
  });
  colabInput.addEventListener('blur',()=>setTimeout(()=>{colabSug.innerHTML='';},160));
  modal.querySelector('#celConfirmar').onclick=()=>{
    const fb=modal.querySelector('#celFeedback');
    if(!selectedColab&&!colabInput.value.trim()){fb.textContent='Informe o colaborador.'; fb.classList.add('err'); return;}
    const colab=selectedColab||{id:null,nome:colabInput.value.trim()};
    const metodoVal=metodo.value;
    const parcelasVal=metodoVal==='parcelado'?Number(modal.querySelector('#celParcelas')?.value||1):1;
    state.itens.push({...baseItem,_id:`${Date.now()}_${Math.random().toString(16).slice(2)}`,colaborador_id:colab.id||null,colaborador_nome:colab.nome||null,colaborador_tipo:colab.tipo||'',_metodo:metodoVal,_parcelas:parcelasVal});
    resetItemForm();
    renderItensList();
    setMsg('cmpFeedback',`Celular adicionado: ${colab.nome}.`);
    closeComprasModal(modal);
  };
}

function openDistribModal(onConfirm){
  const epiItens=state.itens.filter(i=>i.tipo==='EPI');
  const modal=document.getElementById('cmpCelularModal');
  const distribucoes=[];
  let persistColab=null;
  const totalItem=i=>Number(i.unidade||i.quantidade||1);
  const distribTotal=id=>distribucoes.filter(d=>d.epi_id===id).reduce((s,d)=>s+d.quantidade,0);
  const restante=i=>totalItem(i)-distribTotal(i._id);

  function renderModal(){
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-labelledby','dcModalTitle');
    modal.innerHTML=`<div class="cmp-cel-card cmp-dialog-card cmp-dialog-wide">
      <div class="cmp-dialog-head">
        <div class="cmp-dialog-title"><span class="cmp-dialog-icon" aria-hidden="true">↗</span><div><small>Distribuição de EPI</small><h3 id="dcModalTitle">Informar colaboradores</h3><p>Associe cada item ao colaborador. Quantidades restantes seguem sem destinatário.</p></div></div>
        <button class="cmp-dialog-close" id="dcClose" type="button" aria-label="Fechar janela">×</button>
      </div>
      <div class="cmp-dialog-body">
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:8px">EPIs solicitados</p>
        <div class="cmp-dialog-list">
          ${epiItens.map(i=>`<div class="cmp-dialog-list-row">
            <span><b>${esc(i.material)}</b>${i.tamanho?` <small class="muted">Tam: ${esc(i.tamanho)}</small>`:''}</span>
            <span><b>${totalItem(i)}</b> un &nbsp;·&nbsp; <span style="color:${restante(i)>0?'#fde68a':'#86efac'}">${restante(i)} restante${restante(i)!==1?'s':''}</span></span>
          </div>`).join('')}
        </div>
        <div class="cmp-dialog-subcard">
          <p style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:12px">Adicionar distribuição</p>
          <div class="cmp-grid" style="gap:12px">
            <div class="cmp-field cmp-autocomplete-wrap cmp-full">
              <label>Colaborador</label>
              <input id="dcColab" type="text" placeholder="Digite o nome do colaborador..." autocomplete="off">
              <div class="cmp-suggest cmp-item-suggest" id="dcColabSug"></div>
            </div>
            <div class="cmp-field">
              <label>EPI</label>
              <select id="dcEpi">
                ${epiItens.map(i=>`<option value="${esc(i._id)}">${esc(i.material)}${i.tamanho?` (${esc(i.tamanho)})`:''} — ${restante(i)} un disponíveis</option>`).join('')}
              </select>
            </div>
            <div class="cmp-field">
              <label>Quantidade</label>
              <input id="dcQtd" type="number" min="1" value="1" style="max-width:120px">
            </div>
          </div>
          <div class="cmp-actions mt-12">
            <button class="btn btn-secondary" id="dcAdd" type="button">Adicionar</button>
          </div>
          <span class="cmp-feedback" id="dcFeedback"></span>
        </div>
        ${distribucoes.length?`<p style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:8px">Distribuições informadas</p>
        <div class="cmp-dialog-list">
          ${distribucoes.map((d,idx)=>`<div class="cmp-dialog-list-row">
            <span><b>${esc(d.colaborador_nome)}</b> &nbsp;·&nbsp; ${esc(d.material)} &nbsp;·&nbsp; ${d.quantidade} un</span>
            <button class="btn btn-small btn-danger" data-rem="${idx}" type="button">×</button>
          </div>`).join('')}
        </div>`:''}
      </div>
      <div class="cmp-dialog-footer">
        <button class="btn btn-primary" id="dcConfirmar" type="button">Solicitar com esta distribuição</button>
        <button class="btn btn-secondary" id="dcSemColab" type="button">Solicitar sem distribuição</button>
      </div>
    </div>`;
    showComprasModal(modal);
    modal.querySelector('#dcClose').onclick=()=>closeComprasModal(modal);
    modal.querySelector('#dcSemColab').onclick=()=>{ closeComprasModal(modal); onConfirm(null); };
    modal.querySelector('#dcConfirmar').onclick=()=>{
      closeComprasModal(modal);
      const finalItens=[];
      state.itens.filter(i=>i.tipo!=='EPI').forEach(i=>finalItens.push({...i}));
      epiItens.forEach(item=>{
        const itemDistribs=distribucoes.filter(d=>d.epi_id===item._id);
        const totalDistrib=itemDistribs.reduce((s,d)=>s+d.quantidade,0);
        const rem=totalItem(item)-totalDistrib;
        itemDistribs.forEach(d=>finalItens.push({...item,_id:`${Date.now()}_${Math.random().toString(16).slice(2)}`,unidade:d.quantidade,quantidade:d.quantidade,colaborador_id:d.colaborador_id||null,colaborador_nome:d.colaborador_nome}));
        if(rem>0) finalItens.push({...item,_id:`${Date.now()}_${Math.random().toString(16).slice(2)}`,unidade:rem,quantidade:rem,colaborador_id:null,colaborador_nome:null});
        if(itemDistribs.length===0) finalItens.push({...item});
      });
      onConfirm(finalItens);
    };
    modal.querySelectorAll('[data-rem]').forEach(btn=>btn.onclick=()=>{ distribucoes.splice(Number(btn.dataset.rem),1); renderModal(); });
    const colabInput=modal.querySelector('#dcColab');
    const colabSug=modal.querySelector('#dcColabSug');
    let selectedColab=persistColab;
    if(persistColab) colabInput.value=persistColab.nome;
    let dcDebounce=null;
    colabInput.addEventListener('input',()=>{
      selectedColab=null;
      persistColab=null;
      const q=colabInput.value.trim();
      if(q.length<2){colabSug.innerHTML='';return;}
      clearTimeout(dcDebounce);
      dcDebounce=setTimeout(async()=>{
        const data=await searchColaboradores(q,{limite:60}); // cache local
        const seen=new Set();
        const list=(data||[]).filter(c=>{const t=norm(c.ativo??'ativo');if(['false','0','inativo','desligado'].includes(t))return false;const k=norm(c.nome||'');if(seen.has(k))return false;seen.add(k);return true;}).slice(0,12);
        colabSug.innerHTML=list.map(c=>`<button type="button" data-cid="${esc(c.id)}" data-cnome="${esc(c.nome)}">${esc(c.nome)} <small>${esc(c.cargo||c.tipo||'')}</small></button>`).join('');
        colabSug.querySelectorAll('button').forEach(b=>b.onmousedown=(ev)=>{ev.preventDefault(); selectedColab={id:b.dataset.cid,nome:b.dataset.cnome}; colabInput.value=b.dataset.cnome; colabSug.innerHTML='';});
      },250);
    });
    colabInput.addEventListener('blur',()=>setTimeout(()=>{colabSug.innerHTML='';},160));
    modal.querySelector('#dcAdd').onclick=()=>{
      const fb=modal.querySelector('#dcFeedback');
      const colab=selectedColab||(colabInput.value.trim()?{id:null,nome:colabInput.value.trim()}:null);
      if(!colab){fb.textContent='Informe o colaborador.';fb.classList.add('err');return;}
      const epiSelect=modal.querySelector('#dcEpi');
      const epiItem=epiItens.find(i=>i._id===epiSelect.value);
      if(!epiItem){fb.textContent='Selecione o EPI.';fb.classList.add('err');return;}
      const qtd=Number(modal.querySelector('#dcQtd').value||0);
      if(qtd<1){fb.textContent='Informe a quantidade.';fb.classList.add('err');return;}
      const rem=restante(epiItem);
      if(qtd>rem){fb.textContent=`Quantidade excede o disponível (${rem} un restantes).`;fb.classList.add('err');return;}
      distribucoes.push({epi_id:epiItem._id,colaborador_id:colab.id||null,colaborador_nome:colab.nome,quantidade:qtd,material:epiItem.material});
      persistColab=colab;
      renderModal();
    };
  }
  renderModal();
}

function bindItemForm(){
  const input=document.getElementById('cmpNovoItem');
  const box=document.getElementById('cmpItemSug');
  input.addEventListener('input', renderItemSugestoes);
  input.addEventListener('focus', renderItemSugestoes);
  input.addEventListener('blur',()=>setTimeout(()=>{ if(box) box.innerHTML=''; },160));
  input.addEventListener('keydown',(ev)=>{
    if(ev.key==='Enter'){
      const first=box?.querySelector('[data-item-sug]');
      if(first){ ev.preventDefault(); selectCatalogoItem(first.dataset.itemSug); }
    }
    if(ev.key==='Escape' && box) box.innerHTML='';
  });
  document.getElementById('cmpAddMaterial').onclick=()=>{
    const found=findCatalogoItem(document.getElementById('cmpNovoItem')?.value || '');
    const item=currentItemForm();
    if(!item.material){ setMsg('cmpFeedback','Digite o nome do material antes de adicionar.',true); return; }
    if(found && itemNeedsDetail(found.material) && !item.tamanho){ setMsg('cmpFeedback','Informe o tamanho/detalhe antes de adicionar na lista.',true); return; }
    if(norm(item.material)==='celular'){ openCelularModal({...item, tipo:'Outros'}); return; }
    state.itens.push({...item, _id:`${Date.now()}_${Math.random().toString(16).slice(2)}`});
    resetItemForm();
    renderItensList();
    setMsg('cmpFeedback','Material adicionado na lista.');
  };
}
function renderItensList(){
  const body=document.getElementById('cmpItemBody');
  if(!body) return;
  if(!state.itens.length){
    body.innerHTML='<tr><td colspan="4" class="cmp-empty">Nenhum material adicionado. Selecione o item acima e clique em <b>Adicionar material</b>.</td></tr>';
    return;
  }
  body.innerHTML=state.itens.map(i=>{
    const isCelular=norm(i.material)==='celular';
    const matLabel=isCelular&&i.colaborador_nome?`${esc(i.material)}<br><small class="muted">${esc(i.colaborador_nome)} · ${i._metodo==='parcelado'?`${i._parcelas||1}x`:'À vista'}</small>`:esc(i.material);
    return `<tr data-item-id="${esc(i._id)}"><td data-label="Un.">${esc(i.unidade||i.quantidade||1)}</td><td data-label="Item">${matLabel}</td><td data-label="Tamanho/Detalhe">${esc(i.tamanho||'-')}</td><td><button class="btn btn-small btn-danger" type="button" data-del-item>Remover</button></td></tr>`;
  }).join('');
  body.querySelectorAll('[data-del-item]').forEach(btn=>btn.onclick=()=>{
    const id=btn.closest('tr').dataset.itemId;
    state.itens=state.itens.filter(i=>String(i._id)!==String(id));
    renderItensList();
  });
}
function uniformRow(c){
  const cor=c._uniformeCor||'Verde';
  const tamanho=c._uniformeTamanho||'M';
  const qtd=Math.min(2,Math.max(1,Number(c._uniformeQtd||1)));
  return `<tr class="cmp-uniforme-row" data-uniforme-id="${esc(colaboradorKey(c))}"><td data-label="Colaborador"><strong>${esc(c.nome)}</strong></td><td data-label="Função/tipo">${esc(c.tipo||c.cargo||'-')}</td><td data-label="Cor"><select class="uni-cor" aria-label="Cor do uniforme de ${esc(c.nome)}">${uniformeCorOptions(cor)}</select></td><td data-label="Tamanho"><select class="uni-tam" aria-label="Tamanho do uniforme de ${esc(c.nome)}">${uniformeTamanhoOptions(tamanho)}</select></td><td data-label="Un."><input class="uni-qtd" aria-label="Unidades para ${esc(c.nome)}" type="number" inputmode="numeric" min="1" max="2" value="${qtd}"></td><td class="cmp-row-action"><button class="btn btn-small btn-danger" aria-label="Remover ${esc(c.nome)}" type="button" data-del-uniforme>×</button></td></tr>`;
}
function renderUniformes(){
  const body=document.getElementById('cmpUniformeBody');
  body.innerHTML=state.uniformes.map(uniformRow).join('') || `<tr><td colspan="6" class="cmp-empty">Nenhum colaborador adicionado.</td></tr>`;
  body.querySelectorAll('[data-del-uniforme]').forEach(btn=>btn.onclick=()=>{ const id=btn.closest('tr').dataset.uniformeId; state.uniformes=state.uniformes.filter(c=>colaboradorKey(c)!==String(id)); renderUniformes(); });
  body.querySelectorAll('[data-uniforme-id]').forEach(tr=>{
    const c=state.uniformes.find(x=>colaboradorKey(x)===tr.dataset.uniformeId);
    if(!c) return;
    tr.querySelector('.uni-cor').onchange=e=>{ c._uniformeCor=e.target.value; };
    tr.querySelector('.uni-tam').onchange=e=>{ c._uniformeTamanho=e.target.value; };
    tr.querySelector('.uni-qtd').onchange=e=>{ const qtd=Math.min(2,Math.max(1,Number(e.target.value||1))); c._uniformeQtd=qtd; e.target.value=qtd; };
  });
}
function addAllColaboradores(ctx){
  const u=usuario(ctx);
  const valores=(lista)=>new Set(lista.flatMap(v=>String(v||'').split(/[,;|]/)).map(norm).filter(Boolean));
  // Regional/supervisão é o escopo operacional. Coordenação só é usada como
  // fallback quando o cadastro do usuário não informa a regional.
  let escopos=valores([u.regional,u.supervisao,ctx?.regional,ctx?.supervisao]);
  let campoRegional=(c)=>valores([c.regional,c.supervisao]);
  if(!escopos.size){
    escopos=valores([u.coordenacao,ctx?.coordenacao]);
    campoRegional=(c)=>valores([c.coordenacao]);
  }
  if(!escopos.size){ setMsg('cmpFeedback','Seu usuário não possui uma regional cadastrada. Solicite o ajuste do cadastro.',true); return; }
  const base=state.colaboradores.filter(c=>{
    const regionais=campoRegional(c);
    return [...regionais].some(regional=>escopos.has(regional));
  });
  state.uniformes = dedupeColaboradores(base).map(c=>({...c,_uniformeTamanho:'M',_uniformeCor:'Verde',_uniformeQtd:1}));
  renderUniformes();
  setMsg('cmpFeedback',base.length?`${state.uniformes.length} colaborador(es) da regional adicionados.`:'Nenhum colaborador ativo foi encontrado para a sua regional.',!base.length);
}
function setupColabSearch(){
  const input=document.getElementById('cmpColabBusca'); const box=document.getElementById('cmpColabSug');
  let selecionado=null;
  input.addEventListener('input',()=>{
    selecionado=null;
    const q=norm(input.value); if(q.length<2){box.innerHTML='';return;}
    const list=dedupeColaboradores(state.colaboradores.filter(c=>norm(c.nome).includes(q))).slice(0,10);
    box.innerHTML=list.map(c=>`<button type="button" data-add-colab="${esc(colaboradorKey(c))}">${esc(c.nome)} <small>${esc(c.tipo||c.cargo||'')}</small></button>`).join('');
    box.querySelectorAll('[data-add-colab]').forEach(btn=>btn.onclick=()=>{ selecionado=state.colaboradores.find(x=>colaboradorKey(x)===btn.dataset.addColab)||null; if(!selecionado)return; input.value=selecionado.nome; document.getElementById('cmpUniCor').value='Verde'; box.innerHTML=''; });
  });
  document.getElementById('cmpAddUniforme').onclick=()=>{
    if(!selecionado){ setMsg('cmpFeedback','Selecione um colaborador pelo nome antes de adicionar.',true); return; }
    const item={...selecionado,_uniformeTamanho:document.getElementById('cmpUniTamanho').value,_uniformeCor:document.getElementById('cmpUniCor').value};
    const key=colaboradorKey(item);
    state.uniformes=state.uniformes.filter(c=>colaboradorKey(c)!==key);
    state.uniformes.push(item);
    input.value=''; selecionado=null; box.innerHTML='';
    renderUniformes(); setMsg('cmpFeedback','Uniforme adicionado à lista.');
  };
}
function isSchemaColumnError(error){
  const msg=String(error?.message||error?.details||error?.hint||'').toLowerCase();
  return msg.includes('schema cache') || msg.includes('could not find') || msg.includes('column') || error?.code==='PGRST204';
}
async function insertSolicitacaoComCompatibilidade(header){
  let res = await supabase.from('compras_solicitacoes').insert(header).select('id').single();
  if(!res.error) return res;

  // Compatibilidade com bancos que ainda não têm todas as colunas novas da tela.
  // Remove somente as colunas apontadas pelo erro e tenta novamente, sem travar a solicitação do gestor.
  let limpo = {...header};
  const msg = String(res.error?.message || '');
  const possiveis = ['coordenacao','solicitante_id','created_by','observacoes','tipo_solicitacao'];
  let removeu = false;

  for(const col of possiveis){
    if(msg.includes(`'${col}'`) || msg.includes(`"${col}"`) || msg.toLowerCase().includes(` ${col} `)){
      delete limpo[col];
      removeu = true;
    }
  }

  if(!removeu && isSchemaColumnError(res.error)){
    // Caso o PostgREST não informe claramente a coluna, remove as menos essenciais.
    delete limpo.coordenacao;
    delete limpo.solicitante_id;
    delete limpo.created_by;
  }

  res = await supabase.from('compras_solicitacoes').insert(limpo).select('id').single();
  return res;
}
async function salvarSolicitacao(ctx, tipo, itens){
  const u=usuario(ctx); const data=document.getElementById('cmpData').value || today();
  if(data < today()) throw new Error('A data da solicitação não pode ser anterior à data atual.');
  const header={
    data_solicitacao:data,
    solicitante_id:u.id||null,
    solicitante:solicitanteNome(ctx),
    coordenacao:u.coordenacao||u.supervisao||null,
    tipo_solicitacao:tipo,
    status:'pendente',
    cidade:document.getElementById('cmpCidade')?.value.trim()||null,
    uf:document.getElementById('cmpUf')?.value||null,
    observacoes:document.getElementById('cmpObs').value.trim()||null,
    fornecedor:document.getElementById('cmpFornecedor')?.value.trim()||null,
    telefone_fornecedor:document.getElementById('cmpTelFornecedor')?.value.replace(/\D/g,'')||null,
    created_by:u.id||null
  };
  const {data:sol,error}=await insertSolicitacaoComCompatibilidade(header);
  if(error) throw error;
  const payload=itens.map(i=>({...i, solicitacao_id:sol.id, status:'pendente'}));
  const {data:insertedItems,error:itemErr}=await supabase.from('compras_itens').insert(payload).select('id,material,colaborador_id,colaborador_nome');
  if(itemErr) throw itemErr;
  return {sol_id:sol.id, insertedItems:insertedItems||[]};
}
async function submitItens(ctx, overrideItems=null){
  const raw=(overrideItems||state.itens).filter(i=>i.material);
  if(!raw.length) throw new Error('Adicione pelo menos um material na lista antes de solicitar.');
  const dbItens=raw.map(({_id,_metodo,_parcelas,...i})=>i);
  const {insertedItems}=await salvarSolicitacao(ctx,'itens',dbItens);
  // Insert termos_celular for CELULAR items
  const celularPairs=raw.reduce((acc,orig,idx)=>{
    if(norm(orig.material)==='celular'&&insertedItems?.[idx]) acc.push({orig,inserted:insertedItems[idx]});
    return acc;
  },[]);
  if(celularPairs.length){
    const termos=celularPairs.map(({orig,inserted})=>({
      compra_item_id:inserted.id,
      colaborador_id:orig.colaborador_id||null,
      colaborador_nome:orig.colaborador_nome||null,
      metodo_pagamento:orig._metodo||'a_vista',
      parcelas:orig._parcelas||1,
      status:'aguardando_termo',
      created_at:new Date().toISOString()
    }));
    await safe(()=>supabase.from('termos_celular').insert(termos));
  }
  return dbItens;
}
async function submitUniformes(ctx){
  const rows=[...document.querySelectorAll('[data-uniforme-id]')];
  const itens=rows.map(tr=>{ const c=state.uniformes.find(x=>colaboradorKey(x)===tr.dataset.uniformeId) || {}; const qtd=Math.min(2,Math.max(1,Number(tr.querySelector('.uni-qtd').value||1))); return {unidade:qtd, quantidade:qtd, material:'UNIFORME', tipo:'Uniforme', tamanho:tr.querySelector('.uni-tam')?.value||c._uniformeTamanho||'M', colaborador_id:c.id||null, colaborador_nome:c.nome||'', colaborador_tipo:c.tipo||c.cargo||'', uniforme_cor:tr.querySelector('.uni-cor')?.value||c._uniformeCor||'Verde'}; });
  if(!itens.length) throw new Error('Adicione pelo menos um colaborador.');
  await salvarSolicitacao(ctx,'uniformes',itens);
  return itens;
}
async function loadMinhas(userId){
  let q=supabase.from('compras_solicitacoes').select('*, compras_itens(*)').order('created_at',{ascending:false}).limit(80);
  if(userId) q=q.eq('solicitante_id',userId);
  const data=await safe(()=>q);
  state.rows=data;
  renderMinhas();
}
function historyGroup(status){
  if(status==='comprado') return 'concluidos';
  if(status==='recusado') return 'cancelados';
  return 'pendentes';
}
function solicitacaoUniformeEditavel(s){
  return norm(s?.tipo_solicitacao)==='uniformes' && !['comprado','recusado','cancelado','concluido','fechado'].includes(norm(s?.status));
}
function historyUniformeItem(item, editavel){
  const qtd=Math.min(2,Math.max(1,Number(item.quantidade||item.unidade||1)));
  if(!editavel) return `<div class="cmp-history-uniforme"><strong>${esc(item.colaborador_nome||'Colaborador')}</strong><span>${qtd} un · ${esc(item.uniforme_cor||'-')} · Tam. ${esc(item.tamanho||'-')}</span></div>`;
  return `<div class="cmp-history-uniforme is-editable" data-edit-uniforme="${esc(item.id)}"><div class="cmp-history-person"><strong>${esc(item.colaborador_nome||'Colaborador')}</strong><small>${esc(item.colaborador_tipo||'')}</small></div><label><span>Cor</span><select class="hist-uni-cor">${uniformeCorOptions(item.uniforme_cor||'Verde')}</select></label><label><span>Tamanho</span><select class="hist-uni-tam">${uniformeTamanhoOptions(item.tamanho||'M')}</select></label><label><span>Un.</span><input class="hist-uni-qtd" type="number" inputmode="numeric" min="1" max="2" value="${qtd}"></label><button class="btn btn-small btn-secondary" type="button" data-save-uniforme>Salvar</button></div>`;
}
async function salvarUniformeAberto(button){
  const box=button.closest('[data-edit-uniforme]');
  const itemId=box?.dataset.editUniforme;
  const solicitacao=state.rows.find(s=>(s.compras_itens||[]).some(i=>String(i.id)===String(itemId)));
  if(!box || !solicitacaoUniformeEditavel(solicitacao)) throw new Error('Esta solicitação já foi fechada e não pode mais ser editada.');
  const qtd=Math.min(2,Math.max(1,Number(box.querySelector('.hist-uni-qtd').value||1)));
  const payload={uniforme_cor:box.querySelector('.hist-uni-cor').value,tamanho:box.querySelector('.hist-uni-tam').value,quantidade:qtd,unidade:qtd};
  button.disabled=true; button.textContent='Salvando…';
  const {data:statusAtual,error:statusError}=await supabase.from('compras_solicitacoes').select('status,tipo_solicitacao').eq('id',solicitacao.id).maybeSingle();
  if(statusError) throw statusError;
  if(!solicitacaoUniformeEditavel(statusAtual)) throw new Error('Esta solicitação foi fechada e não pode mais ser editada.');
  const {data,error}=await supabase.from('compras_itens').update(payload).eq('id',itemId).select('id').maybeSingle();
  if(error) throw error;
  if(!data) throw new Error('O item não pôde ser alterado. Atualize a página e confira se o pedido ainda está aberto.');
  const item=solicitacao.compras_itens.find(i=>String(i.id)===String(itemId));
  Object.assign(item,payload);
  button.textContent='Salvo ✓';
  setTimeout(()=>{ if(button.isConnected){ button.disabled=false; button.textContent='Salvar'; } },1400);
}
function renderMinhas(){
  const body=document.getElementById('cmpMinhasBody');
  if(!body) return;
  const data=state.rows.filter(r=>historyGroup(r.status)===state.historyFilter);
  document.querySelectorAll('[data-history-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.historyFilter===state.historyFilter));
  if(!data.length){ body.innerHTML='<tr><td colspan="5" class="cmp-empty">Nenhuma solicitação neste status.</td></tr>'; return; }
  body.innerHTML=data.map(r=>`<tr><td data-label="Data">${brDate(r.data_solicitacao)}</td><td data-label="Tipo">${esc(r.tipo_solicitacao)}</td><td data-label="Itens"><div class="cmp-items-cell">${(r.compras_itens||[]).map(i=>norm(r.tipo_solicitacao)==='uniformes'?historyUniformeItem(i,solicitacaoUniformeEditavel(r)):`<span>${esc(i.quantidade||i.unidade||1)} un · ${esc(i.material)}${i.tamanho?` <small>${esc(i.tamanho)}</small>`:''}</span>`).join('')}</div></td><td data-label="Status">${pill(r.status)}</td><td data-label="Motivo">${esc(r.motivo_recusa||'—')}</td></tr>`).join('');
  body.querySelectorAll('[data-save-uniforme]').forEach(btn=>btn.onclick=async()=>{
    try{ await salvarUniformeAberto(btn); }
    catch(e){ btn.disabled=false; btn.textContent='Salvar'; setMsg('cmpHistoryFeedback',e.message||'Não foi possível salvar a alteração.',true); }
  });
}
function styles(){return `<style>
.cmp-tabs,.cmp-actions{display:flex;gap:8px;flex-wrap:wrap}.cmp-tab{width:auto!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#a9b8b1!important;padding:10px 14px 9px!important;font-weight:700;font-size:13px;border-bottom:2px solid transparent!important}.cmp-tab:hover{color:#d9fbe8!important;background:rgba(34,197,94,.035)!important}.cmp-tab.active{background:transparent!important;color:#35e990!important;border-color:transparent!important;border-bottom-color:#22e58a!important}.cmp-panel{display:none}.cmp-panel.active{display:block}.cmp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}.cmp-table{width:100%;border-collapse:collapse;min-width:680px}.cmp-table th,.cmp-table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}.cmp-table th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:800;background:rgba(13,32,24,.5)}.cmp-table input,.cmp-table select,.cmp-field input,.cmp-field select,.cmp-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--line-2);background:#0a1e17;color:var(--text);border-radius:11px;padding:9px 11px;color-scheme:dark;min-height:40px;font-size:14px}.cmp-table input:focus,.cmp-table select:focus,.cmp-field input:focus,.cmp-field select:focus,.cmp-field textarea:focus{border-color:var(--green-2);outline:2px solid rgba(111,208,165,.16)}.cmp-field label{font-size:11px;color:var(--muted);font-weight:700}.cmp-field select{appearance:none;-webkit-appearance:none;-moz-appearance:none;padding-right:42px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%23cbd5e1' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;background-size:14px}.cmp-field select:disabled,.cmp-table select:disabled,.cmp-field input:disabled,.cmp-table input:disabled,.cmp-field textarea:disabled{opacity:.72;cursor:not-allowed}.cmp-field{display:flex;flex-direction:column;gap:5px}.cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cmp-add-box{display:grid;grid-template-columns:90px 1.4fr 1fr 1fr auto;gap:10px;align-items:start}.cmp-add-box .cmp-field small.muted{display:block;font-size:11px;line-height:1.3;margin-top:2px}.cmp-add-action .btn{white-space:nowrap}.cmp-full{grid-column:1/-1}.cmp-autocomplete-wrap{position:relative}.cmp-suggest{display:grid;gap:6px;margin-top:6px}.cmp-suggest button{text-align:left;border:1px solid var(--line-2);background:#0a1e17;color:var(--text);border-radius:11px;padding:9px;cursor:pointer}.cmp-item-suggest{position:absolute;top:100%;left:0;right:0;z-index:50;background:#0a1e17;border:1px solid var(--line-2);border-radius:12px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,.38);max-height:260px;overflow:auto}.cmp-item-suggest:empty{display:none}.cmp-item-suggest button{display:flex;justify-content:space-between;align-items:center;gap:10px}.cmp-item-suggest small{color:var(--muted);font-weight:800}.cmp-no-sug{color:var(--muted);padding:10px 12px;font-weight:700}.cmp-status{display:inline-flex;padding:6px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.25);font-weight:800;font-size:12px}.cmp-status.pendente,.cmp-status.em_cotacao,.cmp-status.em_analise,.cmp-status.pendente_pagamento,.cmp-status.aguardando_nf,.cmp-status.aguardando_termo{color:#fde68a;background:rgba(245,158,11,.1)}.cmp-status.comprado{color:#bbf7d0;background:rgba(22,101,52,.18)}.cmp-status.recusado{color:#fecaca;background:rgba(220,38,38,.12)}.cmp-feedback{font-weight:700}.cmp-feedback.err{color:#fecaca}.cmp-empty{color:var(--muted);text-align:center}.cmp-actions{display:flex;gap:10px;flex-wrap:wrap}
body.cmp-modal-open{overflow:hidden}.cmp-cel-modal{position:fixed;inset:0;background:rgba(1,10,7,.8);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:9999;display:none;align-items:center;justify-content:center;padding:clamp(12px,3vw,32px)}.cmp-cel-modal.open{display:flex;animation:cmpBackdropIn .18s ease-out}.cmp-cel-card{width:min(600px,100%);max-height:min(90vh,780px);overflow:hidden;background:linear-gradient(155deg,#0d271d 0%,#071711 72%);border:1px solid rgba(111,208,165,.28);border-radius:24px;color:var(--text);box-shadow:0 28px 90px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.04);animation:cmpDialogIn .24s cubic-bezier(.2,.8,.2,1)}.cmp-dialog-wide{width:min(760px,100%)}.cmp-dialog-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:22px 22px 18px;border-bottom:1px solid rgba(111,208,165,.14);background:linear-gradient(110deg,rgba(35,105,72,.24),transparent 68%)}.cmp-dialog-title{display:flex;align-items:flex-start;gap:13px}.cmp-dialog-icon{display:grid;place-items:center;flex:0 0 40px;height:40px;border-radius:13px;background:rgba(73,194,139,.14);border:1px solid rgba(111,208,165,.25);color:#8ee0b8;font-size:19px}.cmp-dialog-title small{display:block;color:#70c99d;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.11em;margin:0 0 4px}.cmp-dialog-title h3{margin:0;color:#f2fff8;font-size:21px;line-height:1.15}.cmp-dialog-title p{margin:6px 0 0;color:#9fb9ac;font-size:13px;line-height:1.45}.cmp-dialog-close{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.2);background:rgba(3,17,12,.62);color:#b9cec3;font-size:24px;line-height:1;cursor:pointer;transition:.18s ease}.cmp-dialog-close:hover,.cmp-dialog-close:focus-visible{color:#fff;background:rgba(220,38,38,.18);border-color:rgba(248,113,113,.35);outline:none;transform:rotate(4deg)}.cmp-dialog-body{padding:22px;overflow:auto;max-height:calc(min(90vh,780px) - 165px);scrollbar-color:#367d5c transparent}.cmp-dialog-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 22px 20px;border-top:1px solid rgba(111,208,165,.14);background:rgba(3,14,10,.56)}.cmp-dialog-footer .cmp-feedback{margin-right:auto}.cmp-dialog-footer .btn{width:auto!important;margin:0!important;min-height:42px;padding-inline:18px!important}.cmp-dialog-list{display:grid;gap:8px;margin-bottom:18px}.cmp-dialog-list-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:11px 13px;border:1px solid rgba(111,208,165,.15);border-radius:13px;background:rgba(8,31,22,.58);font-size:13px}.cmp-dialog-subcard{background:linear-gradient(145deg,rgba(14,46,33,.75),rgba(5,22,15,.72));border:1px solid rgba(111,208,165,.18);border-radius:17px;padding:17px;margin-bottom:18px}@keyframes cmpBackdropIn{from{opacity:0}to{opacity:1}}@keyframes cmpDialogIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
.cmp-workspace{display:grid;grid-template-columns:minmax(360px,430px) minmax(0,1fr);gap:16px;align-items:start}.cmp-request-card,.cmp-history-card{min-width:0}.cmp-request-card{position:sticky;top:16px}.cmp-request-card .section-head{align-items:flex-start;flex-direction:column}.cmp-request-card .cmp-tabs{order:-1}.cmp-request-card .cmp-grid{grid-template-columns:1fr}.cmp-request-card .cmp-add-box{grid-template-columns:82px minmax(0,1fr) 110px}.cmp-request-card .cmp-add-box .cmp-field:nth-child(1){grid-column:1}.cmp-request-card .cmp-add-box .cmp-field:nth-child(2){grid-column:2/4}.cmp-request-card .cmp-add-box .cmp-field:nth-child(3){grid-column:1/3}.cmp-request-card .cmp-add-box .cmp-field:nth-child(4){grid-column:3}.cmp-request-card .cmp-add-action{grid-column:1/-1}.cmp-request-card .cmp-add-action label{display:none}.cmp-request-card .cmp-add-action .btn,.cmp-request-card #cmpSolicitar{width:100%}.cmp-request-card .cmp-table{min-width:560px}.cmp-request-card .cmp-table-wrap{max-height:260px}.cmp-request-card #panel-uniformes .cmp-actions{display:grid}.cmp-request-card #panel-uniformes .cmp-field{min-width:0!important}.cmp-history-head{align-items:flex-end}.cmp-history-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.cmp-history-filter{width:auto!important;margin:0!important;border-radius:999px!important;padding:8px 16px!important}.cmp-history-filter.active{background:linear-gradient(135deg,var(--green-3),var(--green))!important;border-color:var(--green-2)!important;color:#f0fff7!important}.cmp-history-card .cmp-table-wrap{border-radius:16px}.cmp-history-card .cmp-table td{padding-top:16px;padding-bottom:16px}.cmp-items-cell{display:grid;gap:5px}.cmp-items-cell span{display:block}.cmp-items-cell small{color:var(--muted);margin-left:4px}.cmp-request-card .form-actions{display:grid;gap:10px}.cmp-feedback{line-height:1.45}
.cmp-uniforme-add{display:grid;grid-template-columns:minmax(0,1fr) 82px 90px;gap:10px;align-items:end}.cmp-uniforme-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.cmp-uniforme-actions .btn{width:100%;margin:0!important;padding-inline:10px!important}
.cmp-uniforme-row strong{font-weight:750}.cmp-uniforme-row .uni-qtd{min-width:62px}.cmp-row-action{width:44px}.cmp-history-uniforme{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}.cmp-history-uniforme:last-child{border-bottom:0}.cmp-history-uniforme>span{color:var(--muted);white-space:nowrap}.cmp-history-uniforme.is-editable{display:grid;grid-template-columns:minmax(150px,1fr) 92px 94px 62px auto;align-items:end;gap:8px}.cmp-history-person{display:grid;gap:2px;align-self:center}.cmp-history-person small{color:var(--muted)}.cmp-history-uniforme label{display:grid;gap:3px}.cmp-history-uniforme label>span{font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.cmp-history-uniforme select,.cmp-history-uniforme input{min-height:34px!important;padding:6px 8px!important}.cmp-history-uniforme .btn{min-height:34px;white-space:nowrap}.cmp-history-feedback{display:block;margin:0 0 10px}
@media(max-width:1180px){.cmp-workspace{grid-template-columns:minmax(330px,380px) minmax(0,1fr)}}
@media(max-width:960px){.cmp-workspace{grid-template-columns:1fr}.cmp-request-card{position:static}.cmp-request-card .cmp-add-box{grid-template-columns:90px minmax(0,1fr) 130px}.cmp-history-head{align-items:flex-start}}
@media(max-width:760px){
  .cmp-workspace,.cmp-request-card,#panel-uniformes{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box}
  .cmp-grid,.cmp-add-box,.cmp-request-card .cmp-add-box{grid-template-columns:1fr}
  .cmp-uniforme-add{grid-template-columns:1fr 82px 90px}.cmp-uniforme-actions{grid-template-columns:1fr 1fr}
  .cmp-request-card .cmp-add-box .cmp-field{grid-column:1!important}
  .cmp-history-filters{width:100%}.cmp-history-filter{flex:1;padding-inline:10px!important}
  .cmp-table-wrap{overflow:visible;border:0}
  .cmp-table{min-width:0;width:100%}
  .cmp-table thead{display:none}
  .cmp-table,.cmp-table tbody,.cmp-table tr,.cmp-table td{display:block;width:100%}
  .cmp-table tr{margin-bottom:12px;border:1px solid var(--line);border-radius:16px;overflow:hidden}
  .cmp-table tr:last-child{margin-bottom:0}
  .cmp-table td{border-bottom:1px solid var(--line)}
  .cmp-table td:last-child{border-bottom:0}
  .cmp-table td[data-label]::before{content:attr(data-label);display:block;font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
  .cmp-request-card #panel-uniformes .cmp-table{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;table-layout:fixed}
  #panel-uniformes .cmp-table-wrap{display:block;width:100%!important;max-width:100%!important;min-width:0!important;max-height:min(52dvh,620px)!important;overflow-x:hidden!important;overflow-y:auto!important;padding:2px 4px 18px 0;border:0!important;box-sizing:border-box;overscroll-behavior-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y}
  #cmpUniformeBody{display:grid!important;gap:10px;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box}
  .cmp-uniforme-row{position:relative;display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;width:100%!important;min-width:0!important;margin:0!important;padding:14px 12px 12px;border:1px solid var(--line-2)!important;border-radius:16px!important;background:linear-gradient(145deg,rgba(11,38,27,.98),rgba(5,24,17,.98))!important;box-shadow:0 8px 22px rgba(0,0,0,.16);overflow:visible!important}
  .cmp-uniforme-row td{display:block!important;width:auto!important;min-width:0!important;padding:8px!important;border:0!important;box-sizing:border-box}
  .cmp-uniforme-row td:nth-child(1){grid-column:1/-1;padding-right:52px!important;padding-bottom:3px!important}
  .cmp-uniforme-row td:nth-child(1) strong{display:block;overflow-wrap:anywhere;font-size:14px;line-height:1.3}
  .cmp-uniforme-row td:nth-child(2){grid-column:1/-1;padding-top:3px!important;padding-right:52px!important;color:var(--muted);font-size:12px}
  .cmp-uniforme-row td:nth-child(3){grid-column:span 3}
  .cmp-uniforme-row td:nth-child(4){grid-column:span 2}
  .cmp-uniforme-row td:nth-child(5){grid-column:span 1}
  .cmp-uniforme-row td[data-label]::before{margin-bottom:6px}
  .cmp-uniforme-row select,.cmp-uniforme-row input{width:100%!important;min-width:0!important;min-height:44px!important;padding:8px 10px!important;border-radius:11px!important;font-size:15px!important}
  .cmp-uniforme-row .uni-qtd{min-width:0!important;text-align:center;padding-inline:4px!important}
  .cmp-uniforme-row .cmp-row-action{position:absolute;top:12px;right:12px;display:block!important;width:38px!important;padding:0!important}
  .cmp-uniforme-row .cmp-row-action .btn{display:grid;place-items:center;width:38px!important;min-width:38px!important;height:38px;min-height:38px!important;margin:0!important;padding:0!important;border-radius:11px!important;font-size:20px}
  .cmp-request-card .form-actions{position:relative!important;z-index:2;margin-top:12px;padding-top:12px;background:linear-gradient(180deg,transparent,rgba(5,22,15,.96) 22%)}
  .cmp-request-card #cmpFeedback{display:block;padding:0 2px;overflow-wrap:anywhere}
  .cmp-history-uniforme.is-editable{grid-template-columns:1fr 1fr 64px}.cmp-history-person{grid-column:1/-1}.cmp-history-uniforme .btn{grid-column:1/-1}
  .cmp-cel-modal{padding:0;align-items:flex-end}.cmp-cel-card{width:100%;max-height:94dvh;border-radius:24px 24px 0 0;border-bottom:0}.cmp-dialog-head{padding:18px 16px 15px}.cmp-dialog-icon{display:none}.cmp-dialog-title h3{font-size:19px}.cmp-dialog-body{padding:16px;max-height:calc(94dvh - 164px)}.cmp-dialog-footer{display:grid;grid-template-columns:1fr 1fr;padding:13px 16px max(16px,env(safe-area-inset-bottom))}.cmp-dialog-footer .cmp-feedback{grid-column:1/-1;margin:0}.cmp-dialog-footer .btn{width:100%!important;padding-inline:10px!important}.cmp-dialog-list-row{align-items:flex-start;flex-direction:column}.cmp-dialog-list-row>button{align-self:flex-end}.cmp-dialog-subcard{padding:14px}
}
</style>`}

async function renderSolicitacaoTab(content, userContext){
  await loadColaboradores();
  await loadCatalogo();
  content.innerHTML=`${styles()}
  <div class="cmp-workspace"><section class="card cmp-request-card"><div class="section-head" style="margin-bottom:14px"><div><h3 style="margin:0">Nova solicitação</h3></div><div class="cmp-tabs"><button class="btn btn-secondary cmp-tab active" data-mode="itens" type="button">Material</button><button class="btn btn-secondary cmp-tab" data-mode="uniformes" type="button">Uniforme</button></div></div>
    <input id="cmpObs" type="hidden" value="">
    <div class="cmp-add-box">
      <div class="cmp-field"><label>Data</label><input id="cmpData" type="date" value="${today()}"></div>
      <div class="cmp-field"><label>Cidade</label><input id="cmpCidade" type="text" placeholder="Cidade de compra" autocomplete="off"></div>
      <div class="cmp-field"><label>UF</label><select id="cmpUf"><option value="">--</option>${UF_LIST.map(uf=>`<option value="${uf}">${uf}</option>`).join('')}</select></div>
    </div>
    <div id="panel-itens" class="cmp-panel active mt-16">
      <div class="cmp-add-box">
        <div class="cmp-field"><label>Un.</label><input id="cmpNovaUn" type="number" min="1" value="1"></div>
        <div class="cmp-field cmp-autocomplete-wrap"><label>Item</label><input id="cmpNovoItem" type="text" placeholder="Comece a digitar o material..." autocomplete="off"><div class="cmp-suggest cmp-item-suggest" id="cmpItemSug"></div></div>
        <div class="cmp-field"><label>Tamanho/Detalhe</label><input id="cmpNovoTam" placeholder="Selecione Botina ou Peneira Individual" disabled></div>
        <div class="cmp-field cmp-add-action"><label>&nbsp;</label><button class="btn btn-secondary" id="cmpAddMaterial" type="button">Adicionar material</button></div>
      </div>
      <p class="muted mt-12">Monte a lista abaixo antes de clicar em <b>SOLICITAR</b>.</p>
      <div class="cmp-table-wrap mt-16"><table class="cmp-table"><thead><tr><th>Un.</th><th>Item</th><th>Tamanho/Detalhe</th><th></th></tr></thead><tbody id="cmpItemBody"></tbody></table></div>
    </div>
    <div id="panel-uniformes" class="cmp-panel mt-16"><div class="cmp-uniforme-add"><div class="cmp-field cmp-autocomplete-wrap"><label>Nome</label><input id="cmpColabBusca" placeholder="Digite o nome" autocomplete="off"><div class="cmp-suggest cmp-item-suggest" id="cmpColabSug"></div></div><div class="cmp-field"><label>Tamanho</label><select id="cmpUniTamanho">${UNIFORME_TAMANHOS.map(t=>`<option${t==='M'?' selected':''}>${t}</option>`).join('')}</select></div><div class="cmp-field"><label>Cor</label><select id="cmpUniCor"><option selected>Verde</option><option>Cinza</option></select></div></div><div class="cmp-uniforme-actions"><button class="btn btn-secondary" id="cmpAddUniforme" type="button">Adicionar à lista</button><button class="btn btn-secondary" id="cmpAddTodos" type="button">Adicionar todos</button></div><div class="cmp-table-wrap mt-16"><table class="cmp-table"><thead><tr><th>Colaborador</th><th>Função/tipo</th><th>Cor</th><th>Tamanho</th><th>Un. máx 2</th><th></th></tr></thead><tbody id="cmpUniformeBody"></tbody></table></div></div>
    <div class="form-actions"><button class="btn btn-primary btn-inline" id="cmpSolicitar" type="button">SOLICITAR</button><span class="cmp-feedback" id="cmpFeedback"></span></div>
  </section>
  <div class="cmp-cel-modal" id="cmpCelularModal"></div>
  <section class="card cmp-history-card"><div class="section-head cmp-history-head" style="margin-bottom:12px"><div><h3 style="margin:0">Pendentes e histórico</h3><p class="muted" style="margin:2px 0 0">Acompanhe o andamento. Uniformes podem ser ajustados até o fechamento da solicitação.</p></div><button class="btn btn-secondary" id="cmpRefresh" type="button">↻ Atualizar</button></div><span class="cmp-feedback cmp-history-feedback" id="cmpHistoryFeedback"></span><div class="cmp-history-filters"><button class="btn btn-secondary cmp-history-filter active" data-history-filter="pendentes" type="button">Pendentes</button><button class="btn btn-secondary cmp-history-filter" data-history-filter="concluidos" type="button">Concluídos</button><button class="btn btn-secondary cmp-history-filter" data-history-filter="cancelados" type="button">Cancelados</button></div><div class="cmp-table-wrap"><table class="cmp-table"><thead><tr><th>Data</th><th>Tipo</th><th>Itens</th><th>Status</th><th>Motivo</th></tr></thead><tbody id="cmpMinhasBody"></tbody></table></div></section></div>`;
  state.itens=[]; bindItemForm(); renderItensList(); renderUniformes(); setupColabSearch();
  document.querySelectorAll('.cmp-tab').forEach(btn=>btn.onclick=()=>{ state.mode=btn.dataset.mode; document.querySelectorAll('.cmp-tab').forEach(b=>b.classList.toggle('active',b===btn)); document.querySelectorAll('.cmp-panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${state.mode}`)); });
  document.querySelectorAll('[data-history-filter]').forEach(btn=>btn.onclick=()=>{ state.historyFilter=btn.dataset.historyFilter; renderMinhas(); });
  const userId=usuario(userContext).id||null;
  document.getElementById('cmpAddTodos').onclick=()=>addAllColaboradores(userContext); document.getElementById('cmpRefresh').onclick=()=>loadMinhas(userId);
  async function doSolicitar(overrideItems=null){
    const btn=document.getElementById('cmpSolicitar');
    btn.disabled=true;
    try{
      setMsg('cmpFeedback','Salvando solicitação...');
      const itens=state.mode==='itens'?await submitItens(userContext,overrideItems):await submitUniformes(userContext);
      const n=await notifyCompras(buildMessage(userContext,state.mode,itens));
      setMsg('cmpFeedback',`Solicitação enviada. ${n.msg}`,!n.ok);
      document.getElementById('cmpObs').value='';
      state.itens=[]; renderItensList();
      state.uniformes=[]; renderUniformes();
      await loadMinhas(userId);
    }catch(e){ setMsg('cmpFeedback',e.message||'Erro ao solicitar.',true); }
    finally{ btn.disabled=false; }
  }
  document.getElementById('cmpSolicitar').onclick=()=>{
    const raw=state.itens.filter(i=>i.material);
    if(state.mode==='itens'&&raw.some(i=>i.tipo==='EPI')){
      openDistribModal(finalItens=>doSolicitar(finalItens));
      return;
    }
    doSolicitar();
  };
  await loadMinhas(userId);
}

export async function renderContent(content, userContext){
  await renderSolicitacaoTab(content, userContext);
}

initProtectedPage('Compras', renderContent);
