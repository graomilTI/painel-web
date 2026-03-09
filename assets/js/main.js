// ===== LOGIN =====
(async function(){
  if(location.pathname.endsWith("index.html") || location.pathname.endsWith("/")){
    const btn = document.getElementById("btnLogin");
    const pin = document.getElementById("pin");
    const cpf = document.getElementById("cpf");

    const go = (session) => {
      Auth.set(session);
      location.href = "gestor/app.html";
    };

    const onLogin = async () => {
      const PIN = (pin?.value || "").trim();
      const CPF = (cpf?.value || "").trim();
      try{
        setBusy(true);
        if(PIN){
          const r = await API.post("loginPIN", { pin: PIN });
          go({ token: r.token, nome: r.nome || "", perfil: r.perfil || "gestor", exp: Date.now() + SESSION_TTL_MS });
          return;
        }
        if(CPF){
          const r = await API.post("loginAdminCPF", { cpf: CPF });
          go({ token: r.token, nome: r.nome || "", perfil: r.perfil || "adm", exp: Date.now() + SESSION_TTL_MS });
          return;
        }
        toast("Informe um PIN ou CPF.", "warn");
      }catch(err){
        toast((err && err.message) || String(err), "err");
      }finally{ setBusy(false); }
    };

    btn?.addEventListener("click", onLogin);
    document.addEventListener("keydown", (e) => { if(e.key === "Enter") onLogin(); });

    return;
  }

  // ===== APP =====
  if(location.pathname.endsWith("gestor/app.html")){
    const s = Auth.require();
    document.getElementById("userName").textContent = s.nome ? s.nome : "Usuário";

    document.getElementById("btnLogout")?.addEventListener("click", () => {
      Auth.clear();
      location.href = "index.html";
    });

    // Rotas / módulos
    Router.register("/programacao", () => import("./modules/programacao/module.js"));
    Router.register("/contato", () => import("./modules/contato_cliente/module.js"));
    Router.register("/compras", () => import("./modules/compras/module.js"));
    Router.register("/relatorios", () => import("./modules/relatorios/module.js"));
    Router.register("/adm", () => import("./modules/adm/module.js"));

    Router.start();
  }
})();
