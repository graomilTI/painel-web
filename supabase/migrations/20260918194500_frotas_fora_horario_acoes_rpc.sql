-- Ações manuais de uso de veículo fora do expediente.
-- Segurança: somente usuários ativos com módulo Frotas/Excesso podem executar.
-- O valor do Caixa é sempre recalculado no servidor: km_00_05 x R$ 4,00.

create or replace function public.frotas_usuario_tem_acesso()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.app_usuarios u
    left join public.app_perfis p on p.id = u.perfil_id
    where (
      u.auth_user_id = auth.uid()
      or lower(u.email) = lower(coalesce(auth.email(), ''))
    )
      and lower(coalesce(u.status, '')) = 'ativo'
      and coalesce(u.ativo, true) = true
      and (
        lower(coalesce(p.codigo, '')) = 'master'
        or exists (
          select 1
          from public.app_usuario_modulos um
          join public.app_modulos m on m.id = um.modulo_id
          where um.usuario_id = u.id
            and um.ativo = true
            and lower(coalesce(um.status, 'ativo')) = 'ativo'
            and m.ativo = true
            and lower(m.codigo) in ('frotas','frotas_excesso_velocidade')
        )
      )
  );
$$;

revoke all on function public.frotas_usuario_tem_acesso() from public, anon;
grant execute on function public.frotas_usuario_tem_acesso() to authenticated, service_role;

drop policy if exists frotas_fora_horario_ocorrencias_authenticated_select
  on public.frotas_fora_horario_ocorrencias;
create policy frotas_fora_horario_ocorrencias_authenticated_select
  on public.frotas_fora_horario_ocorrencias
  for select to authenticated
  using (public.frotas_usuario_tem_acesso());

drop policy if exists frotas_fora_horario_caixa_authenticated_select
  on public.frotas_fora_horario_caixa_lancamentos;
create policy frotas_fora_horario_caixa_authenticated_select
  on public.frotas_fora_horario_caixa_lancamentos
  for select to authenticated
  using (public.frotas_usuario_tem_acesso());

create or replace function public.frotas_fora_horario_acao(
  p_ocorrencia_id uuid,
  p_acao text,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_row public.frotas_fora_horario_ocorrencias%rowtype;
  v_acao text := upper(trim(coalesce(p_acao,'')));
  v_usuario_id uuid := auth.uid();
  v_usuario_nome text;
  v_primeiro_nome text;
  v_mensagem text;
  v_queue public.frotas_fora_horario_caixa_lancamentos%rowtype;
  v_valor numeric(12,2);
  v_job_id uuid;
  v_now timestamptz := now();
begin
  if v_usuario_id is null then
    raise exception 'Sessão não encontrada.';
  end if;

  if not public.frotas_usuario_tem_acesso() then
    raise exception 'Usuário sem acesso ao módulo de Frotas.';
  end if;

  if v_acao not in ('GERAR','JUSTIFICAR','CAIXA') then
    raise exception 'Ação inválida.';
  end if;

  select coalesce(nullif(trim(u.nome),''), nullif(trim(u.email),''), auth.email(), v_usuario_id::text)
    into v_usuario_nome
  from public.app_usuarios u
  where u.auth_user_id = v_usuario_id
     or lower(u.email) = lower(coalesce(auth.email(),''))
  order by (u.auth_user_id = v_usuario_id) desc
  limit 1;

  v_usuario_nome := coalesce(v_usuario_nome, auth.email(), v_usuario_id::text);

  select *
    into v_row
  from public.frotas_fora_horario_ocorrencias
  where id = p_ocorrencia_id
  for update;

  if not found then
    raise exception 'Ocorrência não encontrada.';
  end if;

  if v_acao = 'GERAR' then
    if coalesce(trim(v_row.motorista),'') = '' then
      raise exception 'Motorista não identificado para esta ocorrência.';
    end if;
    if coalesce(trim(v_row.hora_inicio),'') = '' then
      raise exception 'Horário inicial ainda não foi calculado.';
    end if;

    v_primeiro_nome := initcap(lower(split_part(trim(v_row.motorista), ' ', 1)));
    v_mensagem :=
      'Notificação: Uso de Veículo da Empresa Fora do Expediente' || E'\n\n' ||
      'Prezado ' || v_primeiro_nome || '!' || E'\n\n' ||
      'Identificamos a utilização do veículo da empresa, placa ' || upper(v_row.placa) ||
      ', fora do horário de expediente, no dia ' || to_char(v_row.data_evento, 'DD/MM/YY') ||
      ', às ' || substring(v_row.hora_inicio from 1 for 5) || 'h.' || E'\n\n' ||
      'Conforme a política interna da Grão1000, a utilização dos veículos da empresa fora do horário de expediente somente é permitida mediante autorização prévia da gestão.' || E'\n\n' ||
      'Solicitamos os devidos esclarecimentos e a apresentação da justificativa referente à utilização do veículo nesse período.' || E'\n\n' ||
      'Informamos também que será realizado o levantamento da quilometragem percorrida indevidamente entre 00h e 05h. O total de quilômetros identificado será multiplicado pelo valor de R$ 4,00 por km, e o valor correspondente será lançado em seu Caixa.' || E'\n\n' ||
      'Atenciosamente,' || E'\n\n' ||
      'Setor de Frota' || E'\n' ||
      'Grão1000';

    update public.frotas_fora_horario_ocorrencias
       set status_notificacao = 'GERADA',
           mensagem_gerada = v_mensagem,
           gerado_em = v_now,
           gerado_por = v_usuario_id,
           gerado_por_nome = v_usuario_nome,
           updated_at = v_now
     where id = v_row.id;

    return jsonb_build_object('ok',true,'action','GERAR','message',v_mensagem,'id',v_row.id);
  end if;

  if v_acao = 'JUSTIFICAR' then
    if coalesce(trim(p_justificativa),'') = '' then
      raise exception 'Informe a justificativa.';
    end if;

    if upper(coalesce(v_row.status_caixa,'')) in ('PENDENTE','PROCESSANDO','LANCADO') then
      raise exception 'Esta ocorrência já foi enviada ao Caixa e não pode ser marcada como justificada.';
    end if;

    update public.frotas_fora_horario_ocorrencias
       set status_notificacao = 'JUSTIFICADA',
           justificativa = trim(p_justificativa),
           justificado_em = v_now,
           justificado_por = v_usuario_id,
           justificado_por_nome = v_usuario_nome,
           updated_at = v_now
     where id = v_row.id;

    return jsonb_build_object('ok',true,'action','JUSTIFICAR','id',v_row.id);
  end if;

  if upper(coalesce(v_row.status_notificacao,'')) = 'JUSTIFICADA' then
    raise exception 'Ocorrência justificada não pode ser enviada ao Caixa.';
  end if;
  if coalesce(trim(v_row.motorista),'') = '' then
    raise exception 'Motorista não identificado para lançamento no Caixa.';
  end if;
  if coalesce(v_row.km_00_05,0) <= 0 then
    raise exception 'Quilometragem entre 00h e 05h ainda não foi calculada.';
  end if;

  v_valor := round(v_row.km_00_05 * 4.00, 2);

  select *
    into v_queue
  from public.frotas_fora_horario_caixa_lancamentos
  where ocorrencia_id = v_row.id
  for update;

  if found then
    if v_queue.status in ('ERRO','CANCELADO') then
      update public.frotas_fora_horario_caixa_lancamentos
         set status = 'PENDENTE',
             tentativas = 0,
             ultimo_erro = null,
             iniciado_em = null,
             processado_em = null,
             solicitado_por = v_usuario_id,
             solicitado_por_nome = v_usuario_nome,
             solicitado_em = v_now,
             updated_at = v_now
       where id = v_queue.id
       returning * into v_queue;
    end if;
  else
    insert into public.frotas_fora_horario_caixa_lancamentos (
      ocorrencia_id,data_evento,placa,colaborador_nome,nome_normalizado,
      km_00_05,valor_km,valor,descricao,status,
      solicitado_por,solicitado_por_nome,solicitado_em,updated_at
    ) values (
      v_row.id,
      v_row.data_evento,
      upper(v_row.placa),
      trim(v_row.motorista),
      regexp_replace(
        upper(translate(trim(v_row.motorista),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
        '[^A-Z0-9]+',' ','g'
      ),
      v_row.km_00_05,
      4.00,
      v_valor,
      'Frotas - Uso de veículo fora do expediente - placa ' || upper(v_row.placa) ||
      ' - ' || to_char(v_row.data_evento,'DD/MM/YYYY') ||
      ' - ' || replace(to_char(v_row.km_00_05,'FM999999990.000'),'.',',') || ' km x R$ 4,00/km',
      'PENDENTE',
      v_usuario_id,
      v_usuario_nome,
      v_now,
      v_now
    )
    returning * into v_queue;
  end if;

  update public.frotas_fora_horario_ocorrencias
     set status_caixa = v_queue.status,
         caixa_solicitado_em = coalesce(caixa_solicitado_em, v_now),
         caixa_solicitado_por = coalesce(caixa_solicitado_por, v_usuario_id),
         caixa_solicitado_por_nome = coalesce(caixa_solicitado_por_nome, v_usuario_nome),
         caixa_lancamento_id = v_queue.id,
         updated_at = v_now
   where id = v_row.id;

  if v_queue.status = 'PENDENTE' then
    select j.id
      into v_job_id
    from public.grm_sync_jobs j
    where j.agente_id = 'sync-frotas-fora-horario-caixa'
      and j.status in ('pendente','rodando')
    order by j.created_at
    limit 1;

    if v_job_id is null then
      insert into public.grm_sync_jobs (
        agente_id,status,solicitado_por,solicitado_em,payload
      ) values (
        'sync-frotas-fora-horario-caixa',
        'pendente',
        v_usuario_nome,
        v_now,
        jsonb_build_object('origem','frotas_fora_horario','ocorrencia_id',v_row.id)
      )
      returning id into v_job_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'action','CAIXA',
    'queue_id',v_queue.id,
    'job_id',v_job_id,
    'status',v_queue.status,
    'km',v_row.km_00_05,
    'valor_km',4.00,
    'valor',v_valor
  );
end;
$$;

revoke all on function public.frotas_fora_horario_acao(uuid,text,text) from public, anon;
grant execute on function public.frotas_fora_horario_acao(uuid,text,text) to authenticated, service_role;
