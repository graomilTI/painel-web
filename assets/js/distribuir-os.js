import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const BR = new Intl.NumberFormat('pt-BR');
const STATUS_CONF = ['PENDENTE', 'DISTRIBUIDA', 'AJUSTAR', 'CONCLUIDA'];
const state = { user: null, rows: [], atrib: [], filters: { data: '', coordenacao: '', busca: '' } };

function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(); }
function num(value) { if (typeof value === 'number') return Number.isFinite(value) ? value : 0; const parsed = Number(String(value ?? '').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')); return Number.isFinite(parsed) ? parsed : 0; }
function fmt(value) { return BR.format(num(value)); }
function brDate(value) { if (!value) return '-'; const raw = String(value).slice(0,10); const [y,m,d] = raw.split('-'); return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value); }
function dateKey(value) { return String(value || '').slice(0, 10); }
function coordOf(row) { return row.coordenacao || row.coordenacao_os || row.regional || row.supervisao || '-'; }
function safe(data) { return Array.isArray(data) ? data : []; }
function excelDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
  if (typeof value === 'number') { const date = XLSX.SSF.parse_date_code(value); if (date) return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`; }
  const text = String(value).trim();
  const dm = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dm) return `${dm[3].length === 2 ? '20' + dm[3] : dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}
function pick(row, names) { const entries = Object.entries(row || {}); for (const n of names) { const key = normalize(n); const found = entries.find(([k]) => normalize(k) === key); if (found) return found[1]; } return null; }

function injectStyles() {
  if (document.getElementById('dist-os-styles')) return;
  const style = document.createElement('style');
  style.id = 'dist-os-styles';
  style.textContent = `
    .dist-grid{display:grid;grid-template-columns:180px 220px 1fr;gap:12px}.dist-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0f172a;color:#e5e7eb;color-scheme:dark;padding:9px}.dist-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.dist-table{width:100%;min-width:1050px;border-collapse:separate;border-spacing:0;color:#e5e7eb;table-layout:fixed}.dist-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.dist-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}.dist-table tr:hover td{background:rgba(22,101,52,.1)}.dist-title{font-weight:950;color:#f8fafc;font-size:14px;line-height:1.2}.dist-meta{font-size:12px;color:#94a3b8;margin-top:4px;line-height:1.25}.dist-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.dist-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.dist-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.dist-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.dist-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}.dist-zero{box-shadow:inset 4px 0 0 #facc15}.dist-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#94a3b8;background:rgba(15,23,42,.16)}.dist-os-list{display:flex;flex-direction:column;gap:7px}.dist-os-card{border:1px solid rgba(52,211,153,.13);border-radius:12px;padding:8px;background:rgba(2,6,23,.18)}.dist-upload{border:1px solid rgba(52,211,153,.18);background:rgba(22,101,52,.1);border-radius:18px;padding:16px;margin-top:14px}.dist-actions{display:grid;grid-template-columns:150px 1fr;gap:8px}.dist-col-data{width:11%}.dist-col-colab{width:23%}.dist-col-os{width:38%}.dist-col-coord{width:16%}.dist-col-ajuste{width:12%}
    @media(max-width:900px){.dist-grid{grid-template-columns:1fr}.dist-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Distribuir O.S', async (content) => {
  injectStyles();
  state.user = await getCurrentUser();
  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head"><div><h3>Distribuir O.S</h3><p class="muted">Fila da Conferência agrupada por data, colaborador e coordenação. Mostra todas as O.S. atribuídas ao mesmo colaborador.</p></div></div>
      <div class="filters-grid dist-grid">
        <div class="field"><label>Data</label><input id="distData" class="dist-input" type="date" /></div>
        <div class="field"><label>Coordenação</label><select id="distCoord" class="dist-input"></select></div>
        <div class="field"><label>Buscar</label><input id="distBusca" class="dist-input" type="text" placeholder="Colaborador, O.S., cliente, cidade..." /></div>
      </div>
      <div class="dist-upload">
        <div class="section-head" style="margin:0"><div><h3>Importar lista de O.S.</h3><p class="muted">Aceita a planilha padrão de O.S. operacional.</p></div><div><input id="distFile" type="file" accept=".xlsx,.xls,.csv" hidden /><button id="distPickFile" class="btn btn-primary" type="button">Selecionar arquivo</button></div></div>
      </div>
      <div class="feedback mt-16" id="distFeedback">Carregando...</div>
    </section>
    <section class="grid-cards mt-16" id="distStats"></section>
    <section class="card mt-16"><div class="section-head"><div><h3>Fila de distribuição</h3><p class="muted">Somente O.S. marcadas como Atender entram na distribuição.</p></div><button id="distReload" class="btn btn-secondary" type="button">Atualizar</button></div><div id="distList"></div></section>
  `;

  const el = { data: document.getElementById('distData'), coord: document.getElementById('distCoord'), busca: document.getElementById('distBusca'), feedback: document.getElementById('distFeedback'), stats: document.getElementById('distStats'), list: document.getElementById('distList'), reload: document.getElementById('distReload'), pick: document.getElementById('distPickFile'), file: document.getElementById('distFile') };
  bind();
  await loadAll();

  function bind() {
    el.data.addEventListener('change', () => { state.filters.data = el.data.value; render(); });
    el.coord.addEventListener('change', () => { state.filters.coordenacao = el.coord.value; render(); });
    el.busca.addEventListener('input', () => { state.filters.busca = el.busca.value.trim(); render(); });
    el.reload.addEventListener('click', loadAll);
    el.pick.addEventListener('click', () => el.file.click());
    el.file.addEventListener('change', importFile);
    el.list.addEventListener('change', onListChange);
  }

  async function loadAll() {
    el.feedback.textContent = 'Carregando distribuição...';
    const { data, error } = await supabase
      .from('operacional_os')
      .select('*')
      .eq('status_gestor', 'ATENDER')
      .limit(3000);
    if (error) { el.feedback.textContent = error.message || 'Falha ao consultar operacional_os.'; return; }
    state.rows = safe(data).sort((a, b) => String(b.data_os || '').localeCompare(String(a.data_os || '')) || num(b.numero_os) - num(a.numero_os));
    const ids = state.rows.map(r => r.id).filter(Boolean);
    if (ids.length) {
      const atr = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', ids);
      if (atr.error) { console.warn('Falha ao carregar colaboradores indicados.', atr.error); state.atrib = []; }
      else state.atrib = safe(atr.data);
    } else state.atrib = [];
    fillCoords(); render(); el.feedback.textContent = `Carregado: ${state.rows.length} O.S. para atender · ${state.atrib.length} indicação(ões).`;
  }

  function fillCoords() {
    const current = el.coord.value;
    const coords = [...new Set(state.rows.map(coordOf).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
    el.coord.innerHTML = '<option value="">Todas</option>' + coords.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (current) el.coord.value = current;
  }

  function atrib(osId) { return state.atrib.filter(a => String(a.os_id) === String(osId)); }
  function groupRows() {
    const map = new Map();
    const dataFiltro = state.filters.data;
    const coordFiltro = normalize(state.filters.coordenacao);
    const busca = normalize(state.filters.busca);
    for (const row of state.rows) {
      if (dataFiltro && dateKey(row.data_os) !== dataFiltro) continue;
      const coord = coordOf(row);
      if (coordFiltro && normalize(coord) !== coordFiltro) continue;
      const vinculados = atrib(row.id);
      for (const a of vinculados) {
        const nome = a.colaborador_nome || 'Sem nome';
        const key = `${dateKey(row.data_os)}|${normalize(nome)}|${normalize(coord)}`;
        if (!map.has(key)) map.set(key, { data: dateKey(row.data_os), colaborador: nome, colaborador_key: a.colaborador_key, coordenacao: coord, os: [] });
        map.get(key).os.push({ ...row, distancia_km: a.distancia_km, atribuicao_id: a.id });
      }
    }
    let groups = [...map.values()];
    if (busca) groups = groups.filter(g => normalize(`${g.data} ${g.colaborador} ${g.coordenacao} ${g.os.map(o => `${o.numero_os} ${o.cliente} ${o.embarque} ${o.destino}`).join(' ')}`).includes(busca));
    return groups.sort((a,b) => String(a.data).localeCompare(String(b.data)) || String(a.coordenacao).localeCompare(String(b.coordenacao), 'pt-BR') || String(a.colaborador).localeCompare(String(b.colaborador), 'pt-BR'));
  }
  function rowsWithoutColab() { return state.rows.filter(r => !atrib(r.id).length); }

  function renderStats(groups = groupRows()) {
    const semColab = rowsWithoutColab().length;
    const totalOs = groups.reduce((sum, g) => sum + g.os.length, 0);
    const colaboradores = new Set(groups.map(g => normalize(g.colaborador))).size;
    el.stats.innerHTML = `<article class="card"><h3>Grupos</h3><p class="metric">${groups.length}</p><p class="muted">Data + colaborador + coordenação.</p></article><article class="card"><h3>O.S.</h3><p class="metric">${totalOs}</p><p class="muted">Com colaborador indicado.</p></article><article class="card"><h3>Colaboradores</h3><p class="metric">${colaboradores}</p><p class="muted">No filtro atual.</p></article><article class="card"><h3>Sem colaborador</h3><p class="metric">${semColab}</p><p class="muted">Corrigir no Gestor → OS.</p></article>`;
  }

  function render() {
    const groups = groupRows(); renderStats(groups);
    if (!groups.length) { el.list.innerHTML = '<div class="dist-empty">Nenhuma distribuição encontrada para o filtro atual.</div>'; return; }
    el.list.innerHTML = `<div class="dist-table-wrap"><table class="dist-table"><colgroup><col class="dist-col-data"><col class="dist-col-colab"><col class="dist-col-os"><col class="dist-col-coord"><col class="dist-col-ajuste"></colgroup><thead><tr><th>Data</th><th>Nome do colaborador</th><th>O.S.</th><th>Coordenação</th><th>Ajuste</th></tr></thead><tbody>${groups.map(groupHtml).join('')}</tbody></table></div>`;
  }

  function groupHtml(group) {
    const statusBase = group.os[0]?.status_conferencia || 'PENDENTE';
    return `<tr data-group="${escapeHtml(`${group.data}|${group.colaborador_key}|${group.coordenacao}`)}" data-ids="${escapeHtml(group.os.map(o => o.id).join(','))}"><td><div class="dist-title">${brDate(group.data)}</div></td><td><div class="dist-title">${escapeHtml(group.colaborador)}</div><div class="dist-meta">${group.os.length} O.S. vinculada(s)</div></td><td><div class="dist-os-list">${group.os.map(osCard).join('')}</div></td><td><span class="dist-chip info">${escapeHtml(group.coordenacao)}</span></td><td><div class="dist-actions"><select class="dist-input" data-field="status_conferencia">${STATUS_CONF.map(s => `<option value="${s}" ${normalize(statusBase) === s ? 'selected' : ''}>${s}</option>`).join('')}</select><input class="dist-input" data-field="observacao_conferencia" placeholder="Observação" /></div></td></tr>`;
  }
  function osCard(row) {
    const zero = num(row.remanescente) === 0;
    return `<div class="dist-os-card ${zero ? 'dist-zero' : ''}"><div><span class="dist-chip ${zero ? 'warn' : 'ok'}">${escapeHtml(row.numero_os)}</span> <strong>${escapeHtml(row.cliente || '-')}</strong></div><div class="dist-meta">Emb.: ${escapeHtml(row.embarque || '-')}</div><div class="dist-meta">Dest.: ${escapeHtml(row.destino || '-')}</div><div class="dist-meta">Rem.: ${fmt(row.remanescente)} · Lote ${fmt(row.lote)} · Emb. ${fmt(row.embarcado)}${row.distancia_km ? ` · ${Number(row.distancia_km).toFixed(1).replace('.', ',')} km` : ''}</div></div>`;
  }

  async function onListChange(event) {
    const tr = event.target.closest('[data-ids]'); if (!tr) return;
    const ids = tr.dataset.ids.split(',').filter(Boolean);
    const status = tr.querySelector('[data-field="status_conferencia"]')?.value || 'PENDENTE';
    const obs = tr.querySelector('[data-field="observacao_conferencia"]')?.value || null;
    const payload = { status_conferencia: status, observacao_conferencia: obs, conferido_por: state.user?.id || null, conferido_em: new Date().toISOString(), updated_at: new Date().toISOString() };
    const previous = state.rows.filter(r => ids.includes(String(r.id))).map(r => ({ id: r.id, status_conferencia: r.status_conferencia, observacao_conferencia: r.observacao_conferencia }));
    state.rows.forEach(r => { if (ids.includes(String(r.id))) Object.assign(r, payload); });
    render();
    const { error } = await supabase.from('operacional_os').update(payload).in('id', ids);
    if (error) {
      previous.forEach(prev => { const row = state.rows.find(r => String(r.id) === String(prev.id)); if (row) Object.assign(row, prev); });
      render(); alert(error.message);
    }
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
    } catch (error) { console.error(error); el.feedback.textContent = error.message || 'Falha ao importar planilha.'; }
  }

  function mapImportRow(row) {
    const numero = pick(row, ['O.S.', 'OS', 'O.S', 'Ordem de Serviço']);
    const embarque = pick(row, ['Embarque', 'Ponto 1', 'Local Embarque']);
    return { numero_os: String(numero || '').trim(), situacao: String(pick(row, ['Situação', 'Situacao']) || '').trim() || null, financeiro: String(pick(row, ['Financeiro']) || '').trim() || null, data_os: excelDate(pick(row, ['Data'])) || null, servico: String(pick(row, ['Serviço', 'Servico']) || '').trim() || null, cliente: String(pick(row, ['Cliente']) || '').trim() || null, embarque: String(embarque || '').trim() || null, destino: String(pick(row, ['Destino']) || '').trim() || null, supervisao: String(pick(row, ['Supervisão', 'Supervisao', 'Regional']) || '').trim() || null, contrato: String(pick(row, ['Contrato']) || '').trim() || null, produto: String(pick(row, ['Produto']) || '').trim() || null, lote: num(pick(row, ['Lote'])), embarcado: num(pick(row, ['Embarcado'])), remanescente: num(pick(row, ['Remanescente'])), status_gestor: 'AGUARDAR', status_conferencia: 'PENDENTE', raw: row, updated_at: new Date().toISOString() };
  }
});
