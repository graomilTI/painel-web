// Envia Web Push (celular + computador) para os destinatários de uma linha de
// painel_notificacoes. Chamada:
//  - pelo trigger push_disparar_notificacao (net.http_post com service_role_key);
//  - pelo próprio usuário logado com { "teste": true } (botão "Enviar teste").
// Segredos necessários: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

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

type Sub = { sub_id?: string; id?: string; user_id?: string; endpoint: string; p256dh: string; auth: string };

async function enviar(
  supabase: ReturnType<typeof createClient>,
  subs: Sub[],
  payload: Record<string, unknown>,
) {
  const body = JSON.stringify(payload);
  const mortas: string[] = [];
  let enviados = 0;
  let falhas = 0;
  const erros: string[] = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 60 * 60 * 24, urgency: "high" },
      );
      enviados++;
    } catch (err) {
      falhas++;
      const status = (err as { statusCode?: number }).statusCode;
      erros.push(`${status ?? '?'}: ${String((err as { body?: string }).body ?? (err as Error).message).slice(0, 160)}`);
      // 404/410: inscrição expirada ou revogada no aparelho — remove.
      if (status === 404 || status === 410) mortas.push(String(s.sub_id ?? s.id));
      else console.warn("[push-notify] falha", status, (err as Error).message);
    }
  }));

  if (mortas.length) await supabase.from("push_subscriptions").delete().in("id", mortas);
  return { enviados, falhas, removidas: mortas.length, erros };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const vapidPublic = (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim();
  const vapidPrivate = (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim();
  const vapidSubject = (Deno.env.get("VAPID_SUBJECT") ?? "mailto:tecnologia@grao1000.com.br").trim();

  if (!vapidPublic || !vapidPrivate) {
    return json({ ok: false, error: "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas." }, 500);
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRoleCall = Boolean(serviceRoleKey) && authHeader === `Bearer ${serviceRoleKey}`;

  let input: { notificacao_id?: string; teste?: boolean } = {};
  try {
    input = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido." }, 400);
  }

  // Teste: usuário logado envia push só para os próprios aparelhos.
  if (input.teste) {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ ok: false, error: "Sessão inválida." }, 401);

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", userData.user.id);
    if (!subs?.length) return json({ ok: false, error: "Nenhum aparelho inscrito." }, 404);

    const r = await enviar(supabase, subs as Sub[], {
      title: "Teste de notificação",
      body: "Está funcionando! Você receberá os avisos do painel neste aparelho.",
      url: "/painel/notificacoes",
      tag: `teste-${Date.now()}`,
    });
    return json({ ok: true, ...r });
  }

  if (!isServiceRoleCall) return json({ ok: false, error: "Não autorizado." }, 401);
  if (!input.notificacao_id) return json({ ok: false, error: "notificacao_id obrigatório." }, 400);

  const { data: notif, error: nErr } = await supabase
    .from("painel_notificacoes")
    .select("id,titulo,descricao,prioridade,modulo_url,tipo")
    .eq("id", input.notificacao_id)
    .maybeSingle();
  if (nErr || !notif) return json({ ok: false, error: "Notificação não encontrada." }, 404);

  const { data: subs, error: sErr } = await supabase.rpc("push_destinatarios", {
    p_notificacao_id: input.notificacao_id,
  });
  if (sErr) {
    console.error("[push-notify] push_destinatarios", sErr.message);
    return json({ ok: false, error: sErr.message }, 500);
  }
  if (!subs?.length) return json({ ok: true, enviados: 0, destinatarios: 0 });

  const destino = notif.modulo_url
    ? `/painel/${String(notif.modulo_url).replace(/^\/+/, "").replace(/\.html$/i, "")}`
    : "/painel/notificacoes";

  const r = await enviar(supabase, subs as Sub[], {
    title: notif.titulo,
    body: notif.descricao ?? "",
    url: destino,
    tag: notif.id,
    prioridade: notif.prioridade,
  });
  return json({ ok: true, destinatarios: subs.length, ...r });
});
