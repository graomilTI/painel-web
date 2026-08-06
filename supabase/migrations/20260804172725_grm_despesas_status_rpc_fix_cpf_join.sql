create or replace function public.grm_despesas_status_por_colaborador(p_colaborador_ids text[])
returns table (
  colaborador_id text,
  status_aplicacao text,
  aplicado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select cpf as colaborador_id, status_aplicacao, aplicado_em
    from public.grm_despesas_estado_colaborador
   where cpf = any(p_colaborador_ids);
$$;

revoke all on function public.grm_despesas_status_por_colaborador(text[]) from public;
grant execute on function public.grm_despesas_status_por_colaborador(text[]) to authenticated;
;
