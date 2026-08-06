-- Alertas automáticos de vencimento do RH (contrato de experiência e ASO):
-- função diária via pg_cron que grava em painel_notificacoes (mesmo canal
-- que o sino do painel já lê — nenhuma mudança de front necessária).
--
-- Regras:
--   * Contrato de experiência (rh_contratos_experiencia, status em
--     em_experiencia/prorrogado): alerta "vencendo" quando faltam <= 10 dias
--     pro fim (fim = data_fim_prorrogacao quando prorrogado, senão
--     data_fim_experiencia) e alerta "vencido" quando o fim já passou.
--   * ASO (rh_exames tipo periodico): a função primeiro marca status='vencido'
--     nos exames com data_vencimento passada (mantém a tela verdadeira),
--     depois alerta "vencendo" (<= 30 dias) e "vencido".
--
-- Dedup por chave_dedup SEM filtrar arquivada: cada prazo gera UM alerta;
-- se o RH arquivar, não renasce no dia seguinte (a tela do módulo continua
-- mostrando a pendência). Destinatário: módulos 'contratos'/'exames'
-- (masters veem tudo, regra do notifIsForMe no front).

create or replace function public.rh_gerar_alertas_vencimento()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_aso_marcados int := 0;
  v_ins int := 0;
  v_total int := 0;
begin
  -- 1) ASO com validade passada vira status 'vencido'
  update rh_exames
     set status = 'vencido', updated_at = now()
   where tipo = 'periodico'
     and data_vencimento is not null
     and data_vencimento < current_date
     and status in ('agendado', 'realizado', 'apto');
  get diagnostics v_aso_marcados = row_count;

  -- 2) Experiência vencendo em até 10 dias
  insert into painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
     referencia_tabela, referencia_id, chave_dedup)
  select 'rh_experiencia_vencendo',
         'Experiência vence em ' || (c.fim - current_date) || ' dia(s)',
         c.colaborador_nome || ' — fim do contrato de experiência em '
           || to_char(c.fim, 'DD/MM/YYYY') || '. Decidir efetivação, prorrogação ou desligamento.',
         'atencao', 'calendar-clock', 'contratos', 'contratos',
         'rh_contratos_experiencia', c.id::text,
         'rh_exp_venc:' || c.id || ':' || c.fim
    from (
      select id, colaborador_nome,
             case when prorrogado and data_fim_prorrogacao is not null
                  then data_fim_prorrogacao else data_fim_experiencia end as fim
        from rh_contratos_experiencia
       where status in ('em_experiencia', 'prorrogado')
    ) c
   where c.fim is not null
     and c.fim >= current_date
     and c.fim <= current_date + 10
     and not exists (select 1 from painel_notificacoes p
                      where p.chave_dedup = 'rh_exp_venc:' || c.id || ':' || c.fim);
  get diagnostics v_ins = row_count; v_total := v_total + v_ins;

  -- 3) Experiência já vencida sem decisão
  insert into painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
     referencia_tabela, referencia_id, chave_dedup)
  select 'rh_experiencia_vencida',
         'Contrato de experiência VENCIDO',
         c.colaborador_nome || ' — contrato de experiência venceu em '
           || to_char(c.fim, 'DD/MM/YYYY') || ' sem decisão registrada.',
         'urgente', 'calendar-clock', 'contratos', 'contratos',
         'rh_contratos_experiencia', c.id::text,
         'rh_exp_vencido:' || c.id || ':' || c.fim
    from (
      select id, colaborador_nome,
             case when prorrogado and data_fim_prorrogacao is not null
                  then data_fim_prorrogacao else data_fim_experiencia end as fim
        from rh_contratos_experiencia
       where status in ('em_experiencia', 'prorrogado')
    ) c
   where c.fim is not null
     and c.fim < current_date
     and not exists (select 1 from painel_notificacoes p
                      where p.chave_dedup = 'rh_exp_vencido:' || c.id || ':' || c.fim);
  get diagnostics v_ins = row_count; v_total := v_total + v_ins;

  -- 4) ASO vencendo em até 30 dias
  insert into painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
     referencia_tabela, referencia_id, chave_dedup)
  select 'rh_aso_vencendo',
         'ASO vence em ' || (e.data_vencimento - current_date) || ' dia(s)',
         e.colaborador_nome || ' — exame periódico vence em '
           || to_char(e.data_vencimento, 'DD/MM/YYYY') || '. Agendar renovação.',
         'atencao', 'calendar-clock', 'exames', 'exames',
         'rh_exames', e.id::text,
         'rh_aso_venc:' || e.id || ':' || e.data_vencimento
    from rh_exames e
   where e.tipo = 'periodico'
     and e.data_vencimento is not null
     and e.data_vencimento >= current_date
     and e.data_vencimento <= current_date + 30
     and e.status in ('agendado', 'realizado', 'apto')
     and not exists (select 1 from painel_notificacoes p
                      where p.chave_dedup = 'rh_aso_venc:' || e.id || ':' || e.data_vencimento);
  get diagnostics v_ins = row_count; v_total := v_total + v_ins;

  -- 5) ASO vencido
  insert into painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
     referencia_tabela, referencia_id, chave_dedup)
  select 'rh_aso_vencido',
         'ASO VENCIDO',
         e.colaborador_nome || ' — exame periódico venceu em '
           || to_char(e.data_vencimento, 'DD/MM/YYYY') || '. Colaborador sem ASO válido.',
         'urgente', 'calendar-clock', 'exames', 'exames',
         'rh_exames', e.id::text,
         'rh_aso_vencido:' || e.id || ':' || e.data_vencimento
    from rh_exames e
   where e.tipo = 'periodico'
     and e.data_vencimento is not null
     and e.status = 'vencido'
     and not exists (select 1 from painel_notificacoes p
                      where p.chave_dedup = 'rh_aso_vencido:' || e.id || ':' || e.data_vencimento);
  get diagnostics v_ins = row_count; v_total := v_total + v_ins;

  return jsonb_build_object('aso_marcados_vencidos', v_aso_marcados, 'notificacoes_criadas', v_total);
end;
$$;

-- Só o cron (postgres) precisa executar — não expor via RPC pública.
revoke execute on function public.rh_gerar_alertas_vencimento() from public, anon, authenticated;

-- Cron diário às 10:00 UTC (07:00 Brasília)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rh-alertas-vencimento-diario') then
    perform cron.unschedule('rh-alertas-vencimento-diario');
  end if;
  perform cron.schedule('rh-alertas-vencimento-diario', '0 10 * * *',
    'select public.rh_gerar_alertas_vencimento()');
end $$;
;
