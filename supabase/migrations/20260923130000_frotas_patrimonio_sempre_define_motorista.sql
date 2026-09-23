-- Decisão 23/09: o condutor do Patrimônio sempre define frotas_veiculos.motorista_atual.
-- Antes, edição manual divergente prevalecia (14 veículos ficaram "divergentes"). Agora
-- só se mantém o motorista atual quando o patrimônio não informa funcionário.

create or replace function public.sincronizar_frotas_veiculos_patrimonios()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total_snapshot integer := 0;
  v_total_atualizados integer := 0;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  select count(*) into v_total_snapshot from public.patrimonios_snapshot;

  if v_total_snapshot = 0 then
    return jsonb_build_object('veiculos_atualizados', 0, 'patrimonios_processados', 0);
  end if;

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
           -- Patrimônio sempre vence; sem funcionário informado, mantém o atual.
           motorista_atual = coalesce(nullif(trim(p.funcionario), ''), v.motorista_atual),
           condutor_patrimonio = nullif(trim(p.funcionario), ''),
           coordenacao = coalesce(nullif(trim(v.coordenacao), ''), nullif(trim(p.coordenacao), ''), v.coordenacao),
           supervisao = coalesce(nullif(trim(v.supervisao), ''), nullif(trim(p.supervisao), ''), v.supervisao)
      from patrimonio_mais_recente p
     where regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') = p.placa_normalizada
    returning v.id
  )
  select count(*) into v_total_atualizados from atualizados;

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

-- Alinha agora os veículos que estavam com motorista manual divergente.
update public.frotas_veiculos
   set motorista_atual = patrimonio_funcionario,
       condutor_divergente = false
 where nullif(trim(patrimonio_funcionario), '') is not null
   and motorista_atual is distinct from patrimonio_funcionario;
