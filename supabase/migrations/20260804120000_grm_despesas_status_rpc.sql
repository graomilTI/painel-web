-- Expõe, para o Painel de Conferência, apenas o status de sincronização com
-- o GRM/Graint por colaborador_id (já conhecido pelo cliente via Programação,
-- onde colaborador_id É o CPF -- ver pegadinha registrada em memória: a
-- Programação usa CPF como colaborador_id, enquanto a coluna colaborador_id
-- de grm_despesas_estado_colaborador guarda o UUID interno do colaborador;
-- a chave real de correspondência é a coluna cpf).
-- Não retorna hash, regras nem diagnóstico -- mantém a intenção original da
-- migration 20260731153000_grm_liberacao_despesas.sql de não expor esses
-- dados sensíveis no navegador; o cpf recebido/devolvido já é o mesmo valor
-- que o cliente já possui como colaborador_id.
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
