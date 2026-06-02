import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BTG_RE = /BTG\s+PACTUAL\s+COMMODITIES\s+SERTRADING/i;
const CONTRATO_BTG_RE = /^P\d{5}\.\d{3}$/i;
const BR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function norm(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
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

function extractContratoFromRaw(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const keys = Object.keys(raw);
  for (const k of keys) {
    if (norm(k).includes('CONTRATO')) {
      const v = contratoNorm(raw[k]);
      if (isContratoBtg(v)) return v;
    }
  }
  const text = JSON.stringify(raw);
  const m = text.match(/P\d{5}\.\d{3}/i);
  return m ? contratoNorm(m[0]) : '';
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
      if (r.includes('SITUAC') && r.includes('CONTRATO') && r.includes('REMANESCENTE') && !r.includes('FUNCION') && !r.includes('CLASSIFICAD')) return 'listaOs';
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
  listaOsRows: null,
  listaOsMap: null,
  listaOsMapByContrato: null,
  btgRows: null,
  btgMap: null,
  finalRows: [],
  mode: 'db',
  busca: '',
  filtroStatus: 'todos',
  sort: { col: 'os', dir: 'asc' },
  loaded: { dist: null, btg: null, listaOs: null },
  uploadAfter17h: false,
};


async function loadSavedBtgData() {
  try {
    const { data, error } = await supabase.from('logistica_btg_solicitacoes').select('contrato_original, contrato_status, numero_os_relatorio, tipo_solicitacao, cliente, commodity, quantidade, aba, linha, checkin_diario').order('linha', { ascending: true }).limit(10000);
    if (error) throw error;
    const rows = (data || []).map((item) => ({ portal: clean(item.numero_os_relatorio), contratoOriginal: contratoNorm(item.contrato_original), contrato: item.contrato_status || contratoLabel(item.contrato_original), tipoSolicitacao: clean(item.tipo_solicitacao) || 'Relatório BTG', cliente: clean(item.cliente), commodity: clean(item.commodity), qtde: item.quantidade, sheet: item.aba, rowNumber: item.linha, checkinDiario: item.checkin_diario || '', fonte: 'Relatório BTG' }));
    state.btgRows = rows.length ? rows : null;
    state.btgMap = {};
    for (const r of rows) { const c = contratoNorm(r.contratoOriginal); if (isContratoBtg(c)) state.btgMap[c] = r; }
    state.loaded.btg = rows.length ? `Banco de dados (${rows.length} solicitações)` : null;
    if (rows.length) state.mode = 'xlsx';
  } catch (err) { console.warn('Solicitações BTG salvas ainda não disponíveis:', err?.message || err); }
}
async function upsertOperacionalOsAberta(rows) {
  const list = (rows || []).filter(r => norm(r.situacao || '') === 'ABERTA');
  if (!list.length) return;

  // Busca quais OS já existem para fazer só UPDATE (evita violar NOT NULL de colunas não fornecidas)
  const osNums = list.map(r => r.numero_os).filter(Boolean);
  const { data: existing } = await supabase.from('operacional_os').select('numero_os').in('numero_os', osNums);
  const existingSet = new Set((existing || []).map(r => r.numero_os));
  const toUpdate = list.filter(r => existingSet.has(r.numero_os));
  if (!toUpdate.length) return;

  for (let i = 0; i < toUpdate.length; i += 500) {
    const payload = toUpdate.slice(i, i + 500).map(r => ({
      numero_os:    r.numero_os,
      contrato:     r.contrato,
      situacao:     r.situacao,
      financeiro:   r.financeiro,
      data_os:      r.data_os,
      servico:      r.servico,
      cliente:      r.cliente,
      embarque:     r.embarque,
      destino:      r.destino,
      supervisao:   r.supervisao,
      produto:      r.produto,
      lote:         r.lote,
      embarcado:    r.embarcado,
      remanescente: r.remanescente,
      updated_at:   r.updated_at,
    }));
    const { error } = await supabase.from('operacional_os').upsert(payload, { onConflict: 'numero_os', ignoreDuplicates: false });
    if (error) throw new Error(`Erro ao atualizar OS abertas: ${error.message}`);
  }
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
      contrato:    contratoNorm(r.contrato || '') || null,
      colaborador: clean(r.colaborador) || null,
      supervisao:  clean(r.supervisao) || null,
      lote:        fnum(r.lote),
      remanescente:fnum(r.remanescente),
      financeiro:  clean(r.financeiro) || null,
      updated_at:  new Date().toISOString(),
    }));
    for (let i = 0; i < distPayload.length; i += 500) {
      const { error } = await supabase.from('logistica_btg_distribuicao').insert(distPayload.slice(i, i + 500));
      if (error) throw error;
    }
  } catch (err) { console.warn('Não foi possível salvar Distribuição no banco:', err?.message || err); }

  // A Distribuição de OS não altera operacional_os nem operacional_os_colaboradores.
  // Ela fica isolada em logistica_btg_distribuicao para o cruzamento do BTG.

}

async function loadSavedDistData() {
  try {
    const { data, error } = await supabase
      .from('logistica_btg_distribuicao')
      .select('numero_os, contrato, colaborador, supervisao, lote, remanescente, financeiro')
      .order('id', { ascending: true })
      .limit(20000);
    if (error) throw error;
    const rows = (data || []).map(item => ({
      os:          clean(item.numero_os),
      contrato:    contratoNorm(item.contrato || ''),
      colaborador: clean(item.colaborador) || '—',
      supervisao:  clean(item.supervisao) || '—',
      lote:        item.lote,
      remanescente:item.remanescente,
      financeiro:  clean(item.financeiro) || '',
      fonte:       'Distribuição OS',
    }));
    if (rows.length) {
      state.distRows = rows;
      state.loaded.dist = `Banco de dados (${rows.length} linhas)`;
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
    const payload = list.map((r) => ({ contrato_original: contratoNorm(r.contratoOriginal), contrato_status: contratoLabel(r.contratoOriginal), numero_os_relatorio: clean(r.portal || r.os) || null, tipo_solicitacao: clean(r.tipoSolicitacao) || 'Relatório BTG', cliente: clean(r.cliente) || null, commodity: clean(r.commodity) || null, quantidade: fnum(r.qtde), aba: r.sheet || null, linha: r.rowNumber || null, checkin_diario: r.checkinDiario || null, updated_at: new Date().toISOString() }));
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
    if (['lote', 'remanescente', 'os', 'qtde', 'prodDiaOs'].includes(col)) return (fnum(a[col]) - fnum(b[col])) * f;
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
  const listaOsLoaded = !!state.loaded.listaOs;
  el.chipDist.className = `btg-chip-file ${distLoaded ? 'loaded' : ''}`;
  el.chipBtg.className = `btg-chip-file ${btgLoaded ? 'loaded' : ''}`;
  el.chipListaOs.className = `btg-chip-file ${listaOsLoaded ? 'loaded' : ''}`;
  el.chipDist.textContent = distLoaded ? `Distribuição: ${state.loaded.dist}` : 'Distribuição de O.S. — aguardando';
  el.chipBtg.textContent = btgLoaded ? `Relatório BTG: ${state.loaded.btg}` : 'Relatório BTG — aguardando';
  el.chipListaOs.textContent = listaOsLoaded ? `Lista OS: ${state.loaded.listaOs}` : 'Lista de O.S. — aguardando';
}

function renderStatusButtons(el) {
  const c = counts();
  const items = [
    ['todos', 'Todos'],
    ['ok', 'OK'],
    ['faturada', 'Faturada'],
    ['finalizada', 'Finalizada'],
    ['pendencia cliente', 'Pendência Cliente'],
    ['verificar', 'Verificar'],
    ['check-in', 'Check-in'],
    ['cancelada', 'Cancelada'],
    ['falta colaborador', 'Falta Colaborador'],
    ['lançar nhe', 'Lançar NHE'],
    ['nhe ok', 'NHE OK'],
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

  const naoOkCount = state.finalRows.filter(r => r.status !== 'OK').length;
  el.exportVerificar.disabled = !naoOkCount;
  el.exportVerificar.textContent = naoOkCount ? `Gerar XLS pendências (${naoOkCount})` : 'Gerar XLS pendências';

  const checkinCount = state.finalRows.filter(r => r.status === 'CHECK-IN').length;
  el.enviarCheckin.disabled = !checkinCount;
  el.enviarCheckin.textContent = checkinCount ? `Enviar Check-in (${checkinCount})` : 'Enviar Check-in';

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
          ${thHtml('colaborador', 'Colaborador')}
          ${thHtml('supervisao', 'Supervisão')}
          ${thHtml('lote', 'Lote')}
          ${thHtml('remanescente', 'Remanescente')}
          ${thHtml('prodDiaOs', 'Prod. Hoje')}
        </tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody>
      </table>
    </div>`;
}

function statusClass(s) {
  const n = norm(s || '');
  if (n === 'VERIFICAR') return 'status-verificar';
  if (n === 'PENDENCIA CLIENTE') return 'status-pendencia';
  if (n === 'FALTA COLABORADOR') return 'status-falta';
  if (n === 'CHECK IN') return 'status-checkin';
  if (n === 'LANCAR NHE') return 'status-nhe';
  if (n === 'NHE OK') return 'status-nhe-ok';
  if (n === 'FATURADA') return 'status-faturada';
  if (n === 'CANCELADA') return 'status-cancelada';
  if (n === 'FINALIZADA') return 'status-finalizada';
  return 'status-ok';
}

function rowHtml(r) {
  const rem = fnum(r.remanescente);
  const lote = fnum(r.lote || r.qtde);
  const pct = lote > 0 ? Math.min(100, (rem / lote) * 100) : 0;
  const chip = rem <= 0 ? 'danger' : pct < 20 ? 'warn' : 'ok';
  const original = contratoNorm(r.contratoOriginal);
  const title = !isContratoBtg(original) && original ? ` title="Valor recebido: ${esc(original)}"` : '';
  const checkinOff = norm(r.checkinDiario || '') === 'INEXISTENTE'
    ? `<span class="btg-checkin-off" title="Check-in diário: inexistente"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.657 16.657L13.414 20.9a2 2 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z"/><circle cx="12" cy="11" r="3"/><line x1="2" y1="2" x2="22" y2="22"/></svg></span>`
    : '';
  const prodHoje = r.prodDiaOs !== null && r.prodDiaOs !== undefined
    ? r.prodDiaOs === 'NHE'
      ? `<span class="btg-val" style="color:#93c5fd">NHE</span>`
      : `<span class="btg-val" style="color:${fnum(r.prodDiaOs) <= 0 ? '#fca5a5' : '#86efac'}">${esc(fmt(r.prodDiaOs))}</span>`
    : '<span style="color:#475569">—</span>';
  return `<tr class="btg-row ${statusClass(r.status)}">
    <td><span class="btg-status ${statusClass(r.status)}">${esc(r.status || 'OK')}</span></td>
    <td><span class="btg-os-num">${esc(r.os || '—')}</span>${checkinOff}</td>
    <td><span class="btg-os-num" style="color:#94a3b8">${esc(r.portal || '—')}</span></td>
    <td><span class="btg-contrato"${title}>${esc(r.contrato)}</span></td>
    <td><span class="btg-colab">${esc(r.colaborador || '—')}</span></td>
    <td><span class="btg-sup">${esc(r.supervisao || '—')}</span></td>
    <td><span class="btg-val">${esc(fmt(r.lote || r.qtde))}</span></td>
    <td><span class="btg-chip ${chip}">${esc(fmt(r.remanescente || r.qtde))}</span></td>
    <td>${prodHoje}</td>
  </tr>`;
}

// ── Carga do banco ────────────────────────────────────────────────────────────
async function loadDbData(el) {
  el.feedback.textContent = 'Carregando dados BTG...';
  try {
    const { data: osData, error } = await supabase
      .from('operacional_os')
      .select('id, numero_os, cliente, contrato, supervisao, lote, remanescente, raw')
      .ilike('cliente', '%BTG PACTUAL COMMODITIES SERTRADING%')
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
      const original = contratoNorm(r.contrato || extractContratoFromRaw(r.raw) || '');
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
        state.dbRows.push(base);
      }
    }
  } catch (err) {
    console.error(err);
    state.dbRows = [];
    el.feedback.textContent = `Erro: ${err.message}`;
  }
  await loadSavedBtgData();
  await loadSavedDistData();
  if (state.mode === 'db') state.finalRows = state.dbRows;
}

// ── Parsers dos relatórios ────────────────────────────────────────────────────
function parseDistribuicao(wb) {
  const distRows = [];
  const allOsRows = [];
  for (const wsName of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, defval: '' });
    if (!raw.length) continue;

    // Aceita tanto a aba com "Funcionário" (formato antigo) quanto "Classificador" (Embarques)
    let hIdx = findHeaderRow(raw, ['FUNCION', 'REMANESCENTE']);
    if (raw[hIdx] && !norm(raw[hIdx].map(c => String(c ?? '')).join(' ')).includes('FUNCION')) {
      hIdx = findHeaderRow(raw, ['CLASSIFICAD']);
    }
    const h = raw[hIdx] || [];
    const ci = {
      os:          colIndex(h, [
        c => c === 'O S' || c === 'OS',
        c => c === 'N OS' || c === 'NO OS' || c === 'NUMERO OS' || c === 'NR O S' || c === 'N O S',
        c => c === 'ORDEM DE SERVICO' || c === 'ORDEM SERVICO',
        c => (c.endsWith('OS') || c.endsWith('O S')) && c.length <= 12,
      ]),
      colaborador: colIndex(h, [c => c.includes('CLASSIFICAD'), c => c.includes('FUNCION')]),
      supervisao:  colIndex(h, [c => c.includes('SUPERVIS')]),
      coordenacao: colIndex(h, [c => c.includes('COORDENA')]),
      cliente:     colIndex(h, [c => c.includes('CLIENTE')]),
      lote:        colIndex(h, [c => c === 'LOTE']),
      remanescente:colIndex(h, [
        c => c.includes('REMANESCENTE') && !c.includes('PROD'),
        c => c.includes('REMANESCENTE'),
      ]),
      situacao:    colIndex(h, [c => c.includes('SITUAC')]),
      financeiro:  colIndex(h, [c => c.includes('FINANC')]),
      data:        colIndex(h, [c => c === 'DATA' || c.startsWith('DATA')]),
      servico:     colIndex(h, [c => c.includes('SERVIC')]),
      embarque:    colIndex(h, [c => c.includes('EMBARQUE') || c.includes('PONTO 1') || c.includes('LOCAL EMBARQUE')]),
      destino:     colIndex(h, [c => c.includes('DESTINO')]),
      contrato:    colIndex(h, [c => c === 'CONTRATO']),
      produto:     colIndex(h, [c => c === 'PRODUTO' || c.includes('PROD REMANESCENTE') || (c.includes('PROD') && !c.includes('REMANESCENTE'))]),
      embarcado:   colIndex(h, [c => c === 'EMBARCADO']),
      prodDiaOs:   colIndex(h, [c => c === 'PROD DO DIA OS', c => c.includes('DIA') && c.endsWith('OS')]),
    };
    if (ci.os < 0) continue;

    const supIdx = ci.supervisao >= 0 ? ci.supervisao : ci.coordenacao;
    const now = new Date().toISOString();

    for (const r of raw.slice(hIdx + 1)) {
      const osNum = clean(String(r[ci.os] ?? ''));
      const clienteStr = String(r[ci.cliente] ?? '');
      if (!osNum) continue;

      const situacaoStr  = ci.situacao  >= 0 ? clean(String(r[ci.situacao]  ?? '')) : '';
      const financeiroStr= ci.financeiro>= 0 ? clean(String(r[ci.financeiro]?? '')) : '';
      const situacaoN    = norm(situacaoStr);

      // Cancelada e Bonificada são desconsideradas completamente
      if (situacaoN === 'CANCELADA' || situacaoN === 'BONIFICADA') continue;

      // Aberta e Ativo atualizam a lista de OS no banco
      if (situacaoN === 'ABERTA' || situacaoN === 'ATIVO') {
        allOsRows.push({
          numero_os:          osNum,
          situacao:           'ABERTA',
          financeiro:         financeiroStr || null,
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
      }

      // Distribuição: todas as OS não canceladas/bonificadas, com financeiro para detectar Faturada
      distRows.push({
        os:          osNum,
        contrato:    ci.contrato >= 0 ? contratoNorm(clean(String(r[ci.contrato] ?? ''))) : '',
        colaborador: clean(String(r[ci.colaborador] ?? '')) || '—',
        supervisao:  supIdx >= 0 ? clean(String(r[supIdx] ?? '')) || '—' : '—',
        lote:        r[ci.lote],
        remanescente:r[ci.remanescente],
        prodDiaOs:   (() => { if (ci.prodDiaOs < 0) return null; const raw = clean(String(r[ci.prodDiaOs] ?? '')); if (!raw) return null; return norm(raw) === 'NHE' ? 'NHE' : fnum(raw); })(),
        financeiro:  financeiroStr,
        fonte:       'Distribuição OS',
      });
    }
  }
  return { distRows, allOsRows };
}

function parseBtg(wb) {
  const rows = [];
  for (const wsName of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, defval: '' });
    if (!raw.length) continue;

    const hIdx = findHeaderRow(raw, ['CONTRATO']);
    const h = raw[hIdx] || [];
    const ci = {
      contrato:          colIndex(h, [c => c === 'CONTRATO' || c.includes('CONTRATO')]),
      portal:            colIndex(h, [
        c => c === 'ORDEM DE SERVICO' || c === 'ORDEM SERVICO',
        c => c.includes('ORDEM') && c.includes('SERVI'),
      ]),
      ordemFrete:        colIndex(h, [c => c === 'ORDEM DE FRETE' || (c.includes('ORDEM') && c.includes('FRETE'))]),
      qtde:              colIndex(h, [c => c.includes('QTDE') || c.includes('QUANTIDADE') || c.includes('VOLUME') || c.includes('TON')]),
      commodity:         colIndex(h, [c => c.includes('COMMODITY') || c.includes('PRODUTO')]),
      destino:           colIndex(h, [c => c.includes('DESTINO') || c.includes('CIDADE') || c.includes('ORIGEM')]),
      rota:              colIndex(h, [c => c === 'ROTA' || c.includes('ROTA')]),
      classificadorBtg:  colIndex(h, [c => c.includes('CLASSIFICAD')]),
      statusBtg:         colIndex(h, [c => c === 'STATUS']),
      tipo:              colIndex(h, [c => c.includes('TIPO') || c.includes('SOLICITACAO') || c.includes('OPERACAO') || c.includes('MOVIMENTO')]),
      cliente:           colIndex(h, [c => c.includes('CLIENTE') || c.includes('COMPRADOR') || c.includes('TOMADOR')]),
      checkinDiario:     colIndex(h, [c => c.includes('CHECK') && c.includes('DIARI'), c => c === 'CHECK IN']),
    };
    if (ci.contrato < 0) continue;

    raw.slice(hIdx + 1).forEach((r, idx) => {
      const contratoOriginal = contratoNorm(r[ci.contrato]);
      if (!contratoOriginal && !r.some(Boolean)) return;
      const tipoSolicitacao = clean(r[ci.tipo]) || clean(r[ci.commodity]) || 'Relatório BTG';
      rows.push({
        portal:           clean(r[ci.portal]),
        ordemFrete:       clean(r[ci.ordemFrete]),
        contratoOriginal,
        contrato:         contratoLabel(contratoOriginal),
        tipoSolicitacao,
        cliente:          clean(r[ci.cliente]),
        commodity:        clean(r[ci.commodity]),
        destino:          clean(r[ci.destino]),
        rota:             clean(r[ci.rota]),
        qtde:             r[ci.qtde],
        classificadorBtg: clean(r[ci.classificadorBtg]),
        statusBtg:        clean(r[ci.statusBtg]),
        checkinDiario:    ci.checkinDiario >= 0 ? clean(r[ci.checkinDiario]).toLowerCase() : '',
        sheet:            wsName,
        rowNumber:        hIdx + idx + 2,
        fonte:            'Relatório BTG',
      });
    });
  }

  const map = {};
  for (const r of rows) {
    if (isContratoBtg(r.contratoOriginal)) map[r.contratoOriginal] = r;
  }
  return { rows, map };
}

function parseListaOs(wb) {
  const rows = [];
  const byOs = new Map();
  const byContrato = new Map();
  for (const wsName of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, defval: '' });
    if (!raw.length) continue;
    const hIdx = findHeaderRow(raw, ['SITUAC', 'CONTRATO']);
    const h = raw[hIdx] || [];
    const ci = {
      situacao:     colIndex(h, [c => c.includes('SITUAC')]),
      financeiro:   colIndex(h, [c => c.includes('FINANC')]),
      os:           colIndex(h, [c => c === 'O S' || c === 'OS', c => c.includes('O S')]),
      contrato:     colIndex(h, [c => c === 'CONTRATO']),
      supervisao:   colIndex(h, [c => c.includes('SUPERVIS')]),
      lote:         colIndex(h, [c => c === 'LOTE']),
      remanescente: colIndex(h, [c => c.includes('REMANESCENTE') && !c.includes('PROD'), c => c.includes('REMANESCENTE')]),
    };
    if (ci.situacao < 0 || ci.os < 0) continue;
    for (const r of raw.slice(hIdx + 1)) {
      const osNum = clean(String(r[ci.os] ?? ''));
      const situacao = ci.situacao >= 0 ? clean(String(r[ci.situacao] ?? '')) : '';
      if (!osNum || !situacao) continue;
      const contrato = ci.contrato >= 0 ? contratoNorm(clean(String(r[ci.contrato] ?? ''))) : '';
      const row = { os: osNum, contrato, situacao, financeiro: ci.financeiro >= 0 ? clean(String(r[ci.financeiro] ?? '')) : '', supervisao: ci.supervisao >= 0 ? clean(String(r[ci.supervisao] ?? '')) || '—' : '—', lote: ci.lote >= 0 ? r[ci.lote] : 0, remanescente: ci.remanescente >= 0 ? r[ci.remanescente] : 0, fonte: 'Lista OS' };
      rows.push(row);
      byOs.set(String(osNum), row);
      if (contrato && isContratoBtg(contrato)) byContrato.set(contrato, row);
    }
  }
  return { rows, byOs, byContrato };
}

// Corrige o atributo dimension de planilhas exportadas com range errado (ex.: portal BTG).
// Sem isso, sheet_to_json usa A1:C1 como limite e ignora o restante dos dados.
function fixSheetDimensions(wb) {
  for (const wsName of wb.SheetNames) {
    const ws = wb.Sheets[wsName];
    const cells = Object.keys(ws).filter(k => !k.startsWith('!'));
    if (!cells.length) continue;
    const decoded = cells.map(k => XLSX.utils.decode_cell(k));
    const maxR = Math.max(...decoded.map(c => c.r));
    const maxC = Math.max(...decoded.map(c => c.c));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  }
  return wb;
}

// ── Processamento de arquivo(s) ───────────────────────────────────────────────
async function processFile(file, el) {
  const buf = await file.arrayBuffer();
  const wb = fixSheetDimensions(XLSX.read(buf, { type: 'array' }));
  const tipo = detectFileType(wb);

  console.log(`[BTG] "${file.name}" → tipo: ${tipo} | sheets: ${wb.SheetNames.join(', ')}`);

  if (tipo === 'distribuicao') {
    const parsed = parseDistribuicao(wb);
    console.log(`[BTG] Distribuição: ${parsed.distRows.length} vínculo(s) O.S./colaborador, ${parsed.allOsRows.length} OS total`);
    state.distRows = parsed.distRows;
    state.allOsRows = parsed.allOsRows;
    state.loaded.dist = `${file.name} (${parsed.distRows.length} vínculo(s) O.S./colaborador)`;
  } else if (tipo === 'btg') {
    const parsed = parseBtg(wb);
    console.log(`[BTG] Relatório BTG: ${parsed.rows.length} solicitações`);
    if (!state.btgRows) {
      state.btgRows = parsed.rows;
      state.btgMap = parsed.map;
      state.loaded.btg = `${file.name} (${parsed.rows.length} sol.)`;
    } else {
      state.btgRows = [...state.btgRows, ...parsed.rows];
      for (const [k, v] of Object.entries(parsed.map)) state.btgMap[k] = v;
      state.loaded.btg += ` + ${file.name} (${parsed.rows.length} sol.)`;
    }
  } else if (tipo === 'listaOs') {
    const parsed = parseListaOs(wb);
    console.log(`[BTG] Lista OS: ${parsed.rows.length} OS`);
    state.listaOsRows = parsed.rows;
    state.listaOsMap = parsed.byOs;
    state.listaOsMapByContrato = parsed.byContrato;
    state.loaded.listaOs = `${file.name} (${parsed.rows.length} OS)`;
  } else {
    console.warn(`[BTG] Arquivo não reconhecido: ${file.name} | sheets: ${wb.SheetNames.join(', ')}`);
    throw new Error(`Arquivo "${file.name}" não reconhecido.`);
  }
}

async function handleFiles(files, el) {
  if (!files?.length) return;

  // Reseta BTG para o novo lote (Distribuição é mantida)
  state.btgRows = null;
  state.btgMap = null;
  state.loaded.btg = null;
  state.uploadAfter17h = new Date().getHours() >= 17;

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

  if (!state.btgRows?.length && !state.distRows?.length && !state.allOsRows?.length) {
    el.feedback.textContent = erros.length
      ? `Arquivos não reconhecidos: ${erros.join(', ')}. Envie a Distribuição de OS ou o Relatório BTG.`
      : 'Nenhum dado encontrado nos arquivos enviados.';
    el.dropZone.classList.remove('btg-loading');
    renderChips(el);
    return;
  }

  if (state.distRows !== null && state.distRows.length === 0) {
    el.feedback.textContent = 'Aviso: planilha de Distribuição carregada mas nenhuma O.S. foi lida. Verifique o formato do arquivo no console.';
  }

  try { await upsertOperacionalOsAberta(state.allOsRows); }
  catch (err) { console.warn('upsertOperacionalOsAberta:', err?.message || err); }
  await persistDistribuicaoRows(state.distRows);
  await persistBtgRows(state.btgRows);

  // Preserva estado do upload antes de recarregar o banco
  const uploadBtgRows    = state.btgRows;
  const uploadBtgMap     = state.btgMap;
  const uploadBtgLoaded  = state.loaded.btg;
  const uploadDistRows   = state.distRows;
  const uploadDistLoaded = state.loaded.dist;
  const uploadListaOsRows = state.listaOsRows;
  const uploadListaOsMap = state.listaOsMap;
  const uploadListaOsMapByContrato = state.listaOsMapByContrato;
  const uploadListaOsLoaded = state.loaded.listaOs;

  el.dropZone.classList.remove('btg-loading');
  await loadDbData(el);

  // Restaura dados do upload — têm checkinDiario que o banco preserva mas precisa garantir
  if (uploadBtgRows?.length) {
    state.btgRows = uploadBtgRows;
    state.btgMap  = uploadBtgMap;
    state.mode    = 'xlsx';
  }
  if (uploadBtgLoaded)  state.loaded.btg  = uploadBtgLoaded;
  if (uploadDistRows?.length && !state.distRows?.length) state.distRows = uploadDistRows;
  if (uploadDistLoaded) state.loaded.dist = uploadDistLoaded;
  if (uploadListaOsRows?.length && !state.listaOsRows?.length) {
    state.listaOsRows = uploadListaOsRows;
    state.listaOsMap = uploadListaOsMap;
    state.listaOsMapByContrato = uploadListaOsMapByContrato;
  }
  if (uploadListaOsLoaded) state.loaded.listaOs = uploadListaOsLoaded;

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
  const byContrato = new Map();
  for (const r of state.distRows || []) {
    if (r.os) addToMapArray(byOs, r.os, r);
    if (r.contrato && isContratoBtg(r.contrato)) addToMapArray(byContrato, r.contrato, r);
  }
  return { byOs, byContrato };
}


async function reconcile(el) {
  if (!state.btgRows?.length) {
    state.mode = 'db';
    state.finalRows = state.dbRows;
    render(el);
    return;
  }

  state.mode = 'xlsx';
  el.feedback.textContent = 'Reconciliando relatórios...';

  // Distribuição: OS → [rows]
  const { byOs: distByOs } = distIndexes();

  // Lista de OS: contrato → [rows] — usa arquivo carregado; fallback no banco
  const listaByContrato = new Map();
  if (state.listaOsRows?.length) {
    for (const r of state.listaOsRows) {
      const c = contratoNorm(r.contrato || '');
      if (!isContratoBtg(c)) continue;
      if (!listaByContrato.has(c)) listaByContrato.set(c, []);
      listaByContrato.get(c).push(r);
    }
  } else {
    for (const r of state.dbRows || []) {
      const c = contratoNorm(r.contratoOriginal || r.contrato || '');
      if (!isContratoBtg(c)) continue;
      if (!listaByContrato.has(c)) listaByContrato.set(c, []);
      listaByContrato.get(c).push({
        os: r.os, situacao: 'ABERTA', financeiro: '',
        supervisao: r.supervisao, lote: r.lote, remanescente: r.remanescente, contrato: c,
      });
    }
  }

  const out = [];

  for (const btg of state.btgRows) {
    const c = contratoNorm(btg.contratoOriginal);

    // Busca listaRows pelo contrato; tenta .001 → .000 como fallback
    let listaRows = isContratoBtg(c) ? (listaByContrato.get(c) || []) : [];
    if (!listaRows.length && isContratoBtg(c) && c.charAt(c.length - 1) === '1') {
      listaRows = listaByContrato.get(c.slice(0, -1) + '0') || [];
    }

    if (!listaRows.length) {
      out.push({
        status: 'VERIFICAR',
        os: '—', portal: btg.portal || '—',
        contrato: contratoLabel(c), contratoOriginal: c,
        tipoSolicitacao: btg.tipoSolicitacao || 'Relatório BTG',
        colaborador: '—', supervisao: '—',
        lote: null, remanescente: null, qtde: btg.qtde,
        prodDiaOs: null, checkinDiario: btg.checkinDiario || '',
        fonte: 'Relatório BTG', sheet: btg.sheet, rowNumber: btg.rowNumber,
      });
      continue;
    }

    for (const lista of listaRows) {
      const distEntries = distByOs.get(String(lista.os)) || [];
      const uniqDist = uniqBy(distEntries, r => norm(r.colaborador));
      const hasColab = uniqDist.some(r => r.colaborador && r.colaborador !== '—');

      // Status base: Situação e Financeiro da Lista de OS
      const situN   = norm(lista.situacao   || '');
      const financN = norm(lista.financeiro || '');
      const checkinOk = norm(btg.checkinDiario || '') === 'CONFIRMADO';
      let baseStatus;
      if      (situN === 'CANCELADA')                            baseStatus = 'CANCELADA';
      else if (situN === 'FINALIZADA' || situN === 'BONIFICADA') baseStatus = 'FINALIZADA';
      else if (financN === 'FATURADA')                           baseStatus = 'FATURADA';
      else if (situN === 'ABERTA' || situN === 'ATIVO' || situN === '')
        baseStatus = !hasColab ? 'FALTA COLABORADOR' : checkinOk ? 'OK' : 'CHECK-IN';
      else                                                       baseStatus = 'VERIFICAR';

      const pessoas = [];
      for (const d of uniqDist) pushUnique(pessoas, d.colaborador);
      if (!pessoas.length) pessoas.push('—');

      for (const pessoa of pessoas) {
        const dist = uniqDist.find(d => norm(d.colaborador) === norm(pessoa)) || uniqDist[0] || null;
        const prodDiaOs = dist?.prodDiaOs ?? null;

        let status = baseStatus;
        if (prodDiaOs === 'NHE') {
          status = 'NHE OK';
        } else if (typeof prodDiaOs === 'number' && prodDiaOs <= 0
                   && state.uploadAfter17h
                   && status !== 'CANCELADA' && status !== 'FINALIZADA' && status !== 'FATURADA') {
          status = 'LANÇAR NHE';
        }

        out.push({
          status,
          os: lista.os || '—',
          portal: btg.portal || '—',
          contrato: contratoLabel(c),
          contratoOriginal: c,
          tipoSolicitacao: btg.tipoSolicitacao || 'Relatório BTG',
          colaborador: pessoa || '—',
          supervisao: lista.supervisao || dist?.supervisao || '—',
          lote: lista.lote,
          remanescente: lista.remanescente,
          qtde: btg.qtde,
          prodDiaOs,
          checkinDiario: btg.checkinDiario || '',
          fonte: 'Relatório BTG',
          sheet: btg.sheet,
          rowNumber: btg.rowNumber,
        });
      }
    }
  }

  state.finalRows = out;
  render(el);
}

function exportVerificar() {
  const rows = state.finalRows.filter(r => r.status !== 'OK');
  if (!rows.length) return;
  const data = rows.map(r => ({
    Status: r.status,
    OS: r.os || '',
    Portal: r.portal || '',
    Contrato: r.contrato || '',
    'Contrato original': r.contratoOriginal || '',
    Colaborador: r.colaborador || '',
    Supervisão: r.supervisao || '',
    Lote: fnum(r.lote || r.qtde),
    Remanescente: fnum(r.remanescente || r.qtde),
    'Prod. Hoje': r.prodDiaOs === 'NHE' ? 'NHE' : (r.prodDiaOs !== null && r.prodDiaOs !== undefined ? fnum(r.prodDiaOs) : ''),
    Fonte: r.fonte || '',
    Aba: r.sheet || '',
    Linha: r.rowNumber || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'VERIFICAR');
  XLSX.writeFile(wb, `BTG_VERIFICAR_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── BotConversa Check-in ──────────────────────────────────────────────────────
async function enviarCheckinBotConversa(el) {
  const checkinRows = state.finalRows.filter(r => r.status === 'CHECK-IN');
  if (!checkinRows.length) return;

  const nomesUniq = [...new Set(
    checkinRows.map(r => r.colaborador).filter(n => n && n !== '—')
  )];

  el.feedback.textContent = 'Buscando contatos no BotConversa...';
  el.enviarCheckin.disabled = true;

  const { data: contatos, error } = await supabase
    .from('botconversa_contatos')
    .select('nome, telefone, subscriber_id, cpf')
    .eq('ativo', true);

  el.enviarCheckin.disabled = false;

  if (error) {
    el.feedback.textContent = `Erro ao buscar contatos: ${error.message}`;
    return;
  }

  const contatoMap = new Map();
  for (const c of (contatos || [])) contatoMap.set(norm(c.nome || ''), c);

  const encontrados = [];
  const naoEncontrados = [];
  for (const nome of nomesUniq) {
    const c = contatoMap.get(norm(nome));
    if (c && (c.subscriber_id || c.telefone)) encontrados.push({ nome, contato: c });
    else naoEncontrados.push(nome);
  }

  showCheckinModal({ encontrados, naoEncontrados }, async () => {
    if (!encontrados.length) return;
    el.feedback.textContent = `Enfileirando ${encontrados.length} envio(s)...`;
    try {
      const payload = encontrados.map(({ contato }) => ({
        tipo: 'flow',
        nome: contato.nome,
        cpf: contato.cpf || null,
        telefone: contato.telefone || null,
        subscriber_id: contato.subscriber_id || null,
        flow_id: '8965976',
        status: 'pendente',
        origem: 'btg-logistica',
      }));
      const { error: filaErr } = await supabase.from('botconversa_fila').insert(payload);
      if (filaErr) throw new Error(filaErr.message);
      await supabase.functions.invoke('botconversa-send', {
        body: { processar_fila: true, origem: 'btg-logistica' }
      }).catch(() => {});
      el.feedback.textContent =
        `Check-in enviado para ${encontrados.length} colaborador(es).` +
        (naoEncontrados.length ? ` Sem contato: ${naoEncontrados.join(', ')}.` : '');
    } catch (err) {
      el.feedback.textContent = `Erro ao enviar: ${err.message}`;
    }
  });
}

function showCheckinModal({ encontrados, naoEncontrados }, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'btg-modal-overlay';
  overlay.innerHTML = `
    <div class="btg-modal">
      <h3 class="btg-modal-title">Enviar Check-in — BotConversa</h3>
      <p class="btg-modal-sub">Fluxo <b>8965976</b> será disparado para os colaboradores com Check-in pendente.</p>
      ${encontrados.length ? `
        <div class="btg-modal-section">
          <div class="btg-modal-label">Serão notificados (${encontrados.length})</div>
          <div class="btg-modal-list">
            ${encontrados.map(({ contato }) => `
              <div class="btg-modal-item">
                <span>${esc(contato.nome)}</span>
                <span class="btg-modal-phone">${esc(contato.telefone || contato.subscriber_id || '—')}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      ${naoEncontrados.length ? `
        <div class="btg-modal-section">
          <div class="btg-modal-label warn">Sem contato no BotConversa (${naoEncontrados.length})</div>
          <div class="btg-modal-list warn">
            ${naoEncontrados.map(n => `<div class="btg-modal-item warn">${esc(n)}</div>`).join('')}
          </div>
        </div>` : ''}
      ${!encontrados.length ? `<div class="btg-modal-empty">Nenhum contato encontrado no BotConversa para os colaboradores com Check-in pendente.</div>` : ''}
      <div class="btg-modal-actions">
        <button class="btn btn-secondary btg-modal-cancel">Cancelar</button>
        ${encontrados.length ? `<button class="btn btg-modal-confirm">Confirmar e Enviar</button>` : ''}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('.btg-modal-cancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  const confirmBtn = overlay.querySelector('.btg-modal-confirm');
  if (confirmBtn) confirmBtn.onclick = () => { overlay.remove(); onConfirm(); };
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
    .btg-filter-btn{border:1px solid rgba(52,211,153,.18);border-radius:999px;background:rgba(15,23,42,.62);color:#d1d5db;padding:7px 11px;font-size:12px;font-weight:800;cursor:pointer;transition:.15s}
    .btg-filter-btn:hover,.btg-filter-btn.active{border-color:rgba(52,211,153,.45);background:rgba(22,163,74,.18);color:#ecfdf5}
    .btg-checkin-off{display:inline-flex;align-items:center;color:#ef4444;margin-left:6px;vertical-align:middle;cursor:default}
    .btg-filter-btn b{margin-left:5px;color:#86efac}
    .btg-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.15);border-radius:16px;background:rgba(2,6,23,.25)}
    .btg-table{width:100%;min-width:860px;border-collapse:separate;border-spacing:0;table-layout:fixed;color:#e2e2f0}
    .btg-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:7px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1;white-space:nowrap}
    .btg-table th:hover{color:#fff;background:#0b2116}
    .btg-table td{padding:6px 8px;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle;background:rgba(15,23,42,.22)}
    .btg-row:hover td{background:rgba(22,101,52,.1)}
    .btg-table th:nth-child(1),.btg-table td:nth-child(1){width:112px}
    .btg-table th:nth-child(2),.btg-table td:nth-child(2){width:72px}
    .btg-table th:nth-child(3),.btg-table td:nth-child(3){width:66px}
    .btg-table th:nth-child(4),.btg-table td:nth-child(4){width:100px}
    .btg-table th:nth-child(5),.btg-table td:nth-child(5){width:150px}
    .btg-table th:nth-child(6),.btg-table td:nth-child(6){width:118px}
    .btg-table td:nth-child(7),.btg-table td:nth-child(8),.btg-table td:nth-child(9),.btg-table th:nth-child(7),.btg-table th:nth-child(8),.btg-table th:nth-child(9){text-align:right;width:72px}
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
    .btg-status.status-checkin{background:rgba(239,68,68,.18);color:#f87171;border-color:rgba(239,68,68,.45);font-weight:900}
    .btg-row.status-checkin td{background:rgba(239,68,68,.06)}
    .btg-status.status-pendencia{background:rgba(234,179,8,.12);color:#fde047;border-color:rgba(234,179,8,.3)}
    .btg-status.status-falta{background:rgba(249,115,22,.13);color:#fdba74;border-color:rgba(249,115,22,.3)}
    .btg-status.status-faturada{background:rgba(139,92,246,.14);color:#c4b5fd;border-color:rgba(139,92,246,.28)}
    .btg-row.status-faturada td{background:rgba(139,92,246,.04)}
    .btg-status.status-cancelada{background:rgba(100,116,139,.14);color:#94a3b8;border-color:rgba(100,116,139,.3)}
    .btg-row.status-cancelada td{background:rgba(100,116,139,.04)}
    .btg-status.status-finalizada{background:rgba(34,197,94,.14);color:#86efac;border-color:rgba(34,197,94,.3)}
    .btg-row.status-finalizada td{background:rgba(34,197,94,.04)}
    .btg-row.status-verificar td{background:rgba(239,68,68,.04)}
    .btg-row.status-pendencia td{background:rgba(234,179,8,.04)}
    .btg-row.status-falta td{background:rgba(249,115,22,.04)}
    .btg-status.status-nhe{background:rgba(168,85,247,.14);color:#d8b4fe;border-color:rgba(168,85,247,.3)}
    .btg-row.status-nhe td{background:rgba(168,85,247,.04)}
    .btg-status.status-nhe-ok{background:rgba(59,130,246,.14);color:#93c5fd;border-color:rgba(59,130,246,.28)}
    .btg-row.status-nhe-ok td{background:rgba(59,130,246,.04)}
    .btg-btn-checkin{background:rgba(220,38,38,.15);color:#fca5a5;border:1px solid rgba(220,38,38,.35)}
    .btg-btn-checkin:hover:not(:disabled){background:rgba(220,38,38,.3);color:#fff;border-color:rgba(220,38,38,.6)}
    .btg-btn-checkin:disabled{opacity:.4;cursor:not-allowed}
    .btg-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
    .btg-modal{background:#0d0d18;border:1px solid rgba(52,211,153,.2);border-radius:20px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto}
    .btg-modal-title{font-size:16px;font-weight:800;color:#f1f5f9;margin:0 0 6px}
    .btg-modal-sub{font-size:13px;color:#94a3b8;margin:0 0 16px}
    .btg-modal-section{margin-bottom:14px}
    .btg-modal-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#86efac;margin-bottom:6px}
    .btg-modal-label.warn{color:#fbbf24}
    .btg-modal-list{border:1px solid rgba(52,211,153,.12);border-radius:10px;overflow:hidden}
    .btg-modal-list.warn{border-color:rgba(251,191,36,.2)}
    .btg-modal-item{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;font-size:12px;color:#e2e2f0;border-bottom:1px solid rgba(148,163,184,.07)}
    .btg-modal-item:last-child{border-bottom:none}
    .btg-modal-item.warn{color:#fde68a}
    .btg-modal-phone{color:#94a3b8;font-size:11px;font-family:monospace}
    .btg-modal-empty{padding:14px;color:#94a3b8;font-size:13px;text-align:center}
    .btg-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}
    .btg-modal-confirm{background:#dc2626;color:#fff;border-color:#dc2626}
    .btg-modal-confirm:hover{background:#b91c1c}
    .btg-small-ok{font-size:11px;color:#93c5fd;font-weight:800}
    .btg-empty{border:1px dashed rgba(148,163,184,.2);border-radius:16px;padding:24px;color:#94a3b8;text-align:center}
    .badge-info{background:rgba(59,130,246,.18);color:#93c5fd;border-color:rgba(59,130,246,.3)}
    @media(max-width:700px){.btg-table{min-width:800px}}
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
          <div class="btg-chip-file" id="btgChipListaOs">Lista de O.S. — aguardando</div>
        </div>
        <div class="btg-actions">
          <button class="btn btn-secondary" id="btgExportVerificar">Gerar XLS VERIFICAR</button>
          <button class="btn btn-secondary btg-btn-checkin" id="btgEnviarCheckin" disabled>Enviar Check-in</button>
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
    chipListaOs: document.getElementById('btgChipListaOs'),
    busca: document.getElementById('btgBusca'),
    statusFilters: document.getElementById('btgStatusFilters'),
    feedback: document.getElementById('btgFeedback'),
    tableWrap: document.getElementById('btgTableWrap'),
    count: document.getElementById('btgCount'),
    tableTitle: document.getElementById('btgTableTitle'),
    tableSubtitle: document.getElementById('btgTableSubtitle'),
    enviarCheckin: document.getElementById('btgEnviarCheckin'),
  };

  el.busca.addEventListener('input', () => { state.busca = el.busca.value.trim(); render(el); });
  el.exportVerificar.addEventListener('click', exportVerificar);
  el.enviarCheckin.addEventListener('click', () => enviarCheckinBotConversa(el));

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
