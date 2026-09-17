-- 1) Amplia o gatilho pra tambem agendar reset-dia quando a programacao e
--    criada/editada PRO PROPRIO DIA (nao so com antecedencia). Sem isso, uma
--    supervisao cuja rota de hoje só é montada na hora (mesmo dia) nunca
--    passa pelo "limpa + redistribui" que forca o Graint a registrar uma
--    mudanca real -- se o resultado calculado bater com o que o Graint ja
--    mostra (herdado do dia anterior), a reconciliacao normal pula o
--    setDistributionData ("ja esta correto") e o dia fica preso no aviso
--    "dados carregados sao do ultimo dia com informacoes validas" (relato do
--    usuario 17/09, screenshot do Graint em GERAL - Administrativo).
create or replace function public.agenda_distribuicao_os_novo_dia()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.supervisao is not null
     and new.data_referencia >= (now() at time zone 'America/Sao_Paulo')::date
  then
    insert into public.programacao_distribuicao_agendada (supervisao, data_referencia, programacao_id)
    values (new.supervisao, new.data_referencia, new.id)
    on conflict (supervisao, data_referencia)
    do update set
      programacao_id = excluded.programacao_id,
      processado = false,
      processado_em = null,
      created_at = now();
  end if;
  return new;
end;
$$;

-- 2) aplicar-distribuicao-os-reset-dia nunca teve linha propria em
--    grm_sync_agent_settings: caia no fallback 'entrada_cadastros_operacao'
--    (lane errada) e sem mutex_group (nada impedia rodar ao mesmo tempo que
--    aplicar-distribuicao-os normal, escrevendo na mesma Distribuicao de OS
--    do Graint em paralelo). Passava despercebido porque só rodava 1x/dia às
--    02h, quando o normal dificilmente estava ativo. Precisa ser corrigido
--    ANTES de aumentar a frequência abaixo, senão a corrida vira realista.
insert into public.grm_sync_agent_settings
  (agent_id, queue_lane, interval_minutes, enabled, target_lane, direction, resource_class, priority, max_runtime_minutes, mutex_group)
values
  ('aplicar-distribuicao-os-reset-dia', 'saida_logistica', 0, true, 'saida_logistica', 'saida', 'medium', 90, 5, 'distribuicao_os_grm')
on conflict (agent_id) do update set
  queue_lane = excluded.queue_lane,
  target_lane = excluded.target_lane,
  direction = excluded.direction,
  resource_class = excluded.resource_class,
  priority = excluded.priority,
  max_runtime_minutes = excluded.max_runtime_minutes,
  mutex_group = excluded.mutex_group,
  updated_at = now();

-- 3) Processa as pendencias de reset-dia a cada 2min em vez de só 1x/dia às
--    02h -- uma pendencia criada às 9h (programacao do mesmo dia, item 1)
--    não pode esperar até o cron do dia seguinte. Mesmo guard idempotente de
--    antes (só enfileira se não houver job pendente/rodando desse agente).
--    Renomeado de -agendada-02h pra -2min (nome reflete o intervalo real),
--    mesma convenção de aplicar-distribuicao-os-2min (ver migration anterior
--    20260917130000).
select cron.unschedule('aplicar-distribuicao-os-agendada-02h');

select cron.schedule('aplicar-distribuicao-os-reset-dia-2min', '*/2 * * * *', '
    insert into public.grm_sync_jobs (agente_id, status)
    select ''aplicar-distribuicao-os-reset-dia'', ''pendente''
    where exists (
      select 1
      from public.programacao_distribuicao_agendada pda
      where pda.processado = false
    )
    and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = ''aplicar-distribuicao-os-reset-dia'' and status in (''pendente'', ''rodando'')
    );
  ');
