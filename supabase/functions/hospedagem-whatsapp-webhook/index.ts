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
  return text.toUpperCase().match(/H(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\d{2,}|HOSP[-\s]?\d{3,}/)?.[0]?.replace(/\s/g, "-") || null;
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
    lunchIncluded: parseBoolean(valueFrom(values, ["almoco_incluso", "almoco", "inclui_almoco"])),
    dinnerIncluded: parseBoolean(valueFrom(values, ["janta_inclusa", "jantar_incluso", "janta", "inclui_janta"])),
    parkingIncluded: parseBoolean(valueFrom(values, ["estacionamento_incluso", "estacionamento", "inclui_estacionamento"])),
    emitsInvoice: parseBoolean(valueFrom(values, ["emite_nota_fiscal", "emite_nf", "nota_fiscal", "emissao_nota_fiscal"])),
    paymentMethods: String(valueFrom(values, ["formas_pagamento", "forma_pagamento", "pagamento"] ) || "").split(/[,;|/]+/).map((v)=>v.trim()).filter(Boolean),
    rooms: valueFrom(values, ["disponibilidade_quartos", "quartos", "composicao_quartos", "tipos_quartos"]),
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
    fields.lunchIncluded,
    fields.dinnerIncluded,
    fields.emitsInvoice,
  ].some((value) => value !== null) || Boolean(fields.notes || fields.code);
}

function quoteSummary(fields: ReturnType<typeof quoteFields>) {
  return [
    fields.availability === null ? "" : `Disponibilidade: ${fields.availability ? "Sim" : "Não"}`,
    fields.dailyValue === null ? "" : `Diária: R$ ${fields.dailyValue.toFixed(2)}`,
    fields.totalValue === null ? "" : `Total: R$ ${fields.totalValue.toFixed(2)}`,
    fields.breakfastIncluded === null ? "" : `Café: ${fields.breakfastIncluded ? "Sim" : "Não"}`,
    fields.lunchIncluded === null ? "" : `Almoço: ${fields.lunchIncluded ? "Sim" : "Não"}`,
    fields.dinnerIncluded === null ? "" : `Janta: ${fields.dinnerIncluded ? "Sim" : "Não"}`,
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
      if (/^H(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)/.test(code)) {
        const { data: reservation } = await supabase.from("hospedagem_reservas").select("*,hospedagem_solicitacoes(*)").eq("codigo_operacional",code).order("confirmado_em",{ascending:false}).limit(1).maybeSingle();
        if (reservation) solicitation={...(reservation as any).hospedagem_solicitacoes,reserva_id:reservation.id,hotel_id:reservation.hotel_id,codigo:code,solicitacao_id:reservation.solicitacao_id};
      } else {
        const { data } = await supabase.from("hospedagem_painel_geral").select("*").eq("codigo", code).maybeSingle();
        solicitation = data;
      }
    }

    if (phone) {
      const { data: hotels } = await supabase
        .from("hospedagem_hoteis")
        .select("id,nome,whatsapp,emite_nota_fiscal,cnpj_cpf")
        .not("whatsapp", "is", null);
      hotel = (hotels || []).find((item: any) => normalizePhone(item.whatsapp) === phone) || null;
    }

    // Respostas estruturadas do fluxo v3 carregam o UUID enviado na mensagem.
    // A validação do hotel impede que outro contato confirme o pedido.
    const uuid = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0] || "";
    const normalizedText = normalizeKey(text);
    if (uuid && hotel?.id && normalizedText.includes("confirm")) {
      const { data: pedido } = await supabase.from("hospedagem_reserva_pedidos").select("id,hotel_id,status").eq("id", uuid).maybeSingle();
      if (pedido?.hotel_id === hotel.id && pedido.status === "AGUARDANDO_HOTEL") {
        const { data, error } = await supabase.rpc("hospedagem_v3_confirmar_reserva_pedido", { p_pedido_id: uuid, p_resposta: text });
        if (error) throw error;
        return json({ ok: true, action: "reserva_confirmada", ...data });
      }
      const { data: decision } = await supabase.from("hospedagem_checkout_decisoes").select("id,reserva_id,status,hospedagem_reservas!inner(hotel_id)").eq("id", uuid).maybeSingle();
      const decisionHotel=(decision as any)?.hospedagem_reservas?.hotel_id;
      if (decision && decisionHotel === hotel.id && decision.status === "AGUARDANDO_HOTEL") {
        const { error } = await supabase.rpc("hospedagem_v3_confirmar_checkout_hotel", { p_decisao_id: uuid, p_resposta: text });
        if (error) throw error;
        return json({ ok: true, action: "checkout_confirmado_para_validacao", decision_id: uuid });
      }
    }
    if (uuid && hotel?.id && normalizedText.includes("recus")) {
      const {data:pedido}=await supabase.from("hospedagem_reserva_pedidos").select("id,hotel_id,status").eq("id",uuid).maybeSingle();
      if(pedido?.hotel_id===hotel.id&&pedido.status==="AGUARDANDO_HOTEL"){await supabase.from("hospedagem_reserva_pedidos").update({status:"RECUSADO",respondido_em:new Date().toISOString(),resposta_texto:text}).eq("id",uuid);const {data:links}=await supabase.from("hospedagem_reserva_pedido_colaboradores").select("solicitacao_colaborador_id").eq("pedido_id",uuid);if(links?.length)await supabase.from("hospedagem_solicitacao_colaboradores").update({status_item:"EM_COTACAO"}).in("id",links.map((l:any)=>l.solicitacao_colaborador_id));await supabase.from("painel_notificacoes").upsert({tipo:"hospedagem_reserva_recusada_hotel",titulo:"Hotel recusou a reserva",descricao:text,prioridade:"urgente",icone:"hotel-alert",modulo_url:"adm-hotel",destinatario_modulo:"HOSPEDAGEM",referencia_tabela:"hospedagem_reserva_pedidos",referencia_id:uuid,chave_dedup:`reserva-recusada:${uuid}`},{onConflict:"chave_dedup",ignoreDuplicates:true});return json({ok:true,action:"reserva_recusada",pedido_id:uuid});}
      const {data:decision}=await supabase.from("hospedagem_checkout_decisoes").select("id,reserva_id,status,hospedagem_reservas!inner(hotel_id)").eq("id",uuid).maybeSingle();
      if(decision&&(decision as any).hospedagem_reservas?.hotel_id===hotel.id&&decision.status==="AGUARDANDO_HOTEL"){await supabase.from("hospedagem_checkout_decisoes").update({status:"AGUARDANDO_ADM",hotel_aceitou:false,resposta_hotel:text,confirmado_hotel_em:new Date().toISOString()}).eq("id",uuid);await supabase.from("painel_notificacoes").upsert({tipo:"hospedagem_prorrogacao_recusada",titulo:"Hotel recusou a prorrogação",descricao:text,prioridade:"urgente",icone:"hotel-alert",modulo_url:"adm-hotel",destinatario_modulo:"HOSPEDAGEM",referencia_tabela:"hospedagem_checkout_decisoes",referencia_id:uuid,chave_dedup:`prorrogacao-recusada:${uuid}`},{onConflict:"chave_dedup",ignoreDuplicates:true});return json({ok:true,action:"prorrogacao_recusada",decision_id:uuid});}
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
        .select("id,nome,whatsapp,emite_nota_fiscal,cnpj_cpf")
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
      if (type === "NFSE" && solicitation.reserva_id && hotel?.id) {
        const { data: payment } = await supabase.from("hospedagem_pagamentos_v3").select("id,reserva_id").eq("reserva_id",solicitation.reserva_id).neq("status","CANCELADO").order("created_at",{ascending:false}).limit(1).maybeSingle();
        const { data: installment } = payment ? await supabase.from("hospedagem_pagamento_parcelas").select("id,valor").eq("pagamento_id",payment.id).in("nfse_status",["AGUARDANDO","RECEBIDA","DIVERGENTE"]).order("created_at",{ascending:false}).limit(1).maybeSingle() : {data:null};
        if (installment) {
          const {data:reservationDetails}=await supabase.from("hospedagem_reservas").select("data_checkin,data_checkout").eq("id",solicitation.reserva_id).maybeSingle();
          const values=flattenValues(body);parseLabelledText(text,values);
          const invoiceNumber=String(valueFrom(values,["numero_nfse","numero_nota","nfse","nota_fiscal"])||"").trim();
          const invoiceValue=parseMoney(valueFrom(values,["valor_nfse","valor_nota","valor_total","valor"]));
          const issuer=digits(valueFrom(values,["emitente_cnpj","cnpj_emitente","prestador_cnpj","cnpj_prestador"]));
          const recipient=digits(valueFrom(values,["tomador_cnpj","cnpj_tomador","cliente_cnpj"]));
          const recipientName=String(valueFrom(values,["tomador_razao_social","razao_social_tomador","nome_tomador"])||"").trim();
          const periodStart=String(valueFrom(values,["periodo_inicio","data_inicio","checkin"])||"").slice(0,10)||null;
          const periodEnd=String(valueFrom(values,["periodo_fim","data_fim","checkout"])||"").slice(0,10)||null;
          const {data:fiscal}=await supabase.from("hospedagem_empresas_fiscais").select("cnpj,razao_social").eq("empresa",solicitation.empresa||"").eq("ativo",true).maybeSingle();
          const errors:string[]=[];const expectedHotel=digits(hotel.cnpj_cpf);
          if(!invoiceNumber)errors.push("Número da NFS-e não identificado");
          if(invoiceValue===null||Math.abs(invoiceValue-Number(installment.valor))>0.01)errors.push("Valor diferente da parcela paga");
          if(!expectedHotel||issuer!==expectedHotel)errors.push("CNPJ do hotel divergente ou não cadastrado");
          if(!fiscal?.cnpj||recipient!==digits(fiscal.cnpj)||!recipientName||normalizeKey(recipientName)!==normalizeKey(fiscal.razao_social))errors.push("Tomador divergente ou empresa fiscal não configurada");
          if(!periodStart||!periodEnd||periodStart!==reservationDetails?.data_checkin||periodEnd!==reservationDetails?.data_checkout)errors.push("Período da hospedagem divergente");
          const ext=(mimeType.includes("xml")||fileName.toLowerCase().endsWith(".xml"))?"xml":"pdf";
          if(!["pdf","xml"].includes(ext))errors.push("Formato deve ser PDF ou XML");
          const fetched=await fetch(fileUrl);if(!fetched.ok)throw new Error(`Falha ao baixar NFS-e: HTTP ${fetched.status}`);
          const storagePath=`v3/nfse/${installment.id}/${crypto.randomUUID()}.${ext}`;
          const upload=await supabase.storage.from("hospedagem-documentos").upload(storagePath,await fetched.arrayBuffer(),{contentType:mimeType||fetched.headers.get("content-type")||undefined,upsert:false});if(upload.error)throw upload.error;
          const status=errors.length?(invoiceNumber&&invoiceValue!==null?"DIVERGENTE":"REVISAO_MANUAL"):"VALIDO";
          const {data:doc,error:docError}=await supabase.from("hospedagem_pagamento_documentos").insert({parcela_id:installment.id,tipo:ext==="xml"?"NFSE_XML":"NFSE_PDF",arquivo_url:fileUrl,storage_bucket:"hospedagem-documentos",storage_path:storagePath,mime_type:mimeType||null,numero_nfse:invoiceNumber||null,valor_nfse:invoiceValue,emitente_cnpj:issuer||null,tomador_cnpj:recipient||null,tomador_razao_social:recipientName||null,periodo_inicio:periodStart,periodo_fim:periodEnd,status_validacao:status,validacao_erros:errors}).select("id").single();if(docError)throw docError;
          const {data:validDocs}=await supabase.from("hospedagem_pagamento_documentos").select("id,tipo").eq("parcela_id",installment.id).eq("status_validacao","VALIDO");
          const complete=new Set((validDocs||[]).map((d:any)=>d.tipo));
          await supabase.from("hospedagem_pagamento_parcelas").update({nfse_status:errors.length?"DIVERGENTE":complete.has("NFSE_PDF")&&complete.has("NFSE_XML")?"VALIDA":"RECEBIDA",proxima_cobranca_nfse_em:errors.length?new Date(Date.now()+172800000).toISOString():null}).eq("id",installment.id);
          if(complete.has("NFSE_PDF")&&complete.has("NFSE_XML")){const pdf=(validDocs||[]).find((d:any)=>d.tipo==="NFSE_PDF");const queued=await supabase.rpc("hospedagem_v3_enfileirar_nfse",{p_documento_id:pdf?.id||doc.id});if(queued.error)throw queued.error;}
          else await supabase.from("painel_notificacoes").upsert({tipo:"hospedagem_nfse_revisao",titulo:"NFS-e de hotel requer conferência",descricao:errors.join("; ")||"Aguardando o segundo arquivo (PDF/XML).",prioridade:"atencao",icone:"receipt",modulo_url:"adm-hotel",destinatario_modulo:"HOSPEDAGEM",referencia_tabela:"hospedagem_pagamento_documentos",referencia_id:doc.id,chave_dedup:`nfse-review:${doc.id}`},{onConflict:"chave_dedup",ignoreDuplicates:true});
          return json({ok:true,action:"nfse_v3_recebida",document_id:doc.id,status,errors});
        }
      }
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
    const structured = hasStructuredQuote(fields);
    const quotePayload: Record<string, unknown> = {
      status: fields.availability === false ? "INDISPONIVEL" : structured ? "RESPONDIDA" : "REVISAO_MANUAL",
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
    if (fields.lunchIncluded !== null) quotePayload.almoco_incluso = fields.lunchIncluded;
    if (fields.dinnerIncluded !== null) quotePayload.janta_inclusa = fields.dinnerIncluded;
    if (fields.parkingIncluded !== null) quotePayload.estacionamento_incluso = fields.parkingIncluded;
    if (fields.paymentMethods.length) quotePayload.formas_pagamento = fields.paymentMethods;
    if (fields.rooms) quotePayload.disponibilidade_quartos = typeof fields.rooms === "object" ? fields.rooms : [{ descricao: String(fields.rooms) }];
    if (fields.notes) quotePayload.observacoes = fields.notes;

    if (quote?.id) {
      const { error } = await supabase.from("hospedagem_cotacoes").update(quotePayload).eq("id", quote.id);
      if (error) throw error;
    } else if (hotel?.id) {
      const { error } = await supabase.from("hospedagem_cotacoes").insert({
        solicitacao_id: solicitation.solicitacao_id,
        hotel_id: hotel.id,
        hotel_nome: hotel.nome || null,
        ...quotePayload,
      });
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

    if (!structured && quote?.id) {
      await supabase.from("painel_notificacoes").upsert({tipo:"hospedagem_cotacao_revisao",titulo:"Resposta de hotel requer revisão",descricao:responseText||"Resposta livre sem campos reconhecidos.",prioridade:"atencao",icone:"hotel-alert",modulo_url:"adm-hotel",destinatario_modulo:"HOSPEDAGEM",referencia_tabela:"hospedagem_cotacoes",referencia_id:quote.id,chave_dedup:`cotacao-review:${externalId||quote.id}`},{onConflict:"chave_dedup",ignoreDuplicates:true});
    }

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
        almoco_incluso: fields.lunchIncluded,
        janta_inclusa: fields.dinnerIncluded,
        formas_pagamento: fields.paymentMethods,
        emite_nota_fiscal: fields.emitsInvoice,
      },
    });
  } catch (error) {
    console.error("[hospedagem-whatsapp-webhook]", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
