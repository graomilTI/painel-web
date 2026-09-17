-- CARONA FROTA passa a ser definida pela placa informada na própria linha.
-- Mantém a validação de veículo ativo da supervisão em Patrimônios, mas não
-- exige outra linha MOTORISTA FROTA para a mesma placa.
--
-- O nome legado da função é preservado porque o trigger remoto já aponta para
-- ela; CREATE OR REPLACE atualiza a regra sem recriar o vínculo do trigger.

create or replace function public.validar_carona_frota_com_motorista_programado()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tipo text;
  v_placa text;
  v_supervisao text;
begin
  v_tipo := upper(trim(coalesce(new.tipo_deslocamento, '')));
  v_placa := regexp_replace(upper(coalesce(new.placa_veiculo, '')), '[^A-Z0-9]', '', 'g');

  select coalesce(nullif(trim(pc.supervisao), ''), nullif(trim(pd.supervisao), ''))
    into v_supervisao
  from public.programacao_dia pd
  left join public.programacao_colaboradores pc
    on pc.programacao_id = new.programacao_id
   and pc.colaborador_id = new.colaborador_id
  where pd.id = new.programacao_id
  limit 1;

  if v_tipo in ('MOTORISTA FROTA', 'CARONA FROTA') then
    if v_placa = '' then
      raise exception using
        errcode = '23514',
        message = format('%s exige selecionar uma placa ativa da supervisão em Patrimônios.', v_tipo);
    end if;

    if coalesce(trim(v_supervisao), '') = '' then
      raise exception using
        errcode = '23514',
        message = format('%s inválido: não foi possível identificar a supervisão desta programação.', v_tipo);
    end if;

    if not exists (
      select 1
      from public.vw_patrimonios_atual p
      where upper(trim(coalesce(p.categoria, ''))) = 'VEICULOS'
        and upper(trim(coalesce(p.situacao, ''))) = 'ATIVO'
        and upper(trim(coalesce(p.supervisao, ''))) = upper(trim(v_supervisao))
        and left(regexp_replace(upper(coalesce(p.identificacao, '')), '[^A-Z0-9]', '', 'g'), 7) = v_placa
    ) then
      raise exception using
        errcode = '23514',
        message = format('Placa %s indisponível: não consta como veículo ATIVO da supervisão %s em Patrimônios.', v_placa, v_supervisao);
    end if;
  end if;

  return new;
end;
$function$;
