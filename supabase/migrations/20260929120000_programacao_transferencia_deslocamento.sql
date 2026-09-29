-- Transferência com colaborador EM DESLOCAMENTO (pedido do usuário, 2026-09-29).
--
-- Vindo da opção "Deslocamento" do Sem O.S.: o colaborador é transferido de
-- regional, mas ainda está a caminho da nova supervisão. Depois que o GRM troca
-- a supervisão dele, ele passaria a aparecer como candidato pro gestor de
-- destino, que poderia escalá-lo numa O.S. antes de ele chegar. Por isso a
-- transferência guarda a chegada prevista e o colaborador fica indisponível na
-- Programação (candidatos, trocas, Sem O.S. e este trigger) até:
--   a) o gestor de destino confirmar a chegada; ou
--   b) chegar o dia da chegada prevista (data_referencia >= chegada_prevista).

alter table public.programacao_transferencias
  add column if not exists em_deslocamento boolean not null default false,
  add column if not exists chegada_prevista date,
  add column if not exists chegada_confirmada_em timestamptz,
  add column if not exists chegada_confirmada_por_nome text;

alter table public.programacao_transferencias
  drop constraint if exists programacao_transferencias_deslocamento_data;
alter table public.programacao_transferencias
  add constraint programacao_transferencias_deslocamento_data
  check (not em_deslocamento or chegada_prevista is not null);

create index if not exists programacao_transferencias_deslocamento_idx
  on public.programacao_transferencias (colaborador_cpf)
  where status = 'ACEITA' and em_deslocamento and chegada_confirmada_em is null;

-- ---------------------------------------------------------------------------
-- Solicitar: agora aceita em_deslocamento + chegada_prevista.
-- (A assinatura muda, então a antiga sai para não virar overload ambíguo.)
-- ---------------------------------------------------------------------------
drop function if exists public.programacao_transferencia_solicitar(text, text, boolean, text);

create or replace function public.programacao_transferencia_solicitar(
  p_colaborador_cpf text,
  p_supervisao_destino text,
  p_transferir_patrimonios boolean,
  p_motivo text default null,
  p_em_deslocamento boolean default false,
  p_chegada_prevista date default null
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
  v_desloc boolean := coalesce(p_em_deslocamento, false);
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
  if v_desloc and p_chegada_prevista is null then
    raise exception 'Informe a data prevista de chegada do colaborador na nova supervisão.';
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
      em_deslocamento, chegada_prevista,
      solicitado_por, solicitado_por_nome
    ) values (
      v_cpf, v_colab.nome, v_colab.cargo,
      v_colab.supervisao, v_colab.coordenacao, v_destino,
      p_transferir_patrimonios, v_patrimonios, nullif(btrim(coalesce(p_motivo, '')), ''),
      v_desloc, case when v_desloc then p_chegada_prevista else null end,
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
      || case when v_row.em_deslocamento
           then '. Colaborador em deslocamento: chegada prevista em ' || to_char(v_row.chegada_prevista, 'DD/MM/YYYY')
             || ' (até lá ele não pode ser escalado na sua programação)'
           else '' end
      || '. Abra Programação > Transferências para aceitar ou recusar.',
    'urgente',
    v_row.id,
    'transf_solicitada:' || v_row.id,
    auth.uid()
  );

  return v_row;
end;
$$;

revoke all on function public.programacao_transferencia_solicitar(text, text, boolean, text, boolean, date) from public, anon;
grant execute on function public.programacao_transferencia_solicitar(text, text, boolean, text, boolean, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Confirmar chegada: o gestor de destino libera o colaborador antes da data.
-- ---------------------------------------------------------------------------
create or replace function public.programacao_transferencia_confirmar_chegada(p_id uuid)
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
  if v_row.status <> 'ACEITA' or not v_row.em_deslocamento then
    raise exception 'Esta transferência não está com colaborador em deslocamento.';
  end if;
  if v_row.chegada_confirmada_em is not null then
    raise exception 'A chegada já foi confirmada.';
  end if;
  if not public.programacao_supervisao_liberada(v_row.supervisao_destino) then
    raise exception 'Só o gestor da supervisão % pode confirmar a chegada.', v_row.supervisao_destino;
  end if;

  update public.programacao_transferencias
     set chegada_confirmada_em = now(),
         chegada_confirmada_por_nome = private.programacao_transferencia_nome_usuario()
   where id = p_id
   returning * into v_row;

  perform private.programacao_transferencia_notificar(
    v_row.supervisao_origem,
    'transferencia_chegada',
    'Colaborador chegou na nova supervisão',
    v_row.colaborador_nome || ' teve a chegada em ' || v_row.supervisao_destino
      || ' confirmada por ' || v_row.chegada_confirmada_por_nome || '.',
    'normal',
    v_row.id,
    'transf_chegada:' || v_row.id,
    auth.uid()
  );

  return v_row;
end;
$$;

revoke all on function public.programacao_transferencia_confirmar_chegada(uuid) from public, anon;
grant execute on function public.programacao_transferencia_confirmar_chegada(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trava no banco: ninguém escala em O.S. um colaborador ainda em deslocamento.
-- A tela já esconde o colaborador; este trigger garante mesmo com a tela
-- desatualizada ou outro caminho de escrita. Só age em confirmação NOVA
-- (linhas já confirmadas não são tocadas) e só quando existe transferência
-- em deslocamento pendente de chegada para o CPF — caso contrário retorna
-- direto, sem custo.
-- ---------------------------------------------------------------------------
create or replace function private.programacao_equipe_bloqueia_em_deslocamento()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cpf text;
  v_data date;
  v_nome text;
  v_destino text;
  v_prevista date;
begin
  if new.confirmado is not true then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.confirmado is true
     and old.colaborador_id is not distinct from new.colaborador_id then
    return new;
  end if;

  v_cpf := regexp_replace(coalesce(new.colaborador_id, ''), '\D', '', 'g');
  if length(v_cpf) < 11 then
    return new;
  end if;

  select d.data_referencia into v_data
  from public.programacao_dia d
  where d.id = new.programacao_id;
  if v_data is null then
    return new;
  end if;

  select t.colaborador_nome, t.supervisao_destino, t.chegada_prevista
    into v_nome, v_destino, v_prevista
  from public.programacao_transferencias t
  where t.colaborador_cpf = v_cpf
    and t.status = 'ACEITA'
    and t.em_deslocamento
    and t.chegada_confirmada_em is null
    and t.chegada_prevista > v_data
  order by t.chegada_prevista desc
  limit 1;

  if v_nome is not null then
    raise exception '% está em deslocamento para % (chegada prevista em %) e não pode ser escalado antes disso. Confirme a chegada em Programação > Transferências.',
      v_nome, v_destino, to_char(v_prevista, 'DD/MM/YYYY');
  end if;

  return new;
end;
$$;

revoke all on function private.programacao_equipe_bloqueia_em_deslocamento() from public, anon, authenticated;

drop trigger if exists programacao_equipe_bloqueia_em_deslocamento on public.programacao_equipe;
create trigger programacao_equipe_bloqueia_em_deslocamento
  before insert or update of confirmado, colaborador_id on public.programacao_equipe
  for each row execute function private.programacao_equipe_bloqueia_em_deslocamento();
