-- Frotas · Manutenção › Preventiva: status do que falta (NF/NFS-e, comprovante, envio, quem paga) para não deixar a
-- solicitação aberta esperando documento.
--   * a preventiva registrada pode ficar sem nota ou com nota sem o arquivo da NF (só o comprovante): a nota sem NF é
--     pulada no envio e vira pendência;
--   * comprovante que chega depois do envio: RPC frotas_manutencao_nota_comprovante baixa o pagamento no Financeiro;
--   * view frotas_preventiva_pendencias_v lista as preventivas registradas e o que falta em cada uma;
--   * "dispensar pendências" (pendencia_dispensada_em) para o que nunca terá documento.

alter table public.frotas_manutencoes
  add column if not exists pendencia_dispensada_em timestamptz;

comment on column public.frotas_manutencoes.pendencia_dispensada_em is
  'Quando alguém dispensou as pendências de documento (NF/comprovante) da preventiva registrada: não aparece mais como pendente.';

-- ============================================================
-- 1. Envio ao GRM/Financeiro pula a nota sem arquivo da NF
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
  v_sem int := 0;
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

  select placa, coordenacao into v from public.frotas_veiculos where id = m.veiculo_id;
  v_cod := 'MAN-' || lpad(m.numero::text, 6, '0');
  perform set_config('app.frotas_manut_financeiro', '1', true);

  for n in select * from public.frotas_manutencao_notas where manutencao_id = m.id order by created_at, id loop
    if n.enviada_em is not null then
      v_ja := v_ja + 1;
      continue;
    end if;
    -- nota sem o arquivo da NF (ex.: só o comprovante chegou) fica pendente e não vai ao GRM ainda
    if nullif(btrim(coalesce(n.anexo_url, '')), '') is null then
      v_sem := v_sem + 1;
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
  return jsonb_build_object('enviadas', v_enviadas, 'ja_enviadas', v_ja, 'sem_nf', v_sem, 'notas', v_saida);
exception when others then
  perform set_config('app.frotas_manut_financeiro', '0', true);
  raise;
end;
$$;

grant execute on function public.frotas_manutencao_enviar_nf_financeiro(uuid) to authenticated;

-- ============================================================
-- 2. Comprovante de pagamento que chega depois
-- ============================================================
-- Nota ainda não enviada: só guarda o comprovante (o pagamento nasce pago ao enviar). Nota já enviada: baixa o pagamento
-- no Financeiro (PAGO + comprovante); o gatilho de retorno atualiza a nota e a manutenção.
create or replace function public.frotas_manutencao_nota_comprovante(p_nota uuid, p_url text, p_pago_em timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n record;
  p record;
  v_quando timestamptz := coalesce(p_pago_em, now());
begin
  if auth.uid() is null or not public.painel_has_module(array['frotas_manutencao'], false) then
    raise exception 'Sem permissão para anexar comprovante.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(coalesce(p_url, '')), '') is null then
    raise exception 'Informe o arquivo do comprovante.' using errcode = 'check_violation';
  end if;
  if v_quando > now() + interval '1 day' then
    raise exception 'A data do pagamento não pode ser futura.' using errcode = 'check_violation';
  end if;
  select * into n from public.frotas_manutencao_notas where id = p_nota for update;
  if not found then raise exception 'Nota não encontrada.' using errcode = 'no_data_found'; end if;

  if n.pagamento_id is null then
    update public.frotas_manutencao_notas set comprovante_url = p_url, pago_em = v_quando where id = n.id;
    return jsonb_build_object('nota_id', n.id, 'enviada', false);
  end if;

  select * into p from public.financeiro_pagamentos where id = n.pagamento_id for update;
  if not found then raise exception 'Pagamento da nota não encontrado no Financeiro.' using errcode = 'no_data_found'; end if;
  if p.status in ('RECUSADO', 'CANCELADO') then
    raise exception 'O pagamento desta nota está % no Financeiro.', lower(p.status) using errcode = 'check_violation';
  end if;
  update public.financeiro_pagamentos
     set comprovante_url = p_url, status = 'PAGO', pago_em = coalesce(pago_em, v_quando),
         data_pagamento = coalesce(data_pagamento, (v_quando at time zone 'America/Sao_Paulo')::date), atualizado_por = auth.uid()
   where id = p.id;
  return jsonb_build_object('nota_id', n.id, 'enviada', true, 'pagamento_id', p.id);
end;
$$;

revoke all on function public.frotas_manutencao_nota_comprovante(uuid, text, timestamptz) from public;
grant execute on function public.frotas_manutencao_nota_comprovante(uuid, text, timestamptz) to authenticated;

-- ============================================================
-- 3. O que falta em cada preventiva registrada
-- ============================================================
-- Só as registradas pela aba Preventiva ("Preventiva registrada: ..."); o histórico importado é sem custo e sem NF por desenho.
-- Quem paga diferente de empresa (locadora, colaborador, proprietário) não tem pendência de documento.
create or replace view public.frotas_preventiva_pendencias_v
with (security_invoker = true) as
with n as (
  select manutencao_id,
         count(*) as notas,
         count(*) filter (where nullif(btrim(coalesce(anexo_url, '')), '') is null) as sem_nf,
         count(*) filter (where nullif(btrim(coalesce(anexo_url, '')), '') is not null and enviada_em is null) as a_enviar,
         count(*) filter (where comprovante_url is null and pago_em is null) as sem_comprovante
    from public.frotas_manutencao_notas
   group by manutencao_id
),
base as (
  select m.id as manutencao_id, m.numero, m.veiculo_id, v.placa, m.data_execucao, m.km_execucao, m.descricao, m.custo,
         m.responsavel_pagamento, m.pago_em, m.pendencia_dispensada_em,
         coalesce(n.notas, 0) as notas, coalesce(n.sem_nf, 0) as notas_sem_nf,
         coalesce(n.a_enviar, 0) as notas_a_enviar, coalesce(n.sem_comprovante, 0) as notas_sem_comprovante,
         (m.pendencia_dispensada_em is null and coalesce(m.responsavel_pagamento, 'empresa') = 'empresa') as exige
    from public.frotas_manutencoes m
    join public.frotas_veiculos v on v.id = m.veiculo_id
    left join n on n.manutencao_id = m.id
   where m.status = 'concluida' and m.natureza = 'preventiva' and m.descricao like 'Preventiva registrada:%'
)
select b.*,
       (b.pendencia_dispensada_em is null and b.responsavel_pagamento is null) as falta_responsavel,
       (b.exige and (b.notas = 0 or b.notas_sem_nf > 0)) as falta_nf,
       (b.exige and b.notas_a_enviar > 0) as falta_enviar,
       (b.exige and (b.notas = 0 or b.notas_sem_comprovante > 0)) as falta_comprovante,
       ((b.pendencia_dispensada_em is null and b.responsavel_pagamento is null)
        or (b.exige and (b.notas = 0 or b.notas_sem_nf > 0 or b.notas_a_enviar > 0 or b.notas_sem_comprovante > 0))) as pendente
  from base b;

grant select on public.frotas_preventiva_pendencias_v to authenticated;
