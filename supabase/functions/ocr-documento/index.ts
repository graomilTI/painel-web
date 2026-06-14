import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { authorizeRequest } from "../_shared/authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_BASE64_LENGTH = Math.ceil(15 * 1024 * 1024 * 4 / 3) + 16;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

function isAllowedDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const projectHost = new URL(Deno.env.get("SUPABASE_URL") || "https://invalid.local").hostname.toLowerCase();
    const host = url.hostname.toLowerCase();
    return host === projectHost || host === "grao1000.com.br" || host === "www.grao1000.com.br";
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const auth = await authorizeRequest(
    req,
    ["notas_fiscais", "compras_adm", "financeiro_pagamentos", "frotas_multas", "envios", "telegrama"],
    { requireEdit: true },
  );
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY não configurada" }, 500);

    const body = await req.json();
    const { base64, url, tipo, instrucao } = body;

    if (!base64 && !url) return json({ error: "Envie 'base64' ou 'url' do arquivo" }, 400);
    if (!tipo) return json({ error: "Informe o 'tipo' do arquivo (jpg, png, pdf, etc)" }, 400);
    if (base64 && String(base64).length > MAX_BASE64_LENGTH) return json({ error: "Arquivo excede o limite de 15 MB." }, 413);
    if (url && !isAllowedDocumentUrl(String(url))) return json({ error: "URL de documento não permitida." }, 400);
    if (instrucao && String(instrucao).length > 2000) return json({ error: "Instrução muito longa." }, 400);

    const mediaType = MIME_TYPES[String(tipo).toLowerCase()];
    if (!mediaType) return json({ error: `Tipo '${tipo}' não suportado` }, 400);

    const prompt = instrucao || "Extraia todo o texto deste documento. Retorne apenas o texto extraído, sem comentários adicionais.";
    let contentBlock: unknown;

    if (mediaType === "application/pdf") {
      contentBlock = {
        type: "document",
        source: base64
          ? { type: "base64", media_type: mediaType, data: base64 }
          : { type: "url", url },
      };
    } else {
      contentBlock = {
        type: "image",
        source: base64
          ? { type: "base64", media_type: mediaType, data: base64 }
          : { type: "url", url },
      };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return json({ error: "Erro na API Claude", detalhe: err }, 502);
    }

    const result = await response.json();
    const texto = result.content?.[0]?.text ?? "";
    return json({ texto, tokens: result.usage });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
