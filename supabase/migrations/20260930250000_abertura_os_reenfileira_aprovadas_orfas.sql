-- Reenfileira sync-abrir-os quando há solicitações APROVADAS sem job na fila.
--
-- Caso real (30/09): o job falhou com captcha_invalid antes do token do dia ser
-- gravado; a falha acontece antes do script marcar a solicitação, que ficou em
-- APROVADO ("Aguardando agente") sem nenhum job pendente/rodando — ninguém mais
-- a reprocessava. O script grmserver-abrir-os-api.js já processa qualquer
-- solicitação em APROVADO, então basta ter um job na fila.
--
-- Regras (rodando a cada 5 min via pg_cron):
--   - só se o agente sync-abrir-os estiver habilitado;
--   - só solicitações APROVADO há mais de 3 min (dá tempo do job normal pegar);
--   - nada se já existe job pendente/rodando de sync-abrir-os;
--   - espaça 15 min entre reenfileiramentos (login GRM recusado entra em pausa
--     de 10 min no cache de token, e assim não enche a fila durante o bloqueio).

create or replace function public.grm_abertura_os_reenfileirar_orfas()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ativo boolean;
  v_qtd integer;
  v_job_id uuid;
begin
  select coalesce(bool_or(enabled), true) into v_ativo
  from public.grm_sync_agent_settings where agent_id = 'sync-abrir-os';
  if not v_ativo then
    return 'agente desabilitado';
  end if;

  select count(*) into v_qtd
  from public.logistica_abertura_os
  where status = 'APROVADO'
    and coalesce(aprovado_em, updated_at) < now() - interval '3 minutes';
  if v_qtd = 0 then
    return 'ok (nenhuma aprovada parada)';
  end if;

  if exists (
    select 1 from public.grm_sync_jobs
    where agente_id = 'sync-abrir-os'
      and (status in ('pendente', 'rodando') or created_at > now() - interval '15 minutes')
  ) then
    return 'aguardando (job recente ou em andamento)';
  end if;

  insert into public.grm_sync_jobs (agente_id, status)
  values ('sync-abrir-os', 'pendente')
  returning id into v_job_id;

  update public.logistica_abertura_os
     set agente_job_id = v_job_id
   where status = 'APROVADO'
     and coalesce(aprovado_em, updated_at) < now() - interval '3 minutes';

  return 'reenfileirado ' || v_qtd || ' solicitacao(oes) job ' || v_job_id;
end;
$$;

revoke all on function public.grm_abertura_os_reenfileirar_orfas() from public, anon, authenticated;

select cron.schedule('grm-abertura-os-reenfileirar-orfas-5min', '*/5 * * * *',
  $cron$select public.grm_abertura_os_reenfileirar_orfas();$cron$);
