alter table public.colaborador_cruzamento add column if not exists salario numeric;

create or replace function public.refresh_colaborador_cruzamento()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.colaborador_cruzamento;

  with veic_norm as (
    select
      v.id,
      v.placa,
      v.updated_at,
      trim(regexp_replace(upper(unaccent(coalesce(
        nullif(trim(v.motorista_atual), ''),
        nullif(trim(v.patrimonio_funcionario), ''),
        nullif(trim(v.bfleet_condutor), ''),
        nullif(trim(v.condutor_patrimonio), '')
      ))), '[^A-Z0-9]+', ' ', 'g')) as nome_chave
    from public.frotas_veiculos v
    where v.status = 'ATIVO'
  ),
  veic_best as (
    select distinct on (nome_chave) nome_chave, id, placa
    from veic_norm
    where nome_chave <> ''
    order by nome_chave, updated_at desc
  ),
  base_norm as (
    select
      regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') as cpf_norm,
      b.latitude,
      b.longitude,
      b.endereco_base
    from public.operacional_colaborador_base b
    where b.ativo is true
      and regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') <> ''
  ),
  base_best as (
    select distinct on (cpf_norm) cpf_norm, latitude, longitude, endereco_base
    from base_norm
    order by cpf_norm
  ),
  aud_agg as (
    select
      a.nome_chave,
      count(*)::int as qtd,
      sum(1 + abs(coalesce(a.score_impacto, 0)))::numeric as peso
    from public.operacional_auditoria_colaborador a
    where a.data_evento >= (current_date - 180)
    group by a.nome_chave
  )
  insert into public.colaborador_cruzamento (
    colaborador_id, cpf, nome, nome_chave, supervisao, coordenacao, tipo_contrato,
    latitude, longitude, endereco_base, veiculo_id, veiculo_placa,
    auditorias_180d_qtd, auditorias_180d_peso, salario, atualizado_em
  )
  select
    c.id,
    regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'),
    c.nome,
    trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g')) as nome_chave,
    c.supervisao,
    c.coordenacao,
    c.tipo,
    bb.latitude,
    bb.longitude,
    bb.endereco_base,
    vb.id,
    vb.placa,
    coalesce(aa.qtd, 0),
    coalesce(aa.peso, 0),
    nullif(trim(c.salario), '')::numeric,
    now()
  from public.colaboradores c
  left join base_best bb on bb.cpf_norm = regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') and bb.cpf_norm <> ''
  left join veic_best vb on vb.nome_chave = trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g')) and vb.nome_chave <> ''
  left join aud_agg aa on aa.nome_chave = trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g'))
  where upper(coalesce(c.situacao, '')) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
    and coalesce(c.desligamento, '') = '';
end;
$$;

select public.refresh_colaborador_cruzamento();
;
