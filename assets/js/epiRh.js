import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const state = { rows:[], filter:'pendente' };
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
function setMsg(msg,err=false){const el=document.getElementById('epiFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
async function safe(fn,fallback=[]){try{const {data,error}=await fn(); if(error) throw error; return data||fallback;}catch(e){console.warn(e);return fallback;}}

function safeFileName(name){return String(name||'arquivo').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);}
async function uploadAnexo(file){
  if(!file) return '';
  const ano=new Date().getFullYear();
  const path=`rh-epi/${ano}/${Date.now()}_${safeFileName(file.name)}`;
  const {error}=await supabase.storage.from('notas-fiscais').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);
  const {data}=supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl||path;
}

async function loadRows(){
  const q=supabase.from('rh_epi_registros').select('*').order('created_at',{ascending:false}).limit(500);
  const data=await safe(()=>q);
  state.rows=data;
  renderKpis();
  renderTabela();
}

function renderKpis(){
  const pendentes=state.rows.filter(r=>r.status==='pendente').length;
  const confirmados=state.rows.filter(r=>r.status==='ok').length;
  const total=state.rows.length;
  document.getElementById('kpiPendentes').textContent=pendentes;
  document.getElementById('kpiConfirmados').textContent=confirmados;
  document.getElementById('kpiTotal').textContent=total;
}

function filteredRows(){
  if(state.filter==='todos') return state.rows;
  return state.rows.filter(r=>r.status===state.filter);
}

function renderTabela(){
  const body=document.getElementById('epiBody');
  const rows=filteredRows();
  if(!rows.length){
    body.innerHTML=`<tr><td colspan="5" class="epi-empty">Nenhum registro encontrado.</td></tr>`;
    return;
  }
  body.innerHTML=rows.map(r=>`<tr>
    <td>${brDate(r.data_entrega||r.created_at)}</td>
    <td>
      <b>${esc(r.colaborador_nome||'-')}</b>
      ${r.colaborador_id?`<br><small class="muted">${esc(r.colaborador_id)}</small>`:''}
    </td>
    <td>${esc(r.epi||'-')}${r.ca?`<br><small class="muted">CA: ${esc(r.ca)}</small>`:''}</td>
    <td>${statusPill(r.status)}${r.anexo_url?`<br><a class="epi-link" href="${esc(r.anexo_url)}" target="_blank">Ver anexo</a>`:''}</td>
    <td class="epi-acoes">
      <button class="btn btn-small btn-secondary" data-ver="${esc(r.id)}" type="button">Ver</button>
      ${r.status==='pendente'?`<button class="btn btn-small btn-primary" data-ok="${esc(r.id)}" type="button">OK</button>`:''}
    </td>
  </tr>`).join('');
  body.querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>openModal(b.dataset.ver));
  body.querySelectorAll('[data-ok]').forEach(b=>b.onclick=()=>abrirConfirmar(b.dataset.ok));
}

function statusPill(s){
  const map={pendente:['#fde68a','rgba(245,158,11,.1)','Pendente'],ok:['#bbf7d0','rgba(22,101,52,.18)','Confirmado']};
  const [color,bg,label]=map[s]||['#cbd5e1','rgba(148,163,184,.1)',s||'-'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${color};background:${bg};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function openModal(id){
  const r=state.rows.find(x=>String(x.id)===String(id)); if(!r) return;
  const modal=document.getElementById('epiModal');
  modal.innerHTML=`<div class="epi-modal-card">
    <div class="section-head">
      <div><h3>Detalhes do EPI</h3><p class="muted">${brDate(r.data_entrega||r.created_at)} · ${statusPill(r.status)}</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="epi-detail-grid mt-16">
      <div><span class="muted">Colaborador</span><b>${esc(r.colaborador_nome||'-')}</b></div>
      <div><span class="muted">EPI</span><b>${esc(r.epi||'-')}</b></div>
      <div><span class="muted">CA (Certificado de Aprovação)</span><b>${esc(r.ca||'Não informado')}</b></div>
      <div><span class="muted">Quantidade</span><b>${esc(r.quantidade||1)}</b></div>
      <div><span class="muted">Data de entrega</span><b>${brDate(r.data_entrega||r.created_at)}</b></div>
      <div><span class="muted">Status</span>${statusPill(r.status)}</div>
    </div>
    ${r.observacao?`<div class="mt-16"><span class="muted">Observação</span><p>${esc(r.observacao)}</p></div>`:''}
    ${r.anexo_url?`<div class="mt-16"><a class="btn btn-secondary" href="${esc(r.anexo_url)}" target="_blank">Abrir anexo</a></div>`:''}
    ${r.status==='pendente'?`<div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="mOk" type="button">Confirmar OK</button></div>`:''}
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#mOk')?.addEventListener('click',()=>{modal.classList.remove('open'); abrirConfirmar(id);});
}

function abrirConfirmar(id){
  const r=state.rows.find(x=>String(x.id)===String(id)); if(!r) return;
  const modal=document.getElementById('epiModal');
  modal.innerHTML=`<div class="epi-modal-card">
    <div class="section-head">
      <div><h3>Confirmar entrega de EPI</h3><p class="muted">${esc(r.colaborador_nome||'-')} · ${esc(r.epi||'-')}${r.ca?` · CA ${esc(r.ca)}`:''}</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="adm-cmp-grid mt-16">
      <label class="adm-cmp-full">Observação (opcional)<input id="okObs" placeholder="Ex: colaborador assinou o recibo..."></label>
      <label class="adm-cmp-full">Anexar comprovante (assinatura, foto, etc.)<input id="okFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
    </div>
    <div class="adm-cmp-actions mt-16">
      <button class="btn btn-primary" id="okConfirmar" type="button">Confirmar OK</button>
      <button class="btn btn-secondary" id="okCancelar" type="button">Cancelar</button>
    </div>
    <span class="epi-feedback" id="epiFeedback"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#okCancelar').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#okConfirmar').onclick=async()=>{
    const btn=modal.querySelector('#okConfirmar');
    btn.disabled=true;
    setMsg('Salvando...');
    try{
      const obs=modal.querySelector('#okObs')?.value?.trim()||null;
      const file=modal.querySelector('#okFile')?.files?.[0]||null;
      let anexo_url=r.anexo_url||null;
      if(file) anexo_url=await uploadAnexo(file);
      await supabase.from('rh_epi_registros').update({status:'ok', observacao:obs, anexo_url, confirmado_em:new Date().toISOString()}).eq('id',r.id);
      modal.classList.remove('open');
      setMsg('EPI confirmado.');
      await loadRows();
    }catch(e){setMsg(e.message,true);}finally{btn.disabled=false;}
  };
}

function styles(){return `<style>
.epi-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.epi-table{width:100%;border-collapse:collapse;min-width:680px}.epi-table th,.epi-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}.epi-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.epi-empty{text-align:center;color:var(--muted)}.epi-acoes{display:flex;gap:8px;flex-wrap:wrap}.epi-link{color:#86efac;text-decoration:underline;font-size:12px}.epi-feedback{font-weight:700}.epi-feedback.err{color:#fecaca}
.epi-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.epi-modal.open{display:flex}.epi-modal-card{width:min(700px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}.epi-detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.epi-detail-grid>div{display:flex;flex-direction:column;gap:4px}.epi-detail-grid .muted{font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.adm-cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-cmp-grid input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-grid input[type=file]{padding:9px 12px;cursor:pointer}.adm-cmp-full{grid-column:1/-1}.adm-cmp-actions{display:flex;gap:10px;flex-wrap:wrap}
.epi-filter-tabs{display:flex;gap:8px;flex-wrap:wrap}.epi-filter-tabs .active{background:#166534!important;color:#fff!important}
@media(max-width:640px){.epi-detail-grid{grid-template-columns:1fr}}
</style>`}

initProtectedPage('EPI', async (content)=>{
  content.innerHTML=`${styles()}
  <section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>EPI</h2><p>Registro e controle de entrega de Equipamentos de Proteção Individual por colaborador.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  <section class="grid-cards mt-16">
    <article class="card"><h3>Pendentes</h3><p class="metric" id="kpiPendentes">0</p><p class="muted">Aguardando confirmação de entrega.</p></article>
    <article class="card"><h3>Confirmados</h3><p class="metric" id="kpiConfirmados">0</p><p class="muted">Entrega confirmada com OK.</p></article>
    <article class="card"><h3>Total</h3><p class="metric" id="kpiTotal">0</p><p class="muted">Total de registros.</p></article>
  </section>
  <section class="card mt-16">
    <div class="section-head">
      <div><h3>Registros de EPI</h3><p class="muted">DATA | Colaborador | Ações. Clique em OK para confirmar entrega e anexar comprovante.</p></div>
      <button class="btn btn-secondary" id="epiRefresh" type="button">Atualizar</button>
    </div>
    <div class="epi-filter-tabs mt-16">
      <button class="btn btn-secondary active" data-ef="pendente" type="button">Pendentes</button>
      <button class="btn btn-secondary" data-ef="ok" type="button">Confirmados</button>
      <button class="btn btn-secondary" data-ef="todos" type="button">Todos</button>
    </div>
    <div class="epi-table-wrap mt-16">
      <table class="epi-table">
        <thead><tr><th>Data</th><th>Colaborador</th><th>EPI / CA</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody id="epiBody"></tbody>
      </table>
    </div>
    <span class="epi-feedback mt-8" id="epiFeedback"></span>
  </section>
  <div class="epi-modal" id="epiModal"></div>`;

  document.querySelectorAll('[data-ef]').forEach(b=>b.onclick=()=>{
    state.filter=b.dataset.ef;
    document.querySelectorAll('[data-ef]').forEach(x=>x.classList.toggle('active',x===b));
    renderTabela();
  });
  document.getElementById('epiRefresh').onclick=loadRows;
  await loadRows();
});
