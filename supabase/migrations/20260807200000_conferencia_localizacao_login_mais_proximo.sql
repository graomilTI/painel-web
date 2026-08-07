-- Conferência · Localização: acrescenta o "login mais próximo da O.S. na
-- data" (grm_login_movimentos_importacoes) como 3º ponto de comparação no
-- mapinha "Ver Rota", no lugar do ponto de embarque mais próximo da CASA
-- (pedido do usuário 07/08 — mantém as colunas antigas de ponto_embarque
-- intactas/preenchidas, só deixam de ser o que a tela exibe).
--
-- grm_login_movimentos_importacoes não tem CPF preenchido (confirmado ao
-- vivo) — o match é por NOME normalizado (unaccent+upper+trim), mesmo
-- critério já usado em agentes-grm-sync/grm-sync-lancar-nhe.js
-- (buscarLoginColaborador: normText(colaborador) === normText(funcionario),
-- .eq('data_movimento', ...), menor haversine até a coordenada da O.S.).

alter table public.conferencia_localizacao_colaboradores
  add column if not exists login_latitude double precision,
  add column if not exists login_longitude double precision,
  add column if not exists login_hora time,
  add column if not exists login_distancia_km numeric;

create or replace function public.registrar_localizacao_diaria_colaboradores(p_data date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with cz_best as (
    select distinct on (cpf) cpf, nome, coordenacao, latitude, longitude
    from public.colaborador_cruzamento
    where cpf <> ''
    order by cpf, atualizado_em desc
  )
  insert into public.conferencia_localizacao_colaboradores (
    data_referencia, colaborador_key, nome_colaborador, os_id, numero_os, cliente, supervisao, coordenacao,
    colaborador_latitude, colaborador_longitude,
    os_ponto_nome, os_latitude, os_longitude,
    ponto_embarque_id, ponto_embarque_nome, ponto_embarque_latitude, ponto_embarque_longitude,
    login_latitude, login_longitude, login_hora, login_distancia_km,
    distancia_km, atualizado_em
  )
  select
    p_data,
    ac.colaborador_key,
    coalesce(cz.nome, ac.colaborador_nome),
    os.id,
    os.numero_os,
    os.cliente,
    os.supervisao,
    cz.coordenacao,
    cz.latitude,
    cz.longitude,
    os.ponto1_nome,
    os.ponto1_latitude,
    os.ponto1_longitude,
    nearest.id,
    nearest.embarque_label,
    nearest.latitude,
    nearest.longitude,
    login.latitude,
    login.longitude,
    login.hora_movimento,
    round(login.km::numeric, 1),
    round(nearest.km::numeric, 1),
    now()
  from public.operacional_os_colaboradores ac
  join public.operacional_os os on os.id = ac.os_id and os.data_os = p_data
  join lateral (
    select coalesce(
      nullif(regexp_replace(coalesce(ac.colaborador_cpf, ''), '\D', '', 'g'), ''),
      regexp_replace(coalesce(ac.colaborador_key, ''), '\D', '', 'g')
    ) as cpf_norm
  ) ackey on true
  join cz_best cz on cz.cpf = ackey.cpf_norm and cz.latitude is not null and cz.longitude is not null
  cross join lateral (
    select p.id, p.embarque_label, p.latitude, p.longitude,
      2 * 6371 * asin(sqrt(
        sin(radians(p.latitude - cz.latitude) / 2) ^ 2 +
        cos(radians(cz.latitude)) * cos(radians(p.latitude)) * sin(radians(p.longitude - cz.longitude) / 2) ^ 2
      )) as km
    from public.operacional_pontos_embarque p
    where p.ativo is true and p.latitude is not null and p.longitude is not null
    order by km asc
    limit 1
  ) nearest
  left join lateral (
    select l.latitude, l.longitude, l.hora_movimento,
      2 * 6371 * asin(sqrt(
        sin(radians(l.latitude - os.ponto1_latitude) / 2) ^ 2 +
        cos(radians(os.ponto1_latitude)) * cos(radians(l.latitude)) * sin(radians(l.longitude - os.ponto1_longitude) / 2) ^ 2
      )) as km
    from public.grm_login_movimentos_importacoes l
    where os.ponto1_latitude is not null
      and os.ponto1_longitude is not null
      and l.data_movimento = p_data
      and l.latitude is not null
      and l.longitude is not null
      and unaccent(upper(btrim(coalesce(l.colaborador, '')))) = unaccent(upper(btrim(coalesce(cz.nome, ac.colaborador_nome, ''))))
    order by km asc
    limit 1
  ) login on true
  on conflict (data_referencia, colaborador_key, os_id) do update set
    nome_colaborador = excluded.nome_colaborador,
    numero_os = excluded.numero_os,
    cliente = excluded.cliente,
    supervisao = excluded.supervisao,
    coordenacao = excluded.coordenacao,
    colaborador_latitude = excluded.colaborador_latitude,
    colaborador_longitude = excluded.colaborador_longitude,
    os_ponto_nome = excluded.os_ponto_nome,
    os_latitude = excluded.os_latitude,
    os_longitude = excluded.os_longitude,
    ponto_embarque_id = excluded.ponto_embarque_id,
    ponto_embarque_nome = excluded.ponto_embarque_nome,
    ponto_embarque_latitude = excluded.ponto_embarque_latitude,
    ponto_embarque_longitude = excluded.ponto_embarque_longitude,
    login_latitude = excluded.login_latitude,
    login_longitude = excluded.login_longitude,
    login_hora = excluded.login_hora,
    login_distancia_km = excluded.login_distancia_km,
    distancia_km = excluded.distancia_km,
    atualizado_em = now();
end;
$$;

-- Recalcula os últimos 30 dias já registrados (idempotente via unique
-- constraint) pra tela não ficar com login_* vazio pro histórico recente.
do $$
declare
  d date;
begin
  for d in select generate_series(current_date - interval '30 days', current_date, interval '1 day')::date loop
    perform public.registrar_localizacao_diaria_colaboradores(d);
  end loop;
end;
$$;
