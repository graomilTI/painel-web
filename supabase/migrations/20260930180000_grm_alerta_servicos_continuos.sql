-- Estende o alerta por WhatsApp (grm_alerta_login_parado) para os serviços
-- contínuos do GRM, que rodam fora da fila grm_sync_jobs:
--   - Lista de OS (sync-lista-os-realtime) e Colaboradores (sync-colaboradores-realtime):
--     reportam um heartbeat por ciclo numa linha de grm_sync_jobs (status/updated_at);
--   - Produção Diária: não tem heartbeat em grm_sync_jobs, usa o último
--     producao_snapshot.created_at (timestamp sem fuso, em UTC).
-- Em 01/10 Lista de OS e Colaboradores ficaram em erro (captcha_invalid) da
-- meia-noite às 08:18 sem nenhum aviso, porque o alerta só olhava o
-- aplicar-distribuicao-os.
--
-- 1) grm_alerta_login_parado() passa a contar também o erro de login desses
--    serviços (a linha de heartbeat é atualizada a cada ciclo, então o filtro
--    usa updated_at, não created_at) e o padrão "Sem token de sessão" dos
--    agentes de navegador.
-- 2) grm_alerta_servicos_continuos() cobre os problemas que NÃO são de login:
--    serviço sem sinal há mais de 10 min (parou/travou) ou em erro que não é
--    de login. Avisa depois de 10 min seguidos de problema, no máximo 1x a cada
--    3 h por serviço, sem enviar de 01:00 às 05:30 (Brasília), e avisa quando
--    o serviço volta.

create table if not exists public.grm_servicos_continuos_estado (
  servico text primary key,
  problema_desde timestamptz,
  alertado_em timestamptz
);
alter table public.grm_servicos_continuos_estado enable row level security;

create or replace function public.grm_alerta_login_parado()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_falhas integer;
  v_ok integer;
  v_agente_ativo boolean;
  v_agora_sp timestamp := now() at time zone 'America/Sao_Paulo';
  v_chave text;
  v_ultimo_alerta timestamptz;
  v_ultimo_ok timestamptz;
  v_inseriu integer;
  v_msg text;
begin
  select coalesce(bool_or(enabled), false) into v_agente_ativo
  from public.grm_sync_agent_settings where agent_id = 'aplicar-distribuicao-os';

  select
    (select count(*) from public.grm_sync_jobs
      where created_at > now() - interval '6 minutes'
        and status = 'erro'
        and (output->>'stdout' ilike '%captcha_invalid%'
          or output->>'stdout' ilike '%Login GRM em pausa%'
          or output->>'stdout' ilike '%Sem token de sess%'))
    +
    (select count(*) from public.grm_sync_jobs
      where agente_id in ('sync-lista-os-realtime', 'sync-colaboradores-realtime')
        and status = 'erro'
        and updated_at > now() - interval '6 minutes'
        and (erro ilike '%captcha_invalid%' or erro ilike '%Login GRM em pausa%' or erro ilike '%Sem token de sess%'))
  into v_falhas;

  select count(*) into v_ok
  from public.grm_sync_jobs
  where created_at > now() - interval '6 minutes'
    and agente_id = 'aplicar-distribuicao-os'
    and status = 'sucesso';

  if v_agente_ativo and v_falhas > 0 and v_ok = 0 then
    -- silêncio de 01:00 às 05:30 (Brasília): não repete no meio da madrugada
    if v_agora_sp::time >= time '01:00' and v_agora_sp::time < time '05:30' then
      return 'parado (silencio noturno)';
    end if;
    v_chave := 'login_parado|' || floor(extract(epoch from now()) / 10800)::bigint;
    insert into public.grm_alertas_enviados (chave) values (v_chave) on conflict (chave) do nothing;
    get diagnostics v_inseriu = row_count;
    if v_inseriu = 0 then
      return 'parado (ja avisado)';
    end if;
    v_msg := 'Agentes do GRM PARADOS: o token de sessao venceu (virada do dia) e o login automatico e recusado.' || chr(10) ||
             'Para religar: 1) entre no GRM pelo navegador; 2) F12 > Rede > getUserDataAccess > copie o token do cabecalho Authorization;' || chr(10) ||
             '3) no servidor: cd /home/grao100/painel-scripts/grm-sync && /opt/node22/bin/node grm-token-cache.js salvar' || chr(10) ||
             'O novo token vale ate 23:59 de hoje.';
    update public.grm_alertas_enviados
      set destinos = public.grm_alerta_enviar(v_msg), mensagem = v_msg
      where chave = v_chave;
    return 'alerta enviado';
  end if;

  -- voltou ao normal depois de um alerta: avisa uma vez
  if v_ok > 0 then
    select max(enviado_em) into v_ultimo_alerta from public.grm_alertas_enviados where chave like 'login_parado|%';
    select max(enviado_em) into v_ultimo_ok from public.grm_alertas_enviados where chave like 'login_ok|%';
    if v_ultimo_alerta is not null and (v_ultimo_ok is null or v_ultimo_ok < v_ultimo_alerta) then
      v_chave := 'login_ok|' || extract(epoch from now())::bigint;
      insert into public.grm_alertas_enviados (chave) values (v_chave) on conflict (chave) do nothing;
      v_msg := 'Agentes do GRM voltaram a rodar (login OK).';
      update public.grm_alertas_enviados
        set destinos = public.grm_alerta_enviar(v_msg), mensagem = v_msg
        where chave = v_chave;
      return 'recuperacao enviada';
    end if;
  end if;

  return 'ok';
end;
$$;

create or replace function public.grm_alerta_servicos_continuos()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_estado public.grm_servicos_continuos_estado%rowtype;
  v_agora_sp timestamp := now() at time zone 'America/Sao_Paulo';
  v_silencio boolean;
  v_problema boolean;
  v_motivo text;
  v_resumo text := '';
begin
  v_silencio := v_agora_sp::time >= time '01:00' and v_agora_sp::time < time '05:30';

  for r in
    with ult as (
      select distinct on (agente_id) agente_id, status, updated_at, erro
      from public.grm_sync_jobs
      where agente_id in ('sync-lista-os-realtime', 'sync-colaboradores-realtime')
      order by agente_id, created_at desc
    )
    select case agente_id when 'sync-lista-os-realtime' then 'Lista de OS' else 'Colaboradores' end as nome,
           agente_id as servico, status, updated_at as ultimo_sinal, erro
    from ult
    union all
    select 'Producao Diaria', 'producao-diaria', 'sucesso',
           (select max(created_at) at time zone 'UTC' from public.producao_snapshot), null
  loop
    -- erro de login é coberto por grm_alerta_login_parado(); aqui só o que não é login
    v_problema := false;
    v_motivo := null;
    if r.ultimo_sinal is null or now() - r.ultimo_sinal > interval '10 minutes' then
      v_problema := true;
      v_motivo := 'sem sinal ha ' || coalesce(round(extract(epoch from (now() - r.ultimo_sinal)) / 60)::text, '?') || ' min (parou ou travou)';
    elsif r.status = 'erro' and coalesce(r.erro, '') !~* 'captcha|Login GRM|Sem token' then
      v_problema := true;
      v_motivo := 'em erro: ' || left(regexp_replace(coalesce(r.erro, 'sem detalhe'), '\s+', ' ', 'g'), 120);
    end if;

    insert into public.grm_servicos_continuos_estado (servico) values (r.servico) on conflict (servico) do nothing;
    select * into v_estado from public.grm_servicos_continuos_estado where servico = r.servico;

    if v_problema then
      if v_estado.problema_desde is null then
        update public.grm_servicos_continuos_estado set problema_desde = now() where servico = r.servico;
        v_resumo := v_resumo || r.nome || ': problema iniciado; ';
      elsif now() - v_estado.problema_desde >= interval '10 minutes'
            and (v_estado.alertado_em is null or now() - v_estado.alertado_em >= interval '3 hours')
            and not v_silencio then
        perform public.grm_alerta_enviar(
          'Servico continuo do GRM com problema: ' || r.nome || ' - ' || v_motivo || chr(10) ||
          'Confira o processo no servidor (/home/grao100/painel-scripts/grm-sync, logs/) e o card em TI > Agentes.');
        update public.grm_servicos_continuos_estado set alertado_em = now() where servico = r.servico;
        v_resumo := v_resumo || r.nome || ': alerta enviado; ';
      else
        v_resumo := v_resumo || r.nome || ': em problema; ';
      end if;
    else
      if v_estado.alertado_em is not null then
        perform public.grm_alerta_enviar('Servico continuo do GRM voltou ao normal: ' || r.nome || '.');
        v_resumo := v_resumo || r.nome || ': recuperado; ';
      end if;
      if v_estado.problema_desde is not null or v_estado.alertado_em is not null then
        update public.grm_servicos_continuos_estado set problema_desde = null, alertado_em = null where servico = r.servico;
      end if;
    end if;
  end loop;

  return coalesce(nullif(v_resumo, ''), 'ok');
end;
$$;

revoke all on function public.grm_alerta_login_parado() from public, anon, authenticated;
revoke all on function public.grm_alerta_servicos_continuos() from public, anon, authenticated;

select cron.unschedule('grm-alerta-servicos-continuos-5min')
where exists (select 1 from cron.job where jobname = 'grm-alerta-servicos-continuos-5min');

select cron.schedule('grm-alerta-servicos-continuos-5min', '*/5 * * * *', $cron$select public.grm_alerta_servicos_continuos();$cron$);
