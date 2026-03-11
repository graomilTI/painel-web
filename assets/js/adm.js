// assets/js/adm.js
// Painel ADM — bootstrap BLINDADO de módulos
// ✅ Padrão preferido: window.<MOD>.openHome(container, opts)
// ✅ Compat legado: window.ADM_MODULES.<mod>.mount(container, opts)
// ✅ Fallback: tenta carregar ../assets/js/<mod>.js e, se existir HTML em /adm/modulos/<mod>.html, carrega
// ✅ Nunca deixa tela em branco: mostra card de erro/placeholder com botão Voltar

(function () {
  "use strict";

  console.log("adm.js (blindado) carregado");

  // ========= Utils =========
  const $id = (id) => document.getElementById(id);

  function viewEl_() {
    return $id("view") || document.body;
  }

  function setViewHTML_(html) {
    const v = viewEl_();
    if (v) v.innerHTML = html;
  }

  function escapeHtml_(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function setStatus_(msg) {
    const el = $id("adm_status") || $id("status") || null;
    if (el) el.textContent = String(msg || "");
  }

  function getAuthSafe_() {
    try { if (window.AUTH && typeof AUTH.getAuth === "function") return AUTH.getAuth(); } catch (e) {}
    try { return JSON.parse(localStorage.getItem("g1000_auth") || "null"); } catch (e) {}
    try {
      const t = (localStorage.getItem("g1000_token") || "").trim();
      return t ? { token: t } : null;
    } catch (e) {}
    return null;
  }

  function getToken_() {
    const a = getAuthSafe_();
    const t = a && (a.token || (a.auth && a.auth.token));
    return String(t || "").trim();
  }


  // ========= Compat (LEGADO) =========
  // Alguns módulos antigos chamam window.admBackendCall(...)
  async function callPostCompat_(req){
    const post =
      (window.API && typeof window.API.post === "function" ? window.API.post : null) ||
      (typeof window.apiPost === "function" ? window.apiPost : null) ||
      (window.AUTH && typeof window.AUTH.post === "function" ? window.AUTH.post : null);

    if (!post) throw new Error("API.post/AUTH.post indisponível (verifique api.js e auth_unificado.js).");

    // Normaliza formatos aceitos:
    // - callPostCompat_({ action:"x", ... })
    // - callPostCompat_({ acao:"x", ... })
    // - callPostCompat_({ route:"x", payload:{...} })
    // - callPostCompat_("x", payload)  [alguns legados chamam assim indiretamente]
    let obj = req;

    // Se vier no formato {payload:{...}} tenta mesclar no topo (AUTH.post costuma esperar no topo)
    if (obj && typeof obj === "object") {
      if (!obj.action && obj.acao) obj.action = obj.acao;
      if (!obj.action && obj.route) obj.action = obj.route;
      if (!obj.action && obj.name) obj.action = obj.name;
      if (obj.payload && typeof obj.payload === "object") {
        obj = Object.assign({}, obj.payload, obj);
        delete obj.payload;
      }
      if (obj.data && typeof obj.data === "object") {
        obj = Object.assign({}, obj.data, obj);
        delete obj.data;
      }
      if (obj.body && typeof obj.body === "object") {
        obj = Object.assign({}, obj.body, obj);
        delete obj.body;
      }
      if (obj.params && typeof obj.params === "object") {
        obj = Object.assign({}, obj.params, obj);
        delete obj.params;
      }
    }

    const act = (obj && typeof obj === "object") ? obj.action : null;
    const hasAction = typeof act === "string" && act.trim();

    // 1) Tenta padrão legado de 2 args (action, body) — SEM confiar em post.length
    if (hasAction) {
      try { return await post(String(act).trim(), obj); } catch(e1) {
        // 2) Se o post espera objeto único, tenta 1 arg
        try { return await post(obj); } catch(e2) { throw e1; }
      }
    }

    // 3) Sem action: manda o objeto como veio
    return await post(obj);
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

    if (!r || r.ok === false) {
      throw new Error(r?.error || r?.message || "Erro no backend");
    }
    return r;
  }

  window.admBackendCall = window.admBackendCall || backendCall;


  function resolveAssetUrl_(rel) {
    // Resolve sempre a partir do documento atual (evita problemas com subpaths)
    try { return new URL(rel, window.location.href).toString(); } catch (e) { return rel; }
  }

  const LOADED = new Set();
  function loadScriptOnce_(url) {
    return new Promise((resolve, reject) => {
      const u = String(url || "");
      if (!u) return resolve();
      if (LOADED.has(u)) return resolve();

      const s = document.createElement("script");
      s.src = u;
      s.async = true;
      s.onload = () => { LOADED.add(u); resolve(); };
      s.onerror = () => reject(new Error("Falha ao carregar script: " + u));
      document.head.appendChild(s);
    });
  }

  async function fetchTextMaybe_(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.text();
    } catch (e) {
      return null;
    }
  }

  function backButtonHtml_() {
    return `<button class="btn" id="btnBackMenu">← Voltar</button>`;
  }

  function wireBackButton_() {
    const btn = $id("btnBackMenu");
    if (!btn) return;
    btn.onclick = () => {
      try { if (typeof window.showMenu_ === "function") return window.showMenu_(); } catch (e) {}
      try { if (typeof window.goMenu_ === "function") return window.goMenu_(); } catch (e) {}
      // fallback: recarrega a tela sem módulo
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("module");
        u.searchParams.delete("m");
        u.searchParams.delete("app");
        u.hash = "";
        window.location.href = u.toString();
      } catch (e) {
        window.location.href = "./app.html";
      }
    };
  }

  function renderPlaceholder_(mod) {
    const name = String(mod || "").toUpperCase();
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between;gap:10px;align-items:center;">
          <div>
            <h3 style="margin:0 0 4px;">${escapeHtml_(name)}</h3>
            <div class="muted">Módulo em desenvolvimento.</div>
          </div>
          ${backButtonHtml_()}
        </div>
        <div class="muted" style="margin-top:12px;">
          <div>Para ativar este módulo, crie um arquivo JS que exponha:</div>
          <div style="margin-top:6px;"><code>window.${escapeHtml_(name)} = { openHome(container, opts){...} }</code></div>
          <div style="margin-top:10px;">Ou (legado): <code>window.ADM_MODULES.${escapeHtml_(String(mod||"").toLowerCase())}.mount(container, opts)</code></div>
        </div>
      </div>
    `;
  }

  function renderError_(mod, err) {
    const name = String(mod || "").toUpperCase();
    const msg = err && (err.message || err) ? String(err.message || err) : "Erro desconhecido";
    return `
      <div class="card" style="padding:16px;border:1px solid rgba(255,0,0,.35)">
        <div class="row" style="justify-content:space-between;gap:10px;align-items:center;">
          <div style="font-weight:900;color:#fca5a5">Erro ao abrir ${escapeHtml_(name)}</div>
          ${backButtonHtml_()}
        </div>
        <div style="margin-top:8px;opacity:.92">${escapeHtml_(msg)}</div>
      </div>
    `;
  }

  function getModuleFromUrl_() {
    const u = new URL(window.location.href);
    // suporta deep links antigos e novos
    const p =
      u.searchParams.get("module") ||
      u.searchParams.get("m") ||
      u.searchParams.get("app") || // ✅ sua URL no print usa ?app=
      "";
    const h = (window.location.hash || "").replace(/^#/, "").trim();
    return (p || h || "").trim().toLowerCase();
  }

  async function execInlineScripts_(root) {
    // scripts dentro de innerHTML não executam; aqui executamos manualmente
    const scripts = Array.from(root.querySelectorAll("script"));
    for (const old of scripts) {
      const s = document.createElement("script");
      // copia atributos relevantes
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

  async function openByHtml_(mod, opts) {
    // tenta carregar /adm/modulos/<mod>.html
    const url = resolveAssetUrl_("../adm/modulos/" + mod + ".html");
    const html = await fetchTextMaybe_(url);
    if (!html) return false;

    const root = typeof opts.mountSel === "string"
      ? document.querySelector(opts.mountSel)
      : (opts.mountEl || viewEl_());

    if (!root) throw new Error("Container do módulo não encontrado.");

    root.innerHTML = html;
    await execInlineScripts_(root);
    return true;
  }

  async function openModule_(module, opts) {
    opts = opts || {};
    const mod = String(module || "").trim().toLowerCase();
    if (!mod) return;

    setStatus_("Abrindo " + mod + "...");

    // 1) Padrão novo: window.<MOD>.openHome
    const modKey = mod.toUpperCase();

    try {
      // Tenta carregar script padrão do módulo se ainda não existir
      if (!window[modKey] || typeof window[modKey].openHome !== "function") {
        // ✅ Evita 404 em produção: só tenta caminhos conhecidos.
        // (Mantém tudo "conectado" e sem ruído no console.)
        const ENTRY = {
          // módulos ADM implementados
          compras:     ["../assets/js/modules/compras.js"],
          patrimonio:  ["../assets/js/modules/patrimonio.js"],
          financeiro:  ["../assets/js/modules/financeiro.js"],
          conferencia: ["../assets/js/conferencia.js"],
          hospedagem:  ["../assets/js/hospedagem.js"],
          diretoria:   ["../assets/js/diretoria.js"],
          clientes:    ["../assets/js/clientes.js"],
          programacao: ["../assets/js/programacao.js"],
          correios:    ["../assets/js/modules/correios.js"],
        };

        // Se existir entry mapeada, carrega nela; senão, não tenta "chutar" scripts.
        const candidates = ENTRY[mod] || [];

        for (const rel of candidates) {
          const url = resolveAssetUrl_(rel);
          try { await loadScriptOnce_(url); break; } catch (e) {}
        }
      }

      const container = viewEl_();

      // 2) Se existir módulo no padrão novo, chama
      if (window[modKey] && typeof window[modKey].openHome === "function") {
        const auth = getAuthSafe_();
        const token = getToken_();
        await window[modKey].openHome(container, { auth, token, api: window.API, onBack: wireBackButton_ });
        setStatus_("OK");
        return;
      }

      // 3) Compat legado: window.ADM_MODULES.<mod>.mount
      if (window.ADM_MODULES && window.ADM_MODULES[mod] && typeof window.ADM_MODULES[mod].mount === "function") {
        const auth = getAuthSafe_();
        const token = getToken_();
        await window.ADM_MODULES[mod].mount(container, { auth, token, api: window.API, onBack: wireBackButton_ });
        setStatus_("OK");
        return;
      }

      // 4) Fallback: HTML em /adm/modulos/<mod>.html
      // Só tenta HTML se existir arquivo (evita 404 no console para módulos não criados)
      const HTML_OK = {
        conferencia: true,
        // outros HTMLs podem ser habilitados aqui quando existirem
      };
      if (HTML_OK[mod]) {
        const okHtml = await openByHtml_(mod, { mountEl: container, mountSel: "#view" });
        if (okHtml) {
          setStatus_("OK");
          // garante botão voltar (caso o HTML não tenha)
          wireBackButton_();
          return;
        }
      }

      // 5) Placeholder amigável
      setStatus_("Módulo não implementado");
      setViewHTML_(renderPlaceholder_(mod));
      wireBackButton_();

    } catch (e) {
      console.error(e);
      setStatus_("Erro ao abrir módulo");
      setViewHTML_(renderError_(mod, e));
      wireBackButton_();
    }
  }

  // Expor API mínima
  window.ADM = window.ADM || {};
  window.ADM.openModule = openModule_;
  window.ADM.open = openModule_;
  window.ADM.getAuthSafe = getAuthSafe_;
  window.ADM.getToken = getToken_;

  // Auto-boot (deep link)
  document.addEventListener("DOMContentLoaded", () => {
    const mod = getModuleFromUrl_();
    if (mod) openModule_(mod);
  });
})();
