-- Conversão automática de endereço em GPS depois da importação diária do Uber.
--
-- Cada corrida nova que entra em conferencia_uber_corridas (SFTP ~05h, ou a sincronização
-- pela API) sem coordenada de partida e ainda pendente entra em uber_gps_fila e pede um job
-- do agente sync-uber-geocodificar. O agente converte partida e destino e roda
-- uber_validar_por_os_laudo (valida sozinho quando há O.S. com laudo do colaborador a até
-- 2 km) — o mesmo que o botão "Converter GPS pendentes" já fazia, agora sem clique.
--
-- Não pega gorjeta (external_id ":TIP:", tratada à parte) nem corrida que já chegou
-- validada/no caixa. O gatilho nunca pode derrubar a importação: qualquer erro vira WARNING.
-- Corrida que não converte (endereço ruim) fica com o motivo na Observação e pode ser
-- reenviada pelo botão "GPS".

create or replace function public.uber_gps_enfileirar_importacao()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_novas integer := 0;
begin
  begin
    if new.partida_latitude is not null
       or nullif(btrim(coalesce(new.endereco_partida, '')), '') is null
       or coalesce(new.status_validacao, '') not in ('PENDENTE', 'ATENCAO', 'ATENÇÃO') then
      return new;
    end if;

    insert into public.uber_gps_fila (corrida_id, status, incluir_destino)
    values (new.id, 'PENDENTE', true)
    on conflict (corrida_id) do nothing;
    get diagnostics v_novas = row_count;

    if v_novas > 0 then
      perform public.uber_gps_solicitar_job('uber_gps_importacao');
    end if;
  exception when others then
    raise warning 'uber_gps_enfileirar_importacao falhou (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists uber_gps_enfileirar_importacao on public.conferencia_uber_corridas;
create trigger uber_gps_enfileirar_importacao
  after insert on public.conferencia_uber_corridas
  for each row
  when (
    new.partida_latitude is null
    and new.endereco_partida is not null
    and coalesce(new.external_id, '') not like '%:TIP:%'
  )
  execute function public.uber_gps_enfileirar_importacao();
