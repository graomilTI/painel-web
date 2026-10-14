-- Frotas · Notificação única do dia: uso fora do horário + excesso de velocidade na MESMA mensagem.
--
-- Antes: o fora do horário gerava a mensagem no banco (frotas_fora_horario_acao) e o excesso de velocidade era montado
-- na tela, por colaborador, em outra aba. Agora o dossiê do dia gera uma só notificação por placa/dia com as seções que
-- se aplicam e marca os dois lados como GERADA:
--   * frotas_fora_horario_ocorrencias (quando há uso fora do horário e ocorrência consolidada);
--   * frotas_excesso_velocidade (registros PENDENTE/GERADA da placa no dia).
-- A linha de cada excesso segue o formato "* dd/mm/aaaa – NNN km/h" e a placa vai por extenso: é o que o OCR dos prints usa
-- para baixar os registros (frotas-print-ocr-core.js), então o arquivamento por print continua funcionando.

-- ---------------------------------------------------------------------------------------------
-- Monta a mensagem (sem gravar nada e sem checar sessão): serve à RPC abaixo e a testes.
-- ---------------------------------------------------------------------------------------------

create or replace function public.frotas_dossie_notificacao_montar(p_data date, p_placa text)
returns jsonb
language plpgsql
stable
set search_path = public
as $f$
declare
  v_placa text := regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g');
  v_dos public.frotas_fora_horario_dossie%rowtype;
  v_oc public.frotas_fora_horario_ocorrencias%rowtype;
  v_tem_dos boolean := false;
  v_tem_oc boolean := false;
  v_motorista text;
  v_primeiro text;
  v_hora text;
  v_fora boolean := false;
  v_exc boolean := false;
  v_exc_qtd integer := 0;
  v_exc_max numeric;
  v_exc_ids jsonb := '[]'::jsonb;
  v_titulo text;
  v_corpo text;
  v_s1 text;
  v_s2 text;
  v_ambos boolean;
  v_esp text;
  v_motivo_fora text;
  v_politica text;
begin
  if p_data is null or v_placa = '' then
    raise exception 'Informe a data e a placa.';
  end if;

  select * into v_dos from public.frotas_fora_horario_dossie where data_evento = p_data and placa = v_placa;
  v_tem_dos := found;
  select * into v_oc from public.frotas_fora_horario_ocorrencias where data_evento = p_data and placa = v_placa;
  v_tem_oc := found;

  -- Excessos de velocidade ainda não notificados (PENDENTE ou mensagem já gerada, mas não arquivada por print).
  select count(*)::int, max(x.velocidade), coalesce(jsonb_agg(x.id), '[]'::jsonb)
    into v_exc_qtd, v_exc_max, v_exc_ids
  from public.frotas_excesso_velocidade x
  where x.data_evento = p_data
    and regexp_replace(upper(coalesce(x.placa, '')), '[^A-Z0-9]', '', 'g') = v_placa
    and upper(coalesce(x.status_notificacao, '')) in ('PENDENTE', 'GERADA');
  v_exc := v_exc_qtd > 0;

  -- Uso fora do horário: veredito "fora do horário", ou "para conferir" com 5 km ou mais fora da janela.
  v_fora := v_tem_dos and (v_dos.veredito = 'FORA_HORARIO' or coalesce(v_dos.km_fora, 0) >= 5);

  if not v_fora and not v_exc then
    raise exception 'Não há nada pendente de notificação neste dia (uso fora do horário ou excesso de velocidade).';
  end if;

  select coalesce(
           nullif(trim(v_oc.motorista), ''),
           nullif(trim(v_dos.motorista), ''),
           (select nullif(trim(coalesce(x.patrimonio_funcionario, x.motorista_planilha)), '')
              from public.frotas_excesso_velocidade x
             where x.data_evento = p_data
               and regexp_replace(upper(coalesce(x.placa, '')), '[^A-Z0-9]', '', 'g') = v_placa
               and nullif(trim(coalesce(x.patrimonio_funcionario, x.motorista_planilha)), '') is not null
             limit 1))
    into v_motorista;
  if v_motorista is null then
    raise exception 'Motorista não identificado para este veículo neste dia.';
  end if;
  v_primeiro := initcap(lower(split_part(trim(v_motorista), ' ', 1)));
  v_ambos := v_fora and v_exc;

  if v_fora then
    -- hora do 1º trecho fora da janela do dossiê (senão, a da ocorrência)
    select to_char((v.value ->> 'fora_ini')::timestamp, 'HH24:MI')
      into v_hora
    from jsonb_array_elements(coalesce(v_dos.detalhes -> 'viagens', '[]'::jsonb)) v
    where (v.value ->> 'fora_ini') is not null and coalesce((v.value ->> 'fora_km')::numeric, 0) >= 1
    order by v.value ->> 'fora_ini'
    limit 1;
    v_hora := coalesce(v_hora, nullif(substring(coalesce(v_oc.hora_inicio, '') from 1 for 5), ''));

    -- domingo/feriado sem embarque: o motivo muda (nesses dias só é autorizado rodar com embarque)
    v_esp := case when v_dos.criterio = 'SEM_EMBARQUE'
                  then case when (v_dos.detalhes #>> '{dia_especial,tipo}') = 'FERIADO' then 'feriado' else 'domingo' end end;
    v_motivo_fora := case when v_esp is null then 'fora do horário de expediente' else 'no ' || v_esp || ', sem embarque' end;
    v_politica := case when v_esp is null
      then 'Conforme a política interna da Grão1000, a utilização dos veículos da empresa fora do horário de expediente somente é permitida mediante autorização prévia da gestão.'
      else 'Conforme a política interna da Grão1000, aos domingos e feriados a utilização dos veículos da empresa somente é permitida quando há embarque.' end;

    v_s1 := case when v_ambos
        then 'Utilização do veículo ' || v_motivo_fora || coalesce(', às ' || v_hora || 'h', '') || '.'
        else 'Identificamos a utilização do veículo da empresa, placa ' || v_placa || ', '
             || case when v_esp is null then 'fora do horário de expediente, no dia ' || to_char(p_data, 'DD/MM/YY')
                     else 'no dia ' || to_char(p_data, 'DD/MM/YY') || ' ('
                          || case when v_esp = 'feriado' then 'feriado: ' || coalesce(v_dos.detalhes #>> '{dia_especial,nome}', '') else 'domingo' end
                          || '), sem embarque' end
             || coalesce(', às ' || v_hora || 'h', '') || '.' end
      || E'\n\n' || v_politica || E'\n\n' ||
      'Solicitamos os devidos esclarecimentos e a apresentação da justificativa referente à utilização do veículo nesse período.' || E'\n\n' ||
      'Informamos também que será realizado o levantamento da quilometragem percorrida indevidamente entre 00h e 05h. O total de quilômetros identificado será multiplicado pelo valor de R$ 4,00 por km, e o valor correspondente será lançado em seu Caixa.';
  end if;

  if v_exc then
    v_s2 := 'Constatamos, por meio do sistema de rastreamento da frota, que o limite máximo de velocidade permitido (120 km/h) foi excedido'
      || case when v_ambos then '' else ' com o veículo de placa ' || v_placa end
      || ', conforme registro abaixo:' || E'\n\n' ||
      '* ' || to_char(p_data, 'DD/MM/YYYY') || ' – ' || round(v_exc_max)::text || ' km/h'
      || case when v_exc_qtd > 1 then ' (maior velocidade do dia; ' || v_exc_qtd || ' registros)' else '' end
      || E'\n\n' ||
      'Ressaltamos que o excesso de velocidade configura descumprimento das normas de trânsito e das diretrizes internas da empresa, podendo gerar riscos à segurança do próprio condutor, de terceiros e ao patrimônio da organização.' || E'\n\n' ||
      'Solicitamos atenção redobrada quanto à condução do veículo, evitando novos registros e possíveis medidas administrativas futuras.';
  end if;

  v_titulo := case when v_ambos then 'Notificação: Uso de Veículo da Empresa'
                   when v_fora then 'Notificação: Uso de Veículo da Empresa Fora do Expediente'
                   else 'Notificação: Excesso de Velocidade' end;

  if v_ambos then
    v_corpo := 'Identificamos as seguintes ocorrências na utilização do veículo da empresa, placa ' || v_placa || ', no dia ' || to_char(p_data, 'DD/MM/YY') || ':'
      || E'\n\n' || '1. Uso fora do horário de expediente' || E'\n' || v_s1
      || E'\n\n' || '2. Excesso de velocidade' || E'\n' || v_s2;
  else
    v_corpo := coalesce(v_s1, v_s2);
  end if;

  return jsonb_build_object(
    'message', v_titulo || E'\n\n' || 'Prezado ' || v_primeiro || '!' || E'\n\n' || v_corpo || E'\n\n' ||
               'Atenciosamente,' || E'\n\n' || 'Setor de Frota' || E'\n' || 'Grão1000',
    'fora_horario', v_fora,
    'excesso', v_exc,
    'motorista', v_motorista,
    'ocorrencia_id', case when v_tem_oc then to_jsonb(v_oc.id) else null end,
    'excessos_ids', v_exc_ids,
    'qtd_excessos', v_exc_qtd,
    'vel_max', v_exc_max
  );
end
$f$;

revoke all on function public.frotas_dossie_notificacao_montar(date, text) from public, anon, authenticated;
grant execute on function public.frotas_dossie_notificacao_montar(date, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- RPC da tela: gera a notificação única e marca os dois lados como GERADA.
-- ---------------------------------------------------------------------------------------------

create or replace function public.frotas_dossie_notificar(p_data date, p_placa text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_usuario_nome text;
  v_placa text := regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g');
  v_res jsonb;
  v_msg text;
  v_now timestamptz := now();
  v_exc_atualizados integer := 0;
begin
  if v_usuario_id is null then
    raise exception 'Sessão não encontrada.';
  end if;
  if not public.frotas_usuario_tem_acesso() then
    raise exception 'Usuário sem acesso ao módulo de Frotas.';
  end if;

  select coalesce(nullif(trim(u.nome), ''), nullif(trim(u.email), ''), auth.email(), v_usuario_id::text)
    into v_usuario_nome
  from public.app_usuarios u
  where u.auth_user_id = v_usuario_id
     or lower(u.email) = lower(coalesce(auth.email(), ''))
  order by (u.auth_user_id = v_usuario_id) desc
  limit 1;
  v_usuario_nome := coalesce(v_usuario_nome, auth.email(), v_usuario_id::text);

  v_res := public.frotas_dossie_notificacao_montar(p_data, v_placa);
  v_msg := v_res ->> 'message';

  if (v_res ->> 'fora_horario')::boolean and (v_res ->> 'ocorrencia_id') is not null then
    update public.frotas_fora_horario_ocorrencias
       set status_notificacao = 'GERADA',
           mensagem_gerada = v_msg,
           gerado_em = v_now,
           gerado_por = v_usuario_id,
           gerado_por_nome = v_usuario_nome,
           updated_at = v_now
     where id = (v_res ->> 'ocorrencia_id')::uuid;
  end if;

  if (v_res ->> 'excesso')::boolean then
    update public.frotas_excesso_velocidade x
       set status_notificacao = 'GERADA',
           mensagem_gerada = v_msg,
           notificado_em = v_now,
           notificado_por = v_usuario_id,
           notificado_por_nome = v_usuario_nome,
           updated_at = v_now
     where x.data_evento = p_data
       and regexp_replace(upper(coalesce(x.placa, '')), '[^A-Z0-9]', '', 'g') = v_placa
       and upper(coalesce(x.status_notificacao, '')) in ('PENDENTE', 'GERADA');
    get diagnostics v_exc_atualizados = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', v_msg,
    'fora_horario', (v_res ->> 'fora_horario')::boolean,
    'excesso', (v_res ->> 'excesso')::boolean,
    'motorista', v_res ->> 'motorista',
    'ocorrencia_id', v_res ->> 'ocorrencia_id',
    'excessos_atualizados', v_exc_atualizados
  );
end
$$;

revoke all on function public.frotas_dossie_notificar(date, text) from public, anon;
grant execute on function public.frotas_dossie_notificar(date, text) to authenticated, service_role;
