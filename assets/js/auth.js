import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

const CTX_CACHE_KEY = 'grao1000:user-ctx:v1';
const CTX_CACHE_TTL = 1000 * 60 * 5;

function withTimeout(promise, ms, fallback = null) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function withRejectTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export async function signOut() {
  logActivity('logout', 'Logout realizado', 'auth', null);
  try { sessionStorage.removeItem(CTX_CACHE_KEY); } catch {}
  const { error } = await withRejectTimeout(
    supabase.auth.signOut(),
    6000,
    'Tempo excedido ao sair do sistema.'
  );
  if (error) throw error;
}

export async function getSession() {
  // Timeout não significa sessão encerrada. Em reload/F5 o Supabase pode estar
  // restaurando o token persistido ou aguardando o lock interno de refresh; se
  // tratarmos essa demora como `session: null`, o authGuard apaga o contexto e
  // manda o colaborador para o login indevidamente.
  //
  // Quando o Supabase responde normalmente, porém ainda sem sessão, fazemos
  // tentativas rápidas para cobrir a pequena janela de reidratação. Um timeout
  // real é propagado como erro temporário e NÃO como logout.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await withRejectTimeout(
      supabase.auth.getSession(),
      5000,
      'Tempo excedido ao restaurar a sessão do usuário.'
    );
    const { data, error } = result || { data: { session: null }, error: null };
    if (error) throw error;

    const session = data?.session || null;
    if (session?.user) return session;

    if (attempt < 3) await wait(150 * attempt);
  }

  // Só retorna null depois que o próprio Supabase respondeu, em todas as
  // tentativas, que não existe uma sessão restaurável.
  return null;
}

// Evita que qualquer tela fique em branco aguardando indefinidamente uma chamada
// de auth. O contexto do usuário já foi validado no boot por requireAuth(); para
// renderizações internas, o usuário da sessão local é suficiente e não depende de
// ida à rede. Se a sessão ainda não estiver pronta, cai para getUser() com timeout.
let currentUserInflight = null;

export async function getCurrentUser() {
  try {
    const sessionUser = await withTimeout(
      supabase.auth.getSession().then(({ data, error }) => {
        if (error) throw error;
        return data?.session?.user || null;
      }),
      1500,
      null,
    );
    if (sessionUser) return sessionUser;
  } catch (error) {
    console.warn('[auth] getSession indisponível, tentando getUser:', error);
  }

  if (currentUserInflight) return currentUserInflight;
  currentUserInflight = withTimeout(
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) throw error;
      return data?.user || null;
    }),
    5000,
    null,
  ).finally(() => { currentUserInflight = null; });
  return currentUserInflight;
}

function normalizeContextPayload(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = normalizeLower(value);
  return ['1', 'true', 't', 'yes', 'y', 'sim', 's'].includes(normalized);
}

function normalizeActiveStatus(context) {
  const candidates = [
    context?.user?.active,
    context?.user?.ativo,
    context?.user?.status,
    context?.active,
    context?.ativo,
    context?.status,
  ];

  for (const value of candidates) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;

    const normalized = normalizeLower(value);
    if (!normalized) continue;

    if (['ativo', 'active', '1', 'true', 't', 'yes', 'sim'].includes(normalized)) return true;
    if (['inativo', 'inactive', '0', 'false', 'f', 'no', 'nao', 'não'].includes(normalized)) return false;
  }

  return false;
}

function normalizeModule(module) {
  return {
    code: normalizeLower(module?.code ?? module?.codigo ?? module?.modulo_codigo),
    name: normalizeString(module?.name ?? module?.nome ?? module?.modulo_nome),
    route: normalizeString(module?.route ?? module?.rota ?? module?.modulo_rota),
    icon: normalizeString(module?.icon ?? module?.icone ?? module?.modulo_icone),
    category: normalizeLower(module?.category ?? module?.categoria ?? module?.modulo_categoria),
    order: Number(module?.order ?? module?.ordem ?? module?.modulo_ordem ?? 0) || 0,
    can_view: normalizeBoolean(module?.can_view ?? module?.pode_ver ?? true),
    can_create: normalizeBoolean(module?.can_create ?? module?.pode_criar),
    can_edit: normalizeBoolean(module?.can_edit ?? module?.pode_editar),
    can_delete: normalizeBoolean(module?.can_delete ?? module?.pode_excluir),
    can_approve: normalizeBoolean(module?.can_approve ?? module?.pode_aprovar),
  };
}

function ensureContextShape(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('Contexto do usuário não retornado pela RPC rpc_get_user_context.');
  }

  const role = normalizeString(
    context?.user?.role ??
    context?.perfil_nome ??
    context?.perfil_codigo ??
    context?.role
  );

  const departmentName = normalizeString(
    context?.department?.name ??
    context?.department_name ??
    context?.setor ??
    context?.user?.department
  );

  const departmentCode = normalizeLower(
    context?.department?.code ??
    context?.department_code ??
    context?.setor_codigo ??
    departmentName
  );

  const userId = normalizeString(
    context?.user?.id ??
    context?.usuario_id ??
    context?.id
  );

  if (!userId) {
    throw new Error('A RPC rpc_get_user_context retornou um payload inválido.');
  }

  const active = normalizeActiveStatus(context);
  const isMaster = normalizeBoolean(context?.user?.is_master ?? context?.is_master) || normalizeLower(role) === 'master';

  const modules = Array.isArray(context?.modules)
    ? context.modules.map(normalizeModule).filter((module) => module.code)
    : [];

  return {
    ...context,
    department: {
      name: departmentName || null,
      code: departmentCode || null,
    },
    user: {
      ...(context?.user && typeof context.user === 'object' ? context.user : {}),
      id: userId,
      name: normalizeString(context?.user?.name ?? context?.nome),
      email: normalizeString(context?.user?.email ?? context?.email),
      role: role || null,
      setor: normalizeString(context?.user?.setor ?? context?.setor),
      empresa: normalizeString(context?.user?.empresa ?? context?.empresa),
      coordenacao: normalizeString(context?.user?.coordenacao ?? context?.coordenacao),
      supervisao: normalizeString(context?.user?.supervisao ?? context?.supervisao),
      supervisoes: Array.isArray(context?.user?.supervisoes) ? context.user.supervisoes : (Array.isArray(context?.supervisoes) ? context.supervisoes : []),
      status: active ? 'ativo' : 'inativo',
      active,
      is_master: isMaster,
    },
    modules,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Logo após um login/redirect (ex: login.html -> dashboard.html), o cliente
// Supabase é recriado do zero na página nova e pode levar um instante pra
// reidratar a sessão internamente antes que .rpc() anexe o header de auth —
// nessa janela a RPC roda como anônima e volta vazia (não é erro de rede).
// Tenta de novo algumas vezes antes de desistir, em vez de derrubar a sessão.
async function fetchUserContextRaw(attempt = 1) {
  const { data, error } = await withRejectTimeout(
    supabase.rpc('rpc_get_user_context'),
    9000,
    'Tempo excedido ao carregar permissões do usuário.'
  );
  if (error) throw error;

  const raw = normalizeContextPayload(data);
  if (!raw && attempt < 3) {
    await wait(300 * attempt);
    return fetchUserContextRaw(attempt + 1);
  }
  return raw;
}

export async function getUserContext(_userId) {
  try {
    const cached = sessionStorage.getItem(CTX_CACHE_KEY);
    if (cached) {
      const { ts, raw } = JSON.parse(cached);
      if (Date.now() - ts < CTX_CACHE_TTL) return ensureContextShape(raw);
    }
  } catch {}

  const raw = await fetchUserContextRaw();
  try { sessionStorage.setItem(CTX_CACHE_KEY, JSON.stringify({ ts: Date.now(), raw })); } catch {}

  return ensureContextShape(raw);
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
