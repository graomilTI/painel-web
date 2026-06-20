import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
const esc=v=>String(v??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
let rows=[], all={btg:0,lista:0,dist:0};
async function count(table){const {count,error}=await supabase.from(table).select('*',{count:'exact',head:true}); if(error) return 0; return count||0;}
async function load(){
  const [btg,lista,dist]=await Promise.all([
    supabase.from('logistica_btg_solicitacoes').select('contrato_original,numero_os_relatorio,cliente,commodity,quantidade,checkin_diario,updated_at').limit(20000),
    count('logistica_btg_lista_os'),
    count('logistica_btg_distribuicao')
  ]);
  if(btg.error) throw new Error(btg.error.message);
  rows=(btg.data||[]).map(r=>({contrato:r.contrato_original||'',portal:r.numero_os_relatorio||'',cliente:r.cliente||'',produto:r.commodity||'',quantidade:r.quantidade||0,checkin:r.checkin_diario||'',updated:r.updated_at||''}));
  all={btg:rows.length,lista,dist};
}
function status(r){if(!/^P\d{5}\.\d{3}$/i.test(String(r.contrato).trim()))return'CORRIGIR CONTRATO'; if(norm(r.checkin)==='CONFIRMADO')return'OK'; return'CHECK-IN';}
function render(el){
  const q=norm(el.busca.value), list=rows.filter(r=>!q||norm(`${r.contrato} ${r.portal} ${r.cliente} ${r.produto} ${status(r)}`).includes(q));
  const pend=list.filter(r=>status(r)!=='OK').length;
  el.kpis.innerHTML=`<div class=k><span>Relatório BTG</span><b>${all.btg}</b></div><div class=k><span>Lista OS</span><b>${all.lista}</b></div><div class=k><span>Distribuição</span><b>${all.dist}</b></div><div class="k ${pend?'warn':'ok'}"><span>Pendências</span><b>${pend}</b></div>`;
  el.feedback.textContent=`${list.length} relatório(s) exibidos.`;
  el.table.innerHTML=list.length?`<div class=tw><table><thead><tr><th>Status</th><th>Portal</th><th>Contrato</th><th>Cliente</th><th>Produto</th><th>Quantidade</th><th>Check-in</th></tr></thead><tbody>${list.map(r=>`<tr><td><span class="st ${status(r)==='OK'?'ok':'warn'}">${status(r)}</span></td><td>${esc(r.portal||'—')}</td><td><code>${esc(r.contrato||'—')}</code></td><td>${esc(r.cliente||'—')}</td><td>${esc(r.produto||'—')}</td><td>${esc(r.quantidade||0)}</td><td>${esc(r.checkin||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class=empty>Nenhum relatório BTG encontrado. Execute o agente em AGENTES TI.</div>';
}
function styles(){const s=document.createElement('style');s.textContent=`.btg-card{border:1px solid rgba(52,211,153,.16);border-radius:18px;padding:16px;background:rgba(15,23,42,.35);margin-top:16px}.head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.head h3{margin:0;color:#f8fafc}.head p{margin:5px 0 0;color:#94a3b8;font-size:13px}.kpis{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:14px 0}.k{border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:12px;background:rgba(2,6,23,.28)}.k span{display:block;color:#94a3b8;font-size:11px;font-weight:800}.k b{display:block;color:#fff;font-size:20px}.k.warn{border-color:rgba(245,158,11,.35)}.search{min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e8f0;padding:8px 12px;width:100%;box-sizing:border-box}.tw{overflow:auto;border:1px solid rgba(52,211,153,.15);border-radius:16px}table{width:100%;min-width:820px;border-collapse:separate;border-spacing:0;color:#e2e8f0}th{background:#07170f;color:#bbf7d0;text-align:left;padding:8px;font-size:11px;text-transform:uppercase}td{padding:8px;border-bottom:1px solid rgba(148,163,184,.1);font-size:12px}code{color:#a7f3d0}.st{border-radius:999px;padding:3px 9px;font-size:11px;font-weight:900}.st.ok{background:rgba(22,163,74,.14);color:#86efac}.st.warn{background:rgba(245,158,11,.14);color:#fcd34d}.empty{border:1px dashed rgba(148,163,184,.25);border-radius:16px;padding:24px;color:#94a3b8;text-align:center}`;document.head.appendChild(s)}
initProtectedPage('BTG — Logística',async content=>{styles();content.innerHTML=`<section class=btg-card><div class=head><div><h3>BTG — Relatórios dos Agentes</h3><p>Consulta direta dos relatórios sincronizados pelos agentes no Supabase.</p></div><button class="btn btn-secondary" id=refresh>↻ Atualizar</button></div><div id=kpis class=kpis></div><input id=busca class=search placeholder="Buscar contrato, portal, cliente, produto..."/><div id=feedback class="feedback mt-16">Carregando...</div></section><section class=btg-card><div id=table></div></section>`;const el={kpis:document.getElementById('kpis'),busca:document.getElementById('busca'),feedback:document.getElementById('feedback'),table:document.getElementById('table')};document.getElementById('refresh').onclick=async()=>{await load();render(el)};el.busca.oninput=()=>render(el);try{await load()}catch(e){el.feedback.textContent='Erro: '+e.message}render(el)});
