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

// direction: 'entrada' (informação vem de fora e entra no painel) é o padrão.
// 'saida' = o agente pega informação do painel e leva pra fora (Graint, BTG, etc).
const AGENTES = [
  { id: 'sync-colaboradores', name: 'Colaboradores', freq: '30 min', table: 'colaboradores' },
  { id: 'sync-producao-diaria', name: 'Produção Diária', freq: '1h', table: 'grm_producao_diaria_importacoes' },
  { id: 'sync-locais-embarque', name: 'Locais de Embarque', freq: '1h', table: 'grm_locais_embarque_importacoes' },
  { id: 'sync-resultado-diario', name: 'Resultado Diário', freq: '1h', table: 'grm_resultado_diario_importacoes' },
  { id: 'sync-despesas', name: 'Despesas', freq: '1h', table: 'grm_despesas_importacoes' },
  { id: 'sync-notas-fiscais', name: 'Notas Fiscais', freq: '1h', table: 'grm_notas_fiscais_importacoes' },
  { id: 'sync-mapa-embarque', name: 'Mapa de Embarque', freq: '1h', table: 'grm_mapa_embarque_importacoes' },
  { id: 'sync-patrimonios', name: 'Patrimônios', freq: '1h', table: 'grm_patrimonios_importacoes' },
  { id: 'sync-contas-pagar', name: 'Contas a Pagar', freq: '1h', table: 'grm_contas_pagar_importacoes' },
  { id: 'sync-contas-receber', name: 'Contas a Receber', freq: '1h', table: 'grm_contas_receber_importacoes' },
  { id: 'sync-auditorias', name: 'Auditorias', freq: '1h', table: 'grm_auditorias_importacoes' },
  { id: 'sync-nhe', name: 'NHE', freq: '1h', table: 'grm_nhe_importacoes' },
  { id: 'sync-lista-os', name: 'Lista de OS', freq: '30 min', table: 'grm_lista_os_importacoes' },
  { id: 'sync-operacional-os', name: 'Operacional · OS', freq: 'contínuo', table: 'operacional_os' },
  { id: 'sync-distribuicao-os', name: 'Distribuição de OS', freq: '1h', table: 'grm_distribuicao_os_importacoes' },
  { id: CARGAS_AGENT_ID, name: 'Cargas · Geofence', freq: '1h', table: 'grm_cargas_importacoes' },
  { id: BTG_AGENT_ID, name: 'BTG · Relatórios', freq: '1h / disparo', table: 'logistica_btg_solicitacoes', aliases: BTG_AGENT_ALIASES, kpi: true },
  { id: 'sync-adiantamentos', name: 'Adiantamentos', freq: '15 min', table: 'grm_adiantamentos_importacoes' },
  { id: 'sync-login-alimentacao', name: 'Login Alimentação', freq: 'contínuo', table: 'financeiro_alimentacao_colaboradores' },
  { id: 'botconversa-sync', name: 'BotConversa · Contatos', freq: '1h', table: 'botconversa_contatos', source: 'botconversa' },
  { id: 'sync-btg-checkin', name: 'BTG · Envio de Check-in', freq: 'sob demanda', table: 'logistica_btg_solicitacoes', direction: 'saida' },
  { id: 'aplicar-distribuicao-os', name: 'Aplicar Distribuição de OS (Graint)', freq: '15 min', table: 'operacional_os', direction: 'saida' },
  { id: 'sync-lancar-nhe', name: 'Lançamento Automático de NHE (Graint)', freq: 'diário 02h', table: 'logistica_nhe_lancamentos_auto', direction: 'saida' },
  { id: 'sync-despesas-retroativas', name: 'Despesas Retroativas (GRM)', freq: 'diário', table: 'grm_despesas_retroativas_auditoria', direction: 'saida' },
];

const STATUS_META = {
  pendente: { ui: 'idle', label: 'Aguardando', color: '#f59e0b', detail: '🟡 Aguardando worker' },
  rodando: { ui: 'running', label: 'Executando', color: '#3b82f6', detail: '🔵 Executando' },
  sucesso: { ui: 'online', label: 'Online', color: '#22c55e', detail: '✅ Sucesso' },
  parcial: { ui: 'idle', label: 'Parcial', color: '#f59e0b', detail: '⚠️ Concluído com erros' },
  erro: { ui: 'error', label: 'Erro', color: '#ef4444', detail: '❌ Erro' },
  sem_job: { ui: 'idle', label: 'Aguardando', color: '#f59e0b', detail: '🟡 Aguardando' },
};

const state = { agentes: [], loading: false, selectedAgent: null, botconversaFailures: [], cargasKpi: null, activeTab: 'entrada' };

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

function renderAgentes() {
  const entrada = AGENTES.filter((a) => getDirection(a) === 'entrada');
  const saida = AGENTES.filter((a) => getDirection(a) === 'saida');
  const visiveis = state.activeTab === 'saida' ? saida : entrada;

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
      </div>
      <div class="ag-stats">
        <div class="ag-stat"><div class="ag-stat-val">${visiveis.length}</div><div class="ag-stat-lbl">Agentes nesta aba</div></div>
        <div class="ag-stat"><div class="ag-stat-val" style="color:#22c55e">${statusCount.online}</div><div class="ag-stat-lbl">Online</div></div>
        <div class="ag-stat"><div class="ag-stat-val" style="color:#ef4444">${statusCount.error}</div><div class="ag-stat-lbl">Com Erro</div></div>
      </div>
      ${state.activeTab === 'entrada' ? renderBtgKpi() : ''}
      ${state.activeTab === 'entrada' ? renderCargasKpi() : ''}
    </div>`;

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
  state.activeTab = tab === 'saida' ? 'saida' : 'entrada';
  state.selectedAgent = null;
  render();
};

window.selectAgent = (agentId) => {
  const agente = AGENTES.find((a) => a.id === agentId);
  const agenteData = state.agentes.find((a) => a.id === agentId);
  state.selectedAgent = { ...agente, ...agenteData };
  state.botconversaFailures = [];
  render();
  if (agente?.source === 'botconversa') loadBotConversaFailures(state.selectedAgent.job_id);
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

function render() {
  const pageContent = document.getElementById('pageContent');
  if (pageContent) pageContent.innerHTML = renderAgentes();
}

async function init() {
  await initProtectedPage(['TI_AGENTES', 'TI']);
  await Promise.all([loadAgentes(), loadCargasKpi()]);
}

init();
setInterval(() => {
  loadAgentes();
  loadCargasKpi();
}, 30000);
