-- Corrige reservas cujo vinculo principal foi cancelado e centraliza o
-- cancelamento para preservar reservas agrupadas ainda validas.

-- Reservas agrupadas: troca o ponteiro principal por uma solicitacao ativa.
with candidatas as (
  select distinct on (r.id) r.id reserva_id,rs.solicitacao_id
  from public.hospedagem_reservas r
  join public.hospedagem_solicitacoes principal on principal.id=r.solicitacao_id
  join public.hospedagem_reserva_solicitacoes rs on rs.reserva_id=r.id
  join public.hospedagem_solicitacoes s on s.id=rs.solicitacao_id
  where r.status_hospedagem<>'CANCELADA'
    and principal.status_solicitacao='CANCELADA'
    and s.status_solicitacao<>'CANCELADA'
  order by r.id,rs.created_at,rs.solicitacao_id
)
update public.hospedagem_reservas r
set solicitacao_id = ativa.solicitacao_id,
    updated_at = now(),
    observacao_hospedagem = concat_ws(E'\n',nullif(r.observacao_hospedagem,''),
      '[reconciliacao] Vinculo principal alterado porque a solicitacao anterior foi cancelada.')
from candidatas ativa
where ativa.reserva_id=r.id;

-- Sem qualquer solicitacao ativa, a reserva nao pode permanecer operacional.
update public.hospedagem_reservas r
set status_hospedagem='CANCELADA',
    updated_at=now(),
    observacao_hospedagem=concat_ws(E'\n',nullif(r.observacao_hospedagem,''),
      '[reconciliacao] Reserva encerrada: todas as solicitacoes vinculadas estao canceladas.')
where r.status_hospedagem<>'CANCELADA'
  and exists (
    select 1 from public.hospedagem_solicitacoes s
    where s.id=r.solicitacao_id and s.status_solicitacao='CANCELADA'
  )
  and not exists (
    select 1
    from public.hospedagem_reserva_solicitacoes rs
    join public.hospedagem_solicitacoes s on s.id=rs.solicitacao_id
    where rs.reserva_id=r.id and s.status_solicitacao<>'CANCELADA'
  );

create or replace function public.hospedagem_cancelar_solicitacao(
  p_solicitacao_id uuid,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitacao public.hospedagem_solicitacoes%rowtype;
  v_reserva record;
  v_nova_principal uuid;
  v_canceladas int := 0;
  v_reapontadas int := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticacao obrigatoria' using errcode='42501';
  end if;
  p_motivo := coalesce(nullif(btrim(p_motivo),''),'Sem motivo informado');

  select * into v_solicitacao
  from public.hospedagem_solicitacoes where id=p_solicitacao_id for update;
  if not found then raise exception 'Solicitacao nao encontrada'; end if;
  if not public.hospedagem_pode_operar(true)
     and v_solicitacao.created_by is distinct from (select auth.uid())
     and v_solicitacao.solicitante_id is distinct from (select auth.uid()) then
    raise exception 'Sem permissao para cancelar esta solicitacao' using errcode='42501';
  end if;

  update public.hospedagem_solicitacoes
  set status_solicitacao='CANCELADA',cancelado_em=now(),cancelado_por=(select auth.uid()),
      motivo_cancelamento=btrim(p_motivo),updated_at=now()
  where id=p_solicitacao_id;

  for v_reserva in
    select distinct r.id,r.solicitacao_id
    from public.hospedagem_reservas r
    left join public.hospedagem_reserva_solicitacoes rs on rs.reserva_id=r.id
    where r.solicitacao_id=p_solicitacao_id or rs.solicitacao_id=p_solicitacao_id
    for update of r
  loop
    select rs.solicitacao_id into v_nova_principal
    from public.hospedagem_reserva_solicitacoes rs
    join public.hospedagem_solicitacoes s on s.id=rs.solicitacao_id
    where rs.reserva_id=v_reserva.id and rs.solicitacao_id<>p_solicitacao_id
      and s.status_solicitacao<>'CANCELADA'
    order by rs.created_at,rs.solicitacao_id limit 1;

    if v_nova_principal is null then
      update public.hospedagem_reservas
      set status_hospedagem='CANCELADA',updated_at=now(),
          observacao_hospedagem=concat_ws(E'\n',nullif(observacao_hospedagem,''),'Cancelada: '||btrim(p_motivo))
      where id=v_reserva.id and status_hospedagem<>'CANCELADA';
      v_canceladas := v_canceladas+1;
    elsif v_reserva.solicitacao_id=p_solicitacao_id then
      update public.hospedagem_reservas set solicitacao_id=v_nova_principal,updated_at=now()
      where id=v_reserva.id;
      v_reapontadas := v_reapontadas+1;
    end if;
  end loop;

  insert into public.hospedagem_eventos
    (solicitacao_id,usuario_id,tipo_evento,descricao,status_anterior,status_novo)
  values(p_solicitacao_id,(select auth.uid()),'CANCELADA','Solicitacao cancelada: '||btrim(p_motivo),v_solicitacao.status_solicitacao,'CANCELADA');

  return jsonb_build_object('solicitacao_id',p_solicitacao_id,'reservas_canceladas',v_canceladas,'reservas_reapontadas',v_reapontadas);
end;
$$;

revoke all on function public.hospedagem_cancelar_solicitacao(uuid,text) from public;
grant execute on function public.hospedagem_cancelar_solicitacao(uuid,text) to authenticated;
