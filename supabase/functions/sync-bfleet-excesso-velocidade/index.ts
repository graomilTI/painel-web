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
        return ["DATA", "FECHA", "HORA", "PLACA", "MOTORISTA", "VELOCIDADE", "VELOCIDAD", "ENDERECO", "LATITUDE", "LONGITUDE", "VER_MAPA"].includes(k);
      });
      if (hasKnownHeader) {
        headers = normalizedHeaders;
        continue;
      }
    }

    if (!headers.length) {
      // Alguns retornos vêm apenas com <tbody>, sem <thead>. Quando a quantidade de colunas
      // bate com o relatório de Excesso de velocidade, aplicamos o cabeçalho padrão.
      if (values.length >= 10) {
        headers = ["Data", "Hora", "Alerta", "Ativo", "Placa", "Motorista", "Velocidade", "Endereco", "Latitude", "Longitude", "Ver mapa"];
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
  let headers = columnsToHeaderArray(columns);
  if (!headers.length && rows[0].length >= 10) {
    headers = ["Data", "Hora", "Alerta", "Ativo", "Placa", "Motorista", "Velocidade", "Endereco", "Latitude", "Longitude", "Ver mapa"];
  }
  if (!headers.length) return [];
  return rows.map((arr: any[]) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => obj[h] = stripHtml(arr[idx] ?? ""));
    return obj;
  });
}

function extractRows(payload: any): any[] {
  if (!payload) return [];

  // Alguns ambientes do OnReports devolvem o campo result/message como string JSON ou HTML.
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

      // Caso padrão do OnReports quando result vem como objeto indexado:
      // { "0": {...}, "1": {...} }
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
  const today = new Date();
  const from = new Date(today.getTime() - 1000 * 60 * 60 * 24 * Number(get("BFLEET_DIAS_SYNC", "DIAS_SYNC") || 7));
  return {
    baseUrl: get("BFLEET_API_BASE", "API_BASE", "BASE_URL").replace(/\/$/, ""),
    authUrl: get("BFLEET_AUTH_URL", "AUTH_URL"),
    apiKey: get("BFLEET_API_KEY", "API_KEY"),
    username: get("BFLEET_USERNAME", "USERNAME"),
    password: get("BFLEET_PASSWORD", "PASSWORD"),
    token: get("BFLEET_TOKEN", "TOKEN"),
    reportId: requestBody?.reportId || requestBody?.report_id || get("BFLEET_REPORT_ID", "ID_RELATORIO_EXCESSO_VELOCIDADE", "IDRELATORIOSALVO", "ID_RELATORIO_SALVO", "RELATORIO_EXCESSO_ID", "REPORT_ID"),
    // No OnReports, quando o relatório usa marcador relativo (ex.: yesterday), Data Inicial/Data Final ficam vazias mesmo.
    // A consulta do resultado programado não deve depender dessas datas.
    dataInicial: requestBody?.dataInicial || requestBody?.data_inicial || requestBody?.startDate || requestBody?.start_date || get("DATA_INICIAL", "BFLEET_DATA_INICIAL") || "",
    dataFinal: requestBody?.dataFinal || requestBody?.data_final || requestBody?.endDate || requestBody?.end_date || get("DATA_FINAL", "BFLEET_DATA_FINAL") || "",
    rangeTimeId: requestBody?.rangeTimeId || requestBody?.range_time_id || get("RANGO_TIEMPO_ID", "RANGE_TIME_ID", "RANGO_TEMPO_ID", "PERIODO_RAPIDO"),
    rangeTimeVal: requestBody?.rangeTimeVal || requestBody?.range_time_val || get("RANGO_TIEMPO_VAL", "RANGE_TIME_VAL", "RANGO_TEMPO_VAL", "PERIODO_RAPIDO_VAL") || "yesterday",
    webBaseUrl: (requestBody?.webBaseUrl || requestBody?.web_base_url || get("BFLEET_WEB_BASE", "WEB_BASE", "REPORTS_BASE", "RELATORIOS_BASE") || "https://relatorios.bfleet.com.br").replace(/\/$/, ""),
    webCookie: requestBody?.webCookie || requestBody?.web_cookie || get("BFLEET_WEB_COOKIE", "WEB_COOKIE", "RELATORIOS_COOKIE"),
    phpSessionId: requestBody?.phpSessionId || requestBody?.phpsessid || get("BFLEET_PHPSESSID", "PHPSESSID", "RELATORIOS_PHPSESSID"),
    webUsername: requestBody?.webUsername || requestBody?.web_username || get("BFLEET_WEB_USERNAME", "WEB_USERNAME", "RELATORIOS_USERNAME") || get("BFLEET_USERNAME", "USERNAME"),
    webPassword: requestBody?.webPassword || requestBody?.web_password || get("BFLEET_WEB_PASSWORD", "WEB_PASSWORD", "RELATORIOS_PASSWORD") || get("BFLEET_PASSWORD", "PASSWORD"),
    webLang: requestBody?.webLang || requestBody?.web_lang || get("BFLEET_WEB_LANG", "WEB_LANG") || "pt",
    preferWebReport: requestBody?.preferWebReport !== false,
    autoLoginWeb: requestBody?.autoLoginWeb !== false,
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
    headers: payload?.headers ?? payload?.data?.headers ?? null,
    topKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : [],
    dataKeys: payload?.data && typeof payload.data === "object" ? Object.keys(payload.data).slice(0, 20) : [],
    resultType: typeof payload?.data?.result,
    resultIsArray: Array.isArray(payload?.data?.result),
    resultKeys: payload?.data?.result && typeof payload.data.result === "object" ? Object.keys(payload.data.result).slice(0, 20) : [],
    messageType: typeof message,
    messagePreview: typeof message === "string" ? stripHtml(message).slice(0, 500) : JSON.stringify(message || {}).slice(0, 500),
    messageHasTable: typeof message === "string" ? /<table|<tr|<td|<th/i.test(message) : false,
  };
}

const DEFAULT_BFLEET_WEB_DATAJSON: any = {
  "prefix": "",
  "caja_multisel_grupos": {
    "18283": "MATO GROSSO MT1",
    "19296": "MATOPIPA",
    "19297": "MATO GROSSO MT2",
    "19299": "MATO GROSSO MT4",
    "19300": "MATO GROSSO MT3 CONFRESA",
    "19634": "PONTA GROSSA",
    "19659": "MARINGA",
    "20132": "MOTORISTAS",
    "20134": "VEICULOS",
    "20175": "MINAS GERAIS",
    "20268": "CASCAVEL",
    "20306": "MATO GROSSO MT3 QUERENCIA",
    "20309": "LOG 1000",
    "20310": "LONDRINA",
    "20311": "GOIAS",
    "20312": "BAHIA",
    "20313": "RIO GRANDE DO SUL",
    "20314": "MATO GROSSO DO SUL",
    "20315": "ADMINISTRATIVO GERAL",
    "20320": "SAO PAULO"
  },
  "caja_multisel_activos": {
    "455421": "GOL 10L MC4  BED6F03",
    "455424": "GOL 10  NPD1I84",
    "455427": "GOL 16 CITY  OHS2H79",
    "455448": "UNO  ISV4E98",
    "455450": "ARGO  SEH3F18",
    "459937": "MOBI LIKE  SHE2I37",
    "459938": "PALIO FIRE  AYQ8H95",
    "465025": "PALIO FIRE ECONOM  OGH1C33",
    "465030": "UNO VIVACE 10  FHY6B76",
    "465032": "MOBI DRIVE  BCD6D46",
    "465067": "GOL 16L MB5  RFU7C08",
    "467877": "FIESTA 16 FLEX  ASC8F72",
    "468218": "DUSTER ZEN 16  RMQ4E96",
    "472561": "SEH5J54  ARGO 10",
    "473361": "ARGO 10  SER7B78",
    "474189": "MOBI TREKKING 10MT  SYH0E81",
    "474192": "MOBI LIKE  SYO2E24",
    "474193": "MOBI LIKE  SYO2E31",
    "474196": "MOBI TREKKING 10MT  SYH2H43",
    "474210": "MOBI LIKE  TCA6D61",
    "476281": "MOBI LIKE  RVD6B57",
    "477102": "ARGO  SEH5J50",
    "477916": "PALIO FIRE  AYD2I82",
    "478418": "MOBI LIKE  RVQ6J42",
    "480656": "MOBI LIKE  RNM8A57",
    "481713": "MOBI LIKE  TCA6C76",
    "481716": "MOBI LIKE  TCA6C80",
    "481718": "MOBI LIKE  SIC8C02",
    "482527": "MOBI LIKE  RTW0E56",
    "482534": "MOBI LIKE  SIY4H03",
    "482544": "MOBI LIKE  RVH7H48",
    "482547": "MOBI LIKE  SIB5J70",
    "482605": "MOBI LIKE  RVN7E53",
    "482839": "UNO MILLE ECONOMY  AVH4I98",
    "482936": "ARGO 10  SEH3F15",
    "483760": "GOL 10  AVM4B26",
    "484004": "ARGO DRIVE 10  RUP8A61",
    "485335": "MOBI LIKE  RVL5I83",
    "485544": "MOBI LIKE  SYD4H65",
    "487142": "ONIX 14MT LTZ  BBD3H56",
    "487201": "GOL 10  HOG7C22",
    "488142": "MOBI LIKE  RUW5B41",
    "489267": "MOBI LIKE  SHV7F36",
    "492843": "NOVO GOL 10 CITY  IVK9B59",
    "495101": "MOBI LIKE  RTV3A15",
    "495103": "UNO VIVACE 10  OWI1D91",
    "496368": "GOL 16  NWK7A56",
    "498467": "NOVO GOL 10 CITY  FMQ6B31",
    "498596": "MOBI LIKE  RUU6D98",
    "499579": "UNO WAY 10 E  GIX4I64",
    "500731": "MOBI LIKE  SYD4H57",
    "502909": "KWID ZEN 10MT  BDT8I72",
    "503894": "UNO DRIVE 10  BCP4I83",
    "504225": "ARGO 10  SEH5J61",
    "506832": "ATTRACTIVE 10  BCS8H67",
    "507273": "KWID ZEN 10MT  BXZ7I02",
    "507275": "UNO ATTRACTIVE 10  BCS8I07",
    "507528": "MOBI LIKE  EXG1A71",
    "508329": "KWID ZEN 10MT  BDV5B79",
    "508331": "ARGO DRIVE 10  RUO4J65",
    "509294": "ARGO DRIVE 13  PBJ0B58",
    "509325": "DUSTER ZEN 16  RMS1E45"
  },
  "idreporte": "11",
  "fecha_inicio": "08/05/2026",
  "fecha_fin": "10/05/2026",
  "hora_inicio": "00:00:00",
  "hora_fin": "23:59:59",
  "sino_mostrar_pestanias_excel": "0",
  "reporte_detallado": "0",
  "reporte_descartar_excesos": "0",
  "filter_velocidad": "120",
  "tiempo_velocidad_maxima": "0",
  "caja_multisel_columnas": {
    "Fecha": "Fecha",
    "Hora": "Hora",
    "Alerta": "Alerta",
    "VEHICULO-IdVehiculo": "Activo",
    "VEHICULO-Patente": "Placa",
    "CONDUCTOR-IdConductor": "Conductor",
    "Velocidad": "Velocidad",
    "Domicilio": "Direccion",
    "Latitud": "Latitud",
    "Longitud": "Longitud",
    "link_gm": "Ver mapa"
  },
  "caja_multisel_formato_adjunto": {
    "XLS": "Anexo em XLS"
  },
  "graficar_reporte": "0",
  "guardar_reporte": "1",
  "usuario_reporte": "0",
  "incluir_cercas_lugares": "0",
  "enviar_reporte": "0",
  "rdb_montly_report": "0",
  "nombre_guardar": "Excessos de velocidade",
  "url_destino": ""
};

function getBfleetCookie(cfg: any) {
  const full = asString(cfg.webCookie);
  if (full) return full;
  const session = asString(cfg.phpSessionId);
  return session ? `PHPSESSID=${session}` : "";
}


function getSetCookieHeaders(headers: Headers) {
  const anyHeaders = headers as any;
  if (typeof anyHeaders.getSetCookie === "function") {
    const values = anyHeaders.getSetCookie();
    if (Array.isArray(values) && values.length) return values.map(String);
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function extractPhpSessionFromSetCookie(setCookies: string[]) {
  for (const cookie of setCookies || []) {
    const m = String(cookie).match(/PHPSESSID=([^;\s]+)/i);
    if (m?.[1]) return m[1];
  }
  return "";
}

async function loginBfleetWeb(cfg: any) {
  if (!cfg.autoLoginWeb) return "";
  const username = asString(cfg.webUsername);
  const password = asString(cfg.webPassword);
  if (!username || !password) return "";

  const webBase = cfg.webBaseUrl || "https://relatorios.bfleet.com.br";
  const loginUrl = joinUrl(webBase, "/login");
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

  let session = "";

  // Primeiro abre a tela de login para o servidor criar uma sessão inicial.
  try {
    const pre = await fetch(loginUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": userAgent,
      },
    });
    session = extractPhpSessionFromSetCookie(getSetCookieHeaders(pre.headers));
  } catch {
    // Se a abertura inicial falhar, ainda tentamos o POST direto.
  }

  const body = new URLSearchParams();
  body.set("nick", username);
  body.set("passwd", password);
  body.set("cbLang", asString(cfg.webLang || "pt") || "pt");

  const loginHeaders: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Cache-Control": "no-cache",
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: webBase,
    Pragma: "no-cache",
    Referer: loginUrl,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": userAgent,
  };
  if (session) loginHeaders.Cookie = `PHPSESSID=${session}`;

  const res = await fetch(loginUrl, {
    method: "POST",
    redirect: "manual",
    headers: loginHeaders,
    body: body.toString(),
  });

  const postSession = extractPhpSessionFromSetCookie(getSetCookieHeaders(res.headers));
  if (postSession) session = postSession;

  // Algumas instalações mantêm o mesmo PHPSESSID do GET e apenas autenticam essa sessão.
  if (!session) {
    const fallbackCookie = getBfleetCookie(cfg);
    const m = fallbackCookie.match(/PHPSESSID=([^;\s]+)/i);
    if (m?.[1]) session = m[1];
  }

  if (!session) {
    const preview = await res.text().catch(() => "");
    throw new Error(`Login web BFleet não retornou PHPSESSID. HTTP ${res.status}. Prévia: ${stripHtml(preview).slice(0, 300)}`);
  }

  return `PHPSESSID=${session}`;
}

async function resolveBfleetWebCookie(cfg: any) {
  // Quando usuário/senha web estão configurados, renovamos o PHPSESSID a cada sincronização.
  const loggedCookie = await loginBfleetWeb(cfg).catch((err) => {
    const staticCookie = getBfleetCookie(cfg);
    if (staticCookie) return staticCookie;
    throw err;
  });
  return loggedCookie || getBfleetCookie(cfg);
}

function formatBrDate(date: Date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function buildWebDataJson(cfg: any) {
  const dataJson = JSON.parse(JSON.stringify(DEFAULT_BFLEET_WEB_DATAJSON));
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  if (cfg.dataInicial && cfg.dataFinal) {
    dataJson.fecha_inicio = toIsoDate(cfg.dataInicial)?.split("-").reverse().join("/") || cfg.dataInicial;
    dataJson.fecha_fin = toIsoDate(cfg.dataFinal)?.split("-").reverse().join("/") || cfg.dataFinal;
  } else if (normalizeKey(cfg.rangeTimeVal) === "YESTERDAY") {
    dataJson.fecha_inicio = formatBrDate(yesterday);
    dataJson.fecha_fin = formatBrDate(yesterday);
  }

  dataJson.hora_inicio = dataJson.hora_inicio || "00:00:00";
  dataJson.hora_fin = dataJson.hora_fin || "23:59:59";
  dataJson.filter_velocidad = String(dataJson.filter_velocidad || "120");
  return dataJson;
}

function appendNestedForm(params: URLSearchParams, prefix: string, value: any) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) appendNestedForm(params, `${prefix}[${k}]`, v);
    return;
  }
  params.append(prefix, asString(value));
}

function parseBfleetWebRows(text: string, columns: any) {
  const raw = asString(text).replace(/(\r\n|\n|\r)/g, " ").trim();
  if (!raw) return [];
  const htmlRows = parseHtmlTableRows(raw);
  if (htmlRows.length) return htmlRows;
  try {
    const parsed = JSON.parse(raw);
    const rows = extractRows(parsed);
    if (rows.length) return rows;
  } catch {}
  try {
    // A tela da BFleet faz eval(data). Aqui avaliamos apenas o retorno do endpoint logado.
    const parsed = Function(`"use strict"; return (${raw});`)();
    if (Array.isArray(parsed)) return Array.isArray(parsed[0]) ? rowsFromArrayMatrix(parsed, columns) : parsed;
    return extractRows(parsed);
  } catch {
    return [];
  }
}

function buildAssetMapByPlate(dataJson: any) {
  const map = new Map<string, any>();
  const ativos = dataJson?.caja_multisel_activos || {};
  for (const [assetId, assetName] of Object.entries(ativos)) {
    const plate = extractPlateFromText(assetName);
    if (!plate) continue;
    map.set(plate, { bfleet_vehicle_id: String(assetId), bfleet_ativo_nome: normalizeText(assetName) });
  }
  return map;
}

async function fetchWebReport(cfg: any) {
  const cookie = await resolveBfleetWebCookie(cfg);
  if (!cookie) throw new Error("Configure BFLEET_WEB_USERNAME/BFLEET_WEB_PASSWORD ou BFLEET_WEB_COOKIE/BFLEET_PHPSESSID para usar o relatório web da BFleet.");
  const dataJson = buildWebDataJson(cfg);
  const params = new URLSearchParams();
  appendNestedForm(params, "dataJson", dataJson);
  params.append("idreporte_guardado", String(cfg.reportId || "85055"));
  params.append("uniq_id", asString(cfg.uniqId || cfg.uniq_id || "painel_sync"));

  const url = joinUrl(cfg.webBaseUrl || "https://relatorios.bfleet.com.br", "/reportesback/excesosVelocidad");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: cfg.webBaseUrl || "https://relatorios.bfleet.com.br",
      Referer: joinUrl(cfg.webBaseUrl || "https://relatorios.bfleet.com.br", "/new-reports"),
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome Safari",
      Cookie: cookie,
    },
    body: params.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Endpoint web BFleet ${url} retornou HTTP ${res.status}: ${text.slice(0, 400)}`);
  const rows = parseBfleetWebRows(text, dataJson.caja_multisel_columnas);
  if (!rows.length) {
    throw new Error(`Endpoint web BFleet ${url} respondeu, mas não retornou linhas. Confira se o PHPSESSID/cookie ainda está válido e se a sessão da BFleet continua logada. Prévia: ${stripHtml(text).slice(0, 500)}`);
  }
  return { payload: text, rows, endpoint: url, dataJson, assetMapByPlate: buildAssetMapByPlate(dataJson) };
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

async function fetchReport(cfg: any, token: string) {
  if (!cfg.baseUrl) throw new Error("Configure API_BASE da BFleet/Service24GPS.");
  if (!cfg.apiKey) throw new Error("Configure API_KEY da BFleet/Service24GPS.");
  if (!token) throw new Error("Configure TOKEN da BFleet/Service24GPS ou habilite a autenticação automática.");
  if (!cfg.reportId) throw new Error("Configure o ID do relatório de excesso de velocidade em BFLEET_REPORT_ID, ID_RELATORIO_EXCESSO_VELOCIDADE, RELATORIO_EXCESSO_ID ou REPORT_ID.");

  // Endpoint correto da documentação Service24GPS/RedGPS/BFleet para relatório programado:
  // POST /api/v1/onreports/getScheduledReportResult via multipart/form-data com apikey, token e report_id.
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

  // Fallback JSON para instalações que aceitam body application/json no mesmo endpoint.
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
    `Não foi possível ler linhas do relatório programado BFleet. ${last} ` +
    `O relatório ${cfg.reportId} pode usar Data Inicial/Data Final vazias quando o marcador é yesterday; isso é esperado. Verifique apenas se a última execução do relatório está em JSON e se o token usado pela API ainda está válido. ` +
    `Diagnóstico: ${JSON.stringify(lastPayloadInfo || {})}`
  );
}

function mapReportRow(row: any, arquivoNome = "BFleet API") {
  const placa = onlyPlate(pick(row, ["Placa", "plate", "vehiclePlate", "patente", "licensePlate", "placaVeiculo"]));
  const dataEvento = toIsoDate(pick(row, ["Data", "Fecha", "date", "data_evento", "Data Evento", "Fecha Evento", "eventDate", "dateTime", "Data/Hora", "Data Hora", "Fecha/Hora", "Fecha Hora"]));
  const velocidade = normalizeNumber(pick(row, ["Velocidade", "Velocidad", "speed", "Velocidade Km/h", "Velocidad Km/h", "velocity", "maximumSpeed", "max_speed", "velocidad"]));
  if (!placa || !dataEvento || !velocidade) return null;
  const mapped: any = {
    data_evento: dataEvento,
    hora_evento: parseTimeText(pick(row, ["Hora", "time", "hora_evento", "Data/Hora", "Data Hora", "Fecha/Hora", "Fecha Hora", "dateTime"])),
    alerta: normalizeText(pick(row, ["Alerta", "alert", "Evento", "event", "Descrição", "Descricao"])) || "Excesso de velocidade",
    ativo_rastreador: normalizeText(pick(row, ["Ativo", "Veículo", "Veiculo", "Vehicle", "Nome Veículo", "Nome Veiculo", "vehicleName"])),
    placa,
    motorista_planilha: normalizeText(pick(row, ["Motorista", "Condutor", "Driver", "driverName", "Nome Motorista"])),
    velocidade,
    endereco: normalizeText(pick(row, ["Endereço", "Endereco", "Domicilio", "Lugar", "Address", "Local", "location"])),
    latitude: normalizeNumber(pick(row, ["Latitude", "Lat"])),
    longitude: normalizeNumber(pick(row, ["Longitude", "Long", "Lng"])),
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

  // Não usamos .in('placa', placas) porque no banco a placa pode estar com hífen/espaço
  // e no relatório vem normalizada. Carrega em páginas e compara com onlyPlate().
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

async function syncExcessos(supabase: any, requestBody: any = {}) {
  const cfg = await buildConfig(supabase, requestBody);
  let report: any = null;
  let webError = "";

  // A conta BFleet desta implantação não disponibiliza JSON em getScheduledReportResult.
  // Por isso, por padrão usamos o endpoint web real que a própria tela chama:
  // /reportesback/excesosVelocidad. Se ele falhar, não mascaramos o erro com o endpoint JSON.
  if (cfg.preferWebReport) {
    try {
      report = await fetchWebReport(cfg);
    } catch (err) {
      webError = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Falha ao ler o relatório pelo endpoint web da BFleet. ` +
        `Configure BFLEET_WEB_USERNAME/BFLEET_WEB_PASSWORD para renovar o cookie automaticamente, ` +
        `ou BFLEET_WEB_COOKIE/BFLEET_PHPSESSID para usar uma sessão manual. ` +
        `Detalhe: ${webError}`
      );
    }
  }

  if (!report) {
    const token = await getToken(cfg);
    report = await fetchReport(cfg, token);
  }

  const mapped = report.rows.map((r: any) => mapReportRow(r, `BFleet · relatório ${cfg.reportId}`)).filter(Boolean) as any[];

  const placas = Array.from(new Set(mapped.map((r) => r.placa).filter(Boolean)));
  const vehicleMap = await loadVehicleMap(supabase, placas).catch(() => new Map());
  const patrimonioMap = await loadPatrimonioMap(supabase).catch(() => new Map());
  const assetMapByPlate: Map<string, any> = report.assetMapByPlate || buildAssetMapByPlate(report.dataJson || DEFAULT_BFLEET_WEB_DATAJSON);
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
    const { error } = await supabase.from("frotas_excesso_velocidade").upsert(batch, { onConflict: "import_hash" });
    if (error) throw new Error(error.message || "Falha ao gravar excessos de velocidade.");
    insertedOrUpdated += batch.length;
  }

  return {
    ok: true,
    endpoint: report.endpoint,
    periodo_inicio: cfg.dataInicial || cfg.rangeTimeVal || "yesterday",
    periodo_fim: cfg.dataFinal || cfg.rangeTimeVal || "yesterday",
    total: mapped.length,
    upserted: insertedOrUpdated,
    inserted: insertedOrUpdated,
    updated: 0,
    identificados: cruzados.filter((r) => r.patrimonio_funcionario).length,
    pendentes: cruzados.filter((r) => !r.patrimonio_funcionario).length,
    placas: placas.length,
    veiculos_bfleet_atualizados: veiculosBfleetAtualizados,
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
    const result = await syncExcessos(supabase, requestBody);
    return json(result);
  } catch (err) {
    console.error("[sync-bfleet-excesso-velocidade]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
