-- Patrimônio comprado -> cadastro automático no GRM (agente sync-cadastrar-patrimonio).
--
-- Assim que o número da etiqueta é salvo (tela Patrimônios ou app do gestor), a linha de
-- compras_patrimonios_cadastro entra na fila (grm_cadastro_status = 'PENDENTE') e o agente
-- grmserver-cadastrar-patrimonio-api.js cria o patrimônio no GRM (patrimonies/setRecord):
--   categoria = nome do material, marca = informada na compra, responsável = solicitante da compra,
--   coordenação/supervisão = as do responsável no Supabase (colaboradores_atuais), conferidas no GRM.
--
-- Fila (mesmo padrão do cadastro de veículo):
--   NULL        sem pedido de envio (sem número, ou criado antes desta fila)
--   PENDENTE    aguardando o agente
--   PROCESSANDO agente trabalhando (destravado sozinho após 15 min)
--   CONCLUIDO   patrimônio existe no GRM
--   ERRO        dado a corrigir; "Reenviar" (compras_patrimonio_grm_reenviar) volta p/ PENDENTE
--
-- O agente nasce DESLIGADO (enabled = false): o gatilho não cria job enquanto estiver desligado.
-- Ligar só depois da conferência em modo de leitura (--dry-run).

alter table public.compras_patrimonios_cadastro
  add column if not exists grm_responsavel text,
  add column if not exists grm_cadastro_status text,
  add column if not exists grm_cadastro_mensagem text,
  add column if not exists grm_cadastro_tentativas integer not null default 0,
  add column if not exists grm_cadastro_travado_em timestamptz,
  add column if not exists grm_cadastro_em timestamptz;

alter table public.compras_patrimonios_cadastro drop constraint if exists compras_patrimonios_cadastro_grm_status_check;
alter table public.compras_patrimonios_cadastro
  add constraint compras_patrimonios_cadastro_grm_status_check
  check (grm_cadastro_status is null or grm_cadastro_status in ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO'));

create index if not exists compras_patrimonios_cadastro_grm_idx
  on public.compras_patrimonios_cadastro (grm_cadastro_status)
  where grm_cadastro_status in ('PENDENTE', 'PROCESSANDO', 'ERRO');

-- ---------------------------------------------------------------------------
-- Marca o pedido quando o número é salvo
-- ---------------------------------------------------------------------------
create or replace function private.compras_patrimonio_grm_marcar_pendente()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.numero_patrimonio is null or btrim(new.numero_patrimonio) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.numero_patrimonio is not distinct from new.numero_patrimonio then
    return new;
  end if;

  if new.grm_cadastro_status is null or new.grm_cadastro_status = 'ERRO' then
    new.grm_cadastro_status := 'PENDENTE';
    new.grm_cadastro_tentativas := 0;
    new.grm_cadastro_mensagem := null;
    new.grm_cadastro_travado_em := null;
  elsif new.grm_cadastro_status = 'CONCLUIDO' then
    -- Número trocado depois de cadastrado: o GRM ficou com o número antigo. Não regrava sozinho.
    new.grm_cadastro_status := 'ERRO';
    new.grm_cadastro_mensagem := 'O número foi alterado depois do cadastro no GRM (lá continua o anterior). Ajuste direto no GRM.';
  end if;
  return new;
end;
$$;

revoke all on function private.compras_patrimonio_grm_marcar_pendente() from public, anon, authenticated;

drop trigger if exists compras_patrimonios_grm_marcar_pendente on public.compras_patrimonios_cadastro;
create trigger compras_patrimonios_grm_marcar_pendente
  before insert or update of numero_patrimonio on public.compras_patrimonios_cadastro
  for each row execute function private.compras_patrimonio_grm_marcar_pendente();

-- ---------------------------------------------------------------------------
-- Fila: claim, enfileiramento, reenvio e cron de segurança
-- ---------------------------------------------------------------------------
create or replace function public.claim_next_compras_patrimonio_grm_cadastro()
returns public.compras_patrimonios_cadastro
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.compras_patrimonios_cadastro;
begin
  update public.compras_patrimonios_cadastro
     set grm_cadastro_status = 'PENDENTE', grm_cadastro_travado_em = null
   where grm_cadastro_status = 'PROCESSANDO'
     and grm_cadastro_travado_em < now() - interval '15 minutes';

  update public.compras_patrimonios_cadastro c
     set grm_cadastro_status = 'PROCESSANDO',
         grm_cadastro_travado_em = now(),
         grm_cadastro_tentativas = c.grm_cadastro_tentativas + 1
   where c.id = (
     select id from public.compras_patrimonios_cadastro
      where grm_cadastro_status = 'PENDENTE'
      order by created_at, id
      limit 1
      for update skip locked
   )
   returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.claim_next_compras_patrimonio_grm_cadastro() from public, anon, authenticated;
grant execute on function public.claim_next_compras_patrimonio_grm_cadastro() to service_role;

create or replace function private.compras_patrimonio_grm_enfileirar_agente(p_origem text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- Sem linha de configuração = ligado (padrão dos outros agentes); linha com enabled = false = desligado.
  if not coalesce((select bool_or(enabled) from public.grm_sync_agent_settings where agent_id = 'sync-cadastrar-patrimonio'), true) then
    return;
  end if;

  insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
  select 'sync-cadastrar-patrimonio', 'pendente', p_origem, jsonb_build_object('origem', p_origem)
  where not exists (
    select 1 from public.grm_sync_jobs
    where agente_id = 'sync-cadastrar-patrimonio' and status = 'pendente'
  );
end;
$$;

revoke all on function private.compras_patrimonio_grm_enfileirar_agente(text) from public, anon, authenticated;

create or replace function private.compras_patrimonio_grm_enfileirar_job()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- Só pedido novo (tentativas = 0). Retentativa do agente volta PENDENTE com tentativas > 0 e é
  -- pega pelo cron de segurança, sem laço de reenvio imediato.
  if new.grm_cadastro_status = 'PENDENTE'
     and coalesce(new.grm_cadastro_tentativas, 0) = 0
     and (tg_op = 'INSERT' or old.grm_cadastro_status is distinct from 'PENDENTE') then
    perform private.compras_patrimonio_grm_enfileirar_agente('compras-auto');
  end if;
  return new;
end;
$$;

revoke all on function private.compras_patrimonio_grm_enfileirar_job() from public, anon, authenticated;

drop trigger if exists compras_patrimonios_grm_enfileirar_job on public.compras_patrimonios_cadastro;
-- "update of": o Postgres só dispara se a coluna está no SET do UPDATE; quando o status é mudado pelo gatilho
-- BEFORE (ao salvar o número), quem aparece no SET é numero_patrimonio. Por isso as duas colunas.
create trigger compras_patrimonios_grm_enfileirar_job
  after insert or update of grm_cadastro_status, numero_patrimonio on public.compras_patrimonios_cadastro
  for each row execute function private.compras_patrimonio_grm_enfileirar_job();

-- Botão "Reenviar ao GRM" (linha em ERRO, ou PENDENTE parada), depois de corrigir marca/responsável.
create or replace function public.compras_patrimonio_grm_reenviar(p_id uuid)
returns public.compras_patrimonios_cadastro
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.compras_patrimonios_cadastro;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  update public.compras_patrimonios_cadastro
     set grm_cadastro_status = 'PENDENTE',
         grm_cadastro_tentativas = 0,
         grm_cadastro_mensagem = null,
         grm_cadastro_travado_em = null
   where id = p_id
     and grm_cadastro_status in ('ERRO', 'PENDENTE')
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Este patrimônio não tem cadastro no GRM aguardando reenvio.';
  end if;

  perform private.compras_patrimonio_grm_enfileirar_agente('compras-reenvio');
  return v_row;
end;
$$;

revoke all on function public.compras_patrimonio_grm_reenviar(uuid) from public, anon;
grant execute on function public.compras_patrimonio_grm_reenviar(uuid) to authenticated, service_role;

create or replace function public.compras_patrimonio_grm_reenfileirar_paradas()
returns text
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if exists (
    select 1 from public.compras_patrimonios_cadastro
     where (grm_cadastro_status = 'PENDENTE' and coalesce(grm_cadastro_em, created_at) < now() - interval '2 minutes')
        or (grm_cadastro_status = 'PROCESSANDO' and grm_cadastro_travado_em < now() - interval '15 minutes')
  ) and not exists (
    select 1 from public.grm_sync_jobs
     where agente_id = 'sync-cadastrar-patrimonio'
       and (status in ('pendente', 'rodando') or created_at > now() - interval '10 minutes')
  ) then
    perform private.compras_patrimonio_grm_enfileirar_agente('cron-auto');
    return 'reenfileirado';
  end if;
  return 'ok (nada parado)';
end;
$$;

revoke all on function public.compras_patrimonio_grm_reenfileirar_paradas() from public, anon, authenticated;

select cron.schedule('compras-patrimonio-grm-reenfileirar-paradas-5min', '*/5 * * * *',
  $cron$select public.compras_patrimonio_grm_reenfileirar_paradas();$cron$);

-- ---------------------------------------------------------------------------
-- Agente (nasce DESLIGADO)
-- ---------------------------------------------------------------------------
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-cadastrar-patrimonio', 'saida_financeiro', 0, false,
  'saida_financeiro', 'saida', 'light', 90,
  10, '[]'::jsonb, null
)
on conflict (agent_id) do update set
  queue_lane = excluded.queue_lane,
  interval_minutes = excluded.interval_minutes,
  target_lane = excluded.target_lane,
  direction = excluded.direction,
  resource_class = excluded.resource_class,
  priority = excluded.priority,
  max_runtime_minutes = excluded.max_runtime_minutes,
  mutex_group = excluded.mutex_group,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Números já informados (decisão de 21/10/2026: cadastrar também os existentes)
-- ---------------------------------------------------------------------------
-- Só números válidos (inteiro positivo de até 9 dígitos); descarta o registro de teste com "0".
-- Com o agente desligado isto só deixa as linhas na fila, sem criar job.
update public.compras_patrimonios_cadastro
   set grm_cadastro_status = 'PENDENTE', grm_cadastro_tentativas = 0
 where grm_cadastro_status is null
   and status = 'numero_informado'
   and numero_patrimonio ~ '^[1-9][0-9]{0,8}$';
