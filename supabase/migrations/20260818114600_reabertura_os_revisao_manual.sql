-- Reabertura corretiva de O.S.: casos faturados não devem ser reabertos automaticamente.

alter table public.grm_reabertura_os_fila
  drop constraint if exists grm_reabertura_os_fila_status_check;

alter table public.grm_reabertura_os_fila
  add constraint grm_reabertura_os_fila_status_check
  check (
    status = any (
      array[
        'PENDENTE_REABERTURA'::text,
        'EM_REABERTURA'::text,
        'REABERTA'::text,
        'IGNORADA'::text,
        'ERRO'::text,
        'RESOLVIDA_SEM_REABERTURA'::text,
        'REVISAO_MANUAL'::text
      ]
    )
  );

create or replace function public.finalizar_grm_reabertura_os(
  p_fila_id uuid,
  p_status text,
  p_erro text default null::text,
  p_observacao text default null::text
)
returns public.grm_reabertura_os_fila
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.grm_reabertura_os_fila;
  v_requested text := upper(trim(coalesce(p_status,'')));
  v_status text;
begin
  v_status := case v_requested
    when 'JA_REABERTA' then 'REABERTA'
    when 'ERRO_REABERTURA' then 'ERRO'
    when 'PROCESSANDO' then 'EM_REABERTURA'
    else v_requested
  end;

  if v_status not in (
    'PENDENTE_REABERTURA',
    'EM_REABERTURA',
    'REABERTA',
    'IGNORADA',
    'ERRO',
    'RESOLVIDA_SEM_REABERTURA',
    'REVISAO_MANUAL'
  ) then
    raise exception 'Status inválido para reabertura: %', p_status;
  end if;

  update public.grm_reabertura_os_fila
  set status=v_status,
      erro=nullif(p_erro,''),
      observacao=coalesce(nullif(p_observacao,''),observacao),
      reaberto_em=case
        when v_status='REABERTA' then coalesce(reaberto_em,now())
        else reaberto_em
      end,
      updated_at=now()
  where id=p_fila_id
  returning * into v_row;

  return v_row;
end;
$function$;
