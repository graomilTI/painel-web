(function(){
  function digitsOnly(s){ return (s||"").replace(/\D+/g,""); }

  function formatCPF(v){
    const d = digitsOnly(v).slice(0,11);
    const p1 = d.slice(0,3), p2=d.slice(3,6), p3=d.slice(6,9), p4=d.slice(9,11);
    let out = p1;
    if(p2) out += "."+p2;
    if(p3) out += "."+p3;
    if(p4) out += "-"+p4;
    return out;
  }

  async function login({cpf, pin}){
    const body = { cpf: digitsOnly(cpf), pin: String(pin||"") };
    const data = await window.API.post("/exec", { module:"auth", action:"login", payload: body });
    if(!data || data.ok !== true) throw new Error((data && data.error) || "Login inválido");
    const role = (data.role || data.user?.role || "gestor");
    const profile = data.profile || data.user || {};
    window.SESSION.setSession({ token: data.token, role, profile });
    return data;
  }

  function logout(){
    window.SESSION.clearSession();
    location.href = "/painel/login/";
  }

  window.AUTH = { login, logout, formatCPF };
})();
