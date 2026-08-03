import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_BASE64_LENGTH = Math.ceil(15 * 1024 * 1024 * 4 / 3) + 64;
const OCR_ENDPOINT = "https://api.ocr.space/parse/image";
const TYPES: Record<string, { mime: string; provider?: string }> = {
  jpg: { mime: "image/jpeg", provider: "JPG" },
  jpeg: { mime: "image/jpeg", provider: "JPG" },
  png: { mime: "image/png", provider: "PNG" },
  gif: { mime: "image/gif", provider: "GIF" },
  webp: { mime: "image/webp" },
  pdf: { mime: "application/pdf", provider: "PDF" },
};

type Campos = {
  contratante_cliente: string;
  filial_pagadora: string;
  produtor: string;
  armazem_embarque: string;
  cidade_embarque: string;
  cidade_destino: string;
  local_destino: string;
  numero_contrato: string;
  produto: string;
  tipo_produto: string;
  servico: string;
  volume_inicial: number | null;
  regional: string;
  troca_notas: string;
  testes: string[];
};

// Mesmo vocabulário de assets/js/logistica.js:TESTES_POR_PRODUTO — qual
// teste é válido depende do produto (Milho/Sorgo: intensidade de Aflatoxina;
// Soja: Intacta e/ou GMO Free; Trigo: Vomitoxina).
const TESTES_VOCAB = new Set([
  "AFLATOXINA_QUALITATIVO",
  "AFLATOXINA_QUANTITATIVO",
  "AFLATOXINA_QUALI_QUANTI",
  "INTACTA",
  "GMO_FREE",
  "VOMITOXINA",
]);

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

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/^[\s*:#=\-–—]+/, "")
    .replace(/[\s|]+$/, "")
    .trim();
}

function emptyCampos(): Campos {
  return {
    contratante_cliente: "",
    filial_pagadora: "",
    produtor: "",
    armazem_embarque: "",
    cidade_embarque: "",
    cidade_destino: "",
    local_destino: "",
    numero_contrato: "",
    produto: "",
    tipo_produto: "",
    servico: "",
    volume_inicial: null,
    regional: "",
    troca_notas: "",
    testes: [],
  };
}

function normalizeTestes(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of list) {
    const key = String(item ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    if (TESTES_VOCAB.has(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

function normalizeCampos(raw: Record<string, unknown> | null | undefined): Campos {
  const out = emptyCampos();
  for (const key of Object.keys(out) as Array<keyof Campos>) {
    if (key === "volume_inicial") {
      const value = raw?.[key];
      const parsed = typeof value === "number"
        ? value
        : Number(String(value ?? "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
      out[key] = Number.isFinite(parsed) ? parsed : null;
      continue;
    }
    if (key === "testes") {
      out.testes = normalizeTestes(raw?.testes);
      continue;
    }
    out[key] = clean(raw?.[key]);
  }
  if (out.troca_notas) {
    out.troca_notas = ["sim", "s", "yes", "true", "1"].includes(normalize(out.troca_notas)) ? "SIM" : "NAO";
  }
  return out;
}

function promptJson(): string {
  return `Analise este documento ou print de solicitação de abertura de O.S. logística.
Retorne SOMENTE JSON válido, sem markdown, com exatamente estes campos:
{
  "contratante_cliente": "",
  "filial_pagadora": "",
  "produtor": "",
  "armazem_embarque": "",
  "cidade_embarque": "",
  "cidade_destino": "",
  "local_destino": "",
  "numero_contrato": "",
  "produto": "",
  "tipo_produto": "",
  "servico": "",
  "volume_inicial": null,
  "regional": "",
  "troca_notas": "",
  "testes": []
}
Regras: não invente dados; use string vazia quando não localizar; volume_inicial deve ser número em toneladas; troca_notas deve ser SIM, NAO ou vazio; preserve nomes de clientes, locais, cidades, contratos e supervisões como aparecem no documento.
Regras para "testes" (array de strings, só os valores abaixo, vazio se não mencionado): o teste válido depende do produto.
- Se produto for Milho ou Sorgo e o documento mencionar teste de Aflatoxina: use "AFLATOXINA_QUALITATIVO", "AFLATOXINA_QUANTITATIVO" ou "AFLATOXINA_QUALI_QUANTI" (qualitativo e quantitativo juntos).
- Se produto for Soja: use "INTACTA" e/ou "GMO_FREE" se mencionados (pode ter os dois).
- Se produto for Trigo e o documento mencionar teste de Vomitoxina: use "VOMITOXINA".
- Não inclua nenhum teste que não esteja explicitamente mencionado no documento.`;
}

function parseJsonText(text: string): Record<string, unknown> {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("O serviço não retornou JSON válido.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callGroq(base64: string, mime: string, apiKey: string) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_OCR_MODEL") || "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: promptJson() },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      }],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 1600,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Groq API ${response.status}: ${raw.slice(0, 500)}`);
  const result = JSON.parse(raw);
  const text = result?.choices?.[0]?.message?.content || "";
  return { campos: normalizeCampos(parseJsonText(text)), texto: text, provider: "groq" };
}

function outputText(result: any): string {
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text.trim();
  for (const item of result?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string" && content.text.trim()) return content.text.trim();
    }
  }
  return "";
}

async function callOpenAI(base64: string, extension: string, mime: string, apiKey: string) {
  const part = extension === "pdf"
    ? { type: "input_file", filename: "abertura-os.pdf", file_data: base64 }
    : { type: "input_image", image_url: `data:${mime};base64,${base64}`, detail: "high" };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_OCR_MODEL") || "gpt-4.1-mini",
      store: false,
      input: [{ role: "user", content: [{ type: "input_text", text: promptJson() }, part] }],
      max_output_tokens: 1800,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${raw.slice(0, 500)}`);
  const result = JSON.parse(raw);
  const text = outputText(result);
  return { campos: normalizeCampos(parseJsonText(text)), texto: text, provider: "openai" };
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

function lines(text: string): string[] {
  return text.replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
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
  const position = normalize(line).indexOf(normalize(label));
  return position < 0 ? "" : clean(line.slice(Math.min(line.length, position + label.length)));
}

function extract(source: string[], labels: string[], rejects: string[] = []): string {
  const wanted = labels.map(normalize);
  const blocked = rejects.map(normalize);
  for (let index = 0; index < source.length; index += 1) {
    const current = normalize(source[index]);
    if (blocked.some((term) => current.includes(term))) continue;
    const matched = wanted.findIndex((label) => current === label || current.startsWith(`${label}:`) || current.startsWith(`${label}=`) || current.startsWith(`${label} `) || current.startsWith(`${label}-`));
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
  if (text.includes(",") && text.includes(".")) text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  else if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function infer(text: string, options: string[]): string {
  const whole = normalize(text);
  return options.find((option) => whole.includes(normalize(option))) || "";
}

// Heurística por palavra-chave pro caminho sem IA (OCR.space) — mesma regra
// de negócio do promptJson()/TESTES_POR_PRODUTO, só que sem modelo pra
// interpretar; se o documento não mencionar claramente qualitativo/
// quantitativo pro teste de Aflatoxina, não arrisca marcar nenhum dos três
// (evita falso positivo melhor do que evita falso negativo aqui).
function inferTestes(text: string, produto: string): string[] {
  const whole = normalize(text);
  const cat = normalize(produto);
  const out: string[] = [];
  if (cat.includes("milho") || cat.includes("sorgo")) {
    if (whole.includes("aflatoxina")) {
      const quali = whole.includes("qualitativo");
      const quanti = whole.includes("quantitativo");
      if (quali && quanti) out.push("AFLATOXINA_QUALI_QUANTI");
      else if (quali) out.push("AFLATOXINA_QUALITATIVO");
      else if (quanti) out.push("AFLATOXINA_QUANTITATIVO");
    }
  } else if (cat.includes("soja")) {
    if (whole.includes("intacta")) out.push("INTACTA");
    if (whole.includes("gmo") || whole.includes("transgenico livre") || whole.includes("livre de transgenico")) out.push("GMO_FREE");
  } else if (cat.includes("trigo")) {
    if (whole.includes("vomitoxina")) out.push("VOMITOXINA");
  }
  return out;
}

function structure(text: string): Campos {
  const source = lines(text);
  let produto = extract(source, ["Produto", "Cultura", "Mercadoria"]);
  if (!produto) produto = infer(text, ["Soja", "Milho", "Trigo", "Sorgo", "Ervilha"]);
  let tipoProduto = extract(source, ["Tipo de produto", "Tipo produto", "Tecnologia", "Variedade"]);
  if (!tipoProduto) tipoProduto = infer(text, ["Aflatoxina Negativo", "Declarado Intacta", "Intacta Negativo", "Intacta Positivo", "Não Definido", "OS com teste", "Participante", "Transgênico", "Convencional"]);
  let servico = extract(source, ["Serviço", "Tipo de serviço", "Operação"]);
  if (!servico) servico = infer(text, ["CLASSIFICAÇÃO TRANSB. SAÍDA", "CLASSIFICAÇÃO TRANSB. ENTRADA", "ACOMPANHAMENTO DE EMBARQUE", "AUDITORIA", "FOB", "CIF"]);
  let trocaNotas = extract(source, ["Troca de notas", "Troca notas", "Troca NF"]);
  if (trocaNotas) trocaNotas = ["sim", "s", "yes", "true", "1"].includes(normalize(trocaNotas)) ? "SIM" : "NAO";
  return normalizeCampos({
    testes: inferTestes(text, produto),
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
  });
}

async function callOcrSpace(base64: string, type: { mime: string; provider?: string }, apiKey: string) {
  if (!type.provider) throw new Error("Formato não suportado pelo OCR.Space.");
  const engine = ["1", "2", "3"].includes(Deno.env.get("OCR_SPACE_ENGINE") || "") ? String(Deno.env.get("OCR_SPACE_ENGINE")) : "2";
  const language = Deno.env.get("OCR_SPACE_LANGUAGE") || (engine === "3" ? "auto" : "por");
  const form = new FormData();
  form.set("base64Image", `data:${type.mime};base64,${base64}`);
  form.set("language", language);
  form.set("filetype", type.provider);
  form.set("isOverlayRequired", "false");
  form.set("detectOrientation", "true");
  form.set("scale", "true");
  form.set("isTable", "true");
  form.set("OCREngine", engine);
  const response = await fetch(Deno.env.get("OCR_SPACE_ENDPOINT") || OCR_ENDPOINT, { method: "POST", headers: { apikey: apiKey }, body: form, signal: AbortSignal.timeout(120_000) });
  const raw = await response.text();
  let result: OcrResult;
  try { result = JSON.parse(raw) as OcrResult; }
  catch { throw new Error(`O OCR.Space devolveu resposta inválida (${response.status}).`); }
  const providerErrors = errorsFrom(result);
  if (!response.ok || result.IsErroredOnProcessing || !result.ParsedResults?.length) throw new Error(providerErrors[0] || `Erro no OCR.Space (${response.status}).`);
  const texto = result.ParsedResults.map((page) => clean(page.ParsedText)).filter(Boolean).join("\n\n");
  if (!texto) throw new Error("O arquivo foi processado, mas nenhum texto foi reconhecido.");
  return { campos: structure(texto), texto, provider: "ocr.space", engine, language };
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido.", request_id: requestId }, 405);

  const auth = await authorize(req);
  if (!auth.ok) return json({ error: auth.error, request_id: requestId }, auth.status);

  try {
    const body = await req.json();
    const base64 = String(body?.base64 || "").replace(/^data:[^;]+;base64,/, "");
    const extension = String(body?.tipo || "").toLowerCase();
    if (!base64) return json({ error: "Arquivo não enviado.", request_id: requestId }, 400);
    if (base64.length > MAX_BASE64_LENGTH) return json({ error: "O arquivo excede o limite técnico de 15 MB.", request_id: requestId }, 413);
    const type = TYPES[extension];
    if (!type) return json({ error: "Formato não suportado. Envie PDF, JPG, PNG, GIF ou WEBP.", request_id: requestId }, 400);

    const groqKey = Deno.env.get("GROQ_API_KEY") || "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const ocrSpaceKey = Deno.env.get("OCR_SPACE_API_KEY") || "";

    let result;
    if (extension !== "pdf" && groqKey) {
      result = await callGroq(base64, type.mime, groqKey);
    } else if (openaiKey) {
      result = await callOpenAI(base64, extension, type.mime, openaiKey);
    } else if (ocrSpaceKey) {
      result = await callOcrSpace(base64, type, ocrSpaceKey);
    } else if (extension === "pdf") {
      return json({ error: "Para ler PDF, configure OPENAI_API_KEY ou OCR_SPACE_API_KEY. Enquanto isso, envie um print da página principal.", request_id: requestId }, 500);
    } else {
      return json({ error: "Nenhum provedor de leitura está configurado. Configure GROQ_API_KEY, OPENAI_API_KEY ou OCR_SPACE_API_KEY nas Edge Function Secrets.", request_id: requestId }, 500);
    }

    const identificados = Object.values(result.campos).filter((value) => value !== null && clean(value) !== "").length;
    return json({
      ...result,
      campos_identificados: identificados,
      request_id: requestId,
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[logistica-os-autopreencher]", { requestId, error });
    return json({
      error: timeout ? "A leitura excedeu o tempo máximo de 120 segundos." : error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, timeout ? 504 : 500);
  }
});
