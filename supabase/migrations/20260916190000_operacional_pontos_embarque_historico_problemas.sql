-- Espelha o campo splHasIssueHistory do GRM (servicePlaces/getRecords) — o
-- aviso "Este Local de Serviço tem histórico de problemas" que aparece na
-- tela de Abrir OS do GRM. Sincronizado por
-- agentes-grm-sync/grmserver-locais-embarque-api.js; usado pelo Gestor >
-- Logística > Abrir OS pra alertar o gestor antes de enviar a solicitação.
alter table public.operacional_pontos_embarque
  add column if not exists tem_historico_problemas boolean not null default false;
