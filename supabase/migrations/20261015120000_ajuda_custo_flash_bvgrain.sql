-- Ajuda de custo: conta "Flash BVGRAIN" separada da "Flash" (GRAOMIL).
--
-- A BVGRAIN tem conta Flash própria (no cadastro do colaborador aparece como "BVGRAIN FLASH").
-- Até aqui só existiam 'ifood' e 'flash', e o XLS de Flash saía num arquivo único: quem é pago
-- pela conta da BVGRAIN caía na mesma planilha da GRAOMIL. Agora 'flash_bvgrain' é uma conta
-- à parte (PGTO_FLASH_BVGRAIN_*.xlsx, mesmo formato CPF + Valor) e o lote conta as linhas dela
-- em coluna própria.

alter table public.rh_ajuda_custo drop constraint if exists rh_ajuda_custo_conta_check;
alter table public.rh_ajuda_custo
  add constraint rh_ajuda_custo_conta_check check (conta in ('ifood', 'flash', 'flash_bvgrain'));

alter table public.rh_ajuda_custo_lotes
  add column if not exists linhas_flash_bvgrain integer not null default 0;

-- Mesma função da migration 20261006100000; só a contagem do lote ganhou a conta nova.
create or replace function public.ajuda_custo_gerar_lote(p_competencia date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_comp date := date_trunc('month', p_competencia)::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_data_lancamento date;
  v_lote uuid;
  v_numero integer;
  v_nome text;
  v_total integer;
  v_valor numeric;
  v_ifood integer;
  v_flash integer;
  v_flash_bvgrain integer;
  v_job uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.ajuda_custo_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para gerar as planilhas de Ajuda de Custo';
  end if;
  if p_competencia is null then
    raise exception 'Competência obrigatória';
  end if;

  v_data_lancamento := v_comp + 14;
  if v_hoje < v_data_lancamento then
    raise exception 'As planilhas de % só podem ser geradas a partir de %.',
      to_char(v_comp, 'MM/YYYY'), to_char(v_data_lancamento, 'DD/MM/YYYY');
  end if;

  -- Serializa a geração do mesmo mês: dois cliques simultâneos não repetem pagamento.
  perform pg_advisory_xact_lock(hashtext('ajuda_custo_lote:' || v_comp::text));

  if not exists (select 1 from public.rh_ajuda_custo where competencia = v_comp and lote_id is null) then
    raise exception 'Não há ajuda de custo nova para gerar em %.', to_char(v_comp, 'MM/YYYY');
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
  from public.rh_ajuda_custo_lotes where competencia = v_comp;

  select coalesce(nullif(btrim(u.nome), ''), u.email) into v_nome
  from public.app_usuarios u
  where u.auth_user_id = v_uid or lower(u.email) = lower(coalesce(auth.email(), ''))
  limit 1;

  insert into public.rh_ajuda_custo_lotes (competencia, numero, gerado_por, gerado_por_nome)
  values (v_comp, v_numero, v_uid, v_nome)
  returning id into v_lote;

  update public.rh_ajuda_custo
     set lote_id = v_lote, updated_at = now()
   where competencia = v_comp and lote_id is null;

  -- Dois movimentos por ajuda. Descrição no GRM = descrição do RH + mês de referência.
  insert into public.ajuda_custo_caixa_lancamentos (
    ajuda_id, lote_id, competencia, colaborador_id, colaborador_nome, colaborador_cpf,
    movimento, valor, descricao_grm, data_lancamento, solicitado_por
  )
  select a.id, v_lote, a.competencia, a.colaborador_id, a.colaborador_nome, a.colaborador_cpf,
         m.movimento, a.valor,
         left(btrim(a.descricao) || ' - ' || to_char(a.competencia, 'MM/YYYY'), 250),
         v_data_lancamento, v_uid
    from public.rh_ajuda_custo a
   cross join (values ('ADIANTAMENTO'), ('COMPROVANTE')) as m(movimento)
   where a.lote_id = v_lote;

  select count(*), coalesce(sum(valor), 0),
         count(*) filter (where conta = 'ifood'),
         count(*) filter (where conta = 'flash'),
         count(*) filter (where conta = 'flash_bvgrain')
    into v_total, v_valor, v_ifood, v_flash, v_flash_bvgrain
    from public.rh_ajuda_custo where lote_id = v_lote;

  update public.rh_ajuda_custo_lotes
     set total_linhas = v_total, total_valor = v_valor,
         linhas_ifood = v_ifood, linhas_flash = v_flash, linhas_flash_bvgrain = v_flash_bvgrain
   where id = v_lote;

  if not exists (
    select 1 from public.grm_sync_jobs
     where agente_id = 'sync-ajuda-custo-caixa' and status in ('pendente', 'rodando', 'processando')
  ) then
    insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
    values ('sync-ajuda-custo-caixa', 'pendente', v_uid::text,
            jsonb_build_object('competencia', v_comp, 'lote_id', v_lote, 'origem', 'financeiro_ajuda_custo'))
    returning id into v_job;
  end if;

  return jsonb_build_object(
    'lote_id', v_lote, 'numero', v_numero, 'competencia', v_comp,
    'total_linhas', v_total, 'total_valor', v_valor,
    'linhas_ifood', v_ifood, 'linhas_flash', v_flash, 'linhas_flash_bvgrain', v_flash_bvgrain,
    'data_lancamento', v_data_lancamento, 'job_id', v_job
  );
end;
$$;

revoke all on function public.ajuda_custo_gerar_lote(date) from public;
grant execute on function public.ajuda_custo_gerar_lote(date) to authenticated;
