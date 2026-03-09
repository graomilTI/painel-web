(function () {
  "use strict";

  // Hospedagem — wrapper para Gestor (Avulsa) + ADM
  // ✅ expõe: window.HOSPEDAGEM.openHome(container, opts)
  // - opts.mode: "gestor" | "adm" (opcional)
  // - se estiver no /adm/, assume ADM

  const isAdmPage_ = () => {
    try { return /\/adm\//i.test(location.pathname || ""); } catch (e) { return false; }
  };

  function loadScriptOnce_(src) {
    return new Promise((resolve, reject) => {
      // ⚠️ Não confie só no <script> existir: pode ter sido carregado antes com erro.
      const exists = Array.from(document.scripts || []).some(s => (s.src || "").includes(src));
      if (exists) return resolve(true);

      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve(true);
      el.onerror = () => reject(new Error("Falha ao carregar script: " + src));
      document.head.appendChild(el);
    });
  }


  function loadCssOnce_(href){
    try{
      const u = new URL(href, location.href).toString();
      const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => String(l.href||"") === u);
      if (exists) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }catch(_){}
  }

  async function ensureImpl_(mode) {
    // garante que as implementações existam
    if (mode === "adm") {
      const hasAdm = () => (window.HOSPEDAGEM_ADM && typeof window.HOSPEDAGEM_ADM.openHome === "function");
      if (!hasAdm()) {
        // Se já existir tag <script>, mas o módulo não registrou (ex.: erro anterior), força reload com cache-bust.
        const base = "../assets/js/modulos/hospedagem_adm.js";
        await loadScriptOnce_(base);
        if (!hasAdm()) {
          await loadScriptOnce_(base + (base.includes("?") ? "&" : "?") + "v=" + Date.now());
        }
      }
      return window.HOSPEDAGEM_ADM;
    }

    // gestor
    const hasGestor = () => (window.HOSPEDAGEM_AVULSA && typeof window.HOSPEDAGEM_AVULSA.openHome === "function");
    if (!hasGestor()) {
      const base = "../assets/js/modulos/hospedagem_avulsa.js";
      await loadScriptOnce_(base);
      if (!hasGestor()) {
        await loadScriptOnce_(base + (base.includes("?") ? "&" : "?") + "v=" + Date.now());
      }
    }
    return window.HOSPEDAGEM_AVULSA;
  }

  async function openHome(container, opts) {
    opts = opts || {};
    const mode = String(opts.mode || (isAdmPage_() ? "adm" : "gestor")).toLowerCase();
    const impl = await ensureImpl_(mode);
    if (!impl || typeof impl.openHome !== "function") throw new Error("Módulo Hospedagem (" + mode + ") indisponível.");
    return impl.openHome(container, opts);
  }

  window.HOSPEDAGEM = { openHome };

})();