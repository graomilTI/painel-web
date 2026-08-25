import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MAX_UBER_ROWS = 30000;
const PAGE_SIZE = 1000;
const CACHE_KEY = 'uberConferenciaCache_v1';

const state = {
  loading: false,
  syncing: false,
  rows: [],
  producao: [],
  filters: {
    inicio: '',
    fim: '',
    q: '',
    status: '',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return escapeHtml(value);
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

function money(value) {
  const number = Number(value || 0);
  return MONEY.format(Number.isFinite(number) ? number : 0);
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function statusOf(row) {
  return normalize(row.status_validacao || row.classificacao_manual || row.classificacao || 'PENDENTE').replaceAll(' ', '_');
}

function isUsoPessoal(row) {
  const text = normalize([
    row.observacao,
    row.observacao_validacao,
    row.detalhamento_despesa,
    row.motivo_validacao,
    row.finalidade,
  ].filter(Boolean).join(' '));
  return text.includes('PESSOAL');
}

function tokenSet(value) {
  return new Set(normalize(value).split(' ').filter((token) => token.length >= 4));
}

function tokenOverlapScore(a, b) {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  ta.forEach((token) => { if (tb.has(token)) hits++; });
  return hits / Math.min(ta.size, tb.size);
}

function employeeName(row) {
  return row.nome_colaborador || row.nome || row.funcionario || row.colaborador || row.classificador || '';
}

function isSameEmployee(a, b) {
  const na = normalize(employeeName(a));
  const nb = normalize(employeeName(b));
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const aTokens = na.split(' ').filter((t) => t.length > 2);
  const bTokens = new Set(nb.split(' ').filter((t) => t.length > 2));
  return aTokens.length >= 2 && aTokens.filter((t) => bTokens.has(t)).length >= 2;
}

function uberAddressText(row) {
  return [
    row.endereco_partida,
    row.endereco_destino,
    row.origem,
    row.destino,
    row.local_partida,
    row.local_destino,
    row.observacao,
    row.detalhamento_despesa,
    row.finalidade,
  ].filter(Boolean).join(' ');
}

function productionLocationText(row) {
  return [
    row.local,
    row.local_embarque,
    row.embarque,
    row.origem,
    row.cidade,
    row.cidade_embarque,
    row.cliente,
    row.armazem,
    row.armazém,
    row.produtor,
  ].filter(Boolean).join(' ');
}

function rowHomeText(row) {
  return [
    row.endereco_colaborador,
    row.endereco_residencial,
    row.endereco_casa,
    row.cidade_colaborador,
    row.cidade_residencial,
  ].filter(Boolean).join(' ');
}

function isNearHomeOrBoarding(uberRow, prodRow) {
  const uberText = uberAddressText(uberRow);
  const normUber = normalize(uberText);
  const homeText = rowHomeText(uberRow);
  const prodText = productionLocationText(prodRow);

  if (/\b(CASA|RESIDENCIA|RESIDENCIAL|DOMICILIO|MORADIA)\b/.test(normUber)) return true;
  if (homeText && tokenOverlapScore(uberText, homeText) >= 0.45) return true;
  if (prodText && tokenOverlapScore(uberText, prodText) >= 0.35) return true;

  const origem = normalize(uberRow.endereco_partida || uberRow.origem || '');
  const destino = normalize(uberRow.endereco_destino || uberRow.destino || '');
  const local = normalize(prodText);
  if (local && (origem.includes(local) || destino.includes(local) || local.includes(origem) || local.includes(destino))) return true;

  return false;
}

function getProductionMatch(row) {
  const data = dateKey(row.data_solicitacao_local || row.data_corrida || row.data);
  if (!data || !state.producao.length) return null;
  return state.producao.find((prod) => {
    if (dateKey(prod.data || prod.data_producao || prod.data_servico) !== data) return false;
    if (!isSameEmployee(row, prod)) return false;
    return isNearHomeOrBoarding(row, prod);
  }) || null;
}

function isEmbarque(row) {
  if (row.__embarqueMatch !== undefined) return Boolean(row.__embarqueMatch);
  const match = getProductionMatch(row);
  row.__embarqueMatch = match || null;
  return Boolean(match);
}

function computedStatus(row) {
  const manual = statusOf(row);
  if (manual && manual !== 'PENDENTE') return manual;
  if (isEmbarque(row)) return 'EMBARQUE';
  if (isUsoPessoal(row)) return 'ATENCAO';
  return manual || 'PENDENTE';
}

function statusChip(row) {
  const key = computedStatus(row);
  const map = {
    VALIDADA: ['Validada', 'ok'],
    CONFERIDO: ['Conferida', 'ok'],
    EMBARQUE: ['Embarque', 'ok'],
    ATENCAO: ['Atenção', 'warn'],
    ATENÇÃO: ['Atenção', 'warn'],
    CAIXA_COLABORADOR: ['Caixa colaborador', 'danger'],
    GORJETA: ['Gorjeta', 'warn'],
    PENDENTE: ['Pendente', 'neutral'],
  };
  const item = map[key] || [key.replaceAll('_', ' '), 'neutral'];
  return `<span class="uber-chip uber-chip-${item[1]}">${escapeHtml(item[0])}</span>`;
}

function rowText(row) {
  return normalize([
    row.nome_colaborador,
    row.nome,
    row.email,
    row.supervisao,
    row.regional,
    row.coordenacao,
    row.endereco_partida,
    row.endereco_destino,
    row.centro_custo,
    computedStatus(row),
  ].filter(Boolean).join(' '));
}

const STATUS_GROUPS = {
  PENDENTE: ['PENDENTE'],
  EMBARQUE: ['EMBARQUE'],
  ATENCAO_CAIXA: ['ATENCAO', 'ATENÇÃO', 'CAIXA_COLABORADOR'],
  VALIDADA: ['VALIDADA', 'CONFERIDO'],
};

function textFilteredRows() {
  const q = normalize(state.filters.q);
  return state.rows.filter((row) => !q || rowText(row).includes(q));
}

function filteredRows() {
  const group = STATUS_GROUPS[state.filters.status];
  return textFilteredRows().filter((row) => !group || group.includes(computedStatus(row)));
}

function splitRows() {
  const rows = filteredRows();
  return {
    valida: rows.filter((row) => computedStatus(row) === 'VALIDADA'),
    caixa: rows.filter((row) => computedStatus(row) === 'CAIXA_COLABORADOR'),
    conferir: rows.filter((row) => !['VALIDADA', 'CAIXA_COLABORADOR'].includes(computedStatus(row))),
  };
}

function getValor(row) {
  return Number(row.valor ?? row.preco_liquido ?? row.preco_liquido_parceiro ?? 0) || 0;
}

function metrics() {
  const rows = textFilteredRows();
  const total = rows.length;
  const pendentes = rows.filter((row) => computedStatus(row) === 'PENDENTE').length;
  const embarques = rows.filter((row) => computedStatus(row) === 'EMBARQUE').length;
  const atencaoCaixa = rows.filter((row) => STATUS_GROUPS.ATENCAO_CAIXA.includes(computedStatus(row))).length;
  const validadas = rows.filter((row) => STATUS_GROUPS.VALIDADA.includes(computedStatus(row))).length;
  const valor = rows.reduce((sum, row) => sum + getValor(row), 0);
  return { total, pendentes, embarques, atencaoCaixa, validadas, valor };
}

function styles() {
  return `<style>
    .uber-shell{color:#e2e2f0}.uber-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;background:radial-gradient(circle at top right,rgba(34,197,94,.16),transparent 34%),linear-gradient(180deg,rgba(8,22,17,.96),rgba(3,13,10,.96));border:1px solid rgba(148,163,184,.16);border-radius:28px;padding:24px;box-shadow:0 22px 70px rgba(0,0,0,.28)}.uber-kicker{display:inline-flex;color:#86efac;font-size:12px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.uber-title{margin:0;color:#f8fafc;font-size:clamp(24px,2.6vw,36px);letter-spacing:-.045em}.uber-sub{max-width:850px;margin:10px 0 0;color:#6b7280;line-height:1.55}.uber-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.uber-btn{border:1px solid rgba(34,197,94,.28);background:rgba(15,23,42,.78);color:#e2e2f0;border-radius:14px;padding:11px 14px;font-weight:950;cursor:pointer;min-height:42px}.uber-btn:hover{background:rgba(22,101,52,.24)}.uber-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;border:0}.uber-btn.danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.34)}.uber-btn:disabled{opacity:.55;cursor:not-allowed}.uber-grid{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:14px;margin-top:16px}.uber-kpi{background:rgba(8,22,17,.72);border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:17px;box-shadow:0 18px 50px rgba(0,0,0,.20)}.uber-kpi span{display:block;color:#6b7280;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.uber-kpi strong{display:block;color:#f8fafc;font-size:28px;margin-top:8px}.uber-kpi-filter{cursor:pointer;transition:border-color .15s,background .15s}.uber-kpi-filter:hover{border-color:rgba(34,197,94,.4)}.uber-kpi-filter.is-active{border-color:#22c55e;background:rgba(22,101,52,.28)}.uber-card{margin-top:16px;background:rgba(8,22,17,.72);border:1px solid rgba(148,163,184,.14);border-radius:24px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.22)}.uber-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.uber-card h3{margin:0;color:#f8fafc}.uber-card p{margin:5px 0 0;color:#6b7280;font-size:13px}.uber-filters{display:grid;grid-template-columns:150px 150px minmax(240px,1fr) auto;gap:10px;align-items:end}.uber-field label{display:block;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px}.uber-input,.uber-select{width:100%;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:14px;padding:11px 12px;outline:none;color-scheme:dark}.uber-select option{background:#0d0d18;color:#e2e2f0}.uber-feedback{min-height:22px;color:#6b7280;font-size:13px;margin-top:10px}.uber-feedback.error{color:#fecaca}.uber-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px;background:rgba(2,6,23,.30)}.uber-table{width:100%;border-collapse:collapse;min-width:1360px}.uber-table th,.uber-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.10);text-align:left;vertical-align:top}.uber-table th{background:rgba(15,23,42,.92);color:#bbf7d0;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.uber-table td{color:#e2e2f0;font-size:13px}.uber-table small{display:block;color:#6b7280;margin-top:4px;line-height:1.35}.uber-row-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;min-width:150px}.uber-row-actions .uber-btn{font-size:12px;padding:8px 10px;min-height:34px}.uber-chip{display:inline-flex;align-items:center;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:950;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.uber-chip-ok{background:rgba(34,197,94,.16);color:#bbf7d0;border-color:rgba(34,197,94,.30)}.uber-chip-warn{background:rgba(234,179,8,.14);color:#fde68a;border-color:rgba(234,179,8,.30)}.uber-chip-danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.34)}.uber-chip-neutral{background:rgba(148,163,184,.12);color:#cbd5e1}.uber-empty{text-align:center;color:#6b7280;padding:28px!important}.uber-conferidas{margin-top:18px;border-color:rgba(34,197,94,.24);background:rgba(4,24,18,.55)}@media(max-width:1180px){.uber-grid{grid-template-columns:repeat(2,1fr)}.uber-filters{grid-template-columns:1fr 1fr}}@media(max-width:760px){.uber-hero,.uber-card-head{display:block}.uber-actions{justify-content:flex-start;margin-top:12px}.uber-grid,.uber-filters{grid-template-columns:1fr}}
  </style>`;
}

function renderShell(content) {
  content.innerHTML = `${styles()}
    <section class="uber-shell">
      <div class="uber-hero">
        <div>
          <div class="uber-kicker">Conferência Uber</div>
          <h2 class="uber-title">Uber</h2>
          <p class="uber-sub">Visualize todos os lançamentos sincronizados, confira as corridas e identifique automaticamente quando a despesa estiver ligada ao embarque com base na Produção Diária.</p>
        </div>
        <div class="uber-actions">
          <button class="uber-btn" type="button" data-export-csv>⬇ Exportar CSV</button>
          <button class="uber-btn" type="button" data-refresh>↻ Atualizar</button>
          <button class="uber-btn" type="button" data-gps-pendentes>Converter GPS pendentes</button>
          <button class="uber-btn primary" type="button" data-sync-api>Sincronizar API</button>
        </div>
      </div>
      <div class="uber-grid" data-metrics></div>
      <section class="uber-card">
        <div class="uber-card-head">
          <div>
            <h3>Filtros</h3>
            <p>Sem datas preenchidas o painel mostra todos os lançamentos Uber carregados. Informe um período apenas quando quiser restringir a consulta.</p>
          </div>
        </div>
        <form class="uber-filters" data-filter-form>
          <div class="uber-field"><label>Data inicial</label><input class="uber-input" type="date" data-inicio value="${escapeHtml(state.filters.inicio)}"></div>
          <div class="uber-field"><label>Data final</label><input class="uber-input" type="date" data-fim value="${escapeHtml(state.filters.fim)}"></div>
          <div class="uber-field"><label>Buscar</label><input class="uber-input" type="search" data-q placeholder="Colaborador, e-mail, regional, endereço..." value="${escapeHtml(state.filters.q)}"></div>
          <button class="uber-btn primary" type="submit">Aplicar</button>
        </form>
        <div class="uber-feedback" data-feedback></div>
      </section>
      <section class="uber-card">
        <div class="uber-card-head"><div><h3>Conferir</h3><p>Corridas pendentes, em atenção ou identificadas como embarque que ainda precisam de uma decisão.</p></div></div>
        <div data-conferir></div>
      </section>
      <section class="uber-card uber-conferidas">
        <div class="uber-card-head"><div><h3>Caixa colaborador</h3><p>Corridas marcadas para reembolso/caixa do colaborador.</p></div></div>
        <div data-caixa></div>
      </section>
      <section class="uber-card uber-conferidas">
        <div class="uber-card-head"><div><h3>Valida</h3><p>Corridas já validadas.</p></div></div>
        <div data-valida></div>
      </section>
    </section>`;
  bindEvents(content);
}

function setFeedback(message, error = false) {
  const el = document.querySelector('[data-feedback]');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(error));
}

function renderMetrics() {
  const m = metrics();
  const target = document.querySelector('[data-metrics]');
  if (!target) return;
  const active = state.filters.status || '';
  const filters = [
    ['', 'Corridas', m.total],
    ['PENDENTE', 'Pendentes', m.pendentes],
    ['EMBARQUE', 'Embarque', m.embarques],
    ['ATENCAO_CAIXA', 'Atenção/Caixa', m.atencaoCaixa],
    ['VALIDADA', 'Validadas', m.validadas],
  ].map(([key, label, value]) => `<article class="uber-kpi uber-kpi-filter${key === active ? ' is-active' : ''}" data-kpi="${escapeHtml(key)}" role="button" tabindex="0"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
  const valor = `<article class="uber-kpi"><span>Valor filtrado</span><strong>${escapeHtml(money(m.valor))}</strong></article>`;
  target.innerHTML = filters + valor;
}

const EMPTY_LABEL = {
  conferir: 'para conferir',
  caixa: 'em caixa colaborador',
  valida: 'validada',
};

function renderTable(target, rows, mode = 'conferir') {
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<div class="uber-table-wrap"><table class="uber-table"><tbody><tr><td class="uber-empty">Nenhuma corrida ${EMPTY_LABEL[mode] || mode} nos filtros atuais.</td></tr></tbody></table></div>`;
    return;
  }
  target.innerHTML = `<div class="uber-table-wrap"><table class="uber-table">
    <thead><tr><th>Data</th><th>Colaborador</th><th>Regional</th><th>Partida</th><th>Destino</th><th>Valor</th><th>Categoria</th><th>Status</th><th>Observação</th><th>Ações</th></tr></thead>
    <tbody>${rows.map((row) => renderRow(row)).join('')}</tbody>
  </table></div>`;
}

function embarqueMotivo(row) {
  const match = row.__embarqueMatch;
  if (!match) return '';
  const partes = [
    'Produção diária encontrada',
    match.os || match.numero_os ? `OS: ${match.os || match.numero_os}` : '',
    match.cliente ? `Cliente: ${match.cliente}` : '',
    productionLocationText(match) ? `Ponto: ${productionLocationText(match)}` : '',
  ].filter(Boolean);
  return partes.join(' · ');
}

function renderRow(row) {
  const isEmb = computedStatus(row) === 'EMBARQUE';
  const motivo = isEmb
    ? embarqueMotivo(row)
    : isUsoPessoal(row)
      ? 'Atenção: observação/detalhamento contém "Pessoal".'
      : (row.motivo_validacao || row.observacao_validacao || row.detalhamento_despesa || row.observacao || '-');
  return `<tr>
    <td>${brDate(row.data_solicitacao_local || row.data_corrida || row.data)}<small>${escapeHtml(row.hora_solicitacao_local || row.hora || '')}</small></td>
    <td><strong>${escapeHtml(row.nome_colaborador || row.nome || '-')}</strong><small>${escapeHtml(row.email || row.matricula || '')}</small></td>
    <td>${escapeHtml(row.supervisao || row.regional || '-')}<small>${escapeHtml(row.coordenacao || row.centro_custo || '')}</small></td>
    <td>${escapeHtml(row.endereco_partida || '-')}</td>
    <td>${escapeHtml(row.endereco_destino || '-')}</td>
    <td><strong>${money(getValor(row))}</strong><small>${escapeHtml(row.metodo_pagamento || '')}</small></td>
    <td>${escapeHtml(row.servico || row.grupo || row.categoria || '-')}<small>${escapeHtml(row.distancia_km || row.distancia_mi || '')}</small></td>
    <td>${statusChip(row)}</td>
    <td>${escapeHtml(motivo || '-')}</td>
    <td><div class="uber-row-actions">
      <button class="uber-btn primary" type="button" data-action="VALIDADA" data-id="${escapeHtml(row.id)}">Validar</button>
      <button class="uber-btn danger" type="button" data-action="CAIXA_COLABORADOR" data-id="${escapeHtml(row.id)}">Caixa</button>
      <button class="uber-btn" type="button" data-action="ATENCAO" data-id="${escapeHtml(row.id)}">Atenção</button>
      <button class="uber-btn" type="button" data-gps data-id="${escapeHtml(row.id)}">${row.partida_latitude != null ? 'GPS ✓' : 'GPS'}</button>
    </div></td>
  </tr>`;
}

function renderData() {
  renderMetrics();
  const split = splitRows();
  renderTable(document.querySelector('[data-conferir]'), split.conferir, 'conferir');
  renderTable(document.querySelector('[data-caixa]'), split.caixa, 'caixa');
  renderTable(document.querySelector('[data-valida]'), split.valida, 'valida');
}

function getFilterValues(root = document) {
  state.filters.inicio = root.querySelector('[data-inicio]')?.value || '';
  state.filters.fim = root.querySelector('[data-fim]')?.value || '';
  state.filters.q = root.querySelector('[data-q]')?.value || '';
}

async function fetchAll(makeQuery, maxRows = MAX_UBER_ROWS) {
  const rows = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, maxRows - 1);
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

function periodFromRows(rows) {
  const dates = rows.map((row) => dateKey(row.data_solicitacao_local || row.data_corrida || row.data)).filter(Boolean).sort();
  if (!dates.length) return { inicio: null, fim: null };
  return { inicio: dates[0], fim: dates[dates.length - 1] };
}

async function loadProducaoForRows(rows) {
  state.producao = [];
  const period = periodFromRows(rows);
  if (!period.inicio || !period.fim) return;
  try {
    const prod = await fetchAll(() => {
      let query = supabase
        .from('relatorio_resultado_diario')
        .select('*')
        .order('data', { ascending: false, nullsFirst: false });
      query = query.gte('data', period.inicio).lte('data', period.fim);
      return query;
    }, 20000);
    state.producao = prod;
    state.rows.forEach((row) => { delete row.__embarqueMatch; });
  } catch (error) {
    console.warn('[Uber] Produção diária indisponível para status Embarque:', error);
    state.producao = [];
  }
}

function saveCache() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      rows: state.rows,
      producao: state.producao,
      filters: state.filters,
    }));
  } catch (error) {
    console.warn('[Uber] saveCache:', error);
  }
}

function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const cached = JSON.parse(raw);
    if (!Array.isArray(cached?.rows)) return false;
    state.rows = cached.rows;
    state.producao = Array.isArray(cached.producao) ? cached.producao : [];
    state.filters = { ...state.filters, ...(cached.filters || {}) };
    return true;
  } catch (error) {
    console.warn('[Uber] loadCache:', error);
    return false;
  }
}

async function loadRows(options = {}) {
  const { silent = false } = options;
  if (state.loading) return;
  state.loading = true;
  if (!silent) setFeedback('Carregando lançamentos Uber...');
  try {
    const rows = await fetchAll(() => {
      let query = supabase
        .from('vw_conferencia_uber_corridas')
        .select('*')
        .order('data_solicitacao_local', { ascending: false, nullsFirst: false });
      if (state.filters.inicio) query = query.gte('data_solicitacao_local', state.filters.inicio);
      if (state.filters.fim) query = query.lte('data_solicitacao_local', state.filters.fim);
      return query;
    });

    state.rows = rows;
    if (!silent) setFeedback('Cruzando lançamentos Uber com Produção Diária...');
    await loadProducaoForRows(rows);

    const embarques = rows.filter((row) => computedStatus(row) === 'EMBARQUE').length;
    const textoPeriodo = state.filters.inicio || state.filters.fim ? 'no período' : 'carregados';
    setFeedback(`Atualizado: ${state.rows.length} lançamento(s) Uber ${textoPeriodo}. ${embarques} marcado(s) como Embarque.`);
    saveCache();
  } catch (error) {
    console.error('[Uber] loadRows:', error);
    const mantendoCache = silent && state.rows.length;
    setFeedback(mantendoCache
      ? `Não foi possível atualizar agora. Mostrando os últimos dados carregados. Detalhe: ${error.message}`
      : `Não foi possível carregar o Uber. Rode o SQL enviado no ZIP. Detalhe: ${error.message}`, true);
    if (!mantendoCache) {
      state.rows = [];
      state.producao = [];
    }
  } finally {
    state.loading = false;
    renderData();
  }
}

async function syncApi(root) {
  if (state.syncing) return;
  getFilterValues(root);
  state.syncing = true;
  const btn = root.querySelector('[data-sync-api]');
  if (btn) btn.disabled = true;
  setFeedback('Sincronizando corridas pela API Uber...');
  try {
    const dataInicial = state.filters.inicio || todayISO();
    const dataFinal = state.filters.fim || dataInicial;
    const { data, error } = await supabase.functions.invoke('sync-uber-corridas', {
      body: { data_inicial: dataInicial, data_final: dataFinal },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const total = Number(data?.upserted ?? data?.importados ?? data?.total ?? 0);
    const despesas = Number(data?.despesas_sincronizadas ?? data?.despesas?.upserted ?? data?.despesas?.importados ?? data?.despesas?.total ?? 0);
    setFeedback(`Sincronização concluída: ${total} corrida(s) processada(s).${despesas ? ` ${despesas} despesa(s) sincronizada(s).` : ''}`);
    await loadRows();
  } catch (error) {
    console.error('[Uber] syncApi:', error);
    setFeedback(`Falha ao sincronizar API Uber: ${error.message || 'verifique a Edge Function e os tokens em TI > Integrações.'}`, true);
  } finally {
    state.syncing = false;
    if (btn) btn.disabled = false;
  }
}

const STATUS_VALIDACAO_DB = {
  VALIDADA: 'VALIDADO',
  CAIXA_COLABORADOR: 'CAIXA',
};

async function updateStatus(id, status) {
  setFeedback('Salvando conferência da corrida...');
  try {
    const { error } = await supabase
      .from('conferencia_uber_corridas')
      .update({
        classificacao_manual: status,
        status_validacao: STATUS_VALIDACAO_DB[status] || status,
        validado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    const row = state.rows.find((item) => String(item.id) === String(id));
    if (row) Object.assign(row, { classificacao_manual: status, status_validacao: STATUS_VALIDACAO_DB[status] || status, validado_em: new Date().toISOString() });
    saveCache();
    setFeedback('Corrida atualizada.');
    renderData();
  } catch (error) {
    console.error('[Uber] updateStatus:', error);
    setFeedback(`Não foi possível salvar a conferência: ${error.message}`, true);
  }
}

function aplicarResultadoGps(resultado) {
  if (!resultado?.id) return;
  const row = state.rows.find((item) => String(item.id) === String(resultado.id));
  if (!row) return;
  if (resultado.geocodificado !== false) row.partida_latitude = row.partida_latitude ?? true;
  if (resultado.validado) {
    Object.assign(row, {
      status_validacao: 'VALIDADO',
      classificacao_manual: 'VALIDADA',
      motivo_validacao: `Validação automática: O.S. ${resultado.os} com laudo do colaborador a ${Math.round(resultado.distancia_m)} m da partida.`,
      observacao_validacao: null,
      validado_em: new Date().toISOString(),
    });
  } else if (resultado.motivo === 'fora_do_raio') {
    row.observacao_validacao = `O.S. ${resultado.os} tem laudo do colaborador na data, mas a ${(resultado.distancia_m / 1000).toFixed(1)} km da partida (fora do raio de 2km).`;
  } else if (resultado.motivo === 'sem_correspondencia') {
    row.observacao_validacao = 'Nenhuma O.S. com laudo do colaborador encontrada na data da corrida.';
  } else if (resultado.geocodificado === false) {
    row.observacao_validacao = 'Não foi possível localizar o endereço de partida no mapa. Confira o endereço ou valide manualmente.';
  }
}

async function geocodificarCorrida(id, btn) {
  if (!id) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Convertendo...'; }
  setFeedback('Convertendo endereço em GPS e comparando com a O.S...');
  try {
    const { data, error } = await supabase.functions.invoke('uber-geocodificar-gps', { body: { id } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const resultado = data?.resultados?.[0];
    if (resultado?.error) throw new Error(resultado.error);
    aplicarResultadoGps(resultado);
    saveCache();
    if (resultado?.validado) {
      setFeedback(`Corrida validada automaticamente: O.S. ${resultado.os} encontrada a ${Math.round(resultado.distancia_m)}m com laudo do colaborador.`);
    } else if (resultado?.geocodificado === false) {
      setFeedback('Não foi possível localizar o endereço no mapa. Confira o endereço ou valide manualmente.', true);
    } else {
      setFeedback('Endereço convertido em GPS. Nenhuma O.S. com laudo do colaborador em raio de 2km — confira manualmente.');
    }
    renderData();
  } catch (error) {
    console.error('[Uber] geocodificarCorrida:', error);
    setFeedback(`Falha ao converter GPS: ${error.message}`, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'GPS'; }
  }
}

async function converterGpsPendentes(root) {
  if (state.convertendoGps) return;
  state.convertendoGps = true;
  const btn = root.querySelector('[data-gps-pendentes]');
  if (btn) { btn.disabled = true; btn.textContent = 'Convertendo...'; }
  setFeedback('Convertendo endereços pendentes em GPS...');
  try {
    const { data, error } = await supabase.functions.invoke('uber-geocodificar-gps', { body: { modo: 'pendentes', limite: 10 } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    (data?.resultados || []).forEach(aplicarResultadoGps);
    saveCache();
    setFeedback(`${data?.geocodificados ?? 0} corrida(s) convertida(s) em GPS, ${data?.validados ?? 0} validada(s) automaticamente por O.S. com laudo dentro de 2km.`);
    renderData();
  } catch (error) {
    console.error('[Uber] converterGpsPendentes:', error);
    setFeedback(`Falha ao converter GPS pendentes: ${error.message}`, true);
  } finally {
    state.convertendoGps = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Converter GPS pendentes'; }
  }
}

function exportCsv() {
  const rows = filteredRows();
  if (!rows.length) return setFeedback('Nenhuma corrida para exportar.', true);
  const headers = ['Data', 'Hora', 'Colaborador', 'Regional', 'Partida', 'Destino', 'Valor', 'Status', 'Observação'];
  const csvRows = rows.map((row) => [
    row.data_solicitacao_local || row.data_corrida || '',
    row.hora_solicitacao_local || '',
    row.nome_colaborador || row.nome || '',
    row.supervisao || row.regional || '',
    row.endereco_partida || '',
    row.endereco_destino || '',
    getValor(row),
    computedStatus(row),
    computedStatus(row) === 'EMBARQUE' ? embarqueMotivo(row) : (row.motivo_validacao || row.observacao_validacao || row.detalhamento_despesa || row.observacao || ''),
  ]);
  const csv = [headers, ...csvRows].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `uber-conferencia-${state.filters.inicio || 'todos'}-a-${state.filters.fim || 'todos'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function bindEvents(root) {
  root.querySelector('[data-filter-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    getFilterValues(root);
    loadRows();
  });
  root.querySelector('[data-refresh]')?.addEventListener('click', () => {
    getFilterValues(root);
    loadRows();
  });
  root.querySelector('[data-sync-api]')?.addEventListener('click', () => syncApi(root));
  root.querySelector('[data-export-csv]')?.addEventListener('click', exportCsv);
  root.querySelector('[data-gps-pendentes]')?.addEventListener('click', () => converterGpsPendentes(root));
  root.querySelector('[data-q]')?.addEventListener('input', (event) => {
    state.filters.q = event.target.value || '';
    renderData();
  });
  root.addEventListener('click', (event) => {
    const kpi = event.target.closest('[data-kpi]');
    if (kpi) {
      const key = kpi.dataset.kpi;
      state.filters.status = state.filters.status === key ? '' : key;
      renderData();
      return;
    }
    const gpsBtn = event.target.closest('[data-gps]');
    if (gpsBtn) {
      geocodificarCorrida(gpsBtn.dataset.id, gpsBtn);
      return;
    }
    const btn = event.target.closest('[data-action][data-id]');
    if (!btn) return;
    updateStatus(btn.dataset.id, btn.dataset.action);
  });
}

export async function renderContent(content) {
  const cached = loadCache();
  renderShell(content);
  if (cached) {
    renderData();
    setFeedback(`${state.rows.length} lançamento(s) Uber carregados. Atualizando em segundo plano...`);
    loadRows({ silent: true });
  } else {
    await loadRows();
  }
}

initProtectedPage('Uber · Conferência', renderContent);
