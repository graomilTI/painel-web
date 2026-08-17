import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BOT_BASE = "https://backend.botconversa.com.br/api/v1/webhook";
const TZ = "America/Sao_Paulo";
const STALE_MS = 2 * 60 * 60 * 1000;

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function phone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length > 11) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function localDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseBrDateTime(value: unknown) {
  const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  // São Paulo is UTC-3 in the operational period. Date.UTC avoids dependence on Edge region.
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]) + 3, Number(match[5])));
}

function pick(body: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => acc?.[key], body);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

async function apiKey(admin: ReturnType<typeof createClient>) {
  const envKey = String(Deno.env.get("BOTCONVERSA_API_KEY") || "").trim();
  if (envKey) return envKey;
  const { data } = await admin.from("ti_integracao_segredos").select("valor").eq("chave", "BOTCONVERSA_API_KEY").eq("ativo", true).maybeSingle();
  if (data?.valor) return String(data.valor).trim();
  const fallback = await admin.from("botconversa_config").select("valor").eq("chave", "BOTCONVERSA_API_KEY").eq("ativo", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return String(fallback.data?.valor || "").trim();
}

async function sendBotMessage(tel: string, nome: string, message: string, key: string) {
  const headers = { "api-key": key, accept: "application/json" };
  let subscriber = await fetch(`${BOT_BASE}/subscriber/${tel}/`, { headers });
  let payload = await subscriber.json().catch(() => ({}));
  if (!subscriber.ok || !payload?.id) {
    const names = nome.trim().split(/\s+/);
    const form = new FormData();
    form.append("phone", tel);
    form.append("first_name", names.shift() || "Colaborador");
    form.append("last_name", names.join(" ") || "GRM");
    subscriber = await fetch(`${BOT_BASE}/subscriber/`, { method: "POST", headers, body: form });
    payload = await subscriber.json().catch(() => ({}));
  }
  if (!payload?.id) throw new Error(`Contato não localizado no BotConversa (HTTP ${subscriber.status}).`);
  const form = new FormData();
  form.append("type", "text");
  form.append("value", message);
  const sent = await fetch(`${BOT_BASE}/subscriber/${payload.id}/send_message/`, { method: "POST", headers, body: form });
  if (!sent.ok) throw new Error(`Mensagem recusada pelo BotConversa (HTTP ${sent.status}).`);
  return String(payload.id);
}

async function scan(admin: ReturnType<typeof createClient>, dryRun = false) {
  const now = new Date();
  const today = localDate(now);
  const latest = await admin.from("grm_mapa_embarque_importacoes")
    .select("dados_json,created_at").gte("created_at", new Date(now.getTime() - 30 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false }).limit(10000);
  if (latest.error) throw latest.error;

  const byOs = new Map<string, any>();
  for (const item of latest.data || []) {
    const row = item.dados_json || {};
    const os = String(row.OS || "").trim();
    if (!os || byOs.has(os)) continue;
    byOs.set(os, row);
  }

  const collaborators = await admin.from("colaboradores_atuais").select("cpf,nome,whatsapp").not("whatsapp", "is", null).limit(10000);
  if (collaborators.error) throw collaborators.error;
  const people = new Map((collaborators.data || []).map((c: any) => [normalize(c.nome), c]));
  const botContacts = await admin.from("botconversa_contatos").select("cpf,nome,telefone").not("telefone", "is", null).limit(10000);
  if (botContacts.error) throw botContacts.error;
  for (const contact of botContacts.data || []) {
    const key = normalize(contact.nome);
    if (key && !people.has(key)) people.set(key, { ...contact, whatsapp: contact.telefone });
  }
  const eligible = [...byOs.entries()].filter(([, row]) => {
    const updated = parseBrDateTime(row["Última Atualização"]);
    const mapDate = String(row.Data || "").split("/").reverse().join("-");
    const responsible = String(row["Atualizado por"] || "").trim();
    return Boolean(updated && mapDate === today && responsible && now.getTime() - updated.getTime() > STALE_MS);
  });

  const stats = { dryRun, analisadas: byOs.size, elegiveis: eligible.length, simuladas: 0, agendadas: 0, duplicadas: 0, silenciadas: 0, semContato: 0, erros: 0 };
  for (let position = 0; position < eligible.length; position++) {
    const [os, row] = eligible[position];
    const updated = parseBrDateTime(row["Última Atualização"])!;
    const mapDate = String(row.Data || "").split("/").reverse().join("-");
    const responsible = String(row["Atualizado por"] || "").trim();

    const previousClosed = await admin.from("mapa_embarque_alertas_atualizacao")
      .select("silenciado_data").eq("os", os).eq("status", "encerrado")
      .order("silenciado_data", { ascending: false }).limit(1).maybeSingle();
    if (previousClosed.data?.silenciado_data && localDate(updated) <= previousClosed.data.silenciado_data) {
      stats.silenciadas++;
      continue;
    }

    const existing = await admin.from("mapa_embarque_alertas_atualizacao")
      .select("id,status").eq("os", os).eq("informativo_em", updated.toISOString()).maybeSingle();
    if (existing.data) { stats.duplicadas++; continue; }

    const person: any = people.get(normalize(responsible));
    const tel = phone(person?.whatsapp);
    const spreadMs = eligible.length <= 1 ? 0 : Math.floor(position * 29 * 60 * 1000 / (eligible.length - 1));
    const base = {
      os, data_mapa: mapDate, informativo_em: updated.toISOString(),
      colaborador_nome: responsible, colaborador_cpf: person?.cpf || null,
      telefone: tel || null, cliente: String(row.Cliente || "").trim() || null,
      agendado_para: new Date(now.getTime() + spreadMs).toISOString(),
    };
    if (!tel) {
      if (!dryRun) await admin.from("mapa_embarque_alertas_atualizacao").insert({ ...base, status: "sem_contato", ultimo_erro: "Colaborador sem WhatsApp localizado." });
      stats.semContato++;
      continue;
    }
    if (dryRun) { stats.simuladas++; continue; }
    const inserted = await admin.from("mapa_embarque_alertas_atualizacao").insert({ ...base, status: "agendado" });
    if (inserted.error) { stats.duplicadas++; continue; }
    stats.agendadas++;
  }
  return stats;
}

async function dispatch(admin: ReturnType<typeof createClient>) {
  const now = new Date();
  const due = await admin.from("mapa_embarque_alertas_atualizacao")
    .select("id,os,cliente,colaborador_nome,telefone")
    .eq("status", "agendado").lte("agendado_para", now.toISOString())
    .order("agendado_para", { ascending: true }).limit(5);
  if (due.error) throw due.error;
  if (!due.data?.length) return { encontradas: 0, enviadas: 0, erros: 0 };
  const key = await apiKey(admin);
  if (!key) throw new Error("BOTCONVERSA_API_KEY não configurada.");
  let sent = 0;
  let errors = 0;
  for (const item of due.data) {
    const claimed = await admin.from("mapa_embarque_alertas_atualizacao")
      .update({ status: "pendente", updated_at: now.toISOString() })
      .eq("id", item.id).eq("status", "agendado").select("id").maybeSingle();
    if (!claimed.data) continue;
    try {
      const message = `${item.colaborador_nome}\nA OS ${item.os} está a mais de 2h sem ser atualizada!\nO cliente ${item.cliente || "não informado"} solicita uma atualização!`;
      const subscriberId = await sendBotMessage(String(item.telefone), String(item.colaborador_nome), message, key);
      await admin.from("mapa_embarque_alertas_atualizacao").update({ status: "alertado", alertado_em: now.toISOString(), external_message_id: subscriberId, updated_at: now.toISOString() }).eq("id", item.id).eq("status", "pendente");
      sent++;
    } catch (error) {
      await admin.from("mapa_embarque_alertas_atualizacao").update({ status: "erro", ultimo_erro: String(error), updated_at: now.toISOString() }).eq("id", item.id).eq("status", "pendente");
      errors++;
    }
  }
  return { encontradas: due.data.length, enviadas: sent, erros: errors };
}

async function inbound(admin: ReturnType<typeof createClient>, body: any) {
  const tel = phone(pick(body, ["phone", "subscriber.phone", "contact.phone", "sender.phone", "data.phone", "data.subscriber.phone"]));
  const text = String(pick(body, ["message", "text", "caption", "data.message", "data.text", "payload.message", "event.message.text"]) || "").trim();
  const externalId = String(pick(body, ["message_id", "id", "data.message_id", "data.id", "event.message.id"]) || "");
  if (!tel || !text) return response({ ok: false, error: "Telefone ou resposta ausente." }, 400);

  const normalized = normalize(text);
  const isClosed = /(ENCERRAD|FINALIZ|CONCLUID|TERMINOU|TERMINADO|ACABOU)/.test(normalized);
  const osMentioned = text.match(/\b\d{4,10}\b/)?.[0];
  let query = admin.from("mapa_embarque_alertas_atualizacao").select("id,os").eq("telefone", tel).eq("status", "alertado").order("alertado_em", { ascending: false }).limit(1);
  if (osMentioned) query = query.eq("os", osMentioned);
  const pending = await query.maybeSingle();
  if (!pending.data) return response({ ok: false, error: "Nenhum alerta aberto foi localizado para este telefone." }, 404);

  const now = new Date();
  const patch: Record<string, unknown> = { status: isClosed ? "encerrado" : "respondido", respondido_em: now.toISOString(), resposta: text, external_message_id: externalId || null, updated_at: now.toISOString() };
  if (isClosed) {
    patch.silenciado_em = now.toISOString();
    patch.silenciado_data = localDate(now);
  }
  const saved = await admin.from("mapa_embarque_alertas_atualizacao").update(patch).eq("id", pending.data.id);
  if (saved.error) throw saved.error;
  return response({ ok: true, action: isClosed ? "os_silenciada" : "resposta_registrada", os: pending.data.os });
}

serve(async (req) => {
  if (req.method !== "POST") return response({ ok: false, error: "Método não permitido." }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    if (body.action === "scan" || body.action === "dispatch") {
      const auth = req.headers.get("authorization") || "";
      const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
      if (!serviceKey || auth !== `Bearer ${serviceKey}`) return response({ ok: false, error: "Não autorizado." }, 401);
      if (body.action === "dispatch") return response({ ok: true, ...(await dispatch(admin)) });
      return response({ ok: true, ...(await scan(admin, body.dryRun === true)) });
    }
    const secretRow = await admin.from("ti_integracao_segredos").select("valor")
      .eq("chave", "MAPA_EMBARQUE_BOTCONVERSA_WEBHOOK_SECRET").eq("ativo", true).maybeSingle();
    const secret = String(secretRow.data?.valor || Deno.env.get("MAPA_EMBARQUE_BOTCONVERSA_WEBHOOK_SECRET") || "");
    const received = req.headers.get("x-webhook-secret") || new URL(req.url).searchParams.get("token") || "";
    if (!secret || received !== secret) return response({ ok: false, error: "Webhook não autorizado." }, 401);
    return await inbound(admin, body);
  } catch (error) {
    console.error("[mapa-embarque-alertas]", error);
    return response({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
