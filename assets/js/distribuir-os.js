import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const state = { user: null, rows: [], ajustadas: [], atrib: [], colaboradores: [], filters: { data: '', coordenacao: '', busca: '' } };

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
function onlyActiveColab(c) { if (!c || c.ativo === false) return false; const sit = normalize(c.situacao || ''); return !['NAO ATIVO','INATIVO','DESLIGADO','DEMITIDO'].some(s => sit.includes(s)); }
function colabKey(c) { return String(c.colaborador_id || c.cpf || c.id || c.nome || '').replace(/\D/g,'') || String(c.id || c.nome || '').trim(); }
function buscarColabPorNome(query, excludeKeys = new Set()) {
  const q = normalize(query);
  return state.colaboradores.filter(c => {
    if (!onlyActiveColab(c)) return false;
    const key = colabKey(c);
    if (key && excludeKeys.has(String(key))) return false;
    if (q.length >= 2) return normalize(c.nome || c.nome_colaborador || '').includes(q);
    return true;
  }).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')).slice(0, 15);
}

function injectStyles() {
  if (document.getElementById('dist-os-styles')) return;
  const style = document.createElement('style');
  style.id = 'dist-os-styles';
  style.textContent = `
    .dist-grid{display:grid;grid-template-columns:180px 220px 1fr;gap:12px}.dist-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;color-scheme:dark;padding:9px}.dist-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.dist-table{width:100%;min-width:1050px;border-collapse:separate;border-spacing:0;color:#e2e2f0;table-layout:fixed}.dist-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.dist-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}.dist-table tr:hover td{background:rgba(22,101,52,.1)}.dist-title{font-weight:950;color:#f8fafc;font-size:14px;line-height:1.2}.dist-meta{font-size:12px;color:#6b7280;margin-top:4px;line-height:1.25}.dist-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.dist-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.dist-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.dist-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.dist-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}.dist-zero{box-shadow:inset 4px 0 0 #facc15}.dist-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#6b7280;background:rgba(15,23,42,.16)}.dist-os-list{display:flex;flex-direction:column;gap:7px}.dist-os-card{border:1px solid rgba(52,211,153,.13);border-radius:12px;padding:8px;background:rgba(2,6,23,.18)}.dist-upload{border:1px solid rgba(52,211,153,.18);background:rgba(22,101,52,.1);border-radius:18px;padding:16px;margin-top:14px}.dist-actions{display:grid;grid-template-columns:150px 1fr;gap:8px}.dist-col-data{width:11%}.dist-col-colab{width:23%}.dist-col-os{width:38%}.dist-col-coord{width:16%}.dist-col-ajuste{width:12%}
    .dist-ac{position:relative;width:100%}.dist-ac-list{position:absolute;top:calc(100% + 4px);left:0;right:0;min-width:180px;background:#0d0d18;border:1px solid rgba(52,211,153,.28);border-radius:12px;overflow:hidden;z-index:200;max-height:200px;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.55)}
    .dist-ac-item{padding:8px 12px;cursor:pointer;font-size:12px;color:#e2e2f0;border-bottom:1px solid rgba(52,211,153,.08)}.dist-ac-item:last-child{border-bottom:0}.dist-ac-item:hover{background:rgba(52,211,153,.13);color:#f8fafc}
    .dist-ac-empty{padding:10px 12px;font-size:12px;color:#6b7280;text-align:center}.dist-ac-input{cursor:text!important;background:transparent!important;border:none!important;outline:none!important;color:#f8fafc!important;font-weight:950!important;font-size:14px!important;width:100%;padding:0!important;line-height:1.2}
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
    el.list.addEventListener('click', onListClick);
    el.list.addEventListener('input', onAcInput);
    el.list.addEventListener('focusin', onAcFocusin);
    el.list.addEventListener('focusout', onAcFocusout);
  }

  async function loadAll() {
    el.feedback.textContent = 'Carregando distribuição...';
    const [osResult] = await Promise.all([
      supabase.from('operacional_os').select('*').eq('status_gestor', 'ATENDER').limit(3000),
      loadColaboradores(),
    ]);
    if (osResult.error) { el.feedback.textContent = osResult.error.message || 'Falha ao consultar operacional_os.'; return; }
    const all = safe(osResult.data).sort((a, b) => String(b.configurada_em || b.data_os || '').localeCompare(String(a.configurada_em || a.data_os || '')) || num(b.numero_os) - num(a.numero_os));
    state.rows = all.filter(r => r.status_conferencia !== 'AJUSTADA');
    state.ajustadas = all.filter(r => r.status_conferencia === 'AJUSTADA');
    const ids = state.rows.map(r => r.id).filter(Boolean);
    if (ids.length) {
      const CHUNK = 200;
      let allAtr = [];
      let atrError = null;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', ids.slice(i, i + CHUNK));
        if (error) { atrError = error; allAtr = []; break; }
        allAtr = allAtr.concat(safe(data));
      }
      if (atrError) { console.warn('Falha ao carregar colaboradores indicados.', atrError); state.atrib = []; }
      else state.atrib = allAtr;
    } else state.atrib = [];
    fillCoords(); render(); el.feedback.textContent = `Carregado: ${state.rows.length} pendente(s) · ${state.ajustadas.length} ajustada(s) · ${state.atrib.length} indicação(ões).`;
  }

  async function loadColaboradores() {
    try {
      const { data, error } = await supabase.from('operacional_colaborador_base').select('*').eq('ativo', true).limit(5000);
      if (!error) { state.colaboradores = (data || []).filter(onlyActiveColab); return; }
    } catch {}
    try {
      const latest = await supabase.from('colaborador_snapshot').select('data_referencia').order('data_referencia', { ascending: false }).limit(1);
      const dt = latest.data?.[0]?.data_referencia;
      let q = supabase.from('colaborador_snapshot').select('*').limit(5000);
      if (dt) q = q.eq('data_referencia', dt);
      const { data } = await q;
      state.colaboradores = (data || []).filter(onlyActiveColab);
    } catch { state.colaboradores = []; }
  }

  function fillCoords() {
    const current = el.coord.value;
    const coords = [...new Set(state.rows.map(coordOf).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
    el.coord.innerHTML = '<option value="">Todas</option>' + coords.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (current) el.coord.value = current;
  }

  function atrib(osId) { return state.atrib.filter(a => String(a.os_id) === String(osId)); }
  function groupRows(rows = state.rows) {
    const map = new Map();
    const dataFiltro = state.filters.data;
    const coordFiltro = normalize(state.filters.coordenacao);
    const busca = normalize(state.filters.busca);
    for (const row of rows) {
      const confirmedDate = dateKey(row.configurada_em || row.data_os);
      if (dataFiltro && confirmedDate !== dataFiltro) continue;
      const coord = coordOf(row);
      if (coordFiltro && normalize(coord) !== coordFiltro) continue;
      const vinculados = atrib(row.id);
      for (const a of vinculados) {
        const nome = a.colaborador_nome || 'Sem nome';
        const key = `${confirmedDate}|${normalize(nome)}|${normalize(coord)}`;
        if (!map.has(key)) map.set(key, { data: confirmedDate, colaborador: nome, colaborador_key: a.colaborador_key, coordenacao: coord, os: [] });
        map.get(key).os.push({ ...row, distancia_km: a.distancia_km, atribuicao_id: a.id });
      }
    }
    let groups = [...map.values()];
    if (busca) groups = groups.filter(g => normalize(`${g.data} ${g.colaborador} ${g.coordenacao} ${g.os.map(o => o.numero_os).join(' ')}`).includes(busca));
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
    if (!groups.length) { el.list.innerHTML = '<div class="dist-empty">Nenhuma distribuição pendente.</div>'; }
    else el.list.innerHTML = `<div class="dist-table-wrap"><table class="dist-table"><colgroup><col class="dist-col-data"><col class="dist-col-colab"><col class="dist-col-os"><col class="dist-col-coord"><col class="dist-col-ajuste"></colgroup><thead><tr><th>Data</th><th>Nome do colaborador</th><th>O.S.</th><th>Coordenação</th><th>Ajuste</th></tr></thead><tbody>${groups.map(groupHtml).join('')}</tbody></table></div>`;
    renderAjustadas();
  }

  function renderAjustadas() {
    let el2 = document.getElementById('distAjustadasSection');
    if (!el2) {
      el2 = document.createElement('section');
      el2.id = 'distAjustadasSection';
      el2.className = 'card mt-16';
      el.list.parentElement.after(el2);
    }
    const groups = groupRows(state.ajustadas);
    el2.innerHTML = `<div class="section-head"><div><h3>Ajustadas</h3><p class="muted">${state.ajustadas.length} O.S. concluídas nesta sessão.</p></div></div>` +
      (!groups.length
        ? '<div class="dist-empty">Nenhuma O.S. ajustada ainda.</div>'
        : `<div class="dist-table-wrap"><table class="dist-table"><colgroup><col class="dist-col-data"><col class="dist-col-colab"><col class="dist-col-os"><col class="dist-col-coord"><col style="width:10%"></colgroup><thead><tr><th>Data</th><th>Colaborador</th><th>O.S.</th><th>Coordenação</th><th>Status</th></tr></thead><tbody>${groups.map(g => `<tr><td><div class="dist-title">${brDate(g.data)}</div></td><td><div class="dist-title">${escapeHtml(g.colaborador)}</div></td><td><div class="dist-title">${g.os.map(o => escapeHtml(o.numero_os)).join(' - ')}</div></td><td><span class="dist-chip info">${escapeHtml(g.coordenacao)}</span></td><td><span class="dist-chip ok">Ajustada</span></td></tr>`).join('')}</tbody></table></div>`);
  }

  function groupHtml(group) {
    const ids = group.os.map(o => o.id).join(',');
    const numeros = group.os.map(o => escapeHtml(o.numero_os)).join(' - ');
    const groupKey = `${group.data}|${group.colaborador_key}|${group.coordenacao}`;
    return `<tr data-group="${escapeHtml(groupKey)}" data-ids="${escapeHtml(ids)}">
      <td><div class="dist-title">${brDate(group.data)}</div></td>
      <td>
        <div class="dist-ac" data-colabac data-group-key="${escapeHtml(groupKey)}" data-current-key="${escapeHtml(group.colaborador_key || '')}">
          <input type="text" class="dist-ac-input" value="${escapeHtml(group.colaborador)}" placeholder="Digitar colaborador..." autocomplete="off" spellcheck="false" data-ac-key="${escapeHtml(group.colaborador_key || '')}" />
          <div class="dist-ac-list" hidden></div>
        </div>
        <div class="dist-meta">${group.os.length} O.S. vinculada(s)</div>
      </td>
      <td><div class="dist-title" style="letter-spacing:.03em">${numeros}</div></td>
      <td><span class="dist-chip info">${escapeHtml(group.coordenacao)}</span></td>
      <td><button class="btn btn-primary dist-btn-ajustada" data-ajustar-ids="${escapeHtml(ids)}" type="button">Ajustada</button></td>
    </tr>`;
  }

  async function onListClick(event) {
    const acItem = event.target.closest('.dist-ac-item');
    if (acItem) {
      const ac = acItem.closest('[data-colabac]');
      if (!ac) return;
      ac.querySelector('.dist-ac-list').hidden = true;
      await salvarColaboradorNoGrupo(ac.dataset.groupKey, ac.dataset.currentKey, acItem.dataset.key, acItem.dataset.nome);
      return;
    }

    const btn = event.target.closest('[data-ajustar-ids]');
    if (!btn) return;
    const ids = btn.dataset.ajustarIds.split(',').filter(Boolean);
    btn.disabled = true;
    btn.textContent = '...';
    const now = new Date().toISOString();
    const moved = state.rows.filter(r => ids.includes(String(r.id)));
    moved.forEach(r => { r.status_conferencia = 'AJUSTADA'; });
    state.rows = state.rows.filter(r => !ids.includes(String(r.id)));
    state.ajustadas.push(...moved);
    render();
    supabase.from('operacional_os').update({ status_conferencia: 'AJUSTADA', conferido_por: state.user?.id || null, conferido_em: now, updated_at: now }).in('id', ids);
  }

  async function salvarColaboradorNoGrupo(groupKey, oldKey, newKey, newNome) {
    if (!newKey || String(oldKey) === String(newKey)) return;
    const groups = groupRows();
    const group = groups.find(g => `${g.data}|${g.colaborador_key}|${g.coordenacao}` === groupKey);
    if (!group) return;
    const atribuicaoIds = group.os.map(o => String(o.atribuicao_id)).filter(Boolean);
    if (atribuicaoIds.length) {
      const { error } = await supabase.from('operacional_os_colaboradores').delete().in('id', atribuicaoIds);
      if (error) { alert(error.message); return; }
    }
    const novas = group.os.map(o => ({
      os_id: o.id,
      colaborador_key: newKey,
      colaborador_nome: newNome,
      distancia_km: null,
      origem_sugestao: 'MANUAL_DISTRIBUICAO',
      indicado_por: state.user?.id || null,
    }));
    const { error: insErr } = await supabase.from('operacional_os_colaboradores').insert(novas);
    if (insErr) { alert(insErr.message); return; }
    await loadAll();
  }

  function renderAcList(dropdown, query) {
    const results = buscarColabPorNome(query);
    if (!results.length) {
      dropdown.innerHTML = `<div class="dist-ac-empty">${query.length >= 2 ? 'Nenhum colaborador encontrado' : 'Digite para buscar ou clique para ver lista'}</div>`;
    } else {
      dropdown.innerHTML = results.map(c => {
        const key = colabKey(c);
        return `<div class="dist-ac-item" data-key="${escapeHtml(String(key))}" data-nome="${escapeHtml(c.nome || c.nome_colaborador || '')}">${escapeHtml(c.nome || c.nome_colaborador || '')}</div>`;
      }).join('');
    }
    dropdown.hidden = false;
  }

  function onAcInput(event) {
    const input = event.target;
    if (!input.matches('.dist-ac-input')) return;
    const ac = input.closest('[data-colabac]');
    if (!ac) return;
    renderAcList(ac.querySelector('.dist-ac-list'), input.value.trim());
  }

  function onAcFocusin(event) {
    const input = event.target;
    if (!input.matches('.dist-ac-input')) return;
    const ac = input.closest('[data-colabac]');
    if (!ac) return;
    renderAcList(ac.querySelector('.dist-ac-list'), input.value.trim());
  }

  function onAcFocusout(event) {
    const input = event.target;
    if (!input.matches('.dist-ac-input')) return;
    const ac = input.closest('[data-colabac]');
    if (!ac) return;
    setTimeout(() => { const d = ac.querySelector('.dist-ac-list'); if (d) d.hidden = true; }, 180);
  }

  async function limparDistribuicaoAnterior() {
    // Deleta TODAS as OS — o CASCADE da FK apaga operacional_os_colaboradores automaticamente.
    const { error } = await supabase
      .from('operacional_os')
      .delete()
      .gte('created_at', '2000-01-01');
    if (error) throw new Error(`Falha ao limpar lista anterior: ${error.message}`);

    state.rows = [];
    state.ajustadas = [];
    state.atrib = [];
  }

  async function importFile() {
    const file = el.file.files?.[0]; if (!file) return;
    el.feedback.textContent = 'Lendo planilha...';
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const rawRows = json.map(mapImportRow).filter(r => r.numero_os);
      if (!rawRows.length) throw new Error('Nenhuma O.S. encontrada na planilha.');
      // Deduplica por numero_os (UNIQUE constraint) — mesma OS pode aparecer para vários colaboradores
      const dedup = new Map();
      for (const r of rawRows) dedup.set(r.numero_os, r);
      const rows = [...dedup.values()];
      el.feedback.textContent = 'Limpando Distribuição de O.S. anterior...';
      await limparDistribuicaoAnterior();
      el.feedback.textContent = 'Gravando nova Distribuição de O.S...';
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase.from('operacional_os').insert(batch);
        if (error) throw error;
      }
      el.feedback.textContent = `Importação concluída: ${rows.length} O.S. importadas (lista anterior substituída).`;
      el.file.value = '';
      await loadAll();
    } catch (error) { console.error(error); el.feedback.textContent = error.message || 'Falha ao importar planilha.'; }
  }

  function mapImportRow(row) {
    const numero = pick(row, ['O.S.', 'OS', 'O.S', 'Ordem de Serviço']);
    const embarque = pick(row, ['Embarque', 'Ponto 1', 'Local Embarque']);
    return { numero_os: String(numero || '').trim(), situacao: String(pick(row, ['Situação', 'Situacao']) || '').trim() || null, financeiro: String(pick(row, ['Financeiro']) || '').trim() || null, data_os: excelDate(pick(row, ['Data'])) || null, servico: String(pick(row, ['Serviço', 'Servico']) || '').trim() || null, cliente: String(pick(row, ['Cliente']) || '').trim() || null, embarque: String(embarque || '').trim() || null, destino: String(pick(row, ['Destino']) || '').trim() || null, supervisao: String(pick(row, ['Supervisão', 'Supervisao', 'Regional']) || '').trim() || null, contrato: String(pick(row, ['Contrato']) || '').trim() || null, produto: String(pick(row, ['Produto']) || '').trim() || null, lote: num(pick(row, ['Lote'])), embarcado: num(pick(row, ['Embarcado'])), remanescente: num(pick(row, ['Remanescente'])), status_gestor: null, status_conferencia: 'PENDENTE', raw: row, updated_at: new Date().toISOString() };
  }
});
