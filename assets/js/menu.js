
(function(){
  if(!window.Auth?.requireAuth?.()) return;

  const el = {
    userNome: document.getElementById("userNome"),
    userCoord: document.getElementById("userCoord"),
    userWhats: document.getElementById("userWhats"),
    btnLogout: document.getElementById("btnLogout"),
    btnLogoutTop: document.getElementById("btnLogoutTop"),
    btnTestApi: document.getElementById("btnTestApi"),
    apiBadge: document.getElementById("apiBadge"),
    navTabs: document.getElementById("navTabs"),
    frame: document.getElementById("moduleFrame")
  };

  const routes = {
    home: "home.html",
    programacao: "programacao.html",
    clientes: "clientes.html",
    compras: "compras.html",
    relatorios: "auditoria.html", // por enquanto
    gps: "gps.html"
  };

  function setBadge(text, ok){
    if(!el.apiBadge) return;
    el.apiBadge.textContent = text;
    el.apiBadge.style.borderColor = ok ? "rgba(34,197,94,.45)" : "rgba(239,68,68,.35)";
    el.apiBadge.style.background = ok ? "rgba(34,197,94,.14)" : "rgba(239,68,68,.12)";
    el.apiBadge.style.color = "rgba(255,255,255,.85)";
  }

  function fillUser(){
    const u = window.Auth.getUser?.() || {};
    if(el.userNome) el.userNome.textContent = u.nome || u.Nome || "—";
    if(el.userCoord) el.userCoord.textContent = u.coordenacao || u.Coordenação || u.Coordenacao || "—";
    if(el.userWhats) el.userWhats.textContent = u.whatsapp || u.WhatsApp || u.whats || "—";
  }

  function setActive(route){
    if(!el.navTabs) return;
    el.navTabs.querySelectorAll(".tab").forEach(t=>{
      t.classList.toggle("active", t.getAttribute("data-route") === route);
    });
  }

  function go(route){
    if(!routes[route]) route = "home";
    setActive(route);
    if(el.frame){
      el.frame.src = routes[route];
    }
    // mantém hash do app
    window.location.hash = "#" + route;
  }

  async function testApi(){
    try{
      await apiPing();
      setBadge("API: OK", true);
    }catch(e){
      console.error(e);
      setBadge("API: Falha", false);
      alert("Falha na conexão: " + (e.message || e));
    }
  }

  function bind(){
    el.btnLogout?.addEventListener("click", ()=>window.Auth.logout());
    el.btnLogoutTop?.addEventListener("click", ()=>window.Auth.logout());
    el.btnTestApi?.addEventListener("click", testApi);

    el.navTabs?.addEventListener("click", (ev)=>{
      const tab = ev.target.closest(".tab");
      if(!tab) return;
      go(tab.getAttribute("data-route"));
    });

    // receber navegação do iframe home
    window.addEventListener("message", (ev)=>{
      const data = ev.data || {};
      if(data.type === "nav" && data.route) go(data.route);
    });
  }

  fillUser();
  bind();

  // rota inicial
  const initial = (window.location.hash || "#home").replace("#","");
  go(initial || "home");
})();
