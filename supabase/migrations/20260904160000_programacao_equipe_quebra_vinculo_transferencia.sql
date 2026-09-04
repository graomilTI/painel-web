-- Quando um colaborador é transferido de regional mas ainda está confirmado
-- em uma O.S. da regional antiga (mesma data), o trigger anterior bloqueava
-- a confirmação na regional nova com "já está confirmado em outra regional".
--
-- Isso obrigava correção manual toda vez que a GRM sincronizava uma
-- transferência. Agora, ao detectar esse conflito, o próprio trigger quebra
-- o vínculo antigo (confirmado = false na regional antiga) e deixa a
-- confirmação na regional nova seguir normalmente.

create or replace function public.programacao_equipe_validar_regional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data date;
  v_coordenacao_programacao text;
  v_supervisao_programacao text;
  v_base_programacao text;
  v_cpf text := regexp_replace(coalesce(new.colaborador_id, ''), '\D', '', 'g');
  v_nome text := upper(trim(coalesce(new.nome_colaborador, '')));
  v_pertence boolean := false;
  v_supervisoes_cadastro text;
  v_qtd_quebrados integer;
begin
  if new.confirmado is distinct from true or new.os_id is null then
    return new;
  end if;

  select
    p.data_referencia,
    nullif(trim(p.coordenacao), ''),
    nullif(trim(p.supervisao), '')
  into
    v_data,
    v_coordenacao_programacao,
    v_supervisao_programacao
  from public.programacao_dia p
  where p.id = new.programacao_id;

  if v_data is null or coalesce(v_supervisao_programacao, '') = '' then
    raise exception 'Programação sem data ou supervisão válida.';
  end if;

  v_base_programacao := upper(trim(coalesce(
    v_coordenacao_programacao,
    split_part(v_supervisao_programacao, ' - ', 1),
    v_supervisao_programacao
  )));

  select
    coalesce(bool_or(
      upper(trim(coalesce(c.supervisao, ''))) = upper(trim(v_supervisao_programacao))
      or (
        upper(trim(coalesce(c.coordenacao, ''))) = v_base_programacao
        and (
          coalesce(trim(c.supervisao), '') = ''
          or upper(trim(c.supervisao)) = v_base_programacao
          or upper(trim(c.supervisao)) = upper(trim(coalesce(c.coordenacao, '')))
        )
      )
    ), false),
    string_agg(distinct nullif(trim(c.supervisao), ''), ', ' order by nullif(trim(c.supervisao), ''))
  into
    v_pertence,
    v_supervisoes_cadastro
  from public.colaboradores_atuais c
  where c.ativo is distinct from false
    and coalesce(c.desligamento::text, '') = ''
    and upper(coalesce(c.situacao::text, '')) not in (
      'NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA',
      'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA'
    )
    and (
      (length(v_cpf) = 11 and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = v_cpf)
      or (length(v_cpf) <> 11 and v_nome <> '' and upper(trim(c.nome)) = v_nome)
    );

  if not v_pertence then
    raise exception 'Colaborador % não pertence à regional %. Supervisão cadastrada: %.',
      coalesce(new.nome_colaborador, new.colaborador_id),
      v_supervisao_programacao,
      coalesce(v_supervisoes_cadastro, 'não localizada');
  end if;

  -- O colaborador pode ter ficado confirmado em outra regional antes de uma
  -- transferência. Em vez de bloquear a confirmação na regional atual (que é
  -- a correta, conforme o cadastro acima), quebra o vínculo antigo.
  with quebrados as (
    update public.programacao_equipe e
    set confirmado = false, updated_at = now()
    from public.programacao_dia p
    where p.id = e.programacao_id
      and e.confirmado = true
      and e.os_id is not null
      and p.data_referencia = v_data
      and upper(trim(coalesce(p.supervisao, ''))) <> upper(trim(v_supervisao_programacao))
      and e.id is distinct from new.id
      and (
        (length(v_cpf) = 11 and regexp_replace(coalesce(e.colaborador_id, ''), '\D', '', 'g') = v_cpf)
        or (length(v_cpf) <> 11 and v_nome <> '' and upper(trim(e.nome_colaborador)) = v_nome)
      )
    returning 1
  )
  select count(*) into v_qtd_quebrados from quebrados;

  if v_qtd_quebrados > 0 then
    raise notice 'Colaborador % transferido: % vínculo(s) confirmado(s) em outra regional foram desfeitos para %.',
      coalesce(new.nome_colaborador, new.colaborador_id), v_qtd_quebrados, v_data;
  end if;

  return new;
end;
$$;

drop trigger if exists programacao_equipe_validar_regional_trg
  on public.programacao_equipe;

create trigger programacao_equipe_validar_regional_trg
before insert or update of programacao_id, colaborador_id, nome_colaborador, confirmado, os_id
on public.programacao_equipe
for each row
execute function public.programacao_equipe_validar_regional();
