CREATE TABLE rh_cartao_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  data date NOT NULL,
  entrada time,
  saida_almoco time,
  retorno_almoco time,
  saida time,
  horas_trabalhadas numeric,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rh_advertencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  data date NOT NULL,
  tipo text NOT NULL DEFAULT 'verbal',
  motivo text NOT NULL,
  descricao text,
  anexo_url text,
  aplicada_por text,
  status text NOT NULL DEFAULT 'registrada',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rh_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  competencia text NOT NULL,
  valor_bruto numeric,
  valor_liquido numeric,
  proventos jsonb NOT NULL DEFAULT '[]'::jsonb,
  descontos jsonb NOT NULL DEFAULT '[]'::jsonb,
  arquivo_url text,
  status text NOT NULL DEFAULT 'gerada',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rh_cartao_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_advertencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_folha ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_read_rh_cartao_ponto ON rh_cartao_ponto FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_cartao_ponto ON rh_cartao_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_read_rh_advertencias ON rh_advertencias FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_advertencias ON rh_advertencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_read_rh_folha ON rh_folha FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_rh_folha ON rh_folha FOR ALL TO authenticated USING (true) WITH CHECK (true);
;
