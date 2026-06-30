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
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function asString(v: unknown) {
  return String(v ?? "").trim();
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

function norm(v: unknown) {
  return asString(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function onlyPlate(v: unknown) {
  return asString(v).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function formBody(payload: Record<string, unknown>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) body.set(k, asString(v));
  return body;
}

function pick(row: any, keys: string[]) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && asString(row[key]) !== "") return row[key];
    const found = Object.keys(row || {}).find((k) => norm(k) === norm(key));
    if (found && asString(row[found]) !== "") return row[found];
  }
  return "";
}

function parseNumberLoose(value: unknown): number | null {
  const raw = asString(value);
  if (!raw) return null;
  const cleaned = raw.replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pickNumber(row: any, keys: string[]): number | null {
  for (const key of keys) {
    const n = parseNumberLoose(pick(row, [key]));
    if (n !== null) return n;
  }
  return null;
}

function parseDate(value: unknown) {
  const s = asString(value);
  if (!s) return "";
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return s.slice(0, 10);
}

function parseHour(value: unknown) {
  const s = asString(value);
  const m = s.match(/(\d{2}:\d{2}(?::\d{2})?)/);
  return m ? m[1] : null;
}

function pickDateTime(row: any, keys: string[]): string {
  const v = asString(pick(row, keys));
  if (!v) return new Date().toISOString();

  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  const date = parseDate(v);
  const hour = parseHour(v) || "00:00:00";
  const parsed = new Date(`${date}T${hour}`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function pickBoolean(row: any, keys: string[]): boolean | null {
  const v = pick(row, keys);
  if (v === true || v === false) return v;
  const s = norm(v);
  if (!s) return null;
  if (["1", "SIM", "TRUE", "LIGADO", "ON", "MOVIMENTO"].some((x) => s.includes(x))) return true;
  if (["0", "NAO", "FALSE", "DESLIGADO", "OFF", "PARADO"].some((x) => s.includes(x))) return false;
  return null;
}

function validBrazilLatLng(lat: number | null, lng: number | null): boolean {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return false;
  return Number(lat) >= -34.2 && Number(lat) <= 6.0 && Number(lng) >= -74.5 && Number(lng) <= -28.0;
}

type BfleetConfig = {
  apiBase: string;
  apiKey: string;
  username: string;
  password: string;
};

async function loadIntegrationSecrets(supabase: any) {
  const cfg: Record<string, string> = {};
  const { data: integrations } = await supabase
    .from("ti_integracoes")
    .select("id,nome,codigo,base_url,auth_url,ativo")
    .eq("ativo", true);

  const bfleetIntegrations = (integrations || []).filter((item: any) => {
    const code = normalizeKey(`${item?.codigo || ""} ${item?.nome || ""}`);
    return code.includes("BFLEET") || code.includes("SERVICE24") || code.includes("SERVICE_24") || code.includes("RASTREADOR") || code.includes("GPS");
  });

  for (const integ of bfleetIntegrations) {
    if (integ.base_url) cfg.API_BASE = String(integ.base_url);
    if (integ.auth_url) cfg.AUTH_URL = String(integ.auth_url);

    const { data: secrets } = await supabase
      .from("ti_integracao_segredos")
      .select("chave,valor,ativo")
      .eq("integracao_id", integ.id)
      .eq("ativo", true);

    for (const secret of secrets || []) {
      const k = normalizeKey(secret.chave);
      if (k) cfg[k] = String(secret.valor ?? "");
    }
  }

  return cfg;
}

async function buildConfig(supabase: any): Promise<BfleetConfig> {
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

  const apiBase = (get("BFLEET_API_BASE", "SERVICE24GPS_API_BASE", "API_BASE") || "https://api.service24gps.com/api/v1").replace(/\/+$/, "");
  const apiKey = get("BFLEET_API_KEY", "SERVICE24GPS_API_KEY", "API_KEY", "APIKEY");
  const username = get("BFLEET_USERNAME", "SERVICE24GPS_USERNAME", "USERNAME", "USUARIO");
  const password = get("BFLEET_PASSWORD", "SERVICE24GPS_PASSWORD", "PASSWORD", "SENHA");

  if (!apiKey || !username || !password) {
    throw new Error("Configure BFLEET_API_KEY/API_KEY, BFLEET_USERNAME/USERNAME e BFLEET_PASSWORD/PASSWORD em TI Integrações ou nos secrets da Edge Function.");
  }

  return { apiBase, apiKey, username, password };
}

async function bfleetPost(config: BfleetConfig, endpoint: string, payload: Record<string, unknown>) {
  const url = `${config.apiBase}/${endpoint.replace(/^\/+/, "")}`;
  const res = await fetch(url, { method: "POST", body: formBody(payload) });
  const text = await res.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    throw new Error(`BFleet ${endpoint}: resposta inválida (${res.status}): ${text.slice(0, 500)}`);
  }

  if (!res.ok) throw new Error(`BFleet ${endpoint}: HTTP ${res.status}: ${text.slice(0, 500)}`);
  if (Number(data?.status) !== 200) throw new Error(`BFleet ${endpoint}: ${text.slice(0, 700)}`);
  return data;
}

async function getToken(config: BfleetConfig) {
  const resp = await bfleetPost(config, "gettoken", {
    apikey: config.apiKey,
    token: "",
    username: config.username,
    password: config.password,
    get_info: "1",
  });

  const data = resp?.data;
  const token = typeof data === "string" ? data : data?.token;
  if (!token) throw new Error("BFleet não retornou token.");
  return token;
}

async function bfleetAuthPost(config: BfleetConfig, endpoint: string, token: string, payload: Record<string, unknown> = {}) {
  return await bfleetPost(config, endpoint, { apikey: config.apiKey, token, ...payload });
}

function extractArray(payload: any) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.result)) return payload.data.result;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function tryBfleetEndpoint(config: BfleetConfig, token: string, endpoint: string, payload: Record<string, unknown> = {}) {
  try {
    const resp = await bfleetAuthPost(config, endpoint, token, payload);
    const rows = extractArray(resp);
    return { endpoint, rows, ok: true, error: "" };
  } catch (err) {
    return { endpoint, rows: [], ok: false, error: String((err as any)?.message || err) };
  }
}

type LocalVehicle = {
  id: string;
  placa: string | null;
  motorista_atual: string | null;
  bfleet_condutor?: string | null;
  bfleet_id?: string | null;
  bfleet_idgps?: string | null;
  bfleet_vehicle_id?: string | null;
  bfleet_placa?: string | null;
  bfleet_patente?: string | null;
};

function remotePlate(row: any) {
  return onlyPlate(pick(row, ["placa", "plate", "Placa", "patente", "Patente", "bfleet_placa", "Activo", "ativo", "nombre", "Nome", "name"]));
}

function remoteIdGps(row: any) {
  return asString(pick(row, ["idgps", "id_gps", "gps", "imei", "IMEI", "device_id", "deviceId", "idDispositivo", "id_dispositivo"]));
}

function remoteVehicleId(row: any) {
  return asString(pick(row, ["idvehiculo", "idVehiculo", "vehicle_id", "vehicleId", "idVehicle", "id", "ID"]));
}

function buildVehicleIndexes(rows: LocalVehicle[]) {
  const byPlate = new Map<string, LocalVehicle>();
  const byIdGps = new Map<string, LocalVehicle>();
  const byRemoteId = new Map<string, LocalVehicle>();

  for (const v of rows || []) {
    [v.placa, v.bfleet_placa, v.bfleet_patente].map(onlyPlate).filter(Boolean).forEach((p) => byPlate.set(p, v));
    if (v.bfleet_idgps) byIdGps.set(asString(v.bfleet_idgps), v);
    [v.bfleet_id, v.bfleet_vehicle_id].map(asString).filter(Boolean).forEach((id) => byRemoteId.set(id, v));
  }

  return { byPlate, byIdGps, byRemoteId };
}

function resolveLocalVehicle(row: any, idx: ReturnType<typeof buildVehicleIndexes>) {
  const p = remotePlate(row);
  const idgps = remoteIdGps(row);
  const rid = remoteVehicleId(row);

  return (rid && idx.byRemoteId.get(rid))
    || (idgps && idx.byIdGps.get(idgps))
    || (p && idx.byPlate.get(p))
    || null;
}

function readLat(row: any) {
  return pickNumber(row, ["latitude", "lat", "Lat", "LAT", "latitud", "Latitud", "LATITUD", "ultima_latitude", "posicao_latitude"]);
}

function readLng(row: any) {
  return pickNumber(row, ["longitude", "lng", "lon", "Lon", "LON", "longitud", "Longitud", "LONGITUD", "ultima_longitude", "posicao_longitude"]);
}

function remoteHasGeo(row: any): boolean {
  return validBrazilLatLng(readLat(row), readLng(row));
}

function normalizePosition(row: any, local: LocalVehicle | null) {
  const lat = readLat(row);
  const lng = readLng(row);
  if (!validBrazilLatLng(lat, lng)) return null;

  const placa = onlyPlate(local?.placa || remotePlate(row));
  const idgps = remoteIdGps(row) || asString(local?.bfleet_idgps || "");
  if (!placa && !idgps && !local?.id) return null;

  return {
    placa: placa || null,
    veiculo_id: local?.id || null,
    idgps: idgps || null,
    latitude: lat,
    longitude: lng,
    velocidade_kmh: pickNumber(row, ["velocidade_kmh", "velocidade", "Velocidad", "speed", "Speed", "velocidad"]) ?? 0,
    direcao: pickNumber(row, ["direcao", "direccion", "heading", "course", "rumbo"]),
    ignicao: pickBoolean(row, ["ignicao", "ignição", "ignition", "motor", "ligado", "estado", "status"]) ?? false,
    endereco: asString(pick(row, ["endereco", "Endereço", "Endereco", "direccion", "Dirección", "Domicilio", "Lugar", "Local", "address"])) || null,
    motorista: asString(pick(row, ["motorista", "condutor", "Conductor", "driver", "bfleet_condutor"])) || local?.motorista_atual || local?.bfleet_condutor || null,
    sinal: asString(pick(row, ["sinal", "status", "estado", "Estado", "situacao", "Situación"])) || null,
    reportado_em: pickDateTime(row, ["reportado_em", "fecha", "Fecha", "data", "Data", "date", "gps_time", "timestamp", "ultima_comunicacao", "updated_at"]),
    atualizado_em: new Date().toISOString(),
  };
}

async function findExistingPosition(supabase: any, payload: any) {
  const attempts: Array<{ field: string; value: string }> = [];
  if (payload.veiculo_id) attempts.push({ field: "veiculo_id", value: payload.veiculo_id });
  if (payload.idgps) attempts.push({ field: "idgps", value: payload.idgps });
  if (payload.placa) attempts.push({ field: "placa", value: payload.placa });

  for (const a of attempts) {
    const { data, error } = await supabase
      .from("frotas_posicoes")
      .select("placa,veiculo_id,idgps")
      .eq(a.field, a.value)
      .limit(1);

    if (error) throw error;
    if (Array.isArray(data) && data.length) return a;
  }

  return null;
}

async function savePosition(supabase: any, payload: any) {
  const where = await findExistingPosition(supabase, payload);
  if (where) {
    const { error } = await supabase.from("frotas_posicoes").update(payload).eq(where.field, where.value);
    if (error) throw error;
    return "updated";
  }

  const { error } = await supabase.from("frotas_posicoes").insert(payload);
  if (error) throw error;
  return "inserted";
}

async function logSync(supabase: any, row: Record<string, unknown>) {
  await supabase.from("frotas_bfleet_sync_logs").insert(row).catch(() => null);
}

async function syncPositions(supabase: any, config: BfleetConfig, token: string) {
  const { data: localRows, error: localErr } = await supabase
    .from("frotas_veiculos")
    .select("id,placa,motorista_atual,bfleet_condutor,bfleet_id,bfleet_idgps,bfleet_vehicle_id,bfleet_placa,bfleet_patente,status")
    .eq("status", "ATIVO");

  if (localErr) throw localErr;

  const idx = buildVehicleIndexes((localRows || []) as LocalVehicle[]);

  const candidates = [
    await tryBfleetEndpoint(config, token, "vehicleGetAll"),
    await tryBfleetEndpoint(config, token, "positionGetAll"),
    await tryBfleetEndpoint(config, token, "positionsGetAll"),
    await tryBfleetEndpoint(config, token, "lastPositionGetAll"),
    await tryBfleetEndpoint(config, token, "vehiclePositionGetAll"),
    await tryBfleetEndpoint(config, token, "getLastPositions"),
  ];

  const endpointStats = candidates.map((c) => ({
    endpoint: c.endpoint,
    ok: c.ok,
    rows: c.rows.length,
    error: c.ok ? "" : c.error.slice(0, 180),
  }));

  const remoteMap = new Map<string, any>();
  for (const c of candidates) {
    for (const row of c.rows) {
      const local = resolveLocalVehicle(row, idx);
      const key = local?.id || remoteIdGps(row) || remotePlate(row) || JSON.stringify(row).slice(0, 80);
      if (!key) continue;

      const current = remoteMap.get(key);
      if (!current || (!remoteHasGeo(current) && remoteHasGeo(row))) remoteMap.set(key, row);
    }
  }

  const remoteRows = [...remoteMap.values()];

  let withGeo = 0;
  let inserted = 0;
  let updated = 0;
  let skippedNoGeo = 0;
  let skippedNoLink = 0;
  const samplesNoGeo: any[] = [];

  for (const row of remoteRows) {
    const local = resolveLocalVehicle(row, idx);
    const payload = normalizePosition(row, local);

    if (!payload) {
      const hasLink = !!local || !!remotePlate(row) || !!remoteIdGps(row);
      if (!hasLink) skippedNoLink++;
      else skippedNoGeo++;

      if (samplesNoGeo.length < 10) {
        samplesNoGeo.push({ placa: remotePlate(row), idgps: remoteIdGps(row), keys: Object.keys(row || {}).slice(0, 30) });
      }
      continue;
    }

    withGeo++;
    const result = await savePosition(supabase, payload);
    if (result === "updated") updated++;
    else inserted++;
  }

  await logSync(supabase, {
    placa: null,
    veiculo_id: null,
    acao: "sync_positions",
    status: "OK",
    mensagem: `Posições BFleet sincronizadas: ${inserted} inseridas, ${updated} atualizadas, ${withGeo} com coordenada.`,
    payload: { endpointStats, remoteRows: remoteRows.length, skippedNoGeo, skippedNoLink, samplesNoGeo },
    resposta: null,
  });

  return {
    endpoints: endpointStats,
    received: remoteRows.length,
    withGeo,
    inserted,
    updated,
    skippedNoGeo,
    skippedNoLink,
    samplesNoGeo,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Não autenticado." }, 401);

    const supabase = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } });
    const config = await buildConfig(supabase);
    const token = await getToken(config);

    return json({ ok: true, ...(await syncPositions(supabase, config, token)) });
  } catch (err) {
    console.error("sync-bfleet", err);
    return json({ error: String((err as any)?.message || err) }, 500);
  }
});
