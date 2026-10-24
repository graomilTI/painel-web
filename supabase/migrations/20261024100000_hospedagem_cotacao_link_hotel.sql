-- Hospedagem v3: cotação por link para o hotel (mesmo desenho da cotação de Compras por link).
-- O ADM gera um link por hotel e envia pelo WhatsApp; o hotel responde na página pública
-- (Edge Function hospedagem-cotacao-publica, service role) e o ADM compara e reserva com a cotação escolhida.
-- Acesso anônimo: nenhum direto às tabelas; o token (64 hex) é a credencial e vive só na Edge Function.

alter table public.hospedagem_cotacoes
  add column if not exists token text,
  add column if not exists expira_em timestamptz,
  add column if not exists link_status text not null default 'aberta',
  add column if not exists precos_quartos jsonb not null default '{}'::jsonb,
  add column if not exists atendente_nome text,
  add column if not exists atendente_telefone text,
  add column if not exists quartos_necessarios jsonb not null default '[]'::jsonb,
  add column if not exists checkin_previsto date,
  add column if not exists checkout_previsto date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hospedagem_cotacoes_link_status_check') then
    alter table public.hospedagem_cotacoes
      add constraint hospedagem_cotacoes_link_status_check check (link_status in ('aberta','encerrada'));
  end if;
end $$;

create unique index if not exists hospedagem_cotacoes_token_uidx
  on public.hospedagem_cotacoes(token) where token is not null;

comment on column public.hospedagem_cotacoes.token is 'Credencial do link público de cotação (64 hex). Nulo nas cotações antigas (resposta por WhatsApp).';
comment on column public.hospedagem_cotacoes.precos_quartos is 'Diária por quarto e por tipo respondida pelo hotel: {"DUPLO":180,"INDIVIDUAL":null}. null = o hotel não tem o tipo.';
comment on column public.hospedagem_cotacoes.quartos_necessarios is 'Composição pedida: [{tipo_quarto,genero,capacidade,quantidade}], calculada pelo painel ao gerar o link.';

-- Gera uma cotação (e um link) por hotel para os colaboradores escolhidos. Não envia mais nada pelo WhatsApp:
-- o ADM copia a mensagem com o link e manda ao hotel. Devolve os tokens para o painel montar a mensagem.
drop function if exists public.hospedagem_v3_iniciar_cotacao(uuid,jsonb,jsonb);
create or replace function public.hospedagem_v3_iniciar_cotacao(
  p_solicitacao_id uuid,p_item_ids jsonb,p_hotel_ids jsonb,p_quartos jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path='public','private' as $$
declare
  h jsonb;v_hotel record;v_cotacao_id uuid;v_token text;v_expira timestamptz:=now()+interval '7 days';
  v_links jsonb:='[]'::jsonb;v_pessoas integer;v_checkin date;v_checkout date;
  v_masc integer;v_fem integer;v_cap_masc integer;v_cap_fem integer;v_qtd_quartos integer;v_composicao text;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao para cotar' using errcode='42501'; end if;
  if jsonb_array_length(coalesce(p_item_ids,'[]'::jsonb))=0 or jsonb_array_length(coalesce(p_hotel_ids,'[]'::jsonb))=0 then raise exception 'Selecione colaboradores e hoteis'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_item_ids) as x(value)
    left join public.hospedagem_solicitacao_colaboradores i on i.id=x.value::uuid
    where i.id is null or i.solicitacao_id<>p_solicitacao_id or i.status_item not in ('AGUARDANDO','EM_COTACAO') or i.sexo not in ('MASCULINO','FEMININO')
  ) then raise exception 'Selecao de colaboradores invalida ou sem sexo informado'; end if;

  select count(*),min(i.data_checkin_prevista),max(i.data_checkout_prevista),
    count(*) filter (where i.sexo='MASCULINO'),count(*) filter (where i.sexo='FEMININO')
  into v_pessoas,v_checkin,v_checkout,v_masc,v_fem
  from public.hospedagem_solicitacao_colaboradores i where i.id in (select value::uuid from jsonb_array_elements_text(p_item_ids));
  if v_checkin is null or v_checkout is null or v_checkout<=v_checkin then raise exception 'Periodo da hospedagem invalido'; end if;

  if jsonb_typeof(coalesce(p_quartos,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_quartos,'[]'::jsonb))=0 then raise exception 'Informe a composicao dos quartos'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_quartos) as q(tipo_quarto text,genero text,capacidade integer,quantidade integer)
    where q.tipo_quarto not in ('INDIVIDUAL','DUPLO','TRIPLO','QUADRUPLO') or q.genero not in ('MASC','FEM')
      or coalesce(q.capacidade,0) not between 1 and 4 or coalesce(q.quantidade,0)<1
  ) then raise exception 'Composicao de quartos invalida'; end if;
  select coalesce(sum(q.capacidade*q.quantidade) filter (where q.genero='MASC'),0),
    coalesce(sum(q.capacidade*q.quantidade) filter (where q.genero='FEM'),0),
    coalesce(sum(q.quantidade),0),
    string_agg(q.quantidade||'x '||q.tipo_quarto||' '||q.genero,' + ' order by q.genero,q.capacidade)
  into v_cap_masc,v_cap_fem,v_qtd_quartos,v_composicao
  from jsonb_to_recordset(p_quartos) as q(tipo_quarto text,genero text,capacidade integer,quantidade integer);
  if v_cap_masc<>v_masc or v_cap_fem<>v_fem then raise exception 'A composicao dos quartos nao confere com os colaboradores selecionados'; end if;

  for h in select value from jsonb_array_elements(p_hotel_ids) loop
    select id,nome,whatsapp into v_hotel from public.hospedagem_hoteis where id=(h#>>'{}')::uuid and status<>'INATIVO';
    if not found then raise exception 'Hotel invalido'; end if;
    v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into public.hospedagem_cotacoes(solicitacao_id,hotel_id,hotel_nome,status,mensagem_enviada,criado_por,token,expira_em,link_status,
      quartos_necessarios,checkin_previsto,checkout_previsto,diarias_previstas,quantidade_pessoas,quantidade_quartos,composicao_quartos)
    values(p_solicitacao_id,v_hotel.id,v_hotel.nome,'PENDENTE','Cotacao por link Hospedagem v3',(select auth.uid()),v_token,v_expira,'aberta',
      p_quartos,v_checkin,v_checkout,(v_checkout-v_checkin),v_pessoas,v_qtd_quartos,v_composicao)
    returning id into v_cotacao_id;
    insert into public.hospedagem_cotacao_colaboradores(cotacao_id,solicitacao_colaborador_id)
      select v_cotacao_id,value::uuid from jsonb_array_elements_text(p_item_ids);
    v_links:=v_links||jsonb_build_array(jsonb_build_object('cotacao_id',v_cotacao_id,'hotel_id',v_hotel.id,'hotel_nome',v_hotel.nome,
      'whatsapp',v_hotel.whatsapp,'token',v_token,'expira_em',v_expira));
  end loop;
  update public.hospedagem_solicitacao_colaboradores set status_item='EM_COTACAO',updated_at=now()
    where id in(select value::uuid from jsonb_array_elements_text(p_item_ids));
  perform private.hospedagem_v3_recalcular_solicitacao(p_solicitacao_id);
  return jsonb_build_object('cotacoes',jsonb_array_length(v_links),'links',v_links);
end $$;
revoke all on function public.hospedagem_v3_iniciar_cotacao(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.hospedagem_v3_iniciar_cotacao(uuid,jsonb,jsonb,jsonb) to authenticated;

-- Reserva a partir de uma cotação: a cotação precisa ser do mesmo hotel e da mesma solicitação.
CREATE OR REPLACE FUNCTION public.hospedagem_v3_solicitar_reserva(p_solicitacao_id uuid, p_hotel_id uuid, p_item_ids jsonb, p_valor_diaria numeric, p_quartos jsonb DEFAULT '[]'::jsonb, p_cotacao_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
  if p_cotacao_id is not null and not exists (select 1 from public.hospedagem_cotacoes c where c.id=p_cotacao_id and c.solicitacao_id=p_solicitacao_id and c.hotel_id=p_hotel_id) then raise exception 'Cotacao nao pertence a este hotel e a esta solicitacao'; end if;
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
end $function$;

-- Quem confirma sem ser o webhook do WhatsApp é o ADM: a origem fica registrada.
CREATE OR REPLACE FUNCTION public.hospedagem_v3_confirmar_reserva_pedido(p_pedido_id uuid, p_resposta text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
  values(v_pedido.solicitacao_id,v_pedido.hotel_id,v_pedido.hotel_nome,v_pedido.cidade,v_pedido.uf,v_pedido.valor_diaria,(v_fim-v_inicio),greatest(coalesce((select sum(coalesce((q->>'quantidade')::integer,1)) from jsonb_array_elements(v_pedido.quartos) q),0),1),v_total,v_inicio,v_fim,v_hora,'CHECKIN_PREVISTO',v_pedido.solicitado_por,v_codigo->>'codigo',(v_codigo->>'ano')::integer,now(),case when (select auth.role())='service_role' then 'WHATSAPP' else 'ADM' end,3)
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
end $function$;

-- O ADM registra que o hotel recusou o pedido de reserva (o webhook fazia isso com UPDATEs soltos).
create or replace function public.hospedagem_v3_recusar_reserva_pedido(p_pedido_id uuid,p_resposta text default null)
returns void language plpgsql security definer set search_path='public','private' as $$
declare v_pedido record;
begin
  if not public.hospedagem_pode_operar(true) then raise exception 'Sem permissao' using errcode='42501'; end if;
  select * into v_pedido from public.hospedagem_reserva_pedidos where id=p_pedido_id for update;
  if not found then raise exception 'Pedido de reserva nao encontrado'; end if;
  if v_pedido.status<>'AGUARDANDO_HOTEL' then raise exception 'Pedido nao esta aguardando o hotel'; end if;
  update public.hospedagem_reserva_pedidos set status='RECUSADO',respondido_em=now(),resposta_texto=nullif(btrim(p_resposta),''),updated_at=now() where id=p_pedido_id;
  update public.hospedagem_solicitacao_colaboradores set status_item='EM_COTACAO',updated_at=now()
    where status_item='AGUARDANDO_HOTEL'
      and id in (select solicitacao_colaborador_id from public.hospedagem_reserva_pedido_colaboradores where pedido_id=p_pedido_id);
  perform private.hospedagem_v3_recalcular_solicitacao(v_pedido.solicitacao_id);
end $$;
revoke all on function public.hospedagem_v3_recusar_reserva_pedido(uuid,text) from public,anon;
grant execute on function public.hospedagem_v3_recusar_reserva_pedido(uuid,text) to authenticated;
