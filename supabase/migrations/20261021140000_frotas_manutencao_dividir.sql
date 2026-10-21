-- Frotas · Manutenção: separar da solicitação só o que foi marcado (Solicitações → Cotações).
-- A tela de Manutenção passou a seguir o modelo de Compras (etapas: Solicitações, Cotações, Em andamento, À pagar,
-- Aguardando NF, Concluído). Na solicitação a pessoa marca peças, mão de obra ou serviços; só o marcado segue para a
-- cotação e o resto fica em Solicitações. Como cada manutenção tem UM status, o marcado vira uma manutenção nova
-- (dividida_de aponta para a de origem) e os itens são movidos ou divididos por componente.
--   * frotas_manutencoes.dividida_de: de qual manutenção os itens foram separados.
--   * frotas_manutencao_dividir(manutencao, selecao): só em "solicitada"; devolve o id da nova manutenção (também
--     "solicitada"; a tela a leva para orçamento pelo caminho normal, com todas as regras do trigger).
--   * notificar_frotas_manutencao(): a nova solicitação separada não avisa a equipe de novo (flag local da transação).

alter table public.frotas_manutencoes
  add column if not exists dividida_de uuid references public.frotas_manutencoes(id) on delete set null;

comment on column public.frotas_manutencoes.dividida_de is
  'Manutenção de onde estes itens foram separados ao mandar só parte da solicitação para cotação.';

create index if not exists idx_frotas_manutencoes_dividida_de on public.frotas_manutencoes (dividida_de) where dividida_de is not null;

-- ============================================================
-- 1. Aviso de nova solicitação: não repete para a solicitação separada
-- ============================================================
create or replace function public.notificar_frotas_manutencao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_placa text;
  v_cod text := 'MAN-' || lpad(new.numero::text, 6, '0');
  v_ts text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_ator uuid := auth.uid();
  v_resumo text;
  v_prio text;
  v_orc record;
  r record;
  v_base text;
begin
  select placa into v_placa from public.frotas_veiculos where id = new.veiculo_id;
  v_resumo := concat_ws(' | ', v_placa, nullif(left(coalesce(new.descricao, ''), 90), ''));
  v_prio := case new.prioridade when 'urgente' then 'urgente' when 'alta' then 'atencao' else 'normal' end;
  v_base := 'frotas_manut:' || new.id::text || ':' || new.status || ':' || v_ts;

  if tg_op = 'INSERT' then
    -- Itens separados de uma solicitação (frotas_manutencao_dividir) não avisam a equipe de novo.
    if coalesce(current_setting('app.frotas_manut_dividindo', true), '') = 'on' then
      return new;
    end if;
    if new.status = 'solicitada' and new.origem <> 'plano' then
      perform private.frotas_manut_notificar('frotas_manut_solicitada', 'Nova solicitação de manutenção — ' || v_cod,
        concat_ws(' | ', v_resumo, 'Solicitante: ' || coalesce(new.solicitante_nome, 'não identificado')),
        v_prio, 'wrench', new.id, v_base, 'frotas_manutencao', null, v_ator);
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'em_aprovacao' then
    select fornecedor, valor_total into v_orc from public.frotas_manutencao_orcamentos
     where manutencao_id = new.id and selecionado limit 1;
    for r in select usuario_auth_id from public.frotas_manutencao_aprovadores() where usuario_auth_id is distinct from v_ator loop
      perform private.frotas_manut_notificar('frotas_manut_aprovacao', 'Manutenção aguardando aprovação — ' || v_cod,
        concat_ws(' | ', v_resumo,
          case when v_orc.valor_total is not null then 'Orçamento: ' || private.frotas_brl(v_orc.valor_total) || coalesce(' (' || v_orc.fornecedor || ')', '') end),
        case when new.prioridade = 'urgente' then 'urgente' else 'atencao' end, 'clipboard-check', new.id,
        v_base || ':' || r.usuario_auth_id::text, null, r.usuario_auth_id, v_ator);
    end loop;

  elsif new.status = 'aprovada' then
    if new.solicitado_por is not null and new.solicitado_por is distinct from v_ator then
      perform private.frotas_manut_notificar('frotas_manut_aprovada', 'Sua solicitação de manutenção foi aprovada — ' || v_cod,
        concat_ws(' | ', v_resumo, 'Valor aprovado: ' || private.frotas_brl(new.valor_aprovado)),
        'normal', 'check-circle', new.id, v_base || ':solicitante', null, new.solicitado_por, v_ator);
    end if;
    perform private.frotas_manut_notificar('frotas_manut_aprovada', 'Manutenção aprovada, emitir a OS — ' || v_cod,
      concat_ws(' | ', v_resumo, 'Valor aprovado: ' || private.frotas_brl(new.valor_aprovado), new.oficina),
      'atencao', 'clipboard-check', new.id, v_base || ':equipe', 'frotas_manutencao', null, v_ator);

  elsif new.status = 'reprovada' then
    if new.solicitado_por is not null and new.solicitado_por is distinct from v_ator then
      perform private.frotas_manut_notificar('frotas_manut_reprovada', 'Sua solicitação de manutenção foi reprovada — ' || v_cod,
        concat_ws(' | ', v_resumo, 'Motivo: ' || nullif(btrim(coalesce(new.motivo_status, '')), '')),
        'atencao', 'clipboard-alert', new.id, v_base || ':solicitante', null, new.solicitado_por, v_ator);
    end if;
    perform private.frotas_manut_notificar('frotas_manut_reprovada', 'Manutenção reprovada, refazer o orçamento — ' || v_cod,
      concat_ws(' | ', v_resumo, 'Motivo: ' || nullif(btrim(coalesce(new.motivo_status, '')), '')),
      'atencao', 'clipboard-alert', new.id, v_base || ':equipe', 'frotas_manutencao', null, v_ator);

  elsif new.status = 'em_execucao' then
    if new.solicitado_por is not null and new.solicitado_por is distinct from v_ator then
      perform private.frotas_manut_notificar('frotas_manut_os', 'Veículo na oficina — ' || coalesce(new.os_numero, v_cod),
        concat_ws(' | ', v_resumo, new.oficina, case when new.previsao_entrega is not null then 'Previsão: ' || to_char(new.previsao_entrega, 'DD/MM/YYYY') end),
        'normal', 'wrench', new.id, v_base, null, new.solicitado_por, v_ator);
    end if;

    -- Veículo parado: quem já tem este veículo na Programação precisa saber para trocar.
    if new.veiculo_parado then
      for r in
        select a.supervisao, count(*) as qtd,
               string_agg(distinct to_char(a.data, 'DD/MM'), ', ') as datas
          from public.frotas_manutencao_programacoes_afetadas(new.id) a
         group by a.supervisao
      loop
        insert into public.painel_notificacoes
          (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_perfil, destinatario_modulo, supervisao,
           gerado_por_usuario_id, referencia_tabela, referencia_id, chave_dedup, meta)
        select 'frotas_manut_programacao',
               'Veículo ' || v_placa || ' entrou em manutenção e está na Programação',
               concat_ws(' | ', 'Supervisão ' || coalesce(r.supervisao, '—'), r.qtd || ' lançamento(s) em ' || r.datas,
                         'Troque o veículo: ele fica indisponível até ' || coalesce(to_char(new.previsao_entrega, 'DD/MM'), 'a conclusão da OS') || '.'),
               'urgente', 'package-alert', 'programacao', d.perfil, d.modulo, case when d.perfil is not null then r.supervisao end,
               v_ator, 'frotas_manutencoes', new.id::text,
               v_base || ':prog:' || d.alvo || ':' || coalesce(r.supervisao, ''), jsonb_build_object('excluir_autor', true)
          from (values ('GESTOR'::text, null::text, 'gestor'), (null, 'programacao', 'modulo')) as d(perfil, modulo, alvo)
        on conflict (chave_dedup) do nothing;
      end loop;
    end if;

  elsif new.status = 'concluida' then
    if new.solicitado_por is not null and new.solicitado_por is distinct from v_ator then
      perform private.frotas_manut_notificar('frotas_manut_concluida', 'Manutenção concluída — ' || v_cod,
        concat_ws(' | ', v_resumo, 'Custo final: ' || private.frotas_brl(new.custo)),
        'normal', 'check-circle', new.id, v_base, null, new.solicitado_por, v_ator);
    end if;

  elsif new.status = 'cancelada' then
    if new.solicitado_por is not null and new.solicitado_por is distinct from v_ator then
      perform private.frotas_manut_notificar('frotas_manut_cancelada', 'Manutenção cancelada — ' || v_cod,
        concat_ws(' | ', v_resumo, 'Motivo: ' || nullif(btrim(coalesce(new.motivo_status, '')), '')),
        'normal', 'clipboard-alert', new.id, v_base || ':solicitante', null, new.solicitado_por, v_ator);
    end if;
    perform private.frotas_manut_notificar('frotas_manut_cancelada', 'Manutenção cancelada — ' || v_cod,
      concat_ws(' | ', v_resumo, 'Motivo: ' || nullif(btrim(coalesce(new.motivo_status, '')), '')),
      'normal', 'clipboard-alert', new.id, v_base || ':equipe', 'frotas_manutencao', null, v_ator);
  end if;

  return new;
exception when others then
  raise warning 'notificar_frotas_manutencao: %', sqlerrm;
  return new;
end;
$$;

-- ============================================================
-- 2. Separar os itens marcados
-- ============================================================
-- p_selecao: [{ "item_id": uuid, "componentes": ["Pastilha de freio", "Mão de obra"] }, ...]
-- Item sem componentes (veio de checklist ou de texto livre) vai inteiro; com componentes, vai o que foi marcado e o
-- resto fica no item original (descrição e peças escolhidas acompanham).
create or replace function public.frotas_manutencao_dividir(p_manutencao uuid, p_selecao jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.frotas_manutencoes%rowtype;
  it public.frotas_manutencao_itens%rowtype;
  sel jsonb;
  v_novo uuid;
  v_marcados text[];
  v_vao text[];
  v_ficam text[];
  v_linhas_total integer;
  v_linhas_vao integer := 0;
begin
  if not public.painel_has_module(array['frotas_manutencao'], false) then
    raise exception 'Sem permissão para separar itens da manutenção.' using errcode = 'insufficient_privilege';
  end if;

  select * into m from public.frotas_manutencoes where id = p_manutencao for update;
  if not found then
    raise exception 'Manutenção não encontrada.' using errcode = 'no_data_found';
  end if;
  if m.status <> 'solicitada' then
    raise exception 'Só dá para separar itens de uma solicitação que ainda não foi cotada.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_selecao) is distinct from 'array' or jsonb_array_length(p_selecao) = 0 then
    raise exception 'Marque ao menos um item para separar.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(greatest(cardinality(componentes), 1)), 0) into v_linhas_total
    from public.frotas_manutencao_itens where manutencao_id = p_manutencao;

  -- Conta o que vai, para conferir que sobra algo na solicitação de origem.
  for sel in select * from jsonb_array_elements(p_selecao) loop
    select * into it from public.frotas_manutencao_itens
     where id = (sel ->> 'item_id')::uuid and manutencao_id = p_manutencao;
    if not found then
      raise exception 'Item da seleção não pertence a esta manutenção.' using errcode = 'check_violation';
    end if;
    v_marcados := case when jsonb_typeof(sel -> 'componentes') = 'array'
                       then array(select jsonb_array_elements_text(sel -> 'componentes')) else '{}'::text[] end;
    if cardinality(it.componentes) = 0 or cardinality(v_marcados) = 0 then
      v_linhas_vao := v_linhas_vao + greatest(cardinality(it.componentes), 1);
    else
      v_linhas_vao := v_linhas_vao + (select count(*) from unnest(it.componentes) c where c = any (v_marcados));
    end if;
  end loop;

  if v_linhas_vao = 0 then
    raise exception 'Marque ao menos um item para separar.' using errcode = 'check_violation';
  end if;
  if v_linhas_vao >= v_linhas_total then
    raise exception 'Todos os itens foram marcados: não é preciso separar, envie a solicitação inteira.' using errcode = 'check_violation';
  end if;

  perform set_config('app.frotas_manut_dividindo', 'on', true);
  insert into public.frotas_manutencoes
    (veiculo_id, descricao, prioridade, origem, veiculo_parado, solicitante_nome, solicitado_por, solicitado_em,
     km_solicitacao, natureza, responsavel_pagamento, motorista_nome, diagnostico, dividida_de)
  values
    (m.veiculo_id, m.descricao, m.prioridade, m.origem, m.veiculo_parado, m.solicitante_nome, m.solicitado_por, m.solicitado_em,
     m.km_solicitacao, m.natureza, m.responsavel_pagamento, m.motorista_nome, m.diagnostico, m.id)
  returning id into v_novo;
  perform set_config('app.frotas_manut_dividindo', 'off', true);

  for sel in select * from jsonb_array_elements(p_selecao) loop
    select * into it from public.frotas_manutencao_itens
     where id = (sel ->> 'item_id')::uuid and manutencao_id = p_manutencao;
    v_marcados := case when jsonb_typeof(sel -> 'componentes') = 'array'
                       then array(select jsonb_array_elements_text(sel -> 'componentes')) else '{}'::text[] end;

    if cardinality(it.componentes) = 0 or cardinality(v_marcados) = 0 or v_marcados @> it.componentes then
      update public.frotas_manutencao_itens set manutencao_id = v_novo where id = it.id;
    else
      v_vao := array(select c from unnest(it.componentes) with ordinality t(c, o) where c = any (v_marcados) order by o);
      v_ficam := array(select c from unnest(it.componentes) with ordinality t(c, o) where not (c = any (v_marcados)) order by o);
      insert into public.frotas_manutencao_itens
        (manutencao_id, categoria_codigo, natureza, tipo_item, descricao, plano_id, observacoes, componentes, pecas)
      values
        (v_novo, it.categoria_codigo, it.natureza, it.tipo_item, array_to_string(v_vao, ', '), it.plano_id, it.observacoes, v_vao,
         coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(it.pecas) e where e.key = any (v_vao)), '{}'::jsonb));
      update public.frotas_manutencao_itens
         set componentes = v_ficam,
             descricao = array_to_string(v_ficam, ', '),
             pecas = coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(it.pecas) e where e.key = any (v_ficam)), '{}'::jsonb)
       where id = it.id;
    end if;
  end loop;

  return v_novo;
end;
$$;

revoke all on function public.frotas_manutencao_dividir(uuid, jsonb) from public;
grant execute on function public.frotas_manutencao_dividir(uuid, jsonb) to authenticated;
