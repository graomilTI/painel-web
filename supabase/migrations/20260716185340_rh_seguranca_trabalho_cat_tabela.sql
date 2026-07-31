CREATE TABLE rh_cat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  data_acidente date NOT NULL,
  tipo text NOT NULL DEFAULT 'tipico',
  descricao text,
  cid text,
  afastamento_dias integer,
  protocolo text,
  anexo_url text,
  status text NOT NULL DEFAULT 'aberta',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rh_cat ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_read_rh_cat ON rh_cat FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_cat ON rh_cat FOR ALL TO authenticated USING (true) WITH CHECK (true);
;
