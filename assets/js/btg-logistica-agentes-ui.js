import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
const esc=v=>String(v??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const money=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
let rows=[], escala=[], pontos=[], all={btg:0,lista:0,dist:0,pontos:0};
async function count(table){const {count,error}=await supabase.from(table).select('*',{count:'exact',head:true}); if(error) return 0; return count||0;}
const clean=v=>String(v??'').trim();
const contrato=v=>clean(v).toUpperCase().replace(/\s+/g,'');
const isContrato=v=>/^P\d{5}\.\d{3}$/i.test(contrato(v));
const num=v=>Number(v||0)||0;
function add(map,k,v){k=clean(k);if(!k)return;if(!map.has(k))map.set(k,[]);map.get(k).push(v)}
async function load(){
  const [btg,lista,dist,ops]=await Promise.all([
    supabase.from('logistica_btg_solicitacoes').select('contrato_original,numero_os_relatorio,cliente,commodity,quantidade,checkin_diario,updated_at').limit(20000),
    supabase.from('logistica_btg_lista_os').select('numero_os,contrato,situacao,financeiro,supervisao,lote,remanescente,updated_at').limit(20000),
    supabase.from('logistica_btg_distribuicao').select('numero_os,contrato,colaborador,supervisao,prod_dia_os,updated_at').limit(20000),
    supabase.from('operacional_os').select('numero_os,contrato,cliente,embarque,destino,produto,supervisao,remanescente,lote').ilike('cliente','%BTG%').limit(20000)
  ]);
  if(btg.error) throw new Error(btg.error.message); if(lista.error) throw new Error(lista.error.message); if(dist.error) throw new Error(dist.error.message);
  const btgRows=(btg.data||[]).map(r=>({contrato:contrato(r.contrato_original),portal:clean(r.numero_os_relatorio)||'—',cliente:clean(r.cliente)||'—',produto:clean(r.commodity)||'—',quantidade:r.quantidade||0,checkin:r.checkin_diario||'',updated:r.updated_at||''}));
  const listaRows=(lista.data||[]).map(r=>({os:clean(r.numero_os)||'—',contrato:contrato(r.contrato),situacao:clean(r.situacao),financeiro:clean(r.financeiro),supervisao:clean(r.supervisao)||'—',lote:r.lote,remanescente:r.remanescente,updated:r.updated_at||''}));
  const distRows=(dist.data||[]).map(r=>({os:clean(r.numero_os)||'—',contrato:contrato(r.contrato),classificador:clean(r.colaborador)||'—',supervisao:clean(r.supervisao)||'—',prodDia:r.prod_dia_os,updated:r.updated_at||''}));
  rows=btgRows; pontos=agruparPontos(ops.error?[]:(ops.data||[])); escala=montarEscala(btgRows,listaRows,distRows);
  all={btg:rows.length,lista:listaRows.length,dist:distRows.length,pontos:pontos.length};
}
function montarEscala(btgRows,listaRows,distRows){
  const listaPorContrato=new Map(), distPorOs=new Map(); listaRows.forEach(r=>add(listaPorContrato,r.contrato,r)); distRows.forEach(r=>add(distPorOs,r.os,r));
  const out=[];
  for(const b of btgRows){
    let osList=isContrato(b.contrato)?(listaPorContrato.get(b.contrato)||[]):[];
    if(!osList.length&&b.contrato.endsWith('001'))osList=listaPorContrato.get(`${b.contrato.slice(0,-3)}000`)||[];
    if(!osList.length){out.push({...b,os:'—',classificador:'—',supervisao:'—',status:'SEM OS',acao:'verificar contrato'});continue}
    for(const os of osList){
      const cls=distPorOs.get(os.os)||[];
      if(!cls.length){out.push({...b,os:os.os,classificador:'—',supervisao:os.supervisao,status:'AGUARDANDO ESCALA',acao:'escalar classificador'});continue}
      for(const c of cls){out.push({...b,os:os.os,classificador:c.classificador,supervisao:c.supervisao||os.supervisao,status:c.classificador&&c.classificador!=='—'?'PRONTO PARA BTG':'AGUARDANDO ESCALA',acao:'enviar'})}
    }
  }
  return out;
}
function agruparPontos(data){
  const m=new Map();
  for(const r of data){
    const ponto=(r.embarque||r.destino||'SEM PONTO').trim(); const key=norm(ponto)||'SEM PONTO';
    if(!m.has(key))m.set(key,{ponto,os:0,volume:0,clientes:new Set(),produtos:new Set(),supervisoes:new Set()});
    const g=m.get(key); g.os++; g.volume+=num(r.remanescente||r.lote); if(r.cliente)g.clientes.add(r.cliente); if(r.produto)g.produtos.add(r.produto); if(r.supervisao)g.supervisoes.add(r.supervisao);
  }
  return [...m.values()].sort((a,b)=>b.volume-a.volume||b.os-a.os).map(g=>({...g,clientes:[...g.clientes],produtos:[...g.produtos],supervisoes:[...g.supervisoes]}));
}
function status(r){if(!/^P\d{5}\.\d{3}$/i.test(String(r.contrato).trim()))return'CORRIGIR CONTRATO'; if(norm(r.checkin)==='CONFIRMADO')return'OK'; return'CHECK-IN';}
function filtrados(el){const q=norm(el.busca.value);return escala.filter(r=>!q||norm(`${r.os} ${r.portal} ${r.contrato} ${r.classificador} ${r.supervisao} ${r.cliente} ${r.produto} ${r.status}`).includes(q))}
async function criarJob(acao, itens, el){
  if(!itens.length){el.feedback.textContent='Nenhuma linha pronta para enviar.';return}
  const payload={acao, origem:'btg-logistica', total:itens.length, itens, criado_em:new Date().toISOString()};
  const {error}=await supabase.from('grm_sync_jobs').insert({agente_id:'sync-btg-classificador',status:'pendente',payload});
  if(error){el.feedback.textContent='Não consegui criar job. Falta configurar coluna payload ou agente sync-btg-classificador.';return}
  el.feedback.textContent=`Job criado para ${acao}: ${itens.length} linha(s).`;
}
function render(el){
  const q=norm(el.busca.value), list=rows.filter(r=>!q||norm(`${r.contrato} ${r.portal} ${r.cliente} ${r.produto} ${status(r)}`).includes(q)), pts=pontos.filter(p=>!q||norm(`${p.ponto} ${p.clientes.join(' ')} ${p.produtos.join(' ')} ${p.supervisoes.join(' ')}`).includes(q)), escRows=filtrados(el);
  const pronto=escRows.filter(r=>r.status==='PRONTO PARA BTG'), pend=list.filter(r=>status(r)!=='OK').length;
  el.kpis.innerHTML=`<div class=k><span>Relatório BTG</span><b>${all.btg}</b></div><div class=k><span>Lista OS</span><b>${all.lista}</b></div><div class=k><span>Distribuição</span><b>${all.dist}</b></div><div class=k><span>Pontos BTG</span><b>${all.pontos}</b></div><div class="k ${pronto.length?'ok':'warn'}"><span>Pronto p/ BTG</span><b>${pronto.length}</b></div>`;
  el.feedback.textContent=`${escRows.length} escala(s), ${pts.length} ponto(s) e ${list.length} relatório(s) exibidos.`;
  el.actions.innerHTML=`<button class="btn btn-secondary" id=enviarBtg>Enviar classificador ao BTG (${pronto.length})</button><button class="btn btn-secondary" id=enviarCheckin>Enviar link de check-in (${pronto.length})</button>`;
  document.getElementById('enviarBtg').onclick=()=>criarJob('devolver_classificador_btg',pronto.map(r=>({os_painel:r.os,os_portal:r.portal,contrato:r.contrato,classificador:r.classificador,supervisao:r.supervisao,cliente:r.cliente,produto:r.produto})),el);
  document.getElementById('enviarCheckin').onclick=()=>criarJob('enviar_link_checkin_btg',pronto.map(r=>({os_painel:r.os,os_portal:r.portal,contrato:r.contrato,classificador:r.classificador})),el);
  el.escala.innerHTML=escRows.length?`<div class=tw><table><thead><tr><th>Status</th><th>OS Painel</th><th>OS Portal BTG</th><th>Contrato</th><th>Classificador</th><th>Supervisão</th><th>Cliente</th><th>Produto</th></tr></thead><tbody>${escRows.map(r=>`<tr><td><span class="st ${r.status==='PRONTO PARA BTG'?'ok':'warn'}">${esc(r.status)}</span></td><td><b>${esc(r.os)}</b></td><td>${esc(r.portal)}</td><td><code>${esc(r.contrato)}</code></td><td>${esc(r.classificador)}</td><td>${esc(r.supervisao)}</td><td>${esc(r.cliente)}</td><td>${esc(r.produto)}</td></tr>`).join('')}</tbody></table></div>`:'<div class=empty>Nenhuma escala BTG encontrada.</div>';
  el.pontos.innerHTML=pts.length?`<div class=pts>${pts.map(p=>`<div class=pt><div><b>${esc(p.ponto||'SEM PONTO')}</b><small>${esc((p.produtos[0]||'Produto não informado'))}</small></div><div class=num><strong>${p.os}</strong><span>OS</span></div><div class=num><strong>${money.format(p.volume)}</strong><span>reman.</span></div><em>${esc((p.supervisoes[0]||'Sem supervisão'))}</em></div>`).join('')}</div>`:'<div class=empty>Nenhum ponto BTG encontrado em operacional_os.</div>';
  el.table.innerHTML=list.length?`<div class=tw><table><thead><tr><th>Status</th><th>Portal</th><th>Contrato</th><th>Cliente</th><th>Produto</th><th>Quantidade</th><th>Check-in</th></tr></thead><tbody>${list.map(r=>`<tr><td><span class="st ${status(r)==='OK'?'ok':'warn'}">${status(r)}</span></td><td>${esc(r.portal||'—')}</td><td><code>${esc(r.contrato||'—')}</code></td><td>${esc(r.cliente||'—')}</td><td>${esc(r.produto||'—')}</td><td>${esc(r.quantidade||0)}</td><td>${esc(r.checkin||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class=empty>Nenhum relatório BTG encontrado. Execute o agente em AGENTES TI.</div>';
}
function styles(){const s=document.createElement('style');s.textContent=`.btg-card{border:1px solid rgba(52,211,153,.16);border-radius:18px;padding:16px;background:rgba(15,23,42,.35);margin-top:16px}.head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.head h3{margin:0;color:#f8fafc}.head p{margin:5px 0 0;color:#94a3b8;font-size:13px}.kpis{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin:14px 0}.k{border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:12px;background:rgba(2,6,23,.28)}.k span{display:block;color:#94a3b8;font-size:11px;font-weight:800}.k b{display:block;color:#fff;font-size:20px}.k.warn{border-color:rgba(245,158,11,.35)}.k.ok{border-color:rgba(34,197,94,.35)}.search{min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e8f0;padding:8px 12px;width:100%;box-sizing:border-box}.btg-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.pts{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.pt{border:1px solid rgba(52,211,153,.15);border-radius:14px;background:rgba(2,6,23,.28);padding:12px;display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center}.pt b{display:block;color:#f8fafc}.pt small,.pt em,.num span{display:block;color:#94a3b8;font-size:11px}.pt em{grid-column:1/-1;font-style:normal}.num{text-align:right}.num strong{display:block;color:#86efac}.tw{overflow:auto;border:1px solid rgba(52,211,153,.15);border-radius:16px}table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;color:#e2e8f0}th{background:#07170f;color:#bbf7d0;text-align:left;padding:8px;font-size:11px;text-transform:uppercase}td{padding:8px;border-bottom:1px solid rgba(148,163,184,.1);font-size:12px}code{color:#a7f3d0}.st{border-radius:999px;padding:3px 9px;font-size:11px;font-weight:900}.st.ok{background:rgba(22,163,74,.14);color:#86efac}.st.warn{background:rgba(245,158,11,.14);color:#fcd34d}.empty{border:1px dashed rgba(148,163,184,.25);border-radius:16px;padding:24px;color:#94a3b8;text-align:center}@media(max-width:900px){.kpis{grid-template-columns:repeat(2,minmax(120px,1fr))}.pt{grid-template-columns:1fr}}`;document.head.appendChild(s)}
initProtectedPage('BTG — Logística',async content=>{styles();content.innerHTML=`<section class=btg-card><div class=head><div><h3>BTG — Escala e Check-in</h3><p>OS Painel + OS Portal BTG + Contrato + Classificador, prontos para devolução ao portal e envio do link de check-in.</p></div><button class="btn btn-secondary" id=refresh>↻ Atualizar</button></div><div id=kpis class=kpis></div><input id=busca class=search placeholder="Buscar OS, portal, contrato, classificador, ponto BTG..."/><div id=actions class=btg-actions></div><div id=feedback class="feedback mt-16">Carregando...</div></section><section class=btg-card><div class=head><div><h3>Escalas BTG</h3><p>Linhas prontas quando o gestor já escalou o classificador para a OS/ponto.</p></div></div><div id=escala></div></section><section class=btg-card><div class=head><div><h3>Pontos BTG</h3><p>OS agrupadas por ponto/local de embarque.</p></div></div><div id=pontos></div></section><section class=btg-card><div id=table></div></section>`;const el={kpis:document.getElementById('kpis'),busca:document.getElementById('busca'),feedback:document.getElementById('feedback'),table:document.getElementById('table'),pontos:document.getElementById('pontos'),escala:document.getElementById('escala'),actions:document.getElementById('actions')};document.getElementById('refresh').onclick=async()=>{await load();render(el)};el.busca.oninput=()=>render(el);try{await load()}catch(e){el.feedback.textContent='Erro: '+e.message}render(el)});
