-- Faz o vínculo da O.S. com "Locais de Serviço" pela mesma regra usada na
-- conferência da planilha: UF + cidade + nome completo do local, ignorando
-- acentos, espaços e pontuação.
--
-- O vínculo automático passa a ser conservador: se o local completo não existir,
-- a O.S. permanece sem coordenadas até o cadastro correto ser criado. Isso impede
-- que qualquer fazenda/armazém da mesma cidade seja escolhido por aproximação.
--
-- Corrige também:
--   1. nomes com parênteses internos, que antes não eram interpretados;
--   2. cadastros curtos que ganhavam de um cadastro completo por empate de score;
--   3. coordenadas antigas que permaneciam gravadas depois de o vínculo falhar.

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

-- Aceita os formatos:
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

  -- Usa o primeiro "(" e o último ")", preservando parênteses que façam parte
  -- do nome do local, por exemplo: MOAGEIRA IRATI CEREAIS S/A (MATRIZ).
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

  -- Regra principal: UF + cidade + nome COMPLETO do local.
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

  -- Só usa cidade + local quando a fonte realmente não trouxe UF e existe um
  -- único cadastro possível. Com UF informada, não há aproximação automática.
  if v_uf_key = '' and v_cidade_key <> '' and v_local_key <> '' then
    select
      (array_agg(p.id order by p.updated_at desc nulls last, p.id))[1],
      count(*)
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

  return null;
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

-- Reprocessa as O.S. atuais para substituir vínculos aproximados incorretos pelos
-- vínculos exatos e preencher os casos que possuem parênteses internos.
update public.operacional_os
set embarque = embarque
where embarque is not null;
;
