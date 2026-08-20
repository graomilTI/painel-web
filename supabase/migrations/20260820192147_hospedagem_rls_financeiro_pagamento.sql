-- A confirmacao atomica do pagamento altera estes agregados sob o papel do
-- proprio usuario Financeiro (SECURITY INVOKER).
create policy hospedagem_checkout_lotes_write_financeiro
on public.hospedagem_checkout_lotes for update to authenticated
using (public.hospedagem_pode_financeiro(true))
with check (public.hospedagem_pode_financeiro(true));

create policy hospedagem_financeiro_write_financeiro
on public.hospedagem_financeiro for update to authenticated
using (public.hospedagem_pode_financeiro(true))
with check (public.hospedagem_pode_financeiro(true));

create policy hospedagem_adiantamentos_write_financeiro
on public.hospedagem_adiantamentos for all to authenticated
using (public.hospedagem_pode_financeiro(true))
with check (public.hospedagem_pode_financeiro(true));

create policy hospedagem_adiantamento_movimentos_write_financeiro
on public.hospedagem_adiantamento_movimentos for all to authenticated
using (public.hospedagem_pode_financeiro(true))
with check (public.hospedagem_pode_financeiro(true));
