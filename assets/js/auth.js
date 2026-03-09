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

  function normalizeRole(data){
    return String(
      (data && (data.role || data.tipo || data.type)) ||
      (data && data.user && (data.user.role || data.user.tipo || data.user.type)) ||
      "GESTOR"
    ).toLowerCase();
  }

  function normalizeProfile(data){
    if(data && data.profile && typeof data.profile === "object") return data.profile;
    if(data && data.user && typeof data.user === "object") return data.user;
    return {
      nome: (data && data.nome) || "",
      coord: (data && data.coord) || (data && data.coordenacao) || "",
      supervisoesLiberadas: (data && data.supervisoes_liberadas) || []
    };
  }

  async function login({cpf, pin}){
    const body = { cpf: digitsOnly(cpf), pin: String(pin||"") };
    const data = await window.API.post("/exec", { module:"despesas", action:"login", payload: body });
    if(!data || data.ok !== true) throw new Error((data && data.error) || "Login inválido");

    window.SESSION.setSession({
      token: data.token,
      role: normalizeRole(data),
      profile: normalizeProfile(data)
    });

    return data;
  }

  function logout(){
    window.SESSION.clearSession();
    location.href = "/painel/login/";
  }

  window.AUTH = { login, logout, formatCPF };
})();
