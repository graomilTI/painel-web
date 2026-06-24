import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
const normalize=(v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

let state = { tab: 'cadastrar', isMaster: false, supervisoes: [], histRows: [], histSort: { key: 'maxDias', dir: 'desc' }, histFilters: { num: '', material: '' }, histExpanded: new Set() };

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
    if(!state.isMaster && state.supervisoes.length) q=q.in('supervisao', state.supervisoes);
    const {data,error:err}=await q;
    if(err){error=err;break}
    rows=rows.concat(data||[]);
    if(!data || data.length<PAGE) break;
    page++;
  }
  if(error){grid.innerHTML=`<p class="pat-empty">${esc(error.message)}</p>`;return;}
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
  document.querySelectorAll('#patHistoricoSection [data-sort-key]').forEach(btn=>{
    btn.classList.toggle('sort-active', btn.dataset.sortKey===key);
    btn.dataset.sortDir = btn.dataset.sortKey===key ? dir : '';
  });
  if(!groups.length){grid.innerHTML='<p class="pat-empty">Nenhum patrimônio encontrado.</p>';return;}
  grid.innerHTML=groups.map((g)=>{
    const open=state.histExpanded.has(g.funcionario);
    const items=[...g.items].sort((a,b)=>(b.dias_sem_leitura??-1)-(a.dias_sem_leitura??-1));
    const detailRows=items.map(r=>{
      const inativo=/n.o\s*ativo|inativo|desligado|demitido/i.test(normalize(r.situacao||''));
      return `<tr class="${inativo?'pat-row-inativo':''}"><td>${esc(r.patrimonio_codigo||'-')}</td><td>${esc(r.identificacao||'-')}</td><td class="${(r.dias_sem_leitura??0)>30 && !inativo?'dias-alerta':''}">${r.dias_sem_leitura??'-'}</td></tr>`;
    }).join('');
    return `<div class="pat-hist-item">
      <button class="pat-hist-item-row ${g.inativo?'pat-row-inativo':''} ${open?'pat-hist-item-open':''}" data-colaborador="${esc(g.funcionario)}" type="button">
        <span class="pat-hist-item-arrow">${open?'▾':'▸'}</span>
        <span class="pat-hist-item-name">${esc(g.funcionario)}</span>
        <span class="pat-hist-item-badge">${g.items.length} ${g.items.length===1?'material':'materiais'}</span>
        <span class="pat-hist-item-dias ${g.maxDias>30 && !g.inativo?'dias-alerta':''}">${g.maxDias>=0?g.maxDias+' dias s/ leitura':'-'}</span>
      </button>
      ${open?`<div class="pat-hist-item-detail"><table class="pat-table"><thead><tr><th>Nº</th><th>Material</th><th>Dias s/ Leitura</th></tr></thead><tbody>${detailRows}</tbody></table></div>`:''}
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-colaborador]').forEach(row=>row.onclick=()=>{
    const nome=row.dataset.colaborador;
    if(state.histExpanded.has(nome)) state.histExpanded.delete(nome); else state.histExpanded.add(nome);
    renderHistorico();
  });
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
.pat-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:stretch}
.pat-hist-card{display:flex;align-items:center;gap:12px;padding:14px 20px;border-radius:16px;border:1px solid rgba(148,163,184,.24);background:linear-gradient(135deg,rgba(99,102,241,.18),rgba(99,102,241,.05));cursor:pointer;color:#e2e2f0;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;flex:1 1 220px}
.pat-hist-card:hover{transform:translateY(-1px);border-color:rgba(99,102,241,.55)}
.pat-hist-card-active{border-color:#818cf8;box-shadow:0 0 0 2px rgba(129,140,248,.35);background:linear-gradient(135deg,rgba(99,102,241,.3),rgba(99,102,241,.08))}
.pat-actions{display:flex;gap:10px;flex-wrap:wrap}
.pat-actions .btn,.pat-table .btn{width:auto;margin-top:0}
.pat-hist-icon{font-size:22px}
.pat-hist-text{display:flex;flex-direction:column;gap:2px;text-align:left}
.pat-hist-text strong{font-size:14px}
.pat-hist-text small{font-size:11px;color:var(--muted)}
.pat-hist-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.pat-hist-filters input{border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;min-width:220px}
.pat-hist-sortbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.pat-hist-sortbar-label{font-size:12px;color:var(--muted)}
.pat-sort-chip{border:1px solid rgba(148,163,184,.24);background:transparent;color:#e2e2f0;border-radius:999px;padding:6px 14px;font-size:12px;cursor:pointer}
.pat-sort-chip::after{content:'⇅';margin-left:6px;opacity:.4;font-size:10px}
.pat-sort-chip.sort-active{border-color:#818cf8;background:rgba(129,140,248,.16)}
.pat-sort-chip.sort-active::after{opacity:1}
.pat-sort-chip.sort-active[data-sort-dir="asc"]::after{content:'▲'}
.pat-sort-chip.sort-active[data-sort-dir="desc"]::after{content:'▼'}
.pat-hist-grid{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:18px;overflow:hidden}
.pat-hist-item{border-bottom:1px solid var(--line)}
.pat-hist-item:last-child{border-bottom:none}
.pat-hist-item-row{display:flex;align-items:center;gap:14px;width:100%;text-align:left;border:none;background:transparent;padding:14px 16px;cursor:pointer;color:#e2e2f0;font:inherit;transition:background-color .15s ease}
.pat-hist-item-row:hover{background:rgba(129,140,248,.1)}
.pat-hist-item-row.pat-hist-item-open{background:rgba(129,140,248,.08)}
.pat-hist-item-row.pat-row-inativo .pat-hist-item-name{color:#f87171}
.pat-hist-item-name{font-weight:800;font-size:14px;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pat-hist-item-badge{flex:none;border:1px solid rgba(148,163,184,.24);border-radius:999px;padding:2px 10px;font-size:12px;color:var(--muted)}
.pat-hist-item-dias{flex:none;font-size:12px;color:var(--muted);min-width:130px;text-align:right}
.pat-hist-item-arrow{flex:none;color:var(--muted);font-size:12px;width:14px}
.pat-hist-item-detail{padding:0 16px 14px 44px;background:rgba(13,13,24,.6)}
.pat-hist-item-detail .pat-table{min-width:0}
.pat-hist-item-detail .pat-table th,.pat-hist-item-detail .pat-table td{padding:8px 10px}
@media(max-width:640px){
  .pat-hist-item-row{flex-wrap:wrap;row-gap:6px}
  .pat-hist-item-name{flex:1 1 calc(100% - 32px);white-space:normal;overflow:visible;text-overflow:unset;word-break:break-word}
  .pat-hist-item-badge{order:1;margin-left:28px}
  .pat-hist-item-dias{order:2;min-width:0;text-align:left}
}
</style>`}

initProtectedPage('Patrimônios', async (content, userContext)=>{
  state.isMaster = !!userContext?.user?.is_master;
  state.supervisoes = Array.isArray(userContext?.user?.supervisoes) ? userContext.user.supervisoes : [];

  content.innerHTML=`${styles()}<section class="hero-card"><div><div class="eyebrow">Gestor</div><h2>Patrimônios</h2><p>Histórico de leituras e cadastro dos números patrimoniais dos itens comprados pelo setor de compras.</p></div><div class="hero-badge-wrap"><span class="hero-badge">GESTOR</span></div></section>
    <div class="pat-tabs">
      <button class="pat-hist-card pat-hist-card-active" data-pat-tab="cadastrar" type="button">
        <span class="pat-hist-icon">📝</span>
        <span class="pat-hist-text"><strong>Cadastro</strong><small>Informar nº de patrimônio dos itens comprados</small></span>
      </button>
      <button class="pat-hist-card" data-pat-tab="historico" type="button">
        <span class="pat-hist-icon">🕒</span>
        <span class="pat-hist-text"><strong>Histórico</strong><small>Leituras e cadastros já feitos</small></span>
      </button>
    </div>
    <section class="card mt-16" id="patCadastrarSection">
      <div class="section-head"><div><h3>Compras aguardando número de patrimônio</h3><p class="muted">Cada item comprado como Patrimônio entra aqui em uma linha. É possível salvar individualmente ou em lote.</p></div><div class="pat-actions"><button class="btn btn-primary" id="patSaveAll" type="button">Salvar lote preenchido</button><button class="btn btn-secondary" id="patRefresh" type="button">↻ Atualizar</button></div></div>
      <div class="pat-table-wrap"><table class="pat-table"><thead><tr><th>Data</th><th>Material</th><th>Marca</th><th>Coordenação</th><th>Nº</th><th>Obs.</th><th>Ação</th></tr></thead><tbody id="patComprasBody"></tbody></table></div>
      <div class="form-actions"><span class="pat-feedback" id="patFeedback"></span></div>
    </section>
    <section class="card mt-16" id="patHistoricoSection" style="display:none">
      <div class="section-head"><div><h3>Histórico de patrimônios</h3><p class="muted">Patrimônios já cadastrados na regional, com os dias desde a última leitura do agente.</p></div><button class="btn btn-secondary" id="patHistRefresh" type="button">↻ Atualizar</button></div>
      <div class="pat-hist-filters">
        <input id="patHistFilterNum" type="text" placeholder="Filtrar por Nº ou colaborador">
        <input id="patHistFilterMaterial" type="text" placeholder="Filtrar por material">
      </div>
      <div class="pat-hist-sortbar">
        <span class="pat-hist-sortbar-label">Ordenar por:</span>
        <button class="pat-sort-chip" data-sort-key="funcionario" type="button">Colaborador</button>
        <button class="pat-sort-chip" data-sort-key="maxDias" type="button">Dias s/ Leitura</button>
        <button class="pat-sort-chip" data-sort-key="qtd" type="button">Qtd. Materiais</button>
      </div>
      <div class="pat-hist-grid" id="patHistoricoGrid"></div>
    </section>`;

  document.getElementById('patRefresh').onclick=loadCadastrar;
  document.getElementById('patSaveAll').onclick=saveAll;
  document.getElementById('patHistRefresh').onclick=loadHistorico;
  document.getElementById('patHistFilterNum').addEventListener('input', (e)=>{state.histFilters.num=e.target.value; renderHistorico();});
  document.getElementById('patHistFilterMaterial').addEventListener('input', (e)=>{state.histFilters.material=e.target.value; renderHistorico();});
  document.querySelectorAll('#patHistoricoSection [data-sort-key]').forEach((btn)=>btn.addEventListener('click', () => setHistSort(btn.dataset.sortKey)));
  document.querySelectorAll('[data-pat-tab]').forEach((btn)=>btn.addEventListener('click', () => setActiveTab(btn.dataset.patTab)));
  setActiveTab('cadastrar');
  await loadCadastrar();
});
