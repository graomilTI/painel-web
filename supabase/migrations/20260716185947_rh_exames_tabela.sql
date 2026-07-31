CREATE TABLE rh_exames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'admissional',
  clinica_id uuid REFERENCES rh_clinicas_sst(id),
  clinica_nome text,
  data_agendada date,
  data_realizada date,
  data_vencimento date,
  resultado text,
  status text NOT NULL DEFAULT 'agendado',
  anexo_url text,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rh_exames ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_read_rh_exames ON rh_exames FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_exames ON rh_exames FOR ALL TO authenticated USING (true) WITH CHECK (true);
;
