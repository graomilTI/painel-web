-- grm-liberacao-despesas-publicar precisava, só para montar o conjunto de CPFs "atuando na janela ativa",
-- baixar TODOS os vínculos confirmados (programacao_equipe) e todos os DISPONIVEL (programacao_colaboradores)
-- dos dias >= hoje, em ~9 chamadas paginadas por publicação (~3,5 mil publicações/dia: uma das maiores fontes de
-- egress do projeto em out/2026). Esta função devolve só os pares distintos (colaborador_id, nome) que a
-- Edge Function realmente usa, em uma chamada.
create or replace function public.grm_despesas_colaboradores_janela_ativa(p_desde date)
returns table (origem text, colaborador_id text, nome_colaborador text)
language sql
stable
security definer
set search_path = public
as $$
  select 'EQUIPE'::text, e.colaborador_id::text, null::text
  from public.programacao_equipe e
  join public.programacao_dia d on d.id = e.programacao_id
  where d.data_referencia >= p_desde
    and e.confirmado is true
  group by e.colaborador_id
  union all
  select 'DISPONIVEL'::text, c.colaborador_id::text, c.nome_colaborador::text
  from public.programacao_colaboradores c
  join public.programacao_dia d on d.id = c.programacao_id
  where d.data_referencia >= p_desde
    and c.disponibilidade = 'DISPONIVEL'
  group by c.colaborador_id, c.nome_colaborador
  order by 1, 2, 3;
$$;

revoke execute on function public.grm_despesas_colaboradores_janela_ativa(date) from public, anon, authenticated;
grant execute on function public.grm_despesas_colaboradores_janela_ativa(date) to service_role;
