import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function pick(obj: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => acc?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalizePhone(value: unknown) {
  const raw = digits(value);
  if (!raw) return "";
  if (raw.startsWith("55") && raw.length >= 12) return raw;
  return raw.length >= 10 ? `55${raw}` : raw;
}

function extractCode(text: string) {
  return text.toUpperCase().match(/HOSP[-\s]?\d{3,}/)?.[0]?.replace(/\s/g, "-") || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: secretRow } = await supabase
      .from("ti_integracao_segredos")
      .select("valor")
      .eq("chave", "HOSPEDAGEM_BOTCONVERSA_WEBHOOK_SECRET")
      .eq("ativo", true)
      .maybeSingle();

    const configuredSecret = secretRow?.valor || Deno.env.get("HOSPEDAGEM_BOTCONVERSA_WEBHOOK_SECRET") || "";
    const receivedSecret = req.headers.get("x-webhook-secret") || new URL(req.url).searchParams.get("token") || "";
    if (!configuredSecret) return json({ ok: false, error: "Webhook secret não configurado." }, 503);
    if (receivedSecret !== configuredSecret) return json({ ok: false, error: "Webhook não autorizado." }, 401);

    const body = await req.json();
    const phone = normalizePhone(pick(body, [
      "phone", "subscriber.phone", "contact.phone", "sender.phone", "data.phone", "data.subscriber.phone",
    ]));
    const text = String(pick(body, [
      "message", "text", "caption", "data.message", "data.text", "payload.message", "event.message.text",
    ]) || "");
    const fileUrl = String(pick(body, [
      "file_url", "fileUrl", "attachment.url", "attachments.0.url", "data.file_url", "data.fileUrl", "message.file_url", "event.message.file.url",
    ]) || "");
    const mimeType = String(pick(body, [
      "mime_type", "mimeType", "attachment.mime_type", "attachments.0.mime_type", "data.mime_type", "event.message.file.mime_type",
    ]) || "");
    const fileName = String(pick(body, [
      "file_name", "filename", "attachment.name", "attachments.0.name", "data.file_name", "event.message.file.name",
    ]) || "");
    const externalId = String(pick(body, [
      "message_id", "id", "data.message_id", "data.id", "event.message.id",
    ]) || "");

    if (!phone && !extractCode(text)) return json({ ok: false, error: "Não foi possível identificar telefone ou código da hospedagem." }, 400);
    if (!fileUrl && !text) return json({ ok: false, error: "Webhook sem mensagem ou arquivo." }, 400);

    const code = extractCode(text);
    let solicitation: any = null;
    let hotel: any = null;

    if (code) {
      const { data } = await supabase
        .from("hospedagem_painel_geral")
        .select("*")
        .eq("codigo", code)
        .maybeSingle();
      solicitation = data;
    }

    if (!solicitation && phone) {
      const { data: hotels } = await supabase
        .from("hospedagem_hoteis")
        .select("id,nome,whatsapp")
        .not("whatsapp", "is", null);
      hotel = (hotels || []).find((item: any) => normalizePhone(item.whatsapp) === phone) || null;
      if (hotel) {
        const { data } = await supabase
          .from("hospedagem_painel_geral")
          .select("*")
          .eq("hotel_id", hotel.id)
          .in("status_solicitacao", ["RESERVADA", "EM_COTACAO", "SOLICITADA"])
          .order("data_solicitacao", { ascending: false })
          .limit(1)
          .maybeSingle();
        solicitation = data;
      }
    }

    if (!solicitation) {
      return json({ ok: false, error: "Nenhuma hospedagem aberta foi localizada para esta mensagem." }, 404);
    }

    if (!hotel && solicitation.hotel_id) {
      const { data } = await supabase
        .from("hospedagem_hoteis")
        .select("id,nome,whatsapp")
        .eq("id", solicitation.hotel_id)
        .maybeSingle();
      hotel = data;
    }

    if (fileUrl) {
      const lower = `${fileName} ${mimeType} ${text}`.toLowerCase();
      const type = lower.includes("nf") || lower.includes("nota") || lower.includes("nfs") ? "NFSE" : "OUTRO";
      const { data: documentRow, error } = await supabase
        .from("hospedagem_documentos")
        .upsert({
          solicitacao_id: solicitation.solicitacao_id,
          reserva_id: solicitation.reserva_id || null,
          tipo: type,
          arquivo_url: fileUrl,
          nome_arquivo: fileName || null,
          mime_type: mimeType || null,
          origem: "BOTCONVERSA",
          status: "RECEBIDO",
          external_message_id: externalId || null,
          recebido_em: new Date().toISOString(),
          observacoes: text || null,
        }, externalId ? { onConflict: "external_message_id" } : undefined)
        .select("id,tipo")
        .single();
      if (error) throw error;

      await supabase.from("hospedagem_mensagens").upsert({
        solicitacao_id: solicitation.solicitacao_id,
        reserva_id: solicitation.reserva_id || null,
        hotel_id: hotel?.id || solicitation.hotel_id || null,
        direcao: "ENTRADA",
        tipo: type === "NFSE" ? "NFSE" : "DOCUMENTO",
        canal: "BOTCONVERSA",
        remetente: phone,
        conteudo: text || null,
        arquivo_url: fileUrl,
        external_message_id: externalId || null,
        status: "RECEBIDA",
        recebido_em: new Date().toISOString(),
      }, externalId ? { onConflict: "external_message_id" } : undefined);

      return json({ ok: true, action: "documento_vinculado", document_id: documentRow.id, tipo: documentRow.tipo, codigo: solicitation.codigo });
    }

    const quote = hotel?.id
      ? await supabase
        .from("hospedagem_cotacoes")
        .select("id")
        .eq("solicitacao_id", solicitation.solicitacao_id)
        .eq("hotel_id", hotel.id)
        .maybeSingle()
      : { data: null };

    if (quote.data?.id) {
      await supabase.from("hospedagem_cotacoes").update({
        status: "RESPONDIDA",
        resposta_texto: text,
        respondido_em: new Date().toISOString(),
      }).eq("id", quote.data.id);
    }

    await supabase.from("hospedagem_mensagens").upsert({
      solicitacao_id: solicitation.solicitacao_id,
      reserva_id: solicitation.reserva_id || null,
      hotel_id: hotel?.id || solicitation.hotel_id || null,
      direcao: "ENTRADA",
      tipo: "RESPOSTA_COTACAO",
      canal: "BOTCONVERSA",
      remetente: phone,
      conteudo: text,
      external_message_id: externalId || null,
      status: "RECEBIDA",
      recebido_em: new Date().toISOString(),
    }, externalId ? { onConflict: "external_message_id" } : undefined);

    return json({ ok: true, action: "mensagem_vinculada", codigo: solicitation.codigo });
  } catch (error) {
    console.error("[hospedagem-whatsapp-webhook]", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
