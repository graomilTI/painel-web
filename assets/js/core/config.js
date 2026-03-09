// ✅ Endpoint do seu Worker (Cloudflare) OU GAS (fallback)
const API_BASE_DEFAULT = "https://blue-brook-0f9b.tecnologia-f0c.workers.dev/";

// Você pode sobrescrever via URL:
//   https://seu-site/gestor/compras.html?api=https://...workers.dev
//   (ou mantém compat com ?gas=... antigo)
const API_BASE = (function(){
  try{
    const qs = new URLSearchParams(location.search);

    const api = (qs.get("api") || "").trim();
    if (api) return api;

    const gas = (qs.get("gas") || "").trim();
    if (gas) return gas;

    return API_BASE_DEFAULT;
  }catch(_){
    return API_BASE_DEFAULT;
  }
})();

// tempo de sessão local (ms)
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

// ✅ Compatibilidade: alguns arquivos usam GAS_EXEC, outros usam API_BASE
window.API_BASE = API_BASE;
window.GAS_EXEC  = API_BASE;
window.SESSION_TTL_MS = SESSION_TTL_MS;
