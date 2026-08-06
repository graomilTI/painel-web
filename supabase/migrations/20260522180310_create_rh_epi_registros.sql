
CREATE TABLE IF NOT EXISTS rh_epi_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id text,
  colaborador_nome text NOT NULL,
  epi text NOT NULL,
  ca text,
  quantidade numeric NOT NULL DEFAULT 1,
  tamanho text,
  data_entrega date,
  status text NOT NULL DEFAULT 'pendente',
  observacao text,
  anexo_url text,
  confirmado_em timestamptz,
  compra_item_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rh_epi_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_epi" ON rh_epi_registros
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_write_epi" ON rh_epi_registros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
;
