create or replace function public.proteger_atualizacoes_manuais_frotas_veiculos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sync_detran boolean;
  v_sync_bfleet boolean;
begin
  -- Integrações externas devem atualizar seus próprios campos, sem reverter
  -- informações operacionais que já existem no cadastro do painel.
  v_sync_detran :=
       new.detran_ultima_consulta_em is distinct from old.detran_ultima_consulta_em
    or new.detran_raw is distinct from old.detran_raw
    or new.detran_status is distinct from old.detran_status
    or new.detran_confirmado is distinct from old.detran_confirmado;

  v_sync_bfleet :=
       new.bfleet_ultima_sync_em is distinct from old.bfleet_ultima_sync_em
    or new.bfleet_ultima_sincronizacao_em is distinct from old.bfleet_ultima_sincronizacao_em
    or new.bfleet_sync_at is distinct from old.bfleet_sync_at
    or new.bfleet_raw is distinct from old.bfleet_raw
    or new.bfleet_status is distinct from old.bfleet_status
    or new.rastreador_bfleet is distinct from old.rastreador_bfleet
    or new.bfleet_confirmado is distinct from old.bfleet_confirmado;

  if v_sync_detran or v_sync_bfleet then
    new.placa := old.placa;
    new.renavam := old.renavam;
    new.nome := old.nome;
    new.empresa := old.empresa;
    new.cnpj := old.cnpj;
    new.marca := old.marca;
    new.modelo := old.modelo;
    new.cor := old.cor;
    new.ano := old.ano;
    new.tipo := old.tipo;
    new.coordenacao := old.coordenacao;
    new.supervisao := old.supervisao;
    new.motorista_atual := old.motorista_atual;
    new.hodometro := old.hodometro;
    new.valor_mensal := old.valor_mensal;
    new.dia_vencimento := old.dia_vencimento;
    new.valor_km := old.valor_km;
    new.status := old.status;
    new.observacoes := old.observacoes;
    new.origem_importacao := old.origem_importacao;
  end if;

  return new;
end;
$$;

comment on function public.proteger_atualizacoes_manuais_frotas_veiculos() is
'Impede sincronizacoes DETRAN/BFleet de sobrescrever campos operacionais editados no painel. As integracoes continuam livres para atualizar seus campos detran_*, bfleet_* e demais campos tecnicos.';

drop trigger if exists trg_proteger_atualizacoes_manuais_frotas_veiculos on public.frotas_veiculos;

create trigger trg_proteger_atualizacoes_manuais_frotas_veiculos
before update on public.frotas_veiculos
for each row
execute function public.proteger_atualizacoes_manuais_frotas_veiculos();

create or replace function public.sincronizar_frotas_veiculos_patrimonios()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  update public.frotas_veiculos
     set patrimonio_codigo = null,
         patrimonio_ultima_leitura = null,
         patrimonio_dias_sem_leitura = null,
         patrimonio_funcionario = null,
         patrimonio_coordenacao = null,
         patrimonio_supervisao = null
   where patrimonio_codigo is not null
      or patrimonio_ultima_leitura is not null
      or patrimonio_dias_sem_leitura is not null
      or patrimonio_funcionario is not null
      or patrimonio_coordenacao is not null
      or patrimonio_supervisao is not null;

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
           patrimonio_funcionario = p.funcionario,
           patrimonio_coordenacao = p.coordenacao,
           patrimonio_supervisao = p.supervisao,
           -- O cadastro manual tem precedencia. Patrimonio apenas preenche lacunas.
           motorista_atual = coalesce(nullif(trim(v.motorista_atual), ''), nullif(trim(p.funcionario), ''), v.motorista_atual),
           coordenacao = coalesce(nullif(trim(v.coordenacao), ''), nullif(trim(p.coordenacao), ''), v.coordenacao),
           supervisao = coalesce(nullif(trim(v.supervisao), ''), nullif(trim(p.supervisao), ''), v.supervisao)
      from patrimonio_mais_recente p
     where regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') = p.placa_normalizada
    returning v.id
  )
  select count(*)
    into v_total_atualizados
    from atualizados;

  return jsonb_build_object(
    'veiculos_atualizados', v_total_atualizados,
    'patrimonios_processados', v_total_snapshot
  );
end;
$$;

comment on function public.sincronizar_frotas_veiculos_patrimonios() is
'Atualiza campos de patrimonio e preenche motorista/coordenacao/supervisao somente quando o cadastro operacional estiver vazio, preservando edicoes manuais.';
