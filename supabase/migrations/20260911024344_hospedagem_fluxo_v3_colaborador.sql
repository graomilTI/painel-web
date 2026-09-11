-- Hospedagem v3: fluxo por colaborador, reservas parciais, alteracoes,
-- checkout assistido, pagamentos parcelados e mensageria duravel.
-- Apenas novas solicitacoes recebem fluxo_versao=3; registros anteriores
-- continuam sendo lidos pelas telas legadas.

create schema if not exists private;

alter table public.colaboradores
  add column if not exists sexo text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.colaboradores'::regclass
      and conname='colaboradores_sexo_check'
  ) then
    alter table public.colaboradores add constraint colaboradores_sexo_check
      check (sexo is null or sexo in ('MASCULINO','FEMININO','NAO_INFORMADO'));
  end if;
end $$;

alter table public.hospedagem_solicitacoes
  add column if not exists fluxo_versao smallint not null default 2,
  add column if not exists origem_solicitacao text not null default 'FORMULARIO';

alter table public.hospedagem_solicitacao_colaboradores
  add column if not exists data_checkin_prevista date,
  add column if not exists data_checkout_prevista date,
  add column if not exists horario_chegada_previsto time,
  add column if not exists quantidade_diarias_prevista integer,
  add column if not exists sexo text,
  add column if not exists status_item text not null default 'AGUARDANDO',
  add column if not exists reserva_id uuid,
  add column if not exists motivo_recusa text,
  add column if not exists recusado_em timestamptz,
  add column if not exists recusado_por uuid,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por uuid,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.hospedagem_solicitacao_colaboradores'::regclass and conname='hosp_solic_colab_periodo_check') then
    alter table public.hospedagem_solicitacao_colaboradores add constraint hosp_solic_colab_periodo_check
      check (data_checkin_prevista is null or data_checkout_prevista > data_checkin_prevista);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.hospedagem_solicitacao_colaboradores'::regclass and conname='hosp_solic_colab_diarias_check') then
    alter table public.hospedagem_solicitacao_colaboradores add constraint hosp_solic_colab_diarias_check
      check (quantidade_diarias_prevista is null or quantidade_diarias_prevista > 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.hospedagem_solicitacao_colaboradores'::regclass and conname='hosp_solic_colab_sexo_check') then
    alter table public.hospedagem_solicitacao_colaboradores add constraint hosp_solic_colab_sexo_check
      check (sexo is null or sexo in ('MASCULINO','FEMININO','NAO_INFORMADO'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.hospedagem_solicitacao_colaboradores'::regclass and conname='hosp_solic_colab_status_item_check') then
    alter table public.hospedagem_solicitacao_colaboradores add constraint hosp_solic_colab_status_item_check
      check (status_item in ('AGUARDANDO','EM_COTACAO','AGUARDANDO_HOTEL','RESERVADO','ALTERACAO_PENDENTE','CHECKOUT_PENDENTE','CHECKOUT','RECUSADO','CANCELADO'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.hospedagem_solicitacao_colaboradores'::regclass and conname='hosp_solic_colab_reserva_id_fkey') then
    alter table public.hospedagem_solicitacao_colaboradores add constraint hosp_solic_colab_reserva_id_fkey
      foreign key (reserva_id) references public.hospedagem_reservas(id) on delete set null;
  end if;
end $$;

alter table public.hospedagem_reservas
  add column if not exists codigo_operacional text,
  add column if not exists codigo_ano integer,
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmacao_origem text,
  add column if not exists data_checkout_real timestamptz,
  add column if not exists fluxo_versao smallint not null default 2;

-- Uma solicitacao v3 pode ser dividida entre varias reservas/hoteis.
alter table public.hospedagem_reserva_solicitacoes
  drop constraint if exists hospedagem_reserva_solicitacoes_solicitacao_id_key;

alter table public.hospedagem_cotacoes
  add column if not exists almoco_incluso boolean,
  add column if not exists janta_inclusa boolean,
  add column if not exists formas_pagamento jsonb not null default '[]'::jsonb,
  add column if not exists emite_nota_fiscal boolean,
  add column if not exists disponibilidade_quartos jsonb not null default '[]'::jsonb;

alter table public.hospedagem_cotacoes
  drop constraint if exists hospedagem_cotacoes_solicitacao_id_hotel_id_key;
create index if not exists hospedagem_cotacoes_solicitacao_hotel_idx on public.hospedagem_cotacoes(solicitacao_id,hotel_id,created_at desc);

create unique index if not exists hospedagem_reservas_codigo_operacional_ano_uidx
  on public.hospedagem_reservas(codigo_ano,codigo_operacional)
  where codigo_operacional is not null;

create table if not exists public.hospedagem_reserva_codigo_sequencias (
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  ultimo_numero integer not null default 0 check (ultimo_numero >= 0),
  updated_at timestamptz not null default now(),
  primary key (ano,mes)
);

create table if not exists public.hospedagem_cotacao_colaboradores (
  cotacao_id uuid not null references public.hospedagem_cotacoes(id) on delete cascade,
  solicitacao_colaborador_id uuid not null references public.hospedagem_solicitacao_colaboradores(id) on delete cascade,
  atendido boolean,
  created_at timestamptz not null default now(),
  primary key (cotacao_id,solicitacao_colaborador_id)
);

create table if not exists public.hospedagem_reserva_pedidos (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.hospedagem_solicitacoes(id) on delete cascade,
  hotel_id uuid not null references public.hospedagem_hoteis(id) on delete restrict,
  cotacao_id uuid references public.hospedagem_cotacoes(id) on delete set null,
  status text not null default 'AGUARDANDO_HOTEL' check (status in ('AGUARDANDO_HOTEL','CONFIRMADO','RECUSADO','CANCELADO')),
  valor_diaria numeric(14,2) not null check (valor_diaria >= 0),
  quartos jsonb not null default '[]'::jsonb,
  solicitado_por uuid,
  solicitado_em timestamptz not null default now(),
  respondido_em timestamptz,
  resposta_texto text,
  reserva_id uuid references public.hospedagem_reservas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hospedagem_reserva_pedido_colaboradores (
  pedido_id uuid not null references public.hospedagem_reserva_pedidos(id) on delete cascade,
  solicitacao_colaborador_id uuid not null references public.hospedagem_solicitacao_colaboradores(id) on delete cascade,
  primary key (pedido_id,solicitacao_colaborador_id)
);

create table if not exists public.hospedagem_alteracoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_colaborador_id uuid not null references public.hospedagem_solicitacao_colaboradores(id) on delete cascade,
  reserva_id uuid not null references public.hospedagem_reservas(id) on delete cascade,
  tipo text not null check (tipo in ('CANCELAMENTO','MUDANCA_DATAS','PRORROGACAO','MUDANCA_CIDADE')),
  dados_solicitados jsonb not null default '{}'::jsonb,
  status text not null default 'AGUARDANDO_ADM' check (status in ('AGUARDANDO_ADM','ENVIADA_HOTEL','CONFIRMADA','RECUSADA','CANCELADA')),
  solicitada_por uuid not null,
  solicitada_em timestamptz not null default now(),
  tratada_por uuid,
  tratada_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hospedagem_alteracoes add column if not exists nova_solicitacao_colaborador_id uuid references public.hospedagem_solicitacao_colaboradores(id) on delete set null;

create table if not exists public.hospedagem_checkout_decisoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_colaborador_id uuid not null references public.hospedagem_solicitacao_colaboradores(id) on delete cascade,
  reserva_id uuid not null references public.hospedagem_reservas(id) on delete cascade,
  data_checkout_prevista date not null,
  decisao text check (decisao in ('CHECKOUT','PRORROGAR')),
  dias_adicionais integer check (dias_adicionais is null or dias_adicionais > 0),
  status text not null default 'AGUARDANDO_GESTOR' check (status in ('AGUARDANDO_GESTOR','AGUARDANDO_HOTEL','AGUARDANDO_ADM','CONCLUIDA','SEM_RESPOSTA','CANCELADA')),
  avisado_gestor_em timestamptz,
  escalado_adm_em timestamptz,
  respondido_em timestamptz,
  confirmado_hotel_em timestamptz,
  confirmado_adm_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (solicitacao_colaborador_id,data_checkout_prevista)
);
alter table public.hospedagem_checkout_decisoes add column if not exists hotel_aceitou boolean,add column if not exists resposta_hotel text;

create table if not exists public.hospedagem_pagamentos_v3 (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.hospedagem_reservas(id) on delete cascade,
  forma_pagamento text not null check (forma_pagamento in ('PIX','BOLETO')),
  chave_pix text,
  boleto_url text,
  boleto_linha_digitavel text,
  data_vencimento date,
  valor_total numeric(14,2) not null check (valor_total > 0),
  valor_pago numeric(14,2) not null default 0 check (valor_pago >= 0),
  saldo numeric(14,2) generated always as (greatest(valor_total-valor_pago,0)) stored,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO','ENVIADO_FINANCEIRO','PARCIAL','PAGO','CANCELADO')),
  origem_pagamento text check (origem_pagamento in ('ADM','FINANCEIRO')),
  enviado_financeiro_em timestamptz,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  financeiro_pagamento_id uuid references public.financeiro_pagamentos(id) on delete set null,
  check (forma_pagamento <> 'PIX' or nullif(btrim(chave_pix),'') is not null)
);

create table if not exists public.hospedagem_pagamento_parcelas (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null references public.hospedagem_pagamentos_v3(id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  data_pagamento date not null,
  comprovante_url text not null,
  pago_por uuid,
  pago_por_setor text not null check (pago_por_setor in ('ADM','FINANCEIRO')),
  comprovante_enviado_hotel_em timestamptz,
  nfse_status text not null default 'AGUARDANDO' check (nfse_status in ('AGUARDANDO','RECEBIDA','VALIDA','DIVERGENTE')),
  proxima_cobranca_nfse_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.hospedagem_pagamento_documentos (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references public.hospedagem_pagamento_parcelas(id) on delete cascade,
  tipo text not null check (tipo in ('NFSE_PDF','NFSE_XML')),
  arquivo_url text not null,
  storage_bucket text,
  storage_path text,
  mime_type text,
  numero_nfse text,
  valor_nfse numeric(14,2),
  emitente_cnpj text,
  tomador_cnpj text,
  tomador_razao_social text,
  periodo_inicio date,
  periodo_fim date,
  status_validacao text not null default 'PENDENTE' check (status_validacao in ('PENDENTE','VALIDO','DIVERGENTE','REVISAO_MANUAL')),
  validacao_erros jsonb not null default '[]'::jsonb,
  grm_nf_lancamento_id uuid references public.grm_nf_lancamentos(id) on delete set null,
  recebido_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (parcela_id,tipo,arquivo_url)
);
create unique index if not exists hospedagem_nfse_emitente_numero_tipo_uidx on public.hospedagem_pagamento_documentos(emitente_cnpj,numero_nfse,tipo)
  where emitente_cnpj is not null and numero_nfse is not null and status_validacao='VALIDO';

create table if not exists public.hospedagem_empresas_fiscais (
  id uuid primary key default gen_random_uuid(),
  empresa text not null unique,
  razao_social text not null,
  cnpj text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hospedagem_extra_rateios (
  id uuid primary key default gen_random_uuid(),
  custo_extra_id uuid not null references public.hospedagem_custos_extras(id) on delete cascade,
  solicitacao_colaborador_id uuid not null references public.hospedagem_solicitacao_colaboradores(id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  lancamento_caixa_id uuid,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.hospedagem_outbox (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid references public.hospedagem_solicitacoes(id) on delete cascade,
  reserva_id uuid references public.hospedagem_reservas(id) on delete cascade,
  hotel_id uuid references public.hospedagem_hoteis(id) on delete set null,
  destinatario_tipo text not null check (destinatario_tipo in ('HOTEL','GESTOR','COLABORADOR','ADM')),
  destinatario_id uuid,
  telefone text,
  nome text,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','PROCESSANDO','ENVIADO','FALHA','CANCELADO')),
  agendado_para timestamptz not null default now(),
  tentativas integer not null default 0,
  ultimo_erro text,
  external_message_id text,
  chave_dedup text not null,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chave_dedup)
);

create index if not exists hosp_solic_colab_fila_v3_idx on public.hospedagem_solicitacao_colaboradores(status_item,data_checkin_prevista,horario_chegada_previsto,created_at)
  where status_item not in ('CHECKOUT','RECUSADO','CANCELADO');
create index if not exists hosp_solic_colab_colaborador_periodo_idx on public.hospedagem_solicitacao_colaboradores(colaborador_id,data_checkin_prevista,data_checkout_prevista)
  where status_item not in ('CHECKOUT','RECUSADO','CANCELADO');
create index if not exists hosp_cot_colab_item_idx on public.hospedagem_cotacao_colaboradores(solicitacao_colaborador_id);
create index if not exists hosp_res_pedidos_solic_idx on public.hospedagem_reserva_pedidos(solicitacao_id,status,created_at);
create index if not exists hosp_res_pedido_colab_item_idx on public.hospedagem_reserva_pedido_colaboradores(solicitacao_colaborador_id);
create index if not exists hosp_alteracoes_fila_idx on public.hospedagem_alteracoes(status,created_at) where status in ('AGUARDANDO_ADM','ENVIADA_HOTEL');
create index if not exists hosp_checkout_fila_idx on public.hospedagem_checkout_decisoes(status,data_checkout_prevista);
create index if not exists hosp_pagamentos_reserva_idx on public.hospedagem_pagamentos_v3(reserva_id,status);
create index if not exists hosp_pag_parcelas_pagamento_idx on public.hospedagem_pagamento_parcelas(pagamento_id,created_at);
create index if not exists hosp_pag_docs_parcela_idx on public.hospedagem_pagamento_documentos(parcela_id,status_validacao);
create index if not exists hosp_extra_rateios_custo_idx on public.hospedagem_extra_rateios(custo_extra_id);
create index if not exists hosp_outbox_pendente_idx on public.hospedagem_outbox(status,agendado_para) where status in ('PENDENTE','FALHA');

-- Mensageria interna: somente funcoes/Edge Functions podem gravar. Usuarios do
-- modulo Hospedagem podem consultar falhas, sem acesso aos demais setores.
create or replace function private.hospedagem_v3_enqueue(
  p_template text,
  p_destinatario_tipo text,
  p_chave_dedup text,
  p_payload jsonb default '{}'::jsonb,
  p_solicitacao_id uuid default null,
  p_reserva_id uuid default null,
  p_hotel_id uuid default null,
  p_destinatario_id uuid default null,
  p_telefone text default null,
  p_nome text default null,
  p_agendado_para timestamptz default now()
) returns uuid
language plpgsql security definer set search_path='public','private'
as $$
declare v_id uuid;
begin
  insert into public.hospedagem_outbox(
    template,destinatario_tipo,chave_dedup,payload,solicitacao_id,reserva_id,hotel_id,
    destinatario_id,telefone,nome,agendado_para
  ) values (
    p_template,p_destinatario_tipo,p_chave_dedup,coalesce(p_payload,'{}'::jsonb),p_solicitacao_id,p_reserva_id,p_hotel_id,
    p_destinatario_id,p_telefone,p_nome,coalesce(p_agendado_para,now())
  ) on conflict (chave_dedup) do update set
    payload=excluded.payload,
    telefone=coalesce(excluded.telefone,public.hospedagem_outbox.telefone),
    nome=coalesce(excluded.nome,public.hospedagem_outbox.nome),
    agendado_para=least(public.hospedagem_outbox.agendado_para,excluded.agendado_para),
    updated_at=now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function private.hospedagem_v3_enqueue(text,text,text,jsonb,uuid,uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;

create or replace function private.hospedagem_v3_recalcular_solicitacao(p_solicitacao_id uuid)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_status text;
begin
  select case
    when count(*)=0 or bool_and(status_item='CANCELADO') then 'CANCELADA'
    when bool_and(status_item in ('CHECKOUT','RECUSADO','CANCELADO')) then 'CONCLUIDA'
    when bool_and(status_item in ('RESERVADO','CHECKOUT','RECUSADO','CANCELADO')) then 'RESERVADA'
    when bool_or(status_item in ('RESERVADO','AGUARDANDO_HOTEL')) then 'EM_ANALISE'
    when bool_or(status_item='EM_COTACAO') then 'EM_COTACAO'
    else 'SOLICITADA' end
  into v_status
  from public.hospedagem_solicitacao_colaboradores where solicitacao_id=p_solicitacao_id;
  update public.hospedagem_solicitacoes
    set status_solicitacao=v_status,status=lower(v_status),updated_at=now()
  where id=p_solicitacao_id and fluxo_versao=3;
end $$;
revoke all on function private.hospedagem_v3_recalcular_solicitacao(uuid) from public,anon,authenticated;

create or replace function public.hospedagem_v3_criar_solicitacao(p_solicitacao jsonb,p_colaboradores jsonb)
returns jsonb language plpgsql security definer set search_path='public','private' as $$
declare v_id uuid; v_codigo text; c jsonb; v_colaborador_id uuid; v_checkin date; v_checkout date; v_sexo text;
begin
  if (select auth.uid()) is null then raise exception 'Autenticacao obrigatoria' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_colaboradores,'[]'::jsonb))<>'array' or jsonb_array_length(p_colaboradores)=0 then raise exception 'Informe ao menos um colaborador'; end if;
  if nullif(btrim(p_solicitacao->>'cidade'),'') is null or nullif(btrim(p_solicitacao->>'uf'),'') is null then raise exception 'Informe cidade e UF'; end if;

  insert into public.hospedagem_solicitacoes(
    data_solicitacao,programacao_id,created_by,solicitante_id,solicitante_nome,solicitante_email,empresa,coordenacao,supervisao,regional,
    cidade,uf,cliente,local_embarque,link_local_embarque,observacao_gestor,status_solicitacao,preferencia_hospedagem,fluxo_versao,origem_solicitacao
  ) values (
    current_date,nullif(p_solicitacao->>'programacao_id','')::uuid,(select auth.uid()),(select auth.uid()),nullif(p_solicitacao->>'solicitante_nome',''),nullif(p_solicitacao->>'solicitante_email',''),
    nullif(p_solicitacao->>'empresa',''),nullif(p_solicitacao->>'coordenacao',''),nullif(p_solicitacao->>'supervisao',''),nullif(p_solicitacao->>'regional',''),
    btrim(p_solicitacao->>'cidade'),upper(btrim(p_solicitacao->>'uf')),nullif(p_solicitacao->>'cliente',''),nullif(p_solicitacao->>'local_embarque',''),
    nullif(p_solicitacao->>'link_local_embarque',''),nullif(p_solicitacao->>'observacao_gestor',''),'SOLICITADA','HOTEL',3,
    coalesce(nullif(p_solicitacao->>'origem_solicitacao',''),'FORMULARIO')
  ) returning id,codigo into v_id,v_codigo;

  for c in select value from jsonb_array_elements(p_colaboradores) loop
    v_colaborador_id:=nullif(c->>'colaborador_id','')::uuid;
    v_checkin:=nullif(c->>'data_checkin_prevista','')::date;
    if v_checkin<current_date then raise exception 'Check-in anterior a hoje para %',c->>'nome_colaborador'; end if;
    if coalesce(nullif(c->>'quantidade_diarias_prevista','')::integer,0)<=0 or v_checkin is null or nullif(c->>'horario_chegada_previsto','') is null then raise exception 'Periodo ou horario invalido para %',c->>'nome_colaborador'; end if;
    v_checkout:=v_checkin+nullif(c->>'quantidade_diarias_prevista','')::integer;
    v_sexo:=upper(coalesce(nullif(c->>'sexo',''),'NAO_INFORMADO'));
    if v_sexo not in ('MASCULINO','FEMININO') then raise exception 'Informe o sexo de %',c->>'nome_colaborador'; end if;
    if exists (
      select 1 from public.hospedagem_solicitacao_colaboradores i
      join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id
      where s.fluxo_versao=3 and i.colaborador_id=v_colaborador_id
        and i.status_item not in ('CHECKOUT','RECUSADO','CANCELADO')
        and daterange(i.data_checkin_prevista,i.data_checkout_prevista,'[)') && daterange(v_checkin,v_checkout,'[)')
    ) then raise exception 'Ja existe hospedagem ativa no periodo para %',c->>'nome_colaborador'; end if;

    if v_colaborador_id is not null then
      update public.colaboradores set sexo=v_sexo,updated_at=now() where id=v_colaborador_id and sexo is distinct from v_sexo;
    end if;
    insert into public.hospedagem_solicitacao_colaboradores(
      solicitacao_id,colaborador_id,nome_colaborador,cpf,tipo_colaborador,empresa,coordenacao,supervisao,status_colaborador,
      data_checkin_prevista,data_checkout_prevista,horario_chegada_previsto,quantidade_diarias_prevista,sexo,status_item
    ) values (
      v_id,v_colaborador_id,btrim(c->>'nome_colaborador'),nullif(c->>'cpf',''),nullif(c->>'tipo_colaborador',''),nullif(c->>'empresa',''),
      nullif(c->>'coordenacao',''),nullif(c->>'supervisao',''),'ATIVO',v_checkin,v_checkout,nullif(c->>'horario_chegada_previsto','')::time,
      nullif(c->>'quantidade_diarias_prevista','')::integer,v_sexo,'AGUARDANDO'
    );
  end loop;
  update public.hospedagem_solicitacoes s set
    data_checkin_prevista=(select min(data_checkin_prevista) from public.hospedagem_solicitacao_colaboradores where solicitacao_id=v_id),
    data_checkout_prevista=(select max(data_checkout_prevista) from public.hospedagem_solicitacao_colaboradores where solicitacao_id=v_id),
    quantidade_diarias_prevista=(select max(quantidade_diarias_prevista) from public.hospedagem_solicitacao_colaboradores where solicitacao_id=v_id)
  where s.id=v_id;
  insert into public.hospedagem_eventos(solicitacao_id,usuario_id,tipo_evento,descricao,status_novo,payload)
  values(v_id,(select auth.uid()),'SOLICITACAO_V3_CRIADA','Solicitacao de hotel criada por colaborador.','SOLICITADA',p_colaboradores);
  return jsonb_build_object('id',v_id,'codigo',v_codigo);
end $$;

create or replace function public.hospedagem_v3_cancelar_item(p_item_id uuid)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_item record; q record;
begin
  select i.*,s.created_by,s.solicitante_id into v_item from public.hospedagem_solicitacao_colaboradores i join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where i.id=p_item_id for update;
  if not found then raise exception 'Colaborador nao encontrado'; end if;
  if not public.hospedagem_pode_operar(true) and v_item.created_by is distinct from (select auth.uid()) and v_item.solicitante_id is distinct from (select auth.uid()) then raise exception 'Sem permissao' using errcode='42501'; end if;
  if v_item.status_item in ('RESERVADO','CHECKOUT','ALTERACAO_PENDENTE') then raise exception 'Reserva confirmada: abra uma solicitacao de alteracao'; end if;
  update public.hospedagem_solicitacao_colaboradores set status_item='CANCELADO',cancelado_em=now(),cancelado_por=(select auth.uid()),updated_at=now() where id=p_item_id;
  for q in select distinct c.id,c.hotel_id,h.whatsapp,h.nome from public.hospedagem_cotacoes c join public.hospedagem_cotacao_colaboradores ci on ci.cotacao_id=c.id left join public.hospedagem_hoteis h on h.id=c.hotel_id where ci.solicitacao_colaborador_id=p_item_id and c.status in ('PENDENTE','ENVIADA','RESPONDIDA') loop
    perform private.hospedagem_v3_enqueue('COTACAO_CANCELADA','HOTEL','cotacao-cancelada:'||q.id||':'||p_item_id,jsonb_build_object('cotacao_id',q.id,'colaborador',v_item.nome_colaborador),v_item.solicitacao_id,null,q.hotel_id,null,q.whatsapp,q.nome,now());
  end loop;
  perform private.hospedagem_v3_recalcular_solicitacao(v_item.solicitacao_id);
end $$;

create or replace function public.hospedagem_v3_editar_solicitacao(p_solicitacao_id uuid,p_solicitacao jsonb,p_colaboradores jsonb)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_sol record;c jsonb;v_item record;v_checkin date;v_checkout date;v_dias integer;v_sexo text;
begin
  select * into v_sol from public.hospedagem_solicitacoes where id=p_solicitacao_id and fluxo_versao=3 for update;
  if not found or (v_sol.solicitante_id is distinct from (select auth.uid()) and v_sol.created_by is distinct from (select auth.uid())) then raise exception 'Sem permissao' using errcode='42501'; end if;
  if exists(select 1 from public.hospedagem_solicitacao_colaboradores where solicitacao_id=p_solicitacao_id and status_item<>'AGUARDANDO') then raise exception 'A solicitacao so pode ser editada enquanto estiver aguardando'; end if;
  if jsonb_array_length(coalesce(p_colaboradores,'[]'::jsonb))=0 then raise exception 'Informe ao menos um colaborador'; end if;
  update public.hospedagem_solicitacoes set cidade=btrim(p_solicitacao->>'cidade'),uf=upper(btrim(p_solicitacao->>'uf')),
    cliente=nullif(p_solicitacao->>'cliente',''),local_embarque=nullif(p_solicitacao->>'local_embarque',''),
    link_local_embarque=nullif(p_solicitacao->>'link_local_embarque',''),observacao_gestor=nullif(p_solicitacao->>'observacao_gestor',''),updated_at=now()
  where id=p_solicitacao_id;
  for c in select value from jsonb_array_elements(p_colaboradores) loop
    select * into v_item from public.hospedagem_solicitacao_colaboradores where id=nullif(c->>'item_id','')::uuid and solicitacao_id=p_solicitacao_id for update;
    if not found then raise exception 'Colaborador invalido para edicao'; end if;
    v_checkin:=nullif(c->>'data_checkin_prevista','')::date;v_dias:=nullif(c->>'quantidade_diarias_prevista','')::integer;v_checkout:=v_checkin+v_dias;
    v_sexo:=upper(coalesce(nullif(c->>'sexo',''),'NAO_INFORMADO'));
    if v_checkin is null or v_checkin<current_date or coalesce(v_dias,0)<=0 or nullif(c->>'horario_chegada_previsto','') is null or v_sexo not in ('MASCULINO','FEMININO') then raise exception 'Dados invalidos para %',v_item.nome_colaborador; end if;
    if exists(select 1 from public.hospedagem_solicitacao_colaboradores i where i.id<>v_item.id and i.colaborador_id=v_item.colaborador_id and i.status_item not in ('CHECKOUT','RECUSADO','CANCELADO') and daterange(i.data_checkin_prevista,i.data_checkout_prevista,'[)') && daterange(v_checkin,v_checkout,'[)')) then raise exception 'Ja existe hospedagem ativa no periodo para %',v_item.nome_colaborador; end if;
    update public.hospedagem_solicitacao_colaboradores set data_checkin_prevista=v_checkin,data_checkout_prevista=v_checkout,
      quantidade_diarias_prevista=v_dias,horario_chegada_previsto=nullif(c->>'horario_chegada_previsto','')::time,sexo=v_sexo,updated_at=now() where id=v_item.id;
    update public.colaboradores set sexo=v_sexo,updated_at=now() where id=v_item.colaborador_id and sexo is distinct from v_sexo;
  end loop;
  update public.hospedagem_solicitacoes set
    data_checkin_prevista=(select min(data_checkin_prevista) from public.hospedagem_solicitacao_colaboradores where solicitacao_id=p_solicitacao_id),
    data_checkout_prevista=(select max(data_checkout_prevista) from public.hospedagem_solicitacao_colaboradores where solicitacao_id=p_solicitacao_id),
    quantidade_diarias_prevista=(select max(quantidade_diarias_prevista) from public.hospedagem_solicitacao_colaboradores where solicitacao_id=p_solicitacao_id),updated_at=now()
  where id=p_solicitacao_id;
end $$;

create or replace function public.hospedagem_v3_recusar_item(p_item_id uuid,p_motivo text)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_item record; v_gestor record;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao' using errcode='42501'; end if;
  if nullif(btrim(p_motivo),'') is null then raise exception 'Motivo obrigatorio'; end if;
  select i.*,s.solicitante_id,s.solicitante_nome into v_item from public.hospedagem_solicitacao_colaboradores i join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where i.id=p_item_id for update;
  if v_item.status_item in ('RESERVADO','CHECKOUT','CANCELADO') then raise exception 'Item nao pode ser recusado'; end if;
  update public.hospedagem_solicitacao_colaboradores set status_item='RECUSADO',motivo_recusa=btrim(p_motivo),recusado_em=now(),recusado_por=(select auth.uid()),updated_at=now() where id=p_item_id;
  select p.id,p.full_name nome,c.whatsapp telefone into v_gestor
  from public.profiles p
  left join public.colaboradores c on lower(coalesce(c.email_empresa,c.email_pessoal,''))=lower(coalesce(p.email,''))
  where p.id=v_item.solicitante_id limit 1;
  perform private.hospedagem_v3_enqueue('SOLICITACAO_RECUSADA','GESTOR','recusa:'||p_item_id,jsonb_build_object('colaborador',v_item.nome_colaborador,'motivo',btrim(p_motivo)),v_item.solicitacao_id,null,null,v_item.solicitante_id,v_gestor.telefone,coalesce(v_gestor.nome,v_item.solicitante_nome),now());
  perform private.hospedagem_v3_recalcular_solicitacao(v_item.solicitacao_id);
end $$;

create or replace function private.hospedagem_v3_proximo_codigo(p_confirmado_em timestamptz)
returns jsonb language plpgsql security definer set search_path='public','private' as $$
declare v_ano integer;v_mes integer;v_num integer;v_sigla text;
begin
  v_ano:=extract(year from p_confirmado_em at time zone 'America/Sao_Paulo');
  v_mes:=extract(month from p_confirmado_em at time zone 'America/Sao_Paulo');
  insert into public.hospedagem_reserva_codigo_sequencias(ano,mes,ultimo_numero) values(v_ano,v_mes,1)
  on conflict(ano,mes) do update set ultimo_numero=public.hospedagem_reserva_codigo_sequencias.ultimo_numero+1,updated_at=now()
  returning ultimo_numero into v_num;
  v_sigla:=(array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'])[v_mes];
  return jsonb_build_object('codigo','H'||v_sigla||case when v_num<100 then lpad(v_num::text,2,'0') else v_num::text end,'ano',v_ano);
end $$;
revoke all on function private.hospedagem_v3_proximo_codigo(timestamptz) from public,anon,authenticated;

create or replace function public.hospedagem_v3_iniciar_cotacao(
  p_solicitacao_id uuid,p_item_ids jsonb,p_hotel_ids jsonb
) returns jsonb language plpgsql security definer set search_path='public','private' as $$
declare h jsonb;i jsonb;v_cotacao_id uuid;v_hotel record;v_itens jsonb;v_total integer:=0;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao para cotar' using errcode='42501'; end if;
  if jsonb_array_length(coalesce(p_item_ids,'[]'::jsonb))=0 or jsonb_array_length(coalesce(p_hotel_ids,'[]'::jsonb))=0 then raise exception 'Selecione colaboradores e hoteis'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_item_ids) as x(value)
    left join public.hospedagem_solicitacao_colaboradores i on i.id=x.value::uuid
    where i.id is null or i.solicitacao_id<>p_solicitacao_id or i.status_item not in ('AGUARDANDO','EM_COTACAO') or i.sexo not in ('MASCULINO','FEMININO')
  ) then raise exception 'Selecao de colaboradores invalida ou sem sexo informado'; end if;

  select jsonb_agg(jsonb_build_object(
    'item_id',i.id,'nome',i.nome_colaborador,'sexo',i.sexo,'checkin',i.data_checkin_prevista,
    'checkout',i.data_checkout_prevista,'horario',i.horario_chegada_previsto
  ) order by i.data_checkin_prevista,i.horario_chegada_previsto,i.nome_colaborador)
  into v_itens from public.hospedagem_solicitacao_colaboradores i where i.id in (select value::uuid from jsonb_array_elements_text(p_item_ids));

  for h in select value from jsonb_array_elements(p_hotel_ids) loop
    select id,nome,whatsapp,cidade,uf,link_maps into v_hotel from public.hospedagem_hoteis where id=(h#>>'{}')::uuid and status<>'INATIVO';
    if not found then raise exception 'Hotel invalido'; end if;
    if nullif(btrim(v_hotel.whatsapp),'') is null or nullif(btrim(v_hotel.link_maps),'') is null then raise exception 'Hotel % sem WhatsApp ou localizacao',v_hotel.nome; end if;
    insert into public.hospedagem_cotacoes(solicitacao_id,hotel_id,hotel_nome,status,mensagem_enviada,enviado_em,criado_por)
    values(p_solicitacao_id,v_hotel.id,v_hotel.nome,'PENDENTE','Cotacao estruturada Hospedagem v3',null,(select auth.uid()))
    returning id into v_cotacao_id;
    delete from public.hospedagem_cotacao_colaboradores where cotacao_id=v_cotacao_id;
    for i in select value from jsonb_array_elements(p_item_ids) loop
      insert into public.hospedagem_cotacao_colaboradores(cotacao_id,solicitacao_colaborador_id) values(v_cotacao_id,(i#>>'{}')::uuid);
    end loop;
    perform private.hospedagem_v3_enqueue('COTACAO_HOTEL','HOTEL','cotacao:'||v_cotacao_id,jsonb_build_object(
      'cotacao_id',v_cotacao_id,'solicitacao_id',p_solicitacao_id,'cidade',v_hotel.cidade,'uf',v_hotel.uf,'itens',v_itens
    ),p_solicitacao_id,null,v_hotel.id,null,v_hotel.whatsapp,v_hotel.nome,now());
    v_total:=v_total+1;
  end loop;
  update public.hospedagem_solicitacao_colaboradores set status_item='EM_COTACAO',updated_at=now()
    where id in(select value::uuid from jsonb_array_elements_text(p_item_ids));
  perform private.hospedagem_v3_recalcular_solicitacao(p_solicitacao_id);
  return jsonb_build_object('cotacoes',v_total);
end $$;

create or replace function public.hospedagem_v3_solicitar_reserva(
  p_solicitacao_id uuid,p_hotel_id uuid,p_item_ids jsonb,p_valor_diaria numeric,p_quartos jsonb default '[]'::jsonb,p_cotacao_id uuid default null
) returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_pedido_id uuid;v_hotel record;v_itens jsonb;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao para reservar' using errcode='42501'; end if;
  if coalesce(p_valor_diaria,-1)<0 then raise exception 'Valor da diaria invalido'; end if;
  select id,nome,whatsapp,cidade,uf,link_maps into v_hotel from public.hospedagem_hoteis where id=p_hotel_id and status<>'INATIVO';
  if not found or nullif(btrim(v_hotel.whatsapp),'') is null then raise exception 'Hotel sem WhatsApp valido'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_item_ids,'[]'::jsonb)) as x(value)
    left join public.hospedagem_solicitacao_colaboradores i on i.id=x.value::uuid
    where i.id is null or i.solicitacao_id<>p_solicitacao_id or i.status_item not in ('AGUARDANDO','EM_COTACAO')
  ) then raise exception 'Colaboradores indisponiveis para reserva'; end if;
  if jsonb_array_length(coalesce(p_item_ids,'[]'::jsonb))=0 then raise exception 'Selecione colaboradores'; end if;
  insert into public.hospedagem_reserva_pedidos(solicitacao_id,hotel_id,cotacao_id,valor_diaria,quartos,solicitado_por)
  values(p_solicitacao_id,p_hotel_id,p_cotacao_id,p_valor_diaria,coalesce(p_quartos,'[]'::jsonb),(select auth.uid())) returning id into v_pedido_id;
  insert into public.hospedagem_reserva_pedido_colaboradores(pedido_id,solicitacao_colaborador_id)
  select v_pedido_id,value::uuid from jsonb_array_elements_text(p_item_ids);
  update public.hospedagem_solicitacao_colaboradores set status_item='AGUARDANDO_HOTEL',updated_at=now()
    where id in(select value::uuid from jsonb_array_elements_text(p_item_ids));
  select jsonb_agg(jsonb_build_object('item_id',i.id,'nome',i.nome_colaborador,'sexo',i.sexo,'checkin',i.data_checkin_prevista,'checkout',i.data_checkout_prevista,'horario',i.horario_chegada_previsto))
    into v_itens from public.hospedagem_solicitacao_colaboradores i where i.id in(select value::uuid from jsonb_array_elements_text(p_item_ids));
  perform private.hospedagem_v3_enqueue('RESERVA_SOLICITAR','HOTEL','reserva-pedido:'||v_pedido_id,jsonb_build_object('pedido_id',v_pedido_id,'itens',v_itens,'valor_diaria',p_valor_diaria,'quartos',coalesce(p_quartos,'[]'::jsonb)),p_solicitacao_id,null,p_hotel_id,null,v_hotel.whatsapp,v_hotel.nome,now());
  perform private.hospedagem_v3_recalcular_solicitacao(p_solicitacao_id);
  return v_pedido_id;
end $$;

create or replace function public.hospedagem_v3_confirmar_reserva_pedido(p_pedido_id uuid,p_resposta text default null)
returns jsonb language plpgsql security definer set search_path='public','private' as $$
declare v_pedido record;v_reserva_id uuid;v_codigo jsonb;v_inicio date;v_fim date;v_hora time;v_qtd integer;v_total numeric;v_nomes text;v_item record;v_quarto jsonb;v_quarto_id uuid;v_gestor record;v_colab record;
begin
  if not (public.hospedagem_pode_operar(true) or (select auth.role())='service_role') then raise exception 'Sem permissao' using errcode='42501'; end if;
  select p.*,h.nome hotel_nome,h.cidade,h.uf,h.link_maps,h.whatsapp into v_pedido
  from public.hospedagem_reserva_pedidos p join public.hospedagem_hoteis h on h.id=p.hotel_id where p.id=p_pedido_id for update;
  if not found then raise exception 'Pedido de reserva nao encontrado'; end if;
  if v_pedido.status='CONFIRMADO' then return jsonb_build_object('reserva_id',v_pedido.reserva_id,'idempotente',true); end if;
  if v_pedido.status<>'AGUARDANDO_HOTEL' then raise exception 'Pedido nao esta aguardando confirmacao'; end if;
  select min(i.data_checkin_prevista),max(i.data_checkout_prevista),min(i.horario_chegada_previsto),count(*),string_agg(i.nome_colaborador,', ' order by i.nome_colaborador)
    into v_inicio,v_fim,v_hora,v_qtd,v_nomes
  from public.hospedagem_reserva_pedido_colaboradores pc join public.hospedagem_solicitacao_colaboradores i on i.id=pc.solicitacao_colaborador_id where pc.pedido_id=p_pedido_id;
  v_codigo:=private.hospedagem_v3_proximo_codigo(now());
  v_total:=coalesce((select sum(coalesce((q->>'quantidade')::integer,1)*coalesce((q->>'valor_diaria')::numeric,v_pedido.valor_diaria)*(v_fim-v_inicio)) from jsonb_array_elements(v_pedido.quartos) q),v_pedido.valor_diaria*v_qtd*(v_fim-v_inicio));
  insert into public.hospedagem_reservas(solicitacao_id,hotel_id,nome_hotel,cidade_hotel,uf_hotel,valor_diaria,quantidade_diarias,quantidade_quartos,valor_total_previsto,data_checkin,data_checkout,horario_chegada,status_hospedagem,criado_por,codigo_operacional,codigo_ano,confirmado_em,confirmacao_origem,fluxo_versao)
  values(v_pedido.solicitacao_id,v_pedido.hotel_id,v_pedido.hotel_nome,v_pedido.cidade,v_pedido.uf,v_pedido.valor_diaria,(v_fim-v_inicio),greatest(coalesce((select sum(coalesce((q->>'quantidade')::integer,1)) from jsonb_array_elements(v_pedido.quartos) q),0),1),v_total,v_inicio,v_fim,v_hora,'CHECKIN_PREVISTO',v_pedido.solicitado_por,v_codigo->>'codigo',(v_codigo->>'ano')::integer,now(),'WHATSAPP',3)
  returning id into v_reserva_id;
  insert into public.hospedagem_reserva_solicitacoes(reserva_id,solicitacao_id) values(v_reserva_id,v_pedido.solicitacao_id) on conflict do nothing;
  for v_quarto in select value from jsonb_array_elements(v_pedido.quartos) loop
    insert into public.hospedagem_reserva_quartos(reserva_id,quantidade,tipo_quarto,genero,valor_diaria)
    values(v_reserva_id,coalesce((v_quarto->>'quantidade')::integer,1),coalesce(v_quarto->>'tipo_quarto','INDIVIDUAL'),coalesce(v_quarto->>'genero','MASC'),coalesce((v_quarto->>'valor_diaria')::numeric,v_pedido.valor_diaria)) returning id into v_quarto_id;
  end loop;
  for v_item in select i.* from public.hospedagem_reserva_pedido_colaboradores pc join public.hospedagem_solicitacao_colaboradores i on i.id=pc.solicitacao_colaborador_id where pc.pedido_id=p_pedido_id loop
    insert into public.hospedagem_reserva_colaboradores(reserva_id,solicitacao_colaborador_id,status) values(v_reserva_id,v_item.id,'HOSPEDADO') on conflict do nothing;
    update public.hospedagem_solicitacao_colaboradores set reserva_id=v_reserva_id,status_item='RESERVADO',updated_at=now() where id=v_item.id;
    select c.whatsapp into v_colab from public.colaboradores c where c.id=v_item.colaborador_id;
    perform private.hospedagem_v3_enqueue('RESERVA_CONFIRMADA_COLABORADOR','COLABORADOR','reserva-confirmada-colab:'||v_reserva_id||':'||v_item.id,jsonb_build_object('colaborador',v_item.nome_colaborador,'codigo',v_codigo->>'codigo','hotel',v_pedido.hotel_nome,'localizacao',v_pedido.link_maps,'checkin',v_item.data_checkin_prevista,'checkout',v_item.data_checkout_prevista),v_item.solicitacao_id,v_reserva_id,v_pedido.hotel_id,v_item.colaborador_id,v_colab.whatsapp,v_item.nome_colaborador,now());
    update public.hospedagem_solicitacao_colaboradores old_item set status_item='CHECKOUT',updated_at=now()
      from public.hospedagem_alteracoes a where a.nova_solicitacao_colaborador_id=v_item.id and old_item.id=a.solicitacao_colaborador_id;
    update public.hospedagem_alteracoes set status='CONFIRMADA',updated_at=now() where nova_solicitacao_colaborador_id=v_item.id;
  end loop;
  select s.solicitante_id,p.full_name nome,c.whatsapp telefone into v_gestor
  from public.hospedagem_solicitacoes s left join public.profiles p on p.id=s.solicitante_id left join public.colaboradores c on lower(coalesce(c.email_empresa,c.email_pessoal,''))=lower(coalesce(p.email,''))
  where s.id=v_pedido.solicitacao_id limit 1;
  perform private.hospedagem_v3_enqueue('RESERVA_CONFIRMADA_GESTOR','GESTOR','reserva-confirmada-gestor:'||v_reserva_id,jsonb_build_object('colaboradores',v_nomes,'codigo',v_codigo->>'codigo','hotel',v_pedido.hotel_nome,'localizacao',v_pedido.link_maps),v_pedido.solicitacao_id,v_reserva_id,v_pedido.hotel_id,v_gestor.solicitante_id,v_gestor.telefone,v_gestor.nome,now());
  update public.hospedagem_reserva_pedidos set status='CONFIRMADO',respondido_em=now(),resposta_texto=p_resposta,reserva_id=v_reserva_id,updated_at=now() where id=p_pedido_id;
  if v_pedido.cotacao_id is not null then update public.hospedagem_cotacoes set selecionada=true,selecionada_em=now() where id=v_pedido.cotacao_id; end if;
  perform private.hospedagem_v3_recalcular_solicitacao(v_pedido.solicitacao_id);
  return jsonb_build_object('reserva_id',v_reserva_id,'codigo',v_codigo->>'codigo');
end $$;

create or replace function public.hospedagem_v3_solicitar_alteracao(p_item_id uuid,p_tipo text,p_dados jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_item record;v_id uuid;
begin
  select i.*,s.solicitante_id into v_item from public.hospedagem_solicitacao_colaboradores i join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where i.id=p_item_id for update;
  if not found or v_item.solicitante_id is distinct from (select auth.uid()) then raise exception 'Sem permissao' using errcode='42501'; end if;
  if v_item.status_item<>'RESERVADO' or v_item.reserva_id is null then raise exception 'Somente reservas confirmadas podem ser alteradas'; end if;
  insert into public.hospedagem_alteracoes(solicitacao_colaborador_id,reserva_id,tipo,dados_solicitados,solicitada_por)
  values(p_item_id,v_item.reserva_id,upper(p_tipo),coalesce(p_dados,'{}'::jsonb),(select auth.uid())) returning id into v_id;
  update public.hospedagem_solicitacao_colaboradores set status_item='ALTERACAO_PENDENTE',updated_at=now() where id=p_item_id;
  return v_id;
end $$;

create or replace function public.hospedagem_v3_responder_checkout(p_decisao_id uuid,p_decisao text,p_dias_adicionais integer default null)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_dec record;v_item record;v_hotel record;
begin
  select d.*,s.solicitante_id into v_dec from public.hospedagem_checkout_decisoes d join public.hospedagem_solicitacao_colaboradores i on i.id=d.solicitacao_colaborador_id join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where d.id=p_decisao_id for update;
  if not found or v_dec.solicitante_id is distinct from (select auth.uid()) then raise exception 'Sem permissao' using errcode='42501'; end if;
  if v_dec.status not in ('AGUARDANDO_GESTOR','SEM_RESPOSTA') then raise exception 'Decisao ja tratada'; end if;
  if upper(p_decisao)='PRORROGAR' and coalesce(p_dias_adicionais,0)<=0 then raise exception 'Informe os dias adicionais'; end if;
  select i.* into v_item from public.hospedagem_solicitacao_colaboradores i where i.id=v_dec.solicitacao_colaborador_id;
  select h.* into v_hotel from public.hospedagem_reservas r join public.hospedagem_hoteis h on h.id=r.hotel_id where r.id=v_dec.reserva_id;
  update public.hospedagem_checkout_decisoes set decisao=upper(p_decisao),dias_adicionais=case when upper(p_decisao)='PRORROGAR' then p_dias_adicionais else null end,status='AGUARDANDO_HOTEL',respondido_em=now(),updated_at=now() where id=p_decisao_id;
  update public.hospedagem_solicitacao_colaboradores set status_item='CHECKOUT_PENDENTE',updated_at=now() where id=v_item.id;
  perform private.hospedagem_v3_enqueue(case when upper(p_decisao)='PRORROGAR' then 'PRORROGACAO_SOLICITAR' else 'CHECKOUT_SOLICITAR' end,'HOTEL','checkout-decisao:'||p_decisao_id,jsonb_build_object('decisao_id',p_decisao_id,'colaborador',v_item.nome_colaborador,'dias_adicionais',p_dias_adicionais,'checkout_atual',v_item.data_checkout_prevista),v_item.solicitacao_id,v_dec.reserva_id,v_hotel.id,null,v_hotel.whatsapp,v_hotel.nome,now());
end $$;

create or replace function public.hospedagem_v3_preparar_nova_reserva_alteracao(p_alteracao_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private' as $$
declare v_alt record;v_item record;v_sol record;v_new_sol uuid;v_new_item uuid;v_checkin date;v_dias integer;v_cidade text;v_uf text;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao' using errcode='42501'; end if;
  select * into v_alt from public.hospedagem_alteracoes where id=p_alteracao_id for update;
  if not found or v_alt.status<>'AGUARDANDO_ADM' or v_alt.tipo not in ('MUDANCA_DATAS','MUDANCA_CIDADE') then raise exception 'Alteracao indisponivel'; end if;
  select * into v_item from public.hospedagem_solicitacao_colaboradores where id=v_alt.solicitacao_colaborador_id;
  select * into v_sol from public.hospedagem_solicitacoes where id=v_item.solicitacao_id;
  v_checkin:=case when v_alt.tipo='MUDANCA_DATAS' then (v_alt.dados_solicitados->>'data_checkin')::date else v_item.data_checkin_prevista end;
  v_dias:=case when v_alt.tipo='MUDANCA_DATAS' then (v_alt.dados_solicitados->>'dias')::integer else v_item.quantidade_diarias_prevista end;
  v_cidade:=case when v_alt.tipo='MUDANCA_CIDADE' then btrim(v_alt.dados_solicitados->>'cidade') else v_sol.cidade end;
  v_uf:=case when v_alt.tipo='MUDANCA_CIDADE' then upper(btrim(v_alt.dados_solicitados->>'uf')) else v_sol.uf end;
  if v_checkin is null or v_dias<=0 or nullif(v_cidade,'') is null or nullif(v_uf,'') is null then raise exception 'Dados da alteracao invalidos'; end if;
  insert into public.hospedagem_solicitacoes(data_solicitacao,created_by,solicitante_id,solicitante_nome,solicitante_email,empresa,coordenacao,supervisao,regional,cidade,uf,cliente,local_embarque,link_local_embarque,observacao_gestor,status_solicitacao,preferencia_hospedagem,fluxo_versao,origem_solicitacao)
  values(current_date,v_sol.created_by,v_sol.solicitante_id,v_sol.solicitante_nome,v_sol.solicitante_email,v_sol.empresa,v_sol.coordenacao,v_sol.supervisao,v_sol.regional,v_cidade,v_uf,v_sol.cliente,v_sol.local_embarque,v_sol.link_local_embarque,'Nova reserva por alteracao '||v_alt.tipo,'SOLICITADA','HOTEL',3,'ALTERACAO') returning id into v_new_sol;
  insert into public.hospedagem_solicitacao_colaboradores(solicitacao_id,colaborador_id,nome_colaborador,cpf,tipo_colaborador,empresa,coordenacao,supervisao,status_colaborador,data_checkin_prevista,data_checkout_prevista,horario_chegada_previsto,quantidade_diarias_prevista,sexo,status_item)
  values(v_new_sol,v_item.colaborador_id,v_item.nome_colaborador,v_item.cpf,v_item.tipo_colaborador,v_item.empresa,v_item.coordenacao,v_item.supervisao,v_item.status_colaborador,v_checkin,v_checkin+v_dias,v_item.horario_chegada_previsto,v_dias,v_item.sexo,'AGUARDANDO') returning id into v_new_item;
  update public.hospedagem_solicitacoes set data_checkin_prevista=v_checkin,data_checkout_prevista=v_checkin+v_dias,quantidade_diarias_prevista=v_dias where id=v_new_sol;
  update public.hospedagem_alteracoes set status='ENVIADA_HOTEL',nova_solicitacao_colaborador_id=v_new_item,tratada_por=(select auth.uid()),tratada_em=now(),updated_at=now() where id=p_alteracao_id;
  return jsonb_build_object('solicitacao_id',v_new_sol,'item_id',v_new_item);
end $$;

create or replace function public.hospedagem_v3_tratar_alteracao(p_alteracao_id uuid)
returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_alt record;v_item record;v_res record;v_hotel record;v_decisao uuid;v_dias integer;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao' using errcode='42501'; end if;
  select * into v_alt from public.hospedagem_alteracoes where id=p_alteracao_id for update;
  if not found or v_alt.status<>'AGUARDANDO_ADM' then raise exception 'Alteracao indisponivel'; end if;
  select * into v_item from public.hospedagem_solicitacao_colaboradores where id=v_alt.solicitacao_colaborador_id;
  select * into v_res from public.hospedagem_reservas where id=v_alt.reserva_id;
  select * into v_hotel from public.hospedagem_hoteis where id=v_res.hotel_id;
  if v_alt.tipo not in ('PRORROGACAO','CANCELAMENTO') then raise exception 'Para mudar cidade ou datas, crie uma nova reserva para o colaborador'; end if;
  v_dias:=case when v_alt.tipo='PRORROGACAO' then coalesce((v_alt.dados_solicitados->>'dias_adicionais')::integer,0) else null end;
  if v_alt.tipo='PRORROGACAO' and v_dias<=0 then raise exception 'Dias adicionais invalidos'; end if;
  insert into public.hospedagem_checkout_decisoes(solicitacao_colaborador_id,reserva_id,data_checkout_prevista,decisao,dias_adicionais,status,respondido_em)
  values(v_item.id,v_res.id,v_item.data_checkout_prevista,case when v_alt.tipo='PRORROGACAO' then 'PRORROGAR' else 'CHECKOUT' end,v_dias,'AGUARDANDO_HOTEL',now())
  on conflict(solicitacao_colaborador_id,data_checkout_prevista) do update set decisao=excluded.decisao,dias_adicionais=excluded.dias_adicionais,status='AGUARDANDO_HOTEL',respondido_em=now(),updated_at=now()
  returning id into v_decisao;
  update public.hospedagem_alteracoes set status='ENVIADA_HOTEL',tratada_por=(select auth.uid()),tratada_em=now(),updated_at=now() where id=p_alteracao_id;
  update public.hospedagem_solicitacao_colaboradores set status_item='CHECKOUT_PENDENTE',updated_at=now() where id=v_item.id;
  perform private.hospedagem_v3_enqueue(case when v_alt.tipo='PRORROGACAO' then 'PRORROGACAO_SOLICITAR' else 'CHECKOUT_SOLICITAR' end,'HOTEL','alteracao-hotel:'||p_alteracao_id,jsonb_build_object('decisao_id',v_decisao,'colaborador',v_item.nome_colaborador,'dias_adicionais',v_dias,'checkout_atual',v_item.data_checkout_prevista),v_item.solicitacao_id,v_res.id,v_hotel.id,null,v_hotel.whatsapp,v_hotel.nome,now());
  return v_decisao;
end $$;

create or replace function public.hospedagem_v3_confirmar_checkout_hotel(p_decisao_id uuid,p_resposta text default null)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_dec record;
begin
  select * into v_dec from public.hospedagem_checkout_decisoes where id=p_decisao_id for update;
  if not found or v_dec.status<>'AGUARDANDO_HOTEL' then raise exception 'Decisao de checkout invalida'; end if;
  update public.hospedagem_checkout_decisoes set status='AGUARDANDO_ADM',hotel_aceitou=true,resposta_hotel=p_resposta,confirmado_hotel_em=now(),updated_at=now() where id=p_decisao_id;
  insert into public.painel_notificacoes(tipo,titulo,descricao,prioridade,icone,modulo_url,destinatario_modulo,referencia_tabela,referencia_id,chave_dedup,meta)
  values('hospedagem_checkout_confirmado','Hotel respondeu sobre checkout',coalesce(p_resposta,'Confirmacao recebida do hotel.'),'urgente','hotel-alert','adm-hotel','HOSPEDAGEM','hospedagem_checkout_decisoes',p_decisao_id::text,'hosp-checkout-adm:'||p_decisao_id,jsonb_build_object('decisao_id',p_decisao_id)) on conflict(chave_dedup) do nothing;
end $$;
revoke all on function public.hospedagem_v3_confirmar_checkout_hotel(uuid,text) from public,anon,authenticated;
grant execute on function public.hospedagem_v3_confirmar_checkout_hotel(uuid,text) to service_role;

create or replace function public.hospedagem_v3_validar_checkout(p_decisao_id uuid)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_dec record;v_item record;v_res record;v_hotel record;v_gestor record;v_colab record;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao' using errcode='42501'; end if;
  select * into v_dec from public.hospedagem_checkout_decisoes where id=p_decisao_id for update;
  if not found or v_dec.status<>'AGUARDANDO_ADM' then raise exception 'Confirmacao do hotel ainda nao recebida'; end if;
  select * into v_item from public.hospedagem_solicitacao_colaboradores where id=v_dec.solicitacao_colaborador_id for update;
  if v_dec.decisao='PRORROGAR' then
    update public.hospedagem_solicitacao_colaboradores set data_checkout_prevista=data_checkout_prevista+v_dec.dias_adicionais,
      quantidade_diarias_prevista=quantidade_diarias_prevista+v_dec.dias_adicionais,status_item='RESERVADO',updated_at=now() where id=v_item.id;
    update public.hospedagem_reservas r set data_checkout=(select max(data_checkout_prevista) from public.hospedagem_solicitacao_colaboradores where reserva_id=r.id),updated_at=now() where id=v_dec.reserva_id;
  else
    update public.hospedagem_solicitacao_colaboradores set status_item='CHECKOUT',updated_at=now() where id=v_item.id;
    update public.hospedagem_reserva_colaboradores set status='CHECKOUT',checkout_em=now(),checkout_por=(select auth.uid()),updated_at=now() where reserva_id=v_dec.reserva_id and solicitacao_colaborador_id=v_item.id;
    if not exists(select 1 from public.hospedagem_solicitacao_colaboradores where reserva_id=v_dec.reserva_id and status_item<>'CHECKOUT') then update public.hospedagem_reservas set status_hospedagem='CHECKOUT_REALIZADO',data_checkout_real=now(),updated_at=now() where id=v_dec.reserva_id; end if;
  end if;
  update public.hospedagem_checkout_decisoes set status='CONCLUIDA',confirmado_adm_em=now(),updated_at=now() where id=p_decisao_id;
  update public.hospedagem_alteracoes set status='CONFIRMADA',updated_at=now() where solicitacao_colaborador_id=v_item.id and reserva_id=v_dec.reserva_id and status='ENVIADA_HOTEL';
  if v_dec.decisao='PRORROGAR' then
    select r.*,h.nome hotel_nome,h.link_maps,h.whatsapp into v_res from public.hospedagem_reservas r join public.hospedagem_hoteis h on h.id=r.hotel_id where r.id=v_dec.reserva_id;
    select c.whatsapp into v_colab from public.colaboradores c where c.id=v_item.colaborador_id;
    select s.solicitante_id,p.full_name nome,c.whatsapp telefone into v_gestor from public.hospedagem_solicitacoes s left join public.profiles p on p.id=s.solicitante_id left join public.colaboradores c on lower(coalesce(c.email_empresa,c.email_pessoal,''))=lower(coalesce(p.email,'')) where s.id=v_item.solicitacao_id limit 1;
    perform private.hospedagem_v3_enqueue('RESERVA_CONFIRMADA_COLABORADOR','COLABORADOR','alteracao-confirmada-colab:'||p_decisao_id,jsonb_build_object('colaborador',v_item.nome_colaborador,'codigo',v_res.codigo_operacional,'hotel',v_res.hotel_nome,'localizacao',v_res.link_maps,'checkin',v_item.data_checkin_prevista,'checkout',v_item.data_checkout_prevista),v_item.solicitacao_id,v_res.id,v_res.hotel_id,v_item.colaborador_id,v_colab.whatsapp,v_item.nome_colaborador,now());
    perform private.hospedagem_v3_enqueue('RESERVA_CONFIRMADA_GESTOR','GESTOR','alteracao-confirmada-gestor:'||p_decisao_id,jsonb_build_object('colaboradores',v_item.nome_colaborador,'codigo',v_res.codigo_operacional,'hotel',v_res.hotel_nome,'localizacao',v_res.link_maps),v_item.solicitacao_id,v_res.id,v_res.hotel_id,v_gestor.solicitante_id,v_gestor.telefone,v_gestor.nome,now());
  end if;
  perform private.hospedagem_v3_recalcular_solicitacao(v_item.solicitacao_id);
end $$;

create or replace function public.hospedagem_v3_redirecionar_prorrogacao(p_decisao_id uuid)
returns jsonb language plpgsql security definer set search_path='public','private' as $$
declare v_dec record;v_item record;v_sol record;v_new_sol uuid;v_new_item uuid;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao' using errcode='42501'; end if;
  select * into v_dec from public.hospedagem_checkout_decisoes where id=p_decisao_id for update;
  if not found or v_dec.status<>'AGUARDANDO_ADM' or v_dec.decisao<>'PRORROGAR' or v_dec.hotel_aceitou is distinct from false then raise exception 'Prorrogacao nao esta recusada pelo hotel'; end if;
  select * into v_item from public.hospedagem_solicitacao_colaboradores where id=v_dec.solicitacao_colaborador_id;
  select * into v_sol from public.hospedagem_solicitacoes where id=v_item.solicitacao_id;
  insert into public.hospedagem_solicitacoes(data_solicitacao,created_by,solicitante_id,solicitante_nome,solicitante_email,empresa,coordenacao,supervisao,regional,cidade,uf,cliente,local_embarque,link_local_embarque,observacao_gestor,status_solicitacao,preferencia_hospedagem,fluxo_versao,origem_solicitacao)
  values(current_date,v_sol.created_by,v_sol.solicitante_id,v_sol.solicitante_nome,v_sol.solicitante_email,v_sol.empresa,v_sol.coordenacao,v_sol.supervisao,v_sol.regional,v_sol.cidade,v_sol.uf,v_sol.cliente,v_sol.local_embarque,v_sol.link_local_embarque,'Prorrogacao redirecionada para outro hotel','SOLICITADA','HOTEL',3,'PRORROGACAO') returning id into v_new_sol;
  insert into public.hospedagem_solicitacao_colaboradores(solicitacao_id,colaborador_id,nome_colaborador,cpf,tipo_colaborador,empresa,coordenacao,supervisao,status_colaborador,data_checkin_prevista,data_checkout_prevista,horario_chegada_previsto,quantidade_diarias_prevista,sexo,status_item)
  values(v_new_sol,v_item.colaborador_id,v_item.nome_colaborador,v_item.cpf,v_item.tipo_colaborador,v_item.empresa,v_item.coordenacao,v_item.supervisao,v_item.status_colaborador,v_item.data_checkout_prevista,v_item.data_checkout_prevista+v_dec.dias_adicionais,v_item.horario_chegada_previsto,v_dec.dias_adicionais,v_item.sexo,'AGUARDANDO') returning id into v_new_item;
  update public.hospedagem_solicitacoes set data_checkin_prevista=v_item.data_checkout_prevista,data_checkout_prevista=v_item.data_checkout_prevista+v_dec.dias_adicionais,quantidade_diarias_prevista=v_dec.dias_adicionais where id=v_new_sol;
  update public.hospedagem_solicitacao_colaboradores set status_item='CHECKOUT',updated_at=now() where id=v_item.id;
  update public.hospedagem_checkout_decisoes set status='CONCLUIDA',confirmado_adm_em=now(),updated_at=now() where id=p_decisao_id;
  perform private.hospedagem_v3_recalcular_solicitacao(v_item.solicitacao_id);
  return jsonb_build_object('solicitacao_id',v_new_sol,'item_id',v_new_item);
end $$;

create or replace function public.hospedagem_v3_criar_pagamento(
  p_reserva_id uuid,p_forma text,p_valor numeric,p_chave_pix text default null,p_boleto_url text default null,
  p_linha_digitavel text default null,p_vencimento date default null,p_enviar_financeiro boolean default false
) returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_res record;v_id uuid;v_fin_id uuid;v_forma text:=upper(p_forma);
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao' using errcode='42501'; end if;
  if v_forma not in ('PIX','BOLETO') or coalesce(p_valor,0)<=0 then raise exception 'Forma ou valor invalido'; end if;
  if v_forma='PIX' and nullif(btrim(p_chave_pix),'') is null then raise exception 'Chave PIX obrigatoria'; end if;
  if v_forma='BOLETO' and nullif(btrim(p_boleto_url),'') is null then raise exception 'Anexe o boleto em PDF'; end if;
  select r.*,h.nome hotel_nome into v_res from public.hospedagem_reservas r join public.hospedagem_hoteis h on h.id=r.hotel_id where r.id=p_reserva_id;
  if not found then raise exception 'Reserva nao encontrada'; end if;
  insert into public.hospedagem_pagamentos_v3(reserva_id,forma_pagamento,chave_pix,boleto_url,boleto_linha_digitavel,data_vencimento,valor_total,status,enviado_financeiro_em,criado_por)
  values(p_reserva_id,v_forma,nullif(btrim(p_chave_pix),''),p_boleto_url,p_linha_digitavel,p_vencimento,p_valor,case when p_enviar_financeiro then 'ENVIADO_FINANCEIRO' else 'RASCUNHO' end,case when p_enviar_financeiro then now() end,(select auth.uid())) returning id into v_id;
  if p_enviar_financeiro then
    insert into public.financeiro_pagamentos(origem_setor,origem_tabela,origem_id,origem_codigo,competencia,descricao,favorecido_nome,chave_pix,forma_pagamento,valor,data_vencimento,status,nf_status,boleto_url,solicitado_por)
    values('HOSPEDAGEM','hospedagem_pagamentos_v3',v_id,v_res.codigo_operacional,date_trunc('month',current_date)::date,'Hospedagem '||coalesce(v_res.codigo_operacional,''),v_res.hotel_nome,p_chave_pix,v_forma,p_valor,p_vencimento,'PENDENTE','AGUARDANDO_NF',p_boleto_url,(select auth.uid())) returning id into v_fin_id;
    update public.hospedagem_pagamentos_v3 set financeiro_pagamento_id=v_fin_id where id=v_id;
  end if;
  return v_id;
end $$;

create or replace function public.hospedagem_v3_registrar_parcela(
  p_pagamento_id uuid,p_valor numeric,p_data date,p_comprovante_url text,p_setor text
) returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_pag record;v_res record;v_id uuid;v_novo_pago numeric;
begin
  if not (public.hospedagem_pode_operar(true) or public.hospedagem_pode_financeiro(true)) then raise exception 'Sem permissao' using errcode='42501'; end if;
  if coalesce(p_valor,0)<=0 or nullif(btrim(p_comprovante_url),'') is null then raise exception 'Informe valor e comprovante'; end if;
  select * into v_pag from public.hospedagem_pagamentos_v3 where id=p_pagamento_id for update;
  if not found or v_pag.status='CANCELADO' then raise exception 'Pagamento invalido'; end if;
  if p_valor>v_pag.saldo then raise exception 'Valor superior ao saldo'; end if;
  insert into public.hospedagem_pagamento_parcelas(pagamento_id,valor,data_pagamento,comprovante_url,pago_por,pago_por_setor,proxima_cobranca_nfse_em)
  values(p_pagamento_id,p_valor,p_data,p_comprovante_url,(select auth.uid()),upper(p_setor),now()+interval '2 days') returning id into v_id;
  v_novo_pago:=v_pag.valor_pago+p_valor;
  update public.hospedagem_pagamentos_v3 set valor_pago=v_novo_pago,status=case when v_novo_pago>=valor_total then 'PAGO' else 'PARCIAL' end,origem_pagamento=upper(p_setor),updated_at=now() where id=p_pagamento_id;
  select r.*,h.whatsapp,h.nome hotel_nome into v_res from public.hospedagem_reservas r join public.hospedagem_hoteis h on h.id=r.hotel_id where r.id=v_pag.reserva_id;
  perform private.hospedagem_v3_enqueue('COMPROVANTE_E_PEDIDO_NFSE','HOTEL','comprovante:'||v_id,jsonb_build_object('parcela_id',v_id,'valor',p_valor,'comprovante_url',p_comprovante_url,'codigo',v_res.codigo_operacional),v_res.solicitacao_id,v_res.id,v_res.hotel_id,null,v_res.whatsapp,v_res.hotel_nome,now());
  return v_id;
end $$;

create or replace function public.hospedagem_v3_registrar_extra(p_reserva_id uuid,p_descricao text,p_valor numeric,p_rateios jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_res record;v_id uuid;r jsonb;v_soma numeric:=0;v_item record;v_rateio_id uuid;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao' using errcode='42501'; end if;
  if nullif(btrim(p_descricao),'') is null or coalesce(p_valor,0)<=0 then raise exception 'Informe descricao e valor'; end if;
  select * into v_res from public.hospedagem_reservas where id=p_reserva_id for update;
  if not found then raise exception 'Reserva nao encontrada'; end if;
  select coalesce(sum((value->>'valor')::numeric),0) into v_soma from jsonb_array_elements(coalesce(p_rateios,'[]'::jsonb));
  if v_soma<0 or v_soma>p_valor then raise exception 'Rateios devem somar entre zero e o valor extra'; end if;
  insert into public.hospedagem_custos_extras(solicitacao_id,reserva_id,tipo,descricao,valor_total,valor_unitario,quantidade,data_custo,autorizado_por,enviar_conferencia,status_conferencia)
  values(v_res.solicitacao_id,p_reserva_id,'OUTROS',btrim(p_descricao),p_valor,p_valor,1,current_date,(select auth.uid()),false,'NAO_ENVIADO') returning id into v_id;
  for r in select value from jsonb_array_elements(coalesce(p_rateios,'[]'::jsonb)) loop
    if coalesce((r->>'valor')::numeric,0)<=0 then continue; end if;
    select * into v_item from public.hospedagem_solicitacao_colaboradores where id=(r->>'item_id')::uuid and reserva_id=p_reserva_id;
    if not found then raise exception 'Colaborador invalido no rateio'; end if;
    insert into public.hospedagem_diferencas_colaborador(reserva_id,solicitacao_colaborador_id,valor,observacoes,criado_por)
    values(p_reserva_id,v_item.id,(r->>'valor')::numeric,'Despesa indevida: '||btrim(p_descricao),(select auth.uid())) returning id into v_rateio_id;
    insert into public.hospedagem_extra_rateios(custo_extra_id,solicitacao_colaborador_id,valor,lancamento_caixa_id,criado_por)
    values(v_id,v_item.id,(r->>'valor')::numeric,v_rateio_id,(select auth.uid()));
  end loop;
  update public.hospedagem_pagamentos_v3 set valor_total=valor_total+(p_valor-v_soma),updated_at=now() where reserva_id=p_reserva_id and status<>'CANCELADO';
  return v_id;
end $$;

create or replace function public.hospedagem_v3_enfileirar_nfse(p_documento_id uuid)
returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_doc record;v_id uuid;
begin
  if not (public.hospedagem_pode_operar(true) or public.hospedagem_pode_financeiro(true)) then raise exception 'Sem permissao' using errcode='42501'; end if;
  select d.*,p.comprovante_url,p.valor valor_pago into v_doc from public.hospedagem_pagamento_documentos d join public.hospedagem_pagamento_parcelas p on p.id=d.parcela_id where d.id=p_documento_id for update;
  if not found or v_doc.status_validacao<>'VALIDO' then raise exception 'NFS-e ainda nao validada'; end if;
  if v_doc.grm_nf_lancamento_id is not null then return v_doc.grm_nf_lancamento_id; end if;
  if v_doc.storage_bucket is null or v_doc.storage_path is null then raise exception 'Documento fora do Storage'; end if;
  if not exists(select 1 from public.hospedagem_pagamento_documentos where parcela_id=v_doc.parcela_id and tipo='NFSE_PDF' and status_validacao='VALIDO')
     or not exists(select 1 from public.hospedagem_pagamento_documentos where parcela_id=v_doc.parcela_id and tipo='NFSE_XML' and status_validacao='VALIDO') then raise exception 'Anexe PDF e XML validos da NFS-e'; end if;
  insert into public.grm_nf_lancamentos(storage_bucket,storage_path,arquivo_nome,arquivo_mime_type,setor,enviado_por,status,fornecedor_cnpj,numero_documento,data_emissao,valor_total,extraido_json)
  values(v_doc.storage_bucket,v_doc.storage_path,split_part(v_doc.storage_path,'/',array_length(string_to_array(v_doc.storage_path,'/'),1)),v_doc.mime_type,'HOSPEDAGEM',(select auth.uid()),'NOVO',v_doc.emitente_cnpj,v_doc.numero_nfse,current_date,v_doc.valor_nfse,jsonb_build_object('origem','HOSPEDAGEM','documento_id',v_doc.id,'parcela_id',v_doc.parcela_id))
  on conflict(storage_path) do update set updated_at=now() returning id into v_id;
  update public.hospedagem_pagamento_documentos set grm_nf_lancamento_id=v_id where id=p_documento_id;
  insert into public.grm_sync_jobs(agente_id,status,lane,solicitado_por,payload)
  select 'sync-lancar-notas-fiscais','pendente','alteracoes',(select auth.uid())::text,jsonb_build_object('uploadId',v_id,'origem','hospedagem')
  where not exists(select 1 from public.grm_sync_jobs where agente_id='sync-lancar-notas-fiscais' and status in ('pendente','rodando'));
  return v_id;
end $$;

-- Views de leitura. Datas/estados sao individuais e o card continua agrupado
-- pela solicitacao no cliente.
create or replace view public.hospedagem_v3_itens with (security_invoker=true) as
select s.id solicitacao_id,s.codigo codigo_solicitacao,s.created_at solicitado_em,s.solicitante_id,s.solicitante_nome,
  s.empresa,s.coordenacao,s.supervisao,s.regional,s.cidade,s.uf,s.cliente,s.local_embarque,s.link_local_embarque,s.observacao_gestor,s.origem_solicitacao,
  i.id item_id,i.colaborador_id,i.nome_colaborador,i.cpf,i.sexo,i.data_checkin_prevista,i.data_checkout_prevista,i.horario_chegada_previsto,
  i.quantidade_diarias_prevista,i.status_item,i.motivo_recusa,i.reserva_id,
  r.codigo_operacional,r.nome_hotel hotel,r.hotel_id,r.status_hospedagem,h.link_maps hotel_localizacao
from public.hospedagem_solicitacoes s
join public.hospedagem_solicitacao_colaboradores i on i.solicitacao_id=s.id
left join public.hospedagem_reservas r on r.id=i.reserva_id
left join public.hospedagem_hoteis h on h.id=r.hotel_id
where s.fluxo_versao=3;

grant select on public.hospedagem_v3_itens to authenticated;

-- RLS e privilegios das tabelas novas.
do $$ declare t text; begin
  foreach t in array array['hospedagem_cotacao_colaboradores','hospedagem_reserva_pedidos','hospedagem_reserva_pedido_colaboradores','hospedagem_alteracoes','hospedagem_checkout_decisoes','hospedagem_pagamentos_v3','hospedagem_pagamento_parcelas','hospedagem_pagamento_documentos','hospedagem_empresas_fiscais','hospedagem_extra_rateios','hospedagem_outbox','hospedagem_reserva_codigo_sequencias'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create policy hosp_cot_colab_operador on public.hospedagem_cotacao_colaboradores for all to authenticated using (public.hospedagem_pode_operar(false)) with check (public.hospedagem_pode_operar(true));
create policy hosp_res_pedidos_operador on public.hospedagem_reserva_pedidos for all to authenticated using (public.hospedagem_pode_operar(false)) with check (public.hospedagem_pode_operar(true));
create policy hosp_res_pedido_colab_operador on public.hospedagem_reserva_pedido_colaboradores for all to authenticated using (public.hospedagem_pode_operar(false)) with check (public.hospedagem_pode_operar(true));
create policy hosp_alteracoes_operador on public.hospedagem_alteracoes for all to authenticated using (public.hospedagem_pode_operar(false)) with check (public.hospedagem_pode_operar(true));
create policy hosp_alteracoes_gestor on public.hospedagem_alteracoes for select to authenticated using (exists(select 1 from public.hospedagem_solicitacao_colaboradores i join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where i.id=solicitacao_colaborador_id and s.solicitante_id=(select auth.uid())));
create policy hosp_alteracoes_gestor_insert on public.hospedagem_alteracoes for insert to authenticated with check (solicitada_por=(select auth.uid()) and exists(select 1 from public.hospedagem_solicitacao_colaboradores i join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where i.id=solicitacao_colaborador_id and s.solicitante_id=(select auth.uid()) and i.status_item='RESERVADO'));
create policy hosp_checkout_operador on public.hospedagem_checkout_decisoes for all to authenticated using (public.hospedagem_pode_operar(false)) with check (public.hospedagem_pode_operar(true));
create policy hosp_checkout_gestor on public.hospedagem_checkout_decisoes for select to authenticated using (exists(select 1 from public.hospedagem_solicitacao_colaboradores i join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where i.id=solicitacao_colaborador_id and s.solicitante_id=(select auth.uid())));
create policy hosp_pagamentos_v3_autorizado on public.hospedagem_pagamentos_v3 for all to authenticated using (public.hospedagem_pode_operar(false) or public.hospedagem_pode_financeiro(false)) with check (public.hospedagem_pode_operar(true) or public.hospedagem_pode_financeiro(true));
create policy hosp_pag_parcelas_autorizado on public.hospedagem_pagamento_parcelas for all to authenticated using (public.hospedagem_pode_operar(false) or public.hospedagem_pode_financeiro(false)) with check (public.hospedagem_pode_operar(true) or public.hospedagem_pode_financeiro(true));
create policy hosp_pag_docs_autorizado on public.hospedagem_pagamento_documentos for all to authenticated using (public.hospedagem_pode_operar(false) or public.hospedagem_pode_financeiro(false)) with check (public.hospedagem_pode_operar(true) or public.hospedagem_pode_financeiro(true));
create policy hosp_empresas_fiscais_autorizado on public.hospedagem_empresas_fiscais for all to authenticated using (public.hospedagem_pode_operar(false) or public.hospedagem_pode_financeiro(false)) with check (public.hospedagem_pode_operar(true) or public.hospedagem_pode_financeiro(true));
create policy hosp_extra_rateios_operador on public.hospedagem_extra_rateios for all to authenticated using (public.hospedagem_pode_operar(false)) with check (public.hospedagem_pode_operar(true));
create policy hosp_outbox_operador_select on public.hospedagem_outbox for select to authenticated using (public.hospedagem_pode_operar(false));
create policy hosp_codigo_seq_operador_select on public.hospedagem_reserva_codigo_sequencias for select to authenticated using (public.hospedagem_pode_operar(false));

create policy hospedagem_reservas_select_gestor_v3 on public.hospedagem_reservas for select to authenticated using (
  fluxo_versao=3 and exists(select 1 from public.hospedagem_solicitacao_colaboradores i join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where i.reserva_id=hospedagem_reservas.id and (s.solicitante_id=(select auth.uid()) or s.created_by=(select auth.uid())))
);
create policy hospedagem_hoteis_select_gestor_v3 on public.hospedagem_hoteis for select to authenticated using (
  exists(select 1 from public.hospedagem_reservas r join public.hospedagem_solicitacao_colaboradores i on i.reserva_id=r.id join public.hospedagem_solicitacoes s on s.id=i.solicitacao_id where r.hotel_id=hospedagem_hoteis.id and r.fluxo_versao=3 and (s.solicitante_id=(select auth.uid()) or s.created_by=(select auth.uid())))
);

grant select,insert,update,delete on public.hospedagem_cotacao_colaboradores,public.hospedagem_reserva_pedidos,public.hospedagem_reserva_pedido_colaboradores,public.hospedagem_alteracoes,public.hospedagem_checkout_decisoes,public.hospedagem_pagamentos_v3,public.hospedagem_pagamento_parcelas,public.hospedagem_pagamento_documentos,public.hospedagem_empresas_fiscais,public.hospedagem_extra_rateios to authenticated;
grant select on public.hospedagem_outbox,public.hospedagem_reserva_codigo_sequencias to authenticated;
revoke all on function public.hospedagem_v3_criar_solicitacao(jsonb,jsonb),public.hospedagem_v3_editar_solicitacao(uuid,jsonb,jsonb),
  public.hospedagem_v3_cancelar_item(uuid),public.hospedagem_v3_recusar_item(uuid,text),public.hospedagem_v3_iniciar_cotacao(uuid,jsonb,jsonb),
  public.hospedagem_v3_solicitar_reserva(uuid,uuid,jsonb,numeric,jsonb,uuid),public.hospedagem_v3_confirmar_reserva_pedido(uuid,text),
  public.hospedagem_v3_solicitar_alteracao(uuid,text,jsonb),public.hospedagem_v3_responder_checkout(uuid,text,integer),public.hospedagem_v3_preparar_nova_reserva_alteracao(uuid),public.hospedagem_v3_tratar_alteracao(uuid),
  public.hospedagem_v3_validar_checkout(uuid),public.hospedagem_v3_redirecionar_prorrogacao(uuid),public.hospedagem_v3_criar_pagamento(uuid,text,numeric,text,text,text,date,boolean),
  public.hospedagem_v3_registrar_parcela(uuid,numeric,date,text,text),public.hospedagem_v3_registrar_extra(uuid,text,numeric,jsonb),public.hospedagem_v3_enfileirar_nfse(uuid) from public,anon;
grant execute on function public.hospedagem_v3_criar_solicitacao(jsonb,jsonb),public.hospedagem_v3_editar_solicitacao(uuid,jsonb,jsonb),
  public.hospedagem_v3_cancelar_item(uuid),public.hospedagem_v3_recusar_item(uuid,text),public.hospedagem_v3_iniciar_cotacao(uuid,jsonb,jsonb),
  public.hospedagem_v3_solicitar_reserva(uuid,uuid,jsonb,numeric,jsonb,uuid),public.hospedagem_v3_confirmar_reserva_pedido(uuid,text),
  public.hospedagem_v3_solicitar_alteracao(uuid,text,jsonb),public.hospedagem_v3_responder_checkout(uuid,text,integer),public.hospedagem_v3_preparar_nova_reserva_alteracao(uuid),public.hospedagem_v3_tratar_alteracao(uuid),
  public.hospedagem_v3_validar_checkout(uuid),public.hospedagem_v3_redirecionar_prorrogacao(uuid),public.hospedagem_v3_criar_pagamento(uuid,text,numeric,text,text,text,date,boolean),
  public.hospedagem_v3_registrar_parcela(uuid,numeric,date,text,text),public.hospedagem_v3_registrar_extra(uuid,text,numeric,jsonb),public.hospedagem_v3_enfileirar_nfse(uuid) to authenticated;
grant execute on function public.hospedagem_v3_confirmar_reserva_pedido(uuid,text),public.hospedagem_v3_confirmar_checkout_hotel(uuid,text) to service_role;
grant execute on function public.hospedagem_v3_enfileirar_nfse(uuid) to service_role;

-- Atualiza a view cadastral usada como fallback pelo frontend.
create or replace view public.colaboradores_atuais with (security_invoker=true) as
select id,nome,regexp_replace(coalesce(cpf,''),'\D','','g') cpf,tipo,cargo,supervisao,coordenacao,empresa,situacao,
  situacao='Ativo' ativo,current_date data_referencia,whatsapp,email_pessoal,email_empresa,endereco,bairro,cidade,estado,cep,
  admissao,desligamento,complemento,data_nascimento,sexo
from public.colaboradores;
