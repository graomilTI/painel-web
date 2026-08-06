
CREATE TABLE IF NOT EXISTS rh_clinicas_sst (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  estado      TEXT,
  cidade      TEXT,
  nome        TEXT        NOT NULL,
  telefone    TEXT,
  celular     TEXT,
  endereco    TEXT,
  cep         TEXT,
  dados_medico TEXT,
  email       TEXT,
  observacoes TEXT,
  chave_pix   TEXT,
  exames      TEXT,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nome, cidade, estado)
);

ALTER TABLE rh_clinicas_sst ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinicas_sst_select" ON rh_clinicas_sst
  FOR SELECT USING (true);

CREATE POLICY "clinicas_sst_insert" ON rh_clinicas_sst
  FOR INSERT WITH CHECK (true);

CREATE POLICY "clinicas_sst_update" ON rh_clinicas_sst
  FOR UPDATE USING (true);

CREATE POLICY "clinicas_sst_delete" ON rh_clinicas_sst
  FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS rh_clinicas_sst_estado_idx  ON rh_clinicas_sst (estado);
CREATE INDEX IF NOT EXISTS rh_clinicas_sst_cidade_idx  ON rh_clinicas_sst (cidade);
CREATE INDEX IF NOT EXISTS rh_clinicas_sst_nome_idx    ON rh_clinicas_sst (nome);
CREATE INDEX IF NOT EXISTS rh_clinicas_sst_ativo_idx   ON rh_clinicas_sst (ativo);
;
