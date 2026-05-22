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

const BASE = "https://backend.botconversa.com.br/api/v1/webhook";

async function getSubscriberId(tel: string, nome: string | null, apiKey: string): Promise<number | null> {
  const headers = { "api-key": apiKey, accept: "application/json" };

  const getRes = await fetch(`${BASE}/subscriber/${tel}/`, { headers });
  if (getRes.ok) {
    const data = await getRes.json();
    if (data?.id) return data.id;
  }

  const body = new FormData();
  body.append("phone", tel);
  if (nome) body.append("name", nome.substring(0, 60));
  const createRes = await fetch(`${BASE}/subscriber/`, { method: "POST", headers, body });
  if (createRes.ok) {
    const data = await createRes.json();
    if (data?.id) return data.id;
  }

  return null;
}

async function sendMessage(subscriberId: number, type: "text" | "file", value: string, apiKey: string): Promise<boolean> {
  const headers = { "api-key": apiKey, accept: "application/json" };
  const body = new FormData();
  body.append("type", type);
  body.append("value", value);
  const res = await fetch(`${BASE}/subscriber/${subscriberId}/send_message/`, { method: "POST", headers, body });
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: secretRow } = await supabase
      .from("ti_integracao_segredos")
      .select("valor")
      .eq("chave", "BOTCONVERSA_API_KEY")
      .eq("ativo", true)
      .maybeSingle();

    const apiKey = secretRow?.valor || "";
    if (!apiKey) return json({ ok: false, error: "BOTCONVERSA_API_KEY não configurada em TI > Integrações." }, 400);

    const body = await req.json() as {
      phone: string;
      message?: string;
      fileUrl?: string;
      nome?: string;
    };

    const tel = String(body.phone || "").replace(/\D/g, "");
    if (!tel) return json({ ok: false, error: "Telefone inválido." }, 400);
    if (!body.message && !body.fileUrl) return json({ ok: false, error: "Informe message ou fileUrl." }, 400);

    const subscriberId = await getSubscriberId(tel, body.nome || null, apiKey);
    if (!subscriberId) return json({ ok: false, error: "Não foi possível localizar ou criar o contato no BotConversa." }, 502);

    if (body.message) await sendMessage(subscriberId, "text", body.message, apiKey);
    if (body.fileUrl) await sendMessage(subscriberId, "file", body.fileUrl, apiKey);

    return json({ ok: true });
  } catch (err) {
    console.error("[botconversa-send]", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
