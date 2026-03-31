import { toPanelUrl } from "./paths.js";
import { supabase } from "./supabaseClient.js";

let USER_CONTEXT = null;

export async function loadUserContext() {
  const { data, error } = await supabase.rpc("rpc_get_user_context");

  if (error) {
    console.error("Erro ao carregar contexto:", error);
    throw error;
  }

  if (!data?.ok) {
    throw new Error(data?.error || "Erro ao carregar contexto");
  }

  USER_CONTEXT = data;
  return USER_CONTEXT;
}

export function getUserContext() {
  return USER_CONTEXT;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = toPanelUrl("login.html");
}
