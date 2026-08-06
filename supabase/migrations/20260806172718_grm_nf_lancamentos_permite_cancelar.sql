-- Permite que o usuário autenticado cancele pelo painel um lançamento de NF
-- que ainda não foi lançado no GRM (ex.: já lançado manualmente por fora).
-- Não é permitido cancelar o que já está LANCADO nem reabrir um CANCELADO.
drop policy if exists "Cancelar lancamento NF" on public.grm_nf_lancamentos;
create policy "Cancelar lancamento NF"
  on public.grm_nf_lancamentos for update
  to authenticated
  using (status not in ('LANCADO', 'CANCELADO'))
  with check (status = 'CANCELADO');;
