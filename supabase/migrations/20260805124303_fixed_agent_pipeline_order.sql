-- A esteira fixa passa a ser encadeada pelo worker: ao finalizar um agente,
-- ele enfileira exatamente o próximo da ordem configurada. Removemos os crons
-- individuais que poderiam inserir Colaboradores, Lista de OS ou BotConversa
-- fora dessa sequência.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'sync-colaboradores-5min',
  'sync-colaboradores-30min',
  'sync-lista-os-30min',
  'botconversa-sync-horario'
);
