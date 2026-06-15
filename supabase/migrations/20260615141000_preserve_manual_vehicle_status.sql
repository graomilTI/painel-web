-- Preserva o status definido manualmente no cadastro de veículos.
-- Sincronizações DETRAN/BFleet podem atualizar os demais campos, mas não o status.

alter table public.frotas_veiculos
  add column if not exists status_manual boolean not null default false;

alter table public.frotas_veiculos
  add column if not exists status_manual_em timestamptz;

-- Os veículos que já estavam fora do status ATIVO antes desta proteção
-- são considerados decisões manuais e não devem ser reativados por sincronização.
update public.frotas_veiculos
set
  status_manual = true,
  status_manual_em = coalesce(status_manual_em, now())
where upper(coalesce(status, '')) <> 'ATIVO'
  and status_manual = false;

create or replace function public.preservar_status_manual_frotas_veiculos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  atualizacao_automatica boolean;
begin
  atualizacao_automatica :=
    new.detran_ultima_consulta_em is distinct from old.detran_ultima_consulta_em
    or new.bfleet_ultima_sync_em is distinct from old.bfleet_ultima_sync_em
    or lower(coalesce(new.origem_importacao, '')) in ('detran', 'bfleet');

  if new.status is distinct from old.status then
    if old.status_manual and atualizacao_automatica then
      new.status := old.status;
      new.status_manual := true;
      new.status_manual_em := old.status_manual_em;
    else
      -- Alterações feitas pelo formulário do painel tornam-se a nova decisão manual.
      new.status_manual := true;
      new.status_manual_em := now();
    end if;
  elsif old.status_manual then
    -- Impede que um upsert automático limpe a marcação de status manual.
    new.status_manual := true;
    new.status_manual_em := old.status_manual_em;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preservar_status_manual_frotas_veiculos
  on public.frotas_veiculos;

create trigger trg_preservar_status_manual_frotas_veiculos
before update on public.frotas_veiculos
for each row
execute function public.preservar_status_manual_frotas_veiculos();

comment on column public.frotas_veiculos.status_manual is
  'Indica que o status foi definido manualmente e deve ser preservado nas sincronizações.';

comment on function public.preservar_status_manual_frotas_veiculos() is
  'Evita que sincronizações DETRAN ou BFleet reativem veículos com status definido manualmente.';
