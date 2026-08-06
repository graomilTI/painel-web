-- Acrescenta ao status resumido do GRM a informação estritamente visual de
-- que a última execução precisou alterar as regras. O diagnóstico completo
-- continua privado.
drop function if exists public.grm_despesas_status_por_colaborador(text[]);

create function public.grm_despesas_status_por_colaborador(p_colaborador_ids text[])
returns table (
  colaborador_id text,
  status_aplicacao text,
  aplicado_em timestamptz,
  houve_alteracao boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    estado.cpf as colaborador_id,
    estado.status_aplicacao,
    estado.aplicado_em,
    case
      when fila.status in ('APLICADO', 'LIMPO')
        then (fila.diagnostico ->> 'changed')::boolean
      else null
    end as houve_alteracao
  from public.grm_despesas_estado_colaborador estado
  left join lateral (
    select f.status, f.diagnostico
    from public.grm_despesas_fila f
    where f.cpf = estado.cpf
    order by f.created_at desc
    limit 1
  ) fila on true
  where estado.cpf = any(p_colaborador_ids);
$$;

revoke all on function public.grm_despesas_status_por_colaborador(text[]) from public;
grant execute on function public.grm_despesas_status_por_colaborador(text[]) to authenticated;
