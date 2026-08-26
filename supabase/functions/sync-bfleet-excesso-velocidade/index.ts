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
    .replace(/[\u0300-\u036f]/g, "")
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
  const cleaned = asString(value)
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
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
        return [
          "DATA", "FECHA", "HORA", "PLACA", "MOTORISTA", "CONDUCTOR",
          "VELOCIDADE", "VELOCIDAD", "ENDERECO", "DOMICILIO",
          "LATITUDE", "LONGITUDE", "VER_MAPA",
        ].includes(k);
      });
      if (hasKnownHeader) {
        headers = normalizedHeaders;
        continue;
      }
    }

    if (!headers.length) {
      if (values.length >= 10) {
        headers = ["Data", "Hora", "Alerta", "Ativo", "Placa", "Motorista", "Velocidade", "Endereco", "Latitude", "Longitude", "Ver mapa"];
      } else {
        continue;
      }
    }

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const cell = cells[idx] || "";
      const key = normalizeKey(h);
      obj[h] = key.startsWith("VER_MAPA") ? (extractLinkFromHtml(cell) || stripHtml(cell)) : stripHtml(cell);
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
  if (!Number.isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }
  return null;
}

function toBfleetDate(value: unknown) {
  const iso = toIsoDate(value);
  return iso ? iso.split("-").reverse().join("/") : asString(value);
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
  let headers = columnsToHeaderArray(columns);
  if (!headers.length && rows[0].length >= 10) {
    headers = ["Data", "Hora", "Alerta", "Ativo", "Placa", "Motorista", "Velocidade", "Endereco", "Latitude", "Longitude", "Ver mapa"];
  }
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
    if (Array.isArray(item)) {
      return Array.isArray(item[0]) ? rowsFromArrayMatrix(item, payload.data?.columns || payload.columns) : item;
    }
    if (item && typeof item === "object") {
      const values = Object.values(item);
      if (values.length && values.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
        const looksLikeRows = values.some((v: any) => {
          const keys = Object.keys(v || {}).map(normalizeKey);
          return keys.includes("PLACA") || keys.includes("FECHA") || keys.includes("DATA") || keys.includes("VELOCIDAD") || keys.includes("VELOCIDADE");
        });
        if (looksLikeRows) return values;
      }
      const nested = extractRows(item);
      if (nested.length) return nested;
    }
  }

  return [];
}

function extractPlateFromText(value: unknown) {
  const text = asString(value).toUpperCase();
  const mercosul = text.match(/\b[A-Z]{3}[0-9][A-Z][0-9]{2}\b/);
  if (mercosul) return onlyPlate(mercosul[0]);
  const antigo = text.match(/\b[A-Z]{3}[0-9]{4}\b/);
  if (antigo) return onlyPlate(antigo[0]);
  return "";
}

function buildHash(row: any) {
  return [row.data_evento || "", row.hora_evento || "", row.placa || "", row.velocidade || "", row.latitude || "", row.longitude || ""]
    .map((v) => normalizeKey(String(v)))
    .join("|")
    .slice(0, 500);
}

async function loadIntegrationSecrets(supabase: any) {
  const cfg: Record<string, string> = {};
  const { data: integrations, error: integrationsError } = await supabase
    .from("ti_integracoes")
    .select("id,nome,codigo,base_url,auth_url,ativo")
    .eq("ativo", true);
  if (integrationsError) throw integrationsError;

  const bfleetIntegrations = (integrations || []).filter((item: any) => {
    const code = normalizeKey(`${item?.codigo || ""} ${item?.nome || ""}`);
    return code.includes("BFLEET") || code.includes("B_FLEET") || code.includes("FLEET");
  });

  for (const integ of bfleetIntegrations) {
    if (integ.base_url) cfg.API_BASE = asString(integ.base_url);
    if (integ.auth_url) cfg.AUTH_URL = asString(integ.auth_url);
    const { data: secrets, error: secretsError } = await supabase
      .from("ti_integracao_segredos")
      .select("chave,valor,ativo")
      .eq("integracao_id", integ.id)
      .eq("ativo", true);
    if (secretsError) throw secretsError;
    for (const secret of secrets || []) {
      const k = normalizeKey(secret.chave);
      if (k) cfg[k] = asString(secret.valor);
    }
  }

  return cfg;
}

async function buildConfig(supabase: any, requestBody: any = {}) {
  const secrets = await loadIntegrationSecrets(supabase).catch(() => ({} as Record<string, string>));
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
    reportId: requestBody?.reportId || requestBody?.report_id || get(
      "BFLEET_REPORT_ID",
      "ID_RELATORIO_EXCESSO_VELOCIDADE",
      "IDRELATORIOSALVO",
      "ID_RELATORIO_SALVO",
      "RELATORIO_EXCESSO_ID",
      "REPORT_ID",
    ) || "85055",
    dataInicial: requestBody?.dataInicial || requestBody?.data_inicial || requestBody?.startDate || requestBody?.start_date || get("DATA_INICIAL", "BFLEET_DATA_INICIAL") || "",
    dataFinal: requestBody?.dataFinal || requestBody?.data_final || requestBody?.endDate || requestBody?.end_date || get("DATA_FINAL", "BFLEET_DATA_FINAL") || "",
    rangeTimeVal: requestBody?.rangeTimeVal || requestBody?.range_time_val || get("RANGO_TIEMPO_VAL", "RANGE_TIME_VAL", "RANGO_TEMPO_VAL", "PERIODO_RAPIDO_VAL") || "yesterday",
    webBaseUrl: (requestBody?.webBaseUrl || requestBody?.web_base_url || get("BFLEET_WEB_BASE", "WEB_BASE", "REPORTS_BASE", "RELATORIOS_BASE") || "https://relatorios.bfleet.com.br").replace(/\/$/, ""),
    webCookie: requestBody?.webCookie || requestBody?.web_cookie || get("BFLEET_WEB_COOKIE", "WEB_COOKIE", "RELATORIOS_COOKIE"),
    phpSessionId: requestBody?.phpSessionId || requestBody?.phpsessid || get("BFLEET_PHPSESSID", "PHPSESSID", "RELATORIOS_PHPSESSID"),
    webUsername: requestBody?.webUsername || requestBody?.web_username || get("BFLEET_WEB_USERNAME", "WEB_USERNAME", "RELATORIOS_USERNAME") || get("BFLEET_USERNAME", "USERNAME"),
    webPassword: requestBody?.webPassword || requestBody?.web_password || get("BFLEET_WEB_PASSWORD", "WEB_PASSWORD", "RELATORIOS_PASSWORD") || get("BFLEET_PASSWORD", "PASSWORD"),
    webLang: requestBody?.webLang || requestBody?.web_lang || get("BFLEET_WEB_LANG", "WEB_LANG") || "pt",
  };
}

function joinUrl(base: string, path: string) {
  return `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (![502, 503, 504].includes(response.status) || attempt === attempts) return response;
      try { await response.body?.cancel(); } catch { /* descartada antes da nova tentativa */ }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  throw lastError instanceof Error ? lastError : new Error("Falha ao conectar à BFleet.");
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

function looksLikeLoginPage(text: string) {
  return /name=["']nick["']|name=["']passwd["']|id=["']btnLogin["']/i.test(text);
}

async function resolveWebCookie(cfg: any) {
  const username = asString(cfg.webUsername);
  const password = asString(cfg.webPassword);
  const fallback = configuredWebCookie(cfg);
  if (!username || !password) {
    if (!fallback) throw new Error("Credenciais web da BFleet não configuradas.");
    return fallback;
  }

  const base = cfg.webBaseUrl || "https://relatorios.bfleet.com.br";
  const loginUrl = joinUrl(base, "/login");
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome Safari";
  let cookie = fallback;

  try {
    const pre = await fetchWithRetry(loginUrl, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "text/html", "User-Agent": userAgent },
    });
    cookie = mergeCookieHeader(cookie, getSetCookieHeaders(pre.headers));
  } catch {
    // O POST ainda pode funcionar sem a sessão inicial.
  }

  const body = new URLSearchParams({
    nick: username,
    passwd: password,
    cbLang: asString(cfg.webLang || "pt") || "pt",
  });

  const res = await fetchWithRetry(loginUrl, {
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

  if (!cookie) throw new Error(`Login BFleet não retornou cookie de sessão. HTTP ${res.status}.`);

  const check = await fetchWithRetry(joinUrl(base, "/new-reports"), {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html",
      "User-Agent": userAgent,
      Cookie: cookie,
    },
  });
  const checkText = await check.text();
  if (!check.ok || looksLikeLoginPage(checkText)) {
    throw new Error(`Login web BFleet não autenticado. HTTP ${check.status}.`);
  }

  return cookie;
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
  const raw = asString(text).replace(/(\r\n|\n|\r)/g, " ").trim();
  if (!raw) return [];
  const htmlRows = parseHtmlTableRows(raw);
  if (htmlRows.length) return htmlRows;
  try {
    const parsed = JSON.parse(raw);
    const rows = extractRows(parsed);
    if (rows.length) return rows;
  } catch {
    // Pode ser um array/objeto JavaScript da própria tela.
  }
  try {
    const parsed = Function(`"use strict"; return (${raw});`)();
    if (Array.isArray(parsed)) return Array.isArray(parsed[0]) ? rowsFromArrayMatrix(parsed, columns) : parsed;
    return extractRows(parsed);
  } catch {
    return [];
  }
}

function parseJsObject(raw: string) {
  try { return JSON.parse(raw); } catch { /* tenta expressão JS */ }
  try { return Function(`"use strict"; return (${raw});`)(); } catch { return null; }
}

async function loadSavedWebReport(cfg: any, cookie: string) {
  const url = joinUrl(cfg.webBaseUrl, "/ReportesFront/getDataReporteGuardado");
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: cookie,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 Chrome Safari",
    },
    body: new URLSearchParams({ "data[idreporte_guardado]": String(cfg.reportId || "85055") }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Configuração web BFleet: HTTP ${res.status} ${stripHtml(text).slice(0, 300)}`);
  if (looksLikeLoginPage(text)) throw new Error("A BFleet devolveu a tela de login ao carregar o relatório salvo.");

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Configuração web BFleet inválida: ${stripHtml(text).slice(0, 300)}`);
  }

  if (parsed?.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) {
    const d = parsed.data;
    if (d.idreporte || d.caja_multisel_activos || d.caja_multisel_columnas || d.fecha_inicio !== undefined) return d;
  }
  return parsed;
}

function buildAssetMapByPlate(dataJson: any) {
  const map = new Map<string, any>();
  const ativos = dataJson?.caja_multisel_activos || {};
  for (const [assetId, assetName] of Object.entries(ativos)) {
    const plate = extractPlateFromText(assetName);
    if (!plate) continue;
    map.set(plate, {
      bfleet_vehicle_id: String(assetId),
      bfleet_ativo_nome: normalizeText(assetName),
    });
  }
  return map;
}

function isClearlyEmptyPayload(text: string) {
  const raw = text.trim();
  if (["", "[]", "{}", "null", "false"].includes(raw)) return true;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 0) return true;
    if (parsed && typeof parsed === "object") {
      const rows = extractRows(parsed);
      if (rows.length) return false;
      const candidates = [parsed.data, parsed.result, parsed.rows, parsed.items, parsed.aaData];
      if (candidates.some((v) => Array.isArray(v) && v.length === 0)) return true;
    }
  } catch {
    // Não é JSON vazio.
  }
  return false;
}

async function fetchWebReport(cfg: any) {
  const cookie = await resolveWebCookie(cfg);
  const dataJson = await loadSavedWebReport(cfg, cookie);
  if (!dataJson || typeof dataJson !== "object") throw new Error("Relatório salvo BFleet 85055 sem configuração utilizável.");

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (cfg.dataInicial && cfg.dataFinal) {
    dataJson.fecha_inicio = toBfleetDate(cfg.dataInicial);
    dataJson.fecha_fin = toBfleetDate(cfg.dataFinal);
  } else if (normalizeKey(cfg.rangeTimeVal) === "YESTERDAY") {
    dataJson.fecha_inicio = formatBrDate(yesterday);
    dataJson.fecha_fin = formatBrDate(yesterday);
  }
  dataJson.hora_inicio = dataJson.hora_inicio || "00:00:00";
  dataJson.hora_fin = dataJson.hora_fin || "23:59:59";
  dataJson.filter_velocidad = "120";

  const pageParams = new URLSearchParams();
  appendNestedForm(pageParams, "data", dataJson);
  const pageUrl = joinUrl(cfg.webBaseUrl, "/reportesfront/resultadoreporte");
  const pageRes = await fetchWithRetry(pageUrl, {
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
    body: pageParams.toString(),
  });
  const pageText = await pageRes.text();
  if (!pageRes.ok) throw new Error(`Preparação do relatório BFleet: HTTP ${pageRes.status} ${stripHtml(pageText).slice(0, 300)}`);
  if (looksLikeLoginPage(pageText)) throw new Error("A sessão BFleet expirou ao preparar o relatório.");

  const pageCookie = mergeCookieHeader(cookie, getSetCookieHeaders(pageRes.headers));
  const directRows = parseWebRows(pageText, dataJson.caja_multisel_columnas);
  if (directRows.length) {
    return {
      rows: directRows,
      endpoint: pageUrl,
      dataJson,
      assetMapByPlate: buildAssetMapByPlate(dataJson),
    };
  }

  let runtimeData = dataJson;
  const runtimePatterns = [
    /dataJson\s*=\s*(\{[\s\S]*?\});\s*\/\/se cambian/i,
    /dataJson\s*=\s*(\{[\s\S]*?\});/i,
  ];
  for (const pattern of runtimePatterns) {
    const match = pageText.match(pattern);
    if (!match?.[1]) continue;
    const parsed = parseJsObject(match[1]);
    if (parsed && typeof parsed === "object") {
      runtimeData = parsed;
      break;
    }
  }

  runtimeData.fecha_inicio = dataJson.fecha_inicio;
  runtimeData.fecha_fin = dataJson.fecha_fin;
  runtimeData.hora_inicio = dataJson.hora_inicio;
  runtimeData.hora_fin = dataJson.hora_fin;
  runtimeData.filter_velocidad = "120";

  const savedReportIds = Array.from(pageText.matchAll(/idreporte_guardado\s*=\s*["']?(\d+)["']?/g)).map((m) => m[1]).filter((id) => id !== "0");
  const uniqueIds = Array.from(pageText.matchAll(/uniq_id\s*=\s*["']([^"']+)["']/g)).map((m) => m[1]).filter(Boolean);
  const savedReportId = savedReportIds[savedReportIds.length - 1] || String(cfg.reportId || "85055");
  const uniqueId = uniqueIds[uniqueIds.length - 1] || "painel_sync";

  const dataParams = new URLSearchParams();
  appendNestedForm(dataParams, "dataJson", runtimeData);
  dataParams.set("idreporte_guardado", savedReportId);
  dataParams.set("uniq_id", uniqueId);

  const dataUrl = joinUrl(cfg.webBaseUrl, "/reportesback/excesosVelocidad");
  const dataRes = await fetchWithRetry(dataUrl, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: cfg.webBaseUrl,
      Referer: joinUrl(cfg.webBaseUrl, "/new-reports"),
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 Chrome Safari",
      Cookie: pageCookie,
    },
    body: dataParams.toString(),
  });
  const dataText = await dataRes.text();
  if (!dataRes.ok) throw new Error(`Endpoint web BFleet ${dataUrl}: HTTP ${dataRes.status} ${stripHtml(dataText).slice(0, 300)}`);
  if (looksLikeLoginPage(dataText)) throw new Error("A BFleet devolveu a tela de login no endpoint de excesso de velocidade.");

  const rows = parseWebRows(dataText, runtimeData.caja_multisel_columnas || dataJson.caja_multisel_columnas);
  const assetMapByPlate = buildAssetMapByPlate(runtimeData);
  if (rows.length) return { rows, endpoint: dataUrl, dataJson: runtimeData, assetMapByPlate };

  if (isClearlyEmptyPayload(dataText)) {
    return { rows: [], endpoint: dataUrl, dataJson: runtimeData, assetMapByPlate };
  }

  throw new Error(
    `Endpoint web BFleet ${dataUrl} respondeu sem linhas em formato reconhecido. ` +
    `Prévia: ${stripHtml(dataText).slice(0, 500)}`,
  );
}

function mapReportRow(row: any, arquivoNome = "BFleet API") {
  const placa = onlyPlate(pick(row, ["Placa", "plate", "vehiclePlate", "patente", "licensePlate", "placaVeiculo"]));
  const dataEvento = toIsoDate(pick(row, ["Data", "Fecha", "date", "data_evento", "Data Evento", "Fecha Evento", "eventDate", "dateTime", "Data/Hora", "Data Hora", "Fecha/Hora", "Fecha Hora"]));
  const velocidade = normalizeNumber(pick(row, ["Velocidade", "Velocidad", "speed", "Velocidade Km/h", "Velocidad Km/h", "velocity", "maximumSpeed", "max_speed", "velocidad"]));
  if (!placa || !dataEvento || velocidade === null) return null;

  const mapped: any = {
    data_evento: dataEvento,
    hora_evento: parseTimeText(pick(row, ["Hora", "time", "hora_evento", "Data/Hora", "Data Hora", "Fecha/Hora", "Fecha Hora", "dateTime"])),
    alerta: normalizeText(pick(row, ["Alerta", "alert", "Evento", "event", "Descrição", "Descricao"])) || "Excesso de velocidade",
    ativo_rastreador: normalizeText(pick(row, ["Ativo", "Veículo", "Veiculo", "Vehicle", "Nome Veículo", "Nome Veiculo", "vehicleName"])),
    placa,
    motorista_planilha: normalizeText(pick(row, ["Motorista", "Condutor", "Conductor", "Driver", "driverName", "Nome Motorista"])),
    velocidade,
    endereco: normalizeText(pick(row, ["Endereço", "Endereco", "Direccion", "Dirección", "Domicilio", "Lugar", "Address", "Local", "location"])),
    latitude: normalizeNumber(pick(row, ["Latitude", "Lat", "Latitud"])),
    longitude: normalizeNumber(pick(row, ["Longitude", "Long", "Lng", "Longitud"])),
    mapa_url: normalizeText(pick(row, ["Ver mapa", "Mapa", "Map", "mapUrl"])),
    arquivo_nome: arquivoNome,
    origem: "bfleet_api",
    status_notificacao: "PENDENTE",
    raw: row,
  };
  mapped.import_hash = buildHash(mapped);
  return mapped;
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

async function syncBfleetVehicleIds(supabase: any, vehicleMap: Map<string, any>, assetMapByPlate: Map<string, any>) {
  let updated = 0;
  for (const [placa, asset] of assetMapByPlate.entries()) {
    const v = vehicleMap.get(placa);
    if (!v?.id) continue;
    const { error } = await supabase
      .from("frotas_veiculos")
      .update({
        bfleet_vehicle_id: asset.bfleet_vehicle_id,
        bfleet_ativo_nome: asset.bfleet_ativo_nome,
        possui_rastreador: true,
        rastreador_origem: "BFLEET",
        bfleet_sync_at: new Date().toISOString(),
      })
      .eq("id", v.id);
    if (!error) updated += 1;
  }
  return updated;
}

async function syncExcessos(supabase: any, requestBody: any = {}) {
  const cfg = await buildConfig(supabase, requestBody);
  const report = await fetchWebReport(cfg);
  const mapped = report.rows
    .map((r: any) => mapReportRow(r, `BFleet · relatório ${cfg.reportId}`))
    .filter(Boolean) as any[];

  if (!mapped.length) {
    return {
      ok: true,
      endpoint: report.endpoint,
      relatorio_id: String(cfg.reportId),
      periodo_inicio: cfg.dataInicial || cfg.rangeTimeVal || "yesterday",
      periodo_fim: cfg.dataFinal || cfg.rangeTimeVal || "yesterday",
      limite_velocidade_kmh: 120,
      total: 0,
      upserted: 0,
      inserted: 0,
      updated: 0,
      identificados: 0,
      pendentes: 0,
      placas: 0,
      veiculos_bfleet_atualizados: 0,
      fonte_configuracao: "relatorio_salvo_bfleet",
    };
  }

  const placas = Array.from(new Set(mapped.map((r) => r.placa).filter(Boolean)));
  const vehicleMap = await loadVehicleMap(supabase, placas).catch(() => new Map());
  const patrimonioMap = await loadPatrimonioMap(supabase).catch(() => new Map());
  const assetMapByPlate: Map<string, any> = report.assetMapByPlate || buildAssetMapByPlate(report.dataJson || {});
  const veiculosBfleetAtualizados = await syncBfleetVehicleIds(supabase, vehicleMap, assetMapByPlate).catch(() => 0);

  const cruzados = mapped.map((r) => {
    const v = vehicleMap.get(r.placa);
    const p = patrimonioMap.get(r.placa);
    const asset = assetMapByPlate.get(r.placa) || {};
    const motorista = p?.funcionario || v?.patrimonio_funcionario || v?.motorista_atual || r.motorista_planilha || null;
    return {
      ...r,
      bfleet_vehicle_id: asset.bfleet_vehicle_id || null,
      bfleet_ativo_nome: asset.bfleet_ativo_nome || r.ativo_rastreador || null,
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
    const { error } = await supabase
      .from("frotas_excesso_velocidade")
      .upsert(batch, { onConflict: "import_hash" });
    if (error) throw new Error(error.message || "Falha ao gravar excessos de velocidade.");
    insertedOrUpdated += batch.length;
  }

  return {
    ok: true,
    endpoint: report.endpoint,
    relatorio_id: String(cfg.reportId),
    periodo_inicio: cfg.dataInicial || cfg.rangeTimeVal || "yesterday",
    periodo_fim: cfg.dataFinal || cfg.rangeTimeVal || "yesterday",
    limite_velocidade_kmh: 120,
    total: mapped.length,
    upserted: insertedOrUpdated,
    inserted: insertedOrUpdated,
    updated: 0,
    identificados: cruzados.filter((r) => r.patrimonio_funcionario).length,
    pendentes: cruzados.filter((r) => !r.patrimonio_funcionario).length,
    placas: placas.length,
    veiculos_bfleet_atualizados: veiculosBfleetAtualizados,
    fonte_configuracao: "relatorio_salvo_bfleet",
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

    const result = await syncExcessos(supabase, requestBody);
    return json(result);
  } catch (err) {
    console.error("[sync-bfleet-excesso-velocidade]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
