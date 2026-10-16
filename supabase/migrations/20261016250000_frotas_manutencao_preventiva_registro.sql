-- Frotas · Manutenção › Preventiva: registrar o que foi feito em um veículo e os próximos prazos.
--   * o item da manutenção concluída guarda o próximo km e a próxima data combinados (proximo_km, proxima_data);
--     quando existem, a view de vencimentos usa esses prazos no lugar do intervalo do plano;
--   * RPC frotas_manutencao_registrar_preventiva cria a manutenção preventiva já concluída (sem custo e sem NF),
--     com um item por serviço do guia, no mesmo molde da importação de histórico.

-- ============================================================
-- 1. Próximos prazos no item
-- ============================================================
alter table public.frotas_manutencao_itens
  add column if not exists proximo_km numeric check (proximo_km is null or proximo_km > 0),
  add column if not exists proxima_data date;

comment on column public.frotas_manutencao_itens.proximo_km is
  'Km em que o serviço deve ser repetido (informado ao registrar a preventiva). Nulo = intervalo do plano.';
comment on column public.frotas_manutencao_itens.proxima_data is
  'Data em que o serviço deve ser repetido (informada ao registrar a preventiva). Nulo = intervalo do plano.';

-- ============================================================
-- 2. View de vencimentos: prazo combinado da última execução vale mais que o intervalo do plano
-- ============================================================
create or replace view public.frotas_manutencao_vencimentos_v
with (security_invoker = true) as
with hoje as (
  select (now() at time zone 'America/Sao_Paulo')::date as d
),
km as (
  select veiculo_id, max(km) as km
    from public.frotas_veiculos_leituras_km
   where not descartada
   group by veiculo_id
),
alvo as (
  select p.id as plano_id, p.codigo, p.nome as plano_nome, p.categoria_codigo, p.tipo,
         p.intervalo_km, p.intervalo_meses, p.intervalo_dias, p.antecedencia_km, p.antecedencia_dias,
         v.id as veiculo_id, v.placa, v.marca_modelo, v.coordenacao, v.supervisao,
         coalesce(k.km, nullif(v.hodometro, 0)) as hodometro
    from public.frotas_manutencao_planos p
    join public.frotas_veiculos v on (p.veiculo_id is null or p.veiculo_id = v.id)
    left join km k on k.veiculo_id = v.id
   where p.ativo
     and upper(coalesce(v.status, 'ATIVO')) = 'ATIVO'
     and not (p.veiculo_id is null and exists (
           select 1 from public.frotas_manutencao_planos o where o.codigo = p.codigo and o.veiculo_id = v.id))
),
ultima as (
  select m.veiculo_id, pl.codigo,
         max(m.data_execucao) as data_ultima,
         (array_agg(m.km_execucao order by m.data_execucao desc, m.concluida_em desc nulls last, i.created_at desc))[1] as km_ultima,
         (array_agg(i.proximo_km order by m.data_execucao desc, m.concluida_em desc nulls last, i.created_at desc))[1] as proximo_km,
         (array_agg(i.proxima_data order by m.data_execucao desc, m.concluida_em desc nulls last, i.created_at desc))[1] as proxima_data
    from public.frotas_manutencoes m
    join public.frotas_manutencao_itens i on i.manutencao_id = m.id
    join public.frotas_manutencao_planos pl on pl.id = i.plano_id
   where m.status = 'concluida'
   group by m.veiculo_id, pl.codigo
),
aberta as (
  select m.veiculo_id, pl.codigo, count(distinct m.id) as qtd
    from public.frotas_manutencoes m
    join public.frotas_manutencao_itens i on i.manutencao_id = m.id
    join public.frotas_manutencao_planos pl on pl.id = i.plano_id
   where m.status not in ('concluida','cancelada','reprovada')
   group by m.veiculo_id, pl.codigo
),
calc as (
  select a.*, u.data_ultima, u.km_ultima, coalesce(ab.qtd, 0) > 0 as em_andamento,
         case when u.data_ultima is null then null
              else coalesce(u.proximo_km,
                            case when a.intervalo_km is not null and u.km_ultima is not null then u.km_ultima + a.intervalo_km end) end as vencimento_km,
         case when u.data_ultima is null then null
              else coalesce(u.proxima_data,
                            case when a.intervalo_meses is not null or a.intervalo_dias is not null
                                 then (u.data_ultima + make_interval(months => coalesce(a.intervalo_meses, 0), days => coalesce(a.intervalo_dias, 0)))::date end) end as vencimento_data
    from alvo a
    left join ultima u on u.veiculo_id = a.veiculo_id and u.codigo = a.codigo
    left join aberta ab on ab.veiculo_id = a.veiculo_id and ab.codigo = a.codigo
)
select c.veiculo_id, c.placa, c.marca_modelo, c.coordenacao, c.supervisao,
       c.plano_id, c.codigo as plano_codigo, c.plano_nome, c.tipo,
       c.categoria_codigo, cat.nome as categoria_nome,
       c.data_ultima, c.km_ultima, c.hodometro,
       c.vencimento_km, c.vencimento_data,
       case when c.vencimento_km is not null and c.hodometro is not null then c.vencimento_km - c.hodometro end as km_restante,
       case when c.vencimento_data is not null then c.vencimento_data - h.d end as dias_restantes,
       c.em_andamento,
       case
         when c.data_ultima is null then 'sem_historico'
         when (c.vencimento_km is not null and c.hodometro is not null and c.hodometro > c.vencimento_km)
           or (c.vencimento_data is not null and c.vencimento_data < h.d) then 'vencida'
         when (c.vencimento_km is not null and c.hodometro is not null and c.hodometro >= c.vencimento_km - c.antecedencia_km)
           or (c.vencimento_data is not null and c.vencimento_data - c.antecedencia_dias <= h.d) then 'proxima'
         when c.vencimento_data is null and c.vencimento_km is not null and c.hodometro is null then 'sem_hodometro'
         else 'em_dia'
       end as status
  from calc c
  join public.frotas_manutencao_categorias cat on cat.codigo = c.categoria_codigo
  cross join hoje h;

-- ============================================================
-- 3. RPC: registrar uma preventiva já realizada
-- ============================================================
-- p_itens: [{plano_id, proximo_km, proxima_data}] (um por serviço feito). Cria uma manutenção concluída,
-- natureza preventiva, sem custo e sem nota fiscal (para custo e NF use "Nova manutenção").
create or replace function public.frotas_manutencao_registrar_preventiva(
  p_veiculo uuid, p_data date, p_km numeric, p_itens jsonb,
  p_oficina text default null, p_observacoes text default null)
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
    veiculo_id, status, natureza, origem, descricao, data_execucao, km_execucao, custo, oficina, observacoes,
    solicitado_em, concluida_em, concluida_por_nome, solicitante_nome)
  values (
    p_veiculo, 'concluida', 'preventiva', 'manual',
    'Preventiva registrada: ' || (
      select string_agg(pl.nome, ', ' order by pl.categoria_codigo, pl.nome)
        from jsonb_array_elements(p_itens) x join public.frotas_manutencao_planos pl on pl.id = (x ->> 'plano_id')::uuid),
    p_data, p_km, 0, nullif(btrim(coalesce(p_oficina, '')), ''),
    coalesce(nullif(btrim(coalesce(p_observacoes, '')), ''), 'Registrada pela aba Preventiva, sem custo e sem nota fiscal.'),
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

revoke all on function public.frotas_manutencao_registrar_preventiva(uuid, date, numeric, jsonb, text, text) from public;
grant execute on function public.frotas_manutencao_registrar_preventiva(uuid, date, numeric, jsonb, text, text) to authenticated;
