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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const auth = await authorizeRequest(req, ["telegrama", "envios"], { requireEdit: true });
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  // The former production implementation was not versioned. Do not attempt an
  // insecure browser-session login until a supported Correios API flow is added.
  return json({
    ok: false,
    error: "Autenticação SMT temporariamente indisponível. Use a autenticação oficial CWS dos Correios.",
  }, 503);
});
