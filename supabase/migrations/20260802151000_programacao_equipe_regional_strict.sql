-- Impede que gestores confirmem colaboradores fora da supervisão atual e
-- corrige vínculos futuros/atuais já gravados na regional errada.

create or replace function public.programacao_equipe_validar_regional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data date;
  v_supervisao_programacao text;
  v_cpf text := regexp_replace(coalesce(new.colaborador_id, ''), '\D', '', 'g');
  v_nome text := upper(trim(coalesce(new.nome_colaborador, '')));
  v_supervisoes text[];
  v_supervisao_colaborador text;
begin
  if new.confirmado is distinct from true or new.os_id is null then
    return new;
  end if;

  select
    p.data_referencia,
    coalesce(nullif(trim(p.supervisao), ''), nullif(trim(p.regional), ''))
  into v_data, v_supervisao_programacao
  from public.programacao_dia p
  where p.id = new.programacao_id;

  if v_data is null or coalesce(trim(v_supervisao_programacao), '') = '' then
    raise exception 'Programação sem data ou supervisão válida.';
  end if;

  select array_agg(distinct trim(c.supervisao))
  into v_supervisoes
  from public.colaboradores_atuais c
  where c.ativo is distinct from false
    and coalesce(trim(c.desligamento), '') = ''
    and upper(coalesce(c.situacao, '')) not in (
      'NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA',
      'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA'
    )
    and coalesce(trim(c.supervisao), '') <> ''
    and (
      (length(v_cpf) = 11 and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = v_cpf)
      or (length(v_cpf) <> 11 and v_nome <> '' and upper(trim(c.nome)) = v_nome)
    );

  if coalesce(cardinality(v_supervisoes), 0) = 0 then
    raise exception 'Colaborador % não localizado como ativo em uma supervisão.', coalesce(new.nome_colaborador, new.colaborador_id);
  end if;

  if cardinality(v_supervisoes) > 1 then
    raise exception 'Colaborador % possui mais de uma supervisão ativa no cadastro: %. Corrija o cadastro antes de programar.',
      coalesce(new.nome_colaborador, new.colaborador_id), array_to_string(v_supervisoes, ', ');
  end if;

  v_supervisao_colaborador := v_supervisoes[1];

  if upper(trim(v_supervisao_colaborador)) <> upper(trim(v_supervisao_programacao)) then
    raise exception 'Colaborador % pertence à supervisão %, não à supervisão %.',
      coalesce(new.nome_colaborador, new.colaborador_id),
      v_supervisao_colaborador,
      v_supervisao_programacao;
  end if;

  if exists (
    select 1
    from public.programacao_equipe e
    join public.programacao_dia p on p.id = e.programacao_id
    where e.confirmado = true
      and e.os_id is not null
      and p.data_referencia = v_data
      and upper(trim(coalesce(p.supervisao, p.regional, ''))) <> upper(trim(v_supervisao_programacao))
      and e.id is distinct from new.id
      and (
        (length(v_cpf) = 11 and regexp_replace(coalesce(e.colaborador_id, ''), '\D', '', 'g') = v_cpf)
        or (length(v_cpf) <> 11 and v_nome <> '' and upper(trim(e.nome_colaborador)) = v_nome)
      )
  ) then
    raise exception 'Colaborador % já está confirmado em outra regional em %.',
      coalesce(new.nome_colaborador, new.colaborador_id), v_data;
  end if;

  return new;
end;
$$;

-- Corrige somente programações de hoje em diante cujo CPF possui uma única
-- supervisão ativa e cuja programação está em outra supervisão.
with cadastro_unico as (
  select
    regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') as cpf,
    min(trim(c.supervisao)) as supervisao
  from public.colaboradores_atuais c
  where c.ativo is distinct from false
    and coalesce(trim(c.desligamento), '') = ''
    and upper(coalesce(c.situacao, '')) not in (
      'NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA',
      'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA'
    )
    and length(regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g')) = 11
    and coalesce(trim(c.supervisao), '') <> ''
  group by regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g')
  having count(distinct upper(trim(c.supervisao))) = 1
)
update public.programacao_equipe e
set
  confirmado = false,
  updated_at = now()
from public.programacao_dia p, cadastro_unico c
where p.id = e.programacao_id
  and p.data_referencia >= current_date
  and e.confirmado = true
  and e.os_id is not null
  and regexp_replace(coalesce(e.colaborador_id, ''), '\D', '', 'g') = c.cpf
  and upper(trim(coalesce(p.supervisao, p.regional, ''))) <> upper(trim(c.supervisao));

drop trigger if exists programacao_equipe_validar_regional_trg
  on public.programacao_equipe;

create trigger programacao_equipe_validar_regional_trg
before insert or update of programacao_id, colaborador_id, nome_colaborador, confirmado, os_id
on public.programacao_equipe
for each row
execute function public.programacao_equipe_validar_regional();
