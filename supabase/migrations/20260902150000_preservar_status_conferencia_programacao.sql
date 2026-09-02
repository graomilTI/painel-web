-- Fix: operacional_os_preservar_status_programacao já protegia status_gestor
-- de ser zerado por um sync externo (ex.: grmserver-lista-os-api-realtime.js)
-- quando existe programacao_equipe confirmada pra hoje/futuro, mas não
-- protegia status_conferencia — que ia pra 'PENDENTE' mesmo assim, apagando
-- o rastro de que a O.S. já tinha sido aplicada no Graint (AJUSTADA) sem
-- nunca reenfileirar o agente aplicar-distribuicao-os pra reaplicar.
--
-- Achado em produção 02/09/2026: um ciclo do sync de Lista de O.S. atualizou
-- 453 O.S. de uma vez (variação normal do Graint em campos como remanescente),
-- e 52 dessas O.S. programadas ficaram com colaborador sumido do Graint
-- silenciosamente, sem qualquer sinal de que precisavam ser reaplicadas.

create or replace function public.operacional_os_preservar_status_programacao()
returns trigger
language plpgsql
as $$
begin
  if new.status_gestor is null
     and old.status_gestor in ('ATENDER', 'AGUARDAR')
     and exists (
       select 1
       from public.programacao_equipe e
       join public.programacao_dia p on p.id = e.programacao_id
       where e.os_id = old.id
         and e.confirmado is true
         and p.data_referencia >= current_date
     ) then
    new.status_gestor := old.status_gestor;
    new.configurada_em := coalesce(new.configurada_em, old.configurada_em);
    new.data_os := coalesce(new.data_os, old.data_os);
    new.status_conferencia := old.status_conferencia;
  end if;

  return new;
end;
$$;
