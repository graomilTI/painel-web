create or replace function public.proteger_atualizacoes_manuais_frotas_multas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sync_detran boolean := false;
begin
  -- O sincronizador do DETRAN renova raw/ultima_consulta_em em cada consulta.
  -- Esses campos identificam uma escrita originada da integração.
  v_sync_detran :=
       new.ultima_consulta_em is distinct from old.ultima_consulta_em
    or new.raw is distinct from old.raw
    or (
      new.origem is distinct from old.origem
      and upper(coalesce(new.origem, '')) = 'DETRAN'
    );

  if v_sync_detran then
    -- Workflow e auditoria operacional pertencem ao painel e não podem
    -- regredir quando o DETRAN atualizar novamente a mesma multa.
    new.acao_status := old.acao_status;
    new.condutor_identificado_em := old.condutor_identificado_em;
    new.condutor_notificado_em := old.condutor_notificado_em;
    new.multa_indicada_em := old.multa_indicada_em;
    new.multa_dobrada_em := old.multa_dobrada_em;
    new.observacoes_operacionais := old.observacoes_operacionais;
    new.arquivada_em := old.arquivada_em;
    new.arquivada_por := old.arquivada_por;
    new.motivo_arquivamento := old.motivo_arquivamento;
    new.ok_em := old.ok_em;
    new.ok_por := old.ok_por;
    new.ok_observacao := old.ok_observacao;
    new.motorista_em := old.motorista_em;
    new.motorista_por := old.motorista_por;
    new.motorista_nome := old.motorista_nome;
    new.motorista_cpf := old.motorista_cpf;
    new.identificada_em := old.identificada_em;
    new.identificada_por := old.identificada_por;
    new.identificada_obs := old.identificada_obs;
    new.dobrada_em := old.dobrada_em;
    new.dobrada_por := old.dobrada_por;
    new.dobrada_obs := old.dobrada_obs;
    new.motorista_definido_em := old.motorista_definido_em;
    new.dobrar_solicitado_em := old.dobrar_solicitado_em;
    new.identificar_solicitado_em := old.identificar_solicitado_em;

    -- Havendo ação manual, status_multa é o status efetivo do painel.
    -- A situação original do DETRAN continua atualizando em situacao.
    if nullif(trim(coalesce(old.acao_status, '')), '') is not null then
      new.status_multa := old.status_multa;
    end if;
  else
    -- Alteração feita pelo painel: a ação operacional assume precedência.
    -- Se a ação for removida, o status volta à situação vinda do DETRAN.
    if new.acao_status is distinct from old.acao_status then
      if nullif(trim(coalesce(new.acao_status, '')), '') is not null then
        new.status_multa := new.acao_status;
      elsif nullif(trim(coalesce(new.situacao, '')), '') is not null then
        new.status_multa := new.situacao;
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.proteger_atualizacoes_manuais_frotas_multas() is
'Preserva workflow operacional e status efetivo definido no painel durante sincronizacoes DETRAN. situacao permanece como estado da origem; status_multa usa acao_status quando houver acao manual.';

drop trigger if exists trg_proteger_atualizacoes_manuais_frotas_multas
  on public.frotas_multas;

create trigger trg_proteger_atualizacoes_manuais_frotas_multas
before update on public.frotas_multas
for each row
execute function public.proteger_atualizacoes_manuais_frotas_multas();

-- Corrige registros que já tinham ação manual, mas cujo status efetivo havia
-- sido recolocado como A PAGAR/VENCIDA por sincronizações anteriores.
update public.frotas_multas
set status_multa = acao_status
where nullif(trim(coalesce(acao_status, '')), '') is not null
  and status_multa is distinct from acao_status;
