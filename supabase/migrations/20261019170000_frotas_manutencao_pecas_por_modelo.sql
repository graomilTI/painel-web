-- Frotas · Manutenção: catálogo de peças por MODELO de veículo (Mobi, Argo, Uno, Kwid, Gol...), que aprende com o uso.
--   * frotas_manutencao_pecas: peça já usada em um modelo (item do guia + marca/referência + último valor pago);
--   * frotas_manutencao_itens.pecas: a peça específica escolhida em cada item ({ "<item do guia>": { detalhe, valor } });
--   * frotas_manutencao_aprender_pecas(): ao aprovar, grava no catálogo do modelo as peças do orçamento escolhido;
--   * frotas_manutencao_solicitar(): passa a gravar as peças escolhidas em cada item.
-- O modelo é a família do veículo ("FIAT/MOBI", "RENAULT/KWID", "VW/GOL"), calculada pela tela a partir de marca/modelo.

-- ============================================================
-- 1. Catálogo
-- ============================================================
create table if not exists public.frotas_manutencao_pecas (
  id uuid primary key default gen_random_uuid(),
  modelo text not null check (btrim(modelo) <> ''),
  componente text not null check (btrim(componente) <> ''),
  detalhe text not null check (btrim(detalhe) <> ''),
  ultimo_valor numeric check (ultimo_valor is null or ultimo_valor >= 0),
  ultima_data date,
  usos integer not null default 1 check (usos >= 0),
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.frotas_manutencao_pecas is
  'Peças já usadas por modelo (família) de veículo: item do guia + marca/referência + último valor. Aprende ao aprovar uma manutenção.';

create unique index if not exists uq_frotas_manut_pecas on public.frotas_manutencao_pecas (modelo, lower(componente), lower(detalhe));
create index if not exists idx_frotas_manut_pecas_modelo on public.frotas_manutencao_pecas (modelo);

drop trigger if exists trg_frotas_manut_pecas_updated on public.frotas_manutencao_pecas;
create trigger trg_frotas_manut_pecas_updated
  before update on public.frotas_manutencao_pecas
  for each row execute function public.set_updated_at();

alter table public.frotas_manutencao_pecas enable row level security;

-- Todo usuário logado lê (quem pede manutenção pela supervisão do veículo também vê as sugestões); só quem edita o módulo grava.
drop policy if exists frotas_manut_pecas_select on public.frotas_manutencao_pecas;
create policy frotas_manut_pecas_select on public.frotas_manutencao_pecas
  for select to authenticated using (true);

drop policy if exists frotas_manut_pecas_write on public.frotas_manutencao_pecas;
create policy frotas_manut_pecas_write on public.frotas_manutencao_pecas
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], true))
  with check (public.painel_has_module(array['frotas_manutencao'], true));

-- ============================================================
-- 2. Peça específica escolhida em cada item
-- ============================================================
alter table public.frotas_manutencao_itens
  add column if not exists pecas jsonb not null default '{}'::jsonb
    check (jsonb_typeof(pecas) = 'object');

comment on column public.frotas_manutencao_itens.pecas is
  'Peça específica escolhida para cada item do guia: { "<item>": { "detalhe": "LUK 620...", "valor": 754.8 } }. Pré-preenche as linhas do orçamento.';

-- ============================================================
-- 3. Solicitar: grava as peças escolhidas em cada item
-- ============================================================
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
    insert into public.frotas_manutencao_itens (manutencao_id, categoria_codigo, natureza, tipo_item, descricao, plano_id, componentes, pecas)
    values (v_id,
            (it ->> 'categoria_codigo')::smallint,
            nullif(it ->> 'natureza', ''),
            coalesce(nullif(it ->> 'tipo_item', ''), 'servico'),
            coalesce(nullif(it ->> 'descricao', ''), btrim(p_descricao)),
            nullif(it ->> 'plano_id', '')::uuid,
            case when jsonb_typeof(it -> 'componentes') = 'array'
                 then array(select btrim(c) from jsonb_array_elements_text(it -> 'componentes') c where btrim(c) <> '')
                 else '{}'::text[] end,
            case when jsonb_typeof(it -> 'pecas') = 'object' then it -> 'pecas' else '{}'::jsonb end);
  end loop;

  return v_id;
end;
$$;

grant execute on function public.frotas_manutencao_solicitar(uuid, text, text, text, uuid, boolean, jsonb, text) to authenticated;

-- ============================================================
-- 4. Aprender: ao aprovar, as peças do orçamento escolhido entram no catálogo do modelo
-- ============================================================
-- Só linhas de PEÇA com marca/referência (detalhe): é isso que identifica a peça. Repetida (mesmo modelo, item e referência):
-- atualiza o último valor e a data e soma um uso. Devolve quantas peças foram gravadas.
create or replace function public.frotas_manutencao_aprender_pecas(p_manutencao uuid, p_modelo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas jsonb;
  l jsonb;
  v_qtd integer := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_valor numeric;
begin
  if not public.painel_has_module(array['frotas_manutencao'], true) then
    raise exception 'Sem permissão para atualizar o catálogo de peças.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(coalesce(p_modelo, '')), '') is null then
    return 0;
  end if;

  select o.linhas into v_linhas
    from public.frotas_manutencao_orcamentos o
   where o.manutencao_id = p_manutencao and o.selecionado
   limit 1;
  if v_linhas is null or jsonb_typeof(v_linhas) <> 'array' then
    return 0;
  end if;

  for l in select * from jsonb_array_elements(v_linhas) loop
    if coalesce(l ->> 'tipo', 'peca') = 'servico'
       or nullif(btrim(coalesce(l ->> 'nome', '')), '') is null
       or nullif(btrim(coalesce(l ->> 'detalhe', '')), '') is null then
      continue;
    end if;
    v_valor := case when (l ->> 'valor') ~ '^[0-9]+(\.[0-9]+)?$' then (l ->> 'valor')::numeric else null end;
    insert into public.frotas_manutencao_pecas (modelo, componente, detalhe, ultimo_valor, ultima_data)
    values (btrim(p_modelo), btrim(l ->> 'nome'), btrim(l ->> 'detalhe'), v_valor, v_hoje)
    on conflict (modelo, lower(componente), lower(detalhe)) do update
      set ultimo_valor = coalesce(excluded.ultimo_valor, public.frotas_manutencao_pecas.ultimo_valor),
          ultima_data = excluded.ultima_data,
          usos = public.frotas_manutencao_pecas.usos + 1,
          ativo = true;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;

revoke all on function public.frotas_manutencao_aprender_pecas(uuid, text) from public;
grant execute on function public.frotas_manutencao_aprender_pecas(uuid, text) to authenticated;
