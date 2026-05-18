import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const TABS = [
  ['solicitacoes','SOLICITAÇÕES'], ['cotacoes','COTAÇÕES'], ['analise','EM ANÁLISE'], ['pendentes','PENDENTES'], ['comprados','COMPRADOS'], ['recusados','RECUSADOS']
];
const STATUS = { pendente:'Pendente', em_cotacao:'Em cotação', em_analise:'Em análise', pendente_pagamento:'Pendente pagamento', aguardando_nf:'Aguardando NF', comprado:'Comprado', recusado:'Recusado' };
const state = { tab:'solicitacoes', rows:[], selected:new Set(), cotacao:null };
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
const money=(v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const norm=(v)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function setMsg(msg,err=false){const el=document.getElementById('admCmpFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
function pill(v){return `<span class="adm-cmp-status ${esc(v)}">${esc(STATUS[v]||v||'-')}</span>`}
async function safe(fn,fallback=[]){try{const {data,error}=await fn(); if(error) throw error; return data||fallback;}catch(e){console.warn(e);return fallback;}}
async function notifyByConfig(setor, message){
  const cfgs=await safe(()=>supabase.from('compras_notificacoes_config').select('*').eq('setor',setor).eq('ativo',true).limit(10));
  let ok=0; for(const cfg of cfgs){ if(!cfg.telefone) continue; try{const res=await fetch('/api/botconversa/send-message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({empresa:cfg.empresa||'Grao 1000',nome:cfg.nome||setor,telefone:cfg.telefone,cpf:cfg.cpf||'',mensagem:message})}); if(res.ok) ok++;}catch(e){console.warn(e)}} return ok;
}
async function loadRows(){
  const statusByTab={solicitacoes:['pendente'],cotacoes:['em_cotacao'],analise:['em_analise'],pendentes:['pendente_pagamento','aguardando_nf'],comprados:['comprado'],recusados:['recusado']};
  let q=supabase.from('compras_itens').select('*, compras_solicitacoes(*)').order('created_at',{ascending:false}).limit(500);
  const statuses=statusByTab[state.tab]||[]; if(statuses.length) q=q.in('status',statuses);
  const {data,error}=await q; if(error){document.getElementById('admCmpBody').innerHTML=`<tr><td colspan="9" class="adm-cmp-empty">${esc(error.message)}<br>Execute a migration de compras no Supabase.</td></tr>`;return;}
  state.rows=data||[]; state.selected.clear(); renderTable(); updateKpis();
}
function updateKpis(){
  document.getElementById('kpiSol').textContent=state.rows.length;
  document.getElementById('kpiTotal').textContent=money(state.rows.reduce((s,r)=>s+Number(r.valor_total||0),0));
  document.getElementById('kpiPat').textContent=state.rows.filter(r=>norm(r.tipo).includes('patrimonio')).length;
}
function rowLabel(r){return `${r.quantidade||r.unidade||1} un | ${r.material}${r.tamanho?` (${r.tamanho})`:''}${r.colaborador_nome?` | ${r.colaborador_nome}`:''}`;}
function renderTable(){
  const body=document.getElementById('admCmpBody');
  const rows=state.rows;
  if(!rows.length){body.innerHTML='<tr><td colspan="9" class="adm-cmp-empty">Nenhum item nesta etapa.</td></tr>'; return;}
  body.innerHTML=rows.map(r=>{const s=r.compras_solicitacoes||{}; return `<tr>
    <td><input type="checkbox" data-check="${esc(r.id)}"></td><td>${brDate(s.data_solicitacao)}</td><td>${esc(s.solicitante||'-')}<br><small>${esc(s.coordenacao||'')}</small></td><td>${esc(r.quantidade||r.unidade||1)}</td><td>${esc(r.material)}${r.tamanho?`<br><small>Tam: ${esc(r.tamanho)}</small>`:''}${r.colaborador_nome?`<br><small>${esc(r.colaborador_nome)}</small>`:''}</td><td>${esc(r.tipo||'-')}</td><td>${pill(r.status)}</td><td>${money(r.valor_total||0)}</td><td><button class="btn btn-small btn-secondary" data-open="${esc(r.id)}" type="button">Abrir</button></td>
  </tr>`}).join('');
  body.querySelectorAll('[data-check]').forEach(c=>c.onchange=()=>{c.checked?state.selected.add(c.dataset.check):state.selected.delete(c.dataset.check)});
  body.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openItem(b.dataset.open));
}
function selectedRows(){return state.rows.filter(r=>state.selected.has(String(r.id)));}
async function updateItems(rows,payload){ if(!rows.length) throw new Error('Selecione pelo menos um item.'); const {error}=await supabase.from('compras_itens').update(payload).in('id',rows.map(r=>r.id)); if(error) throw error; await syncSolicitacoesStatus(rows.map(r=>r.solicitacao_id)); }
async function syncSolicitacoesStatus(ids){
  for(const id of [...new Set(ids.filter(Boolean))]){
    const itens=await safe(()=>supabase.from('compras_itens').select('status').eq('solicitacao_id',id));
    const st=itens.map(i=>i.status); let status='pendente';
    if(st.every(x=>x==='comprado')) status='comprado'; else if(st.every(x=>x==='recusado')) status='recusado'; else if(st.includes('aguardando_nf')) status='aguardando_nf'; else if(st.includes('pendente_pagamento')) status='pendente_pagamento'; else if(st.includes('em_analise')) status='em_analise'; else if(st.includes('em_cotacao')) status='em_cotacao';
    await supabase.from('compras_solicitacoes').update({status}).eq('id',id);
  }
}
function approvalMessage(rows){
  const byGestor=new Map(); rows.forEach(r=>{const s=r.compras_solicitacoes||{}; const k=s.solicitante||'Gestor'; if(!byGestor.has(k)) byGestor.set(k,[]); byGestor.get(k).push(r);});
  return [...byGestor.entries()].map(([gestor,itens])=>`Gestor que solicitou: ${gestor}\n${itens.map(i=>`${i.quantidade||i.unidade||1} un | ${i.material}${i.tamanho?` | ${i.tamanho}`:''}`).join('\n')}`).join('\n\n');
}
async function cotar(){ const rows=selectedRows(); await updateItems(rows,{status:'em_cotacao'}); await supabase.from('compras_cotacoes').insert({status:'em_cotacao', itens_ids:rows.map(r=>r.id), titulo:`Cotação ${new Date().toLocaleString('pt-BR')}`}); setMsg('Itens enviados para COTAÇÕES.'); await loadRows(); }
async function solicitarAprovacao(){ const rows=selectedRows(); const msg=approvalMessage(rows); await updateItems(rows,{status:'em_analise', mensagem_aprovacao:msg}); await navigator.clipboard?.writeText(msg).catch(()=>{}); setMsg('Mensagem de aprovação gerada e copiada. Itens movidos para EM ANÁLISE.'); await loadRows(); }
async function recusarSelecionados(){ const rows=selectedRows(); const motivo=prompt('Motivo da recusa:'); if(!motivo) return; await updateItems(rows,{status:'recusado', motivo_recusa:motivo}); setMsg('Itens recusados.'); await loadRows(); }
function openItem(id){ const r=state.rows.find(x=>String(x.id)===String(id)); if(!r)return; const s=r.compras_solicitacoes||{}; const modal=document.getElementById('admCmpModal');
  modal.innerHTML=`<div class="adm-cmp-modal-card"><div class="section-head"><div><h3>${esc(r.material)}</h3><p class="muted">${esc(s.solicitante||'-')} · ${brDate(s.data_solicitacao)} · ${pill(r.status)}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div><div class="adm-cmp-grid">
    <div><b>Quantidade:</b> ${esc(r.quantidade||r.unidade||1)}</div><div><b>Tipo:</b> ${esc(r.tipo||'-')}</div><div><b>Tamanho:</b> ${esc(r.tamanho||'-')}</div><div><b>Valor:</b> ${money(r.valor_total||0)}</div>
    <div class="adm-cmp-full"><b>Observação:</b> ${esc(s.observacoes||'-')}</div>
  </div><div id="modalArea" class="mt-16"></div></div>`;
  modal.classList.add('open'); modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open'); renderModalArea(r);
}
function renderModalArea(r){ const area=document.getElementById('modalArea'); if(!area)return;
  if(r.status==='em_cotacao') area.innerHTML=`<h3>Cotação</h3><div class="adm-cmp-grid"><label>Valor unitário<input id="mValor" type="number" step="0.01" value="${esc(r.valor_unitario||'')}"></label><label>Total<input id="mTotal" readonly value="${esc(r.valor_total||'')}"></label></div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="mComprar" type="button">COMPRAR</button><button class="btn btn-danger" id="mCancelar" type="button">CANCELAR</button></div>`;
  else if(r.status==='em_analise') area.innerHTML=`<h3>Análise</h3><div class="adm-cmp-grid"><label>Quem aprovou/recusou<input id="mAprovador" list="aprovadores" placeholder="Nome do colaborador"></label><label>Motivo/observação<input id="mMotivo" placeholder="Obrigatório se recusar"></label></div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="mAprovar" type="button">APROVADO</button><button class="btn btn-danger" id="mReprovar" type="button">RECUSADO</button></div>`;
  else if(r.status==='aguardando_nf') area.innerHTML=`<h3>Anexar NF</h3><div class="adm-cmp-grid"><label>URL da NF<input id="mNf" placeholder="Cole o link da NF"></label><label>Marca<input id="mMarca" placeholder="Marca do item, se patrimônio"></label></div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="mFinalizar" type="button">Finalizar compra</button>${r.comprovante_url?`<a class="btn btn-secondary" href="${esc(r.comprovante_url)}" target="_blank">Abrir comprovante</a>`:''}</div>`;
  else area.innerHTML=`<p class="muted">Use os botões da tela principal para movimentar este item.</p>`;
  const valor=area.querySelector('#mValor'), total=area.querySelector('#mTotal'); if(valor) valor.oninput=()=>{ total.value=(Number(valor.value||0)*Number(r.quantidade||r.unidade||1)).toFixed(2); };
  area.querySelector('#mComprar')?.addEventListener('click',()=>openPagamento(r, Number(total.value||0), Number(valor.value||0)));
  area.querySelector('#mCancelar')?.addEventListener('click',async()=>{await supabase.from('compras_itens').update({status:'pendente'}).eq('id',r.id); await syncSolicitacoesStatus([r.solicitacao_id]); document.getElementById('admCmpModal').classList.remove('open'); await loadRows();});
  area.querySelector('#mAprovar')?.addEventListener('click',async()=>{await supabase.from('compras_itens').update({status:'pendente', aprovado_por:area.querySelector('#mAprovador').value.trim()||null, aprovado_em:new Date().toISOString()}).eq('id',r.id); await syncSolicitacoesStatus([r.solicitacao_id]); document.getElementById('admCmpModal').classList.remove('open'); await loadRows();});
  area.querySelector('#mReprovar')?.addEventListener('click',async()=>{const motivo=area.querySelector('#mMotivo').value.trim(); if(!motivo){alert('Informe o motivo.');return;} await supabase.from('compras_itens').update({status:'recusado', recusado_por:area.querySelector('#mAprovador').value.trim()||null, motivo_recusa:motivo}).eq('id',r.id); await syncSolicitacoesStatus([r.solicitacao_id]); document.getElementById('admCmpModal').classList.remove('open'); await loadRows();});
  area.querySelector('#mFinalizar')?.addEventListener('click',async()=>finalizarCompra(r));
}

function abrirCompraSelecionados(){
  const rows = selectedRows();
  if(!rows.length){ setMsg('Selecione pelo menos um item em COTAÇÕES para comprar.', true); return; }
  const invalidos = rows.filter(r=>r.status!=='em_cotacao');
  if(invalidos.length){ setMsg('Comprar em lote só está disponível para itens em COTAÇÕES.', true); return; }
  openCompraLote(rows);
}
function openCompraLote(rows){
  const modal=document.getElementById('admCmpModal');
  const totalInicial = rows.reduce((s,r)=>s+(Number(r.valor_total||0)),0);
  modal.innerHTML=`<div class="adm-cmp-modal-card adm-cmp-modal-wide">
    <div class="section-head">
      <div>
        <h3>Comprar itens selecionados</h3>
        <p class="muted">Informe o valor unitário de cada material. O painel calcula o total antes de enviar ao Financeiro.</p>
      </div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="adm-cmp-table-wrap mt-16">
      <table class="adm-cmp-table adm-cmp-buy-table">
        <thead><tr><th>Un.</th><th>Material</th><th>Tipo</th><th>Valor unitário</th><th>Total</th></tr></thead>
        <tbody>
          ${rows.map(r=>`<tr data-buy-row="${esc(r.id)}">
            <td>${esc(r.quantidade||r.unidade||1)}</td>
            <td>${esc(r.material)}${r.tamanho?`<br><small>Tam: ${esc(r.tamanho)}</small>`:''}${r.colaborador_nome?`<br><small>${esc(r.colaborador_nome)}</small>`:''}</td>
            <td>${esc(r.tipo||'-')}</td>
            <td><input class="buy-unit" type="number" step="0.01" min="0" value="${esc(r.valor_unitario||'')}" placeholder="0,00"></td>
            <td><input class="buy-total" type="number" step="0.01" readonly value="${esc(r.valor_total||'0')}"></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="adm-cmp-total-box mt-16">
      <span>Total da compra</span>
      <strong id="buyGrandTotal">${money(totalInicial)}</strong>
    </div>
    <div class="adm-cmp-actions mt-16">
      <button class="btn btn-primary" id="buyContinue" type="button">COMPRAR</button>
      <button class="btn btn-danger" id="buyCancel" type="button">CANCELAR</button>
    </div>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#buyCancel').onclick=()=>modal.classList.remove('open');

  const recalc=()=>{
    let grand=0;
    rows.forEach(r=>{
      const tr=modal.querySelector(`[data-buy-row="${CSS.escape(String(r.id))}"]`);
      if(!tr) return;
      const qtd=Number(r.quantidade||r.unidade||1);
      const unit=Number(tr.querySelector('.buy-unit').value||0);
      const total=unit*qtd;
      tr.querySelector('.buy-total').value=total.toFixed(2);
      grand += total;
    });
    modal.querySelector('#buyGrandTotal').textContent=money(grand);
  };
  modal.querySelectorAll('.buy-unit').forEach(inp=>inp.oninput=recalc);
  recalc();
  modal.querySelector('#buyContinue').onclick=()=>openPagamentoLote(rows);
}
function coletarValoresCompraLote(rows){
  const modal=document.getElementById('admCmpModal');
  return rows.map(r=>{
    const tr=modal.querySelector(`[data-buy-row="${CSS.escape(String(r.id))}"]`);
    const qtd=Number(r.quantidade||r.unidade||1);
    const unit=Number(tr?.querySelector('.buy-unit')?.value||0);
    return {...r, _valor_unitario:unit, _valor_total:unit*qtd};
  });
}

function safeFileName(name){
  return String(name||'arquivo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'_')
    .slice(0,120);
}
async function uploadArquivoNotasFiscais(file, prefixo='compras/boletos'){
  if(!file) return '';
  const ano=new Date().getFullYear();
  const path=`${prefixo}/${ano}/${Date.now()}_${safeFileName(file.name)}`;
  const {error}=await supabase.storage.from('notas-fiscais').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error) throw new Error(`Falha ao enviar arquivo para Notas Fiscais: ${error.message}`);
  const {data}=supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl || path;
}
async function coletarDadosPagamento(forma, area){
  const texto=area.querySelector('#payData')?.value?.trim() || '';
  const arquivo=area.querySelector('#payFile')?.files?.[0] || null;
  if(forma==='BOLETO' && arquivo){
    return await uploadArquivoNotasFiscais(arquivo,'compras/boletos');
  }
  return texto;
}
function updatePagamentoFields(area, forma){
  const label=area.querySelector('#payLabel');
  const input=area.querySelector('#payData');
  const fileWrap=area.querySelector('#payFileWrap');
  if(!label || !input) return;
  if(forma==='PIX'){
    label.firstChild.textContent='Chave PIX';
    input.placeholder='Informe a chave PIX';
    if(fileWrap) fileWrap.style.display='none';
  }else if(forma==='LINK'){
    label.firstChild.textContent='Link de pagamento';
    input.placeholder='Cole o link de pagamento';
    if(fileWrap) fileWrap.style.display='none';
  }else{
    label.firstChild.textContent='Boleto / URL';
    input.placeholder='Cole o link do boleto ou anexe o arquivo abaixo';
    if(fileWrap) fileWrap.style.display='block';
  }
}

function openPagamentoLote(rows){
  const itens=coletarValoresCompraLote(rows);
  const total=itens.reduce((s,r)=>s+Number(r._valor_total||0),0);
  if(total<=0){ alert('Informe o valor unitário de pelo menos um item.'); return; }
  const area=document.querySelector('#admCmpModal .adm-cmp-modal-card');
  area.innerHTML=`<div class="section-head"><div><h3>Pagamento da compra</h3><p class="muted">Total da compra: <b>${money(total)}</b></p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="adm-cmp-table-wrap mt-16">
      <table class="adm-cmp-table adm-cmp-buy-table">
        <thead><tr><th>Un.</th><th>Material</th><th>Valor unitário</th><th>Total</th></tr></thead>
        <tbody>${itens.map(r=>`<tr><td>${esc(r.quantidade||r.unidade||1)}</td><td>${esc(r.material)}${r.tamanho?`<br><small>Tam: ${esc(r.tamanho)}</small>`:''}</td><td>${money(r._valor_unitario)}</td><td>${money(r._valor_total)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label>Fornecedor<input id="payFornecedor" placeholder="Nome do fornecedor"></label>
      <label>Valor total<input id="payValorTotal" readonly value="${money(total)}"></label>
      <label class="adm-cmp-full">Contato<input id="payContato" placeholder="Telefone, WhatsApp, e-mail ou observação de contato"></label>
    </div>
    <div class="adm-cmp-tabs mt-16">
      <button class="btn btn-secondary active" data-pay="BOLETO" type="button">BOLETO</button>
      <button class="btn btn-secondary" data-pay="PIX" type="button">PIX</button>
      <button class="btn btn-secondary" data-pay="LINK" type="button">LINK</button>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label id="payLabel">Boleto / URL<input id="payData" placeholder="Cole o link do boleto ou anexe o arquivo abaixo"></label>
      <label id="payFileWrap">Arquivo do boleto<input id="payFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"></label>
    </div>
    <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="paySend" type="button">Enviar ao Financeiro</button><button class="btn btn-secondary" id="payBack" type="button">Voltar</button></div>`;
  let forma='BOLETO';
  area.querySelector('#mClose').onclick=()=>document.getElementById('admCmpModal').classList.remove('open');
  area.querySelector('#payBack').onclick=()=>openCompraLote(rows);
  area.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{
    forma=b.dataset.pay;
    area.querySelectorAll('[data-pay]').forEach(x=>x.classList.toggle('active',x===b));
    updatePagamentoFields(area, forma);
  });
  updatePagamentoFields(area, forma);
  area.querySelector('#paySend').onclick=async()=>{
    try{
      const dados=await coletarDadosPagamento(forma, area);
      const fornecedor=area.querySelector('#payFornecedor')?.value?.trim() || '';
      const contato=area.querySelector('#payContato')?.value?.trim() || '';
      await enviarFinanceiroLote(itens,total,forma,dados,fornecedor,contato);
    }catch(e){ setMsg(e.message,true); alert(e.message); }
  };
}
async function enviarFinanceiroLote(itens,total,forma,dados,fornecedor='',contato=''){
  if(!dados){alert('Informe boleto, PIX ou link.');return;}
  const descricao=`Compra: ${itens.map(r=>`${r.quantidade||r.unidade||1} un ${r.material}`).join(' | ')}`;
  const payload={origem:'COMPRAS', origem_id:itens[0]?.id||null, descricao, favorecido:fornecedor||'Fornecedor a definir', fornecedor:fornecedor||null, contato:contato||null, valor:total, forma_pagamento:forma, dados_pagamento:dados, status:'PENDENTE', vencimento:null, created_at:new Date().toISOString()};
  await safe(()=>supabase.from('financeiro_pagamentos').insert(payload), null);

  for(const r of itens){
    const {error}=await supabase.from('compras_itens').update({
      status:'pendente_pagamento',
      valor_unitario:r._valor_unitario,
      valor_total:r._valor_total,
      forma_pagamento:forma,
      dados_pagamento:dados
    }).eq('id',r.id);
    if(error) throw error;
  }

  await syncSolicitacoesStatus(itens.map(r=>r.solicitacao_id));
  await notifyByConfig('FINANCEIRO',`Pagamento de compras pendente\nFornecedor: ${fornecedor||'Não informado'}\nContato: ${contato||'Não informado'}\nItens: ${itens.length}\nValor total: ${money(total)}\nForma: ${forma}`);
  document.getElementById('admCmpModal').classList.remove('open');
  setMsg('Compra enviada ao Financeiro e movida para PENDENTES.');
  await loadRows();
}

function openPagamento(r,total,unit){ const area=document.getElementById('modalArea'); area.innerHTML=`<h3>Pagamento</h3><p class="muted">Total da compra: <b>${money(total)}</b></p><div class="adm-cmp-grid mt-16"><label>Fornecedor<input id="payFornecedor" placeholder="Nome do fornecedor"></label><label>Valor total<input id="payValorTotal" readonly value="${money(total)}"></label><label class="adm-cmp-full">Contato<input id="payContato" placeholder="Telefone, WhatsApp, e-mail ou observação de contato"></label></div><div class="adm-cmp-tabs mt-16"><button class="btn btn-secondary active" data-pay="BOLETO" type="button">BOLETO</button><button class="btn btn-secondary" data-pay="PIX" type="button">PIX</button><button class="btn btn-secondary" data-pay="LINK" type="button">LINK</button></div><div class="adm-cmp-grid"><label id="payLabel">Boleto / URL<input id="payData" placeholder="Cole o link do boleto ou anexe o arquivo abaixo"></label><label id="payFileWrap">Arquivo do boleto<input id="payFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"></label></div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="paySend" type="button">Enviar ao Financeiro</button></div>`; let forma='BOLETO'; area.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{forma=b.dataset.pay; area.querySelectorAll('[data-pay]').forEach(x=>x.classList.toggle('active',x===b)); updatePagamentoFields(area, forma);}); updatePagamentoFields(area, forma); area.querySelector('#paySend').onclick=async()=>{ try{ const dados=await coletarDadosPagamento(forma, area); const fornecedor=area.querySelector('#payFornecedor')?.value?.trim() || ''; const contato=area.querySelector('#payContato')?.value?.trim() || ''; await enviarFinanceiro(r,total,unit,forma,dados,fornecedor,contato); }catch(e){ setMsg(e.message,true); alert(e.message); } }; }
async function enviarFinanceiro(r,total,unit,forma,dados,fornecedor='',contato=''){
  if(!dados){alert('Informe boleto, PIX ou link.');return;}
  const payload={origem:'COMPRAS', origem_id:r.id, descricao:`Compra: ${r.material}`, favorecido:fornecedor||'Fornecedor a definir', fornecedor:fornecedor||null, contato:contato||null, valor:total, forma_pagamento:forma, dados_pagamento:dados, status:'PENDENTE', vencimento:null, created_at:new Date().toISOString()};
  await safe(()=>supabase.from('financeiro_pagamentos').insert(payload), null);
  await supabase.from('compras_itens').update({status:'pendente_pagamento', valor_unitario:unit, valor_total:total, forma_pagamento:forma, dados_pagamento:dados}).eq('id',r.id);
  await syncSolicitacoesStatus([r.solicitacao_id]); await notifyByConfig('FINANCEIRO',`Pagamento de compras pendente\nFornecedor: ${fornecedor||'Não informado'}\nContato: ${contato||'Não informado'}\nMaterial: ${r.material}\nValor: ${money(total)}\nForma: ${forma}`);
  document.getElementById('admCmpModal').classList.remove('open'); setMsg('Compra enviada ao Financeiro e movida para PENDENTES.'); await loadRows();
}
async function finalizarCompra(r){ const nf=document.getElementById('mNf').value.trim(); if(!nf){alert('Informe a NF.');return;} const marca=document.getElementById('mMarca').value.trim(); await supabase.from('compras_itens').update({status:'comprado', nf_url:nf, marca, comprado_em:new Date().toISOString()}).eq('id',r.id); if(norm(r.tipo).includes('patrimonio')) await supabase.from('compras_patrimonios_cadastro').insert({compra_item_id:r.id, material:r.material, marca, coordenacao:r.compras_solicitacoes?.coordenacao||null, status:'aguardando_numero'}); await syncSolicitacoesStatus([r.solicitacao_id]); await notifyByConfig('GESTOR',`Compra concluída\nMaterial: ${r.material}\nNF: ${nf}`);
  // Notifica o gestor solicitante via painel
  try {
    const engine = window.__painelNotifEngine;
    const s = r.compras_solicitacoes || {};
    const destinatarioId = s.solicitante_id || s.created_by || null;
    if (engine && destinatarioId) {
      await engine.criarNotificacao({
        tipo: 'compra_realizada',
        titulo: `Compra realizada: ${r.material}`,
        descricao: `Solicitação de ${s.solicitante||'Gestor'} foi concluída. NF disponível.`,
        destinatario_usuario_id: destinatarioId,
        referencia_tabela: 'compras_itens',
        referencia_id: String(r.id),
        chave_dedup: `compra_realizada:${r.id}`,
      });
    }
  } catch (_) {}
  document.getElementById('admCmpModal').classList.remove('open'); await loadRows(); }
function styles(){return `<style>.adm-cmp-tabs,.adm-cmp-actions{display:flex;gap:10px;flex-wrap:wrap}.adm-cmp-tabs .active{background:#166534!important;color:#fff!important}.adm-cmp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.adm-cmp-table{width:100%;border-collapse:collapse;min-width:1060px}.adm-cmp-table th,.adm-cmp-table td{padding:12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.adm-cmp-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.adm-cmp-status{display:inline-flex;padding:6px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.25);font-size:12px;font-weight:800}.adm-cmp-status.pendente,.adm-cmp-status.em_cotacao,.adm-cmp-status.em_analise,.adm-cmp-status.pendente_pagamento,.adm-cmp-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1)}.adm-cmp-status.comprado{color:#bbf7d0;background:rgba(22,101,52,.2)}.adm-cmp-status.recusado{color:#fecaca;background:rgba(220,38,38,.12)}.adm-cmp-empty{text-align:center;color:var(--muted)}.adm-cmp-feedback{font-weight:800}.adm-cmp-feedback.err{color:#fecaca}.adm-cmp-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.adm-cmp-modal.open{display:flex}.adm-cmp-modal-card{width:min(900px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,0.06);border-radius:22px;padding:20px;color:#e2e2f0}.adm-cmp-modal-wide{width:min(1180px,100%)}.adm-cmp-buy-table input{width:160px;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-total-box{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid var(--line);border-radius:16px;padding:14px 16px;background:rgba(15,23,42,.55)}.adm-cmp-total-box strong{font-size:22px}.adm-cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-cmp-grid input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-grid input[type=file]{padding:9px 12px;cursor:pointer}.adm-cmp-full{grid-column:1/-1}@media(max-width:760px){.adm-cmp-grid{grid-template-columns:1fr}.adm-cmp-table{min-width:920px}}</style>`}

function updateActionButtons(){
  const isCotacoes=state.tab==='cotacoes';
  const isSolic=state.tab==='solicitacoes';
  const btnCotar=document.getElementById('btnCotar');
  const btnComprar=document.getElementById('btnComprar');
  const btnAprovar=document.getElementById('btnAprovar');
  const btnRecusar=document.getElementById('btnRecusar');
  if(btnCotar) btnCotar.style.display=isSolic?'inline-flex':'none';
  if(btnComprar) btnComprar.style.display=isCotacoes?'inline-flex':'none';
  if(btnAprovar) btnAprovar.style.display=isSolic?'inline-flex':'none';
  if(btnRecusar) btnRecusar.style.display=(isSolic||isCotacoes||state.tab==='analise')?'inline-flex':'none';
  setMsg('');
}

initProtectedPage('Compras ADM', async (content)=>{
  content.innerHTML=`${styles()}<section class="hero-card"><div><h2>Compras ADM</h2><p>Fluxo de solicitações, cotação, aprovação, pagamento, NF e encerramento das compras.</p></div><div class="hero-badge-wrap"><span class="hero-badge">ADM</span></div></section><section class="grid-cards mt-16"><article class="card"><h3>Itens na etapa</h3><p class="metric" id="kpiSol">0</p><p class="muted">Registros filtrados.</p></article><article class="card"><h3>Total cotado</h3><p class="metric" id="kpiTotal">R$ 0,00</p><p class="muted">Soma dos valores informados.</p></article><article class="card"><h3>Patrimônios</h3><p class="metric" id="kpiPat">0</p><p class="muted">Itens que exigem cadastro patrimonial.</p></article></section><section class="card mt-16"><div class="section-head"><div><h3>Fila de compras</h3><p class="muted">Selecione itens específicos. A compra pode ser parcial e por fornecedores diferentes.</p></div><button class="btn btn-secondary" id="admCmpRefresh" type="button">Atualizar</button></div><div class="adm-cmp-tabs">${TABS.map(([k,l])=>`<button class="btn btn-secondary ${k==='solicitacoes'?'active':''}" data-tab="${k}" type="button">${l}</button>`).join('')}</div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="btnCotar" type="button">COTAR</button><button class="btn btn-primary" id="btnComprar" type="button" style="display:none">COMPRAR</button><button class="btn btn-secondary" id="btnAprovar" type="button">SOLICITAR APROVAÇÃO</button><button class="btn btn-danger" id="btnRecusar" type="button">RECUSAR</button><span class="adm-cmp-feedback" id="admCmpFeedback"></span></div><div class="adm-cmp-table-wrap mt-16"><table class="adm-cmp-table"><thead><tr><th></th><th>Data</th><th>Gestor</th><th>Un.</th><th>Material</th><th>Tipo</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody id="admCmpBody"></tbody></table></div></section><div class="adm-cmp-modal" id="admCmpModal"></div>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b)); updateActionButtons(); loadRows();});
  document.getElementById('admCmpRefresh').onclick=loadRows; document.getElementById('btnCotar').onclick=()=>cotar().catch(e=>setMsg(e.message,true)); document.getElementById('btnComprar').onclick=()=>abrirCompraSelecionados(); document.getElementById('btnAprovar').onclick=()=>solicitarAprovacao().catch(e=>setMsg(e.message,true)); document.getElementById('btnRecusar').onclick=()=>recusarSelecionados().catch(e=>setMsg(e.message,true)); updateActionButtons();
  await loadRows();
});
