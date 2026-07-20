-- Serializa TODOS os agentes grm-sync (colaboradores, login-alimentacao e o
-- round-robin) numa fila única, mesmo eles sendo enfileirados por 3 fontes
-- diferentes (auto-scheduler, pg_cron de sync-colaboradores via Edge Function,
-- pg_cron de sync-login-alimentacao). Antes, só o round-robin evitava rodar em
-- paralelo com outro agente do próprio round-robin — sync-colaboradores e
-- sync-login-alimentacao tinham cron próprio e podiam disputar o mesmo Chrome/
-- Puppeteer no cPanel ao mesmo tempo que outro agente.
--
-- claim_next_grm_sync_job() usa pg_advisory_xact_lock pra garantir que só um
-- processo por vez decide "posso rodar?" — sem a trava, dois workers
-- concorrentes (ex: cron de 1min disparando antes do anterior terminar)
-- poderiam cada um checar "não tem nada rodando" antes de qualquer um commitar
-- e acabar rodando dois jobs ao mesmo tempo mesmo assim.
--
-- Também libera jobs travados em 'rodando' há mais de 20min (mesmo threshold
-- de worker/grm-sync-auto-scheduler.js) ANTES de checar a fila: sem isso, um
-- processo morto sem atualizar status travaria a fila inteira pra sempre,
-- já que agora um único 'rodando' bloqueia todos os agentes, não só os do
-- round-robin.

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
