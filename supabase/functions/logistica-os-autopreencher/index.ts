import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_BASE64_LENGTH = Math.ceil(15 * 1024 * 1024 * 4 / 3) + 64;
const OCR_ENDPOINT = "https://api.ocr.space/parse/image";
const TYPES: Record<string, { mime: string; provider: string }> = {
  jpg: { mime: "image/jpeg", provider: "JPG" },
  jpeg: { mime: "image/jpeg", provider: "JPG" },
  png: { mime: "image/png", provider: "PNG" },
  gif: { mime: "image/gif", provider: "GIF" },
  pdf: { mime: "application/pdf", provider: "PDF" },
};

type OcrPage = { ParsedText?: string | null; ErrorMessage?: unknown; ErrorDetails?: unknown };
type OcrResult = {
  ParsedResults?: OcrPage[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: unknown;
  ErrorDetails?: unknown;
  ProcessingTimeInMilliseconds?: string | number;
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "t", "yes", "sim", "s"].includes(normalize(value));
}

async function authorize(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return { ok: false, status: 401, error: "Token de autenticação ausente." };

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anonKey) return { ok: false, status: 500, error: "Configuração de autenticação indisponível." };

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) return { ok: false, status: 401, error: "Sessão inválida ou expirada." };

  const { data, error } = await client.rpc("rpc_get_user_context");
  if (error) return { ok: false, status: 403, error: `Não foi possível validar as permissões: ${error.message}` };
  const context = (Array.isArray(data) ? data[0] : data) as Record<string, any> | null;
  const active = asBoolean(context?.user?.active ?? context?.user?.ativo ?? context?.active ?? context?.ativo)
    || ["ativo", "active"].includes(normalize(context?.user?.status ?? context?.status));
  if (!context || !active) return { ok: false, status: 403, error: "Usuário inativo ou sem contexto de acesso." };
  return { ok: true, status: 200 };
}

function listMessages(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(listMessages);
  const text = String(value ?? "").trim();
  return text ? [text] : [];
}

function errorsFrom(result: OcrResult): string[] {
  return [
    ...listMessages(result.ErrorMessage),
    ...listMessages(result.ErrorDetails),
    ...(result.ParsedResults ?? []).flatMap((page) => [
      ...listMessages(page.ErrorMessage),
      ...listMessages(page.ErrorDetails),
    ]),
  ].filter((value, index, array) => array.indexOf(value) === index);
}

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/^[\s*:#=\-–—]+/, "")
    .replace(/[\s|]+$/, "")
    .trim();
}

function lines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function inlineValue(line: string, label: string): string {
  const separators = [":", "=", " - ", " – ", " — "]
    .map((token) => ({ token, position: line.indexOf(token) }))
    .filter((item) => item.position >= 0)
    .sort((a, b) => a.position - b.position);
  if (separators.length) {
    const first = separators[0];
    return clean(line.slice(first.position + first.token.length));
  }

  const normalizedLine = normalize(line);
  const normalizedLabel = normalize(label);
  const position = normalizedLine.indexOf(normalizedLabel);
  if (position < 0) return "";
  return clean(line.slice(Math.min(line.length, position + label.length)));
}

function extract(source: string[], labels: string[], rejects: string[] = []): string {
  const wanted = labels.map(normalize);
  const blocked = rejects.map(normalize);

  for (let index = 0; index < source.length; index += 1) {
    const current = normalize(source[index]);
    if (blocked.some((term) => current.includes(term))) continue;

    const matched = wanted.findIndex((label) =>
      current === label
      || current.startsWith(`${label}:`)
      || current.startsWith(`${label}=`)
      || current.startsWith(`${label} `)
      || current.startsWith(`${label}-`)
    );
    if (matched < 0) continue;

    const sameLine = inlineValue(source[index], labels[matched]);
    if (sameLine && normalize(sameLine) !== wanted[matched]) return sameLine;

    const nextLine = clean(source[index + 1]);
    if (nextLine && !wanted.some((label) => normalize(nextLine).startsWith(label))) return nextLine;
  }
  return "";
}

function parseNumber(value: unknown): number | null {
  let text = String(value ?? "").replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!text) return null;
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function infer(text: string, options: string[]): string {
  const whole = normalize(text);
  return options.find((option) => whole.includes(normalize(option))) || "";
}

function structure(text: string) {
  const source = lines(text);
  let produto = extract(source, ["Produto", "Cultura", "Mercadoria"]);
  if (!produto) produto = infer(text, ["Soja", "Milho", "Trigo", "Sorgo", "Ervilha"]);

  let tipoProduto = extract(source, ["Tipo de produto", "Tipo produto", "Tecnologia", "Variedade"]);
  if (!tipoProduto) tipoProduto = infer(text, [
    "Aflatoxina Negativo", "Declarado Intacta", "Intacta Negativo", "Intacta Positivo",
    "Não Definido", "OS com teste", "Participante", "Transgênico", "Convencional",
  ]);

  let servico = extract(source, ["Serviço", "Tipo de serviço", "Operação"]);
  if (!servico) servico = infer(text, [
    "CLASSIFICAÇÃO TRANSB. SAÍDA", "CLASSIFICAÇÃO TRANSB. ENTRADA",
    "ACOMPANHAMENTO DE EMBARQUE", "AUDITORIA", "FOB", "CIF",
  ]);

  let trocaNotas = extract(source, ["Troca de notas", "Troca notas", "Troca NF"]);
  if (trocaNotas) trocaNotas = ["sim", "s", "yes", "true", "1"].includes(normalize(trocaNotas)) ? "SIM" : "NAO";

  return {
    contratante_cliente: extract(source, ["Contratante / Cliente", "Contratante", "Cliente nacional", "Cliente"], ["cliente final", "filial", "cidade"]),
    filial_pagadora: extract(source, ["Filial pagadora", "Cliente final / filial", "Cliente final", "Filial"]),
    produtor: extract(source, ["Produtor", "Nome do produtor"]),
    armazem_embarque: extract(source, ["Armazém de embarque", "Armazem de embarque", "Local de embarque", "Ponto de embarque"]),
    cidade_embarque: extract(source, ["Cidade de embarque", "Município de embarque", "Municipio de embarque", "Origem cidade"]),
    cidade_destino: extract(source, ["Cidade destino", "Cidade de destino", "Município destino", "Municipio destino"]),
    local_destino: extract(source, ["Local de destino", "Destino final", "Ponto de destino"]),
    numero_contrato: extract(source, ["Número contrato", "Numero contrato", "Nº contrato", "Contrato"]),
    produto,
    tipo_produto: tipoProduto,
    servico,
    volume_inicial: parseNumber(extract(source, ["Volume inicial (Tons)", "Volume inicial", "Volume", "Quantidade", "Toneladas"])),
    regional: extract(source, ["Supervisão", "Supervisao", "Regional", "Coordenação", "Coordenacao"]),
    troca_notas: trocaNotas,
  };
}

function planHint(errors: string[]): string | null {
  const text = normalize(errors.join(" "));
  if (text.includes("file size") || text.includes("maximum size") || text.includes("too large")) {
    return "O OCR gratuito aceita arquivos pequenos. Reduza o PDF ou envie um print da página principal.";
  }
  if (text.includes("page") && (text.includes("limit") || text.includes("maximum"))) {
    return "O OCR gratuito processa poucas páginas por PDF. Divida o documento ou envie um print.";
  }
  if (text.includes("rate limit") || text.includes("quota") || text.includes("limit exceeded")) {
    return "O limite do OCR foi atingido. Aguarde alguns minutos e tente novamente.";
  }
  return null;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido.", request_id: requestId }, 405);

  const auth = await authorize(req);
  if (!auth.ok) return json({ error: auth.error, request_id: requestId }, auth.status);

  try {
    const body = await req.json();
    const base64 = String(body?.base64 || "");
    const extension = String(body?.tipo || "").toLowerCase();
    if (!base64) return json({ error: "Arquivo não enviado.", request_id: requestId }, 400);
    if (base64.length > MAX_BASE64_LENGTH) return json({ error: "O arquivo excede o limite técnico de 15 MB.", request_id: requestId }, 413);

    const type = TYPES[extension];
    if (!type) return json({ error: "Formato não suportado. Envie PDF, JPG, PNG ou GIF.", request_id: requestId }, 400);

    const apiKey = Deno.env.get("OCR_SPACE_API_KEY") || "";
    if (!apiKey) return json({ error: "OCR_SPACE_API_KEY não configurada nas Edge Function Secrets.", request_id: requestId }, 500);

    const engine = ["1", "2", "3"].includes(Deno.env.get("OCR_SPACE_ENGINE") || "")
      ? String(Deno.env.get("OCR_SPACE_ENGINE"))
      : "2";
    const language = Deno.env.get("OCR_SPACE_LANGUAGE") || (engine === "3" ? "auto" : "por");
    const form = new FormData();
    form.set("base64Image", base64.startsWith("data:") ? base64 : `data:${type.mime};base64,${base64}`);
    form.set("language", language);
    form.set("filetype", type.provider);
    form.set("isOverlayRequired", "false");
    form.set("detectOrientation", "true");
    form.set("scale", "true");
    form.set("isTable", "true");
    form.set("OCREngine", engine);

    const response = await fetch(Deno.env.get("OCR_SPACE_ENDPOINT") || OCR_ENDPOINT, {
      method: "POST",
      headers: { apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const raw = await response.text();
    let result: OcrResult;
    try {
      result = JSON.parse(raw) as OcrResult;
    } catch {
      return json({ error: `O serviço de OCR devolveu uma resposta inválida (${response.status}).`, request_id: requestId }, 502);
    }

    const providerErrors = errorsFrom(result);
    if (!response.ok || result.IsErroredOnProcessing || !result.ParsedResults?.length) {
      return json({
        error: planHint(providerErrors) || providerErrors[0] || `Erro no serviço de OCR (${response.status}).`,
        detalhe: providerErrors,
        request_id: requestId,
      }, 502);
    }

    const texto = result.ParsedResults.map((page) => clean(page.ParsedText)).filter(Boolean).join("\n\n");
    if (!texto) return json({ error: "O arquivo foi processado, mas nenhum texto foi reconhecido.", request_id: requestId }, 422);

    const campos = structure(texto);
    const identificados = Object.values(campos).filter((value) => value !== null && clean(value) !== "").length;
    return json({
      campos,
      texto,
      campos_identificados: identificados,
      provider: "ocr.space",
      engine,
      language,
      paginas_lidas: result.ParsedResults.length,
      tempo_ms: Number(result.ProcessingTimeInMilliseconds || 0) || null,
      request_id: requestId,
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[logistica-os-autopreencher]", { requestId, error });
    return json({
      error: timeout ? "O OCR excedeu o tempo máximo de 120 segundos." : error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, timeout ? 504 : 500);
  }
});
