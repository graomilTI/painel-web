import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

const state = { materiais: [], movs: [], colaboradores: [], tab: 'visao' };
const CATEGORIAS = ['Uniformes','Escritório','Brindes','Equipamentos','Classificação','EPI','Outros'];
const UNIDADES = ['UN','CX','PCT','KG','M','RL'];
const LOCAIS = ['Almoxarifado','Matriz','Sala Técnica','Escritório','Veículo','Operação'];
const MOTIVOS = ['Entrega ao colaborador','Reposição','Uso operacional','Perda','Descarte','Transferência','Manutenção','Inventário'];
const esc = (v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const norm = (v)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const hoje = ()=>new Date().toISOString().slice(0,10);
const brDate = (v)=>{ const [y,m,d]=String(v||'').slice(0,10).split('-'); return y&&m&&d?`${d}/${m}/${y}`:'-'; };
const money = (v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const qtd = (v)=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const usuario = (ctx)=>ctx?.user || {};
const userName = (ctx)=>usuario(ctx).name || usuario(ctx).email || 'Usuário logado';

async function safe(fn, fallback=[]){ try{ const {data,error}=await fn(); if(error) throw error; return data ?? fallback; }catch(e){ console.warn('[compras-estoque]', e); return fallback; } }
function statusMaterial(m){ const atual=Number(m.estoque_atual||0); const min=Number(m.estoque_minimo||0); if(atual<=0) return 'critico'; if(min>0 && atual<=min) return 'baixo'; return 'normal'; }
function statusLabel(s){ return s==='critico'?'Crítico':(s==='baixo'?'Baixo':'Normal'); }
function materialLabel(m){ return `${m.nome||''}${m.tamanho?` (${m.tamanho})`:''}`; }
function card(title,value,sub='',cls=''){ return `<div class="stk-card ${cls}"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></div>`; }

async function loadBase(){
  const [materiais,movs,colabs] = await Promise.all([
    safe(()=>supabase.from('compras_estoque_materiais').select('*').order('nome',{ascending:true}).limit(5000)),
    safe(()=>supabase.from('compras_estoque_movimentacoes').select('*, compras_estoque_materiais(nome,categoria,tamanho,unidade)').order('created_at',{ascending:false}).limit(300)),
    getColaboradores({somenteAtivos:true}).catch(()=>[])  // cache compartilhado
  ]);
  state.materiais = (materiais||[]).filter(m=>m.ativo!==false);
  state.movs = movs||[];
  const seen = new Set();
  state.colaboradores = (colabs||[]).filter(c=>{ const key=norm(c.cpf||c.id||c.nome); if(seen.has(key)) return false; seen.add(key); return true; });
}

function styles(){ return `<style>
.stk-tabs,.stk-actions{display:flex;gap:10px;flex-wrap:wrap}.stk-tab{width:auto!important;margin:0!important}.stk-tab.active{background:#166534!important;color:#fff!important}.stk-panel{display:none}.stk-panel.active{display:block}.stk-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.stk-card{border:1px solid var(--line);border-radius:16px;padding:14px;background:#10101e}.stk-card span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;font-weight:800}.stk-card strong{display:block;font-size:24px;margin-top:8px}.stk-card small{color:var(--muted)}.stk-card.warn{border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.08)}.stk-card.danger{border-color:rgba(220,38,38,.35);background:rgba(220,38,38,.10)}.stk-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.stk-field{display:flex;flex-direction:column;gap:6px}.stk-field-full{grid-column:1/-1}.stk-field input,.stk-field select,.stk-field textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;min-height:44px;color-scheme:dark}.stk-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px}.stk-table{width:100%;border-collapse:collapse;min-width:880px}.stk-table th,.stk-table td{padding:12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.stk-table th{font-size:12px;text-transform:uppercase;color:var(--muted)}.stk-pill{display:inline-flex;padding:6px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.25);font-weight:800;font-size:12px}.stk-pill.normal{color:#bbf7d0;background:rgba(22,101,52,.18)}.stk-pill.baixo{color:#fde68a;background:rgba(245,158,11,.12)}.stk-pill.critico{color:#fecaca;background:rgba(220,38,38,.14)}.stk-empty{text-align:center;color:var(--muted)}.stk-feedback{font-weight:800}.stk-feedback.err{color:#fecaca}.stk-feedback.ok{color:#bbf7d0}.stk-filter{max-width:320px;margin-left:auto}@media(max-width:1100px){.stk-cards{grid-template-columns:repeat(2,1fr)}.stk-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.stk-cards,.stk-grid{grid-template-columns:1fr}.stk-filter{max-width:none;margin-left:0}.stk-table{min-width:760px}}
</style>`; }

function renderShell(content, ctx){
  content.innerHTML = `${styles()}
  <section class="hero-card"><div><div class="eyebrow">Compras</div><h2>Estoque</h2><p>Controle de uniformes, agendas, copos, quarteadores, caladores, sulfite, peneiras, impressoras, balanças e demais materiais internos.</p></div><div class="hero-badge-wrap"><span class="hero-badge">ALMOXARIFADO</span></div></section>
  <section class="card mt-16">
    <div class="section-head"><div><h3>Gestão de Estoque</h3><p class="muted">Entradas, saídas, inventário, alertas e histórico com rastreabilidade.</p></div><div class="stk-tabs">${['visao|Visão Geral','materiais|Materiais','entradas|Entradas','saidas|Saídas','inventario|Inventário','alertas|Alertas','historico|Histórico'].map(x=>{const [id,l]=x.split('|');return `<button class="btn btn-secondary stk-tab ${state.tab===id?'active':''}" data-tab="${id}" type="button">${l}</button>`}).join('')}</div></div>
    <div id="stkContent"></div>
  </section>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ state.tab=b.dataset.tab; renderShell(content,ctx); renderTab(ctx); });
  renderTab(ctx);
}

function renderTab(ctx){ const box=document.getElementById('stkContent'); if(!box) return; ({visao:renderVisao,materiais:renderMateriais,entradas:renderEntradas,saidas:renderSaidas,inventario:renderInventario,alertas:renderAlertas,historico:renderHistorico}[state.tab]||renderVisao)(box,ctx); }
function materialOptions(){ return state.materiais.map(m=>`<option value="${esc(m.id)}">${esc(materialLabel(m))} — ${qtd(m.estoque_atual)} ${esc(m.unidade||'UN')}</option>`).join(''); }
function datalistColabs(){ return `<datalist id="stkColabs">${state.colaboradores.map(c=>`<option value="${esc(c.nome)}"></option>`).join('')}</datalist>`; }

function renderVisao(box){
  const total=state.materiais.length, baixo=state.materiais.filter(m=>statusMaterial(m)==='baixo').length, crit=state.materiais.filter(m=>statusMaterial(m)==='critico').length;
  const mes=new Date().toISOString().slice(0,7);
  const ent=state.movs.filter(m=>m.tipo_movimentacao==='entrada'&&String(m.data_movimentacao||m.created_at).startsWith(mes)).length;
  const sai=state.movs.filter(m=>m.tipo_movimentacao==='saida'&&String(m.data_movimentacao||m.created_at).startsWith(mes)).length;
  const lista=[...state.materiais].sort((a,b)=>statusMaterial(a)==='critico'?-1:statusMaterial(a)==='baixo'?-1:0).slice(0,12);
  box.innerHTML=`<div class="stk-cards mt-16">${card('Materiais',total,'Itens ativos')}${card('Estoque baixo',baixo,'Abaixo do mínimo','warn')}${card('Críticos',crit,'Zerados ou negativos','danger')}${card('Entradas do mês',ent,'Movimentações')}${card('Saídas do mês',sai,'Movimentações')}</div>
  <div class="section-head mt-24"><div><h3>Resumo rápido</h3><p class="muted">Priorize os itens com status baixo ou crítico.</p></div><button class="btn btn-primary" id="stkNovaSaida" type="button">+ Saída rápida</button></div>${tableMateriais(lista)}
  <div class="section-head mt-24"><div><h3>Últimas movimentações</h3></div></div>${tableHistorico(state.movs.slice(0,8))}`;
  document.getElementById('stkNovaSaida').onclick=()=>{state.tab='saidas'; renderShell(document.getElementById('pageContent'),window.__stkCtx);};
}

function tableMateriais(rows){ return `<div class="stk-table-wrap mt-12"><table class="stk-table"><thead><tr><th>Material</th><th>Categoria</th><th>Local</th><th>Atual</th><th>Mínimo</th><th>Status</th></tr></thead><tbody>${rows.length?rows.map(m=>{const s=statusMaterial(m);return `<tr><td><b>${esc(materialLabel(m))}</b><br><small class="muted">${esc(m.codigo_interno||'Sem código')}</small></td><td>${esc(m.categoria||'-')}</td><td>${esc(m.local_armazenamento||'-')}</td><td>${qtd(m.estoque_atual)} ${esc(m.unidade||'UN')}</td><td>${qtd(m.estoque_minimo)} ${esc(m.unidade||'UN')}</td><td><span class="stk-pill ${s}">${statusLabel(s)}</span></td></tr>`}).join(''):`<tr><td colspan="6" class="stk-empty">Nenhum material cadastrado.</td></tr>`}</tbody></table></div>`; }
function tableHistorico(rows){ return `<div class="stk-table-wrap mt-12"><table class="stk-table"><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Qtd.</th><th>Responsável/Destino</th><th>Observação</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${brDate(r.data_movimentacao||r.created_at)}</td><td><b>${esc(r.tipo_movimentacao||'-')}</b><br><small>${esc(r.motivo||'')}</small></td><td>${esc(materialLabel(r.compras_estoque_materiais||{}))}</td><td>${qtd(r.quantidade)}</td><td>${esc(r.colaborador_nome||r.destino||r.fornecedor||'-')}<br><small>${esc(r.usuario_nome||'')}</small></td><td>${esc(r.observacao||'')}</td></tr>`).join(''):`<tr><td colspan="6" class="stk-empty">Nenhuma movimentação localizada.</td></tr>`}</tbody></table></div>`; }

function renderMateriais(box,ctx){
  box.innerHTML=`<div class="card mt-16"><div class="section-head"><div><h3>Novo material</h3><p class="muted">Cadastre o item uma vez. Depois use Entradas, Saídas e Inventário.</p></div></div><form id="stkMatForm" class="stk-grid">${field('Nome','mNome','text','Ex: Uniforme Polo',true)}${selectField('Categoria','mCategoria',CATEGORIAS)}${field('Tamanho/Detalhe','mTamanho','text','Ex: G, GG, 14/64, 2m')}${field('Código interno','mCodigo','text','Opcional')}${selectField('Unidade','mUnidade',UNIDADES)}${field('Estoque atual','mAtual','number','0')}${field('Estoque mínimo','mMin','number','0')}${field('Estoque máximo','mMax','number','0')}${selectField('Local','mLocal',LOCAIS)}<div class="stk-field stk-field-full"><label>Observação</label><textarea id="mObs" rows="2"></textarea></div><div class="stk-actions stk-field-full"><button class="btn btn-primary" type="submit">Salvar material</button><span id="mFb" class="stk-feedback"></span></div></form></div><div class="section-head mt-24"><div><h3>Materiais cadastrados</h3></div><input class="stk-filter" id="mBusca" placeholder="Buscar material..."></div><div id="mTabela">${tableMateriais(state.materiais)}</div>`;
  document.getElementById('mBusca').oninput=(e)=>{ const q=norm(e.target.value); document.getElementById('mTabela').innerHTML=tableMateriais(state.materiais.filter(m=>norm(`${m.nome} ${m.categoria} ${m.tamanho}`).includes(q))); };
  document.getElementById('stkMatForm').onsubmit=async(ev)=>{ ev.preventDefault(); await salvarMaterial(ctx); };
}
function field(label,id,type,ph='',req=false){ return `<div class="stk-field"><label>${label}</label><input id="${id}" type="${type}" placeholder="${esc(ph)}" ${req?'required':''}></div>`; }
function selectField(label,id,opts){ return `<div class="stk-field"><label>${label}</label><select id="${id}">${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></div>`; }
async function salvarMaterial(ctx){
  const payload={nome:document.getElementById('mNome').value.trim().toUpperCase(),categoria:document.getElementById('mCategoria').value,tamanho:document.getElementById('mTamanho').value.trim()||null,codigo_interno:document.getElementById('mCodigo').value.trim()||null,unidade:document.getElementById('mUnidade').value,estoque_atual:Number(document.getElementById('mAtual').value||0),estoque_minimo:Number(document.getElementById('mMin').value||0),estoque_maximo:Number(document.getElementById('mMax').value||0),local_armazenamento:document.getElementById('mLocal').value,observacao:document.getElementById('mObs').value.trim()||null,ativo:true};
  const fb=document.getElementById('mFb'); fb.textContent='Salvando...'; fb.className='stk-feedback';
  const {error}=await supabase.from('compras_estoque_materiais').insert(payload);
  if(error){ fb.textContent=error.message; fb.className='stk-feedback err'; return; }
  fb.textContent='Material salvo.'; fb.className='stk-feedback ok'; await loadBase(); renderTab(ctx);
}

function renderEntradas(box,ctx){ box.innerHTML=formMov('entrada'); bindMovForm(ctx,'entrada'); }
function renderSaidas(box,ctx){ box.innerHTML=formMov('saida')+datalistColabs(); bindMovForm(ctx,'saida'); }
function formMov(tipo){ const saida=tipo==='saida'; return `<div class="card mt-16"><div class="section-head"><div><h3>${saida?'Nova saída':'Nova entrada'}</h3><p class="muted">${saida?'Baixa de material para colaborador, regional, veículo ou uso operacional.':'Entrada de compra ou reposição de material no estoque.'}</p></div></div><form id="stkMovForm" class="stk-grid"><div class="stk-field stk-field-full"><label>Material</label><select id="movMaterial" required><option value="">Selecione...</option>${materialOptions()}</select></div><div class="stk-field"><label>Quantidade</label><input id="movQtd" type="number" min="0.01" step="0.01" required></div><div class="stk-field"><label>Data</label><input id="movData" type="date" value="${hoje()}" required></div>${saida?`<div class="stk-field"><label>Destino</label><select id="movDestino"><option>Colaborador</option><option>Coordenação</option><option>Supervisão</option><option>Regional</option><option>Veículo</option><option>Escritório</option><option>Operação</option></select></div><div class="stk-field"><label>Colaborador/Responsável</label><input id="movColab" list="stkColabs" placeholder="Digite o nome"></div><div class="stk-field"><label>Motivo</label><select id="movMotivo">${MOTIVOS.map(m=>`<option>${m}</option>`).join('')}</select></div>`:`<div class="stk-field"><label>Fornecedor</label><input id="movFornecedor" placeholder="Nome do fornecedor"></div><div class="stk-field"><label>Valor unitário</label><input id="movValor" type="number" min="0" step="0.01"></div><div class="stk-field"><label>Nº NF</label><input id="movNf" placeholder="Opcional"></div>`}<div class="stk-field stk-field-full"><label>Observação</label><textarea id="movObs" rows="2"></textarea></div><div class="stk-actions stk-field-full"><button class="btn btn-primary" type="submit">Salvar ${saida?'saída':'entrada'}</button><span id="movFb" class="stk-feedback"></span></div></form></div>`; }
function bindMovForm(ctx,tipo){ document.getElementById('stkMovForm').onsubmit=async(ev)=>{ ev.preventDefault(); await salvarMovimentacao(ctx,tipo); }; }
async function salvarMovimentacao(ctx,tipo){
  const id=document.getElementById('movMaterial').value; const mat=state.materiais.find(m=>m.id===id); const quantidade=Number(document.getElementById('movQtd').value||0); const fb=document.getElementById('movFb');
  if(!mat||quantidade<=0){ fb.textContent='Selecione material e quantidade válida.'; fb.className='stk-feedback err'; return; }
  if(tipo==='saida' && quantidade>Number(mat.estoque_atual||0)){ fb.textContent='Estoque insuficiente. A saída não pode deixar saldo negativo.'; fb.className='stk-feedback err'; return; }
  fb.textContent='Salvando...'; fb.className='stk-feedback';
  const u=usuario(ctx); const atual=Number(mat.estoque_atual||0); const novo=tipo==='entrada'?atual+quantidade:atual-quantidade;
  const mov={material_id:id,tipo_movimentacao:tipo,quantidade,data_movimentacao:document.getElementById('movData').value||hoje(),observacao:document.getElementById('movObs').value.trim()||null,usuario_id:u.id||null,usuario_nome:userName(ctx)};
  if(tipo==='entrada'){ mov.fornecedor=document.getElementById('movFornecedor').value.trim()||null; mov.valor_unitario=Number(document.getElementById('movValor').value||0)||null; mov.numero_nf=document.getElementById('movNf').value.trim()||null; }
  else { mov.destino=document.getElementById('movDestino').value; mov.colaborador_nome=document.getElementById('movColab').value.trim()||null; mov.motivo=document.getElementById('movMotivo').value; const col=state.colaboradores.find(c=>norm(c.nome)===norm(mov.colaborador_nome)); mov.colaborador_id=col?.id||null; mov.coordenacao=col?.coordenacao||null; mov.supervisao=col?.supervisao||null; }
  const {error:e1}=await supabase.from('compras_estoque_movimentacoes').insert(mov); if(e1){ fb.textContent=e1.message; fb.className='stk-feedback err'; return; }
  const {error:e2}=await supabase.from('compras_estoque_materiais').update({estoque_atual:novo,updated_at:new Date().toISOString()}).eq('id',id); if(e2){ fb.textContent=e2.message; fb.className='stk-feedback err'; return; }
  fb.textContent='Movimentação salva.'; fb.className='stk-feedback ok'; await loadBase(); renderTab(ctx);
}

function renderInventario(box,ctx){ box.innerHTML=`<div class="card mt-16"><div class="section-head"><div><h3>Inventário físico</h3><p class="muted">Compare o estoque do sistema com a contagem real. O ajuste exige motivo.</p></div></div><form id="stkInvForm" class="stk-grid"><div class="stk-field stk-field-full"><label>Material</label><select id="invMaterial" required><option value="">Selecione...</option>${materialOptions()}</select></div><div class="stk-field"><label>Estoque contado</label><input id="invContado" type="number" step="0.01" min="0" required></div><div class="stk-field stk-field-full"><label>Motivo do ajuste</label><textarea id="invMotivo" rows="2" required placeholder="Ex: inventário mensal, perda, divergência de lançamento..."></textarea></div><div class="stk-actions stk-field-full"><button class="btn btn-primary" type="submit">Ajustar estoque</button><span id="invFb" class="stk-feedback"></span></div></form></div>${tableMateriais(state.materiais)}`; document.getElementById('stkInvForm').onsubmit=async(ev)=>{ev.preventDefault(); await salvarInventario(ctx);}; }
async function salvarInventario(ctx){ const id=document.getElementById('invMaterial').value; const mat=state.materiais.find(m=>m.id===id); const contado=Number(document.getElementById('invContado').value||0); const motivo=document.getElementById('invMotivo').value.trim(); const fb=document.getElementById('invFb'); if(!mat||!motivo){fb.textContent='Selecione o material e informe o motivo.';fb.className='stk-feedback err';return;} const sistema=Number(mat.estoque_atual||0), dif=contado-sistema, u=usuario(ctx); fb.textContent='Ajustando...'; const inv={material_id:id,estoque_sistema:sistema,estoque_contado:contado,diferenca:dif,motivo_ajuste:motivo,usuario_id:u.id||null,usuario_nome:userName(ctx)}; const {error:e1}=await supabase.from('compras_estoque_inventarios').insert(inv); if(e1){fb.textContent=e1.message;fb.className='stk-feedback err';return;} const {error:e2}=await supabase.from('compras_estoque_movimentacoes').insert({material_id:id,tipo_movimentacao:'ajuste',quantidade:Math.abs(dif),data_movimentacao:hoje(),motivo:'Inventário',observacao:motivo,usuario_id:u.id||null,usuario_nome:userName(ctx)}); if(e2) console.warn(e2); const {error:e3}=await supabase.from('compras_estoque_materiais').update({estoque_atual:contado,updated_at:new Date().toISOString()}).eq('id',id); if(e3){fb.textContent=e3.message;fb.className='stk-feedback err';return;} fb.textContent='Inventário ajustado.';fb.className='stk-feedback ok'; await loadBase(); renderTab(ctx); }

function renderAlertas(box,ctx){ const alertas=state.materiais.filter(m=>['baixo','critico'].includes(statusMaterial(m))); box.innerHTML=`<div class="section-head mt-16"><div><h3>Alertas de reposição</h3><p class="muted">Materiais zerados ou abaixo do mínimo.</p></div></div><div class="stk-table-wrap mt-12"><table class="stk-table"><thead><tr><th>Material</th><th>Atual</th><th>Mínimo</th><th>Quantidade sugerida</th><th>Ação</th></tr></thead><tbody>${alertas.length?alertas.map(m=>{const sug=Math.max(1,Number(m.estoque_minimo||0)-Number(m.estoque_atual||0));return `<tr><td><b>${esc(materialLabel(m))}</b><br><small>${esc(m.categoria||'')}</small></td><td>${qtd(m.estoque_atual)} ${esc(m.unidade||'UN')}</td><td>${qtd(m.estoque_minimo)}</td><td>${qtd(sug)} ${esc(m.unidade||'UN')}</td><td><button class="btn btn-small btn-primary" data-solicitar="${esc(m.id)}" type="button">Gerar Solicitação</button></td></tr>`}).join(''):`<tr><td colspan="5" class="stk-empty">Nenhum alerta no momento.</td></tr>`}</tbody></table></div><span id="alertFb" class="stk-feedback mt-12"></span>`; document.querySelectorAll('[data-solicitar]').forEach(b=>b.onclick=()=>gerarSolicitacaoCompra(ctx,b.dataset.solicitar)); }
async function gerarSolicitacaoCompra(ctx,id){ const m=state.materiais.find(x=>x.id===id); const fb=document.getElementById('alertFb'); if(!m) return; const sug=Math.max(1,Number(m.estoque_minimo||0)-Number(m.estoque_atual||0)); fb.textContent='Gerando solicitação...'; fb.className='stk-feedback'; const u=usuario(ctx); const header={data_solicitacao:hoje(),solicitante_id:u.id||null,solicitante:userName(ctx),coordenacao:u.coordenacao||u.supervisao||null,tipo_solicitacao:'estoque',status:'pendente',observacoes:`Reposição automática do estoque: ${materialLabel(m)}`,created_by:u.id||null}; const {data:sol,error:e1}=await supabase.from('compras_solicitacoes').insert(header).select('id').single(); if(e1){fb.textContent=e1.message;fb.className='stk-feedback err';return;} const item={solicitacao_id:sol.id,material:m.nome,tipo:m.categoria||'Outros',tamanho:m.tamanho||null,quantidade:sug,unidade:sug,status:'pendente'}; const {error:e2}=await supabase.from('compras_itens').insert(item); if(e2){fb.textContent=e2.message;fb.className='stk-feedback err';return;} fb.textContent='Solicitação de compra gerada.'; fb.className='stk-feedback ok'; }
function renderHistorico(box){ box.innerHTML=`<div class="section-head mt-16"><div><h3>Histórico</h3><p class="muted">Todas as entradas, saídas e ajustes recentes.</p></div><input class="stk-filter" id="histBusca" placeholder="Buscar no histórico..."></div><div id="histTabela">${tableHistorico(state.movs)}</div>`; document.getElementById('histBusca').oninput=(e)=>{ const q=norm(e.target.value); document.getElementById('histTabela').innerHTML=tableHistorico(state.movs.filter(r=>norm(`${r.tipo_movimentacao} ${r.motivo} ${r.observacao} ${r.colaborador_nome} ${r.destino} ${r.fornecedor} ${materialLabel(r.compras_estoque_materiais||{})}`).includes(q))); }; }

export async function renderContent(content, userContext) {
  window.__stkCtx=userContext;
  const hashTab=(window.location.hash||'').replace('#','').trim();
  if(['visao','materiais','entradas','saidas','inventario','alertas','historico'].includes(hashTab)) state.tab=hashTab;
  content.innerHTML=`${styles()}<section class="hero-card"><div><div class="eyebrow">Compras</div><h2>Carregando estoque...</h2><p>Preparando materiais e movimentações.</p></div></section>`;
  await loadBase();
  renderShell(content,userContext);
}

initProtectedPage('Estoque', renderContent);
