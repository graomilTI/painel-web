import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { authorizeRequest } from "../_shared/authorization.ts";
import { correiosFetch } from "../_shared/correios.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido' }, 405);

  const auth = await authorizeRequest(req, ['envios'], { requireEdit: true });
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Body inválido' }, 400); }
  const { postagem_id } = body;
  if (!postagem_id) return json({ ok: false, error: 'postagem_id obrigatório' }, 400);

  const { data: postagem, error: pErr } = await sb
    .from('envios_postagens')
    .select('*, remetente:envios_remetentes(*), destinatario:envios_destinatarios(*)')
    .eq('id', postagem_id).single();
  if (pErr || !postagem) return json({ ok: false, error: 'Postagem não encontrada' }, 404);
  if (!['RASCUNHO', 'ERRO'].includes(postagem.status)) return json({ ok: false, error: 'Postagem já processada' }, 409);

  const { data: secrets } = await sb
    .from('ti_integracao_segredos').select('chave, valor')
    .eq('integracao_id', '613655d3-a1b3-42af-9410-baa72c86e9b4').eq('ativo', true);
  const sec: Record<string, string> = {};
  for (const s of secrets ?? []) sec[s.chave] = s.valor;

  const cartao    = sec['CORREIOS_CARTAO']         ?? '';

  const rem  = postagem.remetente;
  const dest = postagem.destinatario;
  if (!rem)  return json({ ok: false, error: 'Remetente não encontrado' }, 500);
  if (!dest) return json({ ok: false, error: 'Destinatário não encontrado' }, 500);

  function fone(t: string | null) {
    if (!t) return {};
    const d = t.replace(/\D/g, '');
    if (d.length === 11) return { dddTelefone: d.slice(0, 2), telefone: d.slice(2) };
    if (d.length === 10) return { dddTelefone: d.slice(0, 2), telefone: d.slice(2) };
    return {};
  }
  function cleanCep(v: string | null) { return (v ?? '').replace(/\D/g, ''); }

  const formato        = postagem.formato ?? 'caixa';
  const isEnvelope     = formato === 'envelope';
  const isRolo         = formato === 'rolo';
  const codigoServico      = postagem.servico_codigo;
  const servicosAdicionais = codigoServico === '80900' ? [{ codigoServicoAdicional: '001' }] : [];
  const rawDesc            = (postagem.conteudo ?? '').trim() || 'Documentos';
  const conteudoDesc       = rawDesc.length >= 5 ? rawDesc : rawDesc.padEnd(5, 'X');
  const alturaNum          = Number(postagem.altura_cm      ?? 0);
  const larguraNum         = Number(postagem.largura_cm     ?? 0);
  const comprimentoNum     = Number(postagem.comprimento_cm ?? 0);
  const diametroNum        = Number(postagem.diametro_cm    ?? 0);
  const valorDeclarado     = Math.max(parseFloat(String(postagem.valor_declarado ?? 0)), 1.0);

  const dimFields: Record<string, unknown> = isEnvelope ? {} : {
    alturaInformada: String(alturaNum), larguraInformada: String(larguraNum),
    comprimentoInformado: String(comprimentoNum), diametroInformado: String(diametroNum),
  };

  const payload: Record<string, unknown> = {
    remetente: {
      nome: rem.nome,
      ...(rem.cpf_cnpj ? { cpfCnpj: rem.cpf_cnpj.replace(/\D/g, '') } : {}),
      ...(rem.email ? { email: rem.email } : {}),
      ...fone(rem.telefone),
      endereco: { cep: cleanCep(rem.cep), logradouro: rem.logradouro, numero: rem.numero, complemento: rem.complemento || '', bairro: rem.bairro, cidade: rem.cidade, uf: rem.uf },
    },
    destinatario: {
      nome: dest.nome,
      ...(dest.cpf_cnpj ? { cpfCnpj: dest.cpf_cnpj.replace(/\D/g, '') } : {}),
      ...(dest.email ? { email: dest.email } : {}),
      ...fone(dest.telefone),
      endereco: { cep: cleanCep(dest.cep), logradouro: dest.logradouro, numero: dest.numero, complemento: dest.complemento || '', bairro: dest.bairro, cidade: dest.cidade, uf: dest.uf },
    },
    codigoServico,
    numeroCartaoPostagem: cartao,
    ...(servicosAdicionais.length > 0 ? { listaServicoAdicional: servicosAdicionais } : {}),
    pesoInformado: String(postagem.peso_gramas ?? 100),
    codigoFormatoObjetoInformado: isEnvelope ? '1' : isRolo ? '3' : '2',
    ...dimFields,
    ...(postagem.conteudo ? { observacao: postagem.conteudo } : {}),
    itensDeclaracaoConteudo: [{ conteudo: conteudoDesc, quantidade: 1, valor: valorDeclarado }],
    cienteObjetoNaoProibido: '1',
    emiteDCe: 'S',
  };

  try {
    const res = await correiosFetch('/prepostagem/v1/prepostagens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const rawText = await res.text();
    console.log('[prepostagem] HTTP', res.status, rawText.slice(0, 500));

    let result: any;
    try { result = JSON.parse(rawText); } catch { result = null; }

    if (res.ok) {
      const numeroObjeto  = result?.codigoObjeto  ?? result?.numeroObjeto  ?? null;
      const idPrepostagem = result?.idPrePostagem ?? result?.id             ?? String(Date.now());
      const valorPostagem = result?.precoServico  ?? result?.precoPrePostagem ?? null;
      await sb.from('envios_postagens').update({
        numero_objeto: numeroObjeto, id_prepostagem: idPrepostagem,
        status: 'CONFIRMADO', valor_postagem: valorPostagem,
        confirmado_em: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', postagem_id);
      return json({ ok: true, numero_objeto: numeroObjeto, id_prepostagem: idPrepostagem, valor: valorPostagem });
    }

    const msgs: string[] = Array.isArray(result?.msgs) ? result.msgs : [];
    const errMsg = msgs.length > 0 ? msgs.join('; ') : rawText.slice(0, 300);
    const lastError = `Correios ${res.status}: ${errMsg}`;
    console.error('[prepostagem] Falha:', lastError);
    await sb.from('envios_postagens').update({
      status: 'ERRO', observacoes: 'Error: ' + lastError, updated_at: new Date().toISOString(),
    }).eq('id', postagem_id);
    return json({ ok: false, error: lastError }, 502);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await sb.from('envios_postagens').update({
      status: 'ERRO', observacoes: 'Error: ' + err, updated_at: new Date().toISOString(),
    }).eq('id', postagem_id);
    return json({ ok: false, error: err }, 500);
  }
});
