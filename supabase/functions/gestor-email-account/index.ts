import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { authorizeRequest } from "../_shared/authorization.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptPassword(password: string, secret: string): Promise<string> {
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(password));
  return `enc:v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

function host(value: unknown, fallback: string): string {
  const result = String(value || fallback).trim().toLowerCase();
  if (!result || result.includes("://") || !/^[a-z0-9.-]+$/.test(result)) throw new Error("Host de e-mail inválido.");
  return result;
}

function port(value: unknown, fallback: number): number {
  const result = Number(value || fallback);
  if (!Number.isInteger(result) || result < 1 || result > 65535) throw new Error("Porta de e-mail inválida.");
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const auth = await authorizeRequest(req, [], { authenticatedOnly: true });
  if (!auth.ok || !auth.userId) return json({ ok: false, error: auth.error }, auth.status);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const encryptionSecret = Deno.env.get("EMAIL_CREDENTIALS_KEY") || "";
  if (!serviceKey || encryptionSecret.length < 32) return json({ ok: false, error: "Serviço de e-mail não configurado." }, 503);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: appUser, error: appUserError } = await service.from("app_usuarios")
    .select("id,nome,email,status,ativo,setor,app_perfis(codigo)")
    .eq("auth_user_id", auth.userId).maybeSingle();
  const profile = Array.isArray(appUser?.app_perfis) ? appUser.app_perfis[0] : appUser?.app_perfis;
  const role = String((profile as any)?.codigo || "").trim().toLowerCase();
  const setor = String(appUser?.setor || "").trim().toLowerCase();
  const active = String(appUser?.status || "").toLowerCase() === "ativo" && appUser?.ativo !== false;
  if (appUserError || !appUser || !active || !["gestor", "master"].includes(role) && setor !== "gestor") {
    return json({ ok: false, error: "Recurso disponível somente para usuário Gestor ativo." }, 403);
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Body JSON inválido." }, 400); }

  const action = String(body.action || "connect").toLowerCase();
  try {
    const { data: current, error: currentError } = await service.from("email_accounts")
      .select("id,email").eq("escopo", "GESTOR").eq("owner_auth_user_id", auth.userId).maybeSingle();
    if (currentError) throw currentError;

    if (action === "disconnect") {
      if (current?.id) {
        const { data: messages } = await service.from("email_messages").select("id").eq("account_id", current.id);
        const messageIds = (messages || []).map((row: { id: string }) => row.id);
        if (messageIds.length) {
          const { data: attachments } = await service.from("email_attachments").select("storage_path").in("email_id", messageIds).not("storage_path", "is", null);
          const paths = (attachments || []).map((row: { storage_path: string }) => row.storage_path).filter(Boolean);
          for (let index = 0; index < paths.length; index += 100) {
            const { error: storageError } = await service.storage.from("email-anexos").remove(paths.slice(index, index + 100));
            if (storageError) console.warn("[gestor-email-account] falha ao remover anexos", storageError.message);
          }
        }
        const { error } = await service.from("email_accounts").delete().eq("id", current.id).eq("owner_auth_user_id", auth.userId);
        if (error) throw error;
      }
      return json({ ok: true });
    }

    if (action === "sync") {
      if (!current?.id) return json({ ok: false, error: "Nenhuma conta vinculada." }, 404);
      const { error } = await service.from("email_accounts").update({ ultima_sync_status: "PENDENTE", ultima_sync_erro: null, updated_at: new Date().toISOString() })
        .eq("id", current.id).eq("owner_auth_user_id", auth.userId);
      if (error) throw error;
      return json({ ok: true });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const username = String(body.username || email).trim();
    const password = String(body.password || "");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");
    if (!username) throw new Error("Informe o usuário da conta.");
    if (!current?.id && !password) throw new Error("Informe a senha da conta.");

    const domain = email.split("@")[1];
    const payload: Record<string, unknown> = {
      nome: String(body.nome || appUser.nome || email).trim(), email, username,
      provider: String(body.provider || "CPANEL").trim().toUpperCase(),
      imap_host: host(body.imap_host, `mail.${domain}`), imap_port: port(body.imap_port, 993), imap_secure: body.imap_secure !== false,
      smtp_host: host(body.smtp_host, `mail.${domain}`), smtp_port: port(body.smtp_port, 465), smtp_secure: body.smtp_secure !== false,
      escopo: "GESTOR", owner_auth_user_id: auth.userId, ativo: true, auto_responder: false,
      limite_por_sync: Math.min(100, Math.max(10, Number(body.limite_por_sync || 50))),
      conexao_status: "PENDENTE", ultima_sync_status: "PENDENTE", ultima_sync_erro: null,
      ultima_verificacao_em: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    if (password) payload.password_cipher = await encryptPassword(password, encryptionSecret);
    if (!current?.id) {
      payload.criado_por = auth.userId;
      payload.criado_por_nome = String(appUser.nome || appUser.email || email);
    }

    const query = current?.id
      ? service.from("email_accounts").update(payload).eq("id", current.id).eq("owner_auth_user_id", auth.userId).select("id").single()
      : service.from("email_accounts").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) throw error;
    return json({ ok: true, id: data.id, status: "PENDENTE" });
  } catch (error) {
    console.error("[gestor-email-account]", error instanceof Error ? error.message : String(error));
    return json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível operar a conta." }, 400);
  }
});
