(function(){
  const KEY = "VISITA_CLIENTE";
  function fitFrame(iframe){
    function resize(){
      try{
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if(!doc) return;
        const h = Math.max(
          doc.body ? doc.body.scrollHeight : 0,
          doc.documentElement ? doc.documentElement.scrollHeight : 0,
          720
        );
        iframe.style.height = h + "px";
      }catch(_ ){}
    }
    iframe.addEventListener("load", ()=>{
      resize();
      setTimeout(resize, 300);
      setTimeout(resize, 1000);
      try{ iframe.contentWindow.addEventListener("resize", resize); }catch(_ ){}
    });
  }

  function openHome(container){
    container.innerHTML = `
      <div>
        <div class="notice">Visita Cliente restaurada a partir do módulo legado de clientes.</div>
        <div style="height:12px"></div>
        <iframe id="modframe" src="/painel/gestor/clientes.html" style="width:100%;min-height:720px;border:0;border-radius:18px;background:transparent"></iframe>
      </div>
    `;
    fitFrame(container.querySelector('#modframe'));
  }

  window[KEY] = { openHome };
})();
