(function(global){
  function getAuth(){ const token = (global.SESSION && global.SESSION.token && global.SESSION.token()) || localStorage.getItem('g1000_token') || ''; return token ? { token, role: (global.SESSION&&global.SESSION.role&&global.SESSION.role()) || localStorage.getItem('g1000_perfil') || '', profile: (global.SESSION&&global.SESSION.profile&&global.SESSION.profile()) || {} } : null; }
  function setAuth(auth){ if(!auth || !auth.token) return; if(global.SESSION && global.SESSION.setSession) global.SESSION.setSession({ token: auth.token, role: auth.role || '', profile: auth.profile || {} }); }
  function clearAuthAndRedirect(){ if(global.SESSION && global.SESSION.clearSession) global.SESSION.clearSession(); location.href='/painel/login/'; }
  async function post(payload){ payload = payload || {}; if(!payload.token){ const auth=getAuth(); if(auth && auth.token) payload.token = auth.token; } return global.API.post('/exec', payload); }
  global.AUTH = global.AUTH || {}; global.AUTH.getAuth = getAuth; global.AUTH.setAuth = setAuth; global.AUTH.clearAuthAndRedirect = clearAuthAndRedirect; global.AUTH.post = post;
})(window);