-- A Programação exibe e publica Almoço = Sim quando ainda não existe uma
-- linha em programacao_alimentacao. O guard da fila fazia o inverso: exigia
-- uma linha explícita com almoco=true e, na ausência dela, convertia APLICAR
-- em LIMPAR. Alinha o guard ao contrato da tela/Edge Function: almoço é
-- permitido por padrão e somente almoco=false o desabilita.

create or replace function public.grm_filtrar_regras_programacao(
  p_versao_id uuid,
  p_data date,
  p_colaborador_id text,
  p_nome text,
  p_regras jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_programacao_ids text[];
  v_nome text := upper(unaccent(trim(coalesce(p_nome, ''))));
  v_na_programacao boolean := false;
  v_em_os boolean := false;
  v_almoco_programado boolean := true;
begin
  select array_agg(x.value)
    into v_programacao_ids
  from public.grm_despesas_versoes v
  cross join lateral jsonb_array_elements_text(coalesce(v.programacao_ids, '[]'::jsonb)) x(value)
  where v.id = p_versao_id;

  if coalesce(array_length(v_programacao_ids, 1), 0) = 0 then
    return coalesce(p_regras, '[]'::jsonb);
  end if;

  select exists (
    select 1
    from public.programacao_colaboradores pc
    where pc.programacao_id::text = any(v_programacao_ids)
      and pc.data_referencia = p_data
      and (
        (nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pc.colaborador_id, '')) = trim(p_colaborador_id))
        or upper(unaccent(trim(coalesce(pc.nome_colaborador, '')))) = v_nome
      )
  ) into v_na_programacao;

  select exists (
    select 1
    from public.programacao_equipe pe
    where pe.programacao_id::text = any(v_programacao_ids)
      and pe.confirmado = true
      and (
        (nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pe.colaborador_id, '')) = trim(p_colaborador_id))
        or upper(unaccent(trim(coalesce(pe.nome_colaborador, '')))) = v_nome
      )
  ) into v_em_os;

  select not exists (
    select 1
    from public.programacao_alimentacao pa
    where pa.programacao_id::text = any(v_programacao_ids)
      and pa.data_referencia = p_data
      and pa.almoco = false
      and (
        (nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pa.colaborador_id, '')) = trim(p_colaborador_id))
        or upper(unaccent(trim(coalesce(pa.nome_colaborador, '')))) = v_nome
      )
  ) into v_almoco_programado;

  return coalesce((
    select jsonb_agg(t.rule order by t.ord)
    from jsonb_array_elements(coalesce(p_regras, '[]'::jsonb)) with ordinality as t(rule, ord)
    where case
      when upper(unaccent(trim(coalesce(t.rule->>'tipo_despesa', '')))) = 'ALMOCO'
        then v_na_programacao and v_almoco_programado
      when upper(unaccent(trim(coalesce(t.rule->>'tipo_despesa', '')))) in (
        'SALARIO DE INTERMITENTE',
        'SERVICOS TERCEIRIZADOS'
      )
        then v_em_os
      else true
    end
  ), '[]'::jsonb);
end;
$function$;
