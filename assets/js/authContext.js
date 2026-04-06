import { supabase } from "./supabaseClient.js";

let USER_CONTEXT = null;

function normalizeContextPayload(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

export async function loadUserContext() {
  const { data, error } = await supabase.rpc("rpc_get_user_context");

  if (error) {
    console.error("Erro ao carregar contexto:", error);
    throw error;
  }

  const context = normalizeContextPayload(data);
  if (!context?.user?.id) {
    throw new Error("Erro ao carregar contexto do usuário autenticado.");
  }

  USER_CONTEXT = {
    ...context,
    modules: Array.isArray(context.modules) ? context.modules : [],
  };
  return USER_CONTEXT;
}

export function getUserContext() {
  return USER_CONTEXT;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/painel/login.html";
}
