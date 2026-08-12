-- Fecha o buraco em que um colaborador confirmado numa O.S. depois do último
-- evento de publish (inatividade/troca de tela/fechamento de janela) nunca
-- entrava em grm_despesas_estado_colaborador/fila, ficando "Pendente" +
-- "GRM: Não processado" indefinidamente na Conferência até alguém reabrir a
-- Programação daquela regional e gerar um novo evento client-side.
--
-- A publicação (grm-liberacao-despesas-publicar) já é idempotente: recalcula
-- o hash desejado e só enfileira quando há diferença real (sem_alteracao
-- cobre o caso "nada mudou"). Por isso é seguro chamá-la periodicamente para
-- todas as programações de hoje em diante, em vez de depender só de eventos
-- do navegador do gestor.

select cron.schedule(
  'grm-despesas-reconciliacao-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
      || '/functions/v1/grm-liberacao-despesas-publicar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object(
      'programacaoIds', (
        select coalesce(jsonb_agg(id), '[]'::jsonb)
        from public.programacao_dia
        where data_referencia >= (now() at time zone 'America/Sao_Paulo')::date
      ),
      'motivo', 'RECONCILIACAO'
    ),
    timeout_milliseconds := 120000
  ) as request_id
  where exists (
    select 1 from public.programacao_dia
    where data_referencia >= (now() at time zone 'America/Sao_Paulo')::date
  );
  $$
);
