(function(){
  const KEY = "G1000_TOKEN";
  const ROLE_KEY = "G1000_ROLE";

  function setSession({token, role, profile}){
    if(token) localStorage.setItem(KEY, token);
    if(role) localStorage.setItem(ROLE_KEY, role);
    if(profile) localStorage.setItem("G1000_PROFILE", JSON.stringify(profile));
  }

  function clearSession(){
    localStorage.removeItem(KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem("G1000_PROFILE");
  }

  function token(){ return localStorage.getItem(KEY) || ""; }
  function role(){ return localStorage.getItem(ROLE_KEY) || ""; }
  function profile(){
    try{ return JSON.parse(localStorage.getItem("G1000_PROFILE") || "{}"); }catch(_){ return {}; }
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
