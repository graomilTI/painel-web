import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
const normalize=(v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

let state = { tab: 'cadastrar', isMaster: false, supervisoes: [] };

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
  const body=document.getElementById('patHistoricoBody');
  body.innerHTML='<tr><td colspan="4" class="pat-empty">Carregando...</td></tr>';
  const PAGE=1000;
  let rows=[], page=0, error=null;
  while(true){
    let q=supabase.from('vw_patrimonios_atual')
      .select('patrimonio_codigo,funcionario,identificacao,dias_sem_leitura,supervisao,situacao')
      .order('dias_sem_leitura',{ascending:false})
      .range(page*PAGE,(page+1)*PAGE-1);
    if(!state.isMaster && state.supervisoes.length) q=q.in('supervisao', state.supervisoes);
    const {data,error:err}=await q;
    if(err){error=err;break}
    rows=rows.concat(data||[]);
    if(!data || data.length<PAGE) break;
    page++;
  }
  if(error){body.innerHTML=`<tr><td colspan="4" class="pat-empty">${esc(error.message)}</td></tr>`;return;}
  if(!rows.length){body.innerHTML='<tr><td colspan="4" class="pat-empty">Nenhum patrimônio encontrado.</td></tr>';return;}
  body.innerHTML=rows.map(r=>{
    const inativo=/n.o\s*ativo|inativo|desligado|demitido/i.test(normalize(r.situacao||''));
    return `<tr class="${inativo?'pat-row-inativo':''}"><td>${esc(r.patrimonio_codigo||'-')}</td><td>${esc(r.funcionario||'-')}</td><td>${esc(r.identificacao||'-')}</td><td class="${(r.dias_sem_leitura??0)>30 && !inativo?'dias-alerta':''}">${r.dias_sem_leitura??'-'}</td></tr>`;
  }).join('');
}

function setActiveTab(tab){
  state.tab = tab;
  document.querySelectorAll('[data-pat-tab]').forEach((btn)=>btn.classList.toggle('btn-primary', btn.dataset.patTab===tab));
  document.querySelectorAll('[data-pat-tab]').forEach((btn)=>btn.classList.toggle('btn-secondary', btn.dataset.patTab!==tab));
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
.pat-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
</style>`}

initProtectedPage('Patrimônios', async (content, userContext)=>{
  state.isMaster = !!userContext?.user?.is_master;
  state.supervisoes = Array.isArray(userContext?.user?.supervisoes) ? userContext.user.supervisoes : [];

  content.innerHTML=`${styles()}<section class="hero-card"><div><div class="eyebrow">Gestor</div><h2>Patrimônios</h2><p>Histórico de leituras e cadastro dos números patrimoniais dos itens comprados pelo setor de compras.</p></div><div class="hero-badge-wrap"><span class="hero-badge">GESTOR</span></div></section>
    <div class="pat-tabs">
      <button class="btn btn-primary" data-pat-tab="cadastrar" type="button">Cadastrar</button>
      <button class="btn btn-secondary" data-pat-tab="historico" type="button">Histórico</button>
    </div>
    <section class="card mt-16" id="patCadastrarSection">
      <div class="section-head"><div><h3>Compras aguardando número de patrimônio</h3><p class="muted">Cada item comprado como Patrimônio entra aqui em uma linha. É possível salvar individualmente ou em lote.</p></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" id="patSaveAll" type="button">Salvar lote preenchido</button><button class="btn btn-secondary" id="patRefresh" type="button">↻ Atualizar</button></div></div>
      <div class="pat-table-wrap"><table class="pat-table"><thead><tr><th>Data</th><th>Material</th><th>Marca</th><th>Coordenação</th><th>Nº</th><th>Obs.</th><th>Ação</th></tr></thead><tbody id="patComprasBody"></tbody></table></div>
      <div class="form-actions"><span class="pat-feedback" id="patFeedback"></span></div>
    </section>
    <section class="card mt-16" id="patHistoricoSection" style="display:none">
      <div class="section-head"><div><h3>Histórico de patrimônios</h3><p class="muted">Patrimônios já cadastrados na regional, com os dias desde a última leitura do agente.</p></div><button class="btn btn-secondary" id="patHistRefresh" type="button">↻ Atualizar</button></div>
      <div class="pat-table-wrap"><table class="pat-table"><thead><tr><th>Nº</th><th>Colaborador</th><th>Material</th><th>Dias s/ Leitura</th></tr></thead><tbody id="patHistoricoBody"></tbody></table></div>
    </section>`;

  document.getElementById('patRefresh').onclick=loadCadastrar;
  document.getElementById('patSaveAll').onclick=saveAll;
  document.getElementById('patHistRefresh').onclick=loadHistorico;
  document.querySelectorAll('[data-pat-tab]').forEach((btn)=>btn.addEventListener('click', () => setActiveTab(btn.dataset.patTab)));

  setActiveTab('cadastrar');
  await loadCadastrar();
});
