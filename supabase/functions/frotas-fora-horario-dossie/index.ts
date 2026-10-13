import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { authorizeRequest } from "../_shared/authorization.ts";

// Recalcula o dossiê "fora do horário" (frotas_fora_horario_dossie) de um ou mais dias.
// O cálculo pesa (varre o Mapa de Embarque do dia) e estoura o limite de 8 s do papel `authenticated`,
// por isso a tela chama esta function, que executa a RPC com service_role (sem esse limite).
// A rotina diária (pg_cron) chama a mesma RPC direto no banco.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cada dia leva ~8–12 s; o limite da Edge Function é ~150 s.
const MAX_DIAS_POR_CHAMADA = 8;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : `${match[1]}-${match[2]}-${match[3]}`;
}

function expandDays(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last && days.length <= 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
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

    const start = isoDate(body?.dataInicial ?? body?.data ?? body?.start);
    const end = isoDate(body?.dataFinal ?? body?.data ?? body?.end) ?? start;
    if (!start || !end) return json({ error: "Informe a data (data) ou o período (dataInicial e dataFinal)." }, 400);
    if (start > end) return json({ error: "A data inicial não pode ser maior que a data final." }, 400);

    const days = expandDays(start, end);
    if (days.length > MAX_DIAS_POR_CHAMADA) {
      return json({ error: `Informe no máximo ${MAX_DIAS_POR_CHAMADA} dias por chamada (pedido: ${days.length}).` }, 400);
    }
    const placa = String(body?.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) || null;

    const resultado: Array<{ data: string; dossies: number | null; erro?: string }> = [];
    for (const day of days) {
      const { data, error } = await supabase.rpc("frotas_fora_horario_dossie_gerar", { p_data: day, p_placa: placa });
      if (error) {
        console.error("[frotas-fora-horario-dossie]", day, error);
        resultado.push({ data: day, dossies: null, erro: error.message });
      } else {
        resultado.push({ data: day, dossies: Number(data ?? 0) });
      }
    }

    const erros = resultado.filter((item) => item.erro).length;
    return json({
      ok: erros === 0,
      dias: resultado,
      dossies: resultado.reduce((sum, item) => sum + (item.dossies || 0), 0),
      erros,
    });
  } catch (err) {
    console.error("[frotas-fora-horario-dossie]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
