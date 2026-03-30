import { supabase } from "./supabaseClient.js";
import { loadUserContext } from "./authContext.js";

export async function protectPage() {
  const { data } = await supabase.auth.getSession();

  if (!data?.session) {
    window.location.href = "/painel/login.html";
    return;
  }

  try {
    await loadUserContext();
  } catch (err) {
    console.error("Erro contexto:", err);
    window.location.href = "/painel/login.html";
  }
}
