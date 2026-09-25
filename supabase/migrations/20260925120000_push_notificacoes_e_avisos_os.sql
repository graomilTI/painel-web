-- Pedido do usuário, 2026-09-25: solicitação de O.S. e pedido de correção ficavam
-- muito tempo sem resposta por falta de aviso. Este migration entrega:
--   1) push_subscriptions: inscrições Web Push (celular e computador) por usuário;
--   2) push_destinatarios(): resolve quem recebe cada painel_notificacoes (mesma
--      regra da central de notificações, ver notifIsForMe em notificacoes-engine.js);
--   3) trigger em painel_notificacoes que chama a edge function push-notify;
--   4) avisos automáticos do fluxo Abertura de O.S. (nova solicitação, correção
--      pedida, reenvio da correção, recusa, cadastro, erro do agente).

-- ---------------------------------------------------------------------------
-- 1) Inscrições Web Push
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) Destinatários (inscrições) de uma notificação
--    Regras: usuário direto | perfil (+supervisão) | módulo. Masters só recebem
--    push quando são o destinatário direto (senão receberiam tudo). Quem gerou
--    a notificação não recebe o próprio aviso.
-- ---------------------------------------------------------------------------
create or replace function public.push_destinatarios(p_notificacao_id uuid)
returns table(sub_id uuid, user_id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with n as (
    select * from public.painel_notificacoes where id = p_notificacao_id
  ),
  u as (
    select coalesce(au.auth_user_id, au.id) as uid,
           au.id as app_id,
           au.perfil_id,
           upper(coalesce(p.codigo, '')) as perfil,
           au.supervisao
      from public.app_usuarios au
      left join public.app_perfis p on p.id = au.perfil_id
     where lower(coalesce(au.status, '')) = 'ativo'
  ),
  alvo as (
    -- destinatário direto (inclui master)
    select u.uid
      from u, n
     where n.destinatario_usuario_id is not null
       and u.uid = n.destinatario_usuario_id
    union
    -- por perfil (e supervisão, quando a notificação tem)
    select u.uid
      from u, n
     where n.destinatario_perfil is not null
       and u.perfil <> 'MASTER'
       and u.perfil = upper(n.destinatario_perfil)
       and (
         n.supervisao is null
         or coalesce(btrim(u.supervisao), '') = ''
         or upper(btrim(n.supervisao)) = any (
              select upper(btrim(s))
                from unnest(regexp_split_to_array(regexp_replace(u.supervisao, '[\[\]{}"]', '', 'g'), '[,;|\n]+')) s
            )
       )
    union
    -- por módulo: módulos diretos do usuário prevalecem; sem eles, vale o perfil
    select u.uid
      from u, n
     where n.destinatario_modulo is not null
       and u.perfil <> 'MASTER'
       and (
         exists (
           select 1
             from public.app_usuario_modulos um
             join public.app_modulos m on m.id = um.modulo_id and m.ativo
            where um.usuario_id = u.app_id
              and upper(m.codigo) = upper(n.destinatario_modulo)
         )
         or (
           not exists (select 1 from public.app_usuario_modulos um2 where um2.usuario_id = u.app_id)
           and exists (
             select 1
               from public.app_perfil_modulo pm
               join public.app_modulos m on m.id = pm.modulo_id and m.ativo
              where pm.perfil_id = u.perfil_id
                and pm.pode_ver
                and upper(m.codigo) = upper(n.destinatario_modulo)
           )
         )
       )
  )
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join alvo a on a.uid = s.user_id
    cross join n
   where s.user_id is distinct from n.gerado_por_usuario_id;
$function$;

revoke all on function public.push_destinatarios(uuid) from public, anon, authenticated;
grant execute on function public.push_destinatarios(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Disparo do push a cada notificação gravada
--    Mesmo padrão de notificar_logistica_nova_abertura_os (vault + net.http_post).
--    Nunca pode bloquear o INSERT da notificação.
-- ---------------------------------------------------------------------------
create or replace function public.push_disparar_notificacao()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_url text;
  v_key text;
begin
  if new.arquivada then
    return new;
  end if;

  -- Sem nenhuma inscrição ainda não há o que enviar (evita chamada HTTP à toa).
  if not exists (select 1 from public.push_subscriptions limit 1) then
    return new;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'push_disparar_notificacao: project_url/service_role_key ausentes em vault.decrypted_secrets';
    return new;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('notificacao_id', new.id),
    timeout_milliseconds := 15000
  );

  return new;
exception when others then
  raise warning 'push_disparar_notificacao: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_push_disparar_notificacao on public.painel_notificacoes;
create trigger trg_push_disparar_notificacao
  after insert on public.painel_notificacoes
  for each row
  execute function public.push_disparar_notificacao();

-- ---------------------------------------------------------------------------
-- 4) Avisos do fluxo Abertura de O.S. (logistica_abertura_os)
--    Nova solicitação / correção reenviada -> módulo logistica_adm
--    Correção pedida / recusada / cadastrada -> quem solicitou (solicitante_id)
--    Erro do agente -> módulo logistica_adm
-- ---------------------------------------------------------------------------
create or replace function public.notificar_painel_abertura_os()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_resumo text;
  v_ts text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
  v_resumo := concat_ws(' — ', new.contratante_cliente, new.armazem_embarque, new.produto);

  if tg_op = 'INSERT' then
    if new.status = 'PENDENTE' then
      insert into public.painel_notificacoes
        (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
         gerado_por_usuario_id, referencia_tabela, referencia_id, chave_dedup)
      values
        ('os_solicitada', 'Nova solicitação de abertura de O.S.',
         concat_ws(' | ', v_resumo, 'Solicitante: ' || coalesce(new.solicitante_nome, 'não identificado')),
         'atencao', 'clipboard-check', 'logistica-os', 'logistica_adm',
         new.solicitante_id, 'logistica_abertura_os', new.id::text, 'os_solicitada:' || new.id);
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'PENDENTE' and old.status = 'CORRIGIR' then
    insert into public.painel_notificacoes
      (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
       gerado_por_usuario_id, referencia_tabela, referencia_id, chave_dedup)
    values
      ('os_solicitada', 'Correção de O.S. reenviada pelo gestor',
       concat_ws(' | ', v_resumo, 'Solicitante: ' || coalesce(new.solicitante_nome, 'não identificado')),
       'atencao', 'clipboard-check', 'logistica-os', 'logistica_adm',
       new.solicitante_id, 'logistica_abertura_os', new.id::text, 'os_reenvio:' || new.id || ':' || v_ts);

  elsif new.status = 'CORRIGIR' and new.solicitante_id is not null then
    insert into public.painel_notificacoes
      (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_usuario_id,
       referencia_tabela, referencia_id, chave_dedup)
    values
      ('os_correcao', 'Correção solicitada na sua abertura de O.S.',
       concat_ws(' | ', v_resumo, nullif(btrim(coalesce(new.observacao_adm, '')), '')),
       'urgente', 'clipboard-alert', 'logistica', new.solicitante_id,
       'logistica_abertura_os', new.id::text, 'os_correcao:' || new.id || ':' || v_ts);

  elsif new.status = 'RECUSADO' and new.solicitante_id is not null then
    insert into public.painel_notificacoes
      (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_usuario_id,
       referencia_tabela, referencia_id, chave_dedup)
    values
      ('os_recusada', 'Solicitação de O.S. recusada',
       concat_ws(' | ', v_resumo, nullif(btrim(coalesce(new.observacao_adm, '')), '')),
       'atencao', 'clipboard-alert', 'logistica', new.solicitante_id,
       'logistica_abertura_os', new.id::text, 'os_recusada:' || new.id || ':' || v_ts);

  elsif new.status = 'CADASTRADO' and new.solicitante_id is not null then
    insert into public.painel_notificacoes
      (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_usuario_id,
       referencia_tabela, referencia_id, chave_dedup)
    values
      ('os_cadastrada', 'O.S. cadastrada' || coalesce(' — nº ' || new.numero_os_cadastrada, ''),
       v_resumo,
       'normal', 'check-circle', 'logistica', new.solicitante_id,
       'logistica_abertura_os', new.id::text, 'os_cadastrada:' || new.id || ':' || v_ts);

  elsif new.status = 'ERRO' then
    insert into public.painel_notificacoes
      (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
       referencia_tabela, referencia_id, chave_dedup)
    values
      ('os_erro', 'Erro ao cadastrar O.S. no GRM',
       concat_ws(' | ', v_resumo, left(coalesce(new.erro_agente, ''), 160)),
       'urgente', 'clipboard-alert', 'logistica-os', 'logistica_adm',
       'logistica_abertura_os', new.id::text, 'os_erro:' || new.id || ':' || v_ts);
  end if;

  return new;
exception when others then
  -- Aviso nunca pode impedir a solicitação/decisão de O.S.
  raise warning 'notificar_painel_abertura_os: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_notificar_painel_abertura_os on public.logistica_abertura_os;
create trigger trg_notificar_painel_abertura_os
  after insert or update of status on public.logistica_abertura_os
  for each row
  execute function public.notificar_painel_abertura_os();
