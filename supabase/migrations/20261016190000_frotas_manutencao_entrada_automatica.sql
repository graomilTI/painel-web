-- Frotas · Manutenção (Fase 2): entrada automática de solicitações.
--   * job diário que abre solicitação para planos do guia vencidos ou próximos (sem duplicar);
--   * importação do histórico (última troca por veículo e plano) — sem ela todo plano fica "sem histórico"
--     e nada vence;
--   * categorias e planos do guia legíveis por qualquer usuário logado (quem só pede manutenção pela
--     supervisão do veículo precisa ver a lista de categorias no formulário).

-- ============================================================
-- 1. Referência do guia legível por qualquer usuário logado
-- ============================================================
drop policy if exists frotas_manut_categorias_select on public.frotas_manutencao_categorias;
create policy frotas_manut_categorias_select on public.frotas_manutencao_categorias
  for select to authenticated using (true);

drop policy if exists frotas_manut_planos_select on public.frotas_manutencao_planos;
create policy frotas_manut_planos_select on public.frotas_manutencao_planos
  for select to authenticated using (true);

-- ============================================================
-- 2. Importação de histórico: libera inserir já concluída só dentro da função de importação
-- ============================================================
-- O trigger do fluxo exige que toda manutenção nasça "solicitada" e o dos itens trava manutenção
-- encerrada. A função de importação liga um sinalizador local da transação (app.frotas_manut_importando)
-- que só ela consegue ligar (SECURITY DEFINER) e que some ao fim da transação.
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
  v_valor_informado numeric := new.valor_aprovado;
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
    elsif new.sem_orcamento and v_valor_informado is not null then
      new.valor_aprovado := v_valor_informado;  -- aprovada sem orçamento, com valor estimado por quem aprova
    elsif new.sem_orcamento then
      raise exception 'Aprovação sem orçamento exige o valor estimado aprovado.' using errcode = 'check_violation';
    else
      raise exception 'Selecione o orçamento aprovado (ou marque "sem orçamento" e informe o valor).' using errcode = 'check_violation';
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

create or replace function public.frotas_manutencao_itens_regras()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.frotas_manutencoes
   where id = coalesce(new.manutencao_id, old.manutencao_id);
  if v_status in ('concluida','cancelada') and auth.uid() is not null
     and coalesce(current_setting('app.frotas_manut_importando', true), '') <> '1' then
    raise exception 'Manutenção % não aceita mais alteração de itens.', v_status using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

-- ============================================================
-- 3. Importar histórico (última troca por veículo e plano)
-- ============================================================
-- p_linhas: [{ "placa": "ABC1D23", "plano": "oleo_motor" | "Troca de óleo...", "data": "2026-05-10", "km": 41200 }]
-- Cada veículo/data/km vira UMA manutenção concluída (origem 'manual', custo 0, sem NF) com um item por plano.
-- Reimportar a mesma linha não duplica. Devolve { criadas, ignoradas, erros: [{ linha, motivo }] }.
create or replace function public.frotas_manutencao_importar_historico(p_linhas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := public.frotas_manutencao_ator_nome();
  v_linha jsonb;
  v_idx int := 0;
  v_veic record;
  v_plano record;
  v_data date;
  v_km numeric;
  v_validas jsonb := '[]'::jsonb;
  v_erros jsonb := '[]'::jsonb;
  v_criadas int := 0;
  v_ignoradas int := 0;
  v_grupo record;
  v_itens jsonb;
  v_id uuid;
  it jsonb;
begin
  if not public.painel_has_module(array['frotas_manutencao'], false) then
    raise exception 'Sem permissão para importar histórico de manutenção.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Nenhuma linha para importar.' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_linhas) > 5000 then
    raise exception 'Importe no máximo 5.000 linhas por vez.' using errcode = 'check_violation';
  end if;

  for v_linha in select * from jsonb_array_elements(p_linhas) loop
    v_idx := v_idx + 1;
    select id, placa into v_veic from public.frotas_veiculos
     where upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(coalesce(v_linha ->> 'placa', ''), '[^A-Za-z0-9]', '', 'g'))
     limit 1;
    if v_veic.id is null then
      v_erros := v_erros || jsonb_build_object('linha', v_idx, 'motivo', 'Placa não encontrada: ' || coalesce(v_linha ->> 'placa', '(vazia)'));
      continue;
    end if;

    select id, codigo, nome, categoria_codigo into v_plano from public.frotas_manutencao_planos
     where veiculo_id is null
       and (lower(codigo) = lower(btrim(coalesce(v_linha ->> 'plano', '')))
            or lower(nome) = lower(btrim(coalesce(v_linha ->> 'plano', ''))))
     limit 1;
    if v_plano.id is null then
      v_erros := v_erros || jsonb_build_object('linha', v_idx, 'motivo', 'Plano não encontrado: ' || coalesce(v_linha ->> 'plano', '(vazio)'));
      continue;
    end if;

    begin
      v_data := (v_linha ->> 'data')::date;
    exception when others then
      v_data := null;
    end;
    if v_data is null or v_data > (now() at time zone 'America/Sao_Paulo')::date or v_data < date '2000-01-01' then
      v_erros := v_erros || jsonb_build_object('linha', v_idx, 'motivo', 'Data inválida: ' || coalesce(v_linha ->> 'data', '(vazia)'));
      continue;
    end if;

    begin
      v_km := nullif(btrim(coalesce(v_linha ->> 'km', '')), '')::numeric;
    exception when others then
      v_km := null;
    end;
    if v_km is not null and v_km <= 0 then v_km := null; end if;

    v_validas := v_validas || jsonb_build_object(
      'veiculo_id', v_veic.id, 'placa', v_veic.placa, 'plano_id', v_plano.id, 'plano_codigo', v_plano.codigo,
      'plano_nome', v_plano.nome, 'categoria_codigo', v_plano.categoria_codigo, 'data', v_data, 'km', v_km);
  end loop;

  perform set_config('app.frotas_manut_importando', '1', true);

  for v_grupo in
    select (x ->> 'veiculo_id')::uuid as veiculo_id, (x ->> 'data')::date as data, (x ->> 'km')::numeric as km,
           (array_agg(x ->> 'placa'))[1] as placa, jsonb_agg(x) as itens
      from jsonb_array_elements(v_validas) x
     group by 1, 2, 3
  loop
    -- Itens já importados antes (mesmo veículo, data e plano) ficam de fora.
    select coalesce(jsonb_agg(i), '[]'::jsonb) into v_itens
      from jsonb_array_elements(v_grupo.itens) i
     where not exists (
       select 1 from public.frotas_manutencoes m
         join public.frotas_manutencao_itens ii on ii.manutencao_id = m.id
         join public.frotas_manutencao_planos pl on pl.id = ii.plano_id
        where m.veiculo_id = v_grupo.veiculo_id and m.status = 'concluida'
          and m.data_execucao = v_grupo.data and pl.codigo = i ->> 'plano_codigo');
    v_ignoradas := v_ignoradas + (jsonb_array_length(v_grupo.itens) - jsonb_array_length(v_itens));
    if jsonb_array_length(v_itens) = 0 then
      continue;
    end if;

    insert into public.frotas_manutencoes (
      veiculo_id, status, natureza, origem, descricao, data_execucao, km_execucao, custo, observacoes,
      solicitado_em, concluida_em, concluida_por_nome, solicitante_nome)
    values (
      v_grupo.veiculo_id, 'concluida', 'preventiva', 'manual',
      'Histórico importado: ' || (select string_agg(i ->> 'plano_nome', ', ') from jsonb_array_elements(v_itens) i),
      v_grupo.data, v_grupo.km, 0, 'Histórico importado, sem custo e sem nota fiscal.',
      ((v_grupo.data::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo'),
      ((v_grupo.data::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo'), v_nome, v_nome)
    returning id into v_id;

    for it in select * from jsonb_array_elements(v_itens) loop
      insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, descricao, plano_id)
      values (v_id, (it ->> 'categoria_codigo')::smallint, 'preventiva', it ->> 'plano_nome', (it ->> 'plano_id')::uuid);
    end loop;
    v_criadas := v_criadas + 1;
  end loop;

  perform set_config('app.frotas_manut_importando', '0', true);
  return jsonb_build_object('criadas', v_criadas, 'ignoradas', v_ignoradas, 'erros', v_erros);
exception when others then
  perform set_config('app.frotas_manut_importando', '0', true);
  raise;
end;
$$;

grant execute on function public.frotas_manutencao_importar_historico(jsonb) to authenticated;

-- ============================================================
-- 4. Job diário: planos vencidos ou próximos viram solicitação
-- ============================================================
-- Uma solicitação por veículo, com um item por plano. Só serviços (as verificações de nível/calibragem
-- não passam pelo fluxo de orçamento) e nunca "sem histórico". Não duplica: plano já em andamento fica
-- de fora, e plano com solicitação automática nos últimos 30 dias (mesmo cancelada ou reprovada) também.
-- p_executar = false só lista o que abriria. p_limite evita uma enxurrada no primeiro dia.
create or replace function public.frotas_manutencao_gerar_por_plano(p_executar boolean default true, p_limite integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_id uuid;
  v_saida jsonb := '[]'::jsonb;
  it jsonb;
begin
  for r in
    select v.veiculo_id, v.placa,
           bool_or(v.status = 'vencida') as tem_vencida,
           jsonb_agg(jsonb_build_object('plano_id', v.plano_id, 'plano_codigo', v.plano_codigo, 'categoria_codigo', v.categoria_codigo,
                                        'nome', v.plano_nome, 'status', v.status) order by v.categoria_codigo, v.plano_nome) as planos
      from public.frotas_manutencao_vencimentos_v v
     where v.status in ('vencida', 'proxima')
       and v.tipo = 'servico'
       and not v.em_andamento
       and not exists (
         select 1
           from public.frotas_manutencoes m
           join public.frotas_manutencao_itens i on i.manutencao_id = m.id
           join public.frotas_manutencao_planos pl on pl.id = i.plano_id
          where m.veiculo_id = v.veiculo_id and m.origem = 'plano'
            and pl.codigo = v.plano_codigo
            and m.solicitado_em > now() - interval '30 days')
     group by v.veiculo_id, v.placa
     order by bool_or(v.status = 'vencida') desc, v.placa
     limit greatest(coalesce(p_limite, 100), 1)
  loop
    v_id := null;
    if p_executar then
      insert into public.frotas_manutencoes (veiculo_id, origem, prioridade, descricao, solicitante_nome)
      values (r.veiculo_id, 'plano', case when r.tem_vencida then 'alta' else 'normal' end,
              'Manutenção programada: ' || (select string_agg(p ->> 'nome', ', ') from jsonb_array_elements(r.planos) p),
              'Plano de manutenção (automático)')
      returning id into v_id;
      for it in select * from jsonb_array_elements(r.planos) loop
        insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, descricao, plano_id)
        values (v_id, (it ->> 'categoria_codigo')::smallint, 'preventiva', it ->> 'nome', (it ->> 'plano_id')::uuid);
      end loop;
    end if;
    v_saida := v_saida || jsonb_build_object('veiculo_id', r.veiculo_id, 'placa', r.placa, 'manutencao_id', v_id, 'planos', r.planos);
  end loop;
  return v_saida;
end;
$$;

-- Só o cron (e o administrador do banco) chamam; o usuário do painel enxerga o resultado na lista.
revoke all on function public.frotas_manutencao_gerar_por_plano(boolean, integer) from public;

do $cron$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'frotas-manutencao-gerar-por-plano';
  perform cron.schedule('frotas-manutencao-gerar-por-plano', '0 10 * * *', 'select public.frotas_manutencao_gerar_por_plano()');
end
$cron$;
