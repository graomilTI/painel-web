// Cotação por link (Hospedagem): o hotel abre o link do ADM, vê só o pedido (cidade, datas, quartos) e informa as diárias.
//
//   GET  ?t=<token>   -> resumo do pedido, sem nome/CPF de colaborador, e a resposta anterior (se já respondeu)
//   POST { t, ... }   -> grava/atualiza a resposta do hotel nessa cotação (um link = um hotel)
//
// verify_jwt = false: o hotel não tem login; o token (64 hex) é o segredo, e o ADM encerra/reabre o link no painel.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { MAX_ENVIOS_POR_LINK, TOKEN_RE, estimarTotal, situacaoDoLink, validarResposta } from './regras.js';

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

const COLUNAS = 'id,solicitacao_id,hotel_nome,token,link_status,expira_em,quartos_necessarios,checkin_previsto,checkout_previsto,diarias_previstas,'
  + 'status,disponibilidade,precos_quartos,cafe_incluso,almoco_incluso,janta_inclusa,estacionamento_incluso,aceita_pagamento_checkout,'
  + 'emite_nota_fiscal,formas_pagamento,atendente_nome,atendente_telefone,observacoes,respondido_em,resposta_dados';

// deno-lint-ignore no-explicit-any
async function carregarLink(db: any, token: string) {
  if (!TOKEN_RE.test(token)) return { situacao: 'invalido' };
  const { data: cot } = await db.from('hospedagem_cotacoes').select(COLUNAS).eq('token', token).maybeSingle();
  const situacao = situacaoDoLink(cot);
  if (situacao !== 'aberta') return { situacao };
  return { situacao, cotacao: cot };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = admin();

  try {
    if (req.method === 'GET') {
      const r = await carregarLink(db, new URL(req.url).searchParams.get('t') ?? '');
      if (r.situacao !== 'aberta') return json({ erro: MENSAGEM_SITUACAO[r.situacao] }, r.situacao === 'invalido' ? 404 : 410);
      const c = r.cotacao;
      const { data: sol } = await db.from('hospedagem_solicitacoes').select('cidade,uf,empresa').eq('id', c.solicitacao_id).maybeSingle();
      const respondida = !!c.respondido_em;
      return json({
        hotel_nome: c.hotel_nome,
        expira_em: c.expira_em,
        cidade: sol?.cidade ?? null,
        uf: sol?.uf ?? null,
        empresa: sol?.empresa ?? null,
        checkin: c.checkin_previsto,
        checkout: c.checkout_previsto,
        diarias: c.diarias_previstas,
        quartos: c.quartos_necessarios ?? [],
        resposta_anterior: respondida ? {
          disponivel: c.disponibilidade,
          precos: c.precos_quartos ?? {},
          cafe_incluso: c.cafe_incluso, almoco_incluso: c.almoco_incluso, janta_inclusa: c.janta_inclusa,
          estacionamento_incluso: c.estacionamento_incluso, aceita_pagamento_checkout: c.aceita_pagamento_checkout,
          emite_nf: c.emite_nota_fiscal, formas_pagamento: c.formas_pagamento ?? [],
          atendente_nome: c.atendente_nome, atendente_telefone: c.atendente_telefone, observacoes: c.observacoes,
        } : null,
      });
    }

    if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ erro: 'Requisição inválida.' }, 400); }
    if (body.website) return json({ ok: true }); // campo-isca de robô: finge sucesso

    const r = await carregarLink(db, String(body.t ?? ''));
    if (r.situacao !== 'aberta') return json({ erro: MENSAGEM_SITUACAO[r.situacao] }, r.situacao === 'invalido' ? 404 : 410);
    const c = r.cotacao;

    const envios = Number(c.resposta_dados?.envios ?? 0);
    if (envios >= MAX_ENVIOS_POR_LINK) return json({ erro: 'Limite de envios deste link atingido. Fale com o setor de Hospedagem.' }, 429);

    const v = validarResposta(body, c.quartos_necessarios);
    if (v.erro || !v.dados) return json({ erro: v.erro }, 422);
    const d = v.dados;

    const est = estimarTotal(c.quartos_necessarios, d.precos, c.diarias_previstas);
    const informados = Object.values(d.precos as Record<string, number | null>).filter((p): p is number => typeof p === 'number');
    const agora = new Date().toISOString();
    const { error } = await db.from('hospedagem_cotacoes').update({
      status: d.disponivel ? 'RESPONDIDA' : 'INDISPONIVEL',
      disponibilidade: d.disponivel,
      precos_quartos: d.precos,
      valor_diaria: informados.length ? Math.min(...informados) : null, // referência: menor diária por quarto informada
      valor_total: d.disponivel ? est.total : null,
      cafe_incluso: d.cafe_incluso, almoco_incluso: d.almoco_incluso, janta_inclusa: d.janta_inclusa,
      estacionamento_incluso: d.estacionamento_incluso, aceita_pagamento_checkout: d.aceita_pagamento_checkout,
      emite_nota_fiscal: d.emite_nf, formas_pagamento: d.formas_pagamento,
      atendente_nome: d.atendente_nome, atendente_telefone: d.atendente_telefone, observacoes: d.observacoes || null,
      respondido_em: agora,
      resposta_dados: { origem: 'link', envios: envios + 1, enviado_em: agora },
    }).eq('id', c.id);
    if (error) throw error;

    await db.from('hospedagem_cotacao_colaboradores').update({ atendido: d.disponivel }).eq('cotacao_id', c.id);

    // Avisa o ADM no painel (uma notificação por envio, para o reenvio com preço novo não passar batido).
    await db.from('painel_notificacoes').upsert({
      tipo: 'hospedagem_cotacao_respondida',
      titulo: d.disponivel ? 'Hotel respondeu a cotação' : 'Hotel sem disponibilidade',
      descricao: `${c.hotel_nome ?? 'Hotel'} ${d.disponivel ? 'enviou os valores' : 'informou que não tem vaga'}.`,
      prioridade: 'atencao', icone: 'hotel-alert', modulo_url: 'adm-hotel', destinatario_modulo: 'HOSPEDAGEM',
      referencia_tabela: 'hospedagem_cotacoes', referencia_id: c.id, chave_dedup: `cotacao-link:${c.id}:${envios + 1}`,
    }, { onConflict: 'chave_dedup', ignoreDuplicates: true });

    return json({ ok: true, atualizada: envios > 0 });
  } catch (e) {
    console.error('[hospedagem-cotacao-publica]', e);
    return json({ erro: 'Não foi possível processar agora. Tente novamente.' }, 500);
  }
});
