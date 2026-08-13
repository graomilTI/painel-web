import { supabase } from './supabaseClient.js';

// Corrige a fonte da aba "Despesas da programação".
// A Conferência deve considerar somente colaboradores confirmados em uma O.S.
// da programação. Registros de disponibilidade criados para toda a regional
// não podem, sozinhos, gerar uma linha de despesa nem o almoço padrão.
const FILTERED_TABLES = new Set([
  'programacao_colaboradores',
  'programacao_estadia',
  'programacao_alimentacao',
  'programacao_deslocamento',
  'programacao_extras',
  'programacao_conferencia_status',
]);

const originalFrom = supabase.from.bind(supabase);
const rosterCache = new Map();
const CACHE_MS = 5000;

function clean(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function rosterKey(programacaoId, colaboradorId) {
  return `${clean(programacaoId)}::${clean(colaboradorId)}`;
}

async function loadConfirmedRoster(programacaoIds) {
  const ids = unique(programacaoIds).sort();
  if (!ids.length) return [];

  const cacheKey = ids.join(',');
  const cached = rosterCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;

  const { data, error } = await originalFrom('programacao_equipe')
    .select('programacao_id,colaborador_id,nome_colaborador,confirmado,os_id')
    .in('programacao_id', ids)
    .eq('confirmado', true)
    .not('os_id', 'is', null)
    .limit(10000);

  if (error) {
    console.error('[conferencia-roster-fix] Falha ao validar equipe confirmada:', error);
    return [];
  }

  const dedup = new Map();
  for (const row of data || []) {
    const key = rosterKey(row.programacao_id, row.colaborador_id);
    if (!row.programacao_id || !row.colaborador_id || dedup.has(key)) continue;
    dedup.set(key, row);
  }

  const rows = [...dedup.values()];
  rosterCache.set(cacheKey, { at: Date.now(), rows });
  return rows;
}

async function filterConferenceResult(table, result, programacaoIds) {
  if (!result || result.error || !Array.isArray(result.data)) return result;

  const roster = await loadConfirmedRoster(programacaoIds);
  const allowed = new Map(
    roster.map((row) => [rosterKey(row.programacao_id, row.colaborador_id), row]),
  );

  const filtered = result.data.filter((row) =>
    allowed.has(rosterKey(row.programacao_id, row.colaborador_id)),
  );

  if (table === 'programacao_colaboradores') {
    const present = new Set(
      filtered.map((row) => rosterKey(row.programacao_id, row.colaborador_id)),
    );

    for (const member of roster) {
      const key = rosterKey(member.programacao_id, member.colaborador_id);
      if (present.has(key)) continue;
      filtered.push({
        programacao_id: member.programacao_id,
        colaborador_id: member.colaborador_id,
        nome_colaborador: member.nome_colaborador || null,
        disponibilidade: 'OK',
        __synthetic_confirmed_roster: true,
      });
    }
  }

  return { ...result, data: filtered };
}

function wrapBuilder(builder, table, context) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onFulfilled, onRejected) => Promise.resolve(target)
          .then((result) => filterConferenceResult(table, result, context.programacaoIds))
          .then(onFulfilled, onRejected);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return (...args) => {
        if (prop === 'in' && args[0] === 'programacao_id') {
          context.programacaoIds = unique(args[1]);
        }

        const next = value.apply(target, args);
        if (next && typeof next === 'object') return wrapBuilder(next, table, context);
        return next;
      };
    },
  });
}

supabase.from = function patchedFrom(table) {
  const builder = originalFrom(table);
  if (!FILTERED_TABLES.has(table)) return builder;
  return wrapBuilder(builder, table, { programacaoIds: [] });
};

const UI_STYLE_ID = 'admConferenciaCleanLayout';
const SEARCH_DEBOUNCE_MS = 350;
let searchTimer = null;
let uiObserver = null;
let enhancing = false;

function injectCleanLayoutStyles() {
  if (document.getElementById(UI_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = UI_STYLE_ID;
  style.textContent = `
    #pageContent{max-width:none!important;padding:20px 24px 28px!important}
    .conf-hero{background:rgba(5,24,18,.78)!important;border-color:rgba(74,222,128,.13)!important;border-radius:16px!important;padding:0 16px!important;min-height:58px!important;box-shadow:none!important}
    .conf-hero-compact{display:flex!important;align-items:center!important;gap:18px!important}
    .conf-tabs{gap:2px!important;overflow-x:auto!important;flex-wrap:nowrap!important}
    .conf-tab{border:0!important;border-radius:0!important;background:transparent!important;padding:18px 16px 15px!important;color:#a9b8b1!important;font-size:13px!important;white-space:nowrap!important;border-bottom:2px solid transparent!important}
    .conf-tab:hover{color:#d9fbe8!important;background:rgba(34,197,94,.035)!important}
    .conf-tab.active{color:#35e990!important;background:transparent!important;border-bottom-color:#22e58a!important}
    .conf-actions{margin-left:auto!important;gap:8px!important;flex-wrap:nowrap!important}
    .conf-actions #conf-lancar-despesa{display:none!important}
    .conf-actions .conf-btn{padding:8px 11px!important;border-radius:10px!important;font-size:12px!important;background:rgba(8,28,21,.9)!important}
    .conf-header-band{margin-top:14px!important;background:rgba(5,24,18,.72)!important;border-color:rgba(74,222,128,.12)!important;border-radius:16px!important;padding:18px 20px!important;box-shadow:none!important}
    .conf-filters{display:grid!important;grid-template-columns:150px 150px minmax(210px,1fr) minmax(260px,1.4fr) 160px!important;gap:14px!important;align-items:end!important}
    .conf-field,.conf-field-sm,.conf-field-md{min-width:0!important;flex:auto!important}
    .conf-field label{font-size:10px!important;color:#a8b9b0!important;margin-bottom:7px!important;letter-spacing:.08em!important}
    .conf-field input,.conf-field select{height:42px!important;border-radius:10px!important;background:#071b15!important;border-color:rgba(110,231,183,.15)!important;padding:0 12px!important}
    .conf-field input:focus,.conf-field select:focus{border-color:rgba(52,211,153,.55)!important;box-shadow:0 0 0 3px rgba(16,185,129,.08)!important;outline:none!important}
    .conf-filter-actions{display:none!important}
    #conf-feedback{margin:10px 0 0!important;font-size:12px!important;min-height:0!important}
    #conf-feedback:empty{display:none!important}
    #conf-metrics{display:none!important}
    .conf-panel{margin-top:14px!important;padding:0!important;border-radius:16px!important;background:rgba(4,21,16,.76)!important;border-color:rgba(74,222,128,.12)!important;overflow:hidden!important;box-shadow:none!important}
    .conf-table-subtitle-compact{display:none!important}
    .conf-subsection-head{display:none!important}
    .conf-conferidos-box{display:none!important}
    .conf-table-wrap{border:0!important;border-radius:0!important;background:transparent!important;overflow:auto!important}
    .conf-table{min-width:1180px!important}
    .conf-table th{position:sticky!important;top:0!important;z-index:2!important;background:#061d16!important;color:#66dca3!important;font-size:10px!important;padding:14px 14px!important;border-bottom:1px solid rgba(110,231,183,.13)!important}
    .conf-table td{padding:14px!important;vertical-align:middle!important;border-bottom:1px solid rgba(148,163,184,.075)!important;font-size:13px!important}
    .conf-table tbody tr{transition:background .16s ease!important}
    .conf-table tbody tr:hover{background:rgba(34,197,94,.035)!important}
    .conf-table td:first-child strong{font-size:13.5px!important;color:#f1faf6!important}
    .conf-table small{font-size:11px!important;margin-top:3px!important;color:#7f9b8e!important}
    .conf-td-regional{font-size:13px!important;color:#eef8f3!important;white-space:normal!important;min-width:160px!important}
    .conf-td-regional .regional-coordenacao{display:block!important;font-size:13px!important;font-weight:800!important;color:#f2faf6!important;text-transform:uppercase!important}
    .conf-td-regional .regional-sufixo{display:block!important;margin-top:4px!important;font-size:11px!important;color:#8da69a!important;text-transform:none!important}
    .conf-chip{padding:6px 9px!important;font-size:11px!important;border-radius:999px!important;min-width:42px!important;justify-content:center!important}
    .conf-chip-neutral{background:rgba(148,163,184,.08)!important;color:#afbeb7!important;border-color:rgba(148,163,184,.10)!important}
    .conf-chip-ok{background:rgba(16,185,129,.13)!important;color:#72efb1!important;border-color:rgba(16,185,129,.18)!important}
    .conf-chip-warn{background:rgba(234,179,8,.10)!important;color:#f4d35e!important;border-color:rgba(234,179,8,.28)!important}
    .conf-row-actions{gap:8px!important;justify-content:flex-end!important}
    .conf-row-actions button{width:36px!important;height:36px!important;padding:0!important;border-radius:9px!important;font-size:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
    .conf-row-actions button svg{width:16px!important;height:16px!important}
    .conf-row-actions button[data-action="CONFERIDO"]{background:rgba(16,185,129,.16)!important;border-color:rgba(52,211,153,.23)!important;color:#68f0ac!important}
    .conf-row-actions button[data-action="PENDENCIA"]{background:rgba(239,68,68,.09)!important;border-color:rgba(248,113,113,.17)!important;color:#ff7272!important}
    .conf-row-actions button[data-action="EM_ANALISE"]{display:none!important}
    .conf-producao-sem{color:#ff6b6b!important}
    .conf-row-grm-applied{box-shadow:inset 3px 0 0 rgba(52,211,153,.72)!important}
    .conf-row-grm-clean{box-shadow:inset 3px 0 0 rgba(45,212,191,.65)!important}
    .conf-row-grm-noop{box-shadow:inset 3px 0 0 rgba(96,165,250,.55)!important}
    .conf-row-grm-error{box-shadow:inset 3px 0 0 rgba(248,113,113,.72)!important}
    .conf-row-grm-pending{box-shadow:inset 3px 0 0 rgba(250,204,21,.58)!important}
    .conf-grm-status{display:inline-flex!important;align-items:center!important;width:max-content!important;margin-top:7px!important;padding:3px 7px!important;border:1px solid transparent!important;border-radius:999px!important;font-size:9.5px!important;font-weight:800!important;letter-spacing:.025em!important;line-height:1.2!important;cursor:help!important}
    .conf-grm-status-applied{background:rgba(16,185,129,.13)!important;border-color:rgba(52,211,153,.2)!important;color:#72efb1!important}
    .conf-grm-status-clean{background:rgba(20,184,166,.12)!important;border-color:rgba(45,212,191,.2)!important;color:#6ee7d6!important}
    .conf-grm-status-noop{background:rgba(59,130,246,.11)!important;border-color:rgba(96,165,250,.2)!important;color:#93c5fd!important}
    .conf-grm-status-error{background:rgba(239,68,68,.11)!important;border-color:rgba(248,113,113,.2)!important;color:#ff8585!important}
    .conf-grm-status-pending{background:rgba(234,179,8,.1)!important;border-color:rgba(250,204,21,.2)!important;color:#f5d761!important}
    .conf-grm-status-neutral{background:rgba(148,163,184,.08)!important;border-color:rgba(148,163,184,.12)!important;color:#9fb0a7!important}
    .conf-grm-overview{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;margin:0 0 14px!important;padding:12px 14px!important;border:1px solid rgba(110,231,183,.12)!important;border-radius:14px!important;background:rgba(4,28,20,.72)!important}
    .conf-grm-overview-title{display:flex!important;flex-direction:column!important;gap:2px!important;min-width:max-content!important}
    .conf-grm-overview-title strong{color:#edf9f3!important;font-size:12px!important}
    .conf-grm-overview-title span{color:#789487!important;font-size:10px!important}
    .conf-grm-overview-items{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:7px!important;flex-wrap:wrap!important}
    .conf-grm-overview-item{display:inline-flex!important;align-items:center!important;gap:6px!important;padding:5px 8px!important;border:1px solid rgba(148,163,184,.1)!important;border-radius:999px!important;background:rgba(15,23,42,.28)!important;color:#afbeb7!important;font-size:10px!important;font-weight:700!important;white-space:nowrap!important;font-family:inherit!important;cursor:pointer!important;transition:transform .12s ease,background .12s ease!important}
    .conf-grm-overview-item:hover{background:rgba(15,23,42,.5)!important;transform:translateY(-1px)!important}
    .conf-grm-overview-item.active{background:rgba(255,255,255,.13)!important;box-shadow:0 0 0 1px currentColor inset!important}
    .conf-grm-overview-clear{display:inline-flex!important;align-items:center!important;gap:4px!important;padding:5px 9px!important;border:1px solid rgba(248,113,113,.22)!important;border-radius:999px!important;background:rgba(239,68,68,.08)!important;color:#ff9d9d!important;font-size:10px!important;font-weight:700!important;font-family:inherit!important;cursor:pointer!important;white-space:nowrap!important}
    .conf-grm-overview-clear:hover{background:rgba(239,68,68,.16)!important}
    .conf-grm-overview-item i{width:7px!important;height:7px!important;border-radius:50%!important;background:#94a3b8!important;box-shadow:0 0 8px rgba(148,163,184,.35)!important}
    .conf-grm-overview-item strong{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:18px!important;height:18px!important;padding:0 5px!important;border-radius:999px!important;background:rgba(255,255,255,.06)!important;color:inherit!important;font-size:10px!important}
    .conf-grm-overview-noop{color:#93c5fd!important;border-color:rgba(96,165,250,.18)!important}.conf-grm-overview-noop i{background:#60a5fa!important;box-shadow:0 0 9px rgba(96,165,250,.52)!important}
    .conf-grm-overview-applied{color:#72efb1!important;border-color:rgba(52,211,153,.18)!important}.conf-grm-overview-applied i{background:#34d399!important;box-shadow:0 0 9px rgba(52,211,153,.52)!important}
    .conf-grm-overview-clean{color:#6ee7d6!important;border-color:rgba(45,212,191,.18)!important}.conf-grm-overview-clean i{background:#2dd4bf!important;box-shadow:0 0 9px rgba(45,212,191,.52)!important}
    .conf-grm-overview-pending{color:#f5d761!important;border-color:rgba(250,204,21,.18)!important}.conf-grm-overview-pending i{background:#facc15!important;box-shadow:0 0 9px rgba(250,204,21,.48)!important}
    .conf-grm-overview-error{color:#ff8585!important;border-color:rgba(248,113,113,.18)!important}.conf-grm-overview-error i{background:#f87171!important;box-shadow:0 0 9px rgba(248,113,113,.5)!important}
    .conf-table td:nth-last-child(2){font-weight:700!important}
    @media(max-width:1180px){
      .conf-filters{grid-template-columns:repeat(2,minmax(180px,1fr))!important}
      .conf-field:last-of-type{grid-column:auto!important}
    }
    @media(max-width:720px){
      #pageContent{padding:14px!important}
      .conf-hero-compact{align-items:flex-start!important;padding:0 10px!important}
      .conf-actions{padding-top:10px!important}
      .conf-filters{grid-template-columns:1fr!important}
      .conf-grm-overview{align-items:flex-start!important;flex-direction:column!important}
      .conf-grm-overview-items{justify-content:flex-start!important}
    }
  `;
  document.head.appendChild(style);
}

function parseRegional(supervisao, coordenacao) {
  const sup = clean(supervisao);
  const coord = clean(coordenacao);
  const primary = coord || sup || '-';
  if (!sup) return { primary, suffix: '' };
  if (!coord) return { primary: sup, suffix: '' };

  const supUpper = sup.toLocaleUpperCase('pt-BR');
  const coordUpper = coord.toLocaleUpperCase('pt-BR');
  if (supUpper.startsWith(coordUpper)) {
    const suffix = sup.slice(coord.length).replace(/^\s*[-–—|/]\s*/, '').trim();
    return { primary: coord, suffix };
  }
  return { primary: coord, suffix: sup };
}

function formatRegionalCells(root = document) {
  root.querySelectorAll('.conf-td-regional:not([data-clean-regional])').forEach((cell) => {
    const small = cell.querySelector('small');
    const coordenacao = clean(small?.textContent);
    const clone = cell.cloneNode(true);
    clone.querySelector('small')?.remove();
    const supervisao = clean(clone.textContent);
    const { primary, suffix } = parseRegional(supervisao, coordenacao);
    cell.dataset.cleanRegional = 'true';
    cell.innerHTML = `<span class="regional-coordenacao"></span><span class="regional-sufixo"></span>`;
    cell.querySelector('.regional-coordenacao').textContent = primary;
    const suffixEl = cell.querySelector('.regional-sufixo');
    suffixEl.textContent = suffix;
    suffixEl.hidden = !suffix;
  });
}

function mergeConferidosIntoSingleTable() {
  const target = document.getElementById('conf-table');
  if (!target) return;
  const mainBody = target.querySelector(':scope > .conf-table-wrap .conf-table tbody');
  const confirmedBody = target.querySelector('.conf-conferidos-box .conf-table tbody');
  if (!mainBody || !confirmedBody) return;

  const confirmedRows = [...confirmedBody.querySelectorAll('tr')]
    .filter((row) => !row.querySelector('.conf-empty'));
  if (!confirmedRows.length) return;

  const emptyRow = mainBody.querySelector('.conf-empty')?.closest('tr');
  emptyRow?.remove();
  confirmedRows.forEach((row) => mainBody.appendChild(row));
}

function simplifyActions(root = document) {
  root.querySelectorAll('.conf-row-actions').forEach((actions) => {
    actions.querySelectorAll('button[data-action="EM_ANALISE"]').forEach((button) => button.remove());
    const approve = actions.querySelector('button[data-action="CONFERIDO"]');
    const reject = actions.querySelector('button[data-action="PENDENCIA"]');
    if (approve) {
      approve.title = 'Conferir';
      approve.setAttribute('aria-label', 'Conferir');
    }
    if (reject) {
      reject.title = 'Recusar';
      reject.setAttribute('aria-label', 'Recusar');
    }
  });
}

function moveHeaderActions() {
  const actions = document.querySelector('.conf-actions');
  const tabs = document.querySelector('.conf-tabs');
  if (!actions || !tabs || actions.dataset.cleanReady) return;
  actions.dataset.cleanReady = 'true';
  document.getElementById('conf-lancar-despesa')?.remove();
}

function dispatchInstantFilter() {
  const form = document.getElementById('conf-filters');
  if (!form) return;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function bindInstantFilters() {
  const form = document.getElementById('conf-filters');
  if (!form || form.dataset.instantBound) return;
  form.dataset.instantBound = 'true';

  ['conf-inicio', 'conf-fim', 'conf-regional', 'conf-status'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', dispatchInstantFilter);
  });

  document.getElementById('conf-colaborador')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(dispatchInstantFilter, SEARCH_DEBOUNCE_MS);
  });
}

function enhanceConferenceUi() {
  if (enhancing) return;
  enhancing = true;
  try {
    injectCleanLayoutStyles();
    moveHeaderActions();
    bindInstantFilters();
    mergeConferidosIntoSingleTable();
    formatRegionalCells();
    simplifyActions();
  } finally {
    enhancing = false;
  }
}

function observeConferenceUi() {
  if (uiObserver) return;
  uiObserver = new MutationObserver(() => queueMicrotask(enhanceConferenceUi));
  uiObserver.observe(document.body, { childList: true, subtree: true });
}

// Carrega a tela somente depois que o filtro de segurança estiver instalado.
import('./adm-conferencia.js?v=20260813-grmstatusdatafiltro')
  .then(() => {
    enhanceConferenceUi();
    observeConferenceUi();
  })
  .catch((error) => {
    console.error('[conferencia-roster-fix] Falha ao carregar ADM Conferência:', error);
  });
