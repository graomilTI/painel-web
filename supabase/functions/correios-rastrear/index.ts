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
    const { postagem_id, numeros = [] } = await req.json();
    const objetos = (numeros as string[]).map((n) => String(n).replace(/[^A-Za-z0-9]/g, "").toUpperCase()).filter(Boolean);
    if (!objetos.length) return json({ ok: false, error: "Informe ao menos um código de rastreamento." }, 400);
    const res = await correiosFetch(`/srorastro/v1/objetos/${objetos.join(",")}?resultado=T`, { headers: { "Accept-Language": "pt-BR" } });
    const text = await res.text();
    const data = JSON.parse(text);
    if (!res.ok) return json({ ok: false, error: data?.msgs?.join?.("; ") || text.slice(0, 300) }, res.status);
    if (postagem_id && data?.objetos?.[0]?.eventos?.length) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const eventos = data.objetos[0].eventos;
      const ultimo = eventos[0];
      const descricao = String(ultimo?.descricao || "").toLowerCase();
      const status = descricao.includes("entregue") ? "ENTREGUE" : descricao.includes("devolv") ? "DEVOLVIDO" : "EM_TRANSITO";
      await sb.from("envios_postagens").update({ status, updated_at: new Date().toISOString() }).eq("id", postagem_id);
      await sb.from("envios_rastreamento").upsert(eventos.map((e: any) => ({ postagem_id, numero_objeto: objetos[0], evento_data: e.dtHrCriado, evento_tipo: e.tipo, evento_descricao: e.descricao, evento_local: [e.unidade?.nome, e.unidade?.endereco?.cidade].filter(Boolean).join(" / "), raw_json: e })), { onConflict: "postagem_id,evento_data,evento_tipo", ignoreDuplicates: true });
    }
    return json({ ok: true, ...data });
  } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500); }
});
