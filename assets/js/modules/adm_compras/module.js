// assets/js/modules/adm_compras/module.js
// Wrapper compatível com adm.js (loader por módulos)
//
// Carrega o módulo real de Compras (assets/js/modules/compras.js)
// e delega para: window.COMPRAS.openHome(container, opts)

(function () {
  "use strict";

  const MOD = (window.ADM_MODULES = window.ADM_MODULES || {});
  const NAME = "compras";

  function loadScriptOnce_(src) {
    return new Promise((resolve, reject) => {
      const exist = document.querySelector('script[data-src="' + src + '"]');
      if (exist) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.defer = true;
      s.setAttribute("data-src", src);
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar: " + src));
      document.head.appendChild(s);
    });
  }

  MOD[NAME] = MOD[NAME] || {};
  MOD[NAME].mount = async function (container, opts) {
    const v = Date.now();
    await loadScriptOnce_("../assets/js/modules/compras.js?v=" + v);
    if (!window.COMPRAS || typeof window.COMPRAS.openHome !== "function") {
      throw new Error("COMPRAS.openHome não encontrado após carregar compras.js");
    }
    return window.COMPRAS.openHome(container, opts || {});
  };
})();
