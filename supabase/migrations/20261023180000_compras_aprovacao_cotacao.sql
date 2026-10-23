-- Solicitação de aprovação de cotação: depois de cotar, Compras pede a aprovação do Financeiro (Financeiro > Cotações).
--   compras_aprovacoes        -> um pedido por gestor (solicitante): código, data, status e decisão
--   compras_aprovacao_itens   -> materiais do pedido (os valores cotados por fornecedor vêm das respostas da cotação)
-- Código: inicial do setor que pediu + mês + sequência do mês (ex.: COUT23), mesmo padrão de gerar_codigo_compra.
-- Pedir e decidir são RPCs (atômicas): mexem no pedido e no status dos itens juntos.

create table if not exists public.compras_aprovacoes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  setor_inicial text not null,
  ano int not null,
  mes int not null,
  sequencia int not null,
  solicitante text not null,
  solicitado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  solicitado_por_nome text,
  setor_solicitante text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  motivo_recusa text,
  decidido_por text,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists compras_aprovacoes_codigo_uidx on public.compras_aprovacoes (ano, mes, codigo);
create index if not exists compras_aprovacoes_status_idx on public.compras_aprovacoes (status, created_at desc);

create table if not exists public.compras_aprovacao_itens (
  aprovacao_id uuid not null references public.compras_aprovacoes(id) on delete cascade,
  compra_item_id uuid not null references public.compras_itens(id) on delete cascade,
  primary key (aprovacao_id, compra_item_id)
);
create index if not exists compras_aprovacao_itens_item_idx on public.compras_aprovacao_itens (compra_item_id);

drop trigger if exists trg_compras_aprovacoes_updated_at on public.compras_aprovacoes;
create trigger trg_compras_aprovacoes_updated_at before update on public.compras_aprovacoes
  for each row execute function set_updated_at();

alter table public.compras_aprovacoes enable row level security;
alter table public.compras_aprovacao_itens enable row level security;
do $$
declare
  t text;
begin
  foreach t in array array['compras_aprovacoes', 'compras_aprovacao_itens'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated_all_' || t) then
      execute format('create policy %I on public.%I as permissive for all to authenticated using (true) with check (true)', 'authenticated_all_' || t, t);
    end if;
  end loop;
end $$;
revoke all on public.compras_aprovacoes, public.compras_aprovacao_itens from anon;

-- Pede a aprovação dos itens: um pedido (e um código) por gestor; os itens vão para "em_analise".
create or replace function public.compras_solicitar_aprovacao(p_item_ids uuid[], p_setor text default null, p_nome text default null)
returns table (out_id uuid, out_codigo text, out_solicitante text, out_itens int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_letra text := upper(left(coalesce(nullif(trim(p_setor), ''), 'Compras'), 1));
  v_local timestamp := now() at time zone 'America/Sao_Paulo';
  v_ano int := extract(year from v_local)::int;
  v_mes int := extract(month from v_local)::int;
  v_mes_abrev text := (array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'])[v_mes];
  g record;
  v_contador int;
  v_cod text;
  v_id uuid;
begin
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'Nenhum item informado.';
  end if;
  if exists (select 1 from compras_itens where id = any (p_item_ids) and status not in ('pendente', 'em_cotacao')) then
    raise exception 'Só itens em cotação podem ser enviados para aprovação.';
  end if;
  if exists (select 1 from compras_aprovacao_itens ai join compras_aprovacoes a on a.id = ai.aprovacao_id
             where ai.compra_item_id = any (p_item_ids) and a.status = 'pendente') then
    raise exception 'Algum item já está aguardando aprovação.';
  end if;

  for g in
    select coalesce(nullif(trim(s.solicitante), ''), 'Gestor') as nome, array_agg(i.id order by i.created_at, i.id) as ids
    from compras_itens i
    join compras_solicitacoes s on s.id = i.solicitacao_id
    where i.id = any (p_item_ids)
    group by 1
    order by 1
  loop
    insert into compras_codigo_contadores (tipo, ano, mes, contador)
    values ('APR-' || v_letra, v_ano, v_mes, 1)
    on conflict (tipo, ano, mes) do update set contador = compras_codigo_contadores.contador + 1
    returning contador into v_contador;
    v_cod := v_letra || v_mes_abrev || lpad(v_contador::text, 2, '0');

    insert into compras_aprovacoes (codigo, setor_inicial, ano, mes, sequencia, solicitante, solicitado_por_nome, setor_solicitante)
    values (v_cod, v_letra, v_ano, v_mes, v_contador, g.nome, p_nome, p_setor)
    returning id into v_id;

    insert into compras_aprovacao_itens (aprovacao_id, compra_item_id) select v_id, unnest(g.ids);
    update compras_itens set status = 'em_analise' where id = any (g.ids);

    out_id := v_id; out_codigo := v_cod; out_solicitante := g.nome; out_itens := cardinality(g.ids);
    return next;
  end loop;
end;
$$;

-- Aprova (itens voltam para Cotações, prontos para comprar) ou recusa (itens vão para Recusados com o motivo).
create or replace function public.compras_decidir_aprovacao(p_id uuid, p_aprovar boolean, p_motivo text default null, p_nome text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
begin
  select status into v_status from compras_aprovacoes where id = p_id for update;
  if v_status is null then
    raise exception 'Solicitação de aprovação não encontrada.';
  end if;
  if v_status <> 'pendente' then
    raise exception 'Esta solicitação já foi decidida.';
  end if;
  if not p_aprovar and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da recusa.';
  end if;

  update compras_aprovacoes
     set status = case when p_aprovar then 'aprovada' else 'recusada' end,
         motivo_recusa = case when p_aprovar then null else trim(p_motivo) end,
         decidido_por = p_nome,
         decidido_em = now()
   where id = p_id;

  if p_aprovar then
    update compras_itens set status = 'pendente', aprovado_por = p_nome, aprovado_em = now()
     where id in (select compra_item_id from compras_aprovacao_itens where aprovacao_id = p_id) and status = 'em_analise';
  else
    update compras_itens set status = 'recusado', recusado_por = p_nome, motivo_recusa = trim(p_motivo)
     where id in (select compra_item_id from compras_aprovacao_itens where aprovacao_id = p_id) and status = 'em_analise';
  end if;
end;
$$;

revoke all on function public.compras_solicitar_aprovacao(uuid[], text, text) from public, anon;
revoke all on function public.compras_decidir_aprovacao(uuid, boolean, text, text) from public, anon;
grant execute on function public.compras_solicitar_aprovacao(uuid[], text, text) to authenticated;
grant execute on function public.compras_decidir_aprovacao(uuid, boolean, text, text) to authenticated;

-- Módulo do menu Financeiro > Cotações (para liberar por usuário em Usuários e Acessos).
insert into public.modules (code, name, area, active)
select 'financeiro_cotacoes', 'Cotações', 'FINANCEIRO', true
where not exists (select 1 from public.modules where code = 'financeiro_cotacoes');
