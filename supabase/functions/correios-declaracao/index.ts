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

    // DACE (Declaração Auxiliar de Conteúdo Eletrônica) só existe pra pré-postagens
    // criadas com emiteDCe:"S". Pré-postagens antigas, criadas antes desse campo
    // existir no payload, não têm DCe emitida e vão cair no erro dos Correios abaixo.
    const res = await correiosFetch("/prepostagem/v1/prepostagens/dce/dace/impressao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idsPrePostagens: ids, tipoDace: "C" }),
    });
    const contentType = res.headers.get("content-type") || "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    console.log("[correios-declaracao] HTTP", res.status, contentType, text.slice(0, 500));
    let payload: any; try { payload = JSON.parse(text); } catch { payload = null; }
    if (!res.ok) return json({ ok: false, error: payload?.msgs?.join?.("; ") || text.slice(0, 300) }, res.status);

    let binaryPdf: string | null = null;
    if (contentType.includes("application/pdf")) {
      let value = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      binaryPdf = btoa(value);
    }
    const pdf = binaryPdf || payload?.dados || payload?.pdf || payload?.pdfBase64 || (typeof payload === "string" ? payload : null);
    if (!pdf) return json({ ok: false, error: "Os Correios não retornaram a DACE. Esta postagem pode ter sido criada antes da emissão automática de DCe." }, 502);
    return json({ ok: true, pdf_base64: pdf });
  } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500); }
});
