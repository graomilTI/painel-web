
// admin-usuarios.js (corrigido com Bearer token)

async function getAccessToken() {
  if (window.supabase && window.supabase.auth?.getSession) {
    const { data } = await window.supabase.auth.getSession();
    return data?.session?.access_token || null;
  }
  return localStorage.getItem("access_token");
}

async function apiFetch(url, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada");

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Erro");

  return data;
}

// exemplo uso
async function loadModules() {
  const data = await apiFetch("/api/admin/users/modulos");
  console.log(data);
}
