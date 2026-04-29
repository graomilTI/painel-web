(function () {
  const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const MONEY_ROWS = new Set([
    'NOTAS FISCAIS','DESCONTOS CONCEDIDOS+ACRÉSCIMOS','TOTAL DE IMPOSTOS','RECEITA LÍQUIDA',
    'TOTAL DE DESPESAS OPERACIONAIS','DESP COM VEICULOS+COMBUSTIVEIS','TOTAL DESPESAS PESSOAL',
    'LUCRO BRUTO','DESP ADM + COMERCIAL','LUCRO OPERACIONAL (EBTIDA)','DESPESAS FINANCEIRAS',
    'LUCRO LÍQUIDO','EMPRESTIMOS TERCEIROS','ANTECIPAÇÕES A FORNECEDORES','INVESTIMENTOS','RESULTADO FINAL',
    'TOTAL DESPESAS','CUSTO POR TONELADA'
  ]);
  const PERCENT_ROWS = new Set(['MARGEM BRUTA','MARGEM EBTIDA']);
  const INDIVIDUAL_EXCLUDED = ['AGROTRADER','LOG1000','PARAGUAI'];
  const IGNORED = ['NULL'];
  const POOL = ['GERAL','AGROTRADER','LOG1000'];
  const ALIASES = { TERMINAISINATIVO: 'MARINGA E TERMINAIS' };

  const styles = `
    <style>
      .dre-wrap{--bg:#020617;--card:rgba(15,23,42,.76);--line:rgba(148,163,184,.18);--green:#22c55e;--green2:#166534;--text:#e5e7eb;--muted:#94a3b8;color:var(--text)}
      .dre-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:end;margin-bottom:18px;padding:18px;border:1px solid rgba(34,197,94,.20);border-radius:24px;background:radial-gradient(circle at 15% 10%,rgba(34,197,94,.18),transparent 34%),linear-gradient(145deg,rgba(15,23,42,.92),rgba(2,6,23,.78));box-shadow:0 20px 60px rgba(0,0,0,.20)}
      .dre-kicker{font-size:12px;color:#bbf7d0;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.dre-hero h2{margin:6px 0 4px;font-size:28px;letter-spacing:-.04em}.dre-hero p{margin:0;color:var(--muted)}
      .dre-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-end}.dre-controls select,.dre-controls button{height:42px;border-radius:13px;border:1px solid #334155;background:#0f172a;color:#e5e7eb;padding:0 12px;font-weight:800;color-scheme:dark}.dre-controls button{cursor:pointer}.dre-controls button.primary{background:linear-gradient(135deg,#166534,#22c55e);color:#052e16;border:0}.dre-controls button:disabled{opacity:.5;cursor:not-allowed}.dre-tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}.dre-tab{border:1px solid var(--line);background:#0f172a;color:#cbd5e1;border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:900}.dre-tab.active{background:#166534;color:#fff;border-color:#22c55e}
      .dre-status{display:none;margin:0 0 14px;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:rgba(15,23,42,.72);color:var(--muted)}.dre-status.show{display:block}.dre-status strong{color:var(--text)}
      .dre-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.dre-card{padding:15px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(15,23,42,.8),rgba(2,6,23,.58))}.dre-card span{display:block;color:var(--muted);font-size:12px;font-weight:800;text-transform:uppercase}.dre-card strong{display:block;margin-top:8px;font-size:20px;letter-spacing:-.03em}.dre-card.positive strong{color:#86efac}.dre-card.negative strong{color:#fca5a5}
      .dre-report{border:1px solid var(--line);border-radius:24px;overflow:hidden;background:#fff;color:#111827}.dre-report-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 20px;background:linear-gradient(135deg,#052e16,#166534);color:#fff}.dre-report-head h3{margin:0;font-size:20px}.dre-report-head p{margin:4px 0 0;color:#dcfce7;font-size:12px}.dre-table-wrap{overflow:auto;background:#fff}.dre-table{width:100%;border-collapse:collapse;font-size:12px;min-width:1180px}.dre-table th{background:#b7e3c6;color:#052e16;text-align:center;font-weight:900;padding:10px;border:1px solid #b7cfc0}.dre-table td{padding:9px 10px;border:1px solid #d1d5db;text-align:right;white-space:nowrap}.dre-table td:first-child{text-align:left;font-weight:900;color:#111827}.dre-table tr:nth-child(even) td{background:#f0fdf4}.dre-table tr.highlight td{background:#dcfce7!important;font-weight:900}.dre-table tr.result td{background:#bbf7d0!important;font-weight:900}.dre-table .neg{color:#dc2626}.dre-extra{display:grid;gap:12px;padding:14px;background:#fff}.dre-extra-box{border:1px solid #d1d5db;border-radius:16px;overflow:hidden}.dre-extra-box h4{margin:0;padding:10px 12px;background:#b7e3c6;color:#052e16}.dre-extra-box table{width:100%;border-collapse:collapse;font-size:12px}.dre-extra-box td,.dre-extra-box th{border:1px solid #d1d5db;padding:8px;text-align:right}.dre-extra-box td:first-child,.dre-extra-box th:first-child{text-align:left;font-weight:800}
      @media(max-width:1000px){.dre-hero{grid-template-columns:1fr}.dre-controls{justify-content:flex-start}.dre-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.dre-cards{grid-template-columns:1fr}}
    </style>`;

  const state = { tab:'geral', year:new Date().getFullYear(), regional:'', data:null, reports:[], busy:false };

  function norm(s){return String(s??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'');}
  function mapReg(s){const raw=String(s??'').trim(); return ALIASES[norm(raw)] || raw;}
  function isIgnored(r){return IGNORED.some(x=>norm(x)===norm(r));}
  function isExcluded(r){return INDIVIDUAL_EXCLUDED.some(x=>norm(x)===norm(r));}
  function isPool(r){return POOL.some(x=>norm(x)===norm(r));}
  function n(v){ if(v==null||v==='') return 0; if(typeof v==='number') return Number.isFinite(v)?v:0; const s=String(v).replace(/[^\d,.-]/g,''); const out=s.includes(',')&&s.includes('.')?s.replace(/\./g,'').replace(',','.'):s.replace(',','.'); const num=parseFloat(out); return Number.isFinite(num)?num:0; }
  function monthFrom(value){ if(value instanceof Date && !isNaN(value)) return {month:value.getMonth(), year:value.getFullYear()}; if(typeof value==='number'){ const d=new Date(Math.round((value-25569)*86400*1000)); if(!isNaN(d)) return {month:d.getUTCMonth(),year:d.getUTCFullYear()}; } const raw=String(value??'').trim(); let m=raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); if(m) return {month:+m[2]-1,year:+m[3]}; m=raw.match(/^(\d{1,2})[\/\-.](\d{4})$/); if(m) return {month:+m[1]-1,year:+m[2]}; const map={JAN:0,FEV:1,FEB:1,MAR:2,ABR:3,APR:3,MAI:4,MAY:4,JUN:5,JUL:6,AGO:7,AUG:7,SET:8,SEP:8,OUT:9,OCT:9,NOV:10,DEZ:11,DEC:11}; m=raw.match(/^([A-Za-zÀ-ÿ]{3,})[\/\-. ]?(\d{4})?$/); if(m){const mo=map[norm(m[1]).slice(0,3)]; if(mo!=null) return {month:mo,year:m[2]?+m[2]:state.year};} const d=new Date(raw); return isNaN(d)?null:{month:d.getMonth(),year:d.getFullYear()}; }
  function fmtMoney(v){return (n(v)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});} function fmtNum(v){return (n(v)).toLocaleString('pt-BR',{maximumFractionDigits:2});} function fmtPct(v){return (n(v)).toLocaleString('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});}
  function safe(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

  async function loadScript(src, globalName){ if(window[globalName]) return window[globalName]; await new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);}); return window[globalName]; }
  async function loadXlsx(){return loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX');}
  async function loadHtml2Canvas(){return loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','html2canvas');}
  async function loadJsPdf(){await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js','jspdf'); return window.jspdf.jsPDF;}

  async function getLatestReports(supabase){
    const {data,error}=await supabase.from('relatorios_importacoes').select('*').order('created_at',{ascending:false}).limit(80);
    if(error) throw error;
    const wanted=['despesas','notas_fiscais','resultado','producao','patrimonios','caixa_fornecedor'];
    const chosen=[]; const seen=new Set();
    for(const r of data||[]){ const tipo=r.tipo||r.tipo_relatorio||'outros'; if(!wanted.includes(tipo)||seen.has(tipo)) continue; seen.add(tipo); chosen.push({...r,tipo}); }
    return chosen;
  }
  async function fetchStorageBuffer(supabase, bucket, path){
    const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path, 60*10);
    if(error) throw error;
    const resp=await fetch(data.signedUrl);
    if(!resp.ok) throw new Error('Falha ao baixar parte do arquivo: '+path);
    return resp.arrayBuffer();
  }

  async function fetchReportBuffer(supabase, report){
    const bucket=report.storage_bucket;
    const storagePath=report.storage_path||report.path;
    let url=report.url;

    if(!url && bucket && storagePath){
      const {data,error}=await supabase.storage.from(bucket).createSignedUrl(storagePath, 60*10);
      if(error) throw error;
      url=data.signedUrl;
    }

    if(!url) throw new Error('Arquivo sem URL: '+(report.nome_arquivo||report.arquivo_nome_original||report.tipo));

    const isManifest=String(storagePath||url).includes('.manifest.json');
    const resp=await fetch(url);
    if(!resp.ok) throw new Error('Falha ao baixar '+(report.nome_arquivo||report.tipo));

    if(!isManifest){
      return await resp.arrayBuffer();
    }

    const manifest=await resp.json();
    if(manifest?.mode!=='chunked' || !Array.isArray(manifest.chunks) || !manifest.chunks.length){
      throw new Error('Manifesto enterprise inválido para '+(report.nome_arquivo||report.tipo));
    }

    const ordered=[...manifest.chunks].sort((a,b)=>Number(a.index||0)-Number(b.index||0));
    const buffers=[];
    let total=0;

    for(const chunk of ordered){
      const buf=await fetchStorageBuffer(supabase, manifest.bucket||bucket, chunk.path);
      buffers.push(new Uint8Array(buf));
      total+=buf.byteLength;
    }

    const merged=new Uint8Array(total);
    let offset=0;
    for(const part of buffers){
      merged.set(part, offset);
      offset+=part.byteLength;
    }

    return merged.buffer;
  }

  async function fetchWorkbook(supabase, report){
    const XLSX=await loadXlsx();
    const buf=await fetchReportBuffer(supabase, report);
    return XLSX.read(buf,{type:'array',cellDates:true});
  }
  function sheetRows(wb, preferred){ const XLSX=window.XLSX; const name=preferred.find(x=>wb.SheetNames.includes(x))||wb.SheetNames[0]; return XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:''}); }

  function add(map, reg, topic, mi, val){ if(!map[reg]) map[reg]={}; if(!map[reg][topic]) map[reg][topic]=Array(12).fill(0); map[reg][topic][mi]+=n(val); }
  function sumTopic(map, reg, topics, mi){ return topics.reduce((a,t)=>a+n(map[reg]?.[t]?.[mi]),0); }
  function sumAll(map, topics, mi){ return Object.keys(map).reduce((a,r)=>a+sumTopic(map,r,topics,mi),0); }
  function rateio(base, geral, reg, topics, mi){ const proprio=sumTopic(base,reg,topics,mi); if(!proprio) return 0; let totalSemPool=0; Object.keys(base).forEach(r=>{if(!isPool(r)) totalSemPool+=sumTopic(base,r,topics,mi);}); if(!totalSemPool) return 0; let pool=topics.reduce((a,t)=>a+n(geral[t]?.[mi]),0); Object.keys(base).forEach(r=>{if(isPool(r)) pool+=sumTopic(base,r,topics,mi);}); return pool ? (proprio/totalSemPool)*pool : 0; }

  function parseDespesas(rows){
    const base={}, geral={}, regionais=new Set(); if(rows.length<3) return {base,geral,regionais};
    const headerDatas=rows[0], headerTipos=rows[1], dateFF=[]; let last=null;
    headerDatas.forEach((cell,i)=>{const d=monthFrom(cell); if(d) last=d; dateFF[i]=last;});
    const cols=[]; for(let c=1;c<headerTipos.length;c++){const tipo=String(headerTipos[c]||'').trim(); const d=dateFF[c]; if(!tipo||!d||/TOTAL/i.test(tipo)||/IMPOSTOS PARCELADOS/i.test(tipo)) continue; cols.push({c,tipo,mi:d.month,year:d.year});}
    rows.slice(2).forEach(row=>{let reg=mapReg(row[0]); if(!reg||/TOTAL/i.test(reg)||isIgnored(reg)) return; const isG=norm(reg)==='GERAL'; if(!isG&&!isExcluded(reg)) regionais.add(reg); cols.forEach(col=>{ if(col.year!==state.year) return; if(isG) { if(!geral[col.tipo]) geral[col.tipo]=Array(12).fill(0); geral[col.tipo][col.mi]+=n(row[col.c]); } else add(base,reg,col.tipo,col.mi,row[col.c]); });});
    return {base,geral,regionais};
  }
  function headerIndex(header, aliases){ for(let i=0;i<header.length;i++){const h=norm(header[i]); if(aliases.some(a=>h===norm(a))) return i;} return -1; }
  function parseNF(rows){
    const out={bruto:{},descAcresc:{},impostos:{}}; if(rows.length<2) return out; const h=rows[0];
    const iReg=headerIndex(h,['COORDENAÇÃO','COORDENACAO','REGIONAL']); const iData=headerIndex(h,['DATA N.F.','DATA DA NF','DATA NF','DATA NOTA','DATA']);
    const iBruto=headerIndex(h,['VALOR BRUTO','VALOR BRUTO DA NF','VALOR BRUTO NF','VALOR DA NF','VALOR NF','VALOR']);
    const iDesc=headerIndex(h,['DESCONTO','DESCONTOS']); const iAcr=headerIndex(h,['ACRÉSCIMO','ACRESCIMO','ACRÉSCIMOS','ACRESCIMOS']); const iImp=headerIndex(h,['IMPOSTO','IMPOSTOS']);
    rows.slice(1).forEach(row=>{let reg=mapReg(row[iReg]); const d=monthFrom(row[iData]); if(!reg||!d||d.year!==state.year||isIgnored(reg)) return; if(!out.bruto[reg]){out.bruto[reg]=Array(12).fill(0);out.descAcresc[reg]=Array(12).fill(0);out.impostos[reg]=Array(12).fill(0);} out.bruto[reg][d.month]+=n(row[iBruto]); out.descAcresc[reg][d.month]+=n(iAcr>-1?row[iAcr]:0)-n(iDesc>-1?row[iDesc]:0); out.impostos[reg][d.month]+=n(iImp>-1?row[iImp]:0); });
    return out;
  }
  function parseProducao(rows){
    const out={emb:{},classif:{}}; if(rows.length<2) return out; const h=rows[0];
    const iReg=headerIndex(h,['COORDENAÇÃO','COORDENACAO','REGIONAL']); const iData=headerIndex(h,['DATA']);
    const iEmb=headerIndex(h,['TOTAL EMBARCADO','VOLUME EMBARCADO','EMBARCADO','TONS EMBARCADAS','TONS EMBARCADOS']); const iClass=headerIndex(h,['TONS CLASSIFICADAS D1','TONS CLASSIFICADAS','VOLUME CLASSIFICADO SEM CADENCIA','VOLUME CLASSIFICADO']);
    rows.slice(1).forEach(row=>{let reg=mapReg(row[iReg]); const d=monthFrom(row[iData]); if(!reg||!d||d.year!==state.year||isIgnored(reg)||norm(reg)==='GERAL') return; if(!out.emb[reg]){out.emb[reg]=Array(12).fill(0);out.classif[reg]=Array(12).fill(0);} out.emb[reg][d.month]+=n(row[iEmb]); if(iClass>-1) out.classif[reg][d.month]+=n(row[iClass]); });
    return out;
  }
  function parseAntecipacoes(rows){ const out=Array(12).fill(0); if(rows.length<2) return out; const h=rows[0]; const iData=headerIndex(h,['DATA','DATA DA NF','DATA EMISSÃO']); const iCred=headerIndex(h,['CREDITO','CRÉDITO']); rows.slice(1).forEach(r=>{const d=monthFrom(r[iData]); if(d&&d.year===state.year) out[d.month]+=n(r[iCred]);}); return out; }

  function sumMap(maps, mi){return Object.values(maps||{}).reduce((a,arr)=>a+n(arr?.[mi]),0);}
  function buildDRE(){
    const reports=state.reportsData||{}; const base=reports.despesas?.base||{}, geral=reports.despesas?.geral||{}, nf=reports.nf||{}, prod=reports.producao||{}, antecip=reports.antecipacoes||Array(12).fill(0);
    const regionais=new Set([...(reports.despesas?.regionais||[]), ...Object.keys(nf.bruto||{}), ...Object.keys(prod.emb||{})]);
    [...regionais].forEach(r=>{ if(isExcluded(r)||isIgnored(r)||norm(r)==='GERAL') regionais.delete(r); });
    const rowsGeral=calcGeral(base,geral,nf,prod,antecip); const rowsRegional={}; [...regionais].sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(r=>rowsRegional[r]=calcRegional(r,base,geral,nf,prod));
    state.data={rowsGeral, rowsRegional, regionais:[...regionais].sort((a,b)=>a.localeCompare(b,'pt-BR'))}; if(!state.regional && state.data.regionais.length) state.regional=state.data.regionais[0];
  }
  function total(row){return row.values.reduce((a,b)=>a+n(b),0);} function pctTotal(num,den){return den?n(num)/n(den):0;}
  function row(label,values){return {label,values,total:values.reduce((a,b)=>a+n(b),0)};}
  function calcGeral(base,geral,nf,prod,antecip){
    const linhas=[]; const vals={}; ['notas','desc','imp','rec','despOp','veic','pessoal','lb','adm','ebtida','fin','ll','emp','antecip','inv','res','mb','me'].forEach(k=>vals[k]=Array(12).fill(0));
    for(let mi=0;mi<12;mi++){
      vals.notas[mi]=sumMap(nf.bruto,mi); vals.desc[mi]=sumMap(nf.descAcresc,mi); vals.imp[mi]=sumMap(nf.impostos,mi); vals.rec[mi]=vals.notas[mi]+vals.desc[mi]-vals.imp[mi];
      vals.despOp[mi]=sumAll(base,['DESPESAS OPERACIONAIS'],mi)+n(geral['DESPESAS OPERACIONAIS']?.[mi]);
      vals.veic[mi]=sumAll(base,['COMBUSTIVEIS E LUBRIFICANTES','DESPESAS COM VEICULOS'],mi)+n(geral['COMBUSTIVEIS E LUBRIFICANTES']?.[mi])+n(geral['DESPESAS COM VEICULOS']?.[mi]);
      vals.pessoal[mi]=sumAll(base,['DESPESAS RH','FOLHA DE PAGAMENTO','IMPOSTOS SOBRE FOLHA'],mi)+n(geral['DESPESAS RH']?.[mi])+n(geral['FOLHA DE PAGAMENTO']?.[mi])+n(geral['IMPOSTOS SOBRE FOLHA']?.[mi]);
      vals.lb[mi]=vals.rec[mi]-vals.despOp[mi]-vals.veic[mi]-vals.pessoal[mi];
      vals.adm[mi]=sumAll(base,['DESPESAS ADMINISTRATIVAS','DESPESAS COMERCIAIS'],mi)+n(geral['DESPESAS ADMINISTRATIVAS']?.[mi])+n(geral['DESPESAS COMERCIAIS']?.[mi]);
      vals.ebtida[mi]=vals.lb[mi]-vals.adm[mi];
      const retirada=sumAll(base,['RETIRADA SÓCIOS','RETIRADA SOCIOS'],mi)+n(geral['RETIRADA SÓCIOS']?.[mi])+n(geral['RETIRADA SOCIOS']?.[mi]);
      vals.fin[mi]=sumAll(base,['DESPESAS FINANCEIRAS'],mi)+n(geral['DESPESAS FINANCEIRAS']?.[mi])+retirada;
      vals.ll[mi]=vals.ebtida[mi]-vals.fin[mi]; vals.emp[mi]=sumAll(base,['EMPRESTIMOS TERCEIROS'],mi)+n(geral['EMPRESTIMOS TERCEIROS']?.[mi]); vals.antecip[mi]=n(antecip[mi]); vals.inv[mi]=sumAll(base,['PATRIMONIO'],mi)+n(geral['PATRIMONIO']?.[mi]); vals.res[mi]=vals.ll[mi]-vals.emp[mi]-vals.antecip[mi]-vals.inv[mi]; vals.mb[mi]=pctTotal(vals.lb[mi],vals.rec[mi]); vals.me[mi]=pctTotal(vals.ebtida[mi],vals.rec[mi]);
    }
    [['NOTAS FISCAIS','notas'],['DESCONTOS CONCEDIDOS+ACRÉSCIMOS','desc'],['TOTAL DE IMPOSTOS','imp'],['RECEITA LÍQUIDA','rec'],['TOTAL DE DESPESAS OPERACIONAIS','despOp'],['DESP COM VEICULOS+COMBUSTIVEIS','veic'],['TOTAL DESPESAS PESSOAL','pessoal'],['LUCRO BRUTO','lb'],['DESP ADM + COMERCIAL','adm'],['LUCRO OPERACIONAL (EBTIDA)','ebtida'],['DESPESAS FINANCEIRAS','fin'],['LUCRO LÍQUIDO','ll'],['EMPRESTIMOS TERCEIROS','emp'],['ANTECIPAÇÕES A FORNECEDORES','antecip'],['INVESTIMENTOS','inv'],['RESULTADO FINAL','res'],['MARGEM BRUTA','mb'],['MARGEM EBTIDA','me']].forEach(([l,k])=>linhas.push(row(l,vals[k])));
    return {main:linhas, extras:extrasFor(null, vals, prod)};
  }
  function calcRegional(reg,base,geral,nf,prod){
    const linhas=[]; const vals={}; ['notas','desc','imp','rec','despOp','veic','pessoal','lb','adm','ebtida','fin','ll','inv','res','mb','me'].forEach(k=>vals[k]=Array(12).fill(0));
    for(let mi=0;mi<12;mi++){
      vals.notas[mi]=n(nf.bruto?.[reg]?.[mi]); vals.desc[mi]=n(nf.descAcresc?.[reg]?.[mi]); vals.imp[mi]=n(nf.impostos?.[reg]?.[mi]); vals.rec[mi]=vals.notas[mi]+vals.desc[mi]-vals.imp[mi];
      vals.despOp[mi]=sumTopic(base,reg,['DESPESAS OPERACIONAIS'],mi)+rateio(base,geral,reg,['DESPESAS OPERACIONAIS'],mi);
      vals.veic[mi]=sumTopic(base,reg,['COMBUSTIVEIS E LUBRIFICANTES','DESPESAS COM VEICULOS'],mi)+rateio(base,geral,reg,['COMBUSTIVEIS E LUBRIFICANTES','DESPESAS COM VEICULOS'],mi);
      vals.pessoal[mi]=sumTopic(base,reg,['DESPESAS RH','FOLHA DE PAGAMENTO','IMPOSTOS SOBRE FOLHA'],mi)+rateio(base,geral,reg,['DESPESAS RH','FOLHA DE PAGAMENTO','IMPOSTOS SOBRE FOLHA'],mi);
      vals.lb[mi]=vals.rec[mi]-vals.despOp[mi]-vals.veic[mi]-vals.pessoal[mi]; vals.adm[mi]=sumTopic(base,reg,['DESPESAS ADMINISTRATIVAS','DESPESAS COMERCIAIS'],mi)+rateio(base,geral,reg,['DESPESAS ADMINISTRATIVAS','DESPESAS COMERCIAIS'],mi); vals.ebtida[mi]=vals.lb[mi]-vals.adm[mi]; vals.fin[mi]=rateio(base,geral,reg,['DESPESAS FINANCEIRAS'],mi); vals.ll[mi]=vals.ebtida[mi]-vals.fin[mi]; vals.inv[mi]=sumTopic(base,reg,['PATRIMONIO'],mi)+rateio(base,geral,reg,['PATRIMONIO'],mi); vals.res[mi]=vals.ll[mi]-vals.inv[mi]; vals.mb[mi]=pctTotal(vals.lb[mi],vals.rec[mi]); vals.me[mi]=pctTotal(vals.ebtida[mi],vals.rec[mi]);
    }
    [['NOTAS FISCAIS','notas'],['DESCONTOS CONCEDIDOS+ACRÉSCIMOS','desc'],['TOTAL DE IMPOSTOS','imp'],['RECEITA LÍQUIDA','rec'],['TOTAL DE DESPESAS OPERACIONAIS','despOp'],['DESP COM VEICULOS+COMBUSTIVEIS','veic'],['TOTAL DESPESAS PESSOAL','pessoal'],['LUCRO BRUTO','lb'],['DESP ADM + COMERCIAL','adm'],['LUCRO OPERACIONAL (EBTIDA)','ebtida'],['DESPESAS FINANCEIRAS','fin'],['LUCRO LÍQUIDO','ll'],['INVESTIMENTOS','inv'],['RESULTADO FINAL','res'],['MARGEM BRUTA','mb'],['MARGEM EBTIDA','me']].forEach(([l,k])=>linhas.push(row(l,vals[k])));
    return {main:linhas, extras:extrasFor(reg, vals, prod)};
  }
  function extrasFor(reg, vals, prod){ const volEmb=Array(12).fill(0), volClass=Array(12).fill(0), cptEmb=Array(12).fill(0), cptClass=Array(12).fill(0), totalDesp=Array(12).fill(0); for(let mi=0;mi<12;mi++){ volEmb[mi]=reg?n(prod.emb?.[reg]?.[mi]):sumMap(prod.emb,mi); volClass[mi]=reg?n(prod.classif?.[reg]?.[mi]):sumMap(prod.classif,mi); totalDesp[mi]=['despOp','veic','pessoal','adm','fin','inv'].reduce((a,k)=>a+n(vals[k][mi]),0); cptEmb[mi]=volEmb[mi]?totalDesp[mi]/volEmb[mi]:0; cptClass[mi]=volClass[mi]?totalDesp[mi]/volClass[mi]:0; } return {totalDesp,volEmb,volClass,cptEmb,cptClass}; }

  async function processReports(opts, setStatus){
    state.busy=true; setStatus('Buscando últimos relatórios importados...'); state.reports=await getLatestReports(opts.supabase);
    const data={despesas:null,nf:null,producao:null,antecipacoes:Array(12).fill(0)};
    for(const r of state.reports){ setStatus(`Processando ${r.nome_arquivo||r.arquivo_nome_original||r.tipo}...`); const wb=await fetchWorkbook(opts.supabase,r); const rows=sheetRows(wb, r.tipo==='despesas'?['Despesas por Regional','Despesas','DESPESAS']:r.tipo==='notas_fiscais'?['Faturamento','Notas Fiscais']:r.tipo==='producao'||r.tipo==='resultado'?['Resultado Diario','Resultado Diário','Producao','Produção']:['Antecipações']); if(r.tipo==='despesas') data.despesas=parseDespesas(rows); if(r.tipo==='notas_fiscais') data.nf=parseNF(rows); if(r.tipo==='producao'||r.tipo==='resultado') data.producao=parseProducao(rows); if(r.tipo==='caixa_fornecedor') data.antecipacoes=parseAntecipacoes(rows); }
    state.reportsData=data; buildDRE(); state.busy=false;
  }

  function renderTable(report){ if(!report) return '<div class="dre-status show">Sem dados para exibir.</div>'; const rows=report.main; return `<div class="dre-table-wrap"><table class="dre-table"><thead><tr><th></th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL</th></tr></thead><tbody>${rows.map(r=>{const cls=['RECEITA LÍQUIDA','LUCRO BRUTO','LUCRO OPERACIONAL (EBTIDA)','LUCRO LÍQUIDO','MARGEM BRUTA','MARGEM EBTIDA'].includes(r.label)?'highlight':r.label==='RESULTADO FINAL'?'result':''; const totalVal=PERCENT_ROWS.has(r.label)?(total(rows.find(x=>x.label==='RECEITA LÍQUIDA')||{values:[]})? (r.label==='MARGEM BRUTA'? total(rows.find(x=>x.label==='LUCRO BRUTO'))/total(rows.find(x=>x.label==='RECEITA LÍQUIDA')) : total(rows.find(x=>x.label==='LUCRO OPERACIONAL (EBTIDA)'))/total(rows.find(x=>x.label==='RECEITA LÍQUIDA'))) : 0):r.total; return `<tr class="${cls}"><td>${safe(r.label)}</td>${r.values.map(v=>cell(r.label,v)).join('')}${cell(r.label,totalVal)}</tr>`}).join('')}</tbody></table></div>${renderExtras(report.extras)}`; }
  function cell(label,v){ const neg=n(v)<0?' class="neg"':''; const txt=PERCENT_ROWS.has(label)?fmtPct(v):MONEY_ROWS.has(label)?fmtMoney(v):fmtNum(v); return `<td${neg}>${txt}</td>`; }
  function renderExtras(ex){ if(!ex) return ''; const rows=[['Total Despesas',ex.totalDesp,'money'],['Volume Classificado (sem cadência)',ex.volClass,'num'],['Custo por tonelada - classificado',ex.cptClass,'money'],['Volume Embarcado + NHE + cad',ex.volEmb,'num'],['Custo por tonelada - embarcado',ex.cptEmb,'money']]; return `<div class="dre-extra"><div class="dre-extra-box"><h4>CUSTO POR TONELADA</h4><table><thead><tr><th></th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL</th></tr></thead><tbody>${rows.map(([label,arr,type])=>`<tr><td>${label}</td>${arr.map(v=>`<td>${type==='money'?fmtMoney(v):fmtNum(v)}</td>`).join('')}<td>${type==='money'?fmtMoney(arr.reduce((a,b)=>a+n(b),0)):fmtNum(arr.reduce((a,b)=>a+n(b),0))}</td></tr>`).join('')}</tbody></table></div></div>`; }
  function activeReport(){return state.tab==='geral'?state.data?.rowsGeral:state.data?.rowsRegional?.[state.regional];}
  function renderReport(container){ const report=activeReport(); const title=state.tab==='geral'?'DRE Geral':`DRE Regional - ${state.regional||''}`; const rec=(report?.main||[]).find(r=>r.label==='RECEITA LÍQUIDA')?.total||0; const res=(report?.main||[]).find(r=>r.label==='RESULTADO FINAL')?.total||0; const eb=(report?.main||[]).find(r=>r.label==='LUCRO OPERACIONAL (EBTIDA)')?.total||0; const mb=rec?((report?.main||[]).find(r=>r.label==='LUCRO BRUTO')?.total||0)/rec:0; container.querySelector('#dreCards').innerHTML=`<div class="dre-card"><span>Receita Líquida</span><strong>${fmtMoney(rec)}</strong></div><div class="dre-card ${eb>=0?'positive':'negative'}"><span>EBTIDA</span><strong>${fmtMoney(eb)}</strong></div><div class="dre-card ${res>=0?'positive':'negative'}"><span>Resultado Final</span><strong>${fmtMoney(res)}</strong></div><div class="dre-card"><span>Margem Bruta</span><strong>${fmtPct(mb)}</strong></div>`; container.querySelector('#dreReport').innerHTML=`<div class="dre-report-head"><div><h3>${safe(title)}</h3><p>Ano ${state.year} · gerado pelos relatórios importados</p></div><strong>Grão 1000</strong></div>${renderTable(report)}`; const sel=container.querySelector('#regionalSelect'); sel.innerHTML=(state.data?.regionais||[]).map(r=>`<option value="${safe(r)}" ${r===state.regional?'selected':''}>${safe(r)}</option>`).join(''); sel.disabled=state.tab!=='regional'; }

  async function exportImage(){ const node=document.querySelector('#dreReport'); if(!node) return; const html2canvas=await loadHtml2Canvas(); const canvas=await html2canvas(node,{backgroundColor:'#ffffff',scale:2}); const a=document.createElement('a'); a.download=`${state.tab==='geral'?'DRE_Geral':'DRE_'+state.regional}_${state.year}.png`; a.href=canvas.toDataURL('image/png'); a.click(); }
  async function exportPdf(){ const node=document.querySelector('#dreReport'); if(!node) return; const html2canvas=await loadHtml2Canvas(); const JsPDF=await loadJsPdf(); const canvas=await html2canvas(node,{backgroundColor:'#ffffff',scale:2}); const img=canvas.toDataURL('image/png'); const pdf=new JsPDF('l','mm','a4'); const w=297, h=canvas.height*w/canvas.width; let y=0; pdf.addImage(img,'PNG',0,y,w,h); pdf.save(`${state.tab==='geral'?'DRE_Geral':'DRE_'+state.regional}_${state.year}.pdf`); }

  function openHome(container, opts={}){
    state.year=new Date().getFullYear(); state.tab='geral'; state.data=null; state.reports=[];
    container.innerHTML=`${styles}<section class="dre-wrap"><div class="dre-hero"><div><div class="dre-kicker">Diretoria · DRE</div><h2>Demonstrativo de Resultado</h2><p>DRE geral e regional calculada com base nos relatórios importados.</p></div><div class="dre-controls"><select id="yearSelect">${[state.year-1,state.year,state.year+1].map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}</option>`).join('')}</select><select id="regionalSelect" disabled></select><button id="refreshDre" class="primary">Processar DRE</button><button id="exportPdf" disabled>PDF</button><button id="exportImg" disabled>Imagem</button></div></div><div class="dre-tabs"><button class="dre-tab active" data-tab="geral">DRE Geral</button><button class="dre-tab" data-tab="regional">DRE Regional</button></div><div class="dre-status show" id="dreStatus"><strong>Aguardando processamento.</strong> Clique em Processar DRE para carregar os últimos relatórios importados.</div><div id="dreCards" class="dre-cards"></div><article class="dre-report" id="dreReport"><div class="dre-report-head"><div><h3>DRE</h3><p>Sem dados processados.</p></div></div></article></section>`;
    const status=container.querySelector('#dreStatus'); const setStatus=(txt)=>{status.classList.add('show');status.innerHTML=txt.includes('<')?txt:`<strong>Status:</strong> ${safe(txt)}`;};
    container.querySelector('#yearSelect').addEventListener('change',e=>{state.year=Number(e.target.value)||state.year;});
    container.querySelector('#regionalSelect').addEventListener('change',e=>{state.regional=e.target.value; renderReport(container);});
    container.querySelectorAll('.dre-tab').forEach(btn=>btn.addEventListener('click',()=>{state.tab=btn.dataset.tab; container.querySelectorAll('.dre-tab').forEach(b=>b.classList.toggle('active',b===btn)); if(state.data) renderReport(container);}));
    container.querySelector('#refreshDre').addEventListener('click',async()=>{try{container.querySelector('#refreshDre').disabled=true; await processReports(opts,setStatus); status.classList.remove('show'); container.querySelector('#exportPdf').disabled=false; container.querySelector('#exportImg').disabled=false; renderReport(container);}catch(err){console.error(err);setStatus(`<strong>Erro:</strong> ${safe(err?.message||'Falha ao processar DRE.')}`);}finally{container.querySelector('#refreshDre').disabled=false;}});
    container.querySelector('#exportPdf').addEventListener('click',exportPdf); container.querySelector('#exportImg').addEventListener('click',exportImage);
  }
  window.DRE={openHome};
})();
