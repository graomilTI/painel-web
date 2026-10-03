-- Ajusta só o texto do WhatsApp de grm_alerta_login_parado(): o comando que
-- grava o token (`grm-token-cache.js salvar`) precisa rodar como grao100.
-- Rodado como root (terminal do WHM), o arquivo do token ficava com dono root
-- e modo 0600 e os agentes não conseguiam ler. A mensagem agora diz para
-- entrar como grao100 (`su - grao100`), deixa o comando em linha própria para
-- copiar e lembra de só colar o token depois do prompt do script.
-- A lógica da função é a mesma de 20260930180000.

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
             'Para religar:' || chr(10) ||
             '1) Entre no GRM pelo navegador; F12 > Rede > getUserDataAccess > copie o token do cabecalho Authorization.' || chr(10) ||
             '2) Entre no servidor COMO grao100 (se estiver como root, rode antes: su - grao100) e rode:' || chr(10) ||
             'cd /home/grao100/painel-scripts/grm-sync && /opt/node22/bin/node grm-token-cache.js salvar' || chr(10) ||
             '3) So cole o token quando aparecer "Cole o token e tecle Enter" (nunca no prompt do bash).' || chr(10) ||
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

revoke all on function public.grm_alerta_login_parado() from public, anon, authenticated;
