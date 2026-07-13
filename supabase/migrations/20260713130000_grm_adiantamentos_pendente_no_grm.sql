-- Marca se a solicitação ainda está na lista de "Pendente" do GRM. O agente
-- grm-sync-adiantamentos sempre traz a lista COMPLETA de pendentes a cada execução; se um
-- ofr_code que já sincronizamos deixar de aparecer (foi resolvido/baixado direto no GRM,
-- fora do fluxo do painel), marcamos pendente_no_grm=false — a tela usa isso pra tirar a
-- linha de Solicitações e jogar automaticamente pro Histórico, mesmo sem decisão do
-- financeiro (✓/✗).
ALTER TABLE grm_adiantamentos_importacoes
  ADD COLUMN IF NOT EXISTS pendente_no_grm BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS saiu_pendente_em TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_grm_adiantamentos_pendente_no_grm ON grm_adiantamentos_importacoes(pendente_no_grm);
