-- Programação > 3 · Transferências (pedido do usuário, 2026-09-26).
--
-- O gestor da supervisão de origem pede a transferência de um colaborador para
-- outra supervisão e informa se os patrimônios do colaborador vão junto. O
-- gestor da supervisão de destino recebe uma notificação (central + push) e
-- aceita ou recusa na mesma aba. Aceita => entra na fila do agente
-- sync-transferir-colaborador (grmserver-transferir-colaborador-api.js), que
-- troca a Supervisão/Coordenação do cadastro no GRM via staff/setRecord com
-- changeAssetSupervision "S"/"N" — a mesma pergunta que o próprio GRM faz na
-- tela de Funcionário quando o colaborador tem patrimônios/veículos.
--
-- Quem é "gestor de uma supervisão": programacao_usuario_supervisoes (mesmo
-- vínculo que libera a supervisão no combo da Programação e na RLS da
-- Abertura de O.S.). Master pode tudo.

create table if not exists public.programacao_transferencias (
  id uuid primary key default gen_random_uuid(),
  colaborador_cpf text not null,
  colaborador_nome text not null,
  colaborador_cargo text,
  supervisao_origem text not null,
  coordenacao_origem text,
  supervisao_destino text not null,
  transferir_patrimonios boolean not null,
  patrimonios jsonb not null default '[]'::jsonb,
  motivo text,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'ACEITA', 'RECUSADA', 'CANCELADA')),
  solicitado_por uuid default auth.uid(),
  solicitado_por_nome text,
  solicitado_em timestamptz not null default now(),
  respondido_por uuid,
  respondido_por_nome text,
  respondido_em timestamptz,
  motivo_recusa text,
  -- Andamento no GRM (só depois de ACEITA)
  grm_status text not null default 'AGUARDANDO_ACEITE'
    check (grm_status in ('AGUARDANDO_ACEITE', 'NA_FILA', 'PROCESSANDO', 'APLICADA', 'ERRO', 'NAO_APLICAVEL')),
  grm_tentativas integer not null default 0,
  grm_locked_at timestamptz,
  grm_aplicado_em timestamptz,
  grm_erro text,
  grm_resultado jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programacao_transferencias_sup_diferente
    check (upper(btrim(supervisao_origem)) <> upper(btrim(supervisao_destino)))
);

-- Uma transferência em aberto por colaborador.
create unique index if not exists programacao_transferencias_uma_pendente
  on public.programacao_transferencias (colaborador_cpf)
  where status = 'PENDENTE';

create index if not exists programacao_transferencias_origem_idx
  on public.programacao_transferencias (supervisao_origem, created_at desc);
create index if not exists programacao_transferencias_destino_idx
  on public.programacao_transferencias (supervisao_destino, created_at desc);
create index if not exists programacao_transferencias_grm_idx
  on public.programacao_transferencias (grm_status)
  where grm_status in ('NA_FILA', 'PROCESSANDO', 'ERRO');

create or replace function private.programacao_transferencias_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists programacao_transferencias_touch on public.programacao_transferencias;
create trigger programacao_transferencias_touch
  before update on public.programacao_transferencias
  for each row execute function private.programacao_transferencias_touch();

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
create or replace function public.programacao_supervisao_liberada(p_supervisao text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.painel_is_master()
    or exists (
      select 1
      from public.programacao_usuario_supervisoes s
      where s.ativo = true
        and (
          s.auth_user_id = auth.uid()
          or s.app_usuario_id in (select u.id from public.app_usuarios u where u.auth_user_id = auth.uid())
        )
        and public.abertura_os_norm_sup(s.supervisao) = public.abertura_os_norm_sup(p_supervisao)
        and public.abertura_os_norm_sup(p_supervisao) <> ''
    );
$$;

grant execute on function public.programacao_supervisao_liberada(text) to authenticated;

alter table public.programacao_transferencias enable row level security;

-- Leitura: quem enxerga a origem ou o destino. Escrita só pelas RPCs abaixo
-- (security definer) e pelo agente (service role).
drop policy if exists programacao_transferencias_select on public.programacao_transferencias;
create policy programacao_transferencias_select on public.programacao_transferencias
  for select to authenticated
  using (
    public.programacao_supervisao_liberada(supervisao_origem)
    or public.programacao_supervisao_liberada(supervisao_destino)
  );

revoke insert, update, delete on public.programacao_transferencias from anon, authenticated;
grant select on public.programacao_transferencias to authenticated;

alter publication supabase_realtime add table public.programacao_transferencias;

-- ---------------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------------
-- Gestores (perfil gestor) vinculados a uma supervisão. destinatario_usuario_id
-- segue a mesma chave de push_destinatarios(): coalesce(auth_user_id, id).
create or replace function private.programacao_transferencia_gestores(p_supervisao text)
returns table(uid uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct coalesce(u.auth_user_id, u.id)
  from public.programacao_usuario_supervisoes s
  join public.app_usuarios u
    on u.id = s.app_usuario_id or (s.auth_user_id is not null and u.auth_user_id = s.auth_user_id)
  join public.app_perfis p on p.id = u.perfil_id
  where s.ativo = true
    and lower(coalesce(u.status, '')) = 'ativo'
    and lower(p.codigo) = 'gestor'
    and public.abertura_os_norm_sup(s.supervisao) = public.abertura_os_norm_sup(p_supervisao);
$$;

-- Avisa os gestores da supervisão; sem gestor vinculado, avisa quem tem o
-- módulo de Programação (ADM), senão o pedido ficaria parado sem ninguém ver.
create or replace function private.programacao_transferencia_notificar(
  p_supervisao text,
  p_tipo text,
  p_titulo text,
  p_descricao text,
  p_prioridade text,
  p_transferencia_id uuid,
  p_dedup text,
  p_excluir uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid;
  v_total integer := 0;
begin
  for v_uid in select g.uid from private.programacao_transferencia_gestores(p_supervisao) g loop
    if p_excluir is not null and v_uid = p_excluir then
      continue;
    end if;
    insert into public.painel_notificacoes
      (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_usuario_id,
       supervisao, referencia_tabela, referencia_id, chave_dedup, gerado_por_usuario_id)
    values
      (p_tipo, p_titulo, p_descricao, p_prioridade, 'user-switch', 'programacao#transferencias', v_uid,
       p_supervisao, 'programacao_transferencias', p_transferencia_id::text,
       p_dedup || ':' || v_uid, auth.uid());
    v_total := v_total + 1;
  end loop;

  if v_total = 0 then
    insert into public.painel_notificacoes
      (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
       supervisao, referencia_tabela, referencia_id, chave_dedup, gerado_por_usuario_id)
    values
      (p_tipo, p_titulo, p_descricao, p_prioridade, 'user-switch', 'programacao#transferencias', 'programacao',
       p_supervisao, 'programacao_transferencias', p_transferencia_id::text, p_dedup, auth.uid());
  end if;
end;
$$;

revoke all on function private.programacao_transferencia_gestores(text) from public, anon, authenticated;
revoke all on function private.programacao_transferencia_notificar(text, text, text, text, text, uuid, text, uuid) from public, anon, authenticated;

create or replace function private.programacao_transferencia_nome_usuario()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.nome from public.app_usuarios u where u.auth_user_id = auth.uid() limit 1),
    public.painel_current_context() #>> '{user,name}',
    'Usuário'
  );
$$;

revoke all on function private.programacao_transferencia_nome_usuario() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.programacao_transferencia_solicitar(
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
    raise exception 'Informe se os patrimônios do colaborador serão transferidos.';
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
  if coalesce(btrim(v_colab.supervisao), '') = '' then
    raise exception 'Colaborador sem supervisão no cadastro.';
  end if;
  if not public.programacao_supervisao_liberada(v_colab.supervisao) then
    raise exception 'Você só pode transferir colaboradores da(s) sua(s) supervisão(ões).';
  end if;

  select s.nome into v_destino
  from public.supervisoes s
  where s.ativo = true
    and public.abertura_os_norm_sup(s.nome) = public.abertura_os_norm_sup(p_supervisao_destino)
  limit 1;
  if v_destino is null then
    raise exception 'Supervisão de destino inválida.';
  end if;
  if public.abertura_os_norm_sup(v_destino) = public.abertura_os_norm_sup(v_colab.supervisao) then
    raise exception 'O colaborador já está nessa supervisão.';
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
      colaborador_cpf, colaborador_nome, colaborador_cargo,
      supervisao_origem, coordenacao_origem, supervisao_destino,
      transferir_patrimonios, patrimonios, motivo,
      solicitado_por, solicitado_por_nome
    ) values (
      v_cpf, v_colab.nome, v_colab.cargo,
      v_colab.supervisao, v_colab.coordenacao, v_destino,
      p_transferir_patrimonios, v_patrimonios, nullif(btrim(coalesce(p_motivo, '')), ''),
      auth.uid(), private.programacao_transferencia_nome_usuario()
    )
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Já existe uma transferência pendente para este colaborador.';
  end;

  perform private.programacao_transferencia_notificar(
    v_row.supervisao_destino,
    'transferencia_solicitada',
    'Transferência de colaborador para aceitar',
    v_row.colaborador_nome || ' — de ' || v_row.supervisao_origem || ' para ' || v_row.supervisao_destino
      || '. Patrimônios: ' || case when v_row.transferir_patrimonios
           then 'vão junto (' || jsonb_array_length(v_row.patrimonios) || ')' else 'ficam na origem' end
      || '. Abra Programação > Transferências para aceitar ou recusar.',
    'urgente',
    v_row.id,
    'transf_solicitada:' || v_row.id,
    auth.uid()
  );

  return v_row;
end;
$$;

create or replace function public.programacao_transferencia_responder(
  p_id uuid,
  p_aceitar boolean,
  p_motivo text default null
)
returns public.programacao_transferencias
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.programacao_transferencias;
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
  if not public.programacao_supervisao_liberada(v_row.supervisao_destino) then
    raise exception 'Só o gestor da supervisão % pode responder.', v_row.supervisao_destino;
  end if;
  if v_row.solicitado_por = auth.uid() and not public.painel_is_master() then
    raise exception 'Quem pediu a transferência não pode aceitá-la; aguarde o gestor de destino.';
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
         grm_status = case when p_aceitar then 'NA_FILA' else 'NAO_APLICAVEL' end
   where id = p_id
   returning * into v_row;

  -- A notificação de "para aceitar" sai da central de todos os destinatários.
  update public.painel_notificacoes
     set arquivada = true, arquivada_em = now()
   where referencia_tabela = 'programacao_transferencias'
     and referencia_id = p_id::text
     and tipo = 'transferencia_solicitada'
     and arquivada = false;

  perform private.programacao_transferencia_notificar(
    v_row.supervisao_origem,
    case when p_aceitar then 'transferencia_aceita' else 'transferencia_recusada' end,
    case when p_aceitar then 'Transferência aceita' else 'Transferência recusada' end,
    v_row.colaborador_nome || ' → ' || v_row.supervisao_destino || ': '
      || case when p_aceitar
           then 'aceita por ' || v_row.respondido_por_nome || '. O agente vai atualizar o GRM.'
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

create or replace function public.programacao_transferencia_cancelar(p_id uuid)
returns public.programacao_transferencias
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.programacao_transferencias;
begin
  select * into v_row from public.programacao_transferencias where id = p_id for update;
  if v_row is null then
    raise exception 'Transferência não encontrada.';
  end if;
  if v_row.status <> 'PENDENTE' then
    raise exception 'Só dá para cancelar transferência pendente.';
  end if;
  if not public.programacao_supervisao_liberada(v_row.supervisao_origem) then
    raise exception 'Só a supervisão de origem pode cancelar.';
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

-- Reenvio manual ao GRM depois de um ERRO do agente.
create or replace function public.programacao_transferencia_reenviar_grm(p_id uuid)
returns public.programacao_transferencias
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row public.programacao_transferencias;
begin
  select * into v_row from public.programacao_transferencias where id = p_id for update;
  if v_row is null or v_row.status <> 'ACEITA' or v_row.grm_status <> 'ERRO' then
    raise exception 'Só dá para reenviar transferência aceita com erro no GRM.';
  end if;
  if not (public.programacao_supervisao_liberada(v_row.supervisao_origem)
          or public.programacao_supervisao_liberada(v_row.supervisao_destino)) then
    raise exception 'Sem acesso a esta transferência.';
  end if;

  update public.programacao_transferencias
     set grm_status = 'NA_FILA', grm_tentativas = 0, grm_erro = null, grm_locked_at = null
   where id = p_id
   returning * into v_row;

  insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
  select 'sync-transferir-colaborador', 'pendente', 'programacao-transferencia',
         jsonb_build_object('transferencia_id', v_row.id)
  where not exists (
    select 1 from public.grm_sync_jobs
    where agente_id = 'sync-transferir-colaborador' and status in ('pendente', 'rodando')
  );

  return v_row;
end;
$$;

revoke all on function public.programacao_transferencia_solicitar(text, text, boolean, text) from public, anon;
revoke all on function public.programacao_transferencia_responder(uuid, boolean, text) from public, anon;
revoke all on function public.programacao_transferencia_cancelar(uuid) from public, anon;
revoke all on function public.programacao_transferencia_reenviar_grm(uuid) from public, anon;
grant execute on function public.programacao_transferencia_solicitar(text, text, boolean, text) to authenticated;
grant execute on function public.programacao_transferencia_responder(uuid, boolean, text) to authenticated;
grant execute on function public.programacao_transferencia_cancelar(uuid) to authenticated;
grant execute on function public.programacao_transferencia_reenviar_grm(uuid) to authenticated;

-- Resultado do agente -> avisa as duas pontas (chamado pelo trigger abaixo).
create or replace function private.programacao_transferencia_grm_resultado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_sup text;
begin
  if new.grm_status is not distinct from old.grm_status then
    return new;
  end if;

  if new.grm_status = 'APLICADA' then
    foreach v_sup in array array[new.supervisao_origem, new.supervisao_destino] loop
      perform private.programacao_transferencia_notificar(
        v_sup, 'transferencia_concluida', 'Transferência concluída no GRM',
        new.colaborador_nome || ' agora está em ' || new.supervisao_destino
          || case when new.transferir_patrimonios then ' (com os patrimônios).' else ' (patrimônios ficaram na origem).' end,
        'normal', new.id, 'transf_ok:' || new.id || ':' || v_sup, null);
    end loop;
  elsif new.grm_status = 'ERRO' then
    perform private.programacao_transferencia_notificar(
      new.supervisao_origem, 'transferencia_erro', 'Erro ao transferir no GRM',
      new.colaborador_nome || ': ' || coalesce(new.grm_erro, 'erro desconhecido')
        || '. Use "Reenviar ao GRM" em Programação > Transferências.',
      'urgente', new.id, 'transf_erro:' || new.id || ':' || new.grm_tentativas, null);
  end if;
  return new;
end;
$$;

revoke all on function private.programacao_transferencia_grm_resultado() from public, anon, authenticated;

drop trigger if exists programacao_transferencias_grm_resultado on public.programacao_transferencias;
create trigger programacao_transferencias_grm_resultado
  after update of grm_status on public.programacao_transferencias
  for each row execute function private.programacao_transferencia_grm_resultado();

-- Reivindica 1 transferência da fila (usado pelo agente, service role).
create or replace function public.claim_next_programacao_transferencia()
returns public.programacao_transferencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.programacao_transferencias;
begin
  -- PROCESSANDO há mais de 15 min = agente morreu no meio; volta pra fila.
  update public.programacao_transferencias
     set grm_status = 'NA_FILA', grm_locked_at = null
   where grm_status = 'PROCESSANDO'
     and grm_locked_at < now() - interval '15 minutes';

  update public.programacao_transferencias t
     set grm_status = 'PROCESSANDO', grm_locked_at = now(), grm_tentativas = t.grm_tentativas + 1
   where t.id = (
     select id from public.programacao_transferencias
      where status = 'ACEITA' and grm_status = 'NA_FILA'
      order by respondido_em nulls last, created_at
      limit 1
      for update skip locked
   )
   returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.claim_next_programacao_transferencia() from public, anon, authenticated;
grant execute on function public.claim_next_programacao_transferencia() to service_role;

-- ---------------------------------------------------------------------------
-- Agente
-- ---------------------------------------------------------------------------
-- Escrita no cadastro de Funcionário do GRM, disparado sob demanda (job criado
-- no aceite; interval 0 = o scheduler não agenda sozinho). Lane saida_financeiro
-- é a mesma do agente de lançamento de NFs (outro agente de escrita sob
-- demanda, baixo volume).
insert into public.grm_sync_agent_settings (
  agent_id, queue_lane, interval_minutes, enabled,
  target_lane, direction, resource_class, priority,
  max_runtime_minutes, depends_on, mutex_group
) values (
  'sync-transferir-colaborador', 'saida_financeiro', 0, true,
  'saida_financeiro', 'saida', 'light', 90,
  10, '[]'::jsonb, null
)
on conflict (agent_id) do update set
  queue_lane = excluded.queue_lane,
  interval_minutes = excluded.interval_minutes,
  target_lane = excluded.target_lane,
  direction = excluded.direction,
  resource_class = excluded.resource_class,
  priority = excluded.priority,
  max_runtime_minutes = excluded.max_runtime_minutes,
  mutex_group = excluded.mutex_group,
  updated_at = now();
