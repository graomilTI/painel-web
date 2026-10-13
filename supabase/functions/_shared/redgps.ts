// Acesso à RedGPS/BFleet (API Service24GPS) para Edge Functions: credenciais, token, lista de veículos e histórico de posições.
// Mesma lógica de sync-bfleet-fora-horario/index.ts (credenciais em ti_integracoes/ti_integracao_segredos).

export function asString(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeKey(value: unknown) {
  return asString(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function onlyPlate(value: unknown) {
  return asString(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function pick(obj: any, names: string[]) {
  if (!obj || typeof obj !== "object") return "";
  const normalized = new Map<string, string>();
  Object.keys(obj).forEach((k) => normalized.set(normalizeKey(k), k));
  for (const name of names) {
    const key = normalized.get(normalizeKey(name));
    if (key && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return "";
}

export function parseNumeric(value: any) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export async function loadIntegrationSecrets(supabase: any) {
  const cfg: Record<string, string> = {};
  const { data: integrations } = await supabase
    .from("ti_integracoes")
    .select("id,nome,codigo,base_url,auth_url,ativo")
    .eq("ativo", true);

  const bfleet = (integrations || []).filter((item: any) => {
    const code = normalizeKey(`${item?.codigo || ""} ${item?.nome || ""}`);
    return code.includes("BFLEET") || code.includes("B_FLEET") || code.includes("FLEET");
  });

  for (const integ of bfleet) {
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

export async function buildRedgpsConfig(supabase: any) {
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
  };
}

async function fetchJson(url: string, init: RequestInit, label: string) {
  const res = await fetch(url, init);
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${String(text || "").slice(0, 300)}`);
  return payload;
}

export async function getRedgpsToken(cfg: any) {
  if (cfg.token) return cfg.token as string;
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

function service24Endpoint(cfg: any, endpoint: string) {
  let base = asString(cfg.baseUrl).replace(/\/+$/, "");
  if (!/\/api\/v1$/i.test(base)) base = `${base}/api/v1`;
  return `${base}/${endpoint.replace(/^\/+/, "")}`;
}

export function apiObjectRows(payload: any, signatureKeys: string[] = []) {
  const candidates = [
    payload?.data?.result, payload?.data?.rows, payload?.data?.records, payload?.data,
    payload?.result, payload?.rows, payload?.records, payload,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item) => item && typeof item === "object");
    if (!candidate || typeof candidate !== "object") continue;
    if (signatureKeys.some((key) => Object.prototype.hasOwnProperty.call(candidate, key))) return [candidate];
    const values = Object.values(candidate).filter((item) => item && typeof item === "object");
    if (values.length && values.every((item) => !Array.isArray(item))) {
      const signed = values.filter((item: any) => signatureKeys.some((key) => Object.prototype.hasOwnProperty.call(item, key)));
      if (signed.length) return signed;
    }
  }
  return [];
}

export async function service24Post(cfg: any, token: string, endpoint: string, fields: Record<string, string>, label: string) {
  const form = new FormData();
  form.append("apikey", asString(cfg.apiKey));
  form.append("token", asString(token));
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined && value !== null && String(value) !== "") form.append(key, String(value));
  }
  return fetchJson(service24Endpoint(cfg, endpoint), {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  }, label);
}

// placa -> idgps (identificador do rastreador na RedGPS)
export async function fetchIdgps(cfg: any, token: string, placa: string) {
  const payload = await service24Post(cfg, token, "vehicleGetAll", {}, "Lista de veículos RedGPS");
  const rows = apiObjectRows(payload, ["patente", "idgps", "placa", "licensePlate"]);
  for (const row of rows) {
    const p = onlyPlate(pick(row, ["patente", "Patente", "placa", "Placa", "licensePlate"]));
    if (p && p === placa) return asString(pick(row, ["idgps", "equipo", "imei", "gpsId"]));
  }
  return "";
}
