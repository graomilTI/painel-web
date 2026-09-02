import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { sincronizarListaOsDoAgente } from './listaOsAgentSync.js';

const BR = new Intl.NumberFormat('pt-BR');
const state = { user: null, rows: [], ajustadas: [], atrib: [], filters: { data: '', coordenacao: '', busca: '' } };

function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(); }
function num(value) { if (typeof value === 'number') return Number.isFinite(value) ? value : 0; const parsed = Number(String(value ?? '').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')); return Number.isFinite(parsed) ? parsed : 0; }
function brDate(value) { if (!value) return '-'; const raw = String(value).slice(0,10); const [y,m,d] = raw.split('-'); return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value); }
function dateKey(value) { return String(value || '').slice(0, 10); }
function coordOf(row) { return row.coordenacao || row.coordenacao_os || row.regional || row.supervisao || '-'; }
function safe(data) { return Array.isArray(data) ? data : []; }

function injectStyles() {
  if (document.getElementById('dist-os-styles')) return;
  const style = document.createElement('style');
  style.id = 'dist-os-styles';
  style.textContent = `
    .dist-grid{display:grid;grid-template-columns:180px 220px 1fr;gap:12px}.dist-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;color-scheme:dark;padding:9px}.dist-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.dist-table{width:100%;min-width:900px;border-collapse:separate;border-spacing:0;color:#e2e2f0;table-layout:fixed}.dist-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.dist-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}.dist-table tr:hover td{background:rgba(22,101,52,.1)}.dist-title{font-weight:950;color:#f8fafc;font-size:14px;line-height:1.2}.dist-meta{font-size:12px;color:#6b7280;margin-top:4px;line-height:1.25}.dist-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.dist-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.dist-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.dist-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.dist-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}.dist-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#6b7280;background:rgba(15,23,42,.16)}.dist-col-data{width:14%}.dist-col-colab{width:30%}.dist-col-os{width:38%}.dist-col-coord{width:18%}
    #distList{transition:opacity .15s ease}#distList.is-loading{opacity:.35;pointer-events:none}
    @media(max-width:900px){.dist-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

export async function renderContent(content) {
  injectStyles();
  state.user = await getCurrentUser();
  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head"><div><h3>Distribuir O.S</h3><p class="muted">Somente leitura — reflete a distribuição decidida na Programação. Pra mudar quem atende, use a tela Programação.</p></div></div>
      <div class="filters-grid dist-grid">
        <div class="field"><label>Data</label><input id="distData" class="dist-input" type="date" /></div>
        <div class="field"><label>Coordenação</label><select id="distCoord" class="dist-input"></select></div>
        <div class="field"><label>Buscar</label><input id="distBusca" class="dist-input" type="text" placeholder="Colaborador, O.S., cliente, cidade..." /></div>
      </div>
      <div class="feedback mt-16" id="distFeedback">Carregando...</div>
    </section>
    <section class="grid-cards mt-16" id="distStats"></section>
    <section class="card mt-16"><div class="section-head"><div><h3>Fila de distribuição</h3><p class="muted">Somente O.S. marcadas como Atender entram na distribuição.</p></div><button id="distReload" class="btn btn-secondary" type="button">↻ Atualizar</button></div><div id="distList"></div></section>
  `;

  const el = { data: document.getElementById('distData'), coord: document.getElementById('distCoord'), busca: document.getElementById('distBusca'), feedback: document.getElementById('distFeedback'), stats: document.getElementById('distStats'), list: document.getElementById('distList'), reload: document.getElementById('distReload') };
  bind();
  await sincronizarListaOsDoAgente();
  await loadAll();

  function bind() {
    el.data.addEventListener('change', () => { state.filters.data = el.data.value; render(); });
    el.coord.addEventListener('change', () => { state.filters.coordenacao = el.coord.value; render(); });
    el.busca.addEventListener('input', () => { state.filters.busca = el.busca.value.trim(); render(); });
    el.reload.addEventListener('click', loadAll);
  }

  async function loadAll() {
    el.feedback.textContent = 'Carregando distribuição...';
    el.list.classList.add('is-loading');
    try {
      const osResult = await supabase.from('operacional_os').select('*').eq('status_gestor', 'ATENDER').limit(3000);
      if (osResult.error) { el.feedback.textContent = osResult.error.message || 'Falha ao consultar operacional_os.'; return; }
      const all = safe(osResult.data).sort((a, b) => String(b.data_os || b.configurada_em || '').localeCompare(String(a.data_os || a.configurada_em || '')) || num(b.numero_os) - num(a.numero_os));
      state.rows = all.filter(r => r.status_conferencia !== 'AJUSTADA');
      state.ajustadas = all.filter(r => r.status_conferencia === 'AJUSTADA');
      const ids = state.rows.map(r => r.id).filter(Boolean);
      if (ids.length) {
        const CHUNK = 200;
        const chunks = [];
        for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(chunk => supabase.from('operacional_os_colaboradores').select('*').in('os_id', chunk)));
        const atrError = results.find(r => r.error)?.error;
        if (atrError) { console.warn('Falha ao carregar colaboradores indicados.', atrError); state.atrib = []; }
        else state.atrib = results.flatMap(r => safe(r.data));
      } else state.atrib = [];
      fillCoords(); render(); el.feedback.textContent = `Carregado: ${state.rows.length} pendente(s) · ${state.ajustadas.length} ajustada(s) · ${state.atrib.length} indicação(ões) da Programação.`;
    } finally {
      el.list.classList.remove('is-loading');
    }
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
      // data_os é a data de atendimento; configurada_em fica travado em O.S.
      // remanescentes reaproveitadas em vários dias — usar data_os primeiro
      // mantém essa tela e o agente aplicar-distribuicao-os agrupando pela
      // mesma data (achado em produção 01/09, O.S. 90497).
      const confirmedDate = dateKey(row.data_os || row.configurada_em);
      if (dataFiltro && confirmedDate !== dataFiltro) continue;
      const coord = coordOf(row);
      if (coordFiltro && normalize(coord) !== coordFiltro) continue;
      const vinculados = atrib(row.id);
      for (const a of vinculados) {
        const nome = a.colaborador_nome || 'Sem nome';
        const key = `${confirmedDate}|${normalize(nome)}|${normalize(coord)}`;
        if (!map.has(key)) map.set(key, { data: confirmedDate, colaborador: nome, coordenacao: coord, os: [] });
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
    el.stats.innerHTML = `<article class="card"><h3>Grupos</h3><p class="metric">${groups.length}</p><p class="muted">Data + colaborador + coordenação.</p></article><article class="card"><h3>O.S.</h3><p class="metric">${totalOs}</p><p class="muted">Com colaborador programado.</p></article><article class="card"><h3>Colaboradores</h3><p class="metric">${colaboradores}</p><p class="muted">No filtro atual.</p></article><article class="card"><h3>Sem colaborador</h3><p class="metric">${semColab}</p><p class="muted">Programar na tela Programação.</p></article>`;
  }

  function render() {
    const groups = groupRows(); renderStats(groups);
    if (!groups.length) { el.list.innerHTML = '<div class="dist-empty">Nenhuma distribuição pendente.</div>'; }
    else el.list.innerHTML = `<div class="dist-table-wrap"><table class="dist-table"><colgroup><col class="dist-col-data"><col class="dist-col-colab"><col class="dist-col-os"><col class="dist-col-coord"></colgroup><thead><tr><th>Data</th><th>Colaborador</th><th>O.S.</th><th>Coordenação</th></tr></thead><tbody>${groups.map(groupHtml).join('')}</tbody></table></div>`;
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
    el2.innerHTML = `<div class="section-head"><div><h3>Ajustadas</h3><p class="muted">${state.ajustadas.length} O.S. já aplicadas no Graint.</p></div></div>` +
      (!groups.length
        ? '<div class="dist-empty">Nenhuma O.S. ajustada ainda.</div>'
        : `<div class="dist-table-wrap"><table class="dist-table"><colgroup><col class="dist-col-data"><col class="dist-col-colab"><col class="dist-col-os"><col class="dist-col-coord"><col style="width:10%"></colgroup><thead><tr><th>Data</th><th>Colaborador</th><th>O.S.</th><th>Coordenação</th><th>Status</th></tr></thead><tbody>${groups.map(g => `<tr><td><div class="dist-title">${brDate(g.data)}</div></td><td><div class="dist-title">${escapeHtml(g.colaborador)}</div></td><td><div class="dist-title">${g.os.map(o => escapeHtml(o.numero_os)).join(' - ')}</div></td><td><span class="dist-chip info">${escapeHtml(g.coordenacao)}</span></td><td><span class="dist-chip ok">Ajustada</span></td></tr>`).join('')}</tbody></table></div>`);
  }

  function groupHtml(group) {
    const numeros = group.os.map(o => escapeHtml(o.numero_os)).join(' - ');
    return `<tr>
      <td><div class="dist-title">${brDate(group.data)}</div></td>
      <td>
        <div class="dist-title">${escapeHtml(group.colaborador)}</div>
        <div class="dist-meta">${group.os.length} O.S. vinculada(s)</div>
      </td>
      <td><div class="dist-title" style="letter-spacing:.03em">${numeros}</div></td>
      <td><span class="dist-chip info">${escapeHtml(group.coordenacao)}</span></td>
    </tr>`;
  }
}

initProtectedPage('Distribuir O.S', renderContent);
