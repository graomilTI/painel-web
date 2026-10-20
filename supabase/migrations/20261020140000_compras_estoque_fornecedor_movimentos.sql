-- Estoque no fornecedor: movimentações (compra antecipada, baixa/envio às regionais, ajuste) e
-- pendência de NF/pagamento quando a baixa pedida passa do saldo comprado.
-- Depende de 20261020130000_compras_estoque_fornecedor.sql.

create table if not exists public.compras_estoque_fornecedor_mov (
  id uuid primary key default gen_random_uuid(),
  estoque_id uuid not null references public.compras_estoque_fornecedor(id) on delete restrict,
  tipo text not null check (tipo in ('entrada','baixa','ajuste')),
  quantidade numeric(12,2) not null check (quantidade >= 0),
  -- parte da baixa que saiu do saldo já comprado e parte que não tinha saldo (vira NF nova)
  quantidade_estoque numeric(12,2) not null default 0 check (quantidade_estoque >= 0),
  quantidade_pendente numeric(12,2) not null default 0 check (quantidade_pendente >= 0),
  data_movimentacao date not null default current_date,
  destino text,
  numero_nf text,
  valor_unitario numeric(12,2),
  observacao text,
  pendencia_status text check (pendencia_status in ('aguardando_nf','nf_emitida','paga')),
  pendencia_nf text,
  pendencia_valor numeric(12,2),
  pendencia_data_pgto date,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compras_estoque_forn_mov_estoque on public.compras_estoque_fornecedor_mov(estoque_id, created_at desc);
create index if not exists idx_compras_estoque_forn_mov_pendencia on public.compras_estoque_fornecedor_mov(pendencia_status) where quantidade_pendente > 0;

drop trigger if exists trg_compras_estoque_forn_mov_updated_at on public.compras_estoque_fornecedor_mov;
create trigger trg_compras_estoque_forn_mov_updated_at
before update on public.compras_estoque_fornecedor_mov
for each row execute function public.set_updated_at();

alter table public.compras_estoque_fornecedor_mov enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='compras_estoque_fornecedor_mov' and policyname='compras_estoque_fornecedor_mov_auth_all') then
    create policy compras_estoque_fornecedor_mov_auth_all on public.compras_estoque_fornecedor_mov for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Compra antecipada: soma no saldo do fornecedor.
create or replace function public.compras_estoque_fornecedor_entrada(
  p_estoque_id uuid, p_quantidade numeric, p_data date, p_nf text, p_valor numeric, p_obs text, p_usuario_id uuid, p_usuario_nome text
) returns jsonb
language plpgsql
as $$
declare
  v_saldo numeric;
begin
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero.'; end if;
  select quantidade into v_saldo from public.compras_estoque_fornecedor where id = p_estoque_id and ativo for update;
  if not found then raise exception 'Item do fornecedor não encontrado.'; end if;
  update public.compras_estoque_fornecedor
     set quantidade = round(v_saldo + p_quantidade, 2),
         valor_unitario = coalesce(p_valor, valor_unitario),
         usuario_id = p_usuario_id, usuario_nome = p_usuario_nome
   where id = p_estoque_id;
  insert into public.compras_estoque_fornecedor_mov (estoque_id, tipo, quantidade, quantidade_estoque, data_movimentacao, numero_nf, valor_unitario, observacao, usuario_id, usuario_nome)
  values (p_estoque_id, 'entrada', p_quantidade, p_quantidade, coalesce(p_data, current_date), nullif(trim(p_nf), ''), p_valor, nullif(trim(p_obs), ''), p_usuario_id, p_usuario_nome);
  return jsonb_build_object('saldo', round(v_saldo + p_quantidade, 2));
end $$;

-- Baixa/envio às regionais: sai do saldo comprado; o que passar do saldo fica como pendência de NF.
create or replace function public.compras_estoque_fornecedor_baixar(
  p_estoque_id uuid, p_quantidade numeric, p_destino text, p_data date, p_obs text, p_usuario_id uuid, p_usuario_nome text
) returns jsonb
language plpgsql
as $$
declare
  v_saldo numeric;
  v_valor numeric;
  v_sai numeric;
  v_pend numeric;
  v_mov uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero.'; end if;
  select quantidade, valor_unitario into v_saldo, v_valor from public.compras_estoque_fornecedor where id = p_estoque_id and ativo for update;
  if not found then raise exception 'Item do fornecedor não encontrado.'; end if;
  v_sai := least(greatest(v_saldo, 0), p_quantidade);
  v_pend := round(p_quantidade - v_sai, 2);
  update public.compras_estoque_fornecedor
     set quantidade = round(v_saldo - v_sai, 2), usuario_id = p_usuario_id, usuario_nome = p_usuario_nome
   where id = p_estoque_id;
  insert into public.compras_estoque_fornecedor_mov (estoque_id, tipo, quantidade, quantidade_estoque, quantidade_pendente, data_movimentacao, destino, valor_unitario, observacao, pendencia_status, usuario_id, usuario_nome)
  values (p_estoque_id, 'baixa', p_quantidade, v_sai, v_pend, coalesce(p_data, current_date), nullif(trim(p_destino), ''), v_valor, nullif(trim(p_obs), ''), case when v_pend > 0 then 'aguardando_nf' end, p_usuario_id, p_usuario_nome)
  returning id into v_mov;
  return jsonb_build_object('mov_id', v_mov, 'quantidade_estoque', v_sai, 'quantidade_pendente', v_pend, 'saldo', round(v_saldo - v_sai, 2));
end $$;

-- Correção manual do saldo (contagem), com registro.
create or replace function public.compras_estoque_fornecedor_ajustar(
  p_estoque_id uuid, p_nova_quantidade numeric, p_motivo text, p_usuario_id uuid, p_usuario_nome text
) returns jsonb
language plpgsql
as $$
declare
  v_saldo numeric;
begin
  if p_nova_quantidade is null or p_nova_quantidade < 0 then raise exception 'Quantidade inválida.'; end if;
  select quantidade into v_saldo from public.compras_estoque_fornecedor where id = p_estoque_id and ativo for update;
  if not found then raise exception 'Item do fornecedor não encontrado.'; end if;
  update public.compras_estoque_fornecedor
     set quantidade = round(p_nova_quantidade, 2), usuario_id = p_usuario_id, usuario_nome = p_usuario_nome
   where id = p_estoque_id;
  insert into public.compras_estoque_fornecedor_mov (estoque_id, tipo, quantidade, quantidade_estoque, observacao, usuario_id, usuario_nome)
  values (p_estoque_id, 'ajuste', abs(round(p_nova_quantidade - v_saldo, 2)), 0,
          coalesce(nullif(trim(p_motivo), ''), 'Ajuste manual') || ' (saldo ' || v_saldo || ' → ' || round(p_nova_quantidade, 2) || ')',
          p_usuario_id, p_usuario_nome);
  return jsonb_build_object('saldo', round(p_nova_quantidade, 2));
end $$;

revoke all on function public.compras_estoque_fornecedor_entrada(uuid, numeric, date, text, numeric, text, uuid, text) from public, anon;
revoke all on function public.compras_estoque_fornecedor_baixar(uuid, numeric, text, date, text, uuid, text) from public, anon;
revoke all on function public.compras_estoque_fornecedor_ajustar(uuid, numeric, text, uuid, text) from public, anon;
grant execute on function public.compras_estoque_fornecedor_entrada(uuid, numeric, date, text, numeric, text, uuid, text) to authenticated;
grant execute on function public.compras_estoque_fornecedor_baixar(uuid, numeric, text, date, text, uuid, text) to authenticated;
grant execute on function public.compras_estoque_fornecedor_ajustar(uuid, numeric, text, uuid, text) to authenticated;
