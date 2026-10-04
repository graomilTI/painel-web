-- Desativa 'compras-match-nf' em grm_sync_agent_settings.
--
-- A linha foi criada em 03/09 junto com a feature feature/compras-nf-auto-match
-- (grm-sync-compras-match-nf.js + entrada no SCRIPT_MAP), que nunca entrou na main.
-- O worker em produção não tem script pra esse agente, então desde 05/09 o
-- auto-scheduler enfileira um job a cada 45 min que termina em
-- "Agente sem script configurado: compras-match-nf" (~900 erros no histórico).
-- Última execução com sucesso: 05/09 01:18.
--
-- enabled=false para o auto-scheduler e o painel (TI > Agentes) pararem de
-- enfileirar. Pra reativar quando a feature for mergeada: voltar enabled=true.
update public.grm_sync_agent_settings
   set enabled = false,
       updated_at = now()
 where agent_id = 'compras-match-nf'
   and enabled is distinct from false;
