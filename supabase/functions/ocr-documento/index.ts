import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_BASE64_LENGTH = Math.ceil(15 * 1024 * 1024 * 4 / 3) + 16;

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

type AuthorizationResult = {
  ok: boolean;
  status: number;
  error?: string;
  userId?: string;
  context?: Record<string, unknown>;
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
    return { ok: false, status: 403, error: "Não foi possível validar as permissões." };
  }

  const context = (Array.isArray(data) ? data[0] : data) as Record<string, any> | null;
  const active = asBoolean(context?.user?.active ?? context?.user?.ativo ?? context?.active ?? context?.ativo)
    || ["ativo", "active"].includes(normalize(context?.user?.status ?? context?.status));
  if (!context || !active) {
    return { ok: false, status: 403, error: "Usuário inativo ou sem contexto de acesso." };
  }

  const isMaster = asBoolean(context?.user?.is_master ?? context?.is_master)
    || normalize(context?.user?.role ?? context?.perfil_codigo ?? context?.perfil_nome) === "master";
  if (isMaster) {
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

  const auth = await authorizeRequest(req);
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
