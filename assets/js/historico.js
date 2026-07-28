import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BR = new Intl.NumberFormat('pt-BR');
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const TOP_COLABORADORES = 15;
const TOP_REGIONAIS = 12;

function fmtTons(val) { return BR.format(Math.round(Number(val) || 0)) + ' t'; }
function fmtPct(val) { return `${(Number(val) || 0).toFixed(0)}%`; }
function esc(v) {
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

async function fetchAllRows(makeQuery, pageSize = 1000, maxPages = 30) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function fetchHistoricoData(ctx) {
  const isMaster = !!ctx?.user?.is_master;
  const coordenacao = ctx?.user?.coordenacao || '';
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const dataFim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

  let metaQuery = supabase.from('metas_producao').select('meta_tons,regional').eq('ano', ano).eq('mes', mes).eq('ativo', true);
  if (!isMaster && coordenacao) metaQuery = metaQuery.eq('regional', coordenacao);

  const makeProdQuery = () => {
    let q = supabase
      .from('producao_snapshot')
      .select('data,coordenacao,funcionario,tons')
      .gte('data', dataIni)
      .lt('data', dataFim)
      .order('data', { ascending: true });
    if (!isMaster && coordenacao) q = q.eq('coordenacao', coordenacao);
    return q;
  };

  let patriQuery = supabase.from('patrimonios_snapshot').select('coordenacao,situacao,dias_sem_leitura').eq('situacao', 'Ativo');
  if (!isMaster && coordenacao) patriQuery = patriQuery.eq('coordenacao', coordenacao);

  const [metaRes, prodRows, patriRows] = await Promise.all([
    metaQuery,
    fetchAllRows(makeProdQuery),
    fetchAllRows(() => patriQuery),
  ]);

  if (metaRes.error) throw metaRes.error;

  return { isMaster, coordenacao, ano, mes, metaRows: metaRes.data || [], prodRows, patriRows };
}

function buildMetaChartData({ isMaster, coordenacao, metaRows, prodRows }) {
  const produzidoPorRegional = new Map();
  for (const row of prodRows) {
    const key = row?.coordenacao || 'Sem regional';
    produzidoPorRegional.set(key, (produzidoPorRegional.get(key) || 0) + Number(row?.tons || 0));
  }

  if (!isMaster) {
    const produzido = [...produzidoPorRegional.values()].reduce((a, b) => a + b, 0);
    const meta = metaRows.reduce((sum, r) => sum + Number(r?.meta_tons || 0), 0);
    return {
      labels: [coordenacao || 'Minha regional'],
      produzido: [produzido],
      meta: [meta],
    };
  }

  const regionais = new Map();
  for (const row of metaRows) {
    const key = row?.regional || 'Sem regional';
    regionais.set(key, (regionais.get(key) || 0) + Number(row?.meta_tons || 0));
  }
  for (const key of produzidoPorRegional.keys()) {
    if (!regionais.has(key)) regionais.set(key, 0);
  }

  const entries = [...regionais.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_REGIONAIS);

  return {
    labels: entries.map(([k]) => k),
    meta: entries.map(([k, meta]) => meta),
    produzido: entries.map(([k]) => produzidoPorRegional.get(k) || 0),
  };
}

function buildPatrimonioChartData({ isMaster, coordenacao, patriRows }) {
  const porRegional = new Map();
  for (const row of patriRows) {
    const key = isMaster ? (row?.coordenacao || 'Sem regional') : (coordenacao || 'Minha regional');
    const bucket = porRegional.get(key) || { ok: 0, atrasado: 0 };
    if (Number(row?.dias_sem_leitura || 0) > 7) bucket.atrasado += 1;
    else bucket.ok += 1;
    porRegional.set(key, bucket);
  }

  const entries = [...porRegional.entries()].sort((a, b) => (b[1].ok + b[1].atrasado) - (a[1].ok + a[1].atrasado)).slice(0, TOP_REGIONAIS);
  return {
    labels: entries.map(([k]) => k),
    ok: entries.map(([, v]) => v.ok),
    atrasado: entries.map(([, v]) => v.atrasado),
  };
}

function buildDiarioChartData({ prodRows, ano, mes }) {
  const porDia = new Map();
  for (const row of prodRows) {
    const dia = row?.data;
    if (!dia) continue;
    porDia.set(dia, (porDia.get(dia) || 0) + Number(row?.tons || 0));
  }

  const diasNoMes = new Date(ano, mes, 0).getDate();
  const labels = [];
  const valores = [];
  for (let d = 1; d <= diasNoMes; d += 1) {
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    labels.push(String(d));
    valores.push(porDia.get(iso) || 0);
  }
  return { labels, valores };
}

function buildColaboradorChartData({ prodRows }) {
  const porColaborador = new Map();
  for (const row of prodRows) {
    const nome = row?.funcionario || 'Sem identificação';
    porColaborador.set(nome, (porColaborador.get(nome) || 0) + Number(row?.tons || 0));
  }

  const entries = [...porColaborador.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_COLABORADORES)
    .reverse();

  return {
    labels: entries.map(([k]) => k),
    valores: entries.map(([, v]) => v),
  };
}

function renderShell(isMaster, coordenacao, ano, mes) {
  const escopo = isMaster ? 'Todas as regionais' : (coordenacao || 'Minha regional');
  return `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Histórico — ${MESES_FULL[mes - 1]}/${ano}</h2>
          <p class="section-subtitle">Panorama de meta, leitura de patrimônios, produção diária e por colaborador — ${esc(escopo)}.</p>
        </div>
      </div>

      <div class="hist-grid" id="histGrid">
        <div class="hist-card">
          <div class="hist-card-title">Meta do mês ${isMaster ? '· por regional' : ''}</div>
          <div class="hist-chart-wrap"><canvas id="histChartMeta"></canvas></div>
        </div>
        <div class="hist-card">
          <div class="hist-card-title">Leitura de patrimônios ${isMaster ? '· por regional' : ''}</div>
          <div class="hist-chart-wrap"><canvas id="histChartPatri"></canvas></div>
        </div>
        <div class="hist-card">
          <div class="hist-card-title">Produção diária</div>
          <div class="hist-chart-wrap"><canvas id="histChartDiario"></canvas></div>
        </div>
        <div class="hist-card">
          <div class="hist-card-title">Produção por colaborador (top ${TOP_COLABORADORES})</div>
          <div class="hist-chart-wrap hist-chart-wrap-tall"><canvas id="histChartColab"></canvas></div>
        </div>
      </div>
    </section>

    <style>
      .hist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      @media (max-width: 900px) { .hist-grid { grid-template-columns: 1fr; } }
      .hist-card { border: 1px solid var(--line, rgba(255,255,255,.08)); border-radius: 16px; padding: 16px; background: var(--card-bg, rgba(13,13,24,.6)); }
      .hist-card-title { font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--muted, #94a3b8); margin-bottom: 12px; }
      .hist-chart-wrap { position: relative; height: 260px; }
      .hist-chart-wrap-tall { height: 380px; }
    </style>
  `;
}

function destroyCharts(charts) {
  Object.values(charts).forEach((chart) => chart?.destroy());
}

function montarGraficos(data) {
  if (!window.Chart) return {};
  const ChartJs = window.Chart;
  const GRID_C = 'rgba(148,163,184,0.1)';
  ChartJs.defaults.color = '#9aa3b8';
  ChartJs.defaults.borderColor = GRID_C;

  const charts = {};

  const metaData = buildMetaChartData(data);
  const elMeta = document.getElementById('histChartMeta');
  if (elMeta) {
    charts.meta = new ChartJs(elMeta, {
      type: 'bar',
      data: {
        labels: metaData.labels,
        datasets: [
          { label: 'Produzido', data: metaData.produzido, backgroundColor: 'rgba(34,197,94,.75)', borderRadius: 5, barThickness: 14 },
          { label: 'Meta', data: metaData.meta, backgroundColor: 'rgba(250,204,21,.35)', borderRadius: 5, barThickness: 14 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end' } },
        scales: {
          x: { grid: { color: GRID_C }, ticks: { callback: (v) => fmtTons(v) } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  const patriData = buildPatrimonioChartData(data);
  const elPatri = document.getElementById('histChartPatri');
  if (elPatri) {
    charts.patri = new ChartJs(elPatri, {
      type: 'bar',
      data: {
        labels: patriData.labels,
        datasets: [
          { label: 'Em dia', data: patriData.ok, backgroundColor: 'rgba(34,197,94,.75)', borderRadius: 5, barThickness: 14, stack: 'p' },
          { label: 'Atrasado >7d', data: patriData.atrasado, backgroundColor: 'rgba(248,113,113,.75)', borderRadius: 5, barThickness: 14, stack: 'p' },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end' } },
        scales: {
          x: { stacked: true, grid: { color: GRID_C } },
          y: { stacked: true, grid: { display: false } },
        },
      },
    });
  }

  const diarioData = buildDiarioChartData(data);
  const elDiario = document.getElementById('histChartDiario');
  if (elDiario) {
    charts.diario = new ChartJs(elDiario, {
      type: 'line',
      data: {
        labels: diarioData.labels,
        datasets: [
          { label: 'Produção (t)', data: diarioData.valores, borderColor: 'rgba(45,212,160,.9)', backgroundColor: 'rgba(45,212,160,.15)', fill: true, tension: .3, pointRadius: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 15 } },
          y: { grid: { color: GRID_C }, ticks: { callback: (v) => fmtTons(v) } },
        },
      },
    });
  }

  const colabData = buildColaboradorChartData(data);
  const elColab = document.getElementById('histChartColab');
  if (elColab) {
    charts.colab = new ChartJs(elColab, {
      type: 'bar',
      data: {
        labels: colabData.labels,
        datasets: [
          { label: 'Produção (t)', data: colabData.valores, backgroundColor: 'rgba(56,189,248,.75)', borderRadius: 5, barThickness: 12 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: GRID_C }, ticks: { callback: (v) => fmtTons(v) } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  return charts;
}

let activeCharts = {};

export async function renderContent(content, userContext) {
  content.innerHTML = '<div class="db-loading">Carregando histórico...</div>';

  try {
    const data = await fetchHistoricoData(userContext);
    content.innerHTML = renderShell(data.isMaster, data.coordenacao, data.ano, data.mes);
    destroyCharts(activeCharts);
    activeCharts = montarGraficos(data);
  } catch (error) {
    console.error('[historico] erro ao carregar:', error);
    content.innerHTML = `<section class="card mt-16"><div class="log-empty">Erro ao carregar histórico: ${esc(error?.message || error)}</div></section>`;
  }
}

initProtectedPage('Histórico', renderContent);
