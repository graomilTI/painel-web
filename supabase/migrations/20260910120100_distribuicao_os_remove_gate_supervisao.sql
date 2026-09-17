-- Programação vira única fonte de verdade pra TODAS as regionais, sem opt-in.
--
-- Motivação: supervisoes.distribuicao_os_automatica era um gate manual por
-- regional (checkbox em TI > Agentes). Uma regional nunca marcada continuava
-- 100% manual no Graint pra sempre, porque nada disparava o agente
-- aplicar-distribuicao-os pra ela: nem o cron das 02h (novo dia), nem o RPC
-- chamado pela tela Distribuir O.S quando o gestor fica ocioso. O agente em
-- si (grmserver-aplicar-distribuicao-os-api.js) já reconcilia TODAS as
-- supervisões sem filtro nenhum quando roda — o gate só existia na camada de
-- disparo, escondendo regionais inteiras da reconciliação.
--
-- Fix: remove o filtro distribuicao_os_automatica dos dois disparos por
-- evento e reintroduz o cron fixo de 15 em 15 min (existia antes de
-- 20260810160100, removido na época por já haver disparo por evento — mas
-- o evento só cobre quem já usa o painel; uma regional que nunca abre a
-- tela Programação/Distribuir O.S precisa do cron fixo pra ser varrida).
--
-- A coluna supervisoes.distribuicao_os_automatica é mantida (histórico/
-- informativo em TI > Agentes), só deixa de ter qualquer efeito no fluxo.

-- 1) Cron das 02h (novo dia): enfileira reset-dia pra toda pendência, não só
--    pras supervisões antes marcadas como automáticas.
select cron.unschedule('aplicar-distribuicao-os-agendada-02h')
where exists (select 1 from cron.job where jobname = 'aplicar-distribuicao-os-agendada-02h');

select cron.schedule(
  'aplicar-distribuicao-os-agendada-02h',
  '0 5 * * *',
  $cron$
    insert into public.grm_sync_jobs (agente_id, status)
    select 'aplicar-distribuicao-os-reset-dia', 'pendente'
    where exists (
      select 1
      from public.programacao_distribuicao_agendada pda
      where pda.processado = false
    )
    and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = 'aplicar-distribuicao-os-reset-dia' and status in ('pendente', 'rodando')
    );
  $cron$
);

-- 2) RPC de disparo por evento (idle na tela Distribuir O.S / troca de tela):
--    deixa de exigir colaborador em operacional_os_colaboradores (tabela
--    antiga, não é mais fonte de verdade) e de exigir supervisão marcada
--    como automática — qualquer O.S. ATENDER é motivo suficiente pra
--    verificar, já que o agente pode precisar limpar um vínculo manual feito
--    direto no Graint mesmo sem nenhum colaborador confirmado no painel.
create or replace function public.solicitar_aplicar_distribuicao_os(
  p_motivo text default 'distribuir_os'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pendencias integer := 0;
  v_job_existente uuid;
  v_novo_job uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select count(*)::integer
    into v_pendencias
  from public.operacional_os os
  where os.status_gestor = 'ATENDER';

  if v_pendencias = 0 then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', false,
      'pendencias', 0,
      'motivo', coalesce(p_motivo, 'distribuir_os')
    );
  end if;

  select id
    into v_job_existente
  from public.grm_sync_jobs
  where agente_id = 'aplicar-distribuicao-os'
    and status in ('pendente', 'rodando')
  order by created_at desc
  limit 1;

  if v_job_existente is not null then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', true,
      'job_id', v_job_existente,
      'pendencias', v_pendencias,
      'motivo', coalesce(p_motivo, 'distribuir_os')
    );
  end if;

  insert into public.grm_sync_jobs (agente_id, status)
  values ('aplicar-distribuicao-os', 'pendente')
  returning id into v_novo_job;

  return jsonb_build_object(
    'ok', true,
    'enfileirado', true,
    'job_existente', false,
    'job_id', v_novo_job,
    'pendencias', v_pendencias,
    'motivo', coalesce(p_motivo, 'distribuir_os')
  );
end;
$$;

revoke all on function public.solicitar_aplicar_distribuicao_os(text) from public;
grant execute on function public.solicitar_aplicar_distribuicao_os(text) to authenticated;

comment on function public.solicitar_aplicar_distribuicao_os(text) is
  'Enfileira aplicar-distribuicao-os quando existe alguma O.S. ATENDER, sem filtro de supervisão nem duplicar job pendente/rodando — a Programação é a única fonte de verdade, para todas as regionais.';

-- 3) Cron fixo de 15 em 15 min: rede de segurança pra regionais que nunca
--    disparam os eventos acima (nunca abrem Distribuir O.S nem confirmam
--    nada em Programação) — sem isso, uma regional inteira poderia nunca ser
--    reconciliada e o vínculo manual no Graint nunca seria limpo.
select cron.unschedule(jobid)
from cron.job
where jobname = 'aplicar-distribuicao-os-15min';

select cron.schedule(
  'aplicar-distribuicao-os-15min',
  '*/15 * * * *',
  $cron$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'aplicar-distribuicao-os', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'aplicar-distribuicao-os'
        AND status IN ('pendente', 'rodando')
    );
  $cron$
);
