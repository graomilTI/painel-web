import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const BR = new Intl.NumberFormat('pt-BR');
const STATUS_CONF = ['PENDENTE', 'DISTRIBUIDA', 'AJUSTAR', 'CONCLUIDA'];
const STATUS_GESTOR = ['AGUARDAR', 'ATENDER', 'FINALIZAR'];
const state = { user: null, rows: [], atrib: [], filters: { status: 'ATENDER', busca: '', supervisao: '' } };

function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(); }
function num(value) { if (typeof value === 'number') return Number.isFinite(value) ? value : 0; const parsed = Number(String(value ?? '').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')); return Number.isFinite(parsed) ? parsed : 0; }
function fmt(value) { return BR.format(num(value)); }
function brDate(value) { if (!value) return '-'; const raw = String(value).slice(0,10); const [y,m,d] = raw.split('-'); return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value); }
function excelDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
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
function pick(row, names) { const entries = Object.entries(row || {}); for (const n of names) { const key = normalize(n); const found = entries.find(([k]) => normalize(k) === key); if (found) return found[1]; } return null; }
function safe(data) { return Array.isArray(data) ? data : []; }

function injectStyles() {
  if (document.getElementById('dist-os-styles')) return;
  const style = document.createElement('style');
  style.id = 'dist-os-styles';
  style.textContent = `
    .dist-grid{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px}.dist-grid .span2{grid-column:span 2}.dist-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0f172a;color:#e5e7eb;color-scheme:dark;padding:9px}.dist-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.dist-table{width:100%;min-width:1180px;border-collapse:separate;border-spacing:0;color:#e5e7eb}.dist-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:12px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.dist-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}.dist-table tr:hover td{background:rgba(22,101,52,.1)}.dist-title{font-weight:950;color:#f8fafc}.dist-meta{font-size:12px;color:#94a3b8;margin-top:4px}.dist-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.dist-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.dist-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.dist-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.dist-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}.dist-zero{box-shadow:inset 4px 0 0 #facc15}.dist-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.72);color:#dcfce7;border-radius:12px;padding:9px 12px;font-weight:900;cursor:pointer}.dist-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#94a3b8;background:rgba(15,23,42,.16)}.dist-list{display:flex;flex-direction:column;gap:7px}.dist-upload{border:1px solid rgba(52,211,153,.18);background:rgba(22,101,52,.1);border-radius:18px;padding:16px;margin-top:14px}
    @media(max-width:900px){.dist-grid{grid-template-columns:1fr}.dist-grid .span2{grid-column:span 1}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Distribuir O.S', async (content) => {
  injectStyles();
  state.user = await getCurrentUser();
  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head"><div><h3>Distribuir O.S</h3><p class="muted">Fila da Conferência com as O.S marcadas como Atender pelo gestor. O setor pode ajustar colaborador, status e observações.</p></div></div>
      <div class="filters-grid dist-grid">
        <div class="field"><label>Status gestor</label><select id="distStatusGestor" class="dist-input"><option value="ATENDER">Atender</option><option value="">Todos</option>${STATUS_GESTOR.map(s => `<option value="${s}">${s}</option>`).join('')}</select></div>
        <div class="field"><label>Supervisão</label><select id="distSup" class="dist-input"></select></div>
        <div class="field span2"><label>Buscar</label><input id="distBusca" class="dist-input" type="text" placeholder="O.S., cliente, colaborador..." /></div>
      </div>
      <div class="dist-upload">
        <div class="section-head" style="margin:0"><div><h3>Importar lista de O.S.</h3><p class="muted">Aceita a planilha com colunas Situação, Financeiro, O.S., Data, Serviço, Cliente, Embarque, Destino, Supervisão, Contrato, Produto, Lote, Embarcado e Remanescente.</p></div><div><input id="distFile" type="file" accept=".xlsx,.xls,.csv" hidden /><button id="distPickFile" class="btn btn-primary" type="button">Selecionar arquivo</button></div></div>
      </div>
      <div class="feedback mt-16" id="distFeedback">Carregando...</div>
    </section>
    <section class="grid-cards mt-16" id="distStats"></section>
    <section class="card mt-16"><div class="section-head"><div><h3>Fila de distribuição</h3><p class="muted">O.S. com remanescente zero ficam destacadas em amarelo.</p></div><button id="distReload" class="btn btn-secondary" type="button">Atualizar</button></div><div id="distList"></div></section>
  `;

  const el = { status: document.getElementById('distStatusGestor'), sup: document.getElementById('distSup'), busca: document.getElementById('distBusca'), feedback: document.getElementById('distFeedback'), stats: document.getElementById('distStats'), list: document.getElementById('distList'), reload: document.getElementById('distReload'), pick: document.getElementById('distPickFile'), file: document.getElementById('distFile') };
  bind();
  await loadAll();

  function bind() {
    el.status.addEventListener('change', () => { state.filters.status = el.status.value; render(); });
    el.sup.addEventListener('change', () => { state.filters.supervisao = el.sup.value; render(); });
    el.busca.addEventListener('input', () => { state.filters.busca = el.busca.value.trim(); render(); });
    el.reload.addEventListener('click', loadAll);
    el.pick.addEventListener('click', () => el.file.click());
    el.file.addEventListener('change', importFile);
    el.list.addEventListener('change', onListChange);
  }

  async function loadAll() {
    el.feedback.textContent = 'Carregando O.S...';
    const { data, error } = await supabase.from('operacional_os').select('*').order('data_os', { ascending: false }).order('numero_os', { ascending: false }).limit(2500);
    if (error) { el.feedback.textContent = error.message; return; }
    state.rows = safe(data);
    const ids = state.rows.map(r => r.id).filter(Boolean);
    if (ids.length) {
      const atr = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', ids).order('created_at', { ascending: true });
      state.atrib = safe(atr.data);
    } else state.atrib = [];
    fillSups(); render(); el.feedback.textContent = `Carregado: ${state.rows.length} O.S.`;
  }

  function fillSups() {
    const current = el.sup.value;
    const sups = [...new Set(state.rows.map(r => r.supervisao).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    el.sup.innerHTML = '<option value="">Todas</option>' + sups.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    if (current) el.sup.value = current;
  }

  function filtered() {
    const status = normalize(state.filters.status);
    const sup = normalize(state.filters.supervisao);
    const busca = normalize(state.filters.busca);
    return state.rows.filter(r => {
      if (status && normalize(r.status_gestor || 'AGUARDAR') !== status) return false;
      if (sup && normalize(r.supervisao) !== sup) return false;
      const colabs = atrib(r.id).map(a => a.colaborador_nome).join(' ');
      const hay = normalize(`${r.numero_os} ${r.cliente} ${r.embarque} ${r.destino} ${r.supervisao} ${colabs}`);
      return !busca || hay.includes(busca);
    });
  }

  function atrib(osId) { return state.atrib.filter(a => String(a.os_id) === String(osId)); }
  function confClass(s) { const n = normalize(s); if (n === 'CONCLUIDA') return 'ok'; if (n === 'AJUSTAR') return 'danger'; if (n === 'DISTRIBUIDA') return 'info'; return 'warn'; }

  function renderStats(rows = filtered()) {
    const atender = rows.filter(r => normalize(r.status_gestor) === 'ATENDER').length;
    const pendente = rows.filter(r => normalize(r.status_conferencia || 'PENDENTE') === 'PENDENTE').length;
    const ajust = rows.filter(r => normalize(r.status_conferencia) === 'AJUSTAR').length;
    const zero = rows.filter(r => num(r.remanescente) === 0).length;
    el.stats.innerHTML = `<article class="card"><h3>Fila</h3><p class="metric">${rows.length}</p><p class="muted">O.S. no filtro atual.</p></article><article class="card"><h3>Atender</h3><p class="metric">${atender}</p><p class="muted">Marcadas pelo gestor.</p></article><article class="card"><h3>Pendentes</h3><p class="metric">${pendente}</p><p class="muted">Aguardando Conferência.</p></article><article class="card"><h3>Ajustar / Zero</h3><p class="metric">${ajust}/${zero}</p><p class="muted">Pontos de atenção.</p></article>`;
  }

  function render() {
    const rows = filtered(); renderStats(rows);
    if (!rows.length) { el.list.innerHTML = '<div class="dist-empty">Nenhuma O.S. encontrada.</div>'; return; }
    el.list.innerHTML = `<div class="dist-table-wrap"><table class="dist-table"><thead><tr><th>O.S.</th><th>Cliente / rota</th><th>Remanescente</th><th>Colaboradores indicados</th><th>Ajuste Conferência</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
  }

  function rowHtml(row) {
    const a = atrib(row.id);
    const zero = num(row.remanescente) === 0;
    const conf = row.status_conferencia || 'PENDENTE';
    return `<tr class="${zero ? 'dist-zero' : ''}" data-id="${escapeHtml(row.id)}"><td><div class="dist-title">O.S. ${escapeHtml(row.numero_os)}</div><div class="dist-meta">${brDate(row.data_os)} • ${escapeHtml(row.servico || '-')}</div><div class="dist-meta">${escapeHtml(row.supervisao || '-')}</div></td><td><div class="dist-title">${escapeHtml(row.cliente || '-')}</div><div class="dist-meta">Embarque: ${escapeHtml(row.embarque || '-')}</div><div class="dist-meta">Destino: ${escapeHtml(row.destino || '-')}</div></td><td><span class="dist-chip ${zero ? 'warn' : 'info'}">${fmt(row.remanescente)}</span><div class="dist-meta">Lote ${fmt(row.lote)} • Embarcado ${fmt(row.embarcado)}</div>${zero ? '<div class="dist-meta" style="color:#fde68a">Remanescente zerado</div>' : ''}</td><td><div class="dist-list">${a.length ? a.map(x => `<span class="dist-chip ok">${escapeHtml(x.colaborador_nome)}${x.distancia_km ? ` • ${Number(x.distancia_km).toFixed(1).replace('.',',')} km` : ''}</span>`).join('') : '<span class="dist-chip warn">Sem colaborador indicado</span>'}</div></td><td><select class="dist-input" data-field="status_conferencia">${STATUS_CONF.map(s => `<option value="${s}" ${normalize(conf) === s ? 'selected' : ''}>${s}</option>`).join('')}</select><textarea class="dist-input" style="margin-top:8px;min-height:72px" data-field="observacao_conferencia" placeholder="Observação da conferência">${escapeHtml(row.observacao_conferencia || '')}</textarea></td></tr>`;
  }

  async function onListChange(event) {
    const tr = event.target.closest('[data-id]'); if (!tr) return;
    const status = tr.querySelector('[data-field="status_conferencia"]')?.value || 'PENDENTE';
    const obs = tr.querySelector('[data-field="observacao_conferencia"]')?.value || null;
    const payload = { status_conferencia: status, observacao_conferencia: obs, conferido_por: state.user?.id || null, conferido_em: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('operacional_os').update(payload).eq('id', tr.dataset.id);
    if (error) return alert(error.message);
    const row = state.rows.find(r => String(r.id) === String(tr.dataset.id)); if (row) Object.assign(row, payload);
    render();
  }

  async function importFile() {
    const file = el.file.files?.[0]; if (!file) return;
    el.feedback.textContent = 'Lendo planilha...';
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const rows = json.map(mapImportRow).filter(r => r.numero_os);
      if (!rows.length) throw new Error('Nenhuma O.S. encontrada na planilha.');
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase.from('operacional_os').upsert(batch, { onConflict: 'numero_os' });
        if (error) throw error;
      }
      el.feedback.textContent = `Importação concluída: ${rows.length} O.S. atualizadas.`;
      el.file.value = '';
      await loadAll();
    } catch (error) {
      console.error(error);
      el.feedback.textContent = error.message || 'Falha ao importar planilha.';
    }
  }

  function mapImportRow(row) {
    const numero = pick(row, ['O.S.', 'OS', 'O.S', 'Ordem de Serviço']);
    const embarque = pick(row, ['Embarque', 'Ponto 1', 'Local Embarque']);
    return {
      numero_os: String(numero || '').trim(),
      situacao: String(pick(row, ['Situação', 'Situacao']) || '').trim() || null,
      financeiro: String(pick(row, ['Financeiro']) || '').trim() || null,
      data_os: excelDate(pick(row, ['Data'])) || null,
      servico: String(pick(row, ['Serviço', 'Servico']) || '').trim() || null,
      cliente: String(pick(row, ['Cliente']) || '').trim() || null,
      embarque: String(embarque || '').trim() || null,
      destino: String(pick(row, ['Destino']) || '').trim() || null,
      supervisao: String(pick(row, ['Supervisão', 'Supervisao', 'Regional']) || '').trim() || null,
      contrato: String(pick(row, ['Contrato']) || '').trim() || null,
      produto: String(pick(row, ['Produto']) || '').trim() || null,
      lote: num(pick(row, ['Lote'])),
      embarcado: num(pick(row, ['Embarcado'])),
      remanescente: num(pick(row, ['Remanescente'])),
      status_gestor: 'AGUARDAR',
      status_conferencia: 'PENDENTE',
      raw: row,
      updated_at: new Date().toISOString(),
    };
  }
});
