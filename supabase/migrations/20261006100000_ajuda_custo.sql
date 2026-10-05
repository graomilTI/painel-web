-- Ajuda de custo (RH > Folha e Holerite > aba "Ajuda de custo"  ->  Financeiro > Ajuda de Custo).
--
-- Fluxo:
--   1. RH informa por mês de referência: colaborador, conta de pagamento (iFood ou
--      Flash), valor e descrição (rh_ajuda_custo).
--   2. O Financeiro vê a relação do mês e, a partir do dia 15 do mês de referência,
--      baixa as planilhas PGTO_IFOOD / PGTO_FLASH (RPC ajuda_custo_gerar_lote).
--   3. Gerar o lote trava as linhas (RH não edita mais) e enfileira, para cada ajuda,
--      dois lançamentos no Caixa do colaborador no GRM: ADIANTAMENTO e COMPROVANTE
--      (ajuda_custo_caixa_lancamentos), executados pelo agente sync-ajuda-custo-caixa.
--
-- Data do lançamento no GRM: dia 15 do mês de referência (mesma convenção do Bônus).
-- Descrição no GRM: "<descrição do RH> - MM/AAAA" — o mês entra na descrição porque o
-- agente barra duplicidade pela descrição e a mesma ajuda se repete todo mês.

-- ---------------------------------------------------------------------------
-- Lotes de planilhas geradas pelo Financeiro (1 por clique em "XLS"; ajudas
-- incluídas depois que o lote foi gerado entram num lote novo, sem repetir as antigas).
create table if not exists public.rh_ajuda_custo_lotes (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  numero integer not null,
  total_linhas integer not null default 0,
  total_valor numeric(14,2) not null default 0,
  linhas_ifood integer not null default 0,
  linhas_flash integer not null default 0,
  gerado_por uuid,
  gerado_por_nome text,
  gerado_em timestamptz not null default now(),
  constraint rh_ajuda_custo_lotes_competencia_check
    check (competencia = date_trunc('month', competencia)::date),
  constraint rh_ajuda_custo_lotes_unico unique (competencia, numero)
);

-- ---------------------------------------------------------------------------
-- Ajudas de custo informadas pelo RH (uma linha = colaborador + conta + valor + descrição).
create table if not exists public.rh_ajuda_custo (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  colaborador_nome text not null,
  colaborador_cpf text not null,
  conta text not null,
  valor numeric(14,2) not null,
  descricao text not null,
  lote_id uuid references public.rh_ajuda_custo_lotes(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rh_ajuda_custo_competencia_check
    check (competencia = date_trunc('month', competencia)::date),
  constraint rh_ajuda_custo_conta_check check (conta in ('ifood', 'flash')),
  constraint rh_ajuda_custo_valor_check check (valor > 0),
  constraint rh_ajuda_custo_cpf_check check (colaborador_cpf ~ '^[0-9]{11}$'),
  -- "<descrição> - MM/AAAA" precisa caber nos 250 caracteres do campo no GRM.
  constraint rh_ajuda_custo_descricao_check
    check (char_length(btrim(descricao)) between 1 and 200)
);

comment on table public.rh_ajuda_custo is
  'Ajuda de custo mensal informada pelo RH (conta iFood/Flash). Ao gerar as planilhas o Financeiro trava a linha (lote_id).';
comment on column public.rh_ajuda_custo.competencia is 'Mês de referência (dia 1). O pagamento e o lançamento no GRM são no dia 15 desse mês.';

create index if not exists rh_ajuda_custo_competencia_idx on public.rh_ajuda_custo (competencia);
create index if not exists rh_ajuda_custo_colaborador_idx on public.rh_ajuda_custo (colaborador_id);
create index if not exists rh_ajuda_custo_lote_idx on public.rh_ajuda_custo (lote_id) where lote_id is not null;

-- Linha já enviada ao Financeiro não pode mais ser editada nem excluída pelo RH.
create or replace function public.rh_ajuda_custo_trava_lote()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.lote_id is not null then
      raise exception 'Esta ajuda de custo já foi enviada ao Financeiro (planilha gerada) e não pode ser excluída.';
    end if;
    return old;
  end if;
  if old.lote_id is not null then
    raise exception 'Esta ajuda de custo já foi enviada ao Financeiro (planilha gerada) e não pode ser alterada.';
  end if;
  return new;
end;
$$;

drop trigger if exists rh_ajuda_custo_trava_lote on public.rh_ajuda_custo;
create trigger rh_ajuda_custo_trava_lote
  before update or delete on public.rh_ajuda_custo
  for each row execute function public.rh_ajuda_custo_trava_lote();

-- ---------------------------------------------------------------------------
-- Fila do agente: dois lançamentos (ADIANTAMENTO e COMPROVANTE) por ajuda de custo.
create table if not exists public.ajuda_custo_caixa_lancamentos (
  id uuid primary key default gen_random_uuid(),
  ajuda_id uuid not null references public.rh_ajuda_custo(id),
  lote_id uuid not null references public.rh_ajuda_custo_lotes(id),
  competencia date not null,
  colaborador_id uuid,
  colaborador_nome text not null,
  colaborador_cpf text not null,
  movimento text not null,
  valor numeric(14,2) not null,
  descricao_grm text not null,
  data_lancamento date not null,
  status text not null default 'PENDENTE',
  tentativas integer not null default 0,
  ultimo_erro text,
  grm_retorno jsonb,
  solicitado_por uuid,
  solicitado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ajuda_custo_caixa_movimento_check check (movimento in ('ADIANTAMENTO', 'COMPROVANTE')),
  constraint ajuda_custo_caixa_status_check
    check (status in ('PENDENTE', 'PROCESSANDO', 'LANCADO', 'ERRO', 'CANCELADO')),
  constraint ajuda_custo_caixa_unico unique (ajuda_id, movimento)
);

create index if not exists ajuda_custo_caixa_status_idx
  on public.ajuda_custo_caixa_lancamentos (status, solicitado_em);
create index if not exists ajuda_custo_caixa_lote_idx
  on public.ajuda_custo_caixa_lancamentos (lote_id);

-- ---------------------------------------------------------------------------
-- RLS no padrão das tabelas rh_*: leitura para autenticados. O RH escreve em
-- rh_ajuda_custo (a trava acima protege as linhas já enviadas); lotes e fila só
-- mudam pelas RPCs abaixo (security definer) e pelo agente (service role).
alter table public.rh_ajuda_custo enable row level security;
alter table public.rh_ajuda_custo_lotes enable row level security;
alter table public.ajuda_custo_caixa_lancamentos enable row level security;

drop policy if exists authenticated_read_rh_ajuda_custo on public.rh_ajuda_custo;
create policy authenticated_read_rh_ajuda_custo on public.rh_ajuda_custo
  as permissive for select to authenticated using (true);

drop policy if exists authenticated_write_rh_ajuda_custo on public.rh_ajuda_custo;
create policy authenticated_write_rh_ajuda_custo on public.rh_ajuda_custo
  as permissive for all to authenticated using (true) with check (true);

drop policy if exists authenticated_read_rh_ajuda_custo_lotes on public.rh_ajuda_custo_lotes;
create policy authenticated_read_rh_ajuda_custo_lotes on public.rh_ajuda_custo_lotes
  as permissive for select to authenticated using (true);

drop policy if exists authenticated_read_ajuda_custo_caixa on public.ajuda_custo_caixa_lancamentos;
create policy authenticated_read_ajuda_custo_caixa on public.ajuda_custo_caixa_lancamentos
  as permissive for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Módulo de permissão do Financeiro > Ajuda de Custo (liberar em Usuários e Acessos).
insert into public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo, descricao)
values (
  'financeiro_ajuda_custo', 'Ajuda de Custo', 'FINANCEIRO', 'wallet',
  'financeiro-ajuda-custo', 82, true,
  'Relação mensal de ajuda de custo (iFood/Flash) informada pelo RH, planilhas de pagamento e lançamento no Caixa do GRM.'
)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  icone = excluded.icone,
  rota = excluded.rota,
  ordem = excluded.ordem,
  ativo = excluded.ativo,
  descricao = excluded.descricao,
  updated_at = now();

create or replace function public.ajuda_custo_usuario_tem_acesso()
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
            and lower(m.codigo) = 'financeiro_ajuda_custo'
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Gera o lote do mês: trava as ajudas ainda sem lote, enfileira ADIANTAMENTO +
-- COMPROVANTE de cada uma no Caixa do GRM e dispara o agente. Só a partir do dia 15
-- do mês de referência (regra validada com o Financeiro; meses passados sempre liberados).
create or replace function public.ajuda_custo_gerar_lote(p_competencia date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_comp date := date_trunc('month', p_competencia)::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_data_lancamento date;
  v_lote uuid;
  v_numero integer;
  v_nome text;
  v_total integer;
  v_valor numeric;
  v_ifood integer;
  v_flash integer;
  v_job uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.ajuda_custo_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para gerar as planilhas de Ajuda de Custo';
  end if;
  if p_competencia is null then
    raise exception 'Competência obrigatória';
  end if;

  v_data_lancamento := v_comp + 14;
  if v_hoje < v_data_lancamento then
    raise exception 'As planilhas de % só podem ser geradas a partir de %.',
      to_char(v_comp, 'MM/YYYY'), to_char(v_data_lancamento, 'DD/MM/YYYY');
  end if;

  -- Serializa a geração do mesmo mês: dois cliques simultâneos não repetem pagamento.
  perform pg_advisory_xact_lock(hashtext('ajuda_custo_lote:' || v_comp::text));

  if not exists (select 1 from public.rh_ajuda_custo where competencia = v_comp and lote_id is null) then
    raise exception 'Não há ajuda de custo nova para gerar em %.', to_char(v_comp, 'MM/YYYY');
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
  from public.rh_ajuda_custo_lotes where competencia = v_comp;

  select coalesce(nullif(btrim(u.nome), ''), u.email) into v_nome
  from public.app_usuarios u
  where u.auth_user_id = v_uid or lower(u.email) = lower(coalesce(auth.email(), ''))
  limit 1;

  insert into public.rh_ajuda_custo_lotes (competencia, numero, gerado_por, gerado_por_nome)
  values (v_comp, v_numero, v_uid, v_nome)
  returning id into v_lote;

  update public.rh_ajuda_custo
     set lote_id = v_lote, updated_at = now()
   where competencia = v_comp and lote_id is null;

  -- Dois movimentos por ajuda. Descrição no GRM = descrição do RH + mês de referência.
  insert into public.ajuda_custo_caixa_lancamentos (
    ajuda_id, lote_id, competencia, colaborador_id, colaborador_nome, colaborador_cpf,
    movimento, valor, descricao_grm, data_lancamento, solicitado_por
  )
  select a.id, v_lote, a.competencia, a.colaborador_id, a.colaborador_nome, a.colaborador_cpf,
         m.movimento, a.valor,
         left(btrim(a.descricao) || ' - ' || to_char(a.competencia, 'MM/YYYY'), 250),
         v_data_lancamento, v_uid
    from public.rh_ajuda_custo a
   cross join (values ('ADIANTAMENTO'), ('COMPROVANTE')) as m(movimento)
   where a.lote_id = v_lote;

  select count(*), coalesce(sum(valor), 0),
         count(*) filter (where conta = 'ifood'),
         count(*) filter (where conta = 'flash')
    into v_total, v_valor, v_ifood, v_flash
    from public.rh_ajuda_custo where lote_id = v_lote;

  update public.rh_ajuda_custo_lotes
     set total_linhas = v_total, total_valor = v_valor,
         linhas_ifood = v_ifood, linhas_flash = v_flash
   where id = v_lote;

  if not exists (
    select 1 from public.grm_sync_jobs
     where agente_id = 'sync-ajuda-custo-caixa' and status in ('pendente', 'rodando', 'processando')
  ) then
    insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
    values ('sync-ajuda-custo-caixa', 'pendente', v_uid::text,
            jsonb_build_object('competencia', v_comp, 'lote_id', v_lote, 'origem', 'financeiro_ajuda_custo'))
    returning id into v_job;
  end if;

  return jsonb_build_object(
    'lote_id', v_lote, 'numero', v_numero, 'competencia', v_comp,
    'total_linhas', v_total, 'total_valor', v_valor,
    'linhas_ifood', v_ifood, 'linhas_flash', v_flash,
    'data_lancamento', v_data_lancamento, 'job_id', v_job
  );
end;
$$;

-- Reenvia ao Caixa os lançamentos de um lote que terminaram em ERRO.
create or replace function public.ajuda_custo_reenviar_caixa(p_lote_id uuid)
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
  if not public.ajuda_custo_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para reenviar lançamentos de Ajuda de Custo';
  end if;

  update public.ajuda_custo_caixa_lancamentos
     set status = 'PENDENTE', tentativas = 0, ultimo_erro = null,
         iniciado_em = null, processado_em = null, solicitado_em = now(), updated_at = now()
   where lote_id = p_lote_id and status = 'ERRO';
  get diagnostics v_reenviados = row_count;

  if v_reenviados > 0 and not exists (
    select 1 from public.grm_sync_jobs
     where agente_id = 'sync-ajuda-custo-caixa' and status in ('pendente', 'rodando', 'processando')
  ) then
    insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
    values ('sync-ajuda-custo-caixa', 'pendente', v_uid::text,
            jsonb_build_object('lote_id', p_lote_id, 'origem', 'financeiro_ajuda_custo_reenvio'))
    returning id into v_job;
  end if;

  return jsonb_build_object('reenviados', v_reenviados, 'job_id', v_job);
end;
$$;

revoke all on function public.ajuda_custo_gerar_lote(date) from public;
revoke all on function public.ajuda_custo_reenviar_caixa(uuid) from public;
grant execute on function public.ajuda_custo_gerar_lote(date) to authenticated;
grant execute on function public.ajuda_custo_reenviar_caixa(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Agente do Caixa (Puppeteer): mesma lane e mesmo mutex_group (staff_grm) do Bônus,
-- Desconto de auditoria e Frotas — todos abrem o cadastro do Staff no GRM e não podem
-- rodar ao mesmo tempo. Sem agendamento: só roda pelos jobs das RPCs acima.
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-ajuda-custo-caixa', 'saida_financeiro', 0, true,
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
