CREATE TABLE rh_ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  periodo_aquisitivo_inicio date,
  periodo_aquisitivo_fim date,
  periodo_concessivo_limite date,
  dias_direito integer NOT NULL DEFAULT 30,
  dias_gozados integer,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status text NOT NULL DEFAULT 'programada',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rh_atestados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  dias integer,
  cid text,
  medico text,
  anexo_url text,
  observacoes text,
  status text NOT NULL DEFAULT 'lancado',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rh_ferias ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_atestados ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_read_rh_ferias ON rh_ferias FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_ferias ON rh_ferias FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_read_rh_atestados ON rh_atestados FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_atestados ON rh_atestados FOR ALL TO authenticated USING (true) WITH CHECK (true);
;
