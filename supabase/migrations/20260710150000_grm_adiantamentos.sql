-- Tabela: grm_adiantamentos_importacoes (espelho das Solicitações Caixa Operacional do GRM,
-- sincronizada via agentes-grm-sync/grm-sync-adiantamentos.js a partir de
-- POST /api/oFlow/request/getRecords, dedup por ofr_code)
CREATE TABLE IF NOT EXISTS grm_adiantamentos_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ofr_code INTEGER NOT NULL UNIQUE,
  ofr_status TEXT,
  data_solicitacao DATE,
  data_registro TIMESTAMP WITH TIME ZONE,
  colaborador TEXT,
  cpf TEXT,
  coordenacao TEXT,
  supervisao TEXT,
  conta TEXT,
  valor NUMERIC,
  saldo NUMERIC,
  embarque DATE,
  leitura_mais_antiga DATE,
  descricao TEXT,
  dados_json JSONB,
  data_sincronizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE grm_adiantamentos_importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY grm_adiantamentos_importacoes_select_authenticated ON grm_adiantamentos_importacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY grm_adiantamentos_importacoes_insert_authenticated ON grm_adiantamentos_importacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY grm_adiantamentos_importacoes_update_authenticated ON grm_adiantamentos_importacoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY grm_adiantamentos_importacoes_delete_authenticated ON grm_adiantamentos_importacoes FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_grm_adiantamentos_importacoes_status ON grm_adiantamentos_importacoes(ofr_status);
-- Tabela: financeiro_adiantamentos_decisoes (decisão local do painel: ✓ ok / ✗ recusado com
-- motivo para histórico; não altera nada no GRM. Vira 'pago' quando entra numa execução do
-- botão PAGAR, ver financeiro_pagamentos_execucoes)
CREATE TABLE IF NOT EXISTS financeiro_adiantamentos_decisoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ofr_code INTEGER NOT NULL UNIQUE REFERENCES grm_adiantamentos_importacoes(ofr_code) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','ok','recusado','pago')),
  motivo_recusa TEXT,
  decidido_por TEXT,
  decidido_em TIMESTAMP WITH TIME ZONE,
  execucao_id UUID REFERENCES financeiro_pagamentos_execucoes(id),
  pago_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE financeiro_adiantamentos_decisoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY financeiro_adiantamentos_decisoes_select_authenticated ON financeiro_adiantamentos_decisoes FOR SELECT TO authenticated USING (true);
CREATE POLICY financeiro_adiantamentos_decisoes_insert_authenticated ON financeiro_adiantamentos_decisoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY financeiro_adiantamentos_decisoes_update_authenticated ON financeiro_adiantamentos_decisoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY financeiro_adiantamentos_decisoes_delete_authenticated ON financeiro_adiantamentos_decisoes FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_financeiro_adiantamentos_decisoes_status ON financeiro_adiantamentos_decisoes(status);
