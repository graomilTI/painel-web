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

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function flattenValues(value: unknown, prefix = "", output = new Map<string, unknown>()) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenValues(item, `${prefix}.${index}`, output));
    return output;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fieldName = record.name ?? record.key ?? record.field ?? record.slug ?? record.label;
    const fieldValue = record.value ?? record.answer ?? record.response ?? record.content;
    if (fieldName !== undefined && fieldValue !== undefined && typeof fieldValue !== "object") {
      output.set(normalizeKey(fieldName), fieldValue);
    }
    Object.entries(record).forEach(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenValues(item, path, output);
    });
    return output;
  }
  const full = normalizeKey(prefix);
  const leaf = normalizeKey(prefix.split(".").pop());
  if (full) output.set(full, value);
  if (leaf && !output.has(leaf)) output.set(leaf, value);
  return output;
}

function parseLabelledText(text: string, output: Map<string, unknown>) {
  String(text || "").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^:=-]{2,60})\s*[:=-]\s*(.+?)\s*$/);
    if (!match) return;
    const key = normalizeKey(match[1]);
    if (key && !output.has(key)) output.set(key, match[2]);
  });
}

function valueFrom(map: Map<string, unknown>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const alias of normalizedAliases) {
    if (map.has(alias)) return map.get(alias);
  }
  for (const [key, value] of map.entries()) {
    if (normalizedAliases.some((alias) => key.endsWith(`_${alias}`))) return value;
  }
  return null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  if (["sim", "s", "yes", "true", "1", "disponivel", "disponibilidade_confirmada", "incluido", "aceita"].includes(normalized)) return true;
  if (["nao", "n", "no", "false", "0", "indisponivel", "sem_disponibilidade", "nao_incluido", "nao_aceita"].includes(normalized)) return false;
  if (normalized.includes("nao") || normalized.includes("indispon")) return false;
  if (normalized.includes("sim") || normalized.includes("disponiv")) return true;
  return null;
}

function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = String(value ?? "").trim();
  if (!raw) return null;
  raw = raw.replace(/[^0-9,.-]/g, "");
  if (!raw) return null;
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function quoteFields(body: any, text: string) {
  const values = flattenValues(body);
  parseLabelledText(text, values);
  return {
    code: String(valueFrom(values, ["codigo", "codigo_hospedagem", "solicitacao", "solicitacao_codigo"]) || ""),
    flowId: String(valueFrom(values, ["flow_id", "flowid", "fluxo_id", "id_fluxo"]) || ""),
    availability: parseBoolean(valueFrom(values, ["disponibilidade", "disponivel", "tem_disponibilidade", "possui_disponibilidade"])),
    dailyValue: parseMoney(valueFrom(values, ["valor_diaria", "diaria", "valor_da_diaria", "preco_diaria"])),
    totalValue: parseMoney(valueFrom(values, ["valor_total", "total", "total_cotacao", "valor_total_cotacao"])),
    acceptsCheckout: parseBoolean(valueFrom(values, ["aceita_pagamento_checkout", "pagamento_checkout", "aceita_checkout", "pagar_checkout"])),
    breakfastIncluded: parseBoolean(valueFrom(values, ["cafe_incluso", "cafe_da_manha", "cafe_da_manha_incluso", "inclui_cafe"])),
    parkingIncluded: parseBoolean(valueFrom(values, ["estacionamento_incluso", "estacionamento", "inclui_estacionamento"])),
    emitsInvoice: parseBoolean(valueFrom(values, ["emite_nota_fiscal", "emite_nf", "nota_fiscal", "emissao_nota_fiscal"])),
    notes: String(valueFrom(values, ["observacoes", "observacao", "comentarios", "detalhes", "mensagem_final"]) || ""),
  };
}

function hasStructuredQuote(fields: ReturnType<typeof quoteFields>) {
  return [
    fields.availability,
    fields.dailyValue,
    fields.totalValue,
    fields.acceptsCheckout,
    fields.breakfastIncluded,
    fields.parkingIncluded,
    fields.emitsInvoice,
  ].some((value) => value !== null) || Boolean(fields.notes || fields.code);
}

function quoteSummary(fields: ReturnType<typeof quoteFields>) {
  return [
    fields.availability === null ? "" : `Disponibilidade: ${fields.availability ? "Sim" : "Não"}`,
    fields.dailyValue === null ? "" : `Diária: R$ ${fields.dailyValue.toFixed(2)}`,
    fields.totalValue === null ? "" : `Total: R$ ${fields.totalValue.toFixed(2)}`,
    fields.breakfastIncluded === null ? "" : `Café: ${fields.breakfastIncluded ? "Sim" : "Não"}`,
    fields.parkingIncluded === null ? "" : `Estacionamento: ${fields.parkingIncluded ? "Sim" : "Não"}`,
    fields.acceptsCheckout === null ? "" : `Pagamento no checkout: ${fields.acceptsCheckout ? "Sim" : "Não"}`,
    fields.emitsInvoice === null ? "" : `Emite NF: ${fields.emitsInvoice ? "Sim" : "Não"}`,
    fields.notes,
  ].filter(Boolean).join(" | ");
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
    const fields = quoteFields(body, text);
    const code = extractCode(fields.code) || extractCode(text);

    if (!phone && !code) return json({ ok: false, error: "Não foi possível identificar telefone ou código da hospedagem." }, 400);
    if (!fileUrl && !text && !hasStructuredQuote(fields)) return json({ ok: false, error: "Webhook sem mensagem, arquivo ou dados da cotação." }, 400);

    let solicitation: any = null;
    let hotel: any = null;
    let quote: any = null;

    if (code) {
      const { data } = await supabase
        .from("hospedagem_painel_geral")
        .select("*")
        .eq("codigo", code)
        .maybeSingle();
      solicitation = data;
    }

    if (phone) {
      const { data: hotels } = await supabase
        .from("hospedagem_hoteis")
        .select("id,nome,whatsapp,emite_nota_fiscal")
        .not("whatsapp", "is", null);
      hotel = (hotels || []).find((item: any) => normalizePhone(item.whatsapp) === phone) || null;
    }

    if (solicitation && hotel?.id) {
      const { data } = await supabase
        .from("hospedagem_cotacoes")
        .select("*")
        .eq("solicitacao_id", solicitation.solicitacao_id)
        .eq("hotel_id", hotel.id)
        .maybeSingle();
      quote = data;
    }

    if (!solicitation && hotel?.id) {
      const { data } = await supabase
        .from("hospedagem_cotacoes")
        .select("*")
        .eq("hotel_id", hotel.id)
        .in("status", ["ENVIADA", "ENVIANDO", "PENDENTE", "RESPONDIDA"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      quote = data;
      if (quote?.solicitacao_id) {
        const { data: row } = await supabase
          .from("hospedagem_painel_geral")
          .select("*")
          .eq("solicitacao_id", quote.solicitacao_id)
          .maybeSingle();
        solicitation = row;
      }
    }

    if (!solicitation && hotel?.id) {
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

    if (solicitation && !hotel && solicitation.hotel_id) {
      const { data } = await supabase
        .from("hospedagem_hoteis")
        .select("id,nome,whatsapp,emite_nota_fiscal")
        .eq("id", solicitation.hotel_id)
        .maybeSingle();
      hotel = data;
    }

    if (solicitation && !quote) {
      let query = supabase
        .from("hospedagem_cotacoes")
        .select("*")
        .eq("solicitacao_id", solicitation.solicitacao_id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (hotel?.id) query = query.eq("hotel_id", hotel.id);
      const { data } = await query.maybeSingle();
      quote = data;
    }

    if (!solicitation) {
      return json({ ok: false, error: "Nenhuma hospedagem ou cotação aberta foi localizada para esta resposta." }, 404);
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

    const responseText = text || quoteSummary(fields);
    const quotePayload: Record<string, unknown> = {
      status: fields.availability === false ? "INDISPONIVEL" : "RESPONDIDA",
      resposta_texto: responseText || null,
      resposta_dados: body,
      resposta_flow_id: fields.flowId || "8660973",
      respondido_em: new Date().toISOString(),
    };
    if (fields.availability !== null) quotePayload.disponibilidade = fields.availability;
    if (fields.dailyValue !== null) quotePayload.valor_diaria = fields.dailyValue;
    if (fields.totalValue !== null) quotePayload.valor_total = fields.totalValue;
    if (fields.acceptsCheckout !== null) quotePayload.aceita_pagamento_checkout = fields.acceptsCheckout;
    if (fields.breakfastIncluded !== null) quotePayload.cafe_incluso = fields.breakfastIncluded;
    if (fields.parkingIncluded !== null) quotePayload.estacionamento_incluso = fields.parkingIncluded;
    if (fields.notes) quotePayload.observacoes = fields.notes;

    if (quote?.id) {
      const { error } = await supabase.from("hospedagem_cotacoes").update(quotePayload).eq("id", quote.id);
      if (error) throw error;
    } else if (hotel?.id) {
      const { error } = await supabase.from("hospedagem_cotacoes").upsert({
        solicitacao_id: solicitation.solicitacao_id,
        hotel_id: hotel.id,
        hotel_nome: hotel.nome || null,
        ...quotePayload,
      }, { onConflict: "solicitacao_id,hotel_id" });
      if (error) throw error;
    }

    if (hotel?.id && fields.emitsInvoice !== null) {
      const { error } = await supabase
        .from("hospedagem_hoteis")
        .update({ emite_nota_fiscal: fields.emitsInvoice })
        .eq("id", hotel.id);
      if (error) throw error;
    }

    await supabase.from("hospedagem_mensagens").upsert({
      solicitacao_id: solicitation.solicitacao_id,
      reserva_id: solicitation.reserva_id || null,
      hotel_id: hotel?.id || solicitation.hotel_id || null,
      direcao: "ENTRADA",
      tipo: "RESPOSTA_COTACAO",
      canal: "BOTCONVERSA",
      remetente: phone,
      conteudo: responseText || null,
      external_message_id: externalId || null,
      status: "RECEBIDA",
      recebido_em: new Date().toISOString(),
    }, externalId ? { onConflict: "external_message_id" } : undefined);

    return json({
      ok: true,
      action: "cotacao_atualizada",
      codigo: solicitation.codigo,
      quote_id: quote?.id || null,
      hotel_id: hotel?.id || null,
      fields: {
        disponibilidade: fields.availability,
        valor_diaria: fields.dailyValue,
        valor_total: fields.totalValue,
        aceita_pagamento_checkout: fields.acceptsCheckout,
        cafe_incluso: fields.breakfastIncluded,
        estacionamento_incluso: fields.parkingIncluded,
        emite_nota_fiscal: fields.emitsInvoice,
      },
    });
  } catch (error) {
    console.error("[hospedagem-whatsapp-webhook]", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
