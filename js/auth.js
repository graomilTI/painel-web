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

export async function getUserContext(userId) {
  const { data, error } = await supabase.rpc('get_user_context', { p_user_id: userId });
  if (error) throw error;

  const context = normalizeContextPayload(data);
  if (!context) {
    throw new Error('Contexto do usuário não retornado pela RPC get_user_context.');
  }
  return context;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
