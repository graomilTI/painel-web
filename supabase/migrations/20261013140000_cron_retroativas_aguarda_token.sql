-- O job diário do retroativo (cron sync-despesas-retroativas-04h, 04:00 BRT) depende do token de
-- sessão do GRM, que vence às 23:59:59 e só é regravado à mão (painel ou grm-token-cache.js
-- salvar). Em 09/10 e 11/10/2026 o token ainda não estava no ar às 04h: o login caiu em
-- captcha_invalid, o job terminou em erro em 3 segundos e o dia anterior (08/10 e 10/10) ficou
-- sem retroativo, porque o agente só olha D-1 e nada repescava.
--
-- Agora o próprio agente (grm-sync-despesas-retroativas.js) confere o token antes de qualquer
-- consulta e, sem token válido, termina com sucesso deixando [RETROATIVAS_AGUARDANDO_TOKEN] no
-- stdout. Este cron (a cada 5 min) enfileira o agente de novo enquanto o ÚLTIMO job de hoje (a
-- partir das 03:50 BRT) for um desses adiamentos, e para sozinho:
--   - quando um job roda de verdade (sucesso sem o marcador, ou erro: erro não é retentado em
--     laço);
--   - às 23:30 BRT: o agente processa "ontem", então a janela precisa fechar antes da virada do
--     dia, senão a repetição pegaria outra data. (Diferente do cron do NHE, que fecha às 18h porque
--     repesca 3 dias; aqui um dia perdido não é repescado.)
-- Sem job adiado, o cron não faz nada: o início do dia continua sendo o sync-despesas-retroativas-04h.
select cron.unschedule(jobid) from cron.job where jobname = 'sync-despesas-retroativas-aguarda-token';

select cron.schedule('sync-despesas-retroativas-aguarda-token', '*/5 * * * *', $cron$
  insert into public.grm_sync_jobs (agente_id, status)
  select 'sync-despesas-retroativas', 'pendente'
  where (now() at time zone 'America/Sao_Paulo')::time < time '23:30'
    and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = 'sync-despesas-retroativas' and status in ('pendente', 'rodando')
    )
    and coalesce((
      select j.status = 'sucesso'
         and strpos(coalesce(j.output->>'stdout', ''), 'RETROATIVAS_AGUARDANDO_TOKEN') > 0
      from public.grm_sync_jobs j
      where j.agente_id = 'sync-despesas-retroativas'
        and j.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '3 hours 50 minutes') at time zone 'America/Sao_Paulo'
      order by j.created_at desc
      limit 1
    ), false);
$cron$);
