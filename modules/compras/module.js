(function(){
  const MOD = "compras";
  const KEY = MOD.toUpperCase();

  function el(html){
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function openHome(container, opts){
    const { auth, api } = opts || {};
    container.innerHTML = "";
    const card = el(`
      <div>
        <div class="notice">
          Módulo <span class="mono">$compras</span> carregado.
        </div>
        <div style="height:12px"></div>
        <div class="grid cols-2">
          <div class="card">
            <div class="hd"><h3 style="margin:0">Ações</h3><div class="small">Exemplo de chamada</div></div>
            <div class="bd">
              <button class="btn primary" id="btnPing">Ping API</button>
              <div id="out" style="margin-top:10px"></div>
            </div>
          </div>
          <div class="card">
            <div class="hd"><h3 style="margin:0">Contexto</h3></div>
            <div class="bd">
              <div class="small">role: <span class="mono">${auth?.role||""}</span></div>
              <div class="small">token: <span class="mono">${(auth?.token||"").slice(0,12)}…</span></div>
            </div>
          </div>
        </div>
      </div>
    `);

    container.appendChild(card);

    const out = card.querySelector("#out");
    card.querySelector("#btnPing").addEventListener("click", async ()=>{
      out.innerHTML = '<div class="small">carregando…</div>';
      try{
        const data = await api.get("/health");
        out.innerHTML = '<div class="notice"><span class="mono">'+JSON.stringify(data)+'</span></div>';
      }catch(e){
        out.innerHTML = '<div class="notice err">Erro: '+(e.message||e)+'</div>';
      }
    });
  }

  window[KEY] = { openHome };
})();
