create or replace function public.match_ponto_embarque(p_embarque text, p_cliente text, p_supervisao text)
returns uuid
language plpgsql
stable
as $$
declare
  v_uf text;
  v_cidade text;
  v_local text;
  v_cliente text := normalizar_embarque_texto(p_cliente);
  v_supervisao text := normalizar_embarque_texto(p_supervisao);
  v_ponto_id uuid;
begin
  select uf, cidade, local into v_uf, v_cidade, v_local from public.parse_embarque(p_embarque);
  if v_uf is null and v_cidade is null then
    return null;
  end if;
  v_uf := normalizar_embarque_texto(v_uf);
  v_cidade := normalizar_embarque_texto(v_cidade);
  v_local := normalizar_embarque_texto(v_local);

  select p.id into v_ponto_id
  from public.operacional_pontos_embarque p
  cross join lateral (
    select
      (case when v_uf <> '' and normalizar_embarque_texto(p.uf) = v_uf then 50 else 0 end)
      + (case when v_cidade <> '' and (normalizar_embarque_texto(p.cidade) like '%' || v_cidade || '%' or v_cidade like '%' || normalizar_embarque_texto(p.cidade) || '%') then 80 else 0 end)
      + (case when v_local <> '' and (normalizar_embarque_texto(p.nome_local) like '%' || v_local || '%' or v_local like '%' || normalizar_embarque_texto(p.nome_local) || '%') then 120 else 0 end)
      + (case when v_cliente <> '' and (normalizar_embarque_texto(p.nome_local) like '%' || v_cliente || '%' or v_cliente like '%' || normalizar_embarque_texto(p.nome_local) || '%') then 30 else 0 end)
      + (case when v_supervisao <> '' and p.supervisao is not null and (normalizar_embarque_texto(p.supervisao) like '%' || v_supervisao || '%' or v_supervisao like '%' || normalizar_embarque_texto(p.supervisao) || '%') then 15 else 0 end)
      as score
  ) s
  where p.ativo is true
    and p.latitude is not null and p.longitude is not null
    and (v_uf = '' or upper(btrim(p.uf)) = v_uf)
    and s.score >= 120
  order by s.score desc
  limit 1;

  return v_ponto_id;
end;
$$;
;
