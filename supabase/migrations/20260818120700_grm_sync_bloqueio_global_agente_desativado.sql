create or replace function public.grm_sync_guard_disabled_agent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
begin
  select s.enabled
    into v_enabled
  from public.grm_sync_agent_settings s
  where s.agent_id = new.agente_id;

  if v_enabled is false then
    raise exception 'Agente % está desativado em grm_sync_agent_settings; job bloqueado.', new.agente_id
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_grm_sync_guard_disabled_agent on public.grm_sync_jobs;
create trigger trg_grm_sync_guard_disabled_agent
before insert or update of agente_id on public.grm_sync_jobs
for each row
execute function public.grm_sync_guard_disabled_agent();

create or replace function public.grm_sync_cancel_pending_on_disable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$;
begin
  if old.enabled is distinct from false and new.enabled is false then
    update public.grm_sync_jobs
       set status = 'erro',
           erro = coalesce(erro, '') || case when coalesce(erro, '') = '' then '' else E'\n' end ||
                  'Cancelado automaticamente: agente desativado em grm_sync_agent_settings.',
           finalizado_em = coalesce(finalizado_em, now())
     where agente_id = new.agent_id
       and status = 'pendente';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_grm_sync_cancel_pending_on_disable on public.grm_sync_agent_settings;
create trigger trg_grm_sync_cancel_pending_on_disable
after update of enabled on public.grm_sync_agent_settings
for each row
execute function public.grm_sync_cancel_pending_on_disable();
