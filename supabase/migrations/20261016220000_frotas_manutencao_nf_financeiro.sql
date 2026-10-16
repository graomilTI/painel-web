-- Frotas · Manutenção (Fase 5): nota fiscal da oficina para o GRM e pagamento no Financeiro.
-- Ao concluir uma manutenção PAGA PELA EMPRESA com NF anexada, a RPC frotas_manutencao_enviar_nf_financeiro:
--   1) coloca a NF na fila do agente de lançamento (grm_nf_lancamentos, setor FROTAS, categoria forçada pelos itens);
--   2) cria a solicitação de pagamento em financeiro_pagamentos (origem FROTAS), com oficina, CNPJ e PIX do cadastro.
-- Depois disso tudo volta sozinho para a manutenção: NF lançada/erro no GRM (aviso à equipe), pagamento feito
-- e comprovante. Só o "custo final" fica travado depois que o pagamento é criado.
-- Manutenção de locadora/colaborador/proprietário NÃO vai para NF nem Financeiro.

alter table public.frotas_manutencoes
  add column if not exists nf_enviada_em timestamptz,
  add column if not exists pago_em timestamptz;

-- ============================================================
-- 1. Categoria do GRM pelos itens da manutenção
-- ============================================================
-- Catálogo real (grm_nf_catalogo, grupo DESPESAS COM VEICULOS): MANUT. VEICULOS PECAS, MANUT. VEICULOS SERVICOS, PNEUS AQUISICAO.
-- Só pneus (peças, categoria 13) -> PNEUS AQUISICAO; só peças -> PECAS; o resto (serviço ou NF mista) -> SERVICOS.
create or replace function private.frotas_manut_categoria_grm(p_manutencao uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when count(*) > 0 and count(*) filter (where categoria_codigo = 13 and tipo_item = 'peca') = count(*) then 'PNEUS AQUISICAO'
    when count(*) > 0 and count(*) filter (where tipo_item = 'peca') = count(*) then 'MANUT. VEICULOS PECAS'
    else 'MANUT. VEICULOS SERVICOS'
  end
  from public.frotas_manutencao_itens where manutencao_id = p_manutencao;
$$;

-- ============================================================
-- 2. Travas: só as funções abaixo mexem nos vínculos com NF e pagamento
-- ============================================================
create or replace function public.frotas_manutencoes_financeiro_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_liberado boolean := coalesce(current_setting('app.frotas_manut_financeiro', true), '') = '1';
begin
  if auth.uid() is null or v_liberado then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.nf_lancamento_id := null;
    new.pagamento_id := null;
    new.nf_enviada_em := null;
    new.pago_em := null;
    return new;
  end if;
  new.nf_lancamento_id := old.nf_lancamento_id;
  new.pagamento_id := old.pagamento_id;
  new.nf_enviada_em := old.nf_enviada_em;
  new.pago_em := old.pago_em;
  if old.pagamento_id is not null and new.custo is distinct from old.custo then
    raise exception 'O custo já foi enviado ao Financeiro e não pode mais ser alterado aqui.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_frotas_manutencoes_financeiro_guard on public.frotas_manutencoes;
create trigger trg_frotas_manutencoes_financeiro_guard
  before insert or update on public.frotas_manutencoes
  for each row execute function public.frotas_manutencoes_financeiro_guard();

-- ============================================================
-- 3. Enviar NF ao GRM e pagamento ao Financeiro
-- ============================================================
create or replace function public.frotas_manutencao_enviar_nf_financeiro(p_manutencao uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  v record;
  o record;
  v_cod text;
  v_path text;
  v_nome text;
  v_mime text;
  v_ext text;
  v_cat text;
  v_ajustes jsonb;
  v_nf uuid;
  v_pg uuid;
  v_ator text := public.frotas_manutencao_ator_nome();
begin
  if auth.uid() is null or not public.painel_has_module(array['frotas_manutencao'], false) then
    raise exception 'Sem permissão para enviar manutenção ao Financeiro.' using errcode = 'insufficient_privilege';
  end if;

  select * into m from public.frotas_manutencoes where id = p_manutencao for update;
  if not found then raise exception 'Manutenção não encontrada.' using errcode = 'no_data_found'; end if;
  if m.status <> 'concluida' then
    raise exception 'Só manutenção concluída vai para a nota fiscal e o Financeiro.' using errcode = 'check_violation';
  end if;
  if m.responsavel_pagamento is distinct from 'empresa' then
    raise exception 'Esta manutenção não é paga pela empresa (responsável: %): não vai para NF nem Financeiro.', coalesce(m.responsavel_pagamento, 'não definido')
      using errcode = 'check_violation';
  end if;
  if coalesce(m.custo, 0) <= 0 then
    raise exception 'Informe o custo final da manutenção antes de enviar ao Financeiro.' using errcode = 'check_violation';
  end if;
  if nullif(btrim(coalesce(m.anexo_url, '')), '') is null then
    raise exception 'Anexe a nota fiscal da oficina antes de enviar.' using errcode = 'check_violation';
  end if;
  if m.nf_lancamento_id is not null and m.pagamento_id is not null then
    return jsonb_build_object('nf_lancamento_id', m.nf_lancamento_id, 'pagamento_id', m.pagamento_id, 'ja_enviada', true);
  end if;

  select placa, coordenacao into v from public.frotas_veiculos where id = m.veiculo_id;
  select * into o from public.frotas_oficinas where id = m.oficina_id;
  v_cod := 'MAN-' || lpad(m.numero::text, 6, '0');

  perform set_config('app.frotas_manut_financeiro', '1', true);

  v_nf := m.nf_lancamento_id;
  if v_nf is null then
    v_path := substring(split_part(m.anexo_url, '?', 1) from '/notas-fiscais/(.+)$');
    if v_path is null then
      raise exception 'Não consegui localizar o arquivo da NF no armazenamento. Anexe a nota fiscal de novo.' using errcode = 'check_violation';
    end if;
    v_nome := regexp_replace(regexp_replace(v_path, '^.*/', ''), '^\d+-', '');
    v_ext := lower(coalesce(substring(v_nome from '\.([A-Za-z0-9]+)$'), ''));
    v_mime := case v_ext when 'pdf' then 'application/pdf' when 'xml' then 'application/xml'
                         when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' else null end;
    v_cat := private.frotas_manut_categoria_grm(m.id);
    v_ajustes := jsonb_build_object('grupo_categoria', 'DESPESAS COM VEICULOS', 'categoria', v_cat);
    if nullif(btrim(coalesce(m.nf_numero, '')), '') is not null then
      v_ajustes := v_ajustes || jsonb_build_object('numero_documento', left(btrim(m.nf_numero), 200));
    end if;

    insert into public.grm_nf_lancamentos
      (storage_bucket, storage_path, arquivo_nome, arquivo_mime_type, setor, enviado_por, status, ajustes_manuais, extraido_json)
    values
      ('notas-fiscais', v_path, v_nome, v_mime, 'FROTAS', auth.uid(), 'NOVO', v_ajustes,
       jsonb_build_object('origem', 'FROTAS', 'manutencao_id', m.id, 'manutencao', v_cod, 'placa', v.placa, 'os', m.os_numero))
    on conflict (storage_path) do nothing
    returning id into v_nf;
    if v_nf is null then
      select id into v_nf from public.grm_nf_lancamentos where storage_path = v_path;
    end if;
  end if;

  v_pg := m.pagamento_id;
  if v_pg is null then
    insert into public.financeiro_pagamentos
      (origem_setor, origem_tabela, origem_id, origem_codigo, competencia, descricao,
       favorecido_nome, favorecido_documento, chave_pix, forma_pagamento, valor, status, prioridade,
       nf_status, nf_numero, nf_url, solicitado_por, solicitado_por_nome, atualizado_por,
       origem, setor, coordenacao, gestor, observacoes)
    values
      ('FROTAS', 'frotas_manutencoes', m.id, v_cod, m.data_execucao,
       format('Manutenção %s · %s%s', v.placa, coalesce(m.os_numero, v_cod), coalesce(' · ' || coalesce(o.nome, nullif(m.oficina, '')), '')),
       coalesce(o.razao_social, o.nome, nullif(m.oficina, ''), 'Oficina'), o.cnpj, nullif(btrim(coalesce(o.pix_chave, '')), ''),
       case when nullif(btrim(coalesce(o.pix_chave, '')), '') is not null then 'PIX' else 'OUTRO' end,
       m.custo, 'PENDENTE', 'NORMAL',
       'NF_RECEBIDA', nullif(btrim(coalesce(m.nf_numero, '')), ''), m.anexo_url, auth.uid(), v_ator, auth.uid(),
       'FROTAS', 'FROTAS', v.coordenacao, m.solicitante_nome,
       left(coalesce(m.descricao, ''), 400))
    returning id into v_pg;
  end if;

  update public.frotas_manutencoes
     set nf_lancamento_id = v_nf, pagamento_id = v_pg, nf_enviada_em = coalesce(nf_enviada_em, now())
   where id = m.id;

  perform set_config('app.frotas_manut_financeiro', '0', true);
  return jsonb_build_object('nf_lancamento_id', v_nf, 'pagamento_id', v_pg, 'ja_enviada', false);
exception when others then
  perform set_config('app.frotas_manut_financeiro', '0', true);
  raise;
end;
$$;

grant execute on function public.frotas_manutencao_enviar_nf_financeiro(uuid) to authenticated;

-- Situação da NF no GRM e do pagamento (quem usa Manutenção não lê essas tabelas).
create or replace function public.frotas_manutencao_nf_status(p_manutencao uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m record;
begin
  if not public.painel_has_module(array['frotas_manutencao', 'frotas', 'dashboard_socio'], false) then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  select nf_lancamento_id, pagamento_id, nf_enviada_em into m from public.frotas_manutencoes where id = p_manutencao;
  return jsonb_build_object(
    'enviada', m.nf_enviada_em is not null,
    'nf', (select jsonb_build_object('status', l.status, 'erro', l.erro, 'grm_codigo', l.grm_codigo,
                                     'numero_documento', l.numero_documento, 'categoria', l.categoria)
             from public.grm_nf_lancamentos l where l.id = m.nf_lancamento_id),
    'pagamento', (select jsonb_build_object('status', p.status, 'nf_status', p.nf_status, 'pago_em', p.pago_em,
                                            'comprovante_url', p.comprovante_url, 'valor', p.valor, 'forma', p.forma_pagamento)
                    from public.financeiro_pagamentos p where p.id = m.pagamento_id));
end;
$$;

grant execute on function public.frotas_manutencao_nf_status(uuid) to authenticated;

-- ============================================================
-- 4. Retorno: pagamento feito / NF lançada ou com erro
-- ============================================================
create or replace function public.sincronizar_pagamento_frotas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
  v_cod text;
begin
  select * into m from public.frotas_manutencoes where id = new.origem_id and pagamento_id = new.id;
  if not found then return new; end if;
  v_cod := 'MAN-' || lpad(m.numero::text, 6, '0');

  perform set_config('app.frotas_manut_financeiro', '1', true);
  update public.frotas_manutencoes
     set comprovante_url = coalesce(nullif(new.comprovante_url, ''), comprovante_url),
         pago_em = case when new.status = 'PAGO' then coalesce(new.pago_em, now()) else pago_em end
   where id = m.id;
  perform set_config('app.frotas_manut_financeiro', '0', true);

  if new.status is distinct from old.status and new.status in ('PAGO', 'RECUSADO', 'CANCELADO') then
    perform private.frotas_manut_notificar('frotas_manut_pago',
      case new.status when 'PAGO' then 'Pagamento da manutenção realizado — ' || v_cod
                      else 'Pagamento da manutenção ' || lower(new.status) || ' — ' || v_cod end,
      concat_ws(' | ', new.descricao, private.frotas_brl(new.valor)),
      case when new.status = 'PAGO' then 'normal' else 'atencao' end, 'check-circle',
      m.id, 'frotas_manut_pago:' || new.id::text || ':' || new.status || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
      'frotas_manutencao', null, null);
  end if;
  return new;
exception when others then
  perform set_config('app.frotas_manut_financeiro', '0', true);
  raise warning 'sincronizar_pagamento_frotas: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_pagamento_frotas on public.financeiro_pagamentos;
create trigger trg_sincronizar_pagamento_frotas
  after update on public.financeiro_pagamentos
  for each row
  when (new.origem_tabela = 'frotas_manutencoes'
        and (old.status is distinct from new.status or old.comprovante_url is distinct from new.comprovante_url))
  execute function public.sincronizar_pagamento_frotas();

create or replace function public.sincronizar_nf_frotas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
  v_cod text;
begin
  select * into m from public.frotas_manutencoes where nf_lancamento_id = new.id;
  if not found then return new; end if;
  v_cod := 'MAN-' || lpad(m.numero::text, 6, '0');

  if new.status = 'LANCADO' and m.pagamento_id is not null then
    update public.financeiro_pagamentos set nf_status = 'LANCADA'
     where id = m.pagamento_id and nf_status is distinct from 'LANCADA';
  end if;

  if new.status = 'LANCADO' then
    perform private.frotas_manut_notificar('frotas_manut_nf', 'NF da manutenção lançada no GRM — ' || v_cod,
      concat_ws(' | ', new.arquivo_nome, 'GRM ' || new.grm_codigo), 'normal', 'check-circle', m.id,
      'frotas_manut_nf:' || new.id::text || ':LANCADO', 'frotas_manutencao', null, null);
  elsif new.status in ('ERRO', 'AGUARDANDO_DADOS', 'AGUARDANDO_CLASSIFICACAO', 'DUPLICADO') then
    perform private.frotas_manut_notificar('frotas_manut_nf', 'NF da manutenção precisa de atenção — ' || v_cod,
      concat_ws(' | ', new.arquivo_nome, new.status, left(coalesce(new.erro, ''), 180),
                'Complete em Financeiro > Notas fiscais'),
      'urgente', 'clipboard-alert', m.id,
      'frotas_manut_nf:' || new.id::text || ':' || new.status || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
      'frotas_manutencao', null, null);
  end if;
  return new;
exception when others then
  raise warning 'sincronizar_nf_frotas: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_nf_frotas on public.grm_nf_lancamentos;
create trigger trg_sincronizar_nf_frotas
  after update of status on public.grm_nf_lancamentos
  for each row
  when (new.setor = 'FROTAS' and old.status is distinct from new.status)
  execute function public.sincronizar_nf_frotas();
