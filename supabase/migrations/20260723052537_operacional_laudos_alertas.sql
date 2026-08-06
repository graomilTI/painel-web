-- Central de Alertas Operacionais · Alerta 1/3: laudo emitido fora do local.
--
-- Registra, por evento de upload de laudo (assets/js/laudoUpload.js), a
-- geolocalização de quem enviou e classifica como "suspeito" quando ela está
-- longe tanto da casa do colaborador (colaborador_cruzamento) quanto do
-- ponto da O.S. (operacional_os.ponto1_*). Não bloqueia o upload — é só
-- sinal para revisão manual na aba "Alertas" do Mapa Operacional.
--
-- Fórmula de distância (haversine) e padrão de RLS replicados de
-- conferencia_localizacao_colaboradores (20260716180000).

create table if not exists public.operacional_laudos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.operacional_os(id) on delete cascade,
  numero_os text,
  cliente text,
  supervisao text,
  coordenacao text,
  colaborador_key text,
  colaborador_nome text,
  arquivos_urls text[] not null default '{}',
  origem text not null default 'desconhecida',
  geo_capturada boolean not null default false,
  geo_latitude numeric,
  geo_longitude numeric,
  geo_precisao_m numeric,
  colaborador_latitude numeric,
  colaborador_longitude numeric,
  os_latitude numeric,
  os_longitude numeric,
  distancia_casa_km numeric,
  distancia_os_km numeric,
  avaliado boolean not null default false,
  suspeito boolean not null default false,
  enviado_por uuid,
  enviado_por_nome text,
  enviado_em timestamptz not null default now(),
  revisado_em timestamptz,
  revisado_por uuid,
  revisado_por_nome text,
  observacao_revisao text
);

create index if not exists idx_operacional_laudos_os on public.operacional_laudos (os_id);
create index if not exists idx_operacional_laudos_suspeito on public.operacional_laudos (suspeito);
create index if not exists idx_operacional_laudos_enviado_em on public.operacional_laudos (enviado_em desc);

alter table public.operacional_laudos enable row level security;

drop policy if exists operacional_laudos_select_auth on public.operacional_laudos;
create policy operacional_laudos_select_auth on public.operacional_laudos
  for select to authenticated using (true);

drop policy if exists operacional_laudos_insert_auth on public.operacional_laudos;
create policy operacional_laudos_insert_auth on public.operacional_laudos
  for insert to authenticated with check (true);

drop policy if exists operacional_laudos_update_auth on public.operacional_laudos;
create policy operacional_laudos_update_auth on public.operacional_laudos
  for update to authenticated using (true) with check (true);

create or replace function public.operacional_laudos_calcular_suspeita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raio_os_km numeric := 1.0;
  v_raio_casa_km numeric := 1.0;
  v_cpf_norm text;
begin
  select os.numero_os, os.cliente, os.supervisao, os.ponto1_latitude, os.ponto1_longitude
    into new.numero_os, new.cliente, new.supervisao, new.os_latitude, new.os_longitude
  from public.operacional_os os
  where os.id = new.os_id;

  select ac.colaborador_key, coalesce(ac.colaborador_nome, ac.colaborador_key),
    coalesce(nullif(regexp_replace(coalesce(ac.colaborador_cpf, ''), '\D', '', 'g'), ''),
              regexp_replace(coalesce(ac.colaborador_key, ''), '\D', '', 'g'))
    into new.colaborador_key, new.colaborador_nome, v_cpf_norm
  from public.operacional_os_colaboradores ac
  where ac.os_id = new.os_id
  order by ac.created_at desc nulls last
  limit 1;

  if v_cpf_norm is not null and v_cpf_norm <> '' then
    select cz.latitude, cz.longitude, cz.coordenacao
      into new.colaborador_latitude, new.colaborador_longitude, new.coordenacao
    from public.colaborador_cruzamento cz
    where cz.cpf = v_cpf_norm
    order by cz.atualizado_em desc
    limit 1;
  end if;

  if new.geo_latitude is not null and new.os_latitude is not null and new.os_longitude is not null then
    new.distancia_os_km := 2 * 6371 * asin(sqrt(
      sin(radians(new.os_latitude - new.geo_latitude) / 2) ^ 2 +
      cos(radians(new.geo_latitude)) * cos(radians(new.os_latitude)) * sin(radians(new.os_longitude - new.geo_longitude) / 2) ^ 2
    ));
  end if;

  if new.geo_latitude is not null and new.colaborador_latitude is not null and new.colaborador_longitude is not null then
    new.distancia_casa_km := 2 * 6371 * asin(sqrt(
      sin(radians(new.colaborador_latitude - new.geo_latitude) / 2) ^ 2 +
      cos(radians(new.geo_latitude)) * cos(radians(new.colaborador_latitude)) * sin(radians(new.colaborador_longitude - new.geo_longitude) / 2) ^ 2
    ));
  end if;

  new.avaliado := new.geo_latitude is not null and (new.os_latitude is not null or new.colaborador_latitude is not null);
  new.suspeito := new.avaliado
    and not (
      (new.distancia_os_km is not null and new.distancia_os_km <= v_raio_os_km)
      or (new.distancia_casa_km is not null and new.distancia_casa_km <= v_raio_casa_km)
    );

  return new;
end;
$$;

drop trigger if exists trg_operacional_laudos_suspeita on public.operacional_laudos;
create trigger trg_operacional_laudos_suspeita
before insert on public.operacional_laudos
for each row execute function public.operacional_laudos_calcular_suspeita();

-- View "seam" para os próximos detectores da Central de Alertas (desvio de
-- rota de frota, alocação de equipe fora do ideal) — hoje só expõe laudos;
-- quando os outros existirem, cada um ganha tabela própria e isto vira UNION ALL.
create or replace view public.central_alertas_operacionais as
select
  'LAUDO_FORA_LOCAL'::text as tipo_alerta,
  id, os_id, numero_os, cliente, supervisao, coordenacao,
  colaborador_key, colaborador_nome,
  suspeito, avaliado, enviado_em, revisado_em, revisado_por, revisado_por_nome
from public.operacional_laudos;
;
