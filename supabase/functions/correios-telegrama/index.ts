import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORREIOS_API = 'https://api.correios.com.br';
const SMT_PORTAL  = 'https://apps.correios.com.br/smt';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

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
  if (tel.status !== 'RASCUNHO') return json({ ok: false, error: 'Já processado' }, 400);

  const { data: secrets } = await sb
    .from('ti_integracao_segredos').select('chave, valor')
    .eq('integracao_id', '613655d3-a1b3-42af-9410-baa72c86e9b4').eq('ativo', true);
  const sec: Record<string, string> = {};
  for (const s of secrets ?? []) sec[s.chave] = s.valor;

  const cartao    = sec['CORREIOS_CARTAO']         ?? '';
  const cwsCartao = sec['CORREIOS_CWS_KEY_CARTAO'] ?? '';
  if (!cwsCartao) return json({ ok: false, error: 'Chave CWS não configurada' }, 500);

  const rem        = tel.remetente;
  const destNome   = tel.destinatario?.nome        ?? tel.dest_nome;
  const destCep    = tel.destinatario?.cep         ?? tel.dest_cep;
  const destLog    = tel.destinatario?.logradouro  ?? tel.dest_logradouro;
  const destNum    = tel.destinatario?.numero      ?? tel.dest_numero;
  const destComp   = tel.destinatario?.complemento ?? tel.dest_complemento;
  const destBairro = tel.destinatario?.bairro      ?? tel.dest_bairro;
  const destCidade = tel.destinatario?.cidade      ?? tel.dest_cidade;
  const destUf     = tel.destinatario?.uf          ?? tel.dest_uf;

  if (!rem)      return json({ ok: false, error: 'Remetente não encontrado' }, 500);
  if (!destNome) return json({ ok: false, error: 'Destinatário inválido' }, 400);

  function cleanCep(v: string | null) { return (v ?? '').replace(/\D/g, ''); }

  const servicosAdicionais: string[] = [];
  if (tel.tem_pc) servicosAdicionais.push('PC');
  if (tel.tem_cc) servicosAdicionais.push('CC');

  const payload = {
    remetente: {
      nome: rem.nome,
      endereco: {
        cep: cleanCep(rem.cep), logradouro: rem.logradouro,
        numero: rem.numero, complemento: rem.complemento || '',
        bairro: rem.bairro, cidade: rem.cidade, uf: rem.uf,
      },
    },
    destinatario: {
      nome: destNome,
      endereco: {
        cep: cleanCep(destCep), logradouro: destLog,
        numero: destNum, complemento: destComp || '',
        bairro: destBairro, cidade: destCidade, uf: destUf,
      },
    },
    mensagem: tel.mensagem,
    numeroCartaoPostagem: cartao,
    ...(servicosAdicionais.length ? { servicosAdicionais } : {}),
    ...(tel.agendamento ? { dataEntrega: tel.agendamento } : {}),
  };

  // Tenta endpoints REST do SMT em ordem
  // 404/405/503 = endpoint inexistente, tenta próximo; outros erros param
  const RETRY_STATUSES = new Set([404, 405, 503]);
  const endpoints = [
    `${CORREIOS_API}/smt/v1/prepostagens`,
    `${CORREIOS_API}/mensagem/v1/prepostagens`,
    `${CORREIOS_API}/telegrama/v1/prepostagens`,
  ];

  let lastError = '';
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cwsCartao}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      console.log('[telegrama]', endpoint, 'HTTP', res.status, rawText.slice(0, 300));

      let result: any;
      try { result = JSON.parse(rawText); } catch { result = null; }

      if (res.ok) {
        const idTelegrama = result?.id ?? result?.idMensagem ?? result?.protocolo ?? String(Date.now());
        const protocolo   = result?.protocolo ?? result?.idLote ?? null;
        const valor       = result?.valor ?? result?.preco ?? null;
        await sb.from('envios_telegramas').update({
          status: 'ENVIADO', id_telegrama: idTelegrama, protocolo,
          valor_postagem: valor, confirmado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', telegrama_id);
        return json({ ok: true, id_telegrama: idTelegrama, protocolo, portal: SMT_PORTAL });
      }

      const msgs: string[] = Array.isArray(result?.msgs) ? result.msgs : [];
      const err = msgs.length ? msgs.join('; ') : rawText.slice(0, 200);
      lastError = `[${endpoint.split('/').slice(-3).join('/')}] HTTP ${res.status}: ${err}`;
      if (!RETRY_STATUSES.has(res.status)) break;
    } catch (e) {
      lastError = String(e);
    }
  }

  // API SMT não disponível via REST — salva para envio manual pelo portal
  await sb.from('envios_telegramas').update({
    status: 'PENDENTE_PORTAL',
    observacoes: lastError,
    updated_at: new Date().toISOString(),
  }).eq('id', telegrama_id);

  // Retorna 200 (não 422) — a operação foi processada com sucesso, só o envio automático falhou
  return json({
    ok: false,
    portal_required: true,
    portal_url: SMT_PORTAL,
    error: 'API SMT não disponível via REST. Use o portal Correios para enviar.',
    detail: lastError,
  });
});
