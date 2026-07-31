
CREATE TABLE IF NOT EXISTS logistica_fob (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia DATE NOT NULL,
  numero_os       TEXT,
  cliente         TEXT,
  supervisao      TEXT,
  tons_movimento  NUMERIC(12,2) NOT NULL DEFAULT 0,
  tons_producao   NUMERIC(12,2) NOT NULL DEFAULT 0,
  tons_nh         NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacao      TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDENTE'
                    CHECK (status IN ('PENDENTE','VALIDO','INVALIDO')),
  observacao_gestor TEXT,
  criado_por      UUID REFERENCES auth.users(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validado_por    UUID REFERENCES auth.users(id),
  validado_em     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE logistica_fob ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fob_authenticated_all"
  ON logistica_fob FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS logistica_fob_data_idx        ON logistica_fob (data_referencia DESC);
CREATE INDEX IF NOT EXISTS logistica_fob_status_idx      ON logistica_fob (status);
CREATE INDEX IF NOT EXISTS logistica_fob_supervisao_idx  ON logistica_fob (supervisao);
;
