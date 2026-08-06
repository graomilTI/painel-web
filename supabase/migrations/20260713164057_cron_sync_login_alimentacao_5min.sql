select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-06h'), schedule => '*/5 9 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-07h'), schedule => '0,5,10,15,20,25,30 10 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-11h'), schedule => '*/5 14 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-12h'), schedule => '0,5,10,15,20,25,30 15 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-19h'), schedule => '*/5 22 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'sync-login-alimentacao-20h'), schedule => '0,5,10,15,20,25,30 23 * * *');
;
