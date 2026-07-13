-- O relatório de login do GRM só reflete o ÚLTIMO login do colaborador (não um histórico
-- completo) — se ele logar de novo antes da nossa próxima checagem, o login anterior
-- (dentro da janela de refeição) some do relatório sem deixar rastro. Apertamos de 15min
-- pra 5min dentro de cada janela (Café 06:00-07:30, Almoço 11:00-12:30, Janta 19:00-20:30)
-- pra reduzir a chance de perder um login válido sobrescrito por outro antes de checarmos.
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-06h'), schedule => '*/5 9 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-07h'), schedule => '0,5,10,15,20,25,30 10 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-11h'), schedule => '*/5 14 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-12h'), schedule => '0,5,10,15,20,25,30 15 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-19h'), schedule => '*/5 22 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-20h'), schedule => '0,5,10,15,20,25,30 23 * * *');
