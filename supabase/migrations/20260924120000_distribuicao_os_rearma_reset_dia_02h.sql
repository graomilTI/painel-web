-- Rearma o reset-dia na virada do dia (02h BRT = 05h UTC).
--
-- Desde 20260917140000 a pendencia de reset-dia e consumida em ate 2min depois
-- de criada (programacao duplicada/criada com antecedencia). Resultado: a
-- programacao de amanha ja e "limpa+redistribuida" no dia anterior, mas quando
-- o dia realmente chega nada forca o Graint a registrar mudanca -- se a
-- programacao for igual a de ontem, a reconciliacao normal pula o
-- setDistributionData ("ja esta correto") e os classificadores nao recebem a
-- distribuicao na data correspondente.
--
-- Este cron reabre (processado=false) as pendencias cuja data_referencia e HOJE;
-- o cron *-reset-dia-2min ja existente enfileira o agente em seguida.

select cron.unschedule('aplicar-distribuicao-os-rearma-novo-dia-02h')
where exists (select 1 from cron.job where jobname = 'aplicar-distribuicao-os-rearma-novo-dia-02h');

select cron.schedule('aplicar-distribuicao-os-rearma-novo-dia-02h', '0 5 * * *', $cron$
    update public.programacao_distribuicao_agendada
       set processado = false,
           processado_em = null
     where data_referencia = (now() at time zone 'America/Sao_Paulo')::date;
  $cron$);
