import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { authorizeRequest } from "../_shared/authorization.ts";

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

type BotResult<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  detail?: string;
};

async function parseBotResponse<T = unknown>(res: Response): Promise<BotResult<T>> {
  const text = await res.text();
  let data: T | undefined;
  try {
    data = text ? JSON.parse(text) as T : undefined;
  } catch {
    data = undefined;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    detail: text ? text.slice(0, 1200) : undefined,
  };
}

function normalizeBrazilPhone(value: unknown): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length > 11) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function splitSubscriberName(value: unknown): { firstName: string; lastName: string } {
  const clean = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  if (!clean) {
    return { firstName: "Hotel", lastName: "Hospedagem" };
  }

  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0].slice(0, 60), lastName: "Hotel" };
  }

  return {
    firstName: parts.shift()!.slice(0, 60),
    lastName: parts.join(" ").slice(0, 60) || "Hotel",
  };
}

async function loadApiKey(supabase: ReturnType<typeof createClient>): Promise<{
  apiKey: string;
  source?: string;
  diagnostics: string[];
}> {
  const diagnostics: string[] = [];
  const envKey = String(Deno.env.get("BOTCONVERSA_API_KEY") || "").trim();
  if (envKey) return { apiKey: envKey, source: "environment", diagnostics };

  const secretResult = await supabase
    .from("ti_integracao_segredos")
    .select("valor")
    .eq("chave", "BOTCONVERSA_API_KEY")
    .eq("ativo", true)
    .maybeSingle();

  if (secretResult.error) diagnostics.push(`ti_integracao_segredos: ${secretResult.error.message}`);
  const secretKey = String(secretResult.data?.valor || "").trim();
  if (secretKey) return { apiKey: secretKey, source: "ti_integracao_segredos", diagnostics };

  const configResult = await supabase
    .from("botconversa_config")
    .select("valor, updated_at")
    .eq("chave", "BOTCONVERSA_API_KEY")
    .eq("ativo", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (configResult.error) diagnostics.push(`botconversa_config: ${configResult.error.message}`);
  const configKey = String(configResult.data?.valor || "").trim();
  if (configKey) return { apiKey: configKey, source: "botconversa_config", diagnostics };

  return { apiKey: "", diagnostics };
}

async function getSubscriberId(
  tel: string,
  nome: string | null,
  apiKey: string,
): Promise<{ subscriberId: number | null; error?: string }> {
  const headers = { "api-key": apiKey, accept: "application/json" };

  const getRes = await fetch(`${BASE}/subscriber/${tel}/`, { headers });
  const getResult = await parseBotResponse<{ id?: number }>(getRes);
  if (getResult.ok && getResult.data?.id) {
    return { subscriberId: Number(getResult.data.id) };
  }

  const { firstName, lastName } = splitSubscriberName(nome);
  const body = new FormData();
  body.append("phone", tel);
  body.append("first_name", firstName);
  body.append("last_name", lastName);

  const createRes = await fetch(`${BASE}/subscriber/`, {
    method: "POST",
    headers,
    body,
  });
  const createResult = await parseBotResponse<{ id?: number }>(createRes);
  if (createResult.ok && createResult.data?.id) {
    return { subscriberId: Number(createResult.data.id) };
  }

  const detail = createResult.detail || getResult.detail || "sem detalhes";
  return {
    subscriberId: null,
    error: `Contato recusado pelo BotConversa (HTTP ${createResult.status || getResult.status}): ${detail}`,
  };
}

async function sendMessage(
  subscriberId: number,
  type: "text" | "file",
  value: string,
  apiKey: string,
): Promise<BotResult> {
  const headers = { "api-key": apiKey, accept: "application/json" };
  const body = new FormData();
  body.append("type", type);
  body.append("value", value);
  const res = await fetch(`${BASE}/subscriber/${subscriberId}/send_message/`, {
    method: "POST",
    headers,
    body,
  });
  return parseBotResponse(res);
}

async function sendFlow(
  subscriberId: number,
  flowId: string,
  apiKey: string,
): Promise<BotResult> {
  const headers = {
    "api-key": apiKey,
    accept: "application/json",
    "content-type": "application/json",
  };
  const res = await fetch(`${BASE}/subscriber/${subscriberId}/send_flow/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ flow: flowId }),
  });
  return parseBotResponse(res);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const auth = await authorizeRequest(
    req,
    [
      "financeiro_pagamentos",
      "financeiro_fluxo_caixa",
      "compras_adm",
      "ti_contatos",
      "hotel",
      "hospedagem",
      "adm_hotel",
      "gestor_hospedagem",
    ],
    { requireEdit: true },
  );

  // Retorna HTTP 200 para que o painel consiga exibir o motivo real da recusa.
  // A operação continua bloqueada quando não houver autorização.
  if (!auth.ok) {
    return json({ ok: false, error: auth.error, stage: "authorization", status: auth.status });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const keyResult = await loadApiKey(supabase);
    if (!keyResult.apiKey) {
      return json({
        ok: false,
        stage: "configuration",
        error: "BOTCONVERSA_API_KEY não configurada. Cadastre a chave em botconversa_config, TI > Integrações ou como segredo da Edge Function.",
        diagnostics: keyResult.diagnostics,
      });
    }

    const body = await req.json() as {
      phone: string;
      message?: string;
      fileUrl?: string;
      nome?: string;
      flowId?: string;
    };

    const tel = normalizeBrazilPhone(body.phone);
    const flowId = String(body.flowId || "").trim();
    const hasFlow = Boolean(flowId);

    if (tel.length < 12 || tel.length > 13 || !tel.startsWith("55")) {
      return json({
        ok: false,
        stage: "validation",
        error: `Telefone inválido para WhatsApp: ${tel || "vazio"}. Use DDD + número.`,
      });
    }
    if (!body.message && !body.fileUrl && !hasFlow) {
      return json({ ok: false, stage: "validation", error: "Informe message, fileUrl ou flowId." });
    }
    if (body.message && String(body.message).length > 4000) {
      return json({ ok: false, stage: "validation", error: "Mensagem muito longa." });
    }
    if (body.fileUrl && !/^https:\/\//i.test(String(body.fileUrl))) {
      return json({ ok: false, stage: "validation", error: "O arquivo deve usar uma URL HTTPS." });
    }

    const subscriber = await getSubscriberId(tel, body.nome || null, keyResult.apiKey);
    if (!subscriber.subscriberId) {
      return json({
        ok: false,
        stage: "subscriber",
        phone: tel,
        error: subscriber.error || "Não foi possível localizar ou criar o contato no BotConversa.",
      });
    }

    // Quando existe um fluxo, ele é o responsável por enviar a mensagem.
    // Isso evita que o hotel receba a mensagem direta e, em seguida, a mesma mensagem pelo fluxo.
    if (body.message && !hasFlow) {
      const sent = await sendMessage(
        subscriber.subscriberId,
        "text",
        String(body.message),
        keyResult.apiKey,
      );
      if (!sent.ok) {
        return json({
          ok: false,
          stage: "message",
          error: `O BotConversa recusou a mensagem (HTTP ${sent.status}): ${sent.detail || "sem detalhes"}`,
        });
      }
    }

    if (body.fileUrl) {
      const sent = await sendMessage(
        subscriber.subscriberId,
        "file",
        String(body.fileUrl),
        keyResult.apiKey,
      );
      if (!sent.ok) {
        return json({
          ok: false,
          stage: "file",
          error: `O BotConversa recusou o arquivo (HTTP ${sent.status}): ${sent.detail || "sem detalhes"}`,
        });
      }
    }

    if (hasFlow) {
      const started = await sendFlow(
        subscriber.subscriberId,
        flowId,
        keyResult.apiKey,
      );
      if (!started.ok) {
        return json({
          ok: false,
          stage: "flow",
          error: `O BotConversa recusou o fluxo ${flowId} (HTTP ${started.status}): ${started.detail || "sem detalhes"}`,
        });
      }
    }

    return json({
      ok: true,
      phone: tel,
      subscriberId: subscriber.subscriberId,
      apiKeySource: keyResult.source,
      deliveryMode: hasFlow ? "flow" : "direct",
    });
  } catch (err) {
    console.error("[botconversa-send]", err);
    return json({
      ok: false,
      stage: "exception",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
