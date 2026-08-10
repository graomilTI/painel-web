-- O disparo por cron fixo (15 em 15 min) dá lugar ao disparo por evento
-- (RPC solicitar_aplicar_distribuicao_os, ver migration anterior), chamado
-- pela tela Distribuir O.S quando o gestor fica 5 min inativo, troca de tela
-- ou fecha a aba. Mantém apenas o disparo manual ("Executar Agora" em
-- TI > Agentes), que insere direto em grm_sync_jobs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'aplicar-distribuicao-os-15min';
