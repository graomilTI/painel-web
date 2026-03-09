// assets/js/modules/adm_frotas/module.js
// Wrapper compatível com adm.js
//
// O dashboard de Frotas vive dentro do módulo Diretoria.
// Esse wrapper existe para o card "Frotas" do ADM abrir direto o painel.

(function () {
  "use strict";

  const MOD = (window.ADM_MODULES = window.ADM_MODULES || {});
  const NAME = "frotas";

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
    await loadScriptOnce_("../assets/js/diretoria.js?v=" + v);
    if (!window.DIRETORIA || typeof window.DIRETORIA.openHome !== "function") {
      throw new Error("DIRETORIA.openHome não encontrado após carregar diretoria.js");
    }
    const o = Object.assign({}, opts || {}, { startTab: "frotas" });
    return window.DIRETORIA.openHome(container, o);
  };
})();
