import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { authorizeRequest } from "../_shared/authorization.ts";
import {
  apiObjectRows, asString, buildRedgpsConfig, fetchIdgps, getRedgpsToken, haversineKm, onlyPlate, parseNumeric, pick,
  service24Post,
} from "../_shared/redgps.ts";

// Trajeto GPS do veículo em um dia (histórico de posições da RedGPS), para o botão "Consultar rota" do dossiê
// "fora do horário". O resultado de dias já encerrados fica em frotas_fora_horario_rota: a 1ª consulta vai à
// RedGPS (alguns segundos), as seguintes saem do banco.
// Pontos devolvidos: [segundos desde 00:00 (Brasília), latitude, longitude, velocidade km/h], já reduzidos.

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

function saoPauloIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function secondsOfDay(value: string) {
  const m = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

// Reduz o histórico: mantém um ponto a cada 35 m rodados, a cada 3 min (paradas) e o primeiro/último.
function reduzir(points: Array<[number, number, number, number]>) {
  if (points.length <= 2) return points;
  const kept: Array<[number, number, number, number]> = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const last = kept[kept.length - 1];
    const cur = points[i];
    if (haversineKm(last[1], last[2], cur[1], cur[2]) * 1000 >= 35 || cur[0] - last[0] >= 180) kept.push(cur);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const auth = await authorizeRequest(req, ["frotas", "frotas_excesso_velocidade"]);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const placa = onlyPlate(body?.placa);
    const dia = asString(body?.data).slice(0, 10);
    if (!placa) return json({ error: "Informe a placa." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return json({ error: "Informe a data no formato AAAA-MM-DD." }, 400);
    const hoje = saoPauloIsoDate();
    if (dia > hoje) return json({ error: "A data não pode ser futura." }, 400);
    const encerrado = dia < hoje;

    if (encerrado && body?.forcar !== true) {
      const { data: cache } = await supabase
        .from("frotas_fora_horario_rota")
        .select("pontos,total_original,gerado_em")
        .eq("data_evento", dia).eq("placa", placa)
        .maybeSingle();
      if (cache?.pontos) {
        return json({ ok: true, fonte: "cache", pontos: cache.pontos, total_original: cache.total_original, gerado_em: cache.gerado_em });
      }
    }

    const cfg = await buildRedgpsConfig(supabase);
    const token = await getRedgpsToken(cfg);
    const idgps = await fetchIdgps(cfg, token, placa);
    if (!idgps) return json({ error: `Placa ${placa} não localizada na RedGPS.` }, 404);

    const payload = await service24Post(cfg, token, "historyGet", {
      equipo: idgps,
      fechaIni: `${dia} 00:00:00`,
      fechaFin: `${dia} 23:59:59`,
      format: "DateTime",
      limite: "10000",
    }, "Histórico RedGPS");
    const rows = apiObjectRows(payload, ["fecha", "hora", "odometro", "velocidad", "latitud", "latitude"]);

    const brutos: Array<[number, number, number, number]> = [];
    for (const row of rows) {
      const fecha = asString(pick(row, ["fecha", "Fecha", "datetime", "dateTime", "fecha_hora"]));
      const hora = asString(pick(row, ["hora", "Hora", "time"]));
      const stamp = fecha && /\d{1,2}:\d{2}/.test(fecha) ? fecha : `${fecha || dia} ${hora}`;
      const dataLinha = (stamp.match(/(\d{4}-\d{2}-\d{2})/)?.[1]) || dia;
      if (dataLinha !== dia) continue;
      const sec = secondsOfDay(stamp);
      const lat = parseNumeric(pick(row, ["latitud", "Latitud", "latitude", "Latitude", "lat"]));
      const lng = parseNumeric(pick(row, ["longitud", "Longitud", "longitude", "Longitude", "lng", "lon"]));
      if (sec === null || lat === null || lng === null || (lat === 0 && lng === 0)) continue;
      const vel = parseNumeric(pick(row, ["velocidad", "Velocidad", "speed", "velocidade"])) ?? 0;
      brutos.push([sec, Number(lat.toFixed(5)), Number(lng.toFixed(5)), Math.round(vel)]);
    }
    brutos.sort((a, b) => a[0] - b[0]);
    const pontos = reduzir(brutos);

    if (encerrado && pontos.length) {
      const { error } = await supabase.from("frotas_fora_horario_rota").upsert({
        data_evento: dia, placa, idgps, pontos, total_original: brutos.length, gerado_em: new Date().toISOString(),
      }, { onConflict: "data_evento,placa" });
      if (error) console.error("[frotas-fora-horario-rota] cache", error.message);
    }
    return json({ ok: true, fonte: "redgps", pontos, total_original: brutos.length, gerado_em: new Date().toISOString() });
  } catch (err) {
    console.error("[frotas-fora-horario-rota]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
