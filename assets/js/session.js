(function(global){
  const KEY='G1000_TOKEN', ROLE_KEY='G1000_ROLE', PROFILE_KEY='G1000_PROFILE';
  function getCompatToken(){ return localStorage.getItem(KEY) || localStorage.getItem('g1000_token') || ''; }
  function getCompatRole(){ return localStorage.getItem(ROLE_KEY) || localStorage.getItem('g1000_perfil') || ''; }
  function setSession({token, role, profile}){
    if(token){ localStorage.setItem(KEY, token); localStorage.setItem('g1000_token', token); }
    if(role){ localStorage.setItem(ROLE_KEY, role); localStorage.setItem('g1000_perfil', role); }
    if(profile){ const raw = JSON.stringify(profile); localStorage.setItem(PROFILE_KEY, raw); localStorage.setItem('g1000_profile', raw); localStorage.setItem('g1000_auth', JSON.stringify({token:getCompatToken()||token, role: role || getCompatRole() || '', profile})); }
  }
  function clearSession(){ [KEY,ROLE_KEY,PROFILE_KEY,'g1000_token','g1000_perfil','g1000_profile','g1000_auth'].forEach(k=>localStorage.removeItem(k)); }
  function token(){ return getCompatToken(); }
  function role(){ return getCompatRole(); }
  function profile(){
    const cands=[localStorage.getItem(PROFILE_KEY), localStorage.getItem('g1000_profile'), localStorage.getItem('g1000_auth')];
    for(const raw of cands){ if(!raw) continue; try{ const obj=JSON.parse(raw); if(obj && obj.profile) return obj.profile; if(obj && typeof obj==='object') return obj; }catch(_){} }
    return {};
  }
  function requireAuth(){ if(token()) return true; const next=encodeURIComponent(location.pathname+location.search+location.hash); location.href='/painel/login/?next='+next; return false; }
  global.SESSION={setSession,clearSession,token,role,profile,requireAuth};
})(window);