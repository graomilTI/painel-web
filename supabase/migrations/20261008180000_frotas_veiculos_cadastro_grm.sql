-- Frotas > Veículos: cadastro completo no painel + envio automático ao GRM.
--
-- Veículo novo cadastrado no painel (botão "Adicionar Novo") entra na fila
-- (grm_cadastro_status = 'PENDENTE') e o agente sync-cadastrar-veiculo
-- (grmserver-cadastrar-veiculo-api.js) cadastra no GRM, nas duas telas:
--   * Patrimônios  (patrimonies/setRecord, categoria VEICULOS)
--   * Veículos     (vehicle/setRecord)
-- Os dois passos são idempotentes: se a placa já existe numa das telas, o agente só
-- completa a que falta (reenvio depois de erro não duplica nada).
--
-- Campos novos só do painel (o GRM não tem): apólice do seguro e vencimento. Os demais
-- (chassi, cor, ano, tipo...) já existiam em frotas_veiculos e passam a aparecer no formulário.
--
-- Fila = colunas grm_cadastro_* na própria linha do veículo:
--   NULL        veículo que não precisa ser enviado (importado, vindo do GRM, editado...)
--   PENDENTE    aguardando o agente
--   PROCESSANDO agente trabalhando (destravado sozinho após 15 min)
--   CONCLUIDO   Patrimônio e Veículo existem no GRM
--   ERRO        precisa de ajuste nos dados; "Reenviar" (frotas_veiculo_grm_reenviar) volta p/ PENDENTE
-- grm_patrimonio_numero é o nº do Patrimônio digitado no formulário. Fica fora de
-- patrimonio_codigo de propósito: sincronizar_frotas_veiculos_patrimonios zera os campos
-- patrimonio_* a cada leitura do GRM e só repreenche o que já está lá.

alter table public.frotas_veiculos
  add column if not exists apolice_seguro text,
  add column if not exists seguro_vencimento date,
  add column if not exists grm_patrimonio_numero text,
  add column if not exists grm_veh_code integer,
  add column if not exists grm_cadastro_status text,
  add column if not exists grm_cadastro_mensagem text,
  add column if not exists grm_cadastro_tentativas integer not null default 0,
  add column if not exists grm_cadastro_travado_em timestamptz,
  add column if not exists grm_cadastro_em timestamptz;

alter table public.frotas_veiculos drop constraint if exists frotas_veiculos_grm_cadastro_status_check;
alter table public.frotas_veiculos
  add constraint frotas_veiculos_grm_cadastro_status_check
  check (grm_cadastro_status is null or grm_cadastro_status in ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO'));

create index if not exists frotas_veiculos_grm_cadastro_idx
  on public.frotas_veiculos (grm_cadastro_status)
  where grm_cadastro_status in ('PENDENTE', 'PROCESSANDO', 'ERRO');

-- ---------------------------------------------------------------------------
-- Catálogo de marcas/modelos do GRM (sugestões do formulário)
-- ---------------------------------------------------------------------------
-- O GRM exige marca e modelo do catálogo dele (patrimonyBrand/patrimonyModel). O agente
-- regrava esta tabela a cada execução; o formulário usa só para autocompletar. Quem decide
-- de verdade é o agente, comparando o texto digitado com o catálogo vivo do GRM.
create table if not exists public.grm_veiculo_catalogo (
  pbr_code integer not null,
  pmo_code integer not null default 0,
  marca text not null,
  modelo text,
  atualizado_em timestamptz not null default now(),
  constraint grm_veiculo_catalogo_pkey primary key (pbr_code, pmo_code)
);

alter table public.grm_veiculo_catalogo enable row level security;
drop policy if exists grm_veiculo_catalogo_select on public.grm_veiculo_catalogo;
create policy grm_veiculo_catalogo_select on public.grm_veiculo_catalogo
  for select to authenticated using (true);
revoke insert, update, delete on public.grm_veiculo_catalogo from anon, authenticated;
grant select on public.grm_veiculo_catalogo to authenticated;

-- ---------------------------------------------------------------------------
-- Fila: claim, enfileiramento e reenvio
-- ---------------------------------------------------------------------------
create or replace function public.claim_next_frotas_veiculo_grm_cadastro()
returns public.frotas_veiculos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.frotas_veiculos;
begin
  -- PROCESSANDO há mais de 15 min = agente morreu no meio; volta pra fila.
  update public.frotas_veiculos
     set grm_cadastro_status = 'PENDENTE', grm_cadastro_travado_em = null
   where grm_cadastro_status = 'PROCESSANDO'
     and grm_cadastro_travado_em < now() - interval '15 minutes';

  update public.frotas_veiculos v
     set grm_cadastro_status = 'PROCESSANDO',
         grm_cadastro_travado_em = now(),
         grm_cadastro_tentativas = v.grm_cadastro_tentativas + 1
   where v.id = (
     select id from public.frotas_veiculos
      where grm_cadastro_status = 'PENDENTE'
      order by created_at
      limit 1
      for update skip locked
   )
   returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.claim_next_frotas_veiculo_grm_cadastro() from public, anon, authenticated;
grant execute on function public.claim_next_frotas_veiculo_grm_cadastro() to service_role;

-- Cria o job do agente (um por vez; o agente esvazia a fila inteira quando roda).
create or replace function private.frotas_veiculo_grm_enfileirar_agente(p_origem text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not coalesce((select bool_or(enabled) from public.grm_sync_agent_settings where agent_id = 'sync-cadastrar-veiculo'), true) then
    return;
  end if;

  insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
  select 'sync-cadastrar-veiculo', 'pendente', p_origem, jsonb_build_object('origem', p_origem)
  where not exists (
    select 1 from public.grm_sync_jobs
    where agente_id = 'sync-cadastrar-veiculo' and status = 'pendente'
  );
end;
$$;

revoke all on function private.frotas_veiculo_grm_enfileirar_agente(text) from public, anon, authenticated;

create or replace function private.frotas_veiculo_grm_enfileirar_job()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- Só pedido novo (tentativas = 0). Retentativa do próprio agente volta PENDENTE com
  -- tentativas > 0 e é pega pelo cron de segurança, sem laço de reenvio imediato.
  if new.grm_cadastro_status = 'PENDENTE'
     and coalesce(new.grm_cadastro_tentativas, 0) = 0
     and (tg_op = 'INSERT' or old.grm_cadastro_status is distinct from 'PENDENTE') then
    perform private.frotas_veiculo_grm_enfileirar_agente('frotas-auto');
  end if;
  return new;
end;
$$;

revoke all on function private.frotas_veiculo_grm_enfileirar_job() from public, anon, authenticated;

drop trigger if exists frotas_veiculos_grm_enfileirar_job on public.frotas_veiculos;
create trigger frotas_veiculos_grm_enfileirar_job
  after insert or update of grm_cadastro_status on public.frotas_veiculos
  for each row execute function private.frotas_veiculo_grm_enfileirar_job();

-- Botão "Reenviar ao GRM" do painel (veículo em ERRO, ou PENDENTE parado).
create or replace function public.frotas_veiculo_grm_reenviar(p_id uuid)
returns public.frotas_veiculos
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.frotas_veiculos;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  update public.frotas_veiculos
     set grm_cadastro_status = 'PENDENTE',
         grm_cadastro_tentativas = 0,
         grm_cadastro_mensagem = null,
         grm_cadastro_travado_em = null
   where id = p_id
     and grm_cadastro_status in ('ERRO', 'PENDENTE')
   returning * into v_row;

  if v_row.id is null then
    raise exception 'Este veículo não tem cadastro no GRM aguardando reenvio.';
  end if;

  perform private.frotas_veiculo_grm_enfileirar_agente('frotas-reenvio');
  return v_row;
end;
$$;

revoke all on function public.frotas_veiculo_grm_reenviar(uuid) from public, anon;
grant execute on function public.frotas_veiculo_grm_reenviar(uuid) to authenticated, service_role;

-- Cron de segurança (5 min): sobrou veículo PENDENTE sem job ativo (ex.: job caiu por token do
-- GRM vencido) -> reenfileira, no máximo 1 vez a cada 10 min pra não encher a fila num bloqueio.
create or replace function public.frotas_veiculo_grm_reenfileirar_paradas()
returns text
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if exists (
    select 1 from public.frotas_veiculos
     where (grm_cadastro_status = 'PENDENTE' and coalesce(grm_cadastro_em, created_at) < now() - interval '2 minutes')
        or (grm_cadastro_status = 'PROCESSANDO' and grm_cadastro_travado_em < now() - interval '15 minutes')
  ) and not exists (
    select 1 from public.grm_sync_jobs
     where agente_id = 'sync-cadastrar-veiculo'
       and (status in ('pendente', 'rodando') or created_at > now() - interval '10 minutes')
  ) then
    perform private.frotas_veiculo_grm_enfileirar_agente('cron-auto');
    return 'reenfileirado';
  end if;
  return 'ok (nada parado)';
end;
$$;

revoke all on function public.frotas_veiculo_grm_reenfileirar_paradas() from public, anon, authenticated;

select cron.schedule('frotas-veiculo-grm-reenfileirar-paradas-5min', '*/5 * * * *',
  $cron$select public.frotas_veiculo_grm_reenfileirar_paradas();$cron$);

-- ---------------------------------------------------------------------------
-- Agente
-- ---------------------------------------------------------------------------
-- Escrita nos cadastros de Patrimônio e Veículo do GRM, sob demanda (job criado pelo gatilho
-- acima; interval 0 = o scheduler não agenda sozinho). Mesma lane do agente de transferência
-- de colaborador (escrita pontual de baixo volume).
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-cadastrar-veiculo', 'saida_financeiro', 0, true,
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
