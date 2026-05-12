import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const BR = new Intl.NumberFormat('pt-BR');
const STATUS_LOGISTICA = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADA: 'Finalizada',
  DEVOLVIDA: 'Devolvida ao gestor',
};

const state = {
  user: null,
  rows: [],
  atribuicoes: [],
  filters: { data: '', coordenacao: '', status: '', busca: '' },
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
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value) { return BR.format(num(value)); }
function safe(data) { return Array.isArray(data) ? data : []; }
function dateKey(value) { return String(value || '').slice(0, 10); }
function coordOf(row) { return row.coordenacao || row.coordenacao_os || row.supervisao || row.regional || '-'; }
function statusOf(row) { return normalize(row.status_logistica || 'PENDENTE') || 'PENDENTE'; }
function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value);
}

function injectStyles() {
  if (document.getElementById('adm-logistica-styles')) return;
  const style = document.createElement('style');
  style.id = 'adm-logistica-styles';
  style.textContent = `
    .log-grid{display:grid;grid-template-columns:170px 210px 210px 1fr;gap:12px}.log-input{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0f172a;color:#e5e7eb;color-scheme:dark;padding:9px}.log-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}.log-table{width:100%;min-width:1120px;border-collapse:separate;border-spacing:0;color:#e5e7eb;table-layout:fixed}.log-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.log-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}.log-table tr:hover td{background:rgba(22,101,52,.1)}.log-title{font-weight:950;color:#f8fafc;font-size:14px;line-height:1.2}.log-meta{font-size:12px;color:#94a3b8;margin-top:4px;line-height:1.3}.log-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.log-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.log-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.log-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.log-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}.log-chip.neutral{background:rgba(148,163,184,.12);color:#e2e8f0}.log-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#94a3b8;background:rgba(15,23,42,.16)}.log-actions{display:flex;flex-direction:column;gap:8px}.log-actions .btn{width:100%;justify-content:center}.log-textarea{min-height:74px;resize:vertical}.log-col-os{width:15%}.log-col-rota{width:27%}.log-col-colab{width:18%}.log-col-status{width:14%}.log-col-obs{width:16%}.log-col-actions{width:10%}
    @media(max-width:1000px){.log-grid{grid-template-columns:1fr}.log-table{min-width:980px}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Painel de Logística', async (content) => {
  injectStyles();
  state.user = await getCurrentUser();

  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Painel de Logística</h3>
          <p class="muted">Fila de O.S. que o Gestor marcou como <strong>Finalizar</strong>. A logística pode assumir, finalizar ou devolver para ajuste.</p>
        </div>
        <button id="logReload" class="btn btn-secondary" type="button">Atualizar</button>
      </div>
      <div class="filters-grid log-grid">
        <div class="field"><label>Data</label><input id="logData" class="log-input" type="date" /></div>
        <div class="field"><label>Coordenação</label><select id="logCoord" class="log-input"></select></div>
        <div class="field"><label>Status logística</label><select id="logStatus" class="log-input"><option value="">Todos</option>${Object.entries(STATUS_LOGISTICA).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Buscar</label><input id="logBusca" class="log-input" type="text" placeholder="O.S., cliente, colaborador, cidade..." /></div>
      </div>
      <div class="feedback mt-16" id="logFeedback">Carregando...</div>
    </section>
    <section class="grid-cards mt-16" id="logStats"></section>
    <section class="card mt-16">
      <div class="section-head"><div><h3>Fila de finalização</h3><p class="muted">Somente O.S. com status gestor <strong>FINALIZAR</strong> aparecem aqui.</p></div></div>
      <div id="logList"></div>
    </section>
  `;

  const el = {
    data: document.getElementById('logData'),
    coord: document.getElementById('logCoord'),
    status: document.getElementById('logStatus'),
    busca: document.getElementById('logBusca'),
    feedback: document.getElementById('logFeedback'),
    stats: document.getElementById('logStats'),
    list: document.getElementById('logList'),
    reload: document.getElementById('logReload'),
  };

  el.data.addEventListener('change', () => { state.filters.data = el.data.value; render(); });
  el.coord.addEventListener('change', () => { state.filters.coordenacao = el.coord.value; render(); });
  el.status.addEventListener('change', () => { state.filters.status = el.status.value; render(); });
  el.busca.addEventListener('input', () => { state.filters.busca = el.busca.value; render(); });
  el.reload.addEventListener('click', loadAll);
  el.list.addEventListener('click', onActionClick);
  el.list.addEventListener('change', onObsChange);

  await loadAll();

  async function loadAll() {
    el.feedback.textContent = 'Carregando fila da logística...';
    const { data, error } = await supabase
      .from('operacional_os')
      .select('*')
      .eq('status_gestor', 'FINALIZAR')
      .limit(3000);

    if (error) {
      console.error(error);
      el.feedback.textContent = error.message || 'Falha ao carregar O.S. da logística.';
      return;
    }

    state.rows = safe(data).sort((a, b) => String(dateKey(b.data_os)).localeCompare(String(dateKey(a.data_os))) || String(a.numero_os || '').localeCompare(String(b.numero_os || ''), 'pt-BR'));

    const ids = state.rows.map((row) => row.id).filter(Boolean);
    if (ids.length) {
      const atr = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', ids);
      state.atribuicoes = atr.error ? [] : safe(atr.data);
      if (atr.error) console.warn('Falha ao carregar colaboradores da logística.', atr.error);
    } else {
      state.atribuicoes = [];
    }

    fillCoords();
    render();
    el.feedback.textContent = `Carregado: ${state.rows.length} O.S. encaminhada(s) para logística.`;
  }

  function fillCoords() {
    const current = el.coord.value;
    const coords = [...new Set(state.rows.map(coordOf).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    el.coord.innerHTML = '<option value="">Todas</option>' + coords.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (current) el.coord.value = current;
  }

  function atribuicoes(osId) {
    return state.atribuicoes.filter((a) => String(a.os_id) === String(osId));
  }

  function filteredRows() {
    const dataFiltro = state.filters.data;
    const coordFiltro = normalize(state.filters.coordenacao);
    const statusFiltro = normalize(state.filters.status);
    const busca = normalize(state.filters.busca);

    return state.rows.filter((row) => {
      if (dataFiltro && dateKey(row.data_os) !== dataFiltro) return false;
      if (coordFiltro && normalize(coordOf(row)) !== coordFiltro) return false;
      if (statusFiltro && statusOf(row) !== statusFiltro) return false;
      if (busca) {
        const colabs = atribuicoes(row.id).map((a) => a.colaborador_nome).join(' ');
        const blob = `${row.numero_os} ${row.cliente} ${row.embarque} ${row.destino} ${coordOf(row)} ${colabs} ${row.observacao_logistica || ''}`;
        if (!normalize(blob).includes(busca)) return false;
      }
      return true;
    });
  }

  function renderStats(rows = filteredRows()) {
    const pendentes = rows.filter((r) => statusOf(r) === 'PENDENTE').length;
    const andamento = rows.filter((r) => statusOf(r) === 'EM_ANDAMENTO').length;
    const finalizadas = rows.filter((r) => statusOf(r) === 'FINALIZADA').length;
    const devolvidas = rows.filter((r) => statusOf(r) === 'DEVOLVIDA').length;
    el.stats.innerHTML = `
      <article class="card"><h3>Pendentes</h3><p class="metric">${pendentes}</p><p class="muted">Aguardando ação da logística.</p></article>
      <article class="card"><h3>Em andamento</h3><p class="metric">${andamento}</p><p class="muted">Assumidas pela equipe.</p></article>
      <article class="card"><h3>Finalizadas</h3><p class="metric">${finalizadas}</p><p class="muted">Concluídas pela logística.</p></article>
      <article class="card"><h3>Devolvidas</h3><p class="metric">${devolvidas}</p><p class="muted">Retornaram para ajuste.</p></article>`;
  }

  function render() {
    const rows = filteredRows();
    renderStats(rows);
    if (!rows.length) {
      el.list.innerHTML = '<div class="log-empty">Nenhuma O.S. encontrada para o filtro atual.</div>';
      return;
    }
    el.list.innerHTML = `
      <div class="log-table-wrap">
        <table class="log-table">
          <colgroup><col class="log-col-os"><col class="log-col-rota"><col class="log-col-colab"><col class="log-col-status"><col class="log-col-obs"><col class="log-col-actions"></colgroup>
          <thead><tr><th>O.S.</th><th>Rota / Cliente</th><th>Colaborador</th><th>Status</th><th>Observação</th><th>Ações</th></tr></thead>
          <tbody>${rows.map(rowHtml).join('')}</tbody>
        </table>
      </div>`;
  }

  function rowHtml(row) {
    const st = statusOf(row);
    const colabs = atribuicoes(row.id);
    return `
      <tr data-os-id="${escapeHtml(row.id)}">
        <td><div class="log-title">${escapeHtml(row.numero_os || '-')}</div><div class="log-meta">${brDate(row.data_os)}</div><div class="log-meta">Rem.: ${fmt(row.remanescente)}</div></td>
        <td><div class="log-title">${escapeHtml(row.cliente || '-')}</div><div class="log-meta">Emb.: ${escapeHtml(row.embarque || '-')}</div><div class="log-meta">Dest.: ${escapeHtml(row.destino || '-')}</div><div class="log-meta">Coord.: ${escapeHtml(coordOf(row))}</div></td>
        <td>${colabs.length ? colabs.map((a) => `<div class="log-chip info" style="margin:0 6px 6px 0">${escapeHtml(a.colaborador_nome || 'Sem nome')}</div>`).join('') : '<span class="log-chip warn">Sem colaborador</span>'}</td>
        <td>${statusChip(st)}<div class="log-meta">Gestor: ${escapeHtml(row.status_gestor || '-')}</div>${row.enviado_logistica_em ? `<div class="log-meta">Enviado: ${brDate(row.enviado_logistica_em)}</div>` : ''}</td>
        <td><textarea class="log-input log-textarea" data-obs placeholder="Observação da logística">${escapeHtml(row.observacao_logistica || '')}</textarea></td>
        <td><div class="log-actions">${actionsHtml(st)}</div></td>
      </tr>`;
  }

  function statusChip(status) {
    const map = { PENDENTE: 'warn', EM_ANDAMENTO: 'info', FINALIZADA: 'ok', DEVOLVIDA: 'danger' };
    return `<span class="log-chip ${map[status] || 'neutral'}">${escapeHtml(STATUS_LOGISTICA[status] || status || '-')}</span>`;
  }

  function actionsHtml(status) {
    if (status === 'FINALIZADA') return '<button class="btn btn-secondary" type="button" data-action="reabrir">Reabrir</button>';
    if (status === 'DEVOLVIDA') return '<button class="btn btn-secondary" type="button" data-action="reabrir">Reabrir</button>';
    return `
      <button class="btn btn-secondary" type="button" data-action="assumir">Assumir</button>
      <button class="btn btn-primary" type="button" data-action="finalizar">Finalizar</button>
      <button class="btn btn-secondary" type="button" data-action="devolver">Devolver</button>`;
  }

  async function onObsChange(event) {
    const obs = event.target.closest('[data-obs]');
    if (!obs) return;
    const tr = obs.closest('[data-os-id]');
    const row = state.rows.find((item) => String(item.id) === String(tr.dataset.osId));
    if (!row) return;
    const previous = row.observacao_logistica;
    row.observacao_logistica = obs.value;
    const { error } = await supabase.from('operacional_os').update({ observacao_logistica: obs.value || null, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) {
      row.observacao_logistica = previous;
      alert(error.message || 'Não foi possível salvar a observação. Verifique se o SQL de logística foi executado.');
      render();
    }
  }

  async function onActionClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const tr = btn.closest('[data-os-id]');
    const row = state.rows.find((item) => String(item.id) === String(tr.dataset.osId));
    if (!row) return;

    const action = btn.dataset.action;
    if (action === 'assumir') await updateStatus(row, { status_logistica: 'EM_ANDAMENTO', logistica_responsavel_id: state.user?.id || null, logistica_assumido_em: new Date().toISOString() });
    if (action === 'finalizar') await updateStatus(row, { status_logistica: 'FINALIZADA', finalizado_por: state.user?.id || null, finalizado_em: new Date().toISOString() });
    if (action === 'devolver') await updateStatus(row, { status_logistica: 'DEVOLVIDA', status_gestor: 'AGUARDAR', logistica_devolvido_em: new Date().toISOString() });
    if (action === 'reabrir') await updateStatus(row, { status_logistica: 'PENDENTE', finalizado_por: null, finalizado_em: null, logistica_devolvido_em: null });
  }

  async function updateStatus(row, patch) {
    const previous = { ...row };
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    render();
    const { error } = await supabase.from('operacional_os').update({ ...patch, updated_at: row.updated_at }).eq('id', row.id);
    if (error) {
      Object.assign(row, previous);
      render();
      alert(error.message || 'Não foi possível atualizar a O.S. Verifique se o SQL de logística foi executado.');
    } else if (patch.status_gestor === 'AGUARDAR') {
      // Ao devolver, a O.S. deixa a fila da logística após a atualização local.
      state.rows = state.rows.filter((item) => String(item.id) !== String(row.id));
      render();
    }
  }
});
