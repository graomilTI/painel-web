import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { authorizeRequest } from "../_shared/authorization.ts";
import { lerRelatorioWeb } from "../_shared/bfleet-relatorio-web.ts";
import { aparelhosDoRelatorio } from "../_shared/bfleet-relatorio-regras.js";
import { asString, loadIntegrationSecrets, normalizeKey } from "../_shared/redgps.ts";

// Frotas > Cadastros > Motoristas: quem já instalou o app da BFleet.
// A API da RedGPS não lista os celulares (getDevices/getUsers dão 403 e vehicleGetAll só traz veículos), mas o relatório
// programado "Equipamentos sem relatório" (OnReports) lista todos os equipamentos, inclusive os celulares do app (ID de 16 hex).
// Este sync lê o relatório pelo portal web e grava os celulares em frotas_bfleet_apps. Nada é apagado: quem instalou o app
// continua com o status mesmo que o celular passe um tempo sem reportar.
// ID do relatório: padrão 98247; troque pela chave ID_RELATORIO_EQUIPAMENTOS_SEM_REPORTE em ti_integracao_segredos.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RELATORIO_PADRAO = "98247";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  // O agendamento (pg_cron) chama com a chave de serviço; a tela chama com o login do usuário.
  const doAgendamento = Boolean(serviceKey) && bearer === serviceKey;
  if (!doAgendamento) {
    const auth = await authorizeRequest(req, ["frotas"]);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const secrets = await loadIntegrationSecrets(supabase).catch(() => ({} as Record<string, string>));
    const reportId = asString(secrets[normalizeKey("ID_RELATORIO_EQUIPAMENTOS_SEM_REPORTE")] || RELATORIO_PADRAO).replace(/\D/g, "") || RELATORIO_PADRAO;

    const linhas = await lerRelatorioWeb(supabase, reportId, "equiposSinReportar");
    if (!linhas.length) throw new Error(`O relatório ${reportId} voltou sem nenhuma linha.`);
    const aparelhos = aparelhosDoRelatorio(linhas);

    const { data: existentes, error: erroLeitura } = await supabase.from("frotas_bfleet_apps").select("equipo");
    if (erroLeitura) throw new Error(`Leitura de frotas_bfleet_apps: ${erroLeitura.message}`);
    const jaTinha = new Set((existentes || []).map((r: any) => r.equipo));

    const agora = new Date().toISOString();
    if (aparelhos.length) {
      const { error } = await supabase.from("frotas_bfleet_apps").upsert(
        aparelhos.map((a: any) => ({ ...a, atualizado_em: agora })),
        { onConflict: "equipo" },
      );
      if (error) throw new Error(`Gravação de frotas_bfleet_apps: ${error.message}`);
    }

    return json({
      ok: true,
      relatorio: reportId,
      linhas_do_relatorio: linhas.length,
      celulares: aparelhos.length,
      novos: aparelhos.filter((a: any) => !jaTinha.has(a.equipo)).length,
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
