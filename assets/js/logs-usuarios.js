import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const PAGE_SIZE = 50;
const TIME_ZONE = 'America/Sao_Paulo';
const TIPO_LABEL = { login: 'Login', logout: 'Logout', page_access: 'Acesso', action: 'Ação' };
const TIPO_CLASS = {
  login: 'lu-badge-login',
  logout: 'lu-badge-logout',
  page_access: 'lu-badge-page',
  action: 'lu-badge-action',
};

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dayBounds(date) {
  return {
    start: `${date}T00:00:00.000-03:00`,
    end: `${date}T23:59:59.999-03:00`,
  };
}

const state = {
  de: todayStr(),
  ate: todayStr(),
  tipo: '',
  usuario: '',
  pagina: 0,
  total: 0,
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDT(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function tipoPill(tipo) {
  return `<span class="lu-badge ${TIPO_CLASS[tipo] || 'lu-badge-page'}">${esc(TIPO_LABEL[tipo] || tipo)}</span>`;
}

function injectStyles() {
  if (document.getElementById('luStyles')) return;
  const style = document.createElement('style');
  style.id = 'luStyles';
  style.textContent = `
    .lu-wrap{display:grid;gap:18px;padding:0 2px}.lu-hero{border:1px solid rgba(148,163,184,.16);border-radius:8px;padding:20px 24px;background:#0f172a}.lu-hero h2{margin:0 0 4px;color:#f8fafc;font-size:22px}.lu-hero p{margin:0;color:#94a3b8;font-size:13px}.lu-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.lu-kpi{border:1px solid rgba(148,163,184,.12);border-radius:8px;padding:16px;background:rgba(15,23,42,.55);text-align:center}.lu-kpi span{display:block;font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px}.lu-kpi strong{font-size:28px;color:#f8fafc}.lu-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:14px 16px}.lu-filters label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase}.lu-filters input,.lu-filters select{background:#0d0d18;border:1px solid rgba(255,255,255,.10);border-radius:8px;color:#e2e2f0;font-size:13px;padding:8px 10px;min-width:140px}.lu-btn{border:1px solid rgba(99,102,241,.35);background:rgba(99,102,241,.15);color:#e2e2f0;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer}.lu-btn:disabled{cursor:not-allowed;opacity:.4}.lu-btn-export{border-color:rgba(45,212,160,.3);color:#2dd4a0}.lu-table-wrap{overflow-x:auto;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:rgba(15,23,42,.5)}.lu-table{width:100%;border-collapse:collapse;font-size:13px}.lu-table th{padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,.06)}.lu-table td{padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.04);color:#cbd5e1;vertical-align:top}.lu-badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase}.lu-badge-login{color:#4ade80}.lu-badge-logout{color:#f87171}.lu-badge-page{color:#a5b4fc}.lu-badge-action{color:#fbbf24}.lu-empty{text-align:center;padding:40px;color:#94a3b8;font-size:14px}.lu-pagination{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:10px 4px}.lu-user-nome{font-weight:600;color:#e2e2f0}.lu-user-email{font-size:11px;color:#94a3b8}.lu-modulo{font-family:monospace;font-size:12px;color:#94a3b8}@media(max-width:600px){.lu-kpis{grid-template-columns:repeat(2,1fr)}.lu-filters{align-items:stretch;flex-direction:column}}
  `;
  document.head.appendChild(style);
}

async function fetchKpis() {
  const bounds = dayBounds(todayStr());
  const { data, error } = await supabase
    .from('app_logs_usuarios')
    .select('tipo,usuario_id,usuario_nome')
    .gte('created_at', bounds.start)
    .lte('created_at', bounds.end);
  if (error) throw error;

  const rows = data || [];
  const counts = {};
  rows.forEach((row) => {
    if (row.usuario_nome) counts[row.usuario_nome] = (counts[row.usuario_nome] || 0) + 1;
  });

  return {
    logins: rows.filter((row) => row.tipo === 'login').length,
    uniqueUsers: new Set(rows.filter((row) => row.usuario_id).map((row) => row.usuario_id)).size,
    acessos: rows.filter((row) => row.tipo === 'page_access').length,
    acoes: rows.filter((row) => row.tipo === 'action').length,
    maisAtivo: Object.entries(counts).sort((a, b) => b[1] - a[1])[0],
  };
}

async function fetchLogs() {
  const from = state.pagina * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const start = dayBounds(state.de).start;
  const end = dayBounds(state.ate).end;
  let query = supabase
    .from('app_logs_usuarios')
    .select('*', { count: 'exact' })
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (state.tipo) query = query.eq('tipo', state.tipo);
  if (state.usuario) query = query.ilike('usuario_nome', `%${state.usuario}%`);
  const { data, error, count } = await query;
  if (error) throw error;
  state.total = count || 0;
  return data || [];
}

function renderKpis(kpis, container) {
  container.innerHTML = `<div class="lu-kpis">
    <div class="lu-kpi"><span>Logins hoje</span><strong>${kpis.logins}</strong></div>
    <div class="lu-kpi"><span>Usuários ativos</span><strong>${kpis.uniqueUsers}</strong></div>
    <div class="lu-kpi"><span>Acessos hoje</span><strong>${kpis.acessos}</strong></div>
    <div class="lu-kpi"><span>Ações hoje</span><strong>${kpis.acoes}</strong></div>
    ${kpis.maisAtivo ? `<div class="lu-kpi"><span>Mais ativo</span><strong style="font-size:14px">${esc(kpis.maisAtivo[0])}</strong></div>` : ''}
  </div>`;
}

function renderTable(logs) {
  if (!logs.length) return '<div class="lu-empty">Nenhum registro encontrado para os filtros selecionados.</div>';
  const rows = logs.map((row) => `<tr>
    <td style="white-space:nowrap">${esc(fmtDT(row.created_at))}</td>
    <td><div class="lu-user-nome">${esc(row.usuario_nome || '—')}</div><div class="lu-user-email">${esc(row.usuario_email || '')}</div></td>
    <td>${esc(row.usuario_role || '—')}</td><td>${tipoPill(row.tipo)}</td>
    <td><span class="lu-modulo">${esc(row.modulo || '—')}</span></td><td>${esc(row.acao || '—')}</td>
  </tr>`).join('');
  return `<div class="lu-table-wrap"><table class="lu-table"><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Perfil</th><th>Tipo</th><th>Módulo</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderPagination() {
  const pages = Math.ceil(state.total / PAGE_SIZE);
  const current = state.pagina + 1;
  const from = state.total ? state.pagina * PAGE_SIZE + 1 : 0;
  const to = Math.min(state.total, from + PAGE_SIZE - 1);
  return `<div class="lu-pagination"><span>${state.total ? `${from}–${to} de ${state.total} registros` : '0 registros'}</span><div style="display:flex;gap:8px;align-items:center"><button class="lu-btn" id="btnPrev" ${state.pagina === 0 ? 'disabled' : ''}>← Anterior</button><span>Pág. ${current}/${Math.max(1, pages)}</span><button class="lu-btn" id="btnNext" ${current >= pages ? 'disabled' : ''}>Próxima →</button></div></div>`;
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv() {
  const { data, error } = await supabase
    .from('app_logs_usuarios')
    .select('created_at,usuario_nome,usuario_email,usuario_role,tipo,modulo,acao')
    .gte('created_at', dayBounds(state.de).start)
    .lte('created_at', dayBounds(state.ate).end)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;

  const header = 'Data/Hora,Usuário,Email,Perfil,Tipo,Módulo,Ação\n';
  const body = (data || []).map((row) => [
    fmtDT(row.created_at), row.usuario_nome, row.usuario_email, row.usuario_role,
    TIPO_LABEL[row.tipo] || row.tipo, row.modulo, row.acao,
  ].map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${header}${body}`], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `logs_${state.de}_${state.ate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function renderPage(content) {
  injectStyles();
  content.innerHTML = `<div class="lu-wrap"><div class="lu-hero"><h2>Logs de Usuários</h2><p>Monitoramento de logins, acessos e ações no painel</p></div><div id="luKpis"></div><div class="lu-filters" id="luFilters"><label>De<input type="date" id="luDe" value="${state.de}"></label><label>Até<input type="date" id="luAte" value="${state.ate}"></label><label>Tipo<select id="luTipo"><option value="">Todos</option><option value="login">Login</option><option value="logout">Logout</option><option value="page_access">Acesso</option><option value="action">Ação</option></select></label><label>Usuário<input type="text" id="luUsuario" placeholder="Nome..."></label><button class="lu-btn" id="luBuscar">Buscar</button><button class="lu-btn lu-btn-export" id="luExport">Exportar CSV</button></div><div id="luTableArea"><div class="lu-empty">Carregando...</div></div><div id="luPagination"></div></div>`;

  fetchKpis().then((kpis) => renderKpis(kpis, content.querySelector('#luKpis'))).catch(() => {
    content.querySelector('#luKpis').innerHTML = '<div class="lu-empty">Não foi possível carregar os indicadores.</div>';
  });

  async function refresh() {
    const table = content.querySelector('#luTableArea');
    const pagination = content.querySelector('#luPagination');
    table.innerHTML = '<div class="lu-empty">Carregando...</div>';
    try {
      table.innerHTML = renderTable(await fetchLogs());
      pagination.innerHTML = renderPagination();
      pagination.querySelector('#btnPrev')?.addEventListener('click', () => { state.pagina -= 1; refresh(); });
      pagination.querySelector('#btnNext')?.addEventListener('click', () => { state.pagina += 1; refresh(); });
    } catch (error) {
      table.innerHTML = `<div class="lu-empty">Erro ao carregar logs: ${esc(error.message)}</div>`;
      pagination.innerHTML = '';
    }
  }

  const search = () => {
    state.de = content.querySelector('#luDe').value || todayStr();
    state.ate = content.querySelector('#luAte').value || todayStr();
    state.tipo = content.querySelector('#luTipo').value;
    state.usuario = content.querySelector('#luUsuario').value.trim();
    state.pagina = 0;
    refresh();
  };
  content.querySelector('#luBuscar').addEventListener('click', search);
  content.querySelector('#luFilters').addEventListener('keydown', (event) => { if (event.key === 'Enter') search(); });
  content.querySelector('#luExport').addEventListener('click', async () => {
    try { await exportCsv(); } catch (error) { window.alert(`Erro ao exportar: ${error.message}`); }
  });
  refresh();
}

initProtectedPage('Logs de Usuários', renderPage);
