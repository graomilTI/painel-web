-- Frotas · Manutenção: VÁRIAS notas fiscais por manutenção (peças, serviço, mais de uma NF de cada).
-- Antes havia um só anexo/nº de NF e um só pagamento por manutenção. Agora cada NF é uma linha de
-- frotas_manutencao_notas e vira o seu próprio lançamento no GRM (categoria pelo tipo da nota) e o seu próprio
-- pagamento no Financeiro (favorecido = quem emitiu a NF). Colunas antigas (anexo_url, nf_numero, nf_lancamento_id,
-- pagamento_id) continuam na tabela, sem uso (nenhuma manutenção tinha NF enviada).

create table if not exists public.frotas_manutencao_notas (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.frotas_manutencoes(id) on delete cascade,
  tipo text not null default 'servico' check (tipo in ('peca', 'servico', 'misto')),
  oficina_id uuid references public.frotas_oficinas(id) on delete set null,
  fornecedor text,
  numero text,
  valor numeric not null check (valor > 0),
  data_emissao date,
  anexo_url text,
  observacoes text,
  nf_lancamento_id uuid references public.grm_nf_lancamentos(id) on delete set null,
  pagamento_id uuid references public.financeiro_pagamentos(id) on delete set null,
  enviada_em timestamptz,
  pago_em timestamptz,
  comprovante_url text,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_frotas_manut_notas_manut on public.frotas_manutencao_notas (manutencao_id);
create index if not exists idx_frotas_manut_notas_lanc on public.frotas_manutencao_notas (nf_lancamento_id) where nf_lancamento_id is not null;
create index if not exists idx_frotas_manut_notas_pag on public.frotas_manutencao_notas (pagamento_id) where pagamento_id is not null;

drop trigger if exists trg_frotas_manut_notas_updated on public.frotas_manutencao_notas;
create trigger trg_frotas_manut_notas_updated
  before update on public.frotas_manutencao_notas
  for each row execute function public.set_updated_at();

alter table public.frotas_manutencao_notas enable row level security;

drop policy if exists frotas_manut_notas_select on public.frotas_manutencao_notas;
create policy frotas_manut_notas_select on public.frotas_manutencao_notas
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao', 'frotas', 'dashboard_socio'], false));

drop policy if exists frotas_manut_notas_write on public.frotas_manutencao_notas;
create policy frotas_manut_notas_write on public.frotas_manutencao_notas
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], false))
  with check (public.painel_has_module(array['frotas_manutencao'], false));

-- ============================================================
-- 1. Regras das notas (quem mexe em quê)
-- ============================================================
create or replace function public.frotas_manutencao_notas_regras()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_liberado boolean := coalesce(current_setting('app.frotas_manut_financeiro', true), '') = '1';
  v_status text;
begin
  if auth.uid() is null or v_liberado then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    select status into v_status from public.frotas_manutencoes where id = new.manutencao_id;
    if v_status not in ('em_execucao', 'concluida') then
      raise exception 'Notas fiscais só entram com a manutenção em execução ou concluída.' using errcode = 'check_violation';
    end if;
    new.nf_lancamento_id := null; new.pagamento_id := null; new.enviada_em := null; new.pago_em := null; new.comprovante_url := null;
    new.criado_por := auth.uid();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.manutencao_id := old.manutencao_id;
    new.nf_lancamento_id := old.nf_lancamento_id; new.pagamento_id := old.pagamento_id;
    new.enviada_em := old.enviada_em; new.pago_em := old.pago_em; new.comprovante_url := old.comprovante_url;
    if old.enviada_em is not null
       and (new.valor, new.tipo, new.oficina_id, new.fornecedor, new.numero, new.anexo_url)
           is distinct from (old.valor, old.tipo, old.oficina_id, old.fornecedor, old.numero, old.anexo_url) then
      raise exception 'Esta nota já foi enviada ao GRM e ao Financeiro e não pode mais ser alterada.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.enviada_em is not null then
    raise exception 'Esta nota já foi enviada ao GRM e ao Financeiro e não pode ser removida.' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_frotas_manut_notas_regras on public.frotas_manutencao_notas;
create trigger trg_frotas_manut_notas_regras
  before insert or update or delete on public.frotas_manutencao_notas
  for each row execute function public.frotas_manutencao_notas_regras();

-- O custo final trava quando QUALQUER nota da manutenção já virou pagamento.
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
  if new.custo is distinct from old.custo
     and exists (select 1 from public.frotas_manutencao_notas n where n.manutencao_id = old.id and n.pagamento_id is not null) then
    raise exception 'O custo já foi enviado ao Financeiro e não pode mais ser alterado aqui.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. Categoria do GRM por tipo da nota
-- ============================================================
-- peça (todos os itens são pneus) -> PNEUS AQUISICAO; peça -> MANUT. VEICULOS PECAS; serviço ou nota mista -> MANUT. VEICULOS SERVICOS.
create or replace function private.frotas_manut_categoria_grm_nota(p_manutencao uuid, p_tipo text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_tipo = 'peca' and coalesce((select count(*) > 0 and count(*) filter (where categoria_codigo = 13) = count(*)
                                          from public.frotas_manutencao_itens where manutencao_id = p_manutencao), false) then 'PNEUS AQUISICAO'
    when p_tipo = 'peca' then 'MANUT. VEICULOS PECAS'
    else 'MANUT. VEICULOS SERVICOS'
  end;
$$;

-- ============================================================
-- 3. Enviar as notas pendentes: uma NF no GRM e um pagamento por nota
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
  n record;
  o record;
  v_cod text;
  v_path text;
  v_nome text;
  v_mime text;
  v_ext text;
  v_ajustes jsonb;
  v_nf uuid;
  v_pg uuid;
  v_forn text;
  v_soma numeric;
  v_enviadas int := 0;
  v_ja int := 0;
  v_saida jsonb := '[]'::jsonb;
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
  if not exists (select 1 from public.frotas_manutencao_notas where manutencao_id = m.id) then
    raise exception 'Cadastre ao menos uma nota fiscal da manutenção antes de enviar.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(valor), 0) into v_soma from public.frotas_manutencao_notas where manutencao_id = m.id;
  if v_soma > m.custo + 0.01 then
    raise exception 'A soma das notas (R$ %) é maior que o custo final (R$ %). Corrija antes de enviar.', v_soma, m.custo using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.frotas_manutencao_notas where manutencao_id = m.id and enviada_em is null and nullif(btrim(coalesce(anexo_url, '')), '') is null) then
    raise exception 'Toda nota precisa do arquivo da NF anexado antes de ser enviada.' using errcode = 'check_violation';
  end if;

  select placa, coordenacao into v from public.frotas_veiculos where id = m.veiculo_id;
  v_cod := 'MAN-' || lpad(m.numero::text, 6, '0');
  perform set_config('app.frotas_manut_financeiro', '1', true);

  for n in select * from public.frotas_manutencao_notas where manutencao_id = m.id order by created_at, id loop
    if n.enviada_em is not null then
      v_ja := v_ja + 1;
      continue;
    end if;

    v_path := substring(split_part(n.anexo_url, '?', 1) from '/notas-fiscais/(.+)$');
    if v_path is null then
      raise exception 'Não consegui localizar o arquivo da NF % no armazenamento. Anexe a nota de novo.', coalesce(n.numero, '') using errcode = 'check_violation';
    end if;
    v_nome := regexp_replace(regexp_replace(v_path, '^.*/', ''), '^\d+-', '');
    v_ext := lower(coalesce(substring(v_nome from '\.([A-Za-z0-9]+)$'), ''));
    v_mime := case v_ext when 'pdf' then 'application/pdf' when 'xml' then 'application/xml'
                         when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' else null end;
    v_ajustes := jsonb_build_object('grupo_categoria', 'DESPESAS COM VEICULOS', 'categoria', private.frotas_manut_categoria_grm_nota(m.id, n.tipo));
    if nullif(btrim(coalesce(n.numero, '')), '') is not null then
      v_ajustes := v_ajustes || jsonb_build_object('numero_documento', left(btrim(n.numero), 200));
    end if;

    v_nf := null;
    insert into public.grm_nf_lancamentos
      (storage_bucket, storage_path, arquivo_nome, arquivo_mime_type, setor, enviado_por, status, ajustes_manuais, extraido_json)
    values
      ('notas-fiscais', v_path, v_nome, v_mime, 'FROTAS', auth.uid(), 'NOVO', v_ajustes,
       jsonb_build_object('origem', 'FROTAS', 'manutencao_id', m.id, 'manutencao', v_cod, 'placa', v.placa, 'os', m.os_numero, 'nota_id', n.id, 'tipo_nota', n.tipo))
    on conflict (storage_path) do nothing
    returning id into v_nf;
    if v_nf is null then
      select id into v_nf from public.grm_nf_lancamentos where storage_path = v_path;
    end if;

    select * into o from public.frotas_oficinas where id = n.oficina_id;
    v_forn := coalesce(o.razao_social, o.nome, nullif(btrim(coalesce(n.fornecedor, '')), ''), nullif(m.oficina, ''), 'Fornecedor');

    insert into public.financeiro_pagamentos
      (origem_setor, origem_tabela, origem_id, origem_codigo, competencia, descricao,
       favorecido_nome, favorecido_documento, chave_pix, forma_pagamento, valor, status, prioridade,
       nf_status, nf_numero, nf_url, solicitado_por, solicitado_por_nome, atualizado_por,
       origem, setor, coordenacao, gestor, observacoes)
    values
      ('FROTAS', 'frotas_manutencao_notas', n.id, v_cod, coalesce(n.data_emissao, m.data_execucao),
       format('Manutenção %s · %s · %s%s', v.placa, coalesce(m.os_numero, v_cod),
              case n.tipo when 'peca' then 'Peças' when 'servico' then 'Serviço' else 'Peças e serviço' end,
              coalesce(' · ' || v_forn, '') || coalesce(' · NF ' || nullif(btrim(coalesce(n.numero, '')), ''), '')),
       v_forn, o.cnpj, nullif(btrim(coalesce(o.pix_chave, '')), ''),
       case when nullif(btrim(coalesce(o.pix_chave, '')), '') is not null then 'PIX' else 'OUTRO' end,
       n.valor, 'PENDENTE', 'NORMAL',
       'NF_RECEBIDA', nullif(btrim(coalesce(n.numero, '')), ''), n.anexo_url, auth.uid(), v_ator, auth.uid(),
       'FROTAS', 'FROTAS', v.coordenacao, m.solicitante_nome, left(coalesce(m.descricao, ''), 400))
    returning id into v_pg;

    update public.frotas_manutencao_notas set nf_lancamento_id = v_nf, pagamento_id = v_pg, enviada_em = now() where id = n.id;
    v_enviadas := v_enviadas + 1;
    v_saida := v_saida || jsonb_build_object('nota_id', n.id, 'nf_lancamento_id', v_nf, 'pagamento_id', v_pg);
  end loop;

  update public.frotas_manutencoes set nf_enviada_em = coalesce(nf_enviada_em, now()) where id = m.id and v_enviadas > 0;
  perform set_config('app.frotas_manut_financeiro', '0', true);
  return jsonb_build_object('enviadas', v_enviadas, 'ja_enviadas', v_ja, 'notas', v_saida);
exception when others then
  perform set_config('app.frotas_manut_financeiro', '0', true);
  raise;
end;
$$;

grant execute on function public.frotas_manutencao_enviar_nf_financeiro(uuid) to authenticated;

-- Situação de cada nota (GRM e Financeiro).
create or replace function public.frotas_manutencao_nf_status(p_manutencao uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.painel_has_module(array['frotas_manutencao', 'frotas', 'dashboard_socio'], false) then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object('notas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'nota_id', n.id, 'enviada', n.enviada_em is not null,
      'nf', (select jsonb_build_object('status', l.status, 'erro', l.erro, 'grm_codigo', l.grm_codigo, 'categoria', l.categoria)
               from public.grm_nf_lancamentos l where l.id = n.nf_lancamento_id),
      'pagamento', (select jsonb_build_object('status', p.status, 'nf_status', p.nf_status, 'pago_em', p.pago_em,
                                              'comprovante_url', p.comprovante_url, 'valor', p.valor, 'forma', p.forma_pagamento)
                      from public.financeiro_pagamentos p where p.id = n.pagamento_id)) order by n.created_at, n.id)
      from public.frotas_manutencao_notas n where n.manutencao_id = p_manutencao), '[]'::jsonb));
end;
$$;

grant execute on function public.frotas_manutencao_nf_status(uuid) to authenticated;

-- ============================================================
-- 4. Retorno por nota: pagamento feito, NF lançada ou com erro
-- ============================================================
create or replace function public.sincronizar_pagamento_frotas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nt record;
  v_cod text;
begin
  select n.id, n.manutencao_id, n.numero as nf_numero, m.numero as man_numero into nt
    from public.frotas_manutencao_notas n join public.frotas_manutencoes m on m.id = n.manutencao_id
   where n.pagamento_id = new.id;
  if not found then return new; end if;
  v_cod := 'MAN-' || lpad(nt.man_numero::text, 6, '0');

  perform set_config('app.frotas_manut_financeiro', '1', true);
  update public.frotas_manutencao_notas
     set comprovante_url = coalesce(nullif(new.comprovante_url, ''), comprovante_url),
         pago_em = case when new.status = 'PAGO' then coalesce(new.pago_em, now()) else pago_em end
   where id = nt.id;
  update public.frotas_manutencoes
     set comprovante_url = coalesce(nullif(new.comprovante_url, ''), comprovante_url),
         pago_em = case when not exists (select 1 from public.frotas_manutencao_notas x where x.manutencao_id = nt.manutencao_id and x.pago_em is null)
                        then (select max(x.pago_em) from public.frotas_manutencao_notas x where x.manutencao_id = nt.manutencao_id) else pago_em end
   where id = nt.manutencao_id;
  perform set_config('app.frotas_manut_financeiro', '0', true);

  if new.status is distinct from old.status and new.status in ('PAGO', 'RECUSADO', 'CANCELADO') then
    perform private.frotas_manut_notificar('frotas_manut_pago',
      case new.status when 'PAGO' then 'Pagamento da NF ' || coalesce(nt.nf_numero, '') || ' realizado — ' || v_cod
                      else 'Pagamento da NF ' || coalesce(nt.nf_numero, '') || ' ' || lower(new.status) || ' — ' || v_cod end,
      concat_ws(' | ', new.descricao, private.frotas_brl(new.valor)),
      case when new.status = 'PAGO' then 'normal' else 'atencao' end, 'check-circle',
      nt.manutencao_id, 'frotas_manut_pago:' || new.id::text || ':' || new.status || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
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
  when (new.origem_tabela = 'frotas_manutencao_notas'
        and (old.status is distinct from new.status or old.comprovante_url is distinct from new.comprovante_url))
  execute function public.sincronizar_pagamento_frotas();

create or replace function public.sincronizar_nf_frotas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nt record;
  v_cod text;
begin
  select n.id, n.manutencao_id, n.numero as nf_numero, n.pagamento_id, m.numero as man_numero into nt
    from public.frotas_manutencao_notas n join public.frotas_manutencoes m on m.id = n.manutencao_id
   where n.nf_lancamento_id = new.id;
  if not found then return new; end if;
  v_cod := 'MAN-' || lpad(nt.man_numero::text, 6, '0');

  if new.status = 'LANCADO' and nt.pagamento_id is not null then
    update public.financeiro_pagamentos set nf_status = 'LANCADA'
     where id = nt.pagamento_id and nf_status is distinct from 'LANCADA';
  end if;

  if new.status = 'LANCADO' then
    perform private.frotas_manut_notificar('frotas_manut_nf', 'NF ' || coalesce(nt.nf_numero, '') || ' da manutenção lançada no GRM — ' || v_cod,
      concat_ws(' | ', new.arquivo_nome, 'GRM ' || new.grm_codigo), 'normal', 'check-circle', nt.manutencao_id,
      'frotas_manut_nf:' || new.id::text || ':LANCADO', 'frotas_manutencao', null, null);
  elsif new.status in ('ERRO', 'AGUARDANDO_DADOS', 'AGUARDANDO_CLASSIFICACAO', 'DUPLICADO') then
    perform private.frotas_manut_notificar('frotas_manut_nf', 'NF ' || coalesce(nt.nf_numero, '') || ' da manutenção precisa de atenção — ' || v_cod,
      concat_ws(' | ', new.arquivo_nome, new.status, left(coalesce(new.erro, ''), 180), 'Complete em Financeiro > Notas fiscais'),
      'urgente', 'clipboard-alert', nt.manutencao_id,
      'frotas_manut_nf:' || new.id::text || ':' || new.status || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
      'frotas_manutencao', null, null);
  end if;
  return new;
exception when others then
  raise warning 'sincronizar_nf_frotas: %', sqlerrm;
  return new;
end;
$$;
