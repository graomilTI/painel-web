import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { authorizeRequest } from "../_shared/authorization.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface Extracted {
  valor: number | null;
  valorRaw: string;
  data: string | null;
  favorecido: string | null;
  cnpj: string | null;
  cpf: string | null;
  pixKey: string | null;
  idTransacao: string | null;
  rawText: string;
}

interface Match {
  row: Record<string, unknown>;
  score: number;
  confidence: "alta" | "media" | "baixa";
  reasons: string[];
}

async function callGroq(imageBase64: string, mimeType: string, apiKey: string): Promise<Extracted> {
  const prompt = `Você é um especialista em comprovantes de pagamento brasileiros (PIX, TED, DOC, boleto).
Analise a imagem e extraia as informações retornando APENAS um JSON válido com estes campos:
{
  "valor": número decimal (ex: 1234.56) ou null,
  "valorRaw": string do valor como aparece (ex: "1.234,56") ou "",
  "data": "DD/MM/YYYY" ou null,
  "favorecido": nome do recebedor/beneficiário ou null,
  "cnpj": "XX.XXX.XXX/XXXX-XX" ou null,
  "cpf": "XXX.XXX.XXX-XX" ou null,
  "pixKey": chave pix usada (email, CPF, CNPJ, telefone ou chave aleatória) ou null,
  "idTransacao": ID/protocolo/código E2E da transação ou null,
  "rawText": todo o texto visível no comprovante concatenado
}
Responda SOMENTE com o JSON, sem markdown, sem explicações.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{ role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ] }],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 1024,
    }),
  });

  if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Groq não retornou conteúdo.");
  try { return JSON.parse(text); }
  catch { throw new Error("Resposta do Groq não é JSON válido: " + text.slice(0, 300)); }
}

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}
function onlyDigits(s: unknown): string { return String(s ?? "").replace(/\D/g, ""); }

function scorePayment(row: Record<string, unknown>, ex: Extracted): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const payVal = Number(row.valor ?? 0);
  if (ex.valor !== null && payVal > 0) {
    const diff = Math.abs(ex.valor - payVal);
    const pct = diff / payVal;
    if (diff < 0.01) { score += 60; reasons.push("valor exato"); }
    else if (pct < 0.005) { score += 50; reasons.push("valor ≈ exato"); }
    else if (pct < 0.02) { score += 35; reasons.push("valor próximo"); }
    else if (pct < 0.10) { score += 15; reasons.push("valor aproximado"); }
  }
  const doc = String(row.favorecido_documento ?? "");
  if (ex.cnpj && doc && onlyDigits(ex.cnpj) === onlyDigits(doc)) { score += 30; reasons.push("CNPJ idêntico"); }
  else if (ex.cpf && doc && !ex.cnpj && onlyDigits(ex.cpf) === onlyDigits(doc)) { score += 25; reasons.push("CPF idêntico"); }
  if (ex.favorecido) {
    const extFav = norm(ex.favorecido);
    const payFav = norm(String(row.favorecido_nome ?? row.favorecido ?? row.fornecedor ?? ""));
    if (payFav && extFav.includes(payFav.slice(0, 6))) { score += 20; reasons.push("favorecido coincide"); }
    else if (payFav && payFav.includes(extFav.slice(0, 6))) { score += 15; reasons.push("favorecido parcial"); }
  }
  if (ex.pixKey) {
    const ekn = norm(ex.pixKey);
    const chavePix = norm(String(row.chave_pix ?? ""));
    const dadosPag = norm(String(row.dados_pagamento ?? ""));
    if ((chavePix && (ekn === chavePix || ekn.includes(chavePix) || chavePix.includes(ekn))) ||
        (dadosPag && (ekn === dadosPag || ekn.includes(dadosPag) || dadosPag.includes(ekn)))) {
      score += 20; reasons.push("chave PIX idêntica");
    }
  }
  return { score: Math.min(100, score), reasons };
}

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    const projectHost = new URL(Deno.env.get("SUPABASE_URL") || "https://invalid.local").hostname.toLowerCase();
    return host === projectHost || host === "grao1000.com.br" || host === "www.grao1000.com.br";
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const auth = await authorizeRequest(req, ["financeiro_pagamentos", "financeiro_fluxo_caixa"], { requireEdit: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!GROQ_API_KEY) return json({ error: "GROQ_API_KEY não configurada." }, 500);

  let imageBase64: string;
  let mimeType = "image/jpeg";
  try {
    const body = await req.json();
    if (body.imageBase64) {
      imageBase64 = String(body.imageBase64).replace(/^data:image\/\w+;base64,/, "");
      if (imageBase64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16) return json({ error: "Imagem excede o limite de 10 MB." }, 413);
      mimeType = String(body.mimeType ?? "image/jpeg");
    } else if (body.imageUrl) {
      const imageUrl = String(body.imageUrl);
      if (!isAllowedImageUrl(imageUrl)) return json({ error: "URL de imagem não permitida." }, 400);
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!imgRes.ok) return json({ error: `Não foi possível buscar a imagem: ${imgRes.status}` }, 400);
      const declaredSize = Number(imgRes.headers.get("content-length") || 0);
      if (declaredSize > MAX_IMAGE_BYTES) return json({ error: "Imagem excede o limite de 10 MB." }, 413);
      mimeType = imgRes.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      if (!mimeType.startsWith("image/")) return json({ error: "O arquivo informado não é uma imagem." }, 400);
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: "Imagem excede o limite de 10 MB." }, 413);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      imageBase64 = btoa(binary);
    } else {
      return json({ error: "Envie imageUrl ou imageBase64." }, 400);
    }
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  let extracted: Extracted;
  try { extracted = await callGroq(imageBase64, mimeType, GROQ_API_KEY); }
  catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }, 502); }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  const { data: payments, error: dbErr } = await sb
    .from("financeiro_pagamentos")
    .select("id,origem,setor,origem_setor,descricao,conteudo,valor,forma_pagamento,dados_pagamento,chave_pix,fornecedor,favorecido,favorecido_nome,favorecido_documento,status,created_at")
    .in("status", ["PENDENTE", "pendente", "Pendente"])
    .order("created_at", { ascending: false })
    .limit(300);
  if (dbErr) return json({ error: dbErr.message }, 500);

  const scored: Match[] = (payments ?? [])
    .map((row) => {
      const { score, reasons } = scorePayment(row as Record<string, unknown>, extracted);
      const confidence: Match["confidence"] = score >= 75 ? "alta" : score >= 45 ? "media" : "baixa";
      return { row: row as Record<string, unknown>, score, confidence, reasons };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return json({ extracted, matches: scored });
});
