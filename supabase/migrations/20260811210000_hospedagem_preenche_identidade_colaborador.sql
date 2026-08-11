-- Garante identidade consistente do colaborador nas solicitacoes de hospedagem.
-- A deteccao de extensao compara o mesmo colaborador entre a reserva anterior
-- e a nova solicitacao; solicitacoes criadas pela Programacao podiam chegar
-- apenas com nome, enquanto reservas anteriores tinham CPF, quebrando o match.

create or replace function public.hospedagem_preencher_identidade_colaborador()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_cpf text;
  v_ids integer;
  v_cpfs integer;
begin
  if nullif(trim(new.nome_colaborador), '') is null then
    return new;
  end if;

  if new.colaborador_id is null or nullif(trim(coalesce(new.cpf, '')), '') is null then
    select
      count(distinct h.colaborador_id) filter (where h.colaborador_id is not null),
      min(h.colaborador_id::text) filter (where h.colaborador_id is not null)::uuid,
      count(distinct h.cpf) filter (where nullif(trim(coalesce(h.cpf, '')), '') is not null),
      min(h.cpf) filter (where nullif(trim(coalesce(h.cpf, '')), '') is not null)
    into v_ids, v_id, v_cpfs, v_cpf
    from public.hospedagem_solicitacao_colaboradores h
    where upper(trim(h.nome_colaborador)) = upper(trim(new.nome_colaborador))
      and (new.id is null or h.id <> new.id);

    if new.colaborador_id is null and v_ids = 1 then
      new.colaborador_id := v_id;
    end if;
    if nullif(trim(coalesce(new.cpf, '')), '') is null and v_cpfs = 1 then
      new.cpf := v_cpf;
    end if;
  end if;

  if new.colaborador_id is null or nullif(trim(coalesce(new.cpf, '')), '') is null then
    select
      count(distinct c.id),
      min(c.id::text)::uuid,
      count(distinct c.cpf) filter (where nullif(trim(coalesce(c.cpf, '')), '') is not null),
      min(c.cpf) filter (where nullif(trim(coalesce(c.cpf, '')), '') is not null)
    into v_ids, v_id, v_cpfs, v_cpf
    from public.colaboradores c
    where upper(trim(c.nome)) = upper(trim(new.nome_colaborador));

    if new.colaborador_id is null and v_ids = 1 then
      new.colaborador_id := v_id;
    end if;
    if nullif(trim(coalesce(new.cpf, '')), '') is null and v_cpfs = 1 then
      new.cpf := v_cpf;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hospedagem_preencher_identidade_colaborador
  on public.hospedagem_solicitacao_colaboradores;

create trigger trg_hospedagem_preencher_identidade_colaborador
before insert or update of nome_colaborador, colaborador_id, cpf
on public.hospedagem_solicitacao_colaboradores
for each row
execute function public.hospedagem_preencher_identidade_colaborador();

-- Backfill: primeiro reaproveita uma identidade historica unica do mesmo nome.
with prior as (
  select
    upper(trim(h.nome_colaborador)) as nome_key,
    min(h.colaborador_id::text) filter (where h.colaborador_id is not null)::uuid as colaborador_id,
    min(h.cpf) filter (where nullif(trim(coalesce(h.cpf, '')), '') is not null) as cpf
  from public.hospedagem_solicitacao_colaboradores h
  group by upper(trim(h.nome_colaborador))
  having count(distinct h.colaborador_id) filter (where h.colaborador_id is not null) <= 1
     and count(distinct h.cpf) filter (where nullif(trim(coalesce(h.cpf, '')), '') is not null) <= 1
)
update public.hospedagem_solicitacao_colaboradores cur
set colaborador_id = coalesce(cur.colaborador_id, prior.colaborador_id),
    cpf = coalesce(nullif(trim(cur.cpf), ''), prior.cpf)
from prior
where upper(trim(cur.nome_colaborador)) = prior.nome_key
  and (cur.colaborador_id is null or nullif(trim(coalesce(cur.cpf, '')), '') is null);

-- Segundo fallback: usa o cadastro mestre apenas quando o nome aponta para
-- uma unica pessoa/CPF, evitando preencher identidades ambiguas.
with mestre as (
  select
    upper(trim(c.nome)) as nome_key,
    min(c.id::text)::uuid as colaborador_id,
    min(c.cpf) filter (where nullif(trim(coalesce(c.cpf, '')), '') is not null) as cpf
  from public.colaboradores c
  group by upper(trim(c.nome))
  having count(distinct c.id) = 1
     and count(distinct c.cpf) filter (where nullif(trim(coalesce(c.cpf, '')), '') is not null) <= 1
)
update public.hospedagem_solicitacao_colaboradores cur
set colaborador_id = coalesce(cur.colaborador_id, mestre.colaborador_id),
    cpf = coalesce(nullif(trim(cur.cpf), ''), mestre.cpf)
from mestre
where upper(trim(cur.nome_colaborador)) = mestre.nome_key
  and (cur.colaborador_id is null or nullif(trim(coalesce(cur.cpf, '')), '') is null);