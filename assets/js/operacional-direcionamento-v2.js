import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const STYLE_ID = 'opv2-direcionamento-style';
  const LEAFLET_CSS = 'leaflet-css-opv2';
  const LEAFLET_JS = 'leaflet-js-opv2';
  const HOTEL_KM = 120;
  const RAIO_CAMINHO = 5;
  const RAIO_OPPOSTO = 2.5;

  const st = { os: [], pontos: [], vinculos: [], colabs: [], patrimonios: [], desloc: [], hoteis: [], rotas: [], ponto: '', rota: '', map: null, layers: {} };

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const num = v => { const n = Number(String(v ?? '').replace(',','.')); return Number.isFinite(n) ? n : null; };
  const digits = v => String(v ?? '').replace(/\D/g,'');
  const geo = r => Number.isFinite(num(r?.latitude ?? r?.lat)) && Number.isFinite(num(r?.longitude ?? r?.lng ?? r?.lon));
  const lat = r => num(r?.latitude ?? r?.lat);
  const lng = r => num(r?.longitude ?? r?.lng ?? r?.lon);
  const kmFmt = v => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1})} km` : '—';
  const first = (r, fs) => fs.map(f => r?.[f]).find(v => v !== undefined && v !== null && String(v).trim() !== '') ?? '';

  function km(a,b,c,d){
    const la1=Number(a),lo1=Number(b),la2=Number(c),lo2=Number(d); if(![la1,lo1,la2,lo2].every(Number.isFinite)) return null;
    const R=6371, dlat=(la2-la1)*Math.PI/180, dlon=(lo2-lo1)*Math.PI/180;
    const x=Math.sin(dlat/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dlon/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  }
  function colKey(r){ const cpf=digits(first(r,['cpf','colaborador_cpf','documento','colaborador_key'])); return cpf.length===11 ? `cpf:${cpf}` : `nome:${norm(first(r,['nome','funcionario','colaborador','colaborador_nome','nome_colaborador','colaborador_key']))}`; }
  function short(n){ const p=String(n||'').trim().split(/\s+/); return p.length>1?`${p[0]} ${p[1]}`:(p[0]||'—'); }
  function splitEmb(t){ const m=String(t||'').match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i); return m?{uf:m[1],cidade:m[2],local:m[3]||''}:{uf:'',cidade:String(t||''),local:''}; }
  function pKey(p){ return `${norm(p.uf)}|${norm(p.cidade)}|${norm(p.nome_local||p.tipo_local||'')}`; }

  async function sel(table, columns='*', fn=null, limit=5000){
    try{ let q=supabase.from(table).select(columns).limit(limit); if(fn) q=fn(q); const {data,error}=await q; if(error) throw error; return Array.isArray(data)?data:[]; }
    catch(e){ console.warn(`[opv2] ${table}:`, e?.message || e); return []; }
  }

  function osAberta(o){
    const s=norm(`${o.situacao||''} ${o.status||''} ${o.status_logistica||''} ${o.status_gestor||''}`);
    return !['FINALIZAD','DEVOLVID','CANCELAD','CONCLUID','ENCERRAD','ARQUIVAD','INATIV'].some(x=>s.includes(x));
  }

  function pontoDaOs(o){
    const e=splitEmb(o.embarque||o.cidade_embarque||o.local_embarque||'');
    const uf=norm(e.uf||o.uf||o.uf_embarque), cidade=norm(e.cidade||o.cidade||o.cidade_embarque), local=norm(e.local||o.local||o.local_embarque||o.cliente), cli=norm(o.cliente||''), sup=norm(o.supervisao||o.coordenacao||'');
    let best=null;
    for(const p of st.pontos){
      let sc=0, pu=norm(p.uf), pc=norm(p.cidade), pn=norm(p.nome_local||p.tipo_local||''), ps=norm(p.supervisao||p.coordenacao||'');
      if(uf&&pu===uf) sc+=45; if(cidade&&(pc===cidade||pc.includes(cidade)||cidade.includes(pc))) sc+=85; if(local&&(pn.includes(local)||local.includes(pn))) sc+=120; if(cli&&(pn.includes(cli)||cli.includes(pn))) sc+=25; if(sup&&ps&&(ps.includes(sup)||sup.includes(ps))) sc+=15;
      if(sc>=110 && (!best||sc>best.sc)) best={p,sc};
    }
    return best?.p||null;
  }

  function hotelProx(p){
    return st.hoteis.map(h=>({...h,dist:km(lat(h),lng(h),lat(p),lng(p))})).filter(h=>h.ativo!==false && (Number.isFinite(h.dist)||norm(h.cidade)===norm(p.cidade))).sort((a,b)=>{ const ca=norm(a.cidade)===norm(p.cidade)&&norm(a.uf)===norm(p.uf)?0:1, cb=norm(b.cidade)===norm(p.cidade)&&norm(b.uf)===norm(p.uf)?0:1; return ca-cb+(a.dist||9999)-(b.dist||9999); })[0] || null;
  }

  function veicPatr(c){
    const nome=norm(c.nome), cpf=digits(c.cpf);
    return st.patrimonios.find(p=>{
      const pn=norm(p.funcionario||p.colaborador||p.nome||p.responsavel), pc=digits(p.cpf||p.documento||p.colaborador_cpf), txt=norm(`${p.identificacao||''} ${p.categoria||''} ${p.material||''} ${p.descricao||''} ${p.patrimonio_codigo||''}`), dias=Number(p.dias_sem_leitura??999), sit=norm(p.situacao||p.status);
      const veic=/VEICULO|CARRO|CAMINHONETE|CAMINHAO|MOTO|SAVEIRO|STRADA|HILUX|AMAROK|S10|L200|[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/.test(txt);
      return veic && dias<=7 && !/INATIV|DESLIGAD|DEMITID/.test(sit) && ((cpf&&pc===cpf)||pn===nome);
    }) || null;
  }
  function veicProprio(c){
    const nome=norm(c.nome), cpf=digits(c.cpf);
    return st.desloc.some(d=>{ const dn=norm(d.nome||d.colaborador||d.colaborador_nome||d.funcionario), dc=digits(d.cpf||d.colaborador_cpf||d.documento), blob=norm(`${d.tipo||''} ${d.status||''} ${d.situacao||''} ${d.observacao||''} ${d.veiculo||''} ${d.placa||''}`); return /PROPRIO|VEICULO|CARRO|DESLOCAMENTO/.test(blob) && !/CANCELAD|FINALIZAD|CONCLUID/.test(blob) && ((cpf&&dc===cpf)||dn===nome); });
  }
  function distLinha(p,a,b){
    const latKm=111, lngKm=111*Math.cos(((a.lat+b.lat)/2)*Math.PI/180), ax=a.lng*lngKm, ay=a.lat*latKm, bx=b.lng*lngKm, by=b.lat*latKm, px=p.lng*lngKm, py=p.lat*latKm;
    const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy; if(!l2) return {d:Math.hypot(px-ax,py-ay),t:0};
    const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2)); return {d:Math.hypot(px-(ax+t*dx),py-(ay+t*dy)),t};
  }
  function carona(c,p,cands){
    if(!geo(c)||!geo(p)) return null; const pass={lat:lat(c),lng:lng(c)}, dest={lat:lat(p),lng:lng(p)};
    return cands.filter(x=>x.id!==c.id&&x.temFrota&&geo(x)).map(m=>{ const origem={lat:lat(m),lng:lng(m)}, linha=distLinha(pass,origem,dest), direto=km(origem.lat,origem.lng,dest.lat,dest.lng)||0, via=(km(origem.lat,origem.lng,pass.lat,pass.lng)||0)+(km(pass.lat,pass.lng,dest.lat,dest.lng)||0), desvio=Math.max(0,via-direto), limite=linha.t>0&&linha.t<1?RAIO_CAMINHO:RAIO_OPPOSTO; return {motorista:m,linha:linha.d,desvio,limite,ok:linha.d<=limite||desvio<=limite}; }).filter(x=>x.ok).sort((a,b)=>a.desvio-b.desvio||a.linha-b.linha)[0]||null;
  }

  async function load(){
    const [osRaw,pontosRaw,vincRaw,colRaw,baseRaw,patRaw,hot1,hot2,d1,d2,d3,d4]=await Promise.all([
      sel('operacional_os','*',q=>q.order('created_at',{ascending:false})),
      sel('operacional_pontos_embarque','*',q=>q.eq('ativo',true)),
      sel('operacional_os_colaboradores','*',q=>q.order('created_at',{ascending:false})),
      sel('colaboradores','*',q=>q.eq('situacao','Ativo')),
      sel('operacional_colaborador_base','*'),
      sel('vw_patrimonios_atual','*'),
      sel('hospedagem_hoteis','*'), sel('operacional_hoteis','*'),
      sel('lista_deslocamento','*'), sel('operacional_deslocamentos','*'), sel('programacao_deslocamentos','*'), sel('deslocamento_colaboradores','*')
    ]);
    st.pontos=pontosRaw.filter(geo).map(p=>({...p,__key:pKey(p)}));
    st.os=osRaw.filter(osAberta).map(o=>{ const p=pontoDaOs(o); return p?{...o,__pontoKey:p.__key}:null; }).filter(Boolean);
    const open=new Set(st.os.map(o=>String(o.id))), colMap=new Map(), baseMap=new Map(); colRaw.forEach(c=>colMap.set(colKey(c),c)); baseRaw.forEach(c=>baseMap.set(colKey(c),c));
    st.vinculos=vincRaw.filter(v=>open.has(String(v.os_id))).map(v=>{ const key=colKey(v), c={...(colMap.get(key)||{}),...(baseMap.get(key)||{}),nome:v.colaborador_nome||first(colMap.get(key)||{},['nome'])||first(baseMap.get(key)||{},['nome'])||v.colaborador_key}; return {...v,__colab:{...c,id:key}}; });
    st.patrimonios=patRaw; st.desloc=[...d1,...d2,...d3,...d4]; st.hoteis=[...hot1.map(h=>normHotel(h,'Hospedagem')),...hot2.map(h=>normHotel(h,'Operacional'))]; build();
  }
  function normHotel(h,fonte){ return {id:h.id,nome:first(h,['nome','hotel','nome_hotel','razao_social'])||'Hotel',cidade:first(h,['cidade','cidade_hotel']),uf:String(first(h,['uf','estado','uf_hotel'])).toUpperCase(),latitude:first(h,['latitude','lat']),longitude:first(h,['longitude','lng','lon']),ativo:h.ativo!==false,fonte}; }
  function build(){
    const pontos=new Map(st.pontos.map(p=>[p.__key,p])), osBy=new Map(st.os.map(o=>[String(o.id),o]));
    const all=st.vinculos.map(v=>v.__colab).filter(c=>c.nome); all.forEach(c=>{c.temFrota=!!(c.patrimonio=veicPatr(c)); c.veicProprio=veicProprio(c);});
    st.rotas=[];
    for(const v of st.vinculos){ const os=osBy.get(String(v.os_id)), p=pontos.get(os?.__pontoKey), c=v.__colab; if(!os||!p||!c?.nome) continue; const d=km(lat(c),lng(c),lat(p),lng(p)), sem=d==null, car=carona(c,p,all), hotel=!sem&&d>HOTEL_KM?hotelProx(p):null; let modo='Avaliar logística', pr=60; if(c.temFrota){modo='Frota vinculada pela leitura';pr=10}else if(car){modo='Carona em frota';pr=20}else if(c.veicProprio){modo='Veículo próprio';pr=30}else if(sem){modo='Falta coordenada';pr=90}else if(d<=25){modo='Deslocamento local';pr=40} st.rotas.push({id:`${os.id}|${c.id}`,os,ponto:p,colab:c,dist:d,sem,carona:car,hotel,modo,pr,precisaHotel:!sem&&d>HOTEL_KM}); }
    st.rotas.sort((a,b)=>a.pr-b.pr+(a.dist||9999)-(b.dist||9999));
    st.pontos=st.pontos.filter(p=>st.os.some(o=>o.__pontoKey===p.__key));
  }

  function css(){ if(document.getElementById(STYLE_ID))return; const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=`.opv2{color:#e2e8f0;display:flex;flex-direction:column;gap:14px}.opv2-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.9));overflow:hidden}.opv2-head{padding:16px;display:flex;justify-content:space-between;gap:12px}.opv2 h2,.opv2 h3{margin:0;color:#fff}.opv2 p{color:#94a3b8;margin:6px 0 0;font-size:13px}.opv2-btn{border:1px solid rgba(34,197,94,.35);border-radius:13px;background:#166534;color:#ecfdf5;font-weight:900;padding:9px 13px;cursor:pointer}.opv2-select{height:40px;border:1px solid rgba(148,163,184,.2);border-radius:13px;background:#0d0d18;color:#e2e8f0;padding:0 12px}.opv2-filter{padding:0 16px 14px}.opv2-grid{display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:14px;padding:0 16px 16px}.opv2-map{height:650px;border:1px solid rgba(148,163,184,.14);border-radius:20px;background:#0d1117}.opv2-side{display:flex;flex-direction:column;gap:12px}.opv2-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.opv2-kpi{border:1px solid rgba(34,197,94,.18);border-radius:16px;padding:12px;background:rgba(2,6,23,.35)}.opv2-kpi span{font-size:10px;color:#94a3b8;font-weight:900;text-transform:uppercase}.opv2-kpi strong{display:block;color:#fff;font-size:23px;margin-top:5px}.opv2-list{max-height:420px;overflow:auto;padding:10px}.opv2-row{border:1px solid rgba(148,163,184,.14);border-radius:15px;background:rgba(15,23,42,.62);padding:10px;margin-bottom:8px;cursor:pointer}.opv2-row.active,.opv2-row:hover{border-color:#22c55e;background:rgba(22,101,52,.13)}.opv2-row strong{display:block;color:#fff;font-size:13px}.opv2-row small{display:block;color:#94a3b8;margin-top:4px}.opv2-pill{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.2)}.ok{color:#bbf7d0}.warn{color:#fde68a}.bad{color:#fecaca}.opv2-detail{padding:14px;border-top:1px solid rgba(148,163,184,.12);display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.opv2-mini{border:1px solid rgba(148,163,184,.12);border-radius:13px;padding:10px}.opv2-mini span{display:block;font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:900}.opv2-mini strong{display:block;color:#fff;margin-top:4px;font-size:13px}.mk{width:18px;height:18px;border-radius:50%;border:2px solid #fff}.mk.ponto{background:#22c55e}.mk.colab{background:#60a5fa}.mk.carona{background:#f59e0b}.opv2-load{padding:28px;text-align:center;color:#94a3b8}@media(max-width:1100px){.opv2-grid{grid-template-columns:1fr}.opv2-map{height:520px}}`; document.head.appendChild(s); }
  async function leaflet(){ if(window.L)return true; try{ addCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',LEAFLET_CSS); await script('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',LEAFLET_JS); return !!window.L; }catch{return false} }
  function addCss(h,id){ if(document.getElementById(id))return; const l=document.createElement('link'); l.rel='stylesheet'; l.href=h; l.id=id; document.head.appendChild(l); }
  function script(src,id){ return new Promise((res,rej)=>{ if(document.getElementById(id))return res(); const s=document.createElement('script'); s.src=src; s.id=id; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
  function kpis(){ return {os:st.os.length,pontos:st.pontos.length,rotas:st.rotas.length,frota:st.rotas.filter(r=>r.colab.temFrota).length,carona:st.rotas.filter(r=>r.carona).length,hotel:st.rotas.filter(r=>r.precisaHotel).length}; }
  function rows(){ return st.rotas.filter(r=>!st.ponto||r.ponto.__key===st.ponto); }
  function badge(r){ if(r.sem)return '<span class="opv2-pill bad">sem coord.</span>'; if(r.colab.temFrota)return '<span class="opv2-pill ok">frota</span>'; if(r.carona)return '<span class="opv2-pill warn">carona</span>'; if(r.colab.veicProprio)return '<span class="opv2-pill ok">próprio</span>'; return '<span class="opv2-pill">avaliar</span>'; }
  function html(){ const k=kpis(), rs=rows(); return `<div class="opv2"><section class="opv2-card"><div class="opv2-head"><div><h2>Mapa de direcionamento</h2><p>Somente OS abertas. Cruza frota por leitura, carona 5 km/2,5 km, veículo próprio e hotel para deslocamentos acima de 120 km.</p></div><button class="opv2-btn" data-reload>Atualizar</button></div><div class="opv2-filter"><select class="opv2-select" data-ponto><option value="">Todos os pontos com OS aberta</option>${st.pontos.map(p=>`<option value="${esc(p.__key)}" ${st.ponto===p.__key?'selected':''}>${esc(p.cidade)}/${esc(p.uf)} · ${esc(p.nome_local||p.tipo_local||'Ponto')}</option>`).join('')}</select></div><div class="opv2-grid"><div id="opv2Map" class="opv2-map"><div class="opv2-load">Carregando mapa...</div></div><aside class="opv2-side"><div class="opv2-kpis"><div class="opv2-kpi"><span>OS abertas</span><strong>${k.os}</strong></div><div class="opv2-kpi"><span>Pontos</span><strong>${k.pontos}</strong></div><div class="opv2-kpi"><span>Rotas</span><strong>${k.rotas}</strong></div><div class="opv2-kpi"><span>Frota</span><strong>${k.frota}</strong></div><div class="opv2-kpi"><span>Carona</span><strong>${k.carona}</strong></div><div class="opv2-kpi"><span>Hotel</span><strong>${k.hotel}</strong></div></div><section class="opv2-card"><div class="opv2-list">${rs.length?rs.map(r=>`<div class="opv2-row ${st.rota===r.id?'active':''}" data-rota="${esc(r.id)}"><strong>${esc(short(r.colab.nome))} · ${esc(r.os.cliente||'OS')}</strong><small>${esc(r.modo)} · ${kmFmt(r.dist)} · OS ${esc(r.os.numero_os||r.os.os||r.os.id)}</small><small>${r.carona?`Carona: ${esc(short(r.carona.motorista.nome))} · desvio ${kmFmt(r.carona.desvio)}`:''}${r.precisaHotel?`${r.carona?'<br>':''}Hotel: ${esc(r.hotel?.nome||'sem cadastro próximo')}`:''}</small>${badge(r)}</div>`).join(''):'<div class="opv2-load">Nenhuma rota encontrada para as OS abertas.</div>'}</div></section><section class="opv2-card">${detail()}</section></aside></div></section></div>`; }
  function detail(){ const r=st.rotas.find(x=>x.id===st.rota)||rows()[0]; if(!r)return '<div class="opv2-load">Selecione uma rota.</div>'; st.rota=r.id; return `<div class="opv2-detail"><div class="opv2-mini"><span>Colaborador</span><strong>${esc(r.colab.nome)}</strong></div><div class="opv2-mini"><span>Ponto</span><strong>${esc(r.ponto.nome_local||r.ponto.tipo_local)} · ${esc(r.ponto.cidade)}/${esc(r.ponto.uf)}</strong></div><div class="opv2-mini"><span>Distância</span><strong>${kmFmt(r.dist)}</strong></div><div class="opv2-mini"><span>Transporte</span><strong>${esc(r.modo)}</strong></div><div class="opv2-mini"><span>Hotel > 120 km</span><strong>${r.precisaHotel?esc(r.hotel?`${r.hotel.nome} · ${kmFmt(r.hotel.dist)}`:'Sem hotel próximo'):'Não precisa'}</strong></div><div class="opv2-mini"><span>Frota por leitura</span><strong>${r.colab.temFrota?esc(r.colab.patrimonio?.identificacao||r.colab.patrimonio?.patrimonio_codigo||'Sim'):'Não'}</strong></div></div>`; }
  function bind(root){ root.querySelector('[data-ponto]')?.addEventListener('change',e=>{st.ponto=e.target.value;st.rota='';render(root)}); root.querySelector('[data-reload]')?.addEventListener('click',()=>openHome(root)); root.querySelectorAll('[data-rota]').forEach(el=>el.onclick=()=>{st.rota=el.dataset.rota;render(root)}); }
  async function map(root){ const el=root.querySelector('#opv2Map'); if(!el||!await leaflet())return; if(st.map){try{st.map.remove()}catch{}} const L=window.L; st.map=L.map(el,{center:[-14.235,-51.925],zoom:4}); L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd',attribution:'&copy; OSM'}).addTo(st.map); st.layers.r=L.layerGroup().addTo(st.map); draw(); setTimeout(()=>st.map?.invalidateSize(),80); }
  function icon(t){ return window.L.divIcon({className:'',html:`<div class="mk ${t}"></div>`,iconSize:[18,18],iconAnchor:[9,9]}); }
  function draw(){ if(!st.map||!window.L)return; const L=window.L,b=[]; st.layers.r.clearLayers(); const rs=rows(), r=st.rotas.find(x=>x.id===st.rota)||rs[0], seen=new Set(); rs.forEach(x=>{ if(geo(x.ponto)&&!seen.has(x.ponto.__key)){seen.add(x.ponto.__key); L.marker([lat(x.ponto),lng(x.ponto)],{icon:icon('ponto')}).bindTooltip(`${esc(x.ponto.nome_local||x.ponto.tipo_local)} · ${esc(x.ponto.cidade)}/${esc(x.ponto.uf)}`).addTo(st.layers.r); b.push([lat(x.ponto),lng(x.ponto)]);}}); if(r&&!r.sem){ const c=[lat(r.colab),lng(r.colab)], p=[lat(r.ponto),lng(r.ponto)], pts=r.carona?[[lat(r.carona.motorista),lng(r.carona.motorista)],c,p]:[c,p]; L.polyline(pts,{color:r.carona?'#f59e0b':'#22c55e',weight:4,opacity:.9,dashArray:r.colab.temFrota?null:'7 7'}).addTo(st.layers.r); if(r.carona)L.marker(pts[0],{icon:icon('carona')}).bindTooltip(`Frota/carona: ${esc(r.carona.motorista.nome)}`).addTo(st.layers.r); L.marker(c,{icon:icon('colab')}).bindTooltip(`Colaborador: ${esc(r.colab.nome)}`).addTo(st.layers.r); pts.forEach(x=>b.push(x)); } if(b.length)st.map.fitBounds(b,{padding:[30,30],maxZoom:10}); }
  function render(root){ root.innerHTML=html(); bind(root); map(root); }
  async function openHome(root){ css(); root.innerHTML='<div class="opv2"><section class="opv2-card"><div class="opv2-load">Carregando OS abertas, colaboradores, frota, deslocamentos e hotéis...</div></section></div>'; await load(); st.rota=rows()[0]?.id||''; render(root); console.info('[opv2] direcionamento carregado',{os:st.os.length,rotas:st.rotas.length}); }
  window.OPERACIONAL={openHome};
})();