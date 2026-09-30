-- O seed de 20260610060000 usa "on conflict do nothing", mas email_regras não tinha nenhuma
-- restrição única, então rodar o seed duas vezes (10/06/2026 14:33 e 16:42) duplicou 5 regras:
-- Notas fiscais e XML, Financeiro / comprovantes, Logística / OS / contrato, Frotas / multas / placa e RH.
-- Os pares eram idênticos em todas as colunas (checado antes). Mantém a linha mais antiga de cada nome.
delete from public.email_regras r
 using (
   select id,
          row_number() over (partition by nome order by created_at, id) as posicao
     from public.email_regras
 ) d
 where d.id = r.id
   and d.posicao > 1;

-- Impede que volte a duplicar.
create unique index if not exists email_regras_nome_uidx on public.email_regras (nome);
