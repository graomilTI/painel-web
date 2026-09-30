-- Alerta por WhatsApp quando os agentes do GRM ficam sem login.
--
-- Desde 30/09/2026 o user/login do GRM exige Cloudflare Turnstile
-- (captcha_invalid) e o token de sessão gravado em grm-token-cache.js vence
-- todo dia às 23:59:59 (Brasília). Sem token válido, todos os agentes param
-- até alguém entrar no GRM pelo navegador e rodar
-- `node grm-token-cache.js salvar` no servidor.
--
-- grm_alerta_login_parado() roda de 5 em 5 min (pg_cron):
--   - considera "parado" quando há erro de login (captcha_invalid / "Login GRM
--     em pausa") nos últimos 15 min e nenhum sucesso do aplicar-distribuicao-os
--     nesse período;
--   - avisa no máximo 1x a cada 3 h, e não avisa de 00:00 às 05:30 (Brasília) —
--     o aviso sai às 05:30 se o problema seguir;
--   - avisa quando voltar ao normal.
-- Envia via edge function botconversa-send (mesmo padrão de
-- notificar_logistica_nova_abertura_os). Destinos em grm_alertas_destinos.

create table if not exists public.grm_alertas_destinos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.grm_alertas_enviados (
  chave text primary key,
  destinos integer not null default 0,
  mensagem text,
  enviado_em timestamptz not null default now()
);

alter table public.grm_alertas_destinos enable row level security;
alter table public.grm_alertas_enviados enable row level security;

insert into public.grm_alertas_destinos (nome, telefone)
select 'TI - Grão 1000', '554598392467'
where not exists (select 1 from public.grm_alertas_destinos where telefone = '554598392467');

create or replace function public.grm_alerta_enviar(p_mensagem text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_key text;
  v_dest record;
  v_qtd integer := 0;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'grm_alerta_enviar: project_url/service_role_key ausentes em vault.decrypted_secrets';
    return 0;
  end if;

  for v_dest in select telefone, nome from public.grm_alertas_destinos where ativo loop
    perform net.http_post(
      url := v_url || '/functions/v1/botconversa-send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('phone', regexp_replace(v_dest.telefone, '\D', '', 'g'), 'message', p_mensagem, 'nome', v_dest.nome),
      timeout_milliseconds := 30000
    );
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;

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

  select count(*) into v_falhas
  from public.grm_sync_jobs
  where created_at > now() - interval '15 minutes'
    and status = 'erro'
    and (output->>'stdout' ilike '%captcha_invalid%' or output->>'stdout' ilike '%Login GRM em pausa%');

  select count(*) into v_ok
  from public.grm_sync_jobs
  where created_at > now() - interval '15 minutes'
    and agente_id = 'aplicar-distribuicao-os'
    and status = 'sucesso';

  if v_agente_ativo and v_falhas > 0 and v_ok = 0 then
    -- silêncio de 00:00 às 05:30 (Brasília): o aviso sai às 05:30 se seguir parado
    if v_agora_sp::time < time '05:30' then
      return 'parado (silencio noturno)';
    end if;
    v_chave := 'login_parado|' || floor(extract(epoch from now()) / 10800)::bigint;
    insert into public.grm_alertas_enviados (chave) values (v_chave) on conflict (chave) do nothing;
    get diagnostics v_inseriu = row_count;
    if v_inseriu = 0 then
      return 'parado (ja avisado)';
    end if;
    v_msg := 'Agentes do GRM PARADOS: o login automatico foi recusado (token de sessao vencido).' || chr(10) ||
             'Para religar: 1) entre no GRM pelo navegador; 2) F12 > Rede > getUserDataAccess > copie o token do cabecalho Authorization;' || chr(10) ||
             '3) no servidor: cd /home/grao100/painel-scripts/grm-sync && /opt/node22/bin/node grm-token-cache.js salvar' || chr(10) ||
             'O token vale ate 23:59 do dia.';
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

revoke all on function public.grm_alerta_enviar(text) from public, anon, authenticated;
revoke all on function public.grm_alerta_login_parado() from public, anon, authenticated;

select cron.unschedule('grm-alerta-login-parado-5min')
where exists (select 1 from cron.job where jobname = 'grm-alerta-login-parado-5min');

select cron.schedule('grm-alerta-login-parado-5min', '*/5 * * * *', $cron$select public.grm_alerta_login_parado();$cron$);
