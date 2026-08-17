alter table public.mapa_embarque_alertas_atualizacao
  add column if not exists cliente text,
  add column if not exists agendado_para timestamptz;

alter table public.mapa_embarque_alertas_atualizacao
  drop constraint if exists mapa_embarque_alertas_atualizacao_status_check;
alter table public.mapa_embarque_alertas_atualizacao
  add constraint mapa_embarque_alertas_atualizacao_status_check
  check (status in ('pendente','agendado','alertado','respondido','encerrado','sem_contato','erro'));

create index if not exists idx_mapa_embarque_alertas_fila
  on public.mapa_embarque_alertas_atualizacao (agendado_para, created_at)
  where status = 'agendado';

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'mapa-embarque-alertas-despachar-1min';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule(
  'mapa-embarque-alertas-despachar-1min',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/mapa-embarque-alertas',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{"action":"dispatch"}'::jsonb
    );
  $cron$
);
