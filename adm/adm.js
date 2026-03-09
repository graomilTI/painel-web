/* adm.js — Loader SPA do Painel ADM (CORRIGIDO)
 * ✅ Novo padrão:
 *  - adm/app.html chama: window.ADM.open("conferencia")
 *  - Carrega JS module: ../assets/js/modules/adm_<nome>/module.js
 *  - Espera export:
 *      window.ADM_<NOME>.mount(container)
 *    ou window.ADM_MODULES[<nome>].mount(container)
 *
 * ✅ Compat:
 *  - Ainda suporta clique em elementos [data-module]
 *  - BackendCall funciona com API.post(action, payload) OU API.post(payload)
 */

(function () {
  "use strict";

  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  // container do módulo (novo: #view) / (antigo: #admContent)
  function host(){
    return document.getElementById("view") || document.getElementById("admContent");
  }

  /* =========================
   * AUTH helpers
   * ========================= */
  function getToken_(){
    try{
      const a = window.AUTH?.getAuth?.();
      const t = a?.token ? String(a.token).trim() : "";
      if (t) return t;
    }catch(e){}
    const t2 = (localStorage.getItem("adm_token") || sessionStorage.getItem("adm_token") || "").trim();
    return t2;
  }

  function requireToken_(){
    const t = getToken_();
    if (!t) throw new Error("Sessão inválida ou expirada");
    return t;
  }

  function showAuthError_(){
    const h = host();
    if (!h) return;
    h.innerHTML = `
      <div style="padding:14px">
        <div style="font-weight:800;margin-bottom:6px">Sessão inválida</div>
        <div style="opacity:.85">Seu login expirou. Clique em <b>Sair</b> e entre novamente.</div>
      </div>
    `;
  }

  /* =========================
   * Backend call (compat)
   * ========================= */

  async function callPostCompat_(req){
    const post = window.API?.post || window.apiPost;
    if (typeof post !== "function") throw new Error("API.post indisponível (verifique api.js).");

    // Compat:
    // - API.post(action, payload)
    // - API.post(payload)
    try{
      if (post.length >= 2 && typeof req?.action === "string") {
        // envia action separado, mas mantém o corpo completo como payload
        return await post(req.action, req);
      }
    }catch(_){}

    return await post(req);
  }

  async function backendCall(body){
    const req = { ...(body || {}) };
    req.token = String(req.token || getToken_() || "").trim();
    if (!req.token) throw new Error("Sessão inválida ou expirada");

    let r = await callPostCompat_(req);

    // fallback: remove prefixo adm_
    if (r && r.ok === false) {
      const msg = String(r.error || r.message || "");
      const act = String(req.action || "");
      if (msg.toLowerCase().includes("ação desconhecida") && act.startsWith("adm_")) {
        r = await callPostCompat_({ ...req, action: act.replace(/^adm_/, "") });
      }
    }

    if (!r || r.ok !== true) {
      throw new Error(r?.error || r?.message || "Erro no backend");
    }
    return r;
  }
  window.admBackendCall = window.admBackendCall || backendCall;

  /* =========================
   * Loader de JS module
   * ========================= */

  function loadScript_(src){
    return new Promise((resolve, reject)=>{
      // evita duplicar mesmo script
      const exist = Array.from(document.scripts).some(s => (s.src || "").includes(src.split("?")[0]));
      if (exist) return resolve();

      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar script: " + src));
      document.body.appendChild(s);
    });
  }

  function resolveModuleExport_(moduleName){
    const key = String(moduleName || "").trim().toLowerCase();
    const globalName = "ADM_" + key.toUpperCase(); // exemplo: ADM_CONFERENCIA

    // 1) padrão antigo que seu loader espera
    const obj1 = window[globalName];
    if (obj1 && typeof obj1.mount === "function") return obj1;

    // 2) padrão novo (ADM_MODULES)
    const obj2 = window.ADM_MODULES && window.ADM_MODULES[key];
    if (obj2 && typeof obj2.mount === "function") return obj2;

    return null;
  }

  async function openJsModule_(moduleName){
    const h = host();
    if (!h) return;

    if (!getToken_()){
      showAuthError_();
      return;
    }

    h.innerHTML = "Carregando módulo...";

    const mod = String(moduleName || "").trim().toLowerCase();
    if (!mod) {
      h.innerHTML = "Módulo inválido.";
      return;
    }

    // caminho padrão dos módulos (você definiu isso):
    // painel-web/assets/js/modules/adm_conferencia/module.js
    const src = `../assets/js/modules/adm_${mod}/module.js?v=${Date.now()}`;

    await loadScript_(src);

    const exp = resolveModuleExport_(mod);
    if (!exp){
      h.innerHTML = `
        <div style="padding:14px">
          <div style="font-weight:900;margin-bottom:6px">${mod}</div>
          <div style="opacity:.85">Módulo carregou, mas <code>window.ADM_${mod.toUpperCase()}.mount</code> não foi encontrado.</div>
          <div style="opacity:.7;margin-top:8px;font-size:12px">
            Verifique se o module.js exporta: <code>window.ADM_${mod.toUpperCase()}.mount = ...</code>
          </div>
        </div>
      `;
      return;
    }

    // monta dentro do container
    await exp.mount(h);
  }

  /* =========================
   * API pública do ADM (usada pelo adm/app.html)
   * ========================= */
  window.ADM = window.ADM || {};
  window.ADM.open = async function(moduleName){
    try{
      await openJsModule_(moduleName);
    }catch(err){
      console.error(err);
      const h = host();
      if (h) h.innerHTML = `Erro ao abrir módulo: ${String(err?.message || err)}`;
    }
  };

  /* =========================
   * Clique no menu (cards/tiles)
   * ========================= */
  $all("[data-module]").forEach((el) => {
    el.addEventListener("click", () => {
      const mod = el.dataset.module;
      window.ADM.open(mod);
    });
  });

  /* =========================
   * Logout / Ping (compat)
   * ========================= */
  const btnLogout =
    document.getElementById("btnLogout") ||
    document.getElementById("btnSair") ||
    document.getElementById("btnExit");

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      try { window.AUTH?.clearAuth?.(); } catch (e) {}
      try { localStorage.removeItem("adm_token"); sessionStorage.removeItem("adm_token"); } catch (e) {}
      try { window.location.href = "../index.html"; } catch (e) { window.location.href = "index.html"; }
    });
  }

  const btnPing = document.getElementById("btnPing");
  if (btnPing) {
    btnPing.addEventListener("click", async () => {
      try{
        const token = requireToken_();
        const r = await backendCall({ action: "ping", token });
        alert(r && r.ok ? "Ping OK" : "Erro no ping");
      }catch(e){
        alert("Erro no ping: " + (e?.message || e));
      }
    });
  }

})();
