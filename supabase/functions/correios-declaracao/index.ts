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
    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text();
    console.log("[correios-declaracao] HTTP", res.status, contentType, raw.slice(0, 300));
    if (!res.ok) {
      let payload: any = null;
      try { payload = JSON.parse(raw); } catch { /* resposta não era JSON */ }
      return json({ ok: false, error: payload?.msgs?.join?.("; ") || raw.slice(0, 300) }, res.status);
    }

    // A resposta pode vir embrulhada em JSON (ex.: { html/dados: "<html>..." ou base64})
    // em vez de HTML puro, dependendo do Accept aceito pelo gateway dos Correios.
    let html = raw;
    if (contentType.includes("application/json")) {
      let payload: any = null;
      try { payload = JSON.parse(raw); } catch { /* segue com raw mesmo */ }
      const candidate = payload?.html ?? payload?.dados ?? payload?.arquivo ?? payload?.conteudo;
      if (typeof candidate === "string") {
        try { html = atob(candidate); } catch { html = candidate; }
      }
    }

    // A página abre numa janela em branco (about:blank) sem origem própria — sem uma
    // <base> apontando pro domínio dos Correios, CSS/imagens/QR-code referenciados por
    // caminho relativo no HTML deles não carregam e o documento sai quebrado na tela.
    if (!/<base\b/i.test(html)) {
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/<head([^>]*)>/i, `<head$1><base href="https://api.correios.com.br/">`)
        : `<base href="https://api.correios.com.br/">${html}`;
    }

    return json({ ok: true, html });
  } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500); }
});
