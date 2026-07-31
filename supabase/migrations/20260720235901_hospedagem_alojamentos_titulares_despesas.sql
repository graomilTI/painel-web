-- Titular individual das despesas de água, energia, internet e gás.
ALTER TABLE public.hospedagem_alojamentos
  ADD COLUMN IF NOT EXISTS agua_titular text,
  ADD COLUMN IF NOT EXISTS energia_titular text,
  ADD COLUMN IF NOT EXISTS internet_titular text,
  ADD COLUMN IF NOT EXISTS gas_titular text;

COMMENT ON COLUMN public.hospedagem_alojamentos.agua_titular IS 'Nome livre do titular da conta de água';
COMMENT ON COLUMN public.hospedagem_alojamentos.energia_titular IS 'Nome livre do titular da conta de energia elétrica';
COMMENT ON COLUMN public.hospedagem_alojamentos.internet_titular IS 'Nome livre do titular da conta de internet';
COMMENT ON COLUMN public.hospedagem_alojamentos.gas_titular IS 'Nome livre do titular da despesa de gás';
