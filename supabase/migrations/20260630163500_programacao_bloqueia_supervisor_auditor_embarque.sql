-- Programação / Embarque:
-- Supervisor e Auditor não devem ser sugeridos nem permanecer confirmados para atender O.S.
-- Este script limpa confirmações já geradas antes do filtro do frontend e deixa
-- uma função utilitária para padronizar a regra no banco.

create or replace function public.programacao_cargo_bloqueado_embarque(p_cargo text)
returns boolean
language sql
immutable
as $$
  select (
    translate(
      upper(coalesce(p_cargo, '')),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    ) like '%SUPERVISOR%'
    or translate(
      upper(coalesce(p_cargo, '')),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    ) like '%AUDITOR%'
  );
$$;

grant execute on function public.programacao_cargo_bloqueado_embarque(text) to authenticated;

-- Remove confirmações de equipe que já tenham sido criadas para cargos bloqueados.
with ref as (
  select max(data_referencia) as data_referencia
  from public.colaborador_snapshot
),
bloqueados as (
  select distinct
    coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_key,
    cs.nome
  from public.colaborador_snapshot cs
  join ref on ref.data_referencia = cs.data_referencia
  where public.programacao_cargo_bloqueado_embarque(cs.cargo)
),
alvo as (
  select pe.id
  from public.programacao_equipe pe
  join bloqueados b
    on b.colaborador_key = pe.colaborador_id
    or translate(upper(coalesce(b.nome, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') =
       translate(upper(coalesce(pe.nome_colaborador, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
  where pe.confirmado is distinct from false
)
delete from public.programacao_equipe pe
using alvo
where pe.id = alvo.id;

-- Remove o espelho OS x colaborador usado por relatórios/roteirização, quando
-- também aponta para Supervisor/Auditor.
with ref as (
  select max(data_referencia) as data_referencia
  from public.colaborador_snapshot
),
bloqueados as (
  select distinct
    coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_key,
    cs.nome
  from public.colaborador_snapshot cs
  join ref on ref.data_referencia = cs.data_referencia
  where public.programacao_cargo_bloqueado_embarque(cs.cargo)
),
alvo as (
  select o.os_id, o.colaborador_key
  from public.operacional_os_colaboradores o
  join bloqueados b
    on b.colaborador_key = o.colaborador_key
    or translate(upper(coalesce(b.nome, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') =
       translate(upper(coalesce(o.colaborador_nome, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
)
delete from public.operacional_os_colaboradores o
using alvo
where o.os_id = alvo.os_id
  and coalesce(o.colaborador_key, '') = coalesce(alvo.colaborador_key, '');

-- Reverte disponibilidade espelhada para esses cargos, quando o auto-preencher
-- já havia marcado como OK/LOGISTICA.
with ref as (
  select max(data_referencia) as data_referencia
  from public.colaborador_snapshot
),
bloqueados as (
  select distinct
    coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_key,
    cs.nome
  from public.colaborador_snapshot cs
  join ref on ref.data_referencia = cs.data_referencia
  where public.programacao_cargo_bloqueado_embarque(cs.cargo)
)
update public.programacao_colaboradores pc
set disponibilidade = 'SEM EMBARQUE'
from bloqueados b
where (
    b.colaborador_key = pc.colaborador_id
    or translate(upper(coalesce(b.nome, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') =
       translate(upper(coalesce(pc.nome_colaborador, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
  )
  and pc.disponibilidade in ('OK', 'LOGISTICA');
