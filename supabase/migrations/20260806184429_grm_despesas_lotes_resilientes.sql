-- Lotes curtos e justos: uma falha não pode ser reclamada novamente dentro
-- da mesma execução e, portanto, não bloqueia os demais colaboradores.
drop function if exists public.claim_next_grm_despesa_fila();

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
   where (
      status = 'PENDENTE'
      or (status = 'ERRO' and tentativas < max_tentativas)
   )
     and not (id = any(coalesce(p_excluir_ids, '{}'::uuid[])))
   order by created_at asc
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

-- Novas filas recebem mais margem para falhas transitórias. Itens de hoje que
-- esgotaram as três tentativas antigas ganham duas tentativas adicionais.
alter table public.grm_despesas_fila
  alter column max_tentativas set default 5;

update public.grm_despesas_fila
   set max_tentativas = greatest(max_tentativas, 5),
       finalizado_em = null
 where status = 'ERRO'
   and data_referencia = (now() at time zone 'America/Sao_Paulo')::date;

-- Garante que a recuperação dos erros antigos comece sem depender de uma
-- nova edição na Programação do Gestor.
insert into public.grm_sync_jobs (agente_id, status)
select 'sync-liberacao-despesas', 'pendente'
where exists (
  select 1
  from public.grm_despesas_fila
  where data_referencia = (now() at time zone 'America/Sao_Paulo')::date
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
