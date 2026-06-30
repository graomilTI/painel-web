-- Lista todos os colaboradores ATIVOS de uma supervisão (regional) para o
-- dropdown de troca de colaborador na Programação (Fase 1). Espelha o filtro
-- de atividade da RPC programacao_etapa_b_candidatos, porém SEM ranqueamento
-- por custo, SEM limite de 8 e SEM excluir quem já está escalado — o painel
-- marca os já escalados com ♻ no próprio dropdown.
create or replace function public.programacao_colaboradores_supervisao(p_supervisao text)
returns table(colaborador_id text, nome text, cargo text)
language sql
stable
security definer
set search_path = public
as $$
  with ref as (
    select max(data_referencia) as data_referencia from colaborador_snapshot
  ),
  base as (
    select distinct on (coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome))
      coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_id,
      cs.nome,
      cs.cargo
    from colaborador_snapshot cs, ref
    where cs.data_referencia = ref.data_referencia
      and cs.supervisao = p_supervisao
      and cs.ativo is distinct from false
      and cs.desligamento is null
      and upper(coalesce(cs.situacao, '')) not in ('NAO ATIVO','NAO ATIVA','INATIVO','INATIVA','DESLIGADO','DESLIGADA','DEMITIDO','DEMITIDA')
    order by coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome)
  )
  select colaborador_id, nome, cargo
  from base
  order by nome;
$$;

-- Só usuários logados (o painel é autenticado); SECURITY DEFINER não deve ser
-- chamável sem login (advisor "Public Can Execute SECURITY DEFINER Function").
revoke execute on function public.programacao_colaboradores_supervisao(text) from public;
grant execute on function public.programacao_colaboradores_supervisao(text) to authenticated;
