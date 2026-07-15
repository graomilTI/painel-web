-- Login válido pro turno ALMOÇO passa a valer nas 24h do dia, não só na janela 11h-12h30
-- (ver qualifyForMeal/turnosForMinutes em grm-sync-login-alimentacao.js). Sem uma coleta
-- contínua, um login registrado fora das janelas de Café/Almoço/Janta (ex: chegada às 8h)
-- pode ser sobrescrito no relatório do GRM (que só mostra o login mais recente do
-- colaborador) antes de ser capturado. Adiciona uma coleta a cada 15min, 24h por dia,
-- complementando (sem substituir) as janelas de 5min já existentes perto dos horários
-- críticos de fechamento pro financeiro (Almoço ~11h45-11h50, Janta ~19h30).
select cron.schedule(
  'sync-login-alimentacao-continuo',
  '*/15 * * * *',
  $$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-login-alimentacao', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-login-alimentacao' AND status IN ('pendente','rodando')
    );
  $$
);
