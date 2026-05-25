import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const EPI_LISTA = [
  { material:'CAPACETE',           label:'Capacete',           ca_obrigatorio:true  },
  { material:'OCULOS DE PROTEÇÃO', label:'Óculos de Proteção', ca_obrigatorio:true  },
  { material:'PROTETOR AURICULAR', label:'Protetor Auricular', ca_obrigatorio:true  },
  { material:'MASCARA PFF2',       label:'Máscara PFF2',       ca_obrigatorio:true  },
  { material:'COLETE REFLETIVO',   label:'Colete Refletivo',   ca_obrigatorio:false },
  { material:'LUVA MULTITATO PU',  label:'Luva Multitato PU',  ca_obrigatorio:true  },
  { material:'BOTINA',             label:'Botina',             ca_obrigatorio:true,  temTamanho:true },
  { material:'CINTO DE SEGURANÇA', label:'Cinto de Segurança', ca_obrigatorio:true  },
  { material:'TALABARTE',          label:'Talabarte',          ca_obrigatorio:true  },
];

const state = { rows:[], filter:'pendente', solicitacoes:[] };

const esc = (v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate = (v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
const norm = (v)=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const today = ()=>new Date().toISOString().slice(0,10);

function setMsg(msg,err=false){const el=document.getElementById('epiFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
function setSolMsg(msg,err=false){const el=document.getElementById('epiSolFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
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

// ── REGISTROS DE ENTREGA ──────────────────────────────────────────────────────
async function loadRows(){
  state.rows=await safe(()=>supabase.from('rh_epi_registros').select('*').order('created_at',{ascending:false}).limit(500));
  renderKpis();
  renderTabela();
}

function renderKpis(){
  const pendentes=state.rows.filter(r=>r.status==='pendente').length;
  const confirmados=state.rows.filter(r=>r.status==='ok').length;
  const solAbertas=state.solicitacoes.filter(s=>s.status!=='comprado'&&s.status!=='recusado').length;
  document.getElementById('kpiPendentes').textContent=pendentes;
  document.getElementById('kpiConfirmados').textContent=confirmados;
  document.getElementById('kpiTotal').textContent=state.rows.length;
  document.getElementById('kpiSolPendentes').textContent=solAbertas;
}

function filteredRows(){
  if(state.filter==='todos') return state.rows;
  return state.rows.filter(r=>r.status===state.filter);
}

function renderTabela(){
  const body=document.getElementById('epiBody');
  const rows=filteredRows();
  if(!rows.length){body.innerHTML=`<tr><td colspan="5" class="epi-empty">Nenhum registro encontrado.</td></tr>`;return;}
  body.innerHTML=rows.map(r=>`<tr>
    <td>${brDate(r.data_entrega||r.created_at)}</td>
    <td><b>${esc(r.colaborador_nome||'-')}</b>${r.colaborador_id?`<br><small class="muted">${esc(r.colaborador_id)}</small>`:''}</td>
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
  const map={
    pendente:['#fde68a','rgba(245,158,11,.1)','Pendente'],
    ok:['#bbf7d0','rgba(22,101,52,.18)','Confirmado'],
    em_cotacao:['#93c5fd','rgba(59,130,246,.12)','Em cotação'],
    em_analise:['#c4b5fd','rgba(139,92,246,.12)','Em análise'],
    pendente_pagamento:['#fde68a','rgba(245,158,11,.1)','Pend. Pagamento'],
    aguardando_nf:['#fde68a','rgba(245,158,11,.1)','Aguard. NF'],
    comprado:['#bbf7d0','rgba(22,101,52,.18)','Comprado'],
    recusado:['#fecaca','rgba(220,38,38,.12)','Recusado'],
  };
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
      await supabase.from('rh_epi_registros').update({status:'ok',observacao:obs,anexo_url,confirmado_em:new Date().toISOString()}).eq('id',r.id);
      modal.classList.remove('open');
      setMsg('EPI confirmado.');
      await loadRows();
    }catch(e){setMsg(e.message,true);}finally{btn.disabled=false;}
  };
}

// ── SOLICITAÇÕES DE COMPRA ────────────────────────────────────────────────────
async function loadSolicitacoes(){
  state.solicitacoes=await safe(()=>
    supabase.from('compras_solicitacoes')
      .select('*, compras_itens(*)')
      .eq('tipo_solicitacao','epi_rh')
      .order('created_at',{ascending:false})
      .limit(200)
  );
  renderKpis();
  renderSolicitacoes();
}

function renderSolicitacoes(){
  const body=document.getElementById('epiSolBody');
  if(!body) return;
  if(!state.solicitacoes.length){
    body.innerHTML=`<tr><td colspan="5" class="epi-empty">Nenhuma solicitação de compra. Clique em <b>+ Adicionar</b> para criar.</td></tr>`;
    return;
  }
  body.innerHTML=state.solicitacoes.map(s=>{
    const itens=s.compras_itens||[];
    const colab=itens[0]?.colaborador_nome||'-';
    const itensHtml=itens.map(i=>{
      const caTag=i.ca
        ?`<span style="color:#86efac;font-size:11px;font-weight:700"> · CA: ${esc(i.ca)}</span>`
        :(norm(i.material)==='colete refletivo'
          ?`<span style="color:#94a3b8;font-size:11px"> · CA não obrigatório</span>`
          :`<span style="color:#fde68a;font-size:11px"> · CA pendente</span>`);
      return `<div style="font-size:13px">${esc(i.material)}${i.tamanho?` <small class="muted">T:${esc(i.tamanho)}</small>`:''}${caTag}</div>`;
    }).join('');
    return `<tr>
      <td>${brDate(s.data_solicitacao||s.created_at)}</td>
      <td><b>${esc(colab)}</b></td>
      <td style="max-width:280px;line-height:1.8">${itensHtml||'-'}</td>
      <td>${statusPill(s.status||'pendente')}</td>
      <td><button class="btn btn-small btn-secondary" data-sol-ver="${esc(s.id)}" type="button">Ver</button></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-sol-ver]').forEach(b=>b.onclick=()=>openSolicitacaoModal(b.dataset.solVer));
}

function openSolicitacaoModal(id){
  const s=state.solicitacoes.find(x=>String(x.id)===String(id)); if(!s) return;
  const itens=s.compras_itens||[];
  const modal=document.getElementById('epiModal');
  modal.innerHTML=`<div class="epi-modal-card">
    <div class="section-head">
      <div><h3>Solicitação de Compra EPI</h3><p class="muted">${brDate(s.data_solicitacao||s.created_at)} · ${statusPill(s.status||'pendente')}</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="epi-detail-grid mt-16">
      <div><span class="muted">Colaborador</span><b>${esc(itens[0]?.colaborador_nome||'-')}</b></div>
      <div><span class="muted">Solicitado por</span><b>${esc(s.solicitante||'RH')}</b></div>
      <div><span class="muted">Data</span><b>${brDate(s.data_solicitacao||s.created_at)}</b></div>
      <div><span class="muted">Status</span>${statusPill(s.status||'pendente')}</div>
    </div>
    <div class="mt-16">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:10px">Itens solicitados</p>
      <div style="display:grid;gap:8px">
        ${itens.map(i=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid rgba(148,163,184,.2);border-radius:12px">
          <span><b>${esc(i.material)}</b>${i.tamanho?` <small class="muted">Tam: ${esc(i.tamanho)}</small>`:''}</span>
          <span>${i.ca
            ?`<span style="color:#86efac;font-weight:700;font-size:13px">CA: ${esc(i.ca)}</span>`
            :(norm(i.material)==='colete refletivo'
              ?`<span style="color:#94a3b8;font-size:12px">CA não obrigatório</span>`
              :`<span style="color:#fde68a;font-size:12px">CA pendente</span>`)
          }</span>
        </div>`).join('')}
      </div>
    </div>
    ${s.observacoes?`<div class="mt-16"><span class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Observação</span><p style="margin-top:6px">${esc(s.observacoes)}</p></div>`:''}
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
}

function openNovasSolicitacaoModal(userContext){
  const modal=document.getElementById('epiModal');
  let selectedColab=null;
  let debounce=null;

  modal.innerHTML=`<div class="epi-modal-card" style="width:min(620px,100%)">
    <div class="section-head">
      <div><h3>Nova Solicitação de Compra EPI</h3><p class="muted">Selecione o colaborador e marque os EPIs necessários.</p></div>
      <button class="btn btn-secondary" id="mClose" type="button">Fechar</button>
    </div>
    <div class="mt-16" style="position:relative">
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:700">
        Colaborador <span style="color:#fde68a;font-size:11px;text-transform:none;letter-spacing:0">* obrigatório</span>
        <input id="solColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" style="width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;font-size:14px;text-transform:none;letter-spacing:0">
      </label>
      <div id="solColabSug" class="epi-colab-sug"></div>
    </div>
    <div class="mt-20">
      <p style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:12px">EPIs — marque os que precisam ser comprados</p>
      <div style="display:grid;gap:8px">
        ${EPI_LISTA.map((epi,idx)=>`<label class="epi-check-row" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid rgba(148,163,184,.18);border-radius:12px;cursor:pointer;background:#0d0d18">
          <input type="checkbox" id="epiCheck_${idx}" value="${esc(epi.material)}" style="width:18px;height:18px;flex-shrink:0;accent-color:#4ade80;cursor:pointer">
          <span style="flex:1;font-weight:600;font-size:14px">${esc(epi.label)}</span>
          ${epi.temTamanho?`<input type="number" id="epiTam_${idx}" placeholder="Nº tamanho" min="30" max="50" onclick="event.stopPropagation()" style="width:100px;border:1px solid rgba(148,163,184,.24);background:#15152a;color:#e2e2f0;border-radius:10px;padding:7px 10px;font-size:13px">`:``}
          ${!epi.ca_obrigatorio?`<span style="font-size:11px;color:#94a3b8;white-space:nowrap">CA não obrig.</span>`:''}
        </label>`).join('')}
      </div>
    </div>
    <div class="mt-16">
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:700">
        Observações <span style="text-transform:none;letter-spacing:0;font-weight:400">(opcional)</span>
        <textarea id="solObs" rows="2" placeholder="Informações adicionais..." style="width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;font-size:14px;text-transform:none;letter-spacing:0;resize:vertical"></textarea>
      </label>
    </div>
    <div class="adm-cmp-actions mt-16">
      <button class="btn btn-primary" id="solSolicitar" type="button">Solicitar</button>
      <button class="btn btn-secondary" id="solCancelar" type="button">Cancelar</button>
    </div>
    <span class="epi-feedback mt-8" id="solModalFeedback"></span>
  </div>`;
  modal.classList.add('open');

  const input=modal.querySelector('#solColabInput');
  const sug=modal.querySelector('#solColabSug');

  input.addEventListener('input',()=>{
    selectedColab=null;
    const q=input.value.trim();
    if(q.length<2){sug.innerHTML='';sug.style.display='none';return;}
    clearTimeout(debounce);
    debounce=setTimeout(async()=>{
      const {data}=await supabase.from('colaborador_snapshot').select('id,nome,cargo,tipo,ativo').ilike('nome',`%${q}%`).order('nome',{ascending:true}).limit(60);
      const seen=new Set();
      const list=(data||[]).filter(c=>{
        const t=norm(c.ativo??'ativo');
        if(['false','0','inativo','desligado'].includes(t)) return false;
        const k=norm(c.nome||'');
        if(seen.has(k)) return false;
        seen.add(k); return true;
      }).slice(0,12);
      if(!list.length){sug.innerHTML='';sug.style.display='none';return;}
      sug.innerHTML=list.map(c=>`<button type="button" data-cid="${esc(c.id)}" data-cnome="${esc(c.nome)}">${esc(c.nome)} <small>${esc(c.cargo||c.tipo||'')}</small></button>`).join('');
      sug.style.display='block';
      sug.querySelectorAll('button').forEach(b=>b.onmousedown=(ev)=>{
        ev.preventDefault();
        selectedColab={id:b.dataset.cid,nome:b.dataset.cnome};
        input.value=b.dataset.cnome;
        sug.innerHTML=''; sug.style.display='none';
      });
    },250);
  });
  input.addEventListener('blur',()=>setTimeout(()=>{sug.innerHTML='';sug.style.display='none';},160));

  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#solCancelar').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#solSolicitar').onclick=()=>salvarSolicitacaoEPI(modal,userContext,()=>selectedColab,input);
}

async function salvarSolicitacaoEPI(modal,userContext,getColab,colabInput){
  const btn=modal.querySelector('#solSolicitar');
  const fb=modal.querySelector('#solModalFeedback');
  btn.disabled=true;
  if(fb){fb.textContent='Salvando...';fb.classList.remove('err');}
  try{
    const colab=getColab()||(colabInput.value.trim()?{id:null,nome:colabInput.value.trim()}:null);
    if(!colab) throw new Error('Selecione o colaborador.');

    const checkedEpis=EPI_LISTA.map((epi,idx)=>{
      const checked=modal.querySelector(`#epiCheck_${idx}`)?.checked;
      if(!checked) return null;
      const tamanho=epi.temTamanho?(modal.querySelector(`#epiTam_${idx}`)?.value?.trim()||null):null;
      if(epi.temTamanho&&!tamanho) throw new Error(`Informe o tamanho da ${epi.label}.`);
      return {material:epi.material, tamanho, tipo:'EPI'};
    }).filter(Boolean);

    if(!checkedEpis.length) throw new Error('Marque pelo menos um EPI antes de solicitar.');

    const obs=modal.querySelector('#solObs')?.value?.trim()||null;
    const u=userContext?.user||{};

    const header={
      data_solicitacao:today(),
      solicitante:u.name||u.email||'RH',
      solicitante_id:u.id||null,
      tipo_solicitacao:'epi_rh',
      status:'pendente',
      observacoes:obs,
      coordenacao:'RH',
      created_by:u.id||null,
    };

    let {data:sol,error:solErr}=await supabase.from('compras_solicitacoes').insert(header).select('id').single();
    if(solErr){
      // compatibilidade com colunas que podem não existir
      const limpo={data_solicitacao:header.data_solicitacao,solicitante:header.solicitante,tipo_solicitacao:header.tipo_solicitacao,status:header.status};
      const r2=await supabase.from('compras_solicitacoes').insert(limpo).select('id').single();
      if(r2.error) throw r2.error;
      sol=r2.data;
    }

    const itens=checkedEpis.map(epi=>({
      solicitacao_id:sol.id,
      material:epi.material,
      tipo:'EPI',
      tamanho:epi.tamanho||null,
      quantidade:1,
      unidade:1,
      colaborador_id:colab.id||null,
      colaborador_nome:colab.nome||null,
      status:'pendente',
    }));
    const {error:itensErr}=await supabase.from('compras_itens').insert(itens);
    if(itensErr) throw itensErr;

    await notifyCompras(`Nova solicitação de EPI — RH\nColaborador: ${colab.nome}\nItens: ${checkedEpis.map(e=>e.material+(e.tamanho?` (${e.tamanho})`:'') ).join(', ')}`);

    modal.classList.remove('open');
    setSolMsg('Solicitação enviada ao setor de Compras.');
    await Promise.all([loadRows(),loadSolicitacoes()]);
  }catch(e){
    if(fb){fb.textContent=e.message;fb.classList.add('err');}
  }finally{btn.disabled=false;}
}

// ── ESTILOS ───────────────────────────────────────────────────────────────────
function styles(){return `<style>
.epi-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.epi-table{width:100%;border-collapse:collapse;min-width:680px}.epi-table th,.epi-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}.epi-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.epi-empty{text-align:center;color:var(--muted)}.epi-acoes{display:flex;gap:8px;flex-wrap:wrap}.epi-link{color:#86efac;text-decoration:underline;font-size:12px}.epi-feedback{font-weight:700;display:block}.epi-feedback.err{color:#fecaca}
.epi-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.epi-modal.open{display:flex}.epi-modal-card{width:min(700px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}.epi-detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.epi-detail-grid>div{display:flex;flex-direction:column;gap:4px}.epi-detail-grid .muted{font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.adm-cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-cmp-grid input,.adm-cmp-grid textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-grid input[type=file]{padding:9px 12px;cursor:pointer}.adm-cmp-full{grid-column:1/-1}.adm-cmp-actions{display:flex;gap:10px;flex-wrap:wrap}
.epi-filter-tabs{display:flex;gap:8px;flex-wrap:wrap}.epi-filter-tabs .active{background:#166534!important;color:#fff!important}
.mt-20{margin-top:20px}
.epi-check-row:hover{background:#12122a!important;border-color:rgba(74,222,128,.3)!important}
.epi-colab-sug{display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,.38);max-height:220px;overflow:auto;margin-top:4px}.epi-colab-sug button{text-align:left;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:9px;cursor:pointer;width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px}.epi-colab-sug button small{color:var(--muted);font-weight:800}
@media(max-width:640px){.epi-detail-grid{grid-template-columns:1fr}}
</style>`}

// ── INIT ──────────────────────────────────────────────────────────────────────
initProtectedPage('EPI', async (content, userContext)=>{
  content.innerHTML=`${styles()}
  <section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>EPI</h2><p>Registro, controle e solicitação de compra de Equipamentos de Proteção Individual.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  <section class="grid-cards mt-16">
    <article class="card"><h3>Pend. de entrega</h3><p class="metric" id="kpiPendentes">0</p><p class="muted">Aguardando confirmação.</p></article>
    <article class="card"><h3>Confirmados</h3><p class="metric" id="kpiConfirmados">0</p><p class="muted">Entrega confirmada com OK.</p></article>
    <article class="card"><h3>Total registros</h3><p class="metric" id="kpiTotal">0</p><p class="muted">Total de registros de entrega.</p></article>
    <article class="card"><h3>Compras abertas</h3><p class="metric" id="kpiSolPendentes">0</p><p class="muted">Solicitações em andamento.</p></article>
  </section>

  <section class="card mt-16">
    <div class="section-head">
      <div><h3>Solicitações de Compra EPI</h3><p class="muted">Solicitações do RH ao setor de Compras. O CA retorna automaticamente após a compra.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="epiNovaSol" type="button">+ Adicionar</button>
        <button class="btn btn-secondary" id="epiSolRefresh" type="button">Atualizar</button>
      </div>
    </div>
    <div class="epi-table-wrap mt-16">
      <table class="epi-table">
        <thead><tr><th>Data</th><th>Colaborador</th><th>EPIs / CA</th><th>Status</th><th></th></tr></thead>
        <tbody id="epiSolBody"><tr><td colspan="5" class="epi-empty">Carregando...</td></tr></tbody>
      </table>
    </div>
    <span class="epi-feedback mt-8" id="epiSolFeedback"></span>
  </section>

  <section class="card mt-16">
    <div class="section-head">
      <div><h3>Registros de Entrega EPI</h3><p class="muted">Clique em OK para confirmar entrega e anexar comprovante.</p></div>
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

  document.getElementById('epiNovaSol').onclick=()=>openNovasSolicitacaoModal(userContext);
  document.getElementById('epiSolRefresh').onclick=loadSolicitacoes;
  document.getElementById('epiRefresh').onclick=loadRows;
  document.querySelectorAll('[data-ef]').forEach(b=>b.onclick=()=>{
    state.filter=b.dataset.ef;
    document.querySelectorAll('[data-ef]').forEach(x=>x.classList.toggle('active',x===b));
    renderTabela();
  });

  await Promise.all([loadRows(), loadSolicitacoes()]);
});
