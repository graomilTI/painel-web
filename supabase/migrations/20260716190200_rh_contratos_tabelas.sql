CREATE TABLE rh_contratos_experiencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim_experiencia date NOT NULL,
  prorrogado boolean NOT NULL DEFAULT false,
  data_fim_prorrogacao date,
  data_efetivacao date,
  status text NOT NULL DEFAULT 'em_experiencia',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rh_rescisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  data_desligamento date NOT NULL,
  tipo text NOT NULL DEFAULT 'dispensa_sem_justa_causa',
  motivo text,
  valor_total numeric,
  documentos_url text,
  status text NOT NULL DEFAULT 'em_andamento',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rh_contratos_experiencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_rescisoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_read_rh_contratos_experiencia ON rh_contratos_experiencia FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_contratos_experiencia ON rh_contratos_experiencia FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_read_rh_rescisoes ON rh_rescisoes FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_rescisoes ON rh_rescisoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
;
