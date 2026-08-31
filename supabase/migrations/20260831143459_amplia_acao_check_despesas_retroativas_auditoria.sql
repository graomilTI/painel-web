-- Amplia o CHECK de acao em grm_despesas_retroativas_auditoria para
-- acomodar as novas ações do script pontual
-- agentes-grm-sync/grm-despesas-retroativas-pontual.js (recusa de
-- duplicado com data corrigida, adiamento por limite de ações, e
-- pulo de relançamento quando já existe lançamento ativo na data
-- corrigida). Mudança aditiva: nenhum valor existente deixa de ser aceito.
alter table public.grm_despesas_retroativas_auditoria
  drop constraint grm_despesas_retroativas_auditoria_acao_check;

alter table public.grm_despesas_retroativas_auditoria
  add constraint grm_despesas_retroativas_auditoria_acao_check
  check (acao = any (array['NONE'::text, 'APPROVE'::text, 'CREATE'::text, 'REPROVE'::text, 'ADIADO'::text, 'SKIP_DUPLICADO'::text]));
