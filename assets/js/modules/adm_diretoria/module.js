// assets/js/modules/adm_diretoria/module.js
// Wrapper compatível com adm.js (loader por módulos)
//
// Objetivo:
// - Garantir que o dashboard Diretoria carregue SEM cache (GitHub Pages costuma cachear)
// - Delegar UI para assets/js/diretoria.js (módulo global window.DIRETORIA)

(function () {
  "use strict";

  const MOD = (window.ADM_MODULES = window.ADM_MODULES || {});
  const NAME = "diretoria";

  function loadScriptOnce_(src) {
    return new Promise((resolve, reject) => {
      // já carregou?
      const exist = document.querySelector('script[data-src="' + src + '"]');
      if (exist) return resolve();

      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.defer = true;
      s.setAttribute("data-src", src);
      s.onload = () => resolve();
      s.onerror = (e) => reject(new Error("Falha ao carregar: " + src));
      document.head.appendChild(s);
    });
  }

  MOD[NAME] = MOD[NAME] || {};
  MOD[NAME].mount = async function (container, opts) {
    // cache bust sempre
    const v = Date.now();
    const src = "../assets/js/diretoria.js?v=" + v;

    await loadScriptOnce_(src);

    if (!window.DIRETORIA || typeof window.DIRETORIA.openHome !== "function") {
      throw new Error("DIRETORIA.openHome não encontrado após carregar diretoria.js");
    }
    return window.DIRETORIA.openHome(container, opts || {});
  };
})();
