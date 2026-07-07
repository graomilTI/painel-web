-- Consolida em SQL o parsing "UF - Cidade (Local)" e o score de matching contra
-- operacional_pontos_embarque, que hoje estão duplicados e divergentes em 5 lugares
-- (assets/js/os.js, assets/js/operacional.js, geocode-operacional-os/index.ts,
-- 20260625100000_programacao_equipe_embarque.sql sem unaccent, e o SQL corrompido
-- em agentes-grm-sync/sql/sincronizar_operacional_os_da_lista_grm.sql).
-- A partir daqui, operacional_os.ponto_embarque_id/ponto1_* são mantidos
-- automaticamente por trigger; os consumidores (JS, Edge Function) só leem.

create extension if not exists unaccent;

create or replace function public.normalizar_embarque_texto(txt text)
returns text
language sql
stable
as $$
  select unaccent(upper(coalesce(txt, '')));
$$;

create or replace function public.parse_embarque(txt text)
returns table(uf text, cidade text, local text)
language plpgsql
stable
as $$
declare
  m text[];
begin
  m := regexp_match(coalesce(txt, ''), '^([A-Za-z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$');
  if m is null then
    return query select null::text, null::text, null::text;
  else
    return query select upper(m[1]), trim(m[2]), trim(coalesce(m[3], ''));
  end if;
end;
$$;

create or replace function public.match_ponto_embarque(p_embarque text, p_cliente text, p_supervisao text)
returns uuid
language plpgsql
stable
as $$
declare
  v_uf text;
  v_cidade text;
  v_local text;
  v_cliente text := normalizar_embarque_texto(p_cliente);
  v_supervisao text := normalizar_embarque_texto(p_supervisao);
  v_ponto_id uuid;
begin
  select uf, cidade, local into v_uf, v_cidade, v_local from public.parse_embarque(p_embarque);
  if v_uf is null and v_cidade is null then
    return null;
  end if;
  v_uf := normalizar_embarque_texto(v_uf);
  v_cidade := normalizar_embarque_texto(v_cidade);
  v_local := normalizar_embarque_texto(v_local);

  select p.id into v_ponto_id
  from public.operacional_pontos_embarque p
  cross join lateral (
    select
      (case when v_uf <> '' and normalizar_embarque_texto(p.uf) = v_uf then 50 else 0 end)
      + (case when v_cidade <> '' and (normalizar_embarque_texto(p.cidade) like '%' || v_cidade || '%' or v_cidade like '%' || normalizar_embarque_texto(p.cidade) || '%') then 80 else 0 end)
      + (case when v_local <> '' and (normalizar_embarque_texto(p.nome_local) like '%' || v_local || '%' or v_local like '%' || normalizar_embarque_texto(p.nome_local) || '%') then 120 else 0 end)
      + (case when v_cliente <> '' and (normalizar_embarque_texto(p.nome_local) like '%' || v_cliente || '%' or v_cliente like '%' || normalizar_embarque_texto(p.nome_local) || '%') then 30 else 0 end)
      + (case when v_supervisao <> '' and p.supervisao is not null and (normalizar_embarque_texto(p.supervisao) like '%' || v_supervisao || '%' or v_supervisao like '%' || normalizar_embarque_texto(p.supervisao) || '%') then 15 else 0 end)
      as score
  ) s
  where p.ativo is true and p.latitude is not null and p.longitude is not null and s.score >= 120
  order by s.score desc
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
  if new.embarque is null then
    new.ponto_embarque_id := null;
    return new;
  end if;

  select p.id, p.nome_local, p.cidade, p.uf, p.latitude, p.longitude
  into v_ponto
  from public.operacional_pontos_embarque p
  where p.id = public.match_ponto_embarque(new.embarque, new.cliente, new.supervisao);

  if v_ponto.id is null then
    new.ponto_embarque_id := null;
    return new;
  end if;

  new.ponto_embarque_id := v_ponto.id;
  new.ponto1_latitude := v_ponto.latitude;
  new.ponto1_longitude := v_ponto.longitude;
  new.ponto1_nome := v_ponto.nome_local || ' · ' || coalesce(v_ponto.cidade, '') || '/' || coalesce(v_ponto.uf, '');
  return new;
end;
$$;

drop trigger if exists trg_operacional_os_resolver_ponto on public.operacional_os;
create trigger trg_operacional_os_resolver_ponto
  before insert or update of embarque, cliente, supervisao on public.operacional_os
  for each row execute function public.trg_operacional_os_resolver_ponto();

-- Força o trigger a rodar pra todas as OS existentes (corrige tanto as nunca
-- resolvidas quanto as que o backfill antigo (sem unaccent) errou por acento).
update public.operacional_os set embarque = embarque where embarque is not null;
