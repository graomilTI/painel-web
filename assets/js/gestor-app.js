import { supabase } from './supabaseClient.js';
import { getCurrentUser, getSession, getUserContext, signOut } from './auth.js';
import { toPanelUrl } from './paths.js';
import { sincronizarProducaoSnapshotDoAgente } from './producaoSnapshotAgentSync.js';
import { anexarLaudoComGeolocalizacao } from './laudoUpload.js';
import { mensagemFalhaSalvar } from './rls-sessao-expirada.js';

const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const CACHE_KEY      = 'grao1000:gestor-app:v1';
const CACHE_TTL      = 1000 * 60 * 7;
const DASH_CACHE_KEY = 'grao1000:gestor-dash:v4-segmentado';
// Os agentes de produção/patrimônio resincronizam a cada ~20min; 1h evita que os
// KPIs (meta mensal, patrimônios) fiquem presos em cache por dias.
const DASH_CACHE_TTL = 1000 * 60 * 60;
const OS_PREFETCH_INTERVAL = 1000 * 60;
const LIMITE_MULTIPLOS = 500000;
const LIMITE_OS_POR_COLABORADOR = 2;
const STATUS = ['PENDENTE', 'AGUARDAR', 'ATENDER', 'FINALIZAR'];
const ICO_AGUARDAR  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="pointer-events:none"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>`;
const ICO_ATENDER   = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICO_FINALIZAR = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
const ICO_SOMAR_KG  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
const ICO_SALDO_PLUS = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="pointer-events:none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const ICO_CONFERIR  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`;

const app = document.getElementById('app');

const state = {
  user: null,
  context: null,
  appUser: null,
  isMaster: false,
  allowedSupervisoes: [],
  currentTab: 'dashboard',
  loading: false,
  os: [],
  colaboradores: [],
  pontos: [],
  atribuicoes: [],
  filters: { supervisao: '', status: '', busca: '' },
  patrimonioSubview: null,
  selections: new Map(),
  extras: new Map(),
  allowMulti: new Set(),
  suggested: new Map(),
  atribuicoesByOsId: new Map(),
  bigOsIndex: new Map(),
  osCountByColaborador: new Map(),
  busy: new Set(),
  tomorrow: new Set(),
  installPrompt: null,
  dashboard: null,
  osPrefetchTimer: null,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function compactKey(value) {
  return normalize(value).replace(/\s+/g, '');
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.flatMap(parseList))];
  if (typeof value === 'object') return parseList(value.supervisao || value.supervisoes || value.nome || value.name);
  const text = String(value).trim();
  if (!text) return [];
  try {
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) return parseList(JSON.parse(text));
  } catch {}
  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value) { return BR.format(num(value)); }

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value);
}

function toIsoDate(value) {
  return String(value || '').slice(0, 10);
}

function first(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function colabKey(c) {
  return String(c?.colaborador_id || c?.cpf || c?.id || c?.nome || '')
    .replace(/\D/g, '') || String(c?.id || c?.nome || '').trim();
}

function osId(row) { return String(row?.id || row?.numero_os || ''); }

function isActiveColab(c) {
  if (!c || c.ativo === false) return false;
  const sit = normalize(c.situacao);
  return !['NAO ATIVO', 'INATIVO', 'DESLIGADO', 'DEMITIDO'].some((s) => sit.includes(s));
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function saveCache(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload })); } catch {}
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.payload || null;
  } catch { return null; }
}

function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

function showToast(message, type = 'ok') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function panelHref(path) { return toPanelUrl(path); }

async function boot() {
  injectGacStyles();
  const session = await getSession().catch(() => null);
  if (!session?.user) {
    window.location.replace(panelHref('login'));
    return;
  }

  state.user = await getCurrentUser();
  state.context = await getUserContext(state.user?.id).catch(() => null);
  const { data: appUser } = await supabase
    .from('app_usuarios')
    .select('id,nome,email,setor,supervisao,coordenacao,empresa,status')
    .eq('auth_user_id', state.user?.id)
    .maybeSingle();
  state.appUser = appUser || null;

  const role = state.context?.user?.role || state.context?.perfil_codigo || state.context?.perfil_nome || state.context?.role || '';
  const setor = appUser?.setor || state.context?.setor || state.context?.department?.name || '';
  state.isMaster = Boolean(state.context?.user?.is_master || state.context?.is_master || normalize(role) === 'MASTER');
  const isGestor = normalize(role) === 'GESTOR' || normalize(setor) === 'GESTOR' || normalize(state.context?.department?.code) === 'GESTOR';
  state.allowedSupervisoes = [
    ...parseList(appUser?.supervisao),
    ...parseList(state.context?.user?.supervisao),
    ...parseList(state.context?.user?.supervisoes),
    ...parseList(state.context?.supervisao),
    ...parseList(state.context?.supervisoes),
  ];

  if (!state.isMaster && !isGestor) {
    renderShell();
    document.getElementById('appMain').innerHTML = `<section class="section-card"><h2>Acesso restrito</h2><p class="help">Este app é exclusivo para usuários do módulo Gestor.</p></section>`;
    return;
  }

  renderShell();
  setupPwaInstall();
  await Promise.all([loadData({ useCache: true }), loadDashboard()]);
  renderCurrentTab();
  startOsPrefetch();
}

async function fetchFreshOs() {
  let query = supabase.from('operacional_os').select('*').limit(1000);
  if (!state.isMaster && state.allowedSupervisoes.length) query = query.in('supervisao', state.allowedSupervisoes);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function persistCurrentData() {
  saveCache({ os: state.os, atribuicoes: state.atribuicoes, colaboradores: state.colaboradores, pontos: state.pontos });
}

async function refreshOsSilently({ rehydrate = false } = {}) {
  const freshOs = await fetchFreshOs();
  state.os = freshOs;
  persistCurrentData();
  if (rehydrate) {
    hydrateSelections();
    refreshSuggestions();
  }
  return freshOs;
}

function startOsPrefetch() {
  if (state.osPrefetchTimer) clearInterval(state.osPrefetchTimer);
  state.osPrefetchTimer = setInterval(() => {
    // Atualiza apenas o estado/cache. A tela não é redesenhada aqui: isso evita
    // piscar, perder foco de campos ou alterar a posição de rolagem do gestor.
    refreshOsSilently().catch((error) => console.warn('[gestor-app] pré-carga silenciosa de O.S.:', error?.message || error));
  }, OS_PREFETCH_INTERVAL);
}

function renderShell() {
  const name = state.appUser?.nome || state.context?.user?.name || state.user?.email || 'Gestor';
  app.className = 'gestor-app';
  app.innerHTML = `
    <header class="app-topbar">
      <div class="brand">
        <img src="./logo-grao1000.svg" alt="Grão 1000" />
        <div>
          <strong>App Gestor</strong>
          <small>Olá, ${escapeHtml(name)}</small>
        </div>
      </div>
      <div class="top-actions">
        <span class="pill">${state.isMaster ? 'MASTER' : 'GESTOR'}</span>
        <button class="icon-btn" id="refreshBtn" type="button" title="Atualizar">↻</button>
        <button class="icon-btn" id="logoutBtn" type="button" title="Sair">⎋</button>
      </div>
    </header>
    <main class="app-main" id="appMain"></main>
    <nav class="bottom-nav" id="bottomNav">
      <button class="nav-btn is-active" data-tab="dashboard" type="button">Dashboard</button>
      <button class="nav-btn" data-tab="programacao" type="button">Programação</button>
      <button class="nav-btn" data-tab="patrimonio" type="button">Patrimônio</button>
      <button class="nav-btn" data-tab="mais" type="button">Mais</button>
    </nav>
  `;

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut().catch(() => null);
    window.location.replace(panelHref('login'));
  });
  document.getElementById('refreshBtn')?.addEventListener('click', async () => {
    clearCache();
    await Promise.all([loadData({ useCache: false }), loadDashboard({ force: true })]);
    renderCurrentTab();
    showToast('Dados atualizados.');
  });
  document.getElementById('bottomNav')?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-tab]');
    if (!btn) return;
    const nextTab = btn.dataset.tab;
    // A troca de aba já exige um render. Aproveitamos esse momento natural para
    // buscar O.S. novas antes do desenho, sem provocar um segundo render.
    if (nextTab === 'programacao' || nextTab === 'os') {
      await refreshOsSilently({ rehydrate: true }).catch((error) => console.warn('[gestor-app] atualização de O.S. ao abrir programação:', error?.message || error));
    }
    state.currentTab = nextTab;
    if (btn.dataset.tab !== 'patrimonio') state.patrimonioSubview = null;
    document.querySelectorAll('.nav-btn').forEach((item) => item.classList.toggle('is-active', item === btn));
    renderCurrentTab();
  });
}

function setupPwaInstall() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => null);
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    renderCurrentTab();
  });
}

async function loadData({ useCache = true } = {}) {
  if (state.loading) return;
  state.loading = true;
  const cached = useCache ? readCache() : null;
  if (cached) {
    Object.assign(state, {
      os: cached.os || [],
      colaboradores: cached.colaboradores || [],
      pontos: cached.pontos || [],
      atribuicoes: cached.atribuicoes || [],
    });
    // Colaboradores, pontos e vínculos podem aproveitar o cache, mas a lista de
    // O.S. precisa estar atual antes do primeiro render. A consulta acontece
    // enquanto o loader já está visível e não causa re-render/flicker depois.
    try {
      state.os = await fetchFreshOs();
      persistCurrentData();
    } catch (error) {
      console.warn('[gestor-app] usando O.S. em cache após falha na atualização:', error?.message || error);
    }
    hydrateSelections();
    state.loading = false;
    refreshSuggestions();
    return;
  }

  try {
    const [osRes, atrRes, colabRes, pontosRes] = await Promise.all([
      fetchFreshOs().then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })),
      supabase.from('operacional_os_colaboradores').select('*').limit(5000),
      supabase.from('operacional_colaborador_base').select('id,nome,cpf,tipo_mao_obra,empresa,coordenacao,supervisao,cidade_base,uf_base,latitude,longitude,ativo,nome_chave,telefone').eq('ativo', true).limit(5000),
      supabase.from('operacional_pontos_embarque').select('id,tipo_local,nome_local,uf,cidade,latitude,longitude,supervisao,coordenacao,ativo').eq('ativo', true).limit(8000),
    ]);

    if (osRes.error) throw osRes.error;
    state.os = Array.isArray(osRes.data) ? osRes.data : [];
    state.atribuicoes = Array.isArray(atrRes.data) ? atrRes.data : [];
    state.colaboradores = Array.isArray(colabRes.data) ? colabRes.data.filter(isActiveColab) : [];
    state.pontos = Array.isArray(pontosRes.data) ? pontosRes.data : [];
    persistCurrentData();
    hydrateSelections();
    refreshSuggestions();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Falha ao carregar dados do app.', 'error');
  } finally {
    state.loading = false;
  }
}


function appDashPeriodKey(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function appDashCacheReference({ isMaster, coordenacao, ano, mes }) {
  const period = appDashPeriodKey(ano, mes);
  if (isMaster) return `master:${period}`;
  return `regional:${normalize(coordenacao) || 'sem_regional'}:${period}`;
}

function appDashLocalCacheKey(ref) {
  return `${DASH_CACHE_KEY}:${ref}`;
}

async function readAppDashboardCacheSegment(ref) {
  try {
    const { data, error } = await supabase
      .from('dashboard_cache')
      .select('dados_json,atualizado_em')
      .eq('modulo', 'dashboard')
      .eq('referencia', ref)
      .maybeSingle();
    if (error) throw error;
    if (!data?.dados_json) return null;
    const idadeMs = data.atualizado_em ? Date.now() - new Date(data.atualizado_em).getTime() : Infinity;
    if (idadeMs > DASH_CACHE_TTL) return null;
    return {
      ...data.dados_json,
      cache_atualizado_em: data.atualizado_em,
      cache_ref: ref,
      cache_source: 'supabase',
    };
  } catch (error) {
    console.warn('[gestor-app] cache remoto indisponível:', error?.message || error);
    return null;
  }
}

async function saveAppDashboardCacheSegment(ref, payload, { isMaster, ano, mes } = {}) {
  try {
    await supabase.from('dashboard_cache').upsert({
      modulo: 'dashboard',
      referencia: ref,
      escopo: isMaster ? 'master' : 'regional',
      ano,
      mes,
      dados_json: payload,
      origem_importacao: 'gestor_app_auto',
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'modulo,referencia' });
  } catch (error) {
    console.warn('[gestor-app] não foi possível salvar cache remoto:', error?.message || error);
  }
}

async function fetchDashData({ force = false } = {}) {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const coordenacao = state.appUser?.coordenacao || '';
  const ref = appDashCacheReference({ isMaster: state.isMaster, coordenacao, ano, mes });

  if (!force) {
    const cached = await readAppDashboardCacheSegment(ref);
    if (cached) return cached;
  }

  const fresh = await fetchDashDataLive();
  const payload = { ...fresh, cache_ref: ref, cache_source: 'live', cache_atualizado_em: new Date().toISOString() };
  saveAppDashboardCacheSegment(ref, payload, { isMaster: state.isMaster, ano, mes });
  return payload;
}

async function fetchDashDataLive() {
  // producao_snapshot é a base da meta mensal aqui. A sincronização faz delete+insert
  // do mês inteiro; se disparada sem esperar, a leitura abaixo pode acontecer no meio
  // do delete e contar um total muito menor que o real (bug 23/07 — cache gravou
  // 169k t em vez de 1,33M t). Por isso esperamos ela terminar antes de somar.
  // (patrimonios_snapshot ficou de fora: a sincronização limpa+reinsere a tabela e
  // exige privilégio que o app da Supervisão não tem — feita só em patrimonioRelatorios.js.)
  await sincronizarProducaoSnapshotDoAgente().catch((error) => console.warn('[gestor-app] falha ao sincronizar producao_snapshot:', error?.message || error));

  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const diaAtual = now.getDate();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const coordenacao = state.appUser?.coordenacao || '';
  const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const dataFim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  const d7 = new Date(now); d7.setDate(d7.getDate() - 6);
  const dataD7   = `${d7.getFullYear()}-${String(d7.getMonth()+1).padStart(2,'0')}-${String(d7.getDate()).padStart(2,'0')}`;
  const dataHoje = `${ano}-${String(mes).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const makeProdQuery = () => {
    let q = supabase
      .from('producao_snapshot')
      .select('data,coordenacao,tons')
      .gte('data', dataIni)
      .lt('data', dataFim)
      .order('data', { ascending: true });
    if (!state.isMaster && coordenacao) q = q.eq('coordenacao', coordenacao);
    return q;
  };

  let patriBase     = supabase.from('patrimonios_snapshot').select('*', { count: 'exact', head: true }).eq('situacao', 'Ativo');
  let patriLateBase = supabase.from('patrimonios_snapshot').select('*', { count: 'exact', head: true }).eq('situacao', 'Ativo').gt('dias_sem_leitura', 7);

  if (!state.isMaster && coordenacao) {
    patriBase     = patriBase.eq('coordenacao', coordenacao);
    patriLateBase = patriLateBase.eq('coordenacao', coordenacao);
  }

  const [metaRes, prodRows, patriTotalRes, patriLateRes] = await Promise.all([
    supabase.from('metas_producao').select('meta_tons,regional').eq('ano', ano).eq('mes', mes).eq('ativo', true),
    appFetchAllRows(makeProdQuery),
    patriBase,
    patriLateBase,
  ]);

  const produzido = prodRows.reduce((s, r) => s + Number(r.tons || 0), 0);

  const d7map = {};
  for (const r of prodRows) {
    const k = String(r.data || '').slice(0, 10);
    if (k >= dataD7 && k <= dataHoje) d7map[k] = (d7map[k] || 0) + Number(r.tons || 0);
  }
  const daily7 = Array.from({length: 7}, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i));
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { date: k, tons: d7map[k] || 0 };
  });

  let meta = null;
  if (metaRes.data?.length) {
    if (state.isMaster) {
      meta = metaRes.data.reduce((s, r) => s + Number(r.meta_tons || 0), 0);
    } else {
      const hit = metaRes.data.find((r) =>
        normalize(r.regional) === normalize(coordenacao) ||
        normalize(coordenacao).startsWith(normalize(r.regional)) ||
        normalize(r.regional).startsWith(normalize(coordenacao))
      );
      meta = hit ? Number(hit.meta_tons) : null;
    }
  }

  const mapaEstados = state.isMaster
    ? buildStatePerfMapApp(metaRes.data || [], prodRows, diaAtual, diasNoMes)
    : {};

  return {
    loading: false, coordenacao, ano, mes, meta, produzido, daily7, mapaEstados,
    patrimonios: { total: patriTotalRes.count ?? 0, atrasados: patriLateRes.count ?? 0 },
  };
}

async function loadDashboard({ force = false } = {}) {
  const coordenacao = state.appUser?.coordenacao || '';
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const empty = { loading: false, coordenacao, ano, mes, meta: null, produzido: 0, daily7: [], patrimonios: { total: 0, atrasados: 0 } };

  const ref = appDashCacheReference({ isMaster: state.isMaster, coordenacao, ano, mes });
  const localKey = appDashLocalCacheKey(ref);

  if (!force) {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < DASH_CACHE_TTL && data) {
          state.dashboard = data;
          return;
        }
      }
    } catch {}
  }

  try {
    const data = await fetchDashData({ force });
    try { localStorage.setItem(localKey, JSON.stringify({ ts: Date.now(), data })); } catch {}
    state.dashboard = data;
  } catch (e) {
    console.warn('loadDashboard:', e);
    state.dashboard = empty;
  }
}

function hydrateSelections() {
  state.selections.clear();
  state.extras.clear();
  state.allowMulti.clear();
  state.suggested.clear();
  state.atribuicoesByOsId.clear();
  state.osCountByColaborador.clear();
  for (const os of state.os) if (os.permitir_mais_classificadores) state.allowMulti.add(osId(os));
  for (const item of state.atribuicoes) {
    const key = String(item.os_id || '');
    if (!key) continue;
    const current = state.selections.get(key);
    if (!current) state.selections.set(key, item.colaborador_key || item.colaborador_cpf || item.colaborador_nome || '');
    else {
      const list = state.extras.get(key) || [];
      list.push(item.colaborador_key || item.colaborador_cpf || item.colaborador_nome || '');
      state.extras.set(key, list);
      state.allowMulti.add(key);
    }

    const list = state.atribuicoesByOsId.get(key) || [];
    list.push(item);
    state.atribuicoesByOsId.set(key, list);

    const colabKeyValue = String(item.colaborador_key || '').trim();
    if (colabKeyValue) {
      const osSet = state.osCountByColaborador.get(colabKeyValue) || new Set();
      osSet.add(key);
      state.osCountByColaborador.set(colabKeyValue, osSet);
    }
  }

  state.bigOsIndex.clear();
  for (const os of state.os) {
    if (toIsoDate(os.data_os) === '') continue;
    if (String(os.status_gestor || '').toUpperCase() !== 'ATENDER') continue;
    if (num(os.remanescente) < LIMITE_MULTIPLOS) continue;
    const id = osId(os);
    const keys = (state.atribuicoesByOsId.get(id) || []).map((a) => a.colaborador_key).filter(Boolean);
    if (keys.length) state.bigOsIndex.set(id, keys);
  }
}

function findPoint(os) {
  if (Number.isFinite(Number(os.ponto1_latitude)) && Number.isFinite(Number(os.ponto1_longitude))) {
    return { latitude: Number(os.ponto1_latitude), longitude: Number(os.ponto1_longitude), origem: 'O.S.' };
  }

  const emb = String(os.embarque || '').trim();
  const ufMatch = emb.match(/^\s*([A-Z]{2})\s*[-–]\s*([^()]+?)(?:\(([^)]+)\))?\s*$/i);
  const uf = normalize(ufMatch?.[1] || '');
  const cidade = normalize(ufMatch?.[2] || '');
  const local = normalize(ufMatch?.[3] || emb);

  const candidates = state.pontos.filter((p) => {
    if (uf && normalize(p.uf) !== uf) return false;
    const pCidade = normalize(p.cidade);
    const pLocal = normalize(p.nome_local);
    if (cidade && pCidade && cidade !== pCidade) return false;
    if (!local) return true;
    return pLocal.includes(local) || local.includes(pLocal) || compactKey(pLocal).includes(compactKey(local)) || compactKey(local).includes(compactKey(pLocal));
  }).filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));

  return candidates[0] ? { ...candidates[0], origem: 'Mapa Operacional' } : null;
}

function assignedBigSet(exceptOsId = '') {
  const set = new Set();
  for (const [id, keys] of state.bigOsIndex) {
    if (id === exceptOsId) continue;
    for (const key of keys) set.add(String(key));
  }
  return set;
}

function colaboradorAtingiuLimiteOs(colaboradorKey, exceptOsId = '') {
  const key = String(colaboradorKey || '').trim();
  if (!key) return false;
  const osIds = state.osCountByColaborador.get(key);
  if (!osIds) return false;
  const count = exceptOsId && osIds.has(String(exceptOsId)) ? osIds.size - 1 : osIds.size;
  return count >= LIMITE_OS_POR_COLABORADOR;
}

function suggestionsForOs(os) {
  const point = findPoint(os);
  if (!point) return { point: null, items: [], aviso: 'Ponto de embarque sem latitude/longitude no mapa operacional.' };
  const blocked = num(os.remanescente) >= LIMITE_MULTIPLOS ? assignedBigSet(osId(os)) : new Set();
  const items = state.colaboradores
    .map((c) => {
      const distancia = haversineKm(c.latitude, c.longitude, point.latitude, point.longitude);
      return { c, distancia };
    })
    .filter((row) => Number.isFinite(row.distancia))
    .filter((row) => !blocked.has(colabKey(row.c)))
    .filter((row) => !colaboradorAtingiuLimiteOs(colabKey(row.c), osId(os)))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, 30);
  return { point, items, aviso: items.length ? '' : 'Nenhum colaborador com coordenada disponível para este ponto.' };
}

// Sugestões são pesadas (distância contra todos os colaboradores) — calculadas
// só quando a O.S. é de fato exibida, e cacheadas em state.suggested até a
// próxima carga de dados (hydrateSelections limpa o cache).
function refreshSuggestions() {
  state.suggested.clear();
}

function getSuggestionsForOs(id) {
  if (state.suggested.has(id)) return state.suggested.get(id);
  const os = state.os.find((row) => osId(row) === id);
  const result = os ? suggestionsForOs(os) : { point: null, items: [], aviso: '' };
  state.suggested.set(id, result);
  if (!state.selections.get(id) && result.items[0]) state.selections.set(id, colabKey(result.items[0].c));
  return result;
}

function filteredOs() {
  const term = normalize(state.filters.busca);
  const sup = state.filters.supervisao;
  const status = state.filters.status;
  return [...state.os]
    .filter((row) => !sup || row.supervisao === sup)
    .filter((row) => {
      if (!status) return true;
      const st = (row.status_gestor || 'AGUARDAR').toUpperCase();
      const isCinza = st === 'AGUARDAR' && !row.configurada_em;
      if (status === 'PENDENTE') return isCinza;
      if (status === 'AGUARDAR') return st === 'AGUARDAR' && !isCinza;
      return st === status;
    })
    .filter((row) => !term || normalize(`${row.numero_os} ${row.cliente} ${row.embarque} ${row.destino} ${row.supervisao}`).includes(term))
    .sort((a, b) => num(b.remanescente) - num(a.remanescente) || String(b.numero_os).localeCompare(String(a.numero_os)));
}

function triggerStateFillAnim(container) {
  requestAnimationFrame(() => {
    const fillRect = container.querySelector('.db-state-fill-rect');
    if (fillRect) requestAnimationFrame(() => { fillRect.style.transform = 'scaleY(1)'; });
  });
}

function renderCurrentTab() {
  const main = document.getElementById('appMain');
  if (!main) return;
  if (state.currentTab === 'dashboard') { renderInicio(main); triggerStateFillAnim(main); return; }
  if (state.currentTab === 'programacao' || state.currentTab === 'os') return renderProgramacao(main);
  if (state.currentTab === 'patrimonio') return renderPatrimonio(main);
  return renderMais(main);
}

/* Brazil state SVG paths — viewBox 0 0 800 796 */
const BR_STATES = [
  {uf:'AC',d:'M23.34,259.60L90.84,279.56L159.17,312.07L163.20,313.66L125.50,337.17L85.14,335.06L85.44,305.72L73.05,316.00L55.50,315.17L51.39,304.44L35.13,303.98L41.05,297.40L29.27,282.74L24.71,274.57L24.64,272.08L20.08,268.67L20.00,263.83L23.72,263.83Z'},
  {uf:'AL',d:'M774.15,293.93L769.66,301.03L762.06,309.50L756.06,317.29L751.27,321.45L751.35,322.35L749.37,325.23L748.30,323.41L746.10,323.64L746.02,321.90L744.66,320.54L743.52,321.14L738.65,317.44L738.50,315.78L718.36,305.95L713.87,302.47L722.31,293.40L738.65,303.76L739.72,301.56L743.67,301.64L745.11,303.07L757.81,293.32L762.75,294.61L766.24,292.72Z'},
  {uf:'AM',d:'M225.45,79.13L238.22,86.01L247.34,128.12L242.70,136.74L262.46,152.16L260.41,137.72L268.62,130.99L277.89,138.86L285.57,134.92L283.37,131.52L290.21,117.00L312.55,116.48L313.09,129.63L323.80,143.92L361.96,165.39L322.13,253.63L326.84,263.61L322.05,292.04L261.32,292.49L249.62,291.88L235.94,276.54L222.03,276.61L208.27,294.68L196.11,294.91L196.26,304.81L168.90,304.44L159.17,312.07L90.84,279.56L23.34,259.60L25.40,252.27L36.11,247.20L33.61,238.88L42.57,220.81L68.42,207.28L97.91,205.16L108.55,141.27L96.62,125.25L96.31,110.43L113.64,110.05L113.57,101.35L100.26,101.50L100.26,88.42L131.88,88.20L146.40,79.73L153.32,86.38L153.70,99.16L183.72,109.22Z'},
  {uf:'AP',d:'M482.66,109.14L452.03,135.91L453.02,143.54L439.87,144.53L415.24,97.50L400.95,88.05L392.97,88.05L390.39,73.91L394.64,73.68L398.90,79.28L406.57,79.73L411.14,76.10L420.56,76.33L422.54,79.35L429.53,79.35L458.64,35.35L469.81,76.93L488.13,90.39L487.67,102.03Z'},
  {uf:'BA',d:'M713.87,302.47L718.36,305.95L718.66,314.87L721.78,315.40L723.53,322.13L721.47,323.04L721.47,329.31L717.98,330.37L717.37,329.23L714.41,329.39L713.11,331.50L718.13,341.79L728.62,347.00L711.06,374.22L707.26,371.73L700.04,378.46L697.76,407.87L701.64,429.26L693.05,456.48L696.16,464.35L693.58,468.28L688.94,470.32L685.90,477.20L674.05,469.49L675.57,465.63L667.36,458.52L669.79,449.30L674.27,448.62L680.20,431.91L597.66,397.74L562.24,416.86L562.47,409.76L558.13,372.94L551.98,341.18L566.57,320.54L577.59,331.58L599.18,327.95L608.22,316.31L604.65,306.93L611.80,301.41L625.78,308.22L635.97,301.18L642.96,301.18L655.04,289.54L665.15,299.07L665.00,304.36L671.77,304.51L690.84,286.97L705.28,295.89L708.02,293.32L712.51,296.95L711.21,299.22Z'},
  {uf:'CE',d:'M731.81,215.14L725.35,217.71L707.18,245.01L703.38,256.50L707.79,263.08L704.45,272.00L696.32,272.00L685.52,263.91L668.80,265.12L671.84,253.02L665.91,250.60L659.22,216.81L653.75,178.25L644.02,174.47L653.75,178.25L679.06,176.81L709.08,193.44L720.26,205.77L731.74,212.12Z'},
  {uf:'DF',d:'M537.54,432.89L518.76,432.89L518.69,422.38L537.54,422.46Z'},
  {uf:'ES',d:'M661.43,534.89L646.07,531.26L646.15,525.66L642.81,524.76L644.71,513.49L652.46,513.19L661.96,495.27L658.84,491.19L661.20,485.67L656.11,477.58L660.59,473.57L664.47,473.72L667.51,469.56L674.05,469.49L685.90,477.20L683.24,485.82L685.37,496.55L683.24,502.38L677.92,506.08L675.03,514.62L668.50,525.89L664.32,526.12Z'},
  {uf:'GO',d:'M474.07,369.84L498.32,377.17L558.13,372.94L562.47,409.76L546.66,412.25L547.26,429.49L537.54,432.89L537.54,422.46L518.69,422.38L518.76,432.89L537.54,432.89L538.07,471.83L526.74,480.98L519.14,477.35L504.40,477.50L496.95,483.85L479.31,484.31L467.08,499.28L430.29,482.87L425.50,470.62L422.31,463.67L426.94,448.17L441.31,429.79L449.75,428.43L454.00,413.92L464.04,412.25Z'},
  {uf:'MA',d:'M513.59,221.87L532.90,209.93L545.82,190.95L561.55,141.88L586.86,151.33L593.55,167.81L601.69,170.53L610.58,164.86L630.80,174.77L644.10,174.62L621.45,203.88L622.74,251.06L611.95,255.37L609.06,250.60L600.09,253.85L590.67,263.76L573.56,270.49L563.76,293.47L566.57,320.54L555.32,317.82L551.67,309.88L542.70,296.35L547.42,283.95L553.65,282.96L552.59,274.42L542.70,276.69L530.47,262.02L536.40,243.12L533.81,228.00Z'},
  {uf:'MG',d:'M680.20,431.91L674.27,448.62L669.79,449.30L667.36,458.52L675.57,465.63L674.05,469.49L667.51,469.56L664.47,473.72L660.59,473.57L656.11,477.58L661.20,485.67L658.84,491.19L661.96,495.27L652.46,513.19L644.71,513.49L642.81,524.76L641.36,528.16L638.78,528.08L633.61,541.09L634.67,542.83L619.55,550.01L614.46,547.82L587.24,556.13L556.31,565.81L534.80,509.26L466.54,507.97L467.08,499.28L479.31,484.31L496.95,483.85L504.40,477.50L519.14,477.35L526.74,480.98L538.07,471.83L537.54,432.89L547.26,429.49L546.66,412.25L562.47,409.76L562.24,416.86L597.73,397.96Z'},
  {uf:'MS',d:'M425.50,470.62L430.29,482.87L467.08,499.28L466.54,507.97L437.66,551.67L425.27,559.61L415.70,566.34L408.63,576.09L402.93,587.74L394.34,585.09L381.57,586.98L372.14,553.49L331.02,552.28L331.56,528.23L325.25,508.65L340.37,469.26L355.50,457.77L369.63,454.44L386.28,463.89L405.66,463.44L413.80,454.97L413.72,463.82L406.42,470.70Z'},
  {uf:'MT',d:'M278.20,387.30L294.39,360.23L294.54,335.13L261.17,334.75L261.32,292.49L322.05,292.04L326.84,263.61L354.21,304.06L480.99,312.53L471.03,343.45L474.07,369.84L464.04,412.25L454.00,413.92L449.75,428.43L441.31,429.79L426.94,448.17L422.31,463.67L425.50,470.62L406.42,470.70L413.72,463.82L413.80,454.97L405.66,463.44L386.28,463.89L369.63,454.44L355.50,457.77L340.37,469.26L323.88,456.48L323.88,437.05L287.93,437.13L287.70,422.31L280.10,413.84L286.48,414.14L286.10,404.77L283.59,393.50Z'},
  {uf:'PA',d:'M561.55,141.88L545.82,190.95L532.90,209.93L513.59,221.87L509.56,225.50L520.43,229.96L509.87,252.12L504.09,253.63L497.33,268.90L501.58,273.36L480.99,312.53L354.21,304.06L326.84,263.61L322.13,253.63L361.96,165.39L323.80,143.92L313.09,129.63L312.55,116.48L313.01,96.89L346.76,84.64L368.57,83.89L367.73,73.76L390.39,73.91L392.97,88.05L400.95,88.05L415.24,97.50L439.87,144.53L453.02,143.54L452.03,135.91L482.66,109.14L485.70,115.49L493.00,114.89L515.65,126.76L516.03,131.52L525.15,134.70L531.00,130.16Z'},
  {uf:'PB',d:'M777.04,247.50L780.00,268.07L775.21,265.12L767.23,266.41L766.09,270.11L757.05,273.51L752.33,272.76L745.72,275.40L745.19,279.56L737.82,282.89L731.43,275.55L738.42,266.33L732.34,262.62L718.89,271.55L704.45,272.00L707.79,263.08L703.38,256.50L707.18,245.01L716.15,247.58L732.57,237.83L734.40,240.77L728.39,251.21L743.44,257.11L749.75,247.20Z'},
  {uf:'PE',d:'M780.00,268.07L774.15,293.93L766.24,292.72L762.75,294.61L757.81,293.32L745.11,303.07L743.67,301.64L739.72,301.56L738.65,303.76L722.31,293.40L713.87,302.47L711.21,299.22L712.51,296.95L708.02,293.32L705.28,295.89L690.84,286.97L671.77,304.51L665.00,304.36L665.15,299.07L655.04,289.54L668.80,278.05L668.72,273.36L665.46,272.15L665.53,266.48L668.80,265.12L685.52,263.91L696.32,272.00L704.45,272.00L718.89,271.55L732.34,262.62L738.42,266.33L731.43,275.55L737.82,282.89L745.19,279.56L745.72,275.40L752.33,272.76L757.05,273.51L766.09,270.11L767.23,266.41L775.21,265.12Z'},
  {uf:'PI',d:'M644.10,174.62L653.75,178.25L659.22,216.81L665.91,250.60L671.84,253.02L668.80,265.12L665.53,266.48L665.46,272.15L668.72,273.36L668.80,278.05L655.04,289.54L642.96,301.18L635.97,301.18L625.78,308.22L611.80,301.41L604.65,306.93L608.22,316.31L599.18,327.95L577.59,331.58L566.57,320.54L563.76,293.47L573.56,270.49L590.67,263.76L600.09,253.85L609.06,250.60L611.95,255.37L622.74,251.06L621.45,203.88Z'},
  {uf:'PR',d:'M425.27,559.61L489.95,568.76L500.82,598.10L523.70,610.95L512.53,625.47L501.43,625.47L494.59,629.85L487.22,626.22L473.99,626.37L471.33,630.23L460.84,631.67L458.56,638.09L414.71,630.91L408.70,618.89L396.31,617.98L402.93,587.74L408.63,576.09L415.70,566.34Z'},
  {uf:'RJ',d:'M587.40,574.66L585.04,567.78L597.43,563.32L595.83,559.54L590.59,561.20L587.24,556.13L614.46,547.82L619.55,550.01L634.67,542.83L633.61,541.09L638.78,528.08L641.36,528.16L642.81,524.76L646.15,525.66L646.07,531.26L661.43,534.89L658.69,539.05L660.44,548.12L655.65,550.84L649.19,552.96L640.83,559.91L643.11,562.41L640.07,566.64L620.76,567.10L609.89,568.76L604.80,566.19L590.13,571.25L590.97,573.60Z'},
  {uf:'RN',d:'M731.81,215.14L744.05,220.28L757.88,219.60L769.43,222.93L777.04,247.50L749.75,247.20L743.44,257.11L728.39,251.21L734.40,240.77L732.57,237.83L716.15,247.58L707.18,245.01L725.35,217.71Z'},
  {uf:'RO',d:'M159.17,312.07L168.90,304.44L196.26,304.81L196.11,294.91L208.27,294.68L222.03,276.61L235.94,276.54L249.62,291.88L261.32,292.49L261.17,334.75L294.54,335.13L294.39,360.23L278.20,387.30L271.21,383.60L255.09,384.20L249.09,377.40L217.24,362.50L209.56,365.45L188.20,348.89L188.28,313.81L163.20,313.66Z'},
  {uf:'RR',d:'M313.01,96.89L312.55,116.48L290.21,117.00L283.37,131.52L285.57,134.92L277.89,138.86L268.62,130.99L260.41,137.72L262.46,152.16L242.70,136.74L247.34,128.12L238.22,86.01L225.45,79.13L225.14,74.97L213.82,75.04L209.49,52.51L197.10,39.88L198.85,38.45L202.57,41.70L211.46,42.23L213.97,46.01L229.48,45.33L233.35,51.76L238.60,50.24L236.39,44.80L246.05,40.87L251.60,42.30L277.29,29.07L277.06,20.30L290.97,20.00L291.42,33.99L298.49,36.71L298.80,48.05L291.96,63.63L292.34,75.95L296.21,77.31L296.29,85.48L306.09,95.31Z'},
  {uf:'RS',d:'M410.91,648.53L451.04,653.29L474.30,671.74L488.28,675.37L484.86,685.42L490.03,689.96L479.77,712.87L469.66,726.33L462.14,732.90L445.26,744.85L445.19,739.03L448.91,739.03L458.03,732.60L472.09,713.32L462.29,711.43L452.94,727.46L441.39,738.95L444.43,740.69L444.43,745.23L439.94,750.37L435.99,761.71L431.73,766.93L419.80,776.00L416.76,773.43L419.04,766.62L426.79,757.32L430.97,759.82L435.00,751.50L431.58,749.31L423.30,754.53L378.15,720.88L369.48,724.74L341.89,704.32L375.94,667.20Z'},
  {uf:'SC',d:'M414.71,630.91L458.56,638.09L460.84,631.67L471.33,630.23L473.99,626.37L487.22,626.22L494.59,629.85L501.43,625.47L512.53,625.47L514.81,630.38L511.09,639.60L512.99,652.23L512.83,661.76L509.72,674.46L490.03,689.96L484.86,685.42L488.28,675.37L474.30,671.74L451.04,653.29L410.91,648.53Z'},
  {uf:'SE',d:'M718.36,305.95L738.50,315.78L738.65,317.44L743.52,321.14L744.66,320.54L746.02,321.90L746.10,323.64L748.30,323.41L749.37,325.23L748.84,326.06L746.71,326.06L739.41,331.05L728.62,347.00L718.13,341.79L713.11,331.50L714.41,329.39L717.37,329.23L717.98,330.37L721.47,329.31L721.47,323.04L723.53,322.13L721.78,315.40L718.66,314.87Z'},
  {uf:'SP',d:'M587.40,574.66L574.10,580.25L575.16,582.14L572.42,583.96L567.94,582.52L562.39,583.35L546.66,591.29L523.70,610.95L500.82,598.10L489.95,568.76L425.27,559.61L437.66,551.67L466.54,507.97L534.80,509.26L556.31,565.81L587.24,556.13L590.59,561.20L595.83,559.54L597.43,563.32L585.04,567.78Z'},
  {uf:'TO',d:'M566.57,320.54L551.98,341.18L558.13,372.94L498.32,377.17L474.07,369.84L471.03,343.45L480.99,312.53L501.58,273.36L497.33,268.90L504.09,253.63L509.87,252.12L520.43,229.96L509.56,225.50L513.59,221.87L533.81,228.00L536.40,243.12L530.47,262.02L542.70,276.69L552.59,274.42L553.65,282.96L547.42,283.95L542.70,296.35L551.67,309.88L555.32,317.82Z'},
];

const BR_CENTROIDS_APP = {
  AC:{x:90,y:300},AL:{x:752,y:310},AM:{x:185,y:205},AP:{x:450,y:100},
  BA:{x:643,y:388},CE:{x:700,y:233},DF:{x:528,y:428},ES:{x:664,y:505},
  GO:{x:492,y:440},MA:{x:582,y:255},MG:{x:580,y:490},MS:{x:385,y:530},
  MT:{x:370,y:400},PA:{x:435,y:225},PB:{x:748,y:264},PE:{x:718,y:283},
  PI:{x:635,y:255},PR:{x:460,y:595},RJ:{x:628,y:557},RN:{x:744,y:234},
  RO:{x:215,y:340},RR:{x:270,y:85},RS:{x:438,y:710},SC:{x:462,y:658},
  SE:{x:733,y:330},SP:{x:510,y:578},TO:{x:520,y:340},
};

const BR_YBOUNDS_APP = {
  GO:{min:369,max:500},BA:{min:286,max:478},MA:{min:141,max:332},
  MG:{min:431,max:567},MS:{min:454,max:589},MT:{min:263,max:471},
  PA:{min:73,max:313},PR:{min:559,max:639},RS:{min:648,max:776},
  SP:{min:508,max:611},TO:{min:221,max:378},
};

const STATE_FROM_COORD_APP = {
  'GOIAS': 'GO', 'BAHIA': 'BA', 'MARANHAO': 'MA', 'MINAS GERAIS': 'MG',
  'MATO GROSSO DO SUL': 'MS',
  'MATO GROSSO MT1': 'MT', 'MATO GROSSO MT2': 'MT',
  'MATO GROSSO MT3 CONFRESA': 'MT', 'MATO GROSSO MT3 QUERENCIA': 'MT',
  'MATO GROSSO MT4': 'MT',
  'PARA': 'PA',
  'CASCAVEL': 'PR', 'LONDRINA': 'PR', 'MARINGA E TERMINAIS': 'PR', 'PONTA GROSSA': 'PR',
  'RIO GRANDE DO SUL': 'RS', 'SAO PAULO': 'SP', 'TOCANTINS': 'TO',
};

function resolveStateFromRegionalNameApp(value) {
  const norm = normalize(value);
  if (!norm) return null;
  if (STATE_FROM_COORD_APP[norm]) return STATE_FROM_COORD_APP[norm];
  const key = Object.keys(STATE_FROM_COORD_APP).find((k) => norm === k || norm.startsWith(k) || k.startsWith(norm));
  return key ? STATE_FROM_COORD_APP[key] : null;
}

function buildStatePerfMapApp(metaRows, prodRows, diaAtual, diasNoMes) {
  const map = {};
  const ensure = (uf) => {
    if (!uf) return null;
    if (!map[uf]) map[uf] = { meta: 0, produzido: 0, pct: 0, ritmo: 0, onTrack: false };
    return map[uf];
  };

  for (const row of (metaRows || [])) {
    const uf = resolveStateFromRegionalNameApp(row?.regional);
    const item = ensure(uf);
    if (item) item.meta += Number(row?.meta_tons || 0);
  }
  for (const row of (prodRows || [])) {
    const uf = resolveStateFromRegionalNameApp(row?.coordenacao);
    const item = ensure(uf);
    if (item) item.produzido += Number(row?.sum || row?.tons || 0);
  }

  Object.values(map).forEach((item) => {
    item.pct = item.meta > 0 ? Math.min(100, (item.produzido / item.meta) * 100) : 0;
    item.ritmo = item.meta > 0 ? (item.meta * diaAtual / diasNoMes) : 0;
    item.onTrack = item.produzido >= item.ritmo;
  });
  return map;
}

function getStatePaletteApp(pct, onTrack) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  if (p <= 0) return { fill: 'rgba(255,255,255,0.04)', stroke: 'rgba(255,255,255,0.10)', text: 'rgba(255,255,255,0.55)' };
  if (onTrack || p >= 100) {
    const alpha = (0.28 + (p / 100) * 0.52).toFixed(2);
    return { fill: `rgba(0,200,122,${alpha})`, stroke: 'rgba(45,212,160,.95)', text: 'rgba(230,255,244,.95)' };
  }
  const alpha = (0.26 + (p / 100) * 0.42).toFixed(2);
  return { fill: `rgba(253,230,138,${alpha})`, stroke: 'rgba(253,230,138,.85)', text: 'rgba(255,248,220,.95)' };
}

async function appFetchAllRows(makeQuery, pageSize = 1000, maxPages = 30) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

function appRenderStateFill({ pct, onTrack, estado, mapaEstados }) {
  const uf       = estado && estado !== 'BR' ? estado : null;
  const isBR     = !uf;
  const target   = uf ? BR_STATES.find(s => s.uf === uf) : null;
  const centroid = (uf && BR_CENTROIDS_APP[uf]) || {x:400, y:398};
  const bounds   = (uf && BR_YBOUNDS_APP[uf]) || {min:20, max:776};

  if (isBR) {
    const groups = BR_STATES.map((stateItem) => {
      const info = mapaEstados?.[stateItem.uf] || null;
      const palette = getStatePaletteApp(info?.pct || 0, info?.onTrack);
      const cx = BR_CENTROIDS_APP[stateItem.uf]?.x;
      const cy = BR_CENTROIDS_APP[stateItem.uf]?.y;
      const hasData = !!info && (info.meta > 0 || info.produzido > 0);
      return `
        <g>
          <path d="${stateItem.d}" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="1.1" stroke-linejoin="round"/>
          ${hasData && cx && cy ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" style="font-size:20px;font-weight:1000;letter-spacing:0;fill:${palette.text};paint-order:stroke fill;stroke:rgba(0,0,0,.75);stroke-width:6px">${Math.round(info.pct)}%</text>` : ''}
        </g>`;
    }).join('');

    return `
      <div class="db-state-wrap">
        <svg class="db-state-svg" viewBox="0 0 800 796" xmlns="http://www.w3.org/2000/svg">
          ${groups}
        </svg>
      </div>
    `;
  }

  const gradTop = onTrack ? '#2dd4a0' : '#fde68a';
  const gradBot = onTrack ? '#065f46' : '#78350f';
  const glowClr = onTrack ? 'rgba(0,200,122,.9)' : 'rgba(253,230,138,.8)';

  const stH   = bounds.max - bounds.min;
  const fillH = Math.max(0, stH * pct / 100);
  const fillY = bounds.max - fillH;
  const amp   = Math.max(4, stH * 0.025);
  const period = 200;
  const waveSegs = [];
  for (let x = -period; x <= 1000 + period; x += period) {
    waveSegs.push(`Q ${x + period/4},${fillY - amp} ${x + period/2},${fillY}`);
    waveSegs.push(`Q ${x + 3*period/4},${fillY + amp} ${x + period},${fillY}`);
  }
  const wavePath = `M ${-period},${fillY} ${waveSegs.join(' ')} L 1000,${bounds.max+30} L ${-period},${bounds.max+30} Z`;

  const bgStates = BR_STATES
    .filter(s => s.uf !== uf)
    .map(s => `<path d="${s.d}" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.10)" stroke-width="0.9" stroke-linejoin="round"/>`)
    .join('');

  const clipPaths = `<path d="${target ? target.d : ''}"/>`;
  const cx = centroid.x;
  const cy = centroid.y;

  return `
    <div class="db-state-wrap">
      <svg class="db-state-svg" viewBox="0 0 800 796" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="appStateClip">${clipPaths}</clipPath>
          <linearGradient id="appFillGrad" x1="0" y1="${fillY}" x2="0" y2="${bounds.max}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${gradTop}"/>
            <stop offset="100%" stop-color="${gradBot}"/>
          </linearGradient>
          <filter id="appGlowFilter" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        ${bgStates}

        <g clip-path="url(#appStateClip)">
          <rect class="db-state-fill-rect"
                x="-10" y="${fillY}" width="820" height="${fillH + 30}"
                fill="url(#appFillGrad)"/>
          <path class="db-state-wave-path" d="${wavePath}" fill="${gradTop}" opacity=".35"/>
        </g>

        ${target ? `
          <path d="${target.d}" fill="none" stroke="${glowClr}" stroke-width="2" stroke-linejoin="round"
                filter="url(#appGlowFilter)" opacity=".7"/>
          <path d="${target.d}" fill="none" stroke="${glowClr}" stroke-width="1.4" stroke-linejoin="round"/>
          <text x="${cx}" y="${cy - 14}" class="db-state-pct">${pct.toFixed(0)}%</text>
          <text x="${cx}" y="${cy + 16}" class="db-state-abbr">${uf}</text>
        ` : ''}
      </svg>
    </div>
  `;
}

function appRenderMiniChart(daily7) {
  if (!daily7?.length) return '<div style="height:50px"></div>';
  const maxT = Math.max(...daily7.map(d => d.tons), 1);
  const W = 160, H = 42, bw = 16, gap = 5;
  const totalW = daily7.length * bw + (daily7.length - 1) * gap;
  const ox = (W - totalW) / 2;
  const bars = daily7.map((d, i) => {
    const h = Math.max(2, Math.round((d.tons / maxT) * H));
    const x = ox + i * (bw + gap);
    const dd = String(d.date || '').slice(8);
    const fill = i === 6 ? 'rgba(0,200,122,.90)' : 'rgba(0,200,122,.35)';
    return `<rect x="${x}" y="${H-h}" width="${bw}" height="${h}" rx="2" fill="${fill}"/>
            <text x="${x + bw/2}" y="${H+10}" text-anchor="middle" fill="rgba(255,255,255,.35)" style="font-size:7px;font-family:monospace;font-weight:700">${dd}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H+12}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:56px;display:block;overflow:visible">${bars}</svg>`;
}

function renderInicio(main) {
  const totalPend = state.os.filter((o) => (o.status_gestor || 'AGUARDAR').toUpperCase() === 'AGUARDAR' && !o.configurada_em).length;
  const atender = state.os.filter((o) => String(o.status_gestor || '').toUpperCase() === 'ATENDER').length;

  const dash = state.dashboard;
  const now = new Date();
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const mesNome = MESES[now.getMonth()];
  const mesFull = MESES_FULL[now.getMonth()];
  const diaAtual = now.getDate();
  const diasNoMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const meta = dash?.meta || 0;
  const produzido = dash?.produzido || 0;
  const daily7 = dash?.daily7 || [];
  const pct = meta > 0 ? Math.min(100, produzido / meta * 100) : 0;
  const ritmoEsperado = meta > 0 ? meta * diaAtual / diasNoMes : 0;
  const onTrack = produzido >= ritmoEsperado;
  const projetado = diaAtual > 0 ? produzido / diaAtual * diasNoMes : 0;
  const delta = produzido - ritmoEsperado;
  const coordenacaoApp = dash?.coordenacao || (state.appUser?.coordenacao || '');
  const estadoApp = state.isMaster ? 'BR' : (resolveStateFromRegionalNameApp(coordenacaoApp) || null);

  const patri = dash?.patrimonios || { total: 0, atrasados: 0 };
  const patriOk = patri.total - patri.atrasados;
  const patriPct = patri.total > 0 ? patriOk / patri.total * 100 : 100;

  function fmtTons(val) {
    const v = Number(val) || 0;
    return BR.format(Math.round(v)) + ' t';
  }
  function fmtDelta(val) {
    const v = Number(val) || 0;
    const abs = Math.abs(v);
    const sign = v >= 0 ? '+' : '−';
    return sign + (abs >= 1000 ? (abs / 1000).toFixed(1).replace('.', ',') + ' kt' : BR.format(Math.round(abs)) + ' t');
  }

  const cursorLeft = (diaAtual / diasNoMes * 100).toFixed(1);
  const loading = dash?.loading !== false && !dash;

  main.innerHTML = `
    <div class="db-topbar">
      <div class="db-period">
        <span class="db-period-month">${mesFull.toUpperCase()}</span>
        <span class="db-period-year">${now.getFullYear()}</span>
      </div>
      <div class="db-region">${escapeHtml(dash?.coordenacao || (state.isMaster ? 'TODAS AS REGIONAIS' : 'REGIONAL'))}</div>
    </div>

    <div class="db-prod-card ${onTrack ? 'is-on-track' : 'is-off-track'}">
      <div class="db-prod-eyebrow">Produtividade do Mês</div>

      <div class="db-prod-body">
        <div class="db-prod-left">
          ${appRenderStateFill({ pct, onTrack, estado: estadoApp, mapaEstados: dash?.mapaEstados || {} })}
        </div>
        <div class="db-prod-right">
          <div class="db-stat-block">
            <div class="db-stat-label">Meta do mês</div>
            <div class="db-stat-value">${meta > 0 ? fmtTons(meta) : '—'}</div>
          </div>
          <div class="db-stat-sep"></div>
          <div class="db-stat-block">
            <div class="db-stat-label">Produção atual</div>
            <div class="db-stat-value ${onTrack ? 'is-green' : 'is-amber'}">${loading ? '—' : fmtTons(produzido)}</div>
            <div class="db-stat-sub">${pct.toFixed(0)}% da meta &middot; DIA ${diaAtual}/${diasNoMes}</div>
            ${meta > 0 ? `<div class="db-stat-sub ${onTrack ? 'is-pos' : 'is-neg'}">${fmtDelta(delta)} vs ritmo</div>` : ''}
          </div>
          <div class="db-stat-sep"></div>
          <div>
            <div class="db-chart-label">Últimos 7 dias</div>
            ${appRenderMiniChart(daily7)}
          </div>
        </div>
      </div>

      <div class="db-pace-row">
        <div class="db-pace-badge ${onTrack ? 'is-ok' : 'is-late'}">
          <span class="db-pace-dot"></span>
          <span>${onTrack ? 'No ritmo esperado' : 'Abaixo do ritmo'}</span>
        </div>
        ${meta > 0 ? `<div class="db-delta ${onTrack ? 'is-pos' : 'is-neg'}">${fmtDelta(delta)} vs meta do dia</div>` : ''}
      </div>
    </div>

    <div class="db-row-2">
      <div class="db-patri-card is-clickable" data-go="patrimonio-leitura" role="button" tabindex="0" title="Abrir Leitura de Patrimônios">
        <div class="db-card-eyebrow">Patrimônios</div>
        <div class="db-patri-hero">
          <span class="db-patri-num ${patri.atrasados === 0 ? 'is-green' : ''}">${patriPct.toFixed(0)}</span>
          <span class="db-patri-den">% regularizado</span>
        </div>
        <div class="db-patri-status">
          ${patri.atrasados > 0
            ? `<span class="db-status-late">${patri.atrasados} em atraso &gt;7d</span>`
            : '<span class="db-status-ok">Tudo em dia ✓</span>'}
        </div>
      </div>

      <div class="db-os-card is-clickable" data-go="programacao" role="button" tabindex="0" title="Abrir Programação">
        <div class="db-card-eyebrow">Programação</div>
        <div class="db-os-hero">
          <span class="db-os-num ${totalPend > 0 ? 'is-amber' : 'is-green'}">${totalPend}</span>
          <span class="db-os-den">pendente${totalPend === 1 ? '' : 's'}</span>
        </div>
        <div class="db-os-status">
          ${totalPend > 0
            ? `<span class="db-status-late">${atender} em conferência</span>`
            : '<span class="db-status-ok">Tudo ajustado ✓</span>'}
        </div>
      </div>
    </div>

    <div class="install-banner ${state.installPrompt ? 'is-visible' : ''}" id="installBanner">
      <div><b>Instalar app</b><br><span class="help">Adicione na tela inicial do celular.</span></div>
      <button class="btn" id="installBtn" type="button">Instalar</button>
    </div>

    <div class="db-actions-label">Ações Rápidas</div>
    <div class="quick-grid">
      <a class="quick-card" href="${panelHref('hospedagem')}"><b>Hospedagem</b><span>Solicitações e reservas</span></a>
      <a class="quick-card" href="${panelHref('compras')}"><b>Compras</b><span>Solicitações do gestor</span></a>
      <a class="quick-card" href="${panelHref('logistica')}"><b>Logística</b><span>Distribuição e finalização</span></a>
      <a class="quick-card" href="${panelHref('patrimonios')}"><b>Patrimônios</b><span>Veículos e vínculos</span></a>
      <a class="quick-card" href="${panelHref('contato-cliente')}"><b>Contato Cliente</b><span>Visitas e registros</span></a>
    </div>
  `;

  const openProgramacao = () => {
    state.currentTab = 'programacao';
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === 'programacao'));
    renderProgramacao(main);
  };
  main.querySelector('[data-go="programacao"]')?.addEventListener('click', openProgramacao);
  main.querySelector('[data-go="programacao"]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openProgramacao(); }
  });
  main.querySelector('[data-go="patrimonio"]')?.addEventListener('click', () => {
    state.currentTab = 'patrimonio';
    state.patrimonioSubview = null;
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === 'patrimonio'));
    renderPatrimonio(main);
  });
  const openPatrimonioLeitura = () => {
    state.currentTab = 'patrimonio';
    state.patrimonioSubview = 'leitura';
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === 'patrimonio'));
    renderPatrimonio(main);
  };
  main.querySelector('[data-go="patrimonio-leitura"]')?.addEventListener('click', openPatrimonioLeitura);
  main.querySelector('[data-go="patrimonio-leitura"]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPatrimonioLeitura(); }
  });
  main.querySelector('#installBtn')?.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => null);
    state.installPrompt = null;
    renderInicio(main);
  });
}

function renderMais(main) {
  main.innerHTML = `
    <section class="hero-card">
      <h1>Mais módulos</h1>
      <p>Acesso rápido aos módulos do gestor sem abrir a sidebar do painel.</p>
      <div class="quick-grid">
        <a class="quick-card" href="${panelHref('hospedagem')}"><b>Hospedagem</b><span>Solicitações e reservas</span></a>
        <a class="quick-card" href="${panelHref('compras')}"><b>Compras</b><span>Solicitações</span></a>
        <a class="quick-card" href="${panelHref('logistica')}"><b>Logística</b><span>Deslocamentos</span></a>
        <a class="quick-card" href="${panelHref('contato-cliente')}"><b>Contato Cliente</b><span>Registros</span></a>
        <a class="quick-card" href="${panelHref('dashboard')}"><b>Painel Web</b><span>Versão completa</span></a>
      </div>
    </section>
  `;
}

function isOsAjustada(os) {
  const st = String(os.status_gestor || '').toUpperCase();
  if (st === 'ATENDER' || st === 'FINALIZAR') return true;
  if (String(os.observacao_logistica || '').startsWith('KG solicitado')) return true;
  // Explicitly set AGUARDAR (has configurada_em) also counts as reviewed
  return st === 'AGUARDAR' && !!os.configurada_em;
}

function renderOsList(rows) {
  if (!rows.length) return '<section class="os-list" id="osList"><div class="empty">Nenhuma O.S. encontrada para o filtro atual.</div></section>';
  const pendentes = rows.filter((o) => !isOsAjustada(o));
  const ajustadas = rows.filter((o) => isOsAjustada(o));
  return `
    <section class="os-list" id="osList">
      ${pendentes.length ? pendentes.map(renderOsCard).join('') : '<div class="empty">Todas as O.S. do filtro foram ajustadas.</div>'}
      ${ajustadas.length ? `
        <div class="os-ajustadas-divider">
          <span>AJUSTADAS (${ajustadas.length})</span>
        </div>
        ${ajustadas.map(renderOsCard).join('')}
      ` : ''}
    </section>
  `;
}

function renderOs(main) {
  const supervisoes = [...new Set(state.os.map((o) => o.supervisao).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const rows = filteredOs();
  main.innerHTML = `
    <section class="prog-web-banner">
      <span class="prog-web-banner-text">Disponibilidade, estadia, alimentação e extras ficam na versão completa.</span>
      <a class="prog-web-banner-link" href="${panelHref('programacao')}">Abrir etapas completas →</a>
    </section>
    <section class="section-card">
      <div class="section-title">
        <div><h2>Distribuição de O.S.</h2><p>Indique colaboradores e envie para Conferência.</p></div>
        <div class="os-count-badge">${rows.length}</div>
      </div>
      <div class="filter-grid">
        <div class="field"><label>Supervisão</label><select id="filterSupervisao"><option value="">Todas liberadas</option>${supervisoes.map((s) => `<option value="${escapeHtml(s)}" ${state.filters.supervisao === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select id="filterStatus"><option value="">Todos</option>${STATUS.map((s) => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Buscar</label><input id="filterBusca" value="${escapeHtml(state.filters.busca)}" placeholder="OS, cliente, embarque..." /></div>
      </div>
    </section>
    ${renderOsList(rows)}
  `;
  main.querySelector('#filterSupervisao')?.addEventListener('change', (e) => { state.filters.supervisao = e.target.value; renderOs(main); });
  main.querySelector('#filterStatus')?.addEventListener('change', (e) => { state.filters.status = e.target.value; renderOs(main); });
  main.querySelector('#filterBusca')?.addEventListener('input', debounce((e) => { state.filters.busca = e.target.value; renderOs(main); }, 220));
  bindOsEvents(main);
}

function renderProgramacao(main) {
  renderOs(main);
}

function injectGacStyles() {
  if (document.getElementById('gac-styles')) return;
  const s = document.createElement('style');
  s.id = 'gac-styles';
  s.textContent = `
.gac{position:relative;width:100%}
.gac-input{width:100%;box-sizing:border-box;padding:7px 10px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font-size:13px;outline:none}
.gac-input:focus{border-color:#4ade80}
.gac-list{position:absolute;top:calc(100% + 2px);left:0;right:0;background:#1e2d3e;border:1px solid #334155;border-radius:8px;max-height:220px;overflow-y:auto;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.5)}
.gac-item{padding:8px 12px;cursor:pointer;font-size:13px;color:#f1f5f9;display:flex;justify-content:space-between;align-items:center;gap:8px}
.gac-item:hover{background:rgba(74,222,128,.12)}
.gac-dist{font-size:11px;color:#94a3b8;white-space:nowrap;flex-shrink:0}
.gac-empty{padding:10px 12px;font-size:13px;color:#94a3b8;font-style:italic}
`;
  document.head.appendChild(s);
}

function getColabDisplayName(key) {
  if (!key) return '';
  return state.colaboradores.find((c) => colabKey(c) === key)?.nome || '';
}

function buscarColabGac(query, osId, excludeKeys = new Set()) {
  const point = getSuggestionsForOs(osId)?.point || (() => {
    const os = state.os.find((row) => String(row.id || row.numero_os) === osId);
    return os ? findPoint(os) : null;
  })();
  const norm = normalize(query);
  const hasQuery = norm.length >= 2;
  return state.colaboradores
    .filter((c) => !excludeKeys.has(colabKey(c)))
    .filter((c) => !hasQuery || normalize(c.nome).includes(norm))
    .map((c) => ({ c, distancia: point ? haversineKm(c.latitude, c.longitude, point.latitude, point.longitude) : null }))
    .sort((a, b) => {
      if (Number.isFinite(a.distancia) && Number.isFinite(b.distancia)) return a.distancia - b.distancia;
      if (Number.isFinite(a.distancia)) return -1;
      if (Number.isFinite(b.distancia)) return 1;
      return 0;
    })
    .slice(0, 15);
}

function renderGacDropdown(dropdown, query, osId, excludeKeys) {
  const results = buscarColabGac(query, osId, excludeKeys);
  if (!results.length) {
    dropdown.innerHTML = '<div class="gac-empty">Nenhum colaborador encontrado.</div>';
  } else {
    dropdown.innerHTML = results.map(({ c, distancia }, idx) => {
      const key = colabKey(c);
      const star = idx === 0 && !normalize(query) ? '⭐ ' : '';
      const dist = Number.isFinite(distancia) ? ` <span class="gac-dist">${KM.format(distancia)} km</span>` : '';
      return `<div class="gac-item" data-key="${escapeHtml(key)}" data-nome="${escapeHtml(c.nome)}">${star}${escapeHtml(c.nome)}${dist}</div>`;
    }).join('');
  }
  dropdown.hidden = false;
}

function renderOsCard(os) {
  const id = osId(os);
  const isCinza = (os.status_gestor || 'AGUARDAR').toUpperCase() === 'AGUARDAR' && !os.configurada_em;
  const status = isCinza ? 'PENDENTE' : String(os.status_gestor).toUpperCase();
  const sugg = getSuggestionsForOs(id) || { items: [], aviso: '' };
  const selected = state.selections.get(id) || (sugg.items[0] ? colabKey(sugg.items[0].c) : '');
  const selectedInfo = sugg.items.find((row) => colabKey(row.c) === selected) || null;
  const selectedColab = selectedInfo?.c || state.colaboradores.find((c) => colabKey(c) === selected) || null;
  const selectedDist = selectedInfo?.distancia ?? null;
  const isNegativo = num(os.remanescente) < 0;
  const isZero = num(os.remanescente) === 0;
  const canMulti = num(os.remanescente) >= LIMITE_MULTIPLOS;
  const isMulti = state.allowMulti.has(id) && canMulti;
  const extraValues = state.extras.get(id) || [];
  const hasLaudo = String(os.observacao_logistica||'').startsWith('LAUDO:');
  const rowColor = isNegativo ? 'row-kg' : os.observacao_logistica?.startsWith('KG solicitado') ? 'row-kg' : status === 'AGUARDAR' ? 'row-aguardar' : status === 'ATENDER' ? 'row-atender' : status === 'FINALIZAR' ? 'row-finalizar' : '';
  return `
    <article class="os-card ${num(os.remanescente) === 0 ? 'is-zero' : ''} ${state.busy.has(id) ? 'is-updating' : ''} ${rowColor}" data-os-id="${escapeHtml(id)}">
      <div class="os-head">
        <div><div class="os-number">${escapeHtml(os.numero_os)}</div><div class="os-date">${brDate(os.data_os)} · ${escapeHtml(first(os.servico))}</div></div>
        <span class="status-badge ${escapeHtml(status)}">${escapeHtml(status)}</span>
      </div>
      <div class="os-client">${escapeHtml(first(os.cliente))}</div>
      <div class="os-route">
        <span>Emb.: ${escapeHtml(first(os.embarque))}</span>
        <span>Dest.: ${escapeHtml(first(os.destino))}</span>
        <span>${escapeHtml(first(os.supervisao))} · Contrato ${escapeHtml(first(os.contrato))} · ${escapeHtml(first(os.produto))}</span>
      </div>
      <div class="os-body">
        <div class="os-metrics">
          <div class="metric"><small>Rem.</small><b>${fmt(os.remanescente)}</b></div>
          <div class="metric"><small>Lote</small><b>${fmt(os.lote)}</b></div>
          <div class="metric"><small>Emb.</small><b>${fmt(os.embarcado)}</b></div>
        </div>
        ${!isZero && !isNegativo ? `<div class="indicacao-box">
          <div class="gac">
            <input type="text" class="gac-input" value="${escapeHtml(getColabDisplayName(selected))}" placeholder="Digitar colaborador..." autocomplete="off" spellcheck="false" data-ac-os-id="${escapeHtml(id)}" data-ac-type="main" />
            <div class="gac-list" hidden></div>
          </div>
          ${selectedColab ? `<div class="help ok">Indicação: ${escapeHtml(selectedColab.nome)}${Number.isFinite(selectedDist) ? ` · ${KM.format(selectedDist)} km do ponto operacional.` : ''}</div>` : `<div class="help warn">${escapeHtml(sugg.aviso || 'Selecione um colaborador para enviar à Conferência.')}</div>`}
          <div class="indicacao-actions" style="display:flex;gap:8px;margin-top:8px">
            <button class="btn secondary ${os.observacao_logistica?.startsWith('KG solicitado') ? 'kg-active' : ''}" data-action-kg="${escapeHtml(id)}" data-action-kg-num="${escapeHtml(os.numero_os)}" type="button" title="Solicitar mais saldo" style="flex:1;color:#90cdf4;border-color:rgba(99,179,237,.35)">${ICO_SALDO_PLUS} Adicionar saldo</button>
            <button class="btn ${status === 'ATENDER' ? '' : 'secondary'}" data-action="ATENDER" type="button" title="Enviar para Conferência" style="flex:1">${ICO_CONFERIR} Conferir</button>
          </div>
          ${canMulti ? `<label class="multi-line"><input data-role="allow-multi" type="checkbox" ${isMulti ? 'checked' : ''} /> permitir 2 ou mais colaboradores</label>` : ''}
          ${canMulti && isMulti ? renderExtraSelects(id, selected, extraValues) : ''}
        </div>` : ''}
        <div class="action-grid">
        ${isNegativo
          ? `<button class="btn secondary ${hasLaudo ? 'kg-active' : ''}" data-action-laudo="${escapeHtml(id)}" data-action-laudo-num="${escapeHtml(os.numero_os)}" type="button" title="Anexar laudo para conferência" style="color:#fca5a5;border-color:rgba(239,68,68,.4);grid-column:span 6;font-size:18px;font-weight:950">!</button>`
          : isZero
          ? `<button class="btn ${status === 'FINALIZAR' ? '' : 'secondary'}" data-action="FINALIZAR" type="button" title="Finalizar OS" style="grid-column:span 3">${ICO_FINALIZAR} Finalizar OS</button>
             <button class="btn secondary ${os.observacao_logistica?.startsWith('KG solicitado') ? 'kg-active' : ''}" data-action-kg="${escapeHtml(id)}" data-action-kg-num="${escapeHtml(os.numero_os)}" type="button" title="Solicitar mais saldo" style="grid-column:span 3;color:#90cdf4;border-color:rgba(99,179,237,.35)">${ICO_SOMAR_KG} Mais saldo</button>`
          : `<div class="status-dot ${isCinza ? 'is-active' : ''}" title="Sem ação definida"><span class="dot"></span></div>
        <button class="btn ${status === 'AGUARDAR' ? 'warn' : 'secondary'}" data-action="AGUARDAR" type="button" title="Aguardar">${ICO_AGUARDAR}</button>
        <button class="btn ${status === 'ATENDER' ? '' : 'secondary'}" data-action="ATENDER" type="button" title="Atender">${ICO_ATENDER}</button>
        <button class="btn ${status === 'FINALIZAR' ? '' : 'secondary'}" data-action="FINALIZAR" type="button" title="Finalizar">${ICO_FINALIZAR}</button>
        <button class="btn secondary ${os.observacao_logistica?.startsWith('KG solicitado') ? 'kg-active' : ''}" data-action-kg="${escapeHtml(id)}" data-action-kg-num="${escapeHtml(os.numero_os)}" type="button" title="Solicitar KG para Logística" style="color:#90cdf4;border-color:rgba(99,179,237,.35)">${ICO_SOMAR_KG}</button>`
        }
        </div>
      </div>
      <label class="tomorrow-label"><input type="checkbox" data-toggle-tomorrow="${escapeHtml(id)}" ${state.tomorrow.has(id) ? 'checked' : ''} /> Salvar para amanhã</label>
    </article>
  `;
}

function renderExtraSelects(id, selected, extraValues) {
  const values = extraValues.length ? extraValues : [''];
  return `<div class="indicacao-box" data-role="extras">${values.map((value, idx) => `
    <div class="gac">
      <input type="text" class="gac-input" value="${escapeHtml(getColabDisplayName(value))}" placeholder="${idx + 2}º colaborador na mesma O.S." autocomplete="off" spellcheck="false" data-ac-os-id="${escapeHtml(id)}" data-ac-type="extra" data-ac-index="${idx}" data-ac-exclude="${escapeHtml(selected)}" />
      <div class="gac-list" hidden></div>
    </div>`).join('')}
    <button class="btn secondary" data-role="add-extra" type="button">+ outro colaborador</button>
  </div>`;
}

function bindOsEvents(scope) {
  scope.querySelectorAll('[data-role="allow-multi"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      if (!id) return;
      if (e.target.checked) state.allowMulti.add(id);
      else { state.allowMulti.delete(id); state.extras.delete(id); }
      renderOs(document.getElementById('appMain'));
    });
  });
  scope.querySelectorAll('[data-role="add-extra"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      if (!id) return;
      const list = state.extras.get(id) || [];
      list.push('');
      state.extras.set(id, list);
      renderOs(document.getElementById('appMain'));
    });
  });

  const debouncedInput = debounce((e) => {
    const input = e.target.closest('.gac-input');
    if (!input) return;
    const dropdown = input.closest('.gac')?.querySelector('.gac-list');
    if (!dropdown) return;
    const osId = input.dataset.acOsId;
    const excludeKeys = new Set();
    if (input.dataset.acType === 'extra') {
      if (input.dataset.acExclude) excludeKeys.add(input.dataset.acExclude);
      const myIdx = Number(input.dataset.acIndex) || 0;
      (state.extras.get(osId) || []).forEach((k, i) => { if (i !== myIdx && k) excludeKeys.add(k); });
    } else {
      (state.extras.get(osId) || []).forEach((k) => { if (k) excludeKeys.add(k); });
    }
    renderGacDropdown(dropdown, input.value, osId, excludeKeys);
  }, 180);

  scope.addEventListener('input', debouncedInput);

  scope.addEventListener('focusin', (e) => {
    const input = e.target.closest('.gac-input');
    if (!input) return;
    const dropdown = input.closest('.gac')?.querySelector('.gac-list');
    if (!dropdown) return;
    input.select();
    const osId = input.dataset.acOsId;
    const excludeKeys = new Set();
    if (input.dataset.acType === 'extra') {
      if (input.dataset.acExclude) excludeKeys.add(input.dataset.acExclude);
    } else {
      (state.extras.get(osId) || []).forEach((k) => { if (k) excludeKeys.add(k); });
    }
    renderGacDropdown(dropdown, '', osId, excludeKeys);
  });

  scope.addEventListener('focusout', (e) => {
    const input = e.target.closest('.gac-input');
    if (!input) return;
    const dropdown = input.closest('.gac')?.querySelector('.gac-list');
    if (dropdown) setTimeout(() => { dropdown.hidden = true; }, 180);
  });

  scope.addEventListener('click', (e) => {
    const item = e.target.closest('.gac-item');
    if (!item) return;
    const gac = item.closest('.gac');
    const input = gac?.querySelector('.gac-input');
    if (!input) return;
    const key = item.dataset.key;
    const nome = item.dataset.nome;
    const osId = input.dataset.acOsId;
    const type = input.dataset.acType;
    if (!osId || !key) return;
    gac.querySelector('.gac-list').hidden = true;
    if (type === 'main') {
      state.selections.set(osId, key);
      state.extras.set(osId, (state.extras.get(osId) || []).filter((v) => v && v !== key));
    } else {
      const index = Number(input.dataset.acIndex) || 0;
      const list = state.extras.get(osId) || [];
      list[index] = key;
      state.extras.set(osId, [...new Set(list.filter(Boolean))]);
    }
    renderOs(document.getElementById('appMain'));
  });
  scope.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      const status = e.target.dataset.action;
      if (!id || !status) return;
      await saveOsStatus(id, status);
    });
  });
  scope.querySelectorAll('[data-action-kg]').forEach((btn) => {
    btn.addEventListener('click', () => openKgModal(btn.dataset.actionKg, btn.dataset.actionKgNum));
  });
  scope.querySelectorAll('[data-action-laudo]').forEach((btn) => {
    btn.addEventListener('click', () => openLaudoModal(btn.dataset.actionLaudo, btn.dataset.actionLaudoNum));
  });
  scope.querySelectorAll('[data-toggle-tomorrow]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      if (!id) return;
      if (e.target.checked) state.tomorrow.add(id);
      else state.tomorrow.delete(id);
    });
  });
}

function openKgModal(recordId, osNumero) {
  const existing = document.getElementById('kg-modal-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'kg-modal-overlay';
  overlay.className = 'kg-overlay';
  overlay.innerHTML = `
    <div class="kg-modal">
      <h3>Qual o valor precisa somar na O.S?</h3>
      <p style="margin:0;font-size:12px;color:#6b7280">O.S. <strong style="color:#bbf7d0">${escapeHtml(osNumero)}</strong> — valor será enviado para a Logística.</p>
      <input id="kgInput" type="number" min="1" placeholder="Inserir KG" inputmode="numeric" />
      <div class="kg-modal-actions">
        <button class="kg-btn-cancel" id="kgCancelar">Cancelar</button>
        <button class="kg-btn-confirm" id="kgConfirmar">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#kgInput');
  input.focus();
  overlay.querySelector('#kgCancelar').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#kgConfirmar').addEventListener('click', async () => {
    const kg = Number(input.value);
    if (!kg || kg <= 0) { input.focus(); return; }
    const btn = overlay.querySelector('#kgConfirmar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    const kgText = `KG solicitado pelo gestor: ${new Intl.NumberFormat('pt-BR').format(kg)} kg`;
    const row = state.os.find((o) => osId(o) === recordId);
    if (row) { row.observacao_logistica = kgText; row.status_gestor = 'AGUARDAR'; row.configurada_em = null; }
    overlay.remove();
    renderOs(document.getElementById('appMain'));
    showToast('Solicitação enviada para a Logística.', 'success');
    supabase.from('operacional_os').update({ observacao_logistica: kgText, status_gestor: 'AGUARDAR', configurada_em: null, updated_at: new Date().toISOString() }).eq('id', recordId);
  });
}

function openLaudoModal(recordId, osNumero) {
  const existing = document.getElementById('kg-modal-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'kg-modal-overlay';
  overlay.className = 'kg-overlay';
  overlay.innerHTML = `
    <div class="kg-modal">
      <h3>Anexar laudo para O.S. ${escapeHtml(osNumero)}</h3>
      <p style="margin:0;font-size:12px;color:#6b7280">Remanescente negativo — anexe imagens, planilhas ou PDFs para conferência.</p>
      <div id="laudo-dropzone" style="border:2px dashed rgba(239,68,68,.35);border-radius:14px;padding:28px 16px;text-align:center;color:#6b7280;cursor:pointer;margin-top:8px;font-size:13px;transition:border-color .15s">
        Clique ou arraste arquivos aqui<br><small style="font-size:11px">imagens, PDF, Excel, CSV</small>
      </div>
      <input id="laudo-file-input" type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.csv" style="display:none" />
      <div id="laudo-file-list" style="margin-top:8px;font-size:12px;color:#bbf7d0;min-height:20px"></div>
      <div class="kg-modal-actions">
        <button class="kg-btn-cancel" id="laudoCancelar">Cancelar</button>
        <button class="kg-btn-confirm" id="laudoEnviar">Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const dropzone = overlay.querySelector('#laudo-dropzone');
  const fileInput = overlay.querySelector('#laudo-file-input');
  const fileList = overlay.querySelector('#laudo-file-list');
  let selectedFiles = [];

  function updateFileList() {
    fileList.textContent = selectedFiles.map((f) => f.name).join(', ') || '';
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'rgba(239,68,68,.7)'; });
  dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'rgba(239,68,68,.35)'; });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(239,68,68,.35)';
    selectedFiles = [...(e.dataTransfer.files || [])];
    updateFileList();
  });
  fileInput.addEventListener('change', () => {
    selectedFiles = [...(fileInput.files || [])];
    updateFileList();
  });

  overlay.querySelector('#laudoCancelar').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#laudoEnviar').addEventListener('click', async () => {
    if (!selectedFiles.length) { dropzone.style.borderColor = 'rgba(239,68,68,.9)'; return; }
    const btn = overlay.querySelector('#laudoEnviar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    let urls;
    try {
      urls = await anexarLaudoComGeolocalizacao(recordId, selectedFiles, {
        origem: 'gestor_app',
        usuario: state.user
          ? { id: state.user.id, nome: state.appUser?.nome || state.context?.user?.name, email: state.user.email }
          : null,
      });
    } catch (upErr) {
      alert(upErr.message); btn.disabled = false; btn.textContent = 'Enviar'; return;
    }

    const laudoText = `LAUDO:${urls.join(',')}`;
    const row = state.os.find((o) => osId(o) === recordId);
    if (row) row.observacao_logistica = laudoText;
    overlay.remove();
    renderOs(document.getElementById('appMain'));
    showToast('Laudo anexado com sucesso.', 'success');
  });
}

async function saveOsStatus(id, status) {
  const os = state.os.find((row) => osId(row) === id);
  if (!os) return;
  const selected = state.selections.get(id) || '';
  const suggestions = getSuggestionsForOs(id)?.items || [];
  const selectedInfo = suggestions.find((row) => colabKey(row.c) === selected) || suggestions[0] || null;

  let colabKeys = [];
  if (status === 'ATENDER') {
    const main = selected || (selectedInfo ? colabKey(selectedInfo.c) : '');
    if (!main) {
      showToast('A O.S. não pode ir para Conferência sem colaborador indicado.', 'error');
      return;
    }
    colabKeys = [main];
    if (num(os.remanescente) >= LIMITE_MULTIPLOS && state.allowMulti.has(id)) {
      colabKeys.push(...(state.extras.get(id) || []));
    }
    colabKeys = [...new Set(colabKeys.filter(Boolean))];
  }

  const isTomorrow = state.tomorrow.has(id);
  const configuradaEm = isTomorrow
    ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d.toISOString(); })()
    : new Date().toISOString();

  state.busy.add(id);
  os.status_gestor = status;
  os.configurada_em = configuradaEm;
  os.observacao_logistica = null;
  os.permitir_mais_classificadores = state.allowMulti.has(id) && num(os.remanescente) >= LIMITE_MULTIPLOS;
  renderOs(document.getElementById('appMain'));

  try {
    if (status === 'ATENDER') {
      const rows = colabKeys.map((key) => {
        const hit = suggestions.find((row) => colabKey(row.c) === key);
        const c = hit?.c || state.colaboradores.find((row) => colabKey(row) === key) || {};
        return {
          os_id: id,
          colaborador_key: key,
          colaborador_nome: c.nome || key,
          colaborador_cpf: c.cpf || null,
          distancia_km: Number.isFinite(hit?.distancia) ? hit.distancia : null,
          origem_sugestao: hit ? 'APP_GESTOR_DISTANCIA' : 'APP_GESTOR_MANUAL',
          indicado_por: state.user?.id || null,
          updated_at: new Date().toISOString(),
        };
      });
      await supabase.from('operacional_os_colaboradores').delete().eq('os_id', id);
      const { error: insError } = await supabase.from('operacional_os_colaboradores').insert(rows);
      if (insError) throw insError;
    }

    const { error } = await supabase.from('operacional_os').update({
      status_gestor: status,
      observacao_logistica: null,
      permitir_mais_classificadores: os.permitir_mais_classificadores,
      configurada_em: configuradaEm,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;

    if (status === 'ATENDER' && colabKeys.length) {
      const dataOs = String(os.data_os || '').slice(0, 10);
      if (dataOs && os.supervisao) {
        try {
          const { data: progDia } = await supabase
            .from('programacao_dia')
            .select('id')
            .eq('data_referencia', dataOs)
            .eq('supervisao', os.supervisao)
            .maybeSingle();
          if (progDia?.id) {
            await supabase
              .from('programacao_colaboradores')
              .update({ disponibilidade: 'OK' })
              .eq('programacao_id', progDia.id)
              .in('colaborador_id', colabKeys)
              .eq('disponibilidade', 'SEM EMBARQUE');
          }
        } catch (_) {}
      }
    }

    clearCache();
    await loadData({ useCache: false });
    renderOs(document.getElementById('appMain'));
    showToast(`O.S. ${os.numero_os} marcada como ${status}.`);
  } catch (error) {
    console.error(error);
    showToast(await mensagemFalhaSalvar(error, error.message || 'Não foi possível salvar a O.S.', 'O.S.'), 'error');
    await loadData({ useCache: false });
    renderOs(document.getElementById('appMain'));
  } finally {
    state.busy.delete(id);
  }
}

async function contarCadastrosPatrimonioPendentes() {
  let query = supabase.from('compras_patrimonios_cadastro').select('id', { count: 'exact', head: true }).is('numero_patrimonio', null);
  if (!state.isMaster && state.appUser?.coordenacao) query = query.eq('coordenacao', state.appUser.coordenacao);
  const { count } = await query;
  return count || 0;
}

async function renderPatrimonio(main) {
  if (state.patrimonioSubview === 'leitura') return renderPatrimonioLeitura(main);
  if (state.patrimonioSubview === 'cadastrar') return renderPatrimonioCadastrar(main);
  main.innerHTML = `<div class="section-card"><p class="help">Carregando...</p></div>`;
  const pendentes = await contarCadastrosPatrimonioPendentes();
  main.innerHTML = `
    <section class="hero-card">
      <h1>Patrimônio</h1>
      <p>Gerencie os patrimônios da sua regional.</p>
      <div class="quick-grid">
        <button class="quick-card is-primary" data-pat="cadastrar" type="button">
          <b>Cadastrar${pendentes > 0 ? ` <span class="pat-badge">${pendentes}</span>` : ''}</b>
          <span>Solicitações do setor de Compras</span>
        </button>
        <button class="quick-card" data-pat="leitura" type="button"><b>Leitura</b><span>Patrimônios cadastrados da regional</span></button>
      </div>
    </section>
  `;
  main.querySelector('[data-pat="cadastrar"]')?.addEventListener('click', () => {
    state.patrimonioSubview = 'cadastrar';
    renderPatrimonioCadastrar(main);
  });
  main.querySelector('[data-pat="leitura"]')?.addEventListener('click', () => {
    state.patrimonioSubview = 'leitura';
    renderPatrimonioLeitura(main);
  });
}

function patBack(main) {
  state.patrimonioSubview = null;
  renderPatrimonio(main);
}

async function renderPatrimonioLeitura(main) {
  main.innerHTML = `<div class="section-card"><p class="help">Carregando patrimônios...</p></div>`;
  const sups = state.isMaster ? [] : state.allowedSupervisoes;
  const PAGE = 1000;
  let rows = [], page = 0, error = null;
  while (true) {
    let q = supabase.from('vw_patrimonios_atual')
      .select('patrimonio_codigo,funcionario,identificacao,dias_sem_leitura,supervisao,situacao')
      .order('dias_sem_leitura', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (sups.length) q = q.in('supervisao', sups);
    const { data, error: err } = await q;
    if (err) { error = err; break; }
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
    page++;
  }
  main.innerHTML = `
    <section class="hero-card pat-header">
      <button class="btn secondary" data-pat-back type="button">← Voltar</button>
      <h1>Leitura de Patrimônios</h1>
      <p>${rows.length} patrimônio(s) encontrado(s)${error ? ' — erro ao carregar' : ''}.</p>
    </section>
    <section class="section-card">
      ${error ? `<p class="help error-text">Erro: ${escapeHtml(error.message)}</p>` : rows.length === 0 ? '<p class="help">Nenhum patrimônio encontrado para a regional.</p>' : `
      <div class="pat-table-wrap">
        <table class="pat-table">
          <thead><tr><th>Nº</th><th>Colaborador</th><th>Material</th><th>Dias s/ Leitura</th></tr></thead>
          <tbody>
            ${rows.map((r) => {
              const inativo = /n.o\s*ativo|inativo|desligado|demitido/i.test(normalize(r.situacao || ''));
              return `<tr class="${inativo ? 'pat-row-inativo' : ''}">
              <td>${escapeHtml(r.patrimonio_codigo || '-')}</td>
              <td>${escapeHtml(r.funcionario || '-')}</td>
              <td>${escapeHtml(r.identificacao || '-')}</td>
              <td class="${(r.dias_sem_leitura ?? 0) > 30 && !inativo ? 'dias-alerta' : ''}">${r.dias_sem_leitura ?? '-'}</td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </section>
  `;
  main.querySelector('[data-pat-back]')?.addEventListener('click', () => patBack(main));
}

function renderPatrimonioCadastroCard(r) {
  if (r.numero_patrimonio) {
    return `
      <div class="pat-card pat-conferido">
        <div class="pat-card-row">
          <span class="pat-num">${escapeHtml(r.numero_patrimonio)}</span>
          <span class="pat-status-pill">CADASTRADO</span>
        </div>
        <b>${escapeHtml(r.material || '-')}</b>
        ${r.marca ? `<span class="help">${escapeHtml(r.marca)}</span>` : ''}
        ${r.coordenacao ? `<span class="help">${escapeHtml(r.coordenacao)}</span>` : ''}
        ${r.informado_em ? `<span class="help">Cadastrado: ${brDate(r.informado_em)}</span>` : ''}
      </div>
    `;
  }
  return `
    <div class="pat-card">
      <div class="pat-card-row">
        <span class="pat-num">S/N</span>
        <span class="pat-status-pill">PENDENTE</span>
      </div>
      <b>${escapeHtml(r.material || '-')}</b>
      ${r.marca ? `<span class="help">${escapeHtml(r.marca)}</span>` : ''}
      ${r.coordenacao ? `<span class="help">${escapeHtml(r.coordenacao)}</span>` : ''}
      <div class="pat-cadastro-row">
        <input type="text" class="pat-cadastro-input" placeholder="Nº do patrimônio" data-pat-input="${escapeHtml(r.id)}" />
        <button class="btn secondary" type="button" data-pat-confirmar="${escapeHtml(r.id)}">Confirmar</button>
      </div>
    </div>
  `;
}

async function renderPatrimonioCadastrar(main) {
  main.innerHTML = `<div class="section-card"><p class="help">Carregando solicitações...</p></div>`;
  let query = supabase.from('compras_patrimonios_cadastro')
    .select('id,numero_patrimonio,material,marca,coordenacao,status,informado_em')
    .order('informado_em', { ascending: false, nullsFirst: true });
  if (!state.isMaster && state.appUser?.coordenacao) query = query.eq('coordenacao', state.appUser.coordenacao);
  const { data, error } = await query;
  const rows = data || [];
  const pendentes = rows.filter((r) => !r.numero_patrimonio);
  const cadastrados = rows.filter((r) => r.numero_patrimonio);
  main.innerHTML = `
    <section class="hero-card pat-header">
      <button class="btn secondary" data-pat-back type="button">← Voltar</button>
      <h1>Cadastrar Patrimônio</h1>
      <p>${pendentes.length} pendente(s) de número &middot; ${cadastrados.length} já cadastrado(s)${error ? ' — erro ao carregar' : ''}.</p>
    </section>
    <section class="section-card">
      ${error ? `<p class="help error-text">Erro: ${escapeHtml(error.message)}</p>` : rows.length === 0 ? '<p class="help">Nenhuma solicitação de cadastro encontrada.</p>' : [...pendentes, ...cadastrados].map(renderPatrimonioCadastroCard).join('')}
    </section>
  `;
  main.querySelector('[data-pat-back]')?.addEventListener('click', () => patBack(main));
  main.querySelectorAll('[data-pat-confirmar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.patConfirmar;
      const input = main.querySelector(`[data-pat-input="${id}"]`);
      const numero = input?.value.trim();
      if (!numero) { input?.focus(); return; }
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      const agoraIso = new Date().toISOString();
      const { error: updError } = await supabase.from('compras_patrimonios_cadastro').update({
        numero_patrimonio: numero,
        status: 'numero_informado',
        informado_em: agoraIso,
        updated_at: agoraIso,
      }).eq('id', id);
      if (updError) {
        alert(updError.message);
        btn.disabled = false;
        btn.textContent = 'Confirmar';
        return;
      }
      renderPatrimonioCadastrar(main);
    });
  });
}

function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

boot().catch((error) => {
  console.error(error);
  app.innerHTML = `<div class="app-loader"><strong>Erro ao abrir o app</strong><span>${escapeHtml(error.message || error)}</span></div>`;
});
