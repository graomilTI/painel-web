-- Tabela de gestores por regional para cálculo de bônus
CREATE TABLE IF NOT EXISTS metas_gestores (
  id          BIGSERIAL     PRIMARY KEY,
  coordenacao TEXT          NOT NULL,
  gestor      TEXT          NOT NULL,
  supervisao  TEXT,
  salario     NUMERIC(14,2),
  grat40      NUMERIC(14,2),
  ativo       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
ALTER TABLE metas_gestores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestores_select" ON metas_gestores
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "gestores_modify" ON metas_gestores
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
