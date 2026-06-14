import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authorizeRequest } from "../_shared/authorization.ts";

const CORREIOS_API = 'https://api.correios.com.br';
const SMT_PORTAL   = 'https://apps.correios.com.br/smt';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

const RETRY_STATUSES = new Set([404, 405, 503]);
const ENDPOINTS = [
  `${CORREIOS_API}/smt/v1/prepostagens`,
  `${CORREIOS_API}/mensagem/v1/prepostagens`,
  `${CORREIOS_API}/telegrama/v1/prepostagens`,
];

async function tryRest(
  payload: unknown, authHeader: string, label: string,
): Promise<{ok:true;id:string;protocolo:string|null;valor:number|null}|{ok:false;err:string}> {
  let lastErr = '';
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      console.log(`[telegrama/${label}]`, ep, 'HTTP', res.status, raw.slice(0, 200));
      let result: any = null;
      try { result = JSON.parse(raw); } catch { /* response was not JSON */ }
      if (res.ok) return {
        ok: true,
        id: result?.id ?? result?.idMensagem ?? result?.protocolo ?? String(Date.now()),
        protocolo: result?.protocolo ?? result?.idLote ?? null,
        valor: result?.valor ?? result?.preco ?? null,
      };
      const msgs = Array.isArray(result?.msgs) ? result.msgs.join('; ') : raw.slice(0, 150);
      lastErr = `[${ep.split('/').slice(-3).join('/')}] HTTP ${res.status}: ${msgs}`;
      if (!RETRY_STATUSES.has(res.status)) break;
    } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
  }
  return { ok: false, err: lastErr };
}

async function markEnviado(sb: any, id: string, idTelegrama: string, protocolo: string|null, valor: number|null) {
  await sb.from('envios_telegramas').update({
    status: 'ENVIADO', id_telegrama: idTelegrama, protocolo,
    valor_postagem: valor, confirmado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido' }, 405);

  const auth = await authorizeRequest(req, ['telegrama'], { requireEdit: true });
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Body inválido' }, 400); }
  const { telegrama_id } = body;
  if (!telegrama_id) return json({ ok: false, error: 'telegrama_id obrigatório' }, 400);

  const { data: tel, error: tErr } = await sb
    .from('envios_telegramas')
    .select('*, remetente:envios_remetentes(*), destinatario:envios_destinatarios(*)')
    .eq('id', telegrama_id).single();
  if (tErr || !tel) return json({ ok: false, error: 'Telegrama não encontrado' }, 404);
  if (!['RASCUNHO', 'PENDENTE_PORTAL'].includes(tel.status)) return json({ ok: false, error: 'Telegrama já processado' }, 409);

  const { data: secrets } = await sb
    .from('ti_integracao_segredos').select('chave, valor')
    .eq('integracao_id', '613655d3-a1b3-42af-9410-baa72c86e9b4').eq('ativo', true);
  const sec: Record<string,string> = {};
  for (const s of secrets ?? []) sec[s.chave] = s.valor;

  const cartao    = sec['CORREIOS_CARTAO']         ?? '';
  const cwsCartao = sec['CORREIOS_CWS_KEY_CARTAO'] ?? '';
  if (!cwsCartao) return json({ ok: false, error: 'Chave CWS não configurada' }, 500);

  const rem = tel.remetente; const dest = tel.destinatario ?? {};
  const destNome   = dest.nome        ?? tel.dest_nome;
  const destCep    = dest.cep         ?? tel.dest_cep;
  const destLog    = dest.logradouro  ?? tel.dest_logradouro;
  const destNum    = dest.numero      ?? tel.dest_numero;
  const destComp   = dest.complemento ?? tel.dest_complemento;
  const destBairro = dest.bairro      ?? tel.dest_bairro;
  const destCidade = dest.cidade      ?? tel.dest_cidade;
  const destUf     = dest.uf          ?? tel.dest_uf;

  if (!rem)      return json({ ok: false, error: 'Remetente não encontrado' }, 500);
  if (!destNome) return json({ ok: false, error: 'Destinatário inválido' }, 400);

  const cleanCep = (v: string|null) => (v ?? '').replace(/\D/g, '');
  const servicosAdicionais: string[] = [];
  if (tel.tem_pc) servicosAdicionais.push('PC');
  if (tel.tem_cc) servicosAdicionais.push('CC');

  const payload = {
    remetente: { nome: rem.nome, endereco: { cep: cleanCep(rem.cep), logradouro: rem.logradouro, numero: rem.numero, complemento: rem.complemento || '', bairro: rem.bairro, cidade: rem.cidade, uf: rem.uf } },
    destinatario: { nome: destNome, endereco: { cep: cleanCep(destCep), logradouro: destLog, numero: destNum, complemento: destComp || '', bairro: destBairro, cidade: destCidade, uf: destUf } },
    mensagem: tel.mensagem, numeroCartaoPostagem: cartao,
    ...(servicosAdicionais.length ? { servicosAdicionais } : {}),
    ...(tel.agendamento ? { dataEntrega: tel.agendamento } : {}),
  };

  const errors: string[] = [];

  const { data: tokenCache } = await sb.from('envios_correios_token_cache')
    .select('token, expires_at').eq('id', 1).maybeSingle();
  if (tokenCache?.token && new Date(tokenCache.expires_at) > new Date()) {
    const r = await tryRest(payload, `Bearer ${tokenCache.token}`, 'jwt');
    if (r.ok) { await markEnviado(sb, telegrama_id, r.id, r.protocolo, r.valor); return json({ ok: true, id_telegrama: r.id, protocolo: r.protocolo, auth: 'jwt' }); }
    errors.push(`JWT: ${r.err}`);
  }

  {
    const r = await tryRest(payload, `Bearer ${cwsCartao}`, 'cws');
    if (r.ok) { await markEnviado(sb, telegrama_id, r.id, r.protocolo, r.valor); return json({ ok: true, id_telegrama: r.id, protocolo: r.protocolo, auth: 'cws' }); }
    errors.push(`CWS: ${r.err}`);
  }

  const { data: smtSession } = await sb.from('envios_correios_token_cache')
    .select('token, expires_at').eq('id', 2).maybeSingle();
  if (smtSession?.token && new Date(smtSession.expires_at) > new Date()) {
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Cookie': smtSession.token, 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify(payload),
        });
        const raw = await res.text();
        console.log('[telegrama/session]', ep, 'HTTP', res.status, raw.slice(0, 200));
        let result: any = null;
        try { result = JSON.parse(raw); } catch { /* response was not JSON */ }
        if (res.ok) {
          const id = result?.id ?? result?.idMensagem ?? result?.protocolo ?? String(Date.now());
          await markEnviado(sb, telegrama_id, id, result?.protocolo ?? null, result?.valor ?? null);
          return json({ ok: true, id_telegrama: id, protocolo: result?.protocolo ?? null, auth: 'session' });
        }
        errors.push(`Session[${ep.split('/').slice(-3).join('/')}]: HTTP ${res.status}`);
        if (!RETRY_STATUSES.has(res.status)) break;
      } catch (e) { errors.push(`Session: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  const lastError = errors.join(' | ');
  await sb.from('envios_telegramas').update({ status: 'PENDENTE_PORTAL', observacoes: lastError, updated_at: new Date().toISOString() }).eq('id', telegrama_id);
  return json({ ok: false, portal_required: true, portal_url: SMT_PORTAL, error: 'Falha no envio via API SMT.', detail: lastError }, 502);
});
