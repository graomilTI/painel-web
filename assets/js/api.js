/* =========================================================
 * api.js — compat (blindado)
 * - Mantém window.API.post para o app
 * - Usa AUTH.post do auth_unificado.js
 *
 * ✅ Novo padrão: API.post({ module, action, token, payload })
 * ✅ Legado:     API.post(action, body)
 *    - action: string
 *    - body: objeto (ex.: { token, ... })
 *    - será enviado como { action, ...body }
 * ========================================================= */
(function(global){
  "use strict";
  const API = global.API || (global.API = {});

  API.post = async function(arg1, arg2){
    if (!global.AUTH || typeof global.AUTH.post !== "function") {
      throw new Error("AUTH.post não disponível (carregue auth_unificado.js nas páginas protegidas)");
    }

    // Compat: API.post(action, body)
    let payload;
    if (typeof arg1 === "string") {
      payload = Object.assign({ action: arg1 }, (arg2 && typeof arg2 === "object") ? arg2 : {});
    } else {
      payload = arg1 || {};
    }

    return await global.AUTH.post(payload);
  };
})(window);
