-- Faz o motorista vindo do Patrimonio acompanhar trocas reais de placa/condutor
-- e garante que o processador legado da BFleet enxergue o ID canonico do veiculo.

-- Registra a origem atual antes de substituir a rotina. Isso permite distinguir
-- veiculos que estavam seguindo Patrimonio de edicoes manuais divergentes.
update public.frotas_veiculos
   set condutor_patrimonio = nullif(trim(patrimonio_funcionario), '')
 where nullif(trim(condutor_patrimonio), '') is null
   and nullif(trim(patrimonio_funcionario), '') is not null;

create or replace function public.sincronizar_frotas_veiculos_patrimonios()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_total_snapshot integer := 0;
  v_total_atualizados integer := 0;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  select count(*)
    into v_total_snapshot
    from public.patrimonios_snapshot;

  if v_total_snapshot = 0 then
    return jsonb_build_object(
      'veiculos_atualizados', 0,
      'patrimonios_processados', 0
    );
  end if;

  -- Limpa somente o retrato corrente. condutor_patrimonio fica preservado aqui
  -- para sabermos qual era o ultimo condutor que alimentava motorista_atual.
  update public.frotas_veiculos
     set patrimonio_codigo = null,
         patrimonio_ultima_leitura = null,
         patrimonio_dias_sem_leitura = null,
         patrimonio_funcionario = null,
         patrimonio_coordenacao = null,
         patrimonio_supervisao = null,
         condutor_divergente = false
   where patrimonio_codigo is not null
      or patrimonio_ultima_leitura is not null
      or patrimonio_dias_sem_leitura is not null
      or patrimonio_funcionario is not null
      or patrimonio_coordenacao is not null
      or patrimonio_supervisao is not null
      or condutor_divergente is true;

  with candidatos as (
    select
      p.*,
      regexp_replace(
        coalesce(
          (regexp_match(
            upper(coalesce(p.identificacao, '')),
            '([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})'
          ))[1],
          ''
        ),
        '[^A-Z0-9]',
        '',
        'g'
      ) as placa_normalizada
    from public.patrimonios_snapshot p
  ),
  patrimonio_mais_recente as (
    select distinct on (placa_normalizada)
      placa_normalizada,
      patrimonio_codigo,
      ultima_leitura,
      dias_sem_leitura,
      funcionario,
      coordenacao,
      supervisao
    from candidatos
    where length(placa_normalizada) = 7
    order by
      placa_normalizada,
      data_upload desc nulls last,
      ultima_leitura desc nulls last
  ),
  atualizados as (
    update public.frotas_veiculos v
       set patrimonio_codigo = p.patrimonio_codigo,
           patrimonio_ultima_leitura = p.ultima_leitura,
           patrimonio_dias_sem_leitura = p.dias_sem_leitura,
           patrimonio_funcionario = nullif(trim(p.funcionario), ''),
           patrimonio_coordenacao = p.coordenacao,
           patrimonio_supervisao = p.supervisao,
           -- Se estava vazio ou acompanhava o ultimo condutor do Patrimonio,
           -- passa a acompanhar o condutor atual. Se divergiu manualmente,
           -- a edicao manual continua prevalecendo.
           motorista_atual = case
             when nullif(trim(p.funcionario), '') is null then v.motorista_atual
             when nullif(trim(v.motorista_atual), '') is null then nullif(trim(p.funcionario), '')
             when nullif(trim(v.condutor_patrimonio), '') is not null
              and upper(regexp_replace(unaccent(trim(v.motorista_atual)), '\s+', ' ', 'g'))
                  = upper(regexp_replace(unaccent(trim(v.condutor_patrimonio)), '\s+', ' ', 'g'))
               then nullif(trim(p.funcionario), '')
             else v.motorista_atual
           end,
           condutor_patrimonio = nullif(trim(p.funcionario), ''),
           coordenacao = coalesce(nullif(trim(v.coordenacao), ''), nullif(trim(p.coordenacao), ''), v.coordenacao),
           supervisao = coalesce(nullif(trim(v.supervisao), ''), nullif(trim(p.supervisao), ''), v.supervisao)
      from patrimonio_mais_recente p
     where regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') = p.placa_normalizada
    returning v.id
  )
  select count(*)
    into v_total_atualizados
    from atualizados;

  -- Marca divergencia apenas quando existe um condutor corrente no Patrimonio.
  update public.frotas_veiculos
     set condutor_divergente = (
       nullif(trim(patrimonio_funcionario), '') is not null
       and nullif(trim(motorista_atual), '') is not null
       and upper(regexp_replace(unaccent(trim(motorista_atual)), '\s+', ' ', 'g'))
           <> upper(regexp_replace(unaccent(trim(patrimonio_funcionario)), '\s+', ' ', 'g'))
     )
   where patrimonio_codigo is not null
      or patrimonio_funcionario is not null;

  return jsonb_build_object(
    'veiculos_atualizados', v_total_atualizados,
    'patrimonios_processados', v_total_snapshot
  );
end;
$function$;

comment on function public.sincronizar_frotas_veiculos_patrimonios() is
'Cruza Patrimonio por placa. Se motorista_atual ainda seguia o ultimo condutor do Patrimonio, acompanha a troca e dispara a fila BFleet; divergencias manuais sao preservadas.';

-- O Edge update-bfleet-condutores historicamente le bfleet_id, enquanto a
-- sincronizacao mais nova grava bfleet_vehicle_id. Mantemos os dois aliases
-- alinhados para que uma placa ja identificada nao dependa de vehicleGetAll.
create or replace function public.sincronizar_alias_bfleet_vehicle_id()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if nullif(trim(new.bfleet_vehicle_id), '') is not null then
    new.bfleet_id := trim(new.bfleet_vehicle_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sincronizar_alias_bfleet_vehicle_id on public.frotas_veiculos;
create trigger trg_sincronizar_alias_bfleet_vehicle_id
before insert or update of bfleet_vehicle_id
on public.frotas_veiculos
for each row
execute function public.sincronizar_alias_bfleet_vehicle_id();

update public.frotas_veiculos
   set bfleet_id = trim(bfleet_vehicle_id)
 where nullif(trim(bfleet_vehicle_id), '') is not null
   and bfleet_id is distinct from trim(bfleet_vehicle_id);

-- Reabre somente erros que eram de localizacao do veiculo e que agora possuem
-- bfleet_vehicle_id conhecido; os demais erros permanecem intactos.
update public.frotas_bfleet_condutores_fila q
   set status = 'PENDENTE',
       tentativas = 0,
       erro = null,
       updated_at = now()
  from public.frotas_veiculos v
 where v.id = q.veiculo_id
   and q.status = 'ERRO'
   and nullif(trim(v.bfleet_vehicle_id), '') is not null
   and (
     coalesce(q.erro, '') ilike '%vehicleGetAll%'
     or coalesce(q.erro, '') ilike '%não localizei o veículo%'
     or coalesce(q.erro, '') ilike '%nao localizei o veiculo%'
   );

update public.frotas_veiculos v
   set bfleet_condutor_status = 'PENDENTE',
       bfleet_condutor_erro = null
 where exists (
   select 1
     from public.frotas_bfleet_condutores_fila q
    where q.veiculo_id = v.id
      and q.status = 'PENDENTE'
 );