const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-diretoria-'));
const rows = {
  relatorio_resultado_diario: [
    { data:'2026-09-03', funcionario:'Ana', coordenacao:'CASCAVEL', supervisao:'Sul', cliente_nacional:'Cliente A', cliente_final:'', toneladas:1200, valor_embarcado:180000 },
    { data:'2026-09-12', funcionario:'Bruno', coordenacao:'MATO GROSSO MT1', supervisao:'Centro-Oeste', cliente_nacional:'Cliente B', cliente_final:'', toneladas:900, valor_embarcado:145000 },
    { data:'2026-08-08', funcionario:'Ana', coordenacao:'CASCAVEL', supervisao:'Sul', cliente_nacional:'Cliente A', cliente_final:'', toneladas:800, valor_embarcado:110000 }
  ],
  grm_despesas_importacoes: [
    { data_conta_de:'2026-09-01', data_conta_ate:'2026-09-30', coordenacao:'CASCAVEL', supervisao:'Sul', funcionario:'Ana', categoria:'Hospedagem', grupo_categoria:'Viagens', valor:42000, created_at:'2026-09-30T12:00:00Z' },
    { data_conta_de:'2026-09-01', data_conta_ate:'2026-09-30', coordenacao:'MATO GROSSO MT1', supervisao:'Centro-Oeste', funcionario:'Bruno', categoria:'Combustível', grupo_categoria:'Operação', valor:31000, created_at:'2026-09-30T12:00:00Z' },
    { data_conta_de:'2026-08-01', data_conta_ate:'2026-08-31', coordenacao:'CASCAVEL', supervisao:'Sul', funcionario:'Ana', categoria:'Hospedagem', grupo_categoria:'Viagens', valor:26000, created_at:'2026-09-30T12:00:00Z' }
  ],
  grm_notas_fiscais_importacoes: [
    { data_nota_real:'2026-09-05', cliente_nacional:'Cliente A', numero_nf:'100', valor_nota_real:200000, valor_total:200000, dados_json:{'Coordenação':'CASCAVEL'}, created_at:'2026-09-30T12:00:00Z' },
    { data_nota_real:'2026-09-15', cliente_nacional:'Cliente B', numero_nf:'200', valor_nota_real:160000, valor_total:160000, dados_json:{'Coordenação':'MATO GROSSO MT1'}, created_at:'2026-09-30T12:00:00Z' },
    { data_nota_real:'2026-08-10', cliente_nacional:'Cliente A', numero_nf:'90', valor_nota_real:125000, valor_total:125000, dados_json:{'Coordenação':'CASCAVEL'}, created_at:'2026-09-30T12:00:00Z' }
  ],
  financeiro_contas_receber: [
    { cliente:'Cliente A', numero_nf:'100', valor_pago:190000, recebimento:'2026-09-20' },
    { cliente:'Cliente B', numero_nf:'200', valor_pago:150000, recebimento:'2026-09-24' },
    { cliente:'Cliente A', numero_nf:'90', valor_pago:120000, recebimento:'2026-08-20' }
  ],
  metas_producao: [
    { ano:2026, mes:9, ativo:true, regional:'CASCAVEL', estado:'PR', meta_tons:1300 },
    { ano:2026, mes:9, ativo:true, regional:'MATO GROSSO MT1', estado:'MT', meta_tons:1000 },
    { ano:2026, mes:8, ativo:true, regional:'CASCAVEL', estado:'PR', meta_tons:900 }
  ]
};

const harness = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body><main class="page-main" id="pageContent"></main><script>
class Query {
  constructor(table){ this.table=table; this.filters=[]; this.orders=[]; this.max=null; this.slice=null; }
  select(){ return this; } eq(k,v){ this.filters.push(r=>r[k]===v); return this; }
  gte(k,v){ this.filters.push(r=>String(r[k]??'')>=String(v)); return this; }
  lt(k,v){ this.filters.push(r=>String(r[k]??'')<String(v)); return this; }
  not(k){ this.filters.push(r=>r[k]!=null); return this; }
  order(k,o={}){ this.orders.push([k,o.ascending!==false]); return this; }
  limit(v){ this.max=v; return this; } range(a,b){ this.slice=[a,b]; return this; }
  maybeSingle(){ return this.run().then(x=>({...x,data:x.data[0]||null})); }
  run(){ let data=(window.mockRows[this.table]||[]).filter(r=>this.filters.every(f=>f(r))); for(const [k,asc] of this.orders) data.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(asc?1:-1)); if(this.max!=null)data=data.slice(0,this.max); if(this.slice)data=data.slice(this.slice[0],this.slice[1]+1); return Promise.resolve({data,error:null}); }
  then(ok,bad){ return this.run().then(ok,bad); }
}
window.mockRows=${JSON.stringify(rows)};
window.mockSupabase={from:t=>new Query(t)};
window.Chart=class { constructor(){ } destroy(){ } };
</script><script type="module">import '/assets/js/modules/dashboard-diretoria.js'; window.DASHBOARD_SOCIO.openHome(document.querySelector('#pageContent'),{supabase:window.mockSupabase});</script></body></html>`;

function contentType(file) {
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  return 'text/html';
}

const server = http.createServer((req,res) => {
  if (req.url === '/__dashboard_test') { res.writeHead(200, {'content-type':'text/html'}); res.end(harness); return; }
  const file = path.resolve(root, `.${decodeURIComponent(req.url.split('?')[0])}`);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type':contentType(file)}); fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/__dashboard_test`);
    await page.locator('.dir-kpis').waitFor();
    await page.waitForFunction(() => document.getElementById('dashboard-diretoria-style')?.sheet);
    assert.equal(await page.locator('.dir-kpi').count(), 5);
    assert.match(await page.locator('.dir-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns), /px/);
    assert.equal(await page.locator('.dir-filters').evaluate(el=>getComputedStyle(el).display), 'grid');
    assert.match(await page.locator('.dir-kpi').nth(0).innerText(), /2\.100 t/);
    await page.locator('[data-month="8"]').click();
    await page.locator('[data-mode="compare"]').click();
    await page.locator('[data-compare-by]').selectOption('client');
    const compareText = await page.locator('.dir-compare').innerText();
    assert.match(compareText, /Cliente A/);
    assert.match(compareText, /Sem detalhamento/);
    await page.locator('[data-view="map"]').click();
    assert.equal(await page.locator('.dir-map-bubble').count(), 2);
    await page.locator('[data-map-state="PR"]').click();
    assert.equal(await page.locator('[data-map-focus]').inputValue(), 'PR');
    assert.match(await page.locator('.dir-section').last().innerText(), /R\$\s68\.000/);
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:path.join(screenshotDir,'dashboard-diretoria-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.locator('.dir-page').isVisible());
    await page.screenshot({path:path.join(screenshotDir,'dashboard-diretoria-smoke.png'),fullPage:true});
    console.log('dashboard-diretoria smoke: ok');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error=>{ console.error(error); process.exitCode=1; });
