const Auth = {
  get() {
    try{
      const raw = localStorage.getItem("g1000_auth");
      if(!raw) return null;
      const data = JSON.parse(raw);
      if(!data?.token || !data?.exp) return null;
      if(Date.now() > data.exp) return null;
      return data;
    }catch(_){ return null; }
  },
  set(session){
    localStorage.setItem("g1000_auth", JSON.stringify(session));
  },
  clear(){ localStorage.removeItem("g1000_auth"); },
  require(){
    const s = this.get();
    if(!s){ location.href = "index.html"; }
    return s;
  }
};
window.Auth = Auth;

// === PATCH v7 (Hospedagem): pré-carregar contexto no login do Gestor ===
// Cole estas funções no final do assets/js/core/auth.js (ou dentro do IIFE do Auth),
// e chame Auth.preloadContext() logo após login OK (quando você já salvou o token).

(function(){
  if(!window.Auth) return;

  // Evita estourar caso já exista
  if(typeof window.Auth.preloadContext === "function") return;

  window.Auth.preloadContext = function(){
    try{
      var a = window.Auth.get ? window.Auth.get() : null;
      var token = a && a.token ? String(a.token).trim() : "";
      if(!token || !window.API || typeof window.API.post !== "function") return Promise.resolve(false);

      return window.API.post({ module:"despesas", action:"getDataPadrao", token: token })
        .then(function(r1){
          var dmy = (r1 && (r1.data || r1.dataRef || r1.dataPadrao)) ? String(r1.data || r1.dataRef || r1.dataPadrao).trim() : "";
          if(!dmy) throw new Error("Sem data padrão");
          return window.API.post({ module:"despesas", action:"carregarContexto", token: token, dataRef: dmy });
        })
        .then(function(ctx){
          try{
            // tenta extrair nomes para reutilizar em hospedagem/qualquer módulo
            var base = (ctx && ctx.contexto && ctx.contexto.liberados) ? ctx.contexto.liberados
                     : (ctx && ctx.liberados) ? ctx.liberados
                     : (ctx && ctx.data && ctx.data.liberados) ? ctx.data.liberados
                     : [];
            var nomes = (Array.isArray(base) ? base : []).map(function(o){
              return String(o && (o.Colaborador || o.NOME || o.nome || o.Nome) || "").trim();
            }).filter(Boolean);
            var set = {};
            nomes.forEach(function(n){ set[n]=true; });
            var unique = Object.keys(set);
            localStorage.setItem("g1000_colaboradores_ctx", JSON.stringify(unique));
          }catch(e){}
          return true;
        })
        .catch(function(){ return false; });
    }catch(e){
      return Promise.resolve(false);
    }
  };
})();
