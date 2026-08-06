-- Conferência · Localização: histórico diário (1 registro/colaborador/OS por
-- dia) comparando a casa do colaborador (operacional_colaborador_base via
-- colaborador_cruzamento) com o ponto de embarque geograficamente mais
-- próximo (operacional_pontos_embarque), independente do ponto oficialmente
-- resolvido pra OS (operacional_os.ponto1_*). A diferença entre os dois é
-- o que a tela "Localização" existe pra evidenciar.
--
-- Fórmula de distância (haversine) replicada de
-- programacao_etapa_b_candidatos (20260701141136_programacao_prioriza_embarque_proximo.sql).

create table if not exists public.conferencia_localizacao_colaboradores (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  colaborador_key text not null,
  nome_colaborador text,
  os_id uuid references public.operacional_os(id) on delete cascade,
  numero_os text,
  cliente text,
  supervisao text,
  coordenacao text,
  colaborador_latitude numeric,
  colaborador_longitude numeric,
  os_ponto_nome text,
  os_latitude numeric,
  os_longitude numeric,
  ponto_embarque_id uuid references public.operacional_pontos_embarque(id) on delete set null,
  ponto_embarque_nome text,
  ponto_embarque_latitude numeric,
  ponto_embarque_longitude numeric,
  distancia_km numeric,
  atualizado_em timestamptz not null default now(),
  unique (data_referencia, colaborador_key, os_id)
);
create index if not exists idx_conferencia_localizacao_data on public.conferencia_localizacao_colaboradores (data_referencia);
create index if not exists idx_conferencia_localizacao_colaborador on public.conferencia_localizacao_colaboradores (colaborador_key);
create index if not exists idx_conferencia_localizacao_os on public.conferencia_localizacao_colaboradores (os_id);
alter table public.conferencia_localizacao_colaboradores enable row level security;
drop policy if exists conferencia_localizacao_select_auth on public.conferencia_localizacao_colaboradores;
create policy conferencia_localizacao_select_auth on public.conferencia_localizacao_colaboradores
  for select to authenticated using (true);
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
    distancia_km = excluded.distancia_km,
    atualizado_em = now();
end;
$$;
revoke execute on function public.registrar_localizacao_diaria_colaboradores(date) from public, anon;
grant execute on function public.registrar_localizacao_diaria_colaboradores(date) to authenticated;
select cron.unschedule('registrar-localizacao-diaria-colaboradores') where exists (select 1 from cron.job where jobname = 'registrar-localizacao-diaria-colaboradores');
-- 20h Brasília (23h UTC, mesmo dia — evita virar a data em current_date, que
-- é calculado no fuso do banco/UTC) — roda perto do fim do dia, quando a
-- equipe da OS já deve estar confirmada em operacional_os_colaboradores.
select cron.schedule(
  'registrar-localizacao-diaria-colaboradores',
  '0 23 * * *',
  $$select public.registrar_localizacao_diaria_colaboradores(current_date)$$
);
-- Backfill imediato do dia corrente, pra tela não nascer vazia.
select public.registrar_localizacao_diaria_colaboradores(current_date);
