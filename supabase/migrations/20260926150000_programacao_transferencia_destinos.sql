-- Transferências: o gestor pode mandar o colaborador para QUALQUER supervisão
-- ativa (quem decide é o gestor de destino, no aceite). Na tela da Programação
-- supabase.from('supervisoes') é interceptado e devolve só as supervisões
-- liberadas do usuário (programacao_listar_supervisoes) — por isso o destino
-- tem uma RPC própria com a lista completa.
create or replace function public.programacao_transferencia_destinos()
returns table(nome text)
language sql
stable
security definer
set search_path = public
as $$
  select s.nome
  from public.supervisoes s
  where s.ativo = true
    and coalesce(btrim(s.nome), '') <> ''
  order by s.nome;
$$;

revoke all on function public.programacao_transferencia_destinos() from public, anon;
grant execute on function public.programacao_transferencia_destinos() to authenticated;
