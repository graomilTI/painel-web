import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authorizeRequest } from "../_shared/authorization.ts";
import { correiosFetch } from "../_shared/correios.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const auth = await authorizeRequest(req, ["envios"]);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  try {
    const { postagem_ids = [] } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await sb.from("envios_postagens").select("id, id_prepostagem").in("id", postagem_ids);
    if (error || !data?.length) return json({ ok: false, error: "Postagem não encontrada." }, 404);
    const ids = data.map((p: any) => p.id_prepostagem).filter(Boolean);
    if (!ids.length) return json({ ok: false, error: "Postagem ainda não possui pré-postagem confirmada." }, 400);

    const res = await correiosFetch(`/prepostagem/v1/prepostagens/declaracaoconteudo/${ids.join(",")}`, { headers: { Accept: "text/html" } });
    const text = await res.text();
    if (!res.ok) {
      let payload: any = null;
      try { payload = JSON.parse(text); } catch { /* resposta não era JSON */ }
      return json({ ok: false, error: payload?.msgs?.join?.("; ") || text.slice(0, 300) }, res.status);
    }
    return json({ ok: true, html: text });
  } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500); }
});
