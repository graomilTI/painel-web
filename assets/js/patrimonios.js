import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
const normalize=(v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

let state = { tab: 'cadastrar', isMaster: false, allowedSupervisoes: new Set(), histRows: [], histSort: { key: 'maxDias', dir: 'desc' }, histFilters: { num: '', material: '' }, histExpanded: new Set() };

function setMsg(msg,err=false){const el=document.getElementById('patFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}

async function loadCadastrar(){
  const body=document.getElementById('patComprasBody');
  const {data,error}=await supabase.from('compras_patrimonios_cadastro').select('*, compras_itens(*, compras_solicitacoes(*))').in('status',['aguardando_numero','numero_informado']).order('created_at',{ascending:false}).limit(300);
  if(error){body.innerHTML=`<tr><td colspan="7" class="pat-empty">${esc(error.message)}<br>Execute a migration de compras no Supabase.</td></tr>`;return;}
  if(!data?.length){body.innerHTML='<tr><td colspan="7" class="pat-empty">Nenhum patrimônio comprado aguardando cadastro.</td></tr>';return;}
  body.innerHTML=data.map(r=>{const item=r.compras_itens||{}; const sol=item.compras_solicitacoes||{}; return `<tr data-id="${esc(r.id)}"><td>${brDate(r.created_at)}</td><td>${esc(item.material||r.material||'-')}</td><td>${esc(item.marca||r.marca||'')}</td><td>${esc(sol.coordenacao||r.coordenacao||'')}</td><td><input class="pat-num" value="${esc(r.numero_patrimonio||'')}" placeholder="Nº patrimônio"></td><td><input class="pat-obs" value="${esc(r.observacao||'')}" placeholder="Observação"></td><td><button class="btn btn-small btn-primary" data-save-one type="button">Salvar</button></td></tr>`}).join('');
  body.querySelectorAll('[data-save-one]').forEach(btn=>btn.onclick=()=>saveOne(btn.closest('tr')));
}
async function saveOne(tr){
  const id=tr.dataset.id; const numero=tr.querySelector('.pat-num').value.trim(); const obs=tr.querySelector('.pat-obs').value.trim();
  if(!numero){setMsg('Informe o número de patrimônio antes de salvar.',true);return;}
  const {error}=await supabase.from('compras_patrimonios_cadastro').update({numero_patrimonio:numero, observacao:obs||null, status:'numero_informado', informado_em:new Date().toISOString()}).eq('id',id);
  if(error){setMsg(error.message,true);return;} setMsg('Número salvo e direcionado ao módulo Patrimônios.'); await loadCadastrar();
}
async function saveAll(){
  const rows=[...document.querySelectorAll('#patComprasBody tr[data-id]')].filter(tr=>tr.querySelector('.pat-num').value.trim());
  if(!rows.length){setMsg('Nenhuma linha com número preenchido.',true);return;}
  for(const tr of rows) await saveOne(tr);
  setMsg('Lote salvo com sucesso.');
}

async function loadHistorico(){
  const grid=document.getElementById('patHistoricoGrid');
  grid.innerHTML='<p class="pat-empty">Carregando...</p>';
  const PAGE=1000;
  let rows=[], page=0, error=null;
  while(true){
    let q=supabase.from('vw_patrimonios_atual')
      .select('patrimonio_codigo,funcionario,identificacao,dias_sem_leitura,supervisao,situacao')
      .order('patrimonio_codigo',{ascending:true})
      .range(page*PAGE,(page+1)*PAGE-1);
    const {data,error:err}=await q;
    if(err){error=err;break}
    rows=rows.concat(data||[]);
    if(!data || data.length<PAGE) break;
    page++;
  }
  if(error){grid.innerHTML=`<p class="pat-empty">${esc(error.message)}</p>`;return;}
  if(!state.isMaster && state.allowedSupervisoes.size) rows=rows.filter(r=>state.allowedSupervisoes.has(normalize(r.supervisao||'')));
  state.histRows=rows;
  renderHistorico();
}

function groupByColaborador(rows){
  const map=new Map();
  for(const r of rows){
    const nome=r.funcionario||'-';
    if(!map.has(nome)) map.set(nome,{funcionario:nome, items:[], maxDias:-1, inativo:false});
    const g=map.get(nome);
    g.items.push(r);
    const dias=r.dias_sem_leitura??-1;
    if(dias>g.maxDias) g.maxDias=dias;
    if(/n.o\s*ativo|inativo|desligado|demitido/i.test(normalize(r.situacao||''))) g.inativo=true;
  }
  return [...map.values()];
}

function renderHistorico(){
  const grid=document.getElementById('patHistoricoGrid');
  const {num,material}=state.histFilters;
  const rows=state.histRows.filter(r=>{
    if(num && !normalize(r.patrimonio_codigo||'').includes(normalize(num)) && !normalize(r.funcionario||'').includes(normalize(num))) return false;
    if(material && !normalize(r.identificacao||'').includes(normalize(material))) return false;
    return true;
  });
  let groups=groupByColaborador(rows);
  const {key,dir}=state.histSort;
  groups.sort((a,b)=>{
    let va,vb;
    if(key==='funcionario'){va=normalize(a.funcionario);vb=normalize(b.funcionario);}
    else if(key==='qtd'){va=a.items.length;vb=b.items.length;}
    else{va=a.maxDias;vb=b.maxDias;}
    if(va<vb) return dir==='asc'?-1:1;
    if(va>vb) return dir==='asc'?1:-1;
    return 0;
  });
  if(!groups.length){grid.innerHTML='<p class="pat-empty">Nenhum patrimônio encontrado.</p>';return;}

  const thClass=(k)=>`pat-th-sort${key===k?' sort-active':''}`;
  const thDir=(k)=>key===k?dir:'';

  const bodyRows=groups.map((g)=>{
    const open=state.histExpanded.has(g.funcionario);
    const items=[...g.items].sort((a,b)=>(b.dias_sem_leitura??-1)-(a.dias_sem_leitura??-1));
    const detailRows=items.map(r=>{
      const inativo=/n.o\s*ativo|inativo|desligado|demitido/i.test(normalize(r.situacao||''));
      return `<tr class="${inativo?'pat-row-inativo':''}"><td>${esc(r.patrimonio_codigo||'-')}</td><td>${esc(r.identificacao||'-')}</td><td class="${(r.dias_sem_leitura??0)>30 && !inativo?'dias-alerta':''}">${r.dias_sem_leitura??'-'}</td></tr>`;
    }).join('');
    const mainRow=`<tr class="pat-hist-row ${g.inativo?'pat-row-inativo':''}" data-colaborador="${esc(g.funcionario)}">
        <td><span class="pat-hist-name-cell"><span class="pat-hist-arrow">${open?'▾':'▸'}</span>${esc(g.funcionario)}</span></td>
        <td>${g.items.length}</td>
        <td class="${g.maxDias>30 && !g.inativo?'dias-alerta':''}">${g.maxDias>=0?g.maxDias:'-'}</td>
        <td><button class="pat-hist-dl-btn" data-dl-colaborador="${esc(g.funcionario)}" type="button" title="Baixar CSV de ${esc(g.funcionario)}">↓</button></td>
      </tr>`;
    const detailRow=open?`<tr class="pat-hist-detail-row"><td colspan="4"><table class="pat-table"><thead><tr><th>Nº</th><th>Material</th><th>Dias s/ Leitura</th></tr></thead><tbody>${detailRows}</tbody></table></td></tr>`:'';
    return mainRow+detailRow;
  }).join('');

  grid.innerHTML=`<div class="pat-table-wrap"><table class="pat-table pat-hist-table">
    <thead><tr>
      <th class="${thClass('funcionario')}" data-sort-key="funcionario" data-sort-dir="${thDir('funcionario')}">Colaborador</th>
      <th class="${thClass('qtd')}" data-sort-key="qtd" data-sort-dir="${thDir('qtd')}">Un.</th>
      <th class="${thClass('maxDias')}" data-sort-key="maxDias" data-sort-dir="${thDir('maxDias')}">Dias s/ Leitura</th>
      <th></th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
  </table></div>`;

  grid.querySelectorAll('[data-sort-key]').forEach(th=>th.addEventListener('click', ()=>setHistSort(th.dataset.sortKey)));
  grid.querySelectorAll('[data-colaborador]').forEach(row=>row.addEventListener('click', (e)=>{
    if(e.target.closest('[data-dl-colaborador]')) return;
    const nome=row.dataset.colaborador;
    if(state.histExpanded.has(nome)) state.histExpanded.delete(nome); else state.histExpanded.add(nome);
    renderHistorico();
  }));
  grid.querySelectorAll('[data-dl-colaborador]').forEach(btn=>btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    downloadColaboradorRow(btn.dataset.dlColaborador);
  }));
}

function csvEscape(v){
  const s=String(v??'');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

function downloadCsv(filename, headers, rows){
  const lines=[headers.map(csvEscape).join(';'), ...rows.map((r)=>r.map(csvEscape).join(';'))];
  const blob=new Blob(['﻿'+lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// #24: download do histórico com 3 recortes -- total, só os em atraso
// (>30 dias, mesmo limiar já usado no destaque visual "dias-alerta") e
// agregado por colaborador. Respeita os filtros de texto já aplicados na
// tela pra o download bater com o que o gestor está vendo.
function downloadHistorico(tipo){
  const {num,material}=state.histFilters;
  const rows=state.histRows.filter((r)=>{
    if(num && !normalize(r.patrimonio_codigo||'').includes(normalize(num)) && !normalize(r.funcionario||'').includes(normalize(num))) return false;
    if(material && !normalize(r.identificacao||'').includes(normalize(material))) return false;
    return true;
  });
  const stamp=new Date().toISOString().slice(0,10);

  if(tipo==='colaborador'){
    const groups=groupByColaborador(rows);
    downloadCsv(`patrimonios-por-colaborador-${stamp}.csv`,
      ['Colaborador','Qtd. Materiais','Maior atraso (dias)'],
      groups.map((g)=>[g.funcionario, g.items.length, g.maxDias>=0?g.maxDias:'']));
    return;
  }

  const filtered = tipo==='atraso' ? rows.filter((r)=>(r.dias_sem_leitura??0)>30) : rows;
  downloadCsv(`patrimonios-${tipo==='atraso'?'atraso':'total'}-${stamp}.csv`,
    ['Nº Patrimônio','Material','Colaborador','Supervisão','Dias sem leitura'],
    filtered.map((r)=>[r.patrimonio_codigo||'', r.identificacao||'', r.funcionario||'', r.supervisao||'', r.dias_sem_leitura??'']));
}

function downloadColaboradorRow(nome){
  const {num,material}=state.histFilters;
  const rows=state.histRows.filter((r)=>{
    if(r.funcionario!==nome) return false;
    if(num && !normalize(r.patrimonio_codigo||'').includes(normalize(num)) && !normalize(r.funcionario||'').includes(normalize(num))) return false;
    if(material && !normalize(r.identificacao||'').includes(normalize(material))) return false;
    return true;
  });
  const stamp=new Date().toISOString().slice(0,10);
  const slug=normalize(nome).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  downloadCsv(`patrimonios-${slug||'colaborador'}-${stamp}.csv`,
    ['Nº Patrimônio','Material','Dias sem leitura'],
    rows.map((r)=>[r.patrimonio_codigo||'', r.identificacao||'', r.dias_sem_leitura??'']));
}

function setHistSort(key){
  const cur=state.histSort;
  state.histSort = cur.key===key ? {key, dir: cur.dir==='asc'?'desc':'asc'} : {key, dir: key==='funcionario'?'asc':'desc'};
  renderHistorico();
}

function setActiveTab(tab){
  state.tab = tab;
  document.querySelectorAll('[data-pat-tab]').forEach((btn)=>btn.classList.toggle('pat-hist-card-active', btn.dataset.patTab===tab));
  document.getElementById('patCadastrarSection').style.display = tab==='cadastrar' ? '' : 'none';
  document.getElementById('patHistoricoSection').style.display = tab==='historico' ? '' : 'none';
  if(tab==='historico') loadHistorico();
}

function styles(){return `<style>
.pat-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
.pat-table{width:100%;border-collapse:collapse;min-width:940px}
.pat-table th,.pat-table td{padding:12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.pat-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
.pat-table input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
.pat-empty{text-align:center;color:var(--muted)}
.pat-feedback{font-weight:800}
.pat-feedback.err{color:#fecaca}
.pat-row-inativo td{color:#f87171}
.dias-alerta{color:#fca5a5;font-weight:950}
.pat-layout{display:flex;flex-direction:column;gap:16px;margin-top:16px}
.pat-content{display:flex;flex-direction:column;gap:16px;min-width:0}
.pat-download-select{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;font-size:13px}
.pat-tabs{display:flex;flex-direction:row;gap:6px;flex-wrap:wrap}
.pat-hist-card{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;border:1px solid rgba(148,163,184,.24);background:transparent;cursor:pointer;color:var(--muted);transition:background-color .15s ease,border-color .15s ease,color .15s ease;font-size:12px;font-weight:800;text-align:left}
.pat-hist-card:hover{border-color:rgba(129,140,248,.4);color:#e2e2f0}
.pat-hist-card-active{border-color:#818cf8;background:rgba(129,140,248,.14);color:#e2e2f0}
.pat-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.pat-actions .btn,.pat-table .btn{width:auto;margin-top:0}
.pat-hist-icon{font-size:14px}
.pat-hist-text{display:flex;flex-direction:column;gap:0;text-align:left;min-width:0}
.pat-hist-text strong{font-size:12px}
.pat-hist-text small{display:none}
.pat-hist-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.pat-hist-controls input{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;min-width:200px}
.pat-th-sort{cursor:pointer;user-select:none;white-space:nowrap}
.pat-th-sort:hover{color:#e2e2f0}
.pat-th-sort::after{content:'⇅';margin-left:6px;opacity:.35;font-size:10px}
.pat-th-sort.sort-active::after{opacity:1}
.pat-th-sort.sort-active[data-sort-dir="asc"]::after{content:'▲'}
.pat-th-sort.sort-active[data-sort-dir="desc"]::after{content:'▼'}
.pat-hist-row{cursor:pointer}
.pat-hist-row:hover{background:rgba(129,140,248,.08)}
.pat-hist-name-cell{display:flex;align-items:center;gap:8px;font-weight:800}
.pat-hist-arrow{color:var(--muted);font-size:11px;width:12px;display:inline-block}
.pat-hist-dl-btn{border:1px solid rgba(148,163,184,.24);background:transparent;color:#e2e2f0;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:13px;line-height:1}
.pat-hist-dl-btn:hover{border-color:rgba(129,140,248,.4);background:rgba(129,140,248,.12)}
.pat-hist-detail-row td{padding:0 12px 14px 32px;background:rgba(13,13,24,.6)}
.pat-hist-detail-row .pat-table{min-width:0}
.pat-hist-detail-row .pat-table th,.pat-hist-detail-row .pat-table td{padding:8px 10px}
</style>`}

export async function renderContent(content, userContext){
  state.isMaster = !!userContext?.user?.is_master;
  const rawSupervisoes = [
    ...(Array.isArray(userContext?.user?.supervisoes) ? userContext.user.supervisoes : []),
    userContext?.user?.supervisao,
  ].filter(Boolean);
  state.allowedSupervisoes = new Set(rawSupervisoes.map(normalize));

  content.innerHTML=`${styles()}<section class="hero-card"><div><div class="eyebrow">Gestor</div><h2>Patrimônios</h2><p>Histórico de leituras e cadastro dos números patrimoniais dos itens comprados pelo setor de compras.</p></div><div class="hero-badge-wrap"><span class="hero-badge">GESTOR</span></div></section>
    <div class="pat-layout">
      <div class="pat-tabs">
        <button class="pat-hist-card pat-hist-card-active" data-pat-tab="cadastrar" type="button">
          <span class="pat-hist-icon">📝</span>
          <span class="pat-hist-text"><strong>Cadastro</strong></span>
        </button>
        <button class="pat-hist-card" data-pat-tab="historico" type="button">
          <span class="pat-hist-icon">🕒</span>
          <span class="pat-hist-text"><strong>Histórico</strong></span>
        </button>
      </div>
      <div class="pat-content">
        <section class="card" id="patCadastrarSection">
          <div class="pat-actions"><button class="btn btn-primary" id="patSaveAll" type="button">Salvar lote preenchido</button><button class="btn btn-secondary" id="patRefresh" type="button">↻ Atualizar</button></div>
          <div class="pat-table-wrap"><table class="pat-table"><thead><tr><th>Data</th><th>Material</th><th>Marca</th><th>Coordenação</th><th>Nº</th><th>Obs.</th><th>Ação</th></tr></thead><tbody id="patComprasBody"></tbody></table></div>
          <div class="form-actions"><span class="pat-feedback" id="patFeedback"></span></div>
        </section>
        <section class="card" id="patHistoricoSection" style="display:none">
          <div class="pat-hist-controls">
            <select class="pat-download-select" id="patDownloadTipo"><option value="total">Total</option><option value="atraso">Por atraso (&gt;30 dias)</option><option value="colaborador">Por colaborador</option></select>
            <input id="patHistFilterNum" type="text" placeholder="Filtrar por Nº ou colaborador">
            <input id="patHistFilterMaterial" type="text" placeholder="Filtrar por material">
            <button class="btn btn-secondary" id="patDownloadBtn" type="button">↓ Baixar</button>
            <button class="btn btn-secondary" id="patHistRefresh" type="button">↻ Atualizar</button>
          </div>
          <div class="pat-hist-grid" id="patHistoricoGrid"></div>
        </section>
      </div>
    </div>`;

  document.getElementById('patRefresh').onclick=loadCadastrar;
  document.getElementById('patSaveAll').onclick=saveAll;
  document.getElementById('patHistRefresh').onclick=loadHistorico;
  document.getElementById('patDownloadBtn').onclick=()=>downloadHistorico(document.getElementById('patDownloadTipo').value);
  document.getElementById('patHistFilterNum').addEventListener('input', (e)=>{state.histFilters.num=e.target.value; renderHistorico();});
  document.getElementById('patHistFilterMaterial').addEventListener('input', (e)=>{state.histFilters.material=e.target.value; renderHistorico();});
  document.querySelectorAll('[data-pat-tab]').forEach((btn)=>btn.addEventListener('click', () => setActiveTab(btn.dataset.patTab)));
  setActiveTab('cadastrar');
  await loadCadastrar();
}

initProtectedPage('Patrimônios', renderContent);
