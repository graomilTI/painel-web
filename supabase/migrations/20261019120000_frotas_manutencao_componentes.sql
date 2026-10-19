-- Frotas · Manutenção: itens (componentes e peças) dentro de cada serviço, conforme o "Guia de Classificação de
-- Manutenção Veicular" (seção "Componentes e Peças").
--   * frotas_manutencao_componentes: catálogo por categoria (sistema) e, quando existir, por serviço do guia
--     (plano_codigo), que serve para pré-marcar na Preventiva;
--   * frotas_manutencao_itens.componentes: nomes marcados naquele item (texto, para sobreviver a renomear/desativar);
--   * as duas RPCs de entrada (solicitar e registrar preventiva) passam a gravar os componentes.
-- Segue o acesso das demais tabelas do guia (ler: quem tem o menu; editar: quem edita o módulo).

-- ============================================================
-- 1. Catálogo
-- ============================================================
create table if not exists public.frotas_manutencao_componentes (
  id uuid primary key default gen_random_uuid(),
  categoria_codigo smallint not null references public.frotas_manutencao_categorias(codigo),
  plano_codigo text,
  nome text not null check (btrim(nome) <> ''),
  ordem smallint not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (categoria_codigo, nome)
);

comment on table public.frotas_manutencao_componentes is
  'Componentes e peças do guia de classificação por categoria (sistema). plano_codigo liga o componente a um serviço do guia (pré-marca na Preventiva).';

create index if not exists idx_frotas_manut_comp_categoria on public.frotas_manutencao_componentes (categoria_codigo, ordem);

drop trigger if exists trg_frotas_manut_comp_updated on public.frotas_manutencao_componentes;
create trigger trg_frotas_manut_comp_updated
  before update on public.frotas_manutencao_componentes
  for each row execute function public.set_updated_at();

alter table public.frotas_manutencao_componentes enable row level security;

-- Todo usuário logado lê: quem só pede manutenção pela supervisão do veículo também precisa ver a lista no formulário
-- (mesmo critério de categorias e planos desde 20261016190000).
drop policy if exists frotas_manut_comp_select on public.frotas_manutencao_componentes;
create policy frotas_manut_comp_select on public.frotas_manutencao_componentes
  for select to authenticated using (true);

drop policy if exists frotas_manut_comp_write on public.frotas_manutencao_componentes;
create policy frotas_manut_comp_write on public.frotas_manutencao_componentes
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], true))
  with check (public.painel_has_module(array['frotas_manutencao'], true));

-- ============================================================
-- 2. Componentes marcados em cada item
-- ============================================================
alter table public.frotas_manutencao_itens
  add column if not exists componentes text[] not null default '{}';

comment on column public.frotas_manutencao_itens.componentes is
  'Componentes/peças do guia marcados neste item (nomes). Vazio = serviço geral, sem detalhar peças.';

-- ============================================================
-- 3. Carga do guia (seção "Componentes e Peças"); repetir a migration não duplica
-- ============================================================
insert into public.frotas_manutencao_componentes (categoria_codigo, plano_codigo, nome, ordem) values
  -- Suspensão (11)
  (11, 'amortecedores', 'Amortecedores dianteiros e traseiros', 1),
  (11, null, 'Molas helicoidais', 2),
  (11, null, 'Bandejas de suspensão (balanços) e pivôs', 3),
  (11, null, 'Buchas da suspensão', 4),
  (11, null, 'Batentes, coifas e coxins', 5),
  (11, null, 'Barra estabilizadora e bieletas', 6),
  -- Freios (9)
  (9, 'pastilhas_freio', 'Pastilhas de freio', 1),
  (9, 'discos_freio', 'Discos de freio', 2),
  (9, null, 'Lonas e tambores de freio (freio traseiro)', 3),
  (9, null, 'Cilindro-mestre e hidrovácuo', 4),
  (9, null, 'Flexíveis e tubulações de freio', 5),
  (9, 'fluido_freio', 'Fluido de freio (DOT 4 / DOT 5.1)', 6),
  -- Motor (1): o que o guia lista em "Motor" e não pertence a outro sistema do painel
  (1, null, 'Juntas do motor (cabeçote, tampa de válvulas, cárter)', 1),
  (1, null, 'Retentores e anéis de vedação', 2),
  -- Correias, tensores e sincronismo (22)
  (22, 'correia_dentada', 'Correia dentada (ou corrente de comando) e tensor', 1),
  (22, 'correias_auxiliares', 'Correias auxiliares (alternador/direção)', 2),
  -- Ignição e partida (5)
  (5, 'velas_ignicao', 'Velas de ignição e cabos de vela (ou bobinas)', 1),
  -- Arrefecimento (3)
  (3, null, 'Radiador e tampa do radiador', 1),
  (3, 'arref_aditivo', 'Aditivo para radiador (etilenoglicol / fluido orgânico)', 2),
  (3, 'arref_aditivo', 'Água desmineralizada', 3),
  (3, 'arref_termostato_mangueiras', 'Mangueiras superior e inferior do radiador', 4),
  (3, 'arref_termostato_mangueiras', 'Válvula termostática', 5),
  (3, null, 'Bomba d''água', 6),
  (3, null, 'Eletroventilador (ventoinha) e sensor de temperatura', 7),
  -- Injeção (4)
  (4, 'injecao_limpeza', 'Bicos injetores', 1),
  (4, 'injecao_limpeza', 'Corpo de borboleta (TBI) e atuador de marcha lenta', 2),
  (4, null, 'Sensores (MAP, rotação, sonda lambda / oxigênio)', 3),
  (4, null, 'Bomba de combustível', 4),
  (4, null, 'Regulador de pressão', 5),
  (4, null, 'Módulo de injeção', 6),
  -- Lubrificação (2): óleo e filtro de óleo
  (2, 'oleo_motor', 'Óleo lubrificante do motor (5W30, 10W40, sintético/mineral)', 1),
  (2, 'oleo_motor', 'Filtro de óleo do motor', 2),
  -- Filtros e serviços periódicos (23)
  (23, 'filtro_ar_motor', 'Filtro de ar do motor', 1),
  (23, 'filtro_combustivel', 'Filtro de combustível', 2),
  (23, 'filtro_cabine', 'Filtro de cabine / ar-condicionado (antipólen)', 3),
  -- Rodas, pneus e alinhamento (13)
  (13, 'pneus_troca', 'Pneus (novos ou recapados)', 1),
  (13, 'pneus_troca', 'Válvulas (bicos) de pneu', 2),
  (13, null, 'Rodas de liga leve ou aço (reparo/substituição)', 3),
  (13, 'pneus_alinhamento_balanceamento', 'Pesos de chumbo (balanceamento)', 4),
  (13, 'pneus_alinhamento_balanceamento', 'Geometria / alinhamento de direção (cambagem, caster e convergência)', 5),
  (13, 'pneus_calibragem', 'Calibragem (verificação da pressão de ar)', 6)
on conflict (categoria_codigo, nome) do nothing;

-- ============================================================
-- 4. RPC de solicitação: grava os componentes de cada item
-- ============================================================
-- Igual à versão vigente (20261016230000); só o insert dos itens ganha a coluna componentes.
create or replace function public.frotas_manutencao_solicitar(
  p_veiculo_id uuid,
  p_descricao text,
  p_prioridade text default 'normal',
  p_origem text default 'manual',
  p_checklist_id uuid default null,
  p_veiculo_parado boolean default false,
  p_itens jsonb default '[]'::jsonb,
  p_solicitante_nome text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_id uuid;
  it jsonb;
begin
  select id, placa, supervisao into v from public.frotas_veiculos where id = p_veiculo_id;
  if not found then
    raise exception 'Veículo não encontrado.' using errcode = 'no_data_found';
  end if;

  if not (
    public.painel_has_module(array['frotas_manutencao'], false)
    or (
      public.abertura_os_norm_sup(v.supervisao) <> ''
      and exists (
        select 1 from public.programacao_usuario_supervisoes s
         where s.ativo = true
           and (s.auth_user_id = auth.uid()
                or s.app_usuario_id in (select u.id from public.app_usuarios u where u.auth_user_id = auth.uid()))
           and public.abertura_os_norm_sup(s.supervisao) = public.abertura_os_norm_sup(v.supervisao))
    )
  ) then
    raise exception 'Sem permissão para solicitar manutenção deste veículo.' using errcode = 'insufficient_privilege';
  end if;

  if nullif(btrim(coalesce(p_descricao, '')), '') is null then
    raise exception 'Descreva o problema ou o serviço.' using errcode = 'check_violation';
  end if;

  -- Mesma origem não abre duas vezes (checklist já com solicitação aberta).
  if p_checklist_id is not null then
    select m.id into v_id from public.frotas_manutencoes m
     where m.checklist_id = p_checklist_id and m.status not in ('cancelada','reprovada') limit 1;
    if found then
      return v_id;
    end if;
  end if;

  insert into public.frotas_manutencoes (veiculo_id, descricao, prioridade, origem, checklist_id, veiculo_parado, solicitante_nome)
  values (p_veiculo_id, btrim(p_descricao), coalesce(p_prioridade, 'normal'), coalesce(p_origem, 'manual'),
          p_checklist_id, coalesce(p_veiculo_parado, false), nullif(left(btrim(coalesce(p_solicitante_nome, '')), 120), ''))
  returning id into v_id;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, tipo_item, descricao, plano_id, componentes)
    values (v_id,
            (it ->> 'categoria_codigo')::smallint,
            nullif(it ->> 'natureza', ''),
            coalesce(nullif(it ->> 'tipo_item', ''), 'servico'),
            coalesce(nullif(it ->> 'descricao', ''), btrim(p_descricao)),
            nullif(it ->> 'plano_id', '')::uuid,
            case when jsonb_typeof(it -> 'componentes') = 'array'
                 then array(select btrim(c) from jsonb_array_elements_text(it -> 'componentes') c where btrim(c) <> '')
                 else '{}'::text[] end);
  end loop;

  return v_id;
end;
$$;

-- ============================================================
-- 5. RPC de preventiva registrada: grava os componentes de cada serviço
-- ============================================================
-- Igual à versão vigente (20261016260000 e anteriores); só o insert dos itens ganha a coluna componentes.
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
    insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, descricao, plano_id, proximo_km, proxima_data, componentes)
    values (v_id, v_plano.categoria_codigo, 'preventiva', v_plano.nome, v_plano.id,
            nullif(it ->> 'proximo_km', '')::numeric, nullif(it ->> 'proxima_data', '')::date,
            case when jsonb_typeof(it -> 'componentes') = 'array'
                 then array(select btrim(c) from jsonb_array_elements_text(it -> 'componentes') c where btrim(c) <> '')
                 else '{}'::text[] end);
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
grant execute on function public.frotas_manutencao_solicitar(uuid, text, text, text, uuid, boolean, jsonb, text) to authenticated;
