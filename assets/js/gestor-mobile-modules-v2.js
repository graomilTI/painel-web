import './gestor-mobile-modules.js';
import { supabase } from './supabaseClient.js';
import { getSession } from './auth.js';
import { loadUserContext } from './sessionStore.js';

const MAX=768;
const ui={route:'',compras:'solicitar',log:'form',hotel:'solicitar'};
const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
const route=()=>String(location.pathname||'').split('/').filter(Boolean).pop()?.replace(/\.html$/i,'').toLowerCase()||'dashboard';
const mobile=()=>document.body.classList.contains('mobile-gestor-mode')&&innerWidth<=MAX;
const access={loaded:false,loading:false,supervisoes:[]};

function mkTab(txt,val){const b=document.createElement('button');b.type='button';b.className='gm-model-tab';b.dataset.gmValue=val;b.textContent=txt;return b}
function labels(table){const hs=qa('thead th',table).map(x=>String(x.textContent||'').replace(/[↕↑↓⇅▲▼]/g,'').trim());qa('tbody tr',table).forEach(tr=>[...tr.children].forEach((td,i)=>{if(td.tagName==='TD'&&Number(td.colSpan||1)===1&&!td.dataset.label&&hs[i])td.dataset.label=hs[i]}))}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}
function parseList(v){if(!v)return[];if(Array.isArray(v))return v.flatMap(parseList);if(typeof v==='object')return parseList(v.supervisao||v.supervisoes||v.nome||v.name);const t=String(v).trim();if(!t)return[];try{if((t.startsWith('[')&&t.endsWith(']'))||(t.startsWith('{')&&t.endsWith('}')))return parseList(JSON.parse(t))}catch{}return t.split(/[,;|\n]+/).map(x=>x.trim()).filter(Boolean)}
function uniq(list){const seen=new Set();return list.filter(v=>{const k=norm(v);if(!k||seen.has(k))return false;seen.add(k);return true})}

async function loadGestorAccess(){
  if(access.loaded||access.loading)return;
  access.loading=true;
  try{
    const ctx=loadUserContext()||{};
    const session=await getSession().catch(()=>null);
    let appUser=null;
    if(session?.user?.id){
      const {data}=await supabase.from('app_usuarios').select('supervisao').eq('auth_user_id',session.user.id).maybeSingle();
      appUser=data||null;
    }
    access.supervisoes=uniq([
      ...parseList(appUser?.supervisao),
      ...parseList(ctx?.user?.supervisao),
      ...parseList(ctx?.user?.supervisoes),
      ...parseList(ctx?.supervisao),
      ...parseList(ctx?.supervisoes),
    ]);
    access.loaded=true;
  }catch(e){console.warn('[gestor-mobile] supervisões do gestor',e)}finally{access.loading=false}
}

function filterSupervisoes(select){
  if(!select||!access.loaded)return;
  const hash=access.supervisoes.map(norm).sort().join('|');
  if(select.dataset.gmSupHash===hash)return;
  const atual=select.value;
  [...select.options].forEach(opt=>{
    if(!opt.value)return;
    const k=norm(opt.value);
    const ok=access.supervisoes.some(v=>{const a=norm(v);return a&&(k===a||k.includes(a)||a.includes(k))});
    if(!ok)opt.remove();
  });
  select.value=[...select.options].some(o=>o.value===atual)?atual:'';
  select.dataset.gmSupHash=hash;
}

function styles(){if(q('#gmModelStyles'))return;const s=document.createElement('style');s.id='gmModelStyles';s.textContent=`
@media(max-width:${MAX}px){
body.mobile-gestor-mode .gm-model-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:7px 0 11px;width:100%;padding:4px;border:1px solid var(--line);border-radius:14px;background:rgba(3,20,14,.72)}
body.mobile-gestor-mode .gm-model-tab{min-height:40px;border:1px solid transparent;background:transparent;color:var(--muted);border-radius:10px;font:inherit;padding:7px;font-size:13px;font-weight:800}.gm-model-tab.active{background:var(--green-soft)!important;border-color:var(--green-2)!important;color:var(--text)!important;box-shadow:0 5px 16px rgba(0,0,0,.2)}
/* compras */
body.mobile-gestor-mode .cmp-page-tabs{display:grid!important;grid-template-columns:1fr 1fr!important;gap:4px!important;width:100%!important;margin:0!important;padding:4px!important;border:1px solid var(--line)!important;border-radius:15px!important;background:rgba(3,20,14,.72)!important}
body.mobile-gestor-mode .cmp-page-tab{width:100%!important;min-height:44px!important;margin:0!important;padding:7px 10px!important;border-radius:11px!important;background:transparent!important;border-color:transparent!important;color:var(--muted)!important;font-size:14px!important;font-weight:850!important}
body.mobile-gestor-mode .cmp-page-tab.active{background:linear-gradient(145deg,var(--green-soft),rgba(13,57,39,.92))!important;border-color:var(--green-2)!important;color:var(--text)!important;box-shadow:0 6px 18px rgba(0,0,0,.2)}
body.mobile-gestor-mode #cmpTabArea{margin-top:8px!important}
body.mobile-gestor-mode #gmComprasNav{margin:0 0 8px!important}
body.mobile-gestor-mode .cmp-workspace{display:block!important;margin-top:0!important}.cmp-workspace[data-gm-view="solicitar"] .cmp-history-card{display:none!important}.cmp-workspace[data-gm-view="consultar"] .cmp-request-card{display:none!important}
body.mobile-gestor-mode .cmp-request-card,body.mobile-gestor-mode .cmp-history-card{background:var(--bg-card)!important;border:1px solid var(--line)!important;border-radius:16px!important;padding:12px!important}
body.mobile-gestor-mode .cmp-request-card .section-head{gap:9px!important;margin-bottom:10px!important}
body.mobile-gestor-mode .cmp-request-card .section-head h3{font-size:20px!important;line-height:1.15!important}
body.mobile-gestor-mode .cmp-request-card .cmp-tabs{display:grid!important;grid-template-columns:1fr 1fr!important;gap:4px!important;width:100%!important;padding:4px!important;border:1px solid var(--line)!important;border-radius:14px!important;background:rgba(3,20,14,.62)!important}.cmp-request-card .cmp-tab{min-height:42px!important;padding:7px 9px!important;border:1px solid transparent!important;border-radius:10px!important;background:transparent!important;color:var(--muted)!important;font-size:13px!important}.cmp-request-card .cmp-tab.active{background:var(--green-soft)!important;border-color:var(--green-2)!important;color:var(--text)!important}
body.mobile-gestor-mode .cmp-request-card .cmp-add-box{display:grid!important;grid-template-columns:52px minmax(0,1fr)!important;gap:8px!important}.cmp-request-card .cmp-add-box .cmp-field:nth-child(1),.cmp-request-card .cmp-add-box .cmp-field:nth-child(3){grid-column:1!important}.cmp-request-card .cmp-add-box .cmp-field:nth-child(2),.cmp-request-card .cmp-add-box .cmp-field:nth-child(4){grid-column:2!important}.cmp-request-card .cmp-add-action{grid-column:1/-1!important}.cmp-request-card .cmp-add-action .btn{width:100%!important}
body.mobile-gestor-mode .cmp-request-card .cmp-add-box .cmp-add-action{grid-column:1/-1!important;width:100%!important;min-width:0!important}body.mobile-gestor-mode .cmp-request-card .cmp-add-box .cmp-add-action .btn{width:100%!important;min-height:48px!important;white-space:normal!important}
body.mobile-gestor-mode .cmp-field input,body.mobile-gestor-mode .cmp-field select{background:var(--bg-soft)!important;border-radius:12px!important;min-height:42px!important}.cmp-field label{color:var(--muted)!important;font-size:10px!important}
body.mobile-gestor-mode #cmpSolicitar{width:100%!important;min-height:48px!important;border-radius:12px!important;font-size:15px!important}
body.mobile-gestor-mode .cmp-history-card #cmpRefresh{display:none!important}.cmp-history-filters{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:8px!important}.cmp-history-filter{min-height:43px!important;border-radius:12px!important;padding:6px!important}.cmp-empty{background:var(--bg-card)!important;border:1px solid var(--line)!important;border-radius:15px!important;padding:18px 12px!important;text-align:left!important}
body.mobile-gestor-mode .epi-filter-tabs-group{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important}.epi-filter-tabs .btn{width:100%!important;min-height:54px!important;border-radius:12px!important;padding:4px!important;font-size:11px!important;line-height:1.1!important}.epi-table-wrap{overflow:visible!important;border:0!important}.epi-table{min-width:0!important;width:100%!important}.epi-table thead{display:none!important}.epi-table,.epi-table tbody,.epi-table tr,.epi-table td{display:block!important;width:100%!important;box-sizing:border-box!important}.epi-table tr{margin:10px 0!important;border:1px solid var(--line)!important;border-radius:15px!important;background:var(--bg-card)!important}.epi-table td{padding:9px 11px!important;border-bottom:1px solid var(--line)!important}.epi-table td[data-label]::before{content:attr(data-label);display:block;color:var(--muted);font-size:9px;font-weight:700;text-transform:uppercase;margin-bottom:4px}.epi-table td[colspan]::before{display:none!important}.epi-acoes{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important}.epi-acoes .btn{width:100%!important;min-height:42px!important}#cmpTabArea>.card:has(.epi-table)>.section-head{display:none!important}
/* logistica */
body.mobile-gestor-mode .log-tab-bar{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}.log-tab{min-height:48px!important;border-radius:12px!important}.log-tab.active{background:var(--green-soft)!important;border-color:var(--green-2)!important;color:var(--text)!important}
body.mobile-gestor-mode #gmLogToolbar{display:grid;grid-template-columns:1.35fr .7fr .7fr;gap:8px;margin:10px 0}.gm-log-kpis{display:contents!important}#gmLogToolbar #abrirOsUploadWrap{margin:0!important;min-width:0!important}#gmLogToolbar #abrirOsUploadWrap>*{width:100%!important;min-height:52px!important;margin:0!important}#gmLogToolbar .fob-kpi{margin:0!important;min-width:0!important;border-radius:12px!important;padding:6px!important;background:var(--bg-card)!important;text-align:center!important;cursor:pointer;border:1px solid var(--line)!important}#gmLogToolbar .fob-kpi.gm-active{background:var(--green-soft)!important;border-color:var(--green-2)!important}#gmLogToolbar .fob-kpi strong{font-size:22px!important}#gmLogToolbar .fob-kpi span{font-size:10px!important}
body.mobile-gestor-mode #abrirOsReload{display:none!important}.abrir-os-card{margin-top:0!important;border-radius:16px!important;background:var(--bg-card)!important;padding:8px!important}.abrir-os-card>h4{display:none!important}.abrir-os-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}.abrir-os-grid>label.gm-full{grid-column:1/-1!important}.gm-log-title{grid-column:1/-1!important;padding-top:7px;border-top:1px solid var(--line);font-size:12px;color:var(--text)}.abrir-os-grid .log-input{background:var(--bg-soft)!important;border-radius:12px!important;min-height:50px!important;font-size:15px!important}#abrirOsSalvarBtn{width:100%!important;min-height:54px!important;border-radius:12px!important;font-size:15px!important}.gm-log-history>.log-subtitle{display:none!important}.gm-log-table tr{display:grid!important;grid-template-columns:105px 1fr!important;background:var(--bg-card)!important}.gm-log-table td[data-label="Data"]{grid-column:1}.gm-log-table td[data-label="Cliente / contrato"]{grid-column:2}.gm-log-table td[data-label="Origem / destino"],.gm-log-table td[data-label="Produto"],.gm-log-table td[data-label="Status"]{grid-column:1/-1!important}
/* hospedagem */
body.mobile-gestor-mode .hosp-tabs-bar{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin:0 0 8px!important}.hosp-tab-btn{min-height:50px!important;border-radius:12px!important}.hosp-tab-btn.active{background:var(--green-soft)!important;border-color:var(--green-2)!important;color:var(--text)!important}#gmHotelNav{margin:8px 0!important}
body.mobile-gestor-mode #hospPanelHotel .hosp-workspace-head,.hosp-form-intro{display:none!important}#hospPanelHotel .hosp-workspace{border:0!important;background:transparent!important}#hospPanelHotel[data-gm-view="solicitar"] .hosp-list-pane{display:none!important}#hospPanelHotel[data-gm-view="acompanhar"] .hosp-form-pane{display:none!important}#hospPanelHotel .hosp-form{padding:0!important}.hosp-grp{background:var(--bg-card)!important;border:1px solid var(--line)!important;padding:10px 8px!important;margin-bottom:6px!important;border-radius:16px!important}.hosp-grp-h{font-size:11px!important;color:var(--green-2)!important}.hosp-grid{grid-template-columns:1fr 1fr!important;gap:7px!important}.hosp-field{grid-column:span 1!important}.hosp-field.full{grid-column:1/-1!important}.hosp-field input,.hosp-field select,.hosp-field textarea,.hosp-colab-row input{min-height:52px!important;background:var(--bg-soft)!important;border-radius:12px!important;font-size:15px!important}.hosp-grp:has(#colabBox) .hosp-grp-h{display:flex!important;justify-content:space-between!important;align-items:center!important}#addColabBtn{margin:0!important;padding:4px 6px!important;font-size:13px!important}#colabBaseInfo,#clearBtn{display:none!important}.hosp-colab-row{grid-template-columns:minmax(0,1fr) 54px!important}.hosp-remove{width:54px!important;height:52px!important}.hosp-form-actions{display:block!important;padding-top:5px!important;border:0!important}#submitBtn{width:100%!important;min-height:48px!important;border-radius:12px!important}.hosp-list-head{display:none!important}
body.mobile-gestor-mode #minhasTbody>tr:not(:has(.hosp-empty)){display:grid!important;grid-template-columns:minmax(0,1fr) 118px!important;background:var(--bg-card)!important;border-radius:16px!important;overflow:visible!important}#minhasTbody>tr>td[data-label="Código"],#minhasTbody>tr>td[data-label="Embarque"]{display:none!important}#minhasTbody>tr>td[data-label="Colaboradores"]{grid-column:1;grid-row:1}#minhasTbody>tr>td[data-label="Cidade"]{grid-column:1;grid-row:2}#minhasTbody>tr>td[data-label="Período"]{grid-column:2;grid-row:1/3}#minhasTbody>tr>td[data-label="Hotel"]{grid-column:1;grid-row:3}#minhasTbody>tr>td[data-label="Status"]{grid-column:2;grid-row:3}#minhasTbody>tr>td[data-label="Ações"]{grid-column:1/-1;grid-row:4}#minhasTbody>tr>td[data-label="Período"]::before,#minhasTbody>tr>td[data-label="Status"]::before,#minhasTbody>tr>td[data-label="Ações"]::before{display:none!important}.gm-period{display:grid;gap:3px}.gm-period span{background:transparent;padding:2px 4px;font-size:10px}.gm-period b{display:block;background:transparent;color:var(--muted);padding:0;margin:0 0 1px;border-radius:0;font-size:8px;line-height:1}.hosp-row-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}.hosp-row-actions button{min-height:44px!important;border-radius:10px!important;padding:6px 4px!important;font-size:11px!important;white-space:nowrap!important}
body.mobile-gestor-mode #hospPanelAlojamento .hosp-workspace{border:0!important;background:transparent!important}.hospA-modebar{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important;margin:0 0 8px!important}.hospA-mode-btn{min-height:43px!important}.hospA-addbar{display:grid!important;grid-template-columns:76px minmax(0,1fr)!important;gap:6px!important}.hospA-addbar #hospAAlojSelect{grid-column:1/-1!important;width:100%!important;min-width:0!important;min-height:48px!important}.hospA-addbar #hospAAddBtn{grid-column:1;grid-row:2;width:100%!important;padding:4px!important}.hospA-addbar .hospA-ac{grid-column:2;grid-row:2;min-width:0!important}.hospA-addbar #hospABusca{grid-column:1/-1;width:100%!important;min-width:0!important}#hospPanelAlojamento[data-gm-mode="atual"] #hospABusca{display:none!important}
/* patrimonio */
body.mobile-gestor-mode .pat-tabs{grid-template-columns:1fr 1fr!important;gap:6px!important}.pat-hist-card{min-height:38px!important;border-radius:12px!important;padding:6px 8px!important;background:var(--bg-card)!important}.pat-hist-card-active{background:var(--green-soft)!important;color:var(--text)!important;border-color:var(--green-2)!important}#patHistoricoSection{background:transparent!important;border:0!important;padding:0!important}#patHistoricoSection .pat-hist-controls{display:grid!important;grid-template-columns:64px minmax(0,1fr)!important;gap:6px!important}#patDownloadTipo{grid-column:1;grid-row:1;width:100%!important;min-width:0!important;min-height:38px!important;border-radius:10px!important;padding:4px!important;font-size:10px!important}#patHistFilterNum{grid-column:2;grid-row:1;min-height:38px!important;border-radius:10px!important;font-size:11px!important}#patDownloadBtn{grid-column:1;grid-row:2;width:100%!important;min-height:38px!important;border-radius:10px!important;padding:4px!important;font-size:10px!important}#patHistFilterMaterial{grid-column:2;grid-row:2;min-height:38px!important;border-radius:10px!important;font-size:11px!important}#patHistRefresh{display:none!important}
body.mobile-gestor-mode #patHistoricoSection .pat-hist-table{display:table!important;width:100%!important;min-width:0!important;border-collapse:collapse!important;table-layout:fixed!important}.pat-hist-table>thead{display:table-header-group!important}.pat-hist-table>tbody{display:table-row-group!important}.pat-hist-table>thead>tr,.pat-hist-table>tbody>tr.pat-hist-row{display:table-row!important;background:var(--bg-card)!important}.pat-hist-table>thead>tr>th,.pat-hist-table>tbody>tr.pat-hist-row>td{display:table-cell!important;width:auto!important;padding:6px!important;font-size:10px!important;border-bottom:1px solid var(--line)!important}.pat-hist-table>tbody>tr.pat-hist-row>td::before{display:none!important}.pat-hist-table th:nth-child(2),.pat-hist-table td:nth-child(2){width:48px!important;text-align:center!important}.pat-hist-table th:nth-child(3),.pat-hist-table td:nth-child(3){width:62px!important;text-align:center!important}.pat-hist-name-cell{font-size:10px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:210px!important}
}
`;document.head.appendChild(s)}

function compras(){if(route()!=='compras')return;const root=q('#pageContent'),w=q('.cmp-workspace',root);if(!w)return;let n=q('#gmComprasNav',root);if(!n){n=document.createElement('div');n.id='gmComprasNav';n.className='gm-model-tabs';n.append(mkTab('Solicitar','solicitar'),mkTab('Consultar','consultar'));w.before(n);n.onclick=e=>{const b=e.target.closest('[data-gm-value]');if(b){ui.compras=b.dataset.gmValue;compras()}}}w.dataset.gmView=ui.compras;qa('[data-gm-value]',n).forEach(b=>b.classList.toggle('active',b.dataset.gmValue===ui.compras));qa('.epi-table').forEach(labels)}

function logistica(){
  if(route()!=='logistica')return;
  const root=q('#logContent'),form=q('.abrir-os-card',root),k=q('.fob-kpis',root);
  if(!root||!form||!k)return;
  ['osContratante','osFilialPagadora'].forEach(id=>q('#'+id,form)?.closest('label')?.classList.add('gm-full'));
  q('#osProdutor',form)?.closest('label')?.classList.remove('gm-full');
  const grid=q('.abrir-os-grid',form), produtor=q('#osProdutor',form)?.closest('label'), supervisao=q('#osRegional',form)?.closest('label');
  if(produtor&&supervisao&&produtor.nextElementSibling!==supervisao)produtor.insertAdjacentElement('afterend',supervisao);
  if(supervisao)supervisao.classList.remove('gm-full');
  const supSelect=q('#osRegional',form);filterSupervisoes(supSelect);
  if(!access.loaded&&!access.loading)loadGestorAccess().then(schedule);
  [['osArmazemEmbarque','Dados do Embarque','emb'],['osCidadeDestino','Dados do Destino','dst']].forEach(([id,txt,key])=>{const t=q('#'+id,grid)?.closest('label');if(t&&!q('[data-gm-title="'+key+'"]',grid)){const d=document.createElement('div');d.className='gm-log-title';d.dataset.gmTitle=key;d.textContent=txt;t.before(d)}});
  const title=qa('.log-subtitle',root).find(x=>/minhas solicita/i.test(x.textContent||'')),hist=title?.parentElement;hist?.classList.add('gm-log-history');
  let tb=q('#gmLogToolbar',root);if(!tb){tb=document.createElement('div');tb.id='gmLogToolbar';k.before(tb)}
  const up=q('#abrirOsUploadWrap');if(up&&up.parentElement!==tb)tb.append(up);
  const uploadStatus=q('#abrirOsUploadStatus',up);if(uploadStatus)uploadStatus.hidden=uploadStatus.dataset.tone==='muted';
  k.classList.add('gm-log-kpis');
  qa('.fob-kpi',k).forEach((x,i)=>{x.dataset.gmFilter=i?'cadastradas':'aguardando';const sp=q('span',x);if(sp)sp.textContent=i?'Cadastradas':'Aguardando';if(!x.dataset.gmBound){x.tabIndex=0;x.onclick=()=>{const m=x.dataset.gmFilter;ui.log=ui.log===m?'form':m;logistica()};x.dataset.gmBound='1'}x.classList.toggle('gm-active',ui.log===x.dataset.gmFilter)});
  if(k.parentElement!==tb)tb.append(k);form.hidden=ui.log!=='form';if(hist)hist.hidden=ui.log==='form';
  const table=q('.log-table',hist);if(table){table.classList.add('gm-log-table');labels(table);qa('tbody tr',table).forEach(r=>{const st=q('[data-label="Status"]',r)?.textContent?.toUpperCase()||'',cad=/OS\s*\d+|CADASTRAD/.test(st),agu=/PENDENTE|AGUARDANDO|ANALISE|ANÁLISE/.test(st);r.hidden=ui.log==='cadastradas'?!cad:ui.log==='aguardando'?!agu:false})}
}

function hospedagem(){if(route()!=='hospedagem')return;const root=q('#pageContent'),tabs=q('.hosp-tabs-bar',root),hotel=q('#hospPanelHotel',root),aloj=q('#hospPanelAlojamento',root);if(!tabs||!hotel||!aloj)return;let n=q('#gmHotelNav',root);if(!n){n=document.createElement('div');n.id='gmHotelNav';n.className='gm-model-tabs';n.append(mkTab('Solicitar','solicitar'),mkTab('Acompanhar','acompanhar'));tabs.after(n);n.onclick=e=>{const b=e.target.closest('[data-gm-value]');if(b){ui.hotel=b.dataset.gmValue;hospedagem()}}}n.hidden=hotel.hidden;hotel.dataset.gmView=ui.hotel;qa('[data-gm-value]',n).forEach(b=>b.classList.toggle('active',b.dataset.gmValue===ui.hotel));const add=q('#addColabBtn',hotel),head=add?.closest('.hosp-grp')?.querySelector('.hosp-grp-h');if(add&&head&&add.parentElement!==head){add.textContent='＋ Adicionar';head.append(add)}qa('#minhasTbody>tr',hotel).forEach(r=>{const p=q('td[data-label="Período"]',r);if(p&&!p.dataset.gmP){const m=(p.textContent||'').match(/(\d{2}\/\d{2}\/\d{4})\s+até\s+(\d{2}\/\d{2}\/\d{4})/);if(m){p.innerHTML=`<div class="gm-period"><span><b>Entrada</b>${m[1]}</span><span><b>Saída</b>${m[2]}</span></div>`;p.dataset.gmP='1'}}});const mb=q('.hospA-modebar',aloj),ab=q('.hospA-addbar',aloj);if(mb&&ab&&mb.nextElementSibling!==ab)ab.before(mb);aloj.dataset.gmMode=q('.hospA-mode-btn.active',aloj)?.dataset.hospAMode||'atual'}

function patrimonio(){if(route()!=='patrimonios')return;const t=q('#patHistoricoSection .pat-hist-table');if(t)t.classList.add('gm-pat');const refresh=q('#patHistRefresh');if(refresh)refresh.hidden=true}
function run(){if(!mobile())return;const r=route();if(r!==ui.route){ui.route=r;if(r==='compras')ui.compras='solicitar';if(r==='logistica')ui.log='form';if(r==='hospedagem')ui.hotel='solicitar'}compras();logistica();hospedagem();patrimonio();qa('.epi-table').forEach(labels)}
styles();let raf=0;const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(run)};new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-tone']});addEventListener('resize',schedule,{passive:true});addEventListener('popstate',schedule);addEventListener('hashchange',schedule);schedule();
