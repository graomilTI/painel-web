-- Preenche a coluna exibida no painel com a melhor data disponível.
update public.frotas_multas
set data_vencimento_auto = coalesce(
  data_vencimento_auto,
  data_limite_pagto,
  data_limite_defesa
)
where data_vencimento_auto is null
  and coalesce(data_limite_pagto, data_limite_defesa) is not null;

-- Mantém o vencimento preenchido nas próximas sincronizações do DETRAN.
create or replace function public.frotas_multas_preencher_vencimento()
returns trigger
language plpgsql
as $$
begin
  new.data_vencimento_auto := coalesce(
    new.data_vencimento_auto,
    new.data_limite_pagto,
    new.data_limite_defesa
  );
  return new;
end;
$$;

drop trigger if exists trg_frotas_multas_preencher_vencimento
  on public.frotas_multas;

create trigger trg_frotas_multas_preencher_vencimento
before insert or update of data_vencimento_auto, data_limite_pagto, data_limite_defesa
on public.frotas_multas
for each row
execute function public.frotas_multas_preencher_vencimento();
