-- Travas de segurança do agente de lançamento NHE.
-- Evita varredura via PostgREST em tabelas volumosas ao verificar O.S. + data.

create index if not exists idx_grm_producao_diaria_data_os_json
on public.grm_producao_diaria_importacoes ((dados_json->>'Data'), (dados_json->>'O.S.'));

create index if not exists idx_grm_nhe_data_os_json
on public.grm_nhe_importacoes ((dados_json->>'lnsDate'), (dados_json->>'sorCode'));

create or replace function public.nhe_existe_movimento_real(p_data text, p_os text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.grm_producao_diaria_importacoes g
    where (g.dados_json->>'Data') = p_data
      and (g.dados_json->>'O.S.') = p_os
    limit 1
  );
$$;

create or replace function public.nhe_existe_nhe_real(p_data text, p_os text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.grm_nhe_importacoes g
    where (g.dados_json->>'lnsDate') = p_data
      and (g.dados_json->>'sorCode') = p_os
    limit 1
  );
$$;

grant execute on function public.nhe_existe_movimento_real(text,text) to anon, authenticated, service_role;
grant execute on function public.nhe_existe_nhe_real(text,text) to anon, authenticated, service_role;
