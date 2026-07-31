
create or replace function public.programacao_caronas_dados(p_programacao_id uuid)
returns table(
  colaborador_id text, nome text, lat numeric, lng numeric,
  tem_frota boolean, veiculo_placa text,
  os_id uuid, numero_os text, cliente text,
  ponto_id uuid, embarque_label text, emb_lat numeric, emb_lng numeric,
  veiculo_proprio boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with cz_best as (
    select distinct on (cpf) cpf, latitude, longitude, veiculo_id, veiculo_placa
    from colaborador_cruzamento
    where cpf <> ''
    order by cpf, atualizado_em desc
  )
  select
    e.colaborador_id,
    e.nome_colaborador as nome,
    cz.latitude as lat,
    cz.longitude as lng,
    (cz.veiculo_id is not null) as tem_frota,
    cz.veiculo_placa,
    e.os_id,
    o.numero_os,
    o.cliente,
    o.ponto_embarque_id as ponto_id,
    p.embarque_label,
    p.latitude as emb_lat,
    p.longitude as emb_lng,
    exists (
      select 1 from programacao_veiculo_proprio vp
      where vp.ativo and (
        vp.colaborador_id = e.colaborador_id
        or unaccent(upper(btrim(coalesce(vp.nome, '')))) = unaccent(upper(btrim(coalesce(e.nome_colaborador, ''))))
      )
    ) as veiculo_proprio
  from programacao_equipe e
  join operacional_os o on o.id = e.os_id
  left join operacional_pontos_embarque p on p.id = o.ponto_embarque_id
  left join cz_best cz
    on cz.cpf = regexp_replace(coalesce(e.colaborador_id, ''), '\D', '', 'g')
   and regexp_replace(coalesce(e.colaborador_id, ''), '\D', '', 'g') <> ''
  where e.programacao_id = p_programacao_id and e.confirmado = true;
$$;

revoke execute on function public.programacao_caronas_dados(uuid) from public;
grant execute on function public.programacao_caronas_dados(uuid) to authenticated;
;
