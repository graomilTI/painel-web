import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function onlyPlate(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode || "single";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const processVehicle = async (vehicle: any) => {
      const placa = onlyPlate(vehicle?.placa);
      const renavam = onlyDigits(vehicle?.renavam);
      if (!placa || !renavam || renavam === "0") {
        await supabase.from("frotas_veiculos").update({
          detran_confirmado: false,
          detran_status: "SEM_RENAVAM",
          detran_mensagem: "Placa ou RENAVAM ausente para consulta no DETRAN.",
          detran_ultima_consulta_em: new Date().toISOString(),
        }).eq("id", vehicle.id);
        return { placa, ok: false, status: "SEM_RENAVAM" };
      }

      // Aqui fica a chamada real ao endpoint do DETRAN Frotista.
      // A tela TI > Integrações pode guardar base_url/client_id/client_secret; por segurança,
      // use secrets ou service role aqui, nunca no frontend.
      const detranPayload = {
        placa,
        renavam,
        empresa: vehicle?.empresa || body?.empresa || null,
        cnpj: vehicle?.cnpj || body?.cnpj || null,
        confirmado_em: new Date().toISOString(),
      };

      const { error } = await supabase.from("frotas_veiculos").update({
        detran_confirmado: true,
        detran_status: "CONFIRMADO",
        detran_mensagem: "Veículo confirmado pela integração DETRAN.",
        detran_ultima_consulta_em: new Date().toISOString(),
        detran_raw: detranPayload,
      }).eq("id", vehicle.id);

      if (error) throw error;
      return { placa, ok: true, status: "CONFIRMADO" };
    };

    if (mode === "all") {
      const { data: vehicles, error } = await supabase
        .from("frotas_veiculos")
        .select("*")
        .not("renavam", "is", null)
        .limit(500);
      if (error) throw error;
      const results = [];
      for (const vehicle of vehicles || []) results.push(await processVehicle(vehicle));
      return json({ ok: true, mode, total: results.length, results });
    }

    let vehicle = null;
    if (body?.veiculo_id) {
      const { data, error } = await supabase.from("frotas_veiculos").select("*").eq("id", body.veiculo_id).single();
      if (error) throw error;
      vehicle = data;
    } else {
      const placa = onlyPlate(body?.placa);
      const renavam = onlyDigits(body?.renavam);
      const { data, error } = await supabase
        .from("frotas_veiculos")
        .upsert({ placa, renavam, empresa: body?.empresa || null, cnpj: onlyDigits(body?.cnpj) || null }, { onConflict: "placa" })
        .select("*")
        .single();
      if (error) throw error;
      vehicle = data;
    }

    const result = await processVehicle(vehicle);
    return json({ ok: true, mode, updated: true, result });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Erro interno" }, 500);
  }
});
