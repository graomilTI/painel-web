-- Conecta os dados estruturados do fluxo de cotação do BotConversa à Hospedagem
-- e sinaliza pagamentos de hotéis que não emitem nota fiscal.

alter table if exists public.hospedagem_hoteis
  add column if not exists emite_nota_fiscal boolean not null default true;

alter table if exists public.hospedagem_cotacoes
  add column if not exists disponibilidade boolean,
  add column if not exists resposta_dados jsonb,
  add column if not exists resposta_flow_id text;

comment on column public.hospedagem_hoteis.emite_nota_fiscal is
  'Indica se o hotel emite nota fiscal. Quando falso, Hospedagem e Financeiro exibem alerta.';

comment on column public.hospedagem_cotacoes.resposta_dados is
  'Payload bruto recebido do fluxo de cotação do BotConversa para auditoria e reprocessamento.';

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

drop trigger if exists trg_financeiro_pagamentos_alerta_hotel_nf on public.financeiro_pagamentos;
create trigger trg_financeiro_pagamentos_alerta_hotel_nf
before insert or update of origem_setor, origem_tabela, origem_id, descricao, observacoes
on public.financeiro_pagamentos
for each row
execute function public.hospedagem_aplicar_alerta_nf_financeiro();

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

drop trigger if exists trg_hospedagem_hotel_sync_alerta_nf on public.hospedagem_hoteis;
create trigger trg_hospedagem_hotel_sync_alerta_nf
after update of emite_nota_fiscal
on public.hospedagem_hoteis
for each row
when (old.emite_nota_fiscal is distinct from new.emite_nota_fiscal)
execute function public.hospedagem_sincronizar_alerta_nf_existente();
