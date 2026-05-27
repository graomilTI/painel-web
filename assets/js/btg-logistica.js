import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BTG_RE = /BTG\s+PACTUAL\s+COMMODITIES\s+SERTRADING/i;
const CONTRATO_BTG_RE = /^P\d{5}\.\d{3}$/i;
const AJUSTADOS_KEY = 'btg_logistica_ajustados_v1';
const BR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function norm(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim();
}

function fnum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const c = String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const p = parseFloat(c);
  return isFinite(p) ? p : 0;
}

function fmt(v) {
  const n = fnum(v);
  return n === 0 ? '0' : BR.format(n);
}

function pushUnique(arr, value) {
  const v = clean(value);
  if (!v || v === '—') return;
  if (!arr.some(x => norm(x) === norm(v))) arr.push(v);
}

function uniqBy(arr, fn) {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const k = fn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function clean(v) {
  return String(v ?? '').trim();
}

function excelDateBtg(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  const text = String(value).trim();
  const dm = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dm) return `${dm[3].length === 2 ? '20' + dm[3] : dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function contratoNorm(v) {
  return clean(v).toUpperCase().replace(/\s+/g, '');
}

function isContratoBtg(v) {
  return CONTRATO_BTG_RE.test(contratoNorm(v));
}

function contratoLabel(v) {
  const c = contratoNorm(v);
  return isContratoBtg(c) ? c : 'CORRIGIR CONTRATO';
}

function loadAjustados() {
  try { return new Set(JSON.parse(localStorage.getItem(AJUSTADOS_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveAjustados(set) {
  localStorage.setItem(AJUSTADOS_KEY, JSON.stringify([...set]));
}

function rowKey(r) {
  const c = contratoNorm(r.contratoOriginal || r.contrato);
  const pessoa = norm(r.colaborador || '');
  const os = clean(r.os || '');
  if (isContratoBtg(c)) return `contrato:${c}|os:${os}|colab:${pessoa}`;
  return `linha:${norm(`${r.fonte}|${r.os}|${r.tipoSolicitacao}|${r.colaborador}|${r.lote}|${r.remanescente}`)}`;
}

function findHeaderRow(raw, checks, maxRows = 50) {
  for (let i = 0; i < Math.min(maxRows, raw.length); i++) {
    const txt = norm(raw[i].map(c => String(c ?? '')).join(' '));
    if (checks.every(ch => txt.includes(ch))) return i;
  }
  return 0;
}

function colIndex(header, matchers) {
  const normalized = header.map(c => norm(c));
  for (const matcher of matchers) {
    const idx = normalized.findIndex(matcher);
    if (idx >= 0) return idx;
  }
  return -1;
}

// ── Detecção automática de tipo de relatório ──────────────────────────────────
// Retorna 'distribuicao' | 'btg' | 'unknown'
function detectFileType(wb) {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (const row of raw.slice(0, 50)) {
      const r = norm(row.map(c => String(c ?? '')).join(' '));
      if (r.includes('FUNCION') && r.includes('REMANESCENTE') && (r.includes('O S') || r.includes('OS'))) return 'distribuicao';
      if (r.includes('ORDEM') && r.includes('FRETE') && r.includes('CONTRATO')) return 'btg';
      if (r.includes('ORDEM') && r.includes('SERVIC') && r.includes('CONTRATO')) return 'btg';
      if (r.includes('CLASSIFICADOR') && r.includes('DESIGNADO')) return 'btg';
      if (r.includes('ORDEM') && r.includes('FRETE')) return 'btg';
      if (r.includes('CONTRATO') && (r.includes('COMMODITY') || r.includes('CLASSIFICADOR') || r.includes('SOLICITACAO') || r.includes('RECEBIMENTO'))) return 'btg';
    }
  }
  return 'unknown';
}

// ── Estado ────────────────────────────────────────────────────────────────────
const state = {
  dbRows: [],
  distRows: null,
  allOsRows: null,
  btgRows: null,
  btgMap: null,
  finalRows: [],
  mode: 'db',
  busca: '',
  filtroStatus: 'todos',
  sort: { col: 'os', dir: 'asc' },
  loaded: { dist: null, btg: null },
  ajustados: loadAjustados(),
};


async function loadAjustadosDb() {
  try {
    const { data, error } = await supabase.from('logistica_btg_ajustes').select('row_key, status').eq('status', 'AJUSTADO').limit(10000);
    if (error) throw error;
    for (const item of (data || [])) if (item?.row_key) state.ajustados.add(item.row_key);
    saveAjustados(state.ajustados);
  } catch (err) { console.warn('Ajustes BTG ainda não persistidos no banco:', err?.message || err); }
}
async function persistAjustado(rowKeyValue) {
  if (!rowKeyValue) return;
  try {
    const { error } = await supabase.from('logistica_btg_ajustes').upsert({ row_key: rowKeyValue, status: 'AJUSTADO', updated_at: new Date().toISOString() }, { onConflict: 'row_key' });
    if (error) throw error;
  } catch (err) { console.warn('Não foi possível salvar OK/Ajustado no Supabase:', err?.message || err); }
}
async function loadSavedBtgData() {
  try {
    const { data, error } = await supabase.from('logistica_btg_solicitacoes').select('contrato_original, contrato_status, numero_os_relatorio, tipo_solicitacao, cliente, commodity, quantidade, aba, linha').order('linha', { ascending: true }).limit(10000);
    if (error) throw error;
    const rows = (data || []).map((item) => ({ os: clean(item.numero_os_relatorio), contratoOriginal: contratoNorm(item.contrato_original), contrato: item.contrato_status || contratoLabel(item.contrato_original), tipoSolicitacao: clean(item.tipo_solicitacao) || 'Relatório BTG', cliente: clean(item.cliente), commodity: clean(item.commodity), qtde: item.quantidade, sheet: item.aba, rowNumber: item.linha, fonte: 'Relatório BTG' }));
    state.btgRows = rows.length ? rows : null;
    state.btgMap = {};
    for (const r of rows) { const c = contratoNorm(r.contratoOriginal); if (isContratoBtg(c)) state.btgMap[c] = r; }
    state.loaded.btg = rows.length ? `Banco de dados (${rows.length} solicitações)` : null;
    if (rows.length) state.mode = 'xlsx';
  } catch (err) { console.warn('Solicitações BTG salvas ainda não disponíveis:', err?.message || err); }
}
async function persistAllOsRows(rows) {
  // Deduplica por numero_os (UNIQUE constraint) — mantém última ocorrência
  const seen = new Map();
  for (const row of (rows || [])) { if (row.numero_os) seen.set(row.numero_os, row); }
  const list = [...seen.values()];
  if (!list.length) return;

  const { error: clearError } = await supabase.from('operacional_os').delete().gte('created_at', '2000-01-01');
  if (clearError) throw new Error(`Erro ao limpar OS: ${clearError.message}`);

  for (let i = 0; i < list.length; i += 500) {
    const { error } = await supabase.from('operacional_os').insert(list.slice(i, i + 500));
    if (error) throw new Error(`Erro ao inserir OS (lote ${i / 500 + 1}): ${error.message}`);
  }
}

async function persistDistribuicaoRows(rows) {
  const list = rows || [];
  if (!list.length) return;

  // 1. Salva todas as linhas da Distribuição em logistica_btg_distribuicao
  try {
    const { error: clearError } = await supabase.from('logistica_btg_distribuicao').delete().not('id', 'is', null);
    if (clearError) throw clearError;
    const distPayload = list.map(r => ({
      numero_os:   clean(r.os) || null,
      colaborador: clean(r.colaborador) || null,
      supervisao:  clean(r.supervisao) || null,
      lote:        fnum(r.lote),
      remanescente:fnum(r.remanescente),
      updated_at:  new Date().toISOString(),
    }));
    for (let i = 0; i < distPayload.length; i += 500) {
      const { error } = await supabase.from('logistica_btg_distribuicao').insert(distPayload.slice(i, i + 500));
      if (error) throw error;
    }
  } catch (err) { console.warn('Não foi possível salvar Distribuição no banco:', err?.message || err); }

  // 2. Atualiza operacional_os_colaboradores com os nomes da Distribuição
  try {
    const numeros = [...new Set(list.map(r => String(r.os || '').trim()).filter(Boolean))];
    const osMap = new Map();
    for (let i = 0; i < numeros.length; i += 800) {
      const { data, error } = await supabase.from('operacional_os').select('id, numero_os').in('numero_os', numeros.slice(i, i + 800));
      if (error) throw error;
      (data || []).forEach(item => osMap.set(String(item.numero_os), item.id));
    }
    const payload = [];
    const seen = new Set();
    for (const row of list) {
      const osId = osMap.get(String(row.os || '').trim());
      if (!osId || !clean(row.colaborador) || row.colaborador === '—') continue;
      const key = `${osId}|${norm(row.colaborador)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      payload.push({ os_id: osId, colaborador_key: norm(row.colaborador), colaborador_nome: row.colaborador });
    }
    const { error: clearError } = await supabase.from('operacional_os_colaboradores').delete().gte('created_at', '2000-01-01');
    if (clearError) throw clearError;
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('operacional_os_colaboradores').insert(payload.slice(i, i + 500));
      if (error) throw error;
    }
  } catch (err) { console.warn('Não foi possível salvar colaboradores no banco:', err?.message || err); }
}

async function loadSavedDistData() {
  try {
    const { data, error } = await supabase
      .from('logistica_btg_distribuicao')
      .select('numero_os, colaborador, supervisao, lote, remanescente')
      .order('id', { ascending: true })
      .limit(20000);
    if (error) throw error;
    const rows = (data || []).map(item => ({
      os:          clean(item.numero_os),
      colaborador: clean(item.colaborador) || '—',
      supervisao:  clean(item.supervisao) || '—',
      lote:        item.lote,
      remanescente:item.remanescente,
      fonte:       'Distribuição OS',
    }));
    if (rows.length) {
      state.distRows = rows;
      state.loaded.dist = `Banco de dados (${rows.length} linhas BTG)`;
      state.mode = 'xlsx';
    }
  } catch (err) { console.warn('Distribuição BTG salva ainda não disponível:', err?.message || err); }
}
async function persistBtgRows(rows) {
  const list = rows || [];
  if (!list.length) return;
  try {
    const { error: clearError } = await supabase.from('logistica_btg_solicitacoes').delete().not('id', 'is', null);
    if (clearError) throw clearError;
    const payload = list.map((r) => ({ contrato_original: contratoNorm(r.contratoOriginal), contrato_status: contratoLabel(r.contratoOriginal), numero_os_relatorio: clean(r.os) || null, tipo_solicitacao: clean(r.tipoSolicitacao) || 'Relatório BTG', cliente: clean(r.cliente) || null, commodity: clean(r.commodity) || null, quantidade: fnum(r.qtde), aba: r.sheet || null, linha: r.rowNumber || null, updated_at: new Date().toISOString() }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('logistica_btg_solicitacoes').insert(payload.slice(i, i + 500));
      if (error) throw error;
    }
  } catch (err) { console.warn('Não foi possível salvar Relatório BTG no banco:', err?.message || err); }
}

// ── Ordenação / filtro ────────────────────────────────────────────────────────
function sorted(rows) {
  const { col, dir } = state.sort;
  const f = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (['lote', 'remanescente', 'os', 'qtde'].includes(col)) return (fnum(a[col]) - fnum(b[col])) * f;
    return String(a[col] ?? '').localeCompare(String(b[col] ?? ''), 'pt-BR') * f;
  });
}

function filtered() {
  const q = norm(state.busca);
  return sorted(state.finalRows.filter(r => {
    if (state.filtroStatus !== 'todos' && String(r.status || '').toLowerCase() !== state.filtroStatus) return false;
    if (!q) return true;
    return q.split(' ').filter(Boolean)
      .every(t => norm(`${r.os} ${r.contrato} ${r.contratoOriginal} ${r.colaborador} ${r.supervisao} ${r.status} ${r.tipoSolicitacao}`).includes(t));
  }));
}

function counts() {
  return state.finalRows.reduce((acc, r) => {
    const k = String(r.status || 'OK').toLowerCase();
    acc[k] = (acc[k] || 0) + 1;
    acc.todos += 1;
    return acc;
  }, { todos: 0 });
}

// ── Render ────────────────────────────────────────────────────────────────────
function thHtml(col, label) {
  const arr = state.sort.col !== col
    ? '<span style="opacity:.3">↕</span>'
    : state.sort.dir === 'asc' ? '↑' : '↓';
  return `<th data-sort="${esc(col)}" style="cursor:pointer;user-select:none">${esc(label)} ${arr}</th>`;
}

function renderChips(el) {
  const distLoaded = !!state.loaded.dist;
  const btgLoaded = !!state.loaded.btg;
  el.chipDist.className = `btg-chip-file ${distLoaded ? 'loaded' : ''}`;
  el.chipBtg.className = `btg-chip-file ${btgLoaded ? 'loaded' : ''}`;
  el.chipDist.textContent = distLoaded ? `Distribuição: ${state.loaded.dist}` : 'Distribuição de O.S. — aguardando';
  el.chipBtg.textContent = btgLoaded ? `Relatório BTG: ${state.loaded.btg}` : 'Relatório BTG — aguardando';
}

function renderStatusButtons(el) {
  const c = counts();
  const items = [
    ['todos', 'Todos'],
    ['ok', 'OK'],
    ['pendencia cliente', 'Pendência Cliente'],
    ['verificar', 'Verificar'],
    ['falta classificador', 'Falta Classificador'],
    ['ajustado', 'Ajustado'],
  ];
  el.statusFilters.innerHTML = items.map(([key, label]) => `
    <button class="btg-filter-btn ${state.filtroStatus === key ? 'active' : ''}" data-status="${esc(key)}">
      ${esc(label)} <b>${c[key] || 0}</b>
    </button>`).join('');
}

function render(el) {
  const rows = filtered();
  el.modeTag.textContent = state.mode === 'xlsx' ? 'RELATÓRIOS' : 'BASE DE DADOS';
  el.modeTag.className = `badge${state.mode === 'xlsx' ? ' badge-info' : ''}`;
  el.count.textContent = `${rows.length}`;
  el.tableTitle.textContent = `Lista BTG (${rows.length})`;
  el.tableSubtitle.textContent = state.mode === 'xlsx'
    ? 'Importação unificada: Distribuição de OS + Relatório BTG com validação de contrato e OS'
    : 'Dados do banco de dados (operacional_os)';

  renderChips(el);
  renderStatusButtons(el);

  const naoOkCount = state.finalRows.filter(r => r.status !== 'OK' && r.status !== 'AJUSTADO').length;
  el.exportVerificar.disabled = !naoOkCount;
  el.exportVerificar.textContent = naoOkCount ? `Gerar XLS pendências (${naoOkCount})` : 'Gerar XLS pendências';

  if (!rows.length) {
    const msg = state.mode === 'db' && !state.dbRows.length
      ? 'Nenhuma O.S. BTG encontrada no banco. Carregue os relatórios xlsx.'
      : 'Nenhum resultado para o filtro atual.';
    el.feedback.textContent = msg;
    el.tableWrap.innerHTML = `<div class="btg-empty">${msg}</div>`;
    return;
  }

  el.feedback.textContent = `${rows.length} registro${rows.length !== 1 ? 's' : ''} BTG${state.mode === 'xlsx' ? ' reconciliados' : ''}.`;
  el.tableWrap.innerHTML = `
    <div class="btg-table-wrap">
      <table class="btg-table">
        <thead><tr>
          ${thHtml('status', 'Status')}
          ${thHtml('os', 'O.S.')}
          ${thHtml('portal', 'Portal')}
          ${thHtml('contrato', 'Contrato')}
          ${thHtml('tipoSolicitacao', 'Solicitação')}
          ${thHtml('colaborador', 'Colaborador')}
          ${thHtml('supervisao', 'Supervisão')}
          ${thHtml('lote', 'Lote')}
          ${thHtml('remanescente', 'Remanescente')}
          <th>Ações</th>
        </tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody>
      </table>
    </div>`;
}

function statusClass(s) {
  const n = norm(s || '');
  if (n === 'VERIFICAR') return 'status-verificar';
  if (n === 'PENDENCIA CLIENTE') return 'status-pendencia';
  if (n === 'FALTA CLASSIFICADOR') return 'status-falta';
  if (n === 'AJUSTADO') return 'status-info';
  return 'status-ok';
}

function rowHtml(r) {
  const rem = fnum(r.remanescente);
  const lote = fnum(r.lote || r.qtde);
  const pct = lote > 0 ? Math.min(100, (rem / lote) * 100) : 0;
  const chip = rem <= 0 ? 'danger' : pct < 20 ? 'warn' : 'ok';
  const original = contratoNorm(r.contratoOriginal);
  const title = !isContratoBtg(original) && original ? ` title="Valor recebido: ${esc(original)}"` : '';
  const okBtn = r.status === 'AJUSTADO'
    ? `<button class="btg-ok-btn is-adjusted" data-ok="${esc(r.key)}" title="Linha já ajustada">Ajustado</button>`
    : `<button class="btg-ok-btn" data-ok="${esc(r.key)}" title="Marcar esta linha como ajustada">OK</button>`;
  return `<tr class="btg-row ${statusClass(r.status)}">
    <td><span class="btg-status ${statusClass(r.status)}">${esc(r.status || 'OK')}</span></td>
    <td><span class="btg-os-num">${esc(r.os || '—')}</span></td>
    <td><span class="btg-os-num" style="color:#94a3b8">${esc(r.portal || '—')}</span></td>
    <td><span class="btg-contrato"${title}>${esc(r.contrato)}</span></td>
    <td><span class="btg-sup">${esc(r.tipoSolicitacao || r.fonte || '—')}</span></td>
    <td><span class="btg-colab">${esc(r.colaborador || '—')}</span></td>
    <td><span class="btg-sup">${esc(r.supervisao || '—')}</span></td>
    <td><span class="btg-val">${esc(fmt(r.lote || r.qtde))}</span></td>
    <td><span class="btg-chip ${chip}">${esc(fmt(r.remanescente || r.qtde))}</span></td>
    <td>${okBtn}</td>
  </tr>`;
}

// ── Carga do banco ────────────────────────────────────────────────────────────
async function loadDbData(el) {
  el.feedback.textContent = 'Carregando dados BTG...';
  try {
    const { data: osData, error } = await supabase
      .from('operacional_os')
      .select('id, numero_os, contrato, supervisao, lote, remanescente')
      .ilike('cliente', 'BTG PACTUAL COMMODITIES SERTRADING%')
      .order('numero_os', { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const ids = (osData || []).map(r => r.id);
    const colabMap = {};
    if (ids.length) {
      const { data: cd } = await supabase
        .from('operacional_os_colaboradores')
        .select('os_id, colaborador_nome')
        .in('os_id', ids);
      for (const c of (cd || [])) {
        if (!colabMap[c.os_id]) colabMap[c.os_id] = [];
        colabMap[c.os_id].push(c.colaborador_nome);
      }
    }

    state.dbRows = [];
    for (const r of (osData || [])) {
      const original = contratoNorm(r.contrato || '');
      const statusBase = isContratoBtg(original) ? 'OK' : 'CORRIGIR CONTRATO';
      const colaboradores = uniqBy(colabMap[r.id] || [], v => norm(v));
      const nomes = colaboradores.length ? colaboradores : ['—'];
      for (const nome of nomes) {
        const base = {
          os: r.numero_os,
          contrato: contratoLabel(original),
          contratoOriginal: original,
          colaborador: nome || '—',
          supervisao: r.supervisao || '—',
          tipoSolicitacao: 'BASE OS',
          lote: r.lote,
          remanescente: r.remanescente,
          status: statusBase,
          fonte: 'db',
        };
        base.key = rowKey(base);
        state.dbRows.push(base);
      }
    }
  } catch (err) {
    console.error(err);
    state.dbRows = [];
    el.feedback.textContent = `Erro: ${err.message}`;
  }
  await loadAjustadosDb();
  await loadSavedBtgData();
  await loadSavedDistData();
  if (state.mode === 'db') state.finalRows = state.dbRows;
}

// ── Parsers dos relatórios ────────────────────────────────────────────────────
function parseDistribuicao(wb) {
  const btgRows = [];
  const allOsRows = [];
  for (const wsName of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, defval: '' });
    if (!raw.length) continue;

    const hIdx = findHeaderRow(raw, ['FUNCION', 'REMANESCENTE']);
    const h = raw[hIdx] || [];
    const ci = {
      os:          colIndex(h, [c => c === 'O S' || c === 'OS']),
      colaborador: colIndex(h, [c => c.includes('FUNCION')]),
      supervisao:  colIndex(h, [c => c.includes('SUPERVIS')]),
      coordenacao: colIndex(h, [c => c.includes('COORDENA')]),
      cliente:     colIndex(h, [c => c.includes('CLIENTE')]),
      lote:        colIndex(h, [c => c === 'LOTE']),
      remanescente:colIndex(h, [c => c.includes('REMANESCENTE') && !c.includes('PROD')]),
      situacao:    colIndex(h, [c => c.includes('SITUAC')]),
      financeiro:  colIndex(h, [c => c.includes('FINANC')]),
      data:        colIndex(h, [c => c === 'DATA' || c.startsWith('DATA')]),
      servico:     colIndex(h, [c => c.includes('SERVIC')]),
      embarque:    colIndex(h, [c => c.includes('EMBARQUE') || c.includes('PONTO 1') || c.includes('LOCAL EMBARQUE')]),
      destino:     colIndex(h, [c => c.includes('DESTINO')]),
      contrato:    colIndex(h, [c => c === 'CONTRATO']),
      produto:     colIndex(h, [c => c === 'PRODUTO' || c.includes('PROD REMANESCENTE') || (c.includes('PROD') && !c.includes('REMANESCENTE'))]),
      embarcado:   colIndex(h, [c => c === 'EMBARCADO']),
    };
    if (ci.os < 0 || ci.cliente < 0) continue;

    const supIdx = ci.supervisao >= 0 ? ci.supervisao : ci.coordenacao;
    const now = new Date().toISOString();

    for (const r of raw.slice(hIdx + 1)) {
      const osNum = clean(String(r[ci.os] ?? ''));
      const clienteStr = String(r[ci.cliente] ?? '');
      if (!osNum) continue;

      // Todas as OS → operacional_os
      allOsRows.push({
        numero_os:          osNum,
        situacao:           ci.situacao >= 0   ? clean(String(r[ci.situacao]   ?? '')) || null : null,
        financeiro:         ci.financeiro >= 0 ? clean(String(r[ci.financeiro] ?? '')) || null : null,
        data_os:            ci.data >= 0       ? excelDateBtg(r[ci.data]) : null,
        servico:            ci.servico >= 0    ? clean(String(r[ci.servico]    ?? '')) || null : null,
        cliente:            clean(clienteStr) || null,
        embarque:           ci.embarque >= 0   ? clean(String(r[ci.embarque]   ?? '')) || null : null,
        destino:            ci.destino >= 0    ? clean(String(r[ci.destino]    ?? '')) || null : null,
        supervisao:         supIdx >= 0        ? clean(String(r[supIdx]        ?? '')) || null : null,
        contrato:           ci.contrato >= 0   ? clean(String(r[ci.contrato]   ?? '')) || null : null,
        produto:            ci.produto >= 0    ? clean(String(r[ci.produto]    ?? '')) || null : null,
        lote:               fnum(r[ci.lote]),
        embarcado:          ci.embarcado >= 0  ? fnum(r[ci.embarcado]) : 0,
        remanescente:       fnum(r[ci.remanescente]),
        status_gestor:      null,
        status_conferencia: 'PENDENTE',
        raw:                {},
        updated_at:         now,
      });

      // Apenas BTG → logistica_btg_distribuicao
      if (BTG_RE.test(clienteStr)) {
        btgRows.push({
          os:          osNum,
          colaborador: clean(String(r[ci.colaborador] ?? '')) || '—',
          supervisao:  supIdx >= 0 ? clean(String(r[supIdx] ?? '')) || '—' : '—',
          lote:        r[ci.lote],
          remanescente:r[ci.remanescente],
          fonte:       'Distribuição OS',
        });
      }
    }
  }
  return { btgRows, allOsRows };
}

function parseBtg(wb) {
  const rows = [];
  for (const wsName of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, defval: '' });
    if (!raw.length) continue;

    const hIdx = findHeaderRow(raw, ['CONTRATO']);
    const h = raw[hIdx] || [];
    const ci = {
      contrato: colIndex(h, [c => c === 'CONTRATO' || c.includes('CONTRATO')]),
      os: colIndex(h, [
        c => c.includes('ORDEM') && c.includes('SERVI'),
        c => c === 'OS' || c === 'N OS' || c === 'NO OS' || c === 'NUMERO OS',
        c => c.includes('ORDEM') && c.includes('OS'),
      ]),
      tipo: colIndex(h, [c => c.includes('TIPO') || c.includes('SOLICITACAO') || c.includes('OPERACAO') || c.includes('MOVIMENTO')]),
      cliente: colIndex(h, [c => c.includes('CLIENTE') || c.includes('COMPRADOR') || c.includes('TOMADOR')]),
      commodity: colIndex(h, [c => c.includes('COMMODITY') || c.includes('PRODUTO')]),
      qtde: colIndex(h, [c => c.includes('QTDE') || c.includes('QUANTIDADE') || c.includes('VOLUME') || c.includes('TON')]),
      cidade: colIndex(h, [c => c.includes('CIDADE') || c.includes('ORIGEM') || c.includes('DESTINO')]),
    };
    if (ci.contrato < 0) continue;

    raw.slice(hIdx + 1).forEach((r, idx) => {
      const contratoOriginal = contratoNorm(r[ci.contrato]);
      if (!contratoOriginal && !r.some(Boolean)) return;
      const tipoSolicitacao = clean(r[ci.tipo]) || clean(r[ci.commodity]) || clean(r[ci.cidade]) || 'Relatório BTG';
      rows.push({
        os: clean(r[ci.os]),
        contratoOriginal,
        contrato: contratoLabel(contratoOriginal),
        tipoSolicitacao,
        cliente: clean(r[ci.cliente]),
        commodity: clean(r[ci.commodity]),
        qtde: r[ci.qtde],
        sheet: wsName,
        rowNumber: hIdx + idx + 2,
        fonte: 'Relatório BTG',
      });
    });
  }

  const map = {};
  for (const r of rows) {
    if (isContratoBtg(r.contratoOriginal)) map[r.contratoOriginal] = r;
  }
  return { rows, map };
}

// ── Processamento de arquivo(s) ───────────────────────────────────────────────
async function processFile(file, el) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const tipo = detectFileType(wb);

  if (tipo === 'distribuicao') {
    const parsed = parseDistribuicao(wb);
    state.distRows = parsed.btgRows;
    state.allOsRows = parsed.allOsRows;
    state.loaded.dist = `${file.name} (${parsed.btgRows.length} BTG / ${parsed.allOsRows.length} O.S. total)`;
  } else if (tipo === 'btg') {
    const parsed = parseBtg(wb);
    if (!state.btgRows) {
      state.btgRows = parsed.rows;
      state.btgMap = parsed.map;
      state.loaded.btg = `${file.name} (${parsed.rows.length} sol.)`;
    } else {
      state.btgRows = [...state.btgRows, ...parsed.rows];
      for (const [k, v] of Object.entries(parsed.map)) state.btgMap[k] = v;
      state.loaded.btg += ` + ${file.name} (${parsed.rows.length} sol.)`;
    }
  } else {
    console.warn(`Arquivo não reconhecido: ${file.name}`);
    throw new Error(`Arquivo "${file.name}" não reconhecido.`);
  }
}

async function handleFiles(files, el) {
  if (!files?.length) return;

  // Reseta BTG para o novo lote (Distribuição é mantida)
  state.btgRows = null;
  state.btgMap = null;
  state.loaded.btg = null;

  el.feedback.textContent = 'Processando relatórios...';
  el.dropZone.classList.add('btg-loading');

  const erros = [];
  for (const file of files) {
    try {
      await processFile(file, el);
    } catch (err) {
      console.warn(`Erro ao processar "${file.name}":`, err);
      erros.push(file.name);
    }
  }

  if (!state.btgRows?.length && !state.distRows?.length) {
    el.feedback.textContent = erros.length
      ? `Arquivos não reconhecidos: ${erros.join(', ')}. Envie a Distribuição de OS ou o Relatório BTG.`
      : 'Nenhum dado encontrado nos arquivos enviados.';
    el.dropZone.classList.remove('btg-loading');
    renderChips(el);
    return;
  }

  if (state.allOsRows?.length) {
    el.feedback.textContent = `Atualizando lista de O.S. (${state.allOsRows.length} registros)...`;
    try {
      await persistAllOsRows(state.allOsRows);
    } catch (err) {
      el.feedback.textContent = `Falha ao salvar lista de O.S.: ${err.message}`;
      el.dropZone.classList.remove('btg-loading');
      return;
    }
  }
  await persistDistribuicaoRows(state.distRows);
  await persistBtgRows(state.btgRows);

  // Preserva estado do upload antes de recarregar o banco
  const uploadBtgRows    = state.btgRows;
  const uploadBtgMap     = state.btgMap;
  const uploadBtgLoaded  = state.loaded.btg;
  const uploadDistRows   = state.distRows;
  const uploadDistLoaded = state.loaded.dist;

  el.dropZone.classList.remove('btg-loading');
  await loadDbData(el);

  // Restaura se o banco voltou vazio (ex.: falha silenciosa na persistência)
  if (uploadBtgRows?.length && !state.btgRows?.length) {
    state.btgRows = uploadBtgRows;
    state.btgMap  = uploadBtgMap;
    state.mode    = 'xlsx';
  }
  if (uploadBtgLoaded)  state.loaded.btg  = uploadBtgLoaded;
  if (uploadDistRows?.length && !state.distRows?.length) state.distRows = uploadDistRows;
  if (uploadDistLoaded) state.loaded.dist = uploadDistLoaded;

  await reconcile(el);
}

// ── Reconciliação ─────────────────────────────────────────────────────────────
function addToMapArray(map, key, value) {
  if (!key) return;
  const k = String(key);
  if (!map.has(k)) map.set(k, []);
  map.get(k).push(value);
}

function dbIndexes() {
  const byOs = new Map();
  const byContrato = new Map();
  const contratoSet = new Set();
  for (const r of state.dbRows || []) {
    if (r.os) addToMapArray(byOs, r.os, r);
    const c = contratoNorm(r.contratoOriginal || r.contrato);
    if (isContratoBtg(c)) {
      addToMapArray(byContrato, c, r);
      contratoSet.add(c);
    }
  }
  return { byOs, byContrato, contratoSet };
}

function distIndexes() {
  const byOs = new Map();
  for (const r of state.distRows || []) {
    if (r.os) addToMapArray(byOs, r.os, r);
  }
  return { byOs };
}

function applyAdjusted(row) {
  row.key = row.key || rowKey(row);
  if (state.ajustados.has(row.key)) row.status = 'AJUSTADO';
  return row;
}

async function reconcile(el) {
  if (!state.distRows?.length && !state.btgRows?.length) {
    state.mode = 'db';
    state.finalRows = state.dbRows;
    render(el);
    return;
  }

  state.mode = 'xlsx';
  el.feedback.textContent = 'Reconciliando relatórios com a lista de O.S...';

  const { byOs, byContrato, contratoSet } = dbIndexes();
  const { byOs: distByOs } = distIndexes();
  const out = [];
  const coveredContratos = new Set();

  // ── 1. Relatório BTG é a fonte primária ───────────────────────────────────
  // OK               → na Lista de OS + no BTG + colaborador na Distribuição
  // FALTA CLASSIFICADOR → na Lista de OS + no BTG, sem colaborador na Distribuição
  // VERIFICAR        → no BTG mas NÃO na Lista de OS
  for (const btg of (state.btgRows || [])) {
    const c = contratoNorm(btg.contratoOriginal);
    if (isContratoBtg(c)) coveredContratos.add(c);

    const dbRows = isContratoBtg(c) ? (byContrato.get(c) || []) : [];
    const inListaOS = dbRows.length > 0;

    const distRows = [];
    for (const db of dbRows) {
      for (const d of (distByOs.get(String(db.os)) || [])) distRows.push(d);
    }
    if (btg.os) {
      for (const d of (distByOs.get(String(btg.os)) || [])) distRows.push(d);
    }
    const uniqDist = uniqBy(distRows, r => norm(r.colaborador));
    const hasColab = uniqDist.some(r => r.colaborador && r.colaborador !== '—');

    let status;
    if (!inListaOS)     status = 'VERIFICAR';
    else if (!hasColab) status = 'FALTA CLASSIFICADOR';
    else                status = 'OK';

    const pessoas = [];
    for (const db of dbRows) pushUnique(pessoas, db.colaborador);
    for (const dist of uniqDist) pushUnique(pessoas, dist.colaborador);
    if (!pessoas.length) pessoas.push('—');

    for (const pessoa of pessoas) {
      const db   = dbRows.find(x => norm(x.colaborador) === norm(pessoa))   || dbRows[0]   || null;
      const dist = uniqDist.find(x => norm(x.colaborador) === norm(pessoa)) || uniqDist[0] || null;
      out.push(applyAdjusted({
        status,
        os: db?.os || btg.os || dist?.os || '—',
        portal: btg.os || '—',
        contrato: contratoLabel(c),
        contratoOriginal: c,
        tipoSolicitacao: btg.tipoSolicitacao || 'Relatório BTG',
        colaborador: pessoa || '—',
        supervisao: db?.supervisao || dist?.supervisao || '—',
        lote: db?.lote || dist?.lote || btg.qtde,
        remanescente: db?.remanescente || dist?.remanescente || btg.qtde,
        qtde: btg.qtde,
        fonte: 'Relatório BTG',
        sheet: btg.sheet,
        rowNumber: btg.rowNumber,
      }));
    }
  }

  // ── 2. OS da Lista de OS não cobertas pelo BTG → "PENDENCIA CLIENTE" ─────
  if (state.btgRows?.length) {
    const seenOsContrato = new Set();
    for (const db of (state.dbRows || [])) {
      const c = contratoNorm(db.contratoOriginal || db.contrato);
      if (isContratoBtg(c) && coveredContratos.has(c)) continue;
      const dedupeKey = `${db.os}|${c}`;
      if (seenOsContrato.has(dedupeKey)) continue;
      seenOsContrato.add(dedupeKey);

      out.push(applyAdjusted({
        status: 'PENDENCIA CLIENTE',
        os: db.os,
        portal: '—',
        contrato: contratoLabel(c),
        contratoOriginal: c,
        tipoSolicitacao: 'BASE OS',
        colaborador: db.colaborador || '—',
        supervisao: db.supervisao || '—',
        lote: db.lote,
        remanescente: db.remanescente,
        fonte: 'db',
      }));
    }
  }

  state.finalRows = out;
  render(el);
}

function exportVerificar() {
  const rows = state.finalRows.filter(r => r.status !== 'OK' && r.status !== 'AJUSTADO');
  if (!rows.length) return;
  const data = rows.map(r => ({
    Status: r.status,
    OS: r.os || '',
    Contrato: r.contrato || '',
    'Contrato original': r.contratoOriginal || '',
    Solicitação: r.tipoSolicitacao || '',
    Colaborador: r.colaborador || '',
    Supervisão: r.supervisao || '',
    Lote: fnum(r.lote || r.qtde),
    Remanescente: fnum(r.remanescente || r.qtde),
    Fonte: r.fonte || '',
    Aba: r.sheet || '',
    Linha: r.rowNumber || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'VERIFICAR');
  XLSX.writeFile(wb, `BTG_VERIFICAR_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────
function setupDragDrop(zone, input, el) {
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('btg-drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('btg-drag-over'));
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('btg-drag-over');
    await handleFiles(e.dataTransfer.files, el);
  });
  input.addEventListener('change', async () => {
    await handleFiles(input.files, el);
    input.value = '';
  });
}

// ── Estilos ───────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('btg-styles')) return;
  const s = document.createElement('style');
  s.id = 'btg-styles';
  s.textContent = `
    .btg-upload-area{border:1px solid rgba(52,211,153,.18);border-radius:16px;padding:20px;background:rgba(2,6,23,.28);margin-top:16px;transition:border-color .2s}
    .btg-upload-area.btg-drag-over{border-color:#34d399;background:rgba(52,211,153,.06)}
    .btg-upload-area.btg-loading{opacity:.7;pointer-events:none}
    .btg-upload-inner{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
    .btg-upload-hint{font-size:12px;color:#94a3b8}
    .btg-file-chips{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
    .btg-chip-file{font-size:11px;padding:5px 11px;border-radius:999px;border:1px solid rgba(148,163,184,.2);color:#94a3b8;background:rgba(15,23,42,.3);transition:.2s}
    .btg-chip-file.loaded{color:#86efac;border-color:rgba(52,211,153,.35);background:rgba(22,163,74,.1)}
    .btg-file-label{display:inline-flex;align-items:center;cursor:pointer;font-size:12px;white-space:nowrap}
    .btg-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
    .btg-status-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
    .btg-filter-btn,.btg-ok-btn{border:1px solid rgba(52,211,153,.18);border-radius:999px;background:rgba(15,23,42,.62);color:#d1d5db;padding:7px 11px;font-size:12px;font-weight:800;cursor:pointer;transition:.15s}
    .btg-filter-btn:hover,.btg-filter-btn.active,.btg-ok-btn:hover{border-color:rgba(52,211,153,.45);background:rgba(22,163,74,.18);color:#ecfdf5}
    .btg-ok-btn.is-adjusted{border-color:rgba(59,130,246,.28);background:rgba(59,130,246,.14);color:#93c5fd}
    .btg-filter-btn b{margin-left:5px;color:#86efac}
    .btg-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.15);border-radius:16px;background:rgba(2,6,23,.25)}
    .btg-table{width:100%;min-width:1120px;border-collapse:separate;border-spacing:0;table-layout:fixed;color:#e2e2f0}
    .btg-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1;white-space:nowrap}
    .btg-table th:hover{color:#fff;background:#0b2116}
    .btg-table td{padding:9px 12px;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle;background:rgba(15,23,42,.22)}
    .btg-row:hover td{background:rgba(22,101,52,.1)}
    .btg-table td:nth-child(8),.btg-table td:nth-child(9),.btg-table th:nth-child(8),.btg-table th:nth-child(9){text-align:right}
    .btg-os-num{font-size:13px;font-weight:950;color:#f8fafc}
    .btg-contrato{font-size:12px;font-weight:800;color:#a7f3d0;font-family:monospace}
    .btg-row.status-danger .btg-contrato{color:#fecaca}
    .btg-colab{font-size:12px;color:#e2e2f0;line-height:1.3}
    .btg-sup{font-size:11px;color:#94a3b8}
    .btg-val{font-size:12px;font-weight:700;color:#e2e2f0}
    .btg-chip,.btg-status{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}
    .btg-chip.ok,.btg-status.status-ok{background:rgba(22,163,74,.14);color:#86efac;border-color:rgba(52,211,153,.2)}
    .btg-chip.warn{background:rgba(250,204,21,.12);color:#fde68a;border-color:rgba(250,204,21,.25)}
    .btg-chip.danger{background:rgba(239,68,68,.11);color:#fca5a5;border-color:rgba(239,68,68,.25)}
    .btg-status.status-verificar{background:rgba(239,68,68,.13);color:#fca5a5;border-color:rgba(239,68,68,.3)}
    .btg-status.status-pendencia{background:rgba(234,179,8,.12);color:#fde047;border-color:rgba(234,179,8,.3)}
    .btg-status.status-falta{background:rgba(249,115,22,.13);color:#fdba74;border-color:rgba(249,115,22,.3)}
    .btg-status.status-info{background:rgba(59,130,246,.14);color:#93c5fd;border-color:rgba(59,130,246,.28)}
    .btg-row.status-verificar td{background:rgba(239,68,68,.04)}
    .btg-row.status-pendencia td{background:rgba(234,179,8,.04)}
    .btg-row.status-falta td{background:rgba(249,115,22,.04)}
    .btg-small-ok{font-size:11px;color:#93c5fd;font-weight:800}
    .btg-empty{border:1px dashed rgba(148,163,184,.2);border-radius:16px;padding:24px;color:#94a3b8;text-align:center}
    .badge-info{background:rgba(59,130,246,.18);color:#93c5fd;border-color:rgba(59,130,246,.3)}
    @media(max-width:700px){.btg-table{min-width:900px}}
  `;
  document.head.appendChild(s);
}

// ── Init ──────────────────────────────────────────────────────────────────────
initProtectedPage('BTG — Logística', async (content) => {
  injectStyles();

  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>BTG — Ordens de Serviço</h3>
          <p class="muted">Importação unificada dos relatórios da BTG. O painel identifica cada arquivo, valida contrato no padrão P33004.000 e aponta o que precisa de conferência.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span id="btgModeTag" class="badge">BASE DE DADOS</span>
          <button class="btn btn-secondary" id="btgRecarregar">Atualizar BD</button>
        </div>
      </div>

      <div class="btg-upload-area" id="btgDropZone">
        <div class="btg-upload-inner">
          <label class="btn btn-secondary btg-file-label">
            <input type="file" id="btgFileInput" accept=".xlsx,.xls" multiple hidden />
            Carregar relatório(s)
          </label>
          <span class="btg-upload-hint">Envie tudo no mesmo botão: Distribuição de O.S. e/ou Relatório BTG. O tipo é identificado automaticamente.</span>
        </div>
        <div class="btg-file-chips">
          <div class="btg-chip-file" id="btgChipDist">Distribuição de O.S. — aguardando</div>
          <div class="btg-chip-file" id="btgChipBtg">Relatório BTG — aguardando</div>
        </div>
        <div class="btg-actions">
          <button class="btn btn-secondary" id="btgExportVerificar">Gerar XLS VERIFICAR</button>
        </div>
      </div>

      <div class="filters-grid" style="margin-top:16px">
        <div class="field">
          <label>Buscar</label>
          <input id="btgBusca" type="text" placeholder="O.S., contrato, colaborador, supervisão, status..."
            style="min-height:38px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;padding:8px 12px;font-size:13px;width:100%;box-sizing:border-box" />
        </div>
      </div>
      <div class="btg-status-filters" id="btgStatusFilters"></div>
      <div id="btgFeedback" class="feedback mt-16">Carregando...</div>
    </section>

    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3 id="btgTableTitle">Lista BTG</h3>
          <p class="muted" id="btgTableSubtitle">Dados do banco de dados</p>
        </div>
        <span id="btgCount" class="badge">0</span>
      </div>
      <div id="btgTableWrap"></div>
    </section>
  `;

  const el = {
    modeTag: document.getElementById('btgModeTag'),
    recarregar: document.getElementById('btgRecarregar'),
    exportVerificar: document.getElementById('btgExportVerificar'),
    dropZone: document.getElementById('btgDropZone'),
    fileInput: document.getElementById('btgFileInput'),
    chipDist: document.getElementById('btgChipDist'),
    chipBtg: document.getElementById('btgChipBtg'),
    busca: document.getElementById('btgBusca'),
    statusFilters: document.getElementById('btgStatusFilters'),
    feedback: document.getElementById('btgFeedback'),
    tableWrap: document.getElementById('btgTableWrap'),
    count: document.getElementById('btgCount'),
    tableTitle: document.getElementById('btgTableTitle'),
    tableSubtitle: document.getElementById('btgTableSubtitle'),
  };

  el.busca.addEventListener('input', () => { state.busca = el.busca.value.trim(); render(el); });
  el.exportVerificar.addEventListener('click', exportVerificar);

  el.statusFilters.addEventListener('click', e => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    state.filtroStatus = btn.dataset.status || 'todos';
    render(el);
  });

  el.tableWrap.addEventListener('click', async e => {
    const th = e.target.closest('[data-sort]');
    if (th) {
      const col = th.dataset.sort;
      state.sort = { col, dir: state.sort.col === col && state.sort.dir === 'asc' ? 'desc' : 'asc' };
      render(el);
      return;
    }
    const ok = e.target.closest('[data-ok]');
    if (ok) {
      state.ajustados.add(ok.dataset.ok);
      saveAjustados(state.ajustados);
      await persistAjustado(ok.dataset.ok);
      const row = state.finalRows.find(r => r.key === ok.dataset.ok);
      if (row) row.status = 'AJUSTADO';
      render(el);
    }
  });

  el.recarregar.addEventListener('click', async () => {
    await loadDbData(el);
    state.mode === 'db' ? render(el) : await reconcile(el);
  });

  setupDragDrop(el.dropZone, el.fileInput, el);

  await loadDbData(el);
  if (state.mode === 'xlsx') await reconcile(el);
  else { state.finalRows = state.dbRows; render(el); }
});
