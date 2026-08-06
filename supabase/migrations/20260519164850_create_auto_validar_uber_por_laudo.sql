CREATE OR REPLACE FUNCTION auto_validar_uber_por_laudo(p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_atualizados integer;
BEGIN
  UPDATE conferencia_uber_corridas u
  SET
    status_validacao   = 'VALIDADA',
    classificacao_manual = 'VALIDADA',
    motivo_validacao   = 'Validação automática: laudo de produção encontrado para a data.',
    validado_em        = now(),
    updated_at         = now()
  WHERE
    (p_inicio IS NULL OR u.data_solicitacao_local >= p_inicio)
    AND (p_fim IS NULL OR u.data_solicitacao_local <= p_fim)
    AND u.status_validacao IN ('PENDENTE', 'ATENCAO')
    AND u.classificacao_manual IS NULL
    AND (u.nome_colaborador IS NOT NULL OR u.nome IS NOT NULL)
    AND EXISTS (
      SELECT 1 FROM relatorio_resultado_diario r
      WHERE r.data = u.data_solicitacao_local
        AND (
          lower(r.funcionario) LIKE '%' || lower(COALESCE(u.nome_colaborador, u.nome, '')) || '%'
          OR lower(COALESCE(u.nome_colaborador, u.nome, '')) LIKE '%' || lower(r.funcionario) || '%'
        )
    );

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'validados', v_atualizados);
END;
$$;

GRANT EXECUTE ON FUNCTION auto_validar_uber_por_laudo(date, date) TO authenticated, service_role;;
