-- Frotas · Manutenção (Fase 3): avisos por etapa (sino + push) e lembretes de atraso.
-- Mesmo molde de notificar_painel_abertura_os (20260925120000): a linha em painel_notificacoes dispara o push
-- pelo trigger push_disparar_notificacao e aparece no sino (notificacoes-engine.js). Aviso nunca pode impedir a
-- ação do usuário: o trigger engole qualquer erro.
--
--   solicitada   -> equipe do módulo Manutenção (menos quem pediu)
--   em aprovação -> aprovadores (pode aprovar); sem nenhum cadastrado, os Master
--   aprovada     -> solicitante + equipe (emitir a OS)
--   reprovada    -> solicitante + equipe (refazer o orçamento)
--   em execução  -> solicitante (veículo foi para a oficina)
--   concluída    -> solicitante
--   cancelada    -> solicitante + equipe
-- Solicitações abertas pelo job de planos NÃO geram um aviso cada (seriam dezenas): o job manda um resumo.
-- Lembretes diários (dias úteis, 08h de Brasília): orçamento parado, aprovação pendente, OS não emitida e
-- OS em execução além da previsão. Um aviso-resumo por tipo e por dia (chave de deduplicação com a data).

-- ============================================================
-- 1. Quem aprova
-- ============================================================
create or replace function public.frotas_manutencao_aprovadores()
returns table (usuario_auth_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with explicitos as (
    select distinct coalesce(au.auth_user_id, au.id) as uid
      from public.app_usuarios au
      join public.app_usuario_modulos um on um.usuario_id = au.id and coalesce(um.ativo, true) and um.pode_aprovar
      join public.app_modulos m on m.id = um.modulo_id and m.ativo
     where lower(coalesce(au.status, '')) = 'ativo'
       and upper(m.codigo) = 'FROTAS_MANUTENCAO'
  )
  select uid from explicitos
  union
  select coalesce(au.auth_user_id, au.id)
    from public.app_usuarios au
    left join public.app_perfis p on p.id = au.perfil_id
   where lower(coalesce(au.status, '')) = 'ativo'
     and upper(coalesce(p.codigo, '')) = 'MASTER'
     and not exists (select 1 from explicitos);
$$;

revoke all on function public.frotas_manutencao_aprovadores() from public, anon, authenticated;

-- ============================================================
-- 2. Gravação do aviso
-- ============================================================
-- Moeda no padrão brasileiro, independente do locale do servidor.
create or replace function private.frotas_brl(p_valor numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || translate(to_char(coalesce(p_valor, 0), 'FM999,999,999,990.00'), ',.', '.,');
$$;
create or replace function private.frotas_manut_notificar(
  p_tipo text, p_titulo text, p_desc text, p_prioridade text, p_icone text,
  p_manut uuid, p_chave text,
  p_modulo text default null, p_usuario uuid default null, p_autor uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo, destinatario_usuario_id,
     gerado_por_usuario_id, referencia_tabela, referencia_id, chave_dedup, meta)
  values
    (p_tipo, p_titulo, p_desc, p_prioridade, p_icone,
     'frotas-manutencao-grupo' || case when p_manut is not null then '?abrir=' || p_manut::text else '' end,
     p_modulo, p_usuario, p_autor,
     case when p_manut is not null then 'frotas_manutencoes' end, p_manut::text, p_chave,
     case when p_modulo is not null and p_autor is not null then jsonb_build_object('excluir_autor', true) end)
  on conflict (chave_dedup) do nothing;
end;
$$;

revoke all on function private.frotas_manut_notificar(text, text, text, text, text, uuid, text, text, uuid, uuid) from public;

-- ============================================================
-- 3. Avisos por etapa
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

drop trigger if exists trg_notificar_frotas_manutencao on public.frotas_manutencoes;
create trigger trg_notificar_frotas_manutencao
  after insert or update of status on public.frotas_manutencoes
  for each row
  execute function public.notificar_frotas_manutencao();

-- ============================================================
-- 4. Job por plano: um resumo em vez de um aviso por solicitação
-- ============================================================
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
  v_vencidas int := 0;
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
      if r.tem_vencida then v_vencidas := v_vencidas + 1; end if;
    end if;
    v_saida := v_saida || jsonb_build_object('veiculo_id', r.veiculo_id, 'placa', r.placa, 'manutencao_id', v_id, 'planos', r.planos);
  end loop;

  if p_executar and jsonb_array_length(v_saida) > 0 then
    perform private.frotas_manut_notificar('frotas_manut_plano',
      jsonb_array_length(v_saida) || case when jsonb_array_length(v_saida) = 1 then ' veículo com manutenção programada' else ' veículos com manutenção programada' end,
      'Solicitações abertas pelo plano de manutenção' || case when v_vencidas > 0 then ' (' || v_vencidas || ' com serviço vencido)' else '' end || '. Revise e peça os orçamentos.',
      case when v_vencidas > 0 then 'atencao' else 'normal' end, 'wrench', null,
      'frotas_manut_plano:' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYYMMDD'), 'frotas_manutencao', null, null);
  end if;
  return v_saida;
end;
$$;

revoke all on function public.frotas_manutencao_gerar_por_plano(boolean, integer) from public;

-- ============================================================
-- 5. Lembretes de atraso (um resumo por tipo e por dia)
-- ============================================================
create or replace function public.frotas_manutencao_lembretes(
  p_dias_orcamento integer default 3, p_dias_aprovacao integer default 2,
  p_dias_os integer default 3, p_dias_sem_previsao integer default 15)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYYMMDD');
  v_qtd int;
  v_lista text;
  v_saida jsonb := '{}'::jsonb;
  r record;
begin
  -- Orçamento parado: segue com a equipe.
  select count(*), string_agg(x.txt, '; ' order by x.dias desc) filter (where x.n <= 5) into v_qtd, v_lista
    from (
      select 'MAN-' || lpad(m.numero::text, 6, '0') || ' ' || coalesce(v.placa, '') || ' (' || extract(day from now() - u.ultima)::int || 'd)' as txt,
             extract(day from now() - u.ultima)::int as dias,
             row_number() over (order by u.ultima) as n
        from public.frotas_manutencoes m
        join public.frotas_veiculos v on v.id = m.veiculo_id
        cross join lateral (select coalesce((m.linha_tempo -> -1 ->> 'em')::timestamptz, m.updated_at) as ultima) u
       where m.status = 'em_orcamento' and u.ultima < now() - make_interval(days => p_dias_orcamento)
    ) x;
  if v_qtd > 0 then
    perform private.frotas_manut_notificar('frotas_manut_lembrete',
      v_qtd || case when v_qtd = 1 then ' manutenção em orçamento há mais de ' else ' manutenções em orçamento há mais de ' end || p_dias_orcamento || ' dias',
      v_lista, 'atencao', 'wrench', null, 'frotas_manut_lembrete:orcamento:' || v_dia, 'frotas_manutencao', null, null);
  end if;
  v_saida := v_saida || jsonb_build_object('orcamento', coalesce(v_qtd, 0));

  -- Aprovação pendente: segue com cada aprovador.
  select count(*), string_agg(x.txt, '; ' order by x.dias desc) filter (where x.n <= 5) into v_qtd, v_lista
    from (
      select 'MAN-' || lpad(m.numero::text, 6, '0') || ' ' || coalesce(v.placa, '') || ' (' || extract(day from now() - u.ultima)::int || 'd)' as txt,
             extract(day from now() - u.ultima)::int as dias,
             row_number() over (order by u.ultima) as n
        from public.frotas_manutencoes m
        join public.frotas_veiculos v on v.id = m.veiculo_id
        cross join lateral (select coalesce((m.linha_tempo -> -1 ->> 'em')::timestamptz, m.updated_at) as ultima) u
       where m.status = 'em_aprovacao' and u.ultima < now() - make_interval(days => p_dias_aprovacao)
    ) x;
  if v_qtd > 0 then
    for r in select usuario_auth_id from public.frotas_manutencao_aprovadores() loop
      perform private.frotas_manut_notificar('frotas_manut_lembrete',
        v_qtd || case when v_qtd = 1 then ' manutenção aguardando a sua aprovação há mais de ' else ' manutenções aguardando aprovação há mais de ' end || p_dias_aprovacao || ' dias',
        v_lista, 'urgente', 'clipboard-check', null, 'frotas_manut_lembrete:aprovacao:' || v_dia || ':' || r.usuario_auth_id::text, null, r.usuario_auth_id, null);
    end loop;
  end if;
  v_saida := v_saida || jsonb_build_object('aprovacao', coalesce(v_qtd, 0));

  -- Aprovada e sem OS: equipe.
  select count(*), string_agg(x.txt, '; ' order by x.dias desc) filter (where x.n <= 5) into v_qtd, v_lista
    from (
      select 'MAN-' || lpad(m.numero::text, 6, '0') || ' ' || coalesce(v.placa, '') || ' (' || extract(day from now() - u.ultima)::int || 'd)' as txt,
             extract(day from now() - u.ultima)::int as dias,
             row_number() over (order by u.ultima) as n
        from public.frotas_manutencoes m
        join public.frotas_veiculos v on v.id = m.veiculo_id
        cross join lateral (select coalesce((m.linha_tempo -> -1 ->> 'em')::timestamptz, m.updated_at) as ultima) u
       where m.status = 'aprovada' and u.ultima < now() - make_interval(days => p_dias_os)
    ) x;
  if v_qtd > 0 then
    perform private.frotas_manut_notificar('frotas_manut_lembrete',
      v_qtd || case when v_qtd = 1 then ' manutenção aprovada sem OS emitida há mais de ' else ' manutenções aprovadas sem OS emitida há mais de ' end || p_dias_os || ' dias',
      v_lista, 'atencao', 'clipboard-check', null, 'frotas_manut_lembrete:os:' || v_dia, 'frotas_manutencao', null, null);
  end if;
  v_saida := v_saida || jsonb_build_object('sem_os', coalesce(v_qtd, 0));

  -- Veículo na oficina além da previsão (ou há muito tempo, sem previsão): equipe.
  select count(*), string_agg(x.txt, '; ' order by x.dias desc) filter (where x.n <= 5) into v_qtd, v_lista
    from (
      select 'MAN-' || lpad(m.numero::text, 6, '0') || ' ' || coalesce(v.placa, '') || ' (' ||
               case when m.previsao_entrega is not null
                    then 'previsto ' || to_char(m.previsao_entrega, 'DD/MM')
                    else extract(day from now() - coalesce(m.entrada_oficina_em, m.os_emitida_em))::int || 'd na oficina' end || ')' as txt,
             extract(day from now() - coalesce(m.entrada_oficina_em, m.os_emitida_em))::int as dias,
             row_number() over (order by coalesce(m.entrada_oficina_em, m.os_emitida_em)) as n
        from public.frotas_manutencoes m
        join public.frotas_veiculos v on v.id = m.veiculo_id
       where m.status = 'em_execucao'
         and ((m.previsao_entrega is not null and m.previsao_entrega < (now() at time zone 'America/Sao_Paulo')::date)
           or (m.previsao_entrega is null and coalesce(m.entrada_oficina_em, m.os_emitida_em) < now() - make_interval(days => p_dias_sem_previsao)))
    ) x;
  if v_qtd > 0 then
    perform private.frotas_manut_notificar('frotas_manut_lembrete',
      v_qtd || case when v_qtd = 1 then ' veículo na oficina além do prazo' else ' veículos na oficina além do prazo' end,
      v_lista, 'urgente', 'wrench', null, 'frotas_manut_lembrete:prazo:' || v_dia, 'frotas_manutencao', null, null);
  end if;
  v_saida := v_saida || jsonb_build_object('atrasadas', coalesce(v_qtd, 0));

  return v_saida;
end;
$$;

revoke all on function public.frotas_manutencao_lembretes(integer, integer, integer, integer) from public;

do $cron$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'frotas-manutencao-lembretes';
  -- 11:00 UTC = 08:00 em Brasília, de segunda a sexta
  perform cron.schedule('frotas-manutencao-lembretes', '0 11 * * 1-5', 'select public.frotas_manutencao_lembretes()');
end
$cron$;
