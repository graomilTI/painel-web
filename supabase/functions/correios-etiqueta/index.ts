import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authorizeRequest } from "../_shared/authorization.ts";
import { correiosFetch } from "../_shared/correios.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const auth = await authorizeRequest(req, ["envios"], { requireEdit: true });
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  try {
    const { postagem_ids = [] } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await sb.from("envios_postagens").select("id, id_prepostagem").in("id", postagem_ids);
    if (error || !data?.length) return json({ ok: false, error: "Postagem não encontrada." }, 404);
    const ids = data.map((p: any) => p.id_prepostagem).filter(Boolean);

    async function readBody(res: Response) {
      const contentType = res.headers.get("content-type") || "";
      const bytes = new Uint8Array(await res.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      let payload: any; try { payload = JSON.parse(text); } catch { payload = null; }
      let binaryPdf: string | null = null;
      if (contentType.includes("application/pdf")) {
        let value = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        binaryPdf = btoa(value);
      }
      return { contentType, text, payload, binaryPdf };
    }

    const submit = await correiosFetch("/prepostagem/v1/prepostagens/rotulo/assincrono/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idsPrePostagem: ids, tipoRotulo: "P" }) });
    const submitBody = await readBody(submit);
    console.log("[correios-etiqueta] submit HTTP", submit.status, submitBody.text.slice(0, 500));
    if (!submit.ok) return json({ ok: false, error: submitBody.payload?.msgs?.join?.("; ") || submitBody.text.slice(0, 300) }, submit.status);

    // Resposta pode já trazer o PDF pronto (síncrono na prática) ou um recibo para consulta assíncrona.
    let pdf = submitBody.binaryPdf || submitBody.payload?.dados || submitBody.payload?.pdf || submitBody.payload?.pdfBase64 || (typeof submitBody.payload === "string" ? submitBody.payload : null);
    const idRecibo = submitBody.payload?.idRecibo || submitBody.payload?.recibo || submitBody.payload?.protocolo || submitBody.payload?.id;

    if (!pdf && idRecibo) {
      for (let attempt = 0; attempt < 6 && !pdf; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        const poll = await correiosFetch(`/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`, { method: "GET" });
        const pollBody = await readBody(poll);
        console.log("[correios-etiqueta] poll HTTP", poll.status, pollBody.text.slice(0, 500));
        if (!poll.ok) continue;
        pdf = pollBody.binaryPdf || pollBody.payload?.dados || pollBody.payload?.pdf || pollBody.payload?.pdfBase64 || (typeof pollBody.payload === "string" ? pollBody.payload : null);
      }
    }

    if (!pdf) return json({ ok: false, error: "Os Correios não retornaram o PDF da etiqueta." }, 502);
    return json({ ok: true, pdf_base64: pdf });
  } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500); }
});
