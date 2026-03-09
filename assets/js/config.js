// assets/js/config.js
// ✅ Config único do Painel Web (GitHub Pages)
// - Evita "Identifier has already been declared"
// - Expõe compat: window.API_BASE / window.API_KEY
// - Preferir ler via window.__APP_CONFIG__

;(function(){
  const CFG = {
    API_BASE: "/api",
    API_KEY:  "",
    APP_NAME: "Painel Web",
    APP_VERSION: "v1"
  };

  // Guarda central
  window.__APP_CONFIG__ = Object.assign({}, window.__APP_CONFIG__||{}, CFG);

  // Compat legado
  window.API_BASE = window.__APP_CONFIG__.API_BASE;
  window.API_KEY  = window.__APP_CONFIG__.API_KEY;

  /** =========================================================
   * MoneyShield (PT-BR) — Proteção global contra vírgula/decimal
   * - Converte "597,67" => 597.67 (number)
   * - Converte "59.767,00" => 59767 (number)
   * - Formata número => "59.767,00" / "R$ 59.767,00"
   * - Evita bug: "597,67" virar "59767,00"
   * ========================================================= */
  (function(){
    if (window.MoneyShield) return; // não redeclara

    const isNil = (v) => v === null || v === undefined;
    const toStr = (v) => (isNil(v) ? "" : String(v).trim());

    function parseAnyNumber(v){
      if (isNil(v)) return 0;
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;

      let s = toStr(v);
      if (!s || s === "-" || s === "—" || s.toLowerCase() === "na" || s.toLowerCase() === "n/a") return 0;

      s = s.replace(/\s+/g, "");
      s = s.replace(/^R\$\s?/, "");
      s = s.replace(/[^\d.,-]/g, "");

      const hasDot = s.includes(".");
      const hasComma = s.includes(",");

      if (hasDot && hasComma) {
        // BR: 59.767,89
        s = s.replace(/\./g, "").replace(",", ".");
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      }

      if (hasComma && !hasDot) {
        // BR: 597,67
        s = s.replace(",", ".");
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      }

      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }

    function formatBR(v, decimals = 2){
      const n = parseAnyNumber(v);
      return n.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }

    function formatBRL(v, decimals = 2){
      const n = parseAnyNumber(v);
      return n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }

    function smartBR(v){
      const n = parseAnyNumber(v);
      const isInt = Math.abs(n - Math.round(n)) < 1e-9;
      return formatBR(n, isInt ? 0 : 2);
    }

    window.MoneyShield = {
      num: parseAnyNumber,
      br: formatBR,
      brl: formatBRL,
      smart: smartBR,
      isNil,
    };
  })();
})();
