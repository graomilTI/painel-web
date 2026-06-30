-- Índices defensivos para telas com maior volume de consulta no painel.
-- A migration usa to_regclass para não falhar em ambientes onde alguma tabela ainda não exista.

do $$
begin
  if to_regclass('public.relatorio_resultado_diario') is not null then
    create index if not exists idx_relatorio_resultado_diario_data
      on public.relatorio_resultado_diario (data);

    create index if not exists idx_relatorio_resultado_diario_data_os
      on public.relatorio_resultado_diario (data, os);
  end if;

  if to_regclass('public.grm_sync_jobs') is not null then
    create index if not exists idx_grm_sync_jobs_agente_status_finalizado
      on public.grm_sync_jobs (agente_id, status, finalizado_em desc);
  end if;

  if to_regclass('public.logistica_fob') is not null then
    create index if not exists idx_logistica_fob_status_supervisao_data
      on public.logistica_fob (status, supervisao, data_referencia desc);
  end if;

  if to_regclass('public.colaborador_importacoes') is not null then
    create index if not exists idx_colaborador_importacoes_status_data
      on public.colaborador_importacoes (status, data_referencia desc);
  end if;

  if to_regclass('public.colaborador_snapshot') is not null then
    create index if not exists idx_colaborador_snapshot_data_supervisao_nome
      on public.colaborador_snapshot (data_referencia, supervisao, nome);
  end if;

  if to_regclass('public.indisponibilidades') is not null then
    create index if not exists idx_indisponibilidades_cpf_periodo
      on public.indisponibilidades (colaborador_cpf, data_inicio, data_fim);
  end if;

  if to_regclass('public.colaborador_cruzamento') is not null then
    create index if not exists idx_colaborador_cruzamento_cpf
      on public.colaborador_cruzamento (cpf);
  end if;

  if to_regclass('public.programacao_dia') is not null then
    create index if not exists idx_programacao_dia_data_supervisao
      on public.programacao_dia (data_referencia, supervisao);
  end if;

  if to_regclass('public.programacao_colaboradores') is not null then
    create index if not exists idx_programacao_colaboradores_programacao_colab
      on public.programacao_colaboradores (programacao_id, colaborador_id);

    create index if not exists idx_programacao_colaboradores_data_supervisao
      on public.programacao_colaboradores (data_referencia, supervisao);
  end if;

  if to_regclass('public.programacao_estadia') is not null then
    create index if not exists idx_programacao_estadia_programacao_colab
      on public.programacao_estadia (programacao_id, colaborador_id);
  end if;

  if to_regclass('public.programacao_alimentacao') is not null then
    create index if not exists idx_programacao_alimentacao_programacao_colab
      on public.programacao_alimentacao (programacao_id, colaborador_id);
  end if;

  if to_regclass('public.programacao_deslocamento') is not null then
    create index if not exists idx_programacao_deslocamento_programacao_colab
      on public.programacao_deslocamento (programacao_id, colaborador_id);
  end if;

  if to_regclass('public.programacao_extras') is not null then
    create index if not exists idx_programacao_extras_programacao_colab_created
      on public.programacao_extras (programacao_id, colaborador_id, created_at);
  end if;
end $$;
