-- Frotas · Manutenção: toda aprovação precisa de orçamento.
--   * remove da trava de fluxo o caminho "aprovada sem orçamento, com valor estimado por quem aprova";
--   * a coluna sem_orcamento continua nas manutenções antigas (só leitura/histórico), mas nenhuma aprovação nova a usa.

create or replace function public.frotas_manutencoes_fluxo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_nome text := public.frotas_manutencao_ator_nome();
  v_usuario boolean := auth.uid() is not null;  -- service role / migrations não passam pelas travas de permissão
  v_importando boolean := coalesce(current_setting('app.frotas_manut_importando', true), '') = '1';
  v_validos text[];
  v_orc record;
  v_veic record;
  v_qtd_itens integer;
  v_limite numeric;
begin
  if tg_op = 'INSERT' then
    if v_usuario and new.status <> 'solicitada' and not v_importando then
      raise exception 'Toda manutenção nasce como solicitada.' using errcode = 'check_violation';
    end if;
    select v.motorista_atual, v.responsavel_manutencao into v_veic
      from public.frotas_veiculos v where v.id = new.veiculo_id;
    new.responsavel_pagamento := coalesce(new.responsavel_pagamento, v_veic.responsavel_manutencao);
    new.motorista_nome := coalesce(nullif(new.motorista_nome, ''), nullif(v_veic.motorista_atual, ''));
    new.km_solicitacao := coalesce(new.km_solicitacao, public.frotas_veiculo_km_atual(new.veiculo_id));
    new.solicitado_por := coalesce(new.solicitado_por, auth.uid());
    new.solicitante_nome := coalesce(nullif(new.solicitante_nome, ''), v_nome);
    new.solicitado_em := coalesce(new.solicitado_em, now());
    new.linha_tempo := jsonb_build_array(jsonb_build_object(
      'em', now(), 'de', null, 'para', new.status, 'por', v_nome, 'nota', null));
    return new;
  end if;

  -- UPDATE: o cliente não reescreve carimbos do fluxo.
  if v_usuario then
    new.numero := old.numero;
    new.solicitado_em := old.solicitado_em;
    new.solicitado_por := old.solicitado_por;
    new.solicitante_nome := old.solicitante_nome;
    new.aprovado_em := old.aprovado_em;
    new.aprovado_por := old.aprovado_por;
    new.aprovado_por_nome := old.aprovado_por_nome;
    new.valor_aprovado := old.valor_aprovado;
    new.os_emitida_em := old.os_emitida_em;
    new.concluida_em := old.concluida_em;
    new.concluida_por_nome := old.concluida_por_nome;
    new.linha_tempo := old.linha_tempo;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_validos := case old.status
    when 'solicitada'    then array['em_orcamento','aprovada','cancelada']
    when 'em_orcamento'  then array['em_aprovacao','aprovada','cancelada']
    when 'em_aprovacao'  then array['aprovada','reprovada','em_orcamento','cancelada']
    when 'reprovada'     then array['em_orcamento','cancelada']
    when 'aprovada'      then array['em_execucao','cancelada']
    when 'em_execucao'   then array['concluida','cancelada']
    else array[]::text[]
  end;
  if not (new.status = any (v_validos)) then
    raise exception 'Não é possível mover a manutenção de "%" para "%".', old.status, new.status
      using errcode = 'check_violation';
  end if;

  select count(*) into v_qtd_itens from public.frotas_manutencao_itens where manutencao_id = new.id;

  if new.status = 'em_aprovacao' then
    if not exists (select 1 from public.frotas_manutencao_orcamentos where manutencao_id = new.id) then
      raise exception 'Cadastre ao menos um orçamento antes de enviar para aprovação.' using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'aprovada' then
    if v_usuario and not public.painel_can_approve(array['frotas_manutencao']) then
      raise exception 'Sem permissão para aprovar manutenção.' using errcode = 'insufficient_privilege';
    end if;
    if new.natureza is null then
      raise exception 'Informe a natureza (preventiva ou corretiva) antes de aprovar.' using errcode = 'check_violation';
    end if;
    if new.responsavel_pagamento is null then
      raise exception 'Informe quem paga a manutenção (empresa, locadora, colaborador ou proprietário) antes de aprovar.' using errcode = 'check_violation';
    end if;
    if v_qtd_itens = 0 then
      raise exception 'Informe ao menos um item (categoria do guia) antes de aprovar.' using errcode = 'check_violation';
    end if;
    select * into v_orc from public.frotas_manutencao_orcamentos
      where manutencao_id = new.id and selecionado limit 1;
    if found then
      new.valor_aprovado := v_orc.valor_total;
      new.oficina := coalesce(nullif(new.oficina, ''), v_orc.fornecedor);
      new.oficina_id := coalesce(new.oficina_id, v_orc.oficina_id);
    else
      raise exception 'Toda aprovação precisa de orçamento: cadastre a cotação e selecione o orçamento aprovado.' using errcode = 'check_violation';
    end if;
    if v_usuario then
      v_limite := public.frotas_manutencao_limite_aprovador();
      if v_limite is not null and new.valor_aprovado > v_limite then
        raise exception 'Valor acima da sua alçada de aprovação (limite R$ %).', v_limite using errcode = 'insufficient_privilege';
      end if;
    end if;
    new.aprovado_em := now();
    new.aprovado_por := auth.uid();
    new.aprovado_por_nome := v_nome;
  end if;

  if new.status = 'reprovada' then
    if v_usuario and not public.painel_can_approve(array['frotas_manutencao']) then
      raise exception 'Sem permissão para reprovar manutenção.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.status in ('reprovada','cancelada') and nullif(btrim(coalesce(new.motivo_status, '')), '') is null then
    raise exception 'Informe o motivo.' using errcode = 'check_violation';
  end if;

  if new.status = 'em_execucao' then
    new.os_numero := coalesce(nullif(btrim(coalesce(new.os_numero, '')), ''), 'OS-' || lpad(new.numero::text, 6, '0'));
    new.os_emitida_em := now();
    new.entrada_oficina_em := coalesce(new.entrada_oficina_em, now());
  end if;

  if new.status = 'concluida' then
    if new.data_execucao is null or new.km_execucao is null or new.custo is null then
      raise exception 'Para concluir informe data, km e custo final.' using errcode = 'check_violation';
    end if;
    new.concluida_em := now();
    new.concluida_por_nome := v_nome;
  end if;

  new.linha_tempo := coalesce(old.linha_tempo, '[]'::jsonb) || jsonb_build_object(
    'em', now(), 'de', old.status, 'para', new.status, 'por', v_nome,
    'nota', case when new.status in ('reprovada','cancelada') then new.motivo_status else null end);
  if new.status not in ('reprovada','cancelada') then
    new.motivo_status := null;
  end if;
  return new;
end;
$$;
