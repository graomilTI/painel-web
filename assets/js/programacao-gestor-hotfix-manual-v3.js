import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';
import { TODAS_SUPERVISOES } from './programacao-gestor-filtro-fix.js';

const S={poolKey:'',pool:[],poolPromise:null,poolPromiseKey:'',map:null,mapEl:null,osLayer:null,colabLayer:null,rotaLayer:null,markers:[],mapKey:'',mapTimer:null,tileLayer:null};
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const cpf=v=>String(v||'').replace(/\D/g,'');
const placa=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const hoje=()=>{const n=new Date();return new Date(n.getTime()-n.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const geo=(a,b)=>a!=null&&b!=null&&Number.isFinite(Number(a))&&Number.isFinite(Number(b));
const letter=t=>norm(t).includes('INTERMITENTE')?'I':norm(t).includes('DIARISTA')?'D':'E';
const tipo=r=>r?.tipoLabel||r?.tipo_contrato||r?.tipo||'Efetivo';
const isMot=r=>!!(r?.veiculoId||r?.veiculo_id||r?.veiculoPlaca||r?.veiculo_placa||r?.placa_veiculo);
const pos=r=>{const lat=r?.latitude??r?.lat??r?.colab_lat,lng=r?.longitude??r?.lng??r?.lon??r?.colab_lng;return geo(lat,lng)?{lat:Number(lat),lng:Number(lng)}:null};
const cidadeEmb=e=>(/^[A-Z]{2}\s*[–-]\s*([^(]+)/i.exec(String(e||'').trim())||[,''])[1].trim();
const step2=()=>{const p=document.getElementById('pgcPane2');return!!p&&!p.hidden};
function ctx(){const supervisao=document.getElementById('progSup')?.value||'',todas=supervisao===TODAS_SUPERVISOES,map=todas?(window.__progGetProgramacaoIdMap?.()||new Map()):new Map();return{supervisao,supervisoes:todas?[...map.keys()]:[supervisao].filter(Boolean)}}
function css(){if(document.getElementById('pgcManualV3Css'))return;const s=document.createElement('style');s.id='pgcManualV3Css';s.textContent=`
#pgcPane1 .prog-section-title{margin-bottom:8px!important}#pgcPane1 .peqb-block-head{display:none!important}.pgc-os-kpi-head{display:grid;grid-template-columns:minmax(220px,1.45fr) minmax(330px,2.1fr) 90px 80px 210px;gap:8px;margin:4px 0 8px}.pgc-os-kpi-head span{font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.06em;color:#93c5fd;padding:0 10px}.pgc-os-kpi-head span:nth-child(n+3){text-align:center}.pgc-os-kpi-head span:last-child{color:#bbf7d0}
#pgcPane1 .peqb-os-list{display:flex!important;flex-direction:column!important;gap:8px!important;max-height:none!important;overflow:visible!important;padding-right:0!important;background:transparent!important;border:0!important}#pgcPane1 .peqs-row{display:block!important;border-radius:14px!important;padding:8px!important;background:rgba(2,6,23,.26)!important;border:1px solid rgba(52,211,153,.14)!important;box-shadow:none!important;min-height:0!important}#pgcPane1 .peqs-row .peqb-os2-left{display:grid!important;grid-template-columns:minmax(220px,1.45fr) minmax(330px,2.1fr) 90px 80px 210px!important;gap:8px!important;align-items:center!important;padding:0!important;border:0!important;background:transparent!important;min-height:0!important}#pgcPane1 .peqs-row .peqb-os2-kpis{display:contents!important}#pgcPane1 .peqs-row .peqb-os2-kpi{min-width:0!important;margin:0!important;padding:7px 10px!important;border-radius:11px!important;border:1px solid rgba(148,163,184,.12)!important;background:rgba(15,23,42,.42)!important;height:43px!important;box-sizing:border-box;display:flex!important;align-items:center!important;overflow:hidden!important}#pgcPane1 .peqs-row .peqb-os2-kpi span{display:none!important}#pgcPane1 .peqs-row .peqb-os2-kpi strong{display:block!important;width:100%!important;font-size:12.2px!important;line-height:1.08!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;color:#f8fafc!important;margin:0!important}#pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(3),#pgcPane1 .peqs-row .peqb-os2-kpi:nth-child(4){text-align:center!important}#pgcPane1 .peqs-row .peqb-os2-kpi strong *{display:inline!important;white-space:nowrap!important}#pgcPane1 .peqs-row .peqb-os2-kpi strong br{display:none!important}#pgcPane1 .peqs-row .peqb-os2-tagsrow{margin:0!important;height:43px!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(15,23,42,.18)!important;border:1px solid rgba(52,211,153,.10)!important;border-radius:11px!important;padding:3px 7px!important}#pgcPane1 .peqs-row .peqb-status-strip{margin:0!important;gap:7px!important;flex-wrap:nowrap!important}#pgcPane1 .peqs-row .peqb-st{height:29px!important;min-width:32px!important;width:32px!important;border-radius:999px!important;font-size:11px!important;padding:0!important}
#pgcPane2 #peqbAutoPreencher,#pgcPane2 #peqbSugerirCaronas,#pgcPane2 #peqbCaronasMsg,#pgcPane2 #peqbVerMapa,#pgcPane2 .peqb-legend,#pgcPane2 [data-confirmar],#pgcPane2 .peqb-cand,#pgcPane2 .peqb-cand-more,#pgcPane2 .peqb-cand-list,#pgcPane2 [data-outros],#pgcPane2 .peqb-row-btn.hotel,#pgcPane2 .peqb-cand-flag.hotel{display:none!important}#pgcPane2 .peqb-toolbar::after{content:'Vinculação manual: arraste no mapa ou na lista lateral.';font-size:11px;color:#9fb7aa;align-self:center}#pgcPane2 #peqbMapBand{display:block!important;margin:0 0 12px!important}.pmg-map{height:min(1200px,calc(100vh - 180px))!important;min-height:460px!important}.pmg-drag-icon{cursor:grab!important}.leaflet-dragging .pmg-drag-icon{cursor:grabbing!important}.leaflet-marker-icon.pmg-drag-icon{pointer-events:auto!important}.pmg-help{font-size:10.5px;color:#9fb7aa}.pmg-pending{animation:pmgPending .8s ease-in-out infinite!important}@keyframes pmgPending{0%,100%{opacity:1}50%{opacity:.3}}#pmgTipoMapa{color-scheme:dark;height:32px;box-sizing:border-box}
#pgcPane3 .prog-section-title{margin-bottom:6px!important;align-items:center!important}#pgcPane3 .prog-section-title h4{font-size:18px!important;letter-spacing:0!important}.pgc-desp-head{display:none!important}#pgcPane3 .peqd-list{gap:6px!important;overflow:auto;border:0;border-radius:0}
/* Etapa 3: 1 linha só por colaborador -- nome / estadia / dias / refeições / deslocamento / placa / extras.
   .peqd-sec e seus filhos internos (.peqd-row/.peqd-chips) viram display:contents pra "desembrulhar"
   os campos de verdade (select/input/button) direto como itens do flex do card -- sem tocar no HTML
   nem no autosave de programacao-despesas.js, que continua lendo os mesmos data-tab/data-fld. */
#pgcPane3 .peqd-card{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:8px!important;padding:8px 12px!important;border-radius:12px!important;border:1px solid rgba(52,211,153,.16)!important;background:rgba(2,6,23,.22)!important;min-width:0;overflow-x:auto}
#pgcPane3 .peqd-head{flex:0 0 auto!important;min-width:150px!important;max-width:220px!important;margin:0!important;overflow:hidden}
#pgcPane3 .peqd-av{width:26px!important;height:26px!important}#pgcPane3 .peqd-nome{font-size:12px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#pgcPane3 .peqd-os-ref{display:none!important}
#pgcPane3 .peqd-sec-label{display:none!important}#pgcPane3 .peqd-sec:not([data-sec="extras"]){display:contents!important}#pgcPane3 .peqd-sec[data-sec="estadia"] .peqd-row,#pgcPane3 .peqd-sec[data-sec="deslocamento"] .peqd-row,#pgcPane3 .peqd-sec[data-sec="alimentacao"] .peqd-chips{display:contents!important}
#pgcPane3 .peqd-inp{min-height:29px!important;font-size:11px!important;padding:4px 6px!important;flex:0 0 auto!important}
#pgcPane3 [data-estadia-destino]:has(.peqd-inp-na){display:none!important}#pgcPane3 [data-estadia-destino]{flex:0 0 120px!important}
#pgcPane3 .peqd-tipo-est{flex:0 0 92px!important;width:92px!important}#pgcPane3 .peqd-dias{flex:0 0 34px!important;width:34px!important}
#pgcPane3 .peqd-chip{flex:0 0 auto!important;padding:5px 9px!important;font-size:10.5px!important}
#pgcPane3 .peqd-tipo-desl{flex:0 0 100px!important;width:100px!important}#pgcPane3 .peqd-placa{flex:0 0 84px!important;width:84px!important}
#pgcPane3 .peqd-km,#pgcPane3 .peqd-valor,#pgcPane3 .peqd-obs,#pgcPane3 .peqd-extra-obs{display:none!important}
#pgcPane3 [data-sec="extras"]{flex:0 0 auto!important;margin-left:auto!important;display:flex!important;align-items:center!important;gap:6px!important}#pgcPane3 .peqd-extra-list{display:flex!important;gap:4px!important}#pgcPane3 .peqd-extra-item{display:flex!important;gap:4px!important;padding:3px 5px!important;border-radius:7px!important}#pgcPane3 .peqd-extra-desc{display:none!important}#pgcPane3 .peqd-extra-tipo,#pgcPane3 .peqd-extra-valor{width:80px!important;min-width:0!important}#pgcPane3 .peqd-extra-rm{width:26px!important;height:26px!important}#pgcPane3 .peqd-extra-add{flex:0 0 auto!important;white-space:nowrap!important}
.pgc-hotel-cidade{width:120px!important;min-width:100px!important}
@media(max-width:980px){.pgc-os-kpi-head{display:none!important}#pgcPane1 .peqs-row .peqb-os2-left{grid-template-columns:1fr 1fr!important}}@media(max-width:720px){#pgcPane1 .peqs-row .peqb-os2-left{display:block!important}#pgcPane1 .peqs-row .peqb-os2-kpi,#pgcPane1 .peqs-row .peqb-os2-tagsrow{margin-bottom:7px!important}}
`;document.head.appendChild(s)}
function step1(){const pane=document.getElementById('pgcPane1'),list=pane?.querySelector('#peqsOsList,.peqb-os-list');if(!pane||!list)return;if(!pane.querySelector('.pgc-os-kpi-head'))list.insertAdjacentHTML('beforebegin','<div class="pgc-os-kpi-head"><span>Cliente</span><span>Local de embarque</span><span>Rem.</span><span>O.S.</span><span>Ações</span></div>');pane.querySelectorAll('.peqb-os2-kpi strong').forEach(s=>{if(s.children.length)return;const t=String(s.textContent||'').replace(/\s+/g,' ').trim();if(s.textContent!==t)s.textContent=t})}
function despesas(){const pane=document.getElementById('pgcPane3'),list=pane?.querySelector('#peqdRoster');if(!pane||!list)return;pane.querySelectorAll('.peqd-card').forEach(card=>{if(norm(card.querySelector('[data-fld="tipo_estadia"]')?.value||'')==='HOTEL'){const dest=card.querySelector('[data-estadia-destino]');if(dest){const cid=cidadeEmb(card.dataset.embarque)||card.querySelector('[data-fld="cidade"]')?.value||'';dest.innerHTML=`<input class="peqd-inp peqd-inp-sm pgc-hotel-cidade" data-tab="estadia" data-fld="cidade" value="${esc(cid)}" placeholder="Cidade do embarque" />`}}const add=card.querySelector('.peqd-extra-add');if(add&&add.textContent!=='Adicionar')add.textContent='Adicionar'})}
function addPool(m,row,extras={}){
  // colaborador_cruzamento.colaborador_id é um UUID interno da tabela, diferente
  // do id baseado em CPF que candidatos/colaboradoresRegional/equipeRows usam
  // (coalesce(cpf_digits, nome), vindo das RPCs). Priorizar cpf(row.cpf) antes de
  // colaborador_id evita criar 2 entradas pra mesma pessoa — uma com coordenada
  // real (do cruzamento) que nunca se junta com a outra (sem coordenada, das
  // demais fontes), que era o que caía no círculo do fallbackPos.
  const id=String(row?.colaboradorId||cpf(row?.cpf)||row?.colaborador_id||row?.id||'').trim();
  const nome=String(row?.nome||row?.nome_colaborador||row?.colaborador_nome||row?.funcionario||row?.motorista_atual||row?.patrimonio_funcionario||'').trim();
  if(!id||!nome)return;
  const st=norm(`${row?.situacao||''} ${row?.status||''}`);
  if(st.includes('DESLIG')||st.includes('INATIVO'))return;
  const old=m.get(id)||{};
  m.set(id,{
    ...old,
    ...extras,
    colaboradorId:id,
    nome,
    tipoLabel:row?.tipoLabel||row?.tipo_contrato||old.tipoLabel||'Efetivo',
    supervisao:row?.supervisao||old.supervisao||null,
    coordenacao:row?.coordenacao||old.coordenacao||null,
    cargo:row?.cargo||old.cargo||null,
    lat:row?.lat??row?.latitude??row?.colab_lat??old.lat??null,
    lng:row?.lng??row?.longitude??row?.colab_lng??old.lng??null,
    veiculoId:row?.veiculoId||row?.veiculo_id||old.veiculoId||null,
    veiculoPlaca:row?.veiculoPlaca||row?.veiculo_placa||row?.placa_veiculo||old.veiculoPlaca||'',
    endereco:row?.endereco||row?.endereco_base||old.endereco||'',
    linked:!!(extras.linked||old.linked)
  });
}
function addVehiclePool(m,row){
  const nome=String(row?.motorista_atual||row?.patrimonio_funcionario||'').trim();
  if(!nome)return;
  const nomeKey=norm(nome);
  let id='';
  for(const [k,v] of m.entries()){if(norm(v.nome)===nomeKey){id=k;break}}
  // Sem colaborador correspondente = sem endereço real. Antes isso criava um
  // id sintético (MOTORISTA:nome) que caía no fallbackPos e aparecia
  // agrupado no centro do mapa sem posição de verdade — só ruído confuso.
  if(!id)return;
  addPool(m,{colaborador_id:id,nome,tipo_contrato:'Motorista',supervisao:row?.supervisao,coordenacao:row?.coordenacao,status:row?.status,veiculo_id:row?.id,veiculo_placa:row?.placa||row?.placa_normalizada,placa_veiculo:row?.placa||row?.placa_normalizada});
}
async function pool(){const snap=window.__peqbGetEquipeSnapshot?.(),c=ctx(),supervisoes=c.supervisoes.length?c.supervisoes:(snap?.supervisoesResolvidas||[]),key=supervisoes.slice().sort().join('|')||'sem-supervisao';if(S.poolKey===key&&S.pool.length)return S.pool;if(S.poolPromise&&S.poolPromiseKey===key)return S.poolPromise;S.poolKey=key;S.poolPromiseKey=key;const carregar=(async()=>{const m=new Map();
    const cpfsConfirmados=[...new Set((snap?.osComCandidatosAtual||[]).flatMap(it=>(it.equipeRows||[]).map(r=>String(r.colaborador_id||'').trim())).filter(Boolean))];
    const qCruz=supervisoes.length?(supervisoes.length>1?supabase.from('colaborador_cruzamento').select('colaborador_id,cpf,nome,supervisao,coordenacao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa').in('supervisao',supervisoes):supabase.from('colaborador_cruzamento').select('colaborador_id,cpf,nome,supervisao,coordenacao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa').eq('supervisao',supervisoes[0])).limit(12000):Promise.resolve({data:[]});
    // Colaborador confirmado (programacao_equipe) pode ter o cadastro em
    // colaborador_cruzamento sob OUTRA supervisão (atende O.S. fora da região
    // de origem) -- a busca acima, filtrada pela supervisão selecionada, nunca
    // pega a coordenada dele. Busca extra por cpf, sem filtro de supervisão,
    // só pra quem já está confirmado nesta programação.
    const qConf=cpfsConfirmados.length?supabase.from('colaborador_cruzamento').select('colaborador_id,cpf,nome,supervisao,coordenacao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa').in('cpf',cpfsConfirmados).limit(2000):Promise.resolve({data:[]});
    const qFrota=supervisoes.length?(supervisoes.length>1?supabase.from('frotas_veiculos').select('id,placa,placa_normalizada,motorista_atual,patrimonio_funcionario,supervisao,coordenacao,status').eq('status','ATIVO').not('motorista_atual','is',null).in('supervisao',supervisoes):supabase.from('frotas_veiculos').select('id,placa,placa_normalizada,motorista_atual,patrimonio_funcionario,supervisao,coordenacao,status').eq('status','ATIVO').not('motorista_atual','is',null).eq('supervisao',supervisoes[0])).limit(5000):Promise.resolve({data:[]});
    // As 3 buscas são independentes entre si -- rodam em paralelo em vez de
    // sequenciais pra não somar a latência de rede de cada uma (isso é o que
    // deixava as cores/posições dos marcadores do mapa demorando pra aparecer).
    const[rCruz,rConf,rFrota]=await Promise.all([qCruz,qConf,qFrota]);
    try{if(rCruz.error)throw rCruz.error;(rCruz.data||[]).forEach(r=>addPool(m,r))}catch(e){console.warn('[pgc-v3] pool colaborador_cruzamento',e)}
    try{if(rConf.error)throw rConf.error;(rConf.data||[]).forEach(r=>addPool(m,r))}catch(e){console.warn('[pgc-v3] pool confirmados fora da supervisao',e)}
    try{if(rFrota.error)throw rFrota.error;(rFrota.data||[]).forEach(r=>addVehiclePool(m,r))}catch(e){console.warn('[pgc-v3] pool frotas_veiculos',e)}
    (snap?.osComCandidatosAtual||[]).forEach(it=>{(it.candidatos||[]).forEach(r=>addPool(m,r));(it.colaboradoresRegional||[]).forEach(r=>addPool(m,r));(it.equipeRows||[]).forEach(r=>addPool(m,{...r,supervisao:r.supervisao||it.os?.supervisao},{linked:true}))});S.pool=[...m.values()].sort((a,b)=>Number(isMot(b))-Number(isMot(a))||Number(b.linked)-Number(a.linked)||a.nome.localeCompare(b.nome,'pt-BR'));return S.pool})();S.poolPromise=carregar;const resultado=await carregar;if(S.poolPromiseKey===key)S.poolPromise=null;return resultado}
function loadCss(h,id){if(document.getElementById(id))return;const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=h;document.head.appendChild(l)}
function loadScript(src,id){if(document.getElementById(id))return Promise.resolve();return new Promise((ok,err)=>{const s=document.createElement('script');s.id=id;s.src=src;s.onload=ok;s.onerror=err;document.head.appendChild(s)})}
async function leaflet(){if(window.L)return true;try{loadCss('./assets/vendor/leaflet/leaflet.css','leaflet-css-pgc-manual-v3');await loadScript('./assets/vendor/leaflet/leaflet.js','leaflet-js-pgc-manual-v3');return!!window.L}catch{return false}}
const star=c=>`<svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,1.8 17.8,10.4 27,11.2 20,17.2 22.2,26.2 14,21.3 5.8,26.2 8,17.2 1,11.2 10.2,10.4" fill="${c}" stroke="#fff" stroke-width="1.25"/></svg>`;
const person=(c,l)=>`<svg width="28" height="34" viewBox="0 0 28 34"><circle cx="14" cy="8" r="6.4" fill="${c}" stroke="#fff" stroke-width="1.5"/><path d="M3 33c0-8 5-12.5 11-12.5S25 25 25 33" fill="${c}" stroke="#fff" stroke-width="1.5"/><circle cx="21" cy="22" r="6" fill="#020617" stroke="#fff"/><text x="21" y="25.7" text-anchor="middle" font-size="9" font-weight="900" fill="#fff">${l}</text></svg>`;
const car=c=>`<svg width="32" height="25" viewBox="0 0 32 25"><path d="M6.5 13.2 9 6.8C9.5 5.7 10.7 5 12 5h8c1.3 0 2.5.7 3 1.8l2.5 6.4" fill="${c}" stroke="#fff" stroke-width="1.5"/><path d="M4.5 12.8h23c1.4 0 2.5 1.1 2.5 2.5v4.2H2v-4.2c0-1.4 1.1-2.5 2.5-2.5Z" fill="${c}" stroke="#fff" stroke-width="1.5"/><circle cx="8.5" cy="19.5" r="2.6" fill="#020617" stroke="#fff"/><circle cx="23.5" cy="19.5" r="2.6" fill="#020617" stroke="#fff"/></svg>`;
const COR_PENDENTE='#eab308',COR_OS='#38bdf8',COR_MOTORISTA='#22c55e';
const corStatus=s=>s==='motorista'?COR_MOTORISTA:s==='os'?COR_OS:COR_PENDENTE;
const TILE_LAYERS={
  escuro:{label:'Escuro',url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',options:{maxZoom:19,attribution:'&copy; OSM &copy; CARTO',subdomains:'abcd'}},
  claro:{label:'Claro',url:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',options:{maxZoom:19,attribution:'&copy; OSM &copy; CARTO',subdomains:'abcd'}},
  ruas:{label:'Ruas',url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',options:{maxZoom:19,attribution:'&copy; OSM &copy; CARTO',subdomains:'abcd'}},
  satelite:{label:'Satélite',url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',options:{maxZoom:19,attribution:'Tiles &copy; Esri'}},
};
const TILE_STORAGE_KEY='pgcMapaTipo';
const tileKeyAtual=()=>{const k=localStorage.getItem(TILE_STORAGE_KEY);return TILE_LAYERS[k]?k:'escuro'};
function aplicarTile(map,key){const def=TILE_LAYERS[key]||TILE_LAYERS.escuro;if(S.tileLayer)try{map.removeLayer(S.tileLayer)}catch{};S.tileLayer=window.L.tileLayer(def.url,def.options).addTo(map)}
const iOs=s=>window.L.divIcon({className:'pmg-drag-icon',html:star(corStatus(s)),iconSize:[28,28],iconAnchor:[14,14]});
const iCol=(r,s)=>window.L.divIcon({className:'pmg-drag-icon',html:person(corStatus(s),letter(tipo(r))),iconSize:[28,34],iconAnchor:[14,32]});
const iCar=s=>window.L.divIcon({className:'pmg-drag-icon',html:car(corStatus(s)),iconSize:[32,25],iconAnchor:[16,21]});
function kmEntre(aLat,aLng,bLat,bLng){const R=6371,dLat=(bLat-aLat)*Math.PI/180,dLng=(bLng-aLng)*Math.PI/180,s1=Math.sin(dLat/2)**2,s2=Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(s1+s2),Math.sqrt(1-s1-s2))}
// Rota do motorista: guloso (vizinho mais próximo) respeitando 3 regras —
// (1) só pode "deixar" um passageiro depois de "buscar" ele (precedência);
// (2) paradas de Logística (O.S. em que o motorista dá suporte, sem ficar)
// entram na disputa do guloso normalmente, junto com buscas/entregas;
// (3) se o motorista também tem Atendimento (OS própria em que ele fica),
// essa parada entra sempre por último, fora da disputa. Frota pequena (até 4
// passageiros) então guloso já resolve bem; não precisa de 2-opt/OSRM aqui.
function planejarRota(motorista,passageiros,logisticaStops,atendimento){
  const origem=pos(motorista);
  if(!origem)return null;
  const paradas=[];
  passageiros.forEach(p=>{
    const pick=pos(p.col);
    if(pick)paradas.push({tipo:'pickup',colaboradorId:p.col.colaboradorId,nome:p.col.nome,coord:pick});
    if(p.destino&&geo(p.destino.lat,p.destino.lng))paradas.push({tipo:'dropoff',colaboradorId:p.col.colaboradorId,nome:p.col.nome,coord:p.destino,os:p.os});
  });
  (logisticaStops||[]).forEach((s,i)=>paradas.push({tipo:'logistica',colaboradorId:`__log${i}`,coord:s.coord,os:s.os}));
  const picked=new Set(),ordem=[],restantes=paradas.slice();
  let atual=origem;
  while(restantes.length){
    const candidatos=restantes.filter(s=>s.tipo!=='dropoff'||picked.has(s.colaboradorId));
    if(!candidatos.length)break;
    let melhor=null,melhorDist=Infinity;
    candidatos.forEach(c=>{const d=kmEntre(atual.lat,atual.lng,c.coord.lat,c.coord.lng);if(d<melhorDist){melhorDist=d;melhor=c}});
    ordem.push(melhor);
    restantes.splice(restantes.indexOf(melhor),1);
    if(melhor.tipo==='pickup')picked.add(melhor.colaboradorId);
    atual=melhor.coord;
  }
  if(atendimento)ordem.push({tipo:'atendimento',coord:atendimento.coord,os:atendimento.os});
  if(!ordem.length)return null;
  return{origem,ordem};
}
const ROTA_CORES=['#a78bfa','#f472b6','#fb923c','#38bdf8','#facc15','#4ade80'];
function desenharRotaMotorista(layer,motorista,plano,idx){
  const cor=ROTA_CORES[idx%ROTA_CORES.length];
  const pontos=[plano.origem,...plano.ordem.map(s=>s.coord)];
  const linha=window.L.polyline(pontos.map(p=>[p.lat,p.lng]),{color:cor,weight:3,opacity:.78,dashArray:'2 8'});
  const passos=plano.ordem.map((s,i)=>{
    if(s.tipo==='pickup')return `${i+1}. Buscar ${esc(s.nome)}`;
    if(s.tipo==='dropoff')return `${i+1}. Deixar ${esc(s.nome)} · OS ${esc(s.os?.numero_os||'-')}`;
    if(s.tipo==='logistica')return `${i+1}. Logística · OS ${esc(s.os?.numero_os||'-')}`;
    return `${i+1}. Atendimento · OS ${esc(s.os?.numero_os||'-')}`;
  }).join('<br>');
  linha.bindTooltip(`<b>${esc(motorista.nome)}</b><br>${passos}`,{className:'peqb-tt',sticky:true});
  layer.addLayer(linha);
}
function bandHtml(b){if(b.querySelector('#peqbMapEl2'))return;const tileOpts=Object.entries(TILE_LAYERS).map(([k,v])=>`<option value="${k}" ${k===tileKeyAtual()?'selected':''}>${v.label}</option>`).join('');b.innerHTML=`<div class="pmg-wrap"><div class="pmg-head"><strong>Mapa do gestor</strong><div class="pmg-legend"><span><i style="background:${COR_PENDENTE}"></i>Pendente</span><span><i style="background:${COR_OS}"></i>Vinculado à O.S.</span><span><i style="background:${COR_MOTORISTA}"></i>Com motorista</span><span class="pmg-help">Arraste um marcador sobre outro para vincular · 2 cliques rápidos pra desvincular · linha tracejada = rota sugerida do motorista (Logística nas O.S. em que só dá suporte, Atendimento sempre por último)</span></div><div style="display:flex;gap:8px;align-items:center"><select id="pmgTipoMapa" class="peqb-btn" title="Tipo do mapa">${tileOpts}</select><span id="pmgMsg" style="font-size:11px;color:#9fb7aa"></span><button type="button" class="peqb-btn" id="pmgAtualizarManual">↻ Atualizar</button></div></div><div class="pmg-map"><div id="peqbMapEl2"></div><div id="pmgEmpty" class="pmg-empty" style="display:none">Nenhuma coordenada para mostrar nesta supervisão.</div></div></div>`;b.querySelector('#pmgAtualizarManual')?.addEventListener('click',()=>mapRender({force:true}));b.querySelector('#pmgTipoMapa')?.addEventListener('change',e=>{localStorage.setItem(TILE_STORAGE_KEY,e.target.value);if(S.map)aplicarTile(S.map,e.target.value)})}
async function ensureMap(el){if(S.map&&S.mapEl===el)return S.map;if(S.map)try{S.map.remove()}catch{};if(!await leaflet())return null;S.mapEl=el;S.map=window.L.map(el,{zoomControl:true,scrollWheelZoom:true,center:[-14.235,-51.925],zoom:4});aplicarTile(S.map,tileKeyAtual());S.osLayer=window.L.layerGroup().addTo(S.map);S.colabLayer=window.L.layerGroup().addTo(S.map);S.rotaLayer=window.L.layerGroup().addTo(S.map);return S.map}
function alvo(m){if(!S.map)return null;const p=S.map.latLngToContainerPoint(m.getLatLng());let best=null,dist=99999;for(const o of S.markers){if(o===m)continue;const d=p.distanceTo(S.map.latLngToContainerPoint(o.getLatLng()));if(d<dist){dist=d;best=o}}return dist<=42?best:null}
function drag(m,meta){m.__pmgMeta=meta;m.__origLatLng=m.getLatLng();m.on('click mousedown dblclick contextmenu',ev=>{if(ev?.originalEvent&&window.L?.DomEvent)window.L.DomEvent.stop(ev.originalEvent)});m.on('dragstart',()=>m.closeTooltip());m.on('dragend',async()=>{const a=alvo(m);m.setLatLng(m.__origLatLng);if(!a?.__pmgMeta)return;const el=a.getElement();el?.classList.add('pmg-pending');try{await associar(a.__pmgMeta,m.__pmgMeta)}finally{el?.classList.remove('pmg-pending')}});m.on('dblclick',async()=>{m.closeTooltip();const el=m.getElement();el?.classList.add('pmg-pending');try{await desvincular(m.__pmgMeta)}finally{el?.classList.remove('pmg-pending')}});S.markers.push(m)}
// 2 cliques rápidos num marcador já vinculado remove o vínculo. Colaborador/
// motorista: tira ele da própria O.S. O.S.: tira todo mundo confirmado nela
// de uma vez (pede confirmação, é destrutivo).
async function removerVinculo(programacaoId,osId,colaboradorId,equipeRowId){
  if(equipeRowId){const{error}=await supabase.from('programacao_equipe').delete().eq('id',equipeRowId);if(error)throw error}
  else{const{error}=await supabase.from('programacao_equipe').delete().eq('os_id',osId).eq('colaborador_id',colaboradorId);if(error)throw error}
  await supabase.from('operacional_os_colaboradores').delete().eq('os_id',osId).eq('colaborador_key',colaboradorId);
  if(programacaoId)await supabase.from('programacao_colaboradores').update({disponibilidade:'SEM EMBARQUE'}).eq('programacao_id',programacaoId).eq('colaborador_id',colaboradorId);
}
async function desvincular(meta){
  if(!meta)return;
  if((meta.tipo==='colaborador'||meta.tipo==='motorista')){
    if(!meta.osId)return;
    if(!await confirmar(`Desvincular ${meta.colab?.nome||'colaborador'} da O.S. ${meta.numeroOs||'-'}?`))return;
    try{await removerVinculo(meta.programacaoId,meta.osId,meta.colaboradorId,meta.equipeRowId);logActivity('action','desvinculo_manual_mapa','programacao',{os_id:meta.osId,numero_os:meta.numeroOs,colaborador_id:meta.colaboradorId,nome:meta.colab?.nome});afterWrite()}
    catch(e){avisar('Não foi possível desvincular: '+(e?.message||e))}
  }else if(meta.tipo==='os'){
    const{item}=findOs(meta.osId),rows=item?.equipeRows||[];
    if(!rows.length)return;
    if(!await confirmar(`Remover ${rows.length} colaborador(es) vinculado(s) à O.S. ${meta.numeroOs||'-'}?`))return;
    try{for(const r of rows)await removerVinculo(r.programacao_id,meta.osId,r.colaborador_id,r.id);logActivity('action','desvinculo_manual_mapa_os','programacao',{os_id:meta.osId,numero_os:meta.numeroOs,colaboradores:rows.map(r=>r.colaborador_id)});afterWrite()}
    catch(e){avisar('Não foi possível desvincular: '+(e?.message||e))}
  }
}
function fallbackPos(col,items,idx){
  const pontos=items.filter(it=>(!col?.supervisao||it.os?.supervisao===col.supervisao)&&it.ponto&&geo(it.ponto.lat,it.ponto.lng)).map(it=>it.ponto);
  const base=(pontos.length?pontos:items.filter(it=>it.ponto&&geo(it.ponto.lat,it.ponto.lng)).map(it=>it.ponto));
  if(!base.length)return null;
  const lat=base.reduce((s,p)=>s+Number(p.lat),0)/base.length,lng=base.reduce((s,p)=>s+Number(p.lng),0)/base.length;
  const a=(idx%24)*Math.PI*2/24,r=0.012+(Math.floor(idx/24)*0.006);
  return{lat:lat+Math.sin(a)*r,lng:lng+Math.cos(a)*r,fallback:true};
}
async function loadTransporte(programacaoIds){
  const ids=[...new Set((programacaoIds||[]).filter(Boolean).map(String))];
  if(!ids.length)return new Map();
  try{
    const{data,error}=await supabase.from('programacao_deslocamento').select('programacao_id,colaborador_id,tipo_deslocamento,placa_veiculo').in('programacao_id',ids);
    if(error)throw error;
    const map=new Map();
    (data||[]).forEach(r=>{
      const tipo=norm(r.tipo_deslocamento);
      const pl=placa(r.placa_veiculo||'');
      if((tipo==='MOTORISTA FROTA'||tipo==='CARONA FROTA')&&pl)map.set(String(r.colaborador_id),{status:'motorista',placa:pl});
    });
    return map;
  }catch(e){console.warn('[pgc-v3] transporte',e);return new Map()}
}
// Atendimento(OK)/Logística por colaborador+dia (programacao_colaboradores.disponibilidade
// — mesmo campo que o toggle "Atendimento/Logística" de programacao-equipe.js grava).
// É 1 valor por pessoa por programação, não por O.S.
async function loadDisponibilidade(programacaoIds){
  const ids=[...new Set((programacaoIds||[]).filter(Boolean).map(String))];
  if(!ids.length)return new Map();
  try{
    const{data,error}=await supabase.from('programacao_colaboradores').select('programacao_id,colaborador_id,disponibilidade').in('programacao_id',ids);
    if(error)throw error;
    const map=new Map();
    (data||[]).forEach(r=>{if(norm(r.disponibilidade)==='LOGISTICA')map.set(String(r.colaborador_id),'LOGISTICA')});
    return map;
  }catch(e){console.warn('[pgc-v3] disponibilidade',e);return new Map()}
}
async function mapRender({force=false}={}){
  if(!step2()&&!force)return;
  const band=document.getElementById('peqbMapBand');
  if(!band)return;
  band.hidden=false;
  bandHtml(band);
  const snap=window.__peqbGetEquipeSnapshot?.(),msg=band.querySelector('#pmgMsg');
  if(!snap?.osComCandidatosAtual){if(msg)msg.textContent='Carregue a programação.';return}
  const c=ctx(),sup=new Set(c.supervisoes);
  const items=(snap.osComCandidatosAtual||[]).filter(it=>!sup.size||sup.has(it.os?.supervisao));
  const programacaoIds=[...new Set(items.map(it=>snap.programacaoIdParaOs?.(it.os)||it.programacao_id||it.equipeRows?.[0]?.programacao_id).filter(Boolean))];
  const[p,transporte,disponibilidade]=await Promise.all([pool(),loadTransporte(programacaoIds),loadDisponibilidade(programacaoIds)]);
  const ps=p.filter(x=>!sup.size||sup.has(x.supervisao));
  const statusColab=id=>transporte.get(String(id))?.status||'os';
  const statusOs=it=>(it.equipeRows||[]).some(r=>transporte.get(String(r.colaborador_id))?.status==='motorista')?'motorista':((it.equipeRows||[]).length?'os':'pendente');
  const key=JSON.stringify({os:items.map(it=>[it.os?.id,statusOs(it),(it.equipeRows||[]).map(r=>`${r.colaborador_id}:${statusColab(r.colaborador_id)}`).sort().join(',')]),pool:ps.map(x=>[x.colaboradorId,x.supervisao,x.lat??x.latitude,x.lng??x.longitude,x.veiculoPlaca,x.linked?1:0,transporte.get(String(x.colaboradorId))?.status||'',transporte.get(String(x.colaboradorId))?.placa||'',disponibilidade.get(String(x.colaboradorId))||''])});
  if(!force&&S.mapKey===key&&S.map){setTimeout(()=>{try{S.map.invalidateSize()}catch{}},40);return}
  S.mapKey=key;
  if(msg)msg.textContent='Carregando mapa...';
  const mapEl2=band.querySelector('#peqbMapEl2'),isNovoMapa=!(S.map&&S.mapEl===mapEl2);
  const map=await ensureMap(mapEl2);
  if(!map)return;
  setTimeout(()=>{try{map.invalidateSize()}catch{}},80);
  S.osLayer.clearLayers();S.colabLayer.clearLayers();S.rotaLayer.clearLayers();S.markers=[];
  // Um colaborador pode estar confirmado em MAIS de 1 O.S. no mesmo dia
  // (comum pra quem faz Logística, ver planejarRota) -- por isso é uma lista,
  // não um valor só. eq1() dá o primeiro/principal, usado nos marcadores.
  const eqMulti=new Map();
  items.forEach(it=>(it.equipeRows||[]).forEach(r=>{const id=String(r.colaborador_id),arr=eqMulti.get(id)||[];arr.push({row:r,item:it});eqMulti.set(id,arr)}));
  const eq1=id=>eqMulti.get(String(id))?.[0]||null;
  const bounds=[],L=window.L;
  items.forEach(it=>{
    if(!it.ponto||!geo(it.ponto.lat,it.ponto.lng))return;
    const st=statusOs(it),m=L.marker([it.ponto.lat,it.ponto.lng],{icon:iOs(st),draggable:true,autoPan:true,bubblingMouseEvents:false}).bindTooltip(`OS ${esc(it.os.numero_os||'-')} · ${esc(it.os.cliente||'-')} · ${st==='motorista'?'com motorista':st==='os'?'vinculada sem transporte':'pendente'}`,{className:'peqb-tt'});
    drag(m,{tipo:'os',osId:it.os.id,numeroOs:it.os.numero_os,supervisao:it.os.supervisao});
    S.osLayer.addLayer(m);bounds.push([it.ponto.lat,it.ponto.lng]);
  });
  // Pré-calcula a posição de todos antes de desenhar, pra poder detectar quem
  // caiu exatamente no mesmo ponto (mesmo endereço/coordenada) e afastar um
  // pouco cada um em círculo -- sem isso os marcadores ficam 100% sobrepostos
  // e não dá pra clicar/arrastar o(s) que ficam "atrás".
  const posPorColab=ps.map((col,idx)=>({col,p:pos(col)||fallbackPos(col,items,idx)}));
  const gruposPos=new Map();
  posPorColab.forEach(e=>{if(!e.p)return;const chave=`${e.p.lat.toFixed(5)},${e.p.lng.toFixed(5)}`;const arr=gruposPos.get(chave)||[];arr.push(e);gruposPos.set(chave,arr)});
  gruposPos.forEach(arr=>{
    if(arr.length<2)return;
    const base=arr[0].p,r=0.00035;
    arr.forEach((e,i)=>{const ang=i*2*Math.PI/arr.length;e.p={lat:base.lat+Math.sin(ang)*r,lng:base.lng+Math.cos(ang)*r,fallback:base.fallback}});
  });
  posPorColab.forEach(({col,p})=>{
    if(!p)return;
    const vinc=eq1(col.colaboradorId),on=!!vinc,mot=isMot(col),st=on?statusColab(col.colaboradorId):'pendente';
    const labelStatus=st==='motorista'?'com motorista':st==='os'?'vinculado à O.S. sem transporte':'pendente',geoStatus=p.fallback?' · sem coordenada cadastrada':'';
    const enderecoTt=col.endereco?`<br>📍 ${esc(col.endereco)}`:'';
    const m=L.marker([p.lat,p.lng],{icon:mot?iCar(st):iCol(col,st),draggable:true,autoPan:true,bubblingMouseEvents:false}).bindTooltip(`${esc(col.nome)}${on?` · OS ${esc(vinc.item.os.numero_os||'-')}`:''} · ${mot?'Motorista':esc(tipo(col))} · ${labelStatus}${geoStatus}${enderecoTt}`,{className:'peqb-tt'});
    drag(m,{tipo:mot?'motorista':'colaborador',colaboradorId:col.colaboradorId,osId:on?vinc.item.os.id:null,numeroOs:on?vinc.item.os.numero_os:null,equipeRowId:on?vinc.row.id:null,programacaoId:on?(snap.programacaoIdParaOs?.(vinc.item.os)||vinc.row.programacao_id):null,supervisao:col.supervisao,colab:col});
    S.colabLayer.addLayer(m);bounds.push([p.lat,p.lng]);
  });
  // Rota de cada motorista: passageiro(s) vinculado(s) a ele (mesma placa em
  // programacao_deslocamento) + as O.S. em que ele mesmo está confirmado. Se a
  // disponibilidade dele no dia é Logística, TODAS essas O.S. viram paradas
  // normais (ele pode estar confirmado em várias, ex. dar suporte em mais de
  // um ponto) -- se é Atendimento, é só a dele própria e sempre por último
  // (ver planejarRota() acima pras regras de ordem/precedência).
  ps.filter(isMot).forEach((mot,idx)=>{
    const motPlaca=placa(mot.veiculoPlaca||'');
    if(!motPlaca)return;
    const passageiros=ps.filter(col=>!isMot(col)&&transporte.get(String(col.colaboradorId))?.status==='motorista'&&transporte.get(String(col.colaboradorId))?.placa===motPlaca)
      .map(col=>{const vinc=eq1(col.colaboradorId);return vinc?{col,os:vinc.item.os,destino:vinc.item.ponto}:null})
      .filter(Boolean);
    const minhasOs=(eqMulti.get(String(mot.colaboradorId))||[]).filter(v=>v.item.ponto&&geo(v.item.ponto.lat,v.item.ponto.lng));
    const isLogistica=disponibilidade.get(String(mot.colaboradorId))==='LOGISTICA';
    const logisticaStops=isLogistica?minhasOs.map(v=>({coord:v.item.ponto,os:v.item.os})):[];
    const atendimento=!isLogistica&&minhasOs.length?{coord:minhasOs[0].item.ponto,os:minhasOs[0].item.os}:null;
    if(!passageiros.length&&!logisticaStops.length&&!atendimento)return;
    const plano=planejarRota(mot,passageiros,logisticaStops,atendimento);
    if(plano)desenharRotaMotorista(S.rotaLayer,mot,plano,idx);
  });
  const empty=band.querySelector('#pmgEmpty');
  if(empty)empty.style.display=bounds.length?'none':'flex';
  // Só enquadra automaticamente na 1ª criação do mapa -- depois disso o
  // zoom/posição é do gestor, nenhuma atualização de dado (vincular,
  // desvincular, trocar tipo de mapa etc.) deve mexer na câmera sozinha.
  if(bounds.length&&isNovoMapa)map.fitBounds(bounds,{padding:[34,34],maxZoom:12});
  if(msg)msg.textContent='';
}
window.__pmgRenderMapaGestor=()=>mapRender({force:false});
function mapSchedule({force=false}={}){if(!step2()&&!force)return;clearTimeout(S.mapTimer);S.mapTimer=setTimeout(()=>mapRender({force}),220)}
function mapOpen(){const band=document.getElementById('pgcPane2')?.querySelector('#peqbMapBand');if(!band)return;band.hidden=false;bandHtml(band);mapSchedule()}
function findOs(osId){const snap=window.__peqbGetEquipeSnapshot?.(),item=(snap?.osComCandidatosAtual||[]).find(it=>String(it.os?.id)===String(osId));return{snap,item}}
function mat(item,col){const id=String(col.colaboradorId||''),cand=(item?.candidatos||[]).find(c=>String(c.colaboradorId)===id)||(item?.colaboradoresRegional||[]).find(c=>String(c.colaboradorId)===id);return{...(cand||{}),...col,colaboradorId:id,nome:col.nome||cand?.nome||id,tipoLabel:col.tipoLabel||cand?.tipoLabel||'Efetivo',score:cand?.score||col.score||0,scoreContrato:cand?.scoreContrato||col.scoreContrato||0,scoreDistancia:cand?.scoreDistancia||col.scoreDistancia||0,scoreAuditoria:cand?.scoreAuditoria||col.scoreAuditoria||0,km:cand?.km??col.km??null}}
function avisar(mensagem){return new Promise(resolve=>{const ov=document.createElement('div');ov.className='peqb-modal-ov';ov.innerHTML=`<div class="peqb-modal"><p style="margin:0;color:#eef7f2">${esc(mensagem)}</p><div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">OK</button></div></div>`;document.body.appendChild(ov);const close=()=>{ov.remove();resolve()};ov.addEventListener('click',e=>{if(e.target===ov)close()});ov.querySelector('[data-ok]').addEventListener('click',close);setTimeout(close,4000)})}
function confirmar(mensagem){return new Promise(resolve=>{const ov=document.createElement('div');ov.className='peqb-modal-ov';ov.innerHTML=`<div class="peqb-modal"><p style="margin:0;color:#eef7f2">${esc(mensagem)}</p><div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-cancel>Cancelar</button><button type="button" class="peqb-row-btn" data-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Confirmar</button></div></div>`;document.body.appendChild(ov);const close=v=>{ov.remove();resolve(v)};ov.addEventListener('click',e=>{if(e.target===ov)close(false)});ov.querySelector('[data-cancel]').addEventListener('click',()=>close(false));ov.querySelector('[data-ok]').addEventListener('click',()=>close(true))})}
function just(os,atuais,novo){return new Promise(resolve=>{const nomes=(atuais||[]).map(c=>c.nome_colaborador||c.nome).filter(Boolean).join(', '),ov=document.createElement('div');ov.className='peqb-modal-ov';ov.innerHTML=`<div class="peqb-modal"><h3>Justificar mais de 1 colaborador</h3><p>O.S. <b style="color:#bbf7d0">${esc(os?.numero_os||'-')}</b> já possui <b>${esc(nomes||'-')}</b>. Informe o motivo para adicionar <b style="color:#bbf7d0">${esc(novo?.nome||'-')}</b>.</p><textarea id="pgcJustifV3" rows="3" placeholder="Ex.: volume, distância ou demanda exige mais pessoas no ponto" style="width:100%;resize:vertical;background:#0d0d18;color:#e2e2f0;border:1px solid rgba(52,211,153,.28);border-radius:10px;padding:9px 10px;font-size:13px"></textarea><div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-cancel>Cancelar</button><button type="button" class="peqb-row-btn" data-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Confirmar</button></div></div>`;document.body.appendChild(ov);const inp=ov.querySelector('#pgcJustifV3'),close=v=>{ov.remove();resolve(v)};inp.focus();ov.addEventListener('click',e=>{if(e.target===ov)close(null)});ov.querySelector('[data-cancel]').addEventListener('click',()=>close(null));ov.querySelector('[data-ok]').addEventListener('click',()=>{const m=inp.value.trim();if(!m){inp.focus();return}close(m)})})}
function dispMot(nome){return new Promise(resolve=>{const ov=document.createElement('div');ov.className='peqb-modal-ov';ov.innerHTML=`<div class="peqb-modal"><h3>Motorista na programação</h3><p><b style="color:#bbf7d0">${esc(nome||'Motorista')}</b> será lançado como:</p><div class="peqb-modal-actions" style="justify-content:stretch"><button type="button" class="peqb-row-btn" data-valor="OK" style="flex:1">Atendimento</button><button type="button" class="peqb-row-btn" data-valor="LOGISTICA" style="flex:1;border-color:rgba(134,239,172,.4);color:#bbf7d0">Logística</button></div><button type="button" class="peqb-row-btn danger" data-cancel>Cancelar</button></div>`;document.body.appendChild(ov);const close=v=>{ov.remove();resolve(v)};ov.addEventListener('click',e=>{if(e.target===ov)close(null)});ov.querySelector('[data-cancel]').addEventListener('click',()=>close(null));ov.querySelectorAll('[data-valor]').forEach(b=>b.addEventListener('click',()=>close(b.dataset.valor)))})}
async function upsert({programacaoId,os,cand,disponibilidade}){const equipe={programacao_id:programacaoId,os_id:os.id,colaborador_id:cand.colaboradorId,nome_colaborador:cand.nome,score:cand.score||0,score_contrato:cand.scoreContrato||0,score_distancia:cand.scoreDistancia||0,score_auditoria:cand.scoreAuditoria||0,km_estimado:cand.km??null,confirmado:true};const{error}=await supabase.from('programacao_equipe').upsert(equipe,{onConflict:'programacao_id,os_id,colaborador_id'});if(error)throw error;await Promise.all([supabase.from('operacional_os_colaboradores').delete().eq('os_id',os.id).eq('colaborador_key',cand.colaboradorId).then(()=>supabase.from('operacional_os_colaboradores').insert({os_id:os.id,colaborador_key:cand.colaboradorId,colaborador_nome:cand.nome,colaborador_cpf:/^\d+$/.test(String(cand.colaboradorId))?String(cand.colaboradorId):null,distancia_km:cand.km??null,origem_sugestao:isMot(cand)?'PROGRAMACAO_MAPA_MOTORISTA':'PROGRAMACAO_MAPA_COLABORADOR'})),supabase.from('programacao_colaboradores').upsert({programacao_id:programacaoId,colaborador_id:cand.colaboradorId,nome_colaborador:cand.nome,cargo:cand.cargo||null,coordenacao:cand.coordenacao||null,supervisao:cand.supervisao||null,disponibilidade},{onConflict:'programacao_id,colaborador_id'})])}
async function vincOs(osId,col){
  const{snap,item}=findOs(osId);
  if(!snap||!item)return;
  const cand=mat(item,col);
  if((item.equipeRows||[]).some(r=>String(r.colaborador_id)===String(cand.colaboradorId))){avisar(`${cand.nome} já está vinculado nesta O.S.`);return}
  const atuais=item.equipeRows||[];
  const programacaoId=snap.programacaoIdParaOs?.(item.os)||item.equipeRows?.[0]?.programacao_id;
  if(!programacaoId){avisar('Programação da O.S. não encontrada. Recarregue a tela.');return}
  const disponibilidade=isMot(cand)?await dispMot(cand.nome):'OK';
  if(!disponibilidade)return;
  let atuaisAtendimento=atuais,motivo=null;
  if(disponibilidade==='OK'&&atuais.length){
    const logistica=await loadDisponibilidade([programacaoId]);
    atuaisAtendimento=atuais.filter(r=>logistica.get(String(r.colaborador_id))!=='LOGISTICA');
    if(atuaisAtendimento.length){motivo=await just(item.os,atuaisAtendimento,cand);if(!motivo)return}
  }
  await upsert({programacaoId,os:item.os,cand,disponibilidade});
  if(motivo)logActivity('action','justificativa_multiplos_colaboradores_os','programacao',{os_id:item.os.id,numero_os:item.os.numero_os,colaboradores:[...atuaisAtendimento.map(c=>c.colaborador_id),cand.colaboradorId],nomes:[...atuaisAtendimento.map(c=>c.nome_colaborador),cand.nome],motivo});
  afterWrite()
}
async function vincMotCol(osId,alvoId,motorista){const{snap,item}=findOs(osId);if(!snap||!item)return;if(!alvoId)return vincOs(osId,motorista);const programacaoId=snap.programacaoIdParaOs?.(item.os)||item.equipeRows?.[0]?.programacao_id;if(!programacaoId){avisar('Programação da O.S. não encontrada. Recarregue a tela.');return}const disponibilidade='LOGISTICA';const cand=mat(item,motorista);await upsert({programacaoId,os:item.os,cand,disponibilidade});const pl=placa(cand.veiculoPlaca||'');if(pl)await supabase.from('programacao_deslocamento').upsert({programacao_id:programacaoId,data_referencia:snap.dataReferencia||hoje(),colaborador_id:alvoId,tipo_deslocamento:'CARONA FROTA',placa_veiculo:pl,observacao:`Motorista vinculado na programação: ${cand.nome}`},{onConflict:'programacao_id,colaborador_id'});logActivity('action','motorista_vinculado_colaborador_os','programacao',{os_id:item.os.id,numero_os:item.os.numero_os,motorista_id:cand.colaboradorId,motorista_nome:cand.nome,colaborador_id:alvoId,placa:pl,disponibilidade});afterWrite()}
async function associar(a,b){const os=[a,b].find(x=>x.tipo==='os'),p=[a,b].find(x=>x.tipo==='colaborador'||x.tipo==='motorista');if(os&&p?.colab)return vincOs(os.osId,p.colab);const mot=[a,b].find(x=>x.tipo==='motorista'),col=[a,b].find(x=>x.tipo==='colaborador'&&x.osId);if(mot?.colab&&col?.colaboradorId&&col?.osId)return vincMotCol(col.osId,col.colaboradorId,mot.colab);avisar('Solte o marcador sobre uma O.S. ou sobre um colaborador já vinculado à O.S.')}
async function afterWrite(){S.poolKey='';S.mapKey='';if(window.__peqbSilentRefresh){await Promise.all([window.__peqbSilentRefresh(),window.__pgcRefreshDespesas?.()]);fix({map:step2(),forceMap:true})}else{window.__pgcProgramacaoReload?.();setTimeout(()=>fix({map:step2(),forceMap:true}),900)}}
async function fix({map=false,forceMap=false}={}){step1();despesas();if(step2())mapOpen();if(map&&step2())mapSchedule({force:forceMap})}
function afterLoad(){S.poolKey='';S.poolPromise=null;S.poolPromiseKey='';S.mapKey='';pool().catch(()=>{});[700,1500,2800].forEach(d=>setTimeout(()=>fix({map:step2()}),d));setTimeout(()=>{if(!document.getElementById('peqbOsList'))window.__pgcProgramacaoReload?.()},1200)}
function boot(){css();document.addEventListener('click',e=>{if(e.target.closest('#peqbVerMapa')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const band=document.getElementById('peqbMapBand');if(band){band.hidden=false;mapOpen();mapSchedule({force:true})}return}if(e.target.closest('#progLoadContext'))afterLoad();if(e.target.closest('#progSteps .stepbtn'))setTimeout(()=>{const s=step2();fix({map:s,forceMap:s})},250)},true);setTimeout(()=>fix({map:false}),800)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
