-- Frotas · Manutenção: ajustes do modelo para integrar o fluxo ao resto do painel (Fase 0).
--   * aprovação com permissão própria (can_approve) e alçada por valor;
--   * cadastro de oficinas (CNPJ, PIX, contato);
--   * responsável pelo pagamento (só "empresa" vai para NF/Financeiro/custo);
--   * colunas de integração (checklist, NF, pagamento, entrada na oficina, previsão de entrega);
--   * veículo "parado" derivado do fluxo (sem mexer em frotas_veiculos.status);
--   * leituras de km (BFleet + conclusão da manutenção) alimentando os vencimentos;
--   * RPC para solicitar manutenção por quem não tem o módulo, dentro da supervisão do veículo.
-- Em 16/10/2026 frotas_veiculos.hodometro era 0 em todos os veículos e o BFleet trazia odômetro
-- (km, com casas decimais; -1 = sem dado) em ~139 veículos: por isso o km vem das leituras.

-- ============================================================
-- 1. Aprovação: permissão própria + alçada por valor
-- ============================================================
-- painel_has_module(..., true) aceita editar OU criar OU aprovar. Aqui só vale "pode aprovar".
create or replace function public.painel_can_approve(module_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select public.painel_current_context() as value
  ), modules as (
    select module
    from ctx,
    lateral jsonb_array_elements(coalesce(value -> 'modules', '[]'::jsonb)) as module
  )
  select public.painel_is_master() or exists (
    select 1
    from modules
    where lower(coalesce(module ->> 'code', module ->> 'codigo', '')) = any (
      select lower(code) from unnest(module_codes) as code
    )
      and lower(coalesce(module ->> 'can_view', module ->> 'pode_ver', 'true')) in ('true', 't', '1', 'yes', 'sim')
      and lower(coalesce(module ->> 'can_approve', module ->> 'pode_aprovar', 'false')) in ('true', 't', '1', 'yes', 'sim')
  );
$$;

grant execute on function public.painel_can_approve(text[]) to authenticated;

-- Teto de valor por aprovador. Sem linha (ou inativa) = sem teto. Master não tem teto.
create table if not exists public.frotas_manutencao_alcadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references public.app_usuarios(id) on delete cascade,
  limite_valor numeric not null check (limite_valor >= 0),
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_frotas_manut_alcadas_updated on public.frotas_manutencao_alcadas;
create trigger trg_frotas_manut_alcadas_updated
  before update on public.frotas_manutencao_alcadas
  for each row execute function public.set_updated_at();

alter table public.frotas_manutencao_alcadas enable row level security;

drop policy if exists frotas_manut_alcadas_select on public.frotas_manutencao_alcadas;
create policy frotas_manut_alcadas_select on public.frotas_manutencao_alcadas
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], false));

drop policy if exists frotas_manut_alcadas_write on public.frotas_manutencao_alcadas;
create policy frotas_manut_alcadas_write on public.frotas_manutencao_alcadas
  for all to authenticated
  using (public.painel_is_master())
  with check (public.painel_is_master());

create or replace function public.frotas_manutencao_limite_aprovador()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select a.limite_valor
    from public.frotas_manutencao_alcadas a
    join public.app_usuarios u on u.id = a.usuario_id
   where a.ativo
     and u.auth_user_id = auth.uid()
     and not public.painel_is_master()
   limit 1;
$$;

grant execute on function public.frotas_manutencao_limite_aprovador() to authenticated;

-- ============================================================
-- 2. Oficinas
-- ============================================================
create table if not exists public.frotas_oficinas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  razao_social text,
  cnpj text,
  telefone text,
  contato_nome text,
  email text,
  pix_chave text,
  banco text,
  cidade_uf text,
  observacoes text,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frotas_oficinas_cnpj_formato check (cnpj is null or cnpj ~ '^[0-9]{11}$|^[0-9]{14}$')
);

-- CNPJ/CPF sempre só com dígitos (o agente do GRM acha o fornecedor por CNPJ).
create or replace function public.frotas_oficinas_normaliza()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.nome := btrim(new.nome);
  new.cnpj := nullif(regexp_replace(coalesce(new.cnpj, ''), '[^0-9]', '', 'g'), '');
  return new;
end;
$$;

drop trigger if exists trg_frotas_oficinas_normaliza on public.frotas_oficinas;
create trigger trg_frotas_oficinas_normaliza
  before insert or update on public.frotas_oficinas
  for each row execute function public.frotas_oficinas_normaliza();

drop trigger if exists trg_frotas_oficinas_updated on public.frotas_oficinas;
create trigger trg_frotas_oficinas_updated
  before update on public.frotas_oficinas
  for each row execute function public.set_updated_at();

create unique index if not exists uq_frotas_oficinas_cnpj on public.frotas_oficinas (cnpj) where cnpj is not null;
create index if not exists idx_frotas_oficinas_nome on public.frotas_oficinas (lower(nome));

alter table public.frotas_oficinas enable row level security;

drop policy if exists frotas_oficinas_select on public.frotas_oficinas;
create policy frotas_oficinas_select on public.frotas_oficinas
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], false));

drop policy if exists frotas_oficinas_write on public.frotas_oficinas;
create policy frotas_oficinas_write on public.frotas_oficinas
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], false))
  with check (public.painel_has_module(array['frotas_manutencao'], false));

-- ============================================================
-- 3. Responsável pelo pagamento (por veículo) e colunas de integração
-- ============================================================
alter table public.frotas_veiculos
  add column if not exists responsavel_manutencao text
    check (responsavel_manutencao in ('empresa','locadora','colaborador','proprietario'));

comment on column public.frotas_veiculos.responsavel_manutencao is
  'Quem paga a manutenção: empresa (vai para NF/Financeiro/custo), locadora, colaborador ou proprietario (só registro e prazo). Nulo = a classificar.';

-- Pela decisão de 16/10/2026: CAR1000, Elizeu Mota e Grão 1000 pagam; vazio/"TRANSFERINDO" ficam a classificar.
update public.frotas_veiculos
   set responsavel_manutencao = 'empresa'
 where responsavel_manutencao is null
   and (upper(coalesce(empresa, '')) like 'CAR1000%'
     or upper(coalesce(empresa, '')) like 'ELIZEU MOTA%'
     or empresa ilike 'gr_o 1000%');

alter table public.frotas_manutencoes
  add column if not exists responsavel_pagamento text
    check (responsavel_pagamento in ('empresa','locadora','colaborador','proprietario')),
  add column if not exists oficina_id uuid references public.frotas_oficinas(id) on delete set null,
  add column if not exists checklist_id uuid references public.frotas_checklists(id) on delete set null,
  add column if not exists entrada_oficina_em timestamptz,
  add column if not exists previsao_entrega date,
  add column if not exists motorista_nome text,
  add column if not exists nf_lancamento_id uuid references public.grm_nf_lancamentos(id) on delete set null,
  add column if not exists nf_numero text,
  add column if not exists pagamento_id uuid references public.financeiro_pagamentos(id) on delete set null,
  add column if not exists comprovante_url text;

alter table public.frotas_manutencao_orcamentos
  add column if not exists oficina_id uuid references public.frotas_oficinas(id) on delete set null;

create index if not exists idx_frotas_manutencoes_checklist on public.frotas_manutencoes (checklist_id) where checklist_id is not null;
create index if not exists idx_frotas_manutencoes_veiculo_status on public.frotas_manutencoes (veiculo_id, status);

-- ============================================================
-- 4. Leituras de km
-- ============================================================
create table if not exists public.frotas_veiculos_leituras_km (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.frotas_veiculos(id) on delete cascade,
  dia date not null,
  km numeric not null check (km > 0),
  fonte text not null check (fonte in ('bfleet','manutencao','manual','checklist')),
  lido_em timestamptz not null default now(),
  descartada boolean not null default false,
  motivo_descarte text,
  unique (veiculo_id, dia, fonte)
);

create index if not exists idx_frotas_leituras_km_veiculo on public.frotas_veiculos_leituras_km (veiculo_id, dia desc);

alter table public.frotas_veiculos_leituras_km enable row level security;

-- Só leitura pelo cliente; a gravação passa por private.frotas_km_registrar (valida e descarta absurdos).
drop policy if exists frotas_leituras_km_select on public.frotas_veiculos_leituras_km;
create policy frotas_leituras_km_select on public.frotas_veiculos_leituras_km
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao','frotas_veiculos','frotas'], false));

-- Uma leitura por veículo/dia/fonte (o sync do BFleet roda a cada 15 min: mantém a maior do dia).
-- Descarta: km <= 0, abaixo da maior leitura já aceita, ou salto acima de 1.500 km por dia.
create or replace function private.frotas_km_registrar(
  p_veiculo uuid, p_km numeric, p_fonte text, p_lido_em timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia date := (p_lido_em at time zone 'America/Sao_Paulo')::date;
  v_base numeric;
  v_base_dia date;
  v_motivo text;
begin
  if p_veiculo is null or p_km is null or p_km <= 0 then
    return false;
  end if;

  select l.km, l.dia into v_base, v_base_dia
    from public.frotas_veiculos_leituras_km l
   where l.veiculo_id = p_veiculo and not l.descartada
     and (l.dia < v_dia or l.fonte <> p_fonte)
   order by l.km desc
   limit 1;

  if v_base is not null and p_km < v_base then
    v_motivo := 'abaixo da maior leitura aceita (' || v_base || ')';
  elsif v_base is not null and p_km - v_base > 1500 * greatest(1, v_dia - v_base_dia) then
    v_motivo := 'salto acima de 1.500 km/dia sobre ' || v_base;
  end if;

  if v_motivo is not null then
    insert into public.frotas_veiculos_leituras_km (veiculo_id, dia, km, fonte, lido_em, descartada, motivo_descarte)
    values (p_veiculo, v_dia, p_km, p_fonte, p_lido_em, true, v_motivo)
    on conflict (veiculo_id, dia, fonte) do nothing;
    return false;
  end if;

  insert into public.frotas_veiculos_leituras_km (veiculo_id, dia, km, fonte, lido_em)
  values (p_veiculo, v_dia, p_km, p_fonte, p_lido_em)
  on conflict (veiculo_id, dia, fonte) do update
     set km = greatest(public.frotas_veiculos_leituras_km.km, excluded.km),
         lido_em = excluded.lido_em,
         descartada = false,
         motivo_descarte = null;
  return true;
end;
$$;

revoke all on function private.frotas_km_registrar(uuid, numeric, text, timestamptz) from public;

create or replace function public.frotas_veiculo_km_atual(p_veiculo uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select max(km) from public.frotas_veiculos_leituras_km
   where veiculo_id = p_veiculo and not descartada;
$$;

grant execute on function public.frotas_veiculo_km_atual(uuid) to authenticated;

-- BFleet: cada mudança do odômetro do veículo vira (no máximo) uma leitura por dia.
create or replace function private.frotas_km_bfleet_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bfleet_odometro is not null and new.bfleet_odometro ~ '^[0-9]+(\.[0-9]+)?$' then
    perform private.frotas_km_registrar(new.id, new.bfleet_odometro::numeric, 'bfleet', now());
  end if;
  return null;
end;
$$;

drop trigger if exists trg_frotas_km_bfleet on public.frotas_veiculos;
create trigger trg_frotas_km_bfleet
  after update of bfleet_odometro on public.frotas_veiculos
  for each row
  when (new.bfleet_odometro is distinct from old.bfleet_odometro)
  execute function private.frotas_km_bfleet_trigger();

-- Primeira carga com o que o BFleet já trouxe.
select count(*) filter (where private.frotas_km_registrar(v.id, v.bfleet_odometro::numeric, 'bfleet', now())) as leituras_aceitas
  from public.frotas_veiculos v
 where v.bfleet_odometro ~ '^[0-9]+(\.[0-9]+)?$';

-- ============================================================
-- 5. Veículo parado (derivado do fluxo)
-- ============================================================
-- Parado = manutenção com veiculo_parado em execução. Com data informada, também vale para o período já
-- concluído (dossiê, excesso de velocidade, Caixa). Sem data, só o que está parado agora.
-- SECURITY DEFINER e poucas colunas: a Programação não tem acesso à tabela de manutenções.
create or replace function public.frotas_veiculo_parado(p_placa text, p_data date default null)
returns table (manutencao_id uuid, numero bigint, desde timestamptz, previsao_entrega date, concluida_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.numero, coalesce(m.entrada_oficina_em, m.os_emitida_em), m.previsao_entrega, m.concluida_em
    from public.frotas_manutencoes m
    join public.frotas_veiculos v on v.id = m.veiculo_id
   where m.veiculo_parado
     and coalesce(m.entrada_oficina_em, m.os_emitida_em) is not null
     and upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'))
     and case
           when p_data is null then m.status = 'em_execucao'
           else m.status in ('em_execucao', 'concluida')
                and p_data >= (coalesce(m.entrada_oficina_em, m.os_emitida_em) at time zone 'America/Sao_Paulo')::date
                and (m.status = 'em_execucao' or p_data <= (m.concluida_em at time zone 'America/Sao_Paulo')::date)
         end;
$$;

create or replace function public.frotas_veiculos_parados()
returns table (placa text, manutencao_id uuid, numero bigint, desde timestamptz, previsao_entrega date)
language sql
stable
security definer
set search_path = public
as $$
  select v.placa, m.id, m.numero, coalesce(m.entrada_oficina_em, m.os_emitida_em), m.previsao_entrega
    from public.frotas_manutencoes m
    join public.frotas_veiculos v on v.id = m.veiculo_id
   where m.veiculo_parado and m.status = 'em_execucao';
$$;

grant execute on function public.frotas_veiculo_parado(text, date) to authenticated;
grant execute on function public.frotas_veiculos_parados() to authenticated;

-- ============================================================
-- 6. Fluxo: aprovação pelo can_approve + alçada, responsável, entrada na oficina
-- ============================================================
create or replace function public.frotas_manutencoes_fluxo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_nome text := public.frotas_manutencao_ator_nome();
  v_usuario boolean := auth.uid() is not null;  -- service role / migrations não passam pelas travas de permissão
  v_validos text[];
  v_orc record;
  v_veic record;
  v_qtd_itens integer;
  v_valor_informado numeric := new.valor_aprovado;
  v_limite numeric;
begin
  if tg_op = 'INSERT' then
    if v_usuario and new.status <> 'solicitada' then
      raise exception 'Toda manutenção nasce como solicitada.' using errcode = 'check_violation';
    end if;
    select v.motorista_atual, v.responsavel_manutencao into v_veic
      from public.frotas_veiculos v where v.id = new.veiculo_id;
    new.responsavel_pagamento := coalesce(new.responsavel_pagamento, v_veic.responsavel_manutencao);
    new.motorista_nome := coalesce(nullif(new.motorista_nome, ''), nullif(v_veic.motorista_atual, ''));
    new.km_solicitacao := coalesce(new.km_solicitacao, public.frotas_veiculo_km_atual(new.veiculo_id));
    new.solicitado_por := coalesce(new.solicitado_por, auth.uid());
    new.solicitante_nome := coalesce(nullif(new.solicitante_nome, ''), v_nome);
    new.solicitado_em := coalesce(new.solicitado_em, now());
    new.linha_tempo := jsonb_build_array(jsonb_build_object(
      'em', now(), 'de', null, 'para', new.status, 'por', v_nome, 'nota', null));
    return new;
  end if;

  -- UPDATE: o cliente não reescreve carimbos do fluxo.
  if v_usuario then
    new.numero := old.numero;
    new.solicitado_em := old.solicitado_em;
    new.solicitado_por := old.solicitado_por;
    new.solicitante_nome := old.solicitante_nome;
    new.aprovado_em := old.aprovado_em;
    new.aprovado_por := old.aprovado_por;
    new.aprovado_por_nome := old.aprovado_por_nome;
    new.valor_aprovado := old.valor_aprovado;
    new.os_emitida_em := old.os_emitida_em;
    new.concluida_em := old.concluida_em;
    new.concluida_por_nome := old.concluida_por_nome;
    new.linha_tempo := old.linha_tempo;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_validos := case old.status
    when 'solicitada'    then array['em_orcamento','aprovada','cancelada']
    when 'em_orcamento'  then array['em_aprovacao','aprovada','cancelada']
    when 'em_aprovacao'  then array['aprovada','reprovada','em_orcamento','cancelada']
    when 'reprovada'     then array['em_orcamento','cancelada']
    when 'aprovada'      then array['em_execucao','cancelada']
    when 'em_execucao'   then array['concluida','cancelada']
    else array[]::text[]
  end;
  if not (new.status = any (v_validos)) then
    raise exception 'Não é possível mover a manutenção de "%" para "%".', old.status, new.status
      using errcode = 'check_violation';
  end if;

  select count(*) into v_qtd_itens from public.frotas_manutencao_itens where manutencao_id = new.id;

  if new.status = 'em_aprovacao' then
    if not exists (select 1 from public.frotas_manutencao_orcamentos where manutencao_id = new.id) then
      raise exception 'Cadastre ao menos um orçamento antes de enviar para aprovação.' using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'aprovada' then
    if v_usuario and not public.painel_can_approve(array['frotas_manutencao']) then
      raise exception 'Sem permissão para aprovar manutenção.' using errcode = 'insufficient_privilege';
    end if;
    if new.natureza is null then
      raise exception 'Informe a natureza (preventiva ou corretiva) antes de aprovar.' using errcode = 'check_violation';
    end if;
    if new.responsavel_pagamento is null then
      raise exception 'Informe quem paga a manutenção (empresa, locadora, colaborador ou proprietário) antes de aprovar.' using errcode = 'check_violation';
    end if;
    if v_qtd_itens = 0 then
      raise exception 'Informe ao menos um item (categoria do guia) antes de aprovar.' using errcode = 'check_violation';
    end if;
    select * into v_orc from public.frotas_manutencao_orcamentos
      where manutencao_id = new.id and selecionado limit 1;
    if found then
      new.valor_aprovado := v_orc.valor_total;
      new.oficina := coalesce(nullif(new.oficina, ''), v_orc.fornecedor);
      new.oficina_id := coalesce(new.oficina_id, v_orc.oficina_id);
    elsif new.sem_orcamento and v_valor_informado is not null then
      new.valor_aprovado := v_valor_informado;  -- aprovada sem orçamento, com valor estimado por quem aprova
    elsif new.sem_orcamento then
      raise exception 'Aprovação sem orçamento exige o valor estimado aprovado.' using errcode = 'check_violation';
    else
      raise exception 'Selecione o orçamento aprovado (ou marque "sem orçamento" e informe o valor).' using errcode = 'check_violation';
    end if;
    if v_usuario then
      v_limite := public.frotas_manutencao_limite_aprovador();
      if v_limite is not null and new.valor_aprovado > v_limite then
        raise exception 'Valor acima da sua alçada de aprovação (limite R$ %).', v_limite using errcode = 'insufficient_privilege';
      end if;
    end if;
    new.aprovado_em := now();
    new.aprovado_por := auth.uid();
    new.aprovado_por_nome := v_nome;
  end if;

  if new.status = 'reprovada' then
    if v_usuario and not public.painel_can_approve(array['frotas_manutencao']) then
      raise exception 'Sem permissão para reprovar manutenção.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.status in ('reprovada','cancelada') and nullif(btrim(coalesce(new.motivo_status, '')), '') is null then
    raise exception 'Informe o motivo.' using errcode = 'check_violation';
  end if;

  if new.status = 'em_execucao' then
    new.os_numero := coalesce(nullif(btrim(coalesce(new.os_numero, '')), ''), 'OS-' || lpad(new.numero::text, 6, '0'));
    new.os_emitida_em := now();
    new.entrada_oficina_em := coalesce(new.entrada_oficina_em, now());
  end if;

  if new.status = 'concluida' then
    if new.data_execucao is null or new.km_execucao is null or new.custo is null then
      raise exception 'Para concluir informe data, km e custo final.' using errcode = 'check_violation';
    end if;
    new.concluida_em := now();
    new.concluida_por_nome := v_nome;
  end if;

  new.linha_tempo := coalesce(old.linha_tempo, '[]'::jsonb) || jsonb_build_object(
    'em', now(), 'de', old.status, 'para', new.status, 'por', v_nome,
    'nota', case when new.status in ('reprovada','cancelada') then new.motivo_status else null end);
  if new.status not in ('reprovada','cancelada') then
    new.motivo_status := null;
  end if;
  return new;
end;
$$;

-- Ao concluir, o km da conclusão vira leitura (alimenta o hodômetro dos vencimentos).
create or replace function private.frotas_manutencoes_km_conclusao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.frotas_km_registrar(
    new.veiculo_id, new.km_execucao, 'manutencao',
    ((coalesce(new.data_execucao, current_date)::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo'));
  return null;
end;
$$;

drop trigger if exists trg_frotas_manutencoes_km_conclusao on public.frotas_manutencoes;
create trigger trg_frotas_manutencoes_km_conclusao
  after update of status on public.frotas_manutencoes
  for each row
  when (new.status = 'concluida' and old.status is distinct from new.status)
  execute function private.frotas_manutencoes_km_conclusao();

-- ============================================================
-- 7. Vencimentos passam a usar o km das leituras (hodometro manual era 0 em todos os veículos)
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
         (array_agg(m.km_execucao order by m.data_execucao desc, m.concluida_em desc nulls last))[1] as km_ultima
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
         case when a.intervalo_km is not null and u.km_ultima is not null then u.km_ultima + a.intervalo_km end as vencimento_km,
         case when u.data_ultima is not null and (a.intervalo_meses is not null or a.intervalo_dias is not null)
              then (u.data_ultima + make_interval(months => coalesce(a.intervalo_meses, 0), days => coalesce(a.intervalo_dias, 0)))::date end as vencimento_data
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
  cross join hoje h
  join public.frotas_manutencao_categorias cat on cat.codigo = c.categoria_codigo;

-- ============================================================
-- 8. Solicitar manutenção sem ter o módulo (gestor da supervisão do veículo)
-- ============================================================
create or replace function public.frotas_manutencao_solicitar(
  p_veiculo_id uuid,
  p_descricao text,
  p_prioridade text default 'normal',
  p_origem text default 'manual',
  p_checklist_id uuid default null,
  p_veiculo_parado boolean default false,
  p_itens jsonb default '[]'::jsonb)
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

  insert into public.frotas_manutencoes (veiculo_id, descricao, prioridade, origem, checklist_id, veiculo_parado)
  values (p_veiculo_id, btrim(p_descricao), coalesce(p_prioridade, 'normal'), coalesce(p_origem, 'manual'),
          p_checklist_id, coalesce(p_veiculo_parado, false))
  returning id into v_id;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, tipo_item, descricao, plano_id)
    values (v_id,
            (it ->> 'categoria_codigo')::smallint,
            nullif(it ->> 'natureza', ''),
            coalesce(nullif(it ->> 'tipo_item', ''), 'servico'),
            coalesce(nullif(it ->> 'descricao', ''), btrim(p_descricao)),
            nullif(it ->> 'plano_id', '')::uuid);
  end loop;

  return v_id;
end;
$$;

grant execute on function public.frotas_manutencao_solicitar(uuid, text, text, text, uuid, boolean, jsonb) to authenticated;
