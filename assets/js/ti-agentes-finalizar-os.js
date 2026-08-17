import { supabase } from './supabaseClient.js';

const AGENT_ID = 'sync-finalizar-os';
const CARD_ID = 'ag-finalizar-os-card';
const DETAILS_ID = 'ag-finalizar-os-details';

const STATUS_META = {
  pendente: { ui: 'idle', label: 'Aguardando', color: '#f59e0b', detail: '🟡 Aguardando worker' },
  rodando: { ui: 'running', label: 'Executando', color: '#3b82f6', detail: '🔵 Executando' },
  sucesso: { ui: 'online', label: 'Online', color: '#22c55e', detail: '✅ Sucesso' },
  parcial: { ui: 'idle', label: 'Parcial', color: '#f59e0b', detail: '⚠️ Concluído com erros' },
  erro: { ui: 'error', label: 'Erro', color: '#ef4444', detail: '❌ Erro' },
  sem_job: { ui: 'idle', label: 'Aguardando', color: '#f59e0b', detail: '🟡 Aguardando' },
};

const state = {
  latestJob: null,
  latestExecution: null,
  totalFinalizadas: 0,
  totalErros: 0,
  selected: false,
  loading: false,
};

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function formatDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString('pt-BR');
}

function formatInt(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (!value) return 'N/A';
  return value < 1000 ? `${value}ms` : `${Math.round(value / 1000)}s`;
}

function getStatusKey() {
  const jobStatus = String(state.latestJob?.status || '').toLowerCase();
  if (jobStatus === 'pendente' || jobStatus === 'rodando') return jobStatus;

  const executionStatus = String(state.latestExecution?.status || '').toUpperCase();
  if (executionStatus === 'ERRO') return 'erro';
  if (executionStatus === 'CONCLUIDO_COM_ERROS') return 'parcial';
  if (executionStatus === 'SUCESSO') return 'sucesso';

  return STATUS_META[jobStatus] ? jobStatus : 'sem_job';
}

function getStatusMeta() {
  return STATUS_META[getStatusKey()] || STATUS_META.sem_job;
}

function isSaidaTabActive() {
  const active = document.querySelector('.ag-tab.active');
  return Boolean(active && /saída|saida/i.test(active.textContent || ''));
}

function renderWorkerLog() {
  const job = state.latestJob;
  if (!job) return '<div class="ag-log-line">Nenhum job encontrado para este agente.</div>';

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

function adjustDashboardCounters(meta) {
  const hero = document.querySelector('.ag-hero');
  if (!hero || hero.dataset.finalizarOsCounted === '1') return;
  hero.dataset.finalizarOsCounted = '1';

  const tabs = [...hero.querySelectorAll('.ag-tab')];
  const saidaTab = tabs.find((tab) => /saída|saida/i.test(tab.textContent || ''));
  const saidaCount = saidaTab?.querySelector('.ag-tab-count');
  if (saidaCount) saidaCount.textContent = String((Number(saidaCount.textContent) || 0) + 1);

  const description = hero.querySelector('p');
  if (description) {
    description.textContent = description.textContent
      .replace(/dos\s+(\d+)\s+agentes/i, (_, total) => `dos ${Number(total) + 1} agentes`)
      .replace(/(\d+)\s+de\s+saída/i, (_, total) => `${Number(total) + 1} de saída`);
  }

  const stats = hero.querySelectorAll('.ag-stat-val');
  if (stats[0]) stats[0].textContent = String((Number(stats[0].textContent) || 0) + 1);
  if (meta.ui === 'online' && stats[1]) stats[1].textContent = String((Number(stats[1].textContent) || 0) + 1);
  if (meta.ui === 'error' && stats[2]) stats[2].textContent = String((Number(stats[2].textContent) || 0) + 1);
}

function renderDetails() {
  const existing = document.getElementById(DETAILS_ID);
  if (!state.selected || !isSaidaTabActive()) {
    existing?.remove();
    return;
  }

  const grid = document.querySelector('.ag-grid');
  if (!grid) return;

  const meta = getStatusMeta();
  const execution = state.latestExecution || {};
  const detailsSignature = JSON.stringify([
    getStatusKey(),
    execution.id || null,
    execution.status || null,
    execution.total_candidatas || 0,
    execution.total_processadas || 0,
    execution.total_sucesso || 0,
    execution.total_ignoradas || 0,
    execution.total_erros || 0,
    state.totalFinalizadas,
    state.latestJob?.id || null,
  ]);
  if (existing?.dataset.signature === detailsSignature) return;

  const details = existing || document.createElement('div');
  details.id = DETAILS_ID;
  details.className = 'ag-details';
  details.dataset.signature = detailsSignature;
  details.innerHTML = `
    <div class="ag-details-header">
      <div class="ag-details-title">Finalizar OS · Regras Operacionais - Detalhes</div>
      <button class="ag-details-close" type="button" data-action="close">✕</button>
    </div>
    <div style="margin-bottom:16px">
      <p><strong>ID:</strong> ${AGENT_ID}</p>
      <p><strong>Tabelas:</strong> grm_finalizacao_os_execucoes / grm_finalizacao_os_resultados</p>
      <p><strong>Frequência:</strong> 1h</p>
      <p><strong>Regra:</strong> finaliza OS abertas e não faturadas com remanescente entre ${esc(execution.remanescente_min ?? 0)} e ${esc(execution.remanescente_max ?? 30)}.</p>
      <p><strong>Status:</strong> ${meta.detail}</p>
      <p><strong>Última execução:</strong> ${formatDate(execution.finalizado_em || execution.iniciado_em || state.latestJob?.finalizado_em || state.latestJob?.created_at)}</p>
      <p><strong>Último resultado:</strong> ${esc(execution.status || 'N/A')}</p>
    </div>
    <div class="ag-btg-kpi-grid" style="margin-bottom:16px">
      <div class="ag-btg-kpi-item"><span>Candidatas</span><strong>${formatInt(execution.total_candidatas)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Processadas</span><strong>${formatInt(execution.total_processadas)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Finalizadas na execução</span><strong style="color:#86efac">${formatInt(execution.total_sucesso)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Ignoradas</span><strong>${formatInt(execution.total_ignoradas)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Erros na execução</span><strong style="color:${Number(execution.total_erros || 0) ? '#fca5a5' : '#86efac'}">${formatInt(execution.total_erros)}</strong></div>
      <div class="ag-btg-kpi-item"><span>Total finalizadas</span><strong>${formatInt(state.totalFinalizadas)}</strong></div>
    </div>
    <div>
      <p style="margin-bottom:8px"><strong>Log do Worker:</strong></p>
      <div class="ag-log-box">${renderWorkerLog()}</div>
    </div>
    <div style="margin-top:16px">
      <button class="ag-btn ag-btn-primary" type="button" data-action="execute">▶️ Executar Agora</button>
      <button class="ag-btn" type="button" data-action="refresh" style="margin-left:8px;background:rgba(148,163,184,.12);color:#e2e8f0">↻ Atualizar</button>
      <button class="ag-btn ag-btn-danger" type="button" data-action="logs" style="margin-left:8px">📊 Ver Log cPanel</button>
    </div>`;

  if (!existing) grid.before(details);

  details.querySelector('[data-action="close"]')?.addEventListener('click', () => {
    state.selected = false;
    renderCard();
  });
  details.querySelector('[data-action="refresh"]')?.addEventListener('click', () => loadData(true));
  details.querySelector('[data-action="execute"]')?.addEventListener('click', executeNow);
  details.querySelector('[data-action="logs"]')?.addEventListener('click', () => {
    alert(`Para acompanhar no servidor cPanel:\n\ntail -f /home/grao100/painel-scripts/grm-sync/logs/worker-cron.log\n\nO agente ${AGENT_ID} também grava auditoria nas tabelas grm_finalizacao_os_execucoes e grm_finalizacao_os_resultados.`);
  });
}

function renderCard() {
  if (!isSaidaTabActive()) {
    document.getElementById(CARD_ID)?.remove();
    document.getElementById(DETAILS_ID)?.remove();
    return;
  }

  const grid = document.querySelector('.ag-grid');
  if (!grid) return;

  const meta = getStatusMeta();
  const execution = state.latestExecution || {};
  let card = document.getElementById(CARD_ID);
  const isNew = !card;
  if (!card) {
    card = document.createElement('div');
    card.id = CARD_ID;
    grid.appendChild(card);
  }

  const cardSignature = JSON.stringify([
    getStatusKey(),
    state.totalFinalizadas,
    execution.finalizado_em || execution.iniciado_em || state.latestJob?.finalizado_em || state.latestJob?.created_at || null,
    state.selected,
  ]);

  if (card.dataset.signature !== cardSignature) {
    card.dataset.signature = cardSignature;
    card.className = `ag-card ${state.selected ? 'active' : ''}`;
    card.innerHTML = `
    <div class="ag-card-header">
      <div class="ag-card-title">Finalizar OS · Regras Operacionais</div>
      <div class="ag-card-freq">1h</div>
    </div>
    <div class="ag-card-status">
      <div class="ag-status-dot ${meta.ui}"></div>
      <span style="color:${meta.color}">${meta.label}</span>
      <span class="ag-dir-badge saida">Saída</span>
    </div>
    <div class="ag-card-meta">
      <span>Finalizadas<strong>${formatInt(state.totalFinalizadas)}</strong></span>
      <span>Última Sync<strong>${formatDate(execution.finalizado_em || execution.iniciado_em || state.latestJob?.finalizado_em || state.latestJob?.created_at)}</strong></span>
    </div>`;

    card.onclick = () => {
      state.selected = !state.selected;
      if (state.selected && typeof window.closeDetails === 'function') window.closeDetails();
      window.setTimeout(renderCard, 0);
    };
  }

  if (isNew) adjustDashboardCounters(meta);
  renderDetails();
}

async function executeNow(event) {
  event?.stopPropagation();
  const confirmed = confirm('Enfileirar agora o agente de finalização de OS?\n\nA execução é REAL e poderá finalizar OS com remanescente 0,00, com mais de 5 dias sem lançamento ou aprovadas pela Logística.');
  if (!confirmed) return;

  try {
    const { data, error } = await supabase
      .from('grm_sync_jobs')
      .insert({ agente_id: AGENT_ID, status: 'pendente' })
      .select('id, status')
      .single();
    if (error) throw error;
    alert(`✅ Agente enfileirado.\n\nJob: ${data.id}\nStatus: ${data.status}`);
    await loadData(true);
  } catch (error) {
    alert(`❌ Não foi possível enfileirar o agente: ${error.message}`);
  }
}

async function loadData(forceRender = false) {
  if (state.loading) return;
  state.loading = true;

  try {
    const [jobRes, executionRes, successCountRes, errorCountRes] = await Promise.all([
      supabase
        .from('grm_sync_jobs')
        .select('id, agente_id, status, created_at, iniciado_em, finalizado_em, duration_ms, output, erro')
        .eq('agente_id', AGENT_ID)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('grm_finalizacao_os_execucoes')
        .select('id, iniciado_em, finalizado_em, status, remanescente_min, remanescente_max, limite_execucao, dry_run, total_exportadas, total_candidatas, total_processadas, total_sucesso, total_dry_run, total_ignoradas, total_erros, erro')
        .order('iniciado_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('grm_finalizacao_os_resultados')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'SUCESSO'),
      supabase
        .from('grm_finalizacao_os_resultados')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ERRO'),
    ]);

    if (jobRes.error) console.warn('Erro carregando job sync-finalizar-os:', jobRes.error);
    if (executionRes.error) console.warn('Erro carregando auditoria de finalização de OS:', executionRes.error);
    if (successCountRes.error) console.warn('Erro contando OS finalizadas:', successCountRes.error);
    if (errorCountRes.error) console.warn('Erro contando falhas de finalização:', errorCountRes.error);

    state.latestJob = jobRes.data || null;
    state.latestExecution = executionRes.data || null;
    state.totalFinalizadas = successCountRes.count || 0;
    state.totalErros = errorCountRes.count || 0;
  } catch (error) {
    console.error('Erro carregando acompanhamento do agente de finalização de OS:', error);
  } finally {
    state.loading = false;
    if (forceRender || isSaidaTabActive()) renderCard();
  }
}

function wrapDashboardHandlers() {
  const originalSetTab = window.setTab;
  if (typeof originalSetTab === 'function' && !originalSetTab.__finalizarOsWrapped) {
    const wrappedSetTab = (tab) => {
      state.selected = false;
      originalSetTab(tab);
      window.setTimeout(renderCard, 0);
    };
    wrappedSetTab.__finalizarOsWrapped = true;
    window.setTab = wrappedSetTab;
  }

  const originalSelectAgent = window.selectAgent;
  if (typeof originalSelectAgent === 'function' && !originalSelectAgent.__finalizarOsWrapped) {
    const wrappedSelectAgent = (agentId) => {
      state.selected = false;
      document.getElementById(DETAILS_ID)?.remove();
      originalSelectAgent(agentId);
    };
    wrappedSelectAgent.__finalizarOsWrapped = true;
    window.selectAgent = wrappedSelectAgent;
  }
}

function init() {
  wrapDashboardHandlers();

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      wrapDashboardHandlers();
      renderCard();
    }, 40);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  loadData(true);
  window.setInterval(() => loadData(true), 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
