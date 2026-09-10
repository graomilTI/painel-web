-- Conferência > Bônus: a planilha de auditoria (que hoje só bloqueia o bônus,
-- marcando o colaborador como Inapto) passa a trazer também Valor e Descrição
-- do desconto. Esse desconto agora é lançado automaticamente como Adiantamento
-- no Caixa do colaborador (mesmo padrão de fila + worker do bonus_caixa_lancamentos),
-- respeitando um teto de R$500,00 de valor total comprometido no Caixa por
-- colaborador (teto de desconto de auditorias).

alter table public.bonus_auditoria_inaptos
  add column if not exists valor_desconto numeric not null default 0,
  add column if not exists descricao_desconto text;

create table if not exists public.bonus_desconto_caixa_lancamentos (
  id uuid not null default gen_random_uuid(),
  competencia date not null,
  colaborador_nome text not null,
  nome_normalizado text not null,
  valor numeric not null default 0,
  valor_original numeric not null default 0,
  descricao text,
  status text not null default 'PENDENTE',
  tentativas integer not null default 0,
  ultimo_erro text,
  grm_retorno jsonb,
  solicitado_por uuid,
  solicitado_em timestamp with time zone not null default now(),
  iniciado_em timestamp with time zone,
  processado_em timestamp with time zone,
  updated_at timestamp with time zone not null default now(),
  constraint bonus_desconto_caixa_lancamentos_status_check
    check (status = any (array['PENDENTE','PROCESSANDO','LANCADO','ERRO','CANCELADO'])),
  constraint bonus_desconto_caixa_competencia_primeiro_dia
    check (competencia = (date_trunc('month', competencia::timestamp with time zone))::date),
  constraint bonus_desconto_caixa_lancamentos_pkey primary key (id),
  constraint bonus_desconto_caixa_lancamentos_un unique (competencia, nome_normalizado)
);

create index if not exists bonus_desconto_caixa_status_idx
  on public.bonus_desconto_caixa_lancamentos using btree (status);
create index if not exists bonus_desconto_caixa_nome_idx
  on public.bonus_desconto_caixa_lancamentos using btree (nome_normalizado);

alter table public.bonus_desconto_caixa_lancamentos enable row level security;

drop policy if exists bonus_desconto_caixa_select_autorizado on public.bonus_desconto_caixa_lancamentos;
create policy bonus_desconto_caixa_select_autorizado
on public.bonus_desconto_caixa_lancamentos
for select
to authenticated
using (public.bonus_usuario_tem_acesso());

-- Substitui a auditoria da competência a partir de itens {nome, valor, descricao}
-- (antes só recebia uma lista de nomes). Continua bloqueando o bônus (Inapto)
-- e agora também enfileira o Adiantamento correspondente no Caixa, respeitando
-- o teto de R$500,00 de valor total comprometido por colaborador.
drop function if exists public.bonus_substituir_auditoria(date, text[], text);

create or replace function public.bonus_substituir_auditoria(
  p_competencia date,
  p_itens jsonb,
  p_arquivo_nome text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_competencia date;
  v_total_inaptos integer := 0;
  v_teto constant numeric := 500.00;
  v_item record;
  v_ja_comprometido numeric;
  v_restante numeric;
  v_valor_a_lancar numeric;
  v_status_atual text;
  v_enfileirados integer := 0;
  v_valor_enfileirado numeric := 0;
  v_bloqueados integer := 0;
  v_bloqueios jsonb := '[]'::jsonb;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.bonus_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para administrar o Bônus';
  end if;

  if p_competencia is null then
    raise exception 'Competência obrigatória';
  end if;

  v_competencia := date_trunc('month', p_competencia)::date;

  delete from public.bonus_auditoria_inaptos
  where competencia = v_competencia;

  -- Agrupa por nome normalizado: soma valores repetidos e concatena descrições únicas.
  with itens as (
    select
      trim(x.item ->> 'nome') as nome,
      public.bonus_normalizar_nome(x.item ->> 'nome') as nome_key,
      coalesce((x.item ->> 'valor')::numeric, 0) as valor,
      nullif(trim(x.item ->> 'descricao'), '') as descricao
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as x(item)
    where nullif(trim(x.item ->> 'nome'), '') is not null
      and public.bonus_normalizar_nome(x.item ->> 'nome') <> ''
  ),
  agrupado as (
    select
      nome_key,
      min(nome) as nome,
      sum(coalesce(valor, 0)) as valor_desconto,
      nullif(string_agg(distinct descricao, '; ' order by descricao), '') as descricao_desconto
    from itens
    group by nome_key
  )
  insert into public.bonus_auditoria_inaptos (
    competencia,
    colaborador_nome,
    nome_normalizado,
    arquivo_nome,
    importado_por,
    valor_desconto,
    descricao_desconto
  )
  select
    v_competencia,
    a.nome,
    a.nome_key,
    nullif(trim(p_arquivo_nome), ''),
    v_uid,
    a.valor_desconto,
    a.descricao_desconto
  from agrupado a
  on conflict (competencia, nome_normalizado)
  do update set
    colaborador_nome = excluded.colaborador_nome,
    arquivo_nome = excluded.arquivo_nome,
    importado_por = excluded.importado_por,
    importado_em = now(),
    valor_desconto = excluded.valor_desconto,
    descricao_desconto = excluded.descricao_desconto;

  get diagnostics v_total_inaptos = row_count;

  -- Enfileira o Adiantamento no Caixa para quem tem valor de desconto > 0,
  -- respeitando o teto de R$500 comprometidos (PENDENTE/PROCESSANDO/LANCADO)
  -- por colaborador, somando outras competências já enfileiradas/lançadas.
  for v_item in
    select colaborador_nome, nome_normalizado, valor_desconto, descricao_desconto
    from public.bonus_auditoria_inaptos
    where competencia = v_competencia
      and coalesce(valor_desconto, 0) > 0
  loop
    select coalesce(sum(valor), 0) into v_ja_comprometido
    from public.bonus_desconto_caixa_lancamentos
    where nome_normalizado = v_item.nome_normalizado
      and competencia <> v_competencia
      and upper(status) in ('PENDENTE', 'PROCESSANDO', 'LANCADO');

    v_restante := greatest(v_teto - v_ja_comprometido, 0);
    v_valor_a_lancar := least(v_item.valor_desconto, v_restante);

    select upper(status) into v_status_atual
    from public.bonus_desconto_caixa_lancamentos
    where competencia = v_competencia
      and nome_normalizado = v_item.nome_normalizado;

    if v_status_atual = 'LANCADO' then
      -- Já foi lançado para esta competência: não mexe, só conta no comprometido.
      continue;
    end if;

    if v_valor_a_lancar <= 0 then
      v_bloqueados := v_bloqueados + 1;
      v_bloqueios := v_bloqueios || jsonb_build_array(
        jsonb_build_object(
          'colaborador', v_item.colaborador_nome,
          'motivo', format('Teto de R$%s já comprometido no Caixa', to_char(v_teto, 'FM999999990.00'))
        )
      );
      update public.bonus_desconto_caixa_lancamentos
      set status = 'CANCELADO', updated_at = now()
      where competencia = v_competencia
        and nome_normalizado = v_item.nome_normalizado
        and upper(status) in ('PENDENTE', 'PROCESSANDO', 'ERRO');
      continue;
    end if;

    insert into public.bonus_desconto_caixa_lancamentos (
      competencia,
      colaborador_nome,
      nome_normalizado,
      valor,
      valor_original,
      descricao,
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
      v_competencia,
      v_item.colaborador_nome,
      v_item.nome_normalizado,
      v_valor_a_lancar,
      v_item.valor_desconto,
      coalesce(v_item.descricao_desconto, 'Desconto de auditoria'),
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
      valor = excluded.valor,
      valor_original = excluded.valor_original,
      descricao = excluded.descricao,
      status = 'PENDENTE',
      tentativas = 0,
      ultimo_erro = null,
      grm_retorno = null,
      solicitado_por = excluded.solicitado_por,
      solicitado_em = now(),
      iniciado_em = null,
      processado_em = null,
      updated_at = now()
    where upper(public.bonus_desconto_caixa_lancamentos.status) not in ('LANCADO', 'PROCESSANDO');

    if found then
      v_enfileirados := v_enfileirados + 1;
      v_valor_enfileirado := v_valor_enfileirado + v_valor_a_lancar;

      if v_valor_a_lancar < v_item.valor_desconto then
        v_bloqueios := v_bloqueios || jsonb_build_array(
          jsonb_build_object(
            'colaborador', v_item.colaborador_nome,
            'motivo', format(
              'Valor reduzido de R$%s para R$%s pelo teto de R$%s no Caixa',
              to_char(v_item.valor_desconto, 'FM999999990.00'),
              to_char(v_valor_a_lancar, 'FM999999990.00'),
              to_char(v_teto, 'FM999999990.00')
            )
          )
        );
      end if;
    end if;
  end loop;

  if v_enfileirados > 0 and not exists (
    select 1
    from public.grm_sync_jobs
    where agente_id = 'sync-bonus-desconto-caixa'
      and status in ('pendente', 'rodando', 'processando')
  ) then
    insert into public.grm_sync_jobs (
      agente_id,
      status,
      solicitado_por,
      payload
    ) values (
      'sync-bonus-desconto-caixa',
      'pendente',
      v_uid::text,
      jsonb_build_object(
        'competencia', v_competencia,
        'origem', 'conferencia_bonus_auditoria',
        'quantidade', v_enfileirados
      )
    ) returning id into v_job_id;
  end if;

  return jsonb_build_object(
    'competencia', v_competencia,
    'importados', v_total_inaptos,
    'enfileirados_caixa', v_enfileirados,
    'valor_enfileirado_caixa', v_valor_enfileirado,
    'bloqueados_teto', v_bloqueados,
    'bloqueios', v_bloqueios,
    'job_id', v_job_id
  );
end;
$$;

revoke all on function public.bonus_substituir_auditoria(date, jsonb, text) from public;
grant execute on function public.bonus_substituir_auditoria(date, jsonb, text) to authenticated;
