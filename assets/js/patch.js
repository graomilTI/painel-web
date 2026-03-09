/**
 * PATCH v3 — Painel Web
 * - Default "Disponível" (Etapa A) quando select vier vazio/"Selecione..."
 * - Evita travamento aparente: estado de loading no botão "Salvar etapa"
 *   (não cancela o handler original; apenas desabilita e mostra feedback)
 * - Timeout visual de 60s para reabilitar o botão caso a resposta demore
 */
(function () {
  const DEFAULT_DISP = "Disponível";

  function ensureDefaultDisponibilidade() {
    // pega selects comuns (por id/class/data-attrs) sem depender do seu app.js
    const selects = Array.from(document.querySelectorAll('select'))
      .filter(s => {
        const id = (s.id || "").toLowerCase();
        const name = (s.name || "").toLowerCase();
        const cls = (s.className || "").toLowerCase();
        const data = (s.getAttribute("data-field") || "").toLowerCase();
        return (
          id.includes("dispon") ||
          name.includes("dispon") ||
          cls.includes("dispon") ||
          data.includes("dispon")
        );
      });

    for (const sel of selects) {
      const v = (sel.value || "").trim();
      // se existir opção "Disponível" e o select estiver vazio/placeholder, seta default
      const optDisp = Array.from(sel.options || []).find(o => (o.value || o.textContent || "").trim() === DEFAULT_DISP);
      const isPlaceholder = (v === "" || v.toLowerCase().includes("selecione"));
      if (optDisp && isPlaceholder) {
        sel.value = DEFAULT_DISP;
        // se a opção placeholder estiver selecionada, garante visual correto
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  function injectLoaderCSS() {
    if (document.getElementById("patchv3-css")) return;
    const st = document.createElement("style");
    st.id = "patchv3-css";
    st.textContent = `
      .btn.is-loading{ opacity:.75; pointer-events:none; position:relative; }
      .btn.is-loading::after{
        content:""; width:14px; height:14px; border:2px solid rgba(255,255,255,.35);
        border-top-color: rgba(255,255,255,.9);
        border-radius:50%; display:inline-block; margin-left:10px; vertical-align:middle;
        animation: patchspin .8s linear infinite;
      }
      @keyframes patchspin { to { transform: rotate(360deg);} }
      .toast-mini{
        position:fixed; left:50%; bottom:16px; transform:translateX(-50%);
        background: rgba(0,0,0,.7); color:#fff; padding:10px 14px; border-radius:12px;
        z-index:9999; font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        border:1px solid rgba(255,255,255,.12);
        backdrop-filter: blur(8px);
      }
    `;
    document.head.appendChild(st);
  }

  function toast(msg, ms=2200){
    const d = document.createElement("div");
    d.className = "toast-mini";
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(()=> d.remove(), ms);
  }

  function hookSalvarEtapa() {
    // tenta achar o botão de salvar etapa por IDs comuns e também texto
    const candidates = [
      document.getElementById("btnSalvarEtapa"),
      document.getElementById("salvarEtapa"),
      document.querySelector('[data-action="salvar-etapa"]'),
      ...Array.from(document.querySelectorAll("button")).filter(b => (b.textContent||"").trim().toLowerCase() === "salvar etapa")
    ].filter(Boolean);

    for (const btn of candidates) {
      if (btn.dataset.patchv3Bound === "1") continue;
      btn.dataset.patchv3Bound = "1";

      // capture click: não impede o handler original, só aplica UX
      btn.addEventListener("click", () => {
        // antes de salvar, garante default correto (evita "Selecione..." indo pro payload)
        ensureDefaultDisponibilidade();

        // loading
        btn.classList.add("is-loading");
        const oldText = btn.dataset.oldText || btn.textContent;
        btn.dataset.oldText = oldText;
        btn.textContent = "Salvando...";
        btn.disabled = true;

        toast("Salvando… se demorar, é o GAS processando.");

        // fallback: reabilita depois de 60s (caso alguma promise fique pendurada)
        const t = setTimeout(() => {
          btn.classList.remove("is-loading");
          btn.textContent = oldText;
          btn.disabled = false;
          toast("Ainda processando. Tente novamente em alguns segundos, se precisar.", 3000);
        }, 60000);

        // se o app.js disparar eventos customizados, tentamos ouvir para finalizar rápido
        const done = () => {
          clearTimeout(t);
          btn.classList.remove("is-loading");
          btn.textContent = oldText;
          btn.disabled = false;
        };

        // eventos opcionais (se não existir, sem problema)
        const onOk = () => { done(); document.removeEventListener("salvarEtapa:ok", onOk); document.removeEventListener("salvarEtapa:erro", onErr); };
        const onErr = () => { done(); document.removeEventListener("salvarEtapa:ok", onOk); document.removeEventListener("salvarEtapa:erro", onErr); };

        document.addEventListener("salvarEtapa:ok", onOk, { once: true });
        document.addEventListener("salvarEtapa:erro", onErr, { once: true });

      }, true);
    }
  }

  function start() {
    injectLoaderCSS();
    ensureDefaultDisponibilidade();
    hookSalvarEtapa();

    // Reaplica depois de renderizações dinâmicas
    const obs = new MutationObserver(() => {
      ensureDefaultDisponibilidade();
      hookSalvarEtapa();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();