-- Diretoria > Produtividade: custos APROVADOS no Caixa Operacional do GRM, por colaborador/dia.
--
-- Fonte: grm_despesas_retroativas_auditoria (uma linha por colaborador/dia/tipo a cada execução do
-- agente sync-despesas-retroativas). Um item conta como aprovado quando a execução real (não
-- dry_run, sucesso) terminou em:
--   NONE    -> já existia aprovada no GRM (valor = soma das "existentes" com status A)
--   APPROVE -> pendência aprovada pelo agente
--   CREATE  -> criada e aprovada pelo agente
-- REPROVE / PERNOITE_BLOQUEADO / SEM_PENDENCIA / SKIP_DUPLICADO não entram. Cada execução repete
-- o item, então fica só o registro mais recente por (cpf, data, tipo).
--
-- A tabela é bloqueada para o front (revoke), então a leitura passa por função SECURITY DEFINER
-- liberada só a quem tem o módulo diretoria_produtividade (master sempre passa).

-- Módulo no cadastro de permissões (idempotente). A liberação para usuários/perfis é feita à parte.
insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo)
select 'diretoria_produtividade', 'Produtividade', 'DIRETORIA', '/diretoria/produtividade', 40, true
where not exists (select 1 from public.app_modulos where codigo = 'diretoria_produtividade');

create or replace function public.produtividade_custos_aprovados(
  p_inicio date,
  p_fim date,
  p_por_dia boolean default true
)
returns table (
  data_referencia date,
  cpf text,
  colaborador text,
  total_aprovado numeric,
  dias integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.painel_has_module(array['diretoria_produtividade']) then
    raise exception 'Sem permissão para acessar Produtividade' using errcode = '42501';
  end if;

  return query
  with ultimo as (
    select distinct on (a.cpf, a.data_referencia, a.tipo_despesa)
      a.data_referencia as dia,
      regexp_replace(a.cpf, '\D', '', 'g') as cpf_norm,
      btrim(a.colaborador) as nome,
      case
        when a.acao = 'NONE' then coalesce(
          nullif((
            select sum((e ->> 'valor')::numeric)
            from jsonb_array_elements(
              case when jsonb_typeof(a.diagnostico -> 'existentes') = 'array'
                   then a.diagnostico -> 'existentes' else '[]'::jsonb end
            ) e
            where upper(e ->> 'status') = 'A'
          ), 0),
          a.valor
        )
        else a.valor
      end as valor_aprovado
    from grm_despesas_retroativas_auditoria a
    where a.data_referencia >= p_inicio
      and a.data_referencia <= p_fim
      and a.sucesso
      and not a.dry_run
      and a.acao in ('NONE', 'APPROVE', 'CREATE')
    order by a.cpf, a.data_referencia, a.tipo_despesa, a.created_at desc
  )
  select
    case when p_por_dia then u.dia end,
    u.cpf_norm,
    max(u.nome),
    sum(u.valor_aprovado),
    count(distinct u.dia)::integer
  from ultimo u
  group by case when p_por_dia then u.dia end, u.cpf_norm
  order by 1, 2;
end;
$$;

-- Primeira e última data com custos registrados (fora dela o relatório não tem como saber o custo de Caixa).
create or replace function public.produtividade_custos_cobertura()
returns table (inicio date, fim date)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.painel_has_module(array['diretoria_produtividade']) then
    raise exception 'Sem permissão para acessar Produtividade' using errcode = '42501';
  end if;

  return query
  select min(a.data_referencia), max(a.data_referencia)
  from grm_despesas_retroativas_auditoria a
  where a.sucesso and not a.dry_run and a.acao in ('NONE', 'APPROVE', 'CREATE');
end;
$$;

revoke all on function public.produtividade_custos_aprovados(date, date, boolean) from public, anon;
revoke all on function public.produtividade_custos_cobertura() from public, anon;
grant execute on function public.produtividade_custos_aprovados(date, date, boolean) to authenticated;
grant execute on function public.produtividade_custos_cobertura() to authenticated;
