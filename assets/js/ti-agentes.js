import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BTG_AGENT_ID = 'sync-btg-relatorios';
const BTG_AGENT_ALIASES = [
  BTG_AGENT_ID,
  'sync-btg-relatorio',
  'sync-btg-logistica',
  'sync-relatorios-btg',
  'sync-relatorio-btg',
  'btg-relatorios',
  'btg-relatorio',
  'relatorios-btg',
  'grm-sync-btg',
  'grm-sync-btg-relatorios',
];

const CARGAS_AGENT_ID = 'sync-cargas-geofence';
const DISTRIBUICAO_OS_AGENT_ID = 'aplicar-distribuicao-os';

// direction: 'entrada' (informação vem de fora e entra no painel) é o padrão.
// 'saida' = o agente pega informação do painel e leva pra fora (Graint, BTG, etc).
const AGENTES = [
  { id: 'sync-colaboradores', name: 'Colaboradores', freq: 'fila fixa', table: 'colaboradores' },
  { id: 'sync-lista-os', name: 'Lista de OS', freq: 'fila fixa', table: 'grm_lista_os_importacoes' },
  { id: 'sync-patrimonios', name: 'Patrimônios', freq: 'fila fixa', table: 'grm_patrimonios_importacoes' },
  { id: 'sync-nhe', name: 'NHE', freq: 'fila fixa', table: 'grm_nhe_importacoes' },
  { id: 'sync-operacional-os', name: 'Operacional · OS', freq: 'fila fixa', table: 'operacional_os' },
  { id: 'sync-distribuicao-os', name: 'Distribuição de OS', freq: 'fila fixa', table: 'grm_distribuicao_os_importacoes' },
  { id: 'sync-producao-diaria', name: 'Produção Diária', freq: 'fila fixa', table: 'grm_producao_diaria_importacoes' },
  { id: 'sync-locais-embarque', name: 'Locais de Embarque', freq: 'fila fixa', table: 'grm_locais_embarque_importacoes' },
  { id: 'sync-resultado-diario', name: 'Resultado Diário', freq: 'fila fixa', table: 'grm_resultado_diario_importacoes' },
  { id: 'sync-despesas', name: 'Despesas', freq: 'fila fixa', table: 'grm_despesas_importacoes' },
  { id: 'sync-notas-fiscais', name: 'Notas Fiscais', freq: 'fila fixa', table: 'grm_notas_fiscais_importacoes' },
  { id: 'sync-mapa-embarque', name: 'Mapa de Embarque', freq: 'fila fixa', table: 'grm_mapa_embarque_importacoes' },
  { id: 'sync-contas-pagar', name: 'Contas a Pagar', freq: 'fila fixa', table: 'grm_contas_pagar_importacoes' },
  { id: 'sync-contas-receber', name: 'Contas a Receber', freq: 'fila fixa', table: 'grm_contas_receber_importacoes' },
  { id: 'sync-auditorias', name: 'Auditorias', freq: 'fila fixa', table: 'grm_auditorias_importacoes' },
  { id: CARGAS_AGENT_ID, name: 'Cargas · Geofence', freq: 'fila fixa', table: 'grm_cargas_importacoes' },
  { id: BTG_AGENT_ID, name: 'BTG · Relatórios', freq: 'fila fixa / disparo', table: 'logistica_btg_solicitacoes', aliases: BTG_AGENT_ALIASES, kpi: true },
  { id: 'sync-adiantamentos', name: 'Adiantamentos', freq: 'fila fixa', table: 'grm_adiantamentos_importacoes' },
  { id: 'botconversa-sync', name: 'BotConversa · Contatos', freq: 'fila fixa', table: 'botconversa_contatos', source: 'botconversa' },
  { id: 'sync-login-alimentacao', name: 'Login Alimentação', freq: 'contínuo', table: 'financeiro_alimentacao_colaboradores' },
  { id: 'sync-btg-checkin', name: 'BTG · Envio de Check-in', freq: 'sob demanda', table: 'logistica_btg_solicitacoes', direction: 'saida' },
  { id: DISTRIBUICAO_OS_AGENT_ID, name: 'Aplicar Distribuição de OS (Graint)', freq: '15 min (por supervisão)', table: 'operacional_os', direction: 'saida' },
  { id: 'sync-lancar-nhe', name: 'Lançamento Automático de NHE (Graint)', freq: 'diário 02h', table: 'logistica_nhe_lancamentos_auto', direction: 'saida' },
  { id: 'sync-despesas-retroativas', name: 'Despesas Retroativas (GRM)', freq: 'diário', table: 'grm_despesas_retroativas_auditoria', direction: 'saida' },
  { id: 'sync-liberacao-despesas', name: 'Liberação de Despesas (GRM)', freq: 'sob demanda', table: 'grm_despesas_fila', direction: 'saida' },
];

const STATUS_META = {
  pendente: { ui: 'idle', label: 'Aguardando', color: '#f59e0b', detail: '🟡 Aguardando worker' },
  rodando: { ui: 'running', label: 'Executando', color: '#3b82f6', detail: '🔵 Executando' },
  sucesso: { ui: 'online', label: 'Online', color: '#22c55e', detail: '✅ Sucesso' },
  parcial: { ui: 'idle', label: 'Parcial', color: '#f59e0b', detail: '⚠️ Concluído com erros' },
  erro: { ui: 'error', label: 'Erro', color: '#ef4444', detail: '❌ Erro' },
  sem_job: { ui: 'idle', label: 'Aguardando', color: '#f59e0b', detail: '🟡 Aguardando' },
};

const state = {
  agentes: [],
  loading: false,
  selectedAgent: null,
  botconversaFailures: [],
  supervisoesDistribuicao: [],
  cargasKpi: null,
  activeTab: 'entrada',
  executions: [],
  executionsLoading: false,
  executionPeriod: '3d',
  executionStatus: 'problemas',
  executionSearch: '',
  executionsUpdatedAt: null,
};

function getDirection(agenteDef) {
  return agenteDef?.direction === 'saida' ? 'saida' : 'entrada';
}

const esc = (v) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

function getStyles() {
  return `<style id="agentes-style">
.ag-wrap{width:100%;color:#e2e2f0}.ag-hero{background:radial-gradient(ellipse at top left,rgba(59,130,246,.13),transparent 55%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.14);border-radius:24px;padding:24px 28px;margin-bottom:20px}.ag-hero h2{margin:0;font-size:clamp(20px,2vw,28px);letter-spacing:-.03em;color:#f8fafc}.ag-hero p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.5;max-width:700px}.ag-stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}.ag-stat{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:12px 18px;text-align:center}.ag-stat-val{font-size:22px;font-weight:900;color:#3b82f6;line-height:1}.ag-stat-lbl{font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}.ag-btg-kpi{margin-top:16px;background:linear-gradient(135deg,rgba(59,130,246,.16),rgba(34,197,94,.08));border:1px solid rgba(96,165,250,.28);border-radius:18px;padding:16px;cursor:pointer;transition:.15s ease}.ag-btg-kpi:hover{border-color:rgba(96,165,250,.48);background:linear-gradient(135deg,rgba(59,130,246,.22),rgba(34,197,94,.12))}.ag-btg-kpi-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.ag-btg-kpi-title{font-size:15px;font-weight:900;color:#f8fafc}.ag-btg-kpi-sub{font-size:11px;color:#94a3b8;margin-top:3px}.ag-btg-kpi-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:900}.ag-btg-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.ag-btg-kpi-item{background:rgba(15,23,42,.66);border:1px solid rgba(148,163,184,.12);border-radius:13px;padding:10px}.ag-btg-kpi-item span{display:block;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}.ag-btg-kpi-item strong{display:block;margin-top:3px;color:#f8fafc;font-size:13px}.ag-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:20px}.ag-card{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:16px;cursor:pointer;transition:.15s ease}.ag-card:hover{border-color:rgba(59,130,246,.3);background:rgba(15,23,42,.85)}.ag-card.active{border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.08)}.ag-card-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:12px}.ag-card-title{font-size:14px;font-weight:900;color:#f8fafc}.ag-card-freq{font-size:11px;color:#94a3b8;background:rgba(148,163,184,.1);padding:3px 8px;border-radius:6px}.ag-card-status{display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px}.ag-status-dot{width:8px;height:8px;border-radius:50%;display:inline-block}.ag-status-dot.online{background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.4)}.ag-status-dot.error{background:#ef4444;box-shadow:0 0 8px rgba(239,68,68,.4)}.ag-status-dot.idle{background:#f59e0b;box-shadow:0 0 8px rgba(245,158,11,.4)}.ag-status-dot.running{background:#3b82f6;box-shadow:0 0 8px rgba(59,130,246,.4)}.ag-card-meta{display:flex;gap:16px;font-size:12px;color:#6b7280}.ag-card-meta span{display:flex;flex-direction:column}.ag-card-meta span strong{color:#e2e2f0;display:block;font-weight:900;font-size:13px}.ag-details{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:20px;margin-bottom:20px}.ag-details-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid rgba(148,163,184,.12);padding-bottom:16px}.ag-details-title{font-size:16px;font-weight:900;color:#f8fafc}.ag-details-close{background:transparent;border:0;color:#94a3b8;cursor:pointer;padding:4px;font-size:18px}.ag-log-box{background:rgba(0,0,0,.3);border:1px solid rgba(148,163,184,.12);border-radius:12px;padding:12px;max-height:300px;overflow-y:auto;font-family:monospace;font-size:11px;color:#6b7280;line-height:1.4;white-space:pre-wrap}.ag-log-line{margin:2px 0;color:#94a3b8}.ag-log-error{color:#fca5a5}.ag-log-success{color:#86efac}.ag-btn{border:0;border-radius:12px;padding:10px 16px;font-weight:900;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s ease}.ag-btn-primary{background:linear-gradient(135deg,#3b82f6,#60a5fa);color:#fff}.ag-btn-danger{background:rgba(239,68,68,.1);color:#fca5a5;border:1px solid rgba(239,68,68,.22)}.ag-btn:disabled{opacity:.5;cursor:not-allowed}
.ag-tabs{display:flex;gap:8px;margin-top:18px;border-bottom:1px solid rgba(148,163,184,.14);padding-bottom:0}.ag-tab{background:transparent;border:0;border-bottom:2px solid transparent;color:#6b7280;font-weight:900;font-size:13px;padding:10px 4px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s ease}.ag-tab:hover{color:#cbd5e1}.ag-tab.active{color:#f8fafc;border-bottom-color:#3b82f6}.ag-tab-count{background:rgba(148,163,184,.14);color:#cbd5e1;border-radius:999px;padding:1px 8px;font-size:11px}.ag-tab.active .ag-tab-count{background:rgba(59,130,246,.22);color:#bfdbfe}.ag-dir-badge{font-size:10px;font-weight:900;letter-spacing:.04em;padding:2px 7px;border-radius:6px;text-transform:uppercase}.ag-dir-badge.entrada{background:rgba(34,197,94,.13);color:#86efac}.ag-dir-badge.saida{background:rgba(251,146,60,.15);color:#fdba74}
.ag-exec{display:grid;gap:14px}.ag-exec-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ag-exec-kpi{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(15,23,42,.94),rgba(8,15,29,.9));border:1px solid rgba(148,163,184,.13);border-radius:17px;padding:15px 16px}.ag-exec-kpi::after{content:"";position:absolute;inset:auto -24px -38px auto;width:92px;height:92px;border-radius:50%;background:var(--glow,rgba(59,130,246,.12));filter:blur(2px)}.ag-exec-kpi span{display:block;color:#94a3b8;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.ag-exec-kpi strong{display:block;margin-top:6px;color:#f8fafc;font-size:25px;line-height:1;font-weight:950}.ag-exec-kpi small{display:block;margin-top:7px;color:#64748b;font-size:10px}.ag-exec-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:rgba(15,23,42,.62);border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:10px}.ag-exec-search{min-width:220px;flex:1;background:rgba(2,6,23,.7);border:1px solid rgba(148,163,184,.16);border-radius:11px;color:#e2e8f0;padding:10px 12px;outline:none}.ag-exec-search:focus{border-color:rgba(96,165,250,.55);box-shadow:0 0 0 3px rgba(59,130,246,.1)}.ag-exec-filter{background:rgba(2,6,23,.7);border:1px solid rgba(148,163,184,.16);border-radius:11px;color:#cbd5e1;padding:9px 11px}.ag-exec-refresh{border:1px solid rgba(96,165,250,.26);background:rgba(59,130,246,.1);color:#bfdbfe;border-radius:11px;padding:9px 12px;font-weight:850;cursor:pointer}.ag-exec-refresh:hover{background:rgba(59,130,246,.18)}.ag-exec-updated{margin-left:auto;color:#64748b;font-size:10px}.ag-exec-list{display:grid;gap:8px}.ag-exec-row{display:grid;grid-template-columns:44px minmax(190px,1.25fr) minmax(120px,.7fr) minmax(130px,.8fr) minmax(250px,1.6fr) 26px;gap:12px;align-items:center;background:rgba(15,23,42,.66);border:1px solid rgba(148,163,184,.11);border-left:3px solid var(--status-color,#64748b);border-radius:14px;padding:11px 13px;color:#cbd5e1}.ag-exec-row:hover{background:rgba(15,23,42,.86);border-color:rgba(148,163,184,.2);border-left-color:var(--status-color,#64748b)}.ag-exec-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--status-color) 14%,transparent);color:var(--status-color);font-weight:950}.ag-exec-agent strong{display:block;color:#f8fafc;font-size:12px}.ag-exec-agent code{display:block;margin-top:3px;color:#64748b;font-size:9px}.ag-exec-time strong,.ag-exec-duration strong{display:block;color:#cbd5e1;font-size:11px}.ag-exec-time span,.ag-exec-duration span{display:block;margin-top:3px;color:#64748b;font-size:9px}.ag-exec-error{min-width:0;color:#94a3b8;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-exec-chevron{color:#64748b;text-align:center}.ag-exec-detail{grid-column:1/-1;margin:2px 0 0;padding:12px;background:rgba(2,6,23,.72);border-radius:10px;border:1px solid rgba(148,163,184,.1);white-space:pre-wrap;word-break:break-word;font:10px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:#94a3b8}.ag-exec-empty{text-align:center;padding:52px 20px;border:1px dashed rgba(148,163,184,.17);border-radius:16px;color:#64748b}.ag-exec-empty strong{display:block;color:#cbd5e1;margin-bottom:5px}.ag-exec-health{display:flex;align-items:center;gap:8px;font-size:11px;color:#94a3b8}.ag-exec-health-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 9px rgba(34,197,94,.55)}
@media(max-width:980px){.ag-exec-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.ag-exec-row{grid-template-columns:40px 1fr 1fr}.ag-exec-duration,.ag-exec-error{grid-column:2/-1}.ag-exec-chevron{position:absolute;right:14px}.ag-exec-row{position:relative}}
@media(max-width:560px){.ag-exec-summary{grid-template-columns:1fr 1fr}.ag-exec-row{grid-template-columns:38px 1fr}.ag-exec-time,.ag-exec-duration,.ag-exec-error{grid-column:2}.ag-exec-toolbar>*{width:100%}.ag-exec-updated{margin-left:0;text-align:center}}
/* O <details> precisa ser o contêiner; somente o <summary> compõe a grade. */
.ag-exec-row{display:block;padding:0;overflow:hidden}
.ag-exec-row>summary{display:grid;grid-template-columns:44px minmax(190px,1.25fr) minmax(120px,.7fr) minmax(130px,.8fr) minmax(250px,1.6fr) 26px;gap:12px;align-items:center;padding:11px 13px;cursor:pointer;list-style:none}
.ag-exec-row>summary::-webkit-details-marker{display:none}
.ag-exec-row[open]>summary{border-bottom:1px solid rgba(148,163,184,.1)}
.ag-exec-row[open] .ag-exec-chevron{transform:rotate(180deg)}
.ag-exec-chevron{transition:transform .18s ease}
.ag-exec-detail{display:block;grid-column:auto;width:auto;max-height:360px;overflow:auto;margin:0;padding:14px 16px;border:0;border-radius:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal}
@media(max-width:980px){.ag-exec-row>summary{grid-template-columns:40px 1fr 1fr;position:relative}.ag-exec-chevron{position:absolute;right:14px}.ag-exec-detail{max-height:300px}}
@media(max-width:560px){.ag-exec-row>summary{grid-template-columns:38px 1fr}.ag-exec-time,.ag-exec-duration,.ag-exec-error{grid-column:2}.ag-exec-detail{padding:12px;font-size:9px}}
</style>`;
}

function getAgenteStatus(agente) {
  const status = String(agente?.job_status || '').toLowerCase();
  return STATUS_META[status]?.ui || 'idle';
}

function getAgenteMeta(agente) {
  const status = String(agente?.job_status || 'sem_job').toLowerCase();
  return STATUS_META[status] || STATUS_META.sem_job;
}

function formatDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('pt-BR');
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (!value) return 'N/A';
  if (value < 1000) return `${value}ms`;
  return `${Math.round(value / 1000)}s`;
}

function formatInt(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function getAgentIds(agenteOrId) {
  if (typeof agenteOrId === 'string') return [agenteOrId];
  return unique([agenteOrId?.id, ...(agenteOrId?.aliases || [])]);
}

function isBtgAgent(agenteOrId) {
  return getAgentIds(agenteOrId).some((id) => String(id).toLowerCase().includes('btg'));
}

function jobMentionsBtg(job) {
  const output = job?.output || {};
  const haystack = [
    job?.agente_id,
    output?.script,
    output?.stdout,
    output?.stderr,
    job?.erro,
  ].map((v) => String(v || '').toLowerCase()).join(' ');
  return haystack.includes('btg');
}

function extractTotalFromJob(job) {
  const stdout = String(job?.output?.stdout || '');
  const patterns = [
    /Upsert conclu[ií]do[^|\n]*\|[^\n]*Atualizados:\s*(\d+)/i,
    /Upsert conclu[ií]do:\s*(\d+)\s+registros/i,
    /(\d+)\s+registros\s+sincronizados/i,
    /(\d+)\s+colaboradores\s+processados/i,
    /(\d+)\s+solicita(?:ções|coes)/i,
    /(\d+)\s+relat[óo]rios/i,
    /(\d+)\s+arquivos/i,
    /(\d+)\s+linhas\s+BTG/i,
    /(\d+)\s+linhas\s+parseadas/i,
    /(\d+)\s+linhas/i,
    /Total de linhas encontradas:\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = stdout.match(pattern);
    if (match?.[1]) return Number(match[1]) || 0;
  }
  return 0;
}

function renderLog(job) {
  if (!job) return '<div class="ag-log-line">Nenhum job encontrado ainda para este agente.</div>';

  const output = job.output || {};
  const lines = [
    `<div class="ag-log-line">Job: ${esc(job.id || '-')}</div>`,
    `<div class="ag-log-line">Agente gravado: ${esc(job.agente_id || '-')}</div>`,
    `<div class="ag-log-line">Status: ${esc(job.status || '-')}</div>`,
    `<div class="ag-log-line">Criado em: ${esc(formatDate(job.created_at))}</div>`,
    `<div class="ag-log-line">Iniciado em: ${esc(formatDate(job.iniciado_em))}</div>`,
    `<div class="ag-log-line">Finalizado em: ${esc(formatDate(job.finalizado_em))}</div>`,
    `<div class="ag-log-line">Duração: ${esc(formatDuration(job.duration_ms))}</div>`,
  ];

  if (job.erro) lines.push(`<div class="ag-log-error">Erro: ${esc(job.erro)}</div>`);
  if (output.script) lines.push(`<div class="ag-log-line">Script: ${esc(output.script)}</div>`);
  if (output.stdout) lines.push(`<div class="ag-log-success">stdout:\n${esc(String(output.stdout).slice(-2500))}</div>`);
  if (output.stderr) lines.push(`<div class="ag-log-error">stderr:\n${esc(String(output.stderr).slice(-2500))}</div>`);

  return lines.join('');
}

function renderBtgKpi() {
  const btg = state.agentes.find((x) => x.id === BTG_AGENT_ID) || AGENTES.find((x) => x.id === BTG_AGENT_ID);
  const meta = getAgenteMeta(btg);
  const jobLabel = btg?.job_id ? String(btg.job_id).slice(0, 8) : 'N/A';

  return `<div class="ag-btg-kpi" onclick="selectAgent('${BTG_AGENT_ID}')">
    <div class="ag-btg-kpi-head">
      <div>
        <div class="ag-btg-kpi-title">📊 KPI · Relatórios BTG</div>
        <div class="ag-btg-kpi-sub">Acompanha o último disparo do agente que puxa relatórios BTG pelo worker.</div>
      </div>
      <div class="ag-btg-kpi-status" style="color:${meta.color}"><span class="ag-status-dot ${meta.ui}"></span>${meta.label}</div>
    </div>
    <div class="ag-btg-kpi-grid">
      <div class="ag-btg-kpi-item"><span>Último disparo</span><strong>${formatDate(btg?.ultima_sync)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Registros BTG</span><strong>${formatInt(btg?.total_records)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Duração</span><strong>${esc(formatDuration(btg?.duration_ms))}</strong></div>
      <div class="ag-btg-kpi-item"><span>Último job</span><strong>${esc(jobLabel)}</strong></div>
    </div>
  </div>`;
}

function renderCargasKpi() {
  const cargas = state.agentes.find((x) => x.id === CARGAS_AGENT_ID) || AGENTES.find((x) => x.id === CARGAS_AGENT_ID);
  const meta = getAgenteMeta(cargas);
  const lastRun = state.cargasKpi?.lastRun;
  const abertas = state.cargasKpi?.abertas || 0;

  return `<div class="ag-btg-kpi" onclick="selectAgent('${CARGAS_AGENT_ID}')">
    <div class="ag-btg-kpi-head">
      <div>
        <div class="ag-btg-kpi-title">🗺️ KPI · Cargas x Geofence</div>
        <div class="ag-btg-kpi-sub">Cargas lançadas fora do raio de 2km da O.S., cruzando o relatório do dia com o mapa.</div>
      </div>
      <div class="ag-btg-kpi-status" style="color:${meta.color}"><span class="ag-status-dot ${meta.ui}"></span>${meta.label}</div>
    </div>
    <div class="ag-btg-kpi-grid">
      <div class="ag-btg-kpi-item"><span>Último relatório</span><strong>${formatDate(lastRun?.iniciado_em)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Linhas processadas</span><strong>${formatInt(lastRun?.total_linhas)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Sem referência de O.S.</span><strong>${formatInt(lastRun?.total_sem_referencia_os)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Irregularidades abertas</span><strong style="color:${abertas ? '#fca5a5' : '#86efac'}">${formatInt(abertas)}</strong></div>
    </div>
  </div>`;
}

async function loadCargasKpi() {
  try {
    const [lastRunRes, abertasRes] = await Promise.all([
      supabase
        .from('logistica_cargas_monitor_execucoes')
        .select('data_ref, status, iniciado_em, finalizado_em, total_linhas, total_com_coordenada, total_sem_referencia_os, total_irregularidades, erro')
        .order('iniciado_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('logistica_cargas_irregularidades')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ABERTA'),
    ]);
    state.cargasKpi = {
      lastRun: lastRunRes.data || null,
      abertas: abertasRes.count || 0,
    };
  } catch (e) {
    console.error('Erro carregando KPI de Cargas x Geofence:', e);
  }
  render();
}

function getAgentDefinition(agentId) {
  return AGENTES.find((agent) => getAgentIds(agent).includes(agentId));
}

function getExecutionAgentName(agentId) {
  return getAgentDefinition(agentId)?.name || agentId || 'Agente não identificado';
}

function getExecutionDuration(job) {
  if (Number(job?.duration_ms) > 0) return Number(job.duration_ms);
  const start = new Date(job?.iniciado_em || job?.created_at || 0).getTime();
  const end = new Date(job?.finalizado_em || Date.now()).getTime();
  return start > 0 && end >= start ? end - start : 0;
}

function isStuckExecution(job) {
  return String(job?.status || '').toLowerCase() === 'rodando'
    && getExecutionDuration(job) > 20 * 60 * 1000;
}

function getExecutionProblem(job) {
  const status = String(job?.status || '').toLowerCase();
  return status === 'erro' || status === 'parcial' || isStuckExecution(job);
}

function getPeriodStart(period = state.executionPeriod) {
  const hours = period === '6h' ? 6 : period === '24h' ? 24 : 24 * 3;
  return Date.now() - hours * 60 * 60 * 1000;
}

function getFilteredExecutions() {
  const start = getPeriodStart();
  const term = state.executionSearch.trim().toLowerCase();

  return state.executions.filter((job) => {
    if (new Date(job.created_at || 0).getTime() < start) return false;
    const status = String(job.status || '').toLowerCase();
    if (state.executionStatus === 'problemas' && !getExecutionProblem(job)) return false;
    if (state.executionStatus !== 'todos' && state.executionStatus !== 'problemas' && status !== state.executionStatus) return false;
    if (!term) return true;
    return [job.agente_id, getExecutionAgentName(job.agente_id), job.erro, job.output?.script]
      .some((value) => String(value || '').toLowerCase().includes(term));
  });
}

function getExecutionStatusMeta(job) {
  if (isStuckExecution(job)) return { label: 'Travado', icon: '!', color: '#fb923c' };
  const status = String(job?.status || '').toLowerCase();
  if (status === 'erro') return { label: 'Falhou', icon: '×', color: '#ef4444' };
  if (status === 'parcial') return { label: 'Parcial', icon: '!', color: '#f59e0b' };
  if (status === 'rodando') return { label: 'Executando', icon: '↻', color: '#3b82f6' };
  if (status === 'pendente') return { label: 'Aguardando', icon: '·', color: '#eab308' };
  return { label: 'Concluído', icon: '✓', color: '#22c55e' };
}

function getExecutionError(job) {
  if (isStuckExecution(job)) return 'Execução acima de 20 minutos; pode estar impedindo a atualização das informações.';
  return job?.erro || job?.output?.stderr || (String(job?.status).toLowerCase() === 'parcial' ? 'Execução concluída parcialmente.' : 'Sem falha registrada.');
}

function renderExecutions() {
  const rows = getFilteredExecutions();
  const periodRows = state.executions.filter((job) => new Date(job.created_at || 0).getTime() >= getPeriodStart());
  const failures = periodRows.filter((job) => ['erro', 'parcial'].includes(String(job.status || '').toLowerCase()));
  const affected = new Set(failures.map((job) => job.agente_id)).size;
  const stuck = periodRows.filter(isStuckExecution).length;
  const completed = periodRows.filter((job) => ['sucesso', 'erro', 'parcial'].includes(String(job.status || '').toLowerCase()));
  const success = completed.filter((job) => String(job.status || '').toLowerCase() === 'sucesso').length;
  const successRate = completed.length ? Math.round((success / completed.length) * 100) : 100;

  const cards = `
    <div class="ag-exec-summary">
      <div class="ag-exec-kpi" style="--glow:rgba(239,68,68,.18)"><span>Falhas no período</span><strong style="color:${failures.length ? '#f87171' : '#86efac'}">${formatInt(failures.length)}</strong><small>${affected} agente(s) afetado(s)</small></div>
      <div class="ag-exec-kpi" style="--glow:rgba(251,146,60,.18)"><span>Execuções travadas</span><strong style="color:${stuck ? '#fb923c' : '#86efac'}">${formatInt(stuck)}</strong><small>Acima de 20 minutos</small></div>
      <div class="ag-exec-kpi" style="--glow:rgba(34,197,94,.16)"><span>Taxa de sucesso</span><strong style="color:${successRate >= 95 ? '#4ade80' : '#fbbf24'}">${successRate}%</strong><small>${completed.length} execução(ões) encerrada(s)</small></div>
      <div class="ag-exec-kpi" style="--glow:rgba(59,130,246,.16)"><span>Volume monitorado</span><strong>${formatInt(periodRows.length)}</strong><small>Jobs dentro do período</small></div>
    </div>`;

  const toolbar = `
    <div class="ag-exec-toolbar">
      <input class="ag-exec-search" type="search" value="${esc(state.executionSearch)}" placeholder="Buscar agente ou mensagem de erro" oninput="filterExecutions({ search: this.value })" />
      <select class="ag-exec-filter" onchange="filterExecutions({ status: this.value })">
        <option value="problemas" ${state.executionStatus === 'problemas' ? 'selected' : ''}>Somente problemas</option>
        <option value="todos" ${state.executionStatus === 'todos' ? 'selected' : ''}>Todos os status</option>
        <option value="erro" ${state.executionStatus === 'erro' ? 'selected' : ''}>Falhas</option>
        <option value="rodando" ${state.executionStatus === 'rodando' ? 'selected' : ''}>Executando</option>
        <option value="sucesso" ${state.executionStatus === 'sucesso' ? 'selected' : ''}>Sucesso</option>
      </select>
      <select class="ag-exec-filter" onchange="filterExecutions({ period: this.value })">
        <option value="6h" ${state.executionPeriod === '6h' ? 'selected' : ''}>Últimas 6 horas</option>
        <option value="24h" ${state.executionPeriod === '24h' ? 'selected' : ''}>Últimas 24 horas</option>
        <option value="3d" ${state.executionPeriod === '3d' ? 'selected' : ''}>Últimos 3 dias</option>
      </select>
      <button class="ag-exec-refresh" type="button" onclick="refreshExecutions()">↻ Atualizar</button>
      <span class="ag-exec-updated">Atualizado ${formatDate(state.executionsUpdatedAt)}</span>
    </div>`;

  const list = state.executionsLoading
    ? '<div class="ag-exec-empty"><strong>Consultando execuções…</strong>Buscando o histórico mais recente dos agentes.</div>'
    : rows.length
      ? `<div class="ag-exec-list">${rows.map((job) => {
        const meta = getExecutionStatusMeta(job);
        const error = getExecutionError(job);
        const output = [job.erro, job.output?.stderr, job.output?.stdout].filter(Boolean).join('\n\n').slice(-6000);
        return `<details class="ag-exec-row" style="--status-color:${meta.color}">
          <summary style="display:contents;cursor:pointer">
            <div class="ag-exec-icon">${meta.icon}</div>
            <div class="ag-exec-agent"><strong>${esc(getExecutionAgentName(job.agente_id))}</strong><code>${esc(job.agente_id)}</code></div>
            <div class="ag-exec-time"><strong>${esc(meta.label)}</strong><span>${formatDate(job.created_at)}</span></div>
            <div class="ag-exec-duration"><strong>${esc(formatDuration(getExecutionDuration(job)))}</strong><span>${job.finalizado_em ? 'encerrada' : 'em andamento'}</span></div>
            <div class="ag-exec-error" title="${esc(error)}">${esc(error)}</div>
            <div class="ag-exec-chevron">⌄</div>
          </summary>
          <div class="ag-exec-detail">Job: ${esc(job.id)}\nCriado: ${formatDate(job.created_at)}\nIniciado: ${formatDate(job.iniciado_em)}\nFinalizado: ${formatDate(job.finalizado_em)}\n\n${esc(output || error)}</div>
        </details>`;
      }).join('')}</div>`
      : '<div class="ag-exec-empty"><strong>Nenhum problema encontrado</strong>Os agentes não apresentam falhas ou travamentos para os filtros selecionados.</div>';

  return `<section class="ag-exec" aria-label="Relatório de execuções dos agentes">${cards}${toolbar}<div class="ag-exec-health"><span class="ag-exec-health-dot"></span>Monitoramento automático a cada 30 segundos</div>${list}</section>`;
}

function renderAgentes() {
  const entrada = AGENTES.filter((a) => getDirection(a) === 'entrada');
  const saida = AGENTES.filter((a) => getDirection(a) === 'saida');
  const visiveis = state.activeTab === 'saida' ? saida : entrada;
  const recentProblems = state.executions.filter((job) =>
    new Date(job.created_at || 0).getTime() >= Date.now() - 24 * 60 * 60 * 1000
    && getExecutionProblem(job)).length;

  const statusCount = {
    online: visiveis.filter((a) => getAgenteStatus(state.agentes.find((x) => x.id === a.id)) === 'online').length,
    error: visiveis.filter((a) => getAgenteStatus(state.agentes.find((x) => x.id === a.id)) === 'error').length,
  };

  let html = getStyles();
  html += `<div class="ag-wrap">
    <div class="ag-hero">
      <h2>🤖 Agentes de Sincronização</h2>
      <p>Monitor em tempo real dos ${AGENTES.length} agentes de sincronização (worker do cPanel + Edge Functions do Supabase) — ${entrada.length} de entrada, ${saida.length} de saída.</p>
      <div class="ag-tabs">
        <button class="ag-tab ${state.activeTab === 'entrada' ? 'active' : ''}" onclick="setTab('entrada')" type="button">⬇️ Entrada <span class="ag-tab-count">${entrada.length}</span></button>
        <button class="ag-tab ${state.activeTab === 'saida' ? 'active' : ''}" onclick="setTab('saida')" type="button">⬆️ Saída <span class="ag-tab-count">${saida.length}</span></button>
        <button class="ag-tab ${state.activeTab === 'execucoes' ? 'active' : ''}" onclick="setTab('execucoes')" type="button">◉ Execuções <span class="ag-tab-count">${recentProblems}</span></button>
      </div>
      ${state.activeTab === 'execucoes' ? '' : `<div class="ag-stats">
        <div class="ag-stat"><div class="ag-stat-val">${visiveis.length}</div><div class="ag-stat-lbl">Agentes nesta aba</div></div>
        <div class="ag-stat"><div class="ag-stat-val" style="color:#22c55e">${statusCount.online}</div><div class="ag-stat-lbl">Online</div></div>
        <div class="ag-stat"><div class="ag-stat-val" style="color:#ef4444">${statusCount.error}</div><div class="ag-stat-lbl">Com Erro</div></div>
      </div>`}
      ${state.activeTab === 'entrada' ? renderBtgKpi() : ''}
      ${state.activeTab === 'entrada' ? renderCargasKpi() : ''}
    </div>`;

  if (state.activeTab === 'execucoes') {
    html += renderExecutions();
    html += '</div>';
    return html;
  }

  if (state.selectedAgent) html += renderAgentDetails(state.selectedAgent);

  html += '<div class="ag-grid">';
  visiveis.forEach((a) => {
    const agente = state.agentes.find((x) => x.id === a.id);
    const meta = getAgenteMeta(agente);
    const dir = getDirection(a);

    html += `<div class="ag-card ${state.selectedAgent?.id === a.id ? 'active' : ''}" onclick="selectAgent('${a.id}')">
      <div class="ag-card-header"><div class="ag-card-title">${esc(a.name)}</div><div class="ag-card-freq">${a.freq}</div></div>
      <div class="ag-card-status"><div class="ag-status-dot ${meta.ui}"></div><span style="color:${meta.color}">${meta.label}</span><span class="ag-dir-badge ${dir}">${dir === 'saida' ? 'Saída' : 'Entrada'}</span></div>
      <div class="ag-card-meta">
        <span>Total<strong>${formatInt(agente?.total_records)}</strong></span>
        <span>Última Sync<strong>${formatDate(agente?.ultima_sync)}</strong></span>
      </div>
    </div>`;
  });
  html += '</div>';

  if (!state.selectedAgent) html += '<div style="text-align:center;padding:40px;color:#6b7280"><p>Clique em um agente para ver detalhes</p></div>';
  html += '</div>';
  return html;
}

function renderAgentDetails(agente) {
  const meta = getAgenteMeta(agente);
  const aliases = agente.aliases?.length ? `<p><strong>Aliases monitorados:</strong> ${esc(agente.aliases.join(', '))}</p>` : '';
  return `<div class="ag-details">
    <div class="ag-details-header"><div class="ag-details-title">${esc(agente.name)} - Detalhes</div><button class="ag-details-close" onclick="closeDetails()">✕</button></div>
    <div style="margin-bottom:16px">
      <p><strong>ID:</strong> ${esc(agente.id)}</p>
      ${aliases}
      <p><strong>Tabela:</strong> ${esc(agente.table)}</p>
      <p><strong>Frequência:</strong> ${esc(agente.freq)}</p>
      <p><strong>Status:</strong> ${meta.detail}</p>
      <p><strong>Última Sincronização:</strong> ${formatDate(agente.ultima_sync)}</p>
      <p><strong>Total de Registros:</strong> ${formatInt(agente.total_records)}</p>
      <p><strong>Último Job:</strong> ${esc(agente.job_id || 'N/A')}</p>
      <p><strong>Duração:</strong> ${esc(formatDuration(agente.duration_ms))}</p>
    </div>
    <div><p style="margin-bottom:8px"><strong>${agente.source === 'botconversa' ? 'Resumo do job:' : 'Log do Worker:'}</strong></p><div class="ag-log-box">${renderLog(agente.last_job)}</div></div>
    ${agente.source === 'botconversa' ? renderBotConversaFailures() : ''}
    ${agente.id === DISTRIBUICAO_OS_AGENT_ID ? renderDistribuicaoSupervisoes() : ''}
    <div style="margin-top:16px">
      <button class="ag-btn ag-btn-primary" onclick="executeAgent('${agente.id}')">▶️ Executar Agora</button>
      <button class="ag-btn ag-btn-danger" onclick="viewLogs('${agente.id}')" style="margin-left:8px">📊 ${agente.source === 'botconversa' ? 'Onde ver os logs' : 'Ver Log cPanel'}</button>
    </div>
  </div>`;
}

function renderBotConversaFailures() {
  const rows = state.botconversaFailures;
  if (rows === null) {
    return '<div style="margin-top:16px"><p style="margin-bottom:8px"><strong>Contatos com falha:</strong></p><div class="ag-log-box">Carregando...</div></div>';
  }
  if (!rows.length) {
    return '<div style="margin-top:16px"><p style="margin-bottom:8px"><strong>Contatos com falha:</strong></p><div class="ag-log-box"><span class="ag-log-success">Nenhuma falha no último job. ✅</span></div></div>';
  }
  const lines = rows.map((r) => `<div class="ag-log-error">${esc(formatDate(r.created_at))} · ${esc(r.nome || '-')} (${esc(r.telefone || '-')}): ${esc(r.erro || 'erro desconhecido')}</div>`).join('');
  return `<div style="margin-top:16px"><p style="margin-bottom:8px"><strong>Contatos com falha (últimas ${rows.length}):</strong></p><div class="ag-log-box">${lines}</div></div>`;
}

function renderDistribuicaoSupervisoes() {
  const rows = state.supervisoesDistribuicao;
  if (rows === null) {
    return '<div style="margin-top:16px"><p style="margin-bottom:8px"><strong>Supervisões com distribuição automática:</strong></p><div class="ag-log-box">Carregando...</div></div>';
  }
  const ativas = rows.filter((s) => s.distribuicao_os_automatica).length;
  const itens = rows.map((s) => `
    <label style="display:flex;align-items:center;gap:8px;padding:5px 0;color:#e2e2f0;font-size:12px;cursor:pointer">
      <input type="checkbox" ${s.distribuicao_os_automatica ? 'checked' : ''} onchange="toggleDistribuicaoSupervisao('${esc(s.id)}', this.checked)" />
      ${esc(s.nome)}
    </label>`).join('') || '<div class="ag-log-line">Nenhuma supervisão cadastrada em public.supervisoes.</div>';
  return `<div style="margin-top:16px">
    <p style="margin-bottom:4px"><strong>Supervisões com distribuição automática (${ativas}/${rows.length}):</strong></p>
    <p style="font-size:12px;color:#6b7280;margin-bottom:10px">Marque só as supervisões cujo gestor já usa a tela "Distribuir O.S" do painel — nas demais o agente ignora as O.S. e a associação continua sendo feita manualmente no Graint.</p>
    <div class="ag-log-box" style="max-height:280px">${itens}</div>
  </div>`;
}

async function loadSupervisoesDistribuicao() {
  try {
    const { data, error } = await supabase
      .from('supervisoes')
      .select('id, nome, distribuicao_os_automatica')
      .order('nome');
    if (error) throw error;
    state.supervisoesDistribuicao = data || [];
  } catch (e) {
    console.error('Erro carregando supervisões da distribuição de OS:', e);
    state.supervisoesDistribuicao = [];
  }
  render();
}

async function loadBotConversaFailures(jobId) {
  if (!jobId) { state.botconversaFailures = []; render(); return; }
  state.botconversaFailures = null;
  try {
    const { data, error } = await supabase
      .from('botconversa_logs')
      .select('nome, telefone, erro, created_at')
      .eq('job_id', jobId)
      .eq('sucesso', false)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    state.botconversaFailures = data || [];
  } catch (e) {
    console.error('Erro carregando falhas do BotConversa:', e);
    state.botconversaFailures = [];
  }
  render();
}

window.setTab = (tab) => {
  state.activeTab = ['entrada', 'saida', 'execucoes'].includes(tab) ? tab : 'entrada';
  state.selectedAgent = null;
  render();
};

window.filterExecutions = ({ search, status, period } = {}) => {
  if (search !== undefined) state.executionSearch = search;
  if (status !== undefined) state.executionStatus = status;
  if (period !== undefined) state.executionPeriod = period;
  render();
};

window.refreshExecutions = () => loadExecutions(true);

window.selectAgent = (agentId) => {
  const agente = AGENTES.find((a) => a.id === agentId);
  const agenteData = state.agentes.find((a) => a.id === agentId);
  state.selectedAgent = { ...agente, ...agenteData };
  state.botconversaFailures = [];
  state.supervisoesDistribuicao = null;
  render();
  if (agente?.source === 'botconversa') loadBotConversaFailures(state.selectedAgent.job_id);
  if (agentId === DISTRIBUICAO_OS_AGENT_ID) loadSupervisoesDistribuicao();
};

window.closeDetails = () => {
  state.selectedAgent = null;
  state.botconversaFailures = [];
  render();
};

window.executeAgent = async (agentId) => {
  const agenteDef = AGENTES.find((a) => a.id === agentId);

  if (agenteDef?.source === 'botconversa') {
    if (!confirm('Disparar agora a sincronização de contatos do BotConversa?')) return;
    try {
      const { data, error } = await supabase.functions.invoke('botconversa-sync', { body: { action: 'start_sync' } });
      if (error) throw error;
      if (!data || data.ok === false) throw new Error(data?.error || 'Falha ao iniciar a sincronização.');
      alert(`✅ Sincronização iniciada.\n\nJob: ${data.job_id}\nStatus: ${data.status}\n\nRoda direto no Supabase (sem worker de servidor); esta tela atualiza a cada 30s.`);
      await loadAgentes();
    } catch (e) {
      alert(`❌ Erro ao iniciar sincronização: ${e.message}`);
    }
    return;
  }

  if (!confirm(`Enfileirar agente "${agentId}" para o worker do cPanel executar?`)) return;

  try {
    const { data, error } = await supabase
      .from('grm_sync_jobs')
      .insert({ agente_id: agentId, status: 'pendente' })
      .select('id, agente_id, status, created_at')
      .single();

    if (error) throw error;

    alert(`✅ Agente enfileirado com sucesso.\n\nJob: ${data.id}\nStatus: ${data.status}\n\nO cron do cPanel executa o worker a cada minuto. Aguarde a tela atualizar para "Executando" e depois "Online".`);
    await loadAgentes();
  } catch (e) {
    alert(`❌ Erro ao enfileirar agente: ${e.message}`);
  }
};

window.toggleDistribuicaoSupervisao = async (supervisaoId, checked) => {
  const row = (state.supervisoesDistribuicao || []).find((s) => String(s.id) === String(supervisaoId));
  if (row) row.distribuicao_os_automatica = checked;
  render();
  const { error } = await supabase
    .from('supervisoes')
    .update({ distribuicao_os_automatica: checked })
    .eq('id', supervisaoId);
  if (error) {
    alert(`❌ Erro ao salvar: ${error.message}`);
    if (row) row.distribuicao_os_automatica = !checked;
    render();
  }
};

window.viewLogs = (agentId) => {
  const agenteDef = AGENTES.find((a) => a.id === agentId);
  if (agenteDef?.source === 'botconversa') {
    alert('Esse agente roda como Edge Function no Supabase (sem worker de servidor). Logs por contato (sucesso/erro) ficam na tabela botconversa_logs, filtrando por job_id; o progresso do job fica em botconversa_jobs.');
    return;
  }
  const msg = `Para acompanhar no servidor cPanel:\n\ntail -f /home/grao100/painel-scripts/grm-sync/logs/worker-cron.log\n\nO agente ${agentId} também grava o resultado final em public.grm_sync_jobs.`;
  alert(msg);
};

async function getRecentBtgJobFallback() {
  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('id, agente_id, status, created_at, iniciado_em, finalizado_em, duration_ms, output, erro')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data || []).find(jobMentionsBtg) || null;
}

// botconversa-sync não roda no worker do cPanel — é uma Edge Function do
// Supabase, com seu próprio job (botconversa_jobs) e vocabulário de status
// diferente do grm_sync_jobs. Normaliza pro mesmo formato pra reaproveitar
// renderLog/renderAgentDetails sem duplicar a UI.
const BOTCONVERSA_STATUS_MAP = { pendente: 'pendente', processando: 'rodando', concluido: 'sucesso', parcial: 'parcial', erro: 'erro' };

function normalizeBotConversaJob(row) {
  if (!row) return null;
  const durationMs = row.finished_at && row.created_at
    ? new Date(row.finished_at).getTime() - new Date(row.created_at).getTime()
    : null;
  return {
    id: row.id,
    agente_id: 'botconversa-sync',
    status: BOTCONVERSA_STATUS_MAP[String(row.status || '').toLowerCase()] || 'sem_job',
    created_at: row.created_at,
    iniciado_em: row.created_at,
    finalizado_em: row.finished_at,
    duration_ms: durationMs,
    erro: row.erro,
    output: { stdout: [row.observacoes, `Sucesso: ${row.total_sucesso || 0} · Erros: ${row.total_erro || 0}`].filter(Boolean).join('\n') },
  };
}

async function getLastJobBotConversa() {
  const { data, error } = await supabase
    .from('botconversa_jobs')
    .select('id, status, total_processado, total_sucesso, total_erro, erro, observacoes, created_at, finished_at')
    .eq('tipo', 'sync_subscribers')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return normalizeBotConversaJob(data);
}

async function getLastJob(agenteOrId) {
  if (typeof agenteOrId !== 'string' && agenteOrId?.source === 'botconversa') {
    return getLastJobBotConversa();
  }

  const ids = getAgentIds(agenteOrId);
  let query = supabase
    .from('grm_sync_jobs')
    .select('id, agente_id, status, created_at, iniciado_em, finalizado_em, duration_ms, output, erro')
    .order('created_at', { ascending: false })
    .limit(1);

  query = ids.length > 1 ? query.in('agente_id', ids) : query.eq('agente_id', ids[0]);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (data) return data;

  // O fallback legado pertence somente ao agregador de Relatórios BTG. Usá-lo
  // no Check-in fazia o cartão herdar o erro/sucesso de outro agente BTG.
  if (getAgentIds(agenteOrId).includes(BTG_AGENT_ID)) return getRecentBtgJobFallback();
  return null;
}

async function countRecords(table) {
  const { count, error } = await supabase
    .from(table)
    // Contagem planejada/estimada: evita COUNT(*) exato em tabelas grandes a cada atualização da tela.
    .select('*', { count: 'planned', head: true });

  if (error) {
    console.warn(`Erro contando ${table}:`, error);
    return 0;
  }
  return count || 0;
}

async function loadAgentes() {
  state.loading = true;
  try {
    const results = await Promise.all(
      AGENTES.map(async (agente) => {
        try {
          const [lastJob, totalRecords] = await Promise.all([
            getLastJob(agente),
            countRecords(agente.table),
          ]);
          const jobTotal = extractTotalFromJob(lastJob);
          const displayTotal = Number(totalRecords || 0) > 0 ? totalRecords : jobTotal;

          return {
            id: agente.id,
            name: agente.name,
            freq: agente.freq,
            table: agente.table,
            aliases: agente.aliases || [],
            ultima_sync: lastJob?.finalizado_em || lastJob?.iniciado_em || lastJob?.created_at || null,
            total_records: displayTotal || 0,
            job_id: lastJob?.id || null,
            job_status: lastJob?.status || 'sem_job',
            duration_ms: lastJob?.duration_ms || null,
            erro: lastJob?.erro || null,
            last_job: lastJob,
          };
        } catch (e) {
          console.error(`Erro carregando ${agente.name}:`, e);
          return { id: agente.id, name: agente.name, freq: agente.freq, table: agente.table, aliases: agente.aliases || [], job_status: 'sem_job' };
        }
      })
    );

    state.agentes = results;
    if (state.selectedAgent?.id) {
      const previousJobId = state.selectedAgent.job_id;
      const latest = results.find((item) => item.id === state.selectedAgent.id);
      const base = AGENTES.find((item) => item.id === state.selectedAgent.id);
      state.selectedAgent = { ...base, ...latest };
      if (base?.source === 'botconversa' && state.selectedAgent.job_id !== previousJobId) {
        loadBotConversaFailures(state.selectedAgent.job_id);
      }
    }
  } catch (e) {
    console.error('Erro ao carregar agentes:', e);
  } finally {
    state.loading = false;
    render();
  }
}

async function loadExecutions(forceRender = false) {
  if (state.executionsLoading) return;
  state.executionsLoading = true;
  if (forceRender) render();

  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const baseFields = 'id, agente_id, status, created_at, iniciado_em, finalizado_em, duration_ms, erro';
    const pageStarts = [0, 1000, 2000, 3000];
    const [jobPages, problemDetailsRes] = await Promise.all([
      Promise.all(pageStarts.map((start) => supabase
        .from('grm_sync_jobs')
        .select(baseFields)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(start, start + 999))),
      supabase
        .from('grm_sync_jobs')
        .select(`${baseFields}, output`)
        .gte('created_at', since)
        .in('status', ['erro', 'parcial'])
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    const failedPage = jobPages.find((page) => page.error);
    if (failedPage?.error) throw failedPage.error;
    if (problemDetailsRes.error) throw problemDetailsRes.error;

    const jobs = jobPages.flatMap((page) => page.data || []);
    const detailsById = new Map((problemDetailsRes.data || []).map((job) => [job.id, job]));
    state.executions = jobs.map((job) => detailsById.get(job.id) || job);
    state.executionsUpdatedAt = new Date().toISOString();
  } catch (error) {
    console.error('Erro carregando relatório de execuções:', error);
  } finally {
    state.executionsLoading = false;
    render();
  }
}

function render() {
  const pageContent = document.getElementById('pageContent');
  if (pageContent) pageContent.innerHTML = renderAgentes();
}

async function init() {
  await initProtectedPage(['TI_AGENTES', 'TI']);
  await Promise.all([loadAgentes(), loadCargasKpi(), loadExecutions()]);
}

init();
setInterval(() => {
  loadAgentes();
  loadCargasKpi();
  loadExecutions();
}, 30000);
