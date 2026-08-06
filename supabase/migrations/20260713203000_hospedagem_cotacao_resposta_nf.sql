-- Conecta os dados estruturados do fluxo de cotação do BotConversa à Hospedagem
-- e sinaliza pagamentos de hotéis que não emitem nota fiscal.
-- Esta migration é autossuficiente: cria hospedagem_cotacoes quando a migration
-- base do fluxo v2 ainda não tiver sido aplicada no ambiente.

create extension if not exists pgcrypto;
alter table if exists public.hospedagem_hoteis
  add column if not exists emite_nota_fiscal boolean not null default true;
create table if not exists public.hospedagem_cotacoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null,
  hotel_id uuid not null,
  hotel_nome text,
  status text not null default 'PENDENTE',
  quantidade_pessoas integer,
  quantidade_quartos integer,
  composicao_quartos text,
  diarias_previstas numeric(10,2),
  valor_diaria numeric(14,2),
  valor_total numeric(14,2),
  aceita_pagamento_checkout boolean,
  cafe_incluso boolean,
  estacionamento_incluso boolean,
  disponibilidade boolean,
  observacoes text,
  mensagem_enviada text,
  resposta_texto text,
  resposta_dados jsonb,
  resposta_flow_id text,
  erro_envio text,
  enviado_em timestamptz,
  respondido_em timestamptz,
  selecionada boolean not null default false,
  selecionada_em timestamptz,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (solicitacao_id, hotel_id)
);
alter table public.hospedagem_cotacoes
  add column if not exists disponibilidade boolean,
  add column if not exists resposta_dados jsonb,
  add column if not exists resposta_flow_id text;
create index if not exists idx_hosp_cotacoes_solicitacao
  on public.hospedagem_cotacoes(solicitacao_id);
create index if not exists idx_hosp_cotacoes_hotel
  on public.hospedagem_cotacoes(hotel_id);
create index if not exists idx_hosp_cotacoes_status
  on public.hospedagem_cotacoes(status);
comment on column public.hospedagem_hoteis.emite_nota_fiscal is
  'Indica se o hotel emite nota fiscal. Quando falso, Hospedagem e Financeiro exibem alerta.';
comment on column public.hospedagem_cotacoes.resposta_dados is
  'Payload bruto recebido do fluxo de cotação do BotConversa para auditoria e reprocessamento.';
alter table public.hospedagem_cotacoes enable row level security;
drop policy if exists hospedagem_cotacoes_auth_all on public.hospedagem_cotacoes;
create policy hospedagem_cotacoes_auth_all
  on public.hospedagem_cotacoes
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public.hospedagem_cotacoes to authenticated;
create or replace function public.hospedagem_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_hosp_cotacoes_updated_at on public.hospedagem_cotacoes;
create trigger trg_hosp_cotacoes_updated_at
before update on public.hospedagem_cotacoes
for each row execute function public.hospedagem_touch_updated_at();
create or replace function public.hospedagem_aplicar_alerta_nf_financeiro()
returns trigger
language plpgsql
as $$
declare
  v_emite_nota boolean;
  v_alerta constant text := '⚠ HOTEL NÃO EMITE NOTA FISCAL';
begin
  if upper(coalesce(new.origem_setor, '')) <> 'HOSPEDAGEM'
     or upper(coalesce(new.origem_tabela, '')) <> 'HOSPEDAGEM_RESERVAS'
     or new.origem_id is null then
    return new;
  end if;

  select coalesce(h.emite_nota_fiscal, true)
    into v_emite_nota
  from public.hospedagem_reservas r
  left join public.hospedagem_hoteis h on h.id = r.hotel_id
  where r.id = new.origem_id
  limit 1;

  if coalesce(v_emite_nota, true) = false then
    if coalesce(new.descricao, '') !~ '^⚠' then
      new.descricao := '⚠ ' || coalesce(new.descricao, 'Hospedagem');
    end if;
    if position(v_alerta in coalesce(new.observacoes, '')) = 0 then
      new.observacoes := concat_ws(E'\n', v_alerta, nullif(new.observacoes, ''));
    end if;
  else
    new.descricao := nullif(regexp_replace(coalesce(new.descricao, ''), '^⚠\s*', ''), '');
    new.observacoes := nullif(trim(both E'\n' from replace(coalesce(new.observacoes, ''), v_alerta, '')), '');
  end if;

  return new;
end;
$$;
create or replace function public.hospedagem_sincronizar_alerta_nf_existente()
returns trigger
language plpgsql
as $$
declare
  v_alerta constant text := '⚠ HOTEL NÃO EMITE NOTA FISCAL';
begin
  if new.emite_nota_fiscal = false then
    update public.financeiro_pagamentos fp
       set descricao = case
             when coalesce(fp.descricao, '') ~ '^⚠' then fp.descricao
             else '⚠ ' || coalesce(fp.descricao, 'Hospedagem')
           end,
           observacoes = case
             when position(v_alerta in coalesce(fp.observacoes, '')) > 0 then fp.observacoes
             else concat_ws(E'\n', v_alerta, nullif(fp.observacoes, ''))
           end
     where upper(coalesce(fp.origem_setor, '')) = 'HOSPEDAGEM'
       and upper(coalesce(fp.origem_tabela, '')) = 'HOSPEDAGEM_RESERVAS'
       and fp.origem_id in (
         select r.id from public.hospedagem_reservas r where r.hotel_id = new.id
       );
  else
    update public.financeiro_pagamentos fp
       set descricao = nullif(regexp_replace(coalesce(fp.descricao, ''), '^⚠\s*', ''), ''),
           observacoes = nullif(trim(both E'\n' from replace(coalesce(fp.observacoes, ''), v_alerta, '')), '')
     where upper(coalesce(fp.origem_setor, '')) = 'HOSPEDAGEM'
       and upper(coalesce(fp.origem_tabela, '')) = 'HOSPEDAGEM_RESERVAS'
       and fp.origem_id in (
         select r.id from public.hospedagem_reservas r where r.hotel_id = new.id
       );
  end if;
  return new;
end;
$$;
-- Os alertas financeiros dependem das tabelas operacionais de reserva e pagamento.
-- Em ambientes onde elas ainda não existem, a migration continua normalmente e os
-- gatilhos serão criados quando a migration for executada novamente após a base.
do $$
begin
  if to_regclass('public.financeiro_pagamentos') is not null
     and to_regclass('public.hospedagem_reservas') is not null then
    execute 'drop trigger if exists trg_financeiro_pagamentos_alerta_hotel_nf on public.financeiro_pagamentos';
    execute 'create trigger trg_financeiro_pagamentos_alerta_hotel_nf
      before insert or update of origem_setor, origem_tabela, origem_id, descricao, observacoes
      on public.financeiro_pagamentos
      for each row execute function public.hospedagem_aplicar_alerta_nf_financeiro()';

    execute 'drop trigger if exists trg_hospedagem_hotel_sync_alerta_nf on public.hospedagem_hoteis';
    execute 'create trigger trg_hospedagem_hotel_sync_alerta_nf
      after update of emite_nota_fiscal
      on public.hospedagem_hoteis
      for each row
      when (old.emite_nota_fiscal is distinct from new.emite_nota_fiscal)
      execute function public.hospedagem_sincronizar_alerta_nf_existente()';
  end if;
end $$;
