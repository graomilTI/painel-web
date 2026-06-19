import { supabase } from './supabaseClient.js';

const AGENT_META = {
  'sync-colaboradores': { name: 'Colaboradores', table: 'colaboradores' },
  'sync-producao-diaria': { name: 'Produção Diária', table: 'grm_producao_diaria_importacoes' },
  'sync-locais-embarque': { name: 'Locais de Embarque', table: 'grm_locais_embarque_importacoes' },
  'sync-resultado-diario': { name: 'Resultado Diário', table: 'grm_resultado_diario_importacoes' },
  'sync-despesas': { name: 'Despesas', table: 'grm_despesas_importacoes' },
  'sync-notas-fiscais': { name: 'Notas Fiscais', table: 'grm_notas_fiscais_importacoes' },
  'sync-mapa-embarque': { name: 'Mapa de Embarque', table: 'grm_mapa_embarque_importacoes' },
  'sync-patrimonios': { name: 'Patrimônios', table: 'grm_patrimonios_importacoes' },
  'sync-contas-pagar': { name: 'Contas a Pagar', table: 'grm_contas_pagar_importacoes' },
  'sync-contas-receber': { name: 'Contas a Receber', table: 'grm_contas_receber_importacoes' },
  'sync-auditorias': { name: 'Auditorias', table: 'grm_auditorias_importacoes' },
  'sync-nhe': { name: 'NHE', table: 'grm_nhe_importacoes' },
  'sync-lista-os': { name: 'Lista de OS', table: 'grm_lista_os_importacoes' },
  'sync-distribuicao-os': { name: 'Distribuição de OS', table: 'grm_distribuicao_os_importacoes' },
};

const LOGISTICA_AGENTS = [
  'sync-mapa-embarque',
  'sync-nhe',
  'sync-lista-os',
  'sync-distribuicao-os',
];

const PRODUCAO_AGENTS = [
  'sync-producao-diaria',
  'sync-resultado-diario',
];

const FINANCEIRO_AGENTS = [
  'sync-contas-pagar',
  'sync-contas-receber',
  'sync-despesas',
];

const ALL_AGENTS = Object.keys(AGENT_META);

const ROUTE_AGENT_MAP = {
  dashboard: [...PRODUCAO_AGENTS, 'sync-patrimonios'],
  'dashboard-socio': [...PRODUCAO_AGENTS, ...FINANCEIRO_AGENTS],
  desempenho: PRODUCAO_AGENTS,
  metas: PRODUCAO_AGENTS,
  dre: FINANCEIRO_AGENTS,

  'adm-logistica': LOGISTICA_AGENTS,
  logistica: LOGISTICA_AGENTS,
  'btg-logistica': LOGISTICA_AGENTS,
  'distribuir-os': ['sync-lista-os', 'sync-distribuicao-os'],
  os: ['sync-lista-os', 'sync-distribuicao-os'],
  programacao: ['sync-mapa-embarque', 'sync-lista-os', 'sync-distribuicao-os'],

  financeiro: FINANCEIRO_AGENTS,
  'notas-fiscais': ['sync-notas-fiscais'],

  patrimonios: ['sync-patrimonios'],
  'adm-patrimonio': ['sync-patrimonios'],
  'importar-patrimonios': ['sync-patrimonios'],

  'consultar-colaboradores': ['sync-colaboradores'],
  'consultar-producao': PRODUCAO_AGENTS,
  historico: ['sync-colaboradores'],

  'adm-operacional': ['sync-mapa-embarque', ...PRODUCAO_AGENTS],
  'admin-auditoria': ['sync-auditorias'],
  'ti-agentes': ALL_AGENTS,
};

const ROUTE_HASH_AGENT_MAP = {
  'financeiro#pagamentos': ['sync-producao-diaria'],
  'financeiro#adiantamentos': ['sync-producao-diaria'],
  'financeiro#alimentacao': ['sync-producao-diaria'],
  'adm-logistica#btg': LOGISTICA_AGENTS,
};

function normalizeRoute() {
  const path = String(window.location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop() || 'dashboard';

  const route = path
    .replace(/\.html$/i, '')
    .replace(/^painel$/i, 'dashboard') || 'dashboard';

  const hash = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
  return { route: route.toLowerCase(), hash };
}

function getAgentsForCurrentRoute() {
  const { route, hash } = normalizeRoute();
  const hashKey = hash ? `${route}#${hash}` : '';
  const agents = ROUTE_HASH_AGENT_MAP[hashKey] || ROUTE_AGENT_MAP[route] || [];
  return [...new Set(agents.filter((agentId) => AGENT_META[agentId]))];
}

function injectStyles() {
  if (document.getElementById('agentUpdateStatusStyles')) return;
  const style = document.createElement('style');
  style.id = 'agentUpdateStatusStyles';
  style.textContent = `
    .agent-update-pill{display:inline-flex;align-items:center;gap:7px;min-height:32px;padding:7px 11px;border-radius:999px;border:1px solid rgba(45,212,160,.20);background:rgba(45,212,160,.09);color:#b8f7dd;font-size:12px;font-weight:800;line-height:1;white-space:nowrap}
    .agent-update-pill::before{content:'';width:7px;height:7px;border-radius:999px;background:#2dd4a0;box-shadow:0 0 10px rgba(45,212,160,.55);flex:0 0 auto}
    .agent-update-pill.is-loading{color:#94a3b8;border-color:rgba(148,163,184,.18);background:rgba(148,163,184,.08)}
    .agent-update-pill.is-loading::before{background:#94a3b8;box-shadow:none}
    .agent-update-pill.is-empty{color:#fbbf24;border-color:rgba(251,191,36,.22);background:rgba(251,191,36,.10)}
    .agent-update-pill.is-empty::before{background:#fbbf24;box-shadow:0 0 10px rgba(251,191,36,.45)}
    @media(max-width:900px){.agent-update-pill{order:20;width:100%;justify-content:center}}
  `;
  document.head.appendChild(style);
}

function ensurePill() {
  const actions = document.querySelector('.topbar-actions');
  const topbar = document.querySelector('.topbar');
  if (!actions && !topbar) return null;

  let pill = document.getElementById('agentUpdateStatus');
  if (pill) return pill;

  pill = document.createElement('span');
  pill.id = 'agentUpdateStatus';
  pill.className = 'agent-update-pill is-loading';
  pill.textContent = 'Atualização...';
  pill.setAttribute('aria-live', 'polite');

  const roleBadge = document.getElementById('roleBadge');
  if (actions && roleBadge) actions.insertBefore(pill, roleBadge);
  else if (actions) actions.prepend(pill);
  else topbar.appendChild(pill);

  return pill;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setPillLoading(pill) {
  pill.className = 'agent-update-pill is-loading';
  pill.textContent = 'Atualização...';
  pill.title = 'Consultando a última atualização dos agentes desta tela';
}

function setPillEmpty(pill, agents) {
  pill.className = 'agent-update-pill is-empty';
  pill.textContent = 'Atualização pendente';
  pill.title = agents.length
    ? `Sem atualização encontrada para: ${agents.map((id) => AGENT_META[id]?.name || id).join(', ')}`
    : 'Esta tela não possui agente de atualização mapeado';
}

function setPillUpdated(pill, row, agents) {
  const updatedAt = row?.finalizado_em || row?.sincronizado_em || row?.created_at;
  const label = formatDateTime(updatedAt);
  if (!label) {
    setPillEmpty(pill, agents);
    return;
  }

  const agentName = AGENT_META[row.agente_id]?.name || row.agente_id || 'Agente';
  pill.className = 'agent-update-pill';
  pill.textContent = `Atualizado ${label}`;
  pill.title = `${agentName} · última atualização com sucesso em ${label}`;
}

async function getLatestFromJobs(agents) {
  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('agente_id,status,created_at,finalizado_em')
    .in('agente_id', agents)
    .eq('status', 'sucesso')
    .not('finalizado_em', 'is', null)
    .order('finalizado_em', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

async function getLatestFromImportTables(agents) {
  const rows = await Promise.all(agents.map(async (agentId) => {
    const meta = AGENT_META[agentId];
    if (!meta?.table) return null;

    try {
      const { data, error } = await supabase
        .from(meta.table)
        .select('sincronizado_em')
        .not('sincronizado_em', 'is', null)
        .order('sincronizado_em', { ascending: false })
        .limit(1);

      if (error) throw error;
      const sincronizadoEm = data?.[0]?.sincronizado_em;
      return sincronizadoEm ? { agente_id: agentId, sincronizado_em: sincronizadoEm } : null;
    } catch (error) {
      console.warn('[agent update status] fallback falhou', agentId, error);
      return null;
    }
  }));

  return rows
    .filter(Boolean)
    .sort((a, b) => new Date(b.sincronizado_em).getTime() - new Date(a.sincronizado_em).getTime())[0] || null;
}

export async function initAgentUpdateStatus() {
  const agents = getAgentsForCurrentRoute();
  if (!agents.length) return;

  injectStyles();
  const pill = ensurePill();
  if (!pill) return;
  setPillLoading(pill);

  try {
    const fromJobs = await getLatestFromJobs(agents);
    if (fromJobs) {
      setPillUpdated(pill, fromJobs, agents);
      return;
    }
  } catch (error) {
    console.warn('[agent update status] não foi possível ler grm_sync_jobs, usando fallback', error);
  }

  const fallback = await getLatestFromImportTables(agents);
  if (fallback) setPillUpdated(pill, fallback, agents);
  else setPillEmpty(pill, agents);
}
