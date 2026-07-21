// Programação de O.S. — lista tabular + painel lateral por O.S.
// Mantém a tela legada da Etapa 2 montada (oculta) para preservar os fluxos
// existentes e usa os mesmos dados/tabelas do módulo de equipe e despesas.
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { logActivity } from './activityLogger.js';

const ROOT_ID = 'pgosRoot';
const STYLE_ID = 'pgosStyles';
const PAGE_SIZE = 18;
const BRI = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const OS_COLS = 'id,numero_os,cliente,servico,embarque,destino,ponto_embarque_id,ponto1_latitude,ponto1_longitude,supervisao,status_gestor,remanescente,observacao_logistica,data_os,configurada_em';

const state = {
  listEl: null,
  host: null,
  root: null,
  snapshot: null,
  osList: [],
  selectedId: null,
  query: '',
  page: 1,
  loading: false,
  currentUser: null,
  legacyObserver: null,
  refreshTimer: null,
  expensesToken: 0,
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function onlyPlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function todayIso() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function localDateFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function statusNorm(os) {
  return normalizeText(os?.status_gestor || '') || 'PENDENTE';
}

function isAtenderNaData(os) {
  const dataRef = state.snapshot?.dataReferencia || null;
  if (statusNorm(os) !== 'ATENDER') return false;
  return !dataRef || localDateFromIso(os.configurada_em) === dataRef;
}

function programacaoIdParaOs(os) {
  return state.snapshot?.programacaoIdParaOs?.(os) || null;
}

function itemDaOs(osId) {
  return (state.snapshot?.osComCandidatosAtual || []).find((item) => String(item.os?.id) === String(osId)) || null;
}

function splitLocation(value) {
  const raw = String(value || '-').trim();
  const match = raw.match(/^([^()]+?)(?:\s*\(([^)]*)\))?$/);
  return { primary: (match?.[1] || raw).trim(), secondary: (match?.[2] || '').trim() };
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID}{display:grid;grid-template-columns:minmax(520px,1fr) minmax(410px,.78fr);gap:14px;min-height:560px;align-items:start}
    .pgos-legacy-list{display:none!important}.pgos-hide-old{display:none!important}
    .pgos-list-pane,.pgos-drawer{border:1px solid rgba(111,208,165,.16);background:rgba(2,13,10,.48);border-radius:16px;overflow:hidden}.pgos-list-pane{min-width:0}
    .pgos-list-head{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.12)}
    .pgos-title{min-width:0}.pgos-title strong{display:block;color:#f8fafc;font-size:15px}.pgos-title small{display:block;color:#8ba79a;font-size:11px;margin-top:2px}
    .pgos-search{width:min(320px,46%);height:36px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:rgba(3,16,12,.78);color:#eef7f2;padding:0 12px;outline:none}.pgos-search:focus{border-color:rgba(111,208,165,.5);box-shadow:0 0 0 3px rgba(111,208,165,.08)}
    .pgos-table-wrap{overflow:auto;max-height:calc(100vh - 335px);min-height:420px}.pgos-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .pgos-table th{position:sticky;top:0;z-index:2;background:#0b1915;color:#8ba79a;font-size:10px;text-transform:uppercase;letter-spacing:.07em;text-align:left;padding:11px 13px;border-bottom:1px solid rgba(148,163,184,.14)}.pgos-table th:nth-child(1){width:96px}.pgos-table th:nth-child(2){width:27%}.pgos-table th:nth-child(4){width:130px;text-align:right}
    .pgos-row{cursor:pointer;transition:background .15s ease}.pgos-row td{padding:12px 13px;border-bottom:1px solid rgba(148,163,184,.09);color:#dbe9e2;font-size:12px;vertical-align:middle}.pgos-row:hover{background:rgba(111,208,165,.055)}.pgos-row.is-selected{background:rgba(37,99,235,.13);box-shadow:inset 3px 0 #60a5fa}
    .pgos-os-cell{display:flex;align-items:center;gap:9px}.pgos-dot{width:7px;height:7px;border-radius:99px;background:#64748b;flex:0 0 auto}.pgos-dot.atender{background:#22c55e}.pgos-dot.aguardar{background:#f59e0b}.pgos-dot.finalizar{background:#60a5fa}.pgos-os-number{font-size:17px;font-weight:950;color:#fff;letter-spacing:.01em}
    .pgos-client{font-weight:800;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pgos-local-main{color:#d8e5de;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pgos-local-sub{color:#769083;font-size:10.5px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pgos-rem{text-align:right;font-size:13px!important;font-weight:900;color:#fff!important;white-space:nowrap}
    .pgos-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;color:#82978d;font-size:11px}.pgos-pages{display:flex;align-items:center;gap:5px}.pgos-page-btn{height:30px;min-width:30px;border:1px solid rgba(148,163,184,.18);border-radius:8px;background:transparent;color:#cbd5e1;cursor:pointer}.pgos-page-btn:hover,.pgos-page-btn.on{border-color:rgba(111,208,165,.45);background:rgba(22,163,74,.14);color:#bbf7d0}.pgos-page-btn:disabled{opacity:.35;cursor:not-allowed}.pgos-empty{padding:42px 20px;text-align:center;color:#8ba79a}
    .pgos-drawer{position:sticky;top:8px;max-height:calc(100vh - 150px);display:flex;flex-direction:column}.pgos-drawer-empty{min-height:560px;display:flex;align-items:center;justify-content:center;padding:30px;text-align:center;color:#82978d}.pgos-drawer-scroll{overflow:auto;padding:15px;scrollbar-width:thin}.pgos-drawer-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:13px;border-bottom:1px solid rgba(148,163,184,.12)}
    .pgos-drawer-os{font-size:11px;color:#7f958a;text-transform:uppercase;letter-spacing:.08em}.pgos-drawer-os strong{font-size:23px;color:#fff;margin-left:5px;letter-spacing:0}.pgos-status-chip{display:inline-flex;margin-left:8px;padding:3px 8px;border-radius:999px;background:rgba(148,163,184,.12);color:#cbd5e1;font-size:9px;font-weight:900;vertical-align:middle}.pgos-status-chip.atender{background:rgba(22,163,74,.2);color:#bbf7d0}.pgos-status-chip.aguardar{background:rgba(245,158,11,.16);color:#fde68a}.pgos-close{width:31px;height:31px;border:0;border-radius:9px;background:transparent;color:#cbd5e1;font-size:21px;cursor:pointer}.pgos-close:hover{background:rgba(148,163,184,.1)}
    .pgos-os-meta{display:grid;grid-template-columns:1fr auto;gap:12px;padding:12px 0}.pgos-os-meta-main{font-size:12px;color:#dce9e2;line-height:1.7}.pgos-os-meta-main b{color:#fff}.pgos-os-rem small{display:block;color:#80958b;font-size:9px;text-transform:uppercase}.pgos-os-rem strong{display:block;color:#fff;font-size:20px;margin-top:3px;text-align:right}
    .pgos-section{border-top:1px solid rgba(148,163,184,.11);padding-top:13px;margin-top:2px}.pgos-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.pgos-section-head h5{margin:0;color:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.pgos-section-head small{color:#6fd0a5;font-size:10px}
    .pgos-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid rgba(148,163,184,.15);border-radius:12px;overflow:hidden}.pgos-action{min-height:65px;border:0;border-right:1px solid rgba(148,163,184,.1);background:rgba(15,23,42,.22);color:#cbd5e1;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-size:10px}.pgos-action:last-child{border-right:0}.pgos-action i{font-style:normal;font-size:18px}.pgos-action:hover{background:rgba(111,208,165,.08);color:#fff}.pgos-action.on{background:rgba(22,163,74,.15);color:#bbf7d0}.pgos-action.warn.on{background:rgba(245,158,11,.14);color:#fde68a}.pgos-action:disabled{opacity:.5;cursor:not-allowed}
    .pgos-locked{border:1px dashed rgba(148,163,184,.24);border-radius:13px;padding:28px 18px;text-align:center;color:#8ba79a;background:rgba(15,23,42,.15)}.pgos-locked b{display:block;color:#dbe9e2;margin-bottom:5px}.pgos-add-wrap{display:flex;justify-content:flex-end}.pgos-add-btn{border:0;background:transparent;color:#6fd0a5;font-size:11px;font-weight:850;cursor:pointer;padding:5px 0}.pgos-add-btn:hover{color:#bbf7d0}
    .pgos-add-box{display:grid;grid-template-columns:1fr auto;gap:7px;margin:7px 0 11px;padding:9px;border:1px solid rgba(96,165,250,.25);border-radius:11px;background:rgba(15,23,42,.38)}.pgos-add-box select{min-width:0;height:34px;border:1px solid rgba(148,163,184,.2);border-radius:8px;background:#081510;color:#eef7f2;padding:0 9px}.pgos-add-box button{height:34px;border:1px solid rgba(111,208,165,.35);border-radius:8px;background:rgba(22,163,74,.16);color:#bbf7d0;font-weight:850;cursor:pointer}
    .pgos-expenses{display:flex;flex-direction:column;gap:9px}.pgos-expenses .prog-section-title{display:none!important}.pgos-expenses .peqd-list{gap:9px}.pgos-expenses .peqd-card{display:flex;flex-direction:column;padding:10px 11px;border-radius:12px;background:rgba(8,19,15,.62);border-color:rgba(148,163,184,.13)}.pgos-expenses .peqd-head{order:0;margin-bottom:5px}.pgos-expenses .peqd-os-ref{display:none}.pgos-expenses .peqd-sec[data-sec="deslocamento"]{order:1}.pgos-expenses .peqd-sec[data-sec="estadia"]{order:2}.pgos-expenses .peqd-sec[data-sec="alimentacao"]{order:3}.pgos-expenses .peqd-sec[data-sec="extras"]{order:4}.pgos-expenses .peqd-sec{margin-top:7px;padding-top:7px}.pgos-expenses .peqd-row{gap:6px}.pgos-expenses .peqd-inp{min-height:31px;font-size:10.5px}.pgos-expenses .peqd-sec-label{font-size:9px}.pgos-expenses .peqd-extra-item{grid-template-columns:120px 1fr 80px 28px}.pgos-expenses .peqd-extra-obs{display:none}.pgos-expenses .peqd-nome{font-size:12px}.pgos-expenses .peqd-av{width:28px;height:28px}.pgos-expenses .peqd-head-tools{margin-left:auto;display:flex;align-items:center;gap:6px}.pgos-role-select{height:28px;border:1px solid rgba(148,163,184,.17);border-radius:8px;background:#0a1713;color:#cfe7da;font-size:9.5px;padding:0 7px}.pgos-role-badge{font-size:9px;padding:4px 7px;border-radius:999px;background:rgba(59,130,246,.13);color:#bfdbfe}.pgos-remove-colab{width:27px;height:27px;border:0;border-radius:7px;background:transparent;color:#fca5a5;cursor:pointer;font-size:15px}.pgos-remove-colab:hover{background:rgba(239,68,68,.13)}
    .pgos-justif{margin-top:11px;padding:10px;border:1px solid rgba(245,158,11,.3);border-radius:11px;background:rgba(245,158,11,.055)}.pgos-justif[hidden]{display:none}.pgos-justif label{display:block;color:#fde68a;font-size:10px;font-weight:900;text-transform:uppercase}.pgos-justif p{margin:4px 0 7px;color:#a99d80;font-size:9.5px}.pgos-justif textarea{width:100%;min-height:65px;resize:vertical;border:1px solid rgba(245,158,11,.22);border-radius:8px;background:#0a1511;color:#eef7f2;padding:8px;font:inherit;font-size:11px;box-sizing:border-box}.pgos-justif-foot{display:flex;justify-content:flex-end;color:#8f998f;font-size:9px;margin-top:3px}.pgos-save-row{display:flex;justify-content:flex-end;margin-top:12px}.pgos-save{height:38px;border:0;border-radius:9px;background:linear-gradient(135deg,#16a34a,#4ade80);color:#052e16;font-weight:950;padding:0 18px;cursor:pointer}.pgos-save:disabled{opacity:.55;cursor:not-allowed}
    .pgos-toast{position:fixed;right:24px;bottom:24px;z-index:10020;padding:10px 14px;border-radius:10px;background:#153c2b;color:#dcfce7;border:1px solid rgba(74,222,128,.35);box-shadow:0 14px 40px rgba(0,0,0,.35);font-size:12px}.pgos-modal-ov{position:fixed;inset:0;z-index:10010;background:rgba(2,6,23,.72);display:flex;align-items:center;justify-content:center;padding:16px}.pgos-modal{width:min(420px,100%);background:#0b1b15;border:1px solid rgba(111,208,165,.24);border-radius:15px;padding:16px}.pgos-modal h3{margin:0 0 6px;color:#fff;font-size:15px}.pgos-modal p{margin:0 0 10px;color:#91a59b;font-size:11px;line-height:1.5}.pgos-modal input,.pgos-modal textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.22);border-radius:9px;background:#07130f;color:#fff;padding:9px}.pgos-modal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:11px}.pgos-modal-actions button{height:34px;border:1px solid rgba(148,163,184,.2);border-radius:8px;background:transparent;color:#dbe9e2;padding:0 12px;cursor:pointer}.pgos-modal-actions .primary{background:rgba(22,163,74,.2);border-color:rgba(74,222,128,.35);color:#bbf7d0}
    @media(max-width:1180px){#${ROOT_ID}{grid-template-columns:1fr}.pgos-drawer{position:relative;top:auto;max-height:none}.pgos-table-wrap{max-height:500px}}
    @media(max-width:720px){.pgos-list-head{align-items:stretch;flex-direction:column}.pgos-search{width:100%}.pgos-table th:nth-child(2){width:32%}.pgos-table th:nth-child(4){width:105px}.pgos-row td{padding:10px 8px}.pgos-actions{grid-template-columns:repeat(3,1fr)}.pgos-action:nth-child(3){border-right:0}.pgos-action:nth-child(n+4){border-top:1px solid rgba(148,163,184,.1)}.pgos-add-box{grid-template-columns:1fr}.pgos-expenses .peqd-row{grid-template-columns:1fr!important}.pgos-os-meta{grid-template-columns:1fr}.pgos-os-rem strong{text-align:left}}
  `;
  document.head.appendChild(style);
}

function buildRoot() {
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `<section class="pgos-list-pane"><div class="pgos-list-head"><div class="pgos-title"><strong>Ordens de Serviço</strong><small>Selecione uma O.S. para consultar as ações e a programação.</small></div><input class="pgos-search" type="search" placeholder="Buscar por O.S., cliente ou local..." aria-label="Buscar ordens de serviço"></div><div class="pgos-table-wrap" data-pgos-table></div><div class="pgos-footer"><span data-pgos-count></span><div class="pgos-pages" data-pgos-pages></div></div></section><aside class="pgos-drawer" data-pgos-drawer><div class="pgos-drawer-empty">Clique em uma O.S. para abrir o painel lateral.</div></aside>`;
  return root;
}

function filteredOs() {
  const q = normalizeText(state.query);
  if (!q) return state.osList;
  return state.osList.filter((os) => normalizeText(`${os.numero_os} ${os.cliente} ${os.embarque} ${os.destino}`).includes(q));
}

function statusClass(os) {
  const st = statusNorm(os);
  if (st === 'ATENDER') return 'atender';
  if (st === 'AGUARDAR') return 'aguardar';
  if (st === 'FINALIZAR') return 'finalizar';
  return 'pendente';
}

function renderTable() {
  if (!state.root) return;
  const rows = filteredOs();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);
  const start = (state.page - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  const tableWrap = state.root.querySelector('[data-pgos-table]');
  tableWrap.innerHTML = visible.length ? `<table class="pgos-table"><thead><tr><th>OS</th><th>Cliente</th><th>Local</th><th>Rem.</th></tr></thead><tbody>${visible.map((os) => { const local = splitLocation(os.embarque); return `<tr class="pgos-row ${String(state.selectedId) === String(os.id) ? 'is-selected' : ''}" data-pgos-os="${esc(os.id)}"><td><div class="pgos-os-cell"><span class="pgos-dot ${statusClass(os)}"></span><span class="pgos-os-number">${esc(os.numero_os || '-')}</span></div></td><td><div class="pgos-client" title="${esc(os.cliente || '-')}">${esc(os.cliente || '-')}</div></td><td><div class="pgos-local-main" title="${esc(os.embarque || '-')}">${esc(local.primary)}</div>${local.secondary ? `<div class="pgos-local-sub">${esc(local.secondary)}</div>` : ''}</td><td class="pgos-rem">${os.remanescente != null ? BRI.format(Number(os.remanescente) || 0) : '-'}</td></tr>`; }).join('')}</tbody></table>` : '<div class="pgos-empty">Nenhuma O.S. encontrada para os filtros informados.</div>';
  state.root.querySelector('[data-pgos-count]').textContent = rows.length ? `Exibindo ${start + 1} a ${Math.min(start + PAGE_SIZE, rows.length)} de ${rows.length} O.S.` : '0 O.S.';
  const pageEl = state.root.querySelector('[data-pgos-pages]');
  const pageButtons = [];
  const candidates = [...new Set([1, state.page - 1, state.page, state.page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  let previous = 0;
  candidates.forEach((n) => { if (previous && n - previous > 1) pageButtons.push('<span>…</span>'); pageButtons.push(`<button class="pgos-page-btn ${n === state.page ? 'on' : ''}" data-pgos-page="${n}">${n}</button>`); previous = n; });
  pageEl.innerHTML = `<button class="pgos-page-btn" data-pgos-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>‹</button>${pageButtons.join('')}<button class="pgos-page-btn" data-pgos-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>›</button>`;
}

async function loadOs() {
  const snap = window.__peqbGetEquipeSnapshot?.();
  if (!snap?.supervisoesResolvidas?.length) return [];
  state.snapshot = snap;
  let query = supabase.from('operacional_os').select(OS_COLS);
  query = snap.supervisoesResolvidas.length > 1 ? query.in('supervisao', snap.supervisoesResolvidas) : query.eq('supervisao', snap.supervisoesResolvidas[0]);
  const { data, error } = await query.or('status_gestor.is.null,status_gestor.eq.PENDENTE,status_gestor.eq.AGUARDAR,status_gestor.eq.ATENDER').order('data_os', { ascending: false }).order('numero_os', { ascending: false }).limit(400);
  if (error) throw error;
  return data || [];
}

function currentOs() { return state.osList.find((os) => String(os.id) === String(state.selectedId)) || null; }

function renderDrawerShell(os) {
  const drawer = state.root.querySelector('[data-pgos-drawer]');
  if (!os) { drawer.innerHTML = '<div class="pgos-drawer-empty">Clique em uma O.S. para abrir o painel lateral.</div>'; return; }
  const local = splitLocation(os.embarque);
  const status = statusNorm(os);
  const unlocked = isAtenderNaData(os);
  drawer.innerHTML = `<div class="pgos-drawer-scroll"><div class="pgos-drawer-top"><div><div class="pgos-drawer-os">OS <strong>${esc(os.numero_os || '-')}</strong><span class="pgos-status-chip ${statusClass(os)}">${esc(status === 'AGUARDAR' ? 'Aguardando' : status === 'ATENDER' ? 'Em atendimento' : status === 'FINALIZAR' ? 'Finalizada' : 'Pendente')}</span></div></div><button class="pgos-close" data-pgos-close title="Fechar">×</button></div><div class="pgos-os-meta"><div class="pgos-os-meta-main"><b>${esc(os.cliente || '-')}</b><br>⌖ ${esc(local.primary)}${local.secondary ? `<br><span style="color:#80958b">${esc(local.secondary)}</span>` : ''}</div><div class="pgos-os-rem"><small>Remanescente</small><strong>${os.remanescente != null ? BRI.format(Number(os.remanescente) || 0) : '-'}</strong></div></div><div class="pgos-section"><div class="pgos-section-head"><h5>Ações</h5></div>${actionsHtml(os)}</div><div class="pgos-section" data-pgos-programacao><div class="pgos-section-head"><h5>Programação</h5><small>${unlocked ? 'Disponível' : 'Disponível após Atender a O.S.'}</small></div>${unlocked ? '<div data-pgos-program-body><div class="pgos-empty" style="padding:20px">Carregando colaboradores e despesas...</div></div>' : '<div class="pgos-locked"><b>Programação bloqueada</b>Clique em <strong style="color:#bbf7d0">Atender</strong> para liberar colaboradores, deslocamento, estadia, alimentação e extras.</div>'}</div></div>`;
  if (unlocked) renderProgramming(os);
}

function actionsHtml(os) {
  const st = statusNorm(os);
  const readOnly = !!state.snapshot?.readOnly;
  const dis = readOnly ? 'disabled' : '';
  const kgOn = String(os.observacao_logistica || '').startsWith('KG solicitado');
  const laudoOn = String(os.observacao_logistica || '').startsWith('LAUDO:');
  return `<div class="pgos-actions"><button class="pgos-action warn ${st === 'AGUARDAR' ? 'on' : ''}" data-pgos-status="AGUARDAR" ${dis}><i>Ⅱ</i><span>Pausar</span></button><button class="pgos-action ${isAtenderNaData(os) ? 'on' : ''}" data-pgos-status="ATENDER" ${dis}><i>✓</i><span>Atender</span></button><button class="pgos-action ${st === 'FINALIZAR' ? 'on' : ''}" data-pgos-status="FINALIZAR" ${dis}><i>＄</i><span>Finalizar</span></button><button class="pgos-action ${kgOn ? 'on' : ''}" data-pgos-kg ${dis}><i>＋</i><span>Saldo</span></button><button class="pgos-action ${laudoOn ? 'on' : ''}" data-pgos-laudo ${dis}><i>▣</i><span>Laudo</span></button></div>`;
}

function candidateOptions(item) {
  if (!item) return '<option value="">Aguarde a atualização da equipe...</option>';
  const currentIds = new Set((item.equipeRows || []).map((r) => String(r.colaborador_id)));
  const all = [...(item.candidatos || []), ...(item.colaboradoresRegional || [])];
  const seen = new Set();
  const options = all.filter((c) => { const id = String(c.colaboradorId || ''); if (!id || currentIds.has(id) || seen.has(id)) return false; seen.add(id); return true; }).map((c) => { const plate = item.placasPorCpf?.get(String(c.colaboradorId).replace(/\D/g, '')) || c.veiculoPlaca || ''; const recycled = item.escaladosPorColab?.get(String(c.colaboradorId)); const suffix = [plate ? `Frota ${onlyPlate(plate)}` : '', recycled ? `já na OS ${recycled}` : ''].filter(Boolean).join(' · '); return `<option value="${esc(c.colaboradorId)}">${esc(c.nome)}${suffix ? ` — ${esc(suffix)}` : ''}</option>`; });
  return options.length ? '<option value="">Selecione o colaborador...</option>' + options.join('') : '<option value="">Nenhum colaborador disponível</option>';
}

async function renderProgramming(os) {
  const token = ++state.expensesToken;
  const body = state.root.querySelector('[data-pgos-program-body]');
  if (!body) return;
  state.snapshot = window.__peqbGetEquipeSnapshot?.() || state.snapshot;
  const item = itemDaOs(os.id);
  if (!item) { body.innerHTML = '<div class="pgos-empty" style="padding:20px">Atualizando a equipe desta O.S....</div>'; setTimeout(() => refreshAll({ keepPanel: true }), 500); return; }
  body.innerHTML = `<div class="pgos-add-wrap"><button class="pgos-add-btn" data-pgos-toggle-add>＋ Adicionar colaborador</button></div><div class="pgos-add-box" data-pgos-add-box hidden><select data-pgos-add-select>${candidateOptions(item)}</select><button data-pgos-add-confirm>Adicionar</button></div><div class="pgos-expenses" data-pgos-expenses><div class="pgos-empty" style="padding:18px">Carregando conjunto de despesas...</div></div><div class="pgos-justif" data-pgos-justif hidden><label>Justificativa para mais de 1 colaborador *</label><p>Obrigatória quando dois ou mais colaboradores irão ao embarque. Não é exigida quando os demais estiverem marcados como Somente logística.</p><textarea maxlength="500" data-pgos-justif-text placeholder="Explique a necessidade de mais de um colaborador no embarque..."></textarea><div class="pgos-justif-foot"><span data-pgos-justif-count>0/500</span></div></div><div class="pgos-save-row"><button class="pgos-save" data-pgos-save>Salvar programação</button></div>`;
  const expensesHost = body.querySelector('[data-pgos-expenses]');
  try {
    const mod = await import('./programacao-despesas.js?v=20260721-osdrawer1');
    if (token !== state.expensesToken || !document.contains(expensesHost)) return;
    await mod.renderProgramacaoDespesas(expensesHost, { supervisao: os.supervisao || state.snapshot?.supervisoesResolvidas?.[0] || '', programacaoId: programacaoIdParaOs(os), dataReferencia: state.snapshot?.dataReferencia || null });
    if (token !== state.expensesToken || !document.contains(expensesHost)) return;
    decorateExpenseCards(os, item, expensesHost);
    await loadJustification(os, body);
    updateJustificationVisibility(os, body);
  } catch (error) { console.error('[pgos] despesas no painel:', error); expensesHost.innerHTML = `<div class="pgos-empty" style="padding:18px">${esc(error.message || 'Não foi possível carregar as despesas.')}</div>`; }
}

function teamRowById(item, id) { return (item?.equipeRows || []).find((r) => String(r.colaborador_id) === String(id)) || null; }
function isLogistica(item, colaboradorId) { return normalizeText(item?.dispPorColaborador?.get(String(colaboradorId))) === 'LOGISTICA'; }
function plateFor(item, colaboradorId) { return onlyPlate(item?.placasPorCpf?.get(String(colaboradorId).replace(/\D/g, '')) || ''); }

function decorateExpenseCards(os, item, host) {
  const teamIds = new Set((item.equipeRows || []).map((r) => String(r.colaborador_id)));
  [...host.querySelectorAll('.peqd-card')].forEach((card) => {
    const id = String(card.dataset.colabId || '');
    if (!teamIds.has(id)) { card.remove(); return; }
    const head = card.querySelector('.peqd-head');
    if (!head) return;
    const tools = document.createElement('div');
    tools.className = 'peqd-head-tools';
    const plate = plateFor(item, id);
    tools.innerHTML = plate ? `<select class="pgos-role-select" data-pgos-role="${esc(id)}" title="Função do colaborador nesta programação"><option value="OK" ${!isLogistica(item, id) ? 'selected' : ''}>Atendimento</option><option value="LOGISTICA" ${isLogistica(item, id) ? 'selected' : ''}>Somente logística</option></select><button class="pgos-remove-colab" data-pgos-remove-colab="${esc(id)}" title="Remover colaborador da O.S.">×</button>` : `<span class="pgos-role-badge">Atendimento</span><button class="pgos-remove-colab" data-pgos-remove-colab="${esc(id)}" title="Remover colaborador da O.S.">×</button>`;
    head.appendChild(tools);
  });
  if (!host.querySelector('.peqd-card')) host.innerHTML = '<div class="pgos-empty" style="padding:18px">Nenhum colaborador inserido nesta O.S.</div>';
}

function nonLogisticsCount(item) { return (item?.equipeRows || []).filter((r) => !isLogistica(item, r.colaborador_id)).length; }
function updateJustificationVisibility(os, body = state.root.querySelector('[data-pgos-program-body]')) { if (!body) return; const item = itemDaOs(os.id); const box = body.querySelector('[data-pgos-justif]'); if (box) box.hidden = nonLogisticsCount(item) <= 1; }

async function loadJustification(os, body) {
  const area = body.querySelector('[data-pgos-justif-text]');
  if (!area) return;
  const key = `pgos_justif_${programacaoIdParaOs(os)}_${os.id}`;
  try { const { data, error } = await supabase.from('programacao_os_justificativas').select('justificativa').eq('programacao_id', String(programacaoIdParaOs(os))).eq('os_id', String(os.id)).maybeSingle(); if (error) throw error; area.value = data?.justificativa || localStorage.getItem(key) || ''; } catch { area.value = localStorage.getItem(key) || ''; }
  const count = body.querySelector('[data-pgos-justif-count]'); if (count) count.textContent = `${area.value.length}/500`;
}

async function saveJustification(os, value) {
  const text = String(value || '').trim();
  const pid = String(programacaoIdParaOs(os) || '');
  const key = `pgos_justif_${pid}_${os.id}`;
  localStorage.setItem(key, text);
  try { const { error } = await supabase.from('programacao_os_justificativas').upsert({ programacao_id: pid, os_id: String(os.id), data_referencia: state.snapshot?.dataReferencia || null, justificativa: text, atualizado_por: state.currentUser?.id || null, updated_at: new Date().toISOString() }, { onConflict: 'programacao_id,os_id' }); if (error) throw error; } catch (error) { console.warn('[pgos] justificativa salva apenas no log/local até a migração estar disponível:', error); }
  await logActivity('action', 'justificativa_multiplos_colaboradores_os', 'programacao', { os_id: os.id, numero_os: os.numero_os, programacao_id: pid, motivo: text }).catch(() => {});
}

async function saveProgramming(os, button) {
  const body = state.root.querySelector('[data-pgos-program-body]');
  const item = itemDaOs(os.id);
  const area = body?.querySelector('[data-pgos-justif-text]');
  if (nonLogisticsCount(item) > 1 && !String(area?.value || '').trim()) { area?.focus(); area?.closest('.pgos-justif')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Informe a justificativa para mais de um colaborador no embarque.', true); return; }
  button.disabled = true;
  try { if (nonLogisticsCount(item) > 1) await saveJustification(os, area.value); toast('Programação salva. As despesas são gravadas automaticamente.'); } finally { button.disabled = false; }
}

function findCandidate(item, id) { return [...(item?.candidatos || []), ...(item?.colaboradoresRegional || [])].find((c) => String(c.colaboradorId) === String(id)) || null; }

async function addCollaborator(os, select, button) {
  const item = itemDaOs(os.id);
  const cand = findCandidate(item, select.value);
  if (!item || !cand) return;
  const pid = programacaoIdParaOs(os);
  if (!pid) { toast('Programação da O.S. não encontrada.', true); return; }
  const plate = plateFor(item, cand.colaboradorId) || onlyPlate(cand.veiculoPlaca || '');
  const newIsLogistica = !!plate || !!cand.veiculoId;
  const currentNonLog = nonLogisticsCount(item);
  const body = state.root.querySelector('[data-pgos-program-body]');
  const area = body?.querySelector('[data-pgos-justif-text]');
  if (!newIsLogistica && currentNonLog >= 1 && !String(area?.value || '').trim()) { const box = body?.querySelector('[data-pgos-justif]'); if (box) box.hidden = false; area?.focus(); toast('Justifique por que dois colaboradores irão ao embarque.', true); return; }
  button.disabled = true;
  try {
    const first = !(item.equipeRows || []).length;
    const payload = { programacao_id: pid, os_id: os.id, colaborador_id: String(cand.colaboradorId), nome_colaborador: cand.nome, score: Number(cand.score) || 0, score_contrato: Number(cand.scoreContrato) || 0, score_distancia: Number(cand.scoreDistancia) || 0, score_auditoria: Number(cand.scoreAuditoria) || 0, km_estimado: cand.km == null ? null : Number(cand.km), confirmado: true };
    const { error: teamError } = await supabase.from('programacao_equipe').upsert(payload, { onConflict: 'programacao_id,os_id,colaborador_id' }); if (teamError) throw teamError;
    if (first) await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id); else await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id).eq('colaborador_key', String(cand.colaboradorId));
    const { error: linkError } = await supabase.from('operacional_os_colaboradores').insert({ os_id: os.id, colaborador_key: String(cand.colaboradorId), colaborador_nome: cand.nome, colaborador_cpf: /^\d+$/.test(String(cand.colaboradorId)) ? String(cand.colaboradorId) : null, distancia_km: cand.km == null ? null : Number(cand.km), origem_sugestao: first ? 'PROGRAMACAO_PAINEL_LATERAL' : 'PROGRAMACAO_PAINEL_LATERAL_ADICIONAL' }); if (linkError) console.warn('[pgos] vínculo operacional:', linkError);
    const { error: rosterError } = await supabase.from('programacao_colaboradores').upsert({ programacao_id: pid, colaborador_id: String(cand.colaboradorId), nome_colaborador: cand.nome, cargo: cand.cargo || null, coordenacao: cand.coordenacao || null, supervisao: cand.supervisao || os.supervisao || null, disponibilidade: newIsLogistica ? 'LOGISTICA' : 'OK' }, { onConflict: 'programacao_id,colaborador_id' }); if (rosterError) throw rosterError;
    await Promise.all([
      supabase.from('programacao_estadia').upsert({ programacao_id: pid, data_referencia: state.snapshot?.dataReferencia || null, colaborador_id: String(cand.colaboradorId), nome_colaborador: cand.nome, tipo_estadia: 'CASA', tem_estadia: false, checkin: state.snapshot?.dataReferencia || todayIso(), checkout: state.snapshot?.dataReferencia || todayIso() }, { onConflict: 'programacao_id,colaborador_id' }),
      supabase.from('programacao_alimentacao').upsert({ programacao_id: pid, data_referencia: state.snapshot?.dataReferencia || null, colaborador_id: String(cand.colaboradorId), nome_colaborador: cand.nome, cafe: false, almoco: true, janta: false }, { onConflict: 'programacao_id,colaborador_id' }),
      supabase.from('programacao_deslocamento').upsert({ programacao_id: pid, data_referencia: state.snapshot?.dataReferencia || null, colaborador_id: String(cand.colaboradorId), nome_colaborador: cand.nome, tipo_deslocamento: newIsLogistica ? 'MOTORISTA FROTA' : 'NÃO PRECISA', placa_veiculo: plate }, { onConflict: 'programacao_id,colaborador_id' }),
    ]);
    if (!newIsLogistica && currentNonLog >= 1) await saveJustification(os, area.value);
    await refreshLegacyAndPanel();
    toast(`${cand.nome} adicionado à O.S. ${os.numero_os}.`);
  } catch (error) { console.error('[pgos] adicionar colaborador:', error); toast(error.message || 'Não foi possível adicionar o colaborador.', true); } finally { button.disabled = false; }
}

async function removeCollaborator(os, colaboradorId, button) {
  const item = itemDaOs(os.id);
  const row = teamRowById(item, colaboradorId);
  if (!confirm(`Remover ${row?.nome_colaborador || 'este colaborador'} da O.S. ${os.numero_os}?`)) return;
  button.disabled = true;
  try { const { error } = await supabase.from('programacao_equipe').delete().eq('programacao_id', programacaoIdParaOs(os)).eq('os_id', os.id).eq('colaborador_id', colaboradorId); if (error) throw error; await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id).eq('colaborador_key', colaboradorId); await refreshLegacyAndPanel(); toast('Colaborador removido da O.S.'); } catch (error) { console.error('[pgos] remover colaborador:', error); toast(error.message || 'Não foi possível remover o colaborador.', true); button.disabled = false; }
}

async function updateRole(os, colaboradorId, value, select) {
  const item = itemDaOs(os.id);
  const plate = plateFor(item, colaboradorId);
  select.disabled = true;
  try {
    const { error } = await supabase.from('programacao_colaboradores').update({ disponibilidade: value }).eq('programacao_id', programacaoIdParaOs(os)).eq('colaborador_id', colaboradorId); if (error) throw error;
    item?.dispPorColaborador?.set(String(colaboradorId), value);
    if (value === 'LOGISTICA' && plate) {
      const rows = item?.equipeRows || [];
      await supabase.from('programacao_deslocamento').upsert({ programacao_id: programacaoIdParaOs(os), data_referencia: state.snapshot?.dataReferencia || null, colaborador_id: colaboradorId, nome_colaborador: teamRowById(item, colaboradorId)?.nome_colaborador || '', tipo_deslocamento: 'MOTORISTA FROTA', placa_veiculo: plate }, { onConflict: 'programacao_id,colaborador_id' });
      const caronas = rows.filter((r) => String(r.colaborador_id) !== String(colaboradorId) && !plateFor(item, r.colaborador_id));
      if (caronas.length) await supabase.from('programacao_deslocamento').upsert(caronas.map((r) => ({ programacao_id: programacaoIdParaOs(os), data_referencia: state.snapshot?.dataReferencia || null, colaborador_id: String(r.colaborador_id), nome_colaborador: r.nome_colaborador || '', tipo_deslocamento: 'CARONA FROTA', placa_veiculo: plate })), { onConflict: 'programacao_id,colaborador_id' });
    }
    updateJustificationVisibility(os); toast(value === 'LOGISTICA' ? 'Colaborador marcado como Somente logística.' : 'Colaborador marcado para Atendimento.');
  } catch (error) { console.error('[pgos] função colaborador:', error); toast(error.message || 'Não foi possível alterar a função.', true); } finally { select.disabled = false; }
}

async function updateStatus(os, nextStatus, button) {
  button.disabled = true;
  try {
    if (!state.currentUser) state.currentUser = await getCurrentUser().catch(() => null);
    const now = new Date().toISOString();
    const kgActive = String(os.observacao_logistica || '').startsWith('KG solicitado');
    const patch = { status_gestor: nextStatus, configurada_em: now, updated_at: now };
    if (!kgActive) patch.observacao_logistica = null;
    if (nextStatus === 'FINALIZAR') { patch.status_logistica = 'PENDENTE'; patch.enviado_logistica_em = now; patch.logistica_solicitado_por = state.currentUser?.id || null; } else { patch.status_logistica = null; patch.enviado_logistica_em = null; patch.logistica_solicitado_por = null; }
    const { error } = await supabase.from('operacional_os').update(patch).eq('id', os.id); if (error) throw error;
    await refreshLegacyAndPanel();
  } catch (error) { console.error('[pgos] status:', error); toast(error.message || 'Não foi possível atualizar a O.S.', true); button.disabled = false; }
}

function modal(html) { const ov = document.createElement('div'); ov.className = 'pgos-modal-ov'; ov.innerHTML = `<div class="pgos-modal">${html}</div>`; document.body.appendChild(ov); const close = () => ov.remove(); ov.addEventListener('click', (e) => { if (e.target === ov) close(); }); return { ov, close }; }

function openKg(os) {
  const { ov, close } = modal(`<h3>Aumentar saldo da O.S.</h3><p>Informe a quantidade em KG para a O.S. <b>${esc(os.numero_os)}</b>.</p><input type="number" min="1" data-pgos-kg-input placeholder="Quantidade em KG"><div class="pgos-modal-actions"><button data-cancel>Cancelar</button><button class="primary" data-ok>Confirmar</button></div>`);
  const input = ov.querySelector('[data-pgos-kg-input]'); input.focus(); ov.querySelector('[data-cancel]').onclick = close;
  ov.querySelector('[data-ok]').onclick = async () => { const kg = Number(input.value); if (!kg || kg <= 0) { input.focus(); return; } const { error } = await supabase.from('operacional_os').update({ observacao_logistica: `KG solicitado pelo gestor: ${BRI.format(kg)} kg`, status_gestor: 'AGUARDAR', configurada_em: null, updated_at: new Date().toISOString() }).eq('id', os.id); if (error) { toast(error.message || 'Não foi possível solicitar saldo.', true); return; } close(); await refreshLegacyAndPanel(); };
}

function openLaudo(os) {
  const { ov, close } = modal(`<h3>Conferir / anexar laudo</h3><p>Selecione um ou mais arquivos para a O.S. <b>${esc(os.numero_os)}</b>.</p><input type="file" multiple data-pgos-files><div class="pgos-modal-actions"><button data-cancel>Cancelar</button><button class="primary" data-ok>Enviar</button></div>`);
  const input = ov.querySelector('[data-pgos-files]'); ov.querySelector('[data-cancel]').onclick = close;
  ov.querySelector('[data-ok]').onclick = async (e) => { const files = [...(input.files || [])]; if (!files.length) { input.focus(); return; } e.currentTarget.disabled = true; try { const urls = []; for (const file of files) { const path = `${os.id}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`; const { data: uploaded, error } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true }); if (error) throw error; urls.push(supabase.storage.from('os-laudos').getPublicUrl(uploaded.path).data.publicUrl); } const { error } = await supabase.from('operacional_os').update({ observacao_logistica: `LAUDO:${urls.join(',')}`, updated_at: new Date().toISOString() }).eq('id', os.id); if (error) throw error; close(); await refreshLegacyAndPanel(); } catch (error) { toast(error.message || 'Não foi possível anexar o laudo.', true); e.currentTarget.disabled = false; } };
}

function toast(message, error = false) { document.querySelector('.pgos-toast')?.remove(); const el = document.createElement('div'); el.className = 'pgos-toast'; if (error) { el.style.background = '#4b1f24'; el.style.color = '#fecaca'; el.style.borderColor = 'rgba(248,113,113,.4)'; } el.textContent = message; document.body.appendChild(el); setTimeout(() => el.remove(), 3200); }
async function refreshLegacyAndPanel() { await Promise.resolve(window.__peqbSilentRefresh?.()); await new Promise((resolve) => setTimeout(resolve, 350)); await refreshAll({ keepPanel: true }); }

async function refreshAll({ keepPanel = true } = {}) {
  if (state.loading || !state.root) return;
  state.loading = true;
  try { state.snapshot = window.__peqbGetEquipeSnapshot?.() || state.snapshot; state.osList = await loadOs(); if (!keepPanel) state.selectedId = null; if (state.selectedId && !state.osList.some((os) => String(os.id) === String(state.selectedId))) state.selectedId = null; renderTable(); renderDrawerShell(currentOs()); } catch (error) { console.error('[pgos] carregar O.S.:', error); toast(error.message || 'Não foi possível carregar as O.S.', true); } finally { state.loading = false; }
}

function bindRootEvents() {
  state.root.addEventListener('input', (event) => { if (event.target.matches('.pgos-search')) { state.query = event.target.value; state.page = 1; renderTable(); return; } if (event.target.matches('[data-pgos-justif-text]')) { const count = state.root.querySelector('[data-pgos-justif-count]'); if (count) count.textContent = `${event.target.value.length}/500`; } });
  state.root.addEventListener('change', async (event) => { const role = event.target.closest('[data-pgos-role]'); if (role) { const os = currentOs(); if (os) await updateRole(os, role.dataset.pgosRole, role.value, role); } });
  state.root.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-pgos-os]'); if (row) { state.selectedId = row.dataset.pgosOs; renderTable(); renderDrawerShell(currentOs()); return; }
    const page = event.target.closest('[data-pgos-page]'); if (page && !page.disabled) { state.page = Number(page.dataset.pgosPage) || 1; renderTable(); return; }
    if (event.target.closest('[data-pgos-close]')) { state.selectedId = null; renderTable(); renderDrawerShell(null); return; }
    const os = currentOs(); if (!os) return;
    const status = event.target.closest('[data-pgos-status]'); if (status) { await updateStatus(os, status.dataset.pgosStatus, status); return; }
    if (event.target.closest('[data-pgos-kg]')) { openKg(os); return; }
    if (event.target.closest('[data-pgos-laudo]')) { openLaudo(os); return; }
    const toggleAdd = event.target.closest('[data-pgos-toggle-add]'); if (toggleAdd) { const box = state.root.querySelector('[data-pgos-add-box]'); if (box) box.hidden = !box.hidden; return; }
    const add = event.target.closest('[data-pgos-add-confirm]'); if (add) { const select = state.root.querySelector('[data-pgos-add-select]'); await addCollaborator(os, select, add); return; }
    const remove = event.target.closest('[data-pgos-remove-colab]'); if (remove) { await removeCollaborator(os, remove.dataset.pgosRemoveColab, remove); return; }
    const save = event.target.closest('[data-pgos-save]'); if (save) await saveProgramming(os, save);
  });
}

function mount(listEl) {
  if (!listEl || listEl.dataset.pgosMounted === '1') return;
  injectStyles(); listEl.dataset.pgosMounted = '1'; state.listEl = listEl; state.host = listEl.parentElement; listEl.classList.add('pgos-legacy-list');
  state.host?.querySelector('.prog-section-title')?.classList.add('pgos-hide-old'); state.host?.querySelector('.peqb-kpis-window')?.classList.add('pgos-hide-old');
  state.root = buildRoot(); listEl.before(state.root); bindRootEvents(); state.legacyObserver?.disconnect();
  state.legacyObserver = new MutationObserver(() => { clearTimeout(state.refreshTimer); state.refreshTimer = setTimeout(() => refreshAll({ keepPanel: true }), 250); });
  state.legacyObserver.observe(listEl, { childList: true, subtree: true }); refreshAll({ keepPanel: false });
}

const observer = new MutationObserver(() => { const listEl = document.querySelector('#peqbOsList'); if (listEl && listEl.dataset.pgosMounted !== '1') mount(listEl); if (!listEl && state.root && !document.contains(state.root)) { state.legacyObserver?.disconnect(); state.root = null; state.listEl = null; state.host = null; state.selectedId = null; } });
observer.observe(document.body, { childList: true, subtree: true });
const existing = document.querySelector('#peqbOsList'); if (existing) mount(existing);
