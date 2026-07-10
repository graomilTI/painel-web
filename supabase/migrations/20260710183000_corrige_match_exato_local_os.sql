-- Faz o vínculo da O.S. com "Locais de Serviço" pela mesma regra usada na
-- conferência da planilha: UF + cidade + nome completo do local, ignorando
-- acentos, espaços e pontuação. O matching por trecho fica apenas como fallback.
--
-- Corrige também dois problemas do fluxo anterior:
--   1. nomes com parênteses internos não eram interpretados;
--   2. um cadastro curto (ex.: "FAZENDA CAMPO NOVO") podia ganhar de um cadastro
--      completo (ex.: "FAZENDA CAMPO NOVO - PEDRO L DINIZ") por empate de score.

create or replace function public.normalizar_chave_local(txt text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    upper(
      translate(
        coalesce(txt, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      )
    ),
    '[^A-Z0-9]+',
    '',
    'g'
  );
$$;

-- Aceita:
--   UF - Cidade (Local)
--   UF - Cidade (Local com (complemento))
--   UF - Cidade - Local
create or replace function public.parse_embarque(txt text)
returns table(uf text, cidade text, local text)
language plpgsql
stable
as $$
declare
  v_raw text := btrim(coalesce(txt, ''));
  v_prefixo text[];
  v_partes text[];
  v_restante text;
  v_abre_parenteses integer;
begin
  v_prefixo := regexp_match(v_raw, '^([A-Za-z]{2})\s*-\s*(.*)$');

  if v_prefixo is null then
    return query select null::text, null::text, null::text;
    return;
  end if;

  v_restante := btrim(v_prefixo[2]);
  v_abre_parenteses := strpos(v_restante, '(');

  -- Usa o primeiro "(" e o último ")", preservando parênteses existentes
  -- dentro do nome do local.
  if v_abre_parenteses > 0 and right(v_restante, 1) = ')' then
    return query
      select
        upper(v_prefixo[1]),
        btrim(substring(v_restante from 1 for v_abre_parenteses - 1)),
        btrim(substring(
          v_restante
          from v_abre_parenteses + 1
          for char_length(v_restante) - v_abre_parenteses - 1
        ));
    return;
  end if;

  -- Compatibilidade com fontes que enviam "UF - Cidade - Local".
  v_partes := regexp_match(v_restante, '^(.*?)\s+-\s+(.+)$');
  if v_partes is not null then
    return query
      select upper(v_prefixo[1]), btrim(v_partes[1]), btrim(v_partes[2]);
    return;
  end if;

  return query select upper(v_prefixo[1]), v_restante, ''::text;
end;
$$;

create index if not exists idx_pontos_embarque_match_exato
  on public.operacional_pontos_embarque (
    public.normalizar_chave_local(uf),
    public.normalizar_chave_local(cidade),
    public.normalizar_chave_local(nome_local)
  )
  where ativo is true and latitude is not null and longitude is not null;

create index if not exists idx_pontos_embarque_match_cidade_local
  on public.operacional_pontos_embarque (
    public.normalizar_chave_local(cidade),
    public.normalizar_chave_local(nome_local)
  )
  where ativo is true and latitude is not null and longitude is not null;

create or replace function public.match_ponto_embarque(
  p_embarque text,
  p_cliente text,
  p_supervisao text
)
returns uuid
language plpgsql
stable
as $$
declare
  v_uf text;
  v_cidade text;
  v_local text;
  v_uf_key text;
  v_cidade_key text;
  v_local_key text;
  v_cliente_key text := public.normalizar_chave_local(p_cliente);
  v_supervisao_key text := public.normalizar_chave_local(p_supervisao);
  v_ponto_id uuid;
  v_quantidade integer;
begin
  select parsed.uf, parsed.cidade, parsed.local
    into v_uf, v_cidade, v_local
  from public.parse_embarque(p_embarque) parsed;

  if v_uf is null and v_cidade is null then
    return null;
  end if;

  v_uf_key := public.normalizar_chave_local(v_uf);
  v_cidade_key := public.normalizar_chave_local(v_cidade);
  v_local_key := public.normalizar_chave_local(v_local);

  -- 1) Regra principal: UF + cidade + nome COMPLETO do local.
  -- Esta é a associação usada para preencher latitude e longitude da planilha.
  if v_uf_key <> '' and v_cidade_key <> '' and v_local_key <> '' then
    select p.id
      into v_ponto_id
    from public.operacional_pontos_embarque p
    where p.ativo is true
      and p.latitude is not null
      and p.longitude is not null
      and public.normalizar_chave_local(p.uf) = v_uf_key
      and public.normalizar_chave_local(p.cidade) = v_cidade_key
      and public.normalizar_chave_local(p.nome_local) = v_local_key
    order by p.updated_at desc nulls last, p.id
    limit 1;

    if found then
      return v_ponto_id;
    end if;
  end if;

  -- 2) Fallback por cidade + local, somente quando o resultado é único.
  if v_cidade_key <> '' and v_local_key <> '' then
    select min(p.id), count(*)
      into v_ponto_id, v_quantidade
    from public.operacional_pontos_embarque p
    where p.ativo is true
      and p.latitude is not null
      and p.longitude is not null
      and public.normalizar_chave_local(p.cidade) = v_cidade_key
      and public.normalizar_chave_local(p.nome_local) = v_local_key;

    if v_quantidade = 1 then
      return v_ponto_id;
    end if;
  end if;

  -- 3) Fallback pelo nome completo do local, também apenas se for único.
  if v_local_key <> '' then
    select min(p.id), count(*)
      into v_ponto_id, v_quantidade
    from public.operacional_pontos_embarque p
    where p.ativo is true
      and p.latitude is not null
      and p.longitude is not null
      and public.normalizar_chave_local(p.nome_local) = v_local_key;

    if v_quantidade = 1 then
      return v_ponto_id;
    end if;
  end if;

  -- 4) Último recurso: comparação aproximada dentro da mesma UF.
  -- O local mais parecido e com menor diferença de tamanho ganha; assim um nome
  -- curto não supera arbitrariamente um cadastro mais completo.
  select p.id
    into v_ponto_id
  from public.operacional_pontos_embarque p
  cross join lateral (
    select
      public.normalizar_chave_local(p.cidade) as cidade_key,
      public.normalizar_chave_local(p.nome_local) as local_key,
      public.normalizar_chave_local(p.supervisao) as supervisao_key
  ) chave
  cross join lateral (
    select
      (case when v_uf_key <> '' and public.normalizar_chave_local(p.uf) = v_uf_key then 50 else 0 end)
      + (case
          when v_cidade_key <> '' and chave.cidade_key = v_cidade_key then 100
          when v_cidade_key <> '' and (
            chave.cidade_key like '%' || v_cidade_key || '%'
            or v_cidade_key like '%' || chave.cidade_key || '%'
          ) then 70
          else 0
        end)
      + (case
          when v_local_key <> '' and chave.local_key = v_local_key then 200
          when v_local_key <> '' and (
            chave.local_key like '%' || v_local_key || '%'
            or v_local_key like '%' || chave.local_key || '%'
          ) then 120
          else 0
        end)
      + (case when v_cliente_key <> '' and (
          chave.local_key like '%' || v_cliente_key || '%'
          or v_cliente_key like '%' || chave.local_key || '%'
        ) then 30 else 0 end)
      + (case when v_supervisao_key <> '' and chave.supervisao_key <> '' and (
          chave.supervisao_key like '%' || v_supervisao_key || '%'
          or v_supervisao_key like '%' || chave.supervisao_key || '%'
        ) then 15 else 0 end)
      as score
  ) pontuacao
  where p.ativo is true
    and p.latitude is not null
    and p.longitude is not null
    and (v_uf_key = '' or upper(btrim(p.uf)) = v_uf_key)
    and pontuacao.score >= 120
  order by
    (chave.cidade_key = v_cidade_key) desc,
    (chave.local_key = v_local_key) desc,
    pontuacao.score desc,
    abs(char_length(chave.local_key) - char_length(v_local_key)) asc,
    char_length(chave.local_key) desc,
    p.updated_at desc nulls last,
    p.id
  limit 1;

  return v_ponto_id;
end;
$$;

create or replace function public.trg_operacional_os_resolver_ponto()
returns trigger
language plpgsql
as $$
declare
  v_ponto record;
begin
  if new.embarque is null or btrim(new.embarque) = '' then
    new.ponto_embarque_id := null;
    new.ponto1_latitude := null;
    new.ponto1_longitude := null;
    new.ponto1_nome := null;
    return new;
  end if;

  select p.id, p.nome_local, p.cidade, p.uf, p.latitude, p.longitude
    into v_ponto
  from public.operacional_pontos_embarque p
  where p.id = public.match_ponto_embarque(new.embarque, new.cliente, new.supervisao);

  if v_ponto.id is null then
    -- Não mantém coordenada antiga quando o texto de embarque mudou e deixou de
    -- corresponder a um local válido.
    new.ponto_embarque_id := null;
    new.ponto1_latitude := null;
    new.ponto1_longitude := null;
    new.ponto1_nome := null;
    return new;
  end if;

  new.ponto_embarque_id := v_ponto.id;
  new.ponto1_latitude := v_ponto.latitude;
  new.ponto1_longitude := v_ponto.longitude;
  new.ponto1_nome := v_ponto.nome_local || ' · ' || coalesce(v_ponto.cidade, '') || '/' || coalesce(v_ponto.uf, '');
  return new;
end;
$$;

-- Reprocessa todas as O.S. atuais para substituir vínculos aproximados incorretos
-- pelos vínculos exatos e preencher os casos com parênteses internos.
update public.operacional_os
set embarque = embarque
where embarque is not null;
