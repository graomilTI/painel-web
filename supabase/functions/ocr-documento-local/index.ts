import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_MODULES = new Set([
  "logistica_os",
  "logistica_adm",
  "logistica_conferencias",
]);
const ALLOWED_TYPES = new Set(["jpg", "jpeg", "png", "gif", "webp", "pdf"]);
const MAX_INSTRUCTION_LENGTH = 3000;
const RECENT_JOB_HOURS = 6;

type AuthResult = {
  ok: boolean;
  status: number;
  error?: string;
  userId?: string;
  isMaster?: boolean;
};

type JobRow = {
  id: number;
  request_user_id: string;
  os_id: string | null;
  numero_os: string | null;
  document_url: string;
  file_type: string;
  status: "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO" | "CANCELADO";
  progress: number;
  page_current: number | null;
  page_total: number | null;
  attempts: number;
  worker_id: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

function json(payload: unknown, status = 200): Response {
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
    .replace(/[\u0300-\u036f]/g, "");
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "t", "yes", "sim", "s"].includes(normalize(value));
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

async function authorize(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Token de autenticação ausente." };
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: "Configuração de autenticação indisponível." };
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: "Sessão inválida ou expirada." };
  }

  const { data, error } = await client.rpc("rpc_get_user_context");
  if (error) {
    console.error("[ocr-documento-local] rpc_get_user_context", error);
    return { ok: false, status: 403, error: `Não foi possível validar as permissões: ${error.message}` };
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
    return { ok: true, status: 200, userId: userData.user.id, isMaster: true };
  }

  const modules = Array.isArray(context?.modules) ? context.modules : [];
  const permitted = modules.some((module: Record<string, unknown>) => {
    const code = normalize(module?.code ?? module?.codigo ?? module?.modulo_codigo);
    const canView = asBoolean(module?.can_view ?? module?.pode_ver ?? true);
    const canEdit = asBoolean(module?.can_edit ?? module?.pode_editar)
      || asBoolean(module?.can_create ?? module?.pode_criar)
      || asBoolean(module?.can_approve ?? module?.pode_aprovar);
    return ALLOWED_MODULES.has(code) && canView && canEdit;
  });

  if (!permitted) {
    return { ok: false, status: 403, error: "Você não possui permissão para executar o OCR da Logística." };
  }

  return { ok: true, status: 200, userId: userData.user.id, isMaster: false };
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY indisponível na Edge Function.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function workerState(client: SupabaseClient) {
  const { data } = await client
    .from("logistica_ocr_workers")
    .select("worker_id,status,current_job_id,last_seen,version")
    .order("last_seen", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { online: false, worker: null };
  const lastSeen = Date.parse(String(data.last_seen || ""));
  const online = Number.isFinite(lastSeen) && Date.now() - lastSeen < 120_000;
  return { online, worker: data };
}

function publicJob(job: JobRow, worker: Awaited<ReturnType<typeof workerState>>) {
  const payload: Record<string, unknown> = {
    job_id: job.id,
    status: job.status,
    progress: Number(job.progress || 0),
    pagina_atual: job.page_current,
    paginas_total: job.page_total,
    tentativas: job.attempts,
    worker_id: job.worker_id,
    worker_online: worker.online,
    worker: worker.worker,
    criado_em: job.created_at,
    iniciado_em: job.started_at,
    concluido_em: job.completed_at,
    atualizado_em: job.updated_at,
    provider: "paddleocr-local",
  };

  if (job.status === "CONCLUIDO") {
    payload.resultado = job.result ?? { cargas: [] };
    payload.texto = JSON.stringify(job.result ?? { cargas: [] });
  }
  if (job.status === "ERRO") payload.error = job.error || "Falha não especificada no worker local.";
  if (job.status === "CANCELADO") payload.error = "Processamento cancelado.";
  return payload;
}

async function submitJob(client: SupabaseClient, auth: AuthResult, body: Record<string, any>, requestId: string) {
  const url = String(body.url ?? "").trim();
  const fileType = String(body.tipo ?? "").toLowerCase().trim();
  const instruction = String(body.instrucao ?? "").trim();

  if (!url) return json({ error: "Envie a URL do relatório.", code: "DOCUMENT_MISSING", request_id: requestId }, 400);
  if (!isAllowedDocumentUrl(url)) {
    let host = "inválido";
    try { host = new URL(url).hostname; } catch { /* vazio */ }
    return json({ error: `URL de documento não permitida: ${host}`, code: "URL_NOT_ALLOWED", request_id: requestId }, 400);
  }
  if (!ALLOWED_TYPES.has(fileType)) {
    return json({ error: `Tipo '${fileType || "não informado"}' não suportado.`, code: "TYPE_UNSUPPORTED", request_id: requestId }, 400);
  }
  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    return json({ error: "Instrução de OCR muito longa.", code: "PROMPT_TOO_LONG", request_id: requestId }, 400);
  }

  const recentSince = new Date(Date.now() - RECENT_JOB_HOURS * 3600_000).toISOString();
  const { data: existing } = await client
    .from("logistica_ocr_jobs")
    .select("*")
    .eq("request_user_id", auth.userId)
    .eq("document_url", url)
    .in("status", ["PENDENTE", "PROCESSANDO", "CONCLUIDO"])
    .gte("created_at", recentSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const worker = await workerState(client);
  if (existing) {
    return json({ ...publicJob(existing as JobRow, worker), reused: true, request_id: requestId }, existing.status === "CONCLUIDO" ? 200 : 202);
  }

  const payload = {
    request_user_id: auth.userId,
    os_id: body.os_id == null ? null : String(body.os_id),
    numero_os: body.numero_os == null ? null : String(body.numero_os),
    document_url: url,
    file_type: fileType,
    instruction: instruction || null,
    status: "PENDENTE",
    priority: Number.isFinite(Number(body.priority)) ? Math.max(0, Math.min(1000, Number(body.priority))) : 100,
  };

  const { data, error } = await client
    .from("logistica_ocr_jobs")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    console.error("[ocr-documento-local] insert", error);
    return json({ error: `Não foi possível criar a fila de OCR: ${error.message}`, code: "QUEUE_INSERT_ERROR", request_id: requestId }, 500);
  }

  return json({
    ...publicJob(data as JobRow, worker),
    poll_after_ms: 2000,
    aviso: worker.online ? null : "O worker PaddleOCR ainda não está online no VPS; o documento permanecerá na fila.",
    request_id: requestId,
  }, 202);
}

async function getJob(client: SupabaseClient, auth: AuthResult, body: Record<string, any>, requestId: string) {
  const jobId = Number(body.job_id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return json({ error: "job_id inválido.", code: "JOB_ID_INVALID", request_id: requestId }, 400);
  }

  let query = client.from("logistica_ocr_jobs").select("*").eq("id", jobId);
  if (!auth.isMaster) query = query.eq("request_user_id", auth.userId);
  const { data, error } = await query.maybeSingle();
  if (error) return json({ error: error.message, code: "QUEUE_READ_ERROR", request_id: requestId }, 500);
  if (!data) return json({ error: "Job de OCR não encontrado.", code: "JOB_NOT_FOUND", request_id: requestId }, 404);

  const worker = await workerState(client);
  return json({ ...publicJob(data as JobRow, worker), request_id: requestId });
}

async function cancelJob(client: SupabaseClient, auth: AuthResult, body: Record<string, any>, requestId: string) {
  const jobId = Number(body.job_id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return json({ error: "job_id inválido.", code: "JOB_ID_INVALID", request_id: requestId }, 400);
  }

  let query = client
    .from("logistica_ocr_jobs")
    .update({ status: "CANCELADO", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "PENDENTE");
  if (!auth.isMaster) query = query.eq("request_user_id", auth.userId);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) return json({ error: error.message, code: "QUEUE_CANCEL_ERROR", request_id: requestId }, 500);
  if (!data) return json({ error: "O job não está pendente ou não foi encontrado.", code: "JOB_NOT_CANCELLABLE", request_id: requestId }, 409);

  const worker = await workerState(client);
  return json({ ...publicJob(data as JobRow, worker), request_id: requestId });
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido.", code: "METHOD_NOT_ALLOWED", request_id: requestId }, 405);

  const auth = await authorize(req);
  if (!auth.ok) return json({ error: auth.error, code: `AUTH_${auth.status}`, request_id: requestId }, auth.status);

  try {
    const body = await req.json() as Record<string, any>;
    const action = normalize(body.action || "submit");
    const client = serviceClient();

    if (action === "submit" || action === "criar") return await submitJob(client, auth, body, requestId);
    if (action === "status" || action === "consultar") return await getJob(client, auth, body, requestId);
    if (action === "cancel" || action === "cancelar") return await cancelJob(client, auth, body, requestId);
    if (action === "health" || action === "saude") {
      return json({ provider: "paddleocr-local", ...(await workerState(client)), request_id: requestId });
    }

    return json({ error: `Ação '${body.action}' não suportada.`, code: "ACTION_UNSUPPORTED", request_id: requestId }, 400);
  } catch (error) {
    console.error("[ocr-documento-local] erro inesperado", { requestId, error });
    return json({
      error: error instanceof Error ? error.message : String(error),
      code: "OCR_QUEUE_UNEXPECTED_ERROR",
      request_id: requestId,
    }, 500);
  }
});
