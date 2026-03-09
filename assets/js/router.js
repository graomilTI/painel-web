(function(){
  function loadScriptOnce(src){
    return new Promise((resolve, reject)=>{
      if(document.querySelector('script[data-src="'+src+'"]')) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.src = src;
      s.onload = resolve;
      s.onerror = ()=>reject(new Error("Falha ao carregar " + src));
      document.head.appendChild(s);
    });
  }

  async function openModule(modName, container, opts){
    const src = "/painel/modules/" + modName + "/module.js";
    await loadScriptOnce(src);

    const modKey = modName.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const mod = window[modKey] || window[modName.toUpperCase()] || (window.ADM_MODULES && window.ADM_MODULES[modName]);
    if(!mod) throw new Error("Módulo não encontrado: " + modName);

    if(mod.openHome) return mod.openHome(container, opts);
    if(mod.mount) return mod.mount(container, opts);
    throw new Error("Módulo sem openHome/mount: " + modName);
  }

  window.APP_ROUTER = { openModule };
})();
