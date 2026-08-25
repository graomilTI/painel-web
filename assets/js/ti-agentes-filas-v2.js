import { supabase } from './supabaseClient.js';

const REFRESH_MS = 30000;
const AGENT_NAMES = {
  'sync-colaboradores': 'Colaboradores',
  'sync-lista-os': 'Lista de OS',
  'sync-patrimonios': 'Patrimônios',
  'sync-nhe': 'NHE',
  'sync-operacional-os': 'Operacional · OS',
  'sync-distribuicao-os': 'Distribuição de OS',
  'sync-producao-diaria': 'Produção Diária',
  'sync-locais-embarque': 'Locais de Embarque',
  'sync-resultado-diario': 'Resultado Diário',
  'sync-despesas': 'Despesas',
  'sync-notas-fiscais': 'Notas Fiscais',
  'sync-mapa-embarque': 'Mapa de Embarque',
  'sync-contas-pagar': 'Contas a Pagar',
  'sync-contas-receber': 'Contas a Receber',
  'sync-auditorias': 'Auditorias',
  'sync-cargas-geofence': 'Cargas · Geofence',
  'sync-btg-relatorios': 'BTG · Relatórios',
  'sync-btg-classificador': 'BTG · Classificador',
  'sync-adiantamentos': 'Adiantamentos',
  'botconversa-sync': 'BotConversa · Contatos',
  'sync-login-alimentacao': 'Login Alimentação',
  'sync-btg-checkin': 'BTG · Envio de Check-in',
  'aplicar-distribuicao-os': 'Aplicar Distribuição de OS (Graint)',
  'sync-lancar-nhe': 'Lançamento Automático de NHE (Graint)',
  'sync-despesas-retroativas': 'Despesas Retroativas (GRM)',
  'sync-liberacao-despesas': 'Liberação de Despesas (GRM)',
  'sync-lancar-notas-fiscais': 'Lançar Notas Fiscais (GRM)',
  'sync-bonus-caixa': 'Bônus de Caixa (GRM)',
  'sync-abrir-os': 'Abrir OS (GRM)',
  'sync-finalizar-os': 'Finalizar OS (GRM)',
  'sync-reabrir-os': 'Reabrir OS (GRM)',
};

const state = {
  lanes: [],
  settings: [],
  jobs: [],
  policy: null,
  loading: false,
  loaded: false,
  error: null,
};

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function agentName(id) {
  if (AGENT_NAMES[id]) return AGENT_NAMES[id];
  return String(id || '')
    .replace(/^sync-/, '')
    .split('-')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ');
}

function formatInterval(minutes) {
  const value = Number(minutes || 0);
  if (!value) return 'Manual / sob demanda';
  if (value % 1440 === 0) return `A cada ${value / 1440} dia${value === 1440 ? '' : 's'}`;
  if (value % 60 === 0) return `A cada ${value / 60}h`;
  return `A cada ${value} min`;
}

function isFilaTabActive() {
  const active = document.querySelector('.ag-tab.active');
  return Boolean(active && /fila/i.test(active.textContent || ''));
}

function settingFor(agentId) {
  return state.settings.find((item) => item.agent_id === agentId) || null;
}

function openJobFor(agentId) {
  return state.jobs.find((job) => job.agente_id === agentId && job.status === 'rodando')
    || state.jobs.find((job) => job.agente_id === agentId && job.status === 'pendente')
    || null;
}

function statusFor(setting, job) {
  if (setting?.enabled === false) return { label: 'Desativado', cls: 'disabled', color: '#f87171' };
  if (job?.status === 'rodando') return { label: 'Executando', cls: 'running', color: '#60a5fa' };
  if (job?.status === 'pendente') return { label: 'Aguardando', cls: 'pending', color: '#fbbf24' };
  return { label: 'Disponível', cls: 'ready', color: '#4ade80' };
}

function ensureStyles() {
  if (document.getElementById('ag-filas-v2-style')) return;
  const style = document.createElement('style');
  style.id = 'ag-filas-v2-style';
  style.textContent = `
    .ag-v2-toolbar{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.ag-v2-title strong{display:block;color:#f8fafc;font-size:16px}.ag-v2-title span{display:block;color:#64748b;font-size:11px;margin-top:4px}.ag-v2-refresh{border:1px solid rgba(96,165,250,.3);background:rgba(59,130,246,.09);color:#bfdbfe;border-radius:10px;padding:8px 12px;font-weight:800;cursor:pointer}.ag-v2-policy{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:9px;margin-bottom:16px}.ag-v2-policy>div{border:1px solid rgba(148,163,184,.12);background:rgba(15,23,42,.55);border-radius:13px;padding:10px 12px}.ag-v2-policy span{display:block;color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:.06em}.ag-v2-policy strong{display:block;color:#f8fafc;font-size:15px;margin-top:3px}.ag-v2-policy small{display:block;color:#64748b;font-size:9px;margin-top:2px}.ag-v2-lanes{display:grid;gap:12px}.ag-v2-lane{border:1px solid rgba(148,163,184,.13);border-radius:17px;overflow:hidden;background:rgba(2,6,23,.35)}.ag-v2-lane[data-direction="entrada"]{box-shadow:inset 3px 0 0 rgba(34,197,94,.55)}.ag-v2-lane[data-direction="saida"]{box-shadow:inset 3px 0 0 rgba(251,146,60,.65)}.ag-v2-lane-head{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;padding:12px 14px;background:rgba(15,23,42,.62);border-bottom:1px solid rgba(148,163,184,.09)}.ag-v2-lane-head strong{display:block;color:#f8fafc;font-size:13px}.ag-v2-lane-head p{margin:3px 0 0;color:#64748b;font-size:10px}.ag-v2-lane-kpi{text-align:right}.ag-v2-lane-kpi span{display:block;color:#64748b;font-size:9px;text-transform:uppercase}.ag-v2-lane-kpi b{display:block;color:#e2e8f0;font-size:12px;margin-top:2px}.ag-v2-direction{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.ag-v2-direction.entrada{background:rgba(34,197,94,.12);color:#86efac}.ag-v2-direction.saida{background:rgba(251,146,60,.13);color:#fdba74}.ag-v2-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(285px,1fr));gap:8px;padding:10px}.ag-v2-card{position:relative;border:1px solid rgba(148,163,184,.12);background:rgba(15,23,42,.54);border-radius:13px;padding:11px}.ag-v2-card.disabled{opacity:.72;border-color:rgba(248,113,113,.25);background:rgba(127,29,29,.07)}.ag-v2-card-top{display:flex;gap:8px;align-items:flex-start;padding-right:28px}.ag-v2-card-top>div{min-width:0;flex:1}.ag-v2-card-top strong{display:block;color:#f8fafc;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-v2-card-top code{display:block;color:#64748b;font-size:9px;margin-top:2px}.ag-v2-status{font-size:9px;font-weight:900;white-space:nowrap}.ag-v2-edit{position:absolute;right:8px;top:8px;width:25px;height:25px;border-radius:8px;border:1px solid rgba(148,163,184,.12);background:rgba(148,163,184,.08);color:#cbd5e1;cursor:pointer}.ag-v2-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}.ag-v2-meta span{display:block;color:#64748b;font-size:8px;text-transform:uppercase}.ag-v2-meta b{display:block;color:#e2e8f0;font-size:10px;margin-top:2px;overflow:hidden;text-overflow:ellipsis}.ag-v2-extra{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.ag-v2-pill{font-size:8px;border-radius:999px;padding:3px 6px;background:rgba(148,163,184,.08);color:#94a3b8}.ag-v2-pill.heavy{background:rgba(239,68,68,.09);color:#fca5a5}.ag-v2-pill.medium{background:rgba(245,158,11,.09);color:#fcd34d}.ag-v2-pill.light{background:rgba(34,197,94,.09);color:#86efac}.ag-v2-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(148,163,184,.08)}.ag-v2-footer small{color:#64748b;font-size:9px}.ag-v2-run{border:0;border-radius:8px;padding:6px 8px;background:rgba(59,130,246,.13);color:#bfdbfe;font-size:9px;font-weight:900;cursor:pointer}.ag-v2-run:disabled{opacity:.45;cursor:not-allowed}.ag-v2-empty{padding:28px;text-align:center;color:#64748b}.ag-v2-error{padding:16px;border:1px solid rgba(239,68,68,.22);border-radius:12px;color:#fca5a5;background:rgba(127,29,29,.08)}.ag-v2-modal-backdrop{position:fixed;inset:0;z-index:10020;background:rgba(2,6,23,.78);display:grid;place-items:center;padding:20px}.ag-v2-modal{width:min(520px,100%);background:#0f172a;border:1px solid rgba(148,163,184,.2);border-radius:18px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.45)}.ag-v2-modal header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.ag-v2-modal h3{margin:0;color:#f8fafc}.ag-v2-modal header span{display:block;color:#64748b;font-size:10px;margin-top:3px}.ag-v2-close{border:0;background:transparent;color:#94a3b8;font-size:22px;cursor:pointer}.ag-v2-field{display:block;margin-top:12px}.ag-v2-field>span{display:block;color:#94a3b8;font-size:10px;font-weight:800;margin-bottom:5px}.ag-v2-field select{width:100%;background:#111827;color:#e5e7eb;border:1px solid rgba(148,163,184,.18);border-radius:10px;padding:9px}.ag-v2-readonly{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0}.ag-v2-readonly div{background:rgba(148,163,184,.06);border-radius:10px;padding:8px}.ag-v2-readonly span{display:block;color:#64748b;font-size:8px;text-transform:uppercase}.ag-v2-readonly b{display:block;color:#e2e8f0;font-size:10px;margin-top:2px}.ag-v2-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.ag-v2-actions button{border-radius:9px;padding:8px 11px;font-weight:800;cursor:pointer}.ag-v2-cancel{background:transparent;border:1px solid rgba(148,163,184,.2);color:#cbd5e1}.ag-v2-save{border:0;background:#2563eb;color:white}.ag-v2-note{font-size:9px;color:#64748b;margin-top:10px;line-height:1.45}.ag-v2-disabled-note{color:#fca5a5}.ag-v2-finalizer-disabled{opacity:.65}.ag-v2-finalizer-disabled [data-action="execute"]{display:none!important}@media(max-width:900px){.ag-v2-policy{grid-template-columns:repeat(2,1fr)}.ag-v2-lane-head{grid-template-columns:1fr auto}.ag-v2-lane-kpi:last-child{display:none}}`;
  document.head.appendChild(style);
}

function renderPolicy() {
  const policy = state.policy || {};
  return `<div class="ag-v2-policy">
    <div><span>Arquitetura</span><strong>V${esc(policy.active_version || 2)} · ${state.lanes.length} filas</strong><small>fonte: runtime do Supabase</small></div>
    <div><span>Workers simultâneos</span><strong>${esc(policy.max_workers ?? 8)}</strong><small>limite global configurado</small></div>
    <div><span>Agentes pesados</span><strong>${esc(policy.max_heavy_concurrent ?? 4)}</strong><small>máximo simultâneo configurado</small></div>
    <div><span>Parâmetro de memória</span><strong>${Number(policy.min_free_memory_mb || 0).toLocaleString('pt-BR')} MB</strong><small>reserva configurada; informativo</small></div>
  </div>`;
}

function renderAgentCard(setting, lane) {
  const job = openJobFor(setting.agent_id);
  const status = statusFor(setting, job);
  const deps = Array.isArray(setting.depends_on) ? setting.depends_on : [];
  const runningText = job?.status === 'rodando'
    ? `Worker: ${esc(job.worker_id || lane.lane)}`
    : job?.status === 'pendente'
      ? 'Job aguardando nesta fila'
      : 'Sem job aberto';
  const canRun = setting.enabled !== false;
  return `<article class="ag-v2-card ${status.cls}">
    <button class="ag-v2-edit" type="button" onclick="openAgentSettingsV2('${esc(setting.agent_id)}')" title="Editar fila e intervalo">✎</button>
    <div class="ag-v2-card-top"><div><strong>${esc(agentName(setting.agent_id))}</strong><code>${esc(setting.agent_id)}</code></div><span class="ag-v2-status" style="color:${status.color}">${esc(status.label)}</span></div>
    <div class="ag-v2-meta">
      <div><span>Intervalo</span><b>${esc(formatInterval(setting.interval_minutes))}</b></div>
      <div><span>Prioridade</span><b>${esc(setting.priority ?? 50)}</b></div>
      <div><span>Runtime máx.</span><b>${esc(setting.max_runtime_minutes ?? '-')} min</b></div>
    </div>
    <div class="ag-v2-extra">
      <span class="ag-v2-pill ${esc(setting.resource_class || '')}">${esc(setting.resource_class || 'não classificado')}</span>
      ${setting.mutex_group ? `<span class="ag-v2-pill">mutex: ${esc(setting.mutex_group)}</span>` : ''}
      ${deps.length ? `<span class="ag-v2-pill" title="${esc(deps.join(', '))}">depende de ${deps.length}</span>` : ''}
    </div>
    <div class="ag-v2-footer"><small>${runningText}</small><button class="ag-v2-run" type="button" ${canRun ? '' : 'disabled'} onclick="event.stopPropagation();executeAgent('${esc(setting.agent_id)}')">${canRun ? 'Priorizar' : 'Desativado'}</button></div>
  </article>`;
}

function renderLane(lane) {
  const agents = state.settings
    .filter((setting) => (setting.queue_lane || setting.target_lane) === lane.lane)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || agentName(a.agent_id).localeCompare(agentName(b.agent_id), 'pt-BR'));
  const jobs = state.jobs.filter((job) => job.lane === lane.lane);
  const running = jobs.filter((job) => job.status === 'rodando').length;
  const pending = jobs.filter((job) => job.status === 'pendente').length;
  const disabled = agents.filter((agent) => agent.enabled === false).length;
  return `<section class="ag-v2-lane" data-direction="${esc(lane.direction)}">
    <header class="ag-v2-lane-head">
      <div><strong>${esc(lane.label)}</strong><p>${esc(lane.description || lane.lane)} · <code>${esc(lane.lane)}</code></p></div>
      <div class="ag-v2-lane-kpi"><span>Capacidade</span><b>${esc(lane.max_concurrency || 1)} worker · ${agents.length} agentes${disabled ? ` · ${disabled} off` : ''}</b></div>
      <div class="ag-v2-lane-kpi"><span>Fila atual</span><b>${running} rodando · ${pending} aguardando</b></div>
      <span class="ag-v2-direction ${esc(lane.direction)}">${esc(lane.direction)}</span>
    </header>
    <div class="ag-v2-cards">${agents.length ? agents.map((agent) => renderAgentCard(agent, lane)).join('') : '<div class="ag-v2-empty">Nenhum agente configurado nesta fila.</div>'}</div>
  </section>`;
}

function renderBoard() {
  if (!isFilaTabActive()) return;
  ensureStyles();
  const board = document.querySelector('.ag-queue-board');
  if (!board) return;
  board.dataset.v2Board = '1';

  if (state.error) {
    board.innerHTML = `<div class="ag-v2-error"><strong>Não foi possível carregar a arquitetura V2.</strong><br>${esc(state.error)}</div>`;
    return;
  }

  if (!state.loaded) {
    board.innerHTML = '<div class="ag-v2-empty">Carregando arquitetura V2 das filas…</div>';
    return;
  }

  board.innerHTML = `<div class="ag-v2-toolbar"><div class="ag-v2-title"><strong>Mapa operacional das 8 filas</strong><span>Configuração refletida diretamente de grm_sync_lanes, grm_sync_runtime_policy e grm_sync_agent_settings.</span></div><button class="ag-v2-refresh" type="button" onclick="refreshAgentLanesV2(true)">↻ Atualizar</button></div>${renderPolicy()}<div class="ag-v2-lanes">${state.lanes.map(renderLane).join('')}</div>`;
}

function decorateFilaTab() {
  const tabs = [...document.querySelectorAll('.ag-tab')];
  const tab = tabs.find((item) => /fila/i.test(item.textContent || ''));
  if (!tab) return;
  const count = tab.querySelector('.ag-tab-count');
  const firstText = [...tab.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (firstText) firstText.textContent = '☷ Filas ';
  if (count && state.loaded) count.textContent = String(state.jobs.filter((job) => job.status === 'pendente').length);
}

function enforceDisabledFinalizerUi() {
  const setting = settingFor('sync-finalizar-os');
  if (!setting || setting.enabled !== false) return;
  const card = document.getElementById('ag-finalizar-os-card');
  if (card) {
    card.classList.add('ag-v2-finalizer-disabled');
    const status = card.querySelector('.ag-card-status span:not(.ag-dir-badge)');
    if (status) { status.textContent = 'Desativado'; status.style.color = '#f87171'; }
  }
  const details = document.getElementById('ag-finalizar-os-details');
  if (details) {
    details.classList.add('ag-v2-finalizer-disabled');
    const run = details.querySelector('[data-action="execute"]');
    if (run) { run.disabled = true; run.textContent = '⏸ Agente desativado'; }
    if (!details.querySelector('.ag-v2-disabled-note')) {
      const note = document.createElement('p');
      note.className = 'ag-v2-disabled-note';
      note.textContent = 'Agente desativado na política de execução. O painel não permite disparo manual enquanto estiver desativado.';
      details.querySelector('.ag-details-header')?.after(note);
    }
  }
}

async function fetchData() {
  const [lanesRes, settingsRes, jobsRes, policyRes] = await Promise.all([
    supabase.from('grm_sync_lanes')
      .select('lane,label,direction,sort_order,enabled,max_concurrency,description')
      .eq('enabled', true)
      .order('sort_order'),
    supabase.from('grm_sync_agent_settings')
      .select('agent_id,queue_lane,target_lane,direction,resource_class,priority,max_runtime_minutes,interval_minutes,enabled,depends_on,mutex_group,updated_at')
      .order('agent_id'),
    supabase.from('grm_sync_jobs')
      .select('id,agente_id,status,lane,pipeline_seq,worker_id,created_at,iniciado_em')
      .in('status', ['pendente', 'rodando'])
      .order('pipeline_seq', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true }),
    supabase.from('grm_sync_runtime_policy')
      .select('id,active_version,max_workers,max_heavy_concurrent,min_free_memory_mb,cutover_at,updated_at')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const error = lanesRes.error || settingsRes.error || jobsRes.error || policyRes.error;
  if (error) throw error;
  state.lanes = lanesRes.data || [];
  state.settings = settingsRes.data || [];
  state.jobs = jobsRes.data || [];
  state.policy = policyRes.data || null;
  state.loaded = true;
  state.error = null;
}

async function refresh(showLoading = false) {
  if (state.loading) return;
  state.loading = true;
  if (showLoading && !state.loaded) renderBoard();
  try {
    await fetchData();
  } catch (error) {
    console.error('Erro carregando filas V2:', error);
    state.error = error?.message || String(error);
  } finally {
    state.loading = false;
    decorateFilaTab();
    renderBoard();
    enforceDisabledFinalizerUi();
  }
}

function closeModal() {
  document.getElementById('ag-v2-settings-modal')?.remove();
}

function openSettings(agentId) {
  const setting = settingFor(agentId);
  if (!setting) return;
  closeModal();
  const directionLanes = state.lanes.filter((lane) => lane.direction === setting.direction);
  const lanes = directionLanes.length ? directionLanes : state.lanes;
  const currentInterval = Number(setting.interval_minutes || 0);
  const intervalValues = [...new Set([0, 5, 10, 15, 30, 60, 120, 360, 720, 1440, 2880, 10080, currentInterval])].sort((a, b) => a - b);
  const wrapper = document.createElement('div');
  wrapper.id = 'ag-v2-settings-modal';
  wrapper.className = 'ag-v2-modal-backdrop';
  wrapper.innerHTML = `<form class="ag-v2-modal"><header><div><h3>Editar agente</h3><span>${esc(agentName(agentId))} · ${esc(agentId)}</span></div><button type="button" class="ag-v2-close">×</button></header>
    <div class="ag-v2-readonly"><div><span>Status</span><b>${setting.enabled === false ? 'Desativado' : 'Ativo'}</b></div><div><span>Recurso</span><b>${esc(setting.resource_class || '-')} · prioridade ${esc(setting.priority ?? '-')}</b></div><div><span>Mutex</span><b>${esc(setting.mutex_group || 'nenhum')}</b></div><div><span>Runtime máximo</span><b>${esc(setting.max_runtime_minutes ?? '-')} min</b></div></div>
    <label class="ag-v2-field"><span>Fila V2</span><select name="queue_lane">${lanes.map((lane) => `<option value="${esc(lane.lane)}" ${(setting.queue_lane || setting.target_lane) === lane.lane ? 'selected' : ''}>${esc(lane.label)}</option>`).join('')}</select></label>
    <label class="ag-v2-field"><span>Intervalo</span><select name="interval_minutes">${intervalValues.map((value) => `<option value="${value}" ${currentInterval === value ? 'selected' : ''}>${esc(formatInterval(value))}</option>`).join('')}</select></label>
    <p class="ag-v2-note">A tela altera apenas fila e intervalo. Status ativo/desativado, classe de recurso, prioridade, dependências e mutex continuam controlados pela política V2 do backend.</p>
    <div class="ag-v2-actions"><button type="button" class="ag-v2-cancel">Cancelar</button><button type="submit" class="ag-v2-save">Salvar configuração</button></div></form>`;
  document.body.appendChild(wrapper);
  wrapper.addEventListener('click', (event) => { if (event.target === wrapper) closeModal(); });
  wrapper.querySelector('.ag-v2-close')?.addEventListener('click', closeModal);
  wrapper.querySelector('.ag-v2-cancel')?.addEventListener('click', closeModal);
  wrapper.querySelector('form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const save = form.querySelector('.ag-v2-save');
    save.disabled = true;
    save.textContent = 'Salvando…';
    try {
      const { error } = await supabase.rpc('update_grm_sync_agent_setting', {
        p_agent_id: agentId,
        p_queue_lane: form.elements.queue_lane.value,
        p_interval_minutes: Number(form.elements.interval_minutes.value),
      });
      if (error) throw error;
      closeModal();
      await refresh(false);
    } catch (error) {
      alert(`Não foi possível salvar a configuração: ${error.message}`);
      save.disabled = false;
      save.textContent = 'Salvar configuração';
    }
  });
}

const originalSetTab = window.setTab;
if (typeof originalSetTab === 'function') {
  window.setTab = (tab) => {
    const result = originalSetTab(tab);
    window.setTimeout(() => {
      decorateFilaTab();
      if (tab === 'fila') {
        renderBoard();
        refresh(false);
      }
      enforceDisabledFinalizerUi();
    }, 0);
    return result;
  };
}

const originalExecuteAgent = window.executeAgent;
if (typeof originalExecuteAgent === 'function') {
  window.executeAgent = async (agentId) => {
    let setting = settingFor(agentId);
    if (!setting) {
      const { data } = await supabase.from('grm_sync_agent_settings')
        .select('agent_id,enabled')
        .eq('agent_id', agentId)
        .maybeSingle();
      setting = data || null;
    }
    if (setting?.enabled === false) {
      alert(`⏸ O agente ${agentName(agentId)} está desativado na política V2 e não pode ser enfileirado pelo painel.`);
      return;
    }
    return originalExecuteAgent(agentId);
  };
}

window.openAgentSettingsV2 = openSettings;
window.closeAgentSettingsV2 = closeModal;
window.refreshAgentLanesV2 = () => refresh(true);

function init() {
  ensureStyles();
  const pageContent = document.getElementById('pageContent');
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      decorateFilaTab();
      enforceDisabledFinalizerUi();
      if (!isFilaTabActive()) return;
      const board = document.querySelector('.ag-queue-board');
      if (board && board.dataset.v2Board !== '1') renderBoard();
    }, 30);
  });
  if (pageContent) observer.observe(pageContent, { childList: true, subtree: true });
  observer.observe(document.body, { childList: true, subtree: true });
  refresh(false);
  window.setInterval(() => {
    if (isFilaTabActive()) refresh(false);
    else enforceDisabledFinalizerUi();
  }, REFRESH_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
