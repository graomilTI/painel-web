-- Backfill de despesas de colaborador (programacao_extras) lançadas antes da
-- trigger de auditoria existir nessa tabela (20260922180000): precisa de uma
-- origem distinta de 'banco' pra deixar claro no Logs de Usuários que esses
-- registros foram reconstruídos a partir do created_at real, não capturados
-- em tempo real pela trigger (pedido do usuário, 2026-09-22).

ALTER TABLE app_auditoria DROP CONSTRAINT app_auditoria_origem_check;
ALTER TABLE app_auditoria ADD CONSTRAINT app_auditoria_origem_check
  CHECK (origem IN ('banco','frontend','worker','edge_function','agente','backfill'));
