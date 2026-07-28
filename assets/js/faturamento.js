import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const STORAGE_KEY = 'grao1000:faturamento:v1';
const TABLES = {
  faturas: 'faturamento_faturas',
  clientes: 'faturamento_clientes',
  documentos: 'faturamento_documentos',
  tarifas: 'faturamento_tarifas',
  agenda: 'faturamento_agenda',
};

// Setores autorizados a operar o módulo (equipe restrita por função).
const SETORES_FATURAMENTO = ['fatur', 'financ'];

const TABS = [
  { id: 'painel', label: 'Painel do Dia' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'faturas', label: 'Faturas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'clientes', label: 'Clientes e Tarifas' },
];

const STATUS = [
  'Sem responsável',
  'Distribuída',
  'Em conferência',
  'Aguardando aprovação interna',
  'Enviada ao cliente',
  'Aguardando retorno',
  'Com divergência',
  'Em correção',
  'Aguardando documentos',
  'Documentos emitidos',
  'Finalizada',
  'Cancelada',
];

const PRIORIDADES = ['Baixa', 'Normal', 'Alta', 'Urgente'];

const state = {
  userContext: null,
  activeTab: 'painel',
  storageMode: 'local',
  dbError: '',
  faturas: [],
  clientes: [],
  tarifas: [],
  documentos: [],
  agenda: [],
  equipe: [],
  syncing: false,
  lastSync: '',
  selectedIds: new Set(),
  filters: {
    q: '',
    status: '',
    responsavel: '',
    periodicidade: '',
  },
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toNumber(value) {
  const n = Number(String(value ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function dateBR(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
}

function formatDateTimeBR(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysBetween(start, end = todayISO()) {
  if (!start) return 0;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((b - a) / 86400000);
}

function addDays(iso, days) {
  const date = new Date(`${iso || todayISO()}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function statusClass(status) {
  const n = normalize(status);
  if (n.includes('finalizada') || n.includes('documentos emitidos')) return 'is-green';
  if (n.includes('divergencia') || n.includes('correcao') || n.includes('cancelada')) return 'is-red';
  if (n.includes('aguardando')) return 'is-amber';
  if (n.includes('sem responsavel')) return 'is-muted';
  return 'is-blue';
}

function prioridadeClass(prioridade) {
  const n = normalize(prioridade);
  if (n === 'urgente') return 'is-red';
  if (n === 'alta') return 'is-amber';
  if (n === 'baixa') return 'is-muted';
  return 'is-green';
}

function getCurrentUserName() {
  return state.userContext?.user?.name || state.userContext?.user?.nome || state.userContext?.user?.email || 'Sistema';
}

function isCoordinator() {
  const role = normalize(state.userContext?.user?.role || state.userContext?.perfil_codigo || state.userContext?.perfil_nome || state.userContext?.role);
  const setor = normalize(state.userContext?.department?.name || state.userContext?.department?.code || state.userContext?.setor);
  return Boolean(state.userContext?.user?.is_master) || ['admin', 'master', 'coordenador', 'gestor'].includes(role) || setor.includes('faturamento');
}

// Os dados de demonstração (seedData) foram removidos: com as tabelas
// faturamento_* liberadas no Supabase (migration 20260718020500), a tela
// passa a refletir só o que existe de verdade no banco.

function makeFatura(overrides = {}) {
  const bruto = Number(overrides.valor_bruto || 0);
  const desc = Number(overrides.descontos || 0);
  return {
    id: overrides.id || uuid(),
    codigo: overrides.codigo || `FAT-${String(Date.now()).slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`,
    cliente_id: overrides.cliente_id || '',
    cliente_nome: overrides.cliente_nome || '',
    periodicidade: overrides.periodicidade || 'Mensal',
    periodo: overrides.periodo || '',
    valor_bruto: bruto,
    descontos: desc,
    valor_liquido: Math.max(0, bruto - desc),
    prazo_envio: overrides.prazo_envio || todayISO(),
    prazo_retorno: overrides.prazo_retorno || addDays(todayISO(), 2),
    status: overrides.status || 'Sem responsável',
    prioridade: overrides.prioridade || 'Normal',
    responsavel_id: overrides.responsavel_id || '',
    responsavel_nome: overrides.responsavel_nome || '',
    distribuido_por_nome: overrides.distribuido_por_nome || '',
    distribuido_em: overrides.distribuido_em || '',
    canal_envio: overrides.canal_envio || '',
    ultimo_retorno_em: overrides.ultimo_retorno_em || '',
    proxima_cobranca_em: overrides.proxima_cobranca_em || '',
    divergencia: overrides.divergencia || '',
    observacoes: overrides.observacoes || '',
    os_abertas: Number(overrides.os_abertas || 0),
    os_sem_movimento: Number(overrides.os_sem_movimento || 0),
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeDocumento(overrides = {}) {
  return {
    id: overrides.id || uuid(),
    fatura_id: overrides.fatura_id || '',
    cliente_nome: overrides.cliente_nome || '',
    tipo: overrides.tipo || 'Nota Fiscal',
    numero: overrides.numero || '',
    status: overrides.status || 'A emitir',
    vencimento: overrides.vencimento || todayISO(),
    enviado_em: overrides.enviado_em || '',
    observacoes: overrides.observacoes || '',
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      faturas: state.faturas,
      clientes: state.clientes,
      tarifas: state.tarifas,
      documentos: state.documentos,
      equipe: state.equipe,
    }));
  } catch {}
}

async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select('*').limit(1000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Faturas: prioriza as abertas (mais recentes primeiro) para não estourar o limite com histórico finalizado.
async function fetchTableOrdered(name) {
  const { data, error } = await supabase
    .from(name)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function computeLastSync(faturas) {
  const grm = (faturas || []).filter((f) => String(f.id || '').startsWith('grm-'));
  if (!grm.length) return '';
  return grm.reduce((max, f) => (String(f.updated_at || '') > max ? String(f.updated_at || '') : max), '');
}

async function loadData() {
  state.dbError = '';
  try {
    const [faturas, clientes, tarifas, documentos, agenda] = await Promise.all([
      fetchTableOrdered(TABLES.faturas),
      fetchTable(TABLES.clientes),
      fetchTable(TABLES.tarifas),
      fetchTable(TABLES.documentos),
      fetchTable(TABLES.agenda).catch(() => []),
    ]);
    state.storageMode = 'supabase';
    state.faturas = faturas;
    state.clientes = clientes;
    state.tarifas = tarifas;
    state.documentos = documentos;
    state.agenda = agenda;
    state.lastSync = computeLastSync(faturas);
    state.equipe = await loadEquipe();
  } catch (error) {
    const local = loadLocal();
    state.storageMode = 'local';
    state.dbError = error?.message || 'Sem acesso às tabelas de faturamento no Supabase.';
    state.faturas = Array.isArray(local?.faturas) ? local.faturas : [];
    state.clientes = Array.isArray(local?.clientes) ? local.clientes : [];
    state.tarifas = Array.isArray(local?.tarifas) ? local.tarifas : [];
    state.documentos = Array.isArray(local?.documentos) ? local.documentos : [];
    state.equipe = Array.isArray(local?.equipe) && local.equipe.length ? local.equipe : buildEquipeFromContext();
  }
}

// Equipe restrita por função: apenas usuários dos setores de Faturamento/Financeiro
// (ex.: "Gestora de Faturamento", "Financeiro"). Se ninguém estiver marcado nesses
// setores, cai para a lista completa de ativos para não travar a operação.
async function loadEquipe() {
  try {
    const { data, error } = await supabase
      .from('app_usuarios')
      .select('id,nome,email,setor')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    const todos = Array.isArray(data) ? data : [];
    const equipeFat = todos.filter((u) => {
      const setor = normalize(u.setor || '');
      return SETORES_FATURAMENTO.some((s) => setor.includes(s));
    });
    if (equipeFat.length) return equipeFat;
    if (todos.length) return todos;
  } catch (e) {
    console.warn('[Faturamento] falha ao carregar equipe de app_usuarios', e);
  }
  return buildEquipeFromContext();
}

function getCurrentEquipeUser() {
  const email = normalize(state.userContext?.user?.email || '');
  const nome = normalize(getCurrentUserName());
  return state.equipe.find((u) => (email && normalize(u.email || '') === email) || (nome && normalize(u.nome || '') === nome)) || null;
}

function buildEquipeFromContext() {
  const current = {
    id: state.userContext?.user?.id || state.userContext?.user?.email || 'usuario-atual',
    nome: getCurrentUserName(),
    email: state.userContext?.user?.email || '',
  };
  if (!current.nome || normalize(current.nome) === 'sistema') return [];
  return [current];
}

async function persistTable(table, row) {
  if (state.storageMode !== 'supabase') {
    saveLocal();
    return;
  }
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

function getFilteredFaturas() {
  const q = normalize(state.filters.q);
  return state.faturas.filter((item) => {
    const matchQ = !q || [item.codigo, item.cliente_nome, item.periodo, item.responsavel_nome, item.status, item.divergencia]
      .filter(Boolean)
      .some((value) => normalize(value).includes(q));
    const matchStatus = !state.filters.status || String(item.status || '') === state.filters.status;
    const matchResp = !state.filters.responsavel || String(item.responsavel_id || '') === state.filters.responsavel;
    const matchPeriodicidade = !state.filters.periodicidade || String(item.periodicidade || '') === state.filters.periodicidade;
    return matchQ && matchStatus && matchResp && matchPeriodicidade;
  }).sort((a, b) => String(a.prazo_envio || '').localeCompare(String(b.prazo_envio || '')));
}

function getKPIs() {
  const hoje = todayISO();
  const abertas = state.faturas.filter((f) => !['Finalizada', 'Cancelada'].includes(f.status));
  return {
    hoje: abertas.filter((f) => String(f.prazo_envio || '') <= hoje).length,
    aguardando: abertas.filter((f) => normalize(f.status).includes('aguardando retorno')).length,
    divergencias: abertas.filter((f) => normalize(f.status).includes('divergencia')).length,
    documentos: state.documentos.filter((d) => !['Enviado', 'Cancelado'].includes(d.status)).length,
    osParadas: abertas.reduce((sum, f) => sum + Number(f.os_sem_movimento || 0), 0),
    semResponsavel: abertas.filter((f) => !f.responsavel_id).length,
  };
}

function renderModeWarning() {
  if (state.storageMode === 'supabase') {
    // Sobrou rascunho antigo do "modo estrutura" (dados locais/demonstração,
    // gravados no navegador quando o banco ainda estava bloqueado)?
    if (loadLocal()) {
      return `
        <div class="fat-warning">
          <strong>Rascunho local antigo encontrado:</strong> este navegador tem dados de faturamento salvos da fase de estrutura (provavelmente de demonstração). Eles não são mais usados — a tela agora lê e grava direto no banco compartilhado.
          <button class="fat-btn fat-btn-secondary" type="button" data-action="discard-local">Descartar rascunho local</button>
        </div>
      `;
    }
    return '';
  }
  return `
    <div class="fat-warning">
      <strong>Sem conexão com o banco:</strong> não foi possível acessar as tabelas de faturamento. As alterações feitas agora ficam salvas <b>somente neste navegador</b> e não são compartilhadas — tente atualizar a página; se persistir, avise o TI.
      <span>${esc(state.dbError)}</span>
    </div>
  `;
}

function renderShell(content) {
  const k = getKPIs();
  content.innerHTML = `
    <section class="fat-shell">
      <section class="fat-hero">
        <div>
          <div class="fat-eyebrow">Módulo operacional</div>
          <h2>Faturamento</h2>
          <p>Agenda, distribuição por usuário, faturas, documentos fiscais, boletos, divergências, clientes e tarifas em uma única rotina.${state.lastSync ? ` <span class="fat-sync-badge">Última sincronização GRM: ${esc(formatDateTimeBR(state.lastSync))}</span>` : ''}</p>
        </div>
        <div class="fat-actions">
          <button class="fat-btn fat-btn-secondary" type="button" data-action="refresh">↻ Atualizar</button>
          <button class="fat-btn fat-btn-secondary" type="button" data-action="sync-grm" ${state.syncing ? 'disabled' : ''}>${state.syncing ? 'Sincronizando…' : '⇅ Sincronizar GRM'}</button>
          <button class="fat-btn fat-btn-primary" type="button" data-action="new-invoice">+ Nova fatura</button>
        </div>
      </section>

      ${renderModeWarning()}

      <section class="fat-kpis">
        ${renderKpi('Faturas para hoje', k.hoje, 'Prazos de emissão vencendo ou vencidos')}
        ${renderKpi('Aguardando retorno', k.aguardando, 'Clientes que precisam responder')}
        ${renderKpi('Divergências', k.divergencias, 'Faturas com solicitação de ajuste')}
        ${renderKpi('Documentos pendentes', k.documentos, 'NF, boleto, nota de débito ou termo')}
        ${renderKpi('OS paradas', k.osParadas, 'OS sem movimentação para encerrar')}
        ${renderKpi('Sem responsável', k.semResponsavel, 'Demandas ainda não distribuídas')}
      </section>

      <nav class="fat-tabs" aria-label="Abas do faturamento">
        ${TABS.map((tab) => `<button type="button" class="fat-tab ${state.activeTab === tab.id ? 'is-active' : ''}" data-tab="${esc(tab.id)}">${esc(tab.label)}</button>`).join('')}
      </nav>

      <section id="fatBody">${renderActiveTab()}</section>
    </section>
  `;
  bindEvents(content);
}

function renderKpi(label, value, hint) {
  return `
    <article class="fat-kpi">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(hint)}</small>
    </article>
  `;
}

function renderActiveTab() {
  if (state.activeTab === 'agenda') return renderAgenda();
  if (state.activeTab === 'faturas') return renderFaturas();
  if (state.activeTab === 'documentos') return renderDocumentos();
  if (state.activeTab === 'clientes') return renderClientes();
  return renderPainelDia();
}

function renderPainelDia() {
  return `
    <div class="fat-grid-main">
      <section class="fat-panel fat-span-2">
        <div class="fat-panel-head">
          <div>
            <h3>Distribuição de faturas</h3>
            <p>O coordenador seleciona as faturas e define responsável, prioridade e prazo interno.</p>
          </div>
          <span class="fat-chip ${isCoordinator() ? 'is-green' : 'is-muted'}">${isCoordinator() ? 'Coordenador liberado' : 'Visualização'}</span>
        </div>
        ${renderDistributionToolbar()}
        ${renderFaturasTable(getFilteredFaturas(), { selectable: isCoordinator(), compact: false })}
      </section>

      <aside class="fat-side">
        ${renderMinhaFila()}
        ${renderEquipeResumo()}
      </aside>
    </div>
  `;
}

function renderDistributionToolbar() {
  if (!isCoordinator()) return '';
  return `
    <div class="fat-distrib-toolbar">
      <select class="fat-input" id="fatAssignUser">
        <option value="">Responsável</option>
        ${state.equipe.map((u) => `<option value="${esc(u.id)}">${esc(u.nome)}</option>`).join('')}
      </select>
      <select class="fat-input" id="fatAssignPriority">
        ${PRIORIDADES.map((p) => `<option value="${esc(p)}" ${p === 'Normal' ? 'selected' : ''}>${esc(p)}</option>`).join('')}
      </select>
      <input class="fat-input" id="fatAssignDeadline" type="date" value="${todayISO()}">
      <button class="fat-btn fat-btn-primary" type="button" data-action="assign-selected">Distribuir selecionadas</button>
      <button class="fat-btn fat-btn-secondary" type="button" data-action="suggest-distribution">Sugerir divisão</button>
    </div>
  `;
}

function renderMinhaFila() {
  const me = getCurrentEquipeUser();
  const minhas = me
    ? state.faturas.filter((f) => String(f.responsavel_id || '') === String(me.id) && !['Finalizada', 'Cancelada'].includes(f.status))
    : [];
  return `
    <section class="fat-panel">
      <div class="fat-panel-head slim">
        <div>
          <h3>Minha fila</h3>
          <p>${minhas.length} fatura(s) atribuída(s)</p>
        </div>
      </div>
      <div class="fat-mini-list">
        ${minhas.length ? minhas.slice(0, 6).map((f) => `
          <button type="button" class="fat-mini-item" data-action="focus-fatura" data-id="${esc(f.id)}">
            <strong>${esc(f.cliente_nome)}</strong>
            <span>${esc(f.codigo)} • ${esc(f.status)}</span>
          </button>
        `).join('') : '<div class="fat-empty">Nenhuma fatura atribuída a você no momento.</div>'}
      </div>
    </section>
  `;
}

function renderEquipeResumo() {
  const rows = state.equipe.map((user) => {
    const items = state.faturas.filter((f) => String(f.responsavel_id || '') === String(user.id) && !['Finalizada', 'Cancelada'].includes(f.status));
    const vencidas = items.filter((f) => String(f.prazo_envio || '') < todayISO()).length;
    return { user, total: items.length, vencidas, valor: items.reduce((sum, f) => sum + Number(f.valor_liquido || 0), 0) };
  });
  const sem = state.faturas.filter((f) => !f.responsavel_id && !['Finalizada', 'Cancelada'].includes(f.status)).length;
  return `
    <section class="fat-panel">
      <div class="fat-panel-head slim">
        <div>
          <h3>Fila da equipe</h3>
          <p>Carga por responsável</p>
        </div>
      </div>
      <div class="fat-team-list">
        ${rows.map((row) => `
          <div class="fat-team-row">
            <div><strong>${esc(row.user.nome)}</strong><span>${money(row.valor)}</span></div>
            <b>${row.total}</b>
            <small class="${row.vencidas ? 'is-red' : ''}">${row.vencidas} vencida(s)</small>
          </div>
        `).join('')}
        <div class="fat-team-row is-warn"><div><strong>Sem responsável</strong><span>Distribuir</span></div><b>${sem}</b><small>pendente(s)</small></div>
      </div>
    </section>
  `;
}

function renderAgenda() {
  const grupos = ['Semanal', 'Quinzenal', 'Mensal', 'Sob demanda'];
  return `
    <section class="fat-panel">
      <div class="fat-panel-head">
        <div>
          <h3>Agenda de faturamento</h3>
          <p>Rotina configurável: adicione clientes com periodicidade, dia de referência, responsável e canal de envio.</p>
        </div>
        <button class="fat-btn fat-btn-primary" type="button" data-action="agenda-add">+ Adicionar cliente à agenda</button>
      </div>
      ${renderAgendaTable()}
      <div class="fat-agenda-grid">
        ${grupos.map((grupo) => renderAgendaGroup(grupo)).join('')}
      </div>
    </section>
  `;
}

function renderAgendaTable() {
  const rows = [...state.agenda].sort((a, b) => String(a.proximo_envio || '9999').localeCompare(String(b.proximo_envio || '9999')));
  if (!rows.length) {
    return '<div class="fat-empty">Nenhum cliente configurado na agenda ainda. Use “Adicionar cliente à agenda” para montar a rotina de faturamento.</div>';
  }
  return `
    <div class="fat-table-wrap">
      <table class="fat-table">
        <thead>
          <tr><th>Cliente</th><th>Periodicidade</th><th>Dia de referência</th><th>Próximo envio</th><th>Responsável</th><th>Canal</th><th>Status</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${rows.map((a) => `
            <tr>
              <td><div class="fat-strong">${esc(a.cliente_nome)}</div>${a.observacoes ? `<span class="fat-muted">${esc(a.observacoes)}</span>` : ''}</td>
              <td>${esc(a.periodicidade || 'Mensal')}</td>
              <td>${esc(a.dia_referencia || '—')}</td>
              <td>${dateBR(a.proximo_envio)}</td>
              <td>${esc(a.responsavel_nome || '—')}</td>
              <td>${esc(a.canal_envio || 'E-mail')}</td>
              <td><span class="fat-chip ${a.ativo === false ? 'is-muted' : 'is-green'}">${a.ativo === false ? 'Pausada' : 'Ativa'}</span></td>
              <td>
                <div class="fat-row-actions">
                  <button class="fat-mini-btn" type="button" data-action="agenda-edit" data-id="${esc(a.id)}">Editar</button>
                  <button class="fat-mini-btn" type="button" data-action="agenda-toggle" data-id="${esc(a.id)}">${a.ativo === false ? 'Reativar' : 'Pausar'}</button>
                  <button class="fat-mini-btn" type="button" data-action="agenda-remove" data-id="${esc(a.id)}">Remover</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAgendaGroup(periodicidade) {
  const daAgenda = state.agenda.filter((a) => String(a.periodicidade || '') === periodicidade && a.ativo !== false);
  const clientes = daAgenda.length
    ? daAgenda.map((a) => state.clientes.find((c) => String(c.id) === String(a.cliente_id)) || { id: a.cliente_id, nome: a.cliente_nome, prazo_retorno_dias: 0 })
    : state.clientes.filter((c) => String(c.periodicidade || '') === periodicidade && !String(c.id || '').startsWith('grm-cli-'));
  return `
    <article class="fat-agenda-card">
      <h4>${esc(periodicidade)}</h4>
      ${clientes.length ? clientes.map((cliente) => {
        const abertas = state.faturas.filter((f) => String(f.cliente_id) === String(cliente.id) && !['Finalizada', 'Cancelada'].includes(f.status));
        const agendaRow = daAgenda.find((a) => String(a.cliente_id) === String(cliente.id));
        const prox = agendaRow?.proximo_envio || abertas[0]?.prazo_envio || '—';
        return `
          <div class="fat-agenda-row">
            <div>
              <strong>${esc(cliente.nome)}</strong>
              <span>Próximo: ${dateBR(prox)} • Retorno: ${esc(cliente.prazo_retorno_dias || 0)} dia(s)</span>
            </div>
            <span class="fat-chip ${abertas.length ? 'is-amber' : 'is-green'}">${abertas.length ? `${abertas.length} aberta(s)` : 'Em dia'}</span>
          </div>
        `;
      }).join('') : '<div class="fat-empty">Nenhum cliente nesta periodicidade.</div>'}
    </article>
  `;
}

function renderFaturas() {
  return `
    <section class="fat-panel">
      <div class="fat-panel-head">
        <div>
          <h3>Faturas</h3>
          <p>Criação, conferência, envio, correção, descontos e divergências apontadas pelos clientes.</p>
        </div>
      </div>
      ${renderFilters()}
      ${renderFaturasTable(getFilteredFaturas(), { selectable: false, compact: false })}
    </section>
  `;
}

function renderFilters() {
  return `
    <div class="fat-filters">
      <input class="fat-input" type="search" data-filter="q" placeholder="Buscar cliente, código, status ou responsável" value="${esc(state.filters.q)}">
      <select class="fat-input" data-filter="status">
        <option value="">Todos os status</option>
        ${STATUS.map((s) => `<option value="${esc(s)}" ${state.filters.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <select class="fat-input" data-filter="responsavel">
        <option value="">Todos os responsáveis</option>
        ${state.equipe.map((u) => `<option value="${esc(u.id)}" ${state.filters.responsavel === String(u.id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}
      </select>
      <select class="fat-input" data-filter="periodicidade">
        <option value="">Todas as periodicidades</option>
        ${['Semanal', 'Quinzenal', 'Mensal', 'Sob demanda'].map((p) => `<option value="${esc(p)}" ${state.filters.periodicidade === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
      </select>
    </div>
  `;
}

function renderFaturasTable(items, opts = {}) {
  if (!items.length) return '<div class="fat-empty">Nenhuma fatura encontrada.</div>';
  return `
    <div class="fat-table-wrap">
      <table class="fat-table">
        <thead>
          <tr>
            ${opts.selectable ? '<th><input type="checkbox" data-action="toggle-all"></th>' : ''}
            <th>Fatura</th>
            <th>Cliente / período</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Responsável</th>
            <th>Prazo</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((f) => renderFaturaRow(f, opts)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderFaturaRow(f, opts = {}) {
  const atraso = daysBetween(f.prazo_envio, todayISO());
  const isLate = f.prazo_envio && f.prazo_envio < todayISO() && !['Finalizada', 'Cancelada'].includes(f.status);
  return `
    <tr data-fatura-id="${esc(f.id)}">
      ${opts.selectable ? `<td><input type="checkbox" data-action="select-fatura" data-id="${esc(f.id)}" ${state.selectedIds.has(String(f.id)) ? 'checked' : ''}></td>` : ''}
      <td>
        <div class="fat-strong">${esc(f.codigo)}</div>
        <span class="fat-chip ${prioridadeClass(f.prioridade)}">${esc(f.prioridade || 'Normal')}</span>
      </td>
      <td>
        <div class="fat-strong">${esc(f.cliente_nome || '-')}</div>
        <span class="fat-muted">${esc(f.periodo || '-')} • ${esc(f.periodicidade || '-')}</span>
        ${f.divergencia ? `<div class="fat-note">${esc(f.divergencia)}</div>` : ''}
      </td>
      <td>
        <div class="fat-strong">${money(f.valor_liquido)}</div>
        <span class="fat-muted">Desc.: ${money(f.descontos)}</span>
      </td>
      <td>
        <select class="fat-input fat-input-sm" data-action="change-status" data-id="${esc(f.id)}">
          ${STATUS.map((s) => `<option value="${esc(s)}" ${String(f.status) === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
        <span class="fat-chip ${statusClass(f.status)}">${esc(f.status)}</span>
      </td>
      <td>
        <select class="fat-input fat-input-sm" data-action="change-owner" data-id="${esc(f.id)}" ${!isCoordinator() ? 'disabled' : ''}>
          <option value="">Sem responsável</option>
          ${state.equipe.map((u) => `<option value="${esc(u.id)}" ${String(f.responsavel_id || '') === String(u.id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="fat-strong ${isLate ? 'is-red' : ''}">${dateBR(f.prazo_envio)}</div>
        <span class="fat-muted">Retorno: ${dateBR(f.prazo_retorno)}</span>
        ${isLate ? `<span class="fat-late">${Math.max(1, atraso)} dia(s) vencida</span>` : ''}
      </td>
      <td>
        <div class="fat-row-actions">
          <button class="fat-mini-btn" type="button" data-action="send-invoice" data-id="${esc(f.id)}">Enviar</button>
          <button class="fat-mini-btn" type="button" data-action="register-return" data-id="${esc(f.id)}">Retorno</button>
          <button class="fat-mini-btn" type="button" data-action="open-divergence" data-id="${esc(f.id)}">Divergência</button>
          <button class="fat-mini-btn" type="button" data-action="finish-invoice" data-id="${esc(f.id)}">Finalizar</button>
        </div>
      </td>
    </tr>
  `;
}

function renderDocumentos() {
  return `
    <section class="fat-panel">
      <div class="fat-panel-head">
        <div>
          <h3>Documentos</h3>
          <p>Notas fiscais, boletos, notas de débito, termos de quitação, substituições e cancelamentos.</p>
        </div>
        <button class="fat-btn fat-btn-secondary" type="button" data-action="new-doc">+ Documento</button>
      </div>
      <div class="fat-table-wrap">
        <table class="fat-table">
          <thead><tr><th>Tipo</th><th>Cliente</th><th>Status</th><th>Vencimento</th><th>Ações</th></tr></thead>
          <tbody>
            ${state.documentos.map((d) => `
              <tr>
                <td><div class="fat-strong">${esc(d.tipo)}</div><span class="fat-muted">${esc(d.numero || 'Sem número')}</span></td>
                <td>${esc(d.cliente_nome || '-')}</td>
                <td><span class="fat-chip ${statusClass(d.status)}">${esc(d.status)}</span></td>
                <td>${dateBR(d.vencimento)}</td>
                <td>
                  <div class="fat-row-actions">
                    <button class="fat-mini-btn" type="button" data-action="doc-issued" data-id="${esc(d.id)}">Emitido</button>
                    <button class="fat-mini-btn" type="button" data-action="doc-sent" data-id="${esc(d.id)}">Enviado</button>
                    <button class="fat-mini-btn" type="button" data-action="doc-cancel" data-id="${esc(d.id)}">Cancelar/Substituir</button>
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="5"><div class="fat-empty">Nenhum documento cadastrado.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderClientes() {
  return `
    <div class="fat-grid-main">
      <section class="fat-panel">
        <div class="fat-panel-head">
          <div>
            <h3>Clientes</h3>
            <p>Cadastro, contatos financeiros, periodicidade, prazo de retorno e regras internas.</p>
          </div>
        </div>
        <div class="fat-client-list">
          ${state.clientes.map((c) => `
            <article class="fat-client-card">
              <div>
                <h4>${esc(c.nome)}</h4>
                <p>${esc(c.email_financeiro || 'Sem e-mail financeiro')} • ${esc(c.whatsapp || 'Sem WhatsApp')}</p>
                <span>${esc(c.periodicidade || '-')} • retorno em ${esc(c.prazo_retorno_dias || 0)} dia(s) • pagamento em ${esc(c.prazo_pagamento_dias || 0)} dia(s)</span>
              </div>
              <button class="fat-mini-btn" type="button" data-action="edit-client" data-id="${esc(c.id)}">Atualizar cadastro</button>
            </article>
          `).join('')}
        </div>
      </section>

      <section class="fat-panel">
        <div class="fat-panel-head">
          <div>
            <h3>Tarifas</h3>
            <p>Valores por serviço com vigência e histórico de atualização.</p>
          </div>
        </div>
        <div class="fat-table-wrap">
          <table class="fat-table">
            <thead><tr><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Vigência</th><th>Status</th></tr></thead>
            <tbody>
              ${state.tarifas.map((t) => `
                <tr>
                  <td>${esc(t.cliente_nome || '-')}</td>
                  <td>${esc(t.servico || '-')}<br><span class="fat-muted">${esc(t.unidade || '-')}</span></td>
                  <td>${money(t.valor)}</td>
                  <td>${dateBR(t.vigencia)}</td>
                  <td><span class="fat-chip is-green">${esc(t.status || 'Ativa')}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function bindEvents(content) {
  content.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.tab;
      renderShell(content);
    });
  });

  content.querySelectorAll('[data-filter]').forEach((field) => {
    field.addEventListener('input', () => {
      state.filters[field.dataset.filter] = field.value;
      renderShell(content);
    });
    field.addEventListener('change', () => {
      state.filters[field.dataset.filter] = field.value;
      renderShell(content);
    });
  });

  content.querySelectorAll('[data-action]').forEach((el) => {
    const action = el.dataset.action;
    if (['change-status', 'change-owner'].includes(action)) {
      el.addEventListener('change', () => handleAction(action, el, content));
    } else if (action === 'select-fatura') {
      el.addEventListener('change', () => {
        if (el.checked) state.selectedIds.add(String(el.dataset.id));
        else state.selectedIds.delete(String(el.dataset.id));
      });
    } else if (action === 'toggle-all') {
      el.addEventListener('change', () => {
        const ids = getFilteredFaturas().map((f) => String(f.id));
        ids.forEach((id) => el.checked ? state.selectedIds.add(id) : state.selectedIds.delete(id));
        renderShell(content);
      });
    } else {
      el.addEventListener('click', () => handleAction(action, el, content));
    }
  });
}

async function handleAction(action, el, content) {
  try {
    if (action === 'refresh') {
      await loadData();
      renderShell(content);
      return;
    }
    if (action === 'discard-local') {
      if (!confirm('Descartar o rascunho local antigo deste navegador? Os dados do banco compartilhado não são afetados.')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      renderShell(content);
      return;
    }
    if (action === 'new-invoice') return openInvoiceModal(content);
    if (action === 'sync-grm') return syncGrm(content);
    if (action === 'agenda-add') return openAgendaModal(content, null);
    if (action === 'agenda-edit') return openAgendaModal(content, el.dataset.id);
    if (action === 'agenda-toggle') return toggleAgenda(el.dataset.id, content);
    if (action === 'agenda-remove') return removeAgenda(el.dataset.id, content);
    if (action === 'assign-selected') return assignSelected(content);
    if (action === 'suggest-distribution') return suggestDistribution(content);
    if (action === 'change-status') return updateFatura(el.dataset.id, { status: el.value }, content);
    if (action === 'change-owner') return updateOwner(el.dataset.id, el.value, content);
    if (action === 'send-invoice') return markSent(el.dataset.id, content);
    if (action === 'register-return') return registerReturn(el.dataset.id, content);
    if (action === 'open-divergence') return openDivergence(el.dataset.id, content);
    if (action === 'finish-invoice') return updateFatura(el.dataset.id, { status: 'Finalizada' }, content);
    if (action === 'doc-issued') return updateDocumento(el.dataset.id, { status: 'Emitido', numero: prompt('Número do documento:', '') || '' }, content);
    if (action === 'doc-sent') return updateDocumento(el.dataset.id, { status: 'Enviado', enviado_em: new Date().toISOString() }, content);
    if (action === 'doc-cancel') return updateDocumento(el.dataset.id, { status: 'Cancelamento/Substituição', observacoes: prompt('Motivo do cancelamento/substituição:', '') || '' }, content);
    if (action === 'new-doc') return openDocModal(content);
    if (action === 'edit-client') return editClient(el.dataset.id, content);
    if (action === 'focus-fatura') {
      state.activeTab = 'faturas';
      state.filters.q = state.faturas.find((f) => String(f.id) === String(el.dataset.id))?.codigo || '';
      renderShell(content);
    }
  } catch (error) {
    alert(error?.message || 'Erro ao executar ação.');
  }
}

async function updateFatura(id, patch, content) {
  const current = state.faturas.find((f) => String(f.id) === String(id));
  if (!current) return;
  const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
  state.faturas = state.faturas.map((f) => String(f.id) === String(id) ? updated : f);
  await persistTable(TABLES.faturas, updated);
  renderShell(content);
}

async function updateOwner(id, userId, content) {
  const user = state.equipe.find((u) => String(u.id) === String(userId));
  await updateFatura(id, {
    responsavel_id: user?.id || '',
    responsavel_nome: user?.nome || '',
    status: user ? 'Distribuída' : 'Sem responsável',
    distribuido_por_nome: getCurrentUserName(),
    distribuido_em: new Date().toISOString(),
  }, content);
}

async function updateDocumento(id, patch, content) {
  const current = state.documentos.find((d) => String(d.id) === String(id));
  if (!current) return;
  const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
  state.documentos = state.documentos.map((d) => String(d.id) === String(id) ? updated : d);
  await persistTable(TABLES.documentos, updated);
  renderShell(content);
}

async function assignSelected(content) {
  const userId = document.getElementById('fatAssignUser')?.value || '';
  const priority = document.getElementById('fatAssignPriority')?.value || 'Normal';
  const deadline = document.getElementById('fatAssignDeadline')?.value || todayISO();
  if (!userId) return alert('Selecione um responsável.');
  if (!state.selectedIds.size) return alert('Selecione ao menos uma fatura.');
  const user = state.equipe.find((u) => String(u.id) === String(userId));
  for (const id of [...state.selectedIds]) {
    const current = state.faturas.find((f) => String(f.id) === String(id));
    if (!current) continue;
    const updated = {
      ...current,
      responsavel_id: user.id,
      responsavel_nome: user.nome,
      status: 'Distribuída',
      prioridade: priority,
      prazo_envio: deadline,
      distribuido_por_nome: getCurrentUserName(),
      distribuido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    state.faturas = state.faturas.map((f) => String(f.id) === String(id) ? updated : f);
    await persistTable(TABLES.faturas, updated);
  }
  state.selectedIds.clear();
  renderShell(content);
}

async function suggestDistribution(content) {
  const pendentes = state.faturas.filter((f) => !f.responsavel_id && !['Finalizada', 'Cancelada'].includes(f.status));
  if (!pendentes.length) return alert('Não há faturas sem responsável.');
  if (!state.equipe.length) return alert('Não há usuários cadastrados para distribuir.');
  const load = new Map(state.equipe.map((u) => [String(u.id), state.faturas.filter((f) => String(f.responsavel_id) === String(u.id)).length]));
  for (const f of pendentes) {
    const target = [...state.equipe].sort((a, b) => (load.get(String(a.id)) || 0) - (load.get(String(b.id)) || 0))[0];
    load.set(String(target.id), (load.get(String(target.id)) || 0) + 1);
    await updateFatura(f.id, {
      responsavel_id: target.id,
      responsavel_nome: target.nome,
      status: 'Distribuída',
      distribuido_por_nome: getCurrentUserName(),
      distribuido_em: new Date().toISOString(),
    }, content);
  }
}

async function markSent(id, content) {
  const canal = prompt('Canal de envio: E-mail, WhatsApp ou ambos?', 'E-mail') || 'E-mail';
  await updateFatura(id, {
    status: 'Aguardando retorno',
    canal_envio: canal,
    prazo_retorno: addDays(todayISO(), 2),
    proxima_cobranca_em: addDays(todayISO(), 2),
  }, content);
}

async function registerReturn(id, content) {
  const retorno = prompt('Resumo do retorno do cliente:', 'Cliente retornou sem divergência.') || '';
  const status = retorno ? 'Aguardando documentos' : 'Aguardando retorno';
  await updateFatura(id, { status, ultimo_retorno_em: new Date().toISOString(), observacoes: retorno }, content);
}

async function openDivergence(id, content) {
  const divergencia = prompt('Descreva a divergência apontada pelo cliente:', '') || '';
  if (!divergencia) return;
  await updateFatura(id, { status: 'Com divergência', prioridade: 'Urgente', divergencia }, content);
}

// Sincronização com o GRM: importa contas a receber em aberto via RPC no banco.
async function syncGrm(content) {
  if (state.syncing) return;
  state.syncing = true;
  renderShell(content);
  try {
    const { data, error } = await supabase.rpc('faturamento_sync_grm', { p_dias: 60 });
    if (error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    await loadData();
    state.syncing = false;
    renderShell(content);
    const imp = Number(r?.faturas_importadas || 0);
    const atu = Number(r?.faturas_atualizadas || 0);
    alert(`Sincronização GRM concluída.\n\nFaturas novas importadas: ${imp}\nFaturas atualizadas: ${atu}\nClientes atualizados: ${Number(r?.clientes_importados || 0)}`);
  } catch (e) {
    state.syncing = false;
    renderShell(content);
    alert(`Falha na sincronização com o GRM: ${e?.message || e}`);
  }
}

// ===== Modais =====
function closeModal() {
  document.getElementById('fatModalOverlay')?.remove();
}

function openModal(title, bodyHtml, onSubmit) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'fatModalOverlay';
  overlay.className = 'fat-modal-overlay';
  overlay.innerHTML = `
    <div class="fat-modal" role="dialog" aria-modal="true">
      <div class="fat-modal-head">
        <h3>${esc(title)}</h3>
        <button type="button" class="fat-modal-close" data-close>×</button>
      </div>
      <form class="fat-modal-body" id="fatModalForm">${bodyHtml}
        <div class="fat-modal-actions">
          <button type="button" class="fat-btn fat-btn-secondary" data-close>Cancelar</button>
          <button type="submit" class="fat-btn fat-btn-primary">Salvar</button>
        </div>
      </form>
    </div>`;
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay || ev.target.closest('[data-close]')) closeModal();
  });
  overlay.querySelector('#fatModalForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const values = {};
    form.querySelectorAll('[name]').forEach((i) => { values[i.name] = i.value; });
    await onSubmit(values);
  });
  document.body.appendChild(overlay);
  overlay.querySelector('input,select,textarea')?.focus();
}

function clienteDatalist() {
  const nomes = [...new Set(state.clientes.map((c) => String(c.nome || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return `<datalist id="fatClientesList">${nomes.slice(0, 800).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
}

function openInvoiceModal(content) {
  openModal('Nova fatura', `
    ${clienteDatalist()}
    <div class="fat-form-grid">
      <label class="fat-field fat-col-2"><span>Cliente *</span><input class="fat-input" name="cliente" list="fatClientesList" required placeholder="Digite para buscar o cliente" /></label>
      <label class="fat-field"><span>Período</span><input class="fat-input" name="periodo" placeholder="Ex.: Julho/2026" value="${esc(new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}" /></label>
      <label class="fat-field"><span>Periodicidade</span><select class="fat-input" name="periodicidade"><option>Mensal</option><option>Semanal</option><option>Quinzenal</option><option>Sob demanda</option></select></label>
      <label class="fat-field"><span>Valor bruto (R$)</span><input class="fat-input" name="valor" type="number" step="0.01" min="0" value="0" /></label>
      <label class="fat-field"><span>Descontos (R$)</span><input class="fat-input" name="descontos" type="number" step="0.01" min="0" value="0" /></label>
      <label class="fat-field"><span>Prazo de envio</span><input class="fat-input" name="prazo_envio" type="date" value="${esc(todayISO())}" /></label>
      <label class="fat-field"><span>Prioridade</span><select class="fat-input" name="prioridade">${PRIORIDADES.map((p) => `<option ${p === 'Normal' ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="fat-field"><span>Responsável</span><select class="fat-input" name="responsavel"><option value="">— Definir depois —</option>${state.equipe.map((u) => `<option value="${esc(u.id)}">${esc(u.nome)}</option>`).join('')}</select></label>
      <label class="fat-field fat-col-2"><span>Observações</span><textarea class="fat-input" name="observacoes" rows="2" placeholder="Detalhes da fatura (opcional)"></textarea></label>
    </div>
  `, async (v) => {
    const clienteNome = String(v.cliente || '').trim();
    if (!clienteNome) return alert('Informe o cliente.');
    const cliente = state.clientes.find((c) => normalize(c.nome) === normalize(clienteNome));
    const responsavel = state.equipe.find((u) => String(u.id) === String(v.responsavel));
    const fatura = makeFatura({
      cliente_id: cliente?.id || '',
      cliente_nome: clienteNome,
      periodo: v.periodo || '',
      valor_bruto: toNumber(v.valor),
      descontos: toNumber(v.descontos),
      periodicidade: v.periodicidade || 'Mensal',
      prioridade: v.prioridade || 'Normal',
      observacoes: v.observacoes || '',
      prazo_envio: v.prazo_envio || todayISO(),
      prazo_retorno: addDays(v.prazo_envio || todayISO(), Number(cliente?.prazo_retorno_dias || 2)),
      ...(responsavel ? { responsavel_id: responsavel.id, responsavel_nome: responsavel.nome, status: 'Distribuída', distribuido_por_nome: getCurrentUserName(), distribuido_em: new Date().toISOString() } : {}),
    });
    state.faturas.unshift(fatura);
    closeModal();
    await persistTable(TABLES.faturas, fatura);
    renderShell(content);
  });
}

function openAgendaModal(content, id) {
  const current = id ? state.agenda.find((a) => String(a.id) === String(id)) : null;
  openModal(current ? 'Editar rotina de faturamento' : 'Adicionar cliente à agenda', `
    ${clienteDatalist()}
    <div class="fat-form-grid">
      <label class="fat-field fat-col-2"><span>Cliente *</span><input class="fat-input" name="cliente" list="fatClientesList" required value="${esc(current?.cliente_nome || '')}" placeholder="Digite para buscar o cliente" /></label>
      <label class="fat-field"><span>Periodicidade</span><select class="fat-input" name="periodicidade">${['Semanal', 'Quinzenal', 'Mensal', 'Sob demanda'].map((p) => `<option ${String(current?.periodicidade || 'Mensal') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="fat-field"><span>Dia de referência</span><input class="fat-input" name="dia_referencia" value="${esc(current?.dia_referencia || '')}" placeholder="Ex.: dia 5, toda segunda" /></label>
      <label class="fat-field"><span>Próximo envio</span><input class="fat-input" name="proximo_envio" type="date" value="${esc(current?.proximo_envio || todayISO())}" /></label>
      <label class="fat-field"><span>Responsável</span><select class="fat-input" name="responsavel"><option value="">— Sem responsável fixo —</option>${state.equipe.map((u) => `<option value="${esc(u.id)}" ${String(current?.responsavel_id || '') === String(u.id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label>
      <label class="fat-field"><span>Canal de envio</span><select class="fat-input" name="canal_envio">${['E-mail', 'WhatsApp', 'E-mail + WhatsApp'].map((c) => `<option ${String(current?.canal_envio || 'E-mail') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="fat-field fat-col-2"><span>Observações</span><textarea class="fat-input" name="observacoes" rows="2">${esc(current?.observacoes || '')}</textarea></label>
    </div>
  `, async (v) => {
    const clienteNome = String(v.cliente || '').trim();
    if (!clienteNome) return alert('Informe o cliente.');
    const cliente = state.clientes.find((c) => normalize(c.nome) === normalize(clienteNome));
    const responsavel = state.equipe.find((u) => String(u.id) === String(v.responsavel));
    const row = {
      ...(current || { id: `age-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ativo: true, created_at: new Date().toISOString() }),
      cliente_id: cliente?.id || current?.cliente_id || '',
      cliente_nome: clienteNome,
      periodicidade: v.periodicidade || 'Mensal',
      dia_referencia: v.dia_referencia || '',
      proximo_envio: v.proximo_envio || null,
      responsavel_id: responsavel?.id || '',
      responsavel_nome: responsavel?.nome || '',
      canal_envio: v.canal_envio || 'E-mail',
      observacoes: v.observacoes || '',
      updated_at: new Date().toISOString(),
    };
    state.agenda = current ? state.agenda.map((a) => String(a.id) === String(row.id) ? row : a) : [...state.agenda, row];
    closeModal();
    await persistTable(TABLES.agenda, row);
    renderShell(content);
  });
}

async function toggleAgenda(id, content) {
  const current = state.agenda.find((a) => String(a.id) === String(id));
  if (!current) return;
  const updated = { ...current, ativo: current.ativo === false, updated_at: new Date().toISOString() };
  state.agenda = state.agenda.map((a) => String(a.id) === String(id) ? updated : a);
  await persistTable(TABLES.agenda, updated);
  renderShell(content);
}

async function removeAgenda(id, content) {
  const current = state.agenda.find((a) => String(a.id) === String(id));
  if (!current) return;
  if (!confirm(`Remover “${current.cliente_nome}” da agenda de faturamento?`)) return;
  state.agenda = state.agenda.filter((a) => String(a.id) !== String(id));
  if (state.storageMode === 'supabase') {
    const { error } = await supabase.from(TABLES.agenda).delete().eq('id', id);
    if (error) { alert(`Erro ao remover: ${error.message}`); return; }
  } else {
    saveLocal();
  }
  renderShell(content);
}

function openDocModal(content) {
  const tipo = prompt('Tipo do documento: Nota Fiscal, Boleto, Nota de Débito ou Termo de Quitação', 'Nota Fiscal') || '';
  if (!tipo.trim()) return;
  const clienteNome = prompt('Cliente:', '') || '';
  const doc = makeDocumento({ tipo, cliente_nome: clienteNome, vencimento: todayISO() });
  state.documentos.unshift(doc);
  persistTable(TABLES.documentos, doc).finally(() => renderShell(content));
}

async function editClient(id, content) {
  const current = state.clientes.find((c) => String(c.id) === String(id));
  if (!current) return;
  const email = prompt('E-mail financeiro:', current.email_financeiro || '') ?? current.email_financeiro;
  const whatsapp = prompt('WhatsApp responsável:', current.whatsapp || '') ?? current.whatsapp;
  const periodicidade = prompt('Periodicidade:', current.periodicidade || 'Mensal') ?? current.periodicidade;
  const updated = { ...current, email_financeiro: email, whatsapp, periodicidade, updated_at: new Date().toISOString() };
  state.clientes = state.clientes.map((c) => String(c.id) === String(id) ? updated : c);
  await persistTable(TABLES.clientes, updated);
  renderShell(content);
}

function ensureStyles() {
  if (document.getElementById('fatStyles')) return;
  const style = document.createElement('style');
  style.id = 'fatStyles';
  style.textContent = `
    .fat-shell{display:flex;flex-direction:column;gap:18px;color:#e2e8f0}
    .fat-sync-badge{display:inline-flex;margin-left:8px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(0,200,122,.12);border:1px solid rgba(52,211,153,.3);color:#86efac;white-space:nowrap}
    .fat-modal-overlay{position:fixed;inset:0;z-index:1200;background:rgba(2,6,23,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px}
    .fat-modal{width:min(680px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(52,211,153,.22);border-radius:22px;background:linear-gradient(180deg,#0f172a,#020617);box-shadow:0 30px 80px rgba(2,6,23,.6);color:#e2e8f0}
    .fat-modal-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid rgba(51,65,85,.5)}
    .fat-modal-head h3{margin:0;font-size:19px}
    .fat-modal-close{border:none;background:transparent;color:#94a3b8;font-size:26px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:10px}
    .fat-modal-close:hover{background:rgba(255,255,255,.06);color:#f8fafc}
    .fat-modal-body{padding:18px 20px}
    .fat-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .fat-field{display:flex;flex-direction:column;gap:6px;min-width:0}
    .fat-field>span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#94a3b8}
    .fat-col-2{grid-column:span 2}
    .fat-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
    @media (max-width:640px){.fat-form-grid{grid-template-columns:1fr}.fat-col-2{grid-column:span 1}}
    .fat-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap;padding:22px;border:1px solid rgba(45,212,160,.16);border-radius:26px;background:linear-gradient(135deg,rgba(2,6,23,.96),rgba(6,78,59,.26));box-shadow:0 18px 50px rgba(2,6,23,.28)}
    .fat-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:#34d399;font-weight:900;margin-bottom:8px}.fat-hero h2{margin:0;font-size:clamp(28px,4vw,42px);letter-spacing:-.05em}.fat-hero p{margin:8px 0 0;color:#94a3b8;max-width:820px;line-height:1.45}.fat-actions{display:flex;gap:10px;flex-wrap:wrap}.fat-btn,.fat-mini-btn{border:1px solid transparent;border-radius:14px;padding:11px 15px;font-weight:800;cursor:pointer;transition:.16s ease}.fat-btn:hover,.fat-mini-btn:hover{transform:translateY(-1px)}.fat-btn-primary{background:#00c87a;color:#03130b}.fat-btn-secondary,.fat-mini-btn{background:#0d0d18;border-color:rgba(255,255,255,.08);color:#e2e8f0}.fat-mini-btn{padding:8px 10px;border-radius:11px;font-size:12px}.fat-warning{border:1px solid rgba(251,191,36,.28);background:rgba(120,53,15,.18);border-radius:18px;padding:13px 15px;color:#fde68a;display:flex;gap:10px;flex-wrap:wrap}.fat-warning span{color:#fbbf24;opacity:.85}.fat-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.fat-kpi{border:1px solid rgba(51,65,85,.72);background:linear-gradient(180deg,rgba(15,23,42,.95),rgba(2,6,23,.88));border-radius:20px;padding:16px}.fat-kpi span{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:900}.fat-kpi strong{display:block;font-size:30px;margin:8px 0 4px;letter-spacing:-.05em}.fat-kpi small{color:#64748b}.fat-tabs{display:flex;gap:8px;overflow:auto;padding:4px}.fat-tab{border:1px solid rgba(51,65,85,.78);background:#0d0d18;color:#94a3b8;border-radius:999px;padding:10px 14px;font-weight:900;white-space:nowrap;cursor:pointer}.fat-tab.is-active{background:rgba(0,200,122,.14);border-color:rgba(52,211,153,.38);color:#bbf7d0}.fat-grid-main{display:grid;grid-template-columns:minmax(0,2fr) minmax(320px,.75fr);gap:16px;align-items:start}.fat-span-2{min-width:0}.fat-side{display:flex;flex-direction:column;gap:16px}.fat-panel{border:1px solid rgba(51,65,85,.72);background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.92));border-radius:24px;box-shadow:0 18px 34px rgba(2,6,23,.24);overflow:hidden}.fat-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:20px 20px 0;flex-wrap:wrap}.fat-panel-head.slim{padding-bottom:10px}.fat-panel-head h3{margin:0;font-size:20px}.fat-panel-head p{margin:5px 0 0;color:#64748b}.fat-distrib-toolbar,.fat-filters{display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(130px,1fr) minmax(130px,1fr) auto auto;gap:10px;padding:18px 20px}.fat-distrib-toolbar>select[style*="display: none"],.fat-distrib-toolbar>select[style*="display:none"]{display:none!important}.fat-filters{grid-template-columns:2fr 1fr 1fr 1fr}.fat-input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.09);background:#0d0d18;color:#e2e8f0;border-radius:13px;padding:10px 12px;outline:none}.fat-input:focus{border-color:rgba(52,211,153,.44);box-shadow:0 0 0 3px rgba(52,211,153,.10)}.fat-input-sm{min-width:160px;padding:8px 10px;font-size:12px}.fat-table-wrap{padding:0 20px 20px;overflow:auto}.fat-table{width:100%;border-collapse:collapse;min-width:980px}.fat-table th,.fat-table td{padding:13px 11px;border-bottom:1px solid rgba(51,65,85,.42);text-align:left;vertical-align:top}.fat-table th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;background:rgba(15,23,42,.86);position:sticky;top:0;z-index:1}.fat-table tbody tr:hover{background:rgba(15,23,42,.52)}.fat-strong{font-weight:900;color:#f8fafc}.fat-muted{display:block;color:#64748b;font-size:12px;margin-top:3px}.fat-note{margin-top:7px;color:#fecaca;font-size:12px;max-width:280px}.fat-late{display:inline-flex;margin-top:5px;color:#fecaca;font-size:11px;font-weight:900}.fat-chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid rgba(255,255,255,.08);background:#10101e;color:#cbd5e1;margin-top:5px}.fat-chip.is-green{background:rgba(22,101,52,.18);border-color:rgba(34,197,94,.28);color:#86efac}.fat-chip.is-amber{background:rgba(120,53,15,.22);border-color:rgba(251,191,36,.28);color:#fde68a}.fat-chip.is-red{background:rgba(127,29,29,.2);border-color:rgba(248,113,113,.3);color:#fecaca}.fat-chip.is-blue{background:rgba(30,64,175,.18);border-color:rgba(96,165,250,.28);color:#bfdbfe}.fat-chip.is-muted{background:rgba(51,65,85,.42);color:#94a3b8}.is-red{color:#fca5a5!important}.fat-row-actions{display:flex;gap:6px;flex-wrap:wrap;min-width:190px}.fat-mini-list,.fat-team-list,.fat-client-list{display:flex;flex-direction:column;gap:10px;padding:0 20px 20px}.fat-mini-item{width:100%;text-align:left;border:1px solid rgba(51,65,85,.7);background:#0d0d18;color:#e2e8f0;border-radius:16px;padding:12px;cursor:pointer}.fat-mini-item strong,.fat-mini-item span{display:block}.fat-mini-item span{color:#64748b;font-size:12px;margin-top:4px}.fat-team-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;border:1px solid rgba(51,65,85,.65);border-radius:15px;padding:12px;background:#0d0d18}.fat-team-row div{min-width:0}.fat-team-row strong,.fat-team-row span,.fat-team-row small{display:block}.fat-team-row span,.fat-team-row small{color:#64748b;font-size:12px}.fat-team-row b{font-size:22px;color:#f8fafc}.fat-team-row.is-warn{border-color:rgba(251,191,36,.26);background:rgba(120,53,15,.12)}.fat-empty{padding:18px;color:#64748b}.fat-agenda-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px}.fat-agenda-card{border:1px solid rgba(51,65,85,.65);border-radius:18px;background:#0d0d18;padding:16px}.fat-agenda-card h4{margin:0 0 12px}.fat-agenda-row{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid rgba(51,65,85,.45)}.fat-agenda-row strong,.fat-agenda-row span{display:block}.fat-agenda-row span{color:#64748b;font-size:12px}.fat-client-card{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid rgba(51,65,85,.65);border-radius:18px;background:#0d0d18;padding:14px}.fat-client-card h4{margin:0 0 5px}.fat-client-card p{margin:0;color:#94a3b8}.fat-client-card span{display:block;color:#64748b;font-size:12px;margin-top:4px}@media(max-width:1200px){.fat-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.fat-grid-main{grid-template-columns:1fr}.fat-distrib-toolbar,.fat-filters{grid-template-columns:1fr 1fr}}@media(max-width:720px){.fat-kpis,.fat-agenda-grid,.fat-distrib-toolbar,.fat-filters{grid-template-columns:1fr}.fat-hero{padding:18px}.fat-panel-head{padding:16px 16px 0}.fat-table-wrap{padding:0 12px 16px}.fat-client-card,.fat-agenda-row{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
}

export async function renderContent(content, userContext) {
  state.userContext = userContext;
  ensureStyles();
  content.innerHTML = '<section class="fat-panel"><div class="fat-empty">Carregando módulo de faturamento...</div></section>';
  await loadData();
  renderShell(content);
}

initProtectedPage('Faturamento', renderContent);
