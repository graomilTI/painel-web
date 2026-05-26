import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BTG_RE = /BTG\s+PACTUAL\s+COMMODITIES\s+SERTRADING/i;
const BR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BR_INT = new Intl.NumberFormat('pt-BR');

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

const state = {
  // DB source
  dbRows: [],
  // xlsx sources (parsed)
  distRows: null,   // [{os,colaborador,supervisao,lote,remanescente}] from Distribuição
  smartMap: null,   // {contrato: {os_btg,qtde}} from smart.xlsx
  // reconciled view
  finalRows: [],
  mode: 'db',       // 'db' | 'xlsx'
  busca: '',
  sort: { col: 'os', dir: 'asc' },
};

function sorted(rows) {
  const { col, dir } = state.sort;
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (col === 'lote' || col === 'remanescente') {
      return (fnum(a[col]) - fnum(b[col])) * factor;
    }
    if (col === 'os') {
      return (fnum(a.os) - fnum(b.os)) * factor;
    }
    return String(a[col] ?? '').localeCompare(String(b[col] ?? ''), 'pt-BR') * factor;
  });
}

function filtered() {
  const q = norm(state.busca);
  return sorted(state.finalRows.filter(r => {
    if (!q) return true;
    const hay = norm(`${r.os} ${r.contrato} ${r.colaborador} ${r.supervisao}`);
    return q.split(' ').filter(Boolean).every(t => hay.includes(t));
  }));
}

function sortArrow(col) {
  if (state.sort.col !== col) return '<span style="opacity:.3">↕</span>';
  return state.sort.dir === 'asc' ? '↑' : '↓';
}

function thHtml(col, label) {
  return `<th data-sort="${esc(col)}" style="cursor:pointer;user-select:none">${esc(label)} ${sortArrow(col)}</th>`;
}

function render(el) {
  const rows = filtered();
  const modeLabel = state.mode === 'xlsx' ? 'RELATÓRIOS' : 'BASE DE DADOS';
  el.modeTag.textContent = modeLabel;
  el.modeTag.className = `badge ${state.mode === 'xlsx' ? 'badge-info' : ''}`;
  el.count.textContent = `${rows.length}`;
  el.tableTitle.textContent = `Lista BTG (${rows.length})`;
  el.tableSubtitle.textContent = state.mode === 'xlsx'
    ? 'Dados reconciliados: Distribuição de OS + Relatório BTG'
    : 'Dados do banco de dados (operacional_os)';

  if (state.mode === 'db' && state.dbRows.length === 0) {
    el.feedback.textContent = 'Nenhuma O.S. BTG encontrada no banco de dados.';
    el.tableWrap.innerHTML = '<div class="btg-empty">Nenhum registro encontrado. Carregue os relatórios xlsx para visualizar os dados.</div>';
    return;
  }

  if (rows.length === 0) {
    el.feedback.textContent = `Nenhum resultado para o filtro atual.`;
    el.tableWrap.innerHTML = '<div class="btg-empty">Nenhum resultado para o filtro atual.</div>';
    return;
  }

  el.feedback.textContent = `${rows.length} registro${rows.length !== 1 ? 's' : ''} BTG${state.mode === 'xlsx' ? ' reconciliados' : ''}.`;

  el.tableWrap.innerHTML = `
    <div class="btg-table-wrap">
      <table class="btg-table">
        <thead>
          <tr>
            ${thHtml('os', 'O.S.')}
            ${thHtml('contrato', 'Contrato')}
            ${thHtml('colaborador', 'Colaborador')}
            ${thHtml('supervisao', 'Supervisão')}
            ${thHtml('lote', 'Lote')}
            ${thHtml('remanescente', 'Remanescente')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(rowHtml).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function rowHtml(r) {
  const rem = fnum(r.remanescente);
  const lote = fnum(r.lote);
  const percRem = lote > 0 ? Math.min(100, (rem / lote) * 100) : 0;
  const remClass = rem <= 0 ? 'btg-chip danger' : percRem < 20 ? 'btg-chip warn' : 'btg-chip ok';
  const hasSmart = r.smartValid === true;
  const smartIcon = state.smartMap != null
    ? hasSmart
      ? '<span title="Encontrado no relatório BTG" style="color:#86efac;font-size:11px">✓</span>'
      : '<span title="Não encontrado no relatório BTG" style="color:#f87171;font-size:11px">!</span>'
    : '';

  return `<tr class="btg-row">
    <td><span class="btg-os-num">${esc(r.os)}</span></td>
    <td><span class="btg-contrato">${esc(r.contrato)}</span>${smartIcon}</td>
    <td><span class="btg-colab">${esc(r.colaborador)}</span></td>
    <td><span class="btg-sup">${esc(r.supervisao)}</span></td>
    <td><span class="btg-val">${esc(fmt(r.lote))}</span></td>
    <td><span class="${remClass}">${esc(fmt(r.remanescente))}</span></td>
  </tr>`;
}

async function loadDbData(el) {
  el.feedback.textContent = 'Carregando dados BTG...';
  try {
    const { data: osData, error: osErr } = await supabase
      .from('operacional_os')
      .select('id, numero_os, contrato, supervisao, lote, remanescente')
      .ilike('cliente', 'BTG PACTUAL COMMODITIES SERTRADING%')
      .order('numero_os', { ascending: false })
      .limit(2000);

    if (osErr) throw new Error(osErr.message);
    const osRows = osData || [];

    let colabMap = {};
    if (osRows.length) {
      const ids = osRows.map(r => r.id);
      const { data: colabData } = await supabase
        .from('operacional_os_colaboradores')
        .select('os_id, colaborador_nome')
        .in('os_id', ids);
      for (const c of (colabData || [])) {
        if (!colabMap[c.os_id]) colabMap[c.os_id] = [];
        colabMap[c.os_id].push(c.colaborador_nome);
      }
    }

    state.dbRows = osRows.map(r => ({
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
    console.error('Erro ao carregar BTG:', err);
    state.dbRows = [];
    el.feedback.textContent = `Erro ao carregar: ${err.message}`;
  }

  if (state.mode === 'db') {
    state.finalRows = state.dbRows;
  }
}

async function handleDistFile(file, el) {
  if (!file) return;
  el.distStatus.textContent = 'Processando...';
  el.distStatus.style.color = '#94a3b8';
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const wsName = wb.SheetNames.find(n => /embarque/i.test(n)) || wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Localizar linha de cabeçalho (contém 'O.S.' ou 'Funcionário')
    let hIdx = 0;
    for (let i = 0; i < Math.min(6, raw.length); i++) {
      if (raw[i].some(c => /O\.S\.|funcion/i.test(String(c)))) { hIdx = i; break; }
    }
    const hdrs = raw[hIdx];
    const ci = {
      os:          hdrs.findIndex(h => /^o\.s\.$/i.test(String(h).trim())),
      colaborador: hdrs.findIndex(h => /funcion/i.test(String(h))),
      supervisao:  hdrs.findIndex(h => /supervis/i.test(String(h))),
      coordenacao: hdrs.findIndex(h => /coordena/i.test(String(h))),
      cliente:     hdrs.findIndex(h => /cliente/i.test(String(h))),
      lote:        hdrs.findIndex(h => /^lote$/i.test(String(h).trim())),
      remanescente:hdrs.findIndex(h => /remanescente/i.test(String(h))),
    };

    const btgRows = raw.slice(hIdx + 1)
      .filter(r => BTG_RE.test(String(r[ci.cliente] ?? '')))
      .map(r => ({
        os: r[ci.os],
        colaborador: String(r[ci.colaborador] ?? '').trim() || '—',
        supervisao: String(r[ci.supervisao] ?? r[ci.coordenacao] ?? '').trim() || '—',
        lote: r[ci.lote],
        remanescente: r[ci.remanescente],
      }));

    state.distRows = btgRows;
    el.distStatus.textContent = `${btgRows.length} linhas BTG carregadas`;
    el.distStatus.style.color = '#86efac';
  } catch (err) {
    console.error('Erro no arquivo Distribuição:', err);
    el.distStatus.textContent = 'Erro ao processar arquivo';
    el.distStatus.style.color = '#f87171';
    state.distRows = null;
  }
}

async function handleSmartFile(file, el) {
  if (!file) return;
  el.smartStatus.textContent = 'Processando...';
  el.smartStatus.style.color = '#94a3b8';
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const hdrs = raw[0];
    const ci = {
      contrato: hdrs.findIndex(h => /^contrato$/i.test(String(h).trim())),
      os:       hdrs.findIndex(h => /ordem.*servi/i.test(String(h))),
      qtde:     hdrs.findIndex(h => /qtde/i.test(String(h))),
    };

    const map = {};
    for (const r of raw.slice(1)) {
      const contrato = String(r[ci.contrato] ?? '').trim();
      if (contrato) map[contrato] = { contrato, os_btg: r[ci.os], qtde: r[ci.qtde] };
    }

    state.smartMap = map;
    el.smartStatus.textContent = `${Object.keys(map).length} contratos BTG carregados`;
    el.smartStatus.style.color = '#86efac';
  } catch (err) {
    console.error('Erro no arquivo smart:', err);
    el.smartStatus.textContent = 'Erro ao processar arquivo';
    el.smartStatus.style.color = '#f87171';
    state.smartMap = null;
  }
}

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
    // Buscar contrato por numero_os no banco
    const osNumbers = [...new Set(state.distRows.map(r => r.os).filter(Boolean))];
    const { data: dbOs } = await supabase
      .from('operacional_os')
      .select('numero_os, contrato')
      .in('numero_os', osNumbers);

    const contratoMap = {};
    for (const r of (dbOs || [])) contratoMap[r.numero_os] = r.contrato;

    state.finalRows = state.distRows.map(r => {
      const contrato = contratoMap[r.os] || '—';
      const smartValid = state.smartMap != null
        ? (contrato !== '—' && contrato in state.smartMap)
        : undefined;
      return {
        os: r.os,
        contrato,
        colaborador: r.colaborador,
        supervisao: r.supervisao,
        lote: r.lote,
        remanescente: r.remanescente,
        smartValid,
        fonte: 'xlsx',
      };
    });
  } catch (err) {
    console.error('Erro na reconciliação:', err);
    state.finalRows = state.distRows.map(r => ({
      os: r.os, contrato: '—', colaborador: r.colaborador,
      supervisao: r.supervisao, lote: r.lote, remanescente: r.remanescente,
      smartValid: undefined, fonte: 'xlsx',
    }));
  }

  render(el);
}

function setupDragDrop(dropZone, inputEl) {
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('btg-drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('btg-drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('btg-drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputEl.files = dt.files;
      inputEl.dispatchEvent(new Event('change'));
    }
  });
}

function injectStyles() {
  if (document.getElementById('btg-styles')) return;
  const s = document.createElement('style');
  s.id = 'btg-styles';
  s.textContent = `
    .btg-upload-area{border:1px solid rgba(52,211,153,.15);border-radius:16px;padding:18px 20px;background:rgba(2,6,23,.25);margin-top:16px}
    .btg-upload-title{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px}
    .btg-upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .btg-upload-item{border:1.5px dashed rgba(52,211,153,.22);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px;transition:border-color .2s;cursor:default}
    .btg-upload-item.btg-drag-over{border-color:#34d399;background:rgba(52,211,153,.06)}
    .btg-upload-label{font-size:12px;font-weight:700;color:#a7f3d0;text-transform:uppercase;letter-spacing:.04em}
    .btg-file-label{display:inline-flex;align-items:center;cursor:pointer;font-size:12px}
    .btg-upload-status{font-size:11px;color:#6b7280;min-height:16px}
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
    @media(max-width:700px){.btg-upload-grid{grid-template-columns:1fr}.btg-table{min-width:580px}}
  `;
  document.head.appendChild(s);
}

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

      <div class="btg-upload-area">
        <div class="btg-upload-title">Carregar relatórios para reconciliação</div>
        <div class="btg-upload-grid">
          <div class="btg-upload-item" id="btgDropDist">
            <div class="btg-upload-label">Distribuição de O.S. (.xlsx)</div>
            <label class="btn btn-secondary btg-file-label">
              <input type="file" id="btgFileDist" accept=".xlsx,.xls" hidden />
              Selecionar arquivo
            </label>
            <div class="btg-upload-status" id="btgDistStatus">Arraste ou selecione o arquivo Distribuição de OS</div>
          </div>
          <div class="btg-upload-item" id="btgDropSmart">
            <div class="btg-upload-label">Relatório BTG (smart.xlsx)</div>
            <label class="btn btn-secondary btg-file-label">
              <input type="file" id="btgFileSmart" accept=".xlsx,.xls" hidden />
              Selecionar arquivo
            </label>
            <div class="btg-upload-status" id="btgSmartStatus">Arraste ou selecione o relatório BTG</div>
          </div>
        </div>
      </div>

      <div class="filters-grid" style="margin-top:16px">
        <div class="field">
          <label>Buscar</label>
          <input id="btgBusca" class="input-field" type="text" placeholder="O.S., contrato, colaborador, supervisão..." style="min-height:38px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;padding:8px 12px;font-size:13px;width:100%;box-sizing:border-box" />
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
    fileDist:     document.getElementById('btgFileDist'),
    fileSmart:    document.getElementById('btgFileSmart'),
    dropDist:     document.getElementById('btgDropDist'),
    dropSmart:    document.getElementById('btgDropSmart'),
    distStatus:   document.getElementById('btgDistStatus'),
    smartStatus:  document.getElementById('btgSmartStatus'),
    busca:        document.getElementById('btgBusca'),
    feedback:     document.getElementById('btgFeedback'),
    tableWrap:    document.getElementById('btgTableWrap'),
    count:        document.getElementById('btgCount'),
    tableTitle:   document.getElementById('btgTableTitle'),
    tableSubtitle:document.getElementById('btgTableSubtitle'),
  };

  // Eventos de busca e ordenação
  el.busca.addEventListener('input', () => { state.busca = el.busca.value.trim(); render(el); });
  el.tableWrap.addEventListener('click', e => {
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    state.sort = {
      col,
      dir: state.sort.col === col && state.sort.dir === 'asc' ? 'desc' : 'asc',
    };
    render(el);
  });

  // Atualizar banco de dados
  el.recarregar.addEventListener('click', async () => {
    await loadDbData(el);
    if (state.mode === 'db') render(el);
    else await reconcile(el);
  });

  // Upload Distribuição
  el.fileDist.addEventListener('change', async () => {
    await handleDistFile(el.fileDist.files[0], el);
    await reconcile(el);
  });

  // Upload smart.xlsx
  el.fileSmart.addEventListener('change', async () => {
    await handleSmartFile(el.fileSmart.files[0], el);
    await reconcile(el);
  });

  // Drag-and-drop
  setupDragDrop(el.dropDist, el.fileDist);
  setupDragDrop(el.dropSmart, el.fileSmart);

  // Carga inicial
  await loadDbData(el);
  state.finalRows = state.dbRows;
  render(el);
});
