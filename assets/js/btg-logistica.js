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

function findHeaderRow(raw, checks, maxRows = 20) {
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
    for (const row of raw.slice(0, 20)) {
      const r = norm(row.map(c => String(c ?? '')).join(' '));
      if (r.includes('FUNCION') && r.includes('REMANESCENTE') && (r.includes('O S') || r.includes('OS'))) return 'distribuicao';
      if (r.includes('ORDEM') && r.includes('FRETE') && r.includes('CONTRATO')) return 'btg';
      if (r.includes('CONTRATO') && (r.includes('COMMODITY') || r.includes('SOLICITACAO') || r.includes('RECEBIMENTO'))) return 'btg';
    }
  }
  return 'unknown';
}

// ── Estado ────────────────────────────────────────────────────────────────────
const state = {
  dbRows: [],
  distRows: null,
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
    ['todos', 'Todos'], ['verificar', 'Verificar'], ['corrigir contrato', 'Corrigir contrato'], ['ajustado', 'Ajustado'], ['ok', 'OK'],
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

  const verificarCount = state.finalRows.filter(r => r.status === 'VERIFICAR').length;
  el.exportVerificar.disabled = !verificarCount;
  el.exportVerificar.textContent = verificarCount ? `Gerar XLS VERIFICAR (${verificarCount})` : 'Gerar XLS VERIFICAR';

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
  const n = norm(s);
  if (n === 'VERIFICAR') return 'status-warn';
  if (n === 'CORRIGIR CONTRATO') return 'status-danger';
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
  if (state.mode === 'db') state.finalRows = state.dbRows;
}

// ── Parsers dos relatórios ────────────────────────────────────────────────────
function parseDistribuicao(wb) {
  const all = [];
  for (const wsName of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, defval: '' });
    if (!raw.length) continue;

    const hIdx = findHeaderRow(raw, ['FUNCION', 'REMANESCENTE']);
    const h = raw[hIdx] || [];
    const ci = {
      os: colIndex(h, [c => c === 'O S' || c === 'OS' || c === 'O S']),
      colaborador: colIndex(h, [c => c.includes('FUNCION')]),
      supervisao: colIndex(h, [c => c.includes('SUPERVIS')]),
      coordenacao: colIndex(h, [c => c.includes('COORDENA')]),
      cliente: colIndex(h, [c => c.includes('CLIENTE')]),
      lote: colIndex(h, [c => c === 'LOTE']),
      remanescente: colIndex(h, [c => c.includes('REMANESCENTE')]),
    };
    if (ci.os < 0 || ci.cliente < 0) continue;

    raw.slice(hIdx + 1)
      .filter(r => BTG_RE.test(String(r[ci.cliente] ?? '')))
      .forEach(r => all.push({
        os: clean(r[ci.os]),
        colaborador: clean(r[ci.colaborador]) || '—',
        supervisao: clean(r[ci.supervisao] ?? r[ci.coordenacao]) || '—',
        lote: r[ci.lote],
        remanescente: r[ci.remanescente],
        fonte: 'Distribuição OS',
      }));
  }
  return all;
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
      os: colIndex(h, [c => c.includes('ORDEM') && (c.includes('SERVI') || c.includes('FRETE') || c.includes('OS'))]),
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
    state.distRows = parseDistribuicao(wb);
    state.loaded.dist = `${file.name} (${state.distRows.length} linhas BTG)`;
  } else if (tipo === 'btg') {
    const parsed = parseBtg(wb);
    state.btgRows = parsed.rows;
    state.btgMap = parsed.map;
    state.loaded.btg = `${file.name} (${state.btgRows.length} solicitações)`;
  } else {
    throw new Error(`Arquivo "${file.name}" não reconhecido. Envie a Distribuição de OS ou o relatório BTG.`);
  }
}

async function handleFiles(files, el) {
  if (!files?.length) return;

  el.feedback.textContent = 'Processando relatórios...';
  el.dropZone.classList.add('btg-loading');

  try {
    for (const file of files) await processFile(file, el);
  } catch (err) {
    el.feedback.textContent = err.message;
    el.dropZone.classList.remove('btg-loading');
    renderChips(el);
    return;
  }

  el.dropZone.classList.remove('btg-loading');
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
  const usedDist = new Set();
  const out = [];

  // O relatório da BTG é a fonte primária: TODAS as solicitações entram na tela.
  // Quando uma O.S. tem vários colaboradores compatíveis, abrimos uma linha por colaborador.
  for (const btg of (state.btgRows || [])) {
    const c = contratoNorm(btg.contratoOriginal);
    const dbRows = isContratoBtg(c) ? (byContrato.get(c) || []) : [];
    const distRows = btg.os ? (distByOs.get(String(btg.os)) || []) : [];
    for (const dist of distRows) usedDist.add(rowKey({ ...dist, fonte: 'Distribuição OS' }));

    let status = 'OK';
    if (!isContratoBtg(c)) status = 'CORRIGIR CONTRATO';
    else if (!contratoSet.has(c)) status = 'VERIFICAR';

    const pessoas = [];
    for (const db of dbRows) pushUnique(pessoas, db.colaborador);
    for (const dist of distRows) pushUnique(pessoas, dist.colaborador);
    if (!pessoas.length) pessoas.push('—');

    for (const pessoa of pessoas) {
      const db = dbRows.find(x => norm(x.colaborador) === norm(pessoa)) || dbRows[0] || null;
      const dist = distRows.find(x => norm(x.colaborador) === norm(pessoa)) || distRows[0] || null;
      const row = applyAdjusted({
        status,
        os: db?.os || btg.os || dist?.os || '—',
        contrato: contratoLabel(c),
        contratoOriginal: c,
        tipoSolicitacao: btg.tipoSolicitacao || 'Relatório BTG',
        colaborador: pessoa || db?.colaborador || dist?.colaborador || '—',
        supervisao: db?.supervisao || dist?.supervisao || '—',
        lote: db?.lote || dist?.lote || btg.qtde,
        remanescente: db?.remanescente || dist?.remanescente || btg.qtde,
        qtde: btg.qtde,
        fonte: 'Relatório BTG',
        sheet: btg.sheet,
        rowNumber: btg.rowNumber,
      });
      out.push(row);
    }
  }

  // Complementa com colaboradores/O.S. da Distribuição que não foram cobertos pelo relatório BTG carregado.
  for (const dist of (state.distRows || [])) {
    const distKey = rowKey({ ...dist, fonte: 'Distribuição OS' });
    if (usedDist.has(distKey)) continue;
    const dbRows = byOs.get(String(dist.os)) || [];
    const db = dbRows.find(x => norm(x.colaborador) === norm(dist.colaborador)) || dbRows[0] || null;
    const c = contratoNorm(db?.contratoOriginal || db?.contrato || '');
    const hasBtg = isContratoBtg(c) && !!state.btgMap?.[c];
    let status = isContratoBtg(c) ? 'OK' : 'CORRIGIR CONTRATO';
    if (state.btgRows?.length && isContratoBtg(c) && !hasBtg) status = 'VERIFICAR';

    out.push(applyAdjusted({
      status,
      os: dist.os,
      contrato: contratoLabel(c),
      contratoOriginal: c,
      tipoSolicitacao: 'Distribuição OS',
      colaborador: dist.colaborador || db?.colaborador || '—',
      supervisao: db?.supervisao || dist.supervisao,
      lote: db?.lote || dist.lote,
      remanescente: db?.remanescente || dist.remanescente,
      fonte: 'Distribuição OS',
    }));
  }

  state.finalRows = out;
  render(el);
}

function exportVerificar() {
  const rows = state.finalRows.filter(r => r.status === 'VERIFICAR');
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
    .btg-table td:nth-child(7),.btg-table td:nth-child(8),.btg-table th:nth-child(7),.btg-table th:nth-child(8){text-align:right}
    .btg-os-num{font-size:13px;font-weight:950;color:#f8fafc}
    .btg-contrato{font-size:12px;font-weight:800;color:#a7f3d0;font-family:monospace}
    .btg-row.status-danger .btg-contrato{color:#fecaca}
    .btg-colab{font-size:12px;color:#e2e2f0;line-height:1.3}
    .btg-sup{font-size:11px;color:#94a3b8}
    .btg-val{font-size:12px;font-weight:700;color:#e2e2f0}
    .btg-chip,.btg-status{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}
    .btg-chip.ok,.btg-status.status-ok{background:rgba(22,163,74,.14);color:#86efac;border-color:rgba(52,211,153,.2)}
    .btg-chip.warn,.btg-status.status-warn{background:rgba(250,204,21,.12);color:#fde68a;border-color:rgba(250,204,21,.25)}
    .btg-chip.danger,.btg-status.status-danger{background:rgba(239,68,68,.11);color:#fca5a5;border-color:rgba(239,68,68,.25)}
    .btg-status.status-info{background:rgba(59,130,246,.14);color:#93c5fd;border-color:rgba(59,130,246,.28)}
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

  el.tableWrap.addEventListener('click', e => {
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
  state.finalRows = state.dbRows;
  render(el);
});
