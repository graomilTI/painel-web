-- O job diário do lançamento de NHE (cron sync-lancar-nhe-03h, 03:00 BRT) dependia de o
-- token de sessão do GRM já ter sido regravado à mão (grm-token-cache.js salvar). O token
-- vence às 23:59:59 e a renovação costuma sair só de manhã; nos dias 01 a 04/10/2026 o job
-- das 03h deu erro (captcha_invalid / "Login GRM em pausa") e o lançamento só foi feito por
-- rodada manual, 5 a 10 horas depois.
--
-- Agora o próprio agente (grm-sync-lancar-nhe.js) confere o token antes de qualquer coisa e,
-- sem token válido, termina com sucesso deixando [NHE_AGUARDANDO_TOKEN] no stdout. Este cron
-- (a cada 5 min) enfileira o agente de novo enquanto o ÚLTIMO job de hoje (a partir das 02:50
-- BRT) for um desses adiamentos, e para sozinho:
--   - quando um job roda de verdade (sucesso sem o marcador, ou erro: erro não é retentado
--     em laço);
--   - às 18:00 BRT (token gravado depois disso fica pra execução do dia seguinte, que repesca
--     3 dias);
--   - na virada do dia (a janela passa a ser a de amanhã).
-- Sem job adiado, o cron não faz nada: o início do dia continua sendo o sync-lancar-nhe-03h.
select cron.unschedule(jobid) from cron.job where jobname = 'sync-lancar-nhe-aguarda-token';

select cron.schedule('sync-lancar-nhe-aguarda-token', '*/5 * * * *', $cron$
  insert into public.grm_sync_jobs (agente_id, status)
  select 'sync-lancar-nhe', 'pendente'
  where (now() at time zone 'America/Sao_Paulo')::time < time '18:00'
    and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = 'sync-lancar-nhe' and status in ('pendente', 'rodando')
    )
    and coalesce((
      select j.status = 'sucesso'
         and strpos(coalesce(j.output->>'stdout', ''), 'NHE_AGUARDANDO_TOKEN') > 0
      from public.grm_sync_jobs j
      where j.agente_id = 'sync-lancar-nhe'
        and j.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '2 hours 50 minutes') at time zone 'America/Sao_Paulo'
      order by j.created_at desc
      limit 1
    ), false);
$cron$);
