-- Despesas de uma programação futura podem ser preparadas antes, mas só
-- entram no GRM a partir de 01:00 (America/Sao_Paulo) da data de referência.

drop function if exists public.claim_next_grm_despesa_fila(uuid[]);

create function public.claim_next_grm_despesa_fila(
  p_excluir_ids uuid[] default '{}'::uuid[]
)
returns public.grm_despesas_fila
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.grm_despesas_fila;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform pg_advisory_xact_lock(hashtext('claim_next_grm_despesa_fila'));

  update public.grm_despesas_fila
     set status = 'ERRO',
         ultimo_erro = coalesce(ultimo_erro, 'Processamento anterior excedeu 20 minutos.'),
         locked_at = null
   where status = 'PROCESSANDO'
     and locked_at < now() - interval '20 minutes';

  select *
    into v_row
    from public.grm_despesas_fila
   where data_referencia <= v_hoje
     and (
       status = 'PENDENTE'
       or (status = 'ERRO' and tentativas < max_tentativas)
     )
     and not (id = any(coalesce(p_excluir_ids, '{}'::uuid[])))
   order by data_referencia asc, created_at asc
   for update skip locked
   limit 1;

  if v_row.id is null then
    return null;
  end if;

  update public.grm_despesas_fila
     set status = 'PROCESSANDO',
         tentativas = tentativas + 1,
         locked_at = now(),
         ultimo_erro = null
   where id = v_row.id
   returning * into v_row;

  update public.grm_despesas_estado_colaborador
     set status_aplicacao = 'PROCESSANDO'
   where cpf = v_row.cpf
     and hash_desejado = v_row.hash_desejado;

  return v_row;
end;
$$;

revoke all on function public.claim_next_grm_despesa_fila(uuid[]) from public;
grant execute on function public.claim_next_grm_despesa_fila(uuid[]) to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'grm-liberacao-despesas-01h'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

-- pg_cron usa UTC: 04:00 UTC corresponde a 01:00 em São Paulo.
select cron.schedule(
  'grm-liberacao-despesas-01h',
  '0 4 * * *',
  $cron$
    insert into public.grm_sync_jobs (agente_id, status)
    select 'sync-liberacao-despesas', 'pendente'
    where exists (
      select 1
      from public.grm_despesas_fila
      where data_referencia <= (now() at time zone 'America/Sao_Paulo')::date
        and (
          status = 'PENDENTE'
          or (status = 'ERRO' and tentativas < max_tentativas)
        )
    )
    and not exists (
      select 1
      from public.grm_sync_jobs
      where agente_id = 'sync-liberacao-despesas'
        and status in ('pendente', 'rodando')
    );
  $cron$
);
