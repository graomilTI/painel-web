// Cotação por link (Compras): o fornecedor abre o link, vê só os itens e envia o preço.
//
//   GET  ?t=<token>            -> itens do link (UN, material, tamanho), sem dados de gestor/colaborador
//   POST { t, cnpj, ... }      -> grava/atualiza a resposta do fornecedor (uma por CNPJ no link)
//
// verify_jwt = false: o fornecedor não tem login; o token (64 hex) é o segredo, e o link expira/encerra no painel.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { MAX_RESPOSTAS_POR_LINK, TOKEN_RE, situacaoDoLink, validarResposta } from './regras.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const MENSAGEM_SITUACAO: Record<string, string> = {
  invalido: 'Link inválido.',
  encerrada: 'Esta cotação foi encerrada.',
  expirada: 'O prazo para responder esta cotação terminou.',
};

// deno-lint-ignore no-explicit-any
async function carregarLink(db: any, token: string) {
  if (!TOKEN_RE.test(token)) return { situacao: 'invalido' };
  const { data: cot } = await db.from('compras_cotacao_links').select('id,status,expira_em').eq('token', token).maybeSingle();
  const situacao = situacaoDoLink(cot);
  if (situacao !== 'aberta') return { situacao };
  const { data: vinculos } = await db.from('compras_cotacao_itens').select('compra_item_id').eq('cotacao_id', cot.id);
  const ids = (vinculos ?? []).map((v: { compra_item_id: string }) => v.compra_item_id);
  // Só o necessário para cotar: nada de gestor, colaborador, CPF ou valores internos.
  const { data: itens } = ids.length
    ? await db.from('compras_itens').select('id,material,tamanho,uniforme_cor,quantidade,unidade').in('id', ids)
    : { data: [] };
  return { situacao, cotacao: cot, itens: itens ?? [] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = admin();

  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('t') ?? '';
      const r = await carregarLink(db, token);
      if (r.situacao !== 'aberta') return json({ erro: MENSAGEM_SITUACAO[r.situacao] }, r.situacao === 'invalido' ? 404 : 410);
      return json({
        expira_em: r.cotacao.expira_em,
        itens: r.itens.map((i: Record<string, unknown>) => ({
          id: i.id,
          un: Number(i.quantidade ?? i.unidade ?? 1),
          material: i.material,
          detalhe: [i.tamanho, i.uniforme_cor].filter(Boolean).join(' · '),
        })),
      });
    }

    if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ erro: 'Requisição inválida.' }, 400); }
    if (body.website) return json({ ok: true }); // campo-isca de robô: finge sucesso

    const r = await carregarLink(db, String(body.t ?? ''));
    if (r.situacao !== 'aberta') return json({ erro: MENSAGEM_SITUACAO[r.situacao] }, r.situacao === 'invalido' ? 404 : 410);

    const v = validarResposta(body, r.itens.map((i: { id: string }) => i.id));
    if (v.erro || !v.dados) return json({ erro: v.erro }, 422);
    const d = v.dados;

    const { data: existente } = await db.from('compras_cotacao_respostas').select('id').eq('cotacao_id', r.cotacao.id).eq('cnpj', d.cnpj).maybeSingle();
    if (!existente) {
      const { count } = await db.from('compras_cotacao_respostas').select('id', { count: 'exact', head: true }).eq('cotacao_id', r.cotacao.id);
      if ((count ?? 0) >= MAX_RESPOSTAS_POR_LINK) return json({ erro: 'Limite de respostas deste link atingido.' }, 429);
    }

    const campos = {
      cotacao_id: r.cotacao.id, cnpj: d.cnpj, razao_social: d.razao_social, emite_nf: d.emite_nf, prazo_entrega: d.prazo_entrega,
      frete_pagador: d.frete_pagador, frete_valor: d.frete_valor,
      formas_pagamento: d.formas_pagamento, tem_desconto: d.tem_desconto, descontos: d.descontos, atualizado_em: new Date().toISOString(),
    };
    const { data: resp, error } = await db.from('compras_cotacao_respostas').upsert(campos, { onConflict: 'cotacao_id,cnpj' }).select('id').single();
    if (error || !resp) throw error ?? new Error('Falha ao gravar a resposta.');

    await db.from('compras_cotacao_resposta_itens').delete().eq('resposta_id', resp.id);
    const { error: eIt } = await db.from('compras_cotacao_resposta_itens')
      .insert(d.itens.map((i: { id: string; valor_unitario: number | null }) => ({ resposta_id: resp.id, compra_item_id: i.id, valor_unitario: i.valor_unitario })));
    if (eIt) throw eIt;

    return json({ ok: true, atualizada: !!existente });
  } catch (e) {
    console.error('[compras-cotacao-publica]', e);
    return json({ erro: 'Não foi possível processar agora. Tente novamente.' }, 500);
  }
});
