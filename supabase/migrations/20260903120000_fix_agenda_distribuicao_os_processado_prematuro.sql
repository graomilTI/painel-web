-- Bug real (03/09): a fila em programacao_distribuicao_agendada era marcada
-- processado=true pelo próprio cron das 02h, no exato momento em que o job
-- 'aplicar-distribuicao-os' era enfileirado — sem esperar ele rodar, e sem
-- nenhuma confirmação de que aquela supervisão+data específica foi de fato
-- reconciliada no Graint. Se já houvesse outro job pendente/rodando (de
-- qualquer motivo — idle da tela Distribuir O.S., outra supervisão, etc.), a
-- pendência era dada como resolvida mesmo sem gerar nenhum job novo.
--
-- Caso real: MATO GROSSO MT3 - Confresa, 03/09, marcada processado=true pelo
-- cron, mas a distribuição daquele dia nunca chegou a ser aplicada no Graint.
--
-- Fix: o cron passa a SÓ enfileirar o job. Quem marca processado=true agora é
-- o próprio agente (grmserver-aplicar-distribuicao-os-api.js), e só depois de
-- reconciliar de fato aquela supervisão+data específica com o Graint (ver
-- marcarAgendamentoReconciliado() no script).

select cron.unschedule('aplicar-distribuicao-os-agendada-02h')
where exists (select 1 from cron.job where jobname = 'aplicar-distribuicao-os-agendada-02h');

select cron.schedule(
  'aplicar-distribuicao-os-agendada-02h',
  '0 5 * * *',
  $cron$
    insert into public.grm_sync_jobs (agente_id, status)
    select 'aplicar-distribuicao-os', 'pendente'
    where exists (
      select 1
      from public.programacao_distribuicao_agendada pda
      join public.supervisoes s on s.nome = pda.supervisao
      where pda.processado = false
        and s.distribuicao_os_automatica = true
    )
    and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = 'aplicar-distribuicao-os' and status in ('pendente', 'rodando')
    );
  $cron$
);

comment on table public.programacao_distribuicao_agendada is
  'Fila de pedidos de distribuição automática de O.S. gerados quando a Programação de um dia posterior é criada ou duplicada. O cron aplicar-distribuicao-os-agendada-02h só enfileira o job; quem marca processado=true é o próprio agente (grmserver-aplicar-distribuicao-os-api.js), depois de reconciliar de fato aquela supervisão+data no Graint.';
