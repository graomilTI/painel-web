-- Frotas > Motoristas: quem está inativo no GRM (public.colaboradores.situacao <> 'Ativo',
-- que o agente grmserver-colaboradores-api-realtime mantém em dia) precisa estar INATIVO em
-- frotas_motoristas. Antes o painel só inativava na mão, e motorista desligado seguia ATIVO.
--
-- Casamento colaborador <-> motorista: CPF (só dígitos) e, na falta dele, o nome (sem acento,
-- caixa alta, espaços colapsados) contra frotas_motoristas.nome ou colaborador_nome (alias do nome
-- do GRM). Nome só vale quando os CPFs não se contradizem (homônimo com CPF diferente não casa) e
-- quando não existe outro colaborador ATIVO com o mesmo nome/CPF (readmissão/homônimo ativo).
--
-- Só inativa. Não reativa sozinho: quem volta a ficar Ativo no GRM é reativado na mão, porque
-- o motorista também pode estar inativo por outro motivo (CNH, decisão da Frota).

create or replace function public.frotas_motoristas_inativar_por_colaborador()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_cpf   text := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  v_chave text := upper(regexp_replace(unaccent(trim(coalesce(new.nome, ''))), '\s+', ' ', 'g'));
begin
  if new.situacao is null or new.situacao = 'Ativo' then
    return new;
  end if;

  -- Outra linha ATIVA da mesma pessoa (readmissão com CPF formatado diferente, homônimo ativo).
  if exists (
    select 1
      from public.colaboradores o
     where o.id <> new.id
       and o.situacao = 'Ativo'
       and (
         (v_cpf is not null and nullif(regexp_replace(coalesce(o.cpf, ''), '\D', '', 'g'), '') = v_cpf)
         or (v_chave <> '' and upper(regexp_replace(unaccent(trim(o.nome)), '\s+', ' ', 'g')) = v_chave)
       )
  ) then
    return new;
  end if;

  update public.frotas_motoristas m
     set status = 'INATIVO',
         updated_at = now()
   where m.status is distinct from 'INATIVO'
     and (
       (v_cpf is not null and nullif(regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g'), '') = v_cpf)
       or (
         v_chave <> ''
         and (
           upper(regexp_replace(unaccent(trim(m.nome)), '\s+', ' ', 'g')) = v_chave
           or upper(regexp_replace(unaccent(trim(coalesce(m.colaborador_nome, ''))), '\s+', ' ', 'g')) = v_chave
         )
         and (
           v_cpf is null
           or nullif(regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g'), '') is null
           or nullif(regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g'), '') = v_cpf
         )
       )
     );

  return new;
end;
$function$;

comment on function public.frotas_motoristas_inativar_por_colaborador() is
'Inativa em frotas_motoristas o motorista cujo colaborador ficou inativo no GRM (colaboradores.situacao <> Ativo). Ver migration 20261013180000.';

drop trigger if exists trg_colaboradores_inativa_motorista_ins on public.colaboradores;
create trigger trg_colaboradores_inativa_motorista_ins
after insert on public.colaboradores
for each row
when (new.situacao is not null and new.situacao <> 'Ativo')
execute function public.frotas_motoristas_inativar_por_colaborador();

drop trigger if exists trg_colaboradores_inativa_motorista_upd on public.colaboradores;
create trigger trg_colaboradores_inativa_motorista_upd
after update of situacao on public.colaboradores
for each row
when (old.situacao is distinct from new.situacao and new.situacao is not null and new.situacao <> 'Ativo')
execute function public.frotas_motoristas_inativar_por_colaborador();

-- Acerto dos dados de hoje (mesma regra do gatilho, em lote).
with c as (
  select id, situacao,
         nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '') cpf,
         upper(regexp_replace(unaccent(trim(nome)), '\s+', ' ', 'g')) chave
    from public.colaboradores
), m as (
  select id,
         nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '') cpf,
         upper(regexp_replace(unaccent(trim(nome)), '\s+', ' ', 'g')) chave,
         upper(regexp_replace(unaccent(trim(coalesce(colaborador_nome, ''))), '\s+', ' ', 'g')) chave_alias
    from public.frotas_motoristas
   where status is distinct from 'INATIVO'
), par as (
  select m.id as motorista_id, c.situacao
    from m
    join c on (c.cpf is not null and c.cpf = m.cpf)
           or (c.chave <> '' and (c.chave = m.chave or (m.chave_alias <> '' and c.chave = m.chave_alias))
               and (c.cpf is null or m.cpf is null or c.cpf = m.cpf))
)
update public.frotas_motoristas fm
   set status = 'INATIVO',
       updated_at = now()
 where fm.id in (select motorista_id from par where situacao is distinct from 'Ativo')
   and fm.id not in (select motorista_id from par where situacao = 'Ativo');

-- Aba Veículos: nomes (já normalizados: sem acento, caixa alta, espaços colapsados) de motoristas
-- que aparecem nos veículos e estão inativos. `motivo` = RH (inativo no GRM) ou MOTORISTA (inativo
-- só no cadastro de Motoristas). Devolve no máximo um nome por veículo, então a resposta é pequena
-- e não esbarra no corte de 1000 linhas do PostgREST (colaboradores_atuais tem ~2,4 mil).
create or replace function public.frotas_veiculos_motoristas_inativos()
returns table(chave text, motivo text)
language sql
stable
security invoker
set search_path = public
as $function$
  with nomes as (
    select distinct upper(regexp_replace(unaccent(trim(n)), '\s+', ' ', 'g')) as chave
      from (
        select motorista_atual as n from public.frotas_veiculos
        union all
        select patrimonio_funcionario from public.frotas_veiculos
      ) x
     where nullif(trim(n), '') is not null
  ), rh as (
    select upper(regexp_replace(unaccent(trim(nome)), '\s+', ' ', 'g')) as chave,
           bool_or(situacao = 'Ativo') as tem_ativo,
           bool_or(situacao is distinct from 'Ativo') as tem_inativo
      from public.colaboradores_atuais
     group by 1
  ), mot as (
    select k.chave,
           bool_or(m.status = 'ATIVO' or m.status is null) as tem_ativo,
           bool_or(m.status = 'INATIVO') as tem_inativo
      from public.frotas_motoristas m
      cross join lateral (
        values (upper(regexp_replace(unaccent(trim(m.nome)), '\s+', ' ', 'g'))),
               (upper(regexp_replace(unaccent(trim(coalesce(m.colaborador_nome, ''))), '\s+', ' ', 'g')))
      ) k(chave)
     where k.chave <> ''
     group by k.chave
  )
  select n.chave,
         case
           when rh.tem_inativo and not rh.tem_ativo then 'RH'
           when mot.tem_inativo and not mot.tem_ativo then 'MOTORISTA'
         end as motivo
    from nomes n
    left join rh on rh.chave = n.chave
    left join mot on mot.chave = n.chave
   where (rh.tem_inativo and not rh.tem_ativo)
      or (mot.tem_inativo and not mot.tem_ativo);
$function$;

comment on function public.frotas_veiculos_motoristas_inativos() is
'Nomes (normalizados) de motoristas de veiculos que estao inativos no GRM (RH) ou no cadastro de Motoristas. Usada pela aba Frotas > Veiculos para destacar em vermelho. Ver migration 20261013180000.';

grant execute on function public.frotas_veiculos_motoristas_inativos() to authenticated;
