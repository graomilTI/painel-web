import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BTG_RE = /BTG\s+PACTUAL\s+COMMODITIES\s+SERTRADING/i;
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

// ── Detecção automática de tipo de relatório ──────────────────────────────────
// Retorna 'distribuicao' | 'smart' | 'unknown'
function detectFileType(wb) {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    // Lê todas as linhas mas inspeciona apenas as 6 primeiras (inclui linha 0)
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (const row of raw.slice(0, 6)) {
      const r = norm(row.map(c => String(c ?? '')).join(' '));
      // Distribuição: colunas O.S., Funcionário, Remanescente, Cliente
      if (r.includes('FUNCION') && r.includes('REMANESCENTE') && (r.includes('O S') || r.includes('OS'))) {
        return 'distribuicao';
      }
      // Smart/BTG: colunas Contrato, Ordem de Frete, Commodity
      if (r.includes('ORDEM') && r.includes('FRETE') && r.includes('CONTRATO')) {
        return 'smart';
      }
      if (r.includes('CONTRATO') && r.includes('COMMODITY')) {
        return 'smart';
      }
    }
  }
  return 'unknown';
}

// ── Estado ────────────────────────────────────────────────────────────────────
const state = {
  dbRows:    [],
  distRows:  null,
  smartMap:  null,
  finalRows: [],
  mode:      'db',
  busca:     '',
  sort:      { col: 'os', dir: 'asc' },
  loaded:    { dist: null, smart: null },  // nomes dos arquivos carregados
};

// ── Ordenação / filtro ────────────────────────────────────────────────────────
function sorted(rows) {
  const { col, dir } = state.sort;
  const f = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (col === 'lote' || col === 'remanescente' || col === 'os')
      return (fnum(a[col]) - fnum(b[col])) * f;
    return String(a[col] ?? '').localeCompare(String(b[col] ?? ''), 'pt-BR') * f;
  });
}

function filtered() {
  const q = norm(state.busca);
  return sorted(state.finalRows.filter(r => {
    if (!q) return true;
    return q.split(' ').filter(Boolean)
      .every(t => norm(`${r.os} ${r.contrato} ${r.colaborador} ${r.supervisao}`).includes(t));
  }));
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
  const smartLoaded = !!state.loaded.smart;
  el.chipDist.className  = `btg-chip-file ${distLoaded  ? 'loaded' : ''}`;
  el.chipSmart.className = `btg-chip-file ${smartLoaded ? 'loaded' : ''}`;
  el.chipDist.textContent  = distLoaded
    ? `Distribuição: ${state.loaded.dist}`
    : 'Distribuição de O.S. — aguardando';
  el.chipSmart.textContent = smartLoaded
    ? `BTG smart: ${state.loaded.smart}`
    : 'Relatório BTG (smart) — aguardando';
}

function render(el) {
  const rows = filtered();
  el.modeTag.textContent = state.mode === 'xlsx' ? 'RELATÓRIOS' : 'BASE DE DADOS';
  el.modeTag.className   = `badge${state.mode === 'xlsx' ? ' badge-info' : ''}`;
  el.count.textContent   = `${rows.length}`;
  el.tableTitle.textContent    = `Lista BTG (${rows.length})`;
  el.tableSubtitle.textContent = state.mode === 'xlsx'
    ? 'Dados reconciliados: Distribuição de OS + Relatório BTG'
    : 'Dados do banco de dados (operacional_os)';

  renderChips(el);

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
          ${thHtml('os', 'O.S.')}
          ${thHtml('contrato', 'Contrato')}
          ${thHtml('colaborador', 'Colaborador')}
          ${thHtml('supervisao', 'Supervisão')}
          ${thHtml('lote', 'Lote')}
          ${thHtml('remanescente', 'Remanescente')}
        </tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody>
      </table>
    </div>`;
}

function rowHtml(r) {
  const rem = fnum(r.remanescente);
  const lote = fnum(r.lote);
  const pct = lote > 0 ? Math.min(100, (rem / lote) * 100) : 0;
  const chip = rem <= 0 ? 'danger' : pct < 20 ? 'warn' : 'ok';
  const smartIcon = state.smartMap != null
    ? r.smartValid
      ? ' <span title="Contrato confirmado no relatório BTG" style="color:#86efac;font-size:10px">✓</span>'
      : ' <span title="Contrato não encontrado no relatório BTG" style="color:#f87171;font-size:10px">!</span>'
    : '';
  return `<tr class="btg-row">
    <td><span class="btg-os-num">${esc(r.os)}</span></td>
    <td><span class="btg-contrato">${esc(r.contrato)}</span>${smartIcon}</td>
    <td><span class="btg-colab">${esc(r.colaborador)}</span></td>
    <td><span class="btg-sup">${esc(r.supervisao)}</span></td>
    <td><span class="btg-val">${esc(fmt(r.lote))}</span></td>
    <td><span class="btg-chip ${chip}">${esc(fmt(r.remanescente))}</span></td>
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
      .limit(2000);
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

    state.dbRows = (osData || []).map(r => ({
      os: r.numero_os,
      contrato: r.contrato || '—',
      colaborador: (colabMap[r.id] || []).join(', ') || '—',
      supervisao: r.supervisao || '—',
      lote: r.lote,
      remanescente: r.remanescente,
      smartValid: undefined,
      fonte: 'db',
    }));
  } catch (err) {
    console.error(err);
    state.dbRows = [];
    el.feedback.textContent = `Erro: ${err.message}`;
  }
  if (state.mode === 'db') state.finalRows = state.dbRows;
}

// ── Parsers dos relatórios ────────────────────────────────────────────────────
function parseDistribuicao(wb) {
  const wsName = wb.SheetNames.find(n => /embarque/i.test(n)) || wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, defval: '' });

  let hIdx = 0;
  for (let i = 0; i < Math.min(6, raw.length); i++) {
    if (raw[i].some(c => /O\.S\.|funcion/i.test(String(c)))) { hIdx = i; break; }
  }
  const h = raw[hIdx];
  const ci = {
    os:          h.findIndex(c => /^o\.s\.$/i.test(String(c).trim())),
    colaborador: h.findIndex(c => /funcion/i.test(String(c))),
    supervisao:  h.findIndex(c => /supervis/i.test(String(c))),
    coordenacao: h.findIndex(c => /coordena/i.test(String(c))),
    cliente:     h.findIndex(c => /cliente/i.test(String(c))),
    lote:        h.findIndex(c => /^lote$/i.test(String(c).trim())),
    remanescente:h.findIndex(c => /remanescente/i.test(String(c))),
  };

  return raw.slice(hIdx + 1)
    .filter(r => BTG_RE.test(String(r[ci.cliente] ?? '')))
    .map(r => ({
      os:          r[ci.os],
      colaborador: String(r[ci.colaborador] ?? '').trim() || '—',
      supervisao:  String(r[ci.supervisao] ?? r[ci.coordenacao] ?? '').trim() || '—',
      lote:        r[ci.lote],
      remanescente:r[ci.remanescente],
    }));
}

function parseSmart(wb) {
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const h = raw[0];
  const ci = {
    contrato: h.findIndex(c => /^contrato$/i.test(String(c).trim())),
    os:       h.findIndex(c => /ordem.*servi/i.test(String(c))),
    qtde:     h.findIndex(c => /qtde/i.test(String(c))),
  };
  const map = {};
  for (const r of raw.slice(1)) {
    const contrato = String(r[ci.contrato] ?? '').trim();
    if (contrato) map[contrato] = { contrato, os_btg: r[ci.os], qtde: r[ci.qtde] };
  }
  return map;
}

// ── Processamento de arquivo(s) ───────────────────────────────────────────────
async function processFile(file, el) {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array' });
  const tipo = detectFileType(wb);

  if (tipo === 'distribuicao') {
    state.distRows    = parseDistribuicao(wb);
    state.loaded.dist = `${file.name} (${state.distRows.length} linhas BTG)`;
  } else if (tipo === 'smart') {
    state.smartMap    = parseSmart(wb);
    state.loaded.smart = `${file.name} (${Object.keys(state.smartMap).length} contratos)`;
  } else {
    throw new Error(`Arquivo "${file.name}" não reconhecido. Envie a Distribuição de OS ou o relatório BTG (smart).`);
  }
}

async function handleFiles(files, el) {
  if (!files?.length) return;

  el.feedback.textContent = 'Processando...';
  el.dropZone.classList.add('btg-loading');

  try {
    for (const file of files) {
      await processFile(file, el);
    }
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
async function reconcile(el) {
  if (!state.distRows?.length) {
    state.mode = 'db';
    state.finalRows = state.dbRows;
    render(el);
    return;
  }

  state.mode = 'xlsx';
  el.feedback.textContent = 'Reconciliando com banco de dados...';

  try {
    const osNumbers = [...new Set(state.distRows.map(r => r.os).filter(Boolean))];
    const { data: dbOs } = await supabase
      .from('operacional_os')
      .select('numero_os, contrato')
      .in('numero_os', osNumbers);

    const contratoMap = {};
    for (const r of (dbOs || [])) contratoMap[r.numero_os] = r.contrato;

    state.finalRows = state.distRows.map(r => {
      const contrato   = contratoMap[r.os] || '—';
      const smartValid = state.smartMap != null
        ? (contrato !== '—' && contrato in state.smartMap)
        : undefined;
      return { os: r.os, contrato, colaborador: r.colaborador,
               supervisao: r.supervisao, lote: r.lote, remanescente: r.remanescente,
               smartValid, fonte: 'xlsx' };
    });
  } catch (err) {
    console.error(err);
    state.finalRows = state.distRows.map(r => ({
      os: r.os, contrato: '—', colaborador: r.colaborador,
      supervisao: r.supervisao, lote: r.lote, remanescente: r.remanescente,
      smartValid: undefined, fonte: 'xlsx',
    }));
  }

  render(el);
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────
function setupDragDrop(zone, input, el) {
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('btg-drag-over'); });
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
    .btg-upload-hint{font-size:12px;color:#6b7280}
    .btg-file-chips{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
    .btg-chip-file{font-size:11px;padding:5px 11px;border-radius:999px;border:1px solid rgba(148,163,184,.2);color:#6b7280;background:rgba(15,23,42,.3);transition:.2s}
    .btg-chip-file.loaded{color:#86efac;border-color:rgba(52,211,153,.35);background:rgba(22,163,74,.1)}
    .btg-file-label{display:inline-flex;align-items:center;cursor:pointer;font-size:12px;white-space:nowrap}
    .btg-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.15);border-radius:16px;background:rgba(2,6,23,.25)}
    .btg-table{width:100%;min-width:780px;border-collapse:separate;border-spacing:0;table-layout:fixed;color:#e2e2f0}
    .btg-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1;white-space:nowrap}
    .btg-table th:hover{color:#fff;background:#0b2116}
    .btg-table td{padding:9px 12px;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle;background:rgba(15,23,42,.22)}
    .btg-row:hover td{background:rgba(22,101,52,.1)}
    .btg-table td:last-child,.btg-table th:last-child{text-align:right}
    .btg-os-num{font-size:13px;font-weight:950;color:#f8fafc}
    .btg-contrato{font-size:12px;font-weight:700;color:#a7f3d0;font-family:monospace}
    .btg-colab{font-size:12px;color:#e2e2f0;line-height:1.3}
    .btg-sup{font-size:11px;color:#94a3b8}
    .btg-val{font-size:12px;font-weight:700;color:#e2e2f0}
    .btg-chip{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700;border:1px solid rgba(148,163,184,.18)}
    .btg-chip.ok{background:rgba(22,163,74,.14);color:#86efac;border-color:rgba(52,211,153,.2)}
    .btg-chip.warn{background:rgba(250,204,21,.12);color:#fde68a;border-color:rgba(250,204,21,.25)}
    .btg-chip.danger{background:rgba(239,68,68,.11);color:#fca5a5;border-color:rgba(239,68,68,.25)}
    .btg-empty{border:1px dashed rgba(148,163,184,.2);border-radius:16px;padding:24px;color:#6b7280;text-align:center}
    .badge-info{background:rgba(59,130,246,.18);color:#93c5fd;border-color:rgba(59,130,246,.3)}
    @media(max-width:700px){.btg-table{min-width:580px}}
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
          <p class="muted">Conciliação entre Distribuição de OS e Relatório BTG para o cliente BTG PACTUAL COMMODITIES SERTRADING S.A.</p>
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
          <span class="btg-upload-hint">Arraste um ou dois arquivos — o painel identifica automaticamente cada relatório</span>
        </div>
        <div class="btg-file-chips">
          <div class="btg-chip-file" id="btgChipDist">Distribuição de O.S. — aguardando</div>
          <div class="btg-chip-file" id="btgChipSmart">Relatório BTG (smart) — aguardando</div>
        </div>
      </div>

      <div class="filters-grid" style="margin-top:16px">
        <div class="field">
          <label>Buscar</label>
          <input id="btgBusca" type="text" placeholder="O.S., contrato, colaborador, supervisão..."
            style="min-height:38px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;padding:8px 12px;font-size:13px;width:100%;box-sizing:border-box" />
        </div>
      </div>
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
    modeTag:      document.getElementById('btgModeTag'),
    recarregar:   document.getElementById('btgRecarregar'),
    dropZone:     document.getElementById('btgDropZone'),
    fileInput:    document.getElementById('btgFileInput'),
    chipDist:     document.getElementById('btgChipDist'),
    chipSmart:    document.getElementById('btgChipSmart'),
    busca:        document.getElementById('btgBusca'),
    feedback:     document.getElementById('btgFeedback'),
    tableWrap:    document.getElementById('btgTableWrap'),
    count:        document.getElementById('btgCount'),
    tableTitle:   document.getElementById('btgTableTitle'),
    tableSubtitle:document.getElementById('btgTableSubtitle'),
  };

  el.busca.addEventListener('input', () => { state.busca = el.busca.value.trim(); render(el); });

  el.tableWrap.addEventListener('click', e => {
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    state.sort = { col, dir: state.sort.col === col && state.sort.dir === 'asc' ? 'desc' : 'asc' };
    render(el);
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
