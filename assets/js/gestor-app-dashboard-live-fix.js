import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';
import { sincronizarProducaoSnapshotDoAgente } from './producaoSnapshotAgentSync.js';

const DASH_CACHE_KEY = 'grao1000:gestor-dash:v4-segmentado';
const BR_PERIOD = new Date();

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
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

function isMasterContext(context) {
  const role = context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role || '';
  return Boolean(context?.user?.is_master || context?.is_master || norm(role) === 'MASTER');
}

function monthBounds(now = BR_PERIOD) {
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const dataFim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  return { ano, mes, dataIni, dataFim };
}

function periodKey(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function cacheReference({ isMaster, coordenacao, ano, mes }) {
  const period = periodKey(ano, mes);
  if (isMaster) return `master:${period}`;
  return `regional:${norm(coordenacao) || 'sem_regional'}:${period}`;
}

function clearLocalDashCache() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(DASH_CACHE_KEY))
      .forEach((key) => localStorage.removeItem(key));
  } catch {}
}

function activePatrimonio(row) {
  const status = norm(row?.situacao || row?.status || row?.situacao_patrimonio || '');
  if (!status) return true;
  if (status.includes('INATIVO') || status.includes('BAIXADO') || status.includes('REMOVIDO')) return false;
  return status.includes('ATIVO') || status === 'EM USO' || status === 'OK';
}

function matchesRegional(row, coordenacao, allowed = []) {
  const tokens = [coordenacao, ...allowed].map(norm).filter((item) => item.length >= 4);
  if (!tokens.length) return true;
  const hay = norm(`${row?.coordenacao || ''} ${row?.regional || ''} ${row?.supervisao || ''}`);
  return tokens.some((token) => hay.includes(token) || token.includes(hay));
}

async function fetchAll(makeQuery, pageSize = 1000, maxPages = 40) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function resolveUser() {
  const user = await getCurrentUser().catch(() => null);
  const [context, appUserRes] = await Promise.all([
    user?.id ? getUserContext(user.id).catch(() => null) : Promise.resolve(null),
    supabase
      .from('app_usuarios')
      .select('id,nome,email,setor,supervisao,coordenacao,empresa,status')
      .eq('auth_user_id', user?.id || '')
      .maybeSingle(),
  ]);
  const appUser = appUserRes?.data || null;
  const isMaster = isMasterContext(context);
  const coordenacao = appUser?.coordenacao || context?.coordenacao || context?.user?.coordenacao || '';
  const allowed = [
    ...parseList(appUser?.supervisao),
    ...parseList(context?.user?.supervisao),
    ...parseList(context?.user?.supervisoes),
    ...parseList(context?.supervisao),
    ...parseList(context?.supervisoes),
  ];
  return { user, context, appUser, isMaster, coordenacao, allowed };
}

async function buildFreshPayload(userInfo) {
  const now = new Date();
  const { ano, mes, dataIni, dataFim } = monthBounds(now);
  const diaAtual = now.getDate();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const dataHoje = `${ano}-${String(mes).padStart(2, '0')}-${String(diaAtual).padStart(2, '0')}`;
  const d7 = new Date(now); d7.setDate(d7.getDate() - 6);
  const dataD7 = `${d7.getFullYear()}-${String(d7.getMonth() + 1).padStart(2, '0')}-${String(d7.getDate()).padStart(2, '0')}`;

  const prodRowsAll = await fetchAll(() => supabase
    .from('producao_snapshot')
    .select('data,coordenacao,supervisao,tons')
    .gte('data', dataIni)
    .lt('data', dataFim)
    .order('data', { ascending: true }), 1000, 50);
  const prodRows = userInfo.isMaster ? prodRowsAll : prodRowsAll.filter((row) => matchesRegional(row, userInfo.coordenacao, userInfo.allowed));
  const produzido = prodRows.reduce((sum, row) => sum + Number(row.tons || 0), 0);

  const d7map = {};
  for (const row of prodRows) {
    const key = String(row.data || '').slice(0, 10);
    if (key >= dataD7 && key <= dataHoje) d7map[key] = (d7map[key] || 0) + Number(row.tons || 0);
  }
  const daily7 = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - index));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { date: key, tons: d7map[key] || 0 };
  });

  const { data: metasRows } = await supabase
    .from('metas_producao')
    .select('meta_tons,regional')
    .eq('ano', ano)
    .eq('mes', mes)
    .eq('ativo', true);
  const metas = Array.isArray(metasRows) ? metasRows : [];
  let meta = null;
  if (userInfo.isMaster) {
    meta = metas.reduce((sum, row) => sum + Number(row.meta_tons || 0), 0);
  } else {
    const hit = metas.find((row) => {
      const regional = norm(row.regional);
      const coord = norm(userInfo.coordenacao);
      return regional && coord && (regional === coord || regional.includes(coord) || coord.includes(regional));
    });
    meta = hit ? Number(hit.meta_tons || 0) : null;
  }

  const patrimonioRows = await fetchAll(() => supabase
    .from('patrimonios_snapshot')
    .select('situacao,status,situacao_patrimonio,coordenacao,regional,supervisao,dias_sem_leitura'), 1000, 30).catch(() => []);
  const patrimonioFiltered = patrimonioRows
    .filter(activePatrimonio)
    .filter((row) => userInfo.isMaster || matchesRegional(row, userInfo.coordenacao, userInfo.allowed));
  const totalPatrimonios = patrimonioFiltered.length;
  const atrasados = patrimonioFiltered.filter((row) => Number(row.dias_sem_leitura || 0) > 7).length;

  return {
    loading: false,
    coordenacao: userInfo.coordenacao,
    ano,
    mes,
    meta,
    produzido,
    daily7,
    mapaEstados: {},
    patrimonios: { total: totalPatrimonios, atrasados },
    cache_source: 'dashboard_live_fix',
    cache_atualizado_em: new Date().toISOString(),
  };
}

async function writeDashboardCache(userInfo, payload) {
  const { ano, mes } = payload;
  const ref = cacheReference({ isMaster: userInfo.isMaster, coordenacao: userInfo.coordenacao, ano, mes });
  payload.cache_ref = ref;
  clearLocalDashCache();
  await supabase.from('dashboard_cache').upsert({
    modulo: 'dashboard',
    referencia: ref,
    escopo: userInfo.isMaster ? 'master' : 'regional',
    ano,
    mes,
    dados_json: payload,
    origem_importacao: 'gestor_app_live_fix',
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'modulo,referencia' }).catch(() => null);
}

async function run() {
  try {
    const userInfo = await resolveUser();
    await sincronizarProducaoSnapshotDoAgente().catch(() => null);
    const payload = await buildFreshPayload(userInfo);
    await writeDashboardCache(userInfo, payload);
    window.__GESTOR_DASHBOARD_LIVE_FIX = { ok: true, payload };
  } catch (error) {
    console.warn('[gestor-dashboard-live-fix] falha ao preparar dashboard atualizado:', error);
    clearLocalDashCache();
    window.__GESTOR_DASHBOARD_LIVE_FIX = { ok: false, error: error?.message || String(error) };
  }
}

await run();
