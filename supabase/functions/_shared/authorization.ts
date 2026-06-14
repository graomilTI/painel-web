import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export type AuthorizationResult = {
  ok: boolean;
  status: number;
  error?: string;
  userId?: string;
  context?: Record<string, unknown>;
};

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

export async function authorizeRequest(
  req: Request,
  moduleCodes: string[],
  options: { requireEdit?: boolean; authenticatedOnly?: boolean } = {},
): Promise<AuthorizationResult> {
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

  if (options.authenticatedOnly) {
    return { ok: true, status: 200, userId: userData.user.id };
  }

  const { data, error } = await client.rpc("rpc_get_user_context");
  if (error) {
    console.error("[authorization] rpc_get_user_context", error);
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

  const allowed = new Set(moduleCodes.map(normalize));
  const modules = Array.isArray(context?.modules) ? context.modules : [];
  const hasPermission = modules.some((module: Record<string, unknown>) => {
    const code = normalize(module?.code ?? module?.codigo ?? module?.modulo_codigo);
    const canView = asBoolean(module?.can_view ?? module?.pode_ver ?? true);
    const canEdit = asBoolean(module?.can_edit ?? module?.pode_editar)
      || asBoolean(module?.can_create ?? module?.pode_criar)
      || asBoolean(module?.can_approve ?? module?.pode_aprovar);
    return allowed.has(code) && canView && (!options.requireEdit || canEdit);
  });

  if (!hasPermission) {
    return { ok: false, status: 403, error: "Você não possui permissão para esta operação." };
  }

  return { ok: true, status: 200, userId: userData.user.id, context };
}
