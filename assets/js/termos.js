import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const state = { tab:'celular', celular:[] };
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
const money=(v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const norm=(v)=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
function setMsg(msg,err=false){const el=document.getElementById('termosFeedbackMain'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
async function safe(fn,fallback=[]){try{const {data,error}=await fn(); if(error) throw error; return data||fallback;}catch(e){console.warn(e);return fallback;}}

function safeFileName(n){return String(n||'arquivo').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);}
async function uploadTermo(file){
  if(!file) return '';
  const ano=new Date().getFullYear();
  const path=`termos/${ano}/${Date.now()}_${safeFileName(file.name)}`;
  const {error}=await supabase.storage.from('notas-fiscais').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);
  const {data}=supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl||path;
}
async function notifyFinanceiro(tc, ci){
  const cfgs=await safe(()=>supabase.from('compras_notificacoes_config').select('*').eq('setor','FINANCEIRO').eq('ativo',true).limit(10));
  for(const cfg of cfgs){
    if(!cfg.telefone) continue;
    try{await fetch('/api/botconversa/send-message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({empresa:cfg.empresa||'Grao 1000',nome:cfg.nome||'Financeiro',telefone:cfg.telefone,cpf:cfg.cpf||'',mensagem:`Pagamento de compra pendente\nItem: CELULAR\nColaborador: ${tc.colaborador_nome||'-'}\nValor: ${money(tc.valor||0)}\nTermo assinado anexado.`})});}catch(e){console.warn(e);}
  }
}

async function loadCelular(){
  const data=await safe(()=>supabase.from('termos_celular').select('*, compras_itens(id, material, valor_total, forma_pagamento, dados_pagamento, fornecedor, contato, compras_solicitacoes(solicitante, data_solicitacao))').order('created_at',{ascending:false}).limit(300));
  state.celular=data;
  renderKpis();
  renderCelular();
}

function renderKpis(){
  const pend=state.celular.filter(r=>r.status==='aguardando_termo').length;
  const conf=state.celular.filter(r=>r.status==='enviado_financeiro').length;
  document.getElementById('kpiTermosPend').textContent=pend;
  document.getElementById('kpiTermosConf').textContent=conf;
  document.getElementById('kpiTermosTotal').textContent=state.celular.length;
}

function statusPill(s){
  const map={
    aguardando_termo:['#fde68a','rgba(245,158,11,.1)','Aguardando Termo'],
    enviado_financeiro:['#bbf7d0','rgba(22,101,52,.18)','Enviado ao Financeiro']
  };
  const [color,bg,label]=map[s]||['#cbd5e1','rgba(148,163,184,.1)',s||'-'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${color};background:${bg};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function renderCelular(){
  const body=document.getElementById('termosCelularBody');
  if(!state.celular.length){
    body.innerHTML=`<tr><td colspan="7" class="termos-empty">Nenhum registro encontrado.</td></tr>`;
    return;
  }
  body.innerHTML=state.celular.map(tc=>{
    const isSigned=tc.status==='enviado_financeiro';
    return `<tr>
      <td>${brDate(tc.created_at)}</td>
      <td><b>${esc(tc.colaborador_nome||'-')}</b></td>
      <td>CELULAR</td>
      <td>${tc.valor?money(tc.valor):'<span class="muted">Aguardando</span>'}</td>
      <td>${tc.metodo_pagamento==='parcelado'?`${tc.parcelas||1}x`:'À vista'}</td>
      <td>${statusPill(tc.status)}</td>
      <td class="termos-acoes">
        ${!isSigned?`<button class="btn btn-small btn-primary" data-confirmar="${esc(tc.id)}" type="button">Confirmar Termo</button>`:''}
        ${tc.termo_url?`<a class="btn btn-small btn-secondary" href="${esc(tc.termo_url)}" target="_blank" rel="noopener">Ver Termo</a>`:''}
      </td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-confirmar]').forEach(b=>b.onclick=()=>openConfirmarModal(b.dataset.confirmar));
}

function openConfirmarModal(id){
  const tc=state.celular.find(x=>String(x.id)===String(id)); if(!tc) return;
  const modal=document.getElementById('termosModal');
  modal.innerHTML=`<div class="termos-modal-card">
    <div class="section-head">
      <div><h3>Confirmar Termo — Celular</h3><p class="muted">Anexe o termo assinado para liberar o pagamento ao Financeiro.</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="termos-detail-grid mt-16">
      <div><span class="muted">Colaborador</span><b>${esc(tc.colaborador_nome||'-')}</b></div>
      <div><span class="muted">Compra</span><b>CELULAR</b></div>
      <div><span class="muted">Valor</span><b>${tc.valor?money(tc.valor):'Não informado'}</b></div>
      <div><span class="muted">Pagamento</span><b>${tc.metodo_pagamento==='parcelado'?`${tc.parcelas||1}x parcelado`:'À vista'}</b></div>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">Anexar Termo Assinado<input id="termoFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
      <label class="adm-cmp-full">Observação (opcional)<input id="termoObs" placeholder="Ex: Colaborador assinou em 20/05/2026…"></label>
    </div>
    <div class="adm-cmp-actions mt-16">
      <button class="btn btn-primary" id="termosConfirmar" type="button">Confirmar e Enviar ao Financeiro</button>
      <button class="btn btn-secondary" id="termosCancelar" type="button">Cancelar</button>
    </div>
    <span class="termos-feedback" id="termosFeedbackModal"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#termosCancelar').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#termosConfirmar').onclick=()=>confirmarTermo(tc);
}

async function confirmarTermo(tc){
  const modal=document.getElementById('termosModal');
  const btn=modal.querySelector('#termosConfirmar');
  const fb=modal.querySelector('#termosFeedbackModal');
  btn.disabled=true;
  if(fb) fb.textContent='Processando...';
  try{
    const file=modal.querySelector('#termoFile')?.files?.[0]||null;
    const obs=modal.querySelector('#termoObs')?.value?.trim()||null;
    let termoUrl=tc.termo_url||null;
    if(file){ if(fb) fb.textContent='Enviando arquivo...'; termoUrl=await uploadTermo(file); }

    const ci=tc.compras_itens||{};
    // Insert to financeiro_pagamentos
    const payload={
      origem:'COMPRAS',
      origem_id:tc.compra_item_id||null,
      descricao:`Compra: CELULAR | ${tc.colaborador_nome||''}`,
      favorecido:ci.fornecedor||'Fornecedor a definir',
      fornecedor:ci.fornecedor||null,
      contato:ci.contato||null,
      valor:tc.valor||ci.valor_total||0,
      forma_pagamento:ci.forma_pagamento||'BOLETO',
      dados_pagamento:ci.dados_pagamento||null,
      status:'PENDENTE',
      vencimento:null,
      created_at:new Date().toISOString()
    };
    await safe(()=>supabase.from('financeiro_pagamentos').insert(payload));
    // Update compras_itens
    if(tc.compra_item_id) await supabase.from('compras_itens').update({status:'pendente_pagamento'}).eq('id',tc.compra_item_id);
    // Update termos_celular
    await supabase.from('termos_celular').update({status:'enviado_financeiro',termo_url:termoUrl,observacao:obs,confirmado_em:new Date().toISOString()}).eq('id',tc.id);
    await notifyFinanceiro(tc,ci);
    modal.classList.remove('open');
    setMsg('Termo confirmado. Compra enviada ao Financeiro.');
    await loadCelular();
  }catch(e){
    if(fb){fb.textContent=e.message; fb.classList.add('err');}
  }finally{
    btn.disabled=false;
  }
}

function styles(){return `<style>
.termos-tabs{display:flex;gap:8px;flex-wrap:wrap}.termos-tabs .active{background:#166534!important;color:#fff!important}
.termos-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.termos-table{width:100%;border-collapse:collapse;min-width:760px}.termos-table th,.termos-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}.termos-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.termos-empty{text-align:center;color:var(--muted)}.termos-acoes{display:flex;gap:8px;flex-wrap:wrap}
.termos-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.termos-modal.open{display:flex}.termos-modal-card{width:min(700px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
.termos-detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.termos-detail-grid>div{display:flex;flex-direction:column;gap:4px}.termos-detail-grid .muted{font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.adm-cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-cmp-grid input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-grid input[type=file]{padding:9px 12px;cursor:pointer}.adm-cmp-full{grid-column:1/-1}.adm-cmp-actions{display:flex;gap:10px;flex-wrap:wrap}
.termos-feedback{font-weight:700}.termos-feedback.err{color:#fecaca}
@media(max-width:640px){.termos-detail-grid{grid-template-columns:1fr}}
</style>`}

initProtectedPage('Termos', async (content)=>{
  content.innerHTML=`${styles()}
  <section class="hero-card"><div><div class="eyebrow">Conferência</div><h2>Termos</h2><p>Gestão de termos de responsabilidade para compras especiais que exigem assinatura antes do pagamento.</p></div><div class="hero-badge-wrap"><span class="hero-badge">CONF</span></div></section>
  <section class="grid-cards mt-16">
    <article class="card"><h3>Aguardando Termo</h3><p class="metric" id="kpiTermosPend">0</p><p class="muted">Celulares aguardando assinatura.</p></article>
    <article class="card"><h3>Enviados ao Financeiro</h3><p class="metric" id="kpiTermosConf">0</p><p class="muted">Termos confirmados.</p></article>
    <article class="card"><h3>Total</h3><p class="metric" id="kpiTermosTotal">0</p><p class="muted">Total de registros.</p></article>
  </section>
  <section class="card mt-16">
    <div class="section-head">
      <div class="termos-tabs">
        <button class="btn btn-secondary active" data-termos-tab="celular" type="button">Celular</button>
        <button class="btn btn-secondary" data-termos-tab="veiculos" type="button">Veículos</button>
      </div>
      <button class="btn btn-secondary" id="termosRefresh" type="button">Atualizar</button>
    </div>
    <div id="termosTabCelular" class="mt-16">
      <div class="termos-table-wrap">
        <table class="termos-table">
          <thead><tr><th>Data</th><th>Colaborador</th><th>Compra</th><th>Valor</th><th>Parcelas</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody id="termosCelularBody"></tbody>
        </table>
      </div>
    </div>
    <div id="termosTabVeiculos" class="mt-16" style="display:none">
      <div class="termos-empty" style="padding:32px;text-align:center;color:var(--muted)">Módulo em desenvolvimento.</div>
    </div>
    <span class="termos-feedback mt-8" id="termosFeedbackMain"></span>
  </section>
  <div class="termos-modal" id="termosModal"></div>`;

  document.querySelectorAll('[data-termos-tab]').forEach(b=>b.onclick=()=>{
    state.tab=b.dataset.termosTab;
    document.querySelectorAll('[data-termos-tab]').forEach(x=>x.classList.toggle('active',x===b));
    document.getElementById('termosTabCelular').style.display=state.tab==='celular'?'block':'none';
    document.getElementById('termosTabVeiculos').style.display=state.tab==='veiculos'?'block':'none';
  });
  document.getElementById('termosRefresh').onclick=loadCelular;
  await loadCelular();
});
