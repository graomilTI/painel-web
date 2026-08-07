import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown) {
  return asString(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function onlyPlate(value: unknown) {
  return asString(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function normalizeText(value: unknown) {
  return asString(value).replace(/\s+/g, " ");
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = asString(value).replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function decodeHtml(value: unknown) {
  return asString(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(value: unknown) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinkFromHtml(value: unknown) {
  const html = asString(value);
  const href = html.match(/href=["']([^"']+)["']/i)?.[1];
  return href ? decodeHtml(href) : "";
}

function parseHtmlTableRows(htmlValue: unknown): any[] {
  const html = asString(htmlValue);
  if (!html || !/<table|<tr|<td|<th/i.test(html)) return [];

  const trMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  if (!trMatches.length) return [];

  let headers: string[] = [];
  const rows: any[] = [];

  for (const tr of trMatches) {
    const cells = Array.from(tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) => m[1] || "");
    if (!cells.length) continue;

    const isHeader = /<th\b/i.test(tr);
    const values = cells.map((c) => stripHtml(c));

    if (isHeader || !headers.length) {
      const normalizedHeaders = values.map((v, idx) => v || `COLUNA_${idx + 1}`);
      const hasKnownHeader = normalizedHeaders.some((h) => {
        const k = normalizeKey(h);
        return ["DATA", "FECHA", "HORA", "PLACA", "MOTORISTA", "CONDUCTOR", "ENDERECO", "DOMICILIO", "LATITUDE", "LONGITUDE", "VER_MAPA"].includes(k);
      });
      if (hasKnownHeader) {
        headers = normalizedHeaders;
        continue;
      }
    }

    if (!headers.length) {
      if (values.length >= 7) {
        headers = ["Data", "Hora", "Alerta", "Placa", "Motorista", "Endereco", "Latitude", "Longitude", "Ver mapa"].slice(0, values.length);
      } else {
        continue;
      }
    }
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || "";
      if (normalizeKey(h) === "VER_MAPA") {
        const link = extractLinkFromHtml(cells[idx] || "");
        if (link) obj[h] = link;
      }
    });

    const looksLikeData = Object.values(obj).some(Boolean) && (
      obj[headers.find((h) => normalizeKey(h) === "PLACA") || ""] ||
      obj[headers.find((h) => ["DATA", "FECHA"].includes(normalizeKey(h))) || ""]
    );
    if (looksLikeData) rows.push(obj);
  }

  return rows;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const raw = asString(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;
  const br = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (br) {
    const y = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    return `${y}-${pad2(Number(br[2]))}-${pad2(Number(br[1]))}`;
  }
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  return null;
}

function parseTimeText(value: unknown) {
  const raw = asString(value);
  if (!raw) return null;
  const m = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${pad2(Number(m[1]))}:${m[2]}:${m[3] || "00"}`;
}

function pick(obj: any, names: string[]) {
  if (!obj || typeof obj !== "object") return "";
  const normalized = new Map<string, string>();
  Object.keys(obj).forEach((k) => normalized.set(normalizeKey(k), k));
  for (const name of names) {
    const key = normalized.get(normalizeKey(name));
    if (key && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return "";
}

function columnsToHeaderArray(columns: any): string[] {
  if (!columns) return [];
  if (Array.isArray(columns)) {
    return columns.map((c: any, idx: number) => asString(c?.title || c?.label || c?.name || c?.data || c || `COLUNA_${idx + 1}`));
  }
  if (typeof columns === "object") {
    return Object.values(columns).map((v: any, idx: number) => asString(v || `COLUNA_${idx + 1}`));
  }
  return [];
}

function rowsFromArrayMatrix(rows: any[], columns: any): any[] {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0])) return [];
  const headers = columnsToHeaderArray(columns);
  if (!headers.length) return [];
  return rows.map((arr: any[]) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const cell = arr[idx] ?? "";
      const key = normalizeKey(h);
      obj[h] = key.startsWith("VER_MAPA") ? (extractLinkFromHtml(cell) || stripHtml(cell)) : stripHtml(cell);
    });
    return obj;
  });
}

function extractRows(payload: any): any[] {
  if (!payload) return [];

  if (typeof payload === "string") {
    const raw = payload.trim();
    if (!raw) return [];

    const htmlRows = parseHtmlTableRows(raw);
    if (htmlRows.length) return htmlRows;

    try {
      return extractRows(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  if (Array.isArray(payload)) return Array.isArray(payload[0]) ? rowsFromArrayMatrix(payload, null) : payload;
  if (typeof payload !== "object") return [];

  const matrixCandidates = [
    payload.data?.aaData,
    payload.data?.aadata,
    payload.aaData,
    payload.aadata,
    payload.data?.message?.aaData,
    payload.data?.message?.aadata,
  ];
  for (const matrix of matrixCandidates) {
    const rows = rowsFromArrayMatrix(matrix, payload.data?.columns || payload.columns || payload.data?.message?.columns);
    if (rows.length) return rows;
  }

  const candidates = [
    payload.data?.result,
    payload.data?.resultado,
    payload.data?.results,
    payload.data?.message,
    payload.data?.mensaje,
    payload.data?.data,
    payload.data?.aaData,
    payload.data?.rows,
    payload.data?.linhas,
    payload.data?.items,
    payload.data?.itens,
    payload.message,
    payload.mensaje,
    payload.result,
    payload.resultado,
    payload.results,
    payload.items,
    payload.itens,
    payload.rows,
    payload.linhas,
    payload.content,
    payload.report,
    payload.relatorio,
    payload.data,
  ];

  for (const item of candidates) {
    if (!item) continue;
    if (typeof item === "string") {
      const nested = extractRows(item);
      if (nested.length) return nested;
      continue;
    }
    if (Array.isArray(item)) return Array.isArray(item[0]) ? rowsFromArrayMatrix(item, payload.data?.columns || payload.columns) : item;
    if (item && typeof item === "object") {
      const values = Object.values(item);

      if (values.length && values.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
        const looksLikeRows = values.some((v: any) => {
          const keys = Object.keys(v || {}).map(normalizeKey);
          return keys.includes("PLACA") || keys.includes("FECHA") || keys.includes("DATA");
        });
        if (looksLikeRows) return values;
      }

      const nested = extractRows(item);
      if (nested.length) return nested;
    }
  }
  return [];
}

function buildHash(row: any) {
  return [row.data_evento || "", row.hora_evento || "", row.placa || "", row.endereco || "", row.latitude || "", row.longitude || ""]
    .map((v) => normalizeKey(String(v)))
    .join("|")
    .slice(0, 500);
}

async function loadIntegrationSecrets(supabase: any) {
  const cfg: Record<string, string> = {};
  const { data: integrations } = await supabase
    .from("ti_integracoes")
    .select("id,nome,codigo,base_url,auth_url,ativo")
    .eq("ativo", true);

  const bfleetIntegrations = (integrations || []).filter((item: any) => {
    const code = normalizeKey(`${item?.codigo || ""} ${item?.nome || ""}`);
    return code.includes("BFLEET") || code.includes("B_FLEET") || code.includes("FLEET");
  });

  for (const integ of bfleetIntegrations) {
    if (integ.base_url) cfg.API_BASE = asString(integ.base_url);
    if (integ.auth_url) cfg.AUTH_URL = asString(integ.auth_url);
    const { data: secrets } = await supabase
      .from("ti_integracao_segredos")
      .select("chave,valor,ativo")
      .eq("integracao_id", integ.id)
      .eq("ativo", true);
    for (const secret of secrets || []) {
      const k = normalizeKey(secret.chave);
      if (k) cfg[k] = asString(secret.valor);
    }
  }
  return cfg;
}

async function buildConfig(supabase: any, requestBody: any = {}) {
  const secrets = await loadIntegrationSecrets(supabase).catch(() => ({}));
  const env = (key: string) => Deno.env.get(key) || "";
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const normalized = normalizeKey(key);
      const val = secrets[normalized] || env(normalized) || env(key);
      if (val) return val;
    }
    return "";
  };
  return {
    baseUrl: get("BFLEET_API_BASE", "API_BASE", "BASE_URL").replace(/\/$/, ""),
    authUrl: get("BFLEET_AUTH_URL", "AUTH_URL"),
    apiKey: get("BFLEET_API_KEY", "API_KEY"),
    username: get("BFLEET_USERNAME", "USERNAME"),
    password: get("BFLEET_PASSWORD", "PASSWORD"),
    token: get("BFLEET_TOKEN", "TOKEN"),
    // Relatório "Fora do horário" da BFleet/OnReports. ID padrão 85075, mas pode ser
    // sobrescrito por requestBody.reportId ou pela chave ID_RELATORIO_FORA_HORARIO em ti_integracao_segredos.
    reportId: requestBody?.reportId || requestBody?.report_id || get("ID_RELATORIO_FORA_HORARIO", "BFLEET_FORA_HORARIO_REPORT_ID") || "85075",
    dataInicial: requestBody?.dataInicial || requestBody?.data_inicial || requestBody?.startDate || requestBody?.start_date || "",
    dataFinal: requestBody?.dataFinal || requestBody?.data_final || requestBody?.endDate || requestBody?.end_date || "",
    rangeTimeId: requestBody?.rangeTimeId || requestBody?.range_time_id || get("RANGO_TIEMPO_ID", "RANGE_TIME_ID"),
    rangeTimeVal: requestBody?.rangeTimeVal || requestBody?.range_time_val || "yesterday",
    webBaseUrl: (requestBody?.webBaseUrl || requestBody?.web_base_url || get("BFLEET_WEB_BASE", "WEB_BASE", "REPORTS_BASE", "RELATORIOS_BASE") || "https://relatorios.bfleet.com.br").replace(/\/$/, ""),
    webCookie: requestBody?.webCookie || requestBody?.web_cookie || get("BFLEET_WEB_COOKIE", "WEB_COOKIE", "RELATORIOS_COOKIE"),
    phpSessionId: requestBody?.phpSessionId || requestBody?.phpsessid || get("BFLEET_PHPSESSID", "PHPSESSID", "RELATORIOS_PHPSESSID"),
    webUsername: requestBody?.webUsername || requestBody?.web_username || get("BFLEET_WEB_USERNAME", "WEB_USERNAME", "RELATORIOS_USERNAME") || get("BFLEET_USERNAME", "USERNAME"),
    webPassword: requestBody?.webPassword || requestBody?.web_password || get("BFLEET_WEB_PASSWORD", "WEB_PASSWORD", "RELATORIOS_PASSWORD") || get("BFLEET_PASSWORD", "PASSWORD"),
    webLang: requestBody?.webLang || requestBody?.web_lang || get("BFLEET_WEB_LANG", "WEB_LANG") || "pt",
    preferWebReport: requestBody?.preferWebReport !== false,
  };
}

async function fetchJson(url: string, init: RequestInit, label: string) {
  const res = await fetch(url, init);
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${String(text || "").slice(0, 400)}`);
  return payload;
}

async function getToken(cfg: any) {
  if (cfg.token) return cfg.token;
  if (!cfg.baseUrl && !cfg.authUrl) throw new Error("Configure API_BASE ou AUTH_URL da BFleet.");
  if (!cfg.username || !cfg.password) throw new Error("Configure USERNAME e PASSWORD da BFleet.");

  const authUrls = Array.from(new Set([
    cfg.authUrl,
    `${cfg.baseUrl}/auth/login`,
    `${cfg.baseUrl}/api/auth/login`,
    `${cfg.baseUrl}/api/v1/auth/login`,
    `${cfg.baseUrl}/login`,
    `${cfg.baseUrl}/api/login`,
  ].filter(Boolean)));

  const bodies = [
    { username: cfg.username, password: cfg.password, apiKey: cfg.apiKey },
    { userName: cfg.username, password: cfg.password, apiKey: cfg.apiKey },
    { login: cfg.username, senha: cfg.password, apiKey: cfg.apiKey },
    { email: cfg.username, password: cfg.password, apiKey: cfg.apiKey },
  ];

  let last = "";
  for (const url of authUrls) {
    for (const body of bodies) {
      try {
        const payload = await fetchJson(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(cfg.apiKey ? { "x-api-key": cfg.apiKey, apikey: cfg.apiKey, Authorization: cfg.apiKey } : {}),
          },
          body: JSON.stringify(body),
        }, "Autenticação BFleet");
        const token = payload?.token || payload?.access_token || payload?.accessToken || payload?.jwt || payload?.data?.token || payload?.resultado?.token;
        if (token) return String(token);
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
    }
  }
  throw new Error(`Não foi possível autenticar na BFleet. Último retorno: ${last}`);
}

function joinUrl(base: string, path: string) {
  return `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

function getSetCookieHeaders(headers: Headers) {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof extended.getSetCookie === "function") return extended.getSetCookie().map(String);
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function mergeCookieHeader(current: string, setCookies: string[]) {
  const jar = new Map<string, string>();
  for (const pair of asString(current).split(/;\s*/)) {
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  for (const setCookie of setCookies) {
    const pair = asString(setCookie).split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

function configuredWebCookie(cfg: any) {
  if (asString(cfg.webCookie)) return asString(cfg.webCookie);
  return asString(cfg.phpSessionId) ? `PHPSESSID=${asString(cfg.phpSessionId)}` : "";
}

async function resolveWebCookie(cfg: any) {
  const username = asString(cfg.webUsername);
  const password = asString(cfg.webPassword);
  const fallback = configuredWebCookie(cfg);
  if (!username || !password) return fallback;

  const base = cfg.webBaseUrl || "https://relatorios.bfleet.com.br";
  const loginUrl = joinUrl(base, "/login");
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome Safari";
  let cookie = fallback;
  try {
    const pre = await fetch(loginUrl, { method: "GET", redirect: "manual", headers: { Accept: "text/html", "User-Agent": userAgent } });
    cookie = mergeCookieHeader(cookie, getSetCookieHeaders(pre.headers));
  } catch { /* POST ainda pode funcionar sem a sessão inicial. */ }

  const body = new URLSearchParams({ nick: username, passwd: password, cbLang: asString(cfg.webLang || "pt") || "pt" });
  const res = await fetch(loginUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: base,
      Referer: loginUrl,
      "User-Agent": userAgent,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body.toString(),
  });
  cookie = mergeCookieHeader(cookie, getSetCookieHeaders(res.headers));
  return cookie || fallback;
}

function formatBrDate(date: Date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function appendNestedForm(params: URLSearchParams, prefix: string, value: any) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) appendNestedForm(params, `${prefix}[${key}]`, nested);
    return;
  }
  params.append(prefix, asString(value));
}

function parseWebRows(text: string, columns: any) {
  const htmlRows = parseHtmlTableRows(text);
  if (htmlRows.length) return htmlRows;
  try {
    const parsed = JSON.parse(text);
    const rows = extractRows(parsed);
    if (rows.length) return rows;
  } catch { /* o portal também devolve arrays JavaScript, tratados abaixo. */ }
  try {
    const parsed = Function(`"use strict"; return (${text});`)();
    if (Array.isArray(parsed)) return Array.isArray(parsed[0]) ? rowsFromArrayMatrix(parsed, columns) : parsed;
    return extractRows(parsed);
  } catch {
    return [];
  }
}

async function loadSavedWebReport(cfg: any, cookie: string) {
  const url = joinUrl(cfg.webBaseUrl, "/ReportesFront/getDataReporteGuardado");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: cookie,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 Chrome Safari",
    },
    body: new URLSearchParams({ "data[idreporte_guardado]": String(cfg.reportId) }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Configuração web BFleet: HTTP ${res.status} ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Configuração web BFleet inválida: ${text.slice(0, 300)}`); }
}

async function fetchWebReport(cfg: any) {
  const cookie = await resolveWebCookie(cfg);
  if (!cookie) throw new Error("Configure as credenciais web da BFleet para consultar o relatório Fora do horário.");
  const dataJson = await loadSavedWebReport(cfg, cookie);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (cfg.dataInicial && cfg.dataFinal) {
    dataJson.fecha_inicio = toIsoDate(cfg.dataInicial) || cfg.dataInicial;
    dataJson.fecha_fin = toIsoDate(cfg.dataFinal) || cfg.dataFinal;
  } else if (normalizeKey(cfg.rangeTimeVal) === "YESTERDAY") {
    dataJson.fecha_inicio = formatBrDate(yesterday);
    dataJson.fecha_fin = formatBrDate(yesterday);
  }
  dataJson.hora_inicio = "00:00:00";
  dataJson.hora_fin = "23:59:59";

  const params = new URLSearchParams();
  appendNestedForm(params, "data", dataJson);
  const url = joinUrl(cfg.webBaseUrl, "/reportesfront/resultadoreporte");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: cfg.webBaseUrl,
      Referer: joinUrl(cfg.webBaseUrl, "/new-reports"),
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 Chrome Safari",
      Cookie: cookie,
    },
    body: params.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Endpoint web BFleet ${url}: HTTP ${res.status} ${text.slice(0, 300)}`);
  const reportCookie = mergeCookieHeader(cookie, getSetCookieHeaders(res.headers));
  let rows = parseWebRows(text, dataJson.caja_multisel_columnas);
  let endpoint = url;
  if (!rows.length && text.includes("/reportesback/flotaFueraHorario")) {
    const dataUrl = joinUrl(cfg.webBaseUrl, "/reportesback/flotaFueraHorario");
    const runtimeDataMatch = text.match(/dataJson\s*=\s*(\{[\s\S]*?\});\/\/se cambian/);
    let runtimeData = dataJson;
    if (runtimeDataMatch?.[1]) {
      try { runtimeData = JSON.parse(runtimeDataMatch[1]); } catch { runtimeData = dataJson; }
    }
    const savedReportIds = Array.from(text.matchAll(/idreporte_guardado\s*=\s*(\d+)/g)).map((match) => match[1]).filter((id) => id !== "0");
    const uniqueIds = Array.from(text.matchAll(/uniq_id\s*=\s*["']([^"']+)["']/g)).map((match) => match[1]).filter(Boolean);
    const savedReportId = savedReportIds[savedReportIds.length - 1] || String(cfg.reportId);
    const uniqueId = uniqueIds[uniqueIds.length - 1] || "painel_sync";
    const dataParams = new URLSearchParams();
    appendNestedForm(dataParams, "dataJson", runtimeData);
    dataParams.set("idreporte_guardado", savedReportId);
    dataParams.set("uniq_id", uniqueId);
    const dataResponse = await fetch(dataUrl, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: cfg.webBaseUrl,
        Referer: joinUrl(cfg.webBaseUrl, "/new-reports"),
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 Chrome Safari",
        Cookie: reportCookie,
      },
      body: dataParams.toString(),
    });
    const dataText = await dataResponse.text();
    if (!dataResponse.ok) throw new Error(`Endpoint web BFleet ${dataUrl}: HTTP ${dataResponse.status} ${dataText.slice(0, 300)}`);
    rows = parseWebRows(dataText, runtimeData.caja_multisel_columnas || dataJson.caja_multisel_columnas);
    endpoint = dataUrl;
    const emptyPayload = dataText.trim();
    if (!rows.length && ["", "[]", "{}", "null"].includes(emptyPayload)) return { rows: [], endpoint };
    if (!rows.length) {
      try {
        JSON.parse(emptyPayload);
        return { rows: [], endpoint };
      } catch { /* HTML/JavaScript inesperado continua para o diagnóstico abaixo. */ }
    }
  }
  if (!rows.length) {
    const routes = Array.from(text.matchAll(/["'](\/[A-Za-z][A-Za-z0-9_-]+\/[A-Za-z][A-Za-z0-9_-]+)["']/g)).map((m) => m[1]);
    const ajaxIndex = Math.max(text.indexOf("ajax"), text.indexOf("dataTable"), text.indexOf("DataTable"));
    const diagnostic = ajaxIndex >= 0 ? stripHtml(text.slice(Math.max(0, ajaxIndex - 500), ajaxIndex + 1800)) : stripHtml(text).slice(0, 500);
    throw new Error(`Endpoint web BFleet ${url} não retornou linhas diretamente. Rotas: ${Array.from(new Set(routes)).slice(0, 30).join(", ")}. Diagnóstico: ${diagnostic}`);
  }
  return { rows, endpoint };
}

function getOnReportsEndpoint(baseUrl: string) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (/\/api\/v1$/i.test(base)) return joinUrl(base, "/onreports/getScheduledReportResult");
  if (/\/api\/v1\/onreports$/i.test(base)) return joinUrl(base, "/getScheduledReportResult");
  return joinUrl(base, "/api/v1/onreports/getScheduledReportResult");
}

function payloadDiagnostic(payload: any) {
  const message = payload?.data?.message ?? payload?.message ?? payload?.data?.mensaje ?? payload?.mensaje ?? "";
  return {
    status: payload?.status ?? payload?.data?.status ?? null,
    topKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : [],
    dataKeys: payload?.data && typeof payload.data === "object" ? Object.keys(payload.data).slice(0, 20) : [],
    resultType: typeof payload?.data?.result,
    resultIsArray: Array.isArray(payload?.data?.result),
    messagePreview: typeof message === "string" ? stripHtml(message).slice(0, 500) : JSON.stringify(message || {}).slice(0, 500),
  };
}

async function fetchReport(cfg: any, token: string) {
  if (!cfg.baseUrl) throw new Error("Configure API_BASE da BFleet/Service24GPS.");
  if (!cfg.apiKey) throw new Error("Configure API_KEY da BFleet/Service24GPS.");
  if (!token) throw new Error("Configure TOKEN da BFleet/Service24GPS ou habilite a autenticação automática.");
  if (!cfg.reportId) throw new Error("Configure o ID do relatório Fora do horário em ID_RELATORIO_FORA_HORARIO ou informe reportId no corpo da requisição.");

  const onReportsUrl = getOnReportsEndpoint(cfg.baseUrl);
  let last = "";
  let lastPayloadInfo: any = null;

  try {
    const form = new FormData();
    form.append("apikey", cfg.apiKey);
    form.append("token", token);
    form.append("report_id", cfg.reportId);
    if (cfg.rangeTimeId) form.append("range_time_id", String(cfg.rangeTimeId));
    if (cfg.rangeTimeVal) form.append("range_time_val", String(cfg.rangeTimeVal));
    const payload = await fetchJson(onReportsUrl, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    }, "Relatório programado BFleet");
    const rows = extractRows(payload);
    if (rows.length) return { payload, rows, endpoint: onReportsUrl };
    lastPayloadInfo = payloadDiagnostic(payload);
    last = `Endpoint ${onReportsUrl} respondeu, mas não retornou linhas em data.result.`;
  } catch (err) {
    last = err instanceof Error ? err.message : String(err);
  }

  try {
    const payload = await fetchJson(onReportsUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: cfg.apiKey, token, report_id: cfg.reportId, range_time_id: cfg.rangeTimeId || undefined, range_time_val: cfg.rangeTimeVal || undefined }),
    }, "Relatório programado BFleet");
    const rows = extractRows(payload);
    if (rows.length) return { payload, rows, endpoint: onReportsUrl };
    lastPayloadInfo = payloadDiagnostic(payload);
    last = `Endpoint JSON ${onReportsUrl} respondeu, mas não retornou linhas em data.result.`;
  } catch (err) {
    last = err instanceof Error ? err.message : String(err);
  }

  throw new Error(
    `Não foi possível ler linhas do relatório Fora do horário (ID ${cfg.reportId}) pelo endpoint programado da BFleet. ${last} ` +
    `Se esta conta tiver a mesma limitação já observada no relatório de Excesso de velocidade (JSON vazio em getScheduledReportResult), ` +
    `será necessário abrir o relatório "Fora do horário" no site relatorios.bfleet.com.br, capturar a URL/payload chamado pela tela (aba Rede do navegador) ` +
    `e adaptar esta function para usar esse endpoint web, como foi feito em sync-bfleet-excesso-velocidade. ` +
    `Diagnóstico: ${JSON.stringify(lastPayloadInfo || {})}`
  );
}

function mapReportRow(row: any, arquivoNome = "BFleet API") {
  const placa = onlyPlate(pick(row, ["Placa", "plate", "vehiclePlate", "patente", "licensePlate", "placaVeiculo"]));
  const dataEvento = toIsoDate(pick(row, ["Data", "Fecha", "Inicio", "date", "data_evento", "Data Evento", "Fecha Evento", "eventDate", "dateTime", "Data/Hora", "Data Hora", "Fecha/Hora", "Fecha Hora"]));
  if (!placa || !dataEvento) return null;
  const mapped: any = {
    data_evento: dataEvento,
    hora_evento: parseTimeText(pick(row, ["Hora", "Inicio", "time", "hora_evento", "Data/Hora", "Data Hora", "Fecha/Hora", "Fecha Hora", "dateTime"])),
    alerta: normalizeText(pick(row, ["Alerta", "alert", "Evento", "event", "Descrição", "Descricao"])) || "Fora do horário",
    ativo_rastreador: normalizeText(pick(row, ["Ativo", "Veículo", "Veiculo", "Vehicle", "Nome Veículo", "Nome Veiculo", "vehicleName"])),
    placa,
    motorista_planilha: normalizeText(pick(row, ["Motorista", "Condutor", "Driver", "driverName", "Nome Motorista"])),
    endereco: normalizeText(pick(row, ["Endereço", "Endereco", "Domicilio Inicial", "Domicilio", "Lugar", "Address", "Local", "location"])),
    latitude: normalizeNumber(pick(row, ["Latitude", "Lat"])),
    longitude: normalizeNumber(pick(row, ["Longitude", "Long", "Lng"])),
    mapa_url: normalizeText(pick(row, ["Ver mapa inicio", "Ver mapa início", "Ver mapa", "Mapa", "Map", "mapUrl"])),
    arquivo_nome: arquivoNome,
    origem: "bfleet_api",
    raw: row,
  };
  mapped.import_hash = buildHash(mapped);
  return mapped;
}

function isBrasiliaOutsideHours(row: any) {
  const time = parseTimeText(row?.hora_evento);
  return Boolean(time && time >= "00:00:00" && time < "05:00:00");
}

async function loadVehicleMap(supabase: any, placas: string[]) {
  const desired = new Set((placas || []).map((p) => onlyPlate(p)).filter(Boolean));
  const map = new Map<string, any>();
  let from = 0;
  const size = 1000;

  while (from < 20000) {
    const { data, error } = await supabase
      .from("frotas_veiculos")
      .select("id,placa,motorista_atual,patrimonio_funcionario,coordenacao,supervisao,patrimonio_coordenacao,patrimonio_supervisao")
      .range(from, from + size - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    for (const v of rows) {
      const plate = onlyPlate(v.placa);
      if (plate && (!desired.size || desired.has(plate))) map.set(plate, v);
    }
    if (rows.length < size) break;
    from += size;
  }
  return map;
}

function extractPlateFromText(value: unknown) {
  const text = asString(value).toUpperCase();
  const mercosul = text.match(/\b[A-Z]{3}[0-9][A-Z][0-9]{2}\b/);
  if (mercosul) return onlyPlate(mercosul[0]);
  const antigo = text.match(/\b[A-Z]{3}[0-9]{4}\b/);
  if (antigo) return onlyPlate(antigo[0]);
  return "";
}

async function loadPatrimonioMap(supabase: any) {
  const map = new Map<string, any>();
  let from = 0;
  const size = 1000;
  while (from < 10000) {
    const { data, error } = await supabase
      .from("patrimonios_snapshot")
      .select("id,patrimonio_codigo,coordenacao,supervisao,funcionario,identificacao,categoria,situacao,ultima_leitura")
      .range(from, from + size - 1);
    if (error) break;
    const rows = Array.isArray(data) ? data : [];
    for (const r of rows) {
      const plate = extractPlateFromText(r.identificacao);
      if (!plate) continue;
      const categoria = normalizeKey(r.categoria);
      const situacao = normalizeKey(r.situacao);
      if (categoria && !categoria.includes("VEICULO")) continue;
      if (situacao && !situacao.includes("ATIVO")) continue;
      map.set(plate, r);
    }
    if (rows.length < size) break;
    from += size;
  }
  return map;
}

async function syncForaHorario(supabase: any, requestBody: any = {}) {
  const cfg = await buildConfig(supabase, requestBody);
  let report: any;
  let webError = "";
  if (cfg.preferWebReport) {
    try {
      report = await fetchWebReport(cfg);
    } catch (err) {
      webError = err instanceof Error ? err.message : String(err);
    }
  }
  if (!report) {
    const token = await getToken(cfg);
    try {
      report = await fetchReport(cfg, token);
    } catch (err) {
      const apiError = err instanceof Error ? err.message : String(err);
      throw new Error(`${webError ? `Falha no relatório web: ${webError}. ` : ""}Falha no relatório programado: ${apiError}`);
    }
  }

  const mappedAll = report.rows.map((r: any) => mapReportRow(r, `BFleet · relatório ${cfg.reportId}`)).filter(Boolean) as any[];
  const mapped = mappedAll.filter(isBrasiliaOutsideHours);

  const placas = Array.from(new Set(mapped.map((r) => r.placa).filter(Boolean)));
  const vehicleMap = await loadVehicleMap(supabase, placas).catch(() => new Map());
  const patrimonioMap = await loadPatrimonioMap(supabase).catch(() => new Map());

  const cruzados = mapped.map((r) => {
    const v = vehicleMap.get(r.placa);
    const p = patrimonioMap.get(r.placa);
    const motorista = p?.funcionario || v?.patrimonio_funcionario || v?.motorista_atual || r.motorista_planilha || null;
    return {
      ...r,
      bfleet_report_id: String(cfg.reportId || ""),
      patrimonio_id: p?.id || null,
      patrimonio_codigo: p?.patrimonio_codigo || null,
      patrimonio_funcionario: motorista,
      patrimonio_identificacao: p?.identificacao || null,
      coordenacao: p?.coordenacao || v?.coordenacao || v?.patrimonio_coordenacao || null,
      supervisao: p?.supervisao || v?.supervisao || v?.patrimonio_supervisao || null,
      status_cruzamento: motorista ? "MOTORISTA_IDENTIFICADO" : "PENDENTE_CONFERENCIA",
    };
  });

  let insertedOrUpdated = 0;
  for (let i = 0; i < cruzados.length; i += 500) {
    const batch = cruzados.slice(i, i + 500);
    const { error } = await supabase.from("frotas_fora_horario").upsert(batch, { onConflict: "import_hash" });
    if (error) throw new Error(error.message || "Falha ao gravar registros de fora do horário.");
    insertedOrUpdated += batch.length;
  }

  const importedDates = Array.from(new Set(mappedAll.map((r) => r.data_evento).filter(Boolean)));
  if (importedDates.length) {
    const { error: cleanupError } = await supabase
      .from("frotas_fora_horario")
      .delete()
      .eq("origem", "bfleet_api")
      .in("data_evento", importedDates)
      .or("hora_evento.is.null,hora_evento.gte.05:00:00");
    if (cleanupError) throw new Error(cleanupError.message || "Falha ao remover registros fora da janela de 00h às 05h.");
  }

  return {
    ok: true,
    endpoint: report.endpoint,
    periodo_inicio: cfg.dataInicial || cfg.rangeTimeVal || "yesterday",
    periodo_fim: cfg.dataFinal || cfg.rangeTimeVal || "yesterday",
    total: mapped.length,
    total_origem: mappedAll.length,
    descartados_fora_da_janela: mappedAll.length - mapped.length,
    janela_horario_brasilia: "00:00:00-04:59:59",
    upserted: insertedOrUpdated,
    inserted: insertedOrUpdated,
    updated: 0,
    identificados: cruzados.filter((r) => r.patrimonio_funcionario).length,
    pendentes: cruzados.filter((r) => !r.patrimonio_funcionario).length,
    mapas_validos: cruzados.filter((r) => /^https?:\/\//i.test(asString(r.mapa_url))).length,
    placas: placas.length,
    web_fallback_error: webError || null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    let requestBody: any = {};
    try { requestBody = await req.json(); } catch { requestBody = {}; }
    const result = await syncForaHorario(supabase, requestBody);
    return json(result);
  } catch (err) {
    console.error("[sync-bfleet-fora-horario]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
