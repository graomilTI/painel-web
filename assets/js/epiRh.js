import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

const EPI_LISTA = [
  { material:'CAPACETE', label:'Capacete', ca_obrigatorio:true },
  { material:'OCULOS DE PROTEÇÃO', label:'Óculos de Proteção', ca_obrigatorio:true },
  { material:'PROTETOR AURICULAR', label:'Protetor Auricular', ca_obrigatorio:true },
  { material:'MASCARA PFF2', label:'Máscara PFF2', ca_obrigatorio:true },
  { material:'COLETE REFLETIVO', label:'Colete Refletivo', ca_obrigatorio:false },
  { material:'LUVA MULTITATO PU', label:'Luva Multitato PU', ca_obrigatorio:true },
  { material:'BOTINA', label:'Botina', ca_obrigatorio:true, temTamanho:true },
  { material:'CINTO DE SEGURANÇA', label:'Cinto de Segurança', ca_obrigatorio:true },
  { material:'TALABARTE', label:'Talabarte', ca_obrigatorio:true },
];

const EMPREGADOR_EPI = {
  razao:'GRAOMIL LTDA',
  cnpj:'29.666.679/0001-34',
  endereco:'AV BRASIL, nº 2732, APT 01, SAO CRISTOVAO, Cascavel - PR, CEP 85816-294',
};

const state = { solicitacoes:[], solFilter:'aguardando_gestor' };

const esc = (v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate = (v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-';};
const norm = (v)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const today = ()=>new Date().toISOString().slice(0,10);
const money = (v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

function setSolMsg(msg,err=false){const el=document.getElementById('epiSolFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err);}}
async function safe(fn,fallback=[]){try{const {data,error}=await fn(); if(error) throw error; return data||fallback;}catch(e){console.warn(e);return fallback;}}

function getAny(obj={}, keys=[]){
  if(!obj) return '';
  for(const key of keys){
    if(obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') return obj[key];
  }
  const wanted = keys.map(norm);
  for(const [k,v] of Object.entries(obj)){
    if(wanted.includes(norm(k)) && v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function normalizarColaborador(c={}){
  return {
    id:getAny(c,['id','colaborador_id','codigo','matricula']) || null,
    nome:getAny(c,['nome','colaborador_nome','funcionario','funcionário','nome_completo']) || '',
    cpf:getAny(c,['cpf','CPF']) || '',
    rg:getAny(c,['rg','RG']) || '',
    data_nascimento:getAny(c,['data_nascimento','data_nasc','nascimento','Data Nasc.','data de nascimento']) || '',
    funcao:getAny(c,['funcao','função','Função','cargo','tipo']) || '',
    cargo:getAny(c,['cargo','Cargo','funcao','função','tipo']) || '',
    setor:getAny(c,['setor','Setor','departamento']) || '',
    supervisao:getAny(c,['supervisao','supervisão','Supervisão','SUPERVISAO','SUPERVISÃO','supervisor','responsavel','responsável']) || '',
    coordenacao:getAny(c,['coordenacao','coordenação','Coordenação','COORDENACAO','COORDENAÇÃO','regional']) || '',
    data_admissao:getAny(c,['data_admissao','admissao','admissão','Data Admissão','periodo','período']) || '',
    ativo:getAny(c,['ativo','status','situacao','situação']) || 'ativo',
  };
}

async function buscarColaboradoresPorNome(q){
  // 1ª tentativa: cache compartilhado (detalhes completos vêm depois em buscarColaboradorDetalhes)
  try{
    const cacheHits = await searchColaboradores(q,{limite:60});
    if(cacheHits.length) return cacheHits.map(normalizarColaborador);
  }catch(e){console.warn('[EPI] cache colaborador:', e.message||e);}
  const tentativas = [
    ()=>supabase.from('colaboradores').select('*').ilike('nome',`%${q}%`).order('nome',{ascending:true}).limit(60),
  ];
  for(const fn of tentativas){
    try{
      const {data,error}=await fn();
      if(error) throw error;
      if((data||[]).length) return data.map(normalizarColaborador);
    }catch(e){console.warn('[EPI] busca colaborador:', e.message||e);}
  }
  return [];
}

async function buscarColaboradorDetalhes(colab){
  if(!colab?.id && !colab?.nome) return normalizarColaborador(colab||{});
  const bases=['colaboradores'];
  for(const base of bases){
    try{
      let q=supabase.from(base).select('*').limit(1);
      q=colab.id ? q.eq('id',colab.id) : q.ilike('nome',colab.nome);
      const {data,error}=await q;
      if(error) throw error;
      if(data?.[0]) return normalizarColaborador({...colab,...data[0]});
    }catch(e){console.warn(`[EPI] detalhes ${base}:`, e.message||e);}
  }
  return normalizarColaborador(colab);
}

function dadosColaboradorSolicitacao(s={},itens=[]){
  const i=itens?.[0]||{};
  return {
    id:getAny(i,['colaborador_id'])||getAny(s,['colaborador_id'])||'',
    nome:getAny(i,['colaborador_nome'])||getAny(s,['colaborador_nome'])||'-',
    cpf:getAny(i,['colaborador_cpf'])||getAny(s,['colaborador_cpf'])||'',
    rg:getAny(i,['colaborador_rg'])||getAny(s,['colaborador_rg'])||'',
    data_nascimento:getAny(i,['colaborador_data_nascimento'])||getAny(s,['colaborador_data_nascimento'])||'',
    funcao:getAny(i,['colaborador_funcao'])||getAny(s,['colaborador_funcao'])||'',
    cargo:getAny(i,['colaborador_cargo'])||getAny(s,['colaborador_cargo'])||'',
    setor:getAny(i,['colaborador_setor'])||getAny(s,['colaborador_setor'])||'',
    supervisao:getAny(i,['colaborador_supervisao','supervisao','supervisão'])||getAny(s,['supervisao','supervisão','colaborador_supervisao'])||'',
    coordenacao:getAny(i,['colaborador_coordenacao','colaborador_coordenação'])||getAny(s,['coordenacao','coordenação','colaborador_coordenacao'])||'',
    data_admissao:getAny(i,['colaborador_data_admissao'])||getAny(s,['colaborador_data_admissao'])||'',
  };
}

async function loadSolicitacoes(){
  state.solicitacoes=await safe(()=>supabase.from('compras_solicitacoes').select('*, compras_itens(*)').eq('tipo_solicitacao','epi_rh').order('created_at',{ascending:false}).limit(200));
  renderSolicitacoes();
}

function solBucket(s){
  if(s.status==='concluido') return 'concluido';
  if(s.status==='cancelado') return 'cancelado';
  if(s.status==='comprado') return 'comprado';
  if(s.status==='recusado') return 'recusado';
  if(s.status==='aguardando_gestor') return 'aguardando_gestor';
  return 'pendente';
}

function statusPill(s){
  const map={aguardando_gestor:['#fde68a','rgba(245,158,11,.1)','Aguardando Gestor'],pendente:['#fde68a','rgba(245,158,11,.1)','Pendente'],ok:['#bbf7d0','rgba(22,101,52,.18)','Confirmado'],em_cotacao:['#93c5fd','rgba(59,130,246,.12)','Em cotação'],em_analise:['#c4b5fd','rgba(139,92,246,.12)','Em análise'],pendente_pagamento:['#fde68a','rgba(245,158,11,.1)','Pend. Pagamento'],aguardando_nf:['#fde68a','rgba(245,158,11,.1)','Aguard. NF'],aguardando_termo:['#fde68a','rgba(245,158,11,.1)','Aguard. Termo'],comprado:['#bbf7d0','rgba(22,101,52,.18)','Comprado'],concluido:['#a5b4fc','rgba(99,102,241,.14)','Concluído'],recusado:['#fecaca','rgba(220,38,38,.12)','Recusado'],cancelado:['#fecaca','rgba(220,38,38,.12)','Cancelado']};
  const [color,bg,label]=map[s]||['#cbd5e1','rgba(148,163,184,.1)',s||'-'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${color};background:${bg};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function renderSolicitacoes(){
  const body=document.getElementById('epiSolBody');
  if(!body) return;
  const lista=state.solFilter==='todos'?state.solicitacoes:state.solicitacoes.filter(s=>solBucket(s)===state.solFilter);
  if(!lista.length){body.innerHTML=`<tr><td colspan="6" class="epi-empty">${state.solicitacoes.length?'Nenhuma solicitação nesta aba.':'Nenhuma solicitação de compra. Clique em <b>+ Adicionar</b> para criar.'}</td></tr>`;return;}
  body.innerHTML=lista.map(s=>{
    const itens=s.compras_itens||[];
    const colab=dadosColaboradorSolicitacao(s,itens);
    const itensHtml=itens.map(i=>{
      const caTag=i.ca?`<span style="color:#86efac;font-size:11px;font-weight:700"> · CA: ${esc(i.ca)}</span>`:(norm(i.material)==='colete refletivo'?`<span style="color:#94a3b8;font-size:11px"> · CA não obrigatório</span>`:`<span style="color:#fde68a;font-size:11px"> · CA pendente</span>`);
      return `<div style="font-size:13px">${esc(i.material)}${i.tamanho?` <small class="muted">T:${esc(i.tamanho)}</small>`:''}${caTag}</div>`;
    }).join('');
    const bucket=solBucket(s);
    const podeCancelar=bucket!=='concluido'&&bucket!=='cancelado';
    return `<tr><td>${brDate(s.data_solicitacao||s.created_at)}</td><td><b>${esc(colab.nome)}</b>${colab.cpf?`<br><small class="muted">CPF: ${esc(colab.cpf)}</small>`:''}</td><td>${esc(colab.supervisao||'-')}${colab.coordenacao?`<br><small class="muted">${esc(colab.coordenacao)}</small>`:''}</td><td style="max-width:280px;line-height:1.8">${itensHtml||'-'}</td><td>${statusPill(s.status||'pendente')}</td><td class="epi-acoes"><button class="btn btn-small btn-secondary" data-sol-ver="${esc(s.id)}" type="button">Ver</button>${podeCancelar?`<button class="btn btn-small btn-secondary" data-sol-cancelar="${esc(s.id)}" type="button" style="color:#fecaca;border-color:rgba(220,38,38,.4)">Cancelar</button>`:''}</td></tr>`;
  }).join('');
  body.querySelectorAll('[data-sol-ver]').forEach(b=>b.onclick=()=>openSolicitacaoModal(b.dataset.solVer));
  body.querySelectorAll('[data-sol-cancelar]').forEach(b=>b.onclick=()=>cancelarSolicitacao(b.dataset.solCancelar));
}

async function cancelarSolicitacao(id){
  if(!confirm('Cancelar esta solicitação de EPI? Use quando o lançamento foi feito por engano.')) return;
  try{
    await supabase.from('compras_solicitacoes').update({status:'cancelado'}).eq('id',id);
    await supabase.from('compras_itens').update({status:'cancelado'}).eq('solicitacao_id',id);
    setSolMsg('Solicitação cancelada.');
    await loadSolicitacoes();
  }catch(e){ setSolMsg(e.message,true); }
}

function fichaEpiHtml(s,itens){
  const colab=dadosColaboradorSolicitacao(s,itens);
  const epis=[...(itens||[])].slice(0,12);
  while(epis.length<8) epis.push({material:'',ca:'',quantidade:''});
  const periodo=colab.data_admissao?`Desde ${brDate(colab.data_admissao)}`:'';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ficha de EPIs - ${esc(colab.nome)}</title><style>@page{size:A4;margin:12mm}body{font-family:"Times New Roman",serif;color:#111;font-size:12pt}.titulo{text-align:center;font-weight:bold;font-size:16pt;margin:0 0 26px}.box{border:1px solid #111;margin-bottom:16px}.sec{background:#ddd;border-bottom:1px solid #111;text-align:center;font-weight:bold;padding:4px}.row{display:grid;border-bottom:1px solid #111}.row:last-child{border-bottom:0}.cell{padding:5px;border-right:1px solid #111}.cell:last-child{border-right:0}.emp1{grid-template-columns:58% 42%}.func1{grid-template-columns:58% 20% 22%}.func2{grid-template-columns:29% 29% 17% 25%;text-align:center}.epi-table{width:100%;border-collapse:collapse}.epi-table th,.epi-table td{border:1px solid #111;padding:5px;text-align:left}.epi-table th{background:#eee}.recibo{line-height:1.25;padding:18px 38px 28px}.assinatura{margin-top:88px;text-align:center}.assinatura .linha{display:inline-block;border-top:1px solid #111;min-width:300px;padding-top:6px}.rodape{text-align:center;margin-top:16px}</style></head><body><h1 class="titulo">FICHA DE EPIs</h1><div class="box"><div class="sec">DADOS DO EMPREGADOR</div><div class="row emp1"><div class="cell"><strong>Razão Social:</strong> ${esc(EMPREGADOR_EPI.razao)}</div><div class="cell"><strong>CNPJ:</strong> ${esc(EMPREGADOR_EPI.cnpj)}</div></div><div class="row"><div class="cell"><strong>Endereço:</strong> ${esc(EMPREGADOR_EPI.endereco)}</div></div><div class="sec">FUNCIONÁRIO</div><div class="row"><div class="cell"><strong>Nome:</strong> ${esc(colab.nome)}</div></div><div class="row func1"><div class="cell"><strong>CPF:</strong> ${esc(colab.cpf)}</div><div class="cell"><strong>RG:</strong> ${esc(colab.rg)}</div><div class="cell"><strong>Data Nasc.:</strong> ${brDate(colab.data_nascimento)}</div></div><div class="row func2"><div class="cell"><strong>FUNÇÃO</strong></div><div class="cell"><strong>CARGO</strong></div><div class="cell"><strong>SETOR</strong></div><div class="cell"><strong>PERÍODO</strong></div></div><div class="row func2"><div class="cell">${esc(colab.funcao)}</div><div class="cell">${esc(colab.cargo)}</div><div class="cell">${esc(colab.setor)}</div><div class="cell">${esc(periodo)}</div></div></div><div class="box"><div class="sec">ENTREGA DE EPIs</div><table class="epi-table"><thead><tr><th style="width:46%">EPI</th><th style="width:18%">CA</th><th style="width:11%">Qtde.</th><th>Entrega</th></tr></thead><tbody>${epis.map(i=>`<tr><td>${esc(i.material||'_________________________________________')}</td><td>${esc(i.ca||'____________')}</td><td>${esc(i.quantidade||i.unidade||'_____')}</td><td>____/____/_________</td></tr>`).join('')}</tbody></table></div><div class="box"><div class="sec">RECIBO</div><div class="recibo"><p>Declaro que recebi da empresa os EPIs acima listados, bem como instruções de uso adequadas e treinamento apropriado.</p><p>Declaro ainda que me responsabilizo pelo uso correto destes equipamentos, e pela devolução em caso de desligamento, danos ao equipamento ou expiração da data de vencimento.</p><p>Por fim, declaro que recebi orientação adequada sobre os riscos à segurança apresentados pela minha função, responsabilizando-me por quaisquer danos causados pelo mau uso ou ausência dos equipamentos de proteção individual.</p></div></div><div class="assinatura"><div class="linha">${esc(colab.nome)}</div></div><div class="rodape">Ficha de entrega de Equipamento de Proteção Individual gerada pelo painel Grão 1000.</div></body></html>`;
}
function abrirFichaEpi(s,itens){
  const win=window.open('', '_blank', 'width=900,height=1100');
  if(!win){alert('Permita pop-ups para gerar a ficha.');return;}
  win.document.open(); win.document.write(fichaEpiHtml(s,itens)); win.document.close(); win.focus(); setTimeout(()=>win.print(),450);
}

function openSolicitacaoModal(id){
  const s=state.solicitacoes.find(x=>String(x.id)===String(id)); if(!s) return;
  const itens=s.compras_itens||[];
  const colab=dadosColaboradorSolicitacao(s,itens);
  const bucket=solBucket(s);
  const comprado=bucket==='comprado'||itens.every(i=>i.status==='comprado');
  const concluido=bucket==='concluido';
  const cancelado=bucket==='cancelado';
  const podeCancelar=!concluido&&!cancelado;
  const modal=document.getElementById('epiModal');
  modal.innerHTML=`<div class="epi-modal-card"><div class="section-head"><div><h3>Solicitação de Compra EPI</h3><p class="muted">${brDate(s.data_solicitacao||s.created_at)} · ${statusPill(s.status||'pendente')}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div><div class="epi-detail-grid mt-16"><div><span class="muted">Colaborador</span><b>${esc(colab.nome)}</b></div><div><span class="muted">Supervisão</span><b>${esc(colab.supervisao||'Não informada')}</b></div><div><span class="muted">Coordenação</span><b>${esc(colab.coordenacao||'-')}</b></div><div><span class="muted">Função/Cargo</span><b>${esc(colab.funcao||colab.cargo||'-')}</b></div><div><span class="muted">Solicitado por</span><b>${esc(s.solicitante||'RH')}</b></div><div><span class="muted">Status</span>${statusPill(s.status||'pendente')}</div></div><div class="mt-16"><p style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:10px">Itens solicitados</p><div style="display:grid;gap:8px">${itens.map(i=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid rgba(148,163,184,.2);border-radius:12px"><span><b>${esc(i.material)}</b>${i.tamanho?` <small class="muted">Tam: ${esc(i.tamanho)}</small>`:''}</span><span>${i.ca?`<span style="color:#86efac;font-weight:700;font-size:13px">CA: ${esc(i.ca)}</span>`:(norm(i.material)==='colete refletivo'?`<span style="color:#94a3b8;font-size:12px">CA não obrigatório</span>`:`<span style="color:#fde68a;font-size:12px">CA pendente</span>`)}</span></div>`).join('')}</div></div>${s.observacoes?`<div class="mt-16"><span class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Observação</span><p style="margin-top:6px">${esc(s.observacoes)}</p></div>`:''}<div class="adm-cmp-actions mt-16">${comprado&&!concluido?`<button class="btn btn-primary" id="gerarFichaEpi" type="button">Gerar ficha de EPI</button>`:''}${concluido?`<button class="btn btn-secondary" id="reabrirFichaEpi" type="button">Ver/reimprimir ficha</button>`:''}${podeCancelar?`<button class="btn btn-secondary" id="cancelarSolEpi" type="button" style="color:#fecaca;border-color:rgba(220,38,38,.4)">Cancelar pedido</button>`:''}</div><span class="epi-feedback mt-8" id="epiSolModalFb"></span></div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick=()=>modal.classList.remove('open');
  modal.querySelector('#reabrirFichaEpi')?.addEventListener('click',()=>abrirFichaEpi(s,itens));
  modal.querySelector('#cancelarSolEpi')?.addEventListener('click',async()=>{
    await cancelarSolicitacao(s.id);
    modal.classList.remove('open');
  });
  modal.querySelector('#gerarFichaEpi')?.addEventListener('click',async()=>{
    const btn=modal.querySelector('#gerarFichaEpi');
    const fb=modal.querySelector('#epiSolModalFb');
    abrirFichaEpi(s,itens);
    btn.disabled=true; if(fb) fb.textContent='Marcando como concluído...';
    try{
      await supabase.from('compras_solicitacoes').update({status:'concluido'}).eq('id',s.id);
      await supabase.from('compras_itens').update({status:'concluido'}).eq('solicitacao_id',s.id);
      modal.classList.remove('open');
      state.solFilter='concluido';
      document.querySelectorAll('[data-sf]').forEach(x=>x.classList.toggle('active',x.dataset.sf==='concluido'));
      await loadSolicitacoes();
    }catch(e){ if(fb){fb.textContent=e.message;fb.classList.add('err');} btn.disabled=false; }
  });
}

function openNovasSolicitacaoModal(userContext){
  const modal=document.getElementById('epiModal');
  let selectedColab=null;
  let debounce=null;
  modal.innerHTML=`<div class="epi-modal-card" style="width:min(620px,100%)"><div class="section-head"><div><h3>Nova Solicitação de Compra EPI</h3><p class="muted">Selecione o colaborador e marque os EPIs necessários.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div><div class="mt-16" style="position:relative"><label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:700">Colaborador <span style="color:#fde68a;font-size:11px;text-transform:none;letter-spacing:0">* obrigatório</span><input id="solColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" style="width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;font-size:14px;text-transform:none;letter-spacing:0"></label><div id="solColabInfo" class="epi-colab-info" style="display:none"></div><div id="solColabSug" class="epi-colab-sug"></div></div><div class="mt-20"><p style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin-bottom:12px">EPIs — marque os que precisam ser comprados</p><div style="display:grid;gap:8px">${EPI_LISTA.map((epi,idx)=>`<label class="epi-check-row" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid rgba(148,163,184,.18);border-radius:12px;cursor:pointer;background:#0d0d18"><input type="checkbox" id="epiCheck_${idx}" value="${esc(epi.material)}" style="width:18px;height:18px;flex-shrink:0;accent-color:#4ade80;cursor:pointer"><span style="flex:1;font-weight:600;font-size:14px">${esc(epi.label)}</span>${epi.temTamanho?`<input type="number" id="epiTam_${idx}" placeholder="Nº tamanho" min="30" max="50" onclick="event.stopPropagation()" style="width:100px;border:1px solid rgba(148,163,184,.24);background:#15152a;color:#e2e2f0;border-radius:10px;padding:7px 10px;font-size:13px">`:``}${!epi.ca_obrigatorio?`<span style="font-size:11px;color:#94a3b8;white-space:nowrap">CA não obrig.</span>`:''}</label>`).join('')}</div></div><div class="mt-16"><label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:700">Observações <span style="text-transform:none;letter-spacing:0;font-weight:400">(opcional)</span><textarea id="solObs" rows="2" placeholder="Informações adicionais..." style="width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;font-size:14px;text-transform:none;letter-spacing:0;resize:vertical"></textarea></label></div><div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="solSolicitar" type="button">Solicitar</button><button class="btn btn-secondary" id="solCancelar" type="button">Cancelar</button></div><span class="epi-feedback mt-8" id="solModalFeedback"></span></div>`;
  modal.classList.add('open');
  const input=modal.querySelector('#solColabInput');
  const sug=modal.querySelector('#solColabSug');
  const info=modal.querySelector('#solColabInfo');
  function renderColabInfo(c){
    if(!c){info.innerHTML=''; info.style.display='none'; return;}
    info.innerHTML=`<b>${esc(c.nome)}</b><br><small>Supervisão: ${esc(c.supervisao||'Não informada')}${c.coordenacao?` · Coordenação: ${esc(c.coordenacao)}`:''}${c.cargo?` · Cargo: ${esc(c.cargo)}`:''}</small>`;
    info.style.display='block';
  }
  input.addEventListener('input',()=>{
    selectedColab=null; renderColabInfo(null);
    const q=input.value.trim();
    if(q.length<2){sug.innerHTML='';sug.style.display='none';return;}
    clearTimeout(debounce);
    debounce=setTimeout(async()=>{
      const data=await buscarColaboradoresPorNome(q);
      const seen=new Set();
      const list=data.filter(c=>{const t=norm(c.ativo??'ativo'); if(['false','0','inativo','desligado'].includes(t)) return false; const k=norm(c.nome||''); if(seen.has(k)) return false; seen.add(k); return true;}).slice(0,12);
      if(!list.length){sug.innerHTML='';sug.style.display='none';return;}
      sug.innerHTML=list.map((c,idx)=>`<button type="button" data-idx="${idx}">${esc(c.nome)} <small>${esc(c.supervisao||c.cargo||c.coordenacao||'')}</small></button>`).join('');
      sug.style.display='block';
      sug.querySelectorAll('button').forEach(b=>b.onmousedown=async(ev)=>{ev.preventDefault(); selectedColab=await buscarColaboradorDetalhes(list[Number(b.dataset.idx)]); input.value=selectedColab.nome; renderColabInfo(selectedColab); sug.innerHTML=''; sug.style.display='none';});
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
  btn.disabled=true; if(fb){fb.textContent='Salvando...';fb.classList.remove('err');}
  try{
    const bruto=getColab()||(colabInput.value.trim()?{id:null,nome:colabInput.value.trim()}:null);
    if(!bruto) throw new Error('Selecione o colaborador.');
    const colab=await buscarColaboradorDetalhes(bruto);
    const checkedEpis=EPI_LISTA.map((epi,idx)=>{const checked=modal.querySelector(`#epiCheck_${idx}`)?.checked; if(!checked) return null; const tamanho=epi.temTamanho?(modal.querySelector(`#epiTam_${idx}`)?.value?.trim()||null):null; if(epi.temTamanho&&!tamanho) throw new Error(`Informe o tamanho da ${epi.label}.`); return {material:epi.material,tamanho,tipo:'EPI'};}).filter(Boolean);
    if(!checkedEpis.length) throw new Error('Marque pelo menos um EPI antes de solicitar.');
    const obs=modal.querySelector('#solObs')?.value?.trim()||null;
    const u=userContext?.user||{};
    const header={data_solicitacao:today(),solicitante:u.name||u.email||'RH',solicitante_id:u.id||null,tipo_solicitacao:'epi_rh',status:'aguardando_gestor',observacoes:obs,coordenacao:colab.coordenacao||'RH',supervisao:colab.supervisao||null,colaborador_id:colab.id||null,colaborador_nome:colab.nome||null,created_by:u.id||null};
    let {data:sol,error:solErr}=await supabase.from('compras_solicitacoes').insert(header).select('id').single();
    if(solErr){
      const limpo={data_solicitacao:header.data_solicitacao,solicitante:header.solicitante,tipo_solicitacao:header.tipo_solicitacao,status:header.status,coordenacao:header.coordenacao,observacoes:header.observacoes};
      const r2=await supabase.from('compras_solicitacoes').insert(limpo).select('id').single();
      if(r2.error) throw r2.error; sol=r2.data;
    }
    const itens=checkedEpis.map(epi=>({solicitacao_id:sol.id,material:epi.material,tipo:'EPI',tamanho:epi.tamanho||null,quantidade:1,unidade:1,colaborador_id:colab.id||null,colaborador_nome:colab.nome||null,colaborador_cpf:colab.cpf||null,colaborador_rg:colab.rg||null,colaborador_data_nascimento:colab.data_nascimento||null,colaborador_funcao:colab.funcao||null,colaborador_cargo:colab.cargo||null,colaborador_setor:colab.setor||null,colaborador_supervisao:colab.supervisao||null,colaborador_coordenacao:colab.coordenacao||null,colaborador_data_admissao:colab.data_admissao||null,status:'aguardando_gestor'}));
    const {error:itensErr}=await supabase.from('compras_itens').insert(itens);
    if(itensErr){
      const fallback=checkedEpis.map(epi=>({solicitacao_id:sol.id,material:epi.material,tipo:'EPI',tamanho:epi.tamanho||null,quantidade:1,unidade:1,colaborador_id:colab.id||null,colaborador_nome:colab.nome||null,status:'aguardando_gestor'}));
      const r2=await supabase.from('compras_itens').insert(fallback); if(r2.error) throw r2.error;
    }
    modal.classList.remove('open'); setSolMsg('Solicitação enviada para aprovação do gestor da supervisão.'); await loadSolicitacoes();
  }catch(e){if(fb){fb.textContent=e.message;fb.classList.add('err');}}
  finally{btn.disabled=false;}
}

function styles(){return `<style>.epi-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.epi-table{width:100%;border-collapse:collapse;min-width:760px}.epi-table th,.epi-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}.epi-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.epi-empty{text-align:center;color:var(--muted)}.epi-acoes{display:flex;gap:8px;flex-wrap:wrap}.epi-link{color:#86efac;text-decoration:underline;font-size:12px}.epi-feedback{font-weight:700;display:block}.epi-feedback.err{color:#fecaca}.epi-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.epi-modal.open{display:flex}.epi-modal-card{width:min(760px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}.epi-detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.epi-detail-grid>div{display:flex;flex-direction:column;gap:4px}.epi-detail-grid .muted{font-size:12px;text-transform:uppercase;letter-spacing:.04em}.adm-cmp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-cmp-grid input,.adm-cmp-grid textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}.adm-cmp-grid input[type=file]{padding:9px 12px;cursor:pointer}.adm-cmp-full{grid-column:1/-1}.adm-cmp-actions{display:flex;gap:10px;flex-wrap:wrap}.epi-filter-tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between}.epi-filter-tabs-group{display:flex;gap:8px;flex-wrap:wrap}.epi-filter-tabs .active{background:#166534!important;color:#fff!important}.epi-icon-btn{width:38px;height:38px;padding:0!important;display:inline-flex;align-items:center;justify-content:center;font-size:17px;line-height:1;flex:0 0 38px}.mt-20{margin-top:20px}.mt-8{margin-top:8px}.mt-16{margin-top:16px}.epi-check-row:hover{background:#12122a!important;border-color:rgba(74,222,128,.3)!important}.epi-colab-info{margin-top:8px;padding:10px 12px;border:1px solid rgba(74,222,128,.25);background:rgba(22,101,52,.12);border-radius:12px;color:#d1fae5}.epi-colab-info small{color:#bbf7d0}.epi-colab-sug{display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,.38);max-height:220px;overflow:auto;margin-top:4px}.epi-colab-sug button{text-align:left;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:9px;cursor:pointer;width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px}.epi-colab-sug button small{color:var(--muted);font-weight:800}@media(max-width:640px){.epi-detail-grid{grid-template-columns:1fr}}</style>`;}

export async function renderContent(content, userContext){
  content.innerHTML=`${styles()}<section class="card"><div class="section-head"><div><h3>Solicitações de Compra EPI</h3><p class="muted">Solicitações do RH, sujeitas à aprovação do gestor da supervisão antes de irem para Compras.</p></div></div><div class="epi-filter-tabs mt-16"><div class="epi-filter-tabs-group"><button class="btn btn-secondary active" data-sf="aguardando_gestor" type="button">Aguardando Gestor</button><button class="btn btn-secondary" data-sf="pendente" type="button">Pendentes</button><button class="btn btn-secondary" data-sf="comprado" type="button">Comprados</button><button class="btn btn-secondary" data-sf="concluido" type="button">Concluído</button><button class="btn btn-secondary" data-sf="cancelado" type="button">Cancelados</button><button class="btn btn-secondary" data-sf="todos" type="button">Todos</button></div><div class="epi-filter-tabs-group"><button class="btn btn-primary epi-icon-btn" id="epiNovaSol" type="button" title="Adicionar solicitação" aria-label="Adicionar solicitação">+</button><button class="btn btn-secondary epi-icon-btn" id="epiSolRefresh" type="button" title="Atualizar solicitações" aria-label="Atualizar solicitações">↻</button></div></div><div class="epi-table-wrap mt-16"><table class="epi-table"><thead><tr><th>Data</th><th>Colaborador</th><th>Supervisão</th><th>EPIs / CA</th><th>Status</th><th></th></tr></thead><tbody id="epiSolBody"><tr><td colspan="6" class="epi-empty">Carregando...</td></tr></tbody></table></div><span class="epi-feedback mt-8" id="epiSolFeedback"></span></section><div class="epi-modal" id="epiModal"></div>`;
  document.getElementById('epiNovaSol').onclick=()=>openNovasSolicitacaoModal(userContext);
  document.getElementById('epiSolRefresh').onclick=loadSolicitacoes;
  document.querySelectorAll('[data-sf]').forEach(b=>b.onclick=()=>{state.solFilter=b.dataset.sf; document.querySelectorAll('[data-sf]').forEach(x=>x.classList.toggle('active',x===b)); renderSolicitacoes();});
  await loadSolicitacoes();
}

initProtectedPage('EPI', renderContent);
