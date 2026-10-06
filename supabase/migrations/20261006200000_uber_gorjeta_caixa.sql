-- Gorjetas do Uber -> Adiantamento automático no Caixa do colaborador (GRM).
--
-- A importação diária do Uber (SFTP) traz cada gorjeta como uma linha própria em
-- conferencia_uber_corridas (external_id "<corrida>:TIP:<instante>", status GORJETA).
-- Um gatilho AFTER INSERT enfileira a gorjeta em uber_gorjeta_caixa_lancamentos e
-- pede um job do agente sync-uber-gorjeta-caixa (Puppeteer, mesmo fluxo validado do
-- Adiantamento de desconto de auditoria): Funcionário -> Caixa -> Despesas -> Adicionar
-- -> Tipo = Adiantamento, Data = dia da corrida, Valor = gorjeta, Descrição única.
--
-- Decisões do usuário (06/10/2026): tipo Adiantamento; só gorjetas novas daqui pra
-- frente (as já existentes entram como CANCELADO, o que também impede reimportação de
-- enfileirá-las); lançamento automático, valor integral, sem aprovação prévia.
--
-- O gatilho NUNCA pode derrubar a importação do Uber: qualquer erro dentro dele vira
-- WARNING e a linha da corrida entra normalmente.

-- ---------------------------------------------------------------------------
-- Fila do agente (uma linha por gorjeta).
create table if not exists public.uber_gorjeta_caixa_lancamentos (
  id uuid primary key default gen_random_uuid(),
  corrida_id uuid,
  external_id text not null,
  colaborador_nome text not null,
  colaborador_email text,
  valor numeric(14,2) not null,
  data_gorjeta date not null,
  gorjeta_em timestamptz,
  descricao_grm text not null,
  status text not null default 'PENDENTE',
  tentativas integer not null default 0,
  ultimo_erro text,
  grm_retorno jsonb,
  solicitado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uber_gorjeta_caixa_status_check
    check (status in ('PENDENTE', 'PROCESSANDO', 'LANCADO', 'ERRO', 'CANCELADO')),
  constraint uber_gorjeta_caixa_valor_check check (valor > 0),
  constraint uber_gorjeta_caixa_external_unico unique (external_id)
);

comment on table public.uber_gorjeta_caixa_lancamentos is
  'Fila de Adiantamentos de gorjeta Uber a lançar no Caixa do colaborador no GRM (agente sync-uber-gorjeta-caixa).';

create index if not exists uber_gorjeta_caixa_status_idx
  on public.uber_gorjeta_caixa_lancamentos (status, solicitado_em);
create index if not exists uber_gorjeta_caixa_corrida_idx
  on public.uber_gorjeta_caixa_lancamentos (corrida_id);

alter table public.uber_gorjeta_caixa_lancamentos enable row level security;

drop policy if exists authenticated_read_uber_gorjeta_caixa on public.uber_gorjeta_caixa_lancamentos;
create policy authenticated_read_uber_gorjeta_caixa on public.uber_gorjeta_caixa_lancamentos
  as permissive for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Pede um job do agente (se ele estiver habilitado e não houver outro na fila).
create or replace function public.uber_gorjeta_solicitar_job(p_origem text, p_usuario text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_job uuid;
begin
  if not exists (
    select 1 from public.grm_sync_agent_settings
     where agent_id = 'sync-uber-gorjeta-caixa' and enabled is true
  ) then
    return null;
  end if;

  if exists (
    select 1 from public.grm_sync_jobs
     where agente_id = 'sync-uber-gorjeta-caixa' and status in ('pendente', 'rodando', 'processando')
  ) then
    return null;
  end if;

  insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
  values ('sync-uber-gorjeta-caixa', 'pendente', p_usuario,
          jsonb_build_object('origem', coalesce(p_origem, 'uber_gorjeta_caixa')))
  returning id into v_job;

  return v_job;
end;
$$;

revoke all on function public.uber_gorjeta_solicitar_job(text, text) from public;

-- ---------------------------------------------------------------------------
-- Gatilho: cada gorjeta nova que entra em conferencia_uber_corridas vira lançamento.
create or replace function public.uber_gorjeta_enfileirar_caixa()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_valor numeric;
  v_nome text;
  v_em timestamptz;
  v_desc text;
  v_novas integer := 0;
begin
  begin
    if new.external_id is null or new.external_id not like '%:TIP:%' then
      return new;
    end if;

    v_valor := round(coalesce(new.valor, new.preco_liquido, 0), 2);
    v_nome := nullif(btrim(coalesce(new.nome_colaborador, new.nome, '')), '');
    if v_valor <= 0 or v_nome is null or new.data_solicitacao_local is null then
      return new;
    end if;

    begin
      v_em := nullif(split_part(new.external_id, ':TIP:', 2), '')::timestamptz;
    exception when others then
      v_em := null;
    end;

    -- Descrição única por gorjeta (o agente barra duplicidade pela descrição no Caixa):
    -- instante da gorjeta em Brasília + início do id da corrida.
    v_desc := left(
      'Gorjeta Uber - '
      || to_char(coalesce(v_em, new.created_at, now()) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      || ' - corrida ' || left(split_part(new.external_id, ':TIP:', 1), 8),
      250);

    insert into public.uber_gorjeta_caixa_lancamentos (
      corrida_id, external_id, colaborador_nome, colaborador_email,
      valor, data_gorjeta, gorjeta_em, descricao_grm
    ) values (
      new.id, new.external_id, v_nome, nullif(btrim(coalesce(new.email, '')), ''),
      v_valor, new.data_solicitacao_local, v_em, v_desc
    )
    on conflict (external_id) do nothing;
    get diagnostics v_novas = row_count;

    if v_novas > 0 then
      perform public.uber_gorjeta_solicitar_job('uber_gorjeta_importacao');
    end if;
  exception when others then
    raise warning 'uber_gorjeta_enfileirar_caixa falhou (%): %', new.external_id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists uber_gorjeta_enfileirar_caixa on public.conferencia_uber_corridas;
create trigger uber_gorjeta_enfileirar_caixa
  after insert on public.conferencia_uber_corridas
  for each row
  when (new.external_id like '%:TIP:%')
  execute function public.uber_gorjeta_enfileirar_caixa();

-- ---------------------------------------------------------------------------
-- Gorjetas que já existiam: ficam registradas como CANCELADO (não serão lançadas) e,
-- por causa da chave única em external_id, uma reimportação não as enfileira.
insert into public.uber_gorjeta_caixa_lancamentos (
  corrida_id, external_id, colaborador_nome, colaborador_email,
  valor, data_gorjeta, gorjeta_em, descricao_grm,
  status, grm_retorno, processado_em
)
select
  c.id,
  c.external_id,
  btrim(coalesce(c.nome_colaborador, c.nome)),
  nullif(btrim(coalesce(c.email, '')), ''),
  round(coalesce(c.valor, c.preco_liquido), 2),
  c.data_solicitacao_local,
  case when split_part(c.external_id, ':TIP:', 2) ~ '^\d{4}-\d{2}-\d{2}T'
       then split_part(c.external_id, ':TIP:', 2)::timestamptz end,
  left('Gorjeta Uber - ' || to_char(c.data_solicitacao_local, 'DD/MM/YYYY')
       || ' - corrida ' || left(split_part(c.external_id, ':TIP:', 1), 8), 250),
  'CANCELADO',
  jsonb_build_object('motivo', 'Gorjeta anterior ao lançamento automático no Caixa (06/10/2026); não será lançada.'),
  now()
from public.conferencia_uber_corridas c
where c.external_id like '%:TIP:%'
  and coalesce(c.valor, c.preco_liquido, 0) > 0
  and nullif(btrim(coalesce(c.nome_colaborador, c.nome, '')), '') is not null
  and c.data_solicitacao_local is not null
on conflict (external_id) do nothing;

-- ---------------------------------------------------------------------------
-- Reenvio manual (botão do painel) das gorjetas que terminaram em ERRO (e religação do
-- agente para as PENDENTE paradas). O agente confere a descrição no Caixa antes de
-- lançar, então reenviar não duplica.
create or replace function public.uber_gorjeta_usuario_tem_acesso()
returns boolean
language sql
stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select exists (
    select 1
    from public.app_usuarios u
    left join public.app_perfis p on p.id = u.perfil_id
    where (
      u.auth_user_id = auth.uid()
      or lower(u.email) = lower(coalesce(auth.email(), ''))
    )
      and lower(coalesce(u.status, '')) = 'ativo'
      and (
        lower(coalesce(p.codigo, '')) = 'master'
        or exists (
          select 1
          from public.app_usuario_modulos um
          join public.app_modulos m on m.id = um.modulo_id
          where um.usuario_id = u.id
            and um.ativo = true
            and lower(coalesce(um.status, 'ativo')) = 'ativo'
            and m.ativo = true
            and lower(m.codigo) = 'conferencia_uber'
        )
      )
  );
$$;

create or replace function public.uber_gorjeta_reenviar_caixa(p_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_reenviados integer := 0;
  v_job uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.uber_gorjeta_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para reenviar gorjetas ao Caixa';
  end if;

  update public.uber_gorjeta_caixa_lancamentos
     set status = 'PENDENTE', tentativas = 0, ultimo_erro = null,
         iniciado_em = null, processado_em = null, solicitado_em = now(), updated_at = now()
   where status = 'ERRO'
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_reenviados = row_count;

  -- Também religa o agente quando há gorjeta PENDENTE parada (ex.: token diário do GRM
  -- vencido na hora em que a importação enfileirou o job).
  if v_reenviados > 0 or exists (
    select 1 from public.uber_gorjeta_caixa_lancamentos where status = 'PENDENTE'
  ) then
    v_job := public.uber_gorjeta_solicitar_job('uber_gorjeta_reenvio', v_uid::text);
  end if;

  return jsonb_build_object('reenviados', v_reenviados, 'job_id', v_job);
end;
$$;

revoke all on function public.uber_gorjeta_usuario_tem_acesso() from public;
revoke all on function public.uber_gorjeta_reenviar_caixa(uuid[]) from public;
grant execute on function public.uber_gorjeta_usuario_tem_acesso() to authenticated;
grant execute on function public.uber_gorjeta_reenviar_caixa(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Agente do Caixa: mesma lane e mesmo mutex_group (staff_grm) dos demais agentes que
-- abrem o cadastro do Staff no GRM. Sem agendamento: só roda pelos jobs acima.
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-uber-gorjeta-caixa', 'saida_financeiro', 0, true,
  'saida_financeiro', 'saida', 'heavy', 85,
  10, '[]'::jsonb, 'staff_grm'
)
on conflict (agent_id) do update set
  queue_lane = excluded.queue_lane,
  target_lane = excluded.target_lane,
  direction = excluded.direction,
  resource_class = excluded.resource_class,
  priority = excluded.priority,
  max_runtime_minutes = excluded.max_runtime_minutes,
  mutex_group = excluded.mutex_group,
  updated_at = now();
