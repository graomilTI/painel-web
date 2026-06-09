import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const TIPO_LABEL = {
  login:       'Login',
  logout:      'Logout',
  page_access: 'Acesso',
  action:      'Ação',
};

const TIPO_CLASS = {
  login:       'lu-badge-login',
  logout:      'lu-badge-logout',
  page_access: 'lu-badge-page',
  action:      'lu-badge-action',
};

const PAGE_SIZE = 50;

let state = {
  de: todayStr(),
  ate: todayStr(),
  tipo: '',
  usuario: '',
  pagina: 0,
  total: 0,
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function esc(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function fmtDT(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function tipoPill(tipo) {
  return `<span class="lu-badge ${TIPO_CLASS[tipo] || 'lu-badge-page'}">${esc(TIPO_LABEL[tipo] || tipo)}</span>`;
}

function injectStyles() {
  if (document.getElementById('luStyles')) return;
  const s = document.createElement('style');
  s.id = 'luStyles';
  s.textContent = `
    .lu-wrap{display:grid;gap:18px;padding:0 2px}
    .lu-hero{border:1px solid rgba(148,163,184,.16);border-radius:20px;padding:20px 24px;background:linear-gradient(135deg,rgba(15,23,42,.97),rgba(79,70,229,.18))}
    .lu-hero h2{margin:0 0 4px;color:#f8fafc;font-size:22px;font-weight:700}
    .lu-hero p{margin:0;color:#6b7280;font-size:13px}
    .lu-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
    .lu-kpi{border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:16px;background:rgba(15,23,42,.55);text-align:center}
    .lu-kpi span{display:block;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .lu-kpi strong{font-size:28px;color:#f8fafc;font-weight:700}
    .lu-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:14px 16px}
    .lu-filters label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    .lu-filters input,.lu-filters select{background:#0d0d18;border:1px solid rgba(255,255,255,.10);border-radius:10px;color:#e2e2f0;font-size:13px;padding:8px 10px;min-width:140px}
    .lu-filters input:focus,.lu-filters select:focus{outline:none;border-color:rgba(99,102,241,.5)}
    .lu-btn{border:1px solid rgba(99,102,241,.35);background:rgba(99,102,241,.15);color:#e2e2f0;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s;white-space:nowrap}
    .lu-btn:hover{background:rgba(99,102,241,.28);border-color:rgba(99,102,241,.6)}
    .lu-btn-export{border-color:rgba(45,212,160,.3);background:rgba(45,212,160,.12);color:#2dd4a0}
    .lu-btn-export:hover{background:rgba(45,212,160,.22)}
    .lu-table-wrap{overflow-x:auto;border:1px solid rgba(255,255,255,.06);border-radius:16px;background:rgba(15,23,42,.5)}
    .lu-table{width:100%;border-collapse:collapse;font-size:13px}
    .lu-table th{padding:12px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid rgba(255,255,255,.06)}
    .lu-table td{padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.04);color:#cbd5e1;vertical-align:top}
    .lu-table tr:last-child td{border-bottom:0}
    .lu-table tr:hover td{background:rgba(255,255,255,.02)}
    .lu-badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    .lu-badge-login{background:rgba(34,197,94,.18);color:#4ade80;border:1px solid rgba(34,197,94,.25)}
    .lu-badge-logout{background:rgba(239,68,68,.18);color:#f87171;border:1px solid rgba(239,68,68,.25)}
    .lu-badge-page{background:rgba(99,102,241,.18);color:#a5b4fc;border:1px solid rgba(99,102,241,.25)}
    .lu-badge-action{background:rgba(245,158,11,.18);color:#fbbf24;border:1px solid rgba(245,158,11,.25)}
    .lu-empty{text-align:center;padding:40px;color:#4b5563;font-size:14px}
    .lu-pagination{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:10px 4px}
    .lu-pagination span{font-size:13px;color:#6b7280}
    .lu-user-nome{font-weight:600;color:#e2e2f0}
    .lu-user-email{font-size:11px;color:#6b7280}
    .lu-modulo{font-family:monospace;font-size:12px;color:#94a3b8;background:rgba(255,255,255,.05);padding:2px 7px;border-radius:6px}
    @media(max-width:600px){.lu-kpis{grid-template-columns:repeat(2,1fr)}.lu-filters{flex-direction:column}}
  `;
  document.head.appendChild(s);
}

async function fetchKpis() {
  const hoje = todayStr();
  const { data } = await supabase
    .from('app_logs_usuarios')
    .select('tipo, usuario_id, usuario_nome')
    .gte('created_at', `${hoje}T00:00:00`)
    .lte('created_at', `${hoje}T23:59:59`);

  const rows = data || [];
  const logins = rows.filter((r) => r.tipo === 'login').length;
  const uniqueUsers = new Set(rows.filter((r) => r.usuario_id).map((r) => r.usuario_id)).size;
  const acessos = rows.filter((r) => r.tipo === 'page_access').length;
  const acoes = rows.filter((r) => r.tipo === 'action').length;

  const counts = {};
  rows.filter((r) => r.usuario_nome).forEach((r) => {
    counts[r.usuario_nome] = (counts[r.usuario_nome] || 0) + 1;
  });
  const maisAtivo = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  return { logins, uniqueUsers, acessos, acoes, maisAtivo };
}

async function fetchLogs() {
  const from = state.pagina * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = supabase
    .from('app_logs_usuarios')
    .select('*', { count: 'exact' })
    .gte('created_at', `${state.de}T00:00:00`)
    .lte('created_at', `${state.ate}T23:59:59`)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (state.tipo) q = q.eq('tipo', state.tipo);
  if (state.usuario) q = q.ilike('usuario_nome', `%${state.usuario}%`);

  const { data, error, count } = await q;
  if (error) throw error;
  state.total = count || 0;
  return data || [];
}

function renderKpis(kpis, container) {
  container.innerHTML = `
    <div class="lu-kpis">
      <div class="lu-kpi"><span>Logins hoje</span><strong>${kpis.logins}</strong></div>
      <div class="lu-kpi"><span>Usuários ativos</span><strong>${kpis.uniqueUsers}</strong></div>
      <div class="lu-kpi"><span>Acessos hoje</span><strong>${kpis.acessos}</strong></div>
      <div class="lu-kpi"><span>Ações hoje</span><strong>${kpis.acoes}</strong></div>
      ${kpis.maisAtivo ? `<div class="lu-kpi"><span>Mais ativo</span><strong style="font-size:14px;line-height:1.3">${esc(kpis.maisAtivo[0])}</strong></div>` : ''}
    </div>`;
}

function renderTable(logs) {
  if (!logs.length) {
    return `<div class="lu-empty">Nenhum registro encontrado para os filtros selecionados.</div>`;
  }

  const rows = logs.map((r) => `
    <tr>
      <td style="white-space:nowrap;font-size:12px;color:#6b7280">${esc(fmtDT(r.created_at))}</td>
      <td>
        <div class="lu-user-nome">${esc(r.usuario_nome || '—')}</div>
        <div class="lu-user-email">${esc(r.usuario_email || '')}</div>
      </td>
      <td><span style="font-size:12px;color:#94a3b8">${esc(r.usuario_role || '—')}</span></td>
      <td>${tipoPill(r.tipo)}</td>
      <td><span class="lu-modulo">${esc(r.modulo || '—')}</span></td>
      <td style="color:#e2e2f0">${esc(r.acao || '—')}</td>
    </tr>`).join('');

  return `
    <div class="lu-table-wrap">
      <table class="lu-table">
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Usuário</th>
            <th>Perfil</th>
            <th>Tipo</th>
            <th>Módulo</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderPagination() {
  const totalPags = Math.ceil(state.total / PAGE_SIZE);
  const atual = state.pagina + 1;
  const from = state.pagina * PAGE_SIZE + 1;
  const to = Math.min(state.total, from + PAGE_SIZE - 1);
  return `
    <div class="lu-pagination">
      <span>${state.total === 0 ? '0 registros' : `${from}–${to} de ${state.total} registros`}</span>
      <div style="display:flex;gap:8px">
        <button class="lu-btn" id="btnPrev" ${state.pagina === 0 ? 'disabled style="opacity:.4"' : ''}>← Anterior</button>
        <span style="font-size:13px;color:#94a3b8;align-self:center">Pág. ${atual}/${Math.max(1, totalPags)}</span>
        <button class="lu-btn" id="btnNext" ${atual >= totalPags ? 'disabled style="opacity:.4"' : ''}>Próxima →</button>
      </div>
    </div>`;
}

async function exportCsv() {
  const { data } = await supabase
    .from('app_logs_usuarios')
    .select('created_at,usuario_nome,usuario_email,usuario_role,tipo,modulo,acao')
    .gte('created_at', `${state.de}T00:00:00`)
    .lte('created_at', `${state.ate}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(5000);

  const rows = data || [];
  const header = 'Data/Hora,Usuário,Email,Perfil,Tipo,Módulo,Ação\n';
  const csv = header + rows.map((r) =>
    [fmtDT(r.created_at), r.usuario_nome, r.usuario_email, r.usuario_role, TIPO_LABEL[r.tipo] || r.tipo, r.modulo, r.acao]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  ).join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs_${state.de}_${state.ate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function renderPage(content) {
  injectStyles();

  const kpisDiv = document.createElement('div');
  const filtersId = 'luFilters';
  const tableId = 'luTableArea';
  const pagId = 'luPagination';

  content.innerHTML = `
    <div class="lu-wrap">
      <div class="lu-hero">
        <h2>Logs de Usuários</h2>
        <p>Monitoramento de logins, acessos e ações no painel</p>
      </div>
      <div id="luKpis"></div>
      <div class="lu-filters" id="${filtersId}">
        <label>De
          <input type="date" id="luDe" value="${state.de}" />
        </label>
        <label>Até
          <input type="date" id="luAte" value="${state.ate}" />
        </label>
        <label>Tipo
          <select id="luTipo">
            <option value="">Todos</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="page_access">Acesso</option>
            <option value="action">Ação</option>
          </select>
        </label>
        <label>Usuário
          <input type="text" id="luUsuario" placeholder="Nome..." value="${esc(state.usuario)}" />
        </label>
        <button class="lu-btn" id="luBuscar">Buscar</button>
        <button class="lu-btn lu-btn-export" id="luExport">Exportar CSV</button>
      </div>
      <div id="${tableId}"><div class="lu-empty">Carregando...</div></div>
      <div id="${pagId}"></div>
    </div>`;

  fetchKpis().then((kpis) => renderKpis(kpis, content.querySelector('#luKpis')));

  async function refresh() {
    const tableArea = content.querySelector(`#${tableId}`);
    const pagArea = content.querySelector(`#${pagId}`);
    tableArea.innerHTML = '<div class="lu-empty">Carregando...</div>';
    try {
      const logs = await fetchLogs();
      tableArea.innerHTML = renderTable(logs);
      pagArea.innerHTML = renderPagination();
      bindPagination(pagArea);
    } catch (err) {
      tableArea.innerHTML = `<div class="lu-empty">Erro ao carregar logs: ${esc(err.message)}</div>`;
    }
  }

  function bindPagination(pagArea) {
    const prev = pagArea.querySelector('#btnPrev');
    const next = pagArea.querySelector('#btnNext');
    prev?.addEventListener('click', () => { state.pagina--; refresh(); });
    next?.addEventListener('click', () => { state.pagina++; refresh(); });
  }

  content.querySelector('#luBuscar').addEventListener('click', () => {
    state.de = content.querySelector('#luDe').value || todayStr();
    state.ate = content.querySelector('#luAte').value || todayStr();
    state.tipo = content.querySelector('#luTipo').value;
    state.usuario = content.querySelector('#luUsuario').value.trim();
    state.pagina = 0;
    refresh();
  });

  content.querySelector('#luExport').addEventListener('click', exportCsv);

  refresh();
}

initProtectedPage('Logs de Usuários', renderPage);
