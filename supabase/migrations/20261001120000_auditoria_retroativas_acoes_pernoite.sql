-- Amplia o CHECK de acao em grm_despesas_retroativas_auditoria:
--  * PERNOITE_BLOQUEADO: pendência de Pernoite que o agente NÃO aprovou
--    (fora da Programação do gestor, ou com Café/Almoço/Janta lançado no dia).
--  * SEM_PENDENCIA: já era gravado pelo agente (Café/Janta sem pendência
--    existente) e o CHECK anterior o rejeitava. Mudança aditiva.
alter table public.grm_despesas_retroativas_auditoria
  drop constraint grm_despesas_retroativas_auditoria_acao_check;

alter table public.grm_despesas_retroativas_auditoria
  add constraint grm_despesas_retroativas_auditoria_acao_check
  check (acao = any (array['NONE'::text, 'APPROVE'::text, 'CREATE'::text, 'REPROVE'::text, 'ADIADO'::text, 'SKIP_DUPLICADO'::text, 'SEM_PENDENCIA'::text, 'PERNOITE_BLOQUEADO'::text]));
