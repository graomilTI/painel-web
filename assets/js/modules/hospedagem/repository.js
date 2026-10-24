// Todas as chamadas ao Supabase da fila v3 da Hospedagem (ADM) num só lugar. As telas não falam com o banco direto.
// Cada função devolve o resultado cru do supabase-js ({ data, error }): quem chama decide o aviso ao usuário.

const BUCKET_DOCUMENTOS = 'hospedagem-documentos';
const VALIDADE_URL_COMPROVANTE = 60 * 60 * 24 * 7; // 7 dias

export function criarRepositorio(supabase) {
  const rpc = (nome, args) => supabase.rpc(nome, args);

  return {
    // Painel completo: o legado v2 (RPC) e tudo da fila v3 em paralelo, na ordem de sempre.
    carregarFila: () => Promise.all([
      supabase.rpc('hospedagem_carregar_painel_v2'),
      supabase.from('hospedagem_v3_itens').select('*').neq('status_item', 'CANCELADO').order('data_checkin_prevista').order('horario_chegada_previsto').order('solicitado_em'),
      supabase.from('hospedagem_alteracoes').select('*').in('status', ['AGUARDANDO_ADM', 'ENVIADA_HOTEL']).order('created_at'),
      supabase.from('hospedagem_checkout_decisoes').select('*').in('status', ['AGUARDANDO_GESTOR', 'SEM_RESPOSTA', 'AGUARDANDO_HOTEL', 'AGUARDANDO_ADM']).order('data_checkout_prevista'),
      supabase.from('hospedagem_pagamentos_v3').select('*').neq('status', 'CANCELADO').order('created_at', { ascending: false }),
      supabase.from('hospedagem_pagamento_parcelas').select('*').order('created_at', { ascending: false }),
      supabase.from('hospedagem_cotacoes').select('*, hospedagem_cotacao_colaboradores(solicitacao_colaborador_id,atendido)').not('token', 'is', null).order('created_at', { ascending: false }).limit(500),
      supabase.from('hospedagem_reserva_pedidos').select('id,solicitacao_id,hotel_id,cotacao_id,valor_diaria,solicitado_em,hospedagem_reserva_pedido_colaboradores(solicitacao_colaborador_id)').eq('status', 'AGUARDANDO_HOTEL'),
    ]),

    // Hotéis. Com `retornar`, devolve o hotel gravado (a tela de cotação já o seleciona).
    cadastrarHotel: (hotel, retornar) => (retornar
      ? supabase.from('hospedagem_hoteis').insert(hotel).select(retornar).single()
      : supabase.from('hospedagem_hoteis').insert(hotel)),

    // Cotação por link e reserva.
    iniciarCotacao: ({ solicitacaoId, itemIds, hotelIds, quartos }) => rpc('hospedagem_v3_iniciar_cotacao', { p_solicitacao_id: solicitacaoId, p_item_ids: itemIds, p_hotel_ids: hotelIds, p_quartos: quartos }),
    atualizarCotacao: (id, campos) => supabase.from('hospedagem_cotacoes').update(campos).eq('id', id),
    solicitarReserva: ({ solicitacaoId, hotelId, itemIds, valorDiaria, quartos, cotacaoId }) => rpc('hospedagem_v3_solicitar_reserva', {
      p_solicitacao_id: solicitacaoId, p_hotel_id: hotelId, p_item_ids: itemIds, p_valor_diaria: valorDiaria, p_quartos: quartos, p_cotacao_id: cotacaoId,
    }),
    confirmarPedido: (pedidoId, resposta) => rpc('hospedagem_v3_confirmar_reserva_pedido', { p_pedido_id: pedidoId, p_resposta: resposta }),
    recusarPedido: (pedidoId, resposta) => rpc('hospedagem_v3_recusar_reserva_pedido', { p_pedido_id: pedidoId, p_resposta: resposta }),
    recusarItem: (itemId, motivo) => rpc('hospedagem_v3_recusar_item', { p_item_id: itemId, p_motivo: motivo }),

    // Checkout e alterações pedidas pelo gestor.
    validarCheckout: (decisaoId) => rpc('hospedagem_v3_validar_checkout', { p_decisao_id: decisaoId }),
    tratarAlteracao: (alteracaoId) => rpc('hospedagem_v3_tratar_alteracao', { p_alteracao_id: alteracaoId }),
    prepararNovaReservaAlteracao: (alteracaoId) => rpc('hospedagem_v3_preparar_nova_reserva_alteracao', { p_alteracao_id: alteracaoId }),

    // Despesa extra e pagamento.
    registrarExtra: ({ reservaId, descricao, valor, rateios }) => rpc('hospedagem_v3_registrar_extra', { p_reserva_id: reservaId, p_descricao: descricao, p_valor: valor, p_rateios: rateios }),
    criarPagamento: (p) => rpc('hospedagem_v3_criar_pagamento', {
      p_reserva_id: p.reservaId, p_forma: p.forma, p_valor: p.valor, p_chave_pix: p.chavePix, p_boleto_url: p.boletoUrl, p_linha_digitavel: null, p_vencimento: p.vencimento, p_enviar_financeiro: p.enviarFinanceiro,
    }),
    // Sobe o comprovante e devolve { error } ou { url } (URL assinada de 7 dias; se não assinar, o caminho do arquivo).
    enviarComprovante: async (caminho, arquivo) => {
      const up = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(caminho, arquivo, { upsert: false });
      if (up.error) return { error: up.error };
      const assinada = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(caminho, VALIDADE_URL_COMPROVANTE);
      return { url: assinada.data?.signedUrl || caminho };
    },
    registrarParcela: ({ pagamentoId, valor, data, comprovanteUrl, setor }) => rpc('hospedagem_v3_registrar_parcela', {
      p_pagamento_id: pagamentoId, p_valor: valor, p_data: data, p_comprovante_url: comprovanteUrl, p_setor: setor,
    }),
  };
}
