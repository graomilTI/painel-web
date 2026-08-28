import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { mensagemFalhaSalvar } from './rls-sessao-expirada.js';

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
const OUROSAFRA_AGENT_ID = 'sync-classificacao-ourosafra';

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
  { id: OUROSAFRA_AGENT_ID, name: 'Classificação Ouro Safra (Laudo)', freq: '10 min (fila 06 · Saída OS)', table: 'ouro_safra_classificacao_execucoes', direction: 'saida' },
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
  ourosafraKpi: null,
  activeTab: 'entrada',
  executions: [],
  executionsLoading: false,
  executionPeriod: '3d',
  executionStatus: 'problemas',
  executionSearch: '',
  executionsUpdatedAt: null,
  queue: [],
  queueLoading: false,
  queueSaving: false,
  queueComposerOpen: false,
  queueSelection: [],
  agentSettings: [],
  settingsEditor: null,
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
.ag-queue{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.75fr);gap:16px}.ag-queue-panel{background:linear-gradient(145deg,rgba(15,23,42,.92),rgba(7,13,26,.94));border:1px solid rgba(148,163,184,.13);border-radius:19px;padding:18px}.ag-queue-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}.ag-queue-head h3{margin:0;color:#f8fafc;font-size:15px}.ag-queue-head p{margin:4px 0 0;color:#64748b;font-size:11px}.ag-queue-actions{display:flex;gap:8px}.ag-queue-item{display:grid;grid-template-columns:35px 42px minmax(0,1fr) auto;align-items:center;gap:11px;padding:11px 10px;border-bottom:1px solid rgba(148,163,184,.09)}.ag-queue-item:last-child{border-bottom:0}.ag-queue-pos{color:#475569;font-weight:950;font-size:11px;text-align:center}.ag-queue-icon{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:rgba(59,130,246,.11);color:#60a5fa}.ag-queue-name strong{display:block;color:#f1f5f9;font-size:12px}.ag-queue-name span{display:block;color:#64748b;font-size:9px;margin-top:3px}.ag-queue-move{display:flex;gap:5px}.ag-icon-btn{width:29px;height:29px;border-radius:8px;border:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.45);color:#94a3b8;cursor:pointer}.ag-icon-btn:hover:not(:disabled){border-color:#3b82f6;color:#bfdbfe}.ag-icon-btn:disabled{opacity:.25;cursor:default}.ag-running{border:1px solid rgba(34,197,94,.18);background:rgba(34,197,94,.04);border-radius:13px;margin-bottom:8px}.ag-running .ag-queue-icon{background:rgba(34,197,94,.12);color:#4ade80}.ag-queue-empty{padding:34px 16px;text-align:center;color:#64748b;font-size:12px}.ag-queue-side{position:sticky;top:16px;align-self:start}.ag-lane-card{padding:13px;border:1px solid rgba(148,163,184,.11);border-radius:13px;margin-bottom:10px}.ag-lane-card span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.ag-lane-card strong{display:block;margin-top:5px;color:#f8fafc;font-size:18px}.ag-composer{grid-column:1/-1;background:rgba(2,6,23,.88);border:1px solid rgba(96,165,250,.25);border-radius:19px;padding:18px}.ag-composer-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin:14px 0}.ag-agent-choice{display:flex;align-items:center;gap:9px;padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:11px;color:#cbd5e1;font-size:11px;cursor:pointer}.ag-agent-choice:has(input:checked){border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.09);color:#eff6ff}.ag-composer-footer{display:flex;justify-content:flex-end;gap:8px}
.ag-exec{display:grid;gap:14px}.ag-exec-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ag-exec-kpi{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(15,23,42,.94),rgba(8,15,29,.9));border:1px solid rgba(148,163,184,.13);border-radius:17px;padding:15px 16px}.ag-exec-kpi::after{content:"";position:absolute;inset:auto -24px -38px auto;width:92px;height:92px;border-radius:50%;background:var(--glow,rgba(59,130,246,.12));filter:blur(2px)}.ag-exec-kpi span{display:block;color:#94a3b8;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.ag-exec-kpi strong{display:block;margin-top:6px;color:#f8fafc;font-size:25px;line-height:1;font-weight:950}.ag-exec-kpi small{display:block;margin-top:7px;color:#64748b;font-size:10px}.ag-exec-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:rgba(15,23,42,.62);border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:10px}.ag-exec-search{min-width:220px;flex:1;background:rgba(2,6,23,.7);border:1px solid rgba(148,163,184,.16);border-radius:11px;color:#e2e8f0;padding:10px 12px;outline:none}.ag-exec-search:focus{border-color:rgba(96,165,250,.55);box-shadow:0 0 0 3px rgba(59,130,246,.1)}.ag-exec-filter{background:rgba(2,6,23,.7);border:1px solid rgba(148,163,184,.16);border-radius:11px;color:#cbd5e1;padding:9px 11px}.ag-exec-refresh{border:1px solid rgba(96,165,250,.26);background:rgba(59,130,246,.1);color:#bfdbfe;border-radius:11px;padding:9px 12px;font-weight:850;cursor:pointer}.ag-exec-refresh:hover{background:rgba(59,130,246,.18)}.ag-exec-updated{margin-left:auto;color:#64748b;font-size:10px}.ag-exec-list{display:grid;gap:6px}.ag-exec-row{display:grid;grid-template-columns:30px minmax(150px,1.1fr) minmax(100px,.6fr) minmax(110px,.65fr) minmax(210px,1.5fr) 88px 20px;gap:9px;align-items:center;background:rgba(15,23,42,.66);border:1px solid rgba(148,163,184,.11);border-left:3px solid var(--status-color,#64748b);border-radius:11px;padding:7px 11px;color:#cbd5e1}.ag-exec-row:hover{background:rgba(15,23,42,.86);border-color:rgba(148,163,184,.2);border-left-color:var(--status-color,#64748b)}.ag-exec-icon{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--status-color) 14%,transparent);color:var(--status-color);font-weight:950;font-size:11px}.ag-exec-agent{display:flex;align-items:baseline;gap:5px;min-width:0;white-space:nowrap;overflow:hidden}.ag-exec-agent strong{color:#f8fafc;font-size:11px;overflow:hidden;text-overflow:ellipsis}.ag-exec-agent code{color:#64748b;font-size:9px;overflow:hidden;text-overflow:ellipsis}.ag-exec-time,.ag-exec-duration{color:#94a3b8;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-exec-error{min-width:0;color:#94a3b8;font-size:10px;line-height:1.35;overflow:hidden}.ag-exec-error strong{display:block;color:#e2e8f0;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-exec-error span{display:block;margin-top:1px;color:#64748b;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-exec-error:not(:has(strong)){white-space:nowrap;text-overflow:ellipsis}.ag-exec-retry{justify-self:end;border:1px solid rgba(96,165,250,.28);background:rgba(59,130,246,.1);color:#bfdbfe;border-radius:8px;padding:5px 9px;font-size:10px;font-weight:800;cursor:pointer;white-space:nowrap}.ag-exec-retry:hover{background:rgba(59,130,246,.2)}.ag-exec-chevron{color:#64748b;text-align:center;font-size:11px}.ag-exec-detail{grid-column:1/-1;margin:2px 0 0;padding:12px;background:rgba(2,6,23,.72);border-radius:10px;border:1px solid rgba(148,163,184,.1);white-space:pre-wrap;word-break:break-word;font:10px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:#94a3b8}.ag-exec-empty{text-align:center;padding:52px 20px;border:1px dashed rgba(148,163,184,.17);border-radius:16px;color:#64748b}.ag-exec-empty strong{display:block;color:#cbd5e1;margin-bottom:5px}.ag-exec-health{display:flex;align-items:center;gap:8px;font-size:11px;color:#94a3b8}.ag-exec-health-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 9px rgba(34,197,94,.55)}
@media(max-width:980px){.ag-exec-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.ag-exec-row{grid-template-columns:26px 1fr 1fr}.ag-exec-duration,.ag-exec-error,.ag-exec-retry{grid-column:2/-1}.ag-exec-retry{justify-self:start}.ag-exec-chevron{position:absolute;right:14px}.ag-exec-row{position:relative}}
@media(max-width:560px){.ag-exec-summary{grid-template-columns:1fr 1fr}.ag-exec-row{grid-template-columns:38px 1fr}.ag-exec-time,.ag-exec-duration,.ag-exec-error{grid-column:2}.ag-exec-toolbar>*{width:100%}.ag-exec-updated{margin-left:0;text-align:center}}
@media(max-width:900px){.ag-queue{grid-template-columns:1fr}.ag-queue-side{position:static}.ag-queue-item{grid-template-columns:28px 36px minmax(0,1fr) auto}}
.ag-queue-board{display:grid;gap:14px}.ag-q-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid rgba(148,163,184,.13);border-radius:16px;background:rgba(15,23,42,.7)}.ag-q-toolbar>div:first-child strong,.ag-q-toolbar>div:first-child span{display:block}.ag-q-toolbar>div:first-child strong{color:#f8fafc;font-size:14px}.ag-q-toolbar>div:first-child span{margin-top:3px;color:#64748b;font-size:10px}.ag-q-toolbar>div:last-child{display:flex;gap:8px}.ag-q-lane{--lane:#3b82f6;overflow:hidden;border:1px solid color-mix(in srgb,var(--lane) 24%,rgba(148,163,184,.1));border-radius:19px;background:linear-gradient(145deg,rgba(15,23,42,.92),rgba(5,11,22,.96));box-shadow:inset 3px 0 0 var(--lane)}.ag-q-lane.cyan{--lane:#06b6d4}.ag-q-lane.orange{--lane:#f97316}.ag-q-lane.green{--lane:#22c55e}.ag-q-lane>header{display:grid;grid-template-columns:minmax(180px,1fr) 150px 150px auto;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(148,163,184,.1);background:linear-gradient(90deg,color-mix(in srgb,var(--lane) 10%,transparent),transparent 45%)}.ag-q-lane>header>div:first-child span,.ag-q-lane>header>div:first-child strong{display:block}.ag-q-lane>header>div:first-child span{color:var(--lane);font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.ag-q-lane>header>div:first-child strong{margin-top:3px;color:#e2e8f0;font-size:13px}.ag-q-lane>header em{color:#64748b;font-size:10px;font-style:normal;text-align:right}.ag-q-lane-kpi{padding-left:13px;border-left:1px solid rgba(148,163,184,.12)}.ag-q-lane-kpi small,.ag-q-lane-kpi b{display:block}.ag-q-lane-kpi small{color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:.05em}.ag-q-lane-kpi b{margin-top:3px;color:#f8fafc;font-size:13px}.ag-q-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:9px;padding:11px}.ag-q-card{min-width:0;border:1px solid rgba(148,163,184,.11);border-radius:14px;background:rgba(7,15,29,.78);padding:12px;transition:.15s ease}.ag-q-card:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--lane) 40%,transparent);background:rgba(10,20,37,.94)}.ag-q-card.rodando{border-color:rgba(59,130,246,.38);box-shadow:0 0 0 1px rgba(59,130,246,.08)}.ag-q-card.pendente{border-color:rgba(234,179,8,.26)}.ag-q-card-top{display:grid;grid-template-columns:minmax(0,1fr) 8px auto auto;align-items:center;gap:7px}.ag-q-card-top>div strong,.ag-q-card-top>div code{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ag-q-card-top>div strong{color:#f8fafc;font-size:12px}.ag-q-card-top>div code{margin-top:3px;color:#475569;font-size:8px}.ag-q-card-top b{font-size:10px}.ag-q-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:11px}.ag-q-kpis span{min-width:0;color:#64748b;font-size:8px;text-transform:uppercase;letter-spacing:.04em}.ag-q-kpis strong{display:block;margin-top:3px;color:#cbd5e1;font-size:10px;text-transform:none;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-q-card-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:11px;padding-top:9px;border-top:1px solid rgba(148,163,184,.08)}.ag-q-card-footer small{color:#64748b;font-size:9px}.ag-q-card-footer>div{display:flex;gap:5px}.ag-q-priority{border:1px solid color-mix(in srgb,var(--lane) 30%,transparent);border-radius:8px;background:color-mix(in srgb,var(--lane) 10%,transparent);color:#cbd5e1;padding:5px 8px;font-size:9px;font-weight:850;cursor:pointer}.ag-q-priority:hover{background:color-mix(in srgb,var(--lane) 20%,transparent);color:#fff}
.ag-q-card{position:relative}.ag-q-edit{position:absolute;top:8px;right:8px;width:25px;height:25px;display:grid;place-items:center;border:1px solid rgba(148,163,184,.14);border-radius:8px;background:rgba(2,6,23,.72);color:#94a3b8;cursor:pointer;font-size:12px;z-index:2}.ag-q-edit:hover{color:#fff;border-color:var(--lane)}.ag-q-card-top{padding-right:27px}.ag-q-schedule{color:var(--lane)!important}.ag-settings-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(1,4,12,.78);backdrop-filter:blur(8px);display:grid;place-items:center;padding:20px}.ag-settings-modal{width:min(470px,100%);border:1px solid rgba(96,165,250,.3);border-radius:20px;background:linear-gradient(145deg,#0f172a,#050b16);box-shadow:0 28px 80px rgba(0,0,0,.55);padding:20px}.ag-settings-modal header{display:flex;justify-content:space-between;gap:12px;margin-bottom:18px}.ag-settings-modal h3{margin:0;color:#f8fafc;font-size:16px}.ag-settings-modal header span{display:block;margin-top:4px;color:#64748b;font-size:10px}.ag-settings-close{border:0;background:transparent;color:#94a3b8;font-size:20px;cursor:pointer}.ag-settings-field{display:block;margin-top:13px}.ag-settings-field>span{display:block;margin-bottom:6px;color:#94a3b8;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.ag-settings-field select{width:100%;border:1px solid rgba(148,163,184,.16);border-radius:11px;background:#08111f;color:#e2e8f0;padding:11px 12px;outline:none}.ag-settings-hint{margin:14px 0 0;padding:10px 12px;border-radius:11px;background:rgba(59,130,246,.08);color:#94a3b8;font-size:10px;line-height:1.5}.ag-settings-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.ag-capacity-layout{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:14px;align-items:start}.ag-capacity-side{position:sticky;top:16px;overflow:hidden;border:1px solid rgba(45,212,191,.2);border-radius:19px;background:linear-gradient(155deg,rgba(9,25,35,.98),rgba(4,10,21,.98));box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 18px 55px rgba(0,0,0,.2)}.ag-capacity-head{padding:17px 17px 14px;border-bottom:1px solid rgba(148,163,184,.1);background:radial-gradient(circle at 100% 0,rgba(45,212,191,.14),transparent 55%)}.ag-capacity-head span{display:block;color:#2dd4bf;font-size:9px;font-weight:950;letter-spacing:.12em;text-transform:uppercase}.ag-capacity-head strong{display:block;margin-top:5px;color:#f8fafc;font-size:15px}.ag-capacity-head small{display:block;margin-top:4px;color:#64748b;font-size:9px;line-height:1.4}.ag-capacity-body{display:grid;gap:15px;padding:16px}.ag-resource-label{display:flex;align-items:end;justify-content:space-between;gap:8px}.ag-resource-label span{color:#94a3b8;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.ag-resource-label strong{color:#f8fafc;font-size:12px}.ag-resource-track{height:8px;margin-top:8px;overflow:hidden;border-radius:99px;background:rgba(148,163,184,.1)}.ag-resource-fill{height:100%;width:var(--usage);border-radius:inherit;background:linear-gradient(90deg,#14b8a6,#2dd4bf);box-shadow:0 0 14px rgba(45,212,191,.28)}.ag-resource-fill.warn{background:linear-gradient(90deg,#f59e0b,#fb7185)}.ag-resource-meta{display:flex;justify-content:space-between;margin-top:6px;color:#64748b;font-size:9px}.ag-capacity-margin{padding:13px;border:1px solid rgba(45,212,191,.16);border-radius:13px;background:rgba(45,212,191,.055)}.ag-capacity-margin span,.ag-capacity-margin strong,.ag-capacity-margin small{display:block}.ag-capacity-margin span{color:#5eead4;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ag-capacity-margin strong{margin-top:5px;color:#ecfeff;font-size:21px}.ag-capacity-margin small{margin-top:5px;color:#64748b;font-size:9px;line-height:1.45}.ag-capacity-empty{padding:20px 17px;color:#64748b;font-size:10px;line-height:1.5}.ag-capacity-note{padding:11px 16px;border-top:1px solid rgba(148,163,184,.08);color:#475569;font-size:8px;line-height:1.45}
@media(max-width:1180px){.ag-capacity-layout{grid-template-columns:1fr}.ag-capacity-side{position:static}.ag-capacity-body{grid-template-columns:repeat(3,minmax(0,1fr));align-items:end}.ag-capacity-margin{height:100%;box-sizing:border-box}}
@media(max-width:700px){.ag-capacity-body{grid-template-columns:1fr}}
@media(max-width:760px){.ag-q-toolbar{align-items:flex-start;flex-direction:column}.ag-q-toolbar>div:last-child{width:100%}.ag-q-toolbar button{flex:1}.ag-q-lane>header{grid-template-columns:1fr 1fr}.ag-q-lane>header>div:first-child{grid-column:1/-1}.ag-q-lane>header em{grid-column:1/-1;text-align:left}.ag-q-cards{grid-template-columns:1fr}}
/* O <details> precisa ser o contêiner; somente o <summary> compõe a grade. */
.ag-exec-row{display:block;padding:0;overflow:hidden}
.ag-exec-row>summary{display:grid;grid-template-columns:30px minmax(150px,1.1fr) minmax(100px,.6fr) minmax(110px,.65fr) minmax(210px,1.5fr) 88px 20px;gap:9px;align-items:center;padding:7px 11px;cursor:pointer;list-style:none}
.ag-exec-row>summary::-webkit-details-marker{display:none}
.ag-exec-row[open]>summary{border-bottom:1px solid rgba(148,163,184,.1)}
.ag-exec-row[open] .ag-exec-chevron{transform:rotate(180deg)}
.ag-exec-chevron{transition:transform .18s ease}
.ag-exec-detail{display:block;grid-column:auto;width:auto;max-height:360px;overflow:auto;margin:0;padding:14px 16px;border:0;border-radius:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal}
@media(max-width:980px){.ag-exec-row>summary{grid-template-columns:26px 1fr 1fr;position:relative}.ag-exec-duration,.ag-exec-error,.ag-exec-retry{grid-column:2/-1}.ag-exec-retry{justify-self:start}.ag-exec-chevron{position:absolute;right:14px}.ag-exec-detail{max-height:300px}}
@media(max-width:560px){.ag-exec-row>summary{grid-template-columns:24px 1fr}.ag-exec-time,.ag-exec-duration,.ag-exec-error,.ag-exec-retry{grid-column:2}.ag-exec-retry{justify-self:start}.ag-exec-detail{padding:12px;font-size:9px}}
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

function formatMs(value) {
  const ms = Number(value || 0);
  if (ms <= 0) return 'Sem histórico';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatMemory(value) {
  const mb = Number(value || 0);
  return mb > 0 ? `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : 'Aguardando medição';
}

function formatCapacity(value) {
  const mb = Number(value || 0);
  if (mb >= 1024) return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
  return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function formatInterval(minutes) {
  const value = Number(minutes || 0);
  if (value < 60) return `${value} min`;
  if (value % 1440 === 0) return `${value / 1440} dia${value === 1440 ? '' : 's'}`;
  if (value % 60 === 0) return `${value / 60}h`;
  return `${Math.floor(value / 60)}h ${value % 60}min`;
}

function renderSettingsEditor() {
  const editor = state.settingsEditor;
  if (!editor) return '';
  const agent = AGENTES.find((item) => item.id === editor.agent_id);
  const intervals = [0, 5, 10, 15, 30, 60, 120, 360, 720, 1440, 2880, 10080];
  return `<div class="ag-settings-backdrop" onclick="if(event.target===this)closeAgentSettings()"><form class="ag-settings-modal" onsubmit="saveAgentSettings(event)"><header><div><h3>Editar agente</h3><span>${esc(agent?.name || editor.agent_id)}</span></div><button class="ag-settings-close" type="button" onclick="closeAgentSettings()">×</button></header>
    <label class="ag-settings-field"><span>Fila de execução</span><select name="queue_lane"><option value="fixed_a" ${editor.queue_lane === 'fixed_a' ? 'selected' : ''}>Entrada 1 · fixed-a</option><option value="fixed_b" ${editor.queue_lane === 'fixed_b' ? 'selected' : ''}>Entrada 2 · fixed-b</option><option value="fixed_c" ${editor.queue_lane === 'fixed_c' ? 'selected' : ''}>Entrada 3 · fixed-c</option><option value="alteracoes" ${editor.queue_lane === 'alteracoes' ? 'selected' : ''}>Saída 1 · alterações</option><option value="despesas_distribuicao" ${editor.queue_lane === 'despesas_distribuicao' ? 'selected' : ''}>Saída 2 · despesas/distribuição</option></select></label>
    <label class="ag-settings-field"><span>Intervalo de execução</span><select name="interval_minutes">${intervals.map((value) => `<option value="${value}" ${Number(editor.interval_minutes) === value ? 'selected' : ''}>${value === 0 ? 'Manual / sob demanda' : `A cada ${formatInterval(value)}`}</option>`).join('')}</select></label>
    <p class="ag-settings-hint">A alteração afeta os próximos jobs. Se o agente estiver executando, ele termina normalmente; jobs pendentes migram para a nova fila.</p><div class="ag-settings-actions"><button class="ag-btn ag-btn-danger" type="button" onclick="closeAgentSettings()">Cancelar</button><button class="ag-btn ag-btn-primary" type="submit" ${state.queueSaving ? 'disabled' : ''}>${state.queueSaving ? 'Salvando…' : 'Salvar configuração'}</button></div></form></div>`;
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

function renderOurosafraKpi() {
  const agente = state.agentes.find((x) => x.id === OUROSAFRA_AGENT_ID) || AGENTES.find((x) => x.id === OUROSAFRA_AGENT_ID);
  const meta = getAgenteMeta(agente);
  const kpi = state.ourosafraKpi;
  const last = kpi?.lastRun;
  const lastStatusLabel = last?.status ? (STATUS_META[last.status]?.label || last.status) : null;

  return `<div class="ag-btg-kpi" onclick="selectAgent('${OUROSAFRA_AGENT_ID}')">
    <div class="ag-btg-kpi-head">
      <div>
        <div class="ag-btg-kpi-title">🌾 KPI · Classificação Ouro Safra (Laudo)</div>
        <div class="ag-btg-kpi-sub">Casa placas "Aguardando Classificação" no painel Ouro Safra com o GRM e anexa o laudo. Fila 06 · Saída OS, a cada 10 min.</div>
      </div>
      <div class="ag-btg-kpi-status" style="color:${meta.color}"><span class="ag-status-dot ${meta.ui}"></span>${meta.label}</div>
    </div>
    <div class="ag-btg-kpi-grid">
      <div class="ag-btg-kpi-item"><span>Última execução</span><strong>${formatDate(last?.iniciado_em)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Última placa</span><strong>${esc(last?.placa || 'N/A')}${lastStatusLabel ? ` · ${esc(lastStatusLabel)}` : ''}</strong></div>
      <div class="ag-btg-kpi-item"><span>Sucesso (30d)</span><strong style="color:#86efac">${formatInt(kpi?.sucesso30d)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Erros (30d)</span><strong style="color:${kpi?.erro30d ? '#fca5a5' : '#86efac'}">${formatInt(kpi?.erro30d)}</strong></div>
    </div>
  </div>`;
}

async function loadOurosafraKpi() {
  try {
    const [lastRes, periodRes] = await Promise.all([
      supabase
        .from('ouro_safra_classificacao_execucoes')
        .select('placa, os_grm, status, erro, duracao_ms, iniciado_em')
        .order('iniciado_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('ouro_safra_classificacao_execucoes')
        .select('status, iniciado_em')
        .gte('iniciado_em', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);
    const rows = periodRes.data || [];
    state.ourosafraKpi = {
      lastRun: lastRes.data || null,
      total30d: rows.length,
      sucesso30d: rows.filter((r) => r.status === 'sucesso').length,
      erro30d: rows.filter((r) => r.status === 'erro').length,
    };
  } catch (e) {
    console.error('Erro carregando KPI de Classificação Ouro Safra:', e);
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

// O campo "erro" costuma ser só o wrapper genérico do worker ("Script saiu com
// código 1"); a causa real fica na última linha [ERROR] do stdout do script.
function extractRootErrorMessage(job) {
  const stdout = job?.output?.stdout || '';
  const clean = (line) => line.replace(/^\[ERROR\]\s*[\d-]+T[\d:.]+Z\s*-\s*/, '').trim();
  const errorLines = stdout.split('\n').map((l) => l.trim()).filter((l) => /^\[ERROR\]/.test(l)).map(clean);
  // Ignora resumos genéricos ("Todas as supervisões falharam.") e prefere a
  // falha específica que causou o resumo.
  const specific = errorLines.filter((l) => !/^(todas as \w+ falharam|concluído:)/i.test(l));
  if (specific.length) return specific[specific.length - 1];
  if (errorLines.length) return errorLines[errorLines.length - 1];
  return job?.erro || job?.output?.stderr || '';
}

// Traduz a causa raiz em algo acionável, sem precisar abrir o log completo.
const EXECUTION_DIAGNOSTIC_RULES = [
  { test: /waiting for selector|\d+ms exceeded|timeout/i, label: 'Graint demorou a responder', action: 'Falha passageira do site do Graint — o próximo ciclo automático já tenta de novo. Se persistir, reprocesse.' },
  { test: /colaborador não encontrado/i, label: 'Colaborador não encontrado no Graint', action: 'Confira se o nome/supervisão do colaborador no painel bate com o cadastro dele no Graint.' },
  { test: /lease do worker expirou/i, label: 'Execução travou sem resposta', action: 'Reprocesse manualmente; se travar de novo, avise TI para checar o worker no cPanel.' },
  { test: /login|senha|credencial|autenticaç/i, label: 'Falha de login no Graint', action: 'Verifique o usuário/senha do Graint configurados no worker.' },
  { test: /econnrefused|enotfound|fetch failed|network|net::/i, label: 'Falha de conexão', action: 'Problema de rede ou Graint fora do ar — reprocesse em alguns minutos.' },
  { test: /todas as supervisões falharam/i, label: 'Nenhuma supervisão foi aplicada neste ciclo', action: 'Abra os detalhes para ver qual supervisão falhou e por quê; reprocesse depois de identificar.' },
];

function getExecutionDiagnostic(job) {
  if (isStuckExecution(job)) {
    return { label: 'Travado há mais de 20 min', action: 'Pode estar preso — reprocesse ou peça pra TI verificar o worker.', canRetry: true };
  }
  const status = String(job?.status || '').toLowerCase();
  if (status !== 'erro' && status !== 'parcial') return null;
  const raw = extractRootErrorMessage(job);
  const rule = EXECUTION_DIAGNOSTIC_RULES.find((r) => r.test.test(raw));
  return {
    label: rule ? rule.label : (raw ? raw.slice(0, 140) : 'Falha sem detalhe registrado'),
    action: rule ? rule.action : 'Abra os detalhes para ver o log completo; reprocesse se achar que foi passageiro.',
    canRetry: true,
  };
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
        const diag = getExecutionDiagnostic(job);
        const output = [job.erro, job.output?.stderr, job.output?.stdout].filter(Boolean).join('\n\n').slice(-6000);
        return `<details class="ag-exec-row" style="--status-color:${meta.color}">
          <summary style="display:contents;cursor:pointer">
            <div class="ag-exec-icon">${meta.icon}</div>
            <div class="ag-exec-agent" title="${esc(job.agente_id)}"><strong>${esc(getExecutionAgentName(job.agente_id))}</strong><code>${esc(job.agente_id)}</code></div>
            <div class="ag-exec-time">${esc(meta.label)} · ${formatDate(job.created_at)}</div>
            <div class="ag-exec-duration">${esc(formatDuration(getExecutionDuration(job)))} · ${job.finalizado_em ? 'encerrada' : 'em andamento'}</div>
            ${diag
              ? `<div class="ag-exec-error" title="${esc(diag.action)}"><strong>${esc(diag.label)}</strong><span>${esc(diag.action)}</span></div><button class="ag-exec-retry" type="button" title="Reprocessar agora" onclick="event.preventDefault();event.stopPropagation();executeAgent('${esc(job.agente_id)}')">↻ Reprocessar</button>`
              : `<div class="ag-exec-error" title="${esc(error)}">${esc(error)}</div><span></span>`}
            <div class="ag-exec-chevron">⌄</div>
          </summary>
          <div class="ag-exec-detail">Job: ${esc(job.id)}\nCriado: ${formatDate(job.created_at)}\nIniciado: ${formatDate(job.iniciado_em)}\nFinalizado: ${formatDate(job.finalizado_em)}\n\n${esc(output || error)}</div>
        </details>`;
      }).join('')}</div>`
      : '<div class="ag-exec-empty"><strong>Nenhum problema encontrado</strong>Os agentes não apresentam falhas ou travamentos para os filtros selecionados.</div>';

  return `<section class="ag-exec" aria-label="Relatório de execuções dos agentes">${cards}${toolbar}<div class="ag-exec-health"><span class="ag-exec-health-dot"></span>Monitoramento automático a cada 30 segundos</div>${list}</section>`;
}

function renderCapacitySidebar() {
  const measured = [...state.queue, ...state.executions].filter((job) => Number(job.vps_memory_total_mb) > 0);
  if (!measured.length) {
    return `<aside class="ag-capacity-side"><div class="ag-capacity-head"><span>Capacidade do host</span><strong>VPS · Recursos</strong><small>Telemetria coletada durante os agentes</small></div><div class="ag-capacity-empty">Aguardando a primeira execução com o novo monitoramento do VPS.</div></aside>`;
  }

  const latest = measured.reduce((current, job) => new Date(job.created_at || 0) > new Date(current.created_at || 0) ? job : current);
  const running = measured.filter((job) => job.status === 'rodando');
  const recent = state.executions.filter((job) => Number(job.vps_memory_peak_mb) > 0).slice(0, 100);
  const memoryTotal = Number(latest.vps_memory_total_mb || 0);
  const memoryUsed = running.length
    ? Math.max(...running.map((job) => Number(job.vps_memory_peak_mb || 0)))
    : Math.max(...recent.map((job) => Number(job.vps_memory_peak_mb || 0)), Number(latest.vps_memory_peak_mb || 0));
  const diskTotal = Number(latest.vps_disk_total_mb || 0);
  const diskUsed = Number(latest.vps_disk_used_mb || 0);
  const memoryPct = memoryTotal ? Math.min(100, memoryUsed / memoryTotal * 100) : 0;
  const diskPct = diskTotal ? Math.min(100, diskUsed / diskTotal * 100) : 0;
  const safeLimit = memoryTotal * .8;
  const safeMargin = Math.max(0, safeLimit - memoryUsed);
  const agentSamples = state.executions.filter((job) => Number(job.memory_peak_mb) > 0).slice(0, 100);
  const typicalAgentMb = agentSamples.length ? agentSamples.reduce((sum, job) => sum + Number(job.memory_peak_mb), 0) / agentSamples.length : 0;
  const extraLanes = typicalAgentMb > 0 ? Math.max(0, Math.floor(safeMargin / typicalAgentMb)) : null;
  const status = memoryPct >= 80 ? 'Limite operacional atingido' : memoryPct >= 65 ? 'Capacidade sob atenção' : 'Capacidade saudável';
  const resource = (label, used, total, pct) => `<div><div class="ag-resource-label"><span>${label}</span><strong>${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</strong></div><div class="ag-resource-track"><div class="ag-resource-fill ${pct >= 80 ? 'warn' : ''}" style="--usage:${pct}%"></div></div><div class="ag-resource-meta"><span>${formatCapacity(used)} usados</span><span>${formatCapacity(total)} total</span></div></div>`;

  return `<aside class="ag-capacity-side"><div class="ag-capacity-head"><span>Capacidade do host</span><strong>VPS · Recursos</strong><small>${status} · pico observado nas execuções</small></div><div class="ag-capacity-body">${resource('RAM · pico', memoryUsed, memoryTotal, memoryPct)}${resource('SSD', diskUsed, diskTotal, diskPct)}<div class="ag-capacity-margin"><span>Margem até 80% da RAM</span><strong>${formatCapacity(safeMargin)}</strong><small>${extraLanes == null ? 'Aguardando histórico dos agentes.' : `Projeção: até ${extraLanes} nova${extraLanes === 1 ? '' : 's'} fila${extraLanes === 1 ? '' : 's'} simultânea${extraLanes === 1 ? '' : 's'}.`}</small></div></div><div class="ag-capacity-note">A projeção divide a margem segura pelo pico médio da árvore de processos dos últimos 100 jobs. Valide gradualmente antes de liberar novas filas.</div></aside>`;
}

function renderQueue() {
  const entryAgents = AGENTES.filter((a) => getDirection(a) === 'entrada');
  const settingFor = (agentId) => state.agentSettings.find((item) => item.agent_id === agentId);
  const inConfiguredLane = (agent, lane, fallback) => settingFor(agent.id)?.queue_lane ? settingFor(agent.id).queue_lane === lane : fallback;
  const laneDefs = [
    { id: 'entrada-1', title: 'Entrada 1', subtitle: 'Worker fixed-a', lane: 'fixed_a', agents: AGENTES.filter((a) => inConfiguredLane(a, 'fixed_a', getDirection(a) === 'entrada' && entryAgents.indexOf(a) % 2 === 0)), tone: 'blue' },
    { id: 'entrada-2', title: 'Entrada 2', subtitle: 'Worker fixed-b', lane: 'fixed_b', agents: AGENTES.filter((a) => inConfiguredLane(a, 'fixed_b', getDirection(a) === 'entrada' && entryAgents.indexOf(a) % 2 === 1)), tone: 'cyan' },
    { id: 'entrada-3', title: 'Entrada 3', subtitle: 'Worker fixed-c', lane: 'fixed_c', agents: AGENTES.filter((a) => inConfiguredLane(a, 'fixed_c', false)), tone: 'blue' },
    { id: 'saida-1', title: 'Saída 1', subtitle: 'Alterações no GRM', lane: 'alteracoes', agents: AGENTES.filter((a) => inConfiguredLane(a, 'alteracoes', getDirection(a) === 'saida' && !['aplicar-distribuicao-os', 'sync-liberacao-despesas'].includes(a.id))), tone: 'orange' },
    { id: 'saida-2', title: 'Saída 2', subtitle: 'Despesas e distribuição', lane: 'despesas_distribuicao', agents: AGENTES.filter((a) => inConfiguredLane(a, 'despesas_distribuicao', ['aplicar-distribuicao-os', 'sync-liberacao-despesas'].includes(a.id))), tone: 'green' },
  ];
  const historyFor = (agentId) => state.executions.filter((job) => job.agente_id === agentId && Number(job.duration_ms) > 0 && ['sucesso', 'erro', 'parcial'].includes(String(job.status)));
  const metricsFor = (agentId) => {
    const history = historyFor(agentId).slice(0, 20);
    const memoryRows = history.filter((job) => Number(job.memory_peak_mb) > 0);
    const vpsMemoryRows = history.filter((job) => Number(job.vps_memory_peak_mb) > 0);
    return {
      avgMs: history.length ? history.reduce((sum, job) => sum + Number(job.duration_ms), 0) / history.length : 0,
      avgMemory: memoryRows.length ? memoryRows.reduce((sum, job) => sum + Number(job.memory_peak_mb), 0) / memoryRows.length : 0,
      avgVpsMemory: vpsMemoryRows.length ? vpsMemoryRows.reduce((sum, job) => sum + Number(job.vps_memory_peak_mb), 0) / vpsMemoryRows.length : 0,
    };
  };
  const openJobFor = (agentId) => state.queue.find((job) => job.agente_id === agentId && job.status === 'rodando') || state.queue.find((job) => job.agente_id === agentId && job.status === 'pendente');
  const card = (agent, lane) => {
    const data = state.agentes.find((item) => item.id === agent.id);
    const job = openJobFor(agent.id);
    const meta = job?.status === 'rodando' ? STATUS_META.rodando : job?.status === 'pendente' ? STATUS_META.pendente : getAgenteMeta(data);
    const metrics = metricsFor(agent.id);
    const lanePending = state.queue.filter((item) => item.lane === lane && item.status === 'pendente');
    const queueIndex = job?.status === 'pendente' ? lanePending.findIndex((item) => item.id === job.id) : -1;
    const setting = settingFor(agent.id);
    const intervalLabel = !setting || Number(setting.interval_minutes) === 0 ? 'Manual / sob demanda' : `A cada ${formatInterval(setting.interval_minutes)}`;
    return `<article class="ag-q-card ${job?.status || ''}">
      <button class="ag-q-edit" type="button" onclick="openAgentSettings('${agent.id}')" title="Editar fila e intervalo" aria-label="Editar ${esc(agent.name)}">✎</button>
      <div class="ag-q-card-top"><div><strong>${esc(agent.name)}</strong><code>${esc(agent.id)}</code></div><span class="ag-status-dot ${meta.ui}"></span><b style="color:${meta.color}">${meta.label}</b><span class="ag-dir-badge ${getDirection(agent)}">${getDirection(agent)}</span></div>
      <div class="ag-q-kpis"><span>Total<strong>${formatInt(data?.total_records)}</strong></span><span>Última sync<strong>${formatDate(data?.ultima_sync)}</strong></span><span>${job?.status === 'rodando' ? 'Memória em uso' : 'Memória média'}<strong>${formatMemory(job?.status === 'rodando' ? job.memory_peak_mb : metrics.avgMemory)}</strong></span><span>Média de execução<strong>${formatMs(metrics.avgMs)}</strong></span></div>
      <div class="ag-q-card-footer"><small><span class="ag-q-schedule">${esc(intervalLabel)}</span> · ${job?.status === 'rodando' ? `Executando em ${esc(job.worker_id || lane)}` : job?.status === 'pendente' ? `Posição ${queueIndex + 1}` : 'Fora da fila atual'}</small><div>${job?.status === 'pendente' ? `<button class="ag-icon-btn" ${queueIndex === 0 ? 'disabled' : ''} onclick="moveQueueJob('${job.id}',-1)" title="Subir na fila">↑</button><button class="ag-icon-btn" ${queueIndex === lanePending.length - 1 ? 'disabled' : ''} onclick="moveQueueJob('${job.id}',1)" title="Descer na fila">↓</button>` : `<button class="ag-q-priority" onclick="event.stopPropagation();executeAgent('${agent.id}')">Priorizar</button>`}</div></div>
    </article>`;
  };
  const lane = (definition) => {
    const metricRows = definition.agents.map((agent) => metricsFor(agent.id));
    const runningJobs = state.queue.filter((job) => job.lane === definition.lane && job.status === 'rodando');
    const runningMemory = Math.max(0, ...runningJobs.map((job) => Number(job.vps_memory_peak_mb || 0)));
    const memoryEstimate = Math.max(0, ...metricRows.map((item) => item.avgVpsMemory));
    const memoryTotal = runningMemory || memoryEstimate;
    const timed = metricRows.filter((item) => item.avgMs > 0);
    const resetMs = timed.reduce((sum, item) => sum + item.avgMs, 0);
    const open = state.queue.filter((job) => job.lane === definition.lane);
    return `<section class="ag-q-lane ${definition.tone}"><header><div><span>${esc(definition.title)}</span><strong>${esc(definition.subtitle)}</strong></div><div class="ag-q-lane-kpi"><small>${runningMemory ? 'Pico RAM do VPS' : 'Pico VPS estimado'}</small><b>${formatMemory(memoryTotal)}</b></div><div class="ag-q-lane-kpi"><small>Tempo p/ resetar</small><b>${formatMs(resetMs)}</b></div><em>${open.filter((j) => j.status === 'rodando').length} rodando · ${open.filter((j) => j.status === 'pendente').length} aguardando</em></header><div class="ag-q-cards">${definition.agents.map((agent) => card(agent, definition.lane)).join('')}</div></section>`;
  };
  const choices = AGENTES.filter((a) => getDirection(a) === 'entrada' && a.freq.includes('fila fixa')).map((agent) => `<label class="ag-agent-choice"><input type="checkbox" value="${esc(agent.id)}" ${state.queueSelection.includes(agent.id) ? 'checked' : ''} onchange="toggleQueueAgent('${esc(agent.id)}',this.checked)"><span>${esc(agent.name)}</span></label>`).join('');
  const composer = state.queueComposerOpen ? `<div class="ag-composer"><div class="ag-queue-head"><div><h3>Montar nova fila</h3><p>Selecione um ou mais agentes. Eles entram na ordem apresentada, depois dos jobs atuais.</p></div></div><div class="ag-composer-grid">${choices}</div><div class="ag-composer-footer"><button class="ag-btn ag-btn-danger" onclick="closeQueueComposer()">Cancelar</button><button class="ag-btn ag-btn-primary" ${!state.queueSelection.length || state.queueSaving ? 'disabled' : ''} onclick="createQueue()">${state.queueSaving ? 'Criando…' : `Abrir fila (${state.queueSelection.length})`}</button></div></div>` : '';
  return `<div class="ag-capacity-layout"><section class="ag-queue-board" aria-label="Gerenciamento da fila de agentes"><div class="ag-q-toolbar"><div><strong>Mapa operacional das filas</strong><span>Pico global do VPS e KPIs por agente</span></div><div><button class="ag-exec-refresh" onclick="loadQueue(true)">↻ Atualizar</button><button class="ag-btn ag-btn-primary" onclick="openQueueComposer()">＋ Nova fila</button></div></div>${state.queueLoading ? '<div class="ag-queue-empty">Consultando as filas…</div>' : laneDefs.map(lane).join('')}${composer}${renderSettingsEditor()}</section>${renderCapacitySidebar()}</div>`;
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
        <button class="ag-tab ${state.activeTab === 'fila' ? 'active' : ''}" onclick="setTab('fila')" type="button">☷ Fila <span class="ag-tab-count">${state.queue.filter((j) => j.status === 'pendente').length}</span></button>
      </div>
      ${['execucoes', 'fila'].includes(state.activeTab) ? '' : `<div class="ag-stats">
        <div class="ag-stat"><div class="ag-stat-val">${visiveis.length}</div><div class="ag-stat-lbl">Agentes nesta aba</div></div>
        <div class="ag-stat"><div class="ag-stat-val" style="color:#22c55e">${statusCount.online}</div><div class="ag-stat-lbl">Online</div></div>
        <div class="ag-stat"><div class="ag-stat-val" style="color:#ef4444">${statusCount.error}</div><div class="ag-stat-lbl">Com Erro</div></div>
      </div>`}
      ${state.activeTab === 'entrada' ? renderBtgKpi() : ''}
      ${state.activeTab === 'entrada' ? renderCargasKpi() : ''}
      ${state.activeTab === 'saida' ? renderOurosafraKpi() : ''}
    </div>`;

  if (state.activeTab === 'execucoes') {
    html += renderExecutions();
    html += '</div>';
    return html;
  }
  if (state.activeTab === 'fila') {
    html += renderQueue();
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
  state.activeTab = ['entrada', 'saida', 'execucoes', 'fila'].includes(tab) ? tab : 'entrada';
  state.selectedAgent = null;
  render();
  if (state.activeTab === 'fila') loadQueue();
};

window.loadQueue = (showLoading = false) => loadQueue(showLoading);
window.openAgentSettings = (agentId) => {
  const fallbackIndex = AGENTES.filter((a) => getDirection(a) === 'entrada' && a.freq.includes('fila fixa')).findIndex((a) => a.id === agentId);
  const current = state.agentSettings.find((item) => item.agent_id === agentId) || {
    agent_id: agentId,
    queue_lane: getDirection(AGENTES.find((item) => item.id === agentId)) === 'entrada' ? (fallbackIndex % 2 === 0 ? 'fixed_a' : 'fixed_b') : 'alteracoes',
    interval_minutes: 0,
  };
  state.settingsEditor = { ...current };
  render();
};
window.closeAgentSettings = () => { state.settingsEditor = null; render(); };
window.saveAgentSettings = async (event) => {
  event.preventDefault();
  if (!state.settingsEditor || state.queueSaving) return;
  const form = event.currentTarget;
  state.queueSaving = true;
  render();
  try {
    const { data, error } = await supabase.rpc('update_grm_sync_agent_setting', {
      p_agent_id: state.settingsEditor.agent_id,
      p_queue_lane: form.elements.queue_lane.value,
      p_interval_minutes: Number(form.elements.interval_minutes.value),
    });
    if (error) throw error;
    state.agentSettings = state.agentSettings.filter((item) => item.agent_id !== data.agent_id).concat(data);
    state.settingsEditor = null;
    await loadQueue();
  } catch (error) {
    alert(await mensagemFalhaSalvar(error, `Não foi possível salvar a configuração: ${error.message}`));
  } finally { state.queueSaving = false; render(); }
};
window.openQueueComposer = () => { state.queueComposerOpen = true; state.queueSelection = []; render(); };
window.closeQueueComposer = () => { state.queueComposerOpen = false; state.queueSelection = []; render(); };
window.toggleQueueAgent = (agentId, checked) => {
  state.queueSelection = checked ? unique([...state.queueSelection, agentId]) : state.queueSelection.filter((id) => id !== agentId);
  render();
};
window.moveQueueJob = async (jobId, direction) => {
  if (state.queueSaving) return;
  const current = state.queue.find((job) => job.id === jobId && job.status === 'pendente');
  if (!current) return;
  const pending = state.queue.filter((job) => job.status === 'pendente' && job.lane === current.lane);
  const index = pending.findIndex((job) => job.id === jobId);
  const target = index + direction;
  if (target < 0 || target >= pending.length) return;
  [pending[index], pending[target]] = [pending[target], pending[index]];
  const order = new Map(pending.map((job, i) => [job.id, i]));
  state.queue.sort((a, b) => a.lane === current.lane && b.lane === current.lane ? (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1) : 0);
  state.queueSaving = true;
  render();
  try {
    const { error } = await supabase.rpc('reorder_grm_sync_queue', { p_job_ids: pending.map((job) => job.id) });
    if (error) throw error;
    await loadQueue();
  } catch (error) {
    alert(await mensagemFalhaSalvar(error, `Não foi possível salvar a nova ordem: ${error.message}`));
    await loadQueue();
  } finally { state.queueSaving = false; }
};
window.createQueue = async () => {
  if (!state.queueSelection.length || state.queueSaving) return;
  state.queueSaving = true;
  render();
  try {
    const { error } = await supabase.rpc('enqueue_grm_sync_queue', { p_agent_ids: state.queueSelection });
    if (error) throw error;
    state.queueComposerOpen = false;
    state.queueSelection = [];
    await Promise.all([loadQueue(), loadAgentes()]);
  } catch (error) {
    alert(`Não foi possível abrir a fila: ${error.message}`);
  } finally { state.queueSaving = false; render(); }
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
    const baseFields = 'id, agente_id, status, created_at, iniciado_em, finalizado_em, duration_ms, memory_peak_mb, vps_memory_peak_mb, vps_memory_total_mb, vps_disk_used_mb, vps_disk_total_mb, erro';
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

async function loadQueue(showLoading = false) {
  if (state.queueLoading) return;
  state.queueLoading = true;
  if (showLoading) render();
  try {
    const { data, error } = await supabase.from('grm_sync_jobs')
      .select('id,agente_id,status,lane,pipeline_seq,worker_id,created_at,iniciado_em,duration_ms,memory_peak_mb,vps_memory_peak_mb,vps_memory_total_mb,vps_disk_used_mb,vps_disk_total_mb')
      .in('status', ['pendente', 'rodando'])
      .order('pipeline_seq', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    state.queue = data || [];
  } catch (error) {
    console.error('Erro carregando fila:', error);
  } finally { state.queueLoading = false; render(); }
}

async function loadAgentSettings() {
  try {
    const { data, error } = await supabase.from('grm_sync_agent_settings')
      .select('agent_id,queue_lane,interval_minutes,enabled,updated_at')
      .order('agent_id');
    if (error) throw error;
    state.agentSettings = data || [];
  } catch (error) {
    console.error('Erro carregando configuração dos agentes:', error);
  }
}

function render() {
  const pageContent = document.getElementById('pageContent');
  if (pageContent) pageContent.innerHTML = renderAgentes();
}

async function init() {
  await initProtectedPage(['TI_AGENTES', 'TI']);
  await Promise.all([loadAgentes(), loadCargasKpi(), loadOurosafraKpi(), loadExecutions(), loadQueue(), loadAgentSettings()]);
}

init();
setInterval(() => {
  loadAgentes();
  loadCargasKpi();
  loadOurosafraKpi();
  loadExecutions();
  loadQueue();
  loadAgentSettings();
}, 30000);
