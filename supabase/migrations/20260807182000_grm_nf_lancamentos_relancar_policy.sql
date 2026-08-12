-- Permite ao usuário autenticado voltar um lançamento com erro pra fila
-- (status ERRO -> NOVO), pra o agente tentar de novo. A policy de UPDATE
-- existente só permitia mudar o status para CANCELADO.
create policy "Relancar lancamento NF com erro"
on public.grm_nf_lancamentos
for update
to authenticated
using (status = 'ERRO')
with check (status = 'NOVO');
