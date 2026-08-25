-- Endurece e torna atomico o fluxo Hospedagem -> Financeiro.
-- Mantem compatibilidade com o frontend atual enquanto centraliza as invariantes
-- financeiras no banco.

-- ---------------------------------------------------------------------------
-- Integridade e identidade
-- ---------------------------------------------------------------------------

create unique index if not exists hospedagem_financeiro_reserva_uidx
  on public.hospedagem_financeiro (reserva_id);

create unique index if not exists hospedagem_documentos_external_message_uidx
  on public.hospedagem_documentos (external_message_id)
  where external_message_id is not null;

create unique index if not exists hospedagem_documentos_reserva_tipo_arquivo_uidx
  on public.hospedagem_documentos (reserva_id, tipo, arquivo_url)
  where reserva_id is not null and arquivo_url is not null;

-- A coluna antiga apontava para uma entidade que nao possui id simples.
-- Criamos a identidade correta e preservamos a coluna por compatibilidade.
alter table public.hospedagem_checkout_lote_colaboradores
  add column if not exists solicitacao_colaborador_id uuid;

update public.hospedagem_checkout_lote_colaboradores lc
set solicitacao_colaborador_id = lc.reserva_colaborador_id
where lc.solicitacao_colaborador_id is null
  and exists (
    select 1 from public.hospedagem_solicitacao_colaboradores sc
    where sc.id=lc.reserva_colaborador_id
  );

alter table public.hospedagem_checkout_lote_colaboradores
  add constraint hospedagem_checkout_lote_colab_solicitacao_fk
  foreign key (solicitacao_colaborador_id)
  references public.hospedagem_solicitacao_colaboradores(id)
  on delete restrict
  not valid;

alter table public.hospedagem_checkout_lote_colaboradores
  validate constraint hospedagem_checkout_lote_colab_solicitacao_fk;

create unique index if not exists hospedagem_checkout_lote_colab_id_uidx
  on public.hospedagem_checkout_lote_colaboradores(lote_id, solicitacao_colaborador_id)
  where solicitacao_colaborador_id is not null;

alter table public.financeiro_pagamentos
  add column if not exists hospedagem_checkout_lote_id uuid;

alter table public.financeiro_pagamentos
  add constraint financeiro_pagamentos_checkout_lote_fk
  foreign key (hospedagem_checkout_lote_id)
  references public.hospedagem_checkout_lotes(id)
  on delete restrict
  not valid;

alter table public.financeiro_pagamentos
  validate constraint financeiro_pagamentos_checkout_lote_fk;

create unique index if not exists financeiro_pagamentos_checkout_lote_uidx
  on public.financeiro_pagamentos (hospedagem_checkout_lote_id)
  where hospedagem_checkout_lote_id is not null;

create index if not exists financeiro_pagamentos_hospedagem_reserva_idx
  on public.financeiro_pagamentos (origem_id)
  where origem_setor = 'HOSPEDAGEM';

-- O campo legado sempre dizia "aberto". Mantemos sincronizado para leitores
-- antigos ate sua remocao definitiva.
create or replace function public.hospedagem_sincronizar_status_legado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := lower(coalesce(new.status_solicitacao, 'SOLICITADA'));
  return new;
end;
$$;

drop trigger if exists trg_hospedagem_sincronizar_status_legado on public.hospedagem_solicitacoes;
create trigger trg_hospedagem_sincronizar_status_legado
before insert or update of status_solicitacao on public.hospedagem_solicitacoes
for each row execute function public.hospedagem_sincronizar_status_legado();

update public.hospedagem_solicitacoes
set status = lower(coalesce(status_solicitacao, 'SOLICITADA'))
where status is distinct from lower(coalesce(status_solicitacao, 'SOLICITADA'));

-- ---------------------------------------------------------------------------
-- RLS por modulo e por propriedade da solicitacao
-- ---------------------------------------------------------------------------

create or replace function public.hospedagem_pode_operar(p_editar boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.painel_has_module(
    array['hotel','hotel_alojamentos','adm_hotel','hospedagem'],
    p_editar
  );
$$;

create or replace function public.hospedagem_pode_financeiro(p_editar boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.painel_has_module(
    array['financeiro_pagamentos','pagamentos','financeiro'],
    p_editar
  );
$$;

revoke all on function public.hospedagem_pode_operar(boolean) from public;
revoke all on function public.hospedagem_pode_financeiro(boolean) from public;
grant execute on function public.hospedagem_pode_operar(boolean) to authenticated;
grant execute on function public.hospedagem_pode_financeiro(boolean) to authenticated;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'hospedagem_hoteis','hospedagem_reservas','hospedagem_reserva_solicitacoes',
    'hospedagem_reserva_colaboradores','hospedagem_cotacoes','hospedagem_custos_extras',
    'hospedagem_documentos','hospedagem_mensagens','hospedagem_eventos',
    'hospedagem_checkout_lotes','hospedagem_checkout_lote_colaboradores',
    'hospedagem_adiantamentos','hospedagem_adiantamento_movimentos','hospedagem_financeiro'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.hospedagem_pode_operar(false) or public.hospedagem_pode_financeiro(false))',
      t || '_select_authorized', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.hospedagem_pode_operar(true)) with check (public.hospedagem_pode_operar(true))',
      t || '_write_hotel', t
    );
  end loop;
end $$;

-- Solicitacoes: o gestor ve/cria as proprias; Hospedagem opera todas.
do $$ declare p record;
begin
  alter table public.hospedagem_solicitacoes enable row level security;
  for p in select policyname from pg_policies where schemaname='public' and tablename='hospedagem_solicitacoes' loop
    execute format('drop policy if exists %I on public.hospedagem_solicitacoes', p.policyname);
  end loop;
end $$;

create policy hospedagem_solicitacoes_select_authorized
on public.hospedagem_solicitacoes for select to authenticated
using (
  public.hospedagem_pode_operar(false)
  or created_by = (select auth.uid())
  or solicitante_id = (select auth.uid())
);

create policy hospedagem_solicitacoes_insert_own
on public.hospedagem_solicitacoes for insert to authenticated
with check (
  public.hospedagem_pode_operar(true)
  or coalesce(created_by, solicitante_id) = (select auth.uid())
);

create policy hospedagem_solicitacoes_update_authorized
on public.hospedagem_solicitacoes for update to authenticated
using (public.hospedagem_pode_operar(true) or created_by = (select auth.uid()) or solicitante_id = (select auth.uid()))
with check (public.hospedagem_pode_operar(true) or created_by = (select auth.uid()) or solicitante_id = (select auth.uid()));

-- Colaboradores de uma solicitacao seguem a propriedade da solicitacao.
do $$ declare p record;
begin
  alter table public.hospedagem_solicitacao_colaboradores enable row level security;
  for p in select policyname from pg_policies where schemaname='public' and tablename='hospedagem_solicitacao_colaboradores' loop
    execute format('drop policy if exists %I on public.hospedagem_solicitacao_colaboradores', p.policyname);
  end loop;
end $$;

create policy hospedagem_colaboradores_select_authorized
on public.hospedagem_solicitacao_colaboradores for select to authenticated
using (public.hospedagem_pode_operar(false) or exists (
  select 1 from public.hospedagem_solicitacoes s
  where s.id = solicitacao_id
    and (s.created_by = (select auth.uid()) or s.solicitante_id = (select auth.uid()))
));

create policy hospedagem_colaboradores_write_authorized
on public.hospedagem_solicitacao_colaboradores for all to authenticated
using (public.hospedagem_pode_operar(true) or exists (
  select 1 from public.hospedagem_solicitacoes s
  where s.id = solicitacao_id
    and (s.created_by = (select auth.uid()) or s.solicitante_id = (select auth.uid()))
))
with check (public.hospedagem_pode_operar(true) or exists (
  select 1 from public.hospedagem_solicitacoes s
  where s.id = solicitacao_id
    and (s.created_by = (select auth.uid()) or s.solicitante_id = (select auth.uid()))
));

-- Financeiro ve/edita a fila; Hospedagem somente cria/atualiza itens do proprio setor.
do $$ declare p record;
begin
  alter table public.financeiro_pagamentos enable row level security;
  for p in select policyname from pg_policies where schemaname='public' and tablename='financeiro_pagamentos' loop
    execute format('drop policy if exists %I on public.financeiro_pagamentos', p.policyname);
  end loop;
end $$;

create policy financeiro_pagamentos_select_authorized
on public.financeiro_pagamentos for select to authenticated
using (public.hospedagem_pode_financeiro(false) or (origem_setor='HOSPEDAGEM' and public.hospedagem_pode_operar(false)));
create policy financeiro_pagamentos_insert_authorized
on public.financeiro_pagamentos for insert to authenticated
with check (public.hospedagem_pode_financeiro(true) or (origem_setor='HOSPEDAGEM' and public.hospedagem_pode_operar(true)));
create policy financeiro_pagamentos_update_authorized
on public.financeiro_pagamentos for update to authenticated
using (public.hospedagem_pode_financeiro(true) or (origem_setor='HOSPEDAGEM' and public.hospedagem_pode_operar(true)))
with check (public.hospedagem_pode_financeiro(true) or (origem_setor='HOSPEDAGEM' and public.hospedagem_pode_operar(true)));
create policy financeiro_pagamentos_delete_financeiro
on public.financeiro_pagamentos for delete to authenticated
using (public.hospedagem_pode_financeiro(true));

-- Documentos financeiros deixam de ser publicos.
update storage.buckets set public=false where id='hospedagem-documentos';
drop policy if exists hospedagem_documentos_public_read on storage.objects;
drop policy if exists hospedagem_documentos_auth_insert on storage.objects;
drop policy if exists hospedagem_documentos_auth_update on storage.objects;
drop policy if exists hospedagem_documentos_auth_delete on storage.objects;
create policy hospedagem_documentos_select_authorized on storage.objects
for select to authenticated using (
  bucket_id='hospedagem-documentos'
  and (public.hospedagem_pode_operar(false) or public.hospedagem_pode_financeiro(false))
);
create policy hospedagem_documentos_insert_hotel on storage.objects
for insert to authenticated with check (bucket_id='hospedagem-documentos' and public.hospedagem_pode_operar(true));
create policy hospedagem_documentos_update_hotel on storage.objects
for update to authenticated
using (bucket_id='hospedagem-documentos' and public.hospedagem_pode_operar(true))
with check (bucket_id='hospedagem-documentos' and public.hospedagem_pode_operar(true));
create policy hospedagem_documentos_delete_hotel on storage.objects
for delete to authenticated using (bucket_id='hospedagem-documentos' and public.hospedagem_pode_operar(true));

-- ---------------------------------------------------------------------------
-- Operacoes atomicas
-- ---------------------------------------------------------------------------

create or replace function public.hospedagem_realizar_checkout(
  p_reserva_id uuid,
  p_colaboradores jsonb,
  p_valor_diarias numeric,
  p_extras jsonb default '[]'::jsonb,
  p_observacoes text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reserva public.hospedagem_reservas%rowtype;
  v_lote_id uuid;
  v_valor_extras numeric := 0;
  v_total numeric;
  v_selecionados int;
  v_ativos int;
  v_item jsonb;
  v_colaborador_id uuid;
  v_nome text;
begin
  if not public.hospedagem_pode_operar(true) then
    raise exception 'Sem permissao para realizar checkout' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_colaboradores,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_colaboradores,'[]'::jsonb))=0 then
    raise exception 'Selecione ao menos um colaborador';
  end if;
  if coalesce(p_valor_diarias,0) < 0 then raise exception 'Valor de diarias invalido'; end if;

  select * into v_reserva from public.hospedagem_reservas where id=p_reserva_id for update;
  if not found or v_reserva.status_hospedagem in ('CANCELADA','CHECKOUT_REALIZADO') then
    raise exception 'Reserva inexistente ou encerrada';
  end if;

  select coalesce(sum(
    case when lower(coalesce(x->>'tipo','adicional'))='desconto'
         then -abs(coalesce((x->>'valor')::numeric,0))
         else abs(coalesce((x->>'valor')::numeric,0)) end
  ),0) into v_valor_extras
  from jsonb_array_elements(coalesce(p_extras,'[]'::jsonb)) x;
  v_total := greatest(coalesce(p_valor_diarias,0)+v_valor_extras,0);

  insert into public.hospedagem_checkout_lotes
    (reserva_id,hotel_id,data_checkout,valor_diarias,valor_extras,valor_total,status,observacoes)
  values (p_reserva_id,v_reserva.hotel_id,current_date,p_valor_diarias,v_valor_extras,v_total,'PENDENTE',nullif(btrim(p_observacoes),''))
  returning id into v_lote_id;

  for v_item in select value from jsonb_array_elements(p_colaboradores) loop
    v_colaborador_id := nullif(v_item->>'solicitacao_colaborador_id','')::uuid;
    v_nome := coalesce(nullif(btrim(v_item->>'nome_colaborador'),''),'Nao informado');
    if v_colaborador_id is null or not exists (
      select 1 from public.hospedagem_reserva_colaboradores rc
      where rc.reserva_id=p_reserva_id and rc.solicitacao_colaborador_id=v_colaborador_id
    ) then
      raise exception 'Colaborador % nao pertence a reserva', v_nome;
    end if;
    insert into public.hospedagem_checkout_lote_colaboradores
      (lote_id,reserva_colaborador_id,solicitacao_colaborador_id,nome_colaborador)
    values (v_lote_id,v_colaborador_id,v_colaborador_id,v_nome);
    update public.hospedagem_reserva_colaboradores
    set status='CHECKOUT',checkout_em=now(),checkout_por=(select auth.uid()),updated_at=now()
    where reserva_id=p_reserva_id and solicitacao_colaborador_id=v_colaborador_id;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_extras,'[]'::jsonb)) loop
    if coalesce(abs((v_item->>'valor')::numeric),0)>0 then
      insert into public.hospedagem_custos_extras
        (solicitacao_id,reserva_id,tipo,descricao,quantidade,valor_unitario,valor_total)
      values (
        v_reserva.solicitacao_id,p_reserva_id,
        case when lower(coalesce(v_item->>'tipo',''))='desconto' then 'DESCONTO' else 'OUTROS' end,
        coalesce(nullif(btrim(v_item->>'descricao'),''),'Ajuste de checkout'),1,
        abs((v_item->>'valor')::numeric),abs((v_item->>'valor')::numeric)
      );
    end if;
  end loop;

  select count(*) into v_selecionados
  from public.hospedagem_reserva_colaboradores
  where reserva_id=p_reserva_id and status='CHECKOUT';
  select count(*) into v_ativos
  from public.hospedagem_reserva_colaboradores
  where reserva_id=p_reserva_id and status='HOSPEDADO';

  update public.hospedagem_reservas
  set status_hospedagem=case when v_ativos=0 then 'CHECKOUT_REALIZADO' else 'HOSPEDADO' end,
      valor_total_final=(select coalesce(sum(valor_total),0) from public.hospedagem_checkout_lotes where reserva_id=p_reserva_id and status<>'CANCELADO'),
      atualizado_por=(select auth.uid()),updated_at=now()
  where id=p_reserva_id;

  perform public.hospedagem_enviar_lote_financeiro(p_reserva_id,v_lote_id);
  return v_lote_id;
end;
$$;

create or replace function public.hospedagem_consumir_creditos(
  p_hotel_id uuid,
  p_reserva_id uuid,
  p_limite numeric
) returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_restante numeric := greatest(coalesce(p_limite,0),0);
  v_usado numeric := 0;
  v_uso numeric;
  r record;
begin
  if not public.hospedagem_pode_operar(true) then
    raise exception 'Sem permissao para operar creditos de hospedagem' using errcode='42501';
  end if;
  if v_restante = 0 then return 0; end if;

  for r in
    select id, saldo from public.hospedagem_adiantamentos
    where hotel_id=p_hotel_id and status='DISPONIVEL' and saldo>0
    order by created_at, id
    for update
  loop
    exit when v_restante <= 0;
    v_uso := least(r.saldo, v_restante);
    update public.hospedagem_adiantamentos
      set saldo=saldo-v_uso,
          status=case when saldo-v_uso <= 0 then 'UTILIZADO' else 'DISPONIVEL' end,
          updated_at=now()
      where id=r.id;
    insert into public.hospedagem_adiantamento_movimentos
      (adiantamento_id,reserva_id,tipo,valor,observacoes,criado_por)
    values (r.id,p_reserva_id,'DEBITO',v_uso,'Credito aplicado a hospedagem',(select auth.uid()));
    v_usado := v_usado + v_uso;
    v_restante := v_restante - v_uso;
  end loop;
  return v_usado;
end;
$$;

create or replace function public.hospedagem_enviar_lote_financeiro(
  p_reserva_id uuid,
  p_lote_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reserva public.hospedagem_reservas%rowtype;
  v_lote public.hospedagem_checkout_lotes%rowtype;
  v_hotel public.hospedagem_hoteis%rowtype;
  v_pagamento_id uuid;
  v_credito numeric := 0;
  v_devido numeric;
begin
  if not public.hospedagem_pode_operar(true) then
    raise exception 'Sem permissao para enviar hospedagem ao Financeiro' using errcode='42501';
  end if;

  select * into v_reserva from public.hospedagem_reservas where id=p_reserva_id for update;
  if not found or v_reserva.status_hospedagem='CANCELADA' then
    raise exception 'Reserva inexistente ou cancelada';
  end if;

  if p_lote_id is null then
    select * into v_lote from public.hospedagem_checkout_lotes
    where reserva_id=p_reserva_id and status in ('PENDENTE','PARCIAL')
    order by created_at desc limit 1 for update;
  else
    select * into v_lote from public.hospedagem_checkout_lotes
    where id=p_lote_id and reserva_id=p_reserva_id for update;
  end if;
  if not found then raise exception 'Lote de checkout pendente nao encontrado'; end if;

  select * into v_hotel from public.hospedagem_hoteis where id=v_reserva.hotel_id;
  v_credito := public.hospedagem_consumir_creditos(v_reserva.hotel_id,p_reserva_id,v_lote.valor_total);
  v_devido := greatest(v_lote.valor_total-v_credito,0);

  insert into public.financeiro_pagamentos (
    origem_setor,origem_tabela,origem_id,hospedagem_checkout_lote_id,
    origem_codigo,competencia,descricao,favorecido_nome,forma_pagamento,
    valor,status,prioridade,observacoes,solicitado_por,atualizado_por
  ) values (
    'HOSPEDAGEM','hospedagem_checkout_lotes',v_lote.id,v_lote.id,
    v_lote.id::text,coalesce(v_reserva.data_checkin,current_date),
    format('Hospedagem %s - %s/%s',coalesce(v_hotel.nome,v_reserva.nome_hotel,'Hotel'),coalesce(v_reserva.cidade_hotel,''),coalesce(v_reserva.uf_hotel,'')),
    coalesce(v_hotel.razao_social,v_hotel.nome,v_reserva.nome_hotel,'Hotel'),'PIX',
    v_devido,'PENDENTE','NORMAL',
    case when v_credito>0 then format('Credito de R$ %s aplicado antes do envio.',v_credito) end,
    (select auth.uid()),(select auth.uid())
  )
  on conflict (hospedagem_checkout_lote_id) where hospedagem_checkout_lote_id is not null
  do update set valor=excluded.valor,descricao=excluded.descricao,observacoes=excluded.observacoes,
                atualizado_por=(select auth.uid()),updated_at=now()
  returning id into v_pagamento_id;

  insert into public.hospedagem_financeiro
    (reserva_id,valor_original,valor_total,valor_pago,saldo,status_financeiro,enviado_financeiro_em,origem_pagamento)
  values (p_reserva_id,v_lote.valor_total,v_lote.valor_total,0,v_devido,'ENVIADO_AO_FINANCEIRO',now(),'CHECKOUT_LOTE')
  on conflict (reserva_id) do update
    set valor_original=excluded.valor_original,valor_total=excluded.valor_total,
        saldo=excluded.saldo,status_financeiro=excluded.status_financeiro,
        enviado_financeiro_em=excluded.enviado_financeiro_em,origem_pagamento=excluded.origem_pagamento,
        updated_at=now();

  return v_pagamento_id;
end;
$$;

create or replace function public.hospedagem_confirmar_pagamento_lote(
  p_lote_id uuid,
  p_valor_pago numeric,
  p_comprovante_url text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lote public.hospedagem_checkout_lotes%rowtype;
  v_devido numeric;
  v_excedente numeric := 0;
  v_adiantamento_id uuid;
  v_total_pago numeric;
  v_total_reserva numeric;
  v_status text;
begin
  if not public.hospedagem_pode_financeiro(true) then
    raise exception 'Sem permissao para confirmar pagamento' using errcode='42501';
  end if;
  if coalesce(p_valor_pago,0) < 0 then raise exception 'Valor pago invalido'; end if;

  select * into v_lote from public.hospedagem_checkout_lotes where id=p_lote_id for update;
  if not found or v_lote.status='CANCELADO' then raise exception 'Lote inexistente ou cancelado'; end if;

  select valor into v_devido from public.financeiro_pagamentos
  where hospedagem_checkout_lote_id=p_lote_id for update;
  if not found then raise exception 'Lote ainda nao foi enviado ao Financeiro'; end if;
  v_excedente := greatest(p_valor_pago-v_devido,0);

  update public.financeiro_pagamentos
  set status=case when p_valor_pago >= v_devido then 'PAGO' else 'EM_ANALISE' end,
      data_pagamento=case when p_valor_pago >= v_devido then current_date else data_pagamento end,
      pago_em=case when p_valor_pago >= v_devido then now() else pago_em end,
      comprovante_url=coalesce(p_comprovante_url,comprovante_url),
      atualizado_por=(select auth.uid()),updated_at=now()
  where hospedagem_checkout_lote_id=p_lote_id;

  update public.hospedagem_checkout_lotes
  set status=case when p_valor_pago >= v_devido then 'PAGO' when p_valor_pago>0 then 'PARCIAL' else 'PENDENTE' end,
      updated_at=now()
  where id=p_lote_id;

  select coalesce(sum(case when fp.status='PAGO' then cl.valor_total else 0 end),0),
         coalesce(sum(cl.valor_total),0)
  into v_total_pago,v_total_reserva
  from public.hospedagem_checkout_lotes cl
  left join public.financeiro_pagamentos fp on fp.hospedagem_checkout_lote_id=cl.id
  where cl.reserva_id=v_lote.reserva_id and cl.status<>'CANCELADO';

  v_status := case when v_total_reserva>0 and v_total_pago>=v_total_reserva then 'PAGO'
                   when v_total_pago>0 then 'PARCIAL' else 'ENVIADO_AO_FINANCEIRO' end;
  update public.hospedagem_financeiro
  set valor_pago=v_total_pago,saldo=greatest(v_total_reserva-v_total_pago,0),
      status_financeiro=v_status,
      data_pagamento=case when v_status='PAGO' then current_date else data_pagamento end,
      pago_em=case when v_status='PAGO' then now() else pago_em end,
      comprovante_url=coalesce(p_comprovante_url,comprovante_url),updated_at=now()
  where reserva_id=v_lote.reserva_id;

  if v_excedente>0 and v_lote.hotel_id is not null then
    insert into public.hospedagem_adiantamentos
      (hotel_id,reserva_origem_id,valor_creditado,saldo,status,observacoes,criado_por)
    values (v_lote.hotel_id,v_lote.reserva_id,v_excedente,v_excedente,'DISPONIVEL',
            'Credito gerado por comprovante superior ao valor devido',(select auth.uid()))
    returning id into v_adiantamento_id;
    insert into public.hospedagem_adiantamento_movimentos
      (adiantamento_id,reserva_id,tipo,valor,observacoes,criado_por)
    values (v_adiantamento_id,v_lote.reserva_id,'CREDITO',v_excedente,'Adiantamento recebido',(select auth.uid()));
  end if;

  return jsonb_build_object('status',v_status,'valor_pago',v_total_pago,'saldo',greatest(v_total_reserva-v_total_pago,0),'adiantamento_gerado',v_excedente);
end;
$$;

revoke all on function public.hospedagem_consumir_creditos(uuid,uuid,numeric) from public;
revoke all on function public.hospedagem_realizar_checkout(uuid,jsonb,numeric,jsonb,text) from public;
revoke all on function public.hospedagem_enviar_lote_financeiro(uuid,uuid) from public;
revoke all on function public.hospedagem_confirmar_pagamento_lote(uuid,numeric,text) from public;
grant execute on function public.hospedagem_consumir_creditos(uuid,uuid,numeric) to authenticated;
grant execute on function public.hospedagem_realizar_checkout(uuid,jsonb,numeric,jsonb,text) to authenticated;
grant execute on function public.hospedagem_enviar_lote_financeiro(uuid,uuid) to authenticated;
grant execute on function public.hospedagem_confirmar_pagamento_lote(uuid,numeric,text) to authenticated;

-- Views expostas devem respeitar o RLS das tabelas-base.
alter view if exists public.hospedagem_painel_geral set (security_invoker=true);
alter view if exists public.hospedagem_documentos_pendentes_lancamento set (security_invoker=true);
