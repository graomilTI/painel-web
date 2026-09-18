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

function normalizeName(value: unknown) {
  return asString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyPlate(value: unknown) {
  return asString(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function personFirstName(value: unknown) {
  const first = asString(value).split(/\s+/).filter(Boolean)[0] || "Colaborador";
  return first.charAt(0).toUpperCase() + first.slice(1).toLocaleLowerCase("pt-BR");
}

function formatDateShort(value: unknown) {
  const raw = asString(value);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

function formatTime(value: unknown) {
  const raw = asString(value);
  const m = raw.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : raw;
}

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildNotification(row: any) {
  const nome = personFirstName(row.motorista);
  const placa = onlyPlate(row.placa);
  const data = formatDateShort(row.data_evento);
  const hora = formatTime(row.hora_inicio);
  return `Notificação: Uso de Veículo da Empresa Fora do Expediente

Prezado ${nome}!

Identificamos a utilização do veículo da empresa, placa ${placa}, fora do horário de expediente, no dia ${data}, às ${hora}h.

Conforme a política interna da Grão1000, a utilização dos veículos da empresa fora do horário de expediente somente é permitida mediante autorização prévia da gestão.

Solicitamos os devidos esclarecimentos e a apresentação da justificativa referente à utilização do veículo nesse período.

Informamos também que será realizado o levantamento da quilometragem percorrida indevidamente entre 00h e 05h. O total de quilômetros identificado será multiplicado pelo valor de R$ 4,00 por km, e o valor correspondente será lançado em seu Caixa.

Atenciosamente,

Setor de Frota
Grão1000`;
}

async function authenticatedUser(service: any, req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sessão não encontrada. Entre novamente no painel.");
  const { data, error } = await service.auth.getUser(token);
  if (error || !data?.user) throw new Error("Sessão inválida ou expirada.");
  return data.user;
}

async function getOccurrence(service: any, id: string) {
  const { data, error } = await service
    .from("frotas_fora_horario_ocorrencias")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Ocorrência não encontrada.");
  return data;
}

async function enqueueCaixaJob(service: any) {
  const agent = "sync-frotas-fora-horario-caixa";
  const { data: openJob, error: openError } = await service
    .from("grm_sync_jobs")
    .select("id")
    .eq("agente_id", agent)
    .in("status", ["pendente", "rodando"])
    .limit(1)
    .maybeSingle();
  if (openError) throw openError;
  if (openJob?.id) return openJob.id;

  const { data, error } = await service
    .from("grm_sync_jobs")
    .insert({ agente_id: agent, status: "pendente" })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id || null;
}

async function actionGenerate(service: any, row: any, user: any) {
  if (!asString(row.motorista)) throw new Error("Motorista não identificado para esta ocorrência.");
  if (!asString(row.hora_inicio)) throw new Error("Horário inicial ainda não foi calculado.");
  const message = buildNotification(row);
  const now = new Date().toISOString();
  const { error } = await service
    .from("frotas_fora_horario_ocorrencias")
    .update({
      status_notificacao: "GERADA",
      mensagem_gerada: message,
      gerado_em: now,
      gerado_por: user.id,
      gerado_por_nome: asString(user.user_metadata?.nome || user.user_metadata?.name || user.email),
      updated_at: now,
    })
    .eq("id", row.id);
  if (error) throw error;
  return { ok: true, action: "GERAR", message };
}

async function actionJustify(service: any, row: any, user: any, justificativa: string) {
  const reason = asString(justificativa);
  if (!reason) throw new Error("Informe a justificativa.");
  if (["PENDENTE", "PROCESSANDO", "LANCADO"].includes(asString(row.status_caixa).toUpperCase())) {
    throw new Error("Esta ocorrência já foi enviada ao Caixa e não pode ser marcada como justificada.");
  }
  const now = new Date().toISOString();
  const { error } = await service
    .from("frotas_fora_horario_ocorrencias")
    .update({
      status_notificacao: "JUSTIFICADA",
      justificativa: reason,
      justificado_em: now,
      justificado_por: user.id,
      justificado_por_nome: asString(user.user_metadata?.nome || user.user_metadata?.name || user.email),
      updated_at: now,
    })
    .eq("id", row.id);
  if (error) throw error;
  return { ok: true, action: "JUSTIFICAR" };
}

async function actionCaixa(service: any, row: any, user: any) {
  if (asString(row.status_notificacao).toUpperCase() === "JUSTIFICADA") {
    throw new Error("Ocorrência justificada não pode ser enviada ao Caixa.");
  }
  const colaborador = asString(row.motorista);
  if (!colaborador) throw new Error("Motorista não identificado para lançamento no Caixa.");
  const km = Number(row.km_00_05 || 0);
  if (!Number.isFinite(km) || km <= 0) throw new Error("Quilometragem entre 00h e 05h ainda não foi calculada.");
  const valorKm = 4;
  const valor = Math.round(km * valorKm * 100) / 100;

  const { data: existing, error: existingError } = await service
    .from("frotas_fora_horario_caixa_lancamentos")
    .select("id,status,valor")
    .eq("ocorrencia_id", row.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    await service.from("frotas_fora_horario_ocorrencias").update({
      status_caixa: existing.status || "PENDENTE",
      caixa_lancamento_id: existing.id,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    return { ok: true, action: "CAIXA", already_exists: true, queue_id: existing.id, valor: Number(existing.valor || valor) };
  }

  const descricao = `Frotas - Uso de veículo fora do expediente - placa ${onlyPlate(row.placa)} - ${formatDateShort(row.data_evento)} - ${km.toFixed(3).replace(".", ",")} km x R$ 4,00/km`;
  const now = new Date().toISOString();
  const userName = asString(user.user_metadata?.nome || user.user_metadata?.name || user.email);

  const { data: queue, error: queueError } = await service
    .from("frotas_fora_horario_caixa_lancamentos")
    .insert({
      ocorrencia_id: row.id,
      data_evento: row.data_evento,
      placa: onlyPlate(row.placa),
      colaborador_nome: colaborador,
      nome_normalizado: normalizeName(colaborador),
      km_00_05: km,
      valor_km: valorKm,
      valor,
      descricao,
      status: "PENDENTE",
      solicitado_por: user.id,
      solicitado_por_nome: userName,
      solicitado_em: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (queueError) throw queueError;

  const { error: updateError } = await service
    .from("frotas_fora_horario_ocorrencias")
    .update({
      status_caixa: "PENDENTE",
      caixa_solicitado_em: now,
      caixa_solicitado_por: user.id,
      caixa_solicitado_por_nome: userName,
      caixa_lancamento_id: queue.id,
      updated_at: now,
    })
    .eq("id", row.id);
  if (updateError) throw updateError;

  const jobId = await enqueueCaixaJob(service);
  return { ok: true, action: "CAIXA", queue_id: queue.id, job_id: jobId, valor, km, valor_km: valorKm };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Supabase não configurado na função.");

    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const user = await authenticatedUser(service, req);
    const body = await req.json().catch(() => ({}));
    const occurrenceId = asString(body?.occurrenceId || body?.ocorrenciaId || body?.id);
    const action = asString(body?.action || body?.acao).toUpperCase();
    if (!occurrenceId) throw new Error("Informe a ocorrência.");
    if (!["GERAR", "JUSTIFICAR", "CAIXA"].includes(action)) throw new Error("Ação inválida.");

    const row = await getOccurrence(service, occurrenceId);
    if (action === "GERAR") return json(await actionGenerate(service, row, user));
    if (action === "JUSTIFICAR") return json(await actionJustify(service, row, user, asString(body?.justificativa)));
    return json(await actionCaixa(service, row, user));
  } catch (err) {
    console.error("[frotas-fora-horario-acoes]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
