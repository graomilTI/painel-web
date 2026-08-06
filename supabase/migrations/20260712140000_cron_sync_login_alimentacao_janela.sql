-- sync-login-alimentacao precisa rodar várias vezes entre 11:00 e 12:30 (horário de
-- Brasília = UTC-3, banco em UTC → 14:00-15:30 UTC) para capturar logins tardios do
-- colaborador (pode logar perto do embarque e depois longe, ou vice-versa) antes do
-- fechamento da janela de elegibilidade (10:30-12:00, ver HORA_INICIO/HORA_FIM do
-- agente). Removido do round-robin genérico de 60min (AGENTES_DIARIOS) — igual ao
-- padrão já usado por sync-colaboradores (agendamento próprio, fora do round-robin).
select cron.schedule(
  'sync-login-alimentacao-11h',
  '0,15,30,45 14 * * *',
  $$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-login-alimentacao', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-login-alimentacao' AND status IN ('pendente','rodando')
    );
  $$
);
select cron.schedule(
  'sync-login-alimentacao-12h',
  '0,15,30 15 * * *',
  $$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'sync-login-alimentacao', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'sync-login-alimentacao' AND status IN ('pendente','rodando')
    );
  $$
);
