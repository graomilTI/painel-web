create or replace function public.bonus_substituir_auditoria(
  p_competencia date,
  p_nomes text[],
  p_arquivo_nome text default null::text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_competencia date;
  v_total integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.bonus_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para administrar o Bônus';
  end if;

  if p_competencia is null then
    raise exception 'Competência obrigatória';
  end if;

  v_competencia := date_trunc('month', p_competencia)::date;

  delete from public.bonus_auditoria_inaptos
  where competencia = v_competencia;

  insert into public.bonus_auditoria_inaptos (
    competencia,
    colaborador_nome,
    nome_normalizado,
    arquivo_nome,
    importado_por
  )
  select
    v_competencia,
    min(trim(nome)) as colaborador_nome,
    public.bonus_normalizar_nome(nome) as nome_normalizado,
    nullif(trim(p_arquivo_nome), ''),
    auth.uid()
  from unnest(coalesce(p_nomes, array[]::text[])) as t(nome)
  where nullif(trim(nome), '') is not null
    and public.bonus_normalizar_nome(nome) <> ''
  group by public.bonus_normalizar_nome(nome)
  on conflict (competencia, nome_normalizado)
  do update set
    colaborador_nome = excluded.colaborador_nome,
    arquivo_nome = excluded.arquivo_nome,
    importado_por = excluded.importado_por,
    importado_em = now();

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.bonus_substituir_auditoria(date, text[], text) from public;
grant execute on function public.bonus_substituir_auditoria(date, text[], text) to authenticated;
