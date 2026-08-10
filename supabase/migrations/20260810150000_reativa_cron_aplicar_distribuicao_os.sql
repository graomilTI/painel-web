-- Religa o agente aplicar-distribuicao-os agora que ele respeita a ativação
-- por supervisão (distribuicao_os_automatica em public.supervisoes, todas
-- desligadas por padrão). Script já validado no worker do cPanel com 0
-- supervisões ativas (encerra sem abrir navegador).
select cron.schedule(
  'aplicar-distribuicao-os-15min',
  '*/15 * * * *',
  $cron$
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT 'aplicar-distribuicao-os', 'pendente'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = 'aplicar-distribuicao-os'
        AND status IN ('pendente', 'rodando')
    );
  $cron$
);
