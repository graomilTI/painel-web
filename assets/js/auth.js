import { supabase } from './supabaseClient.js';

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
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

export async function getUserContext(_userId) {
  const { data, error } = await supabase.rpc('rpc_get_user_context');
  if (error) throw error;

  const context = normalizeContextPayload(data);
  return ensureContextShape(context);
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
