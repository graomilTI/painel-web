create or replace function public.hospedagem_criar_solicitacao(
  p_solicitacao jsonb,
  p_colaboradores jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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
    horario_chegada_previsto,quantidade_diarias_prevista,observacao_gestor,status_solicitacao
  ) values (
    coalesce(nullif(p_solicitacao->>'data_solicitacao','')::date,current_date),(select auth.uid()),(select auth.uid()),
    nullif(p_solicitacao->>'solicitante_nome',''),nullif(p_solicitacao->>'solicitante_email',''),
    nullif(p_solicitacao->>'empresa',''),nullif(p_solicitacao->>'coordenacao',''),nullif(p_solicitacao->>'supervisao',''),
    nullif(p_solicitacao->>'regional',''),btrim(p_solicitacao->>'cidade'),upper(nullif(p_solicitacao->>'uf','')),
    nullif(p_solicitacao->>'cliente',''),nullif(p_solicitacao->>'local_embarque',''),nullif(p_solicitacao->>'link_local_embarque',''),
    nullif(p_solicitacao->>'data_checkin_prevista','')::date,nullif(p_solicitacao->>'data_checkout_prevista','')::date,
    nullif(p_solicitacao->>'horario_chegada_previsto','')::time,
    nullif(p_solicitacao->>'quantidade_diarias_prevista','')::integer,nullif(p_solicitacao->>'observacao_gestor',''),'SOLICITADA'
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
$$;

revoke all on function public.hospedagem_criar_solicitacao(jsonb,jsonb) from public;
grant execute on function public.hospedagem_criar_solicitacao(jsonb,jsonb) to authenticated;
