-- Agendamento automático: BFleet + DETRAN via pg_cron
-- pg_cron e pg_net já estão instalados no projeto.
-- Esta migration adiciona os jobs de frota sem conflitar com os existentes.

-- ─── 1. Tabela de log de execuções ───────────────────────────────────────────
create table if not exists public.cron_exec_logs (
  id          uuid        primary key default gen_random_uuid(),
  job_name    text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text        not null default 'running'
                          check (status in ('running','success','error')),
  result      jsonb,
  error_msg   text
);

create index if not exists idx_cron_exec_logs_job     on public.cron_exec_logs (job_name);
create index if not exists idx_cron_exec_logs_started on public.cron_exec_logs (started_at desc);
create index if not exists idx_cron_exec_logs_status  on public.cron_exec_logs (status);

alter table public.cron_exec_logs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cron_exec_logs' and policyname = 'autenticados podem ler logs cron'
  ) then
    create policy "autenticados podem ler logs cron"
      on public.cron_exec_logs for select
      to authenticated using (true);
  end if;
end $$;

-- ─── 2. Função para marcar log como concluído ────────────────────────────────
create or replace function public.cron_log_finish(
  p_log_id  uuid,
  p_status  text,
  p_result  jsonb default null,
  p_error   text  default null
)
returns void language plpgsql security definer as $$
begin
  update public.cron_exec_logs
  set finished_at = now(), status = p_status, result = p_result, error_msg = p_error
  where id = p_log_id;
end;
$$;

grant execute on function public.cron_log_finish to authenticated;

-- ─── 3. Jobs de frota (remove versões anteriores se existirem) ───────────────

select cron.unschedule('sync-bfleet-posicoes')   where exists (select 1 from cron.job where jobname = 'sync-bfleet-posicoes');
select cron.unschedule('sync-detran-multas')      where exists (select 1 from cron.job where jobname = 'sync-detran-multas');
select cron.unschedule('sync-detran-veiculos')    where exists (select 1 from cron.job where jobname = 'sync-detran-veiculos');
select cron.unschedule('cleanup-cron-logs')       where exists (select 1 from cron.job where jobname = 'cleanup-cron-logs');

-- BFleet: posições a cada 2 minutos
select cron.schedule(
  'sync-bfleet-posicoes', '*/2 * * * *',
  $$select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/bfleet-posicoes',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'), 'Content-Type', 'application/json'),
    body    := '{}'
  )$$
);

-- DETRAN multas: a cada 30 minutos
select cron.schedule(
  'sync-detran-multas', '*/30 * * * *',
  $$select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-multas-detran',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'), 'Content-Type', 'application/json'),
    body    := '{"limit":25,"offset":0}'
  )$$
);

-- DETRAN veículos: 1x/dia às 03h Brasília (06h UTC)
select cron.schedule(
  'sync-detran-veiculos', '0 6 * * *',
  $$select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-veiculos-detran',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'), 'Content-Type', 'application/json'),
    body    := '{}'
  )$$
);

-- Limpeza de logs antigos: diário às 05h UTC
select cron.schedule(
  'cleanup-cron-logs', '0 5 * * *',
  $$delete from public.cron_exec_logs where started_at < now() - interval '30 days'$$
);

-- ─── 4. Configurar URL e service_role_key no banco ───────────────────────────
-- Execute manualmente no SQL Editor (não commitar com valores reais):
--
-- alter database postgres set app.supabase_url    = 'https://xyzpnuumdqhegxakkyws.supabase.co';
-- alter database postgres set app.service_role_key = 'SEU_SERVICE_ROLE_KEY';
