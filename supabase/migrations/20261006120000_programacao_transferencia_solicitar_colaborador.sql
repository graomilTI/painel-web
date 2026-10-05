-- Programação > Transferências: SOLICITAR COLABORADOR (pedido do usuário, 2026-10-06).
--
-- Caso: o colaborador vem de outra regional, mas o supervisor da origem ainda
-- não fez a transferência. Hoje só a origem consegue abrir o pedido; aqui o
-- gestor da supervisão que vai RECEBER o colaborador pede ele, no sentido
-- inverso: quem responde (aceita/recusa) é o gestor da supervisão de ORIGEM,
-- dono do colaborador e dos patrimônios dele.
--
-- Mesma tabela e mesmo agente (sync-transferir-colaborador): só ganha a coluna
-- `tipo`. Aceite da origem => grm_status NA_FILA => agente troca a supervisão
-- no GRM, exatamente como na transferência pedida pela origem.
--   TRANSFERENCIA: origem pede, destino responde (fluxo original).
--   SOLICITACAO:   destino pede, origem responde.

alter table public.programacao_transferencias
  add column if not exists tipo text not null default 'TRANSFERENCIA';

alter table public.programacao_transferencias
  drop constraint if exists programacao_transferencias_tipo_check;
alter table public.programacao_transferencias
  add constraint programacao_transferencias_tipo_check
  check (tipo in ('TRANSFERENCIA', 'SOLICITACAO'));

-- ---------------------------------------------------------------------------
-- Busca de colaborador de OUTRA supervisão (o combo da tela só lista os da
-- própria supervisão). Sem acento, por nome ou CPF, só ativos, no máximo 30.
-- ---------------------------------------------------------------------------
create or replace function public.programacao_transferencia_buscar_colaboradores(
  p_termo text,
  p_supervisao_destino text
)
returns table(cpf text, nome text, cargo text, supervisao text, pendente boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_termo text := public.abertura_os_norm_sup(p_termo);
  v_digitos text := regexp_replace(coalesce(p_termo, ''), '\D', '', 'g');
  v_destino text := public.abertura_os_norm_sup(p_supervisao_destino);
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if not public.programacao_supervisao_liberada(p_supervisao_destino) then
    raise exception 'Você só pode pedir colaboradores para a(s) sua(s) supervisão(ões).';
  end if;
  if length(v_termo) < 3 then
    return;
  end if;

  return query
  select t.cpf::text, t.nome::text, t.cargo::text, t.supervisao::text,
         exists (
           select 1 from public.programacao_transferencias pt
           where pt.status = 'PENDENTE' and pt.colaborador_cpf = t.cpf
         )
  from (
    select distinct on (regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'))
           regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') as cpf,
           c.nome, c.cargo, c.supervisao
    from public.colaboradores c
    where c.situacao = 'Ativo'
      and length(regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g')) = 11
      and coalesce(btrim(c.supervisao), '') <> ''
      and public.abertura_os_norm_sup(c.supervisao) <> v_destino
      and (
        public.abertura_os_norm_sup(c.nome) like '%' || v_termo || '%'
        or (length(v_digitos) >= 3
            and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') like '%' || v_digitos || '%')
      )
    order by regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'), c.updated_at desc nulls last
  ) t
  order by t.nome
  limit 30;
end;
$$;

revoke all on function public.programacao_transferencia_buscar_colaboradores(text, text) from public, anon;
grant execute on function public.programacao_transferencia_buscar_colaboradores(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Solicitar colaborador (destino pede; origem responde)
-- ---------------------------------------------------------------------------
create or replace function public.programacao_transferencia_solicitar_colaborador(
  p_colaborador_cpf text,
  p_supervisao_destino text,
  p_transferir_patrimonios boolean,
  p_motivo text default null
)
returns public.programacao_transferencias
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cpf text := regexp_replace(coalesce(p_colaborador_cpf, ''), '\D', '', 'g');
  v_colab record;
  v_destino text;
  v_patrimonios jsonb;
  v_row public.programacao_transferencias;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if p_transferir_patrimonios is null then
    raise exception 'Informe se os patrimônios do colaborador devem vir junto.';
  end if;
  if length(v_cpf) < 11 then
    raise exception 'Colaborador sem CPF válido.';
  end if;

  select c.cpf, c.nome, c.cargo, c.supervisao, c.coordenacao, c.situacao
    into v_colab
  from public.colaboradores c
  where regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = v_cpf
  order by c.updated_at desc nulls last
  limit 1;

  if v_colab is null then
    raise exception 'Colaborador não encontrado no cadastro.';
  end if;
  if v_colab.situacao is distinct from 'Ativo' then
    raise exception 'Colaborador não está ativo no cadastro.';
  end if;
  if coalesce(btrim(v_colab.supervisao), '') = '' then
    raise exception 'Colaborador sem supervisão no cadastro.';
  end if;

  select s.nome into v_destino
  from public.supervisoes s
  where s.ativo = true
    and public.abertura_os_norm_sup(s.nome) = public.abertura_os_norm_sup(p_supervisao_destino)
  limit 1;
  if v_destino is null then
    raise exception 'Supervisão inválida.';
  end if;
  if not public.programacao_supervisao_liberada(v_destino) then
    raise exception 'Você só pode pedir colaboradores para a(s) sua(s) supervisão(ões).';
  end if;
  if public.abertura_os_norm_sup(v_destino) = public.abertura_os_norm_sup(v_colab.supervisao) then
    raise exception 'O colaborador já está nessa supervisão.';
  end if;
  if public.programacao_supervisao_liberada(v_colab.supervisao) and not public.painel_is_master() then
    raise exception 'Esse colaborador já é de uma supervisão sua. Para mandá-lo a outra, use "Nova transferência".';
  end if;

  -- Retrato dos patrimônios no momento do pedido (o GRM é quem move de fato).
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', p.patrimonio_codigo,
           'identificacao', p.identificacao,
           'categoria', p.categoria,
           'situacao', p.situacao
         ) order by p.patrimonio_codigo), '[]'::jsonb)
    into v_patrimonios
  from public.patrimonios_snapshot p
  where public.abertura_os_norm_sup(p.funcionario) = public.abertura_os_norm_sup(v_colab.nome)
    and coalesce(p.situacao, '') <> 'Baixado';

  begin
    insert into public.programacao_transferencias (
      tipo, colaborador_cpf, colaborador_nome, colaborador_cargo,
      supervisao_origem, coordenacao_origem, supervisao_destino,
      transferir_patrimonios, patrimonios, motivo,
      solicitado_por, solicitado_por_nome
    ) values (
      'SOLICITACAO', v_cpf, v_colab.nome, v_colab.cargo,
      v_colab.supervisao, v_colab.coordenacao, v_destino,
      p_transferir_patrimonios, v_patrimonios, nullif(btrim(coalesce(p_motivo, '')), ''),
      auth.uid(), private.programacao_transferencia_nome_usuario()
    )
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Já existe uma transferência pendente para este colaborador.';
  end;

  -- Quem responde é a origem.
  perform private.programacao_transferencia_notificar(
    v_row.supervisao_origem,
    'transferencia_solicitacao',
    'Pedido de colaborador para aceitar',
    v_row.supervisao_destino || ' pediu ' || v_row.colaborador_nome || ' (hoje em ' || v_row.supervisao_origem
      || '). Patrimônios: ' || case when v_row.transferir_patrimonios
           then 'pedido que vão junto (' || jsonb_array_length(v_row.patrimonios) || ')' else 'ficam com você' end
      || '. Abra Programação > Transferências para aceitar ou recusar.',
    'urgente',
    v_row.id,
    'transf_solicitacao:' || v_row.id,
    auth.uid()
  );

  return v_row;
end;
$$;

revoke all on function public.programacao_transferencia_solicitar_colaborador(text, text, boolean, text) from public, anon;
grant execute on function public.programacao_transferencia_solicitar_colaborador(text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Responder: quem responde depende do tipo. A origem também pode ajustar se os
-- patrimônios vão junto ao aceitar uma SOLICITACAO (são dela). A assinatura
-- muda, então a antiga sai para não virar overload ambíguo.
-- ---------------------------------------------------------------------------
drop function if exists public.programacao_transferencia_responder(uuid, boolean, text);

create or replace function public.programacao_transferencia_responder(
  p_id uuid,
  p_aceitar boolean,
  p_motivo text default null,
  p_transferir_patrimonios boolean default null
)
returns public.programacao_transferencias
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.programacao_transferencias;
  v_sol boolean;
  v_sup_resposta text;
  v_sup_pedido text;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  select * into v_row from public.programacao_transferencias where id = p_id for update;
  if v_row is null then
    raise exception 'Transferência não encontrada.';
  end if;
  if v_row.status <> 'PENDENTE' then
    raise exception 'Esta transferência já foi %.', lower(v_row.status);
  end if;

  v_sol := v_row.tipo = 'SOLICITACAO';
  v_sup_resposta := case when v_sol then v_row.supervisao_origem else v_row.supervisao_destino end;
  v_sup_pedido := case when v_sol then v_row.supervisao_destino else v_row.supervisao_origem end;

  if not public.programacao_supervisao_liberada(v_sup_resposta) then
    raise exception 'Só o gestor da supervisão % pode responder.', v_sup_resposta;
  end if;
  if v_row.solicitado_por = auth.uid() and not public.painel_is_master() then
    raise exception 'Quem fez o pedido não pode aceitá-lo; aguarde o gestor de %.', v_sup_resposta;
  end if;
  if not p_aceitar and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da recusa.';
  end if;

  update public.programacao_transferencias
     set status = case when p_aceitar then 'ACEITA' else 'RECUSADA' end,
         respondido_por = auth.uid(),
         respondido_por_nome = private.programacao_transferencia_nome_usuario(),
         respondido_em = now(),
         motivo_recusa = case when p_aceitar then null else btrim(p_motivo) end,
         transferir_patrimonios = case
           when p_aceitar and v_sol and p_transferir_patrimonios is not null then p_transferir_patrimonios
           else transferir_patrimonios end,
         grm_status = case when p_aceitar then 'NA_FILA' else 'NAO_APLICAVEL' end
   where id = p_id
   returning * into v_row;

  -- A notificação de "para aceitar" sai da central de todos os destinatários.
  update public.painel_notificacoes
     set arquivada = true, arquivada_em = now()
   where referencia_tabela = 'programacao_transferencias'
     and referencia_id = p_id::text
     and tipo in ('transferencia_solicitada', 'transferencia_solicitacao')
     and arquivada = false;

  perform private.programacao_transferencia_notificar(
    v_sup_pedido,
    case when p_aceitar then 'transferencia_aceita' else 'transferencia_recusada' end,
    case when v_sol
      then case when p_aceitar then 'Pedido de colaborador aceito' else 'Pedido de colaborador recusado' end
      else case when p_aceitar then 'Transferência aceita' else 'Transferência recusada' end
    end,
    v_row.colaborador_nome || ' → ' || v_row.supervisao_destino || ': '
      || case when p_aceitar
           then 'aceita por ' || v_row.respondido_por_nome
             || case when v_sol
                  then '. Patrimônios: ' || case when v_row.transferir_patrimonios then 'vão junto' else 'ficam na origem' end
                  else '' end
             || '. O agente vai atualizar o GRM.'
           else 'recusada por ' || v_row.respondido_por_nome || '. Motivo: ' || v_row.motivo_recusa end,
    case when p_aceitar then 'normal' else 'atencao' end,
    v_row.id,
    'transf_resposta:' || v_row.id,
    auth.uid()
  );

  if p_aceitar then
    insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
    select 'sync-transferir-colaborador', 'pendente', 'programacao-transferencia',
           jsonb_build_object('transferencia_id', v_row.id)
    where not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = 'sync-transferir-colaborador' and status in ('pendente', 'rodando')
    );
  end if;

  return v_row;
end;
$$;

revoke all on function public.programacao_transferencia_responder(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.programacao_transferencia_responder(uuid, boolean, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Cancelar: quem cancela é quem fez o pedido (origem na TRANSFERENCIA, destino
-- na SOLICITACAO).
-- ---------------------------------------------------------------------------
create or replace function public.programacao_transferencia_cancelar(p_id uuid)
returns public.programacao_transferencias
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.programacao_transferencias;
  v_sup_pedido text;
begin
  select * into v_row from public.programacao_transferencias where id = p_id for update;
  if v_row is null then
    raise exception 'Transferência não encontrada.';
  end if;
  if v_row.status <> 'PENDENTE' then
    raise exception 'Só dá para cancelar transferência pendente.';
  end if;

  v_sup_pedido := case when v_row.tipo = 'SOLICITACAO' then v_row.supervisao_destino else v_row.supervisao_origem end;
  if not public.programacao_supervisao_liberada(v_sup_pedido) then
    raise exception 'Só a supervisão que fez o pedido (%) pode cancelar.', v_sup_pedido;
  end if;

  update public.programacao_transferencias
     set status = 'CANCELADA', grm_status = 'NAO_APLICAVEL',
         respondido_por = auth.uid(),
         respondido_por_nome = private.programacao_transferencia_nome_usuario(),
         respondido_em = now()
   where id = p_id
   returning * into v_row;

  update public.painel_notificacoes
     set arquivada = true, arquivada_em = now()
   where referencia_tabela = 'programacao_transferencias'
     and referencia_id = p_id::text
     and arquivada = false;

  return v_row;
end;
$$;
