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

function ensureContextShape(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('Contexto do usuário não retornado pela RPC rpc_get_user_context.');
  }

  if (!context.user || !context.user.id) {
    throw new Error('A RPC rpc_get_user_context retornou um payload inválido.');
  }

  context.modules = Array.isArray(context.modules) ? context.modules : [];
  context.department = context.department || { name: null, code: null };
  context.user = {
    ...context.user,
    active: Boolean(context.user.active),
    is_master: Boolean(context.user.is_master),
  };

  return context;
}

export async function getUserContext() {
  const { data, error } = await supabase.rpc('rpc_get_user_context');
  if (error) throw error;

  const context = normalizeContextPayload(data);
  return ensureContextShape(context);
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
