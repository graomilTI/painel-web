import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BASE64_LENGTH = Math.ceil(15 * 1024 * 1024 * 4 / 3) + 64;
const OCR_ENDPOINT = "https://api.ocr.space/parse/image";
const ALLOWED_MODULES = [
  "notas_fiscais",
  "compras_adm",
  "financeiro_pagamentos",
  "frotas_multas",
  "envios",
  "telegrama",
  "logistica_os",
  "logistica_adm",
  "logistica_conferencias",
];
const ADMIN_LEVEL_ROLES = new Set(["adm", "admin", "socio"]);

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  pdf: "application/pdf",
};

const OCR_FILE_TYPES: Record<string, string> = {
  jpg: "JPG",
  jpeg: "JPG",
  png: "PNG",
  gif: "GIF",
  pdf: "PDF",
};

type AuthorizationResult = {
  ok: boolean;
  status: number;
  error?: string;
  userId?: string;
  context?: Record<string, unknown>;
};

type OcrSpacePage = {
  ParsedText?: string | null;
  FileParseExitCode?: number | string;
  ErrorMessage?: string | string[] | null;
  ErrorDetails?: string | string[] | null;
};

type OcrSpaceResponse = {
  ParsedResults?: OcrSpacePage[];
  OCRExitCode?: number | string;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[] | null;
  ErrorDetails?: string | string[] | null;
  ProcessingTimeInMilliseconds?: string | number;
};

type ExtractedLoad = {
  placa: string;
  carga: string;
  peso_kg: number | null;
  nota_fiscal: string;
  pagina: number;
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "t", "yes", "sim", "s"].includes(normalize(value));
}

async function authorizeRequest(req: Request): Promise<AuthorizationResult> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Token de autenticação ausente." };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: "Configuração de autenticação indisponível." };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: "Sessão inválida ou expirada." };
  }

  const { data, error } = await client.rpc("rpc_get_user_context");
  if (error) {
    console.error("[ocr-documento] rpc_get_user_context", error);
    return { ok: false, status: 403, error: `Não foi possível validar as permissões: ${error.message}` };
  }

  const context = (Array.isArray(data) ? data[0] : data) as Record<string, any> | null;
  const active = asBoolean(context?.user?.active ?? context?.user?.ativo ?? context?.active ?? context?.ativo)
    || ["ativo", "active"].includes(normalize(context?.user?.status ?? context?.status));
  if (!context || !active) {
    return { ok: false, status: 403, error: "Usuário inativo ou sem contexto de acesso." };
  }

  const role = normalize(context?.user?.role ?? context?.perfil_codigo ?? context?.perfil_nome);
  const isMaster = asBoolean(context?.user?.is_master ?? context?.is_master) || role === "master";
  if (isMaster) {
    return { ok: true, status: 200, userId: userData.user.id, context };
  }

  if (ADMIN_LEVEL_ROLES.has(role)) {
    return { ok: true, status: 200, userId: userData.user.id, context };
  }

  const allowed = new Set(ALLOWED_MODULES.map(normalize));
  const modules = Array.isArray(context?.modules) ? context.modules : [];
  const hasPermission = modules.some((module: Record<string, unknown>) => {
    const code = normalize(module?.code ?? module?.codigo ?? module?.modulo_codigo);
    const canView = asBoolean(module?.can_view ?? module?.pode_ver ?? true);
    const canEdit = asBoolean(module?.can_edit ?? module?.pode_editar)
      || asBoolean(module?.can_create ?? module?.pode_criar)
      || asBoolean(module?.can_approve ?? module?.pode_aprovar);
    return allowed.has(code) && canView && canEdit;
  });

  if (!hasPermission) {
    return { ok: false, status: 403, error: "Você não possui permissão para esta operação." };
  }

  return { ok: true, status: 200, userId: userData.user.id, context };
}

function isAllowedDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const projectHost = new URL(Deno.env.get("SUPABASE_URL") || "https://invalid.local").hostname.toLowerCase();
    const host = url.hostname.toLowerCase();
    return host === projectHost
      || host.endsWith(".supabase.co")
      || host === "grao1000.com.br"
      || host === "www.grao1000.com.br";
  } catch {
    return false;
  }
}

function messageList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(messageList);
  const text = String(value ?? "").trim();
  return text ? [text] : [];
}

function providerErrors(result: OcrSpaceResponse): string[] {
  return [
    ...messageList(result.ErrorMessage),
    ...messageList(result.ErrorDetails),
    ...(result.ParsedResults ?? []).flatMap((page) => [
      ...messageList(page.ErrorMessage),
      ...messageList(page.ErrorDetails),
    ]),
  ].filter((value, index, list) => list.indexOf(value) === index);
}

function cleanToken(value: string): string {
  return value.replace(/^[\s:#º°.-]+|[\s,;:.]+$/g, "").trim();
}

function parseNumberPt(value: string): number | null {
  let text = String(value ?? "").replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!text) return null;
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, "");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function weightToKg(raw: string, unitRaw = ""): number | null {
  const value = parseNumberPt(raw);
  if (value == null) return null;
  const unit = normalize(unitRaw);
  if (/^(t|ton|tons|tonelada|toneladas)$/.test(unit)) return value * 1000;
  return value;
}

function normalizePlate(value: string): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function findPlates(text: string): string[] {
  const normalized = text.toUpperCase();
  const matches = normalized.match(/\b[A-Z]{3}[\s.-]?[0-9][A-Z0-9][\s.-]?[0-9]{2}\b/g) ?? [];
  return [...new Set(matches.map(normalizePlate).filter((plate) => plate.length === 7))];
}

function extractLabelValue(context: string, labels: string[], pattern: string): string {
  const labelGroup = labels.join("|");
  const regex = new RegExp(`(?:${labelGroup})\\s*(?:n[ºo°.]*)?\\s*[:#=-]?\\s*(${pattern})`, "i");
  return cleanToken(context.match(regex)?.[1] ?? "");
}

function extractLoad(context: string): string {
  return extractLabelValue(
    context,
    ["carga", "ticket", "romaneio", "laudo", "ordem", "controle"],
    "[A-Z0-9][A-Z0-9./_-]{0,29}",
  );
}

function extractInvoice(context: string): string {
  return extractLabelValue(
    context,
    ["nota\\s*fiscal", "nf-?e", "nfe", "nf"],
    "[0-9][0-9./_-]{0,24}",
  );
}

function extractWeight(context: string): number | null {
  const labeled = context.match(/(?:peso(?:\s+l[ií]quido)?|l[ií]quido|peso\s*liq\.?|quantidade|qtd\.?)\s*[:#=-]?\s*([0-9][0-9.\s]*(?:,[0-9]+)?)\s*(kg|t|ton|tons|toneladas?)?/i);
  if (labeled) return weightToKg(labeled[1], labeled[2] ?? "");

  const withUnit = [...context.matchAll(/\b([0-9]{1,3}(?:[.\s][0-9]{3})+(?:,[0-9]+)?|[0-9]+(?:,[0-9]+)?)\s*(kg|t|ton|tons|toneladas?)\b/gi)];
  if (!withUnit.length) return null;

  const candidates = withUnit
    .map((match) => weightToKg(match[1], match[2]))
    .filter((value): value is number => value != null && value > 100);
  return candidates.length ? Math.max(...candidates) : null;
}

function extractLoadsFromPage(text: string, pageNumber: number): ExtractedLoad[] {
  const lines = String(text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const found: ExtractedLoad[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const plates = findPlates(lines[index]);
    if (!plates.length) continue;

    const line = lines[index];
    const context = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3)).join(" | ");
    const carga = extractLoad(line) || extractLoad(context);
    const notaFiscal = extractInvoice(line) || extractInvoice(context);
    const pesoKg = extractWeight(line) ?? extractWeight(context);

    for (const placa of plates) {
      found.push({ placa, carga, peso_kg: pesoKg, nota_fiscal: notaFiscal, pagina: pageNumber });
    }
  }

  const unique = new Map<string, ExtractedLoad>();
  for (const item of found) {
    const key = `${item.placa}|${item.carga}|${item.peso_kg ?? ""}|${item.nota_fiscal}|${item.pagina}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function freePlanHint(errors: string[]): string | null {
  const text = normalize(errors.join(" "));
  if (!text) return null;
  if (text.includes("file size") || text.includes("maximum size") || text.includes("too large")) {
    return "O plano gratuito do OCR.Space aceita arquivos de até 1 MB. Reduza o PDF ou envie páginas separadas.";
  }
  if (text.includes("page") && (text.includes("limit") || text.includes("maximum"))) {
    return "O plano gratuito do OCR.Space processa até 3 páginas por PDF. Divida o relatório em arquivos menores.";
  }
  if (text.includes("rate limit") || text.includes("quota") || text.includes("limit exceeded")) {
    return "O limite gratuito do OCR.Space foi atingido. Aguarde a liberação da cota ou use outra chave.";
  }
  return null;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido.", code: "METHOD_NOT_ALLOWED", request_id: requestId }, 405);

  const auth = await authorizeRequest(req);
  if (!auth.ok) return json({ error: auth.error, code: `AUTH_${auth.status}`, request_id: requestId }, auth.status);

  try {
    const apiKey = Deno.env.get("OCR_SPACE_API_KEY") || "";
    if (!apiKey) {
      return json({
        error: "OCR_SPACE_API_KEY não configurada. Cadastre uma chave gratuita do OCR.Space nas Edge Function Secrets.",
        code: "OCR_SECRET_MISSING",
        request_id: requestId,
      }, 500);
    }

    const body = await req.json();
    const { base64, url, tipo } = body;

    if (!base64 && !url) return json({ error: "Envie 'base64' ou 'url' do arquivo", code: "DOCUMENT_MISSING", request_id: requestId }, 400);
    if (!tipo) return json({ error: "Informe o tipo do arquivo (jpg, png, gif ou pdf)", code: "TYPE_MISSING", request_id: requestId }, 400);
    if (base64 && String(base64).length > MAX_BASE64_LENGTH) return json({ error: "Arquivo excede o limite técnico de 15 MB.", code: "FILE_TOO_LARGE", request_id: requestId }, 413);
    if (url && !isAllowedDocumentUrl(String(url))) return json({ error: `URL de documento não permitida: ${new URL(String(url)).hostname}`, code: "URL_NOT_ALLOWED", request_id: requestId }, 400);

    const extension = String(tipo).toLowerCase();
    const mediaType = MIME_TYPES[extension];
    const fileType = OCR_FILE_TYPES[extension];
    if (!mediaType || !fileType) {
      return json({ error: `Tipo '${tipo}' não suportado pelo OCR.Space. Use JPG, PNG, GIF ou PDF.`, code: "TYPE_UNSUPPORTED", request_id: requestId }, 400);
    }

    const engine = ["1", "2", "3"].includes(Deno.env.get("OCR_SPACE_ENGINE") || "")
      ? String(Deno.env.get("OCR_SPACE_ENGINE"))
      : "2";
    const language = Deno.env.get("OCR_SPACE_LANGUAGE") || (engine === "3" ? "auto" : "por");
    const form = new FormData();
    if (url) {
      form.set("url", String(url));
    } else {
      const raw = String(base64);
      form.set("base64Image", raw.startsWith("data:") ? raw : `data:${mediaType};base64,${raw}`);
    }
    form.set("language", language);
    form.set("filetype", fileType);
    form.set("isOverlayRequired", "false");
    form.set("detectOrientation", "true");
    form.set("scale", "true");
    form.set("isTable", "true");
    form.set("OCREngine", engine);

    const endpoint = Deno.env.get("OCR_SPACE_ENDPOINT") || OCR_ENDPOINT;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    const rawResponse = await response.text();
    let result: OcrSpaceResponse;
    try {
      result = JSON.parse(rawResponse) as OcrSpaceResponse;
    } catch {
      return json({
        error: `O OCR.Space devolveu uma resposta inválida (${response.status}).`,
        code: "OCR_PROVIDER_INVALID_RESPONSE",
        provider: "ocr.space",
        provider_status: response.status,
        detalhe: rawResponse.slice(0, 1000),
        request_id: requestId,
      }, 502);
    }

    const errors = providerErrors(result);
    if (!response.ok || result.IsErroredOnProcessing || !result.ParsedResults?.length) {
      const hint = freePlanHint(errors);
      console.error("[ocr-documento] OCR.Space", { requestId, status: response.status, errors, result });
      return json({
        error: hint || errors[0] || `Erro no OCR.Space (${response.status}).`,
        code: "OCR_PROVIDER_ERROR",
        provider: "ocr.space",
        provider_status: response.status,
        detalhe: errors,
        engine,
        request_id: requestId,
      }, 502);
    }

    const cargas = result.ParsedResults.flatMap((page, index) => extractLoadsFromPage(page.ParsedText || "", index + 1));
    if (!cargas.length) {
      return json({
        error: "O OCR leu o documento, mas não identificou nenhuma placa válida. Confira a qualidade do arquivo ou teste outro motor OCR.",
        code: "OCR_NO_PLATES",
        provider: "ocr.space",
        engine,
        paginas_lidas: result.ParsedResults.length,
        request_id: requestId,
      }, 422);
    }

    return json({
      texto: JSON.stringify({ cargas }),
      provider: "ocr.space",
      engine,
      language,
      paginas_lidas: result.ParsedResults.length,
      tempo_ms: Number(result.ProcessingTimeInMilliseconds || 0) || null,
      avisos: errors,
      request_id: requestId,
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[ocr-documento] erro inesperado", { requestId, error });
    return json({
      error: isTimeout ? "O OCR.Space excedeu o tempo máximo de 120 segundos." : error instanceof Error ? error.message : String(error),
      code: isTimeout ? "OCR_TIMEOUT" : "OCR_UNEXPECTED_ERROR",
      request_id: requestId,
    }, isTimeout ? 504 : 500);
  }
});
