-- Frotas · Fora do horário: pipeline diário automático + consulta leve + cache da rota.
--
-- Antes: o relatório da BFleet só era buscado às 07:00 (BRT) por um cron "dispare e esqueça"; quando falhava (09/10)
-- ou vinha incompleto (10/10 sem ocorrências) a tela ficava vazia até alguém sincronizar à mão (minutos), e a tela
-- baixava ~460 kB por dia (inclusive o detalhe pesado do cálculo do Caixa) em duas consultas.
--
-- Agora:
--  * frotas_fora_horario_sync_dia registra, por dia, em que pé está a sincronização (BFleet, ocorrências, dossiê);
--  * frotas_fora_horario_garantir() roda a cada 20 min de madrugada/manhã: busca o dia anterior logo após 00:30,
--    repete se faltar ou vier incompleto (até 4 tentativas por dia), refaz o dia anterior uma vez depois das 09:00
--    (a BFleet entrega eventos do fim do dia com atraso), cobre os últimos 7 dias e recalcula o dossiê quando chega dado novo;
--  * frotas_fora_horario_lista junta ocorrência + dossiê no banco (uma consulta, só as colunas da lista; inclui excessos de
--    velocidade e trajetos sem justificativa do dia);
--  * frotas_fora_horario_rota guarda o trajeto GPS já consultado (botão "Consultar rota").

-- ---------------------------------------------------------------------------------------------
-- Controle por dia
-- ---------------------------------------------------------------------------------------------

create table if not exists public.frotas_fora_horario_sync_dia (
  data_evento date primary key,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'SINCRONIZANDO', 'OK', 'SEM_DADOS')),
  placas_raw integer not null default 0,
  ocorrencias integer not null default 0,
  dossies integer not null default 0,
  tentativas_total integer not null default 0,
  tentativas_hoje integer not null default 0,
  tentativa_data date,
  ultima_tentativa timestamptz,
  passada_tardia_em timestamptz,
  sincronizado_em timestamptz,
  dossie_em timestamptz,
  ultimo_erro text,
  atualizado_em timestamptz not null default now()
);

comment on table public.frotas_fora_horario_sync_dia is
  'Andamento da sincronização diária do Fora do horário (BFleet → ocorrências → dossiê). Alimentada por frotas_fora_horario_garantir().';

alter table public.frotas_fora_horario_sync_dia enable row level security;
drop policy if exists frotas_fora_horario_sync_dia_authenticated_select on public.frotas_fora_horario_sync_dia;
create policy frotas_fora_horario_sync_dia_authenticated_select
  on public.frotas_fora_horario_sync_dia
  for select to authenticated
  using (public.frotas_usuario_tem_acesso());
revoke all on public.frotas_fora_horario_sync_dia from anon, authenticated;
grant select on public.frotas_fora_horario_sync_dia to authenticated;
grant all on public.frotas_fora_horario_sync_dia to service_role;

-- ---------------------------------------------------------------------------------------------
-- Cache do trajeto GPS (preenchido pela Edge Function frotas-fora-horario-rota)
-- ---------------------------------------------------------------------------------------------

create table if not exists public.frotas_fora_horario_rota (
  data_evento date not null,
  placa text not null,
  idgps text,
  pontos jsonb not null,
  total_original integer,
  gerado_em timestamptz not null default now(),
  primary key (data_evento, placa)
);

comment on table public.frotas_fora_horario_rota is
  'Trajeto GPS do veículo no dia: pontos [segundos desde 00:00 (Brasília), latitude, longitude, km/h], já reduzidos.';

alter table public.frotas_fora_horario_rota enable row level security;
drop policy if exists frotas_fora_horario_rota_authenticated_select on public.frotas_fora_horario_rota;
create policy frotas_fora_horario_rota_authenticated_select
  on public.frotas_fora_horario_rota
  for select to authenticated
  using (public.frotas_usuario_tem_acesso());
revoke all on public.frotas_fora_horario_rota from anon, authenticated;
grant select on public.frotas_fora_horario_rota to authenticated;
grant all on public.frotas_fora_horario_rota to service_role;

-- ---------------------------------------------------------------------------------------------
-- Consulta da tela: ocorrência + dossiê numa única leitura, sem o detalhe pesado
-- ---------------------------------------------------------------------------------------------

drop view if exists public.frotas_fora_horario_lista;
create view public.frotas_fora_horario_lista
with (security_invoker = true) as
select
  o.id,
  o.data_evento,
  o.placa,
  coalesce(o.motorista, d.motorista) as motorista,
  coalesce(d.coordenacao, o.coordenacao) as coordenacao,
  coalesce(d.supervisao, o.supervisao) as supervisao,
  o.km_00_05,
  o.valor_km,
  o.valor_caixa,
  o.status_calculo,
  o.status_notificacao,
  o.status_caixa,
  (case when jsonb_typeof(o.calculo_detalhes -> 'history' -> 'rota') = 'array' then jsonb_array_length(o.calculo_detalhes -> 'history' -> 'rota') else 0 end > 0
   or case when jsonb_typeof(o.calculo_detalhes -> 'fallback_relatorio' -> 'trechos') = 'array' then jsonb_array_length(o.calculo_detalhes -> 'fallback_relatorio' -> 'trechos') else 0 end > 0) as tem_rota_caixa,
  false as sem_ocorrencia,
  d.id as dossie_id,
  d.veredito, d.confianca, d.criterio, d.fonte_expediente,
  d.inicio_expediente, d.fim_expediente, d.janela_inicio, d.janela_fim,
  d.km_dia, d.km_fora, d.min_fora, d.km_noturno, d.km_apos_chegada, d.viagens_dia, d.viagens_fora,
  d.chegada_casa, d.retorno_previsto, d.atraso_retorno_min,
  d.motivos, d.resumo_dia, d.condutor_escalado, d.caronas, d.calculado_em,
  d.qtd_excessos, d.vel_max, d.excessos_fora, d.km_indevido, d.viagens_indevidas, d.veredito_uso, d.uso_sem_base, d.continua_anterior, d.continua_seguinte,
  coalesce(ex.pendentes, 0)::int as exc_pendentes, coalesce(ex.gerados, 0)::int as exc_gerados, coalesce(ex.notificados, 0)::int as exc_notificados
from public.frotas_fora_horario_ocorrencias o
left join public.frotas_fora_horario_dossie d on d.data_evento = o.data_evento and d.placa = o.placa
left join (
  select x.data_evento, regexp_replace(upper(coalesce(x.placa, '')), '[^A-Z0-9]', '', 'g') as placa_n,
         count(*) filter (where upper(coalesce(x.status_notificacao, '')) = 'PENDENTE') as pendentes,
         count(*) filter (where upper(coalesce(x.status_notificacao, '')) = 'GERADA') as gerados,
         count(*) filter (where upper(coalesce(x.status_notificacao, '')) = 'NOTIFICADO') as notificados
  from public.frotas_excesso_velocidade x
  group by 1, 2
) ex on ex.data_evento = o.data_evento and ex.placa_n = o.placa
union all
-- dia/placa com dossiê mas sem ocorrência consolidada (sync da BFleet incompleto)
select
  null::uuid, d.data_evento, d.placa, d.motorista, d.coordenacao, d.supervisao,
  0::numeric, 4::numeric, 0::numeric, 'SEM_HISTORICO'::text, 'PENDENTE'::text, 'NAO_SOLICITADO'::text,
  false, true,
  d.id,
  d.veredito, d.confianca, d.criterio, d.fonte_expediente,
  d.inicio_expediente, d.fim_expediente, d.janela_inicio, d.janela_fim,
  d.km_dia, d.km_fora, d.min_fora, d.km_noturno, d.km_apos_chegada, d.viagens_dia, d.viagens_fora,
  d.chegada_casa, d.retorno_previsto, d.atraso_retorno_min,
  d.motivos, d.resumo_dia, d.condutor_escalado, d.caronas, d.calculado_em,
  d.qtd_excessos, d.vel_max, d.excessos_fora, d.km_indevido, d.viagens_indevidas, d.veredito_uso, d.uso_sem_base, d.continua_anterior, d.continua_seguinte,
  coalesce(ex.pendentes, 0)::int, coalesce(ex.gerados, 0)::int, coalesce(ex.notificados, 0)::int
from public.frotas_fora_horario_dossie d
left join (
  select x.data_evento, regexp_replace(upper(coalesce(x.placa, '')), '[^A-Z0-9]', '', 'g') as placa_n,
         count(*) filter (where upper(coalesce(x.status_notificacao, '')) = 'PENDENTE') as pendentes,
         count(*) filter (where upper(coalesce(x.status_notificacao, '')) = 'GERADA') as gerados,
         count(*) filter (where upper(coalesce(x.status_notificacao, '')) = 'NOTIFICADO') as notificados
  from public.frotas_excesso_velocidade x
  group by 1, 2
) ex on ex.data_evento = d.data_evento and ex.placa_n = d.placa
where not exists (
  select 1 from public.frotas_fora_horario_ocorrencias o where o.data_evento = d.data_evento and o.placa = d.placa
);

revoke all on public.frotas_fora_horario_lista from anon, authenticated;
grant select on public.frotas_fora_horario_lista to authenticated;
grant all on public.frotas_fora_horario_lista to service_role;

-- ---------------------------------------------------------------------------------------------
-- Orquestrador diário
-- ---------------------------------------------------------------------------------------------

create or replace function public.frotas_fora_horario_garantir(p_dias integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agora timestamptz := now();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hora time := (now() at time zone 'America/Sao_Paulo')::time;
  d date;
  c public.frotas_fora_horario_sync_dia%rowtype;
  v_raw integer; v_ult_raw timestamptz; v_oc integer; v_dos integer; v_ult_dossie timestamptz; v_ult_exc timestamptz;
  v_ok boolean; v_espera boolean; v_tent_hoje integer; v_dispara boolean; v_motivo text; v_tardia boolean;
  v_url text; v_key text;
  v_status text;
  v_disparos integer := 0; v_dossies integer := 0;
  v_log jsonb := '[]'::jsonb;
begin
  -- Uma execução por vez (o cron roda a cada 20 min e a BFleet pode demorar).
  if not pg_try_advisory_xact_lock(hashtext('frotas_fora_horario_garantir')) then
    return jsonb_build_object('ok', true, 'ignorado', 'outra execução em andamento');
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  for d in select g::date from generate_series((v_hoje - 1)::timestamp, (v_hoje - greatest(p_dias, 1))::timestamp, interval '-1 day') g loop
    insert into public.frotas_fora_horario_sync_dia (data_evento) values (d) on conflict (data_evento) do nothing;
    select * into c from public.frotas_fora_horario_sync_dia where data_evento = d for update;

    select count(distinct f.placa), max(f.created_at) into v_raw, v_ult_raw
    from public.frotas_fora_horario f where f.data_evento = d;
    select count(*) into v_oc from public.frotas_fora_horario_ocorrencias o where o.data_evento = d;
    select count(*), max(x.calculado_em) into v_dos, v_ult_dossie from public.frotas_fora_horario_dossie x where x.data_evento = d;
    -- Excessos de velocidade do dia (sincronizados às 04:00 BRT por outro cron): entram no mesmo dossiê.
    select max(greatest(x.created_at, x.updated_at)) into v_ult_exc from public.frotas_excesso_velocidade x where x.data_evento = d;

    -- Sincronizado = ocorrências consolidadas para (quase) todas as placas do relatório.
    v_ok := v_oc >= 20 and v_oc >= v_raw * 0.95;
    v_tent_hoje := case when c.tentativa_data = v_hoje then c.tentativas_hoje else 0 end;
    v_espera := c.ultima_tentativa is null or v_agora - c.ultima_tentativa >= interval '25 minutes';
    v_dispara := false; v_motivo := null; v_tardia := false;

    -- 1) Dia sem dados (ou incompleto): busca na BFleet. Só depois de 00:30 do dia seguinte.
    if not v_ok and v_espera and v_tent_hoje < 4 and (d < v_hoje - 1 or v_hora >= time '00:30') then
      v_dispara := true;
      v_motivo := case when v_raw = 0 then 'sem dados' else 'incompleto' end;
    -- 2) Passada tardia do dia anterior: a BFleet entrega eventos do fim do dia com atraso.
    elsif v_ok and d = v_hoje - 1 and c.passada_tardia_em is null and v_hora >= time '09:00' and v_espera then
      v_dispara := true; v_tardia := true; v_motivo := 'passada tardia';
    end if;

    if v_dispara and v_disparos = 0 and v_url is not null and v_key is not null then
      perform net.http_post(
        url := v_url || '/functions/v1/sync-bfleet-fora-horario',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body := jsonb_build_object('scheduled', true, 'source', 'garantir', 'preferWebReport', true,
                                   'dataInicial', d::text, 'dataFinal', d::text),
        timeout_milliseconds := 120000
      );
      v_disparos := v_disparos + 1;
      update public.frotas_fora_horario_sync_dia
         set tentativas_total = tentativas_total + 1,
             tentativas_hoje = v_tent_hoje + 1,
             tentativa_data = v_hoje,
             ultima_tentativa = v_agora,
             passada_tardia_em = case when v_tardia then v_agora else passada_tardia_em end
       where data_evento = d
       returning * into c;
      v_tent_hoje := v_tent_hoje + 1;
      v_log := v_log || jsonb_build_object('dia', d, 'acao', 'bfleet', 'motivo', v_motivo);
    elsif v_dispara and v_disparos > 0 then
      v_log := v_log || jsonb_build_object('dia', d, 'acao', 'bfleet adiado', 'motivo', v_motivo);
    end if;

    -- 3) Dossiê: calcula quando falta ou quando chegou dado novo (viagens da BFleet ou excessos de velocidade) depois do último cálculo.
    --    Não calcula no meio de uma busca em andamento (disparada há menos de 30 min e ainda incompleta).
    if v_raw > 0 and v_dossies < 2
       and (v_dos = 0 or v_ult_raw > v_ult_dossie or v_ult_exc > v_ult_dossie)
       and (v_ok or c.ultima_tentativa is null or v_agora - c.ultima_tentativa >= interval '30 minutes') then
      begin
        perform public.frotas_fora_horario_dossie_gerar(d);
        v_dossies := v_dossies + 1;
        v_log := v_log || jsonb_build_object('dia', d, 'acao', 'dossie');
        select count(*), max(x.calculado_em) into v_dos, v_ult_dossie from public.frotas_fora_horario_dossie x where x.data_evento = d;
        update public.frotas_fora_horario_sync_dia set ultimo_erro = null where data_evento = d;
      exception when others then
        update public.frotas_fora_horario_sync_dia set ultimo_erro = left(sqlerrm, 300) where data_evento = d;
        v_log := v_log || jsonb_build_object('dia', d, 'acao', 'dossie_erro', 'erro', left(sqlerrm, 120));
      end;
    end if;

    v_status := case
      when v_ok and v_dos > 0 then 'OK'
      when not v_ok and v_tent_hoje >= 4 and (c.ultima_tentativa is null or v_agora - c.ultima_tentativa >= interval '25 minutes') then 'SEM_DADOS'
      when not v_ok and c.ultima_tentativa is not null and v_agora - c.ultima_tentativa < interval '25 minutes' then 'SINCRONIZANDO'
      when v_ok then 'SINCRONIZANDO'
      else 'PENDENTE' end;

    update public.frotas_fora_horario_sync_dia
       set status = v_status,
           placas_raw = coalesce(v_raw, 0),
           ocorrencias = v_oc,
           dossies = v_dos,
           sincronizado_em = case when v_ok then coalesce(sincronizado_em, v_agora) else sincronizado_em end,
           dossie_em = coalesce(v_ult_dossie, dossie_em),
           atualizado_em = v_agora
     where data_evento = d;
  end loop;

  return jsonb_build_object('ok', true, 'disparos_bfleet', v_disparos, 'dossies', v_dossies, 'acoes', v_log);
end
$$;

revoke all on function public.frotas_fora_horario_garantir(integer) from public, anon, authenticated;
grant execute on function public.frotas_fora_horario_garantir(integer) to service_role;

-- Controle dos dias já sincronizados (histórico recente)
insert into public.frotas_fora_horario_sync_dia (data_evento, status, placas_raw, ocorrencias, dossies, sincronizado_em, dossie_em)
select o.data_evento, 'OK', count(distinct o.placa), count(distinct o.placa),
       (select count(*) from public.frotas_fora_horario_dossie x where x.data_evento = o.data_evento),
       now(), (select max(x.calculado_em) from public.frotas_fora_horario_dossie x where x.data_evento = o.data_evento)
from public.frotas_fora_horario_ocorrencias o
where o.data_evento >= (now() at time zone 'America/Sao_Paulo')::date - 30
group by o.data_evento
having count(*) >= 20
on conflict (data_evento) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Agenda: a cada 20 min das 00:00 às 11:40 (Brasília). Substitui a busca única das 07:00 e o recálculo do dossiê.
-- ---------------------------------------------------------------------------------------------

select cron.unschedule('sync-bfleet-fora-horario-diario')
where exists (select 1 from cron.job where jobname = 'sync-bfleet-fora-horario-diario');
select cron.unschedule('frotas-fora-horario-dossie-diario')
where exists (select 1 from cron.job where jobname = 'frotas-fora-horario-dossie-diario');
select cron.unschedule('frotas-fora-horario-garantir')
where exists (select 1 from cron.job where jobname = 'frotas-fora-horario-garantir');

select cron.schedule(
  'frotas-fora-horario-garantir',
  '*/20 3-14 * * *',
  $$ select public.frotas_fora_horario_garantir(7); $$
);
