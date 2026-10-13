-- Frotas · Notificações · Fora do horário: dossiê de uso do veículo fora do expediente.
--
-- O relatório "Fora do horário" da BFleet traz TODAS as viagens do veículo no dia (não respeita o
-- expediente real do colaborador). Este dossiê refaz o filtro cruzando:
--   * viagens do veículo (GPS/BFleet, tabela frotas_fora_horario);
--   * informativos do colaborador no Mapa de Embarque (grm_mapa_embarque_importacoes: "Atualizado por"
--     + "Última Atualização");
--   * produção diária (producao_snapshot: check-in/check-out por O.S.);
--   * rastro do celular do colaborador (grm_login_movimentos_importacoes), só os pings feitos longe de casa.
--   * Programação do dia (programacao_deslocamento): condutor escalado, colegas de carona e a O.S. de cada um;
--     a passagem do veículo pelo local da O.S. (< 2 km) ou pela casa do colega de carona (< 1,5 km) conta como trabalho.
-- Janela permitida = [1º registro de trabalho − tempo de ida − 20 min ; último registro + tempo de volta + 20 min].
-- Tempo de ida/volta = distância em linha reta casa↔local × fator de rota ÷ velocidade média.
-- O que passar dessa janela é "uso fora do horário"; o dossiê guarda a linha do tempo para conferência.

create table if not exists public.frotas_fora_horario_dossie (
  id uuid primary key default gen_random_uuid(),
  data_evento date not null,
  placa text not null,
  motorista text,
  coordenacao text,
  supervisao text,
  veredito text not null check (veredito in ('FORA_HORARIO', 'ATENCAO', 'DENTRO_HORARIO')),
  confianca text not null check (confianca in ('ALTA', 'BAIXA')),
  criterio text not null,
  fonte_expediente text,
  inicio_expediente timestamp,
  fim_expediente timestamp,
  primeiro_informativo timestamp,
  ultimo_informativo timestamp,
  qtd_informativos integer not null default 0,
  janela_inicio timestamp,
  janela_fim timestamp,
  tolerancia_min integer not null default 20,
  km_dia numeric(10, 1) not null default 0,
  km_fora numeric(10, 1) not null default 0,
  min_fora integer not null default 0,
  km_noturno numeric(10, 1) not null default 0,
  km_apos_chegada numeric(10, 1) not null default 0,
  viagens_dia integer not null default 0,
  viagens_fora integer not null default 0,
  saida_casa timestamp,
  chegada_casa timestamp,
  retorno_previsto timestamp,
  atraso_retorno_min integer,
  motivos jsonb not null default '[]'::jsonb,
  detalhes jsonb not null default '{}'::jsonb,
  resumo_dia jsonb not null default '[]'::jsonb,
  condutor_escalado text,
  caronas jsonb not null default '[]'::jsonb,
  calculado_em timestamptz not null default now(),
  constraint frotas_fora_horario_dossie_dia_placa_key unique (data_evento, placa)
);

-- Instalações anteriores: a coluna entra depois (resumo compacto das viagens para o cartão da lista).
alter table public.frotas_fora_horario_dossie add column if not exists resumo_dia jsonb not null default '[]'::jsonb;
alter table public.frotas_fora_horario_dossie add column if not exists condutor_escalado text;
alter table public.frotas_fora_horario_dossie add column if not exists caronas jsonb not null default '[]'::jsonb;

comment on table public.frotas_fora_horario_dossie is
  'Dossiê de uso do veículo fora do expediente (viagens GPS × informativos × produção × celular). Horários em Brasília, sem fuso.';

create index if not exists frotas_fora_horario_dossie_data_veredito_idx
  on public.frotas_fora_horario_dossie (data_evento, veredito);

alter table public.frotas_fora_horario_dossie enable row level security;

drop policy if exists frotas_fora_horario_dossie_authenticated_select on public.frotas_fora_horario_dossie;
create policy frotas_fora_horario_dossie_authenticated_select
  on public.frotas_fora_horario_dossie
  for select to authenticated
  using (public.frotas_usuario_tem_acesso());

revoke all on public.frotas_fora_horario_dossie from anon, authenticated;
grant select on public.frotas_fora_horario_dossie to authenticated;
grant all on public.frotas_fora_horario_dossie to service_role;

-- ---------------------------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------------------------

create or replace function public.frotas_dossie_hav(la1 float8, lo1 float8, la2 float8, lo2 float8)
returns float8
language sql
immutable
parallel safe
set search_path = public
as $$
  select case when la1 is null or lo1 is null or la2 is null or lo2 is null then null
    else 2 * 6371 * asin(sqrt(least(1, power(sin(radians(la2 - la1) / 2), 2)
      + cos(radians(la1)) * cos(radians(la2)) * power(sin(radians(lo2 - lo1) / 2), 2)))) end
$$;

create or replace function public.frotas_dossie_sobrep_s(a1 timestamp, a2 timestamp, b1 timestamp, b2 timestamp)
returns numeric
language sql
immutable
parallel safe
set search_path = public
as $$
  select greatest(0, extract(epoch from (least(a2, b2) - greatest(a1, b1))))::numeric
$$;

-- Número com vírgula decimal para os textos de motivo (a tela exibe tudo em pt-BR).
create or replace function public.frotas_dossie_fmt(n numeric, casas integer default 1)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(to_char(coalesce(n, 0), 'FM999999990' || case when casas > 0 then '.' || repeat('0', casas) else '' end), '.', ',')
$$;

-- Endereços da RedGPS chegam com entidades HTML (&ecirc;, &atilde;...).
create or replace function public.frotas_dossie_entidades(t text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  m text[] := array[
    '&aacute;','á','&agrave;','à','&acirc;','â','&atilde;','ã','&auml;','ä','&eacute;','é','&egrave;','è','&ecirc;','ê',
    '&iacute;','í','&icirc;','î','&oacute;','ó','&ocirc;','ô','&otilde;','õ','&uacute;','ú','&ucirc;','û','&uuml;','ü','&ccedil;','ç',
    '&Aacute;','Á','&Agrave;','À','&Acirc;','Â','&Atilde;','Ã','&Eacute;','É','&Ecirc;','Ê','&Iacute;','Í','&Oacute;','Ó',
    '&Ocirc;','Ô','&Otilde;','Õ','&Uacute;','Ú','&Ccedil;','Ç','&quot;','"','&#039;','''','&#39;','''','&nbsp;',' ','&amp;','&'];
  i int;
  r text := t;
begin
  if r is null then return null; end if;
  for i in 1..array_length(m, 1) by 2 loop
    r := replace(r, m[i], m[i + 1]);
  end loop;
  return r;
end
$$;

-- Posição do veículo num instante: destino da última viagem concluída; se estiver rodando, início ('inicio') ou fim da viagem.
create or replace function public.frotas_dossie_posicao_em(trips jsonb, ts timestamp, casa_la float8, casa_lo float8, modo text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  i int;
  n int := jsonb_array_length(trips);
  t jsonb;
  la float8 := casa_la;
  lo float8 := casa_lo;
  ed text := null;
  mov boolean := false;
begin
  for i in 0..n - 1 loop
    t := trips -> i;
    if (t ->> 'fim')::timestamp <= ts then
      la := (t ->> 'la2')::float8; lo := (t ->> 'lo2')::float8; ed := t ->> 'para';
    elsif (t ->> 'ini')::timestamp < ts then
      mov := true;
      if modo = 'inicio' then
        la := (t ->> 'la1')::float8; lo := (t ->> 'lo1')::float8; ed := t ->> 'de';
      else
        la := (t ->> 'la2')::float8; lo := (t ->> 'lo2')::float8; ed := t ->> 'para';
      end if;
      exit;
    else
      exit;
    end if;
  end loop;
  return jsonb_build_object('la', la, 'lo', lo, 'end', ed, 'mov', mov);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Montagem do dossiê de um dia (sem gravar). Uma linha por placa com viagens no dia.
-- ---------------------------------------------------------------------------------------------

-- O formato de saída (RETURNS TABLE) mudou entre versões: recria a função.
drop function if exists public.frotas_fora_horario_dossie_montar(date, text, integer, numeric, numeric, numeric, time, time);

create or replace function public.frotas_fora_horario_dossie_montar(
  p_data date,
  p_placa text default null,
  p_tol_min integer default 20,
  p_fator numeric default 1.4,
  p_vel_kmh numeric default 60,
  p_raio_casa_km numeric default 0.6,
  p_base_ini time default '05:30',
  p_base_fim time default '20:00'
)
returns table (
  placa text,
  motorista text,
  coordenacao text,
  supervisao text,
  veredito text,
  confianca text,
  criterio text,
  fonte_expediente text,
  inicio_expediente timestamp,
  fim_expediente timestamp,
  primeiro_informativo timestamp,
  ultimo_informativo timestamp,
  qtd_informativos integer,
  janela_inicio timestamp,
  janela_fim timestamp,
  km_dia numeric,
  km_fora numeric,
  min_fora integer,
  km_noturno numeric,
  km_apos_chegada numeric,
  viagens_dia integer,
  viagens_fora integer,
  saida_casa timestamp,
  chegada_casa timestamp,
  retorno_previsto timestamp,
  atraso_retorno_min integer,
  motivos jsonb,
  detalhes jsonb,
  condutor_escalado text,
  caronas jsonb
)
language plpgsql
stable
set search_path = public
as $f$
declare
  inf_map jsonb; prod_map jsonb; ping_map jsonb; trips_map jsonb;
  pl text; trips jsonb; t jsonb; n int; i int;
  mot text; coord text; superv text; nome text; nome_chave text;
  inf_arr jsonb; prod_arr jsonb; ping_arr jsonb;
  ev jsonb; evs jsonb; e jsonb; e_ts timestamp; e_la float8; e_lo float8; e_pos jsonb; e_casa boolean; e_tipo text;
  a_ini timestamp; a_fim timestamp; fontes text[]; fonte text; n_ev int;
  prim_inf timestamp; ult_inf timestamp; qtd_inf int;
  dow int := extract(dow from p_data);
  casa_la float8; casa_lo float8; casa_end text;
  fim_la float8; fim_lo float8;
  noite_la float8; noite_lo float8; noite_end text;
  pini jsonb; pfim jsonb;
  d_ida float8; d_volta float8; desloc_km float8;
  t_ida numeric := 0; t_volta numeric := 0;
  w_ini timestamp; w_fim timestamp;
  t_ini timestamp; t_fim timestamp; t_dist numeric; t_dur numeric;
  out_secs numeric; out_km numeric; fase text; noite_s numeric;
  p1_a timestamp; p1_b timestamp; p2_a timestamp; p2_b timestamp; fora_ini timestamp;
  v_km_dia numeric; v_km_fora numeric; v_min_fora numeric; v_n_fora int; v_n_dia int;
  km_ida_real numeric; km_volta_real numeric; km_antes numeric; km_apos numeric;
  min_antes numeric; min_apos numeric; v_km_noturno numeric; v_km_apos_chegada numeric; n_apos_chegada int;
  chegada_idx int; v_saida_casa timestamp; v_chegada_casa timestamp; v_retorno_prev timestamp;
  atraso_ret int; saida_ant int;
  viagens_out jsonb; v_motivos jsonb; vered text; v_conf text; v_crit text;
  flag_percurso boolean; viagem_vespera boolean;
  prog_map jsonb; prog jsonb; pessoas jsonb; pessoa jsonb; os_item jsonb; prog_os jsonb; caronas_json jsonb;
  cond_esc text; cond_confere boolean; vistos text[]; chaves text[]; v_quem text; v_papel text;
  enderecos jsonb; vistos_end text[]; end_la float8; end_lo float8; end_txt text; end_achou boolean; v_chave_end text;
  eq_map jsonb; pcol_map jsonb; pcol jsonb; eq_chave text; v_logisticas text[]; logistica_json jsonb;
begin
  -- Informativos do colaborador (Mapa de Embarque): quem atualizou + quando + O.S./local.
  select coalesce(jsonb_object_agg(x.nome, x.itens), '{}'::jsonb) into inf_map
  from (
    select s.nome, jsonb_agg(jsonb_build_object('ts', s.ts, 'os', s.os, 'local', s.local) order by s.ts) as itens
    from (
      select distinct upper(unaccent(trim(m.dados_json ->> 'Atualizado por'))) as nome,
             to_timestamp(m.dados_json ->> 'Última Atualização', 'DD/MM/YYYY HH24:MI')::timestamp as ts,
             m.dados_json ->> 'OS' as os, m.dados_json ->> 'Local' as local
      from public.grm_mapa_embarque_importacoes m
      where m.created_at >= (p_data + time '03:00') at time zone 'UTC'
        and m.created_at < (p_data + 1 + time '15:00') at time zone 'UTC'
        and m.dados_json ->> 'Última Atualização' ~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}'
        and m.dados_json ->> 'Última Atualização' like to_char(p_data, 'DD/MM/YYYY') || '%'
        and coalesce(trim(m.dados_json ->> 'Atualizado por'), '') <> ''
    ) s
    group by s.nome
  ) x;

  -- Produção diária: check-in/check-out por O.S.
  select coalesce(jsonb_object_agg(x.nome, x.itens), '{}'::jsonb) into prod_map
  from (
    select s.nome, jsonb_agg(jsonb_build_object('ci', s.ci, 'co', s.co, 'os', s.os, 'local', s.local, 'cargas', s.cargas) order by s.ci) as itens
    from (
      select distinct upper(unaccent(trim(p.funcionario))) as nome, p.checkin::timestamp as ci,
             case when p.checkout ~ '^\d{4}-\d{2}-\d{2}' then p.checkout::timestamp end as co,
             p.os, p.local_embarque as local, p.cargas
      from public.producao_snapshot p
      where p.data = p_data and p.funcionario is not null
        and p.checkin ~ '^\d{4}-\d{2}-\d{2}'
        and p.checkin::timestamp >= p_data::timestamp and p.checkin::timestamp < (p_data + 1)::timestamp
    ) s
    group by s.nome
  ) x;

  -- Rastro do celular do colaborador (GPS do app GRM).
  select coalesce(jsonb_object_agg(x.nome, x.itens), '{}'::jsonb) into ping_map
  from (
    select s.nome, jsonb_agg(jsonb_build_object('ts', s.ts, 'la', s.la, 'lo', s.lo, 'local', s.local) order by s.ts) as itens
    from (
      select distinct upper(unaccent(trim(l.colaborador))) as nome, (l.data_movimento + l.hora_movimento) as ts,
             l.latitude as la, l.longitude as lo, l.local_servico as local
      from public.grm_login_movimentos_importacoes l
      where l.data_movimento = p_data and l.hora_movimento is not null
        and l.latitude is not null and l.longitude is not null
    ) s
    group by s.nome
  ) x;

  -- Viagens do dia por placa (relatório BFleet), sem duplicatas nem ruído de GPS.
  with raw as (
    select distinct on (f.placa, f.raw ->> 'Inicio', f.raw ->> 'Final')
      f.placa as placa_v,
      (f.raw ->> 'Inicio')::timestamp as ini, (f.raw ->> 'Final')::timestamp as fim,
      coalesce(nullif(f.raw ->> 'Distancia', '')::numeric, 0) as dist,
      nullif(f.raw ->> 'Latitud Inicio', '')::float8 as la1, nullif(f.raw ->> 'Longitud Inicio', '')::float8 as lo1,
      nullif(f.raw ->> 'Latitud Fin', '')::float8 as la2, nullif(f.raw ->> 'Longitud Fin', '')::float8 as lo2,
      public.frotas_dossie_entidades(f.raw ->> 'Domicilio Inicial') as de,
      public.frotas_dossie_entidades(f.raw ->> 'Domicilio Final') as para,
      nullif(f.raw ->> 'Vel. Maxima', '')::numeric as vmax
    from public.frotas_fora_horario f
    where f.data_evento = p_data and (p_placa is null or f.placa = p_placa)
      and f.raw ->> 'Inicio' ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'
      and f.raw ->> 'Final' ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'
    order by f.placa, f.raw ->> 'Inicio', f.raw ->> 'Final'
  ), clean as (
    select r.* from raw r
    where not (r.dist < 0.3 and r.fim - r.ini < interval '3 minutes')
      and not exists (
        select 1 from raw o
        where o.placa_v = r.placa_v and o.ini <= r.ini and o.fim >= r.fim and (o.fim - o.ini) > (r.fim - r.ini))
  )
  select coalesce(jsonb_object_agg(g.placa_v, g.itens), '{}'::jsonb) into trips_map
  from (
    select c.placa_v, jsonb_agg(jsonb_build_object(
      'ini', c.ini, 'fim', c.fim, 'dist', c.dist, 'la1', c.la1, 'lo1', c.lo1, 'la2', c.la2, 'lo2', c.lo2,
      'de', c.de, 'para', c.para, 'vmax', c.vmax) order by c.ini, c.fim) as itens
    from clean c
    group by c.placa_v
  ) g;

  -- Programação do dia: quem está escalado como condutor (MOTORISTA FROTA) e quem vai de carona (CARONA FROTA)
  -- em cada placa, com a O.S. escalada de cada um e a casa cadastrada dos caronas.
  select coalesce(jsonb_object_agg(g.placa_p, g.info), '{}'::jsonb) into prog_map
  from (
    select s.placa_p, jsonb_build_object('pessoas', jsonb_agg(jsonb_build_object(
             'nome', s.nome, 'papel', s.papel, 'casa_la', s.casa_la, 'casa_lo', s.casa_lo, 'endereco', s.endereco, 'oss', s.oss) order by s.papel, s.nome)) as info
    from (
      select distinct
        regexp_replace(upper(c.placa_veiculo), '[^A-Z0-9]', '', 'g') as placa_p,
        upper(trim(c.nome_colaborador)) as nome,
        case when upper(trim(c.tipo_deslocamento)) = 'MOTORISTA FROTA' then 'CONDUTOR' else 'CARONA' end as papel,
        cz.latitude as casa_la, cz.longitude as casa_lo, cz.endereco_base as endereco,
        (select jsonb_agg(jsonb_build_object('os', o.numero_os, 'cliente', o.cliente, 'local', coalesce(pe.nome_local, o.ponto1_nome),
                'la', coalesce(pe.latitude, o.ponto1_latitude)::float8, 'lo', coalesce(pe.longitude, o.ponto1_longitude)::float8))
           from public.programacao_equipe e
           join public.operacional_os o on o.id = e.os_id
           left join public.operacional_pontos_embarque pe on pe.id = o.ponto_embarque_id
          where e.programacao_id = c.programacao_id and e.colaborador_id = c.colaborador_id and e.confirmado = true) as oss
      from public.programacao_deslocamento c
      join public.programacao_dia d on d.id = c.programacao_id
      left join lateral (
        select z.latitude::float8 as latitude, z.longitude::float8 as longitude, z.endereco_base
        from public.colaborador_cruzamento z
        where z.cpf <> '' and z.cpf = regexp_replace(coalesce(c.colaborador_id, ''), '\D', '', 'g')
        order by z.atualizado_em desc
        limit 1
      ) cz on true
      where d.data_referencia = p_data
        and upper(trim(c.tipo_deslocamento)) in ('MOTORISTA FROTA', 'CARONA FROTA')
        and regexp_replace(upper(coalesce(c.placa_veiculo, '')), '[^A-Z0-9]', '', 'g') <> ''
        and (p_placa is null or regexp_replace(upper(c.placa_veiculo), '[^A-Z0-9]', '', 'g') = p_placa)
    ) s
    group by s.placa_p
  ) g;

  -- O.S. escalada (atendimento) de cada colaborador no dia, mesmo quem não tem linha de deslocamento.
  select coalesce(jsonb_object_agg(g.nome, g.oss), '{}'::jsonb) into eq_map
  from (
    select upper(unaccent(trim(e.nome_colaborador))) as nome,
           jsonb_agg(distinct jsonb_build_object('os', o.numero_os, 'cliente', o.cliente, 'local', coalesce(pe.nome_local, o.ponto1_nome),
                'la', coalesce(pe.latitude, o.ponto1_latitude)::float8, 'lo', coalesce(pe.longitude, o.ponto1_longitude)::float8)) as oss
    from public.programacao_equipe e
    join public.programacao_dia pd on pd.id = e.programacao_id
    join public.operacional_os o on o.id = e.os_id
    left join public.operacional_pontos_embarque pe on pe.id = o.ponto_embarque_id
    where pd.data_referencia = p_data and e.confirmado = true and coalesce(trim(e.nome_colaborador), '') <> ''
    group by 1
  ) g;

  -- Colaboradores ligados a cada placa na Programação (ex.: LOGISTICA = condutor da carona frota), com ou sem linha de deslocamento.
  select coalesce(jsonb_object_agg(g.placa_p, g.pessoas), '{}'::jsonb) into pcol_map
  from (
    select regexp_replace(upper(c.placa_veiculo), '[^A-Z0-9]', '', 'g') as placa_p,
           jsonb_agg(distinct jsonb_build_object('nome', upper(trim(c.nome_colaborador)), 'disp', upper(trim(coalesce(c.disponibilidade, ''))))) as pessoas
    from public.programacao_colaboradores c
    join public.programacao_dia pd on pd.id = c.programacao_id
    where pd.data_referencia = p_data
      and regexp_replace(upper(coalesce(c.placa_veiculo, '')), '[^A-Z0-9]', '', 'g') <> ''
      and (p_placa is null or regexp_replace(upper(c.placa_veiculo), '[^A-Z0-9]', '', 'g') = p_placa)
    group by 1
  ) g;

  for pl in select jsonb_object_keys(trips_map) loop
    trips := trips_map -> pl;
    n := jsonb_array_length(trips);
    if n = 0 then continue; end if;

    -- Colaborador associado à placa.
    select coalesce(o.motorista, v.patrimonio_funcionario, v.motorista_atual, v.bfleet_condutor),
           coalesce(o.coordenacao, v.coordenacao, v.patrimonio_coordenacao),
           coalesce(o.supervisao, v.supervisao, v.patrimonio_supervisao)
      into mot, coord, superv
    from (select 1) z
    left join public.frotas_fora_horario_ocorrencias o on o.data_evento = p_data and o.placa = pl
    left join public.frotas_veiculos v on v.placa = pl;

    -- Pessoas do veículo no dia: motorista cadastrado, condutor escalado na Programação e colegas de carona.
    prog := prog_map -> pl;
    pessoas := '[]'::jsonb; prog_os := '[]'::jsonb; caronas_json := '[]'::jsonb;
    v_logisticas := '{}'; logistica_json := '[]'::jsonb;
    cond_esc := null; cond_confere := null;
    if coalesce(trim(mot), '') <> '' then
      pessoas := pessoas || jsonb_build_object('nome', upper(trim(mot)), 'papel', 'MOTORISTA');
    end if;
    if prog is not null then
      for pessoa in select * from jsonb_array_elements(prog -> 'pessoas') loop
        pessoas := pessoas || pessoa;
        if (pessoa ->> 'papel') = 'CONDUTOR' then
          cond_esc := coalesce(cond_esc || ', ', '') || (pessoa ->> 'nome');
          nome := upper(unaccent(pessoa ->> 'nome'));
          if coalesce(trim(mot), '') <> '' then
            cond_confere := coalesce(cond_confere, false)
              or nome = upper(unaccent(trim(mot))) or similarity(nome, upper(unaccent(trim(mot)))) >= 0.85;
          end if;
        else
          caronas_json := caronas_json || to_jsonb(pessoa ->> 'nome');
        end if;
        if jsonb_typeof(pessoa -> 'oss') = 'array' then
          for os_item in select * from jsonb_array_elements(pessoa -> 'oss') loop
            prog_os := prog_os || (os_item || jsonb_build_object('quem', pessoa ->> 'nome', 'papel', pessoa ->> 'papel', 'logistica', pessoa -> 'logistica'));
          end loop;
        end if;
      end loop;
    end if;

    -- Colaboradores ligados à placa na Programação (LOGISTICA = condutor da carona frota), com ou sem linha de deslocamento.
    if pcol_map ? pl then
      for pcol in select * from jsonb_array_elements(pcol_map -> pl) loop
        v_chave_end := upper(unaccent(trim(coalesce(pcol ->> 'nome', ''))));
        if v_chave_end = '' then continue; end if;
        if (pcol ->> 'disp') = 'LOGISTICA' then
          v_logisticas := v_logisticas || v_chave_end;
          logistica_json := logistica_json || to_jsonb(pcol ->> 'nome');
          if position((pcol ->> 'nome') in coalesce(cond_esc, '')) = 0 then
            cond_esc := coalesce(cond_esc || ', ', '') || (pcol ->> 'nome');
          end if;
          if coalesce(trim(mot), '') <> '' then
            cond_confere := coalesce(cond_confere, false)
              or v_chave_end = upper(unaccent(trim(mot))) or similarity(v_chave_end, upper(unaccent(trim(mot)))) >= 0.85;
          end if;
        end if;
        if exists (
          select 1 from jsonb_array_elements(pessoas) x where upper(unaccent(trim(coalesce(x ->> 'nome', '')))) = v_chave_end
        ) then continue; end if;
        pessoas := pessoas || jsonb_build_object('nome', pcol ->> 'nome',
          'papel', case when (pcol ->> 'disp') = 'LOGISTICA' then 'CONDUTOR' else 'EQUIPE' end,
          'logistica', (pcol ->> 'disp') = 'LOGISTICA');
      end loop;
    end if;

    -- O.S. escalada (atendimento) de quem ainda não tem O.S. vinda da linha de deslocamento: motorista cadastrado,
    -- condutor/logística e equipe do veículo.
    for pessoa in select * from jsonb_array_elements(pessoas) loop
      if jsonb_typeof(pessoa -> 'oss') = 'array' and jsonb_array_length(pessoa -> 'oss') > 0 then continue; end if;
      v_chave_end := upper(unaccent(trim(coalesce(pessoa ->> 'nome', ''))));
      if v_chave_end = '' then continue; end if;
      eq_chave := null;
      if eq_map ? v_chave_end then
        eq_chave := v_chave_end;
      else
        select w.k into eq_chave from (
          select q.key as k, similarity(q.key, v_chave_end) as s from (select jsonb_object_keys(eq_map) as key) q
        ) w
        where w.s >= 0.85
        order by w.s desc
        limit 1;
      end if;
      if eq_chave is null then continue; end if;
      for os_item in select * from jsonb_array_elements(eq_map -> eq_chave) loop
        prog_os := prog_os || (os_item || jsonb_build_object('quem', pessoa ->> 'nome', 'papel', pessoa ->> 'papel', 'logistica', pessoa -> 'logistica'));
      end loop;
    end loop;

    select coalesce(jsonb_agg(q.item order by q.ord), '[]'::jsonb) into prog_os
    from (
      select distinct on (upper(unaccent(trim(t.item ->> 'quem'))), t.item ->> 'os')
             case when upper(unaccent(trim(t.item ->> 'quem'))) = any(v_logisticas) then t.item || jsonb_build_object('logistica', true) else t.item end as item,
             t.ord
      from jsonb_array_elements(prog_os) with ordinality as t(item, ord)
      order by upper(unaccent(trim(t.item ->> 'quem'))), t.item ->> 'os', t.ord
    ) q;

    -- Endereço cadastrado de cada pessoa do veículo (coordenada do cadastro, para mostrar no mapa da rota).
    enderecos := '[]'::jsonb; vistos_end := '{}';
    for pessoa in select * from jsonb_array_elements(pessoas) loop
      v_chave_end := upper(unaccent(trim(coalesce(pessoa ->> 'nome', ''))));
      if v_chave_end = '' or v_chave_end = any(vistos_end) then continue; end if;
      end_la := null; end_lo := null; end_txt := null; end_achou := false;
      if (pessoa ->> 'casa_la') is not null and (pessoa ->> 'casa_lo') is not null then
        end_la := (pessoa ->> 'casa_la')::float8; end_lo := (pessoa ->> 'casa_lo')::float8; end_txt := pessoa ->> 'endereco'; end_achou := true;
      else
        select z.latitude::float8, z.longitude::float8, z.endereco_base into end_la, end_lo, end_txt
        from public.colaborador_cruzamento z
        where upper(unaccent(trim(z.nome))) = v_chave_end and z.latitude is not null and z.longitude is not null
        order by z.atualizado_em desc
        limit 1;
        end_achou := found;
      end if;
      vistos_end := vistos_end || v_chave_end;
      if end_achou then
        enderecos := enderecos || jsonb_build_object('quem', pessoa ->> 'nome', 'papel', pessoa ->> 'papel', 'lat', end_la, 'lng', end_lo, 'endereco', end_txt);
      end if;
    end loop;

    -- Casa = origem da 1ª viagem do dia (onde o veículo dormiu); à noite = destino da última, encaixado na casa se < 1 km.
    t := trips -> 0;
    casa_la := (t ->> 'la1')::float8; casa_lo := (t ->> 'lo1')::float8; casa_end := t ->> 'de';
    t := trips -> (n - 1);
    fim_la := (t ->> 'la2')::float8; fim_lo := (t ->> 'lo2')::float8;
    noite_la := fim_la; noite_lo := fim_lo; noite_end := t ->> 'para';
    desloc_km := public.frotas_dossie_hav(fim_la, fim_lo, casa_la, casa_lo);
    if desloc_km < 1.0 then
      noite_la := casa_la; noite_lo := casa_lo; noite_end := casa_end;
    end if;

    -- Evidências de trabalho: só valem as registradas longe de casa.
    evs := '[]'::jsonb; vistos := '{}'; chaves := '{}';
    for pessoa in select * from jsonb_array_elements(pessoas) loop
      nome := upper(unaccent(trim(coalesce(pessoa ->> 'nome', ''))));
      if nome = '' or nome = any(vistos) then continue; end if;
      vistos := vistos || nome;
      nome_chave := null;
      if inf_map ? nome or prod_map ? nome or ping_map ? nome then
        nome_chave := nome;
      else
        select w.k into nome_chave from (
          select q.key as k, similarity(q.key, nome) as s from (
            select jsonb_object_keys(inf_map) as key union select jsonb_object_keys(prod_map) union select jsonb_object_keys(ping_map)
          ) q
        ) w
        where w.s >= 0.85
        order by w.s desc
        limit 1;
      end if;
      if nome_chave is null then continue; end if;
      v_quem := pessoa ->> 'nome';
      v_papel := pessoa ->> 'papel';
      for e in select * from jsonb_array_elements(coalesce(inf_map -> nome_chave, '[]'::jsonb)) loop
        evs := evs || jsonb_build_object('ts', e ->> 'ts', 'tipo', 'INFORMATIVO', 'os', e ->> 'os', 'local', e ->> 'local', 'quem', v_quem, 'papel', v_papel);
      end loop;
      for e in select * from jsonb_array_elements(coalesce(prod_map -> nome_chave, '[]'::jsonb)) loop
        evs := evs || jsonb_build_object('ts', e ->> 'ci', 'tipo', 'CHECKIN', 'os', e ->> 'os', 'local', e ->> 'local', 'cargas', e -> 'cargas', 'quem', v_quem, 'papel', v_papel);
        if (e ->> 'co') is not null then
          evs := evs || jsonb_build_object('ts', e ->> 'co', 'tipo', 'CHECKOUT', 'os', e ->> 'os', 'local', e ->> 'local', 'quem', v_quem, 'papel', v_papel);
        end if;
      end loop;
      for e in select * from jsonb_array_elements(coalesce(ping_map -> nome_chave, '[]'::jsonb)) loop
        evs := evs || jsonb_build_object('ts', e ->> 'ts', 'tipo', 'CELULAR', 'la', e -> 'la', 'lo', e -> 'lo', 'local', e ->> 'local',
          'quem', v_quem, 'papel', v_papel, 'cl', pessoa -> 'casa_la', 'co', pessoa -> 'casa_lo');
      end loop;
    end loop;

    -- Cruza a rota do veículo com o local das O.S. escaladas (condutor e caronas) e com a casa dos colegas de carona:
    -- chegada/saída do veículo nesses pontos também é trabalho (a O.S. deve estar a menos de 2 km; a casa, a menos de 1,5 km).
    for i in 0..n - 1 loop
      t := trips -> i;
      for os_item in select * from jsonb_array_elements(prog_os) loop
        if (os_item ->> 'la') is null or (os_item ->> 'lo') is null then continue; end if;
        if public.frotas_dossie_hav((t ->> 'la2')::float8, (t ->> 'lo2')::float8, (os_item ->> 'la')::float8, (os_item ->> 'lo')::float8) < 2.0
           and not ((t ->> 'fim') || 'c' || (os_item ->> 'os')) = any(chaves) then
          chaves := chaves || ((t ->> 'fim') || 'c' || (os_item ->> 'os'));
          evs := evs || jsonb_build_object('ts', t ->> 'fim', 'tipo', 'OS_PROGRAMADA', 'sentido', 'chegada', 'os', os_item ->> 'os',
            'local', coalesce(os_item ->> 'local', os_item ->> 'cliente'), 'la', os_item -> 'la', 'lo', os_item -> 'lo',
            'quem', os_item ->> 'quem', 'papel', os_item ->> 'papel');
        end if;
        if public.frotas_dossie_hav((t ->> 'la1')::float8, (t ->> 'lo1')::float8, (os_item ->> 'la')::float8, (os_item ->> 'lo')::float8) < 2.0
           and not ((t ->> 'ini') || 's' || (os_item ->> 'os')) = any(chaves) then
          chaves := chaves || ((t ->> 'ini') || 's' || (os_item ->> 'os'));
          evs := evs || jsonb_build_object('ts', t ->> 'ini', 'tipo', 'OS_PROGRAMADA', 'sentido', 'saida', 'os', os_item ->> 'os',
            'local', coalesce(os_item ->> 'local', os_item ->> 'cliente'), 'la', os_item -> 'la', 'lo', os_item -> 'lo',
            'quem', os_item ->> 'quem', 'papel', os_item ->> 'papel');
        end if;
      end loop;
      for pessoa in select * from jsonb_array_elements(pessoas) where (value ->> 'papel') = 'CARONA' loop
        if (pessoa ->> 'casa_la') is null or (pessoa ->> 'casa_lo') is null then continue; end if;
        if public.frotas_dossie_hav((t ->> 'la2')::float8, (t ->> 'lo2')::float8, (pessoa ->> 'casa_la')::float8, (pessoa ->> 'casa_lo')::float8) < 1.5
           and not ((t ->> 'fim') || 'h' || (pessoa ->> 'nome')) = any(chaves) then
          chaves := chaves || ((t ->> 'fim') || 'h' || (pessoa ->> 'nome'));
          evs := evs || jsonb_build_object('ts', t ->> 'fim', 'tipo', 'CARONA', 'sentido', 'chegada', 'local', pessoa ->> 'nome',
            'la', pessoa -> 'casa_la', 'lo', pessoa -> 'casa_lo', 'quem', pessoa ->> 'nome', 'papel', 'CARONA');
        end if;
        if public.frotas_dossie_hav((t ->> 'la1')::float8, (t ->> 'lo1')::float8, (pessoa ->> 'casa_la')::float8, (pessoa ->> 'casa_lo')::float8) < 1.5
           and not ((t ->> 'ini') || 'j' || (pessoa ->> 'nome')) = any(chaves) then
          chaves := chaves || ((t ->> 'ini') || 'j' || (pessoa ->> 'nome'));
          evs := evs || jsonb_build_object('ts', t ->> 'ini', 'tipo', 'CARONA', 'sentido', 'saida', 'local', pessoa ->> 'nome',
            'la', pessoa -> 'casa_la', 'lo', pessoa -> 'casa_lo', 'quem', pessoa ->> 'nome', 'papel', 'CARONA');
        end if;
      end loop;
    end loop;

    a_ini := null; a_fim := null; fontes := '{}'; ev := '[]'::jsonb;
    for e in select * from jsonb_array_elements(evs) order by (value ->> 'ts')::timestamp loop
      e_ts := (e ->> 'ts')::timestamp; e_tipo := e ->> 'tipo';
      if (e ->> 'la') is not null and (e ->> 'lo') is not null then
        -- registro com coordenada própria (celular, local da O.S., casa de carona): vale se não for a casa do condutor/colega
        e_la := (e ->> 'la')::float8; e_lo := (e ->> 'lo')::float8;
        e_casa := public.frotas_dossie_hav(e_la, e_lo, casa_la, casa_lo) < p_raio_casa_km
               or public.frotas_dossie_hav(e_la, e_lo, noite_la, noite_lo) < p_raio_casa_km
               or (e_tipo = 'CELULAR' and (e ->> 'cl') is not null and (e ->> 'co') is not null
                   and public.frotas_dossie_hav(e_la, e_lo, (e ->> 'cl')::float8, (e ->> 'co')::float8) < p_raio_casa_km);
      else
        e_pos := public.frotas_dossie_posicao_em(trips, e_ts, casa_la, casa_lo, 'fim');
        e_la := (e_pos ->> 'la')::float8; e_lo := (e_pos ->> 'lo')::float8;
        e_casa := (e_pos ->> 'mov') <> 'true'
          and (public.frotas_dossie_hav(e_la, e_lo, casa_la, casa_lo) < p_raio_casa_km
               or public.frotas_dossie_hav(e_la, e_lo, noite_la, noite_lo) < p_raio_casa_km);
      end if;
      ev := ev || ((e - 'cl' - 'co') || jsonb_build_object('em_casa', coalesce(e_casa, false)));
      if not coalesce(e_casa, false) then
        a_ini := least(coalesce(a_ini, e_ts), e_ts);
        a_fim := greatest(coalesce(a_fim, e_ts), e_ts);
        if not (e_tipo = any(fontes)) then fontes := fontes || e_tipo; end if;
      end if;
    end loop;
    select min((x ->> 'ts')::timestamp), max((x ->> 'ts')::timestamp), count(*)::int
      into prim_inf, ult_inf, qtd_inf
    from jsonb_array_elements(evs) x
    where (x ->> 'tipo') = 'INFORMATIVO' and (x ->> 'papel') in ('MOTORISTA', 'CONDUTOR');

    fonte := case when a_ini is null then 'PADRAO' else array_to_string(fontes, '+') end;

    -- Janela permitida.
    t_ida := 0; t_volta := 0; pini := null; pfim := null; d_ida := null; d_volta := null;
    v_conf := 'BAIXA'; v_crit := 'PADRAO';
    if a_ini is null then
      if dow between 1 and 6 then
        w_ini := p_data + p_base_ini; w_fim := p_data + p_base_fim;
      else
        w_ini := null; w_fim := null;
      end if;
    else
      pini := public.frotas_dossie_posicao_em(trips, a_ini, casa_la, casa_lo, 'fim');
      pfim := public.frotas_dossie_posicao_em(trips, a_fim, casa_la, casa_lo, 'inicio');
      d_ida := public.frotas_dossie_hav(casa_la, casa_lo, (pini ->> 'la')::float8, (pini ->> 'lo')::float8);
      d_volta := public.frotas_dossie_hav((pfim ->> 'la')::float8, (pfim ->> 'lo')::float8, noite_la, noite_lo);
      t_ida := case when d_ida is null or d_ida < 0.5 then 0 else round((d_ida * p_fator / p_vel_kmh * 60)::numeric, 0) end;
      t_volta := case when d_volta is null or d_volta < 0.5 then 0 else round((d_volta * p_fator / p_vel_kmh * 60)::numeric, 0) end;
      w_ini := a_ini - ((t_ida + p_tol_min) * interval '1 minute');
      w_fim := a_fim + ((t_volta + p_tol_min) * interval '1 minute');
      select count(*)::int into n_ev from jsonb_array_elements(ev) x where (x ->> 'em_casa') = 'false';
      if n_ev >= 3 and a_fim - a_ini >= interval '3 hours' then
        v_conf := 'ALTA'; v_crit := 'ESTRITO';
      else
        -- Poucos registros no dia: a janela pelos registros pode estar subestimada; amplia pelo expediente padrão (seg–sáb).
        v_crit := 'AMPLIADO';
        if dow between 1 and 6 then
          w_ini := least(w_ini, p_data + p_base_ini);
          w_fim := greatest(w_fim, p_data + p_base_fim);
        end if;
      end if;
    end if;

    viagens_out := '[]'::jsonb; v_motivos := '[]'::jsonb;
    v_km_dia := 0; v_km_fora := 0; v_min_fora := 0; v_n_fora := 0; v_n_dia := 0;
    km_ida_real := 0; km_volta_real := 0; km_antes := 0; km_apos := 0; min_antes := 0; min_apos := 0;
    v_km_noturno := 0; v_km_apos_chegada := 0; n_apos_chegada := 0; chegada_idx := null;
    v_saida_casa := null; v_chegada_casa := null;

    -- 1ª passada: chegada em casa depois do último registro de trabalho.
    if a_fim is not null then
      for i in 0..n - 1 loop
        t := trips -> i;
        if (t ->> 'ini')::timestamp >= a_fim - interval '15 minutes'
           and public.frotas_dossie_hav((t ->> 'la2')::float8, (t ->> 'lo2')::float8, noite_la, noite_lo) < 1.0 then
          chegada_idx := i; v_chegada_casa := (t ->> 'fim')::timestamp; exit;
        end if;
      end loop;
    end if;

    -- 2ª passada: classifica cada viagem em relação à janela.
    for i in 0..n - 1 loop
      t := trips -> i;
      t_ini := (t ->> 'ini')::timestamp; t_fim := (t ->> 'fim')::timestamp; t_dist := (t ->> 'dist')::numeric;
      t_dur := greatest(1, extract(epoch from (t_fim - t_ini)));
      out_secs := 0; fase := null; noite_s := 0; p1_a := null; p2_a := null; fora_ini := null;
      if w_ini is null then
        out_secs := t_dur; p1_a := t_ini; p1_b := t_fim;
      else
        if t_ini < w_ini then
          p1_a := t_ini; p1_b := least(t_fim, w_ini);
          out_secs := out_secs + extract(epoch from (p1_b - p1_a));
        end if;
        if t_fim > w_fim then
          p2_a := greatest(t_ini, w_fim); p2_b := t_fim;
          out_secs := out_secs + extract(epoch from (p2_b - p2_a));
        end if;
        out_secs := least(out_secs, t_dur);
      end if;
      fora_ini := coalesce(p1_a, p2_a);
      if p1_a is not null then
        noite_s := noite_s + public.frotas_dossie_sobrep_s(p1_a, p1_b, p_data::timestamp, p_data + time '05:00')
                           + public.frotas_dossie_sobrep_s(p1_a, p1_b, p_data + time '22:00', (p_data + 1) + time '05:00');
      end if;
      if p2_a is not null then
        noite_s := noite_s + public.frotas_dossie_sobrep_s(p2_a, p2_b, p_data::timestamp, p_data + time '05:00')
                           + public.frotas_dossie_sobrep_s(p2_a, p2_b, p_data + time '22:00', (p_data + 1) + time '05:00');
      end if;
      if w_ini is null then fase := 'APOS_EXPEDIENTE';
      elsif out_secs > 0 and t_ini < w_ini then fase := 'ANTES_EXPEDIENTE';
      elsif out_secs > 0 then fase := 'APOS_EXPEDIENTE';
      elsif a_ini is null then fase := 'EXPEDIENTE';
      elsif t_fim <= a_ini + interval '15 minutes' then fase := 'IDA';
      elsif t_ini >= a_fim - interval '15 minutes' then fase := 'VOLTA';
      else fase := 'EXPEDIENTE';
      end if;
      if v_chegada_casa is not null and i > chegada_idx and fase in ('APOS_EXPEDIENTE', 'VOLTA') and t_dist >= 0.3 then
        fase := 'APOS_CHEGADA_EM_CASA';
      end if;
      out_km := round(t_dist * out_secs / t_dur, 2);
      v_km_dia := v_km_dia + t_dist; v_n_dia := v_n_dia + 1;
      v_km_noturno := v_km_noturno + round(t_dist * least(noite_s, t_dur) / t_dur, 2);
      if out_km >= 0.3 then
        v_n_fora := v_n_fora + 1; v_km_fora := v_km_fora + out_km; v_min_fora := v_min_fora + out_secs / 60.0;
        if fase = 'ANTES_EXPEDIENTE' then
          km_antes := km_antes + out_km; min_antes := min_antes + out_secs / 60.0;
        else
          km_apos := km_apos + out_km; min_apos := min_apos + out_secs / 60.0;
        end if;
        if fase = 'APOS_CHEGADA_EM_CASA' then
          v_km_apos_chegada := v_km_apos_chegada + out_km; n_apos_chegada := n_apos_chegada + 1;
        end if;
      end if;
      if a_ini is not null then
        if t_fim <= a_ini + interval '15 minutes' then
          km_ida_real := km_ida_real + t_dist;
          if v_saida_casa is null and t_dist >= 0.3 then v_saida_casa := t_ini; end if;
        end if;
        if t_ini >= a_fim - interval '15 minutes' and (chegada_idx is null or i <= chegada_idx) then
          km_volta_real := km_volta_real + t_dist;
        end if;
      end if;
      viagens_out := viagens_out || jsonb_build_object(
        'ini', to_char(t_ini, 'YYYY-MM-DD"T"HH24:MI:SS'), 'fim', to_char(t_fim, 'YYYY-MM-DD"T"HH24:MI:SS'),
        'km', t_dist, 'vmax', t ->> 'vmax', 'de', t ->> 'de', 'para', t ->> 'para',
        'la1', t -> 'la1', 'lo1', t -> 'lo1', 'la2', t -> 'la2', 'lo2', t -> 'lo2',
        'fase', fase, 'fora_km', out_km, 'fora_min', round(out_secs / 60.0, 1),
        'fora_ini', case when out_km >= 0.3 then to_char(fora_ini, 'YYYY-MM-DD"T"HH24:MI:SS') end);
    end loop;

    v_retorno_prev := case when a_fim is not null then a_fim + (t_volta * interval '1 minute') end;
    atraso_ret := case when v_chegada_casa is not null and v_retorno_prev is not null
                       then round(extract(epoch from (v_chegada_casa - v_retorno_prev)) / 60.0)::int end;
    saida_ant := case when v_saida_casa is not null and a_ini is not null
                      then round(extract(epoch from ((a_ini - (t_ida * interval '1 minute')) - v_saida_casa)) / 60.0)::int end;

    -- Deslocamento de véspera: sem registro de trabalho no dia, dormiu longe da base por um trajeto direto.
    viagem_vespera := a_ini is null and desloc_km is not null and desloc_km >= 30
                      and v_km_dia <= desloc_km * p_fator * 1.6 + 20;

    if km_antes >= 1 then
      v_motivos := v_motivos || to_jsonb(format('Rodou %s km antes das %s, horário em que deveria sair de casa para o trabalho (%s min).',
        public.frotas_dossie_fmt(km_antes), to_char(w_ini, 'HH24:MI'), round(min_antes)));
    end if;
    if km_apos >= 1 then
      v_motivos := v_motivos || to_jsonb(case when w_ini is null
        then format('Rodou %s km em dia sem expediente registrado (sem informativo, produção ou sinal de trabalho).', public.frotas_dossie_fmt(km_apos))
        else format('Rodou %s km (%s min) depois das %s, limite para o veículo estar em casa.', public.frotas_dossie_fmt(km_apos), round(min_apos), to_char(w_fim, 'HH24:MI')) end);
    end if;
    if v_km_apos_chegada >= 0.5 then
      v_motivos := v_motivos || to_jsonb(format('Depois de chegar em casa às %s, voltou a usar o veículo: %s km em %s viagem(ns).',
        to_char(v_chegada_casa, 'HH24:MI'), public.frotas_dossie_fmt(v_km_apos_chegada), n_apos_chegada));
    end if;
    if v_km_noturno >= 1 then
      v_motivos := v_motivos || to_jsonb(format('Rodou %s km de madrugada ou à noite (entre 22h e 5h) fora do expediente.', public.frotas_dossie_fmt(v_km_noturno)));
    end if;
    if a_ini is null then
      v_motivos := v_motivos || to_jsonb('Neste dia não há informativo, produção nem sinal do celular fora de casa: foi usado o horário padrão (05:30 às 20:00, de segunda a sábado).'::text);
    end if;
    if viagem_vespera then
      v_motivos := v_motivos || to_jsonb(format('Dormiu a %s km de onde começou o dia, por um trajeto direto: pode ser deslocamento a serviço para o dia seguinte (conferir a programação).', round(desloc_km::numeric, 0)));
    end if;
    flag_percurso := false;
    if km_ida_real > 0 and d_ida is not null and km_ida_real > d_ida * p_fator * 1.6 + 5 then
      flag_percurso := true;
      v_motivos := v_motivos || to_jsonb(format('No caminho até o primeiro registro de trabalho rodou %s km; o trajeto direto seria cerca de %s km.',
        public.frotas_dossie_fmt(km_ida_real), public.frotas_dossie_fmt((d_ida * p_fator)::numeric)));
    end if;
    if km_volta_real > 0 and d_volta is not null and km_volta_real > d_volta * p_fator * 1.6 + 5 then
      flag_percurso := true;
      v_motivos := v_motivos || to_jsonb(format('Na volta para casa rodou %s km; o trajeto direto seria cerca de %s km.',
        public.frotas_dossie_fmt(km_volta_real), public.frotas_dossie_fmt((d_volta * p_fator)::numeric)));
    end if;
    if atraso_ret is not null and atraso_ret > p_tol_min then
      v_motivos := v_motivos || to_jsonb(format('Chegou em casa às %s, %s min depois do previsto (%s).',
        to_char(v_chegada_casa, 'HH24:MI'), atraso_ret, to_char(v_retorno_prev, 'HH24:MI')));
    end if;

    if cond_esc is not null and cond_confere is false then
      v_motivos := v_motivos || to_jsonb(format('Na Programação do dia o condutor deste veículo é %s, diferente do motorista cadastrado (%s).', cond_esc, mot));
    end if;

    vered := case
      when v_km_fora >= 25 or v_min_fora >= 120 or v_km_noturno >= 5 or v_km_apos_chegada >= 5 then 'FORA_HORARIO'
      when v_km_fora >= 5 or v_km_noturno >= 1 or v_km_apos_chegada >= 1 or flag_percurso or coalesce(atraso_ret, 0) > 60 then 'ATENCAO'
      else 'DENTRO_HORARIO' end;
    if viagem_vespera and vered = 'FORA_HORARIO' then vered := 'ATENCAO'; end if;

    placa := pl; motorista := mot; coordenacao := coord; supervisao := superv;
    veredito := vered; confianca := v_conf; criterio := v_crit; fonte_expediente := fonte;
    inicio_expediente := a_ini; fim_expediente := a_fim;
    primeiro_informativo := prim_inf; ultimo_informativo := ult_inf; qtd_informativos := coalesce(qtd_inf, 0);
    janela_inicio := w_ini; janela_fim := w_fim;
    km_dia := round(v_km_dia, 1); km_fora := round(v_km_fora, 1); min_fora := round(v_min_fora)::int;
    km_noturno := round(v_km_noturno, 1); km_apos_chegada := round(v_km_apos_chegada, 1);
    viagens_dia := v_n_dia; viagens_fora := v_n_fora;
    saida_casa := v_saida_casa; chegada_casa := v_chegada_casa; retorno_previsto := v_retorno_prev;
    atraso_retorno_min := atraso_ret;
    motivos := v_motivos;
    condutor_escalado := cond_esc; caronas := caronas_json;
    detalhes := jsonb_build_object(
      'programacao', jsonb_build_object('condutores', cond_esc, 'caronas', caronas_json, 'logistica', logistica_json, 'os', prog_os, 'divergente', cond_confere is false),
      'enderecos', enderecos,
      'tolerancia_min', p_tol_min, 'fator_rota', p_fator, 'vel_media_kmh', p_vel_kmh,
      't_ida_min', t_ida, 't_volta_min', t_volta,
      'km_ida', round(km_ida_real, 1), 'km_volta', round(km_volta_real, 1),
      'saida_antecipada_min', saida_ant, 'viagem_vespera', viagem_vespera,
      'deslocamento_base_km', round(desloc_km::numeric, 1),
      'casa_manha', jsonb_build_object('lat', casa_la, 'lng', casa_lo, 'endereco', casa_end),
      'casa_noite', jsonb_build_object('lat', noite_la, 'lng', noite_lo, 'endereco', noite_end),
      'primeiro_ponto', pini, 'ultimo_ponto', pfim,
      'evidencias', ev, 'viagens', viagens_out);
    return next;
  end loop;
end
$f$;

-- ---------------------------------------------------------------------------------------------
-- Gravação idempotente (cron e Edge Function com service_role).
-- ---------------------------------------------------------------------------------------------

create or replace function public.frotas_fora_horario_dossie_gerar(p_data date, p_placa text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd integer;
begin
  if p_data is null then
    raise exception 'Informe a data do dossiê.';
  end if;

  create temp table _dossie_novo on commit drop as
  select * from public.frotas_fora_horario_dossie_montar(p_data, p_placa);

  insert into public.frotas_fora_horario_dossie as d (
    data_evento, placa, motorista, coordenacao, supervisao, veredito, confianca, criterio, fonte_expediente,
    inicio_expediente, fim_expediente, primeiro_informativo, ultimo_informativo, qtd_informativos,
    janela_inicio, janela_fim, tolerancia_min, km_dia, km_fora, min_fora, km_noturno, km_apos_chegada,
    viagens_dia, viagens_fora, saida_casa, chegada_casa, retorno_previsto, atraso_retorno_min,
    motivos, detalhes, resumo_dia, condutor_escalado, caronas, calculado_em
  )
  select p_data, n.placa, n.motorista, n.coordenacao, n.supervisao, n.veredito, n.confianca, n.criterio, n.fonte_expediente,
         n.inicio_expediente, n.fim_expediente, n.primeiro_informativo, n.ultimo_informativo, n.qtd_informativos,
         n.janela_inicio, n.janela_fim, coalesce((n.detalhes ->> 'tolerancia_min')::int, 20), n.km_dia, n.km_fora, n.min_fora,
         n.km_noturno, n.km_apos_chegada, n.viagens_dia, n.viagens_fora, n.saida_casa, n.chegada_casa, n.retorno_previsto,
         n.atraso_retorno_min, n.motivos, n.detalhes,
         (select coalesce(jsonb_agg(jsonb_build_object(
            'i', round(extract(epoch from ((v ->> 'ini')::timestamp - p_data::timestamp)) / 60)::int,
            'f', round(extract(epoch from ((v ->> 'fim')::timestamp - p_data::timestamp)) / 60)::int,
            'k', (v ->> 'km')::numeric,
            'o', (v ->> 'fora_km')::numeric,
            's', case when v ->> 'fora_ini' is not null then round(extract(epoch from ((v ->> 'fora_ini')::timestamp - p_data::timestamp)) / 60)::int end,
            'x', case v ->> 'fase' when 'IDA' then 'I' when 'EXPEDIENTE' then 'E' when 'VOLTA' then 'V'
                   when 'ANTES_EXPEDIENTE' then 'A' when 'APOS_EXPEDIENTE' then 'P' when 'APOS_CHEGADA_EM_CASA' then 'C' end
          ) order by v ->> 'ini'), '[]'::jsonb)
          from jsonb_array_elements(n.detalhes -> 'viagens') v),
         n.condutor_escalado, n.caronas, now()
  from _dossie_novo n
  on conflict (data_evento, placa) do update set
    motorista = excluded.motorista, coordenacao = excluded.coordenacao, supervisao = excluded.supervisao,
    veredito = excluded.veredito, confianca = excluded.confianca, criterio = excluded.criterio,
    fonte_expediente = excluded.fonte_expediente, inicio_expediente = excluded.inicio_expediente,
    fim_expediente = excluded.fim_expediente, primeiro_informativo = excluded.primeiro_informativo,
    ultimo_informativo = excluded.ultimo_informativo, qtd_informativos = excluded.qtd_informativos,
    janela_inicio = excluded.janela_inicio, janela_fim = excluded.janela_fim, tolerancia_min = excluded.tolerancia_min,
    km_dia = excluded.km_dia, km_fora = excluded.km_fora, min_fora = excluded.min_fora,
    km_noturno = excluded.km_noturno, km_apos_chegada = excluded.km_apos_chegada,
    viagens_dia = excluded.viagens_dia, viagens_fora = excluded.viagens_fora,
    saida_casa = excluded.saida_casa, chegada_casa = excluded.chegada_casa, retorno_previsto = excluded.retorno_previsto,
    atraso_retorno_min = excluded.atraso_retorno_min, motivos = excluded.motivos, detalhes = excluded.detalhes,
    resumo_dia = excluded.resumo_dia, condutor_escalado = excluded.condutor_escalado, caronas = excluded.caronas,
    calculado_em = now();
  get diagnostics v_qtd = row_count;

  -- Remove dossiês de placas que deixaram de ter viagens no dia (reprocesso do relatório).
  delete from public.frotas_fora_horario_dossie d
  where d.data_evento = p_data
    and (p_placa is null or d.placa = p_placa)
    and not exists (select 1 from _dossie_novo n where n.placa = d.placa);

  drop table if exists _dossie_novo;
  return v_qtd;
end
$$;

revoke all on function public.frotas_fora_horario_dossie_montar(date, text, integer, numeric, numeric, numeric, time, time) from public, anon, authenticated;
revoke all on function public.frotas_fora_horario_dossie_gerar(date, text) from public, anon, authenticated;
grant execute on function public.frotas_fora_horario_dossie_montar(date, text, integer, numeric, numeric, numeric, time, time) to service_role;
grant execute on function public.frotas_fora_horario_dossie_gerar(date, text) to service_role;

-- A rotina diária (busca na BFleet + dossiê) foi para 20261013200000_frotas_fora_horario_pipeline_diario.sql.

-- ---------------------------------------------------------------------------------------------
-- Notificação "Gerar": a hora citada passa a ser a do 1º trecho FORA da janela do dossiê
-- (antes era a hora da 1ª viagem do relatório da BFleet, que podia ser do meio do expediente).
-- Sem dossiê para a placa/dia, o comportamento é o anterior. Resto da função idêntico ao de produção em 13/10/2026.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.frotas_fora_horario_acao(p_ocorrencia_id uuid, p_acao text, p_justificativa text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_row public.frotas_fora_horario_ocorrencias%rowtype;
  v_acao text := upper(trim(coalesce(p_acao,'')));
  v_usuario_id uuid := auth.uid();
  v_usuario_nome text;
  v_primeiro_nome text;
  v_mensagem text;
  v_queue public.frotas_fora_horario_caixa_lancamentos%rowtype;
  v_valor numeric(12,2);
  v_job_id uuid;
  v_hora text;
  v_now timestamptz := now();
begin
  if v_usuario_id is null then
    raise exception 'Sessão não encontrada.';
  end if;

  if not public.frotas_usuario_tem_acesso() then
    raise exception 'Usuário sem acesso ao módulo de Frotas.';
  end if;

  if v_acao not in ('GERAR','JUSTIFICAR','CAIXA') then
    raise exception 'Ação inválida.';
  end if;

  select coalesce(nullif(trim(u.nome),''), nullif(trim(u.email),''), auth.email(), v_usuario_id::text)
    into v_usuario_nome
  from public.app_usuarios u
  where u.auth_user_id = v_usuario_id
     or lower(u.email) = lower(coalesce(auth.email(),''))
  order by (u.auth_user_id = v_usuario_id) desc
  limit 1;

  v_usuario_nome := coalesce(v_usuario_nome, auth.email(), v_usuario_id::text);

  select *
    into v_row
  from public.frotas_fora_horario_ocorrencias
  where id = p_ocorrencia_id
  for update;

  if not found then
    raise exception 'Ocorrência não encontrada.';
  end if;

  if v_acao = 'GERAR' then
    if coalesce(trim(v_row.motorista),'') = '' then
      raise exception 'Motorista não identificado para esta ocorrência.';
    end if;
    if coalesce(trim(v_row.hora_inicio),'') = '' then
      raise exception 'Horário inicial ainda não foi calculado.';
    end if;

    select to_char((v.value ->> 'fora_ini')::timestamp, 'HH24:MI')
      into v_hora
    from public.frotas_fora_horario_dossie dos
    cross join lateral jsonb_array_elements(dos.detalhes -> 'viagens') v
    where dos.data_evento = v_row.data_evento
      and dos.placa = v_row.placa
      and (v.value ->> 'fora_ini') is not null
    order by v.value ->> 'fora_ini'
    limit 1;
    v_hora := coalesce(v_hora, substring(v_row.hora_inicio from 1 for 5));

    v_primeiro_nome := initcap(lower(split_part(trim(v_row.motorista), ' ', 1)));
    v_mensagem :=
      'Notificação: Uso de Veículo da Empresa Fora do Expediente' || E'\n\n' ||
      'Prezado ' || v_primeiro_nome || '!' || E'\n\n' ||
      'Identificamos a utilização do veículo da empresa, placa ' || upper(v_row.placa) ||
      ', fora do horário de expediente, no dia ' || to_char(v_row.data_evento, 'DD/MM/YY') ||
      ', às ' || v_hora || 'h.' || E'\n\n' ||
      'Conforme a política interna da Grão1000, a utilização dos veículos da empresa fora do horário de expediente somente é permitida mediante autorização prévia da gestão.' || E'\n\n' ||
      'Solicitamos os devidos esclarecimentos e a apresentação da justificativa referente à utilização do veículo nesse período.' || E'\n\n' ||
      'Informamos também que será realizado o levantamento da quilometragem percorrida indevidamente entre 00h e 05h. O total de quilômetros identificado será multiplicado pelo valor de R$ 4,00 por km, e o valor correspondente será lançado em seu Caixa.' || E'\n\n' ||
      'Atenciosamente,' || E'\n\n' ||
      'Setor de Frota' || E'\n' ||
      'Grão1000';

    update public.frotas_fora_horario_ocorrencias
       set status_notificacao = 'GERADA',
           mensagem_gerada = v_mensagem,
           gerado_em = v_now,
           gerado_por = v_usuario_id,
           gerado_por_nome = v_usuario_nome,
           updated_at = v_now
     where id = v_row.id;

    return jsonb_build_object(
      'ok', true,
      'action', 'GERAR',
      'message', v_mensagem,
      'id', v_row.id
    );
  end if;

  if v_acao = 'JUSTIFICAR' then
    if coalesce(trim(p_justificativa),'') = '' then
      raise exception 'Informe a justificativa.';
    end if;

    if upper(coalesce(v_row.status_caixa,'')) in ('PENDENTE','PROCESSANDO','LANCADO') then
      raise exception 'Esta ocorrência já foi enviada ao Caixa e não pode ser marcada como justificada.';
    end if;

    update public.frotas_fora_horario_ocorrencias
       set status_notificacao = 'JUSTIFICADA',
           justificativa = trim(p_justificativa),
           justificado_em = v_now,
           justificado_por = v_usuario_id,
           justificado_por_nome = v_usuario_nome,
           updated_at = v_now
     where id = v_row.id;

    return jsonb_build_object(
      'ok', true,
      'action', 'JUSTIFICAR',
      'id', v_row.id
    );
  end if;

  if upper(coalesce(v_row.status_notificacao,'')) = 'JUSTIFICADA' then
    raise exception 'Ocorrência justificada não pode ser enviada ao Caixa.';
  end if;
  if coalesce(trim(v_row.motorista),'') = '' then
    raise exception 'Motorista não identificado para lançamento no Caixa.';
  end if;
  if coalesce(v_row.km_00_05,0) <= 0 then
    raise exception 'Quilometragem entre 00h e 05h ainda não foi calculada.';
  end if;

  v_valor := round(v_row.km_00_05 * 4.00, 2);

  select *
    into v_queue
  from public.frotas_fora_horario_caixa_lancamentos
  where ocorrencia_id = v_row.id
  for update;

  if found then
    if v_queue.status in ('ERRO','CANCELADO') then
      update public.frotas_fora_horario_caixa_lancamentos
         set status = 'PENDENTE',
             tentativas = 0,
             ultimo_erro = null,
             iniciado_em = null,
             processado_em = null,
             solicitado_por = v_usuario_id,
             solicitado_por_nome = v_usuario_nome,
             solicitado_em = v_now,
             updated_at = v_now
       where id = v_queue.id
       returning * into v_queue;
    end if;
  else
    insert into public.frotas_fora_horario_caixa_lancamentos (
      ocorrencia_id,
      data_evento,
      placa,
      colaborador_nome,
      nome_normalizado,
      km_00_05,
      valor_km,
      valor,
      descricao,
      status,
      solicitado_por,
      solicitado_por_nome,
      solicitado_em,
      updated_at
    ) values (
      v_row.id,
      v_row.data_evento,
      upper(v_row.placa),
      trim(v_row.motorista),
      regexp_replace(
        upper(translate(trim(v_row.motorista),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
        '[^A-Z0-9]+',' ','g'
      ),
      v_row.km_00_05,
      4.00,
      v_valor,
      'Frotas - Uso de veículo fora do expediente - placa ' || upper(v_row.placa) ||
      ' - ' || to_char(v_row.data_evento,'DD/MM/YYYY') ||
      ' - ' || replace(to_char(v_row.km_00_05,'FM999999990.000'),'.',',') || ' km x R$ 4,00/km',
      'PENDENTE',
      v_usuario_id,
      v_usuario_nome,
      v_now,
      v_now
    )
    returning * into v_queue;
  end if;

  update public.frotas_fora_horario_ocorrencias
     set status_caixa = v_queue.status,
         caixa_solicitado_em = coalesce(caixa_solicitado_em, v_now),
         caixa_solicitado_por = coalesce(caixa_solicitado_por, v_usuario_id),
         caixa_solicitado_por_nome = coalesce(caixa_solicitado_por_nome, v_usuario_nome),
         caixa_lancamento_id = v_queue.id,
         updated_at = v_now
   where id = v_row.id;

  if v_queue.status = 'PENDENTE' then
    select j.id
      into v_job_id
    from public.grm_sync_jobs j
    where j.agente_id = 'sync-frotas-fora-horario-caixa'
      and j.status in ('pendente','rodando')
    order by j.created_at
    limit 1;

    if v_job_id is null then
      insert into public.grm_sync_jobs (
        agente_id,
        status,
        solicitado_por,
        solicitado_em,
        payload
      ) values (
        'sync-frotas-fora-horario-caixa',
        'pendente',
        v_usuario_nome,
        v_now,
        jsonb_build_object('origem','frotas_fora_horario','ocorrencia_id',v_row.id)
      )
      returning id into v_job_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'CAIXA',
    'queue_id', v_queue.id,
    'job_id', v_job_id,
    'status', v_queue.status,
    'km', v_row.km_00_05,
    'valor_km', 4.00,
    'valor', v_valor
  );
end;
$function$;
