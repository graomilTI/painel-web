import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── Tipagem ──────────────────────────────────────────────────────────────────
interface Extracted {
  valor:      number | null;
  valorRaw:   string;
  data:       string | null;
  favorecido: string | null;
  cnpj:       string | null;
  cpf:        string | null;
  pixKey:     string | null;
  idTransacao:string | null;
  rawText:    string;
}

interface Match {
  row:        Record<string, unknown>;
  score:      number;
  confidence: "alta" | "media" | "baixa";
  reasons:    string[];
}

// ─── Parser de recibos brasileiros ───────────────────────────────────────────
function parseBRL(raw: string): number | null {
  const s = raw.replace(/\s/g, "");
  // 1.234,56 → tem ponto como milhar e vírgula decimal
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  // 1234,56
  if (/^\d+,\d{2}$/.test(s)) return parseFloat(s.replace(",", "."));
  // 1234.56
  if (/^\d+\.\d{2}$/.test(s)) return parseFloat(s);
  return null;
}

function extractData(text: string): Extracted {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Valor — procura padrão R$ X.XXX,XX ou só o número maior perto de "valor"/"total"
  let valor: number | null = null;
  let valorRaw = "";
  const valorMatches = [...text.matchAll(/R\$\s*([\d.,]+)/gi)];
  for (const m of valorMatches) {
    const v = parseBRL(m[1]);
    if (v !== null && v > 0 && (valor === null || v > valor)) { valor = v; valorRaw = m[1]; }
  }
  // Fallback: maior número decimal encontrado no texto
  if (valor === null) {
    const nums = [...text.matchAll(/\b(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/g)].map((m) => ({ raw: m[1], v: parseBRL(m[1]) })).filter((x) => x.v !== null && x.v! > 0);
    if (nums.length) { const biggest = nums.reduce((a, b) => (b.v! > a.v! ? b : a)); valor = biggest.v; valorRaw = biggest.raw; }
  }

  // Data DD/MM/YYYY ou DD/MM/YY
  const dataMatch = text.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{2,4})/);
  const data = dataMatch ? `${dataMatch[1]}/${dataMatch[2]}/${dataMatch[3].length === 2 ? "20" + dataMatch[3] : dataMatch[3]}` : null;

  // CNPJ XX.XXX.XXX/XXXX-XX
  const cnpjMatch = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);

  // CPF XXX.XXX.XXX-XX (excluindo CNPJ)
  const cpfMatch = text.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "").match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);

  // Favorecido — busca linha após label comum
  let favorecido: string | null = null;
  const favLabels = /(?:favorecido|benefici[aá]rio|para|destinat[aá]rio|recebedor|nome)\s*[:\-]?\s*(.+)/i;
  const favMatch = text.match(favLabels);
  if (favMatch) favorecido = favMatch[1].trim().slice(0, 80);

  // Chave PIX
  let pixKey: string | null = null;
  const pixMatch = text.match(/(?:chave\s+pix|chave)\s*[:\-]?\s*([^\n]{5,})/i);
  if (pixMatch) pixKey = pixMatch[1].trim().slice(0, 100);

  // ID transação (E2E ou código longo)
  let idTransacao: string | null = null;
  const idMatch = text.match(/(?:id\s+(?:da\s+)?transa[çc][aã]o|id\s+do\s+pagamento|protocolo|e2e|c[oó]digo)\s*[:\-]?\s*([A-Za-z0-9]{15,})/i);
  if (idMatch) idTransacao = idMatch[1].trim();

  return { valor, valorRaw, data, favorecido, cnpj: cnpjMatch?.[0] ?? null, cpf: cpfMatch?.[0] ?? null, pixKey, idTransacao, rawText: text };
}

// ─── Normalização para comparação ─────────────────────────────────────────────
function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function onlyDigits(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

// ─── Score de correspondência ─────────────────────────────────────────────────
function scorePayment(row: Record<string, unknown>, ex: Extracted): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const payVal = Number(row.valor ?? row.valor_total ?? row.total ?? 0);

  // Valor (peso 60)
  if (ex.valor !== null && payVal > 0) {
    const diff = Math.abs(ex.valor - payVal);
    const pct  = diff / payVal;
    if (diff < 0.01)       { score += 60; reasons.push("valor exato"); }
    else if (pct < 0.005)  { score += 50; reasons.push("valor ≈ exato"); }
    else if (pct < 0.02)   { score += 35; reasons.push("valor próximo"); }
    else if (pct < 0.10)   { score += 15; reasons.push("valor aproximado"); }
  }

  // CNPJ (peso 30)
  if (ex.cnpj && row.cnpj_cpf) {
    if (onlyDigits(ex.cnpj) === onlyDigits(row.cnpj_cpf as string)) { score += 30; reasons.push("CNPJ idêntico"); }
  }
  // CPF (peso 25)
  if (ex.cpf && row.cnpj_cpf && !ex.cnpj) {
    if (onlyDigits(ex.cpf) === onlyDigits(row.cnpj_cpf as string)) { score += 25; reasons.push("CPF idêntico"); }
  }

  // Favorecido (peso 20)
  if (ex.favorecido) {
    const extFav = norm(ex.favorecido);
    const payFav = norm(String(row.favorecido ?? row.fornecedor ?? ""));
    if (payFav && extFav.includes(payFav.slice(0, 6))) { score += 20; reasons.push("favorecido coincide"); }
    else if (payFav && payFav.includes(extFav.slice(0, 6))) { score += 15; reasons.push("favorecido parcial"); }
  }

  // Chave PIX (peso 20)
  if (ex.pixKey && row.dados_pagamento) {
    const ekn = norm(ex.pixKey);
    const pkn = norm(row.dados_pagamento as string);
    if (ekn === pkn || ekn.includes(pkn) || pkn.includes(ekn)) { score += 20; reasons.push("chave PIX idêntica"); }
  }

  return { score: Math.min(100, score), reasons };
}

// ─── Google Vision ────────────────────────────────────────────────────────────
async function callVision(imageUrl: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        image: { source: { imageUri: imageUrl } },
        features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
        imageContext: { languageHints: ["pt-BR"] },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Vision API error ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text = body?.responses?.[0]?.fullTextAnnotation?.text ?? body?.responses?.[0]?.textAnnotations?.[0]?.description ?? "";
  if (!text) throw new Error("OCR não retornou texto. Verifique se a imagem está legível.");
  return text;
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const GOOGLE_VISION_KEY = Deno.env.get("GOOGLE_VISION_KEY") ?? "";
  const SUPABASE_URL       = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!GOOGLE_VISION_KEY) return json({ error: "GOOGLE_VISION_KEY não configurada nas env vars da Edge Function." }, 500);

  let imageUrl: string;
  try {
    const body = await req.json();
    imageUrl = String(body?.imageUrl ?? "").trim();
    if (!imageUrl) return json({ error: "Campo imageUrl é obrigatório." }, 400);
  } catch {
    return json({ error: "Body JSON inválido." }, 400);
  }

  // Autenticação: valida o JWT do usuário
  const authHeader = req.headers.get("Authorization") ?? "";
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { error } = await sb.auth.getUser(token);
    if (error) return json({ error: "Não autenticado." }, 401);
  } else {
    return json({ error: "Token de autenticação ausente." }, 401);
  }

  // 1. OCR via Google Vision
  let rawText: string;
  try {
    rawText = await callVision(imageUrl, GOOGLE_VISION_KEY);
  } catch (err) {
    return json({ error: (err as Error).message }, 502);
  }

  // 2. Extrair dados
  const extracted = extractData(rawText);

  // 3. Buscar pagamentos pendentes
  const { data: payments, error: dbErr } = await sb
    .from("financeiro_pagamentos")
    .select("id,origem,setor,modulo_origem,descricao,conteudo,valor,valor_total,total,forma_pagamento,dados_pagamento,fornecedor,favorecido,cnpj_cpf,status,created_at")
    .in("status", ["PENDENTE", "pendente", "Pendente"])
    .order("created_at", { ascending: false })
    .limit(300);

  if (dbErr) return json({ error: dbErr.message }, 500);

  // 4. Score e rank
  const scored: Match[] = (payments ?? [])
    .map((row) => {
      const { score, reasons } = scorePayment(row as Record<string, unknown>, extracted);
      const confidence: Match["confidence"] = score >= 75 ? "alta" : score >= 45 ? "media" : "baixa";
      return { row: row as Record<string, unknown>, score, confidence, reasons };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return json({ extracted, matches: scored });
});
