(function(global){
  function digitsOnly(s){ return String(s||'').replace(/\D+/g,''); }
  function formatCPF(v){ const d=digitsOnly(v).slice(0,11); const p1=d.slice(0,3), p2=d.slice(3,6), p3=d.slice(6,9), p4=d.slice(9,11); let out=p1; if(p2) out+='.'+p2; if(p3) out+='.'+p3; if(p4) out+='-'+p4; return out; }
  function normalizeResp(data){ if(!data) return {ok:false,error:'Resposta vazia'}; if(data.ok===true && data.data && typeof data.data==='object') data = {...data.data, ok:true}; return data; }
  async function tryLogin(payloads){ let lastErr='Falha no login'; for(const payload of payloads){ try{ const data = normalizeResp(await global.API.post('/exec', payload)); if(data && data.ok===true) return data; lastErr = data.error || lastErr; }catch(e){ lastErr = e.message || lastErr; } } throw new Error(lastErr); }
  async function login({cpf,pin}){
    const payload = { cpf: digitsOnly(cpf), pin: String(pin||'').trim() };
    const data = await tryLogin([{ module:'auth', action:'login', payload },{ module:'despesas', action:'loginPIN', payload },{ action:'loginPIN', payload }]);
    const token = data.token || data.sessionToken || data.authToken || '';
    const role = String(data.role || data.perfil || data.tipo || 'gestor').toLowerCase();
    const profile = data.profile || data.user || data.usuario || {};
    if(!token) throw new Error('Login sem token');
    global.SESSION.setSession({ token, role, profile });
    if(global.AUTH && typeof global.AUTH.setAuth === 'function') global.AUTH.setAuth({ token, role, profile });
    return { ok:true, token, role, profile, ...data };
  }
  function logout(){ if(global.SESSION) global.SESSION.clearSession(); if(global.AUTH && typeof global.AUTH.clearAuthAndRedirect==='function') return global.AUTH.clearAuthAndRedirect(); location.href='/painel/login/'; }
  global.AUTH = global.AUTH || {}; global.AUTH.login = login; global.AUTH.logout = logout; global.AUTH.formatCPF = formatCPF;
})(window);