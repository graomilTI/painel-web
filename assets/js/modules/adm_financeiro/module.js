// assets/js/modules/adm_financeiro/module.js
// Wrapper compatível com adm.js
// - Carrega o módulo real: assets/js/modules/financeiro.js
// - Delegação: window.FINANCEIRO.openHome(container, opts)

(function () {
  "use strict";

  const MOD = (window.ADM_MODULES = window.ADM_MODULES || {});
  const NAME = "financeiro";

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
    await loadScriptOnce_("../assets/js/modules/financeiro.js?v=" + v);
    if (!window.FINANCEIRO || typeof window.FINANCEIRO.openHome !== "function") {
      throw new Error("FINANCEIRO.openHome não encontrado após carregar financeiro.js");
    }
    return window.FINANCEIRO.openHome(container, opts || {});
  };
})();
