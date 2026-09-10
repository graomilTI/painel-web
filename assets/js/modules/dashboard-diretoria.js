import { DIRECTOR_MAP_STATES, DIRECTOR_MAP_COORDS } from '../dashboardDiretoriaMap.js';

const DASHBOARD_DIRETORIA_STYLE_ID = 'dashboard-diretoria-style';
const DASHBOARD_DIRETORIA_VIEW_CACHE = 'dashboard-diretoria:view:v3';
if (!document.getElementById(DASHBOARD_DIRETORIA_STYLE_ID)) {
  const stylesheet = document.createElement('link');
  stylesheet.id = DASHBOARD_DIRETORIA_STYLE_ID;
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../../css/dashboard-diretoria.css?v=20260909-5', import.meta.url).href;
  document.head.appendChild(stylesheet);
}

(function () {
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const EXCLUDED = new Set(['GERAL','AGROTRADER','LOG1000','PARAGUAI']);
  const METRICS = [
    { key:'tons', label:'Produção', sub:'Toneladas classificadas', format:'tons', color:'var(--dir-lime)' },
    { key:'services', label:'Serviços realizados', sub:'Cargas classificadas', format:'count', color:'var(--dir-green)' },
    { key:'invoices', label:'Notas emitidas', sub:'Documentos emitidos', format:'count', color:'var(--dir-blue)' },
    { key:'billed', label:'Faturamento emitido', sub:'Valor total das notas', format:'money', color:'var(--dir-cyan)' },
    { key:'received', label:'Valores recebidos', sub:'Pela data do recebimento', format:'money', color:'var(--dir-gold)' },
    { key:'costs', label:'Custos totais', sub:'Pela competência da despesa', format:'money', color:'var(--dir-red)' }
  ];
  const DIMENSIONS = [
    ['coord','Coordenação'],['sup','Supervisão'],['collab','Colaborador'],['client','Cliente']
  ];
  const state = {
    container:null, supabase:null, loading:true, error:'', year:null, selectedMonths:new Set(),
    available:[], cache:new Map(), snapshotCache:new Map(), filters:{coord:'',sup:'',collab:'',client:''},
    mode:'sum', compareBy:'month', view:'charts', rankMetric:'billed', rankLimit:10,
    mapMetric:'tons', mapFocus:'BR', bubbleSize:24, detail:null, lastUpdated:null
  };
  const charts = { daily:null, finance:null };
  const attached = new WeakSet();

  const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const safe = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const norm = (v) => String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,' ').trim();
  const fmtNumber = (v, digits=0) => n(v).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const fmtMoney = (v) => n(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
  const fmtTons = (v) => `${fmtNumber(v)} t`;
  const fmtPct = (v) => `${fmtNumber(v,1)}%`;
  const formatMetric = (key, value) => value == null ? '<span class="dir-na">Sem detalhamento</span>' : key === 'tons' ? fmtTons(value) : key === 'services' ? `${fmtNumber(value)} cargas` : key === 'invoices' ? `${fmtNumber(value)} notas` : fmtMoney(value);
  const monthKey = (year, month) => `${year}-${String(month).padStart(2,'0')}`;
  const bounds = (year, month) => {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const next = new Date(year, month, 1);
    return { start, end:`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01` };
  };
  const rawValue = (row, aliases) => {
    const source = row?.dados_json || row?.raw || row || {};
    const keys = Object.keys(source);
    for (const alias of aliases) {
      const expected = norm(alias);
      const key = keys.find((candidate) => norm(candidate) === expected);
      if (key && source[key] != null && String(source[key]).trim() !== '') return source[key];
    }
    return '';
  };
  const dateIso = (value) => {
    const text = String(value || '').trim();
    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${String(br[2]).padStart(2,'0')}-${String(br[1]).padStart(2,'0')}`;
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0,10) : '';
  };
  const isExcluded = (coord) => EXCLUDED.has(norm(coord));

  // Paginação em lotes paralelos SEM `count: exact`: pedir contagem exata
  // via HEAD antes de paginar parecia mais rápido, mas sob RLS (política
  // daqui usa 2 EXISTS correlacionados) o Postgres precisa avaliar a policy
  // pra cada linha pra contar — em grm_despesas_importacoes (503 mil linhas
  // na tabela toda) isso estourava o statement_timeout e virava 500,
  // derrubando a tela inteira (confirmado nos logs do Supabase: "canceling
  // statement due to statement timeout", 57014). Em vez disso, busca lotes
  // de `batchSize` páginas em paralelo e para assim que alguma página do
  // lote voltar incompleta — sem nunca precisar saber o total de antemão.
  // `orderBy` é obrigatório para paginação correta: sem ORDER BY estável o
  // Postgres não garante a mesma ordem entre requisições .range() separadas,
  // e linhas podem ficar de fora silenciosamente quando a tabela recebe
  // gravações concorrentes (como relatorio_resultado_diario, sincronizada
  // continuamente pelos agentes) — foi a causa da produção do mês aparecer
  // menor do que o total real.
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Falhas isoladas (blip passageiro de rede/edge, 500 sem relação com a
  // query em si — já vimos isso acontecer em produção) derrubavam a tela
  // inteira mesmo quando as outras 3 páginas do lote tinham vindo certas.
  // Reexecuta a mesma página até 2 vezes com um pequeno backoff antes de
  // desistir; um erro persistente (bug de verdade, tipo coluna inexistente)
  // ainda propaga normalmente depois das tentativas.
  async function fetchPageWithRetry(buildPage, page, retries=2) {
    for (let attempt=0; ; attempt+=1) {
      const result = await buildPage(page);
      if (!result.error || attempt >= retries) return result;
      await wait(300 * (attempt + 1));
    }
  }

  async function fetchAll(queryFactory, select, { pageSize=1000, maxPages=40, orderBy, batchSize=4 } = {}) {
    const orderCols = (Array.isArray(orderBy) ? orderBy : [orderBy]).filter(Boolean);
    const buildPage = (page) => {
      let q = queryFactory(select);
      orderCols.forEach((col) => { q = q.order(col, { ascending: true }); });
      return q.range(page*pageSize, (page+1)*pageSize-1);
    };
    const rows = [];
    let page = 0;
    let reachedEnd = false;
    while (!reachedEnd && page < maxPages) {
      const batchPages = [];
      for (let i=0; i<batchSize && page+i<maxPages; i+=1) batchPages.push(page+i);
      const results = await Promise.all(batchPages.map((p) => fetchPageWithRetry(buildPage, p)));
      for (const { data, error } of results) {
        if (error) throw error;
        const chunk = data || [];
        rows.push(...chunk);
        if (chunk.length < pageSize) reachedEnd = true;
      }
      page += batchPages.length;
    }
    return rows;
  }

  async function loadLatestSnapshot(table, select, period=null) {
    const cacheKey = period ? `${table}:${period.start}:${period.end}` : table;
    if (state.snapshotCache.has(cacheKey)) return state.snapshotCache.get(cacheKey);
    const promise = (async () => {
      // grm_notas_fiscais_importacoes é redirecionada (via Proxy em
      // dashboard-socio.js) para a view dashboard_socios_notas_emitidas_api,
      // que não tem coluna sincronizado_em — só created_at. Usar
      // sincronizado_em aqui quebrava essa tela inteira com erro 42703.
      const timestampColumn = table==='grm_contas_receber_importacoes' ? 'sincronizado_em' : 'created_at';
      const orderColumn = table==='grm_notas_fiscais_importacoes' ? ['created_at','numero_nf'] : 'id';
      const { data:latest, error:latestError } = await fetchPageWithRetry(
        () => state.supabase.from(table).select(timestampColumn).order(timestampColumn,{ascending:false}).limit(1)
      );
      if (latestError) throw latestError;
      const createdAt = latest?.[0]?.[timestampColumn];
      if (!createdAt) return [];
      const threshold = new Date(new Date(createdAt).getTime()-5*60*1000).toISOString();
      return fetchAll((sel, opts) => {
        let query=state.supabase.from(table).select(sel, opts).gte(timestampColumn,threshold);
        if (period && table==='grm_despesas_importacoes') query=query.gte('data_conta_de',period.start).lt('data_conta_de',period.end);
        if (period && table==='grm_contas_receber_importacoes') query=query.gte('dados_json->>rinPaidDate',period.start).lt('dados_json->>rinPaidDate',period.end);
        return query;
      }, select, { orderBy: orderColumn });
    })();
    state.snapshotCache.set(cacheKey,promise);
    return promise;
  }

  function normalizeProduction(row, year, month) {
    return { year,month,date:String(row.data||''),coord:String(row.coordenacao||'').trim(),sup:String(row.supervisao||'').trim(),collab:String(row.funcionario||'').trim(),client:String(row.cliente_nacional||row.cliente_final||'').trim(),tons:n(row.toneladas),services:n(row.cargas) };
  }
  function normalizeExpenses(row, year, month) {
    const base={year,month,coord:String(row.coordenacao||rawValue(row,['Coordenação','Coordenacao'])||'').trim(),sup:String(row.supervisao||'').trim(),collab:String(row.funcionario||'').trim(),client:''};
    const ignored=new Set(['COORDENACAO','TOTAL','DATA CONTA DE','DATA CONTA ATE','DATA','SUPERVISAO','FUNCIONARIO']);
    const categories=Object.entries(row.dados_json||{}).filter(([key,value])=>!ignored.has(norm(key))&&n(value)!==0).map(([category,value])=>({...base,category:String(category).trim(),costs:n(value)}));
    if(categories.length)return categories;
    return [{...base,category:String(row.categoria||row.grupo_categoria||'Sem categoria').trim()||'Sem categoria',costs:n(row.valor)}];
  }
  function normalizeNote(row, year, month) {
    const noteDate = dateIso(row.data_nota_real || rawValue(row,['Data N.F.','Data NF','Data da Fatura']));
    return { year,month,date:noteDate,coord:String(rawValue(row,['Coordenação','Coordenacao'])||'').trim(),sup:'',collab:'',client:String(row.cliente_nacional||rawValue(row,['Cliente Nacional','Cliente'])||'').trim(),number:String(row.numero_nf||rawValue(row,['Número NF','N.F.'])||'').trim(),invoices:1,billed:n(row.valor_nota_real ?? row.valor_total ?? rawValue(row,['Valor da N.F.','Valor Total','Valor Bruto'])),createdAt:String(row.updated_at||row.created_at||'') };
  }
  function normalizeReceipt(row, year, month, notesByNumber) {
    const number=String(row.numero_nf||rawValue(row,['biiNumber','Número NF','N.F.'])||'').trim();
    const note = notesByNumber.get(norm(number));
    return { year,month,date:dateIso(row.recebimento||rawValue(row,['rinPaidDate','Recebimento'])),coord:note?.coord||'',sup:'',collab:'',client:String(row.cliente||rawValue(row,['cliName','Cliente'])||note?.client||'').trim(),number,received:n(row.valor_pago??rawValue(row,['rinTotalValue','Valor Pago'])) };
  }

  async function loadMonth(year, month) {
    const key = monthKey(year,month);
    if (state.cache.has(key)) return state.cache.get(key);
    const promise = (async () => {
      const { start,end } = bounds(year,month);
      const [productionRows, expenseSnapshot, noteSnapshot, receiptRows, metaResult] = await Promise.all([
        fetchAll(
          (sel, opts) => state.supabase.from('relatorio_resultado_diario').select(sel, opts).gte('data',start).lt('data',end),
          'data,funcionario,coordenacao,supervisao,cliente_nacional,cliente_final,cargas,toneladas',
          { orderBy: 'id' }
        ),
        loadLatestSnapshot('grm_despesas_importacoes','data_conta_de,data_conta_ate,coordenacao,supervisao,funcionario,categoria,grupo_categoria,valor,dados_json,created_at',{start,end}),
        // dashboard_socios_notas_emitidas_api (view p/ a qual esta tabela é
        // redirecionada nesta tela) não tem updated_at nem sincronizado_em —
        // só as colunas abaixo. Pedir as outras derrubava a tela com 42703.
        loadLatestSnapshot('grm_notas_fiscais_importacoes','data_nota_real,cliente_nacional,numero_nf,valor_nota_real,valor_total,dados_json,created_at'),
        loadLatestSnapshot('grm_contas_receber_importacoes','dados_json,sincronizado_em',{start,end}),
        fetchPageWithRetry(() => state.supabase.from('metas_producao').select('regional,estado,meta_tons').eq('ano',year).eq('mes',month).eq('ativo',true))
      ]);
      if (metaResult.error) throw metaResult.error;
      const production = productionRows.map((row) => normalizeProduction(row,year,month)).filter((row) => !isExcluded(row.coord));
      const expenses = expenseSnapshot.filter((row) => String(row.data_conta_de||'').slice(0,10)>=start && String(row.data_conta_de||'').slice(0,10)<end).flatMap((row) => normalizeExpenses(row,year,month)).filter((row) => !isExcluded(row.coord));
      const dedupedNotes = new Map();
      noteSnapshot.map((row) => normalizeNote(row,year,month)).filter((row) => row.date>=start && row.date<end).forEach((row) => {
        const noteKey = norm(row.number) || `${norm(row.client)}|${row.date}|${row.invoices}`;
        if (!dedupedNotes.has(noteKey) || dedupedNotes.get(noteKey).createdAt < row.createdAt) dedupedNotes.set(noteKey,row);
      });
      const notes = [...dedupedNotes.values()].filter((row) => !isExcluded(row.coord));
      const allNotesByNumber = new Map();
      noteSnapshot.map((row) => normalizeNote(row,year,month)).forEach((row) => {
        if (!row.number) return;
        const noteKey = norm(row.number);
        if (!allNotesByNumber.has(noteKey) || allNotesByNumber.get(noteKey).createdAt < row.createdAt) allNotesByNumber.set(noteKey,row);
      });
      const receipts = receiptRows.map((row) => normalizeReceipt(row,year,month,allNotesByNumber)).filter((row) => row.date>=start&&row.date<end&&!isExcluded(row.coord));
      const metas = (metaResult.data||[]).filter((row) => !isExcluded(row.regional)).map((row) => ({coord:String(row.regional||'').trim(),uf:String(row.estado||'').trim().toUpperCase(),target:n(row.meta_tons)}));
      return { year,month,production,expenses,notes,receipts,metas };
    })();
    state.cache.set(key,promise);
    try { return await promise; } catch (error) { state.cache.delete(key); throw error; }
  }

  async function ensureMonthsLoaded() {
    state.loading = true; state.error = ''; render();
    try { await Promise.all([...state.selectedMonths].map((month) => loadMonth(state.year,month))); }
    catch (error) { state.error = error?.message || 'Falha ao carregar os indicadores.'; }
    finally { state.loading = false; render(); }
  }
  function loadedData() {
    const months = [...state.selectedMonths].sort((a,b)=>a-b);
    const packs = months.map((month) => state.cache.get(monthKey(state.year,month))).filter(Boolean);
    return Promise.all(packs);
  }

  function supports(type, dimension) {
    if (!dimension || dimension === 'month') return true;
    const support = { production:['coord','sup','collab','client'], expenses:['coord','sup','collab'], notes:['coord','client'], receipts:['coord','client'] };
    return support[type].includes(dimension);
  }
  function matchesFilters(row, type, ignored='') {
    return Object.entries(state.filters).every(([key,value]) => !value || key===ignored || (supports(type,key) && norm(row[key])===norm(value)));
  }
  function filtered(data, ignored='') {
    return {
      production:data.production.filter((row)=>matchesFilters(row,'production',ignored)),
      expenses:data.expenses.filter((row)=>matchesFilters(row,'expenses',ignored)),
      notes:data.notes.filter((row)=>matchesFilters(row,'notes',ignored)),
      receipts:data.receipts.filter((row)=>matchesFilters(row,'receipts',ignored)),
      metas:data.metas.filter((row)=>!state.filters.coord || ignored==='coord' || norm(row.coord)===norm(state.filters.coord))
    };
  }
  function metricAvailability(type, ignored='') {
    const compareDimension = state.mode==='compare' ? state.compareBy.replace('month_','').replace('both','coord') : '';
    const needed = Object.entries(state.filters).filter(([key,value])=>value&&key!==ignored).map(([key])=>key);
    if (compareDimension && compareDimension!=='month') needed.push(compareDimension);
    return needed.every((dimension)=>supports(type,dimension));
  }
  function metrics(data, ignored='') {
    const rows = filtered(data,ignored);
    return {
      tons:metricAvailability('production',ignored)?rows.production.reduce((sum,row)=>sum+row.tons,0):null,
      services:metricAvailability('production',ignored)?rows.production.reduce((sum,row)=>sum+row.services,0):null,
      invoices:metricAvailability('notes',ignored)?rows.notes.reduce((sum,row)=>sum+row.invoices,0):null,
      received:metricAvailability('receipts',ignored)?rows.receipts.reduce((sum,row)=>sum+row.received,0):null,
      costs:metricAvailability('expenses',ignored)?rows.expenses.reduce((sum,row)=>sum+row.costs,0):null
    };
  }
  function mergePacks(packs) {
    return packs.reduce((all,pack) => { for (const key of ['production','expenses','notes','receipts','metas']) all[key].push(...pack[key]); return all; },{production:[],expenses:[],notes:[],receipts:[],metas:[]});
  }
  function valuesForMetric(data,key) {
    const totals = metrics(data);
    return totals[key];
  }

  function optionValues(data,key) {
    const values = new Set();
    const sources = key==='client' ? [...data.production,...data.notes,...data.receipts] : key==='collab' ? [...data.production,...data.expenses] : [...data.production,...data.expenses,...data.notes,...data.receipts];
    sources.forEach((row)=>{ if (row[key]) values.add(row[key]); });
    return [...values].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  }
  function renderFilterOptions(data) {
    return DIMENSIONS.map(([key,label]) => `<label class="dir-field">${label}<select class="dir-select" data-filter="${key}"><option value="">Todos</option>${optionValues(data,key).map((value)=>`<option value="${safe(value)}" ${norm(state.filters[key])===norm(value)?'selected':''}>${safe(value)}</option>`).join('')}</select></label>`).join('');
  }
  function activeFilterSummary() {
    const values = Object.values(state.filters).filter(Boolean);
    return values.length ? `${values.map(safe).join(' / ')} <button class="dir-clear" data-clear-filters>Limpar filtros</button>` : 'Toda a empresa';
  }

  function rankGroups(data,dimension,metricKey) {
    const type = metricKey==='costs'?'expenses':metricKey==='invoices'?'notes':metricKey==='received'?'receipts':'production';
    if (!supports(type,dimension)) return [];
    const source = filtered(data,dimension)[type];
    const map = new Map();
    source.forEach((row)=>{ const name=row[dimension]; if (!name) return; const value=n(row[metricKey]); map.set(name,(map.get(name)||0)+value); });
    return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  }
  function rankRows(items,metricKey,dimension,limit=state.rankLimit) {
    if (!items.length) return '<div class="dir-empty">Sem valores detalhados para esta combinação.</div>';
    const total=items.reduce((sum,item)=>sum+item.value,0),max=Math.max(...items.map((item)=>item.value),1),shown=items.slice(0,limit),rest=items.slice(limit);
    return `${shown.map((item,index)=>`<button class="dir-rank-row" data-rank-filter="${dimension}" data-rank-value="${safe(item.name)}" type="button"><span class="dir-rank-label"><span class="dir-rank-name"><span class="dir-rank-index">${index+1}</span>${safe(item.name)}</span><strong>${formatMetric(metricKey,item.value)}</strong></span><span class="dir-rank-meter"><span class="dir-meter"><span class="dir-meter-fill" style="width:${Math.max(item.value/max*100,1)}%"></span></span><span class="dir-rank-pct">${fmtPct(total?item.value/total*100:0)}</span></span></button>`).join('')}${rest.length?`<div class="dir-rank-rest">Outros ${rest.length}: ${formatMetric(metricKey,rest.reduce((sum,item)=>sum+item.value,0))}</div>`:''}`;
  }
  function expenseGroups(data) {
    const map=new Map(); filtered(data)["expenses"].forEach((row)=>map.set(row.category,(map.get(row.category)||0)+row.costs));
    return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  }

  function renderRankings(data) {
    const metric=state.rankMetric;
    return `<section class="dir-section"><div class="dir-section-head"><div><h3>Participação nos resultados</h3><p>Escala ordenada com valor e participação no total filtrado</p></div><div class="dir-controls"><label class="dir-field">Indicador<select class="dir-select" data-rank-metric><option value="services" ${metric==='services'?'selected':''}>Serviços realizados</option><option value="invoices" ${metric==='invoices'?'selected':''}>Notas emitidas</option><option value="received" ${metric==='received'?'selected':''}>Valores recebidos</option><option value="tons" ${metric==='tons'?'selected':''}>Produção</option></select></label><label class="dir-field">Exibir<select class="dir-select" data-rank-limit><option value="10" ${state.rankLimit===10?'selected':''}>10 maiores</option><option value="999" ${state.rankLimit===999?'selected':''}>Todos</option></select></label></div></div><div class="dir-grid-2"><article class="dir-panel"><h4>Por cliente</h4><p class="dir-panel-caption">Clique em uma barra para filtrar todo o painel</p>${rankRows(rankGroups(data,'client',metric),metric,'client')}</article><article class="dir-panel" style="--rank-color:var(--dir-blue)"><h4>Por coordenação</h4><p class="dir-panel-caption">Coordenações atuais, do maior para o menor</p>${rankRows(rankGroups(data,'coord',metric),metric,'coord')}</article></div><article class="dir-panel" style="margin-top:12px"><h4>Por tipo de despesa</h4><p class="dir-panel-caption">Categorias registradas na competência selecionada</p><div class="dir-expenses">${rankRows(expenseGroups(data),'costs','expense',Math.min(state.rankLimit,14))}</div></article></section>`;
  }

  function compareConfig() {
    const map={month:['month',false,'mês'],coord:['coord',false,'coordenação'],sup:['sup',false,'supervisão'],client:['client',false,'cliente'],collab:['collab',false,'colaborador'],month_coord:['coord',true,'coordenação e mês'],month_sup:['sup',true,'supervisão e mês'],month_client:['client',true,'cliente e mês'],month_collab:['collab',true,'colaborador e mês']};
    return map[state.compareBy]||map.month;
  }
  function comparisonGroups(data) {
    const [dimension,withMonth]=compareConfig(),groups=new Map();
    const sourceTypes=['production','expenses','notes','receipts'];
    sourceTypes.forEach((type)=>{
      if (!supports(type,dimension)) return;
      filtered(data,dimension)[type].forEach((row)=>{
        const entity=dimension==='month'?'':row[dimension]; if (dimension!=='month'&&!entity) return;
        const key=dimension==='month'?String(row.month):`${norm(entity)}${withMonth?'|'+row.month:''}`;
        if (!groups.has(key)) groups.set(key,{name:dimension==='month'?`${MONTHS[row.month-1]}/${row.year}`:`${entity}${withMonth?` · ${MONTHS[row.month-1]}/${row.year}`:''}`,dimensionValue:entity,month:row.month,data:{production:[],expenses:[],notes:[],receipts:[],metas:[]}});
        groups.get(key).data[type].push(row);
      });
    });
    data.metas.forEach((row)=>{ for (const group of groups.values()) if (dimension==='coord'&&norm(group.dimensionValue)===norm(row.coord)) group.data.metas.push(row); });
    return [...groups.values()].map((group)=>({name:group.name,values:metrics(group.data,dimension)})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  }
  function renderComparison(data) {
    const groups=comparisonGroups(data),[, ,label]=compareConfig();
    const metricCharts=METRICS.map((metric)=>{ const available=groups.filter((group)=>group.values[metric.key]!=null); const max=Math.max(...available.map((group)=>group.values[metric.key]),1); return `<div class="dir-compare-metric"><h4>${metric.label}</h4>${available.length?available.map((group)=>`<div class="dir-compare-row"><span class="dir-rank-label"><span class="dir-rank-name">${safe(group.name)}</span><strong>${formatMetric(metric.key,group.values[metric.key])}</strong></span><span class="dir-meter"><span class="dir-meter-fill" style="width:${Math.max(group.values[metric.key]/max*100,1)}%;--rank-color:${metric.color}"></span></span></div>`).join(''):'<span class="dir-na">A origem não possui este vínculo.</span>'}</div>`;}).join('');
    return `<section class="dir-section"><div class="dir-section-head"><div><h3>Comparativo por ${label}</h3><p>Valores detalhados para cada grupo selecionado</p></div></div><div class="dir-compare"><div class="dir-compare-metrics">${metricCharts}</div><div class="dir-table-scroll"><table class="dir-table"><thead><tr><th>Seleção</th>${METRICS.map((metric)=>`<th>${metric.label}</th>`).join('')}<th>Resultado</th><th>Custo/t</th></tr></thead><tbody>${groups.map((group)=>{const v=group.values,result=v.services!=null&&v.costs!=null?v.services-v.costs:null,cpt=v.costs!=null&&v.tons?v.costs/v.tons:null;return `<tr><td>${safe(group.name)}</td>${METRICS.map((metric)=>`<td>${formatMetric(metric.key,v[metric.key])}</td>`).join('')}<td class="${result==null?'':result>=0?'positive':'negative'}">${result==null?'<span class="dir-na">—</span>':fmtMoney(result)}</td><td>${cpt==null?'<span class="dir-na">—</span>':fmtMoney(cpt)}</td></tr>`;}).join('')}</tbody></table></div><p class="dir-legend-note">“Sem detalhamento” indica que a fonte original não possui vínculo direto com essa dimensão.</p></div></section>`;
  }

  function dailySeries(data) {
    const days=new Map();
    filtered(data).production.forEach((row)=>{if(row.date)days.set(row.date,(days.get(row.date)||0)+row.tons);});
    const entries=[...days.entries()].sort(([a],[b])=>a.localeCompare(b));
    return {labels:entries.map(([date])=>{const [year,month,day]=date.slice(0,10).split('-');return `${day}/${MONTHS[Number(month)-1]}/${String(year).slice(-2)}`;}),values:entries.map(([,value])=>value)};
  }
  function destroyCharts(){ for(const key of Object.keys(charts)){ if(charts[key]){charts[key].destroy();charts[key]=null;} } }
  function saveViewCache(markup) {
    try { localStorage.setItem(DASHBOARD_DIRETORIA_VIEW_CACHE,JSON.stringify({savedAt:Date.now(),markup})); } catch (_) { /* cache visual opcional */ }
  }
  function restoreViewCache(container) {
    try {
      const cached=JSON.parse(localStorage.getItem(DASHBOARD_DIRETORIA_VIEW_CACHE)||'null');
      if(!cached?.markup||Date.now()-n(cached.savedAt)>12*60*60*1000)return false;
      container.innerHTML=cached.markup;
      container.querySelector('.dir-page')?.classList.add('is-refreshing');
      return true;
    } catch (_) { return false; }
  }
  function mountCharts(data) {
    destroyCharts(); if (!window.Chart || state.view!=='charts') return;
    const daily=state.container.querySelector('#dir-daily-chart'),finance=state.container.querySelector('#dir-finance-chart'); if(!daily||!finance)return;
    const text='#9daf9f',grid='rgba(183,210,190,.10)',packs=[...state.selectedMonths].sort((a,b)=>a-b).map((month)=>({month,data:mergePacks([data].map(()=>({production:data.production.filter(r=>r.month===month),expenses:data.expenses.filter(r=>r.month===month),notes:data.notes.filter(r=>r.month===month),receipts:data.receipts.filter(r=>r.month===month),metas:data.metas})))}));
    const dailyData=dailySeries(data);
    charts.daily=new window.Chart(daily,{type:'bar',data:{labels:dailyData.labels,datasets:[{label:'Produção (t)',data:dailyData.values,backgroundColor:'rgba(72,185,121,.72)',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:text,maxRotation:0,autoSkip:true,maxTicksLimit:16}},y:{grid:{color:grid},ticks:{color:text}}}}});
    charts.finance=new window.Chart(finance,{type:'line',data:{labels:packs.map(p=>`${MONTHS[p.month-1]}/${state.year}`),datasets:[{label:'Serviços',data:packs.map(p=>metrics(p.data).services),borderColor:'#48b979',backgroundColor:'#48b979',tension:.28},{label:'Notas',data:packs.map(p=>metrics(p.data).invoices),borderColor:'#64a6d9',backgroundColor:'#64a6d9',tension:.28},{label:'Recebimentos',data:packs.map(p=>metrics(p.data).received),borderColor:'#d7a947',backgroundColor:'#d7a947',tension:.28}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:text,boxWidth:10}}},scales:{x:{grid:{display:false},ticks:{color:text}},y:{grid:{color:grid},ticks:{color:text,callback:(value)=>`R$${Math.round(value/1000)}k`}}}}});
  }
  function renderCharts(data) {
    return `<section class="dir-section"><div class="dir-section-head"><div><h3>Evolução da operação</h3><p>Produção diária e fluxo financeiro dos meses selecionados</p></div>${renderViewToggle()}</div><div class="dir-chart-grid"><article class="dir-panel"><h4>Produção por dia</h4><p class="dir-panel-caption">Toneladas classificadas em cada data do período</p><div class="dir-canvas-wrap"><canvas id="dir-daily-chart"></canvas></div></article><article class="dir-panel"><h4>Serviços, notas e recebimentos</h4><p class="dir-panel-caption">Cada série segue sua respectiva data</p><div class="dir-canvas-wrap"><canvas id="dir-finance-chart"></canvas></div></article></div></section>`;
  }
  function renderViewToggle() { return `<div class="dir-view-toggle"><button class="dir-chip ${state.view==='charts'?'is-active':''}" data-view="charts" type="button">Gráficos</button><button class="dir-chip ${state.view==='map'?'is-active':''}" data-view="map" type="button">Mapa</button></div>`; }

  function coordMapInfo(name) { const key=norm(name); return DIRECTOR_MAP_COORDS[key] || Object.entries(DIRECTOR_MAP_COORDS).find(([alias])=>key.includes(alias)||alias.includes(key))?.[1] || null; }
  function renderMap(data) {
    const groups=rankGroups(data,'coord',state.mapMetric),values=new Map(groups.map((item)=>[norm(item.name),item.value])),max=Math.max(...groups.map((item)=>item.value),1),focus=state.mapFocus;
    const viewBox=focus==='PR'?'380 535 190 135':focus==='MT'?'240 235 300 255':'210 75 550 710';
    const paths=DIRECTOR_MAP_STATES.filter((item)=>focus==='BR'||item.uf===focus).map((item)=>`<path class="dir-map-state ${groups.some((group)=>coordMapInfo(group.name)?.uf===item.uf)?'has-data':''}" d="${item.d}" data-map-state="${item.uf}"><title>${item.uf}</title></path>`).join('');
    const bubbles=groups.map((group)=>{const info=coordMapInfo(group.name);if(!info||(focus!=='BR'&&info.uf!==focus))return'';const radius=info.city?state.bubbleSize:Math.max(12,state.bubbleSize*.72),opacity=.18+.5*(group.value/max);return `<g data-rank-filter="coord" data-rank-value="${safe(group.name)}"><circle class="dir-map-bubble" cx="${info.x}" cy="${info.y}" r="${radius}" style="fill-opacity:${opacity}"><title>${safe(group.name)} · ${safe(String(formatMetric(state.mapMetric,group.value)).replace(/<[^>]+>/g,''))}</title></circle><circle class="dir-map-dot" cx="${info.x}" cy="${info.y}" r="3"></circle>${focus!=='BR'?`<text class="dir-map-label" x="${info.x}" y="${info.y-radius-7}" text-anchor="middle">${safe(group.name.replace('MATO GROSSO ','').replace(' E TERMINAIS',''))}</text>`:''}</g>`;}).join('');
    return `<section class="dir-section"><div class="dir-section-head"><div><h3>Mapa das coordenações</h3><p>Estados e sedes municipais ampliadas para facilitar a leitura</p></div>${renderViewToggle()}</div><div class="dir-map-layout"><div class="dir-map-shell"><svg class="dir-map-svg" viewBox="${viewBox}" role="img" aria-label="Mapa das coordenações atuais da empresa">${paths}${bubbles}</svg></div><aside class="dir-panel"><div class="dir-controls"><label class="dir-field">Área<select class="dir-select" data-map-focus><option value="BR" ${focus==='BR'?'selected':''}>Brasil</option><option value="PR" ${focus==='PR'?'selected':''}>Ampliar Paraná</option><option value="MT" ${focus==='MT'?'selected':''}>Ampliar Mato Grosso</option></select></label><label class="dir-field">Indicador<select class="dir-select" data-map-metric>${METRICS.map((metric)=>`<option value="${metric.key}" ${state.mapMetric===metric.key?'selected':''}>${metric.label}</option>`).join('')}</select></label><label class="dir-field">Destaque das cidades<input type="range" min="14" max="38" value="${state.bubbleSize}" data-map-size></label></div><div class="dir-map-list">${rankRows(groups,state.mapMetric,'coord',999)}</div><p class="dir-map-help">Os círculos ampliam visualmente as coordenações que são cidades. Eles indicam a sede e não representam limite territorial.</p></aside></div></section>`;
  }

  function renderKpis(data) {
    const totals=metrics(data),cards=METRICS.map((metric)=>`<button class="dir-kpi ${totals[metric.key]==null?'is-unavailable':''}" style="--kpi:${metric.color}" data-detail="${metric.key}" type="button"><span class="dir-kpi-label">${metric.label}</span><strong class="dir-kpi-value">${formatMetric(metric.key,totals[metric.key])}</strong><span class="dir-kpi-sub">${metric.sub}</span></button>`).join('');
    return `<div class="dir-kpis">${cards}</div>`;
  }
  function renderOperationalTable(data) {
    const rows=filtered(data,'coord'),coords=new Set();
    rows.production.forEach((row)=>{if(row.coord)coords.add(row.coord);});
    rows.expenses.forEach((row)=>{if(row.coord)coords.add(row.coord);});
    const values=[...coords].map((coord)=>{
      const production=rows.production.filter((row)=>norm(row.coord)===norm(coord));
      const expenses=rows.expenses.filter((row)=>norm(row.coord)===norm(coord));
      const tons=production.reduce((sum,row)=>sum+row.tons,0);
      const services=production.reduce((sum,row)=>sum+row.services,0);
      const costs=expenses.reduce((sum,row)=>sum+row.costs,0);
      return {coord,tons,services,costs,result:services-costs};
    }).sort((a,b)=>b.tons-a.tons||b.services-a.services);
    return `<section class="dir-section"><div class="dir-section-head"><div><h3>Comparação operacional por coordenação</h3><p>Produção, serviços e custos no período selecionado</p></div></div><div class="dir-table-scroll"><table class="dir-table"><thead><tr><th>Coordenação</th><th>Produção</th><th>Serviços</th><th>Custos</th><th>Resultado</th><th>Custo/t</th></tr></thead><tbody>${values.map((row)=>`<tr><td>${safe(row.coord)}</td><td>${fmtTons(row.tons)}</td><td>${fmtMoney(row.services)}</td><td>${fmtMoney(row.costs)}</td><td class="${row.result>=0?'positive':'negative'}">${fmtMoney(row.result)}</td><td>${row.tons?fmtMoney(row.costs/row.tons):'—'}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function renderDetail(data) {
    if(!state.detail)return''; const metric=METRICS.find((item)=>item.key===state.detail),groups=rankGroups(data,'coord',state.detail).slice(0,6);
    return `<div class="dir-detail"><div class="dir-detail-head"><div><h4>${metric.label}</h4><p>${metric.sub}. Maiores coordenações no filtro atual.</p></div><button class="dir-close" data-close-detail type="button">Fechar</button></div>${rankRows(groups,state.detail,'coord',6)}</div>`;
  }
  function renderToolbar() {
    const years=[...new Set(state.available.map((item)=>item.year))].sort((a,b)=>b-a),availableMonths=new Set(state.available.filter((item)=>item.year===state.year).map((item)=>item.month));
    return `<section class="dir-toolbar"><div class="dir-toolbar-top"><label class="dir-field">Ano<select class="dir-select" data-year>${years.map((year)=>`<option ${year===state.year?'selected':''}>${year}</option>`).join('')}</select></label><div class="dir-months">${MONTHS.map((month,index)=>`<button class="dir-chip ${state.selectedMonths.has(index+1)?'is-active':''}" data-month="${index+1}" type="button" ${availableMonths.has(index+1)?'':'disabled'}>${month}</button>`).join('')}</div></div><div class="dir-toolbar-bottom"><div class="dir-mode"><button class="dir-chip ${state.mode==='sum'?'is-active':''}" data-mode="sum" type="button">Somar</button><button class="dir-chip ${state.mode==='compare'?'is-active':''}" data-mode="compare" type="button">Comparar</button></div>${state.mode==='compare'?`<label class="dir-field">Comparar por<select class="dir-select" data-compare-by><option value="month" ${state.compareBy==='month'?'selected':''}>Mês</option><option value="coord" ${state.compareBy==='coord'?'selected':''}>Coordenação</option><option value="sup" ${state.compareBy==='sup'?'selected':''}>Supervisão</option><option value="client" ${state.compareBy==='client'?'selected':''}>Cliente</option><option value="collab" ${state.compareBy==='collab'?'selected':''}>Colaborador</option><option value="month_coord" ${state.compareBy==='month_coord'?'selected':''}>Coordenação e mês</option><option value="month_sup" ${state.compareBy==='month_sup'?'selected':''}>Supervisão e mês</option><option value="month_client" ${state.compareBy==='month_client'?'selected':''}>Cliente e mês</option><option value="month_collab" ${state.compareBy==='month_collab'?'selected':''}>Colaborador e mês</option></select></label>`:''}<span class="dir-toolbar-note">${state.mode==='sum'?'Os meses selecionados serão consolidados.':'Os grupos serão mostrados lado a lado.'}</span></div></section>`;
  }

  async function render() {
    const container=state.container;if(!container)return;
    if(state.loading){destroyCharts();container.innerHTML=`<div class="dir-page">${renderToolbar()}<div class="dir-loading"><span class="dir-loader"></span>Carregando indicadores reais…</div></div>`;return;}
    if(state.error){destroyCharts();container.innerHTML=`<div class="dir-page">${renderToolbar()}<div class="dir-error"><strong>Não foi possível carregar o painel.</strong><br>${safe(state.error)}</div></div>`;return;}
    const packs=await loadedData(),data=mergePacks(packs);
    container.innerHTML=`<div class="dir-page">${renderToolbar()}<div class="dir-filters">${renderFilterOptions(data)}</div><div class="dir-filter-summary">${activeFilterSummary()}</div>${renderDetail(data)}${state.mode==='sum'?renderKpis(data):renderComparison(data)}${renderRankings(data)}${state.view==='map'?renderMap(data):renderCharts(data)}${renderOperationalTable(data)}</div>`;
    saveViewCache(container.innerHTML);
    mountCharts(data);
  }

  function clearDependentFilter(key){const order=['coord','sup','collab','client'],index=order.indexOf(key);if(index>=0)order.slice(index+1).forEach((item)=>state.filters[item]='');}
  function attach(container) {
    if(attached.has(container))return;attached.add(container);
    container.addEventListener('click',async(event)=>{
      const button=event.target.closest('button,[data-rank-filter],[data-map-state]');if(!button)return;
      if(button.dataset.month){const month=Number(button.dataset.month);if(state.selectedMonths.has(month)){if(state.selectedMonths.size>1)state.selectedMonths.delete(month);}else state.selectedMonths.add(month);await ensureMonthsLoaded();return;}
      if(button.dataset.mode){state.mode=button.dataset.mode;render();return;}
      if(button.dataset.view){state.view=button.dataset.view;render();return;}
      if(button.dataset.detail){state.detail=button.dataset.detail;render();return;}
      if(button.hasAttribute('data-close-detail')){state.detail=null;render();return;}
      if(button.hasAttribute('data-clear-filters')){DIMENSIONS.forEach(([key])=>state.filters[key]='');render();return;}
      if(button.dataset.rankFilter&&button.dataset.rankFilter!=='expense'){state.filters[button.dataset.rankFilter]=button.dataset.rankValue;clearDependentFilter(button.dataset.rankFilter);render();}
      if(button.dataset.mapState&&['PR','MT'].includes(button.dataset.mapState)){state.mapFocus=button.dataset.mapState;render();}
    });
    container.addEventListener('change',async(event)=>{
      const el=event.target;
      if(el.matches('[data-year]')){state.year=Number(el.value);const available=state.available.filter((item)=>item.year===state.year).map((item)=>item.month);state.selectedMonths=new Set([Math.max(...available)]);await ensureMonthsLoaded();return;}
      if(el.matches('[data-filter]')){state.filters[el.dataset.filter]=el.value;clearDependentFilter(el.dataset.filter);render();return;}
      if(el.matches('[data-compare-by]')){state.compareBy=el.value;render();return;}
      if(el.matches('[data-rank-metric]')){state.rankMetric=el.value;render();return;}
      if(el.matches('[data-rank-limit]')){state.rankLimit=Number(el.value);render();return;}
      if(el.matches('[data-map-focus]')){state.mapFocus=el.value;render();return;}
      if(el.matches('[data-map-metric]')){state.mapMetric=el.value;render();}
    });
    container.addEventListener('input',(event)=>{if(event.target.matches('[data-map-size]')){state.bubbleSize=Number(event.target.value);render();}});
  }

  async function initialize() {
    const [latestResult,availableResult]=await Promise.all([
      fetchPageWithRetry(() => state.supabase.from('relatorio_resultado_diario').select('data').order('data',{ascending:false}).limit(1).maybeSingle()),
      fetchPageWithRetry(() => state.supabase.from('metas_producao').select('ano,mes').eq('ativo',true).order('ano',{ascending:false}).order('mes',{ascending:false}).limit(1000))
    ]);
    if(latestResult.error)throw latestResult.error;
    const availableMap=new Map((availableResult.data||[]).map((row)=>[`${row.ano}-${row.mes}`,{year:Number(row.ano),month:Number(row.mes)}]));
    state.available=[...availableMap.values()];
    const latest=dateIso(latestResult.data?.data),latestYear=Number(latest.slice(0,4)),latestMonth=Number(latest.slice(5,7));
    state.year=latestYear||state.available[0]?.year||new Date().getFullYear();
    state.selectedMonths=new Set([latestMonth||state.available.find((item)=>item.year===state.year)?.month||new Date().getMonth()+1]);
    await ensureMonthsLoaded();
  }

  async function openHome(container,opts={}) {
    state.container=container;state.supabase=opts.supabase||opts.api?.supabase;attach(container);
    if(!state.supabase){state.loading=false;state.error='Conexão com o banco de dados indisponível.';render();return;}
    state.loading=true;state.error='';
    if(!restoreViewCache(container))render();
    try{await initialize();}catch(error){state.loading=false;state.error=error?.message||'Erro inesperado.';render();}
  }
  window.DASHBOARD_SOCIO={openHome};
})();
