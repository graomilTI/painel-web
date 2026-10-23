import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';
import { toPanelUrl } from './paths.js';
import { tabs } from './core/ui.js';
import { injectEstilosFrotas, ICON as FM_ICON, cardFiltro, sincronizarCards, aoClicarCard } from './patrimonioLayoutFrotas.js?v=20261019-ordenar';
import { formatarReais, lerReais } from './patrimonioDesligadosRegras.js';
import { VALIDADE_LINK_DIAS, urlDoLink, linkAberto, carregarCotacoesDosItens, montarPropostas, situacaoDoItem, descreverDescontos, descreverFrete, descreverContato, REGIMES as REGIMES_COTACAO, mensagemDoLink, formatarCnpj } from './admComprasCotacao.js?v=20261023-cotacao-link5';

const TABS = [
  ['cotacoes','COTAÇÕES'], ['analise','APROVAÇÃO'], ['aguardando','À PAGAR'], ['nf','NF'], ['termos','TERMOS'], ['comprados','COMPRADOS'], ['recusados','RECUSADOS'], ['catalogo','CATÁLOGO']
];
const STATUS = { pendente:'Pendente', em_cotacao:'Em cotação', em_analise:'Em análise', pendente_pagamento:'Pendente pagamento', aguardando_nf:'Aguardando NF', aguardando_termo:'Aguardando Termo', comprado:'Comprado', recusado:'Recusado', recusado_financeiro:'Recusa Financeiro', enviado_estoque:'Enviado (Estoque)' };
const state = { tab:'cotacoes', filtro:'todos', busca:'', rows:[], selected:new Set(), cotacao:null, colaboradores:[], cotacaoInfo:null, gruposSeparados:new Set(), catalogo:[], ctx:null };
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
  let query=supabase.from('financeiro_pagamentos').select('id,origem,origem_id,descricao,favorecido,fornecedor,forma_pagamento,dados_pagamento,valor,status,created_at,compras_item_ids,codigo').eq('origem','COMPRAS').eq('status',status).order('created_at',{ascending:false}).limit(200);
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
  if(!existing){
    // Pagamento novo: ganha o código PAG-AAMM-NNN que o Financeiro usa pra se achar.
    // (Se agrupar num pagamento aberto, mantém o código dele — sem gastar número.)
    const {data:codigo}=await supabase.rpc('gerar_codigo_pagamento_compra');
    return supabase.from('financeiro_pagamentos').insert(codigo?{...payload,codigo}:payload,options).select('*');
  }
  const valorAtual=Number(existing.valor||0); const valorNovo=Number(payload.valor||0);
  const idsExistentes=Array.isArray(existing.compras_item_ids)?existing.compras_item_ids:[];
  const idsNovos=Array.isArray(payload.compras_item_ids)?payload.compras_item_ids:[];
  const updatePayload={
    valor:valorAtual+valorNovo,
    descricao:mergeDescriptionFinPay(existing.descricao,payload.descricao),
    favorecido:payload.favorecido||existing.favorecido||payload.fornecedor||null,
    fornecedor:payload.fornecedor||existing.fornecedor||null,
    contato:payload.contato||existing.contato||null,
    dados_pagamento:payload.dados_pagamento||existing.dados_pagamento||null,
    compras_item_ids:[...new Set([...idsExistentes,...idsNovos])],
  };
  console.info('[compras-financeiro-grouping] Pagamento agrupado ao lançamento existente:',{pagamento_id:existing.id,valor_anterior:valorAtual,valor_adicionado:valorNovo,valor_total:updatePayload.valor});
  const res=await supabase.from('financeiro_pagamentos').update(updatePayload).eq('id',existing.id).select('*');
  if(!res.error&&res.data?.[0]&&!res.data[0].codigo) res.data[0].codigo=existing.codigo||null;
  return res;
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
  if(!state.catalogo.length){ body.innerHTML='<tr><td colspan="6" class="adm-cmp-empty">Nenhum material cadastrado.</td></tr>'; return; }
  body.innerHTML=state.catalogo.map(c=>`<tr>
    <td>${esc(c.material)}</td><td>${esc(c.tipo)}</td><td>${c.valor_estimado==null?'-':esc(formatarReais(c.valor_estimado))}</td><td>${esc(c.observacao||'-')}</td>
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
  modal.innerHTML=`<div class="adm-cmp-modal-card"><div class="section-head"><div><h3>Editar material</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div><div class="adm-cmp-grid mt-16"><label>Material<input id="catEditMaterial" value="${esc(item.material)}"></label><label>Tipo<select id="catEditTipo"><option value="Uniforme"${item.tipo==='Uniforme'?' selected':''}>Uniforme</option><option value="Patrimonio"${item.tipo==='Patrimonio'?' selected':''}>Patrimônio</option><option value="EPI"${item.tipo==='EPI'?' selected':''}>EPI</option><option value="Outros"${item.tipo==='Outros'?' selected':''}>Outros</option></select></label><label>Valor estimado (R$)<input id="catEditValor" inputmode="decimal" placeholder="Ex.: 150,00" value="${item.valor_estimado==null?'':esc(String(item.valor_estimado).replace('.',','))}"></label><label class="adm-cmp-full">Observação<input id="catEditObs" value="${esc(item.observacao||'')}"></label></div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="catSalvar" type="button">Salvar</button><span class="adm-cmp-feedback" id="catEditFeedback"></span></div></div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#catSalvar').onclick=async()=>{
    const material=modal.querySelector('#catEditMaterial').value.trim();
    const tipo=modal.querySelector('#catEditTipo').value;
    const observacao=modal.querySelector('#catEditObs').value.trim()||null;
    if(!material){ modal.querySelector('#catEditFeedback').textContent='Informe o material.'; return; }
    const valor_estimado=lerReais(modal.querySelector('#catEditValor').value);
    if(Number.isNaN(valor_estimado)){ modal.querySelector('#catEditFeedback').textContent='Valor estimado inválido.'; return; }
    const {error}=await supabase.from('compras_catalogo').update({material:material.toUpperCase(),tipo,observacao,valor_estimado}).eq('id',id);
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
  const valor_estimado=lerReais(document.getElementById('catNovoValor')?.value);
  if(Number.isNaN(valor_estimado)){ setCatalogoMsg('Valor estimado inválido.',true); return; }
  const {error}=await supabase.from('compras_catalogo').insert({material:material.toUpperCase(),tipo,observacao,valor_estimado});
  if(error){ setCatalogoMsg(error.message,true); return; }
  document.getElementById('catNovoMaterial').value='';
  document.getElementById('catNovaObs').value='';
  document.getElementById('catNovoValor').value='';
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
    const statusByTab={cotacoes:['pendente','em_cotacao'],analise:['em_analise'],aguardando:['pendente_pagamento'],nf:['aguardando_nf'],termos:['aguardando_termo'],comprados:['comprado'],recusados:['recusado','recusado_financeiro']};
    let q=supabase.from('compras_itens').select('*, compras_solicitacoes(*)').order('created_at',{ascending:false}).limit(500);
    const statuses=statusByTab[state.tab]||[]; if(statuses.length) q=q.in('status',statuses);
    const {data,error}=await q; if(error){if(wrap) wrap.innerHTML=`<div class="adm-cmp-empty">${esc(error.message)}<br>Execute a migration de compras no Supabase.</div>`;return;}
    state.rows=data||[]; state.selected.clear();
    if(state.tab==='cotacoes') await carregarInfoCotacao();
    renderTable();
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

// Seleção múltipla clicando e arrastando sobre os checkboxes (tipo
// Excel/gerenciador de arquivos). Liga uma vez no container que persiste
// entre renders (admCmpListWrap não é recriado, só o innerHTML dele muda) —
// funciona em qualquer aba, cards ou tabela, por delegação de evento.
let dragSel=null;
function wireDragSelect(container){
  if(!container||container._dragSelectWired) return;
  container._dragSelectWired=true;
  container.addEventListener('mousedown',(e)=>{
    const chk=e.target.closest('input[type=checkbox]');
    if(!chk) return;
    dragSel={value:!chk.checked, startChk:chk, visited:new Set([chk]), dragged:false};
  });
  container.addEventListener('mouseover',(e)=>{
    if(!dragSel) return;
    const chk=e.target.closest('input[type=checkbox]');
    if(!chk||dragSel.visited.has(chk)) return;
    dragSel.visited.add(chk);
    dragSel.dragged=true;
    if(chk.checked!==dragSel.value){
      chk.checked=dragSel.value;
      chk.dispatchEvent(new Event('change',{bubbles:true}));
    }
  });
}
document.addEventListener('mouseup',()=>{
  // Se o arraste saiu do checkbox inicial pra outro, o navegador não dispara
  // o "click" nativo nele (mousedown e mouseup em elementos diferentes) —
  // aplica manualmente o mesmo estado dos demais.
  if(dragSel&&dragSel.dragged&&dragSel.startChk.checked!==dragSel.value){
    dragSel.startChk.checked=dragSel.value;
    dragSel.startChk.dispatchEvent(new Event('change',{bubbles:true}));
  }
  dragSel=null;
});

// O grupo é o PAGAMENTO (uma compra enviada ao Financeiro de uma vez, com um comprovante). Antes agrupava só pelo
// nome do fornecedor e misturava compras de datas e pagamentos diferentes do mesmo fornecedor (ex.: 3 compras da
// Mercado Livre viravam uma linha de 10 itens). Sem código de pagamento (itens antigos), usa o comprovante e, por
// último, a mesma solicitação + fornecedor + forma de pagamento.
function groupKey(r, useNf=false){
  if(useNf){ const nf=norm(r.nf_url||''); if(nf) return `nf:${nf}`; }
  const pag=norm(r.codigo_pagamento||'');
  if(pag) return `pag:${pag}`;
  const comp=String(r.comprovante_url||'').trim();
  if(comp) return `comp:${comp}`;
  const fn=norm(r.fornecedor||'');
  const dp=norm(r.dados_pagamento||'');
  const fp=norm(r.forma_pagamento||'');
  if(fn) return `fn:${fn}:${fp}:${r.solicitacao_id||''}`;
  if(dp) return `dp:${fp}:${dp}`;
  return `solo:${r.id}`;
}

// ─── Ícones de ação em linha (mesmo padrão visual de Conferência) ─────────────
const ICONS={
  plus:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  check:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  tag:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3a1 1 0 0 0-1 1l.24 5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.82 0l4.36-4.36a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>`,
  send:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  doc:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></svg>`,
  box:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></svg>`,
  eye:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  split:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/></svg>`,
  clip:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
};
const ROW_ACTION_ICONS={cotar:'tag',aprovar_solicitar:'send',recusar:'x',comprar:'check',cancelar:'x',aprovar:'check',reprovar:'x',finalizar:'doc',finalizar_grupo:'doc',enviar_estoque:'box',anexar_nf:'clip'};
function iconBtn(action,id,title){
  return `<button class="adm-cmp-icon-btn" data-row-action="${esc(action)}" data-id="${esc(id)}" type="button" title="${esc(title)}" aria-label="${esc(title)}">${ICONS[ROW_ACTION_ICONS[action]]}</button>`;
}
function nfLinkHtml(r){
  const nfUrl=r?.nf_url||'';
  if(!nfUrl) return '<span class="muted">-</span>';
  const principal=/^https?:\/\//i.test(nfUrl)?`<a href="${esc(nfUrl)}" target="_blank" rel="noopener" style="color:#86efac;font-size:12px">Ver NF</a>`:`<small class="muted">${esc(nfUrl)}</small>`;
  const extras=anexosNf(r).map((a,i)=>`<a href="${esc(a.url)}" target="_blank" rel="noopener" title="${esc(a.nome||'')}" style="color:#86efac;font-size:12px">Anexo ${i+2}</a>`).join(' · ');
  return extras?`${principal} · ${extras}`:principal;
}
function actionsCellForTab(r){
  if(state.tab==='analise') return `<div class="adm-cmp-row-actions">${iconBtn('aprovar',r.id,'Aprovar')}${iconBtn('reprovar',r.id,'Reprovar')}</div>`;
  if(state.tab==='aguardando') return `<div class="adm-cmp-row-actions">${iconBtn('anexar_nf',r.id,r.nf_url?'Trocar NF':'Anexar NF')}${r.nf_url?nfLinkHtml(r):''}</div>`;
  if(state.tab==='nf') return `<div class="adm-cmp-row-actions">${iconBtn('finalizar',r.id,'Finalizar')}${r.nf_url?nfLinkHtml(r):''}</div>`;
  if(state.tab==='recusados') return `<small class="muted">${esc(r.motivo_recusa||'-')}</small>`;
  if(state.tab==='comprados') return nfLinkHtml(r);
  return '<span class="muted">-</span>';
}

function singleRowHtml(r){
  const s=r.compras_solicitacoes||{};
  return `<tr>
    <td><input type="checkbox" data-check="${esc(r.id)}"></td><td>${brDate(s.data_solicitacao)}</td><td>${esc(s.solicitante||'-')}<br><small>${esc(s.coordenacao||'')}</small></td><td>${esc(r.quantidade||r.unidade||1)}</td><td>${esc(r.material)}${r.tamanho?`<br><small>Tam: ${esc(r.tamanho)}</small>`:''}${r.colaborador_nome?`<br><small>${esc(r.colaborador_nome)}</small>`:''}${r.codigo?`<br><small style="color:#86efac">Cód: ${esc(r.codigo)}</small>`:''}${r.codigo_pagamento?`<br><small style="color:#93c5fd">Pgto: ${esc(r.codigo_pagamento)}</small>`:''}</td><td>${esc(r.tipo||'-')}</td><td>${pill(r.status)}</td><td>${money(r.valor_total||0)}</td><td>${actionsCellForTab(r)}</td>
  </tr>`;
}

// ─── Cards (APROVAÇÃO agrupa por solicitação) ──────────────────────────────
function rowActionsHtml(r){
  if(state.tab==='cotacoes') return `${iconBtn('cotar',r.id,'Cotar (gerar link)')}${iconBtn('comprar',r.id,'Comprar')}${iconBtn('aprovar_solicitar',r.id,'Solicitar aprovação')}${iconBtn('enviar_estoque',r.id,'Enviar via Estoque')}${iconBtn('recusar',r.id,'Recusar')}`;
  if(state.tab==='analise') return `${iconBtn('aprovar',r.id,'Aprovar')}${iconBtn('reprovar',r.id,'Reprovar')}`;
  return '';
}
function cotacaoBadgeHtml(r){
  if(state.tab!=='cotacoes'||!state.cotacaoInfo) return '';
  const sit=situacaoDoItem(r.id,state.cotacaoInfo);
  return `<span class="adm-cot-badge ${esc(sit.codigo)}">${esc(sit.texto)}</span>`;
}
function cardRowHtml(r){
  return `<div class="adm-cmp-card-row" data-row-id="${esc(r.id)}">
    <input type="checkbox" data-check="${esc(r.id)}">
    <div class="adm-cmp-card-row-info">
      <strong>${esc(r.quantidade||r.unidade||1)}x ${esc(r.material)}</strong>
      <small>${esc(r.tipo||'-')}${r.tamanho?` · Tam: ${esc(r.tamanho)}`:''}${r.uniforme_cor?` · Cor: ${esc(r.uniforme_cor)}`:''}${r.colaborador_nome?` · ${esc(r.colaborador_nome)}`:''}${r.codigo?` · Cód: ${esc(r.codigo)}`:''}${r.codigo_pagamento?` · Pgto: <b>${esc(r.codigo_pagamento)}</b>`:''}</small>
    </div>
    <div class="adm-cmp-card-row-value">${cotacaoBadgeHtml(r)}${money(r.valor_total||0)}</div>
    <div class="adm-cmp-card-row-actions">${rowActionsHtml(r)}</div>
  </div>`;
}
function cardHtml(itens){
  // Usa a solicitação mais recente do grupo pra exibir gestor/coordenação/data
  // no cabeçalho — necessário porque uniforme agrupa várias solicitações do
  // mesmo gestor, não só uma.
  const s=itens.reduce((best,r)=>{
    const cur=r.compras_solicitacoes||{};
    return (!best||(cur.data_solicitacao||'')>(best.data_solicitacao||''))?cur:best;
  },null)||{};
  const total=itens.reduce((sum,r)=>sum+Number(r.valor_total||0),0);
  const totalQtd=itens.reduce((sum,r)=>sum+Number(r.quantidade||r.unidade||1),0);
  const ids=itens.map(r=>r.id).join(',');
  return `<article class="adm-cmp-card">
    <div class="adm-cmp-card-head">
      <label class="adm-cmp-card-select"><input type="checkbox" data-check-group="${esc(ids)}"><div><strong>${esc(s.solicitante||'Gestor')}</strong><small>${esc(s.coordenacao||s.supervisao||'')}${s.cidade?` · ${esc(s.cidade)}${s.uf?`/${esc(s.uf)}`:''}`:''} · ${brDate(s.data_solicitacao)}</small></div></label>
      <div class="adm-cmp-card-meta"><span>${totalQtd}&nbsp;un · ${itens.length} ${itens.length===1?'item':'itens'}</span><strong>${money(total)}</strong></div>
    </div>
    <div class="adm-cmp-card-body">${itens.map(cardRowHtml).join('')}</div>
  </article>`;
}
// Uniforme agrupa por gestor (todas as solicitações pendentes dele viram um
// card só); os demais tipos continuam agrupados por solicitação individual.
function solicitacoesGroupKey(r){
  const s=r.compras_solicitacoes||{};
  if(norm(r.tipo).includes('uniforme')) return `uniforme:${norm(s.solicitante||'')}`;
  return r.solicitacao_id||s.id||`solo:${r.id}`;
}
function renderCards(container,rows){
  if(!rows.length){container.innerHTML='<div class="adm-cmp-empty">Nenhum item nesta etapa.</div>'; return;}
  const groups=new Map();
  rows.forEach(r=>{const k=solicitacoesGroupKey(r); if(!groups.has(k))groups.set(k,[]); groups.get(k).push(r);});
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
// Estado de cotação (links e respostas) dos itens da aba. Falha aqui não pode derrubar a lista.
async function carregarInfoCotacao(){
  try{ state.cotacaoInfo=await carregarCotacoesDosItens(supabase,state.rows.map(r=>r.id)); }
  catch(e){ console.warn('[compras] cotações',e); state.cotacaoInfo={porItem:new Map(),cotacoes:new Map(),respostas:[]}; }
}
const temRespostas=(rows)=>rows.some(r=>situacaoDoItem(r.id,state.cotacaoInfo).codigo==='respostas');
// Ícone de ação do cabeçalho do card (vale para o grupo todo), no mesmo visual dos ícones das linhas.
function groupIconBtn(attr,valor,title,icone){
  return `<button class="adm-cmp-icon-btn" data-${attr}="${esc(valor)}" type="button" title="${esc(title)}" aria-label="${esc(title)}">${ICONS[icone]}</button>`;
}
function cotacaoCardHtml(itens,gkey){
  const s=itens[0].compras_solicitacoes||{};
  const total=itens.reduce((sum,r)=>sum+Number(r.valor_total||0),0);
  const ids=itens.map(r=>r.id).join(',');
  const podeSeparar=itens.length>1&&gkey&&!gkey.startsWith('solo:');
  const nResp=itens.filter(r=>situacaoDoItem(r.id,state.cotacaoInfo).codigo==='respostas').length;
  return `<article class="adm-cmp-card">
    <div class="adm-cmp-card-head">
      <label class="adm-cmp-card-select"><input type="checkbox" data-check-group="${esc(ids)}"><div><strong>${esc(s.solicitante||'Gestor')}</strong><small>${esc(s.cidade||'')}${s.uf?`/${esc(s.uf)}`:''}</small></div></label>
      <div class="adm-cmp-card-meta"><span>${itens.length} ${itens.length===1?'item':'itens'}</span><strong>${money(total)}</strong>
        ${nResp?groupIconBtn('respostas-grupo',ids,'Ver respostas','eye'):''}
        ${podeSeparar?groupIconBtn('separar-grupo',gkey,'Separar do grupo','split'):''}
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
  const doGrupo=(b,attr)=>state.rows.filter(r=>b.dataset[attr].split(',').includes(String(r.id)));
  container.querySelectorAll('[data-respostas-grupo]').forEach(b=>b.onclick=()=>abrirRespostasModal(doGrupo(b,'respostasGrupo')));
  container.querySelectorAll('[data-separar-grupo]').forEach(b=>b.onclick=()=>{
    state.gruposSeparados.add(b.dataset.separarGrupo);
    renderTable();
  });
}

// ─── Wiring dos ícones de ação em linha ────────────────────────────────────────
function selectOnly(id){ state.selected=new Set([String(id)]); }
function openAprovarModal(r){
  const modal=document.getElementById('admCmpModal');
  modal.innerHTML=`<div class="adm-cmp-modal-card">
    <div class="section-head"><div><h3>Aprovar item</h3><p class="muted">${esc(r.material)}${r.tamanho?` · Tam: ${esc(r.tamanho)}`:''}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">Quem está aprovando<input id="aprQuem" placeholder="Nome de quem aprovou"></label>
      <label class="adm-cmp-full">Anexar print da aprovação (opcional)<input id="aprAnexo" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
    </div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="aprConfirmar" type="button">Aprovar</button></div>
    <span class="adm-cmp-feedback mt-8" id="aprFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#aprConfirmar').addEventListener('click',async()=>{
    const btn=modal.querySelector('#aprConfirmar'); const fb=modal.querySelector('#aprFeedback');
    btn.disabled=true; if(fb) fb.textContent='';
    try{
      const quem=modal.querySelector('#aprQuem')?.value?.trim()||null;
      const file=modal.querySelector('#aprAnexo')?.files?.[0]||null;
      let anexoUrl=null;
      if(file){ if(fb) fb.textContent='Enviando anexo...'; anexoUrl=await uploadArquivoNotasFiscais(file,'compras/aprovacoes'); }
      await aprovarItem(r,{quem,anexoUrl});
      modal.classList.remove('open');
    }catch(e){ if(fb){fb.textContent=e.message; fb.classList.add('err');} btn.disabled=false; }
  });
}
async function aprovarItem(r,{quem,anexoUrl}={}){
  const payload={status:'pendente', aprovado_por:quem||null, aprovado_em:new Date().toISOString()};
  if(anexoUrl) payload.aprovacao_anexo_url=anexoUrl;
  await supabase.from('compras_itens').update(payload).eq('id',r.id);
  setMsg('Item aprovado, voltou para COTAÇÕES.');
  await loadRows();
}
async function reprovarItem(r){ const motivo=prompt('Motivo da recusa:'); if(!motivo) return; const quem=prompt('Quem está recusando? (opcional)','')||null; await supabase.from('compras_itens').update({status:'recusado', recusado_por:quem, motivo_recusa:motivo}).eq('id',r.id); setMsg('Item reprovado.'); await loadRows(); }

function wireRowActions(container){
  container.querySelectorAll('[data-row-action]').forEach(btn=>{
    btn.onclick=async()=>{
      const action=btn.dataset.rowAction;
      if(action==='finalizar_grupo'){ openGrupoModal(btn.dataset.id); return; }
      if(action==='anexar_nf'){ openAnexarNfModal(btn.dataset.id); return; }
      const r=state.rows.find(x=>String(x.id)===String(btn.dataset.id));
      if(!r) return;
      try{
        if(action==='cotar'){ abrirCotarModal([r]); }
        else if(action==='aprovar_solicitar'){ selectOnly(r.id); await solicitarAprovacao(); }
        else if(action==='recusar'){ selectOnly(r.id); await recusarSelecionados(); }
        else if(action==='enviar_estoque'){ selectOnly(r.id); await enviarEstoqueSelecionados(); }
        else if(action==='comprar'){ selectOnly(r.id); abrirCompraSelecionados(); }
        else if(action==='aprovar'){ openAprovarModal(r); }
        else if(action==='reprovar'){ await reprovarItem(r); }
        else if(action==='finalizar'){ openFinalizarModal(r); }
      }catch(e){ setMsg(e.message,true); }
    };
  });
}

// ─── Layout das listas do Frotas: cards que filtram por tipo + busca com chip ──
const TIPOS_CARD=[
  ['uniforme','Uniforme','green','doc'],
  ['patrimonio','Patrimônio','purple','ferramenta'],
  ['epi','EPI','amber','alerta'],
  ['alojamento','Alojamento','blue','calendario'],
  ['outros','Outros','blue','busca']
];
function tipoBucket(r){
  const n=norm(r.tipo||'');
  if(n.includes('uniforme')) return 'uniforme';
  if(n.includes('patrimonio')) return 'patrimonio';
  if(n.includes('epi')) return 'epi';
  if(n.includes('alojamento')) return 'alojamento';
  return 'outros';
}
function visibleRows(){
  const q=norm(state.busca);
  return state.rows.filter(r=>{
    if(state.filtro!=='todos'&&tipoBucket(r)!==state.filtro) return false;
    if(!q) return true;
    const s=r.compras_solicitacoes||{};
    return norm([r.material,r.tamanho,r.colaborador_nome,r.fornecedor,r.codigo,r.codigo_pagamento,s.solicitante,s.coordenacao,s.cidade].join(' ')).includes(q);
  });
}
function renderKpis(){
  const box=document.getElementById('admCmpKpis');
  if(!box) return;
  const cont={}; state.rows.forEach(r=>{const b=tipoBucket(r); cont[b]=(cont[b]||0)+1;});
  const total=state.rows.length;
  const valor=state.rows.reduce((sum,r)=>sum+Number(r.valor_total||0),0);
  box.innerHTML=cardFiltro({filtro:'todos',label:'Todos os itens',tone:'blue',icone:'total',valor:String(total),ativo:state.filtro==='todos'})
    +TIPOS_CARD.filter(([k])=>cont[k]||state.filtro===k).map(([k,label,tone,icone])=>cardFiltro({filtro:k,label,tone,icone,valor:String(cont[k]||0),ativo:state.filtro===k})).join('')
    +(valor>0?cardFiltro({label:'Valor total',tone:'amber',icone:'dinheiro',valor:money(valor),dica:'Soma dos valores de todos os itens desta etapa'}):'');
  const page=document.getElementById('admCmpPage');
  if(page) sincronizarCards(page,state.filtro);
}
function onFiltroChange(){
  const vis=new Set(visibleRows().map(r=>String(r.id)));
  [...state.selected].forEach(id=>{ if(!vis.has(id)) state.selected.delete(id); });
  renderTable();
}
function renderTable(){
  const wrap=document.getElementById('admCmpListWrap');
  const rows=visibleRows();
  renderKpis();
  const cnt=document.getElementById('admCmpCount'); if(cnt) cnt.textContent=`${rows.length} item(ns)`;

  if(state.tab==='cotacoes'){
    wrap.innerHTML=`<div class="adm-cmp-cards" id="admCmpBody"></div>`;
    renderCotacoesCards(document.getElementById('admCmpBody'), rows);
    return;
  }
  if(state.tab==='analise'){
    wrap.innerHTML=`<div class="adm-cmp-cards" id="admCmpBody"></div>`;
    renderCards(document.getElementById('admCmpBody'), rows);
    return;
  }

  wrap.innerHTML=`<div class="fm-table-wrap"><table class="fm-table"><thead><tr><th></th><th>Data</th><th>Gestor</th><th>Un.</th><th>Material</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody id="admCmpBody"></tbody></table></div>`;
  const body=document.getElementById('admCmpBody');
  if(!rows.length){body.innerHTML='<tr><td colspan="9" class="fm-empty">Nenhum item nesta etapa.</td></tr>'; return;}

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
      const nfGrp=itens.find(r=>r.nf_url);
      const acao=`<div class="adm-cmp-row-actions">${state.tab==='aguardando'?iconBtn('anexar_nf',gids,nfGrp?'Trocar NF do grupo':'Anexar NF ao grupo'):''}${iconBtn('finalizar_grupo',gids,state.tab==='nf'?'Finalizar grupo':'Ver grupo')}${nfGrp?nfLinkHtml(nfGrp):''}</div>`;
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

// ─── NOVA SOLICITAÇÃO (feita pelo próprio usuário de Compras) ─────────────────
const UF_LIST=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
// Municípios do IBGE (mesma chave/TTL de logistica.js e programacao.js: o cache é compartilhado).
const CIDADES_CACHE_KEY='grm:cidades_ibge:v1';
const CIDADES_CACHE_TTL_MS=30*24*60*60*1000;
let cidadesIbge=[];
async function carregarCidadesBrasil(){
  if(cidadesIbge.length) return;
  try{
    const {ts,data}=JSON.parse(localStorage.getItem(CIDADES_CACHE_KEY)||'{}');
    if(ts&&Date.now()-ts<=CIDADES_CACHE_TTL_MS&&Array.isArray(data)&&data.length){ cidadesIbge=data; return; }
  }catch(_){}
  try{
    const resp=await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
    const data=await resp.json();
    cidadesIbge=(Array.isArray(data)?data:[]).map(m=>({nome:m.nome,uf:m.microrregiao?.mesorregiao?.UF?.sigla||''})).filter(m=>m.nome&&m.uf);
    try{ localStorage.setItem(CIDADES_CACHE_KEY,JSON.stringify({ts:Date.now(),data:cidadesIbge})); }catch(_){}
  }catch(e){ console.warn('Não foi possível carregar cidades do IBGE.',e); cidadesIbge=[]; }
}
const cidadesDaUf=(uf)=>uf?cidadesIbge.filter(c=>c.uf===uf).map(c=>c.nome).sort((a,b)=>a.localeCompare(b,'pt-BR')):[];
const hojeLocal=()=>{const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
async function abrirNovaSolicitacaoModal(){
  if(!state.catalogo.length) state.catalogo=await safe(()=>supabase.from('compras_catalogo').select('*').order('material'));
  const catalogo=state.catalogo.filter(c=>c.ativo!==false);
  await carregarCidadesBrasil();
  const u=state.ctx?.user||{};
  const itens=[];
  const achaColab=(nome)=>state.colaboradores.find(c=>norm(c.nome)===norm(nome));
  const modal=document.getElementById('admCmpModal');
  const achaCatalogo=(v)=>catalogo.find(c=>norm(c.material)===norm(v));
  function render(){
    const prev={
      solicitante:modal.querySelector('#nsSolicitante')?.value??'',
      coordenacao:modal.querySelector('#nsCoordenacao')?.value??'',
      cidade:modal.querySelector('#nsCidade')?.value??'',
      uf:modal.querySelector('#nsUf')?.value??''
    };
    const cidades=cidadesDaUf(prev.uf);
    modal.innerHTML=`<div class="adm-cmp-modal-card adm-cmp-modal-wide">
      <div class="section-head"><div><h3>Nova solicitação de compra</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
      <div class="adm-cmp-grid adm-cmp-grid-ns1 mt-16">
        <label>Solicitante<div class="cot-colab-wrap"><input id="nsSolicitante" value="${esc(prev.solicitante)}" placeholder="Digite o nome na equipe" autocomplete="off"><div class="cot-colab-sug" id="nsSolicitanteSug"></div></div></label>
        <label>Supervisão<input id="nsCoordenacao" value="${esc(prev.coordenacao)}" placeholder="Automático"></label>
        <label>UF<select id="nsUf"><option value="">—</option>${UF_LIST.map(x=>`<option value="${x}"${prev.uf===x?' selected':''}>${x}</option>`).join('')}</select></label>
        <label>Cidade<select id="nsCidade"${prev.uf?'':' disabled'}><option value="">${prev.uf?'Selecione':'Escolha a UF'}</option>${cidades.map(n=>`<option value="${esc(n)}"${prev.cidade===n?' selected':''}>${esc(n)}</option>`).join('')}</select></label>
      </div>
      <p class="mt-16" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700">Itens</p>
      <div class="adm-cmp-grid adm-cmp-grid-ns2 mt-8">
        <label>Qtd.<input id="nsQtd" type="number" min="1" step="1" value="1" inputmode="numeric"></label>
        <label>Material<input id="nsMaterial" list="nsMaterialList" placeholder="Digite ou escolha do catálogo" autocomplete="off"></label>
        <label>Tamanho / detalhe<input id="nsDetalhe" placeholder="Opcional (ex.: tamanho da botina)"></label>
        <button class="btn btn-secondary" id="nsAdd" type="button">+ Adicionar</button>
      </div>
      <datalist id="nsMaterialList">${catalogo.map(c=>`<option value="${esc(c.material)}"></option>`).join('')}</datalist>
      <div class="adm-cmp-table-wrap mt-16"><table class="adm-cmp-table" style="min-width:0"><thead><tr><th>Un.</th><th>Material</th><th>Tipo</th><th>Detalhe</th><th></th></tr></thead><tbody>${itens.length?itens.map((i,idx)=>`<tr><td>${esc(i.quantidade)}</td><td>${esc(i.material)}</td><td>${esc(i.tipo||'-')}</td><td>${esc(i.tamanho||'-')}</td><td><button class="adm-cmp-icon-btn" data-ns-del="${idx}" type="button" title="Remover" aria-label="Remover item" data-row-action="recusar">${ICONS.x}</button></td></tr>`).join(''):'<tr><td colspan="5" class="adm-cmp-empty">Nenhum item adicionado.</td></tr>'}</tbody></table></div>
      <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="nsSalvar" type="button">Criar solicitação</button><span class="adm-cmp-feedback" id="nsFeedback"></span></div>
    </div>`;
    modal.classList.add('open');
    const fb=(m,err=true)=>{const el=modal.querySelector('#nsFeedback'); el.textContent=m||''; el.classList.toggle('err',err)};
    modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
    const inpSol=modal.querySelector('#nsSolicitante'), sugSol=modal.querySelector('#nsSolicitanteSug'), inpCoord=modal.querySelector('#nsCoordenacao');
    inpSol.addEventListener('input',()=>{
      const q=norm(inpSol.value); if(q.length<2){sugSol.innerHTML='';return;}
      const list=state.colaboradores.filter(c=>norm(c.nome).includes(q)).slice(0,8);
      sugSol.innerHTML=list.map(c=>`<button type="button" data-cid="${esc(c.id)}" data-cnome="${esc(c.nome)}">${esc(c.nome)} <small>${esc(c.coordenacao||c.supervisao||c.cargo||'')}</small></button>`).join('')||'<button type="button" disabled>Nome não encontrado na equipe</button>';
      sugSol.querySelectorAll('button[data-cid]').forEach(b=>b.onmousedown=(ev)=>{ev.preventDefault(); const c=state.colaboradores.find(x=>String(x.id)===b.dataset.cid); inpSol.value=b.dataset.cnome; inpCoord.value=c?.coordenacao||c?.supervisao||''; sugSol.innerHTML='';});
    });
    inpSol.addEventListener('change',()=>{ const c=achaColab(inpSol.value); if(c) inpCoord.value=c.coordenacao||c.supervisao||''; });
    inpSol.addEventListener('blur',()=>setTimeout(()=>{sugSol.innerHTML='';},160));
    modal.querySelector('#nsUf').onchange=()=>{ modal.querySelector('#nsCidade').value=''; render(); };
    modal.querySelectorAll('[data-ns-del]').forEach(b=>b.onclick=()=>{itens.splice(Number(b.dataset.nsDel),1); render();});
    const addItem=()=>{
      const raw=modal.querySelector('#nsMaterial').value.trim();
      if(!raw){ fb('Informe o material.'); return; }
      const qtd=Math.max(1,Math.floor(Number(modal.querySelector('#nsQtd').value||1)));
      const found=achaCatalogo(raw);
      itens.push({material:found?.material||raw.toUpperCase(),tipo:found?.tipo||'Outros',quantidade:qtd,unidade:qtd,tamanho:modal.querySelector('#nsDetalhe').value.trim()||null});
      render();
      modal.querySelector('#nsMaterial').focus();
    };
    modal.querySelector('#nsAdd').onclick=addItem;
    modal.querySelector('#nsMaterial').addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); addItem(); } });
    modal.querySelector('#nsSalvar').onclick=async(ev)=>{
      const btn=ev.currentTarget;
      if(modal.querySelector('#nsMaterial').value.trim()){ fb('Há um material digitado que ainda não foi adicionado. Clique em "+ Adicionar item".'); return; }
      if(!itens.length){ fb('Adicione pelo menos um item.'); return; }
      const colab=achaColab(modal.querySelector('#nsSolicitante').value);
      if(!colab){ fb('Escolha o solicitante na lista da equipe (digite o nome e selecione).'); return; }
      const solicitante=colab.nome;
      btn.disabled=true; fb('Salvando...',false);
      try{
        const header={
          data_solicitacao:hojeLocal(),
          solicitante_id:u.id||null,
          solicitante,
          coordenacao:modal.querySelector('#nsCoordenacao').value.trim()||null,
          tipo_solicitacao:'itens',
          status:'pendente',
          cidade:modal.querySelector('#nsCidade').value.trim()||null,
          uf:modal.querySelector('#nsUf').value||null,
          created_by:u.id||null
        };
        const {data:sol,error}=await supabase.from('compras_solicitacoes').insert(header).select('id').single();
        if(error) throw error;
        const {error:itemErr}=await supabase.from('compras_itens').insert(itens.map(i=>({...i,solicitacao_id:sol.id,status:'pendente'})));
        if(itemErr){ await supabase.from('compras_solicitacoes').delete().eq('id',sol.id); throw itemErr; }
        modal.classList.remove('open');
        state.tab='cotacoes'; state.filtro='todos';
        document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab==='cotacoes'));
        updateActionButtons();
        await loadRows();
        setMsg(`Solicitação criada com ${itens.length} item(ns).`);
      }catch(e){ console.warn(e); fb(e.message||'Não foi possível criar a solicitação.'); btn.disabled=false; }
    };
  }
  render();
}

// ─── MODAL COTAR (gera o link que Compras envia ao fornecedor) ─────────────────
// O link tem os itens escolhidos e vale VALIDADE_LINK_DIAS dias. O fornecedor responde sem login (cotacao-fornecedor.html);
// vários fornecedores podem usar o mesmo link, cada um identificado pelo CNPJ. As respostas aparecem em "Ver respostas".
function abrirCotarModal(rows){
  rows=(rows||[]).filter(r=>r.status==='pendente'||r.status==='em_cotacao');
  if(!rows.length){setMsg('Selecione pelo menos um item para cotar.',true);return;}
  const modal=document.getElementById('admCmpModal');
  modal.innerHTML=`<div class="adm-cmp-modal-card adm-cmp-modal-wide">
    <div class="section-head">
      <div><h3>Cotar itens selecionados</h3><p class="muted">Gera um link com estes itens para você enviar ao fornecedor. Ele informa CNPJ, valores, prazo e pagamento, e a resposta chega aqui. O link vale ${VALIDADE_LINK_DIAS} dias e pode ser enviado a mais de um fornecedor.</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="adm-cmp-table-wrap mt-16">
      <table class="adm-cmp-table"><thead><tr><th>Un.</th><th>Material</th><th>Tipo</th></tr></thead>
        <tbody>${rows.map(r=>`<tr><td>${esc(r.quantidade||r.unidade||1)}</td><td>${esc(r.material)}${r.tamanho?`<br><small>${esc(r.tamanho)}</small>`:''}</td><td>${esc(r.tipo||'-')}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="cotGerarLink" type="button">Gerar link</button><span class="adm-cmp-feedback" id="cotLinkFeedback"></span></div>
    <div id="cotLinkResultado"></div>
  </div>`;
  modal.classList.add('open');
  const fechar=()=>{modal.classList.remove('open'); loadRows();};
  modal.querySelector('#mClose').onclick=fechar;
  const fb=modal.querySelector('#cotLinkFeedback');
  modal.querySelector('#cotGerarLink').onclick=async(ev)=>{
    const btn=ev.currentTarget; btn.disabled=true; fb.textContent='Gerando…';
    try{
      const {data:cot,error}=await supabase.from('compras_cotacao_links').insert({status:'aberta'}).select('id,token,expira_em').single();
      if(error) throw error;
      const {error:eIt}=await supabase.from('compras_cotacao_itens').insert(rows.map(r=>({cotacao_id:cot.id,compra_item_id:r.id})));
      if(eIt){ await supabase.from('compras_cotacao_links').delete().eq('id',cot.id); throw eIt; }
      const novos=rows.filter(r=>r.status==='pendente');
      if(novos.length) await updateItems(novos,{status:'em_cotacao'});
      const url=urlDoLink(cot.token); const msg=mensagemDoLink(url,cot.expira_em);
      btn.style.display='none'; fb.textContent='';
      modal.querySelector('#cotLinkResultado').innerHTML=`<div class="adm-cmp-grid mt-16">
        <label class="adm-cmp-full">Link da cotação (válido até ${brDate(cot.expira_em)})<input id="cotLinkUrl" readonly value="${esc(url)}"></label>
        <label class="adm-cmp-full">Mensagem sugerida<textarea id="cotLinkMsg" rows="4" style="width:100%">${esc(msg)}</textarea></label>
      </div>
      <div class="adm-cmp-actions mt-8"><button class="btn btn-primary" id="cotCopiarLink" type="button">Copiar link</button><button class="btn btn-secondary" id="cotCopiarMsg" type="button">Copiar mensagem</button><span class="adm-cmp-feedback" id="cotCopiaFb"></span></div>`;
      const copiar=async(texto,rotulo)=>{ try{ await navigator.clipboard.writeText(texto); modal.querySelector('#cotCopiaFb').textContent=`${rotulo} copiado.`; }catch{ modal.querySelector('#cotCopiaFb').textContent='Não consegui copiar; selecione o texto e copie manualmente.'; } };
      modal.querySelector('#cotCopiarLink').onclick=()=>copiar(modal.querySelector('#cotLinkUrl').value,'Link');
      modal.querySelector('#cotCopiarMsg').onclick=()=>copiar(modal.querySelector('#cotLinkMsg').value,'Mensagem');
      await copiar(url,'Link');
    }catch(e){ btn.disabled=false; fb.textContent=e.message; fb.classList.add('err'); }
  };
}

// ─── MODAL RESPOSTAS (links + comparação entre fornecedores) ───────────────────
const dataHora=(v)=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'-';
function situacaoLinkHtml(c){
  if(c.status!=='aberta') return '<span class="adm-cmp-status recusado">Encerrado</span>';
  return linkAberto(c)?`<span class="adm-cmp-status comprado">Aberto até ${brDate(c.expira_em)}</span>`:'<span class="adm-cmp-status recusado">Expirado</span>';
}
function abrirRespostasModal(rows){
  const info=state.cotacaoInfo; if(!info||!rows.length) return;
  const modal=document.getElementById('admCmpModal');
  const propostas=montarPropostas(rows,info);
  const cotIds=[...new Set(rows.flatMap(r=>info.porItem.get(String(r.id))||[]))];
  const cotacoes=cotIds.map(id=>info.cotacoes.get(id)).filter(Boolean).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const melhor=Math.min(...propostas.filter(p=>p.completo).map(p=>p.totalComFrete),Infinity);
  const qtd=(r)=>Number(r.quantidade||r.unidade||1);
  const celula=(p,r)=>{
    const v=p.valores[String(r.id)];
    if(v===undefined) return '<span class="muted">não consultado</span>';
    if(v===null) return '<span class="muted">Não possuo</span>';
    return `${money(v)}<br><small class="muted">${qtd(r)} × = ${money(v*qtd(r))}</small>`;
  };
  modal.innerHTML=`<div class="adm-cmp-modal-card adm-cmp-modal-wide">
    <div class="section-head">
      <div><h3>Respostas da cotação</h3><p class="muted">${rows.length} ${rows.length===1?'item':'itens'} · ${propostas.length} ${propostas.length===1?'fornecedor respondeu':'fornecedores responderam'}</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <h4 class="mt-16">Links enviados</h4>
    <div class="adm-cot-links">${cotacoes.length?cotacoes.map(c=>`<div class="adm-cot-link" data-cot="${esc(c.id)}">
      <span>${dataHora(c.created_at)}</span>${situacaoLinkHtml(c)}
      <span class="muted">${info.respostas.filter(x=>x.cotacao_id===c.id).length} resposta(s)</span>
      <button class="btn btn-small btn-secondary" data-link-copiar="${esc(c.token)}" data-exp="${esc(c.expira_em)}" type="button">Copiar link</button>
      ${linkAberto(c)?`<button class="btn btn-small btn-secondary" data-link-encerrar="${esc(c.id)}" type="button">Encerrar</button>`:`<button class="btn btn-small btn-secondary" data-link-reabrir="${esc(c.id)}" type="button">Reabrir por ${VALIDADE_LINK_DIAS} dias</button>`}
    </div>`).join(''):'<p class="muted">Nenhum link gerado para estes itens.</p>'}</div>
    <h4 class="mt-16">Comparação</h4>
    ${propostas.length?`<div class="adm-cmp-table-wrap"><table class="adm-cmp-table adm-cot-comp">
      <thead><tr><th>Item</th>${propostas.map(p=>`<th>${esc(p.razao_social)}<br><small>${esc(formatarCnpj(p.cnpj))}</small><br><small class="muted">${dataHora(p.atualizado_em)}</small></th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r=>`<tr><td>${esc(qtd(r))} × ${esc(r.material)}${r.tamanho?`<br><small>${esc(r.tamanho)}</small>`:''}</td>${propostas.map(p=>`<td>${celula(p,r)}</td>`).join('')}</tr>`).join('')}
        <tr class="adm-cot-total"><td>Total dos itens${propostas.some(p=>!p.completo)?' (só os cotados)':''}</td>${propostas.map(p=>`<td><b>${money(p.total)}</b>${p.completo?'':`<br><small class="muted">cobre ${p.cobertos} de ${rows.length}</small>`}</td>`).join('')}</tr>
        <tr><td>Atendente / WhatsApp</td>${propostas.map(p=>`<td>${esc(descreverContato(p))}</td>`).join('')}</tr>
        <tr><td>Regime tributário</td>${propostas.map(p=>`<td>${esc(REGIMES_COTACAO[p.regime_tributario]||'-')}</td>`).join('')}</tr>
        <tr><td>Frete</td>${propostas.map(p=>`<td>${esc(descreverFrete(p))}</td>`).join('')}</tr>
        <tr class="adm-cot-total"><td>Total + frete estimado</td>${propostas.map(p=>`<td class="${p.completo&&p.totalComFrete===melhor?'melhor':''}"><b>${money(p.totalComFrete)}</b>${p.completo&&p.totalComFrete===melhor?'<br><small>menor custo</small>':''}</td>`).join('')}</tr>
        <tr><td>Emite nota fiscal</td>${propostas.map(p=>`<td>${p.emite_nf?'Sim':'Não'}</td>`).join('')}</tr>
        <tr><td>Prazo de entrega</td>${propostas.map(p=>`<td>${esc(p.prazo_entrega||'-')}</td>`).join('')}</tr>
        <tr><td>Formas de pagamento</td>${propostas.map(p=>`<td>${esc(p.formas_pagamento.join(', ')||'-')}</td>`).join('')}</tr>
        <tr><td>Desconto por forma</td>${propostas.map(p=>`<td>${esc(descreverDescontos(p))}</td>`).join('')}</tr>
        <tr><td></td>${propostas.map(p=>`<td><button class="btn btn-primary btn-small" data-comprar-forn="${esc(p.cnpj)}" type="button">Comprar deste fornecedor</button></td>`).join('')}</tr>
      </tbody></table></div>`:'<p class="muted">Nenhum fornecedor respondeu ainda.</p>'}
    <div class="adm-cmp-actions mt-16"><button class="btn btn-secondary" id="cotSemCotacao" type="button">Comprar sem usar as respostas (digitar valores)</button></div>
  </div>`;
  modal.classList.add('open');
  const fechar=()=>{modal.classList.remove('open'); loadRows();};
  modal.querySelector('#mClose').onclick=fechar;
  modal.querySelector('#cotSemCotacao').onclick=()=>openCompraLote(rows);
  const atualizar=async(fn)=>{ try{ await fn(); await carregarInfoCotacao(); abrirRespostasModal(rows); }catch(e){ setMsg(e.message,true); alert(e.message); } };
  modal.querySelectorAll('[data-link-copiar]').forEach(b=>b.onclick=async()=>{
    const url=urlDoLink(b.dataset.linkCopiar);
    try{ await navigator.clipboard.writeText(mensagemDoLink(url,b.dataset.exp)); b.textContent='Copiado ✔'; }catch{ prompt('Copie o link:',url); }
  });
  modal.querySelectorAll('[data-link-encerrar]').forEach(b=>b.onclick=()=>atualizar(async()=>{
    const {error}=await supabase.from('compras_cotacao_links').update({status:'encerrada'}).eq('id',b.dataset.linkEncerrar); if(error) throw error;
  }));
  modal.querySelectorAll('[data-link-reabrir]').forEach(b=>b.onclick=()=>atualizar(async()=>{
    const expira=new Date(Date.now()+VALIDADE_LINK_DIAS*86400000).toISOString();
    const {error}=await supabase.from('compras_cotacao_links').update({status:'aberta',expira_em:expira}).eq('id',b.dataset.linkReabrir); if(error) throw error;
  }));
  modal.querySelectorAll('[data-comprar-forn]').forEach(b=>b.onclick=()=>comprarDeProposta(rows,propostas.find(p=>p.cnpj===b.dataset.comprarForn)).catch(e=>{setMsg(e.message,true);alert(e.message);}));
}

// Segue para a compra com os preços do fornecedor escolhido; item que ele não cotou fica de fora e continua em COTAÇÕES.
async function comprarDeProposta(rows,p){
  if(!p) return;
  const cotado=(r)=>p.valores[String(r.id)]>0;
  const comValor=rows.filter(cotado); const sem=rows.filter(r=>!cotado(r));
  if(!comValor.length){ alert('Este fornecedor não cotou nenhum dos itens selecionados.'); return; }
  if(sem.length&&!confirm(`${p.razao_social} não cotou: ${sem.map(r=>r.material).join(', ')}.\n\nComprar só os ${comValor.length} item(ns) cotado(s)? Os demais continuam em COTAÇÕES.`)) return;
  const rowsComValor=comValor.map(r=>{
    const unit=p.valores[String(r.id)];
    return {...r,_valor_unitario:unit,_valor_total:r2c(unit*qtdItem(r)),_fornecedor:p.razao_social,_proposta:p};
  });
  // Com saldo no estoque (do fornecedor ou nosso), passa pela revisão (quanto sai de lá) antes do pagamento.
  const estoqueForn=await carregarEstoqueFornecedor();
  const estoqueProprio=await carregarEstoqueProprio();
  if(rowsComValor.some(r=>candidatosForn(r,estoqueForn).length||candidatosProprio(r,estoqueProprio).length)) openCompraLote(rowsComValor,true);
  else openPagamentoLote(rowsComValor,true);
}

async function solicitarAprovacao(){ const rows=selectedRows(); const msg=approvalMessage(rows); await updateItems(rows,{status:'em_analise', mensagem_aprovacao:msg}); await navigator.clipboard?.writeText(msg).catch(()=>{}); setMsg('Mensagem de aprovação gerada e copiada. Itens movidos para EM ANÁLISE.'); await loadRows(); }
async function recusarSelecionados(){ const rows=selectedRows(); const motivo=prompt('Motivo da recusa:'); if(!motivo) return; await updateItems(rows,{status:'recusado', motivo_recusa:motivo}); setMsg('Itens recusados.'); await loadRows(); }
function aprovarSelecionados(){
  const rows=selectedRows();
  if(!rows.length){ setMsg('Selecione pelo menos um item.',true); return; }
  const modal=document.getElementById('admCmpModal');
  modal.innerHTML=`<div class="adm-cmp-modal-card">
    <div class="section-head"><div><h3>Aprovar ${rows.length} ${rows.length===1?'item':'itens'}</h3><p class="muted">${rows.map(r=>esc(r.material)).join(', ')}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">Quem está aprovando<input id="aprQuem" placeholder="Nome de quem aprovou"></label>
      <label class="adm-cmp-full">Anexar print da aprovação (opcional)<input id="aprAnexo" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
    </div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="aprConfirmar" type="button">Aprovar</button></div>
    <span class="adm-cmp-feedback mt-8" id="aprFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#aprConfirmar').addEventListener('click',async()=>{
    const btn=modal.querySelector('#aprConfirmar'); const fb=modal.querySelector('#aprFeedback');
    btn.disabled=true; if(fb) fb.textContent='';
    try{
      const quem=modal.querySelector('#aprQuem')?.value?.trim()||null;
      const file=modal.querySelector('#aprAnexo')?.files?.[0]||null;
      let anexoUrl=null;
      if(file){ if(fb) fb.textContent='Enviando anexo...'; anexoUrl=await uploadArquivoNotasFiscais(file,'compras/aprovacoes'); }
      const payload={status:'pendente', aprovado_por:quem||null, aprovado_em:new Date().toISOString()};
      if(anexoUrl) payload.aprovacao_anexo_url=anexoUrl;
      await updateItems(rows,payload);
      modal.classList.remove('open');
      setMsg('Itens aprovados, voltaram para COTAÇÕES.');
      await loadRows();
    }catch(e){ if(fb){fb.textContent=e.message; fb.classList.add('err');} btn.disabled=false; }
  });
}

// Envia itens de COTAÇÕES direto do Estoque (compras_estoque_*), sem passar
// por cotação/compra: dá baixa automática na quantidade e some de Solicitações.
// Correios → baixa já sai completa (destinatário é o próprio gestor); Retirada
// pergunta quem está retirando (pode não ser o gestor) antes de dar baixa.
async function enviarEstoqueSelecionados(){
  const rows=selectedRows();
  if(!rows.length){ setMsg('Selecione pelo menos um item para enviar via estoque.',true); return; }
  setMsg('Verificando materiais no estoque...');
  const materiais=await safe(()=>supabase.from('compras_estoque_materiais').select('id,nome,tamanho,unidade,estoque_atual').eq('ativo',true));
  const casados=rows.map(r=>({row:r, material:materiais.find(m=>norm(m.nome)===norm(r.material)&&norm(m.tamanho||'')===norm(r.tamanho||''))}));
  const semEstoque=casados.filter(c=>!c.material||Number(c.material.estoque_atual||0)<Number(c.row.quantidade||1));
  if(semEstoque.length){
    setMsg(`Sem estoque suficiente para: ${semEstoque.map(c=>c.row.material).join(', ')}. Cadastre/reponha no Estoque antes de enviar.`,true);
    return;
  }
  const correios=confirm('Enviar por correios?\n\nOK = Sim (Correios)\nCancelar = Não (retirada no Estoque)');
  let quemRetira=null;
  if(!correios){
    quemRetira=prompt('Quem está retirando o material?','');
    if(quemRetira===null) return;
  }
  setMsg('Registrando baixa no estoque...');
  const usuarioNome=state.ctx?.user?.name||state.ctx?.user?.email||null;
  try{
    for(const {row,material} of casados){
      const qtd=Number(row.quantidade||1);
      const gestor=row.compras_solicitacoes?.solicitante||'';
      const mov={
        material_id:material.id, tipo_movimentacao:'saida', quantidade:qtd,
        data_movimentacao:new Date().toISOString().slice(0,10),
        destino:correios?'Correios':'Colaborador',
        colaborador_nome:correios?(gestor||null):(quemRetira||null),
        motivo:correios?'Envio via Correios':'Entrega ao colaborador',
        observacao:`Compras: ${row.material}${row.tamanho?` (${row.tamanho})`:''} — solicitação de ${gestor||'gestor'}`,
        usuario_nome:usuarioNome,
      };
      const {data:movRow,error:e1}=await supabase.from('compras_estoque_movimentacoes').insert(mov).select('id').single();
      if(e1) throw e1;
      const novoEstoque=Number(material.estoque_atual||0)-qtd;
      material.estoque_atual=novoEstoque;
      const {error:e2}=await supabase.from('compras_estoque_materiais').update({estoque_atual:novoEstoque,updated_at:new Date().toISOString()}).eq('id',material.id);
      if(e2) throw e2;
      const {error:e3}=await supabase.from('compras_itens').update({status:'enviado_estoque', envio_tipo:correios?'correios':'retirada', estoque_movimentacao_id:movRow.id}).eq('id',row.id);
      if(e3) throw e3;
    }
  }catch(e){ setMsg(e.message,true); return; }
  await loadRows();
  if(correios){
    const gestorUnico=[...new Set(rows.map(r=>r.compras_solicitacoes?.solicitante).filter(Boolean))][0]||'';
    try{ sessionStorage.setItem('cmpEnviosPrefillNome',gestorUnico); }catch{}
    window.location.href=toPanelUrl('envios');
  }else{
    window.location.href=`${toPanelUrl('compras-estoque')}#historico`;
  }
}

// ─── ANEXAR NF NA ETAPA À PAGAR (só grava nf_url; o status não muda) ──────────
// O Financeiro continua pagando normalmente; quando o item chega em NF, a nota
// já está lá e basta finalizar.
function openAnexarNfModal(gids){
  const ids=String(gids).split(',').map(id=>id.trim());
  const itens=state.rows.filter(r=>ids.includes(String(r.id)));
  if(!itens.length) return;
  const modal=document.getElementById('admCmpModal');
  const atual=itens.find(r=>r.nf_url)?.nf_url||'';
  const titulo=itens.length>1?`${itens.length} itens`:esc(itens[0].material);
  modal.innerHTML=`<div class="adm-cmp-modal-card">
    <div class="section-head"><div><h3>${atual?'Trocar NF':'Anexar NF'}</h3><p class="muted">${titulo}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    ${atual?`<p class="muted mt-16">NF atual: ${/^https?:\/\//i.test(atual)?`<a href="${esc(atual)}" target="_blank" rel="noopener" style="color:#86efac">Abrir</a>`:esc(atual)}</p>`:''}
    <div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">URL ou número da NF<input id="mNfAnexo" placeholder="Cole o link ou número da NF" value="${/^https?:\/\//i.test(atual)?'':esc(atual)}"></label>
      <label class="adm-cmp-full">Ou anexar arquivo(s) da NF<input id="mNfAnexoFile" type="file" multiple accept="${ACEITA_NF}"><small class="muted">Pode escolher vários arquivos de uma vez${itens.length>1?'. Com mais de uma NF, você escolhe qual vale para cada item':'; o primeiro é a NF principal'}. Escolher arquivos substitui os atuais.</small></label>
      <div class="adm-cmp-full" id="mNfAnexoAtrib" style="display:none"></div>
    </div>
    ${anexosNfHtml(anexosNf(itens.find(r=>r.nf_url)||{}))}
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="mNfAnexoSalvar" type="button">Salvar NF</button></div>
    <span class="adm-cmp-feedback mt-8" id="nfAnexoFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  ligarAtribuicaoNf(modal,itens,'#mNfAnexoFile','#mNfAnexoAtrib');
  modal.querySelector('#mNfAnexoSalvar').addEventListener('click',async()=>{
    const btn=modal.querySelector('#mNfAnexoSalvar'); const fb=modal.querySelector('#nfAnexoFeedback');
    btn.disabled=true; if(fb){fb.textContent=''; fb.classList.remove('err');}
    try{
      const files=modal.querySelector('#mNfAnexoFile')?.files||[];
      let nf=modal.querySelector('#mNfAnexo')?.value?.trim()||'';
      let anexos,nfPorItem=null;
      if(files.length){ const up=await resolverArquivosNf(files,itens,modal.querySelector('#mNfAnexoAtrib'),fb); nf=up.nf; anexos=up.anexos; nfPorItem=up.nfPorItem; }
      if(!nf){ alert('Informe a NF ou anexe um arquivo.'); btn.disabled=false; if(fb) fb.textContent=''; return; }
      // Uma atualização por NF (os itens da mesma NF juntos); sem 2+ NFs, todos os itens levam a mesma.
      const porNf=new Map();
      for(const r of itens){ const url=(nfPorItem&&nfPorItem.get(r.id))||nf; if(!porNf.has(url)) porNf.set(url,[]); porNf.get(url).push(r.id); }
      for(const [url,ids] of porNf){
        const upd={nf_url:url}; if(anexos!==undefined) upd.nf_anexos=anexos;
        const {error}=await supabase.from('compras_itens').update(upd).in('id',ids);
        if(error) throw new Error(error.message);
      }
      modal.classList.remove('open');
      setMsg(`NF anexada em ${itens.length} item(ns).`);
      await loadRows();
    }catch(e){ if(fb){fb.textContent=e.message; fb.classList.add('err');} btn.disabled=false; }
  });
}

// ─── FINALIZAR NF (modal dedicado, chamado pelo ícone "Finalizar") ────────────
function openFinalizarModal(r){
  const modal=document.getElementById('admCmpModal');
  modal.innerHTML=`<div class="adm-cmp-modal-card">
    <div class="section-head"><div><h3>Finalizar compra</h3><p class="muted">${esc(r.material)}${r.tamanho?` · Tam: ${esc(r.tamanho)}`:''}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">URL ou número da NF<input id="mNf" placeholder="Cole o link ou número da NF" value="${esc(r.nf_url||'')}"></label>
      <label>Marca<input id="mMarca" placeholder="Marca do item, se patrimônio" value="${esc(r.marca||'')}"></label>
      ${isEPI(r)?`<label>Nº CA<input id="mCa" placeholder="Nº CA do EPI" value="${esc(r.ca||'')}"></label>`:''}
      <label class="adm-cmp-full">Ou anexar arquivo(s) da NF<input id="mNfFile" type="file" multiple accept="${ACEITA_NF}"><small class="muted">Pode escolher vários arquivos de uma vez; o primeiro é a NF principal. Escolher arquivos substitui os atuais.</small></label>
    </div>
    ${anexosNfHtml(anexosNf(r))}
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="mFinalizar" type="button">Finalizar compra</button>${r.comprovante_url?`<a class="btn btn-secondary" href="${esc(r.comprovante_url)}" target="_blank">Abrir comprovante</a>`:''}</div>
    <span class="adm-cmp-feedback mt-8" id="nfFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#mFinalizar').addEventListener('click',async()=>{
    const btn=modal.querySelector('#mFinalizar'); const fb=modal.querySelector('#nfFeedback');
    btn.disabled=true; if(fb) fb.textContent='';
    try{
      const files=modal.querySelector('#mNfFile')?.files||[];
      let nf=modal.querySelector('#mNf')?.value?.trim()||'';
      let anexos;
      if(files.length){ const up=await enviarArquivosNf(files,'compras/nf',fb); nf=up.principal; anexos=up.anexos; }
      if(!nf){ alert('Informe a NF ou anexe um arquivo.'); btn.disabled=false; return; }
      const marca=modal.querySelector('#mMarca')?.value?.trim()||'';
      const ca=isEPI(r)?(modal.querySelector('#mCa')?.value?.trim()||r.ca||null):(r.ca||null);
      await finalizarCompra(r,{nf,marca,ca,anexos});
    }catch(e){ if(fb){fb.textContent=e.message; fb.classList.add('err');} btn.disabled=false; }
  });
}

// ─── MODAL COMPRAR (lote) ─────────────────────────────────────────────────────
function abrirCompraSelecionados(){
  const rows=selectedRows();
  if(!rows.length){setMsg('Selecione pelo menos um item em COTAÇÕES para comprar.',true);return;}
  const invalidos=rows.filter(r=>r.status!=='em_cotacao'&&r.status!=='pendente');
  if(invalidos.length){setMsg('Comprar em lote só está disponível para itens em COTAÇÕES.',true);return;}
  // Com resposta de fornecedor, escolhe a proposta; sem resposta, digita os valores como antes.
  if(state.cotacaoInfo&&temRespostas(rows)) abrirRespostasModal(rows);
  else openCompraLote(rows);
}

// ─── ESTOQUE NO FORNECEDOR ─────────────────────────────────────────────────────
// Material comprado com antecedência que está guardado no fornecedor (Compras > Estoque > Fornecedor).
// Na compra, o que existe lá sai do saldo do fornecedor e só o restante é pago.
async function carregarEstoqueFornecedor(){
  return await safe(()=>supabase.from('compras_estoque_fornecedor').select('id,fornecedor,material,tamanho,unidade,quantidade,valor_unitario').eq('ativo',true).gt('quantidade',0),[]);
}
// Casa por nome + tamanho juntos, sem pontuação: "JOGO DE PENEIRAS" + "3mm - 5mm - fundo" = "JOGO DE PENEIRAS 3MM 5MM FUNDO".
const chaveMaterialForn=(m)=>norm(`${m.material||''} ${m.tamanho||''}`).replace(/[^a-z0-9]+/g,' ').trim();
const candidatosForn=(r,lista)=>lista.filter(f=>chaveMaterialForn(f)===chaveMaterialForn(r)).sort((a,b)=>Number(b.quantidade)-Number(a.quantidade));
const qtdItem=(r)=>Number(r.quantidade||r.unidade||1);
const r2c=(v)=>Math.round(Number(v||0)*100)/100;

// ─── ESTOQUE PRÓPRIO (Compras > Estoque) ───────────────────────────────────────
// Material que já está no nosso estoque (mesmo nome + tamanho) sai de lá em vez de ser comprado. EPI retirado
// para um colaborador cai na aba "Comprados pelo Gestor" do RH (status enviado_estoque) para gerar a ficha.
async function carregarEstoqueProprio(){
  return await safe(()=>supabase.from('compras_estoque_materiais').select('id,nome,tamanho,unidade,estoque_atual').eq('ativo',true).gt('estoque_atual',0),[]);
}
const candidatosProprio=(r,lista)=>lista.filter(m=>norm(m.nome)===norm(r.material)&&norm(m.tamanho||'')===norm(r.tamanho||''));
const saldoProprio=(c)=>r2c(c.reduce((s,m)=>s+Number(m.estoque_atual||0),0));

// Patrimônio comprado: uma linha de cadastro por unidade, para informar a etiqueta (nº) de cada uma.
// Só cria as que faltam, então repetir a finalização não duplica.
async function criarLinhasPatrimonio(r,marca=null){
  try{
    const total=Math.max(1,Math.floor(qtdItem(r)));
    const {count}=await supabase.from('compras_patrimonios_cadastro').select('id',{count:'exact',head:true}).eq('compra_item_id',r.id);
    const faltam=total-(count||0);
    if(faltam<=0) return;
    const linha={compra_item_id:r.id,material:r.material,marca:marca??r.marca??null,coordenacao:r.compras_solicitacoes?.coordenacao||null,status:'aguardando_numero'};
    const {error}=await supabase.from('compras_patrimonios_cadastro').insert(Array.from({length:faltam},()=>({...linha})));
    if(error) throw error;
  }catch(e){ console.warn('[compras] linhas de patrimônio',e); }
}

// Retira do nosso estoque (compras_estoque_materiais) a quantidade escolhida na compra: registra a saída para o
// colaborador, baixa o saldo e marca o item como enviado_estoque (o que sobra segue no fluxo de compra). Devolve só o
// que ainda precisa ser comprado. Roda ANTES do envio ao Financeiro: se algo falhar aqui, nada foi pago.
async function aplicarEstoqueProprio(itens){
  const user=state.ctx?.user||{};
  const hoje=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const restantes=[];
  for(const r of itens){
    const qtd=r2c(r._do_proprio);
    if(!(qtd>0)||!(r._proprio_regs||[]).length){ restantes.push(r); continue; }
    const {data:regs,error:er}=await supabase.from('compras_estoque_materiais').select('id,estoque_atual').in('id',r._proprio_regs);
    if(er) throw new Error(`Não foi possível conferir o saldo de "${r.material}" no estoque: ${er.message}`);
    let falta=qtd; const partes=[];
    for(const m of [...(regs||[])].sort((a,b)=>Number(b.estoque_atual)-Number(a.estoque_atual))){
      if(falta<=0) break;
      const usa=Math.min(Math.max(0,Number(m.estoque_atual||0)),falta);
      if(usa>0){ partes.push({m,q:r2c(usa)}); falta=r2c(falta-usa); }
    }
    if(falta>0) throw new Error(`O saldo de "${r.material}" no estoque mudou (agora ${saldoProprio(regs||[])}). Reabra a compra.`);
    const tam=r.tamanho?` (${r.tamanho})`:'';
    const sol=r.compras_solicitacoes||{};
    const feitas=[];
    const resto=r2c(qtdItem(r)-qtd);
    const desfazer=async()=>{
      for(const f of feitas.reverse()){
        await supabase.from('compras_estoque_movimentacoes').delete().eq('id',f.movId);
        await supabase.from('compras_estoque_materiais').update({estoque_atual:f.antes,updated_at:new Date().toISOString()}).eq('id',f.id).eq('estoque_atual',f.depois);
      }
    };
    try{
      for(const {m,q} of partes){
        const antes=Number(m.estoque_atual||0), depois=r2c(antes-q);
        const {data:atu,error:ea}=await supabase.from('compras_estoque_materiais').update({estoque_atual:depois,updated_at:new Date().toISOString()}).eq('id',m.id).eq('estoque_atual',m.estoque_atual).select('id');
        if(ea) throw ea;
        if(!atu?.length) throw new Error(`o saldo de "${r.material}" mudou durante a baixa. Reabra a compra`);
        const mov={material_id:m.id,tipo_movimentacao:'saida',quantidade:q,data_movimentacao:hoje,
          destino:r.colaborador_nome?'Colaborador':(r.regional||sol.coordenacao||'Compras'),
          colaborador_id:r.colaborador_id||null,colaborador_nome:r.colaborador_nome||null,
          coordenacao:sol.coordenacao||null,supervisao:sol.supervisao||null,
          motivo:'Entrega ao colaborador',
          observacao:`Compras: ${r.material}${tam} — retirado do estoque ao comprar (solicitação de ${sol.solicitante||'gestor'})`,
          usuario_id:user.id||null,usuario_nome:user.name||user.email||null};
        const {data:movRow,error:eb}=await supabase.from('compras_estoque_movimentacoes').insert(mov).select('id').single();
        if(eb){ await supabase.from('compras_estoque_materiais').update({estoque_atual:antes,updated_at:new Date().toISOString()}).eq('id',m.id).eq('estoque_atual',depois); throw eb; }
        feitas.push({id:m.id,antes,depois,movId:movRow.id});
      }
      const agora=new Date().toISOString();
      const movId=feitas[0].movId;
      if(resto>0){
        // Parte retirada do estoque vira um item próprio; o item original fica só com o que será comprado.
        const copia={solicitacao_id:r.solicitacao_id,material:r.material,tipo:r.tipo,tamanho:r.tamanho,marca:r.marca,ca:r._ca||r.ca,regional:r.regional,colaborador_id:r.colaborador_id,colaborador_nome:r.colaborador_nome,quantidade:qtd,unidade:qtd,status:'enviado_estoque',envio_tipo:'retirada',estoque_movimentacao_id:movId,comprado_em:agora};
        const {data:novo,error:ei}=await supabase.from('compras_itens').insert(copia).select('id').single();
        if(ei) throw ei;
        const {error:eu}=await supabase.from('compras_itens').update({quantidade:resto,unidade:resto}).eq('id',r.id);
        if(eu){ await supabase.from('compras_itens').delete().eq('id',novo.id); throw eu; }
      }else{
        const {error:eu}=await supabase.from('compras_itens').update({status:'enviado_estoque',envio_tipo:'retirada',estoque_movimentacao_id:movId,comprado_em:agora,...((r._ca||r.ca)?{ca:r._ca||r.ca}:{})}).eq('id',r.id);
        if(eu) throw eu;
      }
    }catch(e){
      await desfazer();
      throw new Error(`Erro ao retirar "${r.material}" do estoque: ${e.message}`);
    }
    if(resto>0) restantes.push({...r,quantidade:resto,unidade:resto,_do_proprio:0,_proprio_regs:null});
  }
  return restantes;
}
const aplicarEstoques=async(itens)=>await aplicarEstoqueFornecedor(await aplicarEstoqueProprio(itens));

// Dá baixa no saldo do fornecedor e ajusta os itens da compra. Devolve só o que ainda precisa ser pago
// (com a quantidade já reduzida). Roda ANTES do envio ao Financeiro: se algo falhar aqui, nada foi pago.
async function aplicarEstoqueFornecedor(itens){
  const user=state.ctx?.user||{};
  const hoje=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const restantes=[];
  for(const r of itens){
    const doEst=r2c(r._do_estoque);
    if(!(doEst>0)||!r._estoque_forn_id){ restantes.push(r); continue; }
    const resto=r2c(qtdItem(r)-doEst);
    const {data:fresco,error:ef}=await supabase.from('compras_estoque_fornecedor').select('quantidade,fornecedor').eq('id',r._estoque_forn_id).single();
    if(ef) throw new Error(`Não foi possível conferir o saldo de "${r.material}" no fornecedor: ${ef.message}`);
    if(Number(fresco.quantidade)<doEst) throw new Error(`O saldo de "${r.material}" no fornecedor mudou (agora ${fresco.quantidade}). Reabra a compra.`);
    const tam=r.tamanho?` (${r.tamanho})`:'';
    const ident={p_usuario_id:user.id||null,p_usuario_nome:user.name||user.email||null};
    const {data:res,error:eb}=await supabase.rpc('compras_estoque_fornecedor_baixar',{p_estoque_id:r._estoque_forn_id,p_quantidade:doEst,p_destino:r.regional||r.compras_solicitacoes?.coordenacao||'Compras',p_data:hoje,p_obs:`Compras: ${r.material}${tam}`,...ident});
    if(eb) throw new Error(`Erro ao dar baixa de "${r.material}" no fornecedor: ${eb.message}`);
    let itemAtendidoId=r.id;
    try{
      if(resto>0){
        // Parte atendida pelo fornecedor vira um item próprio; o item original fica só com o que será comprado.
        const copia={solicitacao_id:r.solicitacao_id,material:r.material,tipo:r.tipo,tamanho:r.tamanho,marca:r.marca,ca:r.ca,regional:r.regional,colaborador_id:r.colaborador_id,colaborador_nome:r.colaborador_nome,fornecedor:fresco.fornecedor,quantidade:doEst,unidade:doEst,status:'enviado_estoque'};
        const {data:novo,error:ei}=await supabase.from('compras_itens').insert(copia).select('id').single();
        if(ei) throw ei;
        itemAtendidoId=novo.id;
        const {error:eu}=await supabase.from('compras_itens').update({quantidade:resto,unidade:resto}).eq('id',r.id);
        if(eu){ await supabase.from('compras_itens').delete().eq('id',novo.id); throw eu; }
      }else{
        const {error:eu}=await supabase.from('compras_itens').update({status:'enviado_estoque',fornecedor:fresco.fornecedor,...(r.marca?{marca:r.marca}:{})}).eq('id',r.id);
        if(eu) throw eu;
      }
      await supabase.from('compras_estoque_fornecedor_mov').update({compras_item_id:itemAtendidoId,compras_solicitacao_id:r.solicitacao_id||null}).eq('id',res.mov_id);
    }catch(e){
      await supabase.rpc('compras_estoque_fornecedor_entrada',{p_estoque_id:r._estoque_forn_id,p_quantidade:doEst,p_data:hoje,p_nf:null,p_valor:null,p_obs:'Estorno: falha ao atualizar a compra',...ident});
      throw new Error(`Erro ao atualizar "${r.material}": ${e.message}`);
    }
    // O que veio do estoque do fornecedor também precisa de etiqueta de patrimônio.
    if(norm(r.tipo).includes('patrimonio')) await criarLinhasPatrimonio({...r,id:itemAtendidoId,quantidade:doEst,unidade:doEst});
    if(resto>0) restantes.push({...r,quantidade:resto,unidade:resto,_valor_total:r2c((r._valor_unitario||0)*resto)});
  }
  return restantes;
}

// fornecedorPreSelecionado: veio da escolha do fornecedor da cotação (valores e fornecedor já definidos em _valor_unitario/_fornecedor).
async function openCompraLote(rows,fornecedorPreSelecionado=false){
  const modal=document.getElementById('admCmpModal');
  const estoqueForn=await carregarEstoqueFornecedor();
  const cand=new Map(rows.map(r=>[r.id,candidatosForn(r,estoqueForn)]));
  const temForn=[...cand.values()].some(c=>c.length);
  // Nosso estoque: o que existe lá (mesmo nome + tamanho) sai de lá por padrão; só o restante é comprado.
  const estoqueProprio=await carregarEstoqueProprio();
  const candProp=new Map(rows.map(r=>[r.id,candidatosProprio(r,estoqueProprio)]));
  const temProp=[...candProp.values()].some(c=>c.length);
  const doPropInicial=(r)=>{
    const c=candProp.get(r.id)||[];
    if(!c.length) return 0;
    return r._do_proprio!=null?Number(r._do_proprio):Math.min(qtdItem(r),saldoProprio(c));
  };
  // Patrimônio: a marca é exigida pelo GRM e precisa ser informada na compra (catálogo do GRM como sugestão).
  const ehPat=(r)=>norm(r.tipo).includes('patrimonio');
  const temPat=rows.some(ehPat);
  const marcasGrm=temPat?[...new Set((await safe(()=>supabase.from('grm_veiculo_catalogo').select('marca').eq('pmo_code',0).order('marca'),[])).map(m=>m.marca).filter(Boolean))]:[];
  // Sem valor informado, sugere o valor unitário cadastrado no estoque do fornecedor.
  const c0valor=(r)=>cand.get(r.id)?.[0]?.valor_unitario||'';
  const doEstoqueInicial=(r)=>{
    const c=cand.get(r.id)||[];
    if(!c.length) return 0;
    return r._do_estoque!=null?Number(r._do_estoque):Math.min(qtdItem(r),Number(c[0].quantidade));
  };
  const totalInicial=rows.reduce((s,r)=>s+(Number(r.valor_total||0)),0);
  modal.innerHTML=`<div class="adm-cmp-modal-card adm-cmp-modal-wide">
    <div class="section-head">
      <div><h3>Comprar itens selecionados</h3><p class="muted">Informe o valor unitário de cada material.${temProp?' Itens que já estão no nosso estoque são retirados de lá (e EPI vai para a ficha do RH); só o restante é comprado.':''}${temForn?' Itens com saldo no estoque do fornecedor saem de lá; só o restante é pago.':''}</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="adm-cmp-table-wrap mt-16">
      <table class="adm-cmp-table adm-cmp-buy-table">
        <thead><tr><th>Un.</th><th>Material</th><th>Tipo</th>${temPat?'<th>Marca</th>':''}${rows.some(isEPI)?'<th>CA</th>':''}${temProp?'<th>Em estoque</th><th>Retirar do estoque</th>':''}${temForn?'<th>No fornecedor</th><th>Do estoque</th>':''}<th>Valor unitário</th><th>Total a pagar</th></tr></thead>
        <tbody>
          ${rows.map(r=>{
            const c=cand.get(r.id)||[];
            const cp=candProp.get(r.id)||[];
            return `<tr data-buy-row="${esc(r.id)}">
            <td>${esc(r.quantidade||r.unidade||1)}</td>
            <td>${esc(r.material)}${r.tamanho?`<br><small>Tam: ${esc(r.tamanho)}</small>`:''}${r.colaborador_nome?`<br><small>${esc(r.colaborador_nome)}</small>`:''}</td>
            <td>${esc(r.tipo||'-')}</td>
            ${temPat?`<td>${ehPat(r)?`<input class="buy-marca" list="buyMarcas" placeholder="Marca (obrigatória)" autocomplete="off" value="${esc(r.marca||'')}" style="width:170px">`:'-'}</td>`:''}
            ${rows.some(isEPI)?`<td>${isEPI(r)?`<input class="buy-ca" placeholder="Nº CA" style="width:90px" value="${esc(r.ca||'')}">`:'-'}</td>`:''}
            ${temProp?`<td>${cp.length?`${esc(saldoProprio(cp))} ${esc(cp[0].unidade||'UN')}`:'-'}</td>
            <td>${cp.length?`<input class="buy-prop" type="number" step="0.01" min="0" value="${esc(doPropInicial(r))}" style="width:90px">`:'-'}</td>`:''}
            ${temForn?`<td>${c.length?(c.length>1?`<select class="buy-forn">${c.map(f=>`<option value="${esc(f.id)}" ${f.id===r._estoque_forn_id?'selected':''}>${esc(f.fornecedor)} — saldo ${esc(f.quantidade)}</option>`).join('')}</select>`:`${esc(c[0].fornecedor)}<br><small>saldo ${esc(c[0].quantidade)}</small><input type="hidden" class="buy-forn" value="${esc(c[0].id)}">`):'-'}</td>
            <td>${c.length?`<input class="buy-estoque" type="number" step="0.01" min="0" value="${esc(doEstoqueInicial(r))}" style="width:90px">`:'-'}</td>`:''}
            <td><input class="buy-unit" type="number" step="0.01" min="0" value="${esc(r._valor_unitario||r.valor_unitario||c0valor(r)||'')}" placeholder="0,00"></td>
            <td><input class="buy-total" type="number" step="0.01" readonly value="${esc(r.valor_total||'0')}"></td>
          </tr>`;}).join('')}
        </tbody>
      </table>
    </div>
    ${temPat?`<datalist id="buyMarcas">${marcasGrm.map(m=>`<option value="${esc(m)}"></option>`).join('')}</datalist>`:''}
    <div class="adm-cmp-total-box mt-16"><span>Total da compra</span><strong id="buyGrandTotal">${money(totalInicial)}</strong></div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="buyContinue" type="button">COMPRAR</button><button class="btn btn-danger" id="buyCancel" type="button">CANCELAR</button></div>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#buyCancel').onclick=()=>modal.classList.remove('open');
  // Quantidade que sai do fornecedor: nunca passa da quantidade do item nem do saldo do fornecedor escolhido.
  // Do nosso estoque: nunca passa da quantidade do item nem do saldo.
  const lerProprio=(r,tr)=>{
    const c=candProp.get(r.id)||[];
    if(!c.length) return 0;
    return Math.max(0,Math.min(r2c(tr.querySelector('.buy-prop')?.value),qtdItem(r),saldoProprio(c)));
  };
  const lerEstoque=(r,tr,prop=0)=>{
    const id=tr.querySelector('.buy-forn')?.value||'';
    const forn=estoqueForn.find(f=>f.id===id);
    if(!forn) return {id:null,nome:null,qtd:0};
    const campo=tr.querySelector('.buy-estoque');
    const qtd=Math.max(0,Math.min(r2c(campo?.value),qtdItem(r)-prop,Number(forn.quantidade)));
    return {id:forn.id,nome:forn.fornecedor,qtd};
  };
  const recalc=()=>{
    let grand=0;
    rows.forEach(r=>{
      const tr=modal.querySelector(`[data-buy-row="${CSS.escape(String(r.id))}"]`); if(!tr) return;
      const unit=Number(tr.querySelector('.buy-unit').value||0);
      const prop=lerProprio(r,tr);
      const campoProp=tr.querySelector('.buy-prop');
      if(campoProp&&campoProp.value!==''&&r2c(campoProp.value)!==prop) campoProp.value=prop;
      const est=lerEstoque(r,tr,prop);
      const campo=tr.querySelector('.buy-estoque');
      if(campo&&campo.value!==''&&r2c(campo.value)!==est.qtd) campo.value=est.qtd;
      const total=unit*(qtdItem(r)-prop-est.qtd);
      tr.querySelector('.buy-total').value=total.toFixed(2);
      grand+=total;
    });
    modal.querySelector('#buyGrandTotal').textContent=money(grand);
  };
  modal.querySelectorAll('.buy-unit,.buy-prop,.buy-estoque,select.buy-forn').forEach(inp=>{inp.oninput=recalc;inp.onchange=recalc;});
  recalc();
  modal.querySelector('#buyContinue').onclick=async()=>{
    // Patrimônio sem marca não entra no GRM: exige a marca de cada item antes de seguir.
    const semMarca=rows.find(r=>ehPat(r)&&!modal.querySelector(`[data-buy-row="${CSS.escape(String(r.id))}"] .buy-marca`)?.value?.trim());
    if(semMarca){
      alert(`Informe a marca de "${semMarca.material}" (o GRM exige). Se o item não tem marca, use SEM MARCA.`);
      modal.querySelector(`[data-buy-row="${CSS.escape(String(semMarca.id))}"] .buy-marca`)?.focus();
      return;
    }
    const rowsComValor=rows.map(r=>{
      const tr=modal.querySelector(`[data-buy-row="${CSS.escape(String(r.id))}"]`);
      const unit=Number(tr?.querySelector('.buy-unit')?.value||0);
      const ca=tr?.querySelector('.buy-ca')?.value?.trim()||r.ca||null;
      const marca=tr?.querySelector('.buy-marca')?.value?.trim()||r.marca||null;
      const prop=tr?lerProprio(r,tr):0;
      const est=tr?lerEstoque(r,tr,prop):{id:null,nome:null,qtd:0};
      const pagar=r2c(qtdItem(r)-prop-est.qtd);
      return {...r, marca, _valor_unitario:unit, _valor_total:r2c(unit*pagar), _ca:ca, _do_proprio:prop, _proprio_regs:prop>0?(candProp.get(r.id)||[]).map(m=>m.id):null, _do_estoque:est.qtd, _estoque_forn_id:est.id, _qtd_pagar:pagar};
    });
    // Tudo atendido pelo estoque (nosso e/ou do fornecedor): não há o que pagar, só a baixa.
    if((temForn||temProp)&&rowsComValor.every(r=>r._qtd_pagar<=0)){
      const origem=rowsComValor.some(r=>r._do_proprio>0)?'do estoque':'no estoque do fornecedor';
      if(!confirm(`Todos os itens saem ${origem}. Dar baixa em ${rowsComValor.length} ${rowsComValor.length===1?'item':'itens'}? Nada será enviado ao Financeiro.${rowsComValor.some(r=>r._do_proprio>0&&isEPI(r))?'\n\nOs EPIs seguem para a ficha de EPI no RH.':''}`)) return;
      try{
        await aplicarEstoques(rowsComValor);
        modal.classList.remove('open');
        setMsg(rowsComValor.some(r=>r._do_proprio>0)?'Baixa feita no estoque. Nada a pagar.':'Baixa feita no estoque do fornecedor. Nada a pagar.');
        await loadRows();
      }catch(e){setMsg(e.message,true);alert(e.message);}
      return;
    }
    openPagamentoLote(rowsComValor, fornecedorPreSelecionado);
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
// NF com vários arquivos: o 1º vira a NF principal (nf_url, que a fila do GRM e a aba Notas Fiscais usam) e os
// demais ficam em compras_itens.nf_anexos como { url, nome }.
const ACEITA_NF='.pdf,.png,.jpg,.jpeg,.webp,.xml,.doc,.docx,.xls,.xlsx';
const anexosNf=(r)=>Array.isArray(r?.nf_anexos)?r.nf_anexos.filter(a=>a&&a.url):[];
async function enviarArquivosNf(files,prefixo,fb){
  const lista=[...(files||[])];
  const urls=[];
  for(let i=0;i<lista.length;i++){
    if(fb) fb.textContent=lista.length>1?`Enviando arquivo ${i+1} de ${lista.length}...`:'Enviando arquivo...';
    urls.push(await uploadArquivoNotasFiscais(lista[i],prefixo));
  }
  return {principal:urls[0]||'',anexos:urls.slice(1).map((url,i)=>({url,nome:lista[i+1].name})),urls};
}
// Duas (ou mais) NFs para itens diferentes da mesma compra: cada item escolhe a sua. Cada NF é lançada
// separadamente no GRM e o pagamento continua agrupado no mesmo comprovante. Arquivo sem item = só anexo.
function ligarAtribuicaoNf(modal,itens,inputSel,boxSel){
  const input=modal.querySelector(inputSel); const box=modal.querySelector(boxSel);
  if(!input||!box||itens.length<2) return;
  input.addEventListener('change',()=>{
    const files=[...(input.files||[])];
    if(files.length<2){ box.style.display='none'; box.innerHTML=''; return; }
    const optsDe=(padrao)=>files.map((f,i)=>`<option value="${i}"${i===padrao?' selected':''}>NF ${i+1} — ${esc(f.name)}</option>`).join('');
    box.style.display='';
    // Padrão distribuído (item 1 → NF 1, item 2 → NF 2…): com todos na NF 1, a 2ª NF virava só anexo sem ninguém notar.
    box.innerHTML=`<p class="muted">Cada NF é lançada separadamente no GRM e o pagamento segue agrupado no mesmo comprovante. Escolha a NF de cada item; arquivo sem item fica só como anexo.</p>
      <table class="adm-cmp-table" style="min-width:0"><thead><tr><th>Item</th><th>NF</th></tr></thead><tbody>${itens.map((r,idx)=>`<tr><td>${esc(r.quantidade||r.unidade||1)} × ${esc(r.material)}${r.tamanho?` (${esc(r.tamanho)})`:''}</td><td><select data-nf-item="${esc(r.id)}">${optsDe(Math.min(idx,files.length-1))}</select></td></tr>`).join('')}</tbody></table>
      <p class="adm-cmp-feedback err mt-8" data-nf-aviso style="display:none"></p>`;
    const aviso=box.querySelector('[data-nf-aviso]');
    const atualizarAviso=()=>{
      const sem=nfsSemItem(box,itens,files);
      aviso.style.display=sem.length?'':'none';
      aviso.textContent=sem.length?`Nenhum item usa ${sem.map(i=>`a NF ${i+1} (${files[i].name})`).join(' nem ')}: ${sem.length>1?'esses arquivos ficam':'esse arquivo fica'} só como anexo e não ${sem.length>1?'são lançados':'é lançado'} no GRM.`:'';
    };
    box.querySelectorAll('select[data-nf-item]').forEach(s=>s.addEventListener('change',atualizarAviso));
    atualizarAviso();
  });
}
// Índices dos arquivos que nenhum item escolheu (viram só anexo).
function nfsSemItem(box,itens,files){
  const usados=new Set(itens.map(r=>Number(box.querySelector(`[data-nf-item="${CSS.escape(String(r.id))}"]`)?.value||0)));
  return files.map((_,i)=>i).filter(i=>!usados.has(i));
}
// Envia os arquivos e resolve a NF de cada item. Devolve { nf, anexos, nfPorItem } (nfPorItem só com 2+ arquivos e 2+ itens).
async function resolverArquivosNf(files,itens,box,fb){
  // Antes de enviar: arquivo que nenhum item escolheu só vira anexo (não é lançado no GRM) — exige confirmação.
  if(files.length>=2&&itens.length>=2&&box){
    const sem=nfsSemItem(box,itens,[...files]);
    if(sem.length&&!confirm(`Nenhum item usa ${sem.map(i=>`a NF ${i+1} (${files[i].name})`).join(' nem ')}.\n\nEla ficará só como anexo e NÃO será lançada no GRM. Continuar assim?`)) throw new Error('Escolha a NF de cada item para lançar todas as NFs no GRM.');
  }
  const up=await enviarArquivosNf(files,'compras/nf',fb);
  if(files.length<2||itens.length<2||!box) return {nf:up.principal,anexos:up.anexos,nfPorItem:null};
  const escolha=new Map(itens.map(r=>[r.id,Number(box.querySelector(`[data-nf-item="${CSS.escape(String(r.id))}"]`)?.value||0)]));
  const nfPorItem=new Map([...escolha].map(([id,i])=>[id,up.urls[i]]));
  const usados=new Set(escolha.values());
  const anexos=up.urls.map((url,i)=>({url,nome:files[i].name})).filter((a,i)=>!usados.has(i));
  return {nf:nfPorItem.get(itens[0].id),anexos,nfPorItem};
}
const anexosNfHtml=(anexos)=>anexos.length?`<p class="muted mt-8">Anexos: ${anexos.map((a,i)=>`<a href="${esc(a.url)}" target="_blank" rel="noopener" style="color:#86efac">${esc(a.nome||`Anexo ${i+2}`)}</a>`).join(' · ')}</p>`:'';
async function coletarDadosPagamento(forma,area){
  const texto=area.querySelector('#payData')?.value?.trim()||'';
  const arquivo=area.querySelector('#payFile')?.files?.[0]||null;
  if(forma==='BOLETO'&&arquivo) return await uploadArquivoNotasFiscais(arquivo,'compras/boletos');
  return texto;
}
function updatePagamentoFields(area,forma){
  const label=area.querySelector('#payLabel'); const input=area.querySelector('#payData'); const fileWrap=area.querySelector('#payFileWrap');
  const nfWrap=area.querySelector('#payNfWrap');
  const linkCols=area.querySelectorAll('.pay-link-th,.pay-link-td');
  if(forma==='LINK'){
    // Compra por link de produto: cada item tem o link do seu próprio
    // produto (site diferente, carrinho diferente) — Financeiro adiciona
    // cada um ao carrinho e paga. Some o campo único de "link de pagamento".
    if(label) label.style.display='none';
    if(fileWrap) fileWrap.style.display='none';
    if(nfWrap) nfWrap.style.display='none';
    linkCols.forEach(el=>el.style.display='');
    return;
  }
  linkCols.forEach(el=>el.style.display='none');
  if(!label||!input) return;
  label.style.display='';
  if(forma==='PIX'){label.firstChild.textContent='Chave PIX';input.placeholder='Informe a chave PIX';if(fileWrap)fileWrap.style.display='none';if(nfWrap)nfWrap.style.display='none';}
  else{
    // Boleto não é pago na hora (vence depois), então não passa pela fila
    // de aprovação do Financeiro: Compras já anexa NF+boleto aqui e o item
    // vai direto pra Comprado/Notas Fiscais pra lançamento no GRM.
    label.firstChild.textContent='Boleto / URL';input.placeholder='Cole o link do boleto ou anexe abaixo';if(fileWrap)fileWrap.style.display='block';if(nfWrap)nfWrap.style.display='block';
  }
}

// Lembrete do que o fornecedor informou na cotação (NF, prazo, pagamento, desconto) na hora de pagar.
function propostaResumoHtml(p){
  if(!p) return '';
  return `<p class="muted">Cotação de <b>${esc(p.razao_social)}</b> (${esc(formatarCnpj(p.cnpj))}) · ${esc(REGIMES_COTACAO[p.regime_tributario]||'')}${p.regime_tributario?' · ':''}NF: ${p.emite_nf?'sim':'<b>não emite</b>'} · Prazo: ${esc(p.prazo_entrega||'-')} · Frete: ${esc(descreverFrete(p))} · Pagamento: ${esc(p.formas_pagamento.join(', ')||'-')} · Desconto: ${esc(descreverDescontos(p))}</p>`;
}
function openPagamentoLote(rows, fornecedorPreSelecionado=false){
  const total=rows.reduce((s,r)=>s+Number(r._valor_total||0),0);
  if(total<=0){alert('Informe o valor unitário de pelo menos um item.');return;}
  const fornecedorInicial=rows[0]?._fornecedor||'';
  const hasCelular=rows.some(r=>norm(r.material)==='celular');
  const area=document.querySelector('#admCmpModal .adm-cmp-modal-card');
  area.innerHTML=`<div class="section-head"><div><h3>Pagamento da compra</h3><p class="muted">Total da compra: <b>${money(total)}</b></p>${propostaResumoHtml(rows[0]?._proposta)}</div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="adm-cmp-table-wrap mt-16">
      <table class="adm-cmp-table adm-cmp-buy-table">
        <thead><tr><th>Un.</th><th>Material</th>${rows.some(r=>r._ca||isEPI(r))?'<th>CA</th>':''}<th>Valor unitário</th><th>Total</th><th class="pay-link-th" style="display:none">Link do produto</th></tr></thead>
        <tbody>${rows.map(r=>`<tr><td>${esc(r._qtd_pagar??(r.quantidade||r.unidade||1))}</td><td>${esc(r.material)}${r.tamanho?`<br><small>${esc(r.tamanho)}</small>`:''}${r._do_proprio>0?`<br><small>${esc(r._do_proprio)} un saem do nosso estoque${r._qtd_pagar<=0?' (nada a pagar)':''}</small>`:''}${r._do_estoque>0?`<br><small>${esc(r._do_estoque)} un saem do estoque do fornecedor${r._qtd_pagar<=0?' (nada a pagar)':''}</small>`:''}</td>${rows.some(x=>x._ca||isEPI(x))?`<td>${esc(r._ca||r.ca||'-')}</td>`:''}<td>${money(r._valor_unitario)}</td><td>${money(r._valor_total)}</td><td class="pay-link-td" style="display:none"><input class="pay-link-input" data-id="${esc(r.id)}" placeholder="Link do produto"></td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label>Fornecedor<input id="payFornecedor" placeholder="Nome do fornecedor" value="${esc(fornecedorInicial)}"></label>
      <label>Valor total<input id="payValorTotal" readonly value="${money(total)}"></label>
      <label class="adm-cmp-full">Contato<input id="payContato" placeholder="Telefone, WhatsApp, e-mail ou observação de contato" value="${esc(rows[0]?._proposta&&descreverContato(rows[0]._proposta)!=='-'?descreverContato(rows[0]._proposta):'')}"></label>
      <label>Retirada ou entrega?<select id="payEntregaTipo"><option value="retirada">Retirada</option><option value="entrega">Entrega</option></select></label>
      <label class="adm-cmp-full" id="payEnderecoWrap" style="display:none">Endereço de entrega<input id="payEndereco" placeholder="Endereço completo pra entrega"></label>
    </div>
    <div class="adm-cmp-tabs mt-16">
      <button class="btn btn-secondary active" data-pay="BOLETO" type="button">BOLETO</button>
      <button class="btn btn-secondary" data-pay="PIX" type="button">PIX</button>
      <button class="btn btn-secondary" data-pay="LINK" type="button">LINK</button>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label id="payLabel">Boleto / URL<input id="payData" placeholder="Cole o link do boleto ou anexe abaixo"></label>
      <label id="payFileWrap">Arquivo do boleto<input id="payFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"></label>
      <label id="payNfWrap" class="adm-cmp-full" style="display:none">Nota Fiscal (NF)<input id="payNfFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xml"></label>
    </div>
    ${hasCelular?`<label style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer;color:#e2e2f0"><input type="checkbox" id="payPatrimonio" style="width:16px;height:16px;cursor:pointer"> <span>Celular como patrimônio (sem termo de desconto em folha)</span></label>`:''}
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="paySend" type="button">Enviar ao Financeiro</button><button class="btn btn-secondary" id="payBack" type="button">Voltar</button></div>`;
  let forma='BOLETO';
  area.querySelector('#mClose').onclick=()=>document.getElementById('admCmpModal').classList.remove('open');
  area.querySelector('#payBack').onclick=()=>{
    // Volta para a revisão (valores e estoque do fornecedor) quando ela foi exibida; senão, para a escolha de fornecedor.
    if(rows.some(r=>r._estoque_forn_id||r._do_proprio>0)||!fornecedorPreSelecionado) openCompraLote(rows.map(r=>({...r})),fornecedorPreSelecionado);
    else abrirCompraSelecionados();
  };
  area.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{forma=b.dataset.pay; area.querySelectorAll('[data-pay]').forEach(x=>x.classList.toggle('active',x===b)); updatePagamentoFields(area,forma);});
  updatePagamentoFields(area,forma);
  area.querySelector('#payEntregaTipo').onchange=(ev)=>{
    const wrap=area.querySelector('#payEnderecoWrap');
    if(wrap) wrap.style.display=ev.target.value==='entrega'?'':'none';
  };
  area.querySelector('#paySend').onclick=async()=>{
    try{
      const fornecedor=area.querySelector('#payFornecedor')?.value?.trim()||'';
      const contato=area.querySelector('#payContato')?.value?.trim()||'';
      const isPatrimonio=hasCelular&&!!area.querySelector('#payPatrimonio')?.checked;
      const entregaTipo=area.querySelector('#payEntregaTipo')?.value||'retirada';
      const entregaEndereco=area.querySelector('#payEndereco')?.value?.trim()||'';
      if(entregaTipo==='entrega'&&!entregaEndereco){ alert('Informe o endereço de entrega.'); return; }
      if(forma==='LINK'){
        // Compra por link de produto: um link por item (Financeiro adiciona
        // cada um ao carrinho do site e paga), não um link único do grupo.
        const dadosPorItem={};
        for(const r of rows){
          if(r._qtd_pagar<=0) continue;
          const link=area.querySelector(`.pay-link-input[data-id="${CSS.escape(String(r.id))}"]`)?.value?.trim()||'';
          if(!link){ alert(`Informe o link do produto de "${r.material}".`); return; }
          dadosPorItem[r.id]=link;
        }
        await enviarFinanceiroLote(rows,total,forma,null,fornecedor,contato,isPatrimonio,dadosPorItem,entregaTipo,entregaEndereco);
      }else{
        const dados=await coletarDadosPagamento(forma,area);
        let nfUrl=null;
        if(forma==='BOLETO'){
          if(!dados){ alert('Anexe o boleto (arquivo) ou cole o link do boleto.'); return; }
          const nfArquivo=area.querySelector('#payNfFile')?.files?.[0]||null;
          if(!nfArquivo){ alert('Boleto exige anexar a Nota Fiscal (NF) junto — o item vai direto pra Notas Fiscais.'); return; }
          nfUrl=await uploadArquivoNotasFiscais(nfArquivo,'compras/notas-fiscais');
        }
        await enviarFinanceiroLote(rows,total,forma,dados,fornecedor,contato,isPatrimonio,null,entregaTipo,entregaEndereco,nfUrl);
      }
    }catch(e){setMsg(e.message,true);alert(e.message);}
  };
}

async function enviarFinanceiroLote(itens,total,forma,dados,fornecedor='',contato='',celularAsPatrimonio=false,dadosPorItem=null,entregaTipo=null,entregaEndereco=null,nfUrl=null){
  // Primeiro a baixa no estoque do fornecedor: itens ficam só com o que será pago.
  itens=await aplicarEstoques(itens);
  if(!itens.length){
    document.getElementById('admCmpModal').classList.remove('open');
    setMsg('Baixa feita no estoque. Nada a pagar.');
    await loadRows();
    return;
  }
  const boletoDireto=forma==='BOLETO'&&!!nfUrl;
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
    // Compra por link de produto: um link por item — junta tudo num texto
    // só (material: link) pro Financeiro ver de uma vez o que precisa
    // colocar no carrinho de cada site.
    const dadosConsolidado=dadosPorItem?normalItens.map(r=>`${r.material}: ${dadosPorItem[r.id]||''}`).join('\n'):dados;
    // financeiro_pagamentos.forma_pagamento só aceita PIX/BOLETO/TRANSFERENCIA/
    // CARTAO/OUTRO (constraint própria, diferente do texto livre usado em
    // compras_itens.forma_pagamento) — LINK cai em OUTRO só nesse insert.
    const formaFinPagamento=['PIX','BOLETO'].includes(forma)?forma:'OUTRO';
    const entregaLinha=entregaTipo==='entrega'?`Entrega: ${entregaEndereco}`:(entregaTipo?'Retirada':'');
    // Boleto não é pago na hora (vence depois) — não trava esperando o
    // Financeiro aprovar. Compras já anexou NF+boleto, então o item vira
    // "comprado" na hora e cai direto em Notas Fiscais pra lançar no GRM;
    // o registro em financeiro_pagamentos só fica de aviso pro Financeiro
    // pagar o boleto no vencimento.
    const nfLinha=boletoDireto?`NF já anexada — lançada em Notas Fiscais. Pagar boleto no vencimento.`:'';
    const payload={origem:'COMPRAS',origem_setor:'COMPRAS',origem_id:normalItens[0]?.id||null,compras_item_ids:normalItens.map(r=>r.id),descricao,favorecido:fornecedor||'Fornecedor a definir',fornecedor:fornecedor||null,contato:contato||null,valor:normalTotal,forma_pagamento:formaFinPagamento,dados_pagamento:[dadosConsolidado,entregaLinha,nfLinha].filter(Boolean).join('\n')||null,status:'PENDENTE',vencimento:null,created_at:new Date().toISOString()};
    const pagGravado=await safe(()=>mergeOrInsertComprasPayment(payload),null);
    const codigoPagamento=pagGravado?.[0]?.codigo||null;
    for(const r of normalItens){
      const dadosItem=dadosPorItem?(dadosPorItem[r.id]||null):dados;
      const upd=boletoDireto
        ?{status:'comprado',nf_url:nfUrl,comprovante_url:dadosItem||null,comprado_em:new Date().toISOString(),valor_unitario:r._valor_unitario,valor_total:r._valor_total,forma_pagamento:forma,dados_pagamento:dadosItem||null}
        :{status:'pendente_pagamento',valor_unitario:r._valor_unitario,valor_total:r._valor_total,forma_pagamento:forma,dados_pagamento:dadosItem||null};
      if(codigoPagamento) upd.codigo_pagamento=codigoPagamento;
      if(entregaTipo){ upd.entrega_tipo=entregaTipo; upd.entrega_endereco=entregaTipo==='entrega'?entregaEndereco:null; }
      if(r._ca||r.ca) upd.ca=r._ca||r.ca;
      if(fornecedor) upd.fornecedor=fornecedor;
      if(r.marca&&norm(r.tipo).includes('patrimonio')) upd.marca=r.marca;
      // Boleto pula finalizarCompra/finalizarCompraGrupo (que geram o código
      // da compra e a linha de cadastro de patrimônio) — replica aqui pra não
      // perder o número da compra nem o card de "aguardando número" no
      // Gestor > Patrimônios.
      if(boletoDireto){
        const codigo=r.codigo||await safe(()=>supabase.rpc('gerar_codigo_compra',{p_tipo:r.tipo||'Outros'}),null);
        if(codigo) upd.codigo=codigo;
      }
      const {error:updErr}=await supabase.from('compras_itens').update(upd).eq('id',r.id);
      if(updErr){
        if(updErr.message?.includes("'ca'")||updErr.message?.includes("'fornecedor'")||updErr.code==='PGRST204'){delete upd.ca; delete upd.fornecedor; delete upd.entrega_tipo; delete upd.entrega_endereco; const {error:r2}=await supabase.from('compras_itens').update(upd).eq('id',r.id); if(r2) throw new Error(`Erro ao atualizar item ${r.material}: ${r2.message}`);}
        else throw new Error(`Erro ao atualizar item ${r.material}: ${updErr.message}`);
      }
      if(boletoDireto&&norm(r.tipo).includes('patrimonio')){
        await criarLinhasPatrimonio(r);
      }
    }
    const episComColab=normalItens.filter(r=>isEPI(r)&&(r.colaborador_id||r.colaborador_nome));
    if(episComColab.length){
      const rhPayload=episComColab.map(r=>({data_entrega:new Date().toISOString().slice(0,10),colaborador_id:r.colaborador_id||null,colaborador_nome:r.colaborador_nome||null,epi:r.material,ca:r._ca||r.ca||null,quantidade:Number(r.quantidade||r.unidade||1),compra_item_id:r.id,status:'aguardando_pagamento',created_at:new Date().toISOString()}));
      await safe(()=>supabase.from('rh_epi_registros').insert(rhPayload),null);
    }
    await notifyByConfig('FINANCEIRO',boletoDireto
      ?`Boleto de compras a pagar no vencimento\nFornecedor: ${fornecedor||'Não informado'}\nContato: ${contato||'Não informado'}\nItens: ${normalItens.length}\nValor total: ${money(normalTotal)}\nNF já anexada — item já está em Notas Fiscais.`
      :`Pagamento de compras pendente\nFornecedor: ${fornecedor||'Não informado'}\nContato: ${contato||'Não informado'}\nItens: ${normalItens.length}\nValor total: ${money(normalTotal)}\nForma: ${forma}`);
  }

  // Celular items → Termos (aguardando_termo)
  for(const r of celularItens){
    const upd={status:'aguardando_termo',valor_unitario:r._valor_unitario,valor_total:r._valor_total,forma_pagamento:forma,dados_pagamento:dados||null};
    if(entregaTipo){ upd.entrega_tipo=entregaTipo; upd.entrega_endereco=entregaTipo==='entrega'?entregaEndereco:null; }
    if(fornecedor) upd.fornecedor=fornecedor;
    const {error:updErr}=await supabase.from('compras_itens').update(upd).eq('id',r.id);
    if(updErr&&(updErr.message?.includes("'fornecedor'")||updErr.code==='PGRST204')){delete upd.fornecedor; delete upd.entrega_tipo; delete upd.entrega_endereco; await supabase.from('compras_itens').update(upd).eq('id',r.id);}
    await safe(()=>supabase.from('termos_celular').update({valor:r._valor_total}).eq('compra_item_id',r.id));
  }

  document.getElementById('admCmpModal').classList.remove('open');
  if(celularItens.length&&normalItens.length) setMsg(`${normalItens.length} item(ns) ${boletoDireto?'em Notas Fiscais':'ao Financeiro'}. ${celularItens.length} celular(es) aguardando termo.`);
  else if(celularItens.length) setMsg(`${celularItens.length} celular(es) encaminhado(s) para assinatura de termo.`);
  else if(boletoDireto) setMsg('Compra registrada em Notas Fiscais. Boleto a pagar no vencimento.');
  else setMsg('Compra enviada ao Financeiro e movida para PENDENTES.');
  await loadRows();
}

async function finalizarCompra(r,{nf,marca,ca,anexos}){
  const codigo=r.codigo||await safe(()=>supabase.rpc('gerar_codigo_compra',{p_tipo:r.tipo||'Outros'}),null);
  const updPayload={status:'comprado',nf_url:nf,marca,comprado_em:new Date().toISOString()};
  if(anexos!==undefined) updPayload.nf_anexos=anexos;
  if(codigo) updPayload.codigo=codigo;
  if(isEPI(r)&&ca) updPayload.ca=ca;
  await supabase.from('compras_itens').update(updPayload).eq('id',r.id);
  if(isEPI(r)){const {data:epiReg}=await supabase.from('rh_epi_registros').select('id').eq('compra_item_id',r.id).maybeSingle(); if(epiReg) await safe(()=>supabase.from('rh_epi_registros').update({ca:ca||null}).eq('compra_item_id',r.id)); else if(r.colaborador_id||r.colaborador_nome) await safe(()=>supabase.from('rh_epi_registros').insert([{data_entrega:new Date().toISOString().slice(0,10),colaborador_id:r.colaborador_id||null,colaborador_nome:r.colaborador_nome||null,epi:r.material,ca:ca||null,quantidade:Number(r.quantidade||r.unidade||1),compra_item_id:r.id,status:'aguardando_pagamento',created_at:new Date().toISOString()}]),null);}
  if(norm(r.tipo).includes('patrimonio')) await criarLinhasPatrimonio(r,marca); await notifyByConfig('GESTOR',`Compra concluída\nMaterial: ${r.material}\nNF: ${nf}`);
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
    ${allAguardando&&new Set(itens.map(r=>r.nf_url).filter(Boolean)).size>1?`<p class="muted mt-16">Este grupo tem ${new Set(itens.map(r=>r.nf_url).filter(Boolean)).size} NFs diferentes: cada item mantém a sua e cada NF é lançada separadamente no GRM (pagamento agrupado no mesmo comprovante).</p>`:''}
    ${allAguardando?`<div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">URL ou número da NF<input id="mNfGrp" placeholder="Cole o link da NF ou informe o número" value="${esc(itens.find(r=>r.nf_url)?.nf_url||'')}"></label>
      <label class="adm-cmp-full">Ou anexar arquivo(s) da NF<input id="mNfGrpFile" type="file" multiple accept="${ACEITA_NF}"><small class="muted">Pode escolher vários arquivos de uma vez. Com mais de uma NF, você escolhe qual vale para cada item. Escolher arquivos substitui os atuais.</small></label>
      <div class="adm-cmp-full" id="mNfGrpAtrib" style="display:none"></div>
    </div>
    ${anexosNfHtml(anexosNf(itens.find(r=>r.nf_url)||{}))}
    <div class="adm-cmp-actions mt-16">
      <button class="btn btn-primary" id="mFinalizarGrp" type="button">Finalizar grupo (${itens.length} itens)</button>
    </div>`:`<p class="muted mt-16">Aguardando pagamento — o financeiro precisa anexar o comprovante antes da NF.</p>`}
    <span class="adm-cmp-feedback mt-8" id="grpFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  ligarAtribuicaoNf(modal,itens,'#mNfGrpFile','#mNfGrpAtrib');
  const btn=modal.querySelector('#mFinalizarGrp');
  if(btn) btn.onclick=async()=>{
    const fb=modal.querySelector('#grpFeedback');
    btn.disabled=true; btn.textContent='Finalizando...'; if(fb)fb.textContent='';
    try{
      const files=modal.querySelector('#mNfGrpFile')?.files||[];
      let nf=modal.querySelector('#mNfGrp')?.value?.trim()||'';
      let anexos,nfPorItem=null;
      if(files.length){const up=await resolverArquivosNf(files,itens,modal.querySelector('#mNfGrpAtrib'),fb); nf=up.nf; anexos=up.anexos; nfPorItem=up.nfPorItem;}
      if(!nf){alert('Informe a NF ou anexe um arquivo.');btn.disabled=false;btn.textContent=`Finalizar grupo (${itens.length} itens)`;return;}
      // Itens que já têm NFs diferentes (atribuídas ao anexar): sem arquivo novo e com o campo intacto, cada item mantém a sua.
      if(!files.length&&!nfPorItem){
        const proprios=new Map(itens.filter(r=>r.nf_url).map(r=>[r.id,r.nf_url]));
        if(proprios.size===itens.length&&new Set(proprios.values()).size>1&&nf===(itens.find(r=>r.nf_url)?.nf_url||'')) nfPorItem=proprios;
      }
      await finalizarCompraGrupo(itens,nf,anexos,nfPorItem);
    }catch(e){if(fb)fb.textContent=e.message; btn.disabled=false; btn.textContent=`Finalizar grupo (${itens.length} itens)`;}
  };
}

async function finalizarCompraGrupo(itens,nf,anexos,nfPorItem=null){
  for(const r of itens){
    const ca=r.ca||null;
    const codigo=r.codigo||await safe(()=>supabase.rpc('gerar_codigo_compra',{p_tipo:r.tipo||'Outros'}),null);
    // Com mais de uma NF, cada item leva a sua; o comprovante de pagamento segue o mesmo para todos.
    const updPayload={status:'comprado',nf_url:(nfPorItem&&nfPorItem.get(r.id))||nf,comprado_em:new Date().toISOString()};
    if(anexos!==undefined) updPayload.nf_anexos=anexos;
    if(codigo) updPayload.codigo=codigo;
    if(isEPI(r)&&ca) updPayload.ca=ca;
    await supabase.from('compras_itens').update(updPayload).eq('id',r.id);
    if(isEPI(r)){const {data:epiReg}=await supabase.from('rh_epi_registros').select('id').eq('compra_item_id',r.id).maybeSingle(); if(epiReg) await safe(()=>supabase.from('rh_epi_registros').update({ca:ca||null}).eq('compra_item_id',r.id)); else if(r.colaborador_id||r.colaborador_nome) await safe(()=>supabase.from('rh_epi_registros').insert([{data_entrega:new Date().toISOString().slice(0,10),colaborador_id:r.colaborador_id||null,colaborador_nome:r.colaborador_nome||null,epi:r.material,ca:ca||null,quantidade:Number(r.quantidade||r.unidade||1),compra_item_id:r.id,status:'aguardando_pagamento',created_at:new Date().toISOString()}]),null);}
    if(norm(r.tipo).includes('patrimonio')) await criarLinhasPatrimonio(r);
  }
  try{const engine=window.__painelNotifEngine; for(const r of itens){const s=r.compras_solicitacoes||{}; const did=s.solicitante_id||s.created_by||null; if(engine&&did) await engine.criarNotificacao({tipo:'compra_realizada',titulo:`Compra realizada: ${r.material}`,descricao:`Solicitação de ${s.solicitante||'Gestor'} concluída. NF disponível.`,destinatario_usuario_id:did,referencia_tabela:'compras_itens',referencia_id:String(r.id),chave_dedup:`compra_realizada:${r.id}`});}}catch(_){}
  await notifyByConfig('GESTOR',`Compras concluídas\n${itens.length} itens finalizados\nNF: ${nf}\nTotal: ${money(itens.reduce((s,r)=>s+Number(r.valor_total||0),0))}`);
  document.getElementById('admCmpModal').classList.remove('open');
  setMsg(`${itens.length} item(ns) finalizado(s).`);
  await loadRows();
}

function styles(){return `<style>
.adm-cmp-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px}.adm-cmp-kpi{min-height:0;padding:14px 16px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:4px 16px}.adm-cmp-kpi h3{margin:0;font-size:13px;font-weight:700;color:var(--muted)}.adm-cmp-kpi .metric{grid-column:2;grid-row:1/3;margin:0;font-size:26px;line-height:1;font-weight:800;white-space:nowrap}.adm-cmp-kpi .muted{margin:0;font-size:12px;line-height:1.3}
.adm-cmp-actions{display:flex;gap:10px;flex-wrap:wrap}.adm-cmp-actions-footer{align-items:center}.adm-cmp-page .fm-topo{margin:14px 0 12px}.adm-cmp-page .fm-btn svg{width:16px;height:16px;flex:none}.adm-cmp-cat-form{display:flex;align-items:flex-end;gap:10px;flex-wrap:nowrap}.adm-cmp-cat-form label{display:flex;flex-direction:column;gap:6px;flex:1 1 140px;min-width:0;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.adm-cmp-cat-form label.grow2{flex:2 1 220px}.adm-cmp-cat-form input,.adm-cmp-cat-form select{width:100%;box-sizing:border-box;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;font:inherit;font-weight:400;text-transform:none;letter-spacing:0;color-scheme:dark}.adm-cmp-cat-form .fm-btn{flex:none}@media(max-width:1100px){.adm-cmp-cat-form{flex-wrap:wrap}}.adm-cmp-modal-card .section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.adm-cmp-modal-card .section-head h3{margin:0;font-size:20px;color:#fff}.adm-cmp-list{transition:opacity .15s ease}.adm-cmp-list.is-loading{opacity:.35;pointer-events:none}.adm-cmp-page .fm-table td{vertical-align:top}.fm-table tbody tr.is-selected td{background:rgba(34,197,94,.16)!important}.fm-table tbody tr.is-selected>td:first-child{border-left:3px solid #4ade80}.fm-table tbody tr.adm-cmp-group-row td{background:rgba(34,197,94,.05)}.adm-cmp-card{border-radius:18px;border-color:rgba(148,163,184,.16);background:linear-gradient(180deg,rgba(15,23,42,.7),rgba(2,6,23,.7))}.adm-cmp-modal{background:rgba(2,6,23,.8)}.adm-cmp-modal-card{border:1px solid rgba(148,163,184,.20);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.55);padding:22px}.adm-cmp-grid input,.adm-cmp-grid select{border-radius:14px;border-color:rgba(148,163,184,.18)}.adm-cmp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;transition:opacity .15s ease}.adm-cmp-table-wrap.is-loading{opacity:.35;pointer-events:none}.adm-cmp-table{width:100%;border-collapse:collapse;min-width:1060px}.adm-cmp-table th,.adm-cmp-table td{padding:12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.adm-cmp-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.adm-cmp-status{display:inline-flex;padding:6px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.25);font-size:12px;font-weight:800}.adm-cmp-status.pendente,.adm-cmp-status.em_cotacao,.adm-cmp-status.em_analise,.adm-cmp-status.pendente_pagamento,.adm-cmp-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1)}.adm-cmp-status.aguardando_termo{color:#c4b5fd;background:rgba(139,92,246,.12)}.adm-cmp-status.comprado{color:#bbf7d0;background:rgba(22,101,52,.2)}.adm-cmp-status.recusado,.adm-cmp-status.recusado_financeiro{color:#fecaca;background:rgba(220,38,38,.12)}.adm-cmp-status.enviado_estoque{color:#c4b5fd;background:rgba(168,85,247,.12)}.adm-cmp-empty{text-align:center;color:var(--muted);padding:20px!important}.adm-cmp-feedback{font-weight:800}.adm-cmp-feedback.err{color:#fecaca}.adm-cmp-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.adm-cmp-modal.open{display:flex}.adm-cmp-modal-card{width:min(900px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,0.06);border-radius:22px;padding:20px;color:#e2e2f0}.adm-cmp-modal-wide{width:min(1260px,100%)}.adm-cmp-buy-table input{width:160px;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-total-box{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid var(--line);border-radius:16px;padding:14px 16px;background:rgba(15,23,42,.55)}.adm-cmp-total-box strong{font-size:22px}.adm-cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-cmp-grid input,.adm-cmp-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-grid input[type=file]{padding:9px 12px;cursor:pointer}.adm-cmp-full{grid-column:1/-1}.adm-cmp-grid.adm-cmp-grid-ns1{grid-template-columns:minmax(0,2.2fr) minmax(0,1.6fr) 84px minmax(0,1.8fr);align-items:end}.adm-cmp-grid.adm-cmp-grid-ns2{grid-template-columns:78px minmax(0,2fr) minmax(0,2fr) auto;align-items:end}.adm-cmp-grid-ns1 label,.adm-cmp-grid-ns2 label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted)}.adm-cmp-grid-ns1 input,.adm-cmp-grid-ns1 select,.adm-cmp-grid-ns2 input{padding:8px 10px;height:38px}.adm-cmp-grid-ns2 .btn{height:38px;white-space:nowrap}@media(max-width:760px){.adm-cmp-grid.adm-cmp-grid-ns1,.adm-cmp-grid.adm-cmp-grid-ns2{grid-template-columns:1fr 1fr}}
.adm-cmp-cards{display:flex;flex-direction:column;gap:14px}.adm-cmp-card{border:1px solid var(--line);border-radius:16px;background:rgba(15,23,42,.4);overflow:hidden}.adm-cmp-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;background:rgba(15,23,42,.65);border-bottom:1px solid var(--line);flex-wrap:wrap}.adm-cmp-card-select{display:flex;align-items:center;gap:12px;cursor:pointer}.adm-cmp-card-select input{width:18px;height:18px;cursor:pointer;flex-shrink:0}.adm-cmp-card-select strong{display:block;font-size:14px}.adm-cmp-card-select small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.adm-cmp-card-meta{display:flex;align-items:center;gap:14px;font-size:13px;color:var(--muted);white-space:nowrap;flex-wrap:wrap}.adm-cmp-card-meta strong{color:#bbf7d0;font-size:16px}.adm-cmp-card-body{display:flex;flex-direction:column}.adm-cmp-card-row{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid rgba(148,163,184,.08);flex-wrap:wrap}.adm-cmp-card-body .adm-cmp-card-row:first-child{border-top:0}.adm-cmp-card-row input[type=checkbox]{width:17px;height:17px;cursor:pointer;flex-shrink:0}.adm-cmp-card-row-info{flex:1 1 220px;min-width:0}.adm-cmp-card-row-info strong{display:block;font-size:13.5px}.adm-cmp-card-row-info small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.adm-cmp-card-row-value{font-weight:700;font-size:13px;white-space:nowrap;margin-left:auto}.adm-cmp-card-row-actions,.adm-cmp-row-actions{display:flex;gap:6px;flex-shrink:0}.adm-cmp-icon-btn{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.7);color:#eef7f2;cursor:pointer;flex-shrink:0}.adm-cmp-icon-btn:hover{background:rgba(34,197,94,.14)}.adm-cmp-icon-btn svg{width:16px;height:16px}.adm-cmp-icon-btn[data-row-action="comprar"],.adm-cmp-icon-btn[data-row-action="aprovar"],.adm-cmp-icon-btn[data-row-action="cotar"]{background:rgba(16,185,129,.14);border-color:rgba(52,211,153,.25);color:#68f0ac}.adm-cmp-icon-btn[data-row-action="recusar"],.adm-cmp-icon-btn[data-row-action="reprovar"],.adm-cmp-icon-btn[data-row-action="cancelar"]{background:rgba(239,68,68,.09);border-color:rgba(248,113,113,.2);color:#ff7272}.adm-cmp-icon-btn[data-row-action="aprovar_solicitar"],.adm-cmp-icon-btn[data-row-action="finalizar"],.adm-cmp-icon-btn[data-row-action="finalizar_grupo"]{background:rgba(59,130,246,.1);border-color:rgba(96,165,250,.22);color:#93c5fd}.adm-cmp-icon-btn[data-row-action="enviar_estoque"]{background:rgba(168,85,247,.1);border-color:rgba(196,141,250,.24);color:#c4b5fd}#admCmpListWrap{user-select:none}
@media(max-width:760px){.adm-cmp-card-row-value{margin-left:44px}}
.adm-cot-forn-row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}.adm-cot-forn-cell{display:flex;flex-direction:column;gap:4px}.adm-cot-forn-cell label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}.adm-cot-forn-cell input{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:9px 12px;min-width:180px}.adm-cot-table input{width:120px;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px 10px;color-scheme:dark}.adm-cot-melhor{font-weight:700;color:#bbf7d0}.adm-cot-forn-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.adm-cot-forn-opt{border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:12px;text-align:center}.adm-cot-forn-total{font-size:22px;font-weight:800;color:#bbf7d0}
.cot-colab-wrap{position:relative}.cot-colab-sug{position:absolute;top:100%;left:0;right:0;z-index:60;background:#071b13;border:1px solid var(--line);border-radius:12px;padding:4px;max-height:200px;overflow:auto;box-shadow:0 12px 30px rgba(0,0,0,.38)}.cot-colab-sug:empty{display:none}.cot-colab-sug button{display:block;width:100%;text-align:left;border:none;background:transparent;color:#e2e2f0;padding:8px 10px;border-radius:8px;cursor:pointer}.cot-colab-sug button:hover{background:rgba(255,255,255,.06)}.cot-colab-input{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px 10px;width:160px;box-sizing:border-box;color-scheme:dark}
.adm-cmp-group-row{background:rgba(34,197,94,.04)}.adm-cmp-group-row>td:first-child{border-left:3px solid rgba(34,197,94,.5)}
.adm-cmp-table tbody tr.is-selected{background:rgba(34,197,94,.16)!important}.adm-cmp-table tbody tr.is-selected>td:first-child{border-left:3px solid #4ade80}
.adm-cmp-sel-count{display:inline-flex;align-items:center;font-weight:800;color:#86efac;font-size:13px}
@media(max-width:760px){.adm-cmp-kpis{grid-template-columns:1fr}.adm-cmp-kpi{padding:12px 14px}.adm-cmp-grid{grid-template-columns:1fr}.adm-cmp-table{min-width:920px}}

.adm-cot-badge{display:inline-flex;align-items:center;margin-right:10px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(148,163,184,.16);color:#cbd5e1;white-space:nowrap}.adm-cot-badge.enviado{background:rgba(59,130,246,.18);color:#93c5fd}.adm-cot-badge.respostas{background:rgba(34,197,94,.2);color:#86efac}.adm-cot-badge.encerrado{background:rgba(248,113,113,.16);color:#fca5a5}
.adm-cot-links{display:flex;flex-direction:column;gap:8px;margin-top:8px}.adm-cot-link{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:8px 12px;border:1px solid var(--line);border-radius:12px}
.adm-cot-comp th,.adm-cot-comp td{vertical-align:top}.adm-cot-comp td.melhor{background:rgba(34,197,94,.14)}.adm-cot-total td{border-top:2px solid var(--line)}
</style>`}

function updateActionButtons(){
  const tab=state.tab;
  const isCotacoes=tab==='cotacoes';
  const btnCotar=document.getElementById('btnCotar');
  const btnComprar=document.getElementById('btnComprar');
  const btnAprovar=document.getElementById('btnAprovar');
  const btnAprovarLote=document.getElementById('btnAprovarLote');
  const btnEnviarEstoque=document.getElementById('btnEnviarEstoque');
  const btnRecusar=document.getElementById('btnRecusar');
  if(btnCotar) btnCotar.style.display=isCotacoes?'inline-flex':'none';
  if(btnComprar) btnComprar.style.display=isCotacoes?'inline-flex':'none';
  if(btnAprovar) btnAprovar.style.display=isCotacoes?'inline-flex':'none';
  if(btnAprovarLote) btnAprovarLote.style.display=tab==='analise'?'inline-flex':'none';
  if(btnEnviarEstoque) btnEnviarEstoque.style.display=isCotacoes?'inline-flex':'none';
  if(btnRecusar) btnRecusar.style.display=(isCotacoes||tab==='analise')?'inline-flex':'none';
  setMsg('');
}

initProtectedPage('Compras ADM', async (content,ctx)=>{
  state.ctx=ctx;
  await loadColaboradores();
  content.innerHTML=`${styles()}<section class="card mt-16 adm-cmp-page" id="admCmpPage"><div class="frotas-hub-tabs">${tabs({itens:TABS.map(([id,label])=>({id,label})),ativo:'cotacoes',attr:'data-tab'})}</div><div class="frotas-hub-tab-body fm-shell"><div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" id="admCmpRefresh" type="button">↻ Atualizar</button><button class="fm-btn primary" id="admCmpNova" type="button" title="Nova solicitação de compra">${ICONS.plus} Nova solicitação</button></div></div><div id="admCmpItensSection"><div class="fm-kpis" id="admCmpKpis"></div><div class="fm-card"><div class="fm-body"><div class="fm-bar"><div class="fm-search">${FM_ICON.busca}<input class="fm-input" id="admCmpBusca" placeholder="Buscar por material, solicitante, coordenação, fornecedor ou código..." autocomplete="off"></div><span data-chip></span><span class="fm-count" id="admCmpCount">0 item(ns)</span></div><div class="adm-cmp-list" id="admCmpListWrap"></div><div class="adm-cmp-actions adm-cmp-actions-footer mt-16"><span class="adm-cmp-sel-count" id="admCmpSelCount"></span><button class="adm-cmp-icon-btn" id="btnCotar" type="button" data-row-action="cotar" title="Cotar selecionados" aria-label="Cotar selecionados">${ICONS.tag}</button><button class="adm-cmp-icon-btn" id="btnComprar" type="button" data-row-action="comprar" title="Comprar selecionados" aria-label="Comprar selecionados" style="display:none">${ICONS.check}</button><button class="adm-cmp-icon-btn" id="btnAprovar" type="button" data-row-action="aprovar_solicitar" title="Solicitar aprovação dos selecionados" aria-label="Solicitar aprovação dos selecionados">${ICONS.send}</button><button class="adm-cmp-icon-btn" id="btnAprovarLote" type="button" data-row-action="aprovar" title="Aprovar selecionados" aria-label="Aprovar selecionados" style="display:none">${ICONS.check}</button><button class="adm-cmp-icon-btn" id="btnEnviarEstoque" type="button" data-row-action="enviar_estoque" title="Enviar via Estoque os selecionados" aria-label="Enviar via Estoque os selecionados">${ICONS.box}</button><button class="adm-cmp-icon-btn" id="btnRecusar" type="button" data-row-action="recusar" title="Recusar selecionados" aria-label="Recusar selecionados">${ICONS.x}</button><span class="adm-cmp-feedback" id="admCmpFeedback"></span></div></div></div></div><div id="admCmpCatalogoSection" style="display:none"><div class="fm-card"><div class="fm-body"><div class="adm-cmp-cat-form"><label class="grow2">Material<input id="catNovoMaterial" placeholder="Nome do material"></label><label>Tipo<select id="catNovoTipo"><option value="Uniforme">Uniforme</option><option value="Patrimonio">Patrimônio</option><option value="EPI">EPI</option><option value="Outros" selected>Outros</option></select></label><label title="Para lançar em Caixa se não devolvido">Valor estimado (R$)<input id="catNovoValor" inputmode="decimal" placeholder="Opcional"></label><label class="grow2">Observação<input id="catNovaObs" placeholder="Opcional"></label><button class="fm-btn primary" id="catAdicionar" type="button">+ Adicionar</button></div><div class="adm-cmp-actions mt-8"><span class="adm-cmp-feedback" id="admCmpCatalogoFeedback"></span></div><div class="fm-table-wrap mt-16"><table class="fm-table"><thead><tr><th>Material</th><th>Tipo</th><th>Valor estimado (Caixa)</th><th>Observação</th><th>Status</th><th>Ações</th></tr></thead><tbody id="admCmpCatalogoBody"></tbody></table></div></div></div></div></div></section><div class="adm-cmp-modal" id="admCmpModal"></div>`;
  injectEstilosFrotas();
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab; state.filtro='todos'; document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b)); updateActionButtons(); loadRows();});
  document.getElementById('admCmpRefresh').onclick=loadRows;
  document.getElementById('admCmpBusca').addEventListener('input',(e)=>{state.busca=e.target.value; onFiltroChange();});
  aoClicarCard(document.getElementById('admCmpPage'),(card,limpar)=>{
    state.filtro=limpar||!card||state.filtro===card.dataset.filtro?'todos':card.dataset.filtro;
    onFiltroChange();
  });
  document.getElementById('admCmpNova').onclick=()=>abrirNovaSolicitacaoModal().catch(e=>setMsg(e.message,true));
  document.getElementById('btnCotar').onclick=()=>abrirCotarModal(selectedRows());
  document.getElementById('btnComprar').onclick=()=>abrirCompraSelecionados();
  document.getElementById('btnAprovar').onclick=()=>solicitarAprovacao().catch(e=>setMsg(e.message,true));
  document.getElementById('btnAprovarLote').onclick=()=>aprovarSelecionados();
  document.getElementById('btnEnviarEstoque').onclick=()=>enviarEstoqueSelecionados().catch(e=>setMsg(e.message,true));
  document.getElementById('btnRecusar').onclick=()=>recusarSelecionados().catch(e=>setMsg(e.message,true));
  document.getElementById('catAdicionar').onclick=()=>adicionarCatalogoItem().catch(e=>setCatalogoMsg(e.message,true));
  wireDragSelect(document.getElementById('admCmpListWrap'));
  updateActionButtons();
  await loadRows();
});

