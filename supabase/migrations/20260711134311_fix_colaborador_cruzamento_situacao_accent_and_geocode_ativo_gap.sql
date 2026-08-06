-- Fix 1: refresh_colaborador_cruzamento() excluía "Não Ativo" comparando
-- upper(situacao) com 'NAO ATIVO' (sem acento) -- upper() não remove acento
-- no Postgres, então a comparação nunca batia e ~775 colaboradores inativos
-- vazavam pra dentro de colaborador_cruzamento (usado pelo mapa do gestor).
CREATE OR REPLACE FUNCTION public.refresh_colaborador_cruzamento()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  where upper(unaccent(coalesce(c.situacao, ''))) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
    and coalesce(c.desligamento, '') = '';
end;
$function$;

-- Fix 2: geocode_colaborador_base_pendentes() considerava "já resolvido"
-- qualquer colaborador com UMA linha em operacional_colaborador_base pelo
-- nome, mesmo que essa linha estivesse ativo=false (do import antigo) --
-- nunca era reoferecido pra geocodificar, mesmo a linha inativa nunca sendo
-- usada por refresh_colaborador_cruzamento (que exige ativo=true). Também
-- tinha o mesmo bug de acento do fix 1 (efeito oposto: desperdiçava cota de
-- geocodificação tentando gente "Não Ativo").
CREATE OR REPLACE FUNCTION public.geocode_colaborador_base_pendentes()
 RETURNS TABLE(colaborador_id uuid, cpf text, nome text, nome_chave text, cep text, cidade text, estado text, endereco text, bairro text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ativos as (
    select
      c.id, regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') as cpf_norm,
      c.nome, c.cep, c.cidade, c.estado, c.endereco, c.bairro,
      upper(regexp_replace(translate(coalesce(c.nome, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'), '[^A-Za-z0-9]+', ' ', 'g')) as nc
    from public.colaboradores c
    where upper(translate(coalesce(c.situacao, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
      and coalesce(c.desligamento, '') = ''
      and regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') <> ''
  ),
  sem_base as (
    select a.* from ativos a
    where not exists (
      select 1 from public.operacional_colaborador_base b
      where b.ativo is true and regexp_replace(coalesce(b.cpf,''), '\D', '', 'g') = a.cpf_norm
    )
    and a.nc <> ''
    and not exists (
      select 1 from public.operacional_colaborador_base b2
      where b2.nome_chave = a.nc and b2.ativo is true
    )
  ),
  com_dado_geo as (
    select * from sem_base
    where length(regexp_replace(coalesce(cep,''), '\D', '', 'g')) = 8
       or (coalesce(cidade,'') <> '' and coalesce(estado,'') <> '')
  ),
  dedup as (
    select distinct on (nc) *
    from com_dado_geo
    order by nc
  )
  select id, cpf_norm, nome, nc, cep, cidade, estado, endereco, bairro
  from dedup;
$function$;

-- Fix 3 (dado): reativa linhas antigas (origem = import de 2026-07-01) que já
-- têm coordenada válida mas estão ativo=false, pra colaboradores que hoje
-- estão Ativo e não têm nenhuma outra linha ativo=true pelo mesmo nome --
-- corrige de imediato os 26 presos no buraco do fix 2, sem precisar esperar
-- o próximo ciclo de geocodificação (e sem risco de duplicar nome_chave,
-- que é índice único).
update public.operacional_colaborador_base b
set ativo = true, updated_at = now()
where b.ativo = false
  and b.latitude is not null
  and b.longitude is not null
  and exists (
    select 1 from public.colaboradores c
    where c.situacao = 'Ativo'
      and upper(regexp_replace(translate(coalesce(c.nome,''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ','AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'), '[^A-Za-z0-9]+',' ','g')) = b.nome_chave
  )
  and not exists (
    select 1 from public.operacional_colaborador_base b2
    where b2.nome_chave = b.nome_chave and b2.ativo = true
  );

-- Aplica a correção imediatamente em colaborador_cruzamento (sem esperar o
-- próximo ciclo do cron de 30min).
select public.refresh_colaborador_cruzamento();
;
