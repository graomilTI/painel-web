-- Financeiro escolhe o fornecedor ao aprovar a cotação (pode ser um dos que responderam ou outro, informado à mão).
-- Guarda quem foi escolhido e o valor aprovado (itens + frete estimado quando o frete é do cliente).
alter table public.compras_aprovacoes
  add column if not exists fornecedor_cnpj text,
  add column if not exists fornecedor_nome text,
  add column if not exists valor_aprovado numeric check (valor_aprovado is null or valor_aprovado >= 0);

-- Mesma RPC, agora com o fornecedor escolhido. A versão antiga (sem fornecedor) deixa de existir: aprovar exige o fornecedor.
drop function if exists public.compras_decidir_aprovacao(uuid, boolean, text, text);

create or replace function public.compras_decidir_aprovacao(
  p_id uuid,
  p_aprovar boolean,
  p_motivo text default null,
  p_nome text default null,
  p_fornecedor_nome text default null,
  p_fornecedor_cnpj text default null,
  p_valor numeric default null
)
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
  if p_aprovar and coalesce(trim(p_fornecedor_nome), '') = '' then
    raise exception 'Informe o fornecedor escolhido.';
  end if;

  update compras_aprovacoes
     set status = case when p_aprovar then 'aprovada' else 'recusada' end,
         motivo_recusa = case when p_aprovar then null else trim(p_motivo) end,
         fornecedor_nome = case when p_aprovar then trim(p_fornecedor_nome) else null end,
         fornecedor_cnpj = case when p_aprovar then nullif(regexp_replace(coalesce(p_fornecedor_cnpj, ''), '\D', '', 'g'), '') else null end,
         valor_aprovado = case when p_aprovar then p_valor else null end,
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

revoke all on function public.compras_decidir_aprovacao(uuid, boolean, text, text, text, text, numeric) from public, anon;
grant execute on function public.compras_decidir_aprovacao(uuid, boolean, text, text, text, text, numeric) to authenticated;
