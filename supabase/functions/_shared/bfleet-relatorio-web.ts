// Leitura de relatórios salvos do OnReports pelo portal web (relatorios.bfleet.com.br), sem depender do formato JSON da API.
// Mesmo caminho do sync de "Fora do horário": login web -> relatório salvo -> resultadoreporte -> rota de dados (/reportesback/...).
import { asString, loadIntegrationSecrets, normalizeKey } from "./redgps.ts";
import { lerArrayLiteral } from "./bfleet-relatorio-regras.js";

function setCookies(headers: Headers): string[] {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie().map(String);
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function mergeCookies(current: string, novos: string[]) {
  const jar = new Map<string, string>();
  for (const pair of asString(current).split(/;\s*/)) {
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  for (const c of novos) {
    const pair = asString(c).split(";", 1)[0];
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function aplainar(params: URLSearchParams, prefix: string, value: any) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) aplainar(params, `${prefix}[${k}]`, v);
    return;
  }
  params.append(prefix, asString(value));
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome Safari";

// rotaDados: parte do nome da rota que traz as linhas (ex.: "equiposSinReportar" -> /reportesBack/equiposSinReportar).
export async function lerRelatorioWeb(supabase: any, reportId: string, rotaDados: string): Promise<string[][]> {
  const secrets = await loadIntegrationSecrets(supabase).catch(() => ({} as Record<string, string>));
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const n = normalizeKey(key);
      const v = secrets[n] || Deno.env.get(n) || Deno.env.get(key);
      if (v) return v;
    }
    return "";
  };
  const base = (get("BFLEET_WEB_BASE", "WEB_BASE", "REPORTS_BASE", "RELATORIOS_BASE") || "https://relatorios.bfleet.com.br").replace(/\/$/, "");
  const user = get("BFLEET_WEB_USERNAME", "WEB_USERNAME", "RELATORIOS_USERNAME", "BFLEET_USERNAME", "USERNAME");
  const pass = get("BFLEET_WEB_PASSWORD", "WEB_PASSWORD", "RELATORIOS_PASSWORD", "BFLEET_PASSWORD", "PASSWORD");
  if (!user || !pass) throw new Error("Sem credenciais web da BFleet configuradas.");
  const sinal = () => AbortSignal.timeout(100_000);

  let cookie = "";
  const pre = await fetch(`${base}/login`, { method: "GET", redirect: "manual", headers: { Accept: "text/html", "User-Agent": UA }, signal: sinal() }).catch(() => null);
  if (pre) cookie = mergeCookies(cookie, setCookies(pre.headers));
  const login = await fetch(`${base}/login`, {
    method: "POST", redirect: "manual", signal: sinal(),
    headers: { Accept: "text/html", "Content-Type": "application/x-www-form-urlencoded", Origin: base, Referer: `${base}/login`, "User-Agent": UA, ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams({ nick: user, passwd: pass, cbLang: "pt" }).toString(),
  });
  cookie = mergeCookies(cookie, setCookies(login.headers));
  if (!cookie) throw new Error(`Login web da BFleet sem sessão (HTTP ${login.status}).`);

  const salvo = await fetch(`${base}/ReportesFront/getDataReporteGuardado`, {
    method: "POST", signal: sinal(),
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Cookie: cookie, "X-Requested-With": "XMLHttpRequest", "User-Agent": UA },
    body: new URLSearchParams({ "data[idreporte_guardado]": reportId }).toString(),
  });
  const salvoTexto = await salvo.text();
  let dataJson: any;
  try { dataJson = JSON.parse(salvoTexto); } catch { throw new Error(`Relatório ${reportId} inválido no portal (HTTP ${salvo.status}); confira o login web.`); }

  const params = new URLSearchParams();
  aplainar(params, "data", dataJson);
  const res = await fetch(`${base}/reportesfront/resultadoreporte`, {
    method: "POST", signal: sinal(),
    headers: { Accept: "*/*", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Origin: base, Referer: `${base}/new-reports`, "X-Requested-With": "XMLHttpRequest", "User-Agent": UA, Cookie: cookie },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Portal respondeu HTTP ${res.status} ao abrir o relatório ${reportId}.`);
  const pagina = await res.text();

  const rota = Array.from(new Set(Array.from(pagina.matchAll(/\/reportesback\/[A-Za-z0-9_]+/gi)).map((m) => m[0])))
    .find((r) => r.toLowerCase().endsWith(`/${rotaDados.toLowerCase()}`));
  if (!rota) throw new Error(`Rota de dados "${rotaDados}" não encontrada na página do relatório ${reportId} (o tipo do relatório mudou?).`);

  const eco = pagina.match(/dataJson\s*=\s*(\{[\s\S]*?\});\/\/se cambian/);
  let runtime: any = dataJson;
  if (eco?.[1]) { try { runtime = JSON.parse(eco[1]); } catch { runtime = dataJson; } }
  const idsGuardados = Array.from(pagina.matchAll(/idreporte_guardado\s*=\s*(\d+)/g)).map((m) => m[1]).filter((i) => i !== "0");
  const uniqs = Array.from(pagina.matchAll(/uniq_id\s*=\s*["']([^"']+)["']/g)).map((m) => m[1]).filter(Boolean);
  const dp = new URLSearchParams();
  aplainar(dp, "dataJson", runtime);
  dp.set("idreporte_guardado", idsGuardados[idsGuardados.length - 1] || reportId);
  dp.set("uniq_id", uniqs[uniqs.length - 1] || "painel_sync");

  const rr = await fetch(`${base}${rota}`, {
    method: "POST", signal: sinal(),
    headers: { Accept: "*/*", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Origin: base, Referer: `${base}/new-reports`, "X-Requested-With": "XMLHttpRequest", "User-Agent": UA, Cookie: mergeCookies(cookie, setCookies(res.headers)) },
    body: dp.toString(),
  });
  const tx = await rr.text();
  if (!rr.ok) throw new Error(`Rota ${rota} respondeu HTTP ${rr.status}.`);
  const linhas = lerArrayLiteral(tx);
  if (!linhas) throw new Error(`Rota ${rota} devolveu um formato inesperado (${tx.slice(0, 80).replace(/\s+/g, " ")}).`);
  return linhas.map((l) => (Array.isArray(l) ? l.map((c) => asString(c)) : [asString(l)]));
}
