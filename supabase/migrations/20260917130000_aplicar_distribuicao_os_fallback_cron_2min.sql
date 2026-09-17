-- aplicar-distribuicao-os é majoritariamente orientado a evento desde
-- 21358dd7 (RPC solicitar_aplicar_distribuicao_os / enfileirarDistribuicaoOs
-- em assets/js/programacao-equipe.js, e a idle-sync de distribuir-os.html).
-- Já existia uma rede de segurança periódica em produção — job pg_cron
-- 'aplicar-distribuicao-os-15min' (jobid 55, não capturado no snapshot local
-- de supabase/schema_atual.sql/migrations, achado por introspecção direta em
-- cron.job no MCP em 17/09) — que enfileirava 'aplicar-distribuicao-os' a
-- cada 15min só quando não havia job 'pendente'/'rodando' já em andamento
-- (mesmo guard idempotente de enfileirarDistribuicaoOs()).
--
-- Pedido do usuário 17/09 (relato de O.S. de RIO GRANDE DO SUL - Cruz Alta
-- programadas no Gestor > Programação sem refletir no Graint a tempo):
-- reduzir o pior caso de atraso de 15min pra no máximo ~2min. Mesmo comando/
-- guard de antes — só o intervalo muda. Renomeado de -15min pra -2min pra o
-- nome do job continuar refletindo o intervalo real (convenção já usada em
-- geocode-colaborador-base-2min, grm-despesas-reconciliacao-10min etc.).
select cron.unschedule('aplicar-distribuicao-os-15min');

select cron.schedule('aplicar-distribuicao-os-2min', '*/2 * * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''aplicar-distribuicao-os'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''aplicar-distribuicao-os''
        AND status IN (''pendente'', ''rodando'')
    );
  ');
