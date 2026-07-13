-- Funções de apoio para conciliar a base de hotéis sem apagar dados já válidos.
begin;

create or replace function public.hospedagem_normalizar_texto(valor text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
    translate(
      lower(coalesce(valor, '')),
      'áàãâäéèêëíìîïóòõôöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create or replace function public.hospedagem_normalizar_telefone(valor text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(coalesce(valor, ''), '[^0-9]+', '', 'g');
$$;

create or replace function public.hospedagem_conciliar_hotel(
  p_nome text,
  p_cidade text,
  p_uf text,
  p_link_maps text,
  p_whatsapp text,
  p_endereco text,
  p_valor_padrao numeric,
  p_valor_individual numeric,
  p_valor_duplo numeric,
  p_valor_triplo numeric,
  p_valor_quadruplo numeric,
  p_prioridade text,
  p_observacoes text
)
returns text
language plpgsql
as $$
declare
  v_id text;
begin
  select h.id::text
    into v_id
  from public.hospedagem_hoteis h
  where
    (
      nullif(trim(p_link_maps), '') is not null
      and lower(trim(coalesce(h.link_maps, ''))) = lower(trim(p_link_maps))
    )
    or
    (
      upper(trim(coalesce(h.uf, ''))) = upper(trim(p_uf))
      and public.hospedagem_normalizar_texto(h.cidade)
        = public.hospedagem_normalizar_texto(p_cidade)
      and public.hospedagem_normalizar_texto(
        regexp_replace(coalesce(h.nome, ''), '\s*\([^)]*\)\s*', ' ', 'g')
      ) = public.hospedagem_normalizar_texto(p_nome)
    )
    or
    (
      nullif(public.hospedagem_normalizar_telefone(p_whatsapp), '') is not null
      and public.hospedagem_normalizar_telefone(h.whatsapp)
        = public.hospedagem_normalizar_telefone(p_whatsapp)
      and upper(trim(coalesce(h.uf, ''))) = upper(trim(p_uf))
      and public.hospedagem_normalizar_texto(h.cidade)
        = public.hospedagem_normalizar_texto(p_cidade)
    )
  order by
    case
      when nullif(trim(p_link_maps), '') is not null
       and lower(trim(coalesce(h.link_maps, ''))) = lower(trim(p_link_maps))
      then 0
      when nullif(public.hospedagem_normalizar_telefone(p_whatsapp), '') is not null
       and public.hospedagem_normalizar_telefone(h.whatsapp)
         = public.hospedagem_normalizar_telefone(p_whatsapp)
      then 1
      else 2
    end,
    h.id::text
  limit 1;

  if v_id is null then
    insert into public.hospedagem_hoteis (
      nome, cidade, uf, link_maps, whatsapp, endereco,
      valor_diaria_padrao, valor_diaria_individual, valor_diaria_duplo,
      valor_diaria_triplo, valor_diaria_quadruplo,
      status, prioridade, observacoes
    )
    values (
      p_nome, p_cidade, upper(p_uf), nullif(trim(p_link_maps), ''),
      nullif(trim(p_whatsapp), ''), nullif(trim(p_endereco), ''),
      p_valor_padrao, p_valor_individual, p_valor_duplo,
      p_valor_triplo, p_valor_quadruplo,
      'ATIVO', coalesce(nullif(trim(p_prioridade), ''), 'NORMAL'),
      nullif(trim(p_observacoes), '')
    )
    returning id::text into v_id;
  else
    update public.hospedagem_hoteis h
    set
      link_maps = case
        when nullif(trim(coalesce(h.link_maps, '')), '') is null
        then nullif(trim(p_link_maps), '') else h.link_maps end,
      whatsapp = case
        when nullif(trim(coalesce(h.whatsapp, '')), '') is null
        then nullif(trim(p_whatsapp), '') else h.whatsapp end,
      endereco = case
        when nullif(trim(coalesce(h.endereco, '')), '') is null
        then nullif(trim(p_endereco), '') else h.endereco end,
      valor_diaria_padrao = case
        when coalesce(h.valor_diaria_padrao, 0) <= 0 then p_valor_padrao
        else h.valor_diaria_padrao end,
      valor_diaria_individual = case
        when coalesce(h.valor_diaria_individual, 0) <= 0 then p_valor_individual
        else h.valor_diaria_individual end,
      valor_diaria_duplo = case
        when coalesce(h.valor_diaria_duplo, 0) <= 0 then p_valor_duplo
        else h.valor_diaria_duplo end,
      valor_diaria_triplo = case
        when coalesce(h.valor_diaria_triplo, 0) <= 0 then p_valor_triplo
        else h.valor_diaria_triplo end,
      valor_diaria_quadruplo = case
        when coalesce(h.valor_diaria_quadruplo, 0) <= 0 then p_valor_quadruplo
        else h.valor_diaria_quadruplo end,
      status = coalesce(nullif(trim(h.status), ''), 'ATIVO'),
      prioridade = case
        when upper(coalesce(p_prioridade, '')) = 'EVITAR' then 'EVITAR'
        else coalesce(nullif(trim(h.prioridade), ''), 'NORMAL') end,
      observacoes = case
        when nullif(trim(coalesce(p_observacoes, '')), '') is null then h.observacoes
        when nullif(trim(coalesce(h.observacoes, '')), '') is null then p_observacoes
        when position('Fonte: bc hoteis.xlsx' in h.observacoes) > 0 then h.observacoes
        else h.observacoes || E'\n' || p_observacoes end
    where h.id::text = v_id;
  end if;

  return v_id;
end;
$$;

commit;
