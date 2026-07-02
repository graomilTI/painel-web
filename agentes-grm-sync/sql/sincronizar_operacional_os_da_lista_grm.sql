create or replace function public.norm_txt(v text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(
      translate(
        coalesce(v, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create or replace function public.sincronizar_operacional_os_da_lista_grm()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_lista integer := 0;
  v_total_validas integer := 0;
  v_atualizadas integer := 0;
  v_inseridas integer := 0;
  v_com_ponto integer := 0;
begin
  drop table if exists tmp_os_lista_grm;

  create temp table tmp_os_lista_grm on commit drop as
  with base as (
    select distinct on ((dados_json->>'O.S.')::text)
      (dados_json->>'O.S.')::text as numero_os,
      dados_json,
      data_sincronizacao,
      created_at,
      updated_at
    from public.grm_lista_os_importacoes
    where coalesce(dados_json->>'O.S.', '') <> ''
    order by
      (dados_json->>'O.S.')::text,
      data_sincronizacao desc nulls last,
      updated_at desc nulls last,
      created_at desc nulls last
  ),
  mapeada as (
    select
      b.numero_os,
      b.dados_json,
      case
        when nullif(b.dados_json->>'Data', '') ~ '^\d{2}/\d{2}/\d{4}$'
        then to_date(b.dados_json->>'Data', 'DD/MM/YYYY')
        else null
      end as data_os,
      coalesce(
        nullif(b.dados_json->>'Cliente_2', ''),
        nullif(b.dados_json->>'Cliente_1', ''),
        nullif(b.dados_json->>'Cliente', '')
      ) as cliente,
      trim(
        coalesce(b.dados_json->>'UF', '') || ' - ' ||
        coalesce(b.dados_json->>'Cidade de Emb.', '') || ' (' ||
        coalesce(b.dados_json->>'Local de Embarque', '') || ')'
      ) as embarque,
      trim(
        coalesce(b.dados_json->>'UF Destino', '') || ' - ' ||
        coalesce(b.dados_json->>'Cidade', '') || ' (' ||
        coalesce(b.dados_json->>'Destino', '') || ')'
      ) as destino,
      b.dados_json->>'Produto' as produto,
      b.dados_json->>'Contrato' as contrato,
      b.dados_json->>'UF' as uf_embarque,
      b.dados_json->>'Cidade de Emb.' as cidade_embarque,
      b.dados_json->>'Local de Embarque' as local_embarque
    from base b
  )
  select distinct on (m.numero_os)
    m.*,
    p.id as ponto_embarque_id,
    p.nome_local as ponto1_nome,
    p.latitude as ponto1_latitude,
    p.longitude as ponto1_longitude
  from mapeada m
  left join public.operacional_pontos_embarque p
    on public.norm_txt(p.cidade) = public.norm_txt(m.cidade_embarque)
   and (
        public.norm_txt(p.nome_local) = public.norm_txt(m.local_embarque)
     or public.norm_txt(p.embarque_label) = public.norm_txt(m.local_embarque)
     or public.norm_txt(p.embarque_label) = public.norm_txt(m.uf_embarque || ' - ' || m.cidade_embarque || ' (' || m.local_embarque || ')')
   )
  where m.numero_os is not null
    and m.numero_os <> ''
  order by
    m.numero_os,
    case when p.id is not null then 0 else 1 end;

  select count(*) into v_total_lista
  from public.grm_lista_os_importacoes;

  select count(*) into v_total_validas
  from tmp_os_lista_grm;

  update public.operacional_os o
     set
       data_os = coalesce(t.data_os, o.data_os),
       cliente = coalesce(t.cliente, o.cliente),
       embarque = coalesce(t.embarque, o.embarque),
       destino = coalesce(t.destino, o.destino),
       produto = coalesce(t.produto, o.produto),
       contrato = coalesce(t.contrato, o.contrato),
       ponto1_latitude = coalesce(t.ponto1_latitude, o.ponto1_latitude),
       ponto1_longitude = coalesce(t.ponto1_longitude, o.ponto1_longitude),
       ponto1_nome = coalesce(t.ponto1_nome, o.ponto1_nome),
       ponto_embarque_id = coalesce(t.ponto_embarque_id, o.ponto_embarque_id),
       raw = t.dados_json,
       arquivo_origem = 'agente:grm_lista_os_importacoes',
       updated_at = now()
   


  get diagn

  insert into public.operacional_os (
    numero_os,
    situ
    financeiro,
    data_os,
    servico,
    clie
    embarque
    destino,
    super
    c
    produto,
    ponto1_
    ponto1
    ponto1_nome,
    ponto_embarque_id,
 
    status_conferencia,
    raw,
    arquivo_origem,
    created_at,
    updated_at
  )
  select
    t.nume
    'Aberta',
    'Não Faturada',
    t.data_os,
    'Cla
    t.c
    t.
    t.destino,
  
    t.c
    t.p
    
   

    t.ponto_embarque_id,
    'AGUARDAR',
    'PENDENTE',
    t.dados_json,

    now(),
  
  from tmp_os_li
  where not exis
    select 1
    from pu
    w
  );

 

  select count(*) into v_com
  from public.operacional_os
  
    and ponto1_longitude is n

  return jsonb_build_objec
    'total_grm_lista_os_imp
    '
    'operacional_os_atualizadas', v_atua

    'operacional_os_com_ponto_total', v_com_ponto,
   
  );
end;
$$;

g
grant execute on function public.sincronizar_operaci
grant execute on function public.sincronizar_op

notify pgrst, 'r
