-- Bônus como módulo de permissão independente em Usuários e Acessos.
insert into public.app_modulos (
  codigo, nome, categoria, icone, rota, ordem, ativo, descricao
) values (
  'conferencia_bonus',
  'Bônus',
  'CONFERÊNCIA',
  'coins',
  '/painel/conferencia-bonus',
  25,
  true,
  'Conferência mensal de bônus, auditoria de aptidão e lançamento no Caixa do colaborador.'
)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  icone = excluded.icone,
  rota = excluded.rota,
  ordem = excluded.ordem,
  ativo = excluded.ativo,
  descricao = excluded.descricao,
  updated_at = now();

create or replace function public.bonus_usuario_tem_acesso()
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
            and lower(m.codigo) = 'conferencia_bonus'
        )
      )
  );
$$;

revoke all on function public.bonus_usuario_tem_acesso() from public;
grant execute on function public.bonus_usuario_tem_acesso() to authenticated;

drop policy if exists bonus_caixa_select_authenticated on public.bonus_caixa_lancamentos;
create policy bonus_caixa_select_autorizado
on public.bonus_caixa_lancamentos
for select
to authenticated
using (public.bonus_usuario_tem_acesso());

create or replace function public.bonus_solicitar_lancamento_caixa(
  p_competencia date,
  p_colaboradores text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_comp date := date_trunc('month', p_competencia)::date;
  v_nome text;
  v_key text;
  v_row record;
  v_existente text;
  v_enfileirados integer := 0;
  v_ja_lancados integer := 0;
  v_ja_pendentes integer := 0;
  v_rejeitados integer := 0;
  v_rejeicoes jsonb := '[]'::jsonb;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.bonus_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para lançar Bônus';
  end if;

  if p_colaboradores is null or coalesce(array_length(p_colaboradores, 1), 0) = 0 then
    raise exception 'Selecione ao menos um colaborador';
  end if;

  for v_nome in
    select distinct btrim(x)
    from unnest(p_colaboradores) x
    where btrim(coalesce(x, '')) <> ''
  loop
    v_key := public.bonus_nome_normalizado(v_nome);

    select * into v_row
    from public.bonus_producao_competencia(v_comp) b
    where public.bonus_nome_normalizado(b.colaborador) = v_key
    limit 1;

    if not found then
      v_rejeitados := v_rejeitados + 1;
      v_rejeicoes := v_rejeicoes || jsonb_build_array(
        jsonb_build_object('colaborador', v_nome, 'motivo', 'Sem produção na competência')
      );
      continue;
    end if;

    if v_row.status <> 'Apto' then
      v_rejeitados := v_rejeitados + 1;
      v_rejeicoes := v_rejeicoes || jsonb_build_array(
        jsonb_build_object(
          'colaborador', v_row.colaborador,
          'motivo', coalesce(v_row.motivo, 'Colaborador inapto')
        )
      );
      continue;
    end if;

    select upper(status) into v_existente
    from public.bonus_caixa_lancamentos
    where competencia = v_comp
      and nome_normalizado = v_key;

    if v_existente = 'LANCADO' then
      v_ja_lancados := v_ja_lancados + 1;
      continue;
    end if;

    if v_existente in ('PENDENTE', 'PROCESSANDO') then
      v_ja_pendentes := v_ja_pendentes + 1;
      continue;
    end if;

    insert into public.bonus_caixa_lancamentos (
      competencia,
      colaborador_nome,
      nome_normalizado,
      tons,
      valor,
      status,
      tentativas,
      ultimo_erro,
      grm_retorno,
      solicitado_por,
      solicitado_em,
      iniciado_em,
      processado_em,
      updated_at
    ) values (
      v_comp,
      v_row.colaborador,
      v_key,
      v_row.tons,
      v_row.valor,
      'PENDENTE',
      0,
      null,
      null,
      v_uid,
      now(),
      null,
      null,
      now()
    )
    on conflict (competencia, nome_normalizado) do update set
      colaborador_nome = excluded.colaborador_nome,
      tons = excluded.tons,
      valor = excluded.valor,
      status = 'PENDENTE',
      tentativas = 0,
      ultimo_erro = null,
      grm_retorno = null,
      solicitado_por = excluded.solicitado_por,
      solicitado_em = now(),
      iniciado_em = null,
      processado_em = null,
      updated_at = now()
    where upper(public.bonus_caixa_lancamentos.status) not in ('LANCADO', 'PENDENTE', 'PROCESSANDO');

    if found then
      v_enfileirados := v_enfileirados + 1;
    end if;
  end loop;

  if v_enfileirados > 0 and not exists (
    select 1
    from public.grm_sync_jobs
    where agente_id = 'sync-bonus-caixa'
      and status in ('pendente', 'rodando', 'processando')
  ) then
    insert into public.grm_sync_jobs (
      agente_id,
      status,
      solicitado_por,
      payload
    ) values (
      'sync-bonus-caixa',
      'pendente',
      v_uid::text,
      jsonb_build_object('competencia', v_comp, 'origem', 'conferencia_bonus')
    ) returning id into v_job_id;
  end if;

  return jsonb_build_object(
    'competencia', v_comp,
    'enfileirados', v_enfileirados,
    'ja_lancados', v_ja_lancados,
    'ja_pendentes', v_ja_pendentes,
    'rejeitados', v_rejeitados,
    'rejeicoes', v_rejeicoes,
    'job_id', v_job_id
  );
end;
$$;

revoke all on function public.bonus_solicitar_lancamento_caixa(date, text[]) from public;
grant execute on function public.bonus_solicitar_lancamento_caixa(date, text[]) to authenticated;
