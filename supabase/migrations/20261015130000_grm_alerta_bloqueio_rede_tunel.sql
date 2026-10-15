-- grm_alerta_login_parado(): texto do alerta de bloqueio de rede atualizado para o cenário com túnel do
-- escritório (15/10/2026): os agentes de distribuição de OS saem pela rede do escritório (PC ligado + tarefa
-- "GRM Tunel Escritorio"); os demais seguem dependendo de o suporte do GRM liberar o IP da VPS. A lógica da
-- função é a de 20261015120000.

create or replace function public.grm_alerta_login_parado()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_falhas integer;
  v_bloqueio integer;
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

  select count(*) into v_bloqueio
  from public.grm_sync_jobs
  where status = 'erro'
    and updated_at > now() - interval '6 minutes'
    and (output->>'stdout' ilike '%GRM_BLOQUEIO_REDE%'
      or output->>'stderr' ilike '%GRM_BLOQUEIO_REDE%'
      or erro ilike '%GRM_BLOQUEIO_REDE%');

  select count(*) into v_ok
  from public.grm_sync_jobs
  where created_at > now() - interval '6 minutes'
    and agente_id = 'aplicar-distribuicao-os'
    and status = 'sucesso';

  if v_agente_ativo and v_ok = 0 and (v_bloqueio > 0 or v_falhas > 0) then
    -- silêncio de 01:00 às 05:30 (Brasília): não repete no meio da madrugada
    if v_agora_sp::time >= time '01:00' and v_agora_sp::time < time '05:30' then
      return 'parado (silencio noturno)';
    end if;

    if v_bloqueio > 0 then
      v_chave := 'rede_bloqueada|' || floor(extract(epoch from now()) / 10800)::bigint;
      v_msg := 'Agentes do GRM PARADOS: o GRM nao esta acessivel a partir do servidor dos agentes (a Cloudflare do GRM devolve 403 "you have been blocked"). NAO e o token e NAO adianta tentar login.' || chr(10) ||
               'O que fazer:' || chr(10) ||
               '1) Agentes que saem pelo tunel do escritorio (distribuicao de OS): confira se o PC do escritorio esta ligado, com internet e sem suspender, e se a tarefa "GRM Tunel Escritorio" esta rodando.' || chr(10) ||
               '2) Os demais agentes dependem de o suporte do GRM liberar o IP do servidor na Cloudflare (cite o Ray ID da pagina de bloqueio).' || chr(10) ||
               '3) Se o token do dia ainda nao foi enviado, pode enviar ja pelo favorito "Enviar token GRM": ele fica guardado e e aplicado sozinho quando o acesso voltar.' || chr(10) ||
               'Os agentes pausam as tentativas e conferem de 2 a 10 minutos; voltam sozinhos quando o acesso voltar.';
    else
      v_chave := 'login_parado|' || floor(extract(epoch from now()) / 10800)::bigint;
      v_msg := 'Agentes do GRM PARADOS: o token de sessao venceu (virada do dia) e o login automatico e recusado.' || chr(10) ||
               'Para religar (1 minuto):' || chr(10) ||
               '1) Entre no GRM pelo navegador e espere o painel abrir.' || chr(10) ||
               '2) Clique no favorito "Enviar token GRM" (se ainda nao tem, arraste o botao de Painel > TI > Integracoes para a barra de favoritos).' || chr(10) ||
               '3) Na janela do painel que abrir, espere aparecer "Aplicado". Os agentes retomam sozinhos em ate 2 minutos.' || chr(10) ||
               'O novo token vale ate 23:59 de hoje.' || chr(10) ||
               'Plano B (servidor, como grao100): cd /home/grao100/painel-scripts/grm-sync && /opt/node22/bin/node grm-token-cache.js salvar - e so cole o token depois que pedir.';
    end if;

    insert into public.grm_alertas_enviados (chave) values (v_chave) on conflict (chave) do nothing;
    get diagnostics v_inseriu = row_count;
    if v_inseriu = 0 then
      return 'parado (ja avisado)';
    end if;
    update public.grm_alertas_enviados
      set destinos = public.grm_alerta_enviar(v_msg), mensagem = v_msg
      where chave = v_chave;
    return case when v_bloqueio > 0 then 'alerta enviado (bloqueio de rede)' else 'alerta enviado' end;
  end if;

  -- voltou ao normal depois de um alerta (de token ou de bloqueio de rede): avisa uma vez
  if v_ok > 0 then
    select max(enviado_em) into v_ultimo_alerta from public.grm_alertas_enviados
      where chave like 'login_parado|%' or chave like 'rede_bloqueada|%';
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

revoke all on function public.grm_alerta_login_parado() from public, anon, authenticated;
