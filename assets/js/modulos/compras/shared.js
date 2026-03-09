/**
 * Compras (Shared) — Painel Web
 * Funções comuns para Gestor e ADM.
 */
(function(){
  "use strict";

  function getTokenFromPainel_(){
    try{
      if (window.AUTH && typeof window.AUTH.getToken === "function") {
        const t = window.AUTH.getToken();
        if (t) return String(t).trim();
      }
    }catch(e){}

    try{
      if (window.AUTH && typeof window.AUTH.getAuth === "function") {
        const a = window.AUTH.getAuth();
        const t = a && a.token ? String(a.token).trim() : "";
        if (t) return t;
      }
    }catch(e){}

    try{
      const raw = localStorage.getItem("g1000_auth");
      if(raw){
        const a = JSON.parse(raw);
        const t = a && a.token ? String(a.token).trim() : "";
        if(t) return t;
      }
    }catch(e){}

    try{
      const t = localStorage.getItem("g1000_token") || localStorage.getItem("token") || "";
      if(t) return String(t).trim();
    }catch(e){}

    return "";
  }

  function normKey(s){
    return String(s||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\s+/g," ")
      .trim().toUpperCase();
  }

  function esc(s){
    return String(s||"").replace(/[&<>\"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
  }

  function defaultPostUrl_(){
    return (window.location.origin + window.location.pathname);
  }

  async function post_(action, payload, opts){
    const a = String(action||"").trim();
    if(!a) throw new Error("action inválida");
    const p = payload || {};
    const url = (opts && opts.url) ? String(opts.url) : "";

    // ✅ Preferir core do painel
    try{
      if(window.API && typeof window.API.post === "function"){
        if(window.API.post.length >= 2) return await window.API.post(a, p);
        return await window.API.post(Object.assign({ action:a }, p));
      }
    }catch(e){
      // cai no fetch
    }

    const finalUrl = (url && url.trim()) ? url.trim() : defaultPostUrl_();
    const body = Object.assign({ action:a }, p);
    const res = await fetch(finalUrl, {
      method: "POST",
      headers: { "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    try{ return JSON.parse(text); }
    catch{ return { ok:false, error:"Resposta não-JSON do servidor", httpStatus: res.status, raw:text }; }
  }

  /**
   * post(action, payload)
   * Compatível com:
   * - window.API.post(action, payload)  (core do painel)
   * - fallback fetch direto (páginas isoladas)
   */
  async function post(action, payload, urlFallback){
    const a = String(action||"").trim();
    if(!a) throw new Error("action inválida");

    // Preferencial: core do painel
    try{
      if(window.API && typeof window.API.post === "function"){
        // API.post(action, payload)
        if(window.API.post.length >= 2) return await window.API.post(a, payload || {});
        // API.post(obj)
        return await window.API.post(Object.assign({ action:a }, payload || {}));
      }
    }catch(e){
      // cai no fetch
    }

    const url = (urlFallback && String(urlFallback).trim()) ? String(urlFallback).trim() : (window.location.origin + window.location.pathname);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action:a }, payload || {}))
    });
    const text = await res.text();
    try{ return JSON.parse(text); }
    catch{ return { ok:false, error:"Resposta não-JSON do servidor", httpStatus: res.status, raw:text }; }
  }

  window.ComprasShared = window.ComprasShared || {};
  window.ComprasShared.getTokenFromPainel_ = getTokenFromPainel_;
  window.ComprasShared.normKey = normKey;
  window.ComprasShared.esc = esc;
  window.ComprasShared.post_ = post_;
  window.ComprasShared.post = post;
})();
