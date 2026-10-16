-- Frotas · Manutenção: comprovante de pagamento na nota fiscal e custo/responsável ao registrar uma preventiva.
--   * a nota pode levar o comprovante de pagamento (e a data) ANTES do envio: o serviço já foi pago, então o
--     pagamento entra no Financeiro já como PAGO, com o comprovante, e a NF segue para o lançamento no GRM;
--   * frotas_manutencao_registrar_preventiva passa a aceitar custo e quem paga, para que a preventiva também
--     possa receber nota fiscal e pagamento (as notas são anexadas em seguida pela tela, como na corretiva).

drop function if exists public.frotas_manutencao_registrar_preventiva(uuid, date, numeric, jsonb, text, text);

-- 1. regras das notas
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
    new.nf_lancamento_id := null; new.pagamento_id := null; new.enviada_em := null;
    -- comprovante de pagamento anexado antes do envio = nota já paga; a data só vale com o comprovante
    new.comprovante_url := nullif(btrim(coalesce(new.comprovante_url, '')), '');
    if new.comprovante_url is null then new.pago_em := null; end if;
    new.criado_por := auth.uid();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.manutencao_id := old.manutencao_id;
    new.nf_lancamento_id := old.nf_lancamento_id; new.pagamento_id := old.pagamento_id;
    new.enviada_em := old.enviada_em;
    if old.enviada_em is not null then
      new.pago_em := old.pago_em; new.comprovante_url := old.comprovante_url;
    else
      new.comprovante_url := nullif(btrim(coalesce(new.comprovante_url, '')), '');
      if new.comprovante_url is null then new.pago_em := null; end if;
    end if;
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

-- 2. envio
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
       nf_status, nf_numero, nf_url, comprovante_url, pago_em, data_pagamento, solicitado_por, solicitado_por_nome, atualizado_por,
       origem, setor, coordenacao, gestor, observacoes)
    values
      ('FROTAS', 'frotas_manutencao_notas', n.id, v_cod, coalesce(n.data_emissao, m.data_execucao),
       format('Manutenção %s · %s · %s%s', v.placa, coalesce(m.os_numero, v_cod),
              case n.tipo when 'peca' then 'Peças' when 'servico' then 'Serviço' else 'Peças e serviço' end,
              coalesce(' · ' || v_forn, '') || coalesce(' · NF ' || nullif(btrim(coalesce(n.numero, '')), ''), '')),
       v_forn, o.cnpj, nullif(btrim(coalesce(o.pix_chave, '')), ''),
       case when nullif(btrim(coalesce(o.pix_chave, '')), '') is not null then 'PIX' else 'OUTRO' end,
       n.valor, case when n.comprovante_url is not null then 'PAGO' else 'PENDENTE' end, 'NORMAL',
       'NF_RECEBIDA', nullif(btrim(coalesce(n.numero, '')), ''), n.anexo_url, n.comprovante_url,
       case when n.comprovante_url is not null then coalesce(n.pago_em, now()) end,
       case when n.comprovante_url is not null then (coalesce(n.pago_em, now()) at time zone 'America/Sao_Paulo')::date end,
       auth.uid(), v_ator, auth.uid(),
       'FROTAS', 'FROTAS', v.coordenacao, m.solicitante_nome, left(coalesce(m.descricao, ''), 400))
    returning id into v_pg;

    update public.frotas_manutencao_notas
       set nf_lancamento_id = v_nf, pagamento_id = v_pg, enviada_em = now(),
           pago_em = case when comprovante_url is not null then coalesce(pago_em, now()) end
     where id = n.id;
    v_enviadas := v_enviadas + 1;
    v_saida := v_saida || jsonb_build_object('nota_id', n.id, 'nf_lancamento_id', v_nf, 'pagamento_id', v_pg);
  end loop;

  update public.frotas_manutencoes set nf_enviada_em = coalesce(nf_enviada_em, now()) where id = m.id and v_enviadas > 0;
  -- todas as notas já pagas (comprovante anexado antes do envio) = manutenção paga
  update public.frotas_manutencoes
     set pago_em = (select max(x.pago_em) from public.frotas_manutencao_notas x where x.manutencao_id = m.id),
         comprovante_url = coalesce((select x.comprovante_url from public.frotas_manutencao_notas x
                                      where x.manutencao_id = m.id and x.comprovante_url is not null order by x.pago_em desc limit 1), comprovante_url)
   where id = m.id and v_enviadas > 0
     and not exists (select 1 from public.frotas_manutencao_notas x where x.manutencao_id = m.id and x.pago_em is null);
  perform set_config('app.frotas_manut_financeiro', '0', true);
  return jsonb_build_object('enviadas', v_enviadas, 'ja_enviadas', v_ja, 'notas', v_saida);
exception when others then
  perform set_config('app.frotas_manut_financeiro', '0', true);
  raise;
end;
$$;

grant execute on function public.frotas_manutencao_enviar_nf_financeiro(uuid) to authenticated;

-- 3. preventiva
create or replace function public.frotas_manutencao_registrar_preventiva(
  p_veiculo uuid, p_data date, p_km numeric, p_itens jsonb,
  p_oficina text default null, p_observacoes text default null,
  p_custo numeric default 0, p_responsavel text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := public.frotas_manutencao_ator_nome();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
  it jsonb;
  v_plano record;
  v_pk numeric;
  v_pd date;
  v_planos text[] := '{}';
begin
  if not public.painel_has_module(array['frotas_manutencao'], false) then
    raise exception 'Sem permissão para registrar manutenção preventiva.' using errcode = 'insufficient_privilege';
  end if;
  if p_veiculo is null or not exists (select 1 from public.frotas_veiculos where id = p_veiculo) then
    raise exception 'Escolha o veículo.' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > v_hoje or p_data < date '2000-01-01' then
    raise exception 'Informe a data em que o serviço foi feito (não pode ser futura).' using errcode = 'check_violation';
  end if;
  if p_km is not null and p_km <= 0 then
    raise exception 'O km do veículo deve ser maior que zero.' using errcode = 'check_violation';
  end if;
  if coalesce(p_custo, 0) < 0 then
    raise exception 'O custo não pode ser negativo.' using errcode = 'check_violation';
  end if;
  if p_responsavel is not null and p_responsavel not in ('empresa', 'locadora', 'colaborador', 'proprietario') then
    raise exception 'Responsável pelo pagamento inválido.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Marque ao menos um serviço que foi feito.' using errcode = 'check_violation';
  end if;

  -- valida tudo antes de gravar
  for it in select * from jsonb_array_elements(p_itens) loop
    select id, codigo, nome, categoria_codigo into v_plano
      from public.frotas_manutencao_planos
     where id = nullif(it ->> 'plano_id', '')::uuid and ativo;
    if v_plano.id is null then
      raise exception 'Serviço do guia não encontrado ou desativado.' using errcode = 'check_violation';
    end if;
    if v_plano.codigo = any (v_planos) then
      raise exception 'O serviço "%" foi marcado duas vezes.', v_plano.nome using errcode = 'check_violation';
    end if;
    v_planos := v_planos || v_plano.codigo;
    v_pk := nullif(it ->> 'proximo_km', '')::numeric;
    v_pd := nullif(it ->> 'proxima_data', '')::date;
    if v_pk is not null and v_pk <= 0 then
      raise exception 'Próximo km de "%" deve ser maior que zero.', v_plano.nome using errcode = 'check_violation';
    end if;
    if v_pk is not null and p_km is not null and v_pk <= p_km then
      raise exception 'Próximo km de "%" deve ser maior que o km do serviço.', v_plano.nome using errcode = 'check_violation';
    end if;
    if v_pd is not null and v_pd <= p_data then
      raise exception 'Próxima data de "%" deve ser depois da data do serviço.', v_plano.nome using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.frotas_manutencoes m
        join public.frotas_manutencao_itens ii on ii.manutencao_id = m.id
        join public.frotas_manutencao_planos pl on pl.id = ii.plano_id
       where m.veiculo_id = p_veiculo and m.status = 'concluida' and m.data_execucao = p_data and pl.codigo = v_plano.codigo) then
      raise exception '"%" já está registrado neste veículo em %.', v_plano.nome, to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
    end if;
  end loop;

  perform set_config('app.frotas_manut_importando', '1', true);

  insert into public.frotas_manutencoes (
    veiculo_id, status, natureza, origem, descricao, data_execucao, km_execucao, custo, oficina, observacoes, responsavel_pagamento,
    solicitado_em, concluida_em, concluida_por_nome, solicitante_nome)
  values (
    p_veiculo, 'concluida', 'preventiva', 'manual',
    'Preventiva registrada: ' || (
      select string_agg(pl.nome, ', ' order by pl.categoria_codigo, pl.nome)
        from jsonb_array_elements(p_itens) x join public.frotas_manutencao_planos pl on pl.id = (x ->> 'plano_id')::uuid),
    p_data, p_km, coalesce(p_custo, 0), nullif(btrim(coalesce(p_oficina, '')), ''),
    coalesce(nullif(btrim(coalesce(p_observacoes, '')), ''), 'Registrada pela aba Preventiva.'), p_responsavel,
    ((p_data::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo'),
    ((p_data::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo'), v_nome, v_nome)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_itens) loop
    select id, nome, categoria_codigo into v_plano from public.frotas_manutencao_planos where id = (it ->> 'plano_id')::uuid;
    insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, descricao, plano_id, proximo_km, proxima_data)
    values (v_id, v_plano.categoria_codigo, 'preventiva', v_plano.nome, v_plano.id,
            nullif(it ->> 'proximo_km', '')::numeric, nullif(it ->> 'proxima_data', '')::date);
  end loop;

  perform set_config('app.frotas_manut_importando', '0', true);

  -- o km vira leitura do hodômetro só quando o serviço é de hoje (km de data passada não é o km atual)
  if p_km is not null and p_data = v_hoje then
    perform private.frotas_km_registrar(p_veiculo, p_km, 'manutencao', now());
  end if;
  return v_id;
exception when others then
  perform set_config('app.frotas_manut_importando', '0', true);
  raise;
end;
$$;

revoke all on function public.frotas_manutencao_registrar_preventiva(uuid, date, numeric, jsonb, text, text, numeric, text) from public;
grant execute on function public.frotas_manutencao_registrar_preventiva(uuid, date, numeric, jsonb, text, text, numeric, text) to authenticated;
