-- financeiro_alimentacao_colaboradores já tinha SELECT para authenticated (criada em sessão
-- anterior junto com o agente grm-sync-login-alimentacao), mas faltavam INSERT/UPDATE/DELETE
-- para o financeiro poder marcar OK/PENDENTE/RECUSADO e registrar pagamento pela tela.
CREATE POLICY financeiro_alimentacao_colaboradores_insert_authenticated ON financeiro_alimentacao_colaboradores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY financeiro_alimentacao_colaboradores_update_authenticated ON financeiro_alimentacao_colaboradores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY financeiro_alimentacao_colaboradores_delete_authenticated ON financeiro_alimentacao_colaboradores FOR DELETE TO authenticated USING (true);
