-- Hospedagem v3 (Fase 3): fecha o ciclo pagamento -> NFS-e -> GRM com o Financeiro.
--  1) parcela paga pela Hospedagem atualiza o pedido de pagamento do Financeiro; pagamento feito pelo Financeiro vira parcela
--  2) NFS-e do hotel: o webhook (service_role) agora consegue enfileirar; contexto vai para o agente de lançamento
--  3) retorno do GRM (lançada / erro) volta para o documento, para o nf_status do Financeiro e para o ADM (notificação)
--  4) alerta "hotel não emite NF" também vale para os pagamentos v3
--  5) baixa do comprovante no GRM: pronta, mas DESLIGADA (hospedagem_automacoes.baixa_comprovante) até a primeira NFS-e real
-- Modelo: Frotas (20261016220000_frotas_manutencao_nf_financeiro.sql).

-- ============================================================
-- 0. Colunas e chave de liga/desliga
-- ============================================================
alter table public.hospedagem_pagamento_documentos
  add column if not exists grm_status text,
  add column if not exists grm_codigo text,
  add column if not exists grm_erro text;

-- Caminho do comprovante no bucket hospedagem-documentos (a URL assinada vence em 7 dias; o caminho não).
alter table public.hospedagem_pagamento_parcelas
  add column if not exists comprovante_path text;

update public.hospedagem_pagamento_parcelas
   set comprovante_path = substring(comprovante_url from '/hospedagem-documentos/([^?]+)')
 where comprovante_path is null and comprovante_url like '%/hospedagem-documentos/%';

create table if not exists public.hospedagem_automacoes (
  chave text primary key,
  ativo boolean not null default false,
  descricao text,
  atualizado_em timestamptz not null default now()
);
insert into public.hospedagem_automacoes(chave, ativo, descricao)
values ('baixa_comprovante', false, 'Quando a NFS-e da parcela é lançada no GRM, coloca o comprovante da parcela na fila de baixas (grm_nf_baixas). Ligar só depois de acompanhar a primeira NFS-e real.')
on conflict (chave) do nothing;
alter table public.hospedagem_automacoes enable row level security;
drop policy if exists hosp_automacoes_leitura on public.hospedagem_automacoes;
create policy hosp_automacoes_leitura on public.hospedagem_automacoes for select to authenticated
  using (public.hospedagem_pode_operar(false) or public.hospedagem_pode_financeiro(false));
revoke all on public.hospedagem_automacoes from anon;
grant select on public.hospedagem_automacoes to authenticated;

-- ============================================================
-- 1. Parcela de pagamento: ADM -> Financeiro e Financeiro -> parcela
-- ============================================================
create or replace function private.hospedagem_v3_texto_brl(p_valor numeric)
returns text language sql immutable as $$
  select 'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',');
$$;
revoke all on function private.hospedagem_v3_texto_brl(numeric) from public, anon, authenticated;

-- Situação da NF no pedido de pagamento do Financeiro: LANCADA só quando o pagamento está PAGO e toda parcela tem NFS-e lançada.
create or replace function private.hospedagem_v3_recalcular_nf_financeiro(p_pagamento_id uuid)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_pag record;v_parcelas integer;v_lancadas integer;v_com_nf integer;v_novo text;v_numeros text;
begin
  select id,status,financeiro_pagamento_id into v_pag from public.hospedagem_pagamentos_v3 where id=p_pagamento_id;
  if not found or v_pag.financeiro_pagamento_id is null then return; end if;
  select count(*),
    count(*) filter (where exists(select 1 from public.hospedagem_pagamento_documentos d where d.parcela_id=pa.id and d.grm_status='LANCADO')),
    count(*) filter (where exists(select 1 from public.hospedagem_pagamento_documentos d where d.parcela_id=pa.id and d.grm_nf_lancamento_id is not null))
  into v_parcelas,v_lancadas,v_com_nf from public.hospedagem_pagamento_parcelas pa where pa.pagamento_id=p_pagamento_id;
  v_novo:=case when v_pag.status='PAGO' and v_parcelas>0 and v_lancadas=v_parcelas then 'LANCADA' when v_com_nf>0 then 'NF_RECEBIDA' else null end;
  if v_novo is null then return; end if;
  select string_agg(distinct d.numero_nfse,', ') into v_numeros
  from public.hospedagem_pagamento_documentos d join public.hospedagem_pagamento_parcelas pa on pa.id=d.parcela_id
  where pa.pagamento_id=p_pagamento_id and d.numero_nfse is not null;
  update public.financeiro_pagamentos set nf_status=v_novo,nf_numero=coalesce(nullif(v_numeros,''),nf_numero)
   where id=v_pag.financeiro_pagamento_id and nf_status<>'DISPENSADA' and (nf_status is distinct from v_novo or nf_numero is distinct from coalesce(nullif(v_numeros,''),nf_numero));
end $$;
revoke all on function private.hospedagem_v3_recalcular_nf_financeiro(uuid) from public, anon, authenticated;

-- Núcleo do registro de parcela (sem checagem de permissão: quem chama já decidiu). A flag app.hospedagem_sync evita o laço
-- parcela -> Financeiro -> parcela.
create or replace function private.hospedagem_v3_registrar_parcela_interno(
  p_pagamento_id uuid,p_valor numeric,p_data date,p_comprovante_url text,p_setor text,p_usuario uuid
) returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_pag record;v_res record;v_id uuid;v_novo_pago numeric;v_quitado boolean;v_path text;v_nota text;
begin
  if coalesce(p_valor,0)<=0 or nullif(btrim(p_comprovante_url),'') is null then raise exception 'Informe valor e comprovante'; end if;
  select * into v_pag from public.hospedagem_pagamentos_v3 where id=p_pagamento_id for update;
  if not found or v_pag.status='CANCELADO' then raise exception 'Pagamento invalido'; end if;
  if p_valor>v_pag.saldo then raise exception 'Valor superior ao saldo'; end if;
  v_path:=substring(p_comprovante_url from '/hospedagem-documentos/([^?]+)');
  insert into public.hospedagem_pagamento_parcelas(pagamento_id,valor,data_pagamento,comprovante_url,comprovante_path,pago_por,pago_por_setor,proxima_cobranca_nfse_em)
  values(p_pagamento_id,p_valor,p_data,p_comprovante_url,v_path,p_usuario,upper(p_setor),now()+interval '2 days') returning id into v_id;
  v_novo_pago:=v_pag.valor_pago+p_valor;
  v_quitado:=v_novo_pago>=v_pag.valor_total;
  update public.hospedagem_pagamentos_v3 set valor_pago=v_novo_pago,status=case when v_quitado then 'PAGO' else 'PARCIAL' end,origem_pagamento=upper(p_setor),updated_at=now() where id=p_pagamento_id;

  -- Pedido de pagamento do Financeiro (se o ADM enviou): fica PAGO quando quitado; parcial só ganha a observação, para não pagarem de novo.
  if v_pag.financeiro_pagamento_id is not null and coalesce(current_setting('app.hospedagem_sync',true),'')<>'1' then
    v_nota:=case when v_quitado then null else 'Pago parcialmente pela Hospedagem: '||private.hospedagem_v3_texto_brl(v_novo_pago)||' de '||private.hospedagem_v3_texto_brl(v_pag.valor_total)||' (saldo '||private.hospedagem_v3_texto_brl(v_pag.valor_total-v_novo_pago)||')' end;
    perform set_config('app.hospedagem_sync','1',true);
    update public.financeiro_pagamentos set
      status=case when v_quitado then 'PAGO' else status end,
      pago_em=case when v_quitado then coalesce(pago_em,now()) else pago_em end,
      data_pagamento=case when v_quitado then p_data else data_pagamento end,
      comprovante_url=p_comprovante_url,
      atualizado_por=coalesce(p_usuario,atualizado_por),
      observacoes=case when v_quitado then nullif(btrim(regexp_replace(coalesce(observacoes,''),'(^|\n)Pago parcialmente pela Hospedagem:[^\n]*','','g'),E'\n'),'')
                       else concat_ws(E'\n',nullif(btrim(regexp_replace(coalesce(observacoes,''),'(^|\n)Pago parcialmente pela Hospedagem:[^\n]*','','g'),E'\n'),''),v_nota) end
     where id=v_pag.financeiro_pagamento_id and status not in ('PAGO','CANCELADO','RECUSADO');
    perform set_config('app.hospedagem_sync','0',true);
  end if;

  select r.*,h.whatsapp,h.nome hotel_nome into v_res from public.hospedagem_reservas r join public.hospedagem_hoteis h on h.id=r.hotel_id where r.id=v_pag.reserva_id;
  perform private.hospedagem_v3_enqueue('COMPROVANTE_E_PEDIDO_NFSE','HOTEL','comprovante:'||v_id,jsonb_build_object('parcela_id',v_id,'valor',p_valor,'comprovante_url',p_comprovante_url,'codigo',v_res.codigo_operacional),v_res.solicitacao_id,v_res.id,v_res.hotel_id,null,v_res.whatsapp,v_res.hotel_nome,now());
  perform private.hospedagem_v3_recalcular_nf_financeiro(p_pagamento_id);
  return v_id;
exception when others then
  perform set_config('app.hospedagem_sync','0',true);
  raise;
end $$;
revoke all on function private.hospedagem_v3_registrar_parcela_interno(uuid,numeric,date,text,text,uuid) from public, anon, authenticated;

create or replace function public.hospedagem_v3_registrar_parcela(
  p_pagamento_id uuid,p_valor numeric,p_data date,p_comprovante_url text,p_setor text
) returns uuid language plpgsql security definer set search_path='public','private' as $$
begin
  if not (public.hospedagem_pode_operar(true) or public.hospedagem_pode_financeiro(true)) then raise exception 'Sem permissao' using errcode='42501'; end if;
  return private.hospedagem_v3_registrar_parcela_interno(p_pagamento_id,p_valor,p_data,p_comprovante_url,p_setor,(select auth.uid()));
end $$;

-- O Financeiro marcou o pedido como PAGO (com comprovante): vira parcela, e o hotel recebe o comprovante e o pedido da NFS-e.
create or replace function public.sincronizar_pagamento_hospedagem()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pag record;
begin
  if coalesce(current_setting('app.hospedagem_sync',true),'')='1' then return new; end if;
  select * into v_pag from public.hospedagem_pagamentos_v3 where id=new.origem_id and financeiro_pagamento_id=new.id;
  if not found or v_pag.status='CANCELADO' or v_pag.saldo<=0 then return new; end if;
  if nullif(btrim(coalesce(new.comprovante_url,'')),'') is null then return new; end if;
  perform set_config('app.hospedagem_sync','1',true);
  perform private.hospedagem_v3_registrar_parcela_interno(v_pag.id,least(new.valor,v_pag.saldo),
    coalesce(new.data_pagamento,(new.pago_em at time zone 'America/Sao_Paulo')::date,current_date),new.comprovante_url,'FINANCEIRO',auth.uid());
  -- A observação "pago parcialmente" deixa de valer: o Financeiro quitou o saldo.
  update public.financeiro_pagamentos
     set observacoes=nullif(btrim(regexp_replace(coalesce(observacoes,''),'(^|
)Pago parcialmente pela Hospedagem:[^
]*','','g'),E'
'),'')
   where id=new.id and observacoes like '%Pago parcialmente pela Hospedagem:%';
  perform set_config('app.hospedagem_sync','0',true);
  return new;
exception when others then
  perform set_config('app.hospedagem_sync','0',true);
  raise warning 'sincronizar_pagamento_hospedagem: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_sincronizar_pagamento_hospedagem on public.financeiro_pagamentos;
create trigger trg_sincronizar_pagamento_hospedagem
  after update on public.financeiro_pagamentos
  for each row
  when (new.origem_tabela = 'hospedagem_pagamentos_v3' and new.status = 'PAGO'
        and (old.status is distinct from new.status or old.comprovante_url is distinct from new.comprovante_url))
  execute function public.sincronizar_pagamento_hospedagem();

-- Despesa extra aumenta o total do pagamento: o pedido ainda aberto no Financeiro acompanha o valor.
create or replace function public.sincronizar_valor_pagamento_hospedagem()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.financeiro_pagamentos set valor=new.valor_total
   where id=new.financeiro_pagamento_id and status in ('PENDENTE','EM_ANALISE','APROVADO','AGENDADO');
  return new;
end $$;

drop trigger if exists trg_sincronizar_valor_pagamento_hospedagem on public.hospedagem_pagamentos_v3;
create trigger trg_sincronizar_valor_pagamento_hospedagem
  after update of valor_total on public.hospedagem_pagamentos_v3
  for each row
  when (new.financeiro_pagamento_id is not null and old.valor_total is distinct from new.valor_total)
  execute function public.sincronizar_valor_pagamento_hospedagem();

-- ============================================================
-- 2. NFS-e do hotel -> fila do agente de lançamento
-- ============================================================
-- Antes: só operador/financeiro logado podia chamar, e o webhook do WhatsApp (service_role, sem usuário) caía em "Sem permissao".
-- A categoria vai em ajustes_manuais (como Frotas); o job do agente é criado pelo gatilho grm_nf_lancamentos_enfileirar_job.
create or replace function public.hospedagem_v3_enfileirar_nfse(p_documento_id uuid)
returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_doc record;v_id uuid;v_pagamento uuid;
begin
  if not (coalesce((select auth.role()),'')='service_role' or public.hospedagem_pode_operar(true) or public.hospedagem_pode_financeiro(true)) then raise exception 'Sem permissao' using errcode='42501'; end if;
  select d.*,p.comprovante_url,p.valor valor_pago,p.pagamento_id into v_doc from public.hospedagem_pagamento_documentos d join public.hospedagem_pagamento_parcelas p on p.id=d.parcela_id where d.id=p_documento_id for update of d;
  if not found or v_doc.status_validacao<>'VALIDO' then raise exception 'NFS-e ainda nao validada'; end if;
  if v_doc.grm_nf_lancamento_id is not null then return v_doc.grm_nf_lancamento_id; end if;
  if v_doc.storage_bucket is null or v_doc.storage_path is null then raise exception 'Documento fora do Storage'; end if;
  if not exists(select 1 from public.hospedagem_pagamento_documentos where parcela_id=v_doc.parcela_id and tipo='NFSE_PDF' and status_validacao='VALIDO')
     or not exists(select 1 from public.hospedagem_pagamento_documentos where parcela_id=v_doc.parcela_id and tipo='NFSE_XML' and status_validacao='VALIDO') then raise exception 'Anexe PDF e XML validos da NFS-e'; end if;
  insert into public.grm_nf_lancamentos(storage_bucket,storage_path,arquivo_nome,arquivo_mime_type,setor,enviado_por,status,fornecedor_cnpj,numero_documento,data_emissao,valor_total,ajustes_manuais,extraido_json)
  values(v_doc.storage_bucket,v_doc.storage_path,split_part(v_doc.storage_path,'/',array_length(string_to_array(v_doc.storage_path,'/'),1)),v_doc.mime_type,'HOSPEDAGEM',(select auth.uid()),'NOVO',v_doc.emitente_cnpj,v_doc.numero_nfse,current_date,v_doc.valor_nfse,
    jsonb_build_object('grupo_categoria','DESPESAS OPERACIONAIS','categoria','HOSPEDAGEM'),
    jsonb_build_object('origem','HOSPEDAGEM','documento_id',v_doc.id,'parcela_id',v_doc.parcela_id))
  on conflict(storage_path) do update set updated_at=now() returning id into v_id;
  update public.hospedagem_pagamento_documentos set grm_nf_lancamento_id=v_id where id=p_documento_id;
  perform private.hospedagem_v3_recalcular_nf_financeiro(v_doc.pagamento_id);
  return v_id;
end $$;

-- ============================================================
-- 3. Retorno do GRM: documento, Financeiro e aviso ao ADM
-- ============================================================
create or replace function private.hospedagem_v3_enfileirar_baixa(p_nf_lancamento_id uuid)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_par record;v_nome text;v_mime text;
begin
  if not coalesce((select ativo from public.hospedagem_automacoes where chave='baixa_comprovante'),false) then return; end if;
  for v_par in select pa.* from public.hospedagem_pagamento_documentos d join public.hospedagem_pagamento_parcelas pa on pa.id=d.parcela_id where d.grm_nf_lancamento_id=p_nf_lancamento_id loop
    if v_par.comprovante_path is null then continue; end if;
    v_nome:=regexp_replace(v_par.comprovante_path,'^.*/','');
    v_mime:=case lower(coalesce(substring(v_nome from '\.([A-Za-z0-9]+)$'),'')) when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' else null end;
    insert into public.grm_nf_baixas(storage_bucket,storage_path,arquivo_nome,arquivo_mime_type,status,valor,data_pagamento,extraido_json)
    values('hospedagem-documentos',v_par.comprovante_path,v_nome,v_mime,'NOVO',v_par.valor,v_par.data_pagamento,
      jsonb_build_object('origem','HOSPEDAGEM','parcela_id',v_par.id,'grm_nf_lancamento_id',p_nf_lancamento_id))
    on conflict (storage_path) do nothing;
  end loop;
end $$;
revoke all on function private.hospedagem_v3_enfileirar_baixa(uuid) from public, anon, authenticated;

create or replace function public.sincronizar_nf_hospedagem()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_doc record;
begin
  select d.id doc_id,d.numero_nfse,pa.pagamento_id,r.codigo_operacional,r.nome_hotel into v_doc
  from public.hospedagem_pagamento_documentos d
  join public.hospedagem_pagamento_parcelas pa on pa.id=d.parcela_id
  join public.hospedagem_pagamentos_v3 pv on pv.id=pa.pagamento_id
  join public.hospedagem_reservas r on r.id=pv.reserva_id
  where d.grm_nf_lancamento_id=new.id order by d.created_at limit 1;
  if not found then return new; end if;

  update public.hospedagem_pagamento_documentos
     set grm_status=new.status,grm_codigo=new.grm_codigo,grm_erro=nullif(left(coalesce(new.erro,''),400),'')
   where grm_nf_lancamento_id=new.id;
  perform private.hospedagem_v3_recalcular_nf_financeiro(v_doc.pagamento_id);

  if new.status='LANCADO' then
    insert into public.painel_notificacoes(tipo,titulo,descricao,prioridade,icone,modulo_url,destinatario_modulo,referencia_tabela,referencia_id,chave_dedup)
    values('hospedagem_nf','NFS-e do hotel lançada no GRM — '||coalesce(v_doc.codigo_operacional,''),concat_ws(' | ',v_doc.nome_hotel,'NFS-e '||v_doc.numero_nfse,'GRM '||new.grm_codigo),'normal','check-circle','adm-hotel','HOSPEDAGEM','hospedagem_pagamento_documentos',v_doc.doc_id::text,'hosp-nf:'||new.id::text||':LANCADO')
    on conflict(chave_dedup) do nothing;
    perform private.hospedagem_v3_enfileirar_baixa(new.id);
  elsif new.status in ('ERRO','AGUARDANDO_DADOS','AGUARDANDO_CLASSIFICACAO','DUPLICADO') then
    insert into public.painel_notificacoes(tipo,titulo,descricao,prioridade,icone,modulo_url,destinatario_modulo,referencia_tabela,referencia_id,chave_dedup)
    values('hospedagem_nf','NFS-e do hotel precisa de atenção — '||coalesce(v_doc.codigo_operacional,''),concat_ws(' | ',v_doc.nome_hotel,'NFS-e '||v_doc.numero_nfse,new.status,left(coalesce(new.erro,''),180),'Complete em Financeiro > Notas fiscais'),'urgente','hotel-alert','adm-hotel','HOSPEDAGEM','hospedagem_pagamento_documentos',v_doc.doc_id::text,'hosp-nf:'||new.id::text||':'||new.status)
    on conflict(chave_dedup) do nothing;
  end if;
  return new;
exception when others then
  raise warning 'sincronizar_nf_hospedagem: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_sincronizar_nf_hospedagem on public.grm_nf_lancamentos;
create trigger trg_sincronizar_nf_hospedagem
  after update of status on public.grm_nf_lancamentos
  for each row
  when (new.setor = 'HOSPEDAGEM' and old.status is distinct from new.status)
  execute function public.sincronizar_nf_hospedagem();

-- ============================================================
-- 4. Alerta "HOTEL NÃO EMITE NOTA FISCAL" também nos pagamentos v3
-- ============================================================
create or replace function public.hospedagem_aplicar_alerta_nf_financeiro()
returns trigger language plpgsql set search_path = public as $$
declare
  v_emite_nota boolean;
  v_alerta constant text := '⚠ HOTEL NÃO EMITE NOTA FISCAL';
begin
  if upper(coalesce(new.origem_setor, '')) <> 'HOSPEDAGEM'
     or upper(coalesce(new.origem_tabela, '')) not in ('HOSPEDAGEM_RESERVAS', 'HOSPEDAGEM_PAGAMENTOS_V3')
     or new.origem_id is null then
    return new;
  end if;

  select coalesce(h.emite_nota_fiscal, true) into v_emite_nota
  from (
    select r.hotel_id from public.hospedagem_reservas r
     where upper(new.origem_tabela) = 'HOSPEDAGEM_RESERVAS' and r.id = new.origem_id
    union all
    select r.hotel_id from public.hospedagem_pagamentos_v3 pv join public.hospedagem_reservas r on r.id = pv.reserva_id
     where upper(new.origem_tabela) = 'HOSPEDAGEM_PAGAMENTOS_V3' and pv.id = new.origem_id
  ) x
  left join public.hospedagem_hoteis h on h.id = x.hotel_id
  limit 1;

  if coalesce(v_emite_nota, true) = false then
    if coalesce(new.descricao, '') !~ '^⚠' then
      new.descricao := '⚠ ' || coalesce(new.descricao, 'Hospedagem');
    end if;
    if position(v_alerta in coalesce(new.observacoes, '')) = 0 then
      new.observacoes := concat_ws(E'\n', v_alerta, nullif(new.observacoes, ''));
    end if;
  else
    new.descricao := nullif(regexp_replace(coalesce(new.descricao, ''), '^⚠\s*', ''), '');
    new.observacoes := nullif(trim(both E'\n' from replace(coalesce(new.observacoes, ''), v_alerta, '')), '');
  end if;
  return new;
end $$;

create or replace function public.hospedagem_sincronizar_alerta_nf_existente()
returns trigger language plpgsql set search_path = public as $$
declare
  v_alerta constant text := '⚠ HOTEL NÃO EMITE NOTA FISCAL';
begin
  if new.emite_nota_fiscal = false then
    update public.financeiro_pagamentos fp
       set descricao = case when coalesce(fp.descricao, '') ~ '^⚠' then fp.descricao else '⚠ ' || coalesce(fp.descricao, 'Hospedagem') end,
           observacoes = case when position(v_alerta in coalesce(fp.observacoes, '')) > 0 then fp.observacoes else concat_ws(E'\n', v_alerta, nullif(fp.observacoes, '')) end
     where upper(coalesce(fp.origem_setor, '')) = 'HOSPEDAGEM'
       and ((upper(coalesce(fp.origem_tabela, '')) = 'HOSPEDAGEM_RESERVAS' and fp.origem_id in (select r.id from public.hospedagem_reservas r where r.hotel_id = new.id))
         or (upper(coalesce(fp.origem_tabela, '')) = 'HOSPEDAGEM_PAGAMENTOS_V3' and fp.origem_id in (select pv.id from public.hospedagem_pagamentos_v3 pv join public.hospedagem_reservas r on r.id = pv.reserva_id where r.hotel_id = new.id)));
  else
    update public.financeiro_pagamentos fp
       set descricao = nullif(regexp_replace(coalesce(fp.descricao, ''), '^⚠\s*', ''), ''),
           observacoes = nullif(trim(both E'\n' from replace(coalesce(fp.observacoes, ''), v_alerta, '')), '')
     where upper(coalesce(fp.origem_setor, '')) = 'HOSPEDAGEM'
       and ((upper(coalesce(fp.origem_tabela, '')) = 'HOSPEDAGEM_RESERVAS' and fp.origem_id in (select r.id from public.hospedagem_reservas r where r.hotel_id = new.id))
         or (upper(coalesce(fp.origem_tabela, '')) = 'HOSPEDAGEM_PAGAMENTOS_V3' and fp.origem_id in (select pv.id from public.hospedagem_pagamentos_v3 pv join public.hospedagem_reservas r on r.id = pv.reserva_id where r.hotel_id = new.id)));
  end if;
  return new;
end $$;
