-- Frotas · Manutenção (corretiva): enviar a nota para LANÇAMENTO e enviar ao FINANCEIRO viram duas ações separadas.
--   * frotas_manutencao_enviar_lancamento: quando o usuário diz que todas as NFs estão anexadas, as notas vão para o painel de Notas
--     Fiscais (grm_nf_lancamentos, que o agente lança no GRM);
--   * frotas_manutencao_enviar_financeiro: as notas entram na lista do Financeiro para pagar, com a forma de pagamento no modelo de
--     Compras (PIX com chave, BOLETO com link/arquivo e vencimento, LINK de pagamento);
--   * as travas das notas passam a olhar cada envio: depois do lançamento a NF não muda; depois do Financeiro o valor/emitente não mudam.
-- A função combinada frotas_manutencao_enviar_nf_financeiro continua existindo (a Preventiva usa).

-- 1. travas das notas por envio
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
    -- depois de ir ao Financeiro o comprovante e a data só mudam por lá
    if old.pagamento_id is not null then
      new.pago_em := old.pago_em; new.comprovante_url := old.comprovante_url;
    else
      new.comprovante_url := nullif(btrim(coalesce(new.comprovante_url, '')), '');
      if new.comprovante_url is null then new.pago_em := null; end if;
    end if;
    if old.enviada_em is not null
       and (new.valor, new.tipo, new.oficina_id, new.fornecedor, new.numero, new.anexo_url)
           is distinct from (old.valor, old.tipo, old.oficina_id, old.fornecedor, old.numero, old.anexo_url) then
      raise exception 'Esta nota já foi enviada para lançamento e não pode mais ser alterada.' using errcode = 'check_violation';
    end if;
    if old.pagamento_id is not null
       and (new.valor, new.oficina_id, new.fornecedor) is distinct from (old.valor, old.oficina_id, old.fornecedor) then
      raise exception 'Esta nota já foi enviada ao Financeiro e o valor e o emitente não podem mais ser alterados.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.enviada_em is not null or old.pagamento_id is not null then
    raise exception 'Esta nota já foi enviada (lançamento ou Financeiro) e não pode ser removida.' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

-- 2. enviar para lançamento (painel de Notas Fiscais)
create or replace function public.frotas_manutencao_enviar_lancamento(p_manutencao uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  v record;
  n record;
  v_cod text;
  v_path text;
  v_nome text;
  v_mime text;
  v_ext text;
  v_ajustes jsonb;
  v_nf uuid;
  v_soma numeric;
  v_enviadas int := 0;
  v_ja int := 0;
  v_saida jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.painel_has_module(array['frotas_manutencao'], false) then
    raise exception 'Sem permissão para enviar notas para lançamento.' using errcode = 'insufficient_privilege';
  end if;

  select * into m from public.frotas_manutencoes where id = p_manutencao for update;
  if not found then raise exception 'Manutenção não encontrada.' using errcode = 'no_data_found'; end if;
  if m.status <> 'concluida' then
    raise exception 'Só manutenção concluída vai para lançamento.' using errcode = 'check_violation';
  end if;
  if m.responsavel_pagamento is distinct from 'empresa' then
    raise exception 'Esta manutenção não é paga pela empresa (responsável: %): não vai para lançamento.', coalesce(m.responsavel_pagamento, 'não definido')
      using errcode = 'check_violation';
  end if;
  if coalesce(m.custo, 0) <= 0 then
    raise exception 'Informe o custo final da manutenção antes de enviar para lançamento.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.frotas_manutencao_notas where manutencao_id = m.id) then
    raise exception 'Cadastre ao menos uma nota fiscal da manutenção antes de enviar.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(valor), 0) into v_soma from public.frotas_manutencao_notas where manutencao_id = m.id;
  if v_soma > m.custo + 0.01 then
    raise exception 'A soma das notas (R$ %) é maior que o custo final (R$ %). Corrija antes de enviar.', v_soma, m.custo using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.frotas_manutencao_notas
              where manutencao_id = m.id and enviada_em is null and nullif(btrim(coalesce(anexo_url, '')), '') is null) then
    raise exception 'Há nota sem o arquivo da NF (só com comprovante). Anexe a NF de todas as notas antes de enviar para lançamento.' using errcode = 'check_violation';
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

    update public.frotas_manutencao_notas set nf_lancamento_id = v_nf, enviada_em = now() where id = n.id;
    -- se a nota já estava no Financeiro (esperando a NF), agora a NF chegou
    if n.pagamento_id is not null then
      update public.financeiro_pagamentos
         set nf_status = 'NF_RECEBIDA', nf_numero = coalesce(nf_numero, nullif(btrim(coalesce(n.numero, '')), '')), nf_url = coalesce(nf_url, n.anexo_url)
       where id = n.pagamento_id and nf_status in ('AGUARDANDO_NF', 'NAO_INFORMADA');
    end if;
    v_enviadas := v_enviadas + 1;
    v_saida := v_saida || jsonb_build_object('nota_id', n.id, 'nf_lancamento_id', v_nf);
  end loop;

  update public.frotas_manutencoes set nf_enviada_em = coalesce(nf_enviada_em, now()) where id = m.id and v_enviadas > 0;
  perform set_config('app.frotas_manut_financeiro', '0', true);
  return jsonb_build_object('enviadas', v_enviadas, 'ja_enviadas', v_ja, 'notas', v_saida);
exception when others then
  perform set_config('app.frotas_manut_financeiro', '0', true);
  raise;
end;
$$;

revoke all on function public.frotas_manutencao_enviar_lancamento(uuid) from public;
grant execute on function public.frotas_manutencao_enviar_lancamento(uuid) to authenticated;

-- 3. enviar ao Financeiro (lista de pagamentos), no modelo de Compras: PIX, BOLETO ou LINK
-- p_pagamentos: [{ "nota_id": uuid, "forma": "PIX|BOLETO|LINK", "dados": "chave pix | link ou arquivo do boleto | link de pagamento",
--                  "vencimento": "AAAA-MM-DD" (boleto), "contato": text }]
create or replace function public.frotas_manutencao_enviar_financeiro(p_manutencao uuid, p_pagamentos jsonb)
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
  v_item jsonb;
  v_forma text;
  v_dados text;
  v_venc date;
  v_contato text;
  v_forn text;
  v_pg uuid;
  v_nf_status text;
  v_soma numeric;
  v_enviados int := 0;
  v_ja int := 0;
  v_cod text;
  v_saida jsonb := '[]'::jsonb;
  v_ator text := public.frotas_manutencao_ator_nome();
begin
  if auth.uid() is null or not public.painel_has_module(array['frotas_manutencao'], false) then
    raise exception 'Sem permissão para enviar manutenção ao Financeiro.' using errcode = 'insufficient_privilege';
  end if;

  select * into m from public.frotas_manutencoes where id = p_manutencao for update;
  if not found then raise exception 'Manutenção não encontrada.' using errcode = 'no_data_found'; end if;
  if m.status <> 'concluida' then
    raise exception 'Só manutenção concluída vai para o Financeiro.' using errcode = 'check_violation';
  end if;
  if m.responsavel_pagamento is distinct from 'empresa' then
    raise exception 'Esta manutenção não é paga pela empresa (responsável: %): não vai para o Financeiro.', coalesce(m.responsavel_pagamento, 'não definido')
      using errcode = 'check_violation';
  end if;
  if coalesce(m.custo, 0) <= 0 then
    raise exception 'Informe o custo final da manutenção antes de enviar ao Financeiro.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.frotas_manutencao_notas where manutencao_id = m.id) then
    raise exception 'Cadastre ao menos uma nota da manutenção antes de enviar ao Financeiro.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(valor), 0) into v_soma from public.frotas_manutencao_notas where manutencao_id = m.id;
  if v_soma > m.custo + 0.01 then
    raise exception 'A soma das notas (R$ %) é maior que o custo final (R$ %). Corrija antes de enviar.', v_soma, m.custo using errcode = 'check_violation';
  end if;

  select placa, coordenacao into v from public.frotas_veiculos where id = m.veiculo_id;
  v_cod := 'MAN-' || lpad(m.numero::text, 6, '0');
  perform set_config('app.frotas_manut_financeiro', '1', true);

  for n in select * from public.frotas_manutencao_notas where manutencao_id = m.id order by created_at, id loop
    if n.pagamento_id is not null then
      v_ja := v_ja + 1;
      continue;
    end if;

    select e into v_item from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) e where e ->> 'nota_id' = n.id::text limit 1;
    if v_item is null then
      raise exception 'Informe a forma de pagamento da nota % (%).', coalesce(n.numero, 's/nº'), coalesce(n.fornecedor, '—') using errcode = 'check_violation';
    end if;
    v_forma := upper(coalesce(v_item ->> 'forma', ''));
    if v_forma not in ('PIX', 'BOLETO', 'LINK') then
      raise exception 'Forma de pagamento inválida para a nota % (use PIX, BOLETO ou LINK).', coalesce(n.numero, 's/nº') using errcode = 'check_violation';
    end if;
    v_dados := nullif(btrim(coalesce(v_item ->> 'dados', '')), '');
    v_contato := nullif(btrim(coalesce(v_item ->> 'contato', '')), '');
    v_venc := nullif(btrim(coalesce(v_item ->> 'vencimento', '')), '')::date;
    -- nota já paga (com comprovante) entra como PAGO e não precisa dos dados de pagamento
    if n.comprovante_url is null and v_dados is null then
      raise exception 'Informe %: nota % (%).',
        case v_forma when 'PIX' then 'a chave PIX' when 'BOLETO' then 'o boleto (link ou arquivo)' else 'o link de pagamento' end,
        coalesce(n.numero, 's/nº'), coalesce(n.fornecedor, '—') using errcode = 'check_violation';
    end if;

    select * into o from public.frotas_oficinas where id = n.oficina_id;
    v_forn := coalesce(o.razao_social, o.nome, nullif(btrim(coalesce(n.fornecedor, '')), ''), nullif(m.oficina, ''), 'Fornecedor');
    v_nf_status := case
      when nullif(btrim(coalesce(n.anexo_url, '')), '') is null then 'AGUARDANDO_NF'
      when exists (select 1 from public.grm_nf_lancamentos l where l.id = n.nf_lancamento_id and l.status = 'LANCADO') then 'LANCADA'
      else 'NF_RECEBIDA' end;

    insert into public.financeiro_pagamentos
      (origem_setor, origem_tabela, origem_id, origem_codigo, competencia, descricao,
       favorecido_nome, favorecido_documento, fornecedor, contato,
       chave_pix, forma_pagamento, dados_pagamento, boleto_url, link_pagamento, data_vencimento,
       valor, status, prioridade, nf_status, nf_numero, nf_url, comprovante_url, pago_em, data_pagamento,
       solicitado_por, solicitado_por_nome, atualizado_por, origem, setor, coordenacao, gestor, observacoes)
    values
      ('FROTAS', 'frotas_manutencao_notas', n.id, v_cod, coalesce(n.data_emissao, m.data_execucao),
       format('Manutenção %s · %s · %s%s', v.placa, coalesce(m.os_numero, v_cod),
              case n.tipo when 'peca' then 'Peças' when 'servico' then 'Serviço' else 'Peças e serviço' end,
              coalesce(' · ' || v_forn, '') || coalesce(' · NF ' || nullif(btrim(coalesce(n.numero, '')), ''), '')),
       v_forn, o.cnpj, v_forn, v_contato,
       case v_forma when 'PIX' then v_dados end,
       case v_forma when 'LINK' then 'OUTRO' else v_forma end,
       v_dados,
       case v_forma when 'BOLETO' then v_dados end,
       case v_forma when 'LINK' then v_dados end,
       case v_forma when 'BOLETO' then v_venc end,
       n.valor, case when n.comprovante_url is not null then 'PAGO' else 'PENDENTE' end, 'NORMAL',
       v_nf_status, nullif(btrim(coalesce(n.numero, '')), ''), n.anexo_url, n.comprovante_url,
       case when n.comprovante_url is not null then coalesce(n.pago_em, now()) end,
       case when n.comprovante_url is not null then (coalesce(n.pago_em, now()) at time zone 'America/Sao_Paulo')::date end,
       auth.uid(), v_ator, auth.uid(), 'FROTAS', 'FROTAS', v.coordenacao, m.solicitante_nome, left(coalesce(m.descricao, ''), 400))
    returning id into v_pg;

    update public.frotas_manutencao_notas
       set pagamento_id = v_pg,
           pago_em = case when comprovante_url is not null then coalesce(pago_em, now()) end
     where id = n.id;
    v_enviados := v_enviados + 1;
    v_saida := v_saida || jsonb_build_object('nota_id', n.id, 'pagamento_id', v_pg);
  end loop;

  -- todas as notas já pagas (comprovante anexado antes do envio) = manutenção paga
  update public.frotas_manutencoes
     set pago_em = (select max(x.pago_em) from public.frotas_manutencao_notas x where x.manutencao_id = m.id),
         comprovante_url = coalesce((select x.comprovante_url from public.frotas_manutencao_notas x
                                      where x.manutencao_id = m.id and x.comprovante_url is not null order by x.pago_em desc limit 1), comprovante_url)
   where id = m.id and v_enviados > 0
     and not exists (select 1 from public.frotas_manutencao_notas x where x.manutencao_id = m.id and x.pago_em is null);
  perform set_config('app.frotas_manut_financeiro', '0', true);
  return jsonb_build_object('enviados', v_enviados, 'ja_enviados', v_ja, 'notas', v_saida);
exception when others then
  perform set_config('app.frotas_manut_financeiro', '0', true);
  raise;
end;
$$;

revoke all on function public.frotas_manutencao_enviar_financeiro(uuid, jsonb) from public;
grant execute on function public.frotas_manutencao_enviar_financeiro(uuid, jsonb) to authenticated;
