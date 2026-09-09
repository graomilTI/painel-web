import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { openModal, closeModal } from './core/ui.js';
import { compararValores } from './services/relatoriosService.js';

// Logs de Usuários consolida sessão/navegação (app_logs_usuarios) e a trilha
// de mudança de dados (app_auditoria). A auditoria detalhada mostra a ação
// exata, registro afetado, campos alterados e o diff antes -> depois.

const PAGE_SIZE = 50;
const TIME_ZONE = 'America/Sao_Paulo';
const TIPO_LABEL = { login: 'Login', logout: 'Logout', page_access: 'Acesso', action: 'Ação', mudanca: 'Mudança de dado' };
const TIPO_CLASS = {
  login: 'lu-badge-login',
  logout: 'lu-badge-logout',
  page_access: 'lu-badge-page',
  action: 'lu-badge-action',
  mudanca: 'lu-badge-mudanca',
};
const MODULOS = [
  '', 'notas-fiscais', 'compras', 'financeiro', 'programacao', 'logistica',
  'conferencia', 'operacional', 'hospedagem', 'frotas', 'patrimonios', 'rh',
  'ti', 'comercial', 'correios', 'importacoes', 'auth', 'admin',
];

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
  modulo: '',
  acao: '',
  registro: '',
  resultado: '',
  pagina: 0,
  total: 0,
  linhas: [],
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

function camposTexto(row) {
  if (Array.isArray(row.campos_alterados) && row.campos_alterados.length) return row.campos_alterados.join(', ');
  if (Array.isArray(row.detalhes?.campos_alterados) && row.detalhes.campos_alterados.length) return row.detalhes.campos_alterados.join(', ');
  return '';
}

function acaoExata(row) {
  if (row.acao_exata) return row.acao_exata;
  if (row.metadata?.acao_exata) return row.metadata.acao_exata;
  if (row.detalhes?.acao_exata) return row.detalhes.acao_exata;

  if (row.__fonte === 'auditoria') {
    const tabela = row.tabela || row.modulo || 'registro';
    const registro = row.registro_id ? ` [${row.registro_id}]` : '';
    const campos = camposTexto(row);
    if (row.acao === 'INSERT') return `Criou registro em ${tabela}${registro}`;
    if (row.acao === 'UPDATE') return `Alterou ${tabela}${registro}${campos ? ` — campo(s): ${campos}` : ''}`;
    if (row.acao === 'DELETE') return `Excluiu registro de ${tabela}${registro}`;
  }

  return row.acao || '—';
}

function usuarioNome(row) {
  return row.usuario_nome || row.metadata?.usuario_nome || row.usuario_email || '—';
}

function usuarioRole(row) {
  return row.usuario_role || row.metadata?.usuario_role || '';
}

function temDetalhe(row) {
  return row.__fonte === 'auditoria'
    || row.valor_anterior != null
    || row.valor_novo != null
    || (Array.isArray(row.campos_alterados) && row.campos_alterados.length > 0);
}

function injectStyles() {
  if (document.getElementById('luStyles')) return;
  const style = document.createElement('style');
  style.id = 'luStyles';
  style.textContent = `
    .lu-wrap{display:grid;gap:18px;padding:0 2px}.lu-hero{border:1px solid rgba(148,163,184,.16);border-radius:8px;padding:20px 24px;background:#0f172a}.lu-hero h2{margin:0 0 4px;color:#f8fafc;font-size:22px}.lu-hero p{margin:0;color:#94a3b8;font-size:13px}.lu-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.lu-kpi{border:1px solid rgba(148,163,184,.12);border-radius:8px;padding:16px;background:rgba(15,23,42,.55);text-align:center}.lu-kpi span{display:block;font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:4px}.lu-kpi strong{font-size:28px;color:#f8fafc}.lu-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:14px 16px}.lu-filters label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase}.lu-filters input,.lu-filters select{background:#0d0d18;border:1px solid rgba(255,255,255,.10);border-radius:8px;color:#e2e2f0;font-size:13px;padding:8px 10px;min-width:140px}.lu-btn{border:1px solid rgba(99,102,241,.35);background:rgba(99,102,241,.15);color:#e2e2f0;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer}.lu-btn:disabled{cursor:not-allowed;opacity:.4}.lu-btn-export{border-color:rgba(45,212,160,.3);color:#2dd4a0}.lu-table-wrap{overflow-x:auto;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:rgba(15,23,42,.5)}.lu-table{width:100%;border-collapse:collapse;font-size:13px}.lu-table th{padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}.lu-table td{padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.04);color:#cbd5e1;vertical-align:top}.lu-badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase}.lu-badge-login{color:#4ade80}.lu-badge-logout{color:#f87171}.lu-badge-page{color:#a5b4fc}.lu-badge-action{color:#fbbf24}.lu-badge-mudanca{color:#f472b6}.lu-empty{text-align:center;padding:40px;color:#94a3b8;font-size:14px}.lu-pagination{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:10px 4px}.lu-user-nome{font-weight:600;color:#e2e2f0}.lu-user-email{font-size:11px;color:#94a3b8}.lu-modulo{font-family:monospace;font-size:12px;color:#94a3b8}.lu-acao-exata{font-weight:600;color:#e2e8f0;min-width:240px}.lu-registro{font-family:monospace;font-size:11px;color:#cbd5e1}.lu-campos{font-size:11px;color:#94a3b8;margin-top:3px;max-width:320px}.lu-badge-resultado-erro{color:#f87171}.lu-badge-resultado-ok{color:#4ade80}.lu-usuario-grupo{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;margin-bottom:12px;background:rgba(15,23,42,.35)}.lu-usuario-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.06)}.lu-usuario-head .lu-user-nome{font-size:15px}.lu-dia-bloco{margin-bottom:10px}.lu-dia-bloco:last-child{margin-bottom:0}.lu-dia-head{font-size:12px;font-weight:700;color:#a5b4fc;margin-bottom:6px;display:flex;gap:8px;align-items:center}.lu-dia-count{font-size:11px;color:#94a3b8;font-weight:600}@media(max-width:600px){.lu-kpis{grid-template-columns:repeat(2,1fr)}.lu-filters{align-items:stretch;flex-direction:column}}
  `;
  document.head.appendChild(style);
}

function aplicaFiltroModulo(query, modulo) {
  return modulo ? query.ilike('modulo', `%${modulo}%`) : query;
}

async function fetchKpis() {
  const bounds = dayBounds(todayStr());
  const [logsRes, audRes] = await Promise.all([
    supabase.from('app_logs_usuarios').select('tipo,usuario_id,usuario_nome,audit_id').is('audit_id', null).gte('created_at', bounds.start).lte('created_at', bounds.end),
    supabase.from('app_auditoria').select('usuario_id,usuario_email,erro,metadata').gte('created_at', bounds.start).lte('created_at', bounds.end),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (audRes.error) throw audRes.error;

  const rows = logsRes.data || [];
  const audRows = audRes.data || [];
  const counts = {};

  rows.forEach((row) => {
    const nome = row.usuario_nome;
    if (nome) counts[nome] = (counts[nome] || 0) + 1;
  });
  audRows.forEach((row) => {
    const nome = row.metadata?.usuario_nome || row.usuario_email;
    if (nome) counts[nome] = (counts[nome] || 0) + 1;
  });

  const uniqueIds = new Set(rows.filter((row) => row.usuario_id).map((row) => row.usuario_id));
  audRows.forEach((row) => { if (row.usuario_id) uniqueIds.add(row.usuario_id); });

  return {
    logins: rows.filter((row) => row.tipo === 'login').length,
    uniqueUsers: uniqueIds.size,
    acessos: rows.filter((row) => row.tipo === 'page_access').length,
    acoes: rows.filter((row) => row.tipo === 'action').length,
    mudancas: audRows.length,
    erros: audRows.filter((row) => row.erro).length,
    maisAtivo: Object.entries(counts).sort((a, b) => b[1] - a[1])[0],
  };
}

async function fetchLogs() {
  const start = dayBounds(state.de).start;
  const end = dayBounds(state.ate).end;
  const buscarLogs = !state.tipo || state.tipo !== 'mudanca';
  const buscarAuditoria = !state.tipo || state.tipo === 'mudanca';
  const tarefas = [];

  if (buscarLogs) {
    let q = supabase.from('app_logs_usuarios').select('*').is('audit_id', null).gte('created_at', start).lte('created_at', end);
    q = aplicaFiltroModulo(q, state.modulo);
    if (state.tipo) q = q.eq('tipo', state.tipo);
    tarefas.push(q.order('created_at', { ascending: false }).limit(2000).then(({ data, error }) => {
      if (error) throw error;
      return (data || []).map((r) => ({ ...r, __fonte: 'logs' }));
    }));
  } else {
    tarefas.push(Promise.resolve([]));
  }

  if (buscarAuditoria) {
    let q = supabase.from('app_auditoria').select('*').gte('created_at', start).lte('created_at', end);
    q = aplicaFiltroModulo(q, state.modulo);
    if (state.registro) q = q.ilike('registro_id', `%${state.registro}%`);
    tarefas.push(q.order('created_at', { ascending: false }).limit(2000).then(({ data, error }) => {
      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        usuario_nome: r.metadata?.usuario_nome || '',
        usuario_role: r.metadata?.usuario_role || '',
        acao_exata: r.metadata?.acao_exata || '',
        __fonte: 'auditoria',
        tipo: 'mudanca',
      }));
    }));
  } else {
    tarefas.push(Promise.resolve([]));
  }

  const [logsRows, audRows] = await Promise.all(tarefas);
  let combinado = [...logsRows, ...audRows];

  if (state.usuario) {
    const termo = state.usuario.toLocaleLowerCase('pt-BR');
    combinado = combinado.filter((r) => `${usuarioNome(r)} ${r.usuario_email || ''}`.toLocaleLowerCase('pt-BR').includes(termo));
  }

  if (state.acao) {
    const termo = state.acao.toLocaleLowerCase('pt-BR');
    combinado = combinado.filter((r) => {
      const texto = [r.acao, acaoExata(r), r.tabela, r.registro_id, camposTexto(r)].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return texto.includes(termo);
    });
  }

  if (state.registro) {
    const termo = state.registro.toLocaleLowerCase('pt-BR');
    combinado = combinado.filter((r) => `${r.registro_id || ''} ${r.detalhes?.os || ''}`.toLocaleLowerCase('pt-BR').includes(termo));
  }

  if (state.resultado) {
    combinado = combinado.filter((r) => {
      const temErro = r.__fonte === 'auditoria' ? Boolean(r.erro) : false;
      return state.resultado === 'erro' ? temErro : !temErro;
    });
  }

  combinado.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  state.total = combinado.length;
  state.linhas = combinado;
  const from = state.pagina * PAGE_SIZE;
  return combinado.slice(from, from + PAGE_SIZE);
}

function renderKpis(kpis, container) {
  container.innerHTML = `<div class="lu-kpis">
    <div class="lu-kpi"><span>Logins hoje</span><strong>${kpis.logins}</strong></div>
    <div class="lu-kpi"><span>Usuários ativos</span><strong>${kpis.uniqueUsers}</strong></div>
    <div class="lu-kpi"><span>Acessos hoje</span><strong>${kpis.acessos}</strong></div>
    <div class="lu-kpi"><span>Ações hoje</span><strong>${kpis.acoes}</strong></div>
    <div class="lu-kpi"><span>Mudanças de dado</span><strong>${kpis.mudancas}</strong></div>
    <div class="lu-kpi"><span>Erros em mudanças</span><strong style="color:${kpis.erros ? '#f87171' : '#4ade80'}">${kpis.erros}</strong></div>
    ${kpis.maisAtivo ? `<div class="lu-kpi"><span>Mais ativo</span><strong style="font-size:14px">${esc(kpis.maisAtivo[0])}</strong></div>` : ''}
  </div>`;
}

function resultadoBadge(row) {
  if (row.__fonte !== 'auditoria') return '';
  const erro = Boolean(row.erro);
  return `<span class="lu-badge ${erro ? 'lu-badge-resultado-erro' : 'lu-badge-resultado-ok'}">${erro ? 'Erro' : 'Sucesso'}</span>`;
}

function rowHtml(row, i) {
  const campos = camposTexto(row);
  const registro = row.registro_id || row.detalhes?.os || '—';
  return `<tr>
    <td style="white-space:nowrap">${esc(fmtDT(row.created_at))}</td>
    <td>${tipoPill(row.tipo)}</td>
    <td><span class="lu-modulo">${esc(row.modulo || '—')}</span></td>
    <td class="lu-acao-exata">${esc(acaoExata(row))}</td>
    <td><div class="lu-registro">${esc(registro)}</div>${campos ? `<div class="lu-campos">${esc(campos)}</div>` : ''}</td>
    <td>${resultadoBadge(row)}</td>
    <td>${temDetalhe(row) ? `<button class="lu-btn" data-detalhe="${i}" type="button" style="padding:5px 10px;font-size:11px">Detalhes</button>` : ''}</td>
  </tr>`;
}

function diaBr(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderTable(logs) {
  if (!logs.length) return '<div class="lu-empty">Nenhum registro encontrado para os filtros selecionados.</div>';

  const porUsuario = new Map();
  logs.forEach((row, i) => {
    const chave = usuarioNome(row);
    if (!porUsuario.has(chave)) porUsuario.set(chave, { email: row.usuario_email || '', role: usuarioRole(row), porDia: new Map() });
    const grupo = porUsuario.get(chave);
    if (!grupo.email && row.usuario_email) grupo.email = row.usuario_email;
    if (!grupo.role && usuarioRole(row)) grupo.role = usuarioRole(row);
    const dia = diaBr(row.created_at);
    if (!grupo.porDia.has(dia)) grupo.porDia.set(dia, []);
    grupo.porDia.get(dia).push({ row, i });
  });

  return [...porUsuario.entries()].map(([nome, grupo]) => {
    const totalUsuario = [...grupo.porDia.values()].reduce((acc, arr) => acc + arr.length, 0);
    const diasHtml = [...grupo.porDia.entries()].map(([dia, itens]) => `
      <div class="lu-dia-bloco">
        <div class="lu-dia-head">${esc(dia)} <span class="lu-dia-count">${itens.length} evento(s)</span></div>
        <div class="lu-table-wrap"><table class="lu-table"><thead><tr><th>Data/Hora</th><th>Tipo</th><th>Módulo</th><th>Ação exata</th><th>Registro / informação alterada</th><th>Resultado</th><th></th></tr></thead><tbody>${itens.map(({ row, i }) => rowHtml(row, i)).join('')}</tbody></table></div>
      </div>`).join('');
    return `
      <section class="lu-usuario-grupo">
        <div class="lu-usuario-head"><span class="lu-user-nome">${esc(nome)}</span>${grupo.email ? `<span class="lu-user-email">${esc(grupo.email)}</span>` : ''}${grupo.role ? `<span class="lu-user-email">${esc(grupo.role)}</span>` : ''}<span class="lu-dia-count">${totalUsuario} evento(s)</span></div>
        ${diasHtml}
      </section>`;
  }).join('');
}

function abrirDetalhe(row) {
  const diffs = compararValores(row.valor_anterior, row.valor_novo);
  const diffHtml = diffs.length ? `
    <div class="ds-table-wrap" style="margin-top:12px">
      <table class="ds-table">
        <thead><tr><th>Campo</th><th>Valor anterior</th><th>Valor novo</th></tr></thead>
        <tbody>
          ${diffs.map((d) => `<tr>
            <td><strong>${esc(d.campo)}</strong></td>
            <td style="color:${d.alterado ? '#fca5a5' : '#94a3b8'}">${esc(d.anterior)}</td>
            <td style="color:${d.alterado ? '#86efac' : '#94a3b8'}">${esc(d.novo)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<p class="ds-modal-text" style="margin-top:12px">Sem alteração de valores registrada neste evento.</p>';

  openModal({
    id: 'luDetalheModal',
    conteudoHtml: `
      <h3 class="ds-modal-title">Detalhe da ação</h3>
      <div class="ds-modal-grid">
        <div class="ds-modal-full"><div class="ds-modal-label">Ação exata</div><div class="ds-modal-value">${esc(acaoExata(row))}</div></div>
        <div><div class="ds-modal-label">Quando</div><div class="ds-modal-value">${fmtDT(row.created_at)}</div></div>
        <div><div class="ds-modal-label">Usuário</div><div class="ds-modal-value">${esc(usuarioNome(row))}</div></div>
        <div><div class="ds-modal-label">E-mail</div><div class="ds-modal-value">${esc(row.usuario_email || '-')}</div></div>
        <div><div class="ds-modal-label">Perfil</div><div class="ds-modal-value">${esc(usuarioRole(row) || '-')}</div></div>
        <div><div class="ds-modal-label">Módulo</div><div class="ds-modal-value">${esc(row.modulo || '-')}</div></div>
        <div><div class="ds-modal-label">Tipo</div><div class="ds-modal-value">${esc(TIPO_LABEL[row.tipo] || row.tipo || '-')}</div></div>
        <div><div class="ds-modal-label">Tabela</div><div class="ds-modal-value">${esc(row.tabela || '-')}</div></div>
        <div><div class="ds-modal-label">Registro</div><div class="ds-modal-value">${esc(String(row.registro_id || row.detalhes?.os || '-'))}</div></div>
        <div class="ds-modal-full"><div class="ds-modal-label">Campos alterados</div><div class="ds-modal-value">${esc(camposTexto(row) || '-')}</div></div>
        <div><div class="ds-modal-label">Origem</div><div class="ds-modal-value">${esc(row.origem || '-')}</div></div>
        <div><div class="ds-modal-label">IP</div><div class="ds-modal-value">${esc(row.ip || '-')}</div></div>
        <div class="ds-modal-full"><div class="ds-modal-label">Dispositivo</div><div class="ds-modal-value">${esc(row.user_agent || '-')}</div></div>
        ${row.erro ? `<div class="ds-modal-full"><div class="ds-modal-label">Erro</div><div class="ds-modal-value" style="color:#fca5a5">${esc(row.erro)}</div></div>` : ''}
      </div>
      ${diffHtml}
      <div class="ds-modal-actions" style="margin-top:16px"><button class="ds-btn" data-fechar type="button">Fechar</button></div>`,
  });
  document.querySelector('#luDetalheModal [data-fechar]')?.addEventListener('click', () => closeModal('luDetalheModal'));
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
  await fetchLogs();
  const header = 'Data/Hora,Usuário,Email,Perfil,Tipo,Módulo,Ação exata,Tabela,Registro,Campos alterados,Origem,IP,Resultado,Valor anterior,Valor novo\n';
  const body = state.linhas.map((row) => [
    fmtDT(row.created_at), usuarioNome(row), row.usuario_email || '', usuarioRole(row),
    TIPO_LABEL[row.tipo] || row.tipo, row.modulo || '', acaoExata(row), row.tabela || '',
    row.registro_id || row.detalhes?.os || '', camposTexto(row), row.origem || '', row.ip || '',
    row.__fonte === 'auditoria' ? (row.erro ? 'Erro' : 'Sucesso') : '',
    row.valor_anterior == null ? '' : JSON.stringify(row.valor_anterior),
    row.valor_novo == null ? '' : JSON.stringify(row.valor_novo),
  ].map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${header}${body}`], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `logs_${state.de}_${state.ate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function renderContent(content) {
  injectStyles();
  content.innerHTML = `<div class="lu-wrap"><div class="lu-hero"><h2>Logs de Usuários</h2><p>Trilha completa de acesso e auditoria: ação exata, registro afetado, campos alterados e valores anterior × novo.</p></div><div id="luKpis"></div><div class="lu-filters" id="luFilters"><label>De<input type="date" id="luDe" value="${state.de}"></label><label>Até<input type="date" id="luAte" value="${state.ate}"></label><label>Tipo<select id="luTipo"><option value="">Todos</option><option value="login">Login</option><option value="logout">Logout</option><option value="page_access">Acesso</option><option value="action">Ação</option><option value="mudanca">Mudança de dado</option></select></label><label>Usuário<input type="text" id="luUsuario" placeholder="Nome ou e-mail..."></label><label>Módulo<select id="luModulo">${MODULOS.map((m) => `<option value="${esc(m)}">${esc(m || 'Todos')}</option>`).join('')}</select></label><label>Ação / campo<input type="text" id="luAcao" placeholder="ex.: status, colaborador, aprovou"></label><label>Registro<input type="text" id="luRegistro" placeholder="OS, id do registro..."></label><label>Resultado<select id="luResultado"><option value="">Todos</option><option value="sucesso">Sucesso</option><option value="erro">Erro</option></select></label><button class="lu-btn" id="luBuscar">Buscar</button><button class="lu-btn lu-btn-export" id="luExport">Exportar CSV</button></div><div id="luTableArea"><div class="lu-empty">Carregando...</div></div><div id="luPagination"></div></div>`;

  fetchKpis().then((kpis) => renderKpis(kpis, content.querySelector('#luKpis'))).catch(() => {
    content.querySelector('#luKpis').innerHTML = '<div class="lu-empty">Não foi possível carregar os indicadores.</div>';
  });

  async function refresh() {
    const table = content.querySelector('#luTableArea');
    const pagination = content.querySelector('#luPagination');
    table.innerHTML = '<div class="lu-empty">Carregando...</div>';
    try {
      const pagina = await fetchLogs();
      table.innerHTML = renderTable(pagina);
      pagination.innerHTML = renderPagination();
      pagination.querySelector('#btnPrev')?.addEventListener('click', () => { state.pagina -= 1; refresh(); });
      pagination.querySelector('#btnNext')?.addEventListener('click', () => { state.pagina += 1; refresh(); });
      table.querySelectorAll('[data-detalhe]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = pagina[Number(btn.dataset.detalhe)];
          if (row) abrirDetalhe(row);
        });
      });
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
    state.modulo = content.querySelector('#luModulo').value;
    state.acao = content.querySelector('#luAcao').value.trim();
    state.registro = content.querySelector('#luRegistro').value.trim();
    state.resultado = content.querySelector('#luResultado').value;
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

initProtectedPage('Logs de Usuários', renderContent);
