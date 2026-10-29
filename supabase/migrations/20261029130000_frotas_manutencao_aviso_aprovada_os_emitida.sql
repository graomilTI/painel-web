-- Frotas · Manutenção: aprovar a cotação já coloca o serviço em andamento (a OS é emitida junto).
--   * o aviso à equipe, enviado na aprovação, deixa de pedir "emitir a OS" (ela já foi emitida).

CREATE OR REPLACE FUNCTION public.notificar_frotas_manutencao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    perform private.frotas_manut_notificar('frotas_manut_aprovada', 'Manutenção aprovada, OS emitida — ' || v_cod,
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
$function$;
