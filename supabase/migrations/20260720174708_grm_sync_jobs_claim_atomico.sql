-- Serializa TODOS os agentes grm-sync numa fila única, mesmo enfileirados por
-- fontes diferentes (auto-scheduler, cron de sync-colaboradores, cron de
-- sync-login-alimentacao). claim_next_grm_sync_job() usa pg_advisory_xact_lock
-- pra garantir que só um processo por vez decide "posso rodar?" e libera jobs
-- travados em 'rodando' há mais de 20min antes de checar a fila.

create or replace function public.claim_next_grm_sync_job()
returns public.grm_sync_jobs
language plpgsql
as $$
declare
  v_job public.grm_sync_jobs;
begin
  perform pg_advisory_xact_lock(872634501);

  update public.grm_sync_jobs
  set status = 'erro',
      finalizado_em = now(),
      erro = 'Job travado em rodando por mais de 20min sem atualizar status — finalizado automaticamente pelo claim atômico.'
  where status = 'rodando'
    and iniciado_em < now() - interval '20 minutes';

  if exists (select 1 from public.grm_sync_jobs where status = 'rodando') then
    return null;
  end if;

  select *
  into v_job
  from public.grm_sync_jobs
  where status = 'pendente'
  order by created_at asc
  limit 1;

  if v_job.id is null then
    return null;
  end if;

  update public.grm_sync_jobs
  set status = 'rodando',
      iniciado_em = now(),
      erro = null
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;
;
