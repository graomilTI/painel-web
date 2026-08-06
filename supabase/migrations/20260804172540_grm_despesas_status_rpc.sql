-- Expõe, para o Painel de Conferência, apenas o status de sincronização com
-- o GRM/Graint por colaborador_id (já conhecido pelo cliente via Programação).
-- Não retorna cpf, hash, regras nem diagnóstico -- mantém a intenção original
-- da migration 20260731153000_grm_liberacao_despesas.sql de não expor esses
-- dados sensíveis no navegador.
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
  select colaborador_id, status_aplicacao, aplicado_em
    from public.grm_despesas_estado_colaborador
   where colaborador_id = any(p_colaborador_ids)
     and colaborador_id is not null;
$$;

revoke all on function public.grm_despesas_status_por_colaborador(text[]) from public;
grant execute on function public.grm_despesas_status_por_colaborador(text[]) to authenticated;
;
