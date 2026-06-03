(function(){
  const MODULE_NAME='FROTAS_MULTAS';
  const MONEY_FMT=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const DAY_MS=24*60*60*1000;
  const styles=`<style>
    .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));overflow:hidden}.fm-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.fm-tab{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 14px;font-weight:950;cursor:pointer}.fm-tab.active,.fm-tab:hover{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35);color:#f8fafc}.fm-body{padding:18px}.fm-toolbar{display:grid;grid-template-columns:155px 155px 170px minmax(200px,1fr) auto auto;gap:10px;margin-bottom:14px}.fm-input,.fm-select{height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;color-scheme:dark}.fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;transition:.15s ease}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.26);background:rgba(34,197,94,.12);color:#bbf7d0}.fm-btn.warn{border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.14);color:#fde68a}.fm-btn.danger{border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.13);color:#fecaca}.fm-btn.info{border:1px solid rgba(96,165,250,.35);background:rgba(59,130,246,.13);color:#bfdbfe}.fm-btn.done{border:1px solid rgba(34,197,94,.55);background:rgba(22,163,74,.38);color:#dcfce7}.fm-btn:disabled{opacity:.55;cursor:wait}.fm-row-updating{opacity:.58;filter:saturate(.75)}.fm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.fm-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px}.fm-kpi span{display:block;color:#93c5fd;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.fm-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:1230px;table-layout:fixed}.fm-table th{padding:11px 8px;color:#bfdbfe;font-size:11px;letter-spacing:.09em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38);white-space:nowrap}.fm-table td{padding:11px 8px;border-bottom:1px solid rgba(148,163,184,.10);font-size:13px;vertical-align:middle}.fm-table th:nth-child(1),.fm-table td:nth-child(1){width:150px}.fm-table th:nth-child(2),.fm-table td:nth-child(2){width:105px}.fm-table th:nth-child(3),.fm-table td:nth-child(3){width:145px}.fm-table th:nth-child(4),.fm-table td:nth-child(4){width:330px;padding-left:6px}.fm-table th:nth-child(5),.fm-table td:nth-child(5){width:135px}.fm-table th:nth-child(6),.fm-table td:nth-child(6){width:95px}.fm-table th:nth-child(7),.fm-table td:nth-child(7){width:105px}.fm-table th:nth-child(8),.fm-table td:nth-child(8){width:105px}.fm-table th:nth-child(9),.fm-table td:nth-child(9){width:170px}.fm-sort{appearance:none;border:0;background:transparent;color:inherit;font:inherit;font-weight:950;text-transform:uppercase;letter-spacing:.09em;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px}.fm-sort:hover{color:#fff}.fm-sort-mark{font-size:10px;color:#86efac}.fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fm-badge{border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.red{border-color:rgba(248,113,113,.35);background:rgba(127,29,29,.25);color:#fecaca}.fm-badge.green{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.25);color:#bbf7d0}.fm-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fm-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.fm-action-grid .fm-btn{min-height:32px;border-radius:10px;padding:0 8px;font-size:11px}.fm-modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px}.fm-modal{width:min(620px,100%);border:1px solid rgba(148,163,184,.18);border-radius:22px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.45);padding:18px;color:#e2e2f0}.fm-modal h3{margin:0 0 6px;color:#f8fafc;font-size:22px}.fm-modal p{margin:0 0 14px;color:#6b7280;line-height:1.45}.fm-modal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fm-modal-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.fm-meta-line{font-size:12px;color:#bfdbfe;margin:10px 0 0;line-height:1.45}.fm-autocomplete-wrap{position:relative;margin-top:8px}.fm-suggestions{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:10001;max-height:240px;overflow:auto;border:1px solid rgba(34,197,94,.30);border-radius:16px;background:#0d0d18;box-shadow:0 18px 48px rgba(0,0,0,.42);padding:6px;color-scheme:dark}.fm-suggestions.show{display:block}.fm-suggestion{width:100%;border:0;background:transparent;color:#e2e2f0;text-align:left;border-radius:12px;padding:10px 12px;cursor:pointer}.fm-suggestion:hover,.fm-suggestion.active{background:rgba(22,101,52,.42);color:#f8fafc}.fm-suggestion strong{display:block;font-size:13px;color:#f8fafc}.fm-suggestion small{display:block;margin-top:3px;color:#93c5fd;font-size:11px}.fm-suggestion-empty{padding:10px 12px;color:#6b7280;font-size:12px}.fm-input-with-suggestions{padding-right:36px}.fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}@media(max-width:1000px){.fm-toolbar,.fm-grid{grid-template-columns:1fr}.fm-modal-grid{grid-template-columns:1fr}}.fm-toast.show{opacity:1;transform:translateY(0)}
  </style>`;

  const state={multas:[], motoristas:[], todosColaboradores:[], motoristasLoaded:false, busca:'', filtro:'abertas', filtro2:'todas', arquivo:'ativas', sortKey:'vencimento', sortDir:'desc'};

  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  function first(...vals){return vals.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');}
  function isFilled(v){return v!==undefined&&v!==null&&String(v).trim()!=='';}
  function pick(obj, keys){
    if(!obj) return undefined;
    for(const k of keys){
      if(Object.prototype.hasOwnProperty.call(obj,k) && isFilled(obj[k])) return obj[k];
    }
    return undefined;
  }
  function deepPick(obj, keys, maxDepth=5){
    if(!obj||maxDepth<0) return undefined;
    const wanted=new Set((keys||[]).map(k=>norm(k).replace(/[^a-z0-9]/g,'')));
    const seen=new WeakSet();
    function walk(cur,depth){
      if(!cur||depth<0) return undefined;
      if(typeof cur!=='object') return undefined;
      if(seen.has(cur)) return undefined;
      seen.add(cur);
      if(Array.isArray(cur)){
        for(const item of cur){const v=walk(item,depth-1);if(isFilled(v))return v;}
        return undefined;
      }
      for(const [k,v] of Object.entries(cur)){
        const key=norm(k).replace(/[^a-z0-9]/g,'');
        if(wanted.has(key)&&isFilled(v)) return v;
      }
      for(const v of Object.values(cur)){
        if(v&&typeof v==='object'){
          const found=walk(v,depth-1);
          if(isFilled(found)) return found;
        }
      }
      return undefined;
    }
    return walk(obj,maxDepth);
  }
  function rawPayload(m){
    const raw=first(m.raw,m.payload,m.dados_api,m.dados_detran,m.retorno_api,m.api_json,m.resposta_api,m.json_api,m.detran_json,m.detran_payload);
    if(!raw) return null;
    if(typeof raw==='object') return raw;
    try{return JSON.parse(raw);}catch(_){return null;}
  }
  function apiPick(m, keys){
    const direct=pick(m,keys);
    if(direct!==undefined) return direct;
    const raw=rawPayload(m);
    const shallow=Array.isArray(raw)?pick(raw[0],keys):pick(raw,keys);
    if(shallow!==undefined) return shallow;
    return deepPick(raw,keys);
  }
  function parseDate(v){
    if(!v) return null;
    if(v instanceof Date && !Number.isNaN(v.getTime())) return v;
    const s=String(v).trim();
    const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(iso) return new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3]));
    const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(br) return new Date(Number(br[3]),Number(br[2])-1,Number(br[1]));
    const d=new Date(s); return Number.isNaN(d.getTime())?null:d;
  }
  function isoDate(d){return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';}
  function fmtDate(v){const d=parseDate(v);return d?isoDate(d).split('-').reverse().join('/'):'';}
  const DETRAN_DUE_KEYS=[
    'dataVencimentoAuto','data_vencimento_auto','dataVencimento','data_vencimento','vencimento','dataVenc','data_venc',
    'dataLimitePagto','data_limite_pagto','dataLimitePagamento','data_limite_pagamento','dataPagamentoLimite','data_pagamento_limite',
    'dataVencimentoBoleto','data_vencimento_boleto','vencimentoBoleto','vencimento_boleto','dataVencimentoGuia','data_vencimento_guia',
    'dataValidadeGuia','data_validade_guia','dataValidade','data_validade','dataLimite','data_limite','dataLimiteDefesa','data_limite_defesa'
  ];
  function dueDate(m){
    return first(
      apiPick(m,DETRAN_DUE_KEYS),
      m.data_vencimento_auto,
      m.data_limite_pagto,
      m.data_vencimento,
      m.vencimento,
      m.data_venc,
      m.data_limite_pagamento,
      m.data_pagamento_limite,
      m.data_validade_guia,
      m.data_limite_defesa,
      m.data_limite
    );
  }
  function infractionDate(m){
    return first(
      apiPick(m,['dataInfracao','data_infracao','dataAuto','data_auto','dataOcorrencia','data_ocorrencia']),
      m.data_infracao,
      m.data_auto,
      m.data_ocorrencia,
      m.data
    );
  }
  function isArchived(m){return Boolean(m.arquivada_em||m.arquivado_em||m.ok_em||m.status_arquivo==='arquivada'||m.arquivada===true||m.ok===true);}
  function isIdentificar(m){return Boolean(m.identificar_solicitado_em||m.condutor_identificado_em||m.indicar_solicitado_em||norm(m.acao_status).includes('identific'));}
  function isDobrar(m){return Boolean(m.dobrar_solicitado_em||m.multa_dobrada_em||norm(m.acao_status).includes('dobr'));}
  function moneyValue(v){const n=Number(v||0);if(!Number.isFinite(n))return 0;if(Number.isInteger(n)&&Math.abs(n)>=1000)return n/100;return n;}
  function fmtMoney(v){return MONEY_FMT.format(moneyValue(v));}
  function statusText(m){return first(m.status_multa,m.situacao,m.status,'A PAGAR');}
  function isAPagar(m){const st=norm(statusText(m)).replace(/\s+/g,' ');return st==='a pagar'||st.includes('a pagar')||st.includes('em aberto')||st.includes('aberta');}
  function statusKind(m){
    const st=norm(statusText(m)).replace(/\s+/g,' ');
    if(st.includes('cancel'))return 'cancelada';
    if(st.includes('venc'))return 'vencida';
    const d=parseDate(dueDate(m));
    if(d){const today=new Date();today.setHours(0,0,0,0);if(d.getTime()<today.getTime())return 'vencida';}
    if(isAPagar(m))return 'aberta';
    if(st.includes('paga')||st.includes('baix')||st.includes('quit'))return 'paga';
    return 'aberta';
  }
  function toast(msg,error=false){let el=document.querySelector('.fm-toast');if(!el){el=document.createElement('div');el.className='fm-toast';document.body.appendChild(el);}el.textContent=msg;el.style.background=error?'rgba(127,29,29,.96)':'rgba(22,101,52,.96)';el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3600);}
  async function callFunction(opts,name,body){const {data,error}=await opts.supabase.functions.invoke(name,{body});if(error){const msg=error.context?.error||error.context?.message||error.message||`Falha na function ${name}`;throw new Error(msg);}if(data?.error)throw new Error(data.error);return data;}


  function motoristaLabel(c){return first(c.nome,c.nome_colaborador,c.colaborador,c.funcionario,'');}
  function motoristaSubLabel(c){return [c.supervisao,c.coordenacao,c.empresa,c.tipo].filter(Boolean).join(' • ');}
  function isColaboradorAtivo(c){const a=c.ativo;const s=norm(first(c.situacao,c.status,''));if(a===false)return false;if(s&&/(nao ativo|não ativo|deslig|demit|inativ)/.test(s))return false;return true;}
  function uniqueMotoristas(rows){const map=new Map();(rows||[]).forEach(c=>{const nome=motoristaLabel(c);if(!nome)return;const key=norm(nome);if(!map.has(key))map.set(key,c);});return Array.from(map.values()).sort((a,b)=>motoristaLabel(a).localeCompare(motoristaLabel(b),'pt-BR'));}
  async function loadMotoristas(opts){
    if(state.motoristasLoaded) return state.motoristas;
    const selects=['nome,supervisao,coordenacao,empresa,tipo,ativo,situacao','nome,supervisao,coordenacao,empresa,tipo,situacao','nome'];
    for(const sel of selects){
      try{
        let all=[],from=0;const PAGE=1000;
        while(true){const {data,error}=await opts.supabase.from('colaborador_snapshot').select(sel).order('nome',{ascending:true}).range(from,from+PAGE-1);if(error)throw error;const rows=data||[];all=all.concat(rows);if(rows.length<PAGE)break;from+=PAGE;}
        state.motoristas=uniqueMotoristas(all.filter(isColaboradorAtivo));
        state.todosColaboradores=uniqueMotoristas(all);
        state.motoristasLoaded=true;
        return state.motoristas;
      }catch(err){
        console.warn('Falha ao carregar motoristas com select:', sel, err);
      }
    }
    state.motoristas=[];state.todosColaboradores=[];state.motoristasLoaded=true;return state.motoristas;
  }
  function matchesMotorista(c,term){const q=norm(term);if(!q)return false;const hay=norm([motoristaLabel(c),c.supervisao,c.coordenacao,c.empresa,c.tipo].join(' '));return hay.includes(q);}
  function renderMotoristaSuggestions(box,input,selectedRef){
    const term=input.value.trim();
    if(term.length<2){box.classList.remove('show');box.innerHTML='';return;}
    let rows=state.motoristas.filter(c=>matchesMotorista(c,term)).slice(0,12);
    let isFallback=false;
    if(!rows.length&&state.todosColaboradores.length){
      rows=state.todosColaboradores.filter(c=>matchesMotorista(c,term)).slice(0,12);
      isFallback=rows.length>0;
    }
    if(!rows.length){box.innerHTML='<div class="fm-suggestion-empty">Nenhum motorista localizado na base de colaboradores.</div>';box.classList.add('show');return;}
    box.innerHTML=rows.map((c,i)=>`<button type="button" class="fm-suggestion" data-suggestion-index="${i}"><strong>${esc(motoristaLabel(c))}</strong><small>${esc((isFallback?'⚠ inativo · ':'')+( motoristaSubLabel(c)||'Colaborador'))}</small></button>`).join('');
    box.classList.add('show');
    box.querySelectorAll('[data-suggestion-index]').forEach(btn=>btn.addEventListener('click',()=>{
      const c=rows[Number(btn.dataset.suggestionIndex)];
      input.value=motoristaLabel(c);
      selectedRef.value=c;
      box.classList.remove('show');
      input.focus();
    }));
  }

  async function syncMultas(root,opts){
    try{
      toast('Sincronizando multas no DETRAN em lotes...');
      let offset=0;const limit=15;let totalMultas=0,veiculos=0,inserted=0,updated=0,errors=0,totalDisponivel=null;
      const since=new Date(Date.now()-(180*DAY_MS));
      for(let i=0;i<80;i++){
        const data=await callFunction(opts,'sync-multas-detran',{mode:'all',offset,limit,dias:180,data_inicial:isoDate(since)});
        totalMultas+=Number(data?.total_multas||0);veiculos+=Number(data?.total_veiculos||0);inserted+=Number(data?.inserted||0);updated+=Number(data?.updated||0);errors+=Number(data?.errors||0);totalDisponivel=data?.total_disponivel??totalDisponivel;offset=Number(data?.next_offset||offset+limit);
        toast(`Multas: ${Math.min(offset,Number(totalDisponivel||offset))}/${totalDisponivel||'?'} veículos processados...`);
        if(!data?.has_more)break;
      }
      toast(`Sincronização concluída: ${veiculos} veículo(s), ${totalMultas} multa(s), ${inserted} nova(s), ${updated} atualizada(s)${errors?`, ${errors} erro(s)`:''}.`,Boolean(errors));
      await load(root,opts);
    }catch(err){toast(err.message||'Falha ao sincronizar multas.',true);}
  }

  function inLast180(m){const d=parseDate(infractionDate(m))||parseDate(dueDate(m));if(!d) return true;return d.getTime()>=Date.now()-(180*DAY_MS);}
  function filtered(){
    const b=norm(state.busca);
    return state.multas.filter(m=>{
      if(!inLast180(m))return false;
      const archived=isArchived(m);
      if(state.arquivo==='ativas'&&archived)return false;
      if(state.arquivo==='arquivadas'&&!archived)return false;
      const kind=statusKind(m);
      if(state.filtro==='vencidas'&&kind!=='vencida')return false;
      if(state.filtro==='abertas'&&kind!=='aberta')return false;
      if(state.filtro==='pagas'&&kind!=='paga')return false;
      if(state.filtro2==='identificadas'&&!isIdentificar(m))return false;
      if(state.filtro2==='dobradas'&&!isDobrar(m))return false;
      if(state.filtro2==='pendentes'&&(m.motorista&&String(m.motorista).trim()!==''))return false;
      if(b&&!norm([m.placa,m.renavam,m.motorista,m.descricao,m.local,m.numero_auto_infracao,m.auto,m.empresa,statusText(m)].join(' ')).includes(b))return false;
      return true;
    }).sort(compareRows);
  }
  function sortValue(m,key){
    if(key==='vencimento')return parseDate(dueDate(m))?.getTime()||0;
    if(key==='infracao')return parseDate(infractionDate(m))?.getTime()||0;
    if(key==='valor')return moneyValue(first(m.valor_original,m.valor,m.valor_multa));
    if(key==='status')return norm(statusText(m));
    return norm(first(m[key],''));
  }
  function compareRows(a,b){const av=sortValue(a,state.sortKey), bv=sortValue(b,state.sortKey);let r=0;if(typeof av==='number'||typeof bv==='number')r=Number(av)-Number(bv);else r=String(av).localeCompare(String(bv),'pt-BR');return state.sortDir==='asc'?r:-r;}
  function markFor(key){if(state.sortKey!==key)return '';return `<span class="fm-sort-mark" title="${state.sortDir==='asc'?'Crescente':'Decrescente'}">${state.sortDir==='asc'?'▲':'▼'}</span>`;}
  function toggleSort(key){
    if(!key) return;
    if(state.sortKey===key){
      state.sortDir=state.sortDir==='asc'?'desc':'asc';
    }else{
      state.sortKey=key;
      state.sortDir='asc';
    }
  }
  function stats(root){const rows=filtered();root.querySelector('[data-kpi-abertas]').textContent=rows.filter(isAPagar).length;root.querySelector('[data-kpi-vencidas]').textContent=rows.filter(m=>statusKind(m)==='vencida').length;root.querySelector('[data-kpi-valor]').textContent=MONEY_FMT.format(rows.reduce((s,m)=>s+moneyValue(first(m.valor_original,m.valor,m.valor_multa)),0));root.querySelector('[data-kpi-guias]').textContent=rows.filter(m=>m.arquivo_pdf_url||m.guia_url).length;root.querySelector('[data-count]').textContent=`${rows.length} multa(s) encontrada(s) · últimos 180 dias`;}

  function render(root,opts){
    const tbody=root.querySelector('[data-multas-table]');
    const rows=filtered();
    stats(root);
    if(!rows.length){tbody.innerHTML='<tr><td colspan="9" class="fm-empty">Nenhuma multa encontrada para o filtro selecionado.</td></tr>';return;}
    tbody.innerHTML=rows.map(m=>{
      const kind=statusKind(m);
      const badgeClass=kind==='vencida'?'red':kind==='paga'?'green':'';
      return `<tr class="${m.__saving?'fm-row-updating':''}">
        <td><strong>${esc(m.placa)}</strong><br><small>${esc(m.empresa||'')}</small></td>
        <td>${fmtDate(infractionDate(m))||'—'}</td>
        <td>${esc(m.motorista||'—')}</td>
        <td>${esc(m.descricao||'—')}<br><small>${esc(m.local||'')}</small></td>
        <td>${esc(m.numero_auto_infracao||m.auto||'—')}</td>
        <td>${fmtMoney(first(m.valor_original,m.valor,m.valor_multa))}</td>
        <td>${fmtDate(dueDate(m))||'—'}</td>
        <td><span class="fm-badge ${badgeClass}">${esc(statusText(m))}</span></td>
        <td><div class="fm-action-grid">
          <button class="fm-btn info" data-motorista="${m.id}">Motorista</button>
          <button class="fm-btn ${isIdentificar(m)?'done':'warn'}" data-identificar="${m.id}">Identificar</button>
          <button class="fm-btn ${isDobrar(m)?'done':'danger'}" data-dobrar="${m.id}">Dobrar</button>
          <button class="fm-btn soft" data-ok="${m.id}" ${m.__saving?'disabled':''}>${m.__saving?'Salvando...':'OK'}</button>
        </div></td>
      </tr>`;
    }).join('');
    // Os cliques da tabela são tratados por delegação em bindTableActions(),
    // evitando recriar centenas de listeners a cada ordenação/filtro.
  }

  async function safeUpdate(opts,id,payload){
    const { error } = await opts.supabase.from('frotas_multas').update(payload).eq('id', id);
    if(error) throw error;
  }
  function replaceLocalMulta(id, patch){
    const idx=state.multas.findIndex(x=>String(x.id)===String(id));
    if(idx<0) return null;
    const before={...state.multas[idx]};
    state.multas[idx]={...state.multas[idx],...patch};
    return before;
  }
  async function toggleAction(root, opts, multa, action){
    if(!multa?.id) return toast('Multa não localizada.', true);
    const now=new Date().toISOString();
    const payload={ atualizado_em: now };
    if(action==='identificar'){payload.identificar_solicitado_em=isIdentificar(multa)?null:now;payload.acao_status=payload.identificar_solicitado_em?'Identificar condutor':null;}
    if(action==='dobrar'){payload.dobrar_solicitado_em=isDobrar(multa)?null:now;payload.acao_status=payload.dobrar_solicitado_em?'Dobrar multa':null;}
    const before=replaceLocalMulta(multa.id,{...payload,__saving:true});
    render(root,opts);
    try{
      await safeUpdate(opts,multa.id,payload);
      replaceLocalMulta(multa.id,{__saving:false});
      render(root,opts);
      toast(action==='identificar'?'Status de identificação atualizado.':'Status de dobra atualizado.');
      load(root,opts,{silent:true});
    }catch(err){
      if(before) replaceLocalMulta(multa.id,before);
      render(root,opts);
      toast((err.message||'Erro ao salvar ação.')+' Execute a migration de multas caso falte coluna.',true);
    }
  }
  async function archiveMulta(root, opts, multa){
    if(!multa?.id) return toast('Multa não localizada.', true);
    const now=new Date().toISOString();
    const payload={arquivada_em:now,ok_em:now,atualizado_em:now};
    const before=replaceLocalMulta(multa.id,{...payload,__saving:true});
    render(root,opts);
    try{
      await safeUpdate(opts,multa.id,payload);
      replaceLocalMulta(multa.id,{__saving:false});
      render(root,opts);
      toast('Multa arquivada.');
      load(root,opts,{silent:true});
    }catch(err){
      if(before) replaceLocalMulta(multa.id,before);
      render(root,opts);
      toast((err.message||'Erro ao arquivar multa.')+' Execute a migration de multas caso falte coluna.',true);
    }
  }
  function openMotoristaModal(root, opts, multa){
    if(!multa) return toast('Multa não localizada.', true);
    document.querySelector('[data-fm-modal]')?.remove();
    const el=document.createElement('div');
    el.className='fm-modal-backdrop';el.setAttribute('data-fm-modal','1');
    el.innerHTML=`<div class="fm-modal" role="dialog" aria-modal="true"><h3>Definir motorista</h3><p><strong>${esc(multa.placa||'')}</strong> · Infração ${fmtDate(infractionDate(multa))||'—'} · Vencimento ${fmtDate(dueDate(multa))||'—'} · Auto ${esc(multa.numero_auto_infracao||multa.auto||'—')}</p><label class="fm-kicker" for="fm-motorista-input">Motorista responsável</label><div class="fm-autocomplete-wrap"><input id="fm-motorista-input" class="fm-input fm-input-with-suggestions" style="width:100%" value="${esc(multa.motorista||'')}" placeholder="Digite o nome do motorista" autocomplete="off"><div class="fm-suggestions" data-motorista-suggestions></div></div><div class="fm-meta-line">${esc(multa.descricao||'')}<br>${esc(multa.local||'')}</div><div class="fm-modal-foot"><button class="fm-btn soft" data-close>Cancelar</button><button class="fm-btn primary" data-save>Salvar motorista</button></div></div>`;
    document.body.appendChild(el);
    const input=el.querySelector('#fm-motorista-input');
    const suggestionsBox=el.querySelector('[data-motorista-suggestions]');
    const selectedMotorista={value:null};
    input?.focus();input?.select();
    loadMotoristas(opts).then(()=>renderMotoristaSuggestions(suggestionsBox,input,selectedMotorista)).catch(()=>{});
    input?.addEventListener('input',()=>{selectedMotorista.value=null;renderMotoristaSuggestions(suggestionsBox,input,selectedMotorista);});
    input?.addEventListener('focus',()=>renderMotoristaSuggestions(suggestionsBox,input,selectedMotorista));
    input?.addEventListener('keydown',(ev)=>{
      if(ev.key==='Escape'){suggestionsBox?.classList.remove('show');return;}
      if(ev.key==='Enter'){
        const firstBtn=suggestionsBox?.querySelector('[data-suggestion-index]');
        if(firstBtn&&suggestionsBox.classList.contains('show')){ev.preventDefault();firstBtn.click();}
      }
    });
    el.querySelector('[data-close]')?.addEventListener('click',()=>el.remove());
    el.addEventListener('click',(ev)=>{ if(ev.target===el) el.remove(); });
    document.addEventListener('click',(ev)=>{ if(el.isConnected&&!el.contains(ev.target)) suggestionsBox?.classList.remove('show'); }, {once:true});
    el.querySelector('[data-save]')?.addEventListener('click',async()=>{
      const motorista=input.value.trim();
      if(!motorista) return toast('Informe o nome do motorista.', true);
      try{const now=new Date().toISOString();const payload={motorista,motorista_definido_em:now,atualizado_em:now};replaceLocalMulta(multa.id,payload);render(root,opts);await safeUpdate(opts,multa.id,payload);toast('Motorista definido.');el.remove();load(root,opts,{silent:true});}catch(err){toast((err.message||'Erro ao salvar motorista.')+' Execute a migration de multas caso falte coluna.',true);}
    });
  }

  async function archiveExpiredMultas(opts){
    const today=isoDate(new Date());
    const now=new Date().toISOString();
    const payload={
      arquivada_em:now,
      motivo_arquivamento:'Arquivada automaticamente: vencimento anterior à data atual.',
      atualizado_em:now
    };

    const attempts=[
      q=>q.or(`data_vencimento_auto.lt.${today},data_limite_pagto.lt.${today}`),
      q=>q.lt('data_vencimento_auto',today),
      q=>q.lt('data_limite_pagto',today)
    ];

    for(const build of attempts){
      try{
        const {error}=await build(
          opts.supabase
            .from('frotas_multas')
            .update(payload)
            .is('arquivada_em',null)
        );
        if(!error) return;
        console.warn('Falha ao arquivar vencidas automaticamente:', error);
      }catch(err){
        console.warn('Falha ao arquivar vencidas automaticamente:', err);
      }
    }
  }

  function applyArchiveQueryFilter(query){
    if(state.arquivo==='ativas') return query.is('arquivada_em',null);
    if(state.arquivo==='arquivadas') return query.not('arquivada_em','is',null);
    return query;
  }

  async function load(root,opts,config={}){
    const silent=Boolean(config&&config.silent);
    const skipAutoArchive=Boolean(config&&config.skipAutoArchive);
    const tbody=root.querySelector('[data-multas-table]');
    if(tbody&&!silent&&!state.multas.length) tbody.innerHTML='<tr><td colspan="9" class="fm-empty">Carregando multas...</td></tr>';

    if(!skipAutoArchive){
      await archiveExpiredMultas(opts);
    }

    let query=applyArchiveQueryFilter(opts.supabase.from('frotas_multas').select('*'));
    query=query.order('data_vencimento_auto',{ascending:false,nullsFirst:false}).limit(state.arquivo==='todas'?1000:500);
    const {data,error}=await query;
    if(error){
      if(tbody&&!silent) tbody.innerHTML='<tr><td colspan="9" class="fm-empty">Erro ao carregar multas: '+esc(error.message||'')+'</td></tr>';
      if(silent) console.warn('Falha ao atualizar multas em segundo plano:', error);
      return;
    }
    state.multas=Array.isArray(data)?data:[];
    render(root,opts);
  }

  function bindSort(container,opts){
    const head=container.querySelector('.fm-table thead');
    if(!head||head.dataset.sortBound==='1') return;
    head.dataset.sortBound='1';
    head.addEventListener('click',(ev)=>{
      const btn=ev.target.closest('[data-sort]');
      if(!btn||!head.contains(btn)) return;
      toggleSort(btn.dataset.sort);
      render(container,opts);
    });
  }
  function bindTableActions(container,opts){
    const tbody=container.querySelector('[data-multas-table]');
    if(!tbody||tbody.dataset.actionBound==='1') return;
    tbody.dataset.actionBound='1';
    tbody.addEventListener('click',(ev)=>{
      const btn=ev.target.closest('button');
      if(!btn||!tbody.contains(btn)) return;
      const id=btn.dataset.motorista||btn.dataset.identificar||btn.dataset.dobrar||btn.dataset.ok;
      if(!id) return;
      const multa=state.multas.find(x=>String(x.id)===String(id));
      if(btn.dataset.motorista) return openMotoristaModal(container, opts, multa);
      if(btn.dataset.identificar) return toggleAction(container, opts, multa, 'identificar');
      if(btn.dataset.dobrar) return toggleAction(container, opts, multa, 'dobrar');
      if(btn.dataset.ok) return archiveMulta(container, opts, multa);
    });
  }
  function refreshSortHeaders(container){
    container.querySelectorAll('[data-sort]').forEach(btn=>{
      const key=btn.dataset.sort;
      btn.innerHTML=`${btn.dataset.label} ${markFor(key)}`;
      btn.title=state.sortKey===key
        ? (state.sortDir==='asc'?'Clique para ordenar de Z a A / maior para menor':'Clique para ordenar de A a Z / menor para maior')
        : 'Clique para ordenar de A a Z / menor para maior';
      btn.setAttribute('aria-sort', state.sortKey===key ? (state.sortDir==='asc'?'ascending':'descending') : 'none');
    });
  }
  const originalRender=render;
  render=function(root,opts){ originalRender(root,opts); refreshSortHeaders(root); };

  function openHome(container,opts={}){
    container.innerHTML=`${styles}<section class="fm-shell"><div class="fm-head"><div class="fm-kicker">Frotas · Notificações</div><h1 class="fm-title">Multas</h1><p class="fm-sub">Consulta, conferência, definição de motorista, identificação/dobra e arquivamento das multas recentes.</p></div><div class="fm-card"><div class="fm-tabs"><button class="fm-tab" data-open-dashboard>Dashboard</button><button class="fm-tab" data-open-excesso>Excesso de Velocidade</button><button class="fm-tab" data-open-veiculos>Veículos</button><button class="fm-tab active">Multas</button><button class="fm-tab" data-open-historico>Histórico</button><button class="fm-tab" data-open-rastreadores>Rastreadores</button></div><div class="fm-body"><div class="fm-toolbar"><select class="fm-select" data-filter><option value="abertas">Abertas</option><option value="vencidas">Vencidas</option><option value="todas">Todas</option></select><select class="fm-select" data-filter2><option value="todas">Todas situações</option><option value="pendentes">Pendentes (sem motorista)</option><option value="identificadas">Identificadas</option><option value="dobradas">Dobradas</option></select><select class="fm-select" data-archive-filter><option value="ativas">Multas ativas</option><option value="arquivadas">Consultar arquivadas</option><option value="todas">Ativas + arquivadas</option></select><input class="fm-input" data-search placeholder="Buscar por placa, motorista, auto, renavam, empresa..."><button class="fm-btn primary" data-refresh>Atualizar</button><button class="fm-btn primary" data-sync-multas>Sincronizar DETRAN</button></div><div class="fm-grid"><div class="fm-kpi"><span>Abertas</span><strong data-kpi-abertas>0</strong></div><div class="fm-kpi"><span>Vencidas</span><strong data-kpi-vencidas>0</strong></div><div class="fm-kpi"><span>Valor filtrado</span><strong data-kpi-valor>R$ 0,00</strong></div><div class="fm-kpi"><span>Guias/PDFs</span><strong data-kpi-guias>0</strong></div></div><p class="fm-sub" data-count>0 multa(s) encontrada(s)</p><div class="fm-table-wrap"><table class="fm-table"><thead><tr><th><button class="fm-sort" data-sort="placa" data-label="Placa / Empresa">Placa / Empresa</button></th><th><button class="fm-sort" data-sort="infracao" data-label="Infração">Infração</button></th><th><button class="fm-sort" data-sort="motorista" data-label="Motorista">Motorista</button></th><th><button class="fm-sort" data-sort="descricao" data-label="Descrição / Local">Descrição / Local</button></th><th><button class="fm-sort" data-sort="numero_auto_infracao" data-label="Auto">Auto</button></th><th><button class="fm-sort" data-sort="valor" data-label="Valor">Valor</button></th><th><button class="fm-sort" data-sort="vencimento" data-label="Vencimento">Vencimento</button></th><th><button class="fm-sort" data-sort="status" data-label="Status">Status</button></th><th>Ações</th></tr></thead><tbody data-multas-table></tbody></table></div><div class="fm-note">A lista exibe somente multas dos últimos <strong>180 dias</strong>. Multas com <strong>vencimento anterior a hoje</strong> são arquivadas automaticamente para manter a tela leve para novas multas.</div></div></div></section>`;
    container.querySelector('[data-open-dashboard]')?.addEventListener('click',()=>location.assign('https://grao1000.com.br/painel/frotas-dashboard'));
    container.querySelector('[data-open-excesso]')?.addEventListener('click',()=>location.assign('https://grao1000.com.br/painel/frotas'));
    container.querySelector('[data-open-veiculos]')?.addEventListener('click',()=>location.assign('https://grao1000.com.br/painel/frotas-veiculos'));
    container.querySelector('[data-open-historico]')?.addEventListener('click',()=>location.assign('https://grao1000.com.br/painel/frotas-historico'));
    container.querySelector('[data-open-rastreadores]')?.addEventListener('click',()=>location.assign('https://grao1000.com.br/painel/frotas-rastreadores'));
    container.querySelector('[data-refresh]')?.addEventListener('click',()=>load(container,opts));
    container.querySelector('[data-sync-multas]')?.addEventListener('click',()=>syncMultas(container,opts));
    container.querySelector('[data-search]')?.addEventListener('input',e=>{state.busca=e.target.value;render(container,opts);});
    container.querySelector('[data-filter]')?.addEventListener('change',e=>{state.filtro=e.target.value;render(container,opts);});
    container.querySelector('[data-filter2]')?.addEventListener('change',e=>{state.filtro2=e.target.value;render(container,opts);});
    container.querySelector('[data-archive-filter]')?.addEventListener('change',e=>{state.arquivo=e.target.value;load(container,opts,{skipAutoArchive:true});});
    bindSort(container,opts);
    bindTableActions(container,opts);
    load(container,opts);
  }
  window[MODULE_NAME]=window[MODULE_NAME]||{};window[MODULE_NAME].openHome=openHome;
})();
