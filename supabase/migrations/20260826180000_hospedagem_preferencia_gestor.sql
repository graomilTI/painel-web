-- Reabertura da tela de autoatendimento "Hospedagem" do Gestor (menu GESTOR > Hospedagem,
-- removida em 25/08 no commit "Zera o módulo de Hotel"). Ver [[painel-web-hospedagem-gestor-sumiu]].
--
-- 1) Preferência do gestor (Hotel/Alojamento/Sem preferência) — campo estruturado, não existia.
--    Acrescentada só no FINAL das duas views (CREATE OR REPLACE VIEW não permite remover/
--    reordenar colunas existentes), junto com observacao_gestor (nunca exposta ao admin).
-- 2) Corrige um gap real de RLS que impediria QUALQUER gestor comum de concluir
--    hospedagem_criar_solicitacao(): o INSERT final em hospedagem_eventos só tinha a
--    policy "hospedagem_eventos_write_hotel" (ALL, hospedagem_pode_operar(true) — exige
--    can_edit/can_create/can_approve, que módulos atribuídos direto ao usuário via
--    app_usuario_modulos NUNCA têm, só can_view). Sem policy de dono, o evento
--    'SOLICITACAO_CRIADA' falhava e a função inteira dava rollback pra qualquer gestor
--    sem o módulo administrativo de Hotéis. Mesmo padrão de dono já usado em
--    hospedagem_colaboradores_write_authorized.

alter table public.hospedagem_solicitacoes
  add column if not exists preferencia_hospedagem text,
  add constraint hospedagem_solicitacoes_preferencia_check
    check (preferencia_hospedagem is null or preferencia_hospedagem in ('HOTEL', 'ALOJAMENTO', 'SEM_PREFERENCIA'));

create or replace view public.hospedagem_painel_geral as
 SELECT s.id AS solicitacao_id,
    s.codigo,
    s.created_at AS data_solicitacao,
    s.solicitante_id,
    s.solicitante_nome,
    s.empresa,
    s.coordenacao,
    s.supervisao,
    s.regional,
    COALESCE(NULLIF(TRIM(BOTH FROM r.cidade_hotel), ''::text), s.cidade) AS cidade,
    COALESCE(NULLIF(TRIM(BOTH FROM r.uf_hotel), ''::text), s.uf) AS uf,
    s.cliente,
    s.local_embarque,
    s.link_local_embarque,
    s.data_checkin_prevista,
    s.data_checkout_prevista,
    s.horario_chegada_previsto,
    s.quantidade_diarias_prevista,
    s.saldo_informado,
    s.status_solicitacao,
    r.id AS reserva_id,
    r.hotel_id,
    COALESCE(r.nome_hotel, h.nome) AS hotel,
    r.valor_diaria,
    r.quantidade_diarias,
    r.quantidade_quartos,
    r.valor_total_previsto,
    r.valor_total_final,
    r.data_checkin,
    r.data_checkout,
    r.status_hospedagem,
    f.id AS financeiro_id,
    f.valor_total AS valor_financeiro,
    f.status_financeiro,
    f.data_vencimento,
    f.data_pagamento,
    f.comprovante_pagamento_url,
    n.id AS nota_id,
    n.tipo_nota,
    n.numero_nf,
    n.valor_nf,
    n.status_nota,
    n.nota_url,
    n.xml_url,
    ( SELECT string_agg(c.nome_colaborador, ', '::text ORDER BY c.nome_colaborador) AS string_agg
           FROM hospedagem_solicitacao_colaboradores c
          WHERE c.solicitacao_id = s.id) AS colaboradores,
    ( SELECT count(*) AS count
           FROM hospedagem_solicitacao_colaboradores c
          WHERE c.solicitacao_id = s.id) AS total_colaboradores,
        CASE
            WHEN r.data_checkout = CURRENT_DATE AND (r.status_hospedagem <> ALL (ARRAY['CHECKOUT_REALIZADO'::text, 'CANCELADA'::text])) THEN true
            ELSE false
        END AS checkout_hoje,
        CASE
            WHEN r.data_checkout < CURRENT_DATE AND (r.status_hospedagem <> ALL (ARRAY['CHECKOUT_REALIZADO'::text, 'CANCELADA'::text])) THEN true
            ELSE false
        END AS checkout_vencido,
        CASE
            WHEN f.status_financeiro = ANY (ARRAY['AGUARDANDO_PAGAMENTO'::text, 'ENVIADO_AO_FINANCEIRO'::text]) THEN true
            ELSE false
        END AS pendencia_financeira,
        CASE
            WHEN n.status_nota = 'AGUARDANDO_NF'::text THEN true
            ELSE false
        END AS pendencia_nf,
    s.preferencia_hospedagem,
    s.observacao_gestor
   FROM hospedagem_solicitacoes s
     LEFT JOIN hospedagem_reservas r ON r.solicitacao_id = s.id
     LEFT JOIN hospedagem_hoteis h ON h.id = r.hotel_id
     LEFT JOIN hospedagem_financeiro f ON f.reserva_id = r.id
     LEFT JOIN hospedagem_notas n ON n.reserva_id = r.id;

create or replace view public.hospedagem_minhas_solicitacoes as
 SELECT solicitacao_id,
    codigo,
    data_solicitacao,
    solicitante_id,
    solicitante_nome,
    empresa,
    coordenacao,
    supervisao,
    cidade,
    uf,
    cliente,
    local_embarque,
    data_checkin_prevista,
    data_checkout_prevista,
    horario_chegada_previsto,
    quantidade_diarias_prevista,
    status_solicitacao,
    hotel,
    data_checkin,
    data_checkout,
    status_hospedagem,
    colaboradores,
    total_colaboradores,
    checkout_hoje,
    checkout_vencido,
    preferencia_hospedagem,
    observacao_gestor
   FROM hospedagem_painel_geral;

create or replace function public.hospedagem_criar_solicitacao(p_solicitacao jsonb, p_colaboradores jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_codigo text;
  c jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Autenticacao obrigatoria' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_colaboradores,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_colaboradores,'[]'::jsonb))=0 then
    raise exception 'Informe ao menos um colaborador';
  end if;
  if nullif(btrim(p_solicitacao->>'cidade'),'') is null then raise exception 'Informe a cidade'; end if;
  if nullif(p_solicitacao->>'data_checkin_prevista','')::date < current_date then raise exception 'Check-in anterior a hoje'; end if;
  if nullif(p_solicitacao->>'data_checkout_prevista','')::date <= nullif(p_solicitacao->>'data_checkin_prevista','')::date then
    raise exception 'Periodo de hospedagem invalido';
  end if;

  insert into public.hospedagem_solicitacoes(
    data_solicitacao,created_by,solicitante_id,solicitante_nome,solicitante_email,
    empresa,coordenacao,supervisao,regional,cidade,uf,cliente,local_embarque,
    link_local_embarque,data_checkin_prevista,data_checkout_prevista,
    horario_chegada_previsto,quantidade_diarias_prevista,observacao_gestor,status_solicitacao,
    preferencia_hospedagem
  ) values (
    coalesce(nullif(p_solicitacao->>'data_solicitacao','')::date,current_date),(select auth.uid()),(select auth.uid()),
    nullif(p_solicitacao->>'solicitante_nome',''),nullif(p_solicitacao->>'solicitante_email',''),
    nullif(p_solicitacao->>'empresa',''),nullif(p_solicitacao->>'coordenacao',''),nullif(p_solicitacao->>'supervisao',''),
    nullif(p_solicitacao->>'regional',''),btrim(p_solicitacao->>'cidade'),upper(nullif(p_solicitacao->>'uf','')),
    nullif(p_solicitacao->>'cliente',''),nullif(p_solicitacao->>'local_embarque',''),nullif(p_solicitacao->>'link_local_embarque',''),
    nullif(p_solicitacao->>'data_checkin_prevista','')::date,nullif(p_solicitacao->>'data_checkout_prevista','')::date,
    nullif(p_solicitacao->>'horario_chegada_previsto','')::time,
    nullif(p_solicitacao->>'quantidade_diarias_prevista','')::integer,nullif(p_solicitacao->>'observacao_gestor',''),'SOLICITADA',
    nullif(p_solicitacao->>'preferencia_hospedagem','')
  ) returning id,codigo into v_id,v_codigo;

  for c in select value from jsonb_array_elements(p_colaboradores) loop
    if nullif(btrim(c->>'nome_colaborador'),'') is null then raise exception 'Colaborador sem nome'; end if;
    insert into public.hospedagem_solicitacao_colaboradores(
      solicitacao_id,colaborador_id,nome_colaborador,cpf,tipo_colaborador,empresa,
      coordenacao,supervisao,status_colaborador,observacoes
    ) values (
      v_id,nullif(c->>'colaborador_id','')::uuid,btrim(c->>'nome_colaborador'),nullif(c->>'cpf',''),
      nullif(c->>'tipo_colaborador',''),nullif(c->>'empresa',''),nullif(c->>'coordenacao',''),
      nullif(c->>'supervisao',''),coalesce(nullif(c->>'status_colaborador',''),'ATIVO'),nullif(c->>'observacoes','')
    );
  end loop;

  insert into public.hospedagem_eventos
    (solicitacao_id,usuario_id,tipo_evento,descricao,status_novo)
  values(v_id,(select auth.uid()),'SOLICITACAO_CRIADA','Solicitacao criada pelo gestor.','SOLICITADA');
  return jsonb_build_object('id',v_id,'codigo',v_codigo);
end;
$function$;

-- Fecha o gap de RLS descrito acima: dono da solicitação (created_by/solicitante_id) pode
-- inserir o próprio evento de auditoria, sem precisar de hospedagem_pode_operar(true).
create policy hospedagem_eventos_insert_own
  on public.hospedagem_eventos
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.hospedagem_solicitacoes s
      where s.id = hospedagem_eventos.solicitacao_id
        and (s.created_by = (select auth.uid()) or s.solicitante_id = (select auth.uid()))
    )
  );
