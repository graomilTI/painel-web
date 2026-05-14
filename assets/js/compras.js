import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const CATALOGO = [
  ['ALICATE DE CORTE','Outros'],['BALANÇA DE PRECISÃO','Patrimonio'],['CAIXA DE BOBINAS','Outros'],['CAIXA DE SULFITE A4','Outros'],['CALADOR','Patrimonio'],['CELULAR','Patrimonio'],['ESTILETE','Outros'],['HOMOGENEIZADOR','Patrimonio'],['IMPRESSORA A4','Patrimonio'],['IMPRESSORA TÉRMICA BLUETOOTH','Patrimonio'],['JOGO DE PENEIRAS','Patrimonio'],['LIQUIDIFICADOR','Patrimonio'],['LUMINÁRIA','Patrimonio'],['MICROPIPETA','Patrimonio'],['PENEIRA INDIVIDUAL','Patrimonio'],['QUARTEADOR','Patrimonio'],['CAPACETE','EPI'],['COLETE REFLETIVO','EPI'],['LUVA MULTITATO','EPI'],['PROTETOR AURICULAR','EPI'],['MASCARA PFF2','EPI'],['OCULOS DE PROTEÇÃO','EPI'],['BOTINA','EPI']
].map(([material,tipo])=>({material,tipo}));
const UNIFORME_TAMANHOS = ['PP','P','M','G','GG','XG','EXG'];
const STATUS = { pendente:'Pendente', em_cotacao:'Em cotação', em_analise:'Em análise', pendente_pagamento:'Pendente pagamento', aguardando_nf:'Aguardando NF', comprado:'Comprado', recusado:'Recusado' };
const state = { mode:'itens', rows:[], itens:[], colaboradores:[], uniformes:[] };

const esc = (v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate = (v)=>{ const [y,m,d]=String(v||'').slice(0,10).split('-'); return y&&m&&d?`${d}/${m}/${y}`:'-'; };
const today = ()=>new Date().toISOString().slice(0,10);
const money = (v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const norm = (v)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function usuario(ctx){ return ctx?.user || {}; }
function solicitanteNome(ctx){ return usuario(ctx).name || usuario(ctx).email || 'Usuário logado'; }
function solicitanteCoord(ctx){ return usuario(ctx).coordenacao || usuario(ctx).supervisao || ''; }
function setMsg(id,msg,err=false){ const el=document.getElementById(id); if(el){ el.textContent=msg||''; el.classList.toggle('err',!!err); }}
function pill(v){ return `<span class="cmp-status ${esc(v)}">${esc(STATUS[v]||v||'-')}</span>`; }
async function safe(fn,fallback=[]){ try{ const {data,error}=await fn(); if(error) throw error; return data||fallback; }catch(e){ console.warn(e); return fallback; } }
async function loadColaboradores(){
  state.colaboradores = await safe(()=>supabase.from('colaborador_snapshot').select('id,nome,tipo,cargo,coordenacao,supervisao,ativo').order('nome',{ascending:true}).limit(3000));
}
function colaboradorAtivo(c){ const txt=norm(c.ativo ?? c.situacao ?? 'ativo'); return !['false','0','inativo','nao ativo','não ativo','desligado'].includes(txt); }
function isClassificador(c){ return norm(`${c.tipo||''} ${c.cargo||''}`).includes('classificador'); }
async function notifyCompras(message){
  const cfgs = await safe(()=>supabase.from('compras_notificacoes_config').select('*').eq('setor','COMPRAS').eq('ativo',true).limit(10));
  if(!cfgs.length) return {ok:false,msg:'Solicitação salva. Configure compras_notificacoes_config para disparar BotConversa.'};
  let ok=0;
  for(const cfg of cfgs){
    if(!cfg.telefone) continue;
    try{ const res=await fetch('/api/botconversa/send-message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({empresa:cfg.empresa||'Grao 1000',nome:cfg.nome||'Compras',telefone:cfg.telefone,cpf:cfg.cpf||'',mensagem:message})}); if(res.ok) ok++; }catch(e){ console.warn(e); }
  }
  return {ok:ok>0,msg:ok?`BotConversa enviado para ${ok} responsável(is).`:'Solicitação salva, mas não foi possível enviar o BotConversa.'};
}
function buildMessage(ctx, tipo, itens){
  const nome=solicitanteNome(ctx); const data=brDate(document.getElementById('cmpData').value); const linhas=itens.map(i=>`• ${i.unidade||i.quantidade||1} un | ${i.material}${i.tamanho?` | Tam: ${i.tamanho}`:''}${i.colaborador_nome?` | ${i.colaborador_nome}`:''}`).join('\n');
  return `Nova solicitação de compras\nGestor: ${nome}\nData: ${data}\nTipo: ${tipo}\n\n${linhas}`;
}
function currentItemForm(){
  const material=document.getElementById('cmpNovoItem')?.value || '';
  const found=CATALOGO.find(i=>i.material===material);
  return {
    unidade:Number(document.getElementById('cmpNovaUn')?.value||1),
    material,
    tipo:found?.tipo || document.getElementById('cmpNovoTipo')?.value || '',
    tamanho:(document.getElementById('cmpNovoTam')?.value||'').trim() || null,
    quantidade:Number(document.getElementById('cmpNovaUn')?.value||1)
  };
}
function itemSelectOptions(){
  return CATALOGO.map(i=>`<option value="${esc(i.material)}">${esc(i.material)}</option>`).join('');
}
function resetItemForm(){
  document.getElementById('cmpNovaUn').value = 1;
  document.getElementById('cmpNovoItem').value = '';
  document.getElementById('cmpNovoTipo').value = '';
  const tam=document.getElementById('cmpNovoTam');
  tam.value=''; tam.disabled=true; tam.placeholder='Selecione Botina ou Peneira Individual';
}
function bindItemForm(){
  const sel=document.getElementById('cmpNovoItem');
  const tipo=document.getElementById('cmpNovoTipo');
  const tam=document.getElementById('cmpNovoTam');
  sel.onchange=()=>{
    const found=CATALOGO.find(i=>i.material===sel.value);
    tipo.value=found?.tipo||'';
    const needs=['BOTINA','PENEIRA INDIVIDUAL'].includes(sel.value);
    tam.disabled=!needs;
    tam.placeholder=sel.value==='BOTINA'?'Tamanho da botina':(sel.value==='PENEIRA INDIVIDUAL'?'Abertura/tamanho da peneira':'Selecione Botina ou Peneira Individual');
    if(!needs) tam.value='';
  };
  document.getElementById('cmpAddMaterial').onclick=()=>{
    const item=currentItemForm();
    if(!item.material){ setMsg('cmpFeedback','Selecione um material antes de adicionar na lista.',true); return; }
    if(['BOTINA','PENEIRA INDIVIDUAL'].includes(item.material) && !item.tamanho){ setMsg('cmpFeedback','Informe o tamanho/detalhe antes de adicionar na lista.',true); return; }
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
    body.innerHTML='<tr><td colspan="5" class="cmp-empty">Nenhum material adicionado. Selecione o item acima e clique em <b>Adicionar material</b>.</td></tr>';
    return;
  }
  body.innerHTML=state.itens.map(i=>`<tr data-item-id="${esc(i._id)}"><td>${esc(i.unidade||i.quantidade||1)}</td><td>${esc(i.material)}</td><td>${esc(i.tipo)}</td><td>${esc(i.tamanho||'-')}</td><td><button class="btn btn-small btn-danger" type="button" data-del-item>Remover</button></td></tr>`).join('');
  body.querySelectorAll('[data-del-item]').forEach(btn=>btn.onclick=()=>{
    const id=btn.closest('tr').dataset.itemId;
    state.itens=state.itens.filter(i=>String(i._id)!==String(id));
    renderItensList();
  });
}
function uniformRow(c){
  const cor=isClassificador(c)?'Verde':'Cinza';
  return `<tr data-uniforme-id="${esc(c.id||c.nome)}"><td>${esc(c.nome)}</td><td>${esc(c.tipo||c.cargo||'-')}</td><td><b>${cor}</b></td><td><select class="uni-tam">${UNIFORME_TAMANHOS.map(t=>`<option>${t}</option>`).join('')}</select></td><td><input class="uni-qtd" type="number" min="1" max="2" value="1"></td><td><button class="btn btn-small btn-danger" type="button" data-del-uniforme>×</button></td></tr>`;
}
function renderUniformes(){
  const body=document.getElementById('cmpUniformeBody');
  body.innerHTML=state.uniformes.map(uniformRow).join('') || `<tr><td colspan="6" class="cmp-empty">Nenhum colaborador adicionado.</td></tr>`;
  body.querySelectorAll('[data-del-uniforme]').forEach(btn=>btn.onclick=()=>{ const id=btn.closest('tr').dataset.uniformeId; state.uniformes=state.uniformes.filter(c=>String(c.id||c.nome)!==String(id)); renderUniformes(); });
}
function addAllColaboradores(ctx){
  const coord=norm(solicitanteCoord(ctx));
  const base=state.colaboradores.filter(colaboradorAtivo).filter(c=>!coord || norm(c.coordenacao||c.supervisao).includes(coord) || coord.includes(norm(c.coordenacao||c.supervisao)));
  state.uniformes = base.length ? base : state.colaboradores.filter(colaboradorAtivo);
  renderUniformes();
}
function setupColabSearch(){
  const input=document.getElementById('cmpColabBusca'); const box=document.getElementById('cmpColabSug');
  input.addEventListener('input',()=>{
    const q=norm(input.value); if(q.length<2){box.innerHTML='';return;}
    const list=state.colaboradores.filter(colaboradorAtivo).filter(c=>norm(c.nome).includes(q)).slice(0,10);
    box.innerHTML=list.map(c=>`<button type="button" data-add-colab="${esc(c.id||c.nome)}">${esc(c.nome)} <small>${esc(c.tipo||c.cargo||'')}</small></button>`).join('');
    box.querySelectorAll('[data-add-colab]').forEach(btn=>btn.onclick=()=>{ const c=state.colaboradores.find(x=>String(x.id||x.nome)===btn.dataset.addColab); if(c && !state.uniformes.some(x=>String(x.id||x.nome)===String(c.id||c.nome))) state.uniformes.push(c); input.value=''; box.innerHTML=''; renderUniformes(); });
  });
}
async function salvarSolicitacao(ctx, tipo, itens){
  const u=usuario(ctx); const data=document.getElementById('cmpData').value || today();
  const header={data_solicitacao:data, solicitante_id:u.id||null, solicitante:solicitanteNome(ctx), coordenacao:u.coordenacao||u.supervisao||null, tipo_solicitacao:tipo, status:'pendente', observacoes:document.getElementById('cmpObs').value.trim()||null, created_by:u.id||null};
  const {data:sol,error}=await supabase.from('compras_solicitacoes').insert(header).select('id').single();
  if(error) throw error;
  const payload=itens.map(i=>({...i, solicitacao_id:sol.id, status:'pendente'}));
  const {error:itemErr}=await supabase.from('compras_itens').insert(payload);
  if(itemErr) throw itemErr;
  return sol.id;
}
async function submitItens(ctx){
  const itens=state.itens.map(({_id,...i})=>i).filter(i=>i.material);
  if(!itens.length) throw new Error('Adicione pelo menos um material na lista antes de solicitar.');
  await salvarSolicitacao(ctx,'itens',itens);
  return itens;
}
async function submitUniformes(ctx){
  const rows=[...document.querySelectorAll('[data-uniforme-id]')];
  const itens=rows.map(tr=>{ const c=state.uniformes.find(x=>String(x.id||x.nome)===tr.dataset.uniformeId) || {}; const qtd=Math.min(2,Math.max(1,Number(tr.querySelector('.uni-qtd').value||1))); return {unidade:qtd, quantidade:qtd, material:'UNIFORME', tipo:'Uniforme', tamanho:tr.querySelector('.uni-tam').value, colaborador_id:c.id||null, colaborador_nome:c.nome||'', colaborador_tipo:c.tipo||c.cargo||'', uniforme_cor:isClassificador(c)?'Verde':'Cinza'}; });
  if(!itens.length) throw new Error('Adicione pelo menos um colaborador.');
  await salvarSolicitacao(ctx,'uniformes',itens);
  return itens;
}
async function loadMinhas(){
  const data=await safe(()=>supabase.from('compras_solicitacoes').select('*, compras_itens(*)').order('created_at',{ascending:false}).limit(80));
  state.rows=data; const body=document.getElementById('cmpMinhasBody');
  if(!data.length){ body.innerHTML='<tr><td colspan="5" class="cmp-empty">Nenhuma solicitação localizada.</td></tr>'; return; }
  body.innerHTML=data.map(r=>`<tr><td>${brDate(r.data_solicitacao)}</td><td>${esc(r.tipo_solicitacao)}</td><td>${(r.compras_itens||[]).map(i=>`${esc(i.quantidade||i.unidade||1)} un | ${esc(i.material)}${i.tamanho?` (${esc(i.tamanho)})`:''}`).join('<br>')}</td><td>${pill(r.status)}</td><td>${esc(r.motivo_recusa||'')}</td></tr>`).join('');
}
function styles(){return `<style>
.cmp-tabs,.cmp-actions{display:flex;gap:10px;flex-wrap:wrap}.cmp-tab{width:auto!important;margin:0!important}.cmp-tab.active{background:#166534!important;color:#fff!important}.cmp-panel{display:none}.cmp-panel.active{display:block}.cmp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px}.cmp-table{width:100%;border-collapse:collapse;min-width:760px}.cmp-table th,.cmp-table td{padding:12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.cmp-table th{font-size:12px;text-transform:uppercase;color:var(--muted)}.cmp-table input,.cmp-table select,.cmp-field input,.cmp-field textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0f172a;color:#e5e7eb;border-radius:12px;padding:10px 12px;color-scheme:dark}.cmp-field{display:flex;flex-direction:column;gap:6px}.cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.cmp-add-box{display:grid;grid-template-columns:110px 1.4fr 1fr 1fr auto;gap:12px;align-items:end}.cmp-add-action .btn{white-space:nowrap}.cmp-full{grid-column:1/-1}.cmp-suggest{display:grid;gap:6px;margin-top:6px}.cmp-suggest button{text-align:left;border:1px solid rgba(148,163,184,.24);background:#0f172a;color:#e5e7eb;border-radius:12px;padding:9px;cursor:pointer}.cmp-status{display:inline-flex;padding:6px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.25);font-weight:800;font-size:12px}.cmp-status.pendente,.cmp-status.em_cotacao,.cmp-status.em_analise,.cmp-status.pendente_pagamento,.cmp-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1)}.cmp-status.comprado{color:#bbf7d0;background:rgba(22,101,52,.18)}.cmp-status.recusado{color:#fecaca;background:rgba(220,38,38,.12)}.cmp-feedback{font-weight:700}.cmp-feedback.err{color:#fecaca}.cmp-empty{color:var(--muted);text-align:center}@media(max-width:960px){.cmp-add-box{grid-template-columns:1fr 1fr}}@media(max-width:760px){.cmp-grid,.cmp-add-box{grid-template-columns:1fr}.cmp-table{min-width:680px}}
</style>`}

initProtectedPage('Compras', async (content, userContext)=>{
  await loadColaboradores();
  content.innerHTML=`${styles()}
  <section class="hero-card"><div><div class="eyebrow">Gestor</div><h2>Compras</h2><p>Solicitação de materiais, EPIs, patrimônios e uniformes direcionada ao setor de compras.</p></div><div class="hero-badge-wrap"><span class="hero-badge">GESTOR</span></div></section>
  <section class="card mt-16"><div class="section-head"><div><h3>Nova solicitação</h3><p class="muted">Solicitante: <b>${esc(solicitanteNome(userContext))}</b>. O nome é preenchido automaticamente pelo usuário logado.</p></div><div class="cmp-tabs"><button class="btn btn-secondary cmp-tab active" data-mode="itens" type="button">ITENS</button><button class="btn btn-secondary cmp-tab" data-mode="uniformes" type="button">UNIFORMES</button></div></div>
    <div class="cmp-grid"><div class="cmp-field"><label>Data da solicitação</label><input id="cmpData" type="date" value="${today()}"></div><div class="cmp-field"><label>Solicitante</label><input value="${esc(solicitanteNome(userContext))}" readonly></div><div class="cmp-field cmp-full"><label>Observações</label><textarea id="cmpObs" rows="2" placeholder="Informações adicionais, urgência ou destino."></textarea></div></div>
    <div id="panel-itens" class="cmp-panel active mt-16">
      <div class="cmp-add-box">
        <div class="cmp-field"><label>Un.</label><input id="cmpNovaUn" type="number" min="1" value="1"></div>
        <div class="cmp-field"><label>Item</label><select id="cmpNovoItem"><option value="">Selecione...</option>${itemSelectOptions()}</select></div>
        <div class="cmp-field"><label>Tipo</label><input id="cmpNovoTipo" readonly></div>
        <div class="cmp-field"><label>Tamanho/Detalhe</label><input id="cmpNovoTam" placeholder="Selecione Botina ou Peneira Individual" disabled></div>
        <div class="cmp-field cmp-add-action"><label>&nbsp;</label><button class="btn btn-secondary" id="cmpAddMaterial" type="button">Adicionar material</button></div>
      </div>
      <p class="muted mt-12">Monte a lista abaixo antes de clicar em <b>SOLICITAR</b>.</p>
      <div class="cmp-table-wrap mt-16"><table class="cmp-table"><thead><tr><th>Un.</th><th>Item</th><th>Tipo</th><th>Tamanho/Detalhe</th><th></th></tr></thead><tbody id="cmpItemBody"></tbody></table></div>
    </div>
    <div id="panel-uniformes" class="cmp-panel mt-16"><div class="cmp-actions"><button class="btn btn-secondary" id="cmpAddTodos" type="button">Adicionar todos os colaboradores</button><div class="cmp-field" style="min-width:280px"><label>Adicionar colaborador</label><input id="cmpColabBusca" placeholder="Digite o nome"><div class="cmp-suggest" id="cmpColabSug"></div></div></div><div class="cmp-table-wrap mt-16"><table class="cmp-table"><thead><tr><th>Colaborador</th><th>Função/tipo</th><th>Cor</th><th>Tamanho</th><th>Un. máx 2</th><th></th></tr></thead><tbody id="cmpUniformeBody"></tbody></table></div></div>
    <div class="form-actions"><button class="btn btn-primary btn-inline" id="cmpSolicitar" type="button">SOLICITAR</button><span class="cmp-feedback" id="cmpFeedback"></span></div>
  </section>
  <section class="card mt-16"><div class="section-head"><div><h3>Pendentes e histórico</h3><p class="muted">A solicitação fica pendente até compras concluir ou recusar.</p></div><button class="btn btn-secondary" id="cmpRefresh" type="button">Atualizar</button></div><div class="cmp-table-wrap"><table class="cmp-table"><thead><tr><th>Data</th><th>Tipo</th><th>Itens</th><th>Status</th><th>Motivo</th></tr></thead><tbody id="cmpMinhasBody"></tbody></table></div></section>`;
  state.itens=[]; bindItemForm(); renderItensList(); renderUniformes(); setupColabSearch();
  document.querySelectorAll('.cmp-tab').forEach(btn=>btn.onclick=()=>{ state.mode=btn.dataset.mode; document.querySelectorAll('.cmp-tab').forEach(b=>b.classList.toggle('active',b===btn)); document.querySelectorAll('.cmp-panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${state.mode}`)); });
  document.getElementById('cmpAddTodos').onclick=()=>addAllColaboradores(userContext); document.getElementById('cmpRefresh').onclick=loadMinhas;
  document.getElementById('cmpSolicitar').onclick=async()=>{ const btn=document.getElementById('cmpSolicitar'); try{ btn.disabled=true; setMsg('cmpFeedback','Salvando solicitação...'); const itens=state.mode==='itens'?await submitItens(userContext):await submitUniformes(userContext); const n=await notifyCompras(buildMessage(userContext,state.mode,itens)); setMsg('cmpFeedback',`Solicitação enviada. ${n.msg}`,!n.ok); document.getElementById('cmpObs').value=''; state.itens=[]; renderItensList(); state.uniformes=[]; renderUniformes(); await loadMinhas(); }catch(e){ setMsg('cmpFeedback',e.message||'Erro ao solicitar.',true); }finally{ btn.disabled=false; } };
  await loadMinhas();
});
