
-- Diário de hospedagem importado da planilha de produção
CREATE TABLE IF NOT EXISTS hospedagem_producao_diarias (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  data             DATE         NOT NULL,
  regional         TEXT,
  cidade           TEXT,
  funcionario      TEXT         NOT NULL,
  status           TEXT,
  hotel            TEXT         NOT NULL,
  localizacao      TEXT,
  tipo_diaria      TEXT,
  valor_diaria     NUMERIC(10,2),
  local_trabalho   TEXT,
  cliente          TEXT,
  saldo            NUMERIC(10,2),
  situacao_pgto    TEXT,
  nfs              TEXT,
  observacao       TEXT,
  importado_por    UUID         REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hospedagem_producao_diarias_uq
  ON hospedagem_producao_diarias (data, lower(trim(funcionario)), lower(trim(hotel)));

ALTER TABLE hospedagem_producao_diarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hpd_auth_full" ON hospedagem_producao_diarias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW hospedagem_producao_resumo AS
SELECT
  COUNT(*)                               FILTER (WHERE upper(trim(status)) = 'STAY')     AS hospedados,
  COUNT(*)                               FILTER (WHERE upper(trim(status)) = 'CHECKOUT') AS checkouts,
  COUNT(DISTINCT lower(trim(hotel)))     FILTER (WHERE upper(trim(status)) = 'STAY')     AS hoteis_ativos,
  COALESCE(SUM(valor_diaria)             FILTER (WHERE upper(trim(status)) = 'STAY'), 0) AS total_diarias_stay,
  COALESCE(SUM(valor_diaria), 0)                                                          AS total_diarias_geral,
  MAX(data)                                                                                AS ultima_data
FROM hospedagem_producao_diarias;

CREATE OR REPLACE FUNCTION hospedagem_importar_diarias_json(
  p_linhas        JSONB,
  p_importado_por UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total     INT := 0;
  v_ok        INT := 0;
  v_ignorados INT := 0;
  v_linha     JSONB;
BEGIN
  FOR v_linha IN SELECT jsonb_array_elements(p_linhas) LOOP
    v_total := v_total + 1;
    BEGIN
      IF (v_linha->>'data') IS NULL
         OR trim(v_linha->>'funcionario') = ''
         OR trim(v_linha->>'hotel')       = '' THEN
        v_ignorados := v_ignorados + 1;
        CONTINUE;
      END IF;

      INSERT INTO hospedagem_producao_diarias (
        data, regional, cidade, funcionario, status, hotel, localizacao,
        tipo_diaria, valor_diaria, local_trabalho, cliente, saldo,
        situacao_pgto, nfs, observacao, importado_por
      ) VALUES (
        (v_linha->>'data')::DATE,
        nullif(trim(v_linha->>'regional'),           ''),
        nullif(trim(v_linha->>'cidade'),             ''),
        trim(v_linha->>'funcionario'),
        nullif(upper(trim(v_linha->>'status')),      ''),
        trim(v_linha->>'hotel'),
        nullif(trim(v_linha->>'localizacao'),        ''),
        nullif(upper(trim(v_linha->>'tipo_diaria')), ''),
        hospedagem_parse_money(v_linha->>'valor_diaria'),
        nullif(trim(v_linha->>'local_trabalho'),     ''),
        nullif(trim(v_linha->>'cliente'),            ''),
        hospedagem_parse_money(v_linha->>'saldo'),
        nullif(trim(v_linha->>'situacao_pgto'),      ''),
        nullif(trim(v_linha->>'nfs'),                ''),
        nullif(trim(v_linha->>'observacao'),         ''),
        p_importado_por
      )
      ON CONFLICT (data, lower(trim(funcionario)), lower(trim(hotel)))
      DO UPDATE SET
        regional       = EXCLUDED.regional,
        cidade         = EXCLUDED.cidade,
        status         = EXCLUDED.status,
        localizacao    = EXCLUDED.localizacao,
        tipo_diaria    = EXCLUDED.tipo_diaria,
        valor_diaria   = EXCLUDED.valor_diaria,
        local_trabalho = EXCLUDED.local_trabalho,
        cliente        = EXCLUDED.cliente,
        saldo          = EXCLUDED.saldo,
        situacao_pgto  = EXCLUDED.situacao_pgto,
        nfs            = EXCLUDED.nfs,
        observacao     = EXCLUDED.observacao,
        importado_por  = EXCLUDED.importado_por;

      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_ignorados := v_ignorados + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'total_linhas', v_total,
    'inseridos',    v_ok,
    'ignorados',    v_ignorados
  );
END;
$$;
;
