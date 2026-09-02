-- O agente "Despesas Retroativas" (Café/Almoço/Salário de Intermitente/
-- Serviços Terceirizados) só era enfileirado pelo scheduler genérico por
-- intervalo (interval_minutes=1440 contado a partir do fim da execução
-- anterior), sem nenhuma âncora de horário — em dias recentes rodou entre
-- 01h56 e 10h20 no horário de Brasília. Corrige no mesmo padrão já usado por
-- sync-liberacao-despesas e sync-lancar-nhe: pg_cron dedicado às 04h
-- Brasília (07:00 UTC; o Brasil não usa horário de verão) e desliga o
-- scheduler genérico pra esse agente parar de competir com o horário fixo.

update public.grm_sync_agent_settings
   set interval_minutes = 0,
       updated_at = now()
 where agent_id = 'sync-despesas-retroativas';

select cron.schedule(
  'sync-despesas-retroativas-04h',
  '0 7 * * *',
  $cron$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-despesas-retroativas', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-despesas-retroativas' AND status IN ('pendente','rodando')
    );
  $cron$
);
