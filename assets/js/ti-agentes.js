import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const AGENTES = [
  { id: 'sync-colaboradores', name: 'Colaboradores', freq: '5 min', table: 'colaboradores' },
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
  { id: 'sync-lista-os', name: 'Lista de OS', freq: '1h', table: 'grm_lista_os_importacoes' },
  { id: 'sync-distribuicao-os', name: 'Distribuição de OS', freq: '1h', table: 'grm_distribuicao_os_importacoes' },
];

const STATUS_META = {
  pendente: { ui: 'idle', label: 'Aguardando', color: '#f59e0b', detail: '🟡 Aguardando worker' },
  rodando: { ui: 'running', label: 'Executando', color: '#3b82f6', detail: '🔵 Executando' },
  sucesso: { ui: 'online', label: 'Online', color: '#22c55e', detail: '✅ Sucesso' },
  erro: { ui: 'error', label: 'Erro', color: '#ef4444', detail: '❌ Erro' },
  sem_job: { ui: 'idle', label: 'Aguardando', color: '#f59e0b', detail: '🟡 Aguardando' },
};

const state = { agentes: [], loading: false, selectedAgent: null };

const esc = (v) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

function getStyles() {
  return `<style id="agentes-style">
.ag-wrap{width:100%;color:#e2e2f0}.ag-hero{background:radial-gradient(ellipse at top left,rgba(59,130,246,.13),transparent 55%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.14);border-radius:24px;padding:24px 28px;margin-bottom:20px}.ag-hero h2{margin:0;font-size:clamp(20px,2vw,28px);letter-spacing:-.03em;color:#f8fafc}.ag-hero p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.5;max-width:700px}.ag-stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}.ag-stat{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:16px;padding:12px 18px;text-align:center}.ag-stat-val{font-size:22px;font-weight:900;color:#3b82f6;line-height:1}.ag-stat-lbl{font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}.ag-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:20px}.ag-card{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:16px;cursor:pointer;transition:.15s ease}.ag-card:hover{border-color:rgba(59,130,246,.3);background:rgba(15,23,42,.85)}.ag-card.active{border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.08)}.ag-card-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:12px}.ag-card-title{font-size:14px;font-weight:900;color:#f8fafc}.ag-card-freq{font-size:11px;color:#94a3b8;background:rgba(148,163,184,.1);padding:3px 8px;border-radius:6px}.ag-card-status{display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px}.ag-status-dot{width:8px;height:8px;border-radius:50%;display:inline-block}.ag-status-dot.online{background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.4)}.ag-status-dot.error{background:#ef4444;box-shadow:0 0 8px rgba(239,68,68,.4)}.ag-status-dot.idle{background:#f59e0b;box-shadow:0 0 8px rgba(245,158,11,.4)}.ag-status-dot.running{background:#3b82f6;box-shadow:0 0 8px rgba(59,130,246,.4)}.ag-card-meta{display:flex;gap:16px;font-size:12px;color:#6b7280}.ag-card-meta span{display:flex;flex-direction:column}.ag-card-meta span strong{color:#e2e2f0;display:block;font-weight:900;font-size:13px}.ag-details{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:20px;margin-bottom:20px}.ag-details-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid rgba(148,163,184,.12);padding-bottom:16px}.ag-details-title{font-size:16px;font-weight:900;color:#f8fafc}.ag-details-close{background:transparent;border:0;color:#94a3b8;cursor:pointer;padding:4px;font-size:18px}.ag-log-box{background:rgba(0,0,0,.3);border:1px solid rgba(148,163,184,.12);border-radius:12px;padding:12px;max-height:300px;overflow-y:auto;font-family:monospace;font-size:11px;color:#6b7280;line-height:1.4;white-space:pre-wrap}.ag-log-line{margin:2px 0;color:#94a3b8}.ag-log-error{color:#fca5a5}.ag-log-success{color:#86efac}.ag-btn{border:0;border-radius:12px;padding:10px 16px;font-weight:900;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s ease}.ag-btn-primary{background:linear-gradient(135deg,#3b82f6,#60a5fa);color:#fff}.ag-btn-danger{background:rgba(239,68,68,.1);color:#fca5a5;border:1px solid rgba(239,68,68,.22)}.ag-btn:disabled{opacity:.5;cursor:not-allowed}
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

function extractTotalFromJob(job) {
  const stdout = String(job?.output?.stdout || '');
  const patterns = [
    /Upsert conclu[ií]do[^|\n]*\|[^\n]*Atualizados:\s*(\d+)/i,
    /Upsert conclu[ií]do:\s*(\d+)\s+registros/i,
    /(\d+)\s+registros\s+sincronizados/i,
    /(\d+)\s+colaboradores\s+processados/i,
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

function renderAgentes() {
  const statusCount = {
    online: AGENTES.filter((a) => getAgenteStatus(state.agentes.find((x) => x.id === a.id)) === 'online').length,
    error: AGENTES.filter((a) => getAgenteStatus(state.agentes.find((x) => x.id === a.id)) === 'error').length,
  };

  let html = getStyles();
  html += `<div class="ag-wrap">
    <div class="ag-hero">
      <h2>🤖 Agentes de Sincronização</h2>
      <p>Monitor em tempo real dos ${AGENTES.length} agentes que enfileiram jobs no Supabase e são executados pelo worker do cPanel.</p>
      <div class="ag-stats">
        <div class="ag-stat"><div class="ag-stat-val">${AGENTES.length}</div><div class="ag-stat-lbl">Total de Agentes</div></div>
        <div class="ag-stat"><div class="ag-stat-val" style="color:#22c55e">${statusCount.online}</div><div class="ag-stat-lbl">Online</div></div>
        <div class="ag-stat"><div class="ag-stat-val" style="color:#ef4444">${statusCount.error}</div><div class="ag-stat-lbl">Com Erro</div></div>
      </div>
    </div>`;

  if (state.selectedAgent) html += renderAgentDetails(state.selectedAgent);

  html += '<div class="ag-grid">';
  AGENTES.forEach((a) => {
    const agente = state.agentes.find((x) => x.id === a.id);
    const meta = getAgenteMeta(agente);

    html += `<div class="ag-card ${state.selectedAgent?.id === a.id ? 'active' : ''}" onclick="selectAgent('${a.id}')">
      <div class="ag-card-header"><div class="ag-card-title">${esc(a.name)}</div><div class="ag-card-freq">${a.freq}</div></div>
      <div class="ag-card-status"><div class="ag-status-dot ${meta.ui}"></div><span style="color:${meta.color}">${meta.label}</span></div>
      <div class="ag-card-meta">
        <span>Total<strong>${agente?.total_records ?? 0}</strong></span>
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
  return `<div class="ag-details">
    <div class="ag-details-header"><div class="ag-details-title">${esc(agente.name)} - Detalhes</div><button class="ag-details-close" onclick="closeDetails()">✕</button></div>
    <div style="margin-bottom:16px">
      <p><strong>ID:</strong> ${esc(agente.id)}</p>
      <p><strong>Tabela:</strong> ${esc(agente.table)}</p>
      <p><strong>Frequência:</strong> ${esc(agente.freq)}</p>
      <p><strong>Status:</strong> ${meta.detail}</p>
      <p><strong>Última Sincronização:</strong> ${formatDate(agente.ultima_sync)}</p>
      <p><strong>Total de Registros:</strong> ${agente.total_records ?? 0}</p>
      <p><strong>Último Job:</strong> ${esc(agente.job_id || 'N/A')}</p>
      <p><strong>Duração:</strong> ${esc(formatDuration(agente.duration_ms))}</p>
    </div>
    <div><p style="margin-bottom:8px"><strong>Log do Worker:</strong></p><div class="ag-log-box">${renderLog(agente.last_job)}</div></div>
    <div style="margin-top:16px">
      <button class="ag-btn ag-btn-primary" onclick="executeAgent('${agente.id}')">▶️ Executar Agora</button>
      <button class="ag-btn ag-btn-danger" onclick="viewLogs('${agente.id}')" style="margin-left:8px">📊 Ver Log cPanel</button>
    </div>
  </div>`;
}

window.selectAgent = (agentId) => {
  const agente = AGENTES.find((a) => a.id === agentId);
  const agenteData = state.agentes.find((a) => a.id === agentId);
  state.selectedAgent = { ...agente, ...agenteData };
  render();
};

window.closeDetails = () => {
  state.selectedAgent = null;
  render();
};

window.executeAgent = async (agentId) => {
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
  const msg = `Para acompanhar no servidor cPanel:\n\ntail -f /home/grao100/painel-scripts/grm-sync/logs/worker-cron.log\n\nO agente ${agentId} também grava o resultado final em public.grm_sync_jobs.`;
  alert(msg);
};

async function getLastJob(agenteId) {
  const { data, error } = await supabase
    .from('grm_sync_jobs')
    .select('id, agente_id, status, created_at, iniciado_em, finalizado_em, duration_ms, output, erro')
    .eq('agente_id', agenteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
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
            getLastJob(agente.id),
            countRecords(agente.table),
          ]);
          const jobTotal = extractTotalFromJob(lastJob);
          const displayTotal = Number(totalRecords || 0) > 0 ? totalRecords : jobTotal;

          return {
            id: agente.id,
            name: agente.name,
            freq: agente.freq,
            table: agente.table,
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
          return { id: agente.id, name: agente.name, freq: agente.freq, table: agente.table, job_status: 'sem_job' };
        }
      })
    );

    state.agentes = results;
    if (state.selectedAgent?.id) {
      const latest = results.find((item) => item.id === state.selectedAgent.id);
      const base = AGENTES.find((item) => item.id === state.selectedAgent.id);
      state.selectedAgent = { ...base, ...latest };
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
  await loadAgentes();
}

init();
setInterval(loadAgentes, 30000);
