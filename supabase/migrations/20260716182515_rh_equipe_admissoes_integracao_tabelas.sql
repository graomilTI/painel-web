CREATE TABLE rh_admissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text,
  data_nascimento date,
  cargo text,
  empresa text,
  coordenacao text,
  supervisao text,
  data_admissao_prevista date,
  telefone text,
  email text,
  status text NOT NULL DEFAULT 'documentos_pendentes',
  colaborador_id uuid REFERENCES colaboradores(id),
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rh_documentos_registro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id uuid NOT NULL REFERENCES rh_admissoes(id) ON DELETE CASCADE,
  tipo_documento text NOT NULL,
  status text NOT NULL DEFAULT 'solicitado',
  arquivo_url text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rh_integracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  admissao_id uuid REFERENCES rh_admissoes(id),
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'em_andamento',
  responsavel text,
  data_inicio date DEFAULT current_date,
  data_conclusao date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rh_admissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_documentos_registro ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_integracao ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_read_rh_admissoes ON rh_admissoes FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_admissoes ON rh_admissoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_read_rh_documentos_registro ON rh_documentos_registro FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_documentos_registro ON rh_documentos_registro FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_read_rh_integracao ON rh_integracao FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_integracao ON rh_integracao FOR ALL TO authenticated USING (true) WITH CHECK (true);
;
