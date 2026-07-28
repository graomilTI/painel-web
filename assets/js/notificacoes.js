import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { initNotificacoesEngine, NOTIF_META } from './notificacoes-engine.js';
import { toPanelUrl } from './paths.js';

const PRIORIDADE_LABEL = { urgente: 'Urgente', atencao: 'Atenção', normal: 'Normal', informativo: 'Informativo' };
const PRIORIDADE_CLASS = { urgente: 'pn-urg', atencao: 'pn-atc', normal: 'pn-nor', informativo: 'pn-inf' };

function esc(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function fmtDT(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function prioridadePill(p) {
  return `<span class="pn-pill ${PRIORIDADE_CLASS[p] || 'pn-nor'}">${esc(PRIORIDADE_LABEL[p] || p)}</span>`;
}

function injectStyles() {
  if (document.getElementById('pnStyles')) return;
  const s = document.createElement('style');
  s.id = 'pnStyles';
  s.textContent = `
    .pn-wrap{display:grid;gap:18px}
    .pn-hero{border:1px solid rgba(148,163,184,.16);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.22))}
    .pn-hero h2{margin:0 0 6px;color:#f8fafc;font-size:26px}
    .pn-hero p{margin:0;color:#6b7280;font-size:14px}
    .pn-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 18px;background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.06);border-radius:16px}
    .pn-filter-btn{border:1px solid rgba(255,255,255,.08);background:#0d0d18;color:#94a3b8;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;transition:.15s}
    .pn-filter-btn.active,.pn-filter-btn:hover{background:rgba(45,212,160,.15);border-color:rgba(45,212,160,.3);color:#e2e2f0}
    .pn-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .pn-kpi{border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:14px;background:rgba(15,23,42,.5)}
    .pn-kpi span{display:block;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}
    .pn-kpi strong{display:block;font-size:22px;color:#f8fafc;margin-top:4px}
    .pn-list{display:grid;gap:10px}
    .pn-card{border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:14px 16px;background:rgba(15,23,42,.55);display:grid;grid-template-columns:36px 1fr auto;gap:12px;align-items:start;transition:.15s}
    .pn-card:hover{background:rgba(255,255,255,.03)}
    .pn-card.nao-lida{border-color:rgba(45,212,160,.18);background:rgba(45,212,160,.03)}
    .pn-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;border:1px solid;flex-shrink:0}
    .pn-icon svg{width:16px;height:16px;stroke:currentColor;fill:none}
    .pn-titulo{font-size:14px;font-weight:800;color:#e2e2f0;line-height:1.3}
    .pn-desc{font-size:13px;color:#94a3b8;margin-top:3px}
    .pn-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}
    .pn-time{font-size:12px;color:#475569}
    .pn-pill{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;border:1px solid}
    .pn-urg{background:rgba(239,68,68,.12);color:#fca5a5;border-color:rgba(239,68,68,.3)}
    .pn-atc{background:rgba(245,158,11,.11);color:#fde68a;border-color:rgba(245,158,11,.28)}
    .pn-nor{background:rgba(59,130,246,.11);color:#bfdbfe;border-color:rgba(59,130,246,.26)}
    .pn-inf{background:rgba(100,116,139,.1);color:#cbd5e1;border-color:rgba(100,116,139,.22)}
    .pn-computed-tag{background:rgba(45,212,160,.1);color:#6ee7b7;border:1px solid rgba(45,212,160,.22);border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700}
    .pn-actions{display:flex;flex-direction:row;gap:6px;align-items:center;flex-shrink:0}
    .pn-icon-btn{width:32px;height:32px;border:1px solid rgba(255,255,255,.08);background:#0d0d18;color:#e2e2f0;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;transition:.15s;flex-shrink:0}
    .pn-icon-btn svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.2}
    .pn-icon-btn:hover{background:rgba(45,212,160,.15);border-color:rgba(45,212,160,.3)}
    .pn-icon-btn-exec{background:rgba(22,101,52,.28);border-color:rgba(45,212,160,.35);color:#bbf7d0}
    .pn-icon-btn-exec.is-done{background:rgba(45,212,160,.22);border-color:rgba(45,212,160,.5);color:#6ee7b7;cursor:default}
    .pn-icon-btn[disabled]{opacity:.6;cursor:wait}
    .pn-empty{padding:32px;text-align:center;color:#475569;font-size:14px}
    .pn-master-table{overflow:auto;border:1px solid rgba(148,163,184,.12);border-radius:16px}
    .pn-table{width:100%;border-collapse:collapse;min-width:900px;background:#0d0d18;font-size:13px}
    .pn-table th,.pn-table td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);text-align:left;vertical-align:top}
    .pn-table th{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;background:#0a0a18}
    .pn-table tr:hover td{background:rgba(255,255,255,.02)}
    .pn-section-title{font-size:13px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px}
    @media(max-width:760px){.pn-kpis{grid-template-columns:repeat(2,1fr)}.pn-card{grid-template-columns:36px 1fr}.pn-actions{grid-column:1/-1;flex-direction:row}}
  `;
  document.head.appendChild(s);
}

const ICONS = {
  'clipboard-alert': `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="12" y1="11" x2="12" y2="15"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  'calendar-clock':  `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="16" cy="16" r="3"/><polyline points="16 14.5 16 16 17 17"/></svg>`,
  'package-alert':   `<svg viewBox="0 0 24 24"><path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><line x1="12" y1="11" x2="12" y2="15"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  'hotel-alert':     `<svg viewBox="0 0 24 24"><path d="M3 21h18M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2M3 21V7m18 14V7M3 7h18M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/><line x1="15" y1="3" x2="15" y2="7"/><line x1="9" y1="3" x2="9" y2="7"/></svg>`,
  'check-circle':    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`,
  'clipboard-check': `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><polyline points="9 12 11 14 15 10"/></svg>`,
  'shopping-bag':    `<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  'receipt':         `<svg viewBox="0 0 24 24"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8m6 4H8m2 4H8"/></svg>`,
  'bell':            `<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
};

const P_COLORS = {
  urgente:     { bg: 'rgba(239,68,68,.14)',   bd: 'rgba(239,68,68,.32)',  c: '#fca5a5' },
  atencao:     { bg: 'rgba(245,158,11,.12)',  bd: 'rgba(245,158,11,.28)', c: '#fde68a' },
  normal:      { bg: 'rgba(59,130,246,.11)',  bd: 'rgba(59,130,246,.26)', c: '#bfdbfe' },
  informativo: { bg: 'rgba(100,116,139,.1)',  bd: 'rgba(100,116,139,.22)',c: '#cbd5e1' },
};

function iconHtml(icone, prioridade) {
  const c = P_COLORS[prioridade] || P_COLORS.normal;
  const svg = ICONS[icone] || ICONS.bell;
  return `<div class="pn-icon" style="background:${c.bg};border-color:${c.bd};color:${c.c}">${svg}</div>`;
}

export async function renderContent(content, userContext) {
  injectStyles();

  const isMaster = !!userContext?.user?.is_master || String(userContext?.user?.role || '').toUpperCase() === 'MASTER';

  content.innerHTML = `
    <div class="pn-wrap">
      <div class="pn-hero">
        <h2>Central de Notificações</h2>
        <p>Acompanhe todas as notificações do painel em tempo real.</p>
      </div>

      <div class="pn-filters" id="pnFilters">
        <span style="font-size:13px;color:#64748b;font-weight:700">Filtrar:</span>
        <button class="pn-filter-btn active" data-filter="todas">Todas</button>
        <button class="pn-filter-btn" data-filter="urgente">Urgentes</button>
        <button class="pn-filter-btn" data-filter="atencao">Atenção</button>
        <button class="pn-filter-btn" data-filter="computed">Automáticas</button>
        <button class="pn-filter-btn" data-filter="eventos">Eventos</button>
      </div>

      <div class="pn-kpis">
        <div class="pn-kpi"><span>Total</span><strong id="pnKpiTotal">0</strong></div>
        <div class="pn-kpi"><span>Urgentes</span><strong id="pnKpiUrg">0</strong></div>
        <div class="pn-kpi"><span>Atenção</span><strong id="pnKpiAtc">0</strong></div>
        <div class="pn-kpi"><span>Não lidas</span><strong id="pnKpiNlidas">0</strong></div>
      </div>

      <div id="pnListWrap">
        <p class="pn-section-title">Notificações pendentes</p>
        <div id="pnList" class="pn-list"></div>
      </div>

      ${isMaster ? `
      <div id="pnMasterWrap">
        <p class="pn-section-title">Histórico de eventos (Master)</p>
        <div class="pn-master-table" id="pnMasterTableWrap">
          <table class="pn-table">
            <thead><tr>
              <th>Tipo</th><th>Título</th><th>Criado em</th>
              <th>Lida em</th><th>Executada em</th>
              <th>Usuário(s)</th><th>Prioridade</th>
            </tr></thead>
            <tbody id="pnMasterBody"><tr><td colspan="7" style="text-align:center;color:#475569;padding:20px">Carregando...</td></tr></tbody>
          </table>
        </div>
      </div>` : ''}
    </div>
  `;

  let currentFilter = 'todas';
  let engine;

  try {
    // Reutiliza o engine já inicializado pelo layout, se disponível
    engine = window.__painelNotifEngine || await initNotificacoesEngine(userContext);
    if (!window.__painelNotifEngine) window.__painelNotifEngine = engine;
  } catch (err) {
    document.getElementById('pnList').innerHTML = `<div class="pn-empty">Erro ao carregar notificações: ${esc(err?.message)}</div>`;
    return;
  }

  function updateKpis(list) {
    document.getElementById('pnKpiTotal').textContent = list.length;
    document.getElementById('pnKpiUrg').textContent = list.filter((n) => n.prioridade === 'urgente').length;
    document.getElementById('pnKpiAtc').textContent = list.filter((n) => n.prioridade === 'atencao').length;
    document.getElementById('pnKpiNlidas').textContent = list.filter((n) => n.computed || !n.lida).length;
  }

  function filtered(list) {
    if (currentFilter === 'todas') return list;
    if (currentFilter === 'computed') return list.filter((n) => n.computed);
    if (currentFilter === 'eventos') return list.filter((n) => !n.computed);
    return list.filter((n) => n.prioridade === currentFilter);
  }

  function renderList(list) {
    const el = document.getElementById('pnList');
    const items = filtered(list);
    if (!items.length) {
      el.innerHTML = '<div class="pn-empty">Nenhuma notificação para este filtro.</div>';
      return;
    }

    el.innerHTML = items.map((n) => {
      const naoLida = n.computed || !n.lida;
      const url = n.modulo_url ? toPanelUrl(n.modulo_url) : '#';
      const typeLabel = NOTIF_META[n.tipo]?.label || n.tipo;
      return `
        <div class="pn-card${naoLida ? ' nao-lida' : ''}" data-notif-id="${esc(n.id)}" data-computed="${!!n.computed}">
          ${iconHtml(n.icone, n.prioridade)}
          <div>
            <div class="pn-titulo">${esc(n.titulo)}</div>
            ${n.descricao ? `<div class="pn-desc">${esc(n.descricao)}</div>` : ''}
            <div class="pn-meta">
              ${prioridadePill(n.prioridade)}
              ${n.computed ? '<span class="pn-computed-tag">Automática</span>' : ''}
              <span class="pn-time">${fmtDT(n.created_at)}</span>
              <span class="pn-time" style="opacity:.6">${esc(typeLabel)}</span>
            </div>
          </div>
          <div class="pn-actions">
            <a class="pn-icon-btn" href="${url}" title="Ir ao módulo" aria-label="Ir ao módulo" data-action-link="${esc(n.id)}" data-computed="${!!n.computed}">
              <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
            ${!n.computed ? `<button class="pn-icon-btn pn-icon-btn-exec" title="Marcar como feito" aria-label="Marcar como feito" data-exec-id="${esc(n.id)}" type="button">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </button>` : ''}
          </div>
        </div>`;
    }).join('');

    // Link → marca como lida
    el.querySelectorAll('[data-action-link]').forEach((a) => {
      a.addEventListener('click', () => {
        const id = a.dataset.actionLink;
        if (id && a.dataset.computed !== 'true') engine.marcarLida(id);
      });
    });

    // Botão "Marcar como feito" → executa
    el.querySelectorAll('[data-exec-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.title = 'Salvando...';
        await engine.marcarExecutada(btn.dataset.execId);
        btn.title = 'Concluído';
        btn.classList.add('is-done');
      });
    });
  }

  // Atualiza view quando engine notifica
  engine.onUpdate((list) => {
    updateKpis(list);
    renderList(list);
  });

  // Render inicial
  const list = engine.getNotificacoes();
  updateKpis(list);
  renderList(list);

  // Filtros
  document.getElementById('pnFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    document.querySelectorAll('.pn-filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderList(engine.getNotificacoes());
  });

  // Tabela master (histórico de eventos)
  if (isMaster) {
    await loadMasterHistory();
  }
}

initProtectedPage('Notificações', renderContent);

async function loadMasterHistory() {
  const tbody = document.getElementById('pnMasterBody');
  if (!tbody) return;

  const { data: notifs } = await supabase
    .from('painel_notificacoes')
    .select('id,tipo,titulo,prioridade,created_at,arquivada')
    .order('created_at', { ascending: false })
    .limit(300);

  if (!notifs?.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#475569;padding:20px">Nenhum evento registrado.</td></tr>';
    return;
  }

  const ids = notifs.map((n) => n.id);
  const { data: leituras } = await supabase
    .from('painel_notificacoes_usuarios')
    .select('notificacao_id,usuario_id,usuario_nome,lida_em,executada_em')
    .in('notificacao_id', ids);

  const leituraMap = {};
  for (const l of (leituras || [])) {
    if (!leituraMap[l.notificacao_id]) leituraMap[l.notificacao_id] = [];
    leituraMap[l.notificacao_id].push(l);
  }

  function esc(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
  function fmtDT(iso) { if (!iso) return '-'; return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

  tbody.innerHTML = notifs.map((n) => {
    const ls = leituraMap[n.id] || [];
    const primeiraLeitura = ls.filter((l) => l.lida_em).sort((a, b) => new Date(a.lida_em) - new Date(b.lida_em))[0];
    const primeiraExec = ls.filter((l) => l.executada_em).sort((a, b) => new Date(a.executada_em) - new Date(b.executada_em))[0];
    const usuarios = [...new Set(ls.map((l) => l.usuario_nome).filter(Boolean))].slice(0, 3).join(', ');
    return `<tr>
      <td><span style="font-size:11px;opacity:.7">${esc(n.tipo)}</span></td>
      <td>${esc(n.titulo)}${n.arquivada ? ' <span style="font-size:10px;color:#475569">(arquivada)</span>' : ''}</td>
      <td>${fmtDT(n.created_at)}</td>
      <td>${fmtDT(primeiraLeitura?.lida_em)}</td>
      <td>${fmtDT(primeiraExec?.executada_em)}</td>
      <td style="font-size:12px">${esc(usuarios || '-')}</td>
      <td>${esc(n.prioridade)}</td>
    </tr>`;
  }).join('');
}
