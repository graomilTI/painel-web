alter table public.grm_notas_fiscais_importacoes
  add column if not exists data_nota_real date,
  add column if not exists valor_nota_real numeric;

-- Backfill: "Data N.F." é DD/MM/YYYY (99.7% das linhas); "Fatura":"Total" são
-- linhas de subtotal do import (sem essa chave) e ficam com data_nota_real
-- null de propósito, mesma exclusão que o código JS já fazia implicitamente
-- (dataRealDaNota retornava null pra elas).
update public.grm_notas_fiscais_importacoes
set
  data_nota_real = to_date(dados_json->>'Data N.F.', 'DD/MM/YYYY'),
  valor_nota_real = (dados_json->>'Valor Bruto')::numeric
where dados_json ? 'Data N.F.'
  and dados_json->>'Data N.F.' ~ '^\d{1,2}/\d{1,2}/\d{4}$';

create index if not exists idx_grm_notas_fiscais_data_nota_real
  on public.grm_notas_fiscais_importacoes (data_nota_real);;
