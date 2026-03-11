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
    // scripts dentro de innerHTML não executam; aqui executamos manualmente.
    // ✅ Blindagem extra:
    // - Inline scripts do HTML (conferencia.html) vinham declarando const/let no escopo global.
    // - Ao abrir o módulo mais de uma vez, ocorria: "Identifier ... has already been declared".
    //
    // Estratégia:
    // 1) Scripts com src: carrega 1x (dedupe por URL).
    // 2) Scripts inline: concatena todos em 1 único bloco e executa dentro de IIFE,
    //    preservando o compartilhamento de variáveis ENTRE scripts do mesmo HTML,
    //    mas sem vazar para o escopo global.

    window.__G1000_LOADED_SCRIPTS__ = window.__G1000_LOADED_SCRIPTS__ || new Set();
    const LOADED = window.__G1000_LOADED_SCRIPTS__;

    const scripts = Array.from(root.querySelectorAll("script"));
    const inlineParts = [];

    for (const old of scripts) {
      if (old && old.src) {
        const src = String(old.src || "").trim();
        if (src && !LOADED.has(src)) {
          const s = document.createElement("script");
          // copia atributos relevantes
          for (const attr of Array.from(old.attributes || [])) {
            if (!attr || !attr.name) continue;
            if (attr.name.toLowerCase() === "src") continue;
            s.setAttribute(attr.name, attr.value);
          }
          s.src = src;
          await new Promise((res, rej) => {
            s.onload = () => res();
            s.onerror = () => rej(new Error("Falha ao carregar script: " + src));
            document.head.appendChild(s);
          });
          LOADED.add(src);
        }
      } else {
        const code = (old && old.textContent) ? String(old.textContent) : "";
        if (code.trim()) inlineParts.push(code);
      }
      try { old.remove(); } catch (e) {}
    }

    if (inlineParts.length) {
      const s = document.createElement("script");
      s.text = "(function(){\n" + inlineParts.join("\n\n") + "\n})();";
      document.head.appendChild(s);
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
