-- Garante que a supervisao exibida/filtrada em Hospedagem pertença ao colaborador,
-- e não ao solicitante da hospedagem.

create or replace function public.hospedagem_sync_supervisao_colaborador()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supervisao text;
begin
  if new.colaborador_id is not null then
    select c.supervisao
      into v_supervisao
      from public.colaboradores c
     where c.id = new.colaborador_id
     limit 1;

    if found then
      new.supervisao := v_supervisao;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hospedagem_sync_supervisao_colaborador
  on public.hospedagem_solicitacao_colaboradores;

create trigger trg_hospedagem_sync_supervisao_colaborador
before insert or update of colaborador_id, supervisao
on public.hospedagem_solicitacao_colaboradores
for each row
execute function public.hospedagem_sync_supervisao_colaborador();

update public.hospedagem_solicitacao_colaboradores sc
   set supervisao = c.supervisao
  from public.colaboradores c
 where c.id = sc.colaborador_id
   and sc.supervisao is distinct from c.supervisao;

create or replace function public.hospedagem_refresh_supervisao_solicitacao(p_solicitacao_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supervisao text;
begin
  select string_agg(
           distinct nullif(btrim(sc.supervisao), ''),
           ' | '
           order by nullif(btrim(sc.supervisao), '')
         )
    into v_supervisao
    from public.hospedagem_solicitacao_colaboradores sc
   where sc.solicitacao_id = p_solicitacao_id
     and nullif(btrim(sc.supervisao), '') is not null;

  update public.hospedagem_solicitacoes
     set supervisao = v_supervisao
   where id = p_solicitacao_id
     and supervisao is distinct from v_supervisao;
end;
$$;

create or replace function public.hospedagem_sync_supervisao_solicitacao_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.hospedagem_refresh_supervisao_solicitacao(old.solicitacao_id);
    return old;
  end if;

  perform public.hospedagem_refresh_supervisao_solicitacao(new.solicitacao_id);

  if tg_op = 'UPDATE' and old.solicitacao_id is distinct from new.solicitacao_id then
    perform public.hospedagem_refresh_supervisao_solicitacao(old.solicitacao_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hospedagem_sync_supervisao_solicitacao
  on public.hospedagem_solicitacao_colaboradores;

create trigger trg_hospedagem_sync_supervisao_solicitacao
after insert or update of solicitacao_id, colaborador_id, supervisao or delete
on public.hospedagem_solicitacao_colaboradores
for each row
execute function public.hospedagem_sync_supervisao_solicitacao_trigger();

with supervisoes as (
  select sc.solicitacao_id,
         string_agg(
           distinct nullif(btrim(sc.supervisao), ''),
           ' | '
           order by nullif(btrim(sc.supervisao), '')
         ) as supervisao
    from public.hospedagem_solicitacao_colaboradores sc
   where nullif(btrim(sc.supervisao), '') is not null
   group by sc.solicitacao_id
)
update public.hospedagem_solicitacoes s
   set supervisao = x.supervisao
  from supervisoes x
 where x.solicitacao_id = s.id
   and s.supervisao is distinct from x.supervisao;
