-- Motivação (04/09): o Graint tem uma trava de edição na tela de Distribuição
-- de OS — o botão Salvar só aparece se houver alguma alteração detectada. O
-- agente aplicar-distribuicao-os (grmserver-aplicar-distribuicao-os-api.js)
-- já reconcilia staCodes contra a Programação, mas só chama
-- setDistributionData quando encontra diferença: se a distribuição do dia
-- novo acaba idêntica à do dia anterior (ex.: mesma equipe se repetindo),
-- nenhuma chamada de escrita é feita e o Graint nunca registra a virada do
-- dia — o que deixa a tela sem refletir o novo dia pros colaboradores.
--
-- Fix: o cron das 02h (Brasília) passa a enfileirar um agente dedicado
-- ('aplicar-distribuicao-os-reset-dia', mesmo script com a flag RESET_DIA
-- ligada) que, só para as pendências de "novo dia" em
-- programacao_distribuicao_agendada, limpa (staCodes=[]) e imediatamente
-- redistribui a Programação do dia, supervisão por supervisão — cada
-- supervisão fica sem colaborador vinculado só pelo intervalo entre as duas
-- chamadas de setDistributionData daquela supervisão (nunca todas de uma vez),
-- pra não deixar quem estiver atuando de madrugada sem O.S. Fora desse
-- agendamento, o job 'aplicar-distribuicao-os' de sempre (disparado por
-- evento/idle na tela Distribuir O.S.) continua com a reconciliação
-- incremental normal, sem essa etapa extra de limpar+redistribuir.
--
-- Ver agentes-grm-sync/grmserver-aplicar-distribuicao-os-reset-dia.js e o
-- SCRIPT_MAP em agentes-grm-sync/worker/grm-sync-job-worker.js.

select cron.unschedule('aplicar-distribuicao-os-agendada-02h')
where exists (select 1 from cron.job where jobname = 'aplicar-distribuicao-os-agendada-02h');

select cron.schedule(
  'aplicar-distribuicao-os-agendada-02h',
  '0 5 * * *',
  $cron$
    insert into public.grm_sync_jobs (agente_id, status)
    select 'aplicar-distribuicao-os-reset-dia', 'pendente'
    where exists (
      select 1
      from public.programacao_distribuicao_agendada pda
      join public.supervisoes s on s.nome = pda.supervisao
      where pda.processado = false
        and s.distribuicao_os_automatica = true
    )
    and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id = 'aplicar-distribuicao-os-reset-dia' and status in ('pendente', 'rodando')
    );
  $cron$
);

comment on table public.programacao_distribuicao_agendada is
  'Fila de pedidos de distribuição automática de O.S. gerados quando a Programação de um dia posterior é criada ou duplicada. O cron aplicar-distribuicao-os-agendada-02h enfileira o agente aplicar-distribuicao-os-reset-dia (limpa e redistribui, supervisão por supervisão); quem marca processado=true é o próprio agente, depois de reconciliar de fato aquela supervisão+data no Graint.';
