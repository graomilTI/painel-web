-- Frotas · Manutenção (Fase 4): veículo parado na oficina propaga para a Programação e telas de ocorrência.
-- "Parado" é DERIVADO do fluxo (manutenção com veiculo_parado em execução); frotas_veiculos.status não é alterado.
--   * frotas_veiculo_indisponivel(placa, data): parado entre a entrada na oficina e a previsão de entrega
--     (ou hoje, se não há previsão nem atraso). Datas futuras além da previsão ficam livres: o veículo pode voltar.
--   * Programação: não aceita escolher placa indisponível (LOGISTICA e MOTORISTA/CARONA FROTA), só para hoje em diante
--     e só quando a placa ou o tipo muda; duplicar programação e rotinas sem usuário não são barradas.
--   * colaborador_cruzamento não sugere mais o veículo em manutenção.
--   * Avisos: quem tem a placa na Programação (gestor da supervisão e módulo Programação) é avisado quando a OS é emitida.
--   * RPCs de leitura para telas: parados por período (dossiê/excesso) e programações afetadas por uma manutenção.
-- Dossiê fora do horário, excesso de velocidade e Caixa NÃO são alterados aqui: a tela só marca (dinheiro: sem exclusão automática).

-- ============================================================
-- 1. Indisponibilidade por data
-- ============================================================
create or replace function public.frotas_veiculo_indisponivel(p_placa text, p_data date)
returns table (manutencao_id uuid, numero bigint, os_numero text, desde timestamptz, previsao_entrega date)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.numero, m.os_numero, coalesce(m.entrada_oficina_em, m.os_emitida_em), m.previsao_entrega
    from public.frotas_manutencoes m
    join public.frotas_veiculos v on v.id = m.veiculo_id
   where m.veiculo_parado and m.status = 'em_execucao'
     and coalesce(m.entrada_oficina_em, m.os_emitida_em) is not null
     and upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'))
     and p_data >= (coalesce(m.entrada_oficina_em, m.os_emitida_em) at time zone 'America/Sao_Paulo')::date
     and p_data <= greatest(coalesce(m.previsao_entrega, (now() at time zone 'America/Sao_Paulo')::date), (now() at time zone 'America/Sao_Paulo')::date);
$$;

grant execute on function public.frotas_veiculo_indisponivel(text, date) to authenticated;

-- ============================================================
-- 2. Programação: bloqueio ao escolher a placa
-- ============================================================
create or replace function public.validar_veiculo_parado_programacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placa text;
  v_data date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
begin
  -- Rotinas e agentes (sem usuário) e a duplicação de programação não passam pelo bloqueio.
  if auth.uid() is null or coalesce(current_setting('app.programacao_duplicando', true), '') = '1' then
    return new;
  end if;

  if tg_table_name = 'programacao_colaboradores' then
    if upper(trim(coalesce(new.disponibilidade, ''))) <> 'LOGISTICA' then return new; end if;
  else
    if upper(trim(coalesce(new.tipo_deslocamento, ''))) not in ('MOTORISTA FROTA', 'CARONA FROTA') then return new; end if;
  end if;

  v_placa := regexp_replace(upper(coalesce(new.placa_veiculo, '')), '[^A-Z0-9]', '', 'g');
  if v_placa = '' then return new; end if;

  -- Regravar a mesma linha (placa e uso iguais) não é escolher o veículo de novo.
  -- Um IF por tabela: o plpgsql não aceita referenciar, na mesma expressão, campo que a outra tabela não tem.
  if tg_op = 'UPDATE' and regexp_replace(upper(coalesce(old.placa_veiculo, '')), '[^A-Z0-9]', '', 'g') = v_placa then
    if tg_table_name = 'programacao_colaboradores' then
      if upper(trim(coalesce(old.disponibilidade, ''))) = upper(trim(coalesce(new.disponibilidade, ''))) then return new; end if;
    else
      if upper(trim(coalesce(old.tipo_deslocamento, ''))) = upper(trim(coalesce(new.tipo_deslocamento, ''))) then return new; end if;
    end if;
  end if;

  select pd.data_referencia into v_data from public.programacao_dia pd where pd.id = new.programacao_id;
  if v_data is null or v_data < v_hoje then return new; end if;

  select * into r from public.frotas_veiculo_indisponivel(v_placa, v_data) limit 1;
  if found then
    raise exception using
      errcode = '23514',
      message = format('Placa %s indisponível em %s: veículo em manutenção (%s) desde %s%s. Escolha outro veículo.',
                       v_placa, to_char(v_data, 'DD/MM/YYYY'), coalesce(r.os_numero, 'MAN-' || lpad(r.numero::text, 6, '0')),
                       to_char(r.desde at time zone 'America/Sao_Paulo', 'DD/MM'),
                       case when r.previsao_entrega is not null then ', previsão de entrega ' || to_char(r.previsao_entrega, 'DD/MM') else '' end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_veiculo_parado_colaboradores on public.programacao_colaboradores;
create trigger trg_validar_veiculo_parado_colaboradores
  before insert or update on public.programacao_colaboradores
  for each row execute function public.validar_veiculo_parado_programacao();

drop trigger if exists trg_validar_veiculo_parado_deslocamento on public.programacao_deslocamento;
create trigger trg_validar_veiculo_parado_deslocamento
  before insert or update on public.programacao_deslocamento
  for each row execute function public.validar_veiculo_parado_programacao();

-- ============================================================
-- 3. Duplicar programação não é barrada (copia placas como estão)
-- ============================================================
CREATE OR REPLACE FUNCTION public.duplicar_programacao_dia(p_programacao_id uuid, p_datas date[], p_copiar_estadias boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_resultado jsonb;
  v_origem public.programacao_dia%rowtype;
  v_data date;
  v_destino_id uuid;
begin
  -- A duplicação copia as placas como estão; o bloqueio de veículo em manutenção vale só para edição direta.
  perform set_config('app.programacao_duplicando', '1', true);

  select * into v_origem
  from public.programacao_dia
  where id = p_programacao_id;

  if not found then
    raise exception 'Programação de origem não encontrada.' using errcode = 'P0002';
  end if;

  if to_regprocedure('public.duplicar_programacao_dia_base_20260817(uuid,date[],boolean)') is not null then
    v_resultado := public.duplicar_programacao_dia_base_20260817(
      p_programacao_id,
      p_datas,
      p_copiar_estadias
    );
  else
    v_resultado := public.duplicar_programacao_dia_base_20260813(
      p_programacao_id,
      p_datas
    );
  end if;

  for v_data in
    select value::date
    from jsonb_array_elements_text(coalesce(v_resultado -> 'copiadas', '[]'::jsonb))
  loop
    select id into v_destino_id
    from public.programacao_dia
    where data_referencia = v_data
      and supervisao is not distinct from v_origem.supervisao
    order by created_at desc, id desc
    limit 1;

    if v_destino_id is null then
      raise exception 'Destino da duplicação não foi localizado para %.', v_data;
    end if;

    update public.programacao_colaboradores destino
    set data_referencia = v_data,
        nome_colaborador = origem.nome_colaborador,
        cargo = origem.cargo,
        coordenacao = origem.coordenacao,
        supervisao = origem.supervisao,
        disponibilidade = origem.disponibilidade,
        observacao = origem.observacao,
        placa_veiculo = origem.placa_veiculo
    from public.programacao_colaboradores origem
    where origem.programacao_id = p_programacao_id
      and destino.programacao_id = v_destino_id
      and destino.colaborador_id = origem.colaborador_id;

    -- Reconciliação defensiva da equipe por O.S. A função-base já deveria
    -- copiar estes vínculos, mas alguns destinos ficavam apenas com o roster
    -- de colaboradores e nenhuma linha em programacao_equipe. Esta etapa é
    -- idempotente e repõe somente os pares que estiverem faltando.
    insert into public.programacao_equipe (
      programacao_id, os_id, colaborador_id, nome_colaborador, score,
      score_contrato, score_distancia, score_auditoria, km_estimado, confirmado,
      ordem_rota, duracao_min, rota_geometria, rota_calculada_em
    )
    select
      v_destino_id, origem.os_id, origem.colaborador_id, origem.nome_colaborador,
      origem.score, origem.score_contrato, origem.score_distancia,
      origem.score_auditoria, origem.km_estimado, origem.confirmado,
      origem.ordem_rota, origem.duracao_min, null, null
    from public.programacao_equipe origem
    where origem.programacao_id = p_programacao_id
    on conflict (programacao_id, os_id, colaborador_id) do nothing;

    update public.programacao_dia
    set updated_at = clock_timestamp()
    where id = v_destino_id;
  end loop;

  perform set_config('app.programacao_duplicando', '0', true);
  return v_resultado;
end;
$function$;

-- ============================================================
-- 4. Cruzamento: não sugerir o veículo que está na oficina
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_colaborador_cruzamento()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  truncate table public.colaborador_cruzamento;

  with veic_norm as (
    select
      v.id,
      v.placa,
      v.updated_at,
      trim(regexp_replace(upper(unaccent(coalesce(
        nullif(trim(v.motorista_atual), ''),
        nullif(trim(v.patrimonio_funcionario), ''),
        nullif(trim(v.bfleet_condutor), ''),
        nullif(trim(v.condutor_patrimonio), '')
      ))), '[^A-Z0-9]+', ' ', 'g')) as nome_chave
    from public.frotas_veiculos v
    where v.status = 'ATIVO'
      and not exists (select 1 from public.frotas_veiculos_parados() p where p.placa = v.placa)
  ),
  veic_best as (
    select distinct on (nome_chave) nome_chave, id, placa
    from veic_norm
    where nome_chave <> ''
    order by nome_chave, updated_at desc
  ),
  base_norm as (
    select
      regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') as cpf_norm,
      b.latitude,
      b.longitude,
      b.endereco_base
    from public.operacional_colaborador_base b
    where b.ativo is true
      and regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') <> ''
  ),
  base_best as (
    select distinct on (cpf_norm) cpf_norm, latitude, longitude, endereco_base
    from base_norm
    order by cpf_norm
  ),
  aud_agg as (
    select
      a.nome_chave,
      count(*)::int as qtd,
      sum(1 + abs(coalesce(a.score_impacto, 0)))::numeric as peso
    from public.operacional_auditoria_colaborador a
    where a.data_evento >= (current_date - 180)
    group by a.nome_chave
  )
  insert into public.colaborador_cruzamento (
    colaborador_id, cpf, nome, nome_chave, supervisao, coordenacao, tipo_contrato,
    latitude, longitude, endereco_base, veiculo_id, veiculo_placa,
    auditorias_180d_qtd, auditorias_180d_peso, salario, atualizado_em
  )
  select
    c.id,
    regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'),
    c.nome,
    trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g')) as nome_chave,
    c.supervisao,
    c.coordenacao,
    c.tipo,
    bb.latitude,
    bb.longitude,
    bb.endereco_base,
    vb.id,
    vb.placa,
    coalesce(aa.qtd, 0),
    coalesce(aa.peso, 0),
    nullif(trim(c.salario), '')::numeric,
    now()
  from public.colaboradores c
  left join base_best bb on bb.cpf_norm = regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') and bb.cpf_norm <> ''
  left join veic_best vb on vb.nome_chave = trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g')) and vb.nome_chave <> ''
  left join aud_agg aa on aa.nome_chave = trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g'))
  where upper(unaccent(coalesce(c.situacao, ''))) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
    and coalesce(c.desligamento, '') = '';
end;
$function$;

-- ============================================================
-- 5. Leituras para as telas
-- ============================================================
-- Veículos parados que intersectam um período (inclui OS já concluída): dossiê, excesso de velocidade.
create or replace function public.frotas_veiculos_parados_periodo(p_inicio date, p_fim date)
returns table (placa text, manutencao_id uuid, numero bigint, os_numero text, dia_inicio date, dia_fim date)
language sql
stable
security definer
set search_path = public
as $$
  select v.placa, m.id, m.numero, m.os_numero,
         (coalesce(m.entrada_oficina_em, m.os_emitida_em) at time zone 'America/Sao_Paulo')::date,
         case when m.status = 'em_execucao' then null else (m.concluida_em at time zone 'America/Sao_Paulo')::date end
    from public.frotas_manutencoes m
    join public.frotas_veiculos v on v.id = m.veiculo_id
   where m.veiculo_parado
     and m.status in ('em_execucao', 'concluida')
     and coalesce(m.entrada_oficina_em, m.os_emitida_em) is not null
     and (coalesce(m.entrada_oficina_em, m.os_emitida_em) at time zone 'America/Sao_Paulo')::date <= p_fim
     and (m.status = 'em_execucao' or (m.concluida_em at time zone 'America/Sao_Paulo')::date >= p_inicio);
$$;

grant execute on function public.frotas_veiculos_parados_periodo(date, date) to authenticated;

-- Quem já tem o veículo desta manutenção na Programação (de hoje em diante, até a previsão de entrega).
create or replace function public.frotas_manutencao_programacoes_afetadas(p_manutencao uuid)
returns table (data date, supervisao text, colaborador text, uso text, placa text)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select m.id, v.placa,
           regexp_replace(upper(v.placa), '[^A-Z0-9]', '', 'g') as placa_norm,
           (coalesce(m.entrada_oficina_em, m.os_emitida_em) at time zone 'America/Sao_Paulo')::date as inicio,
           (now() at time zone 'America/Sao_Paulo')::date as hoje,
           m.previsao_entrega
      from public.frotas_manutencoes m
      join public.frotas_veiculos v on v.id = m.veiculo_id
     where m.id = p_manutencao and m.veiculo_parado and m.status = 'em_execucao'
       and coalesce(m.entrada_oficina_em, m.os_emitida_em) is not null
       and (public.painel_has_module(array['frotas_manutencao', 'programacao', 'frotas'], false) or auth.uid() is null)
  )
  select pd.data_referencia, coalesce(nullif(trim(pc.supervisao), ''), pd.supervisao), pc.nome_colaborador, 'Logística (veículo do dia)', m.placa
    from m
    join public.programacao_colaboradores pc on regexp_replace(upper(coalesce(pc.placa_veiculo, '')), '[^A-Z0-9]', '', 'g') = m.placa_norm
                                            and upper(trim(coalesce(pc.disponibilidade, ''))) = 'LOGISTICA'
    join public.programacao_dia pd on pd.id = pc.programacao_id
   where pd.data_referencia >= greatest(m.inicio, m.hoje)
     and pd.data_referencia <= greatest(coalesce(m.previsao_entrega, m.hoje), m.hoje)
  union all
  select pd.data_referencia, coalesce(nullif(trim(pc.supervisao), ''), pd.supervisao), coalesce(pc.nome_colaborador, d.colaborador_id::text),
         initcap(lower(d.tipo_deslocamento)), m.placa
    from m
    join public.programacao_deslocamento d on regexp_replace(upper(coalesce(d.placa_veiculo, '')), '[^A-Z0-9]', '', 'g') = m.placa_norm
                                          and upper(trim(coalesce(d.tipo_deslocamento, ''))) in ('MOTORISTA FROTA', 'CARONA FROTA')
    join public.programacao_dia pd on pd.id = d.programacao_id
    left join public.programacao_colaboradores pc on pc.programacao_id = d.programacao_id and pc.colaborador_id = d.colaborador_id
   where pd.data_referencia >= greatest(m.inicio, m.hoje)
     and pd.data_referencia <= greatest(coalesce(m.previsao_entrega, m.hoje), m.hoje)
  order by 1, 3;
$$;

grant execute on function public.frotas_manutencao_programacoes_afetadas(uuid) to authenticated;

-- ============================================================
-- 6. Aviso: veículo entrou em manutenção e está na Programação
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
