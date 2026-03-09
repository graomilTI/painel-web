// assets/js/conferencia.js
// Módulo Conferência (ADM)
// ✅ Padrão: window.CONFERENCIA.openHome(container, opts)
// Renderiza HTML de /adm/modulos/conferencia.html e executa scripts internos

(function () {
  "use strict";

  const CONFERENCIA = (window.CONFERENCIA = window.CONFERENCIA || {});

  function resolve_(rel) {
    try { return new URL(rel, window.location.href).toString(); } catch (e) { return rel; }
  }

  async function fetchText_(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("Não foi possível carregar o HTML do módulo (HTTP " + r.status + ")");
    return await r.text();
  }

  async function execScripts_(root) {
    const scripts = Array.from(root.querySelectorAll("script"));
    for (const old of scripts) {
      const s = document.createElement("script");
      for (const attr of Array.from(old.attributes || [])) {
        if (attr && attr.name && attr.value) s.setAttribute(attr.name, attr.value);
      }
      if (old.src) {
        s.src = old.src;
        await new Promise((res, rej) => {
          s.onload = () => res();
          s.onerror = () => rej(new Error("Falha ao carregar script: " + old.src));
          document.head.appendChild(s);
        });
      } else {
        s.text = old.textContent || "";
        document.head.appendChild(s);
      }
      old.remove();
    }
  }

  CONFERENCIA.openHome = async function openHome(container, opts = {}) {
    const root = typeof container === "string" ? document.querySelector(container) : container;
    if (!root) throw new Error("Container inválido para o módulo Conferência.");

    const htmlUrl = resolve_("../adm/modulos/conferencia.html");
    const html = await fetchText_(htmlUrl);

    root.innerHTML = html;
    await execScripts_(root);

    // caso o HTML não crie botão voltar, tenta chamar callback
    try { if (opts && typeof opts.onBack === "function") opts.onBack(); } catch (e) {}
  };
})();
