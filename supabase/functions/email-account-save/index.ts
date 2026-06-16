import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { authorizeRequest } from "../_shared/authorization.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
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

function cleanHost(value: unknown): string {
  const host = String(value ?? "").trim().toLowerCase();
  if (!host || host.includes("://") || !/^[a-z0-9.-]+$/.test(host)) throw new Error("Host de e-mail inválido.");
  return host;
}

function cleanPort(value: unknown, fallback: number): number {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Porta de e-mail inválida.");
  return port;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const auth = await authorizeRequest(req, ["emails"], { requireEdit: true });
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const encryptionSecret = Deno.env.get("EMAIL_CREDENTIALS_KEY") ?? "";
  if (encryptionSecret.length < 32) {
    return json({ ok: false, error: "EMAIL_CREDENTIALS_KEY deve ser configurada com pelo menos 32 caracteres." }, 503);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Body JSON inválido." }, 400);
  }

  try {
    const id = String(body.id || "").trim() || null;
    const email = String(body.email || "").trim().toLowerCase();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail inválido.");
    if (!username) throw new Error("Usuário da conta é obrigatório.");
    if (!id && !password) throw new Error("Senha é obrigatória para uma nova conta.");

    const context = auth.context as Record<string, any> | undefined;
    const payload: Record<string, unknown> = {
      nome: String(body.nome || "").trim() || email,
      email,
      username,
      imap_host: cleanHost(body.imap_host),
      imap_port: cleanPort(body.imap_port, 993),
      imap_secure: body.imap_secure !== false,
      smtp_host: cleanHost(body.smtp_host),
      smtp_port: cleanPort(body.smtp_port, 465),
      smtp_secure: body.smtp_secure !== false,
      limite_por_sync: Math.min(200, Math.max(1, Number(body.limite_por_sync || 30))),
      ativo: body.ativo !== false,
      auto_responder: body.auto_responder === true,
      updated_at: new Date().toISOString(),
    };

    if (password) payload.password_cipher = await encryptPassword(password, encryptionSecret);
    if (!id) {
      payload.criado_por = auth.userId;
      payload.criado_por_nome = String(context?.user?.name || context?.user?.email || "").trim() || null;
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const query = id
      ? service.from("email_accounts").update(payload).eq("id", id).select("id").single()
      : service.from("email_accounts").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) throw error;

    return json({ ok: true, id: data.id });
  } catch (error) {
    console.error("[email-account-save]", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
