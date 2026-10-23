-- Cadastro automático de fornecedor no GRM (agente sync-cadastrar-fornecedor).
--
-- Quando o agente de lançamento de NF (sync-lancar-notas-fiscais) não acha o fornecedor no Graint, a NF
-- fica em ERRO com a mensagem 'Fornecedor "X" não encontrado no GRM (suppliers).'. Antes, alguém tinha que
-- cadastrar o fornecedor à mão e clicar em "Relançar". Agora:
--   1) um gatilho em grm_nf_lancamentos coloca o CNPJ na fila grm_fornecedor_cadastros;
--   2) o agente grmserver-cadastrar-fornecedor-api.js consulta o CNPJ na Receita (BrasilAPI), monta o cadastro
--      e cria o fornecedor no Graint (suppliers/setRecord);
--   3) concluído, as NFs desse CNPJ que estavam em ERRO por falta do fornecedor voltam para NOVO sozinhas.
--
-- Fila (um registro por CNPJ): PENDENTE -> PROCESSANDO -> CONCLUIDO | ERRO.
--   ERRO nunca é reprocessado sozinho (dado a corrigir ou fornecedor com problema): botão "Cadastrar fornecedor no
--   GRM" na NF (RPC grm_fornecedor_cadastro_solicitar) volta a linha para PENDENTE.
--   CONCLUIDO + nova NF em erro pelo mesmo CNPJ = a NF não enxerga o cadastro: vira ERRO com aviso (sem laço).
--
-- O agente nasce DESLIGADO (enabled = false): a fila acumula, mas nenhum job é criado até a conferência
-- com --dry-run.

create table if not exists public.grm_fornecedor_cadastros (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  nome text,
  categoria_nf text,
  origem text not null default 'nf',
  origem_id uuid,
  status text not null default 'PENDENTE',
  mensagem text,
  tentativas integer not null default 0,
  travado_em timestamptz,
  sup_code integer,
  dados jsonb,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grm_fornecedor_cadastros_cnpj_key unique (cnpj),
  constraint grm_fornecedor_cadastros_status_check check (status in ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO')),
  constraint grm_fornecedor_cadastros_cnpj_check check (cnpj ~ '^([0-9]{11}|[0-9]{14})$')
);

create index if not exists grm_fornecedor_cadastros_status_idx
  on public.grm_fornecedor_cadastros (status)
  where status in ('PENDENTE', 'PROCESSANDO', 'ERRO');

alter table public.grm_fornecedor_cadastros enable row level security;

drop policy if exists grm_fornecedor_cadastros_select on public.grm_fornecedor_cadastros;
create policy grm_fornecedor_cadastros_select on public.grm_fornecedor_cadastros
  for select to authenticated using (true);

revoke all on public.grm_fornecedor_cadastros from anon, authenticated;
grant select on public.grm_fornecedor_cadastros to authenticated;
grant all on public.grm_fornecedor_cadastros to service_role;

-- ---------------------------------------------------------------------------
-- Agente: enfileirar job (respeita grm_sync_agent_settings.enabled)
-- ---------------------------------------------------------------------------
create or replace function private.grm_fornecedor_enfileirar_agente(p_origem text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- Sem linha de configuração = ligado (padrão dos outros agentes); linha com enabled = false = desligado.
  if not coalesce((select bool_or(enabled) from public.grm_sync_agent_settings where agent_id = 'sync-cadastrar-fornecedor'), true) then
    return;
  end if;

  insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
  select 'sync-cadastrar-fornecedor', 'pendente', p_origem, jsonb_build_object('origem', p_origem)
  where not exists (
    select 1 from public.grm_sync_jobs
    where agente_id = 'sync-cadastrar-fornecedor' and status in ('pendente', 'rodando')
  );
end;
$$;

revoke all on function private.grm_fornecedor_enfileirar_agente(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pedido de cadastro (idempotente por CNPJ)
-- ---------------------------------------------------------------------------
create or replace function private.grm_fornecedor_cadastro_solicitar(
  p_cnpj text,
  p_nome text,
  p_categoria text,
  p_origem text,
  p_origem_id uuid,
  p_forcar boolean default false
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_status text;
  v_tentativas integer;
begin
  if length(v_cnpj) not in (11, 14) then
    return 'sem_cnpj';
  end if;

  insert into public.grm_fornecedor_cadastros as f (cnpj, nome, categoria_nf, origem, origem_id, status)
  values (v_cnpj, nullif(btrim(p_nome), ''), nullif(btrim(p_categoria), ''), coalesce(p_origem, 'nf'), p_origem_id, 'PENDENTE')
  on conflict (cnpj) do update set
    nome = coalesce(excluded.nome, f.nome),
    categoria_nf = coalesce(excluded.categoria_nf, f.categoria_nf),
    origem_id = coalesce(excluded.origem_id, f.origem_id),
    status = case
      when p_forcar then 'PENDENTE'
      -- Já cadastrado e a NF continua sem achar o fornecedor: não repete (evita laço), pede conferência.
      when f.status = 'CONCLUIDO' then 'ERRO'
      else f.status
    end,
    mensagem = case
      when p_forcar then null
      when f.status = 'CONCLUIDO' then 'O fornecedor consta como cadastrado no GRM'
        || coalesce(' (código ' || f.sup_code || ')', '')
        || ', mas a NF continua sem encontrá-lo. Confira o cadastro no Graint (CNPJ e situação Ativo) e relance a NF.'
      else f.mensagem
    end,
    tentativas = case when p_forcar then 0 else f.tentativas end,
    travado_em = case when p_forcar then null else f.travado_em end,
    updated_at = now()
  returning f.status, f.tentativas into v_status, v_tentativas;

  if v_status = 'PENDENTE' then
    -- Avisa na própria NF (só uma vez) que o cadastro foi pedido e que ela volta sozinha.
    if p_origem_id is not null then
      update public.grm_nf_lancamentos
         set erro = left(erro || ' Cadastro automático do fornecedor no GRM solicitado: a NF será relançada sozinha quando concluir.', 4000)
       where id = p_origem_id
         and status = 'ERRO'
         and erro is not null
         and erro not like '%Cadastro automático do fornecedor%';
    end if;
    if v_tentativas = 0 then
      perform private.grm_fornecedor_enfileirar_agente('nf-auto');
    end if;
  end if;
  return v_status;
end;
$$;

revoke all on function private.grm_fornecedor_cadastro_solicitar(text, text, text, text, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gatilho: NF que vai para ERRO por fornecedor não encontrado
-- ---------------------------------------------------------------------------
create or replace function private.grm_fornecedor_nf_erro()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'ERRO'
     and (tg_op = 'INSERT' or old.status is distinct from 'ERRO')
     and new.erro like 'Fornecedor "%" não encontrado no GRM (suppliers)%' then
    perform private.grm_fornecedor_cadastro_solicitar(
      coalesce(nullif(new.fornecedor_cnpj, ''), new.extraido_json ->> 'fornecedor_cnpj'),
      coalesce(nullif(new.fornecedor_nome, ''), new.extraido_json ->> 'fornecedor'),
      new.extraido_json ->> 'categoria',
      'nf',
      new.id,
      false
    );
  end if;
  return new;
end;
$$;

revoke all on function private.grm_fornecedor_nf_erro() from public, anon, authenticated;

drop trigger if exists grm_nf_lancamentos_fornecedor_nao_encontrado on public.grm_nf_lancamentos;
create trigger grm_nf_lancamentos_fornecedor_nao_encontrado
  after insert or update of status on public.grm_nf_lancamentos
  for each row execute function private.grm_fornecedor_nf_erro();

-- ---------------------------------------------------------------------------
-- Botão na NF: "Cadastrar fornecedor no GRM" (também reenvia o que deu ERRO)
-- ---------------------------------------------------------------------------
create or replace function public.grm_fornecedor_cadastro_solicitar(p_nf_id uuid)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_nf public.grm_nf_lancamentos;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select * into v_nf from public.grm_nf_lancamentos where id = p_nf_id;
  if v_nf.id is null then
    raise exception 'NF não encontrada.';
  end if;
  if v_nf.status <> 'ERRO' or coalesce(v_nf.erro, '') not like 'Fornecedor "%" não encontrado no GRM (suppliers)%' then
    raise exception 'Esta NF não está em erro por fornecedor não encontrado no GRM.';
  end if;

  v_status := private.grm_fornecedor_cadastro_solicitar(
    coalesce(nullif(v_nf.fornecedor_cnpj, ''), v_nf.extraido_json ->> 'fornecedor_cnpj'),
    coalesce(nullif(v_nf.fornecedor_nome, ''), v_nf.extraido_json ->> 'fornecedor'),
    v_nf.extraido_json ->> 'categoria',
    'nf-manual',
    v_nf.id,
    true
  );
  if v_status = 'sem_cnpj' then
    raise exception 'A NF não tem CNPJ/CPF do fornecedor; cadastre o fornecedor manualmente no Graint.';
  end if;
  return v_status;
end;
$$;

revoke all on function public.grm_fornecedor_cadastro_solicitar(uuid) from public, anon;
grant execute on function public.grm_fornecedor_cadastro_solicitar(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fila do agente: claim e cron de segurança
-- ---------------------------------------------------------------------------
create or replace function public.claim_next_grm_fornecedor_cadastro()
returns public.grm_fornecedor_cadastros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.grm_fornecedor_cadastros;
begin
  update public.grm_fornecedor_cadastros
     set status = 'PENDENTE', travado_em = null
   where status = 'PROCESSANDO'
     and travado_em < now() - interval '15 minutes';

  update public.grm_fornecedor_cadastros c
     set status = 'PROCESSANDO',
         travado_em = now(),
         tentativas = c.tentativas + 1,
         updated_at = now()
   where c.id = (
     select id from public.grm_fornecedor_cadastros
      where status = 'PENDENTE'
      order by created_at, id
      limit 1
      for update skip locked
   )
   returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.claim_next_grm_fornecedor_cadastro() from public, anon, authenticated;
grant execute on function public.claim_next_grm_fornecedor_cadastro() to service_role;

create or replace function public.grm_fornecedor_cadastro_reenfileirar_paradas()
returns text
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if exists (
    select 1 from public.grm_fornecedor_cadastros
     where (status = 'PENDENTE' and updated_at < now() - interval '2 minutes')
        or (status = 'PROCESSANDO' and travado_em < now() - interval '15 minutes')
  ) and not exists (
    select 1 from public.grm_sync_jobs
     where agente_id = 'sync-cadastrar-fornecedor'
       and (status in ('pendente', 'rodando') or created_at > now() - interval '10 minutes')
  ) then
    perform private.grm_fornecedor_enfileirar_agente('cron-auto');
    return 'reenfileirado';
  end if;
  return 'ok (nada parado)';
end;
$$;

revoke all on function public.grm_fornecedor_cadastro_reenfileirar_paradas() from public, anon, authenticated;

select cron.schedule('grm-fornecedor-cadastro-reenfileirar-paradas-5min', '*/5 * * * *',
  $cron$select public.grm_fornecedor_cadastro_reenfileirar_paradas();$cron$);

-- ---------------------------------------------------------------------------
-- Agente (nasce DESLIGADO)
-- ---------------------------------------------------------------------------
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-cadastrar-fornecedor', 'saida_financeiro', 0, false,
  'saida_financeiro', 'saida', 'light', 85,
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
-- NFs que já estão em ERRO por fornecedor não encontrado entram na fila (agente desligado: só acumula)
-- ---------------------------------------------------------------------------
select private.grm_fornecedor_cadastro_solicitar(
  coalesce(nullif(n.fornecedor_cnpj, ''), n.extraido_json ->> 'fornecedor_cnpj'),
  coalesce(nullif(n.fornecedor_nome, ''), n.extraido_json ->> 'fornecedor'),
  n.extraido_json ->> 'categoria',
  'nf',
  n.id,
  false
)
from public.grm_nf_lancamentos n
where n.status = 'ERRO'
  and n.erro like 'Fornecedor "%" não encontrado no GRM (suppliers)%';
