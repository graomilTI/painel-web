import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

const BR = new Intl.NumberFormat('pt-BR');
const BR_TONS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const BR_DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const MAX_FETCH_ROWS = 25000;
const MAX_TABLE_ROWS = 1000;

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtTons(value) {
  return `${BR_TONS.format(parseNumber(value))} t`;
}

function fmtInt(value) {
  return BR.format(Math.round(parseNumber(value)));
}

function fmtDate(value) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || '—';
  return BR_DATE.format(new Date(`${raw}T00:00:00Z`));
}

function getRowDate(row) {
  return String(row?.data || row?.data_referencia || '').slice(0, 10);
}

function monthValueFromDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(monthValue || '')) return 'Mês';
  const [year, month] = monthValue.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return label.replace('.', '').toUpperCase();
}

function getMonthBounds(monthValue) {
  const [year, month] = String(monthValue || monthValueFromDate()).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    year,
    month,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

function previousMonths(count = 12, baseMonth = monthValueFromDate()) {
  const [year, month] = String(baseMonth || monthValueFromDate()).split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, 1));
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(base);
    d.setUTCMonth(base.getUTCMonth() - index);
    return monthValueFromDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
}

function isMaster(userContext) {
  return Boolean(userContext?.user?.is_master);
}

function getUserRegional(userContext) {
  return userContext?.user?.coordenacao || userContext?.coordenacao || '';
}

function injectHistoricoStyles() {
  if (document.getElementById('producaoHistoricoStyles')) return;
  const style = document.createElement('style');
  style.id = 'producaoHistoricoStyles';
  style.textContent = `
    .prod-history-page { display:flex; flex-direction:column; gap:16px; }
    .prod-history-hero {
      border:1px solid rgba(0,200,122,.22); border-radius:22px; padding:20px;
      background:linear-gradient(135deg,rgba(0,200,122,.11),rgba(13,13,24,.94) 45%,rgba(13,13,24,.98));
      box-shadow:0 20px 60px rgba(0,0,0,.22); overflow:hidden; position:relative;
    }
    .prod-history-hero::after {
      content:''; position:absolute; inset:auto -80px -140px auto; width:280px; height:280px;
      background:radial-gradient(circle,rgba(0,200,122,.22),transparent 62%); pointer-events:none;
    }
    .prod-history-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; position:relative; z-index:1; }
    .prod-history-head h2 { margin:0; font-size:clamp(24px,3vw,36px); letter-spacing:-.04em; }
    .prod-history-head p { margin:6px 0 0; color:#8b94a7; max-width:680px; line-height:1.55; }
    .prod-history-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .prod-history-link, .prod-history-button {
      display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:38px; padding:9px 13px;
      border-radius:12px; border:1px solid rgba(0,200,122,.28); color:#00c87a; text-decoration:none;
      background:rgba(0,200,122,.10); font-size:12px; font-weight:900; cursor:pointer;
    }
    .prod-history-button.primary { background:#00c87a; color:#03160f; border-color:#00c87a; }
    .prod-history-button:disabled { opacity:.62; cursor:not-allowed; }
    .prod-history-filters {
      display:grid; grid-template-columns:repeat(6,minmax(145px,1fr)); gap:12px; align-items:end;
    }
    .prod-history-filters .span-2 { grid-column:span 2; }
    .prod-history-filters input:disabled { opacity:.72; cursor:not-allowed; }
    @media(max-width:1100px) { .prod-history-filters{grid-template-columns:repeat(3,minmax(145px,1fr));} }
    @media(max-width:720px) { .prod-history-filters{grid-template-columns:1fr;} .prod-history-filters .span-2{grid-column:span 1;} }
    .prod-month-chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
    .prod-month-chip {
      border:1px solid rgba(255,255,255,.08); color:#8b94a7; background:rgba(255,255,255,.035);
      border-radius:999px; padding:8px 12px; font-size:11px; font-weight:900; cursor:pointer;
    }
    .prod-month-chip.active { color:#00c87a; border-color:rgba(0,200,122,.38); background:rgba(0,200,122,.10); }
    .prod-summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    @media(max-width:900px) { .prod-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
    @media(max-width:560px) { .prod-summary-grid{grid-template-columns:1fr;} }
    .prod-summary-card {
      border:1px solid rgba(255,255,255,.07); border-radius:18px; padding:16px;
      background:rgba(13,13,24,.88); min-height:104px;
    }
    .prod-summary-label { color:#6b7280; font-size:10px; font-weight:950; letter-spacing:.12em; text-transform:uppercase; }
    .prod-summary-value { color:#e8edf7; margin-top:10px; font-size:clamp(24px,3vw,34px); font-weight:1000; letter-spacing:-.05em; line-height:1; }
    .prod-summary-value.green { color:#00c87a; text-shadow:0 0 24px rgba(0,200,122,.22); }
    .prod-summary-sub { margin-top:8px; color:#6b7280; font-size:11px; font-weight:800; }
    .prod-grid-2 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; }
    @media(max-width:980px) { .prod-grid-2{grid-template-columns:1fr;} }
    .prod-card { border:1px solid rgba(255,255,255,.07); border-radius:20px; padding:16px; background:rgba(13,13,24,.88); }
    .prod-card-title { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .prod-card-title h3 { margin:0; font-size:16px; letter-spacing:-.02em; }
    .prod-card-title p { margin:4px 0 0; color:#6b7280; font-size:12px; }
    .prod-table-wrap { overflow:auto; border-radius:14px; border:1px solid rgba(255,255,255,.06); }
    .prod-table { width:100%; border-collapse:collapse; min-width:720px; }
    .prod-table th, .prod-table td { padding:10px 11px; border-bottom:1px solid rgba(255,255,255,.06); text-align:left; font-size:12px; }
    .prod-table th { color:#6b7280; font-size:10px; text-transform:uppercase; letter-spacing:.10em; background:rgba(255,255,255,.025); position:sticky; top:0; z-index:1; }
    .prod-table td { color:#dbe1ee; }
    .prod-table .num { text-align:right; font-variant-numeric:tabular-nums; }
    .prod-empty { padding:24px; color:#8b94a7; text-align:center; }
    .prod-meta-line { color:#8b94a7; font-size:12px; margin-top:8px; }
  `;
  document.head.appendChild(style);
}

async function fetchAllRows(queryFactory, { pageSize = 1000, maxRows = MAX_FETCH_ROWS } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await queryFactory().range(from, to);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { rows, truncated: rows.length >= maxRows };
}

function buildQuery({ userContext, filters, bounds }) {
  const master = isMaster(userContext);
  const regionalUsuario = getUserRegional(userContext);

  return () => {
    let query = supabase
      .from('producao_snapshot')
      .select('data,data_referencia,coordenacao,supervisao,funcionario,cliente,cidade,os,servico,cargas,tons')
      .gte('data', filters.dia || bounds.start)
      .lt('data', filters.dia ? nextDay(filters.dia) : bounds.end)
      .order('data', { ascending: false })
      .order('coordenacao', { ascending: true })
      .order('funcionario', { ascending: true });

    if (!master && regionalUsuario) query = query.eq('coordenacao', regionalUsuario);
    if (master && filters.coordenacao) query = query.ilike('coordenacao', `%${filters.coordenacao}%`);
    if (filters.supervisao) query = query.ilike('supervisao', `%${filters.supervisao}%`);
    if (filters.funcionario) query = query.ilike('funcionario', `%${filters.funcionario}%`);
    if (filters.cliente) query = query.ilike('cliente', `%${filters.cliente}%`);
    if (filters.cidade) query = query.ilike('cidade', `%${filters.cidade}%`);
    return query;
  };
}

function nextDay(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function summarize(rows, bounds) {
  const daily = new Map();
  const regionals = new Map();
  const clientes = new Set();
  const osSet = new Set();

  for (const row of rows) {
    const date = getRowDate(row);
    const tons = parseNumber(row.tons);
    const cargas = parseNumber(row.cargas);
    const coord = row.coordenacao || 'Sem coordenação';
    const cliente = row.cliente || '—';
    const os = row.os || '';

    if (cliente && cliente !== '—') clientes.add(cliente);
    if (os) osSet.add(os);

    if (!daily.has(date)) daily.set(date, { data: date, tons: 0, cargas: 0, os: new Set(), clientes: new Set() });
    const d = daily.get(date);
    d.tons += tons;
    d.cargas += cargas;
    if (os) d.os.add(os);
    if (cliente && cliente !== '—') d.clientes.add(cliente);

    if (!regionals.has(coord)) regionals.set(coord, { coordenacao: coord, tons: 0, cargas: 0, os: new Set(), colaboradores: new Set() });
    const r = regionals.get(coord);
    r.tons += tons;
    r.cargas += cargas;
    if (os) r.os.add(os);
    if (row.funcionario) r.colaboradores.add(row.funcionario);
  }

  const dailyRows = [...daily.values()]
    .map((item) => ({ ...item, osTotal: item.os.size, clientesTotal: item.clientes.size }))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));

  const regionalRows = [...regionals.values()]
    .map((item) => ({ ...item, osTotal: item.os.size, colaboradoresTotal: item.colaboradores.size }))
    .sort((a, b) => b.tons - a.tons);

  const totalTons = rows.reduce((sum, row) => sum + parseNumber(row.tons), 0);
  const totalCargas = rows.reduce((sum, row) => sum + parseNumber(row.cargas), 0);
  const diasComProducao = dailyRows.filter((item) => item.tons > 0 || item.cargas > 0).length;
  const melhorDia = dailyRows.reduce((best, item) => (!best || item.tons > best.tons ? item : best), null);
  const mediaDiaria = diasComProducao > 0 ? totalTons / diasComProducao : 0;

  return {
    bounds,
    totalTons,
    totalCargas,
    diasComProducao,
    mediaDiaria,
    melhorDia,
    clientesTotal: clientes.size,
    osTotal: osSet.size,
    dailyRows,
    regionalRows,
  };
}

function renderSummary(summary) {
  return `
    <div class="prod-summary-grid">
      <div class="prod-summary-card">
        <div class="prod-summary-label">Produção do período</div>
        <div class="prod-summary-value green">${fmtTons(summary.totalTons)}</div>
        <div class="prod-summary-sub">${fmtInt(summary.totalCargas)} cargas registradas</div>
      </div>
      <div class="prod-summary-card">
        <div class="prod-summary-label">Média diária</div>
        <div class="prod-summary-value">${fmtTons(summary.mediaDiaria)}</div>
        <div class="prod-summary-sub">considerando ${fmtInt(summary.diasComProducao)} dia(s) com produção</div>
      </div>
      <div class="prod-summary-card">
        <div class="prod-summary-label">Ordens de serviço</div>
        <div class="prod-summary-value">${fmtInt(summary.osTotal)}</div>
        <div class="prod-summary-sub">${fmtInt(summary.clientesTotal)} cliente(s) no período</div>
      </div>
      <div class="prod-summary-card">
        <div class="prod-summary-label">Melhor dia</div>
        <div class="prod-summary-value">${summary.melhorDia ? fmtTons(summary.melhorDia.tons) : '—'}</div>
        <div class="prod-summary-sub">${summary.melhorDia ? fmtDate(summary.melhorDia.data) : 'sem produção lançada'}</div>
      </div>
    </div>
  `;
}

function renderDailyTable(summary) {
  if (!summary.dailyRows.length) return '<div class="prod-empty">Nenhuma produção localizada para os filtros selecionados.</div>';
  return `
    <div class="prod-table-wrap">
      <table class="prod-table">
        <thead>
          <tr><th>Data</th><th class="num">Produção</th><th class="num">Cargas</th><th class="num">O.S.</th><th class="num">Clientes</th></tr>
        </thead>
        <tbody>
          ${summary.dailyRows.map((row) => `
            <tr>
              <td>${fmtDate(row.data)}</td>
              <td class="num">${fmtTons(row.tons)}</td>
              <td class="num">${fmtInt(row.cargas)}</td>
              <td class="num">${fmtInt(row.osTotal)}</td>
              <td class="num">${fmtInt(row.clientesTotal)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRegionalTable(summary) {
  if (!summary.regionalRows.length) return '<div class="prod-empty">Sem coordenações para exibir.</div>';
  return `
    <div class="prod-table-wrap">
      <table class="prod-table">
        <thead>
          <tr><th>Coordenação</th><th class="num">Produção</th><th class="num">Cargas</th><th class="num">O.S.</th><th class="num">Colaboradores</th></tr>
        </thead>
        <tbody>
          ${summary.regionalRows.map((row) => `
            <tr>
              <td>${esc(row.coordenacao)}</td>
              <td class="num">${fmtTons(row.tons)}</td>
              <td class="num">${fmtInt(row.cargas)}</td>
              <td class="num">${fmtInt(row.osTotal)}</td>
              <td class="num">${fmtInt(row.colaboradoresTotal)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDetailTable(rows, truncated) {
  if (!rows.length) return '<div class="prod-empty">Nenhum lançamento detalhado para exibir.</div>';
  const limitedRows = rows.slice(0, MAX_TABLE_ROWS);
  return `
    ${rows.length > MAX_TABLE_ROWS || truncated ? `<div class="prod-meta-line">Mostrando ${fmtInt(limitedRows.length)} lançamento(s) de ${fmtInt(rows.length)} carregado(s). Use os filtros para refinar a consulta.</div>` : ''}
    <div class="prod-table-wrap" style="margin-top:10px">
      <table class="prod-table">
        <thead>
          <tr>
            <th>Data</th><th>Coordenação</th><th>Supervisão</th><th>Colaborador</th><th>Cliente</th><th>Cidade</th><th>O.S.</th><th>Serviço</th><th class="num">Cargas</th><th class="num">Tons</th>
          </tr>
        </thead>
        <tbody>
          ${limitedRows.map((row) => `
            <tr>
              <td>${fmtDate(getRowDate(row))}</td>
              <td>${esc(row.coordenacao)}</td>
              <td>${esc(row.supervisao)}</td>
              <td>${esc(row.funcionario)}</td>
              <td>${esc(row.cliente)}</td>
              <td>${esc(row.cidade)}</td>
              <td>${esc(row.os)}</td>
              <td>${esc(row.servico)}</td>
              <td class="num">${fmtInt(row.cargas)}</td>
              <td class="num">${fmtTons(row.tons)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function rowsToCsv(rows) {
  const headers = ['Data','Coordenação','Supervisão','Colaborador','Cliente','Cidade','O.S.','Serviço','Cargas','Tons'];
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((row) => [
    getRowDate(row), row.coordenacao, row.supervisao, row.funcionario, row.cliente, row.cidade, row.os, row.servico, row.cargas, row.tons,
  ].map(escapeCsv).join(';'));
  return [headers.map(escapeCsv).join(';'), ...lines].join('\n');
}

function downloadCsv(rows, monthValue) {
  const csv = rowsToCsv(rows);
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `historico-producao-${monthValue}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readFilters() {
  return {
    mes: document.getElementById('fMes')?.value || monthValueFromDate(),
    dia: document.getElementById('fDia')?.value || '',
    coordenacao: document.getElementById('fCoordenacao')?.value.trim() || '',
    supervisao: document.getElementById('fSupervisao')?.value.trim() || '',
    funcionario: document.getElementById('fFuncionario')?.value.trim() || '',
    cliente: document.getElementById('fCliente')?.value.trim() || '',
    cidade: document.getElementById('fCidade')?.value.trim() || '',
  };
}

function setLoadingState(isLoading) {
  const btn = document.getElementById('btnBuscar');
  const csv = document.getElementById('btnCsv');
  if (btn) {
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Consultando...' : 'Buscar';
  }
  if (csv) csv.disabled = isLoading;
}

let currentRows = [];
let currentMonth = monthValueFromDate();

async function loadData(userContext) {
  const meta = document.getElementById('metaConsulta');
  const summarySlot = document.getElementById('summarySlot');
  const dailySlot = document.getElementById('dailySlot');
  const regionalSlot = document.getElementById('regionalSlot');
  const detailSlot = document.getElementById('detailSlot');

  const filters = readFilters();
  currentMonth = filters.mes;
  const bounds = getMonthBounds(filters.mes);

  meta.textContent = `Consultando ${filters.dia ? fmtDate(filters.dia) : monthLabel(filters.mes)}...`;
  summarySlot.innerHTML = '';
  dailySlot.innerHTML = '<div class="prod-empty">Carregando dados...</div>';
  regionalSlot.innerHTML = '<div class="prod-empty">Carregando dados...</div>';
  detailSlot.innerHTML = '';
  setLoadingState(true);

  try {
    const { rows, truncated } = await fetchAllRows(buildQuery({ userContext, filters, bounds }));
    currentRows = rows;
    const summary = summarize(rows, bounds);

    summarySlot.innerHTML = renderSummary(summary);
    dailySlot.innerHTML = renderDailyTable(summary);
    regionalSlot.innerHTML = renderRegionalTable(summary);
    detailSlot.innerHTML = renderDetailTable(rows, truncated);

    const truncMsg = truncated ? ` Limite de ${fmtInt(MAX_FETCH_ROWS)} lançamentos atingido; refine os filtros para ver tudo.` : '';
    meta.textContent = `${fmtInt(rows.length)} lançamento(s) localizado(s) em ${filters.dia ? fmtDate(filters.dia) : monthLabel(filters.mes)}.${truncMsg}`;

    const params = new URLSearchParams(window.location.search);
    params.set('mes', filters.mes);
    if (filters.dia) params.set('dia', filters.dia); else params.delete('dia');
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
  } catch (err) {
    console.error(err);
    meta.textContent = err.message || 'Erro ao consultar produção.';
    dailySlot.innerHTML = '<div class="prod-empty">Não foi possível carregar a produção.</div>';
    regionalSlot.innerHTML = '<div class="prod-empty">Não foi possível carregar a produção.</div>';
  } finally {
    setLoadingState(false);
  }
}

function renderMonthChips(activeMonth) {
  return previousMonths(12, activeMonth).map((month) => `
    <button class="prod-month-chip ${month === activeMonth ? 'active' : ''}" type="button" data-month="${month}">${monthLabel(month)}</button>
  `).join('');
}

export async function renderContent(content, userContext) {
  injectHistoricoStyles();

  const params = new URLSearchParams(window.location.search);
  const initialMonth = /^\d{4}-\d{2}$/.test(params.get('mes') || '') ? params.get('mes') : monthValueFromDate();
  const initialDay = /^\d{4}-\d{2}-\d{2}$/.test(params.get('dia') || '') ? params.get('dia') : '';
  const regionalUsuario = getUserRegional(userContext);
  const master = isMaster(userContext);

  content.innerHTML = `
    <section class="prod-history-page">
      <div class="prod-history-hero">
        <div class="prod-history-head">
          <div>
            <h2>Histórico de Produção</h2>
            <p>Consulte a produção dos meses anteriores, veja o resumo por dia e abra os lançamentos detalhados sem precisar voltar ao dashboard do mês atual.</p>
          </div>
          <div class="prod-history-actions">
            <a class="prod-history-link" href="${toPanelUrl('dashboard')}">← Dashboard</a>
            <button class="prod-history-button" type="button" id="btnCsv">Exportar CSV</button>
          </div>
        </div>
      </div>

      <div class="prod-card">
        <div class="prod-history-filters">
          <div>
            <label class="base-label" for="fMes">Mês</label>
            <input class="base-input" type="month" id="fMes" value="${esc(initialMonth)}" />
          </div>
          <div>
            <label class="base-label" for="fDia">Dia opcional</label>
            <input class="base-input" type="date" id="fDia" value="${esc(initialDay)}" />
          </div>
          <div>
            <label class="base-label" for="fCoordenacao">Coordenação</label>
            <input class="base-input" type="text" id="fCoordenacao" placeholder="Todas" value="${esc(master ? '' : regionalUsuario)}" ${master ? '' : 'disabled'} />
          </div>
          <div>
            <label class="base-label" for="fSupervisao">Supervisão</label>
            <input class="base-input" type="text" id="fSupervisao" placeholder="Supervisão" />
          </div>
          <div>
            <label class="base-label" for="fFuncionario">Colaborador</label>
            <input class="base-input" type="text" id="fFuncionario" placeholder="Nome" />
          </div>
          <div>
            <label class="base-label" for="fCliente">Cliente</label>
            <input class="base-input" type="text" id="fCliente" placeholder="Cliente" />
          </div>
          <div class="span-2">
            <label class="base-label" for="fCidade">Cidade</label>
            <input class="base-input" type="text" id="fCidade" placeholder="Cidade de embarque" />
          </div>
          <div>
            <button class="prod-history-button primary" id="btnBuscar" type="button">Buscar</button>
          </div>
        </div>
        <div class="prod-month-chips" id="monthChips">${renderMonthChips(initialMonth)}</div>
        <div class="prod-meta-line" id="metaConsulta">Aguardando consulta.</div>
      </div>

      <div id="summarySlot"></div>

      <div class="prod-grid-2">
        <div class="prod-card">
          <div class="prod-card-title">
            <div><h3>Produção por dia</h3><p>Resumo diário do mês selecionado.</p></div>
          </div>
          <div id="dailySlot"></div>
        </div>
        <div class="prod-card">
          <div class="prod-card-title">
            <div><h3>Produção por coordenação</h3><p>Consolidado por regional/coordenação.</p></div>
          </div>
          <div id="regionalSlot"></div>
        </div>
      </div>

      <div class="prod-card">
        <div class="prod-card-title">
          <div><h3>Lançamentos detalhados</h3><p>Use os filtros para localizar colaborador, cliente, cidade, O.S. e serviço.</p></div>
        </div>
        <div id="detailSlot"></div>
      </div>
    </section>
  `;

  document.getElementById('btnBuscar')?.addEventListener('click', () => loadData(userContext));
  document.getElementById('btnCsv')?.addEventListener('click', () => downloadCsv(currentRows, currentMonth));
  document.getElementById('fMes')?.addEventListener('change', () => {
    document.getElementById('fDia').value = '';
    const activeMonth = document.getElementById('fMes').value || monthValueFromDate();
    document.getElementById('monthChips').innerHTML = renderMonthChips(activeMonth);
  });
  document.getElementById('monthChips')?.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-month]');
    if (!chip) return;
    document.getElementById('fMes').value = chip.dataset.month;
    document.getElementById('fDia').value = '';
    document.getElementById('monthChips').innerHTML = renderMonthChips(chip.dataset.month);
    loadData(userContext);
  });

  await loadData(userContext);
}

initProtectedPage('Histórico de Produção', renderContent);
