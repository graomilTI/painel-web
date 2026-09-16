-- frotas_bfleet_condutores_fila nunca reabre um item que caiu em ERRO: tanto o
-- cron de seguranca (update-bfleet-condutores-5min) quanto o disparo logo apos
-- cada sync de patrimonio usam mode:'pending' (so status=PENDENTE) e nenhum lugar
-- do sistema chama mode:'retry_all'. Resultado: veiculo que falhou uma vez por
-- "nao confirmado no BFleet" ou "motorista sem CNH/telefone/email" fica com
-- motorista desatualizado no BFleet para sempre, mesmo depois que alguem resolve
-- a causa (confirma o veiculo no BFleet, completa a CNH do motorista). Achamos
-- itens de 03/07 ainda travados em ERRO nunca mais tocados.
--
-- Fix: reabre (volta pra PENDENTE) so quando a causa especifica do erro deixa de
-- existir, sem re-tentar em loop casos que continuam sem solucao (ex: veiculo que
-- nunca sera cadastrado no BFleet).

create or replace function public.reabrir_fila_bfleet_condutor_veiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if (
    (new.bfleet_confirmado is true and coalesce(old.bfleet_confirmado, false) is distinct from true)
    or (nullif(trim(new.bfleet_id), '') is not null and nullif(trim(old.bfleet_id), '') is null)
    or (nullif(trim(new.bfleet_idgps), '') is not null and nullif(trim(old.bfleet_idgps), '') is null)
  ) then
    update public.frotas_bfleet_condutores_fila
       set status = 'PENDENTE',
           erro = null,
           updated_at = now()
     where veiculo_id = new.id
       and status = 'ERRO'
       and (
         erro ilike '%não encontrada no vehicleGetAll%'
         or erro ilike '%nao encontrada no vehicleGetAll%'
         or erro ilike '%não localizado por bfleet_id%'
         or erro ilike '%nao localizado por bfleet_id%'
       );

    update public.frotas_veiculos
       set bfleet_condutor_status = 'PENDENTE',
           bfleet_condutor_erro = null
     where id = new.id
       and exists (
         select 1
           from public.frotas_bfleet_condutores_fila q
          where q.veiculo_id = new.id
            and q.status = 'PENDENTE'
       );
  end if;
  return new;
end;
$function$;

comment on function public.reabrir_fila_bfleet_condutor_veiculo() is
'Reabre (ERRO->PENDENTE) a fila do BFleet quando o veiculo passa a ser identificavel no BFleet (bfleet_confirmado, bfleet_id ou bfleet_idgps preenchidos). Ver migration 20260916170000.';

drop trigger if exists trg_reabrir_fila_bfleet_condutor_veiculo on public.frotas_veiculos;
create trigger trg_reabrir_fila_bfleet_condutor_veiculo
after update of bfleet_confirmado, bfleet_id, bfleet_idgps
on public.frotas_veiculos
for each row
execute function public.reabrir_fila_bfleet_condutor_veiculo();

create or replace function public.reabrir_fila_bfleet_condutor_motorista()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_tinha_dados_antes boolean;
  v_tem_dados_agora boolean;
begin
  v_tinha_dados_antes := (tg_op = 'UPDATE')
    and nullif(trim(old.telefone), '') is not null
    and nullif(trim(old.email), '') is not null
    and nullif(trim(old.cnh_numero), '') is not null
    and old.cnh_validade is not null;

  v_tem_dados_agora :=
    nullif(trim(new.telefone), '') is not null
    and nullif(trim(new.email), '') is not null
    and nullif(trim(new.cnh_numero), '') is not null
    and new.cnh_validade is not null;

  if v_tem_dados_agora and not coalesce(v_tinha_dados_antes, false) then
    update public.frotas_bfleet_condutores_fila
       set status = 'PENDENTE',
           erro = null,
           updated_at = now()
     where status = 'ERRO'
       and erro ilike '%não existe no BFleet e não tem dados completos%'
       and upper(regexp_replace(unaccent(trim(motorista_atual)), '\s+', ' ', 'g'))
           = upper(regexp_replace(unaccent(trim(new.nome)), '\s+', ' ', 'g'));

    update public.frotas_veiculos v
       set bfleet_condutor_status = 'PENDENTE',
           bfleet_condutor_erro = null
      from public.frotas_bfleet_condutores_fila q
     where q.veiculo_id = v.id
       and q.status = 'PENDENTE'
       and upper(regexp_replace(unaccent(trim(q.motorista_atual)), '\s+', ' ', 'g'))
           = upper(regexp_replace(unaccent(trim(new.nome)), '\s+', ' ', 'g'));
  end if;
  return new;
end;
$function$;

comment on function public.reabrir_fila_bfleet_condutor_motorista() is
'Reabre (ERRO->PENDENTE) a fila do BFleet quando o motorista passa a ter telefone/email/CNH completos no painel (dados exigidos pelo createDriver do BFleet). Ver migration 20260916170000.';

drop trigger if exists trg_reabrir_fila_bfleet_condutor_motorista on public.frotas_motoristas;
create trigger trg_reabrir_fila_bfleet_condutor_motorista
after insert or update of telefone, email, cnh_numero, cnh_validade
on public.frotas_motoristas
for each row
execute function public.reabrir_fila_bfleet_condutor_motorista();

-- Backfill: reabre agora os itens cuja causa ja estava resolvida antes desta migration.
update public.frotas_bfleet_condutores_fila q
   set status = 'PENDENTE',
       erro = null,
       updated_at = now()
  from public.frotas_veiculos v
 where v.id = q.veiculo_id
   and q.status = 'ERRO'
   and (
     erro ilike '%não encontrada no vehicleGetAll%'
     or erro ilike '%nao encontrada no vehicleGetAll%'
     or erro ilike '%não localizado por bfleet_id%'
     or erro ilike '%nao localizado por bfleet_id%'
   )
   and (
     v.bfleet_confirmado is true
     or nullif(trim(v.bfleet_id), '') is not null
     or nullif(trim(v.bfleet_idgps), '') is not null
   );

update public.frotas_veiculos v
   set bfleet_condutor_status = 'PENDENTE',
       bfleet_condutor_erro = null
 where exists (
   select 1
     from public.frotas_bfleet_condutores_fila q
    where q.veiculo_id = v.id
      and q.status = 'PENDENTE'
 );

update public.frotas_bfleet_condutores_fila q
   set status = 'PENDENTE',
       erro = null,
       updated_at = now()
  from public.frotas_motoristas m
 where q.status = 'ERRO'
   and q.erro ilike '%não existe no BFleet e não tem dados completos%'
   and nullif(trim(m.telefone), '') is not null
   and nullif(trim(m.email), '') is not null
   and nullif(trim(m.cnh_numero), '') is not null
   and m.cnh_validade is not null
   and upper(regexp_replace(unaccent(trim(q.motorista_atual)), '\s+', ' ', 'g'))
       = upper(regexp_replace(unaccent(trim(m.nome)), '\s+', ' ', 'g'));

update public.frotas_veiculos v
   set bfleet_condutor_status = 'PENDENTE',
       bfleet_condutor_erro = null
 where exists (
   select 1
     from public.frotas_bfleet_condutores_fila q
    where q.veiculo_id = v.id
      and q.status = 'PENDENTE'
 );
