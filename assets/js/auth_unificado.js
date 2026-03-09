/* =========================================================
 * auth_unificado.js — G1000 (blindado + fallback)
 * - LOGIN: nunca roda guard
 * - LOGIN/TESTE: AUTH.post permite action loginPIN/ping sem token
 * - Páginas protegidas: guard
 * - Fallback: se g1000_auth sumir mas g1000_token existir, mantém sessão
 * ========================================================= */
(function (global) {
  "use strict";

  const AUTH_KEY = "g1000_auth";
  const TOKEN_KEY = "g1000_token";

  function safeJSONParse_(v){ try { return JSON.parse(v); } catch(e){ return null; } }

  function getToken_(){
    const t = localStorage.getItem(TOKEN_KEY);
    return t ? String(t).trim() : "";
  }

  function getAuth_(){
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const a = safeJSONParse_(raw);
      if (a && a.token) return a;
    }
    // ✅ Fallback: token existe mas o auth sumiu (alguém removeu só g1000_auth)
    const t = getToken_();
    if (t) return { token: t };
    return null;
  }

  function setAuth_(auth){
    if (!auth || !auth.token) return;
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    localStorage.setItem(TOKEN_KEY, String(auth.token));
  }

  function loginUrl_(){
    const p = (location.pathname || "");
    return (p.includes("/gestor/") || p.includes("/adm/")) ? "../index.html" : "index.html";
  }

  function clearAuthAndRedirect_(){
    console.warn("[AUTH] Limpando sessão");
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(TOKEN_KEY);
    location.replace(loginUrl_());
  }

  function isLoginPage_(){
    const p = (location.pathname || "").toLowerCase();
    // GH Pages pode servir /painel-web/ sem index explícito
    return p.endsWith("/index.html") || p.endsWith("/painel-web/") || p === "/" || p.endsWith("/painel-web");
  }

  function isAuthExpiredResponse_(resp){
    const msg = String(resp && (resp.error || resp.message) || "").toLowerCase();
    return (
      msg.includes("token invál") ||
      msg.includes("token inval") ||
      (msg.includes("sess") && msg.includes("expir")) ||
      msg.includes("unauthorized") ||
      msg.includes("invalid token") ||
      msg.includes("session expired")
    );
  }

  // Guard somente em páginas protegidas
  (function guardOnce_(){
    if (isLoginPage_()) return;
    const auth = getAuth_();
    if (!auth || !auth.token) {
      console.warn("[AUTH GUARD] sem sessão");
      location.replace(loginUrl_());
    }
  })();

    async function post_(payload){
    const p = Object.assign({}, payload || {});
    const a = String(p.action || "").trim();

    // ✅ Ações que NÃO exigem token (login / teste de conexão)
    const isPublic =
      a === "loginPIN" ||
      a === "ping" ||
      a === "test" ||
      a === "health";

    const auth = getAuth_();

    // Se não for público, exige token e injeta no payload
    if (!isPublic) {
      if (!auth || !auth.token) {
        clearAuthAndRedirect_();
        return;
      }
      if (!p.token) p.token = auth.token;
    }

    const url = String(global.API_BASE || "").trim();
    if (!url) throw new Error("API_BASE não configurado");

    let txt = "";
    try{
      const r = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(p)
      });
      txt = await r.text();
    }catch(e){
      console.error("[AUTH.post] erro de rede", e);
      throw e;
    }

    const data = safeJSONParse_(txt) || {};
    const out = (data && data.ok === true && data.data != null) ? data.data : data;

    // Expiração só faz sentido em chamadas autenticadas
    if (!isPublic && out && out.ok === false && isAuthExpiredResponse_(out)) {
      clearAuthAndRedirect_();
      return;
    }

    // ✅ Auto-regrava auth se ele estiver faltando mas token existir
    if (!isPublic && auth && auth.token && !localStorage.getItem(AUTH_KEY)) {
      try { setAuth_(auth); } catch(e){}
    }

    return data;
  }

  global.AUTH = global.AUTH || {};
  global.AUTH.getAuth = getAuth_;
  global.AUTH.setAuth = setAuth_;
  global.AUTH.clearAuthAndRedirect = clearAuthAndRedirect_;
  global.AUTH.isAuthExpiredResponse = isAuthExpiredResponse_;
  global.AUTH.post = post_;
})(window);
