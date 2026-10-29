import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { authorizeRequest } from "../_shared/authorization.ts";
import { janelaDoSync, normalizarResposta, placaNormalizada, resolverVeiculo } from "../_shared/bfleet-checklist-regras.js";
import { apiObjectRows, asString, buildRedgpsConfig, getRedgpsToken, loadIntegrationSecrets, normalizeKey, service24Post } from "../_shared/redgps.ts";

// Frotas > Manutenção > Checklist: respostas do checklist preenchido no app da BFleet (OnForms, formulário 7294).
// A API onforms/getAnswersForms devolve as respostas por período (placa, condutor, data, hora, local, textos e links das fotos).
// Grava em frotas_checklist_respostas (upsert por id da resposta) e liga ao veículo pela placa.
// Janela padrão: últimos 3 dias. Carga inicial: body { inicio: "2026-03-01", fim: "2026-10-29" }.
// Formulário: padrão 7294; troque pela chave ID_FORMULARIO_CHECKLIST em ti_integracao_segredos.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FORMULARIO_PADRAO = "7294";
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function hojeEmBrasilia() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")}`;
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

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const padrao = janelaDoSync(hojeEmBrasilia(), 3);
    const inicio = DATA.test(asString(body?.inicio)) ? asString(body.inicio) : padrao.inicio;
    const fim = DATA.test(asString(body?.fim)) ? asString(body.fim) : padrao.fim;
    if (inicio > fim) return json({ error: "A data inicial é depois da final." }, 400);

    const secrets = await loadIntegrationSecrets(supabase).catch(() => ({} as Record<string, string>));
    const formId = asString(secrets[normalizeKey("ID_FORMULARIO_CHECKLIST")] || FORMULARIO_PADRAO).replace(/\D/g, "") || FORMULARIO_PADRAO;

    const cfg = await buildRedgpsConfig(supabase);
    if (!cfg.username || !cfg.password) throw new Error("Configure USERNAME e PASSWORD da BFleet (a API de formulários exige o usuário do cliente).");
    const token = await getRedgpsToken(cfg);
    const payload = await service24Post(cfg, token, "onforms/getAnswersForms", {
      username: cfg.username, password: cfg.password, form_id: formId, start_date: inicio, end_date: fim,
    }, "Respostas do formulário de checklist");
    if (payload?.status && Number(payload.status) !== 200) {
      throw new Error(`A BFleet respondeu status ${payload.status}: ${asString(payload?.message ?? payload?.mensaje).slice(0, 200)}`);
    }
    const respostas = apiObjectRows(payload, ["id", "form_id", "patent", "folio"]);

    const { data: perguntasDb, error: erroPerguntas } = await supabase
      .from("frotas_checklist_perguntas").select("componente,rotulo,tipo,ordem").eq("form_id", formId).eq("ativo", true);
    if (erroPerguntas) throw new Error(`Leitura de frotas_checklist_perguntas: ${erroPerguntas.message}`);
    const perguntas = new Map<string, any>((perguntasDb || []).map((p: any) => [p.componente, p]));

    const { data: veiculos, error: erroVeiculos } = await supabase.from("frotas_veiculos").select("id,placa");
    if (erroVeiculos) throw new Error(`Leitura de frotas_veiculos: ${erroVeiculos.message}`);
    const veiculoPorPlaca = new Map<string, string>();
    for (const v of veiculos || []) { const k = placaNormalizada(v.placa); if (k && !veiculoPorPlaca.has(k)) veiculoPorPlaca.set(k, v.id); }

    const linhas = respostas.map((r: any) => normalizarResposta(r, perguntas)).filter(Boolean) as any[];
    const ids = linhas.map((l) => l.resposta_id);
    const jaTinha = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: existentes } = await supabase.from("frotas_checklist_respostas").select("resposta_id").in("resposta_id", ids.slice(i, i + 200));
      for (const e of existentes || []) jaTinha.add(e.resposta_id);
    }

    const agora = new Date().toISOString();
    const paraGravar = linhas.map((l) => ({ ...l, ...resolverVeiculo(l, veiculoPorPlaca), atualizado_em: agora }));
    for (let i = 0; i < paraGravar.length; i += 100) {
      const { error } = await supabase.from("frotas_checklist_respostas").upsert(paraGravar.slice(i, i + 100), { onConflict: "resposta_id" });
      if (error) throw new Error(`Gravação de frotas_checklist_respostas: ${error.message}`);
    }

    return json({
      ok: true,
      formulario: formId,
      periodo: `${inicio} a ${fim}`,
      recebidas: respostas.length,
      gravadas: paraGravar.length,
      novas: linhas.filter((l) => !jaTinha.has(l.resposta_id)).length,
      sem_veiculo_no_cadastro: paraGravar.filter((l) => !l.veiculo_id).length,
      descartadas: respostas.length - paraGravar.length,
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
