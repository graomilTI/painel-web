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

function normalizeModule(module) {
  return {
    code: String(module?.code || '').toLowerCase().trim(),
    name: module?.name || module?.code || '',
    route: module?.route || '',
    icon: module?.icon || '',
    category: String(module?.category || '').toLowerCase().trim(),
    order: Number(module?.order || 0),
    can_view: !!module?.can_view,
    can_create: !!module?.can_create,
    can_edit: !!module?.can_edit,
    can_delete: !!module?.can_delete,
    can_approve: !!module?.can_approve,
  };
}

function normalizeRpcUserContext(payload) {
  const data = normalizeContextPayload(payload);
  if (!data) return null;

  const modules = Array.isArray(data.modules)
    ? data.modules.map(normalizeModule)
    : [];

  const role = data.perfil_codigo || data.perfil_nome || data.role || '';
  const roleNormalized = String(role || '').trim();

  return {
    user: {
      id: data.auth_user_id || data.usuario_id || null,
      app_user_id: data.usuario_id || null,
      name: data.nome || data.name || '',
      email: data.email || '',
      role: roleNormalized,
      active: String(data.status || '').toLowerCase() === 'ativo' || data.active === true,
      is_master: roleNormalized.toLowerCase() === 'master',
    },
    department: {
      name: data.setor || data.department || '',
    },
    modules,
  };
}

export async function getUserContext(_userId) {
  const { data, error } = await supabase.rpc('rpc_get_user_context');
  if (error) throw error;

  const context = normalizeRpcUserContext(data);
  if (!context) {
    throw new Error('Contexto do usuário não retornado pela RPC rpc_get_user_context.');
  }
  return context;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
