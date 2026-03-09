(function(){
  const KEY = "G1000_TOKEN";
  const ROLE_KEY = "G1000_ROLE";
  const PROFILE_KEY = "G1000_PROFILE";
  const LEGACY_AUTH_KEY = "g1000_auth";
  const LEGACY_TOKEN_KEY = "g1000_token";

  function setSession({token, role, profile}){
    if(token) localStorage.setItem(KEY, token);
    if(role) localStorage.setItem(ROLE_KEY, role);
    if(profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

    if(token){
      localStorage.setItem(LEGACY_TOKEN_KEY, token);
      const legacy = {
        token,
        exp: Date.now() + (1000 * 60 * 60 * 12),
        nome: (profile && (profile.nome || profile.Nome || profile.user)) || "Usuário",
        role: role || "gestor",
        profile: profile || {}
      };
      localStorage.setItem(LEGACY_AUTH_KEY, JSON.stringify(legacy));
    }
  }

  function clearSession(){
    localStorage.removeItem(KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(LEGACY_AUTH_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  function token(){ return localStorage.getItem(KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || ""; }
  function role(){ return localStorage.getItem(ROLE_KEY) || ""; }
  function profile(){
    try{ return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"); }catch(_){ return {}; }
  }

  function requireAuth(){
    if(!token()){
      const next = encodeURIComponent(location.pathname + location.search + location.hash);
      location.href = "/painel/login/?next=" + next;
      return false;
    }
    return true;
  }

  window.SESSION = { setSession, clearSession, token, role, profile, requireAuth };
})();
