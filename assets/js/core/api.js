/**
 * assets/js/core/api.js
 * API client do Painel Web (browser)
 * - window.API.post(action, payload, opts)
 * - Timeout padrão + tratamento de erro padronizado
 * - Não depende de frameworks
 */
(function(){
  "use strict";

  // Base padrão: pode ser sobrescrita por window.__API_BASE__ no bootstrap do painel
  function getBase_(){
    return (window.__API_BASE__ || "").trim() || "/api";
  }

  function sleep_(ms){ return new Promise(r => setTimeout(r, ms)); }

  function buildErrorMessage_(res, data){
    try{
      if (data && typeof data === "object"){
        if (data.error) return String(data.error);
        if (data.message) return String(data.message);
      }
    }catch(_){}
    return "Falha na requisição (" + (res ? res.status : "0") + ")";
  }

  async function post(action, payload, opts){
    opts = opts || {};
    var base = opts.base || getBase_();
    var url  = (opts.url || (base.replace(/\/$/, "") + "/exec")); // compat: muitos workers usam /exec
    var token = opts.token || (window.AUTH && window.AUTH.token) || (window.__auth && window.__auth.token) || null;

    var body = {
      action: action,
      payload: payload || {}
    };
    if (token) body.token = token;

    var timeoutMs = Number(opts.timeoutMs || 45000);

    // timeout com AbortController
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var t = null;
    if (ctrl){
      t = setTimeout(function(){ try{ ctrl.abort(); }catch(_){} }, timeoutMs);
    }

    var res, text, data;
    try{
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      });

      // tenta JSON; se falhar, guarda texto
      text = await res.text();
      try{ data = text ? JSON.parse(text) : {}; }catch(_){ data = { ok:false, raw:text }; }

      if (!res.ok || (data && data.ok === false && data.error)){
        var msg = buildErrorMessage_(res, data);
        var err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data;
    }catch(e){
      // padroniza erro para o painel
      if (String(e && e.name) === "AbortError"){
        var te = new Error("timeout");
        te.code = "timeout";
        throw te;
      }
      throw e;
    }finally{
      if (t) clearTimeout(t);
    }
  }

  window.API = { post: post };
})();
