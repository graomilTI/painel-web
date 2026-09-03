-- Auto-anexo de NF em Compras via Espião NF-e Cloud
-- Colunas de matching/sugestão em compras_itens + RPC confirmar_nf_sugerida

ALTER TABLE public.compras_itens
  ADD COLUMN IF NOT EXISTS fornecedor_cnpj text,
  ADD COLUMN IF NOT EXISTS nf_busca_status text NOT NULL DEFAULT 'nunca_buscado',
  ADD COLUMN IF NOT EXISTS nf_busca_iniciada_em timestamptz,
  ADD COLUMN IF NOT EXISTS nf_busca_ultima_em timestamptz,
  ADD COLUMN IF NOT EXISTS nf_sugestao jsonb,
  ADD COLUMN IF NOT EXISTS nf_sugestoes_rejeitadas text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.compras_itens
  DROP CONSTRAINT IF EXISTS compras_itens_nf_busca_status_check;
ALTER TABLE public.compras_itens
  ADD CONSTRAINT compras_itens_nf_busca_status_check
  CHECK (nf_busca_status IN ('nunca_buscado','buscando','sugestao_pendente','sem_match','auto_anexado','erro'));

CREATE INDEX IF NOT EXISTS idx_compras_itens_nf_busca_status
  ON public.compras_itens (nf_busca_status)
  WHERE status = 'aguardando_nf';

COMMENT ON COLUMN public.compras_itens.fornecedor_cnpj IS 'CNPJ do fornecedor, quando conhecido (opcional). Habilita auto-anexo de NF via agente Espião NF-e Cloud.';
COMMENT ON COLUMN public.compras_itens.nf_busca_status IS 'Estado da busca automática de NF: nunca_buscado, buscando, sugestao_pendente, sem_match, auto_anexado, erro.';
COMMENT ON COLUMN public.compras_itens.nf_sugestao IS 'Candidato de NF encontrado pelo agente: {chaveAcesso, cnpjEmitente, nomeEmitente, valorTotal, dataEmissao, xmlUrl, pdfUrl, score, criterios[], geradaEm}.';
COMMENT ON COLUMN public.compras_itens.nf_sugestoes_rejeitadas IS 'Chaves de acesso já rejeitadas manualmente para este item, para não sugerir de novo.';

-- RPC que replica os efeitos de banco de finalizarCompra() (adm-compras.js) ao
-- aceitar uma sugestão de NF, ou reverte a sugestão para nova tentativa ao rejeitar.
CREATE OR REPLACE FUNCTION public.confirmar_nf_sugerida(
  p_item_id uuid,
  p_aceitar boolean,
  p_usuario text DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.compras_itens%ROWTYPE;
  v_sug jsonb;
  v_codigo text;
  v_epi_id uuid;
BEGIN
  SELECT * INTO v_item FROM public.compras_itens WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compras_itens % não encontrado', p_item_id;
  END IF;

  v_sug := v_item.nf_sugestao;

  IF NOT p_aceitar THEN
    UPDATE public.compras_itens SET
      nf_sugestoes_rejeitadas = CASE
        WHEN v_sug->>'chaveAcesso' IS NOT NULL AND NOT (v_sug->>'chaveAcesso' = ANY(nf_sugestoes_rejeitadas))
          THEN array_append(nf_sugestoes_rejeitadas, v_sug->>'chaveAcesso')
        ELSE nf_sugestoes_rejeitadas
      END,
      nf_sugestao = NULL,
      nf_busca_status = 'buscando',
      updated_at = now()
    WHERE id = p_item_id;
    RETURN jsonb_build_object('ok', true, 'aceito', false, 'motivo', p_motivo);
  END IF;

  IF v_sug IS NULL OR v_sug->>'pdfUrl' IS NULL THEN
    RAISE EXCEPTION 'Item % não possui sugestão de NF pendente', p_item_id;
  END IF;

  v_codigo := v_item.codigo;
  IF v_codigo IS NULL THEN
    SELECT public.gerar_codigo_compra(coalesce(v_item.tipo, 'Outros')) INTO v_codigo;
  END IF;

  UPDATE public.compras_itens SET
    status = 'comprado',
    nf_url = v_sug->>'pdfUrl',
    comprado_em = coalesce(comprado_em, now()),
    codigo = v_codigo,
    nf_busca_status = 'auto_anexado',
    nf_sugestao = v_sug || jsonb_build_object('confirmadaEm', now(), 'confirmadaPor', coalesce(p_usuario, 'sistema')),
    updated_at = now()
  WHERE id = p_item_id;

  IF lower(coalesce(v_item.tipo, '')) LIKE '%epi%' THEN
    SELECT id INTO v_epi_id FROM public.rh_epi_registros WHERE compra_item_id = p_item_id LIMIT 1;
    IF v_epi_id IS NOT NULL THEN
      UPDATE public.rh_epi_registros SET ca = coalesce(v_item.ca, ca) WHERE id = v_epi_id;
    ELSIF v_item.colaborador_id IS NOT NULL OR v_item.colaborador_nome IS NOT NULL THEN
      INSERT INTO public.rh_epi_registros
        (data_entrega, colaborador_id, colaborador_nome, epi, ca, quantidade, compra_item_id, status, created_at)
      VALUES
        (current_date, v_item.colaborador_id, v_item.colaborador_nome, v_item.material, v_item.ca,
         coalesce(v_item.quantidade, v_item.unidade, 1), p_item_id, 'aguardando_pagamento', now());
    END IF;
  END IF;

  IF lower(coalesce(v_item.tipo, '')) LIKE '%patrimonio%' THEN
    INSERT INTO public.compras_patrimonios_cadastro (compra_item_id, material, marca, coordenacao, status)
    SELECT p_item_id, v_item.material, v_item.marca, s.coordenacao, 'aguardando_numero'
    FROM public.compras_solicitacoes s WHERE s.id = v_item.solicitacao_id;
  END IF;

  -- Notificação in-app, equivalente a criarNotificacao() (notificacoes-engine.js),
  -- com o mesmo dedup por chave_dedup.
  IF NOT EXISTS (
    SELECT 1 FROM public.painel_notificacoes
    WHERE chave_dedup = 'compra_realizada:' || p_item_id::text AND arquivada = false
  ) THEN
    INSERT INTO public.painel_notificacoes (
      tipo, titulo, descricao, prioridade, icone,
      destinatario_usuario_id, referencia_tabela, referencia_id, chave_dedup, gerado_por_usuario_id
    )
    SELECT
      'compra_realizada',
      'Compra realizada: ' || v_item.material,
      'Solicitação de ' || coalesce(s.solicitante, 'Gestor') || ' foi concluída. NF disponível.',
      'normal', 'bell',
      coalesce(s.solicitante_id, s.created_by),
      'compras_itens', p_item_id::text,
      'compra_realizada:' || p_item_id::text,
      auth.uid()
    FROM public.compras_solicitacoes s WHERE s.id = v_item.solicitacao_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'aceito', true, 'codigo', v_codigo, 'nf_url', v_sug->>'pdfUrl');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_nf_sugerida(uuid, boolean, text, text) TO authenticated, service_role;
