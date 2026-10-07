-- Processamento automático da fila de Notas Fiscais / Holerites / Comprovantes.
--
-- Antes: o upload (painel > Enviar Notas Fiscais) só gravava a linha NOVO em
-- grm_nf_lancamentos; quem criava o job do agente era o botão "Processamento"
-- (07/10: RH enviou 5 holerites e ficaram parados até alguém clicar).
--
-- Agora o banco enfileira sozinho, seja qual for a entrada (upload, "completar
-- dados", relançar, Compras, Hospedagem):
--   1) gatilho: linha entra (ou volta) em NOVO -> job sync-lancar-notas-fiscais;
--      comprovante entra (ou volta) em NOVO/VALIDADO em grm_nf_baixas -> job
--      sync-baixa-notas-fiscais. Nada é criado se já há job pendente/rodando
--      (o agente se reenfileira sozinho enquanto sobrar item — auto-continuação);
--   2) cron de segurança (5 min): se sobrou item parado há mais de 2 min sem job
--      ativo (ex.: job caiu por token do GRM vencido), reenfileira — no máximo
--      1 vez a cada 10 min por agente, pra não encher a fila durante um bloqueio.
-- Respeita grm_sync_agent_settings.enabled quando o agente tiver linha lá.

create or replace function private.nf_enfileirar_agente(p_agente text, p_origem text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not coalesce((select bool_or(enabled) from public.grm_sync_agent_settings where agent_id = p_agente), true) then
    return;
  end if;

  insert into public.grm_sync_jobs (agente_id, status, lane, solicitado_por, payload)
  select p_agente, 'pendente', 'alteracoes', p_origem, jsonb_build_object('origem', p_origem)
  where not exists (
    select 1 from public.grm_sync_jobs
    where agente_id = p_agente and status in ('pendente', 'rodando')
  );
end;
$$;

create or replace function private.nf_lancamento_enfileirar_job()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'NOVO' and (tg_op = 'INSERT' or old.status is distinct from 'NOVO') then
    perform private.nf_enfileirar_agente(
      'sync-lancar-notas-fiscais',
      coalesce(lower(nullif(new.extraido_json ->> 'origem', '')), 'upload') || '-auto'
    );
  end if;
  return new;
end;
$$;

create or replace function private.nf_baixa_enfileirar_job()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status in ('NOVO', 'VALIDADO') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.nf_enfileirar_agente('sync-baixa-notas-fiscais', 'baixa-auto');
  end if;
  return new;
end;
$$;

revoke all on function private.nf_enfileirar_agente(text, text) from public, anon, authenticated;
revoke all on function private.nf_lancamento_enfileirar_job() from public, anon, authenticated;
revoke all on function private.nf_baixa_enfileirar_job() from public, anon, authenticated;

drop trigger if exists grm_nf_lancamentos_enfileirar_job on public.grm_nf_lancamentos;
create trigger grm_nf_lancamentos_enfileirar_job
  after insert or update of status on public.grm_nf_lancamentos
  for each row execute function private.nf_lancamento_enfileirar_job();

drop trigger if exists grm_nf_baixas_enfileirar_job on public.grm_nf_baixas;
create trigger grm_nf_baixas_enfileirar_job
  after insert or update of status on public.grm_nf_baixas
  for each row execute function private.nf_baixa_enfileirar_job();

create or replace function public.nf_processamento_reenfileirar_paradas()
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_msgs text[] := '{}';
begin
  if exists (
    select 1 from public.grm_nf_lancamentos
    where status = 'NOVO' and coalesce(updated_at, created_at) < now() - interval '2 minutes'
  ) and not exists (
    select 1 from public.grm_sync_jobs
    where agente_id = 'sync-lancar-notas-fiscais'
      and (status in ('pendente', 'rodando') or created_at > now() - interval '10 minutes')
  ) then
    perform private.nf_enfileirar_agente('sync-lancar-notas-fiscais', 'cron-auto');
    v_msgs := v_msgs || 'lancamentos reenfileirados';
  end if;

  if exists (
    select 1 from public.grm_nf_baixas
    where status in ('NOVO', 'VALIDADO') and coalesce(updated_at, created_at) < now() - interval '2 minutes'
  ) and not exists (
    select 1 from public.grm_sync_jobs
    where agente_id = 'sync-baixa-notas-fiscais'
      and (status in ('pendente', 'rodando') or created_at > now() - interval '10 minutes')
  ) then
    perform private.nf_enfileirar_agente('sync-baixa-notas-fiscais', 'cron-auto');
    v_msgs := v_msgs || 'baixas reenfileiradas';
  end if;

  return case when cardinality(v_msgs) = 0 then 'ok (nada parado)' else array_to_string(v_msgs, ', ') end;
end;
$$;

revoke all on function public.nf_processamento_reenfileirar_paradas() from public, anon, authenticated;

select cron.schedule('nf-processamento-reenfileirar-paradas-5min', '*/5 * * * *',
  $cron$select public.nf_processamento_reenfileirar_paradas();$cron$);
