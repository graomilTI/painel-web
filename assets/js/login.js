/*
 * Painel Web — Login
 * - Usa API_BASE (config.js) -> /api/exec
 * - Salva token e redireciona conforme perfil
 */

(function () {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const API_BASE = String(CONFIG.API_BASE || "/api").replace(/\/$/, "");

  const ACTION_LOGIN = "login";
  const LS_TOKEN = "g1000_token";
  const LS_PERFIL = "g1000_perfil";

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, isErr) {
    const el = $("status");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "#fca5a5" : "";
  }

  function setBusy(busy) {
    const btnTest = $("btn_test");
    const btnEnter = $("btn_enter");
    [btnTest, btnEnter].forEach((b) => {
      if (!b) return;
      b.disabled = !!busy;
      b.setAttribute("aria-busy", busy ? "true" : "false");
    });
  }

  async function apiExec(action, payload, token) {
    const body = { action, payload: payload || {} };
    if (token) body.token = token;

    const res = await fetch(`${API_BASE}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    let data;
    try {
      data = await res.json();
    } catch (_) {
      data = { ok: false, error: "Resposta inválida" };
    }
    if (!res.ok && data && typeof data.ok === "undefined") {
      data.ok = false;
      data.error = data.error || `HTTP ${res.status}`;
    }
    return data;
  }

  function digits(s) {
    return String(s || "").replace(/\D+/g, "");
  }

  function safeToPath(p) {
    if (!p) return null;
    try {
      const u = new URL(p, location.origin);
      if (u.origin !== location.origin) return null;
      if (!u.pathname.startsWith("/painel")) return null;
      return u.pathname + u.search + u.hash;
    } catch (_) {
      return String(p).startsWith("/painel") ? String(p) : null;
    }
  }

  function decideRedirect(perfil, cpfProvided) {
    const qs = new URLSearchParams(location.search);
    const desired = safeToPath(qs.get("to"));
    if (desired) return desired;

    const p = String(perfil || "").toUpperCase();
    if (p.includes("ADM") || cpfProvided) return "/painel/adm/";
    return "/painel/gestor/";
  }

  async function onTest() {
    setBusy(true);
    setStatus("Testando conexão...");
    try {
      const out = await apiExec("ping", { from: "painel-login", ts: Date.now() });
      if (out && out.ok) setStatus("Conexão OK.");
      else setStatus(out?.error || "Falha na conexão.", true);
    } catch (_) {
      setStatus("Falha na conexão.", true);
    } finally {
      setBusy(false);
    }
  }

  async function onEnter() {
    const pin = digits($("pin")?.value);
    const cpf = digits($("cpf")?.value);

    if (!pin && !cpf) {
      setStatus("Informe o PIN (Gestor) ou CPF (ADM).", true);
      return;
    }

    setBusy(true);
    setStatus("Entrando...");

    try {
      const out = await apiExec(ACTION_LOGIN, {
        pin: pin || null,
        cpf: cpf || null,
        origin: location.origin,
        path: location.pathname,
        ua: navigator.userAgent,
      });

      if (!out || !out.ok) {
        setStatus(out?.error || "Falha no login.", true);
        return;
      }

      const token = out.token || out.sessionToken || out.authToken || "";
      const perfil = out.perfil || out.role || out.tipo || "";
      if (!token) {
        setStatus("Erro: Login sem token", true);
        return;
      }

      try {
        localStorage.setItem(LS_TOKEN, token);
        if (perfil) localStorage.setItem(LS_PERFIL, String(perfil));
      } catch (_) {}

      const to = decideRedirect(perfil, !!cpf);
      setStatus("Login OK. Redirecionando...");
      location.href = to;
    } catch (_) {
      setStatus("Falha no login.", true);
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btnTest = $("btn_test");
    const btnEnter = $("btn_enter");

    if (btnTest) btnTest.addEventListener("click", (ev) => { ev.preventDefault(); onTest(); });
    if (btnEnter) btnEnter.addEventListener("click", (ev) => { ev.preventDefault(); onEnter(); });

    [$("pin"), $("cpf")].forEach((inp) => {
      if (!inp) return;
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      });
    });
  });
})();
