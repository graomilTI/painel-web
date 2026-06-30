-- Corrige solicitações de hospedagem criadas pela Programação que ficaram sem colaborador.
-- O bug no frontend enviava colaborador_nome/colaborador_cpf, enquanto a tabela/view
-- usa nome_colaborador/cpf. Este backfill preenche o vínculo apenas quando a
-- solicitação ainda não tem nenhum colaborador vinculado.

insert into public.hospedagem_solicitacao_colaboradores (
  solicitacao_id,
  nome_colaborador,
  cpf,
  status_colaborador
)
select
  s.id,
  nome_extraido.nome,
  null,
  'ATIVO'
from public.hospedagem_solicitacoes s
cross join lateral (
  select nullif(
    trim(
      regexp_replace(
        split_part(
          regexp_replace(coalesce(s.observacao_gestor, ''), '^Sugestão automática via Programação\s*—\s*', '', 'i'),
          ' a ',
          1
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  ) as nome
) nome_extraido
where coalesce(s.observacao_gestor, '') ilike 'Sugestão automática via Programação%'
  and nome_extraido.nome is not null
  and not exists (
    select 1
    from public.hospedagem_solicitacao_colaboradores c
    where c.solicitacao_id = s.id
  );
